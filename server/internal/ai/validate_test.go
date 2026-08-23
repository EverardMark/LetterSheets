package ai

import (
	"encoding/json"
	"strings"
	"testing"
)

func toolByName(t *testing.T, action string) Tool {
	t.Helper()
	tool, ok := NewRegistry().Lookup(action)
	if !ok {
		t.Fatalf("%s missing from registry", action)
	}
	return tool
}

// Each case is a mistake open-weight models actually make, and the assertion is
// on the feedback text — a retry only converges if the error says what to fix.
func TestValidateArgsCatchesCommonModelMistakes(t *testing.T) {
	cases := []struct {
		name      string
		tool      string
		args      string
		wantInErr []string
	}{
		{
			name: "missing required field",
			tool: "create_leave",
			args: `{"employee_id":"e-1","leave_type":"Sick"}`,
			// start_date and end_date both absent.
			wantInErr: []string{"start_date", "end_date", "required"},
		},
		{
			name:      "invented enum value",
			tool:      "get_leaves",
			args:      `{"status":"Waiting"}`,
			wantInErr: []string{"status", "Waiting", "Pending", "Approved", "Rejected"},
		},
		{
			name:      "number sent as string",
			tool:      "create_leave",
			args:      `{"employee_id":"e-1","leave_type":"Sick","start_date":"2026-08-21","end_date":"2026-08-21","days":"2"}`,
			wantInErr: []string{"days", "must be a number"},
		},
		{
			name:      "hallucinated field",
			tool:      "clock_in",
			args:      `{"employee_id":"e-1","employee_name":"Ana","company_id":"c-9"}`,
			wantInErr: []string{"unknown field", "employee_name", "company_id", "accepts only"},
		},
		{
			name:      "empty string for a required field",
			tool:      "clock_out",
			args:      `{"id":""}`,
			wantInErr: []string{"id", "required", "empty"},
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := ValidateArgs(toolByName(t, c.tool), json.RawMessage(c.args))
			if err == nil {
				t.Fatalf("expected a validation error, got none")
			}
			for _, want := range c.wantInErr {
				if !strings.Contains(err.Error(), want) {
					t.Errorf("error should mention %q; got: %v", want, err)
				}
			}
		})
	}
}

func TestValidateArgsAcceptsGoodInput(t *testing.T) {
	cases := []struct {
		tool string
		args string
	}{
		{"get_employees", `{}`},
		{"get_employees", ``},
		{"get_leaves", `{"status":"Pending"}`},
		{"create_leave", `{"employee_id":"e-1","leave_type":"Sick","start_date":"2026-08-21","end_date":"2026-08-22","days":2}`},
		{"get_accounts", `{"account_type":"Expense","active_only":true}`},
		{"create_exp_claim", `{"title":"Client lunch","lines":[{"amount":2340,"description":"Lunch","expense_date":"2026-08-19"}]}`},
	}

	for _, c := range cases {
		if err := ValidateArgs(toolByName(t, c.tool), json.RawMessage(c.args)); err != nil {
			t.Errorf("%s with %s: unexpected error %v", c.tool, c.args, err)
		}
	}
}

// Nested line items are where a model most often drops a field, and an expense
// claim with a line missing its amount must not reach the handler.
func TestValidateArgsChecksArrayItems(t *testing.T) {
	err := ValidateArgs(toolByName(t, "create_exp_claim"),
		json.RawMessage(`{"title":"Lunch","lines":[{"description":"no amount here"}]}`))
	if err == nil {
		t.Fatal("expected an error for a line with no amount")
	}
	if !strings.Contains(err.Error(), "lines[0].amount") {
		t.Errorf("error should point at the offending line, got: %v", err)
	}

	err = ValidateArgs(toolByName(t, "create_exp_claim"),
		json.RawMessage(`{"title":"Lunch","lines":[{"amount":"2340"}]}`))
	if err == nil || !strings.Contains(err.Error(), "must be a number") {
		t.Errorf("string amount should be rejected, got: %v", err)
	}
}

func TestValidateArgsRejectsNonObject(t *testing.T) {
	err := ValidateArgs(toolByName(t, "get_employees"), json.RawMessage(`"just a string"`))
	if err == nil || !strings.Contains(err.Error(), "not a JSON object") {
		t.Errorf("got: %v", err)
	}
}
