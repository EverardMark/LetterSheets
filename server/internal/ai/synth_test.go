package ai

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func TestSynthProducesATrainableSet(t *testing.T) {
	s := NewSynth(NewRegistry(), 1, "system")
	set := s.Build()
	t.Logf("%d examples", len(set))
	if len(set) < 500 {
		t.Fatalf("only %d examples", len(set))
	}

	var buf bytes.Buffer
	n, err := ExportJSONL(&buf, set)
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	t.Logf("%d rows exported", n)
	if n < len(set)*9/10 {
		t.Errorf("export dropped %d of %d examples", len(set)-n, len(set))
	}

	// Every row must be valid JSON with a system message, a user message and an
	// assistant turn that says or does something.
	for i, line := range strings.Split(strings.TrimSpace(buf.String()), "\n") {
		var row struct {
			Messages []struct {
				Role      string          `json:"role"`
				Content   string          `json:"content"`
				ToolCalls json.RawMessage `json:"tool_calls"`
			} `json:"messages"`
			Tools []json.RawMessage `json:"tools"`
		}
		if err := json.Unmarshal([]byte(line), &row); err != nil {
			t.Fatalf("row %d is not valid JSON: %v", i, err)
		}
		if len(row.Messages) < 3 {
			t.Errorf("row %d has %d messages", i, len(row.Messages))
			continue
		}
		if row.Messages[0].Role != "system" {
			t.Errorf("row %d does not open with a system message", i)
		}
		last := row.Messages[len(row.Messages)-1]
		if last.Role != "assistant" {
			t.Errorf("row %d does not end with the assistant", i)
		}
		if last.Content == "" && len(last.ToolCalls) == 0 {
			t.Errorf("row %d teaches the model to say nothing", i)
		}
		if len(row.Tools) == 0 {
			t.Errorf("row %d offers no tools", i)
		}
	}
}

func TestSynthNeverTeachesAFalseClaim(t *testing.T) {
	for _, ex := range NewSynth(NewRegistry(), 2, "system").Build() {
		if ex.Answer == "" {
			continue
		}
		if claimsCompletionFor(ex.Answer, ex.Prompt) {
			t.Errorf("an example claims something was done: %q -> %q", ex.Prompt, ex.Answer)
		}
	}
}

func TestSynthNeverTeachesACredentialAction(t *testing.T) {
	for _, ex := range NewSynth(NewRegistry(), 3, "system").Build() {
		// By name, not by substring: get_user LISTS users and is a perfectly
		// good read. What must never appear is an action that handles a
		// credential.
		withheld := map[string]bool{
			"admin_reset_password": true, "change_password": true,
			"request_password_reset": true, "reset_password": true,
			"login": true, "logout": true, "logout_all": true, "register": true,
			"create_user": true, "create_employee_account": true, "update_user_access": true,
		}
		for _, c := range ex.Proposed {
			if withheld[c.Name] {
				t.Errorf("an example proposes the withheld action %q", c.Name)
			}
		}
	}
}

func TestSynthIsDeterministic(t *testing.T) {
	a := NewSynth(NewRegistry(), 7, "system").Build()
	b := NewSynth(NewRegistry(), 7, "system").Build()
	if len(a) != len(b) {
		t.Fatalf("%d vs %d", len(a), len(b))
	}
	for i := range a {
		if a[i].Prompt != b[i].Prompt || a[i].Answer != b[i].Answer {
			t.Fatalf("row %d differs between runs", i)
		}
	}
}
