package ai

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func sampleTools() []ToolDef {
	return []ToolDef{{
		Name:        "create_leave",
		Description: "File a leave request.",
		Schema:      obj(map[string]any{"employee_id": str("id")}, "employee_id"),
	}}
}

// An edited proposal is the most valuable row in the set, and also the one most
// easily got wrong: exporting the model's original arguments instead of the
// human's correction would train the model to repeat the mistake it just made.
func TestExportUsesCorrectedArgumentsForEditedRows(t *testing.T) {
	ex := TrainingExample{
		ID: "1", System: "sys", Prompt: "file a sick day for Ana",
		Tools:    sampleTools(),
		Proposed: []ToolCall{{ID: "c1", Name: "create_leave", Args: json.RawMessage(`{"employee_id":"WRONG"}`)}},
		Final:    []ToolCall{{ID: "c1", Name: "create_leave", Args: json.RawMessage(`{"employee_id":"e-42"}`)}},
		Verdict:  VerdictEdited,
	}

	var buf bytes.Buffer
	n, err := ExportJSONL(&buf, []TrainingExample{ex})
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	if n != 1 {
		t.Fatalf("wrote %d rows, want 1", n)
	}
	out := buf.String()
	if strings.Contains(out, "WRONG") {
		t.Error("exported the model's rejected arguments instead of the human's correction")
	}
	if !strings.Contains(out, "e-42") {
		t.Errorf("corrected arguments missing from export: %s", out)
	}
}

// Cancelled rows say an action was wrong but not what the right one was, so
// there is no target to learn and they must not appear as positives.
func TestExportSkipsCancelled(t *testing.T) {
	var buf bytes.Buffer
	n, err := ExportJSONL(&buf, []TrainingExample{{
		ID: "1", Prompt: "delete everything", Tools: sampleTools(),
		Proposed: []ToolCall{{ID: "c1", Name: "create_leave", Args: json.RawMessage(`{}`)}},
		Verdict:  VerdictCancelled,
	}})
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	if n != 0 || buf.Len() != 0 {
		t.Errorf("cancelled row was exported: %s", buf.String())
	}
}

// The output has to be loadable by the trainers without a conversion step, so
// the shape is asserted rather than eyeballed.
func TestExportEmitsTrainerReadyJSONL(t *testing.T) {
	var buf bytes.Buffer
	_, err := ExportJSONL(&buf, []TrainingExample{
		{
			ID: "1", System: "sys", Prompt: "who is off next week", Tools: sampleTools(),
			Proposed: []ToolCall{{ID: "c1", Name: "get_leaves", Args: json.RawMessage(`{"status":"Approved"}`)}},
			Verdict:  VerdictConfirmed,
		},
		{
			ID: "2", System: "sys", Prompt: "punch Ana in", Tools: sampleTools(),
			Proposed: []ToolCall{{ID: "c2", Name: "clock_in", Args: json.RawMessage(`{"employee_id":"e-1"}`)}},
			Verdict:  VerdictConfirmed,
		},
	})
	if err != nil {
		t.Fatalf("export: %v", err)
	}

	lines := strings.Split(strings.TrimSpace(buf.String()), "\n")
	if len(lines) != 2 {
		t.Fatalf("want 2 lines, got %d", len(lines))
	}

	var row exportRow
	if err := json.Unmarshal([]byte(lines[0]), &row); err != nil {
		t.Fatalf("line 1 is not valid JSON: %v", err)
	}
	if len(row.Messages) != 3 {
		t.Fatalf("want system+user+assistant, got %d messages", len(row.Messages))
	}
	if row.Messages[0].Role != "system" || row.Messages[1].Role != "user" || row.Messages[2].Role != "assistant" {
		t.Errorf("unexpected role order: %+v", row.Messages)
	}
	if len(row.Messages[2].ToolCalls) != 1 {
		t.Fatalf("assistant turn carries no tool call")
	}
	// arguments must be a JSON-encoded string, not an object.
	if !json.Valid([]byte(row.Messages[2].ToolCalls[0].Function.Arguments)) {
		t.Errorf("arguments is not valid JSON: %q", row.Messages[2].ToolCalls[0].Function.Arguments)
	}
	if len(row.Tools) != 1 || row.Tools[0].Function.Name != "create_leave" {
		t.Errorf("candidate tool set not exported: %+v", row.Tools)
	}
}

// Tenant identifiers must not reach a training file that will be copied onto a
// GPU host, uploaded to a trainer, or shared.
func TestExportOmitsCompanyID(t *testing.T) {
	var buf bytes.Buffer
	_, err := ExportJSONL(&buf, []TrainingExample{{
		ID: "1", CompanyID: "acme-tenant-uuid", Prompt: "hi", Tools: sampleTools(),
		Proposed: []ToolCall{{ID: "c1", Name: "get_leaves", Args: json.RawMessage(`{}`)}},
		Verdict:  VerdictConfirmed,
	}})
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	if strings.Contains(buf.String(), "acme-tenant-uuid") {
		t.Error("company id leaked into the training export")
	}
}
