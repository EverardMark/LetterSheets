package ai

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

// The exact failure observed on the deployment host: asked to file leave for a
// person by name, the base model proposed create_leave with the RFC's example
// UUID rather than looking the employee up.
const rfcExampleUUID = "123e4567-e89b-12d3-a456-426614174000"

func TestGroundingRejectsInventedID(t *testing.T) {
	g := NewGroundingSet()
	g.Observe("file a sick day for Ana tomorrow")

	tool, _ := NewRegistry().Lookup("create_leave")
	args := json.RawMessage(`{"employee_id":"` + rfcExampleUUID +
		`","leave_type":"Sick","start_date":"2026-08-22","end_date":"2026-08-22"}`)

	bad := g.Check(tool, args)
	if len(bad) == 0 {
		t.Fatal("an invented employee_id passed the grounding check")
	}
	err := GroundingError(tool, bad)
	// The message has to name the resolver, or a small model just retries the
	// identical call. find_employees rather than get_employees: the user gave a
	// name, and the search is what turns a name into an id.
	if !strings.Contains(err.Error(), "find_employees") {
		t.Errorf("error should point at the resolver, got: %v", err)
	}
	if !strings.Contains(err.Error(), rfcExampleUUID) {
		t.Errorf("error should quote the offending value, got: %v", err)
	}
}

func TestGroundingAcceptsIDFromAToolResult(t *testing.T) {
	g := NewGroundingSet()
	g.Observe(`{"employees":[{"id":"` + rfcExampleUUID + `","first_name":"Ana"}]}`)

	tool, _ := NewRegistry().Lookup("create_leave")
	args := json.RawMessage(`{"employee_id":"` + rfcExampleUUID +
		`","leave_type":"Sick","start_date":"2026-08-22","end_date":"2026-08-22"}`)

	if bad := g.Check(tool, args); len(bad) > 0 {
		t.Errorf("an id that came from a read was rejected: %v", bad)
	}
}

// A user pasting a real id into the prompt is legitimate and must not be
// blocked.
func TestGroundingAcceptsIDFromTheUsersPrompt(t *testing.T) {
	g := NewGroundingSet()
	g.Observe("clock out attendance record " + rfcExampleUUID)

	tool, _ := NewRegistry().Lookup("clock_out")
	if bad := g.Check(tool, json.RawMessage(`{"id":"`+rfcExampleUUID+`"}`)); len(bad) > 0 {
		t.Errorf("an id the user typed was rejected: %v", bad)
	}
}

// Non-UUID values are left alone: several handlers accept a code or a name, and
// rejecting those would break working calls to prevent a problem they cannot
// have.
func TestGroundingCatchesInventedNonUUIDIdentifiers(t *testing.T) {
	// Live, the model produced customer_id "CUST-001", account_id "123" and
	// fiscal_year_id "2026" — none UUID-shaped, all invented, all previously
	// waved through by a guard that only inspected UUIDs.
	g := NewGroundingSet()
	tool, _ := NewRegistry().Lookup("create_leave")
	args := json.RawMessage(`{"employee_id":"E-1042","leave_type":"Sick","start_date":"2026-08-22","end_date":"2026-08-22"}`)
	if bad := g.Check(tool, args); len(bad) == 0 {
		t.Error("an invented non-UUID identifier passed the check")
	}
}

func TestGroundingAllowsANonUUIDIdentifierThatWasSeen(t *testing.T) {
	// Tightening the guard must not break systems whose ids are not UUIDs: an
	// id that came back from a read is grounded whatever its shape.
	g := NewGroundingSet()
	g.ObserveJSON(json.RawMessage(`{"employees":[{"id":"E-1042","first_name":"Ana"}]}`))
	tool, _ := NewRegistry().Lookup("create_leave")
	args := json.RawMessage(`{"employee_id":"E-1042","leave_type":"Sick","start_date":"2026-08-22","end_date":"2026-08-22"}`)
	if bad := g.Check(tool, args); len(bad) > 0 {
		t.Errorf("an identifier the turn had seen was rejected: %v", bad)
	}
}

func TestGroundingCatchesInventedNumericIdentifiers(t *testing.T) {
	g := NewGroundingSet()
	g.ObserveJSON(json.RawMessage(`{"employees":[{"id":7,"first_name":"Ana"}]}`))
	tool, _ := NewRegistry().Lookup("create_leave")
	if bad := g.Check(tool, json.RawMessage(`{"employee_id":7}`)); len(bad) > 0 {
		t.Errorf("a numeric id that was seen got rejected: %v", bad)
	}
	if bad := g.Check(tool, json.RawMessage(`{"employee_id":123}`)); len(bad) == 0 {
		t.Error("an invented numeric id passed the check")
	}
}

// Nested line items are checked too — the expense case invented a category_id
// inside a line.
func TestGroundingChecksNestedLineItems(t *testing.T) {
	g := NewGroundingSet()
	tool, _ := NewRegistry().Lookup("create_exp_claim")
	args := json.RawMessage(`{"title":"Lunch","lines":[{"amount":2340,"category_id":"` + rfcExampleUUID + `"}]}`)

	bad := g.Check(tool, args)
	if len(bad) == 0 {
		t.Fatal("an invented category_id inside a line item passed the check")
	}
	if !strings.Contains(strings.Join(bad, " "), "category_id") {
		t.Errorf("should name the nested field, got %v", bad)
	}
}

// End to end: the engine must refuse to propose the write and tell the model to
// look the employee up instead.
func TestEngineBlocksUngroundedWrite(t *testing.T) {
	prov := &scriptedProvider{turns: []Completion{
		{ToolCalls: []ToolCall{call("c1", "create_leave",
			`{"employee_id":"`+rfcExampleUUID+`","leave_type":"Sick","start_date":"2026-08-22","end_date":"2026-08-22"}`)}},
		{Text: "Let me look Ana up first."},
	}}
	rec := &memRecorder{}

	res, err := newTestEngine(prov, rec).Run(context.Background(), &recordingExecutor{}, basicTurn("file a sick day for Ana tomorrow"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(res.Pending) != 0 {
		t.Errorf("a write with an invented id was proposed to the user: %+v", res.Pending)
	}
	if len(rec.got) != 0 {
		t.Errorf("an ungrounded proposal was captured as training data: %+v", rec.got)
	}

	feedback := lastTool(prov.seen[1].Messages)
	if !strings.Contains(feedback.Text, "invented") {
		t.Errorf("model was not told the id was fabricated: %q", feedback.Text)
	}
}

// And the recovery path works: look the employee up, then file with the real id.
func TestEngineAllowsWriteAfterLookup(t *testing.T) {
	prov := &scriptedProvider{turns: []Completion{
		{ToolCalls: []ToolCall{call("c1", "get_employees", `{}`)}},
		{ToolCalls: []ToolCall{call("c2", "create_leave",
			`{"employee_id":"`+rfcExampleUUID+`","leave_type":"Sick","start_date":"2026-08-22","end_date":"2026-08-22"}`)}},
	}}
	exec := &recordingExecutor{result: `{"employees":[{"id":"` + rfcExampleUUID + `","first_name":"Ana"}]}`}

	res, err := newTestEngine(prov, nil).Run(context.Background(), exec, basicTurn("file a sick day for Ana tomorrow"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(res.Pending) != 1 {
		t.Fatalf("want the write proposed after a real lookup, got %d pending", len(res.Pending))
	}
	if res.Pending[0].Action != "create_leave" {
		t.Errorf("pending action = %s", res.Pending[0].Action)
	}
}
