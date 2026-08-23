package ai

import "testing"

// allowAll stands in for a superadmin session.
func allowAll(string, string) bool { return true }

// contains reports whether action is among the selected tools.
func contains(sel []Tool, action string) bool {
	for _, t := range sel {
		if t.Action == action {
			return true
		}
	}
	return false
}

func names(sel []Tool) []string {
	out := make([]string, len(sel))
	for i, t := range sel {
		out[i] = t.Action
	}
	return out
}

// The retrieval step is what makes a small fine-tune viable, so the phrasings
// below are written the way a user actually types — not the way the action is
// named. "who is off next week" must reach get_leaves without sharing a word
// with it.
func TestSelectorRetrievesIntendedTool(t *testing.T) {
	sel := NewSelector(NewRegistry())

	cases := []struct {
		prompt string
		want   string
	}{
		{"who is off next week", "get_leaves"},
		{"file a sick day for Ana on Monday", "create_leave"},
		{"approve Ben's vacation request", "approve_leave"},
		{"show me the timesheet for August", "get_attendance"},
		{"reimburse me for the client lunch receipt", "create_exp_claim"},
		{"what is in the chart of accounts", "get_accounts"},
		{"list the journal postings for July", "get_journal_entries"},
		{"punch in for employee 3", "clock_in"},
		// The phrasings a user actually types when adding someone — none of
		// which contain the word "create".
		{"add to employees mark padama", "create_employee"},
		{"new hire starting monday", "create_employee"},
		{"onboard a new person", "create_employee"},
		{"add a Finance department", "create_department"},
		{"create a Senior Analyst role", "create_position"},
	}

	for _, c := range cases {
		got := sel.Select(c.prompt, allowAll, 5)
		if !contains(got, c.want) {
			t.Errorf("prompt %q: %s not in top 5, got %v", c.prompt, c.want, names(got))
		}
	}
}

// Resolvers must survive even a prompt that matches them not at all, because
// without them the model has no way to turn a name into the UUID a write needs.
func TestSelectorKeepsResolversWithinTheirQuota(t *testing.T) {
	sel := NewSelector(NewRegistry())

	// The contract is a QUOTA — a third of the list — not "all resolvers".
	// Guaranteeing all six was affordable at nineteen tools; at four hundred it
	// spent half the list on name lookups before the module the user asked
	// about got a single slot.
	for _, topK := range []int{4, DefaultTopK} {
		got := sel.Select("zzzz qqqq nothing matches this", allowAll, topK)
		if len(got) == 0 {
			t.Fatalf("topK=%d: selector returned nothing; model would have no tools at all", topK)
		}
		resolvers := 0
		for _, tool := range got {
			if isResolver(tool.Action) {
				resolvers++
			}
		}
		want := topK / 3
		if want < 1 {
			want = 1
		}
		if resolvers < 1 {
			t.Errorf("topK=%d: no resolver survived", topK)
		}
		if resolvers > want {
			t.Errorf("topK=%d: resolvers took %d slots, quota is %d", topK, resolvers, want)
		}
	}

	// Whatever the size, SOME way to turn a name into an id must be offered:
	// without one, a write naming a person has nowhere to get the id but
	// invention.
	got := sel.Select("zzzz qqqq nothing matches this", allowAll, DefaultTopK)
	if !contains(got, "get_employees") && !contains(got, "find_employees") {
		t.Errorf("no employee resolver offered, got %v", names(got))
	}
}

// A tool the caller cannot invoke must never be offered — the model should not
// be in a position to propose an action that is going to be refused.
func TestSelectorHidesUnpermittedTools(t *testing.T) {
	denyLeaveApprove := func(module, fn string) bool {
		return !(module == "leave" && fn == "approve")
	}

	sel := NewSelector(NewRegistry())
	got := sel.Select("approve Ben's vacation request", denyLeaveApprove, 12)

	if contains(got, "approve_leave") {
		t.Errorf("approve_leave offered to a caller without leave:approve, got %v", names(got))
	}
	if !contains(got, "get_leaves") {
		t.Errorf("reads should still be offered, got %v", names(got))
	}
}

// Identical prompts must yield an identical candidate list. Captured training
// rows record the tool set alongside the prompt, so instability here would mean
// two identical prompts train against different inputs.
func TestSelectorIsDeterministic(t *testing.T) {
	sel := NewSelector(NewRegistry())
	first := names(sel.Select("file a leave for Ana", allowAll, 6))

	for i := 0; i < 20; i++ {
		got := names(sel.Select("file a leave for Ana", allowAll, 6))
		if len(got) != len(first) {
			t.Fatalf("run %d: length changed %v vs %v", i, got, first)
		}
		for j := range got {
			if got[j] != first[j] {
				t.Fatalf("run %d: order changed %v vs %v", i, got, first)
			}
		}
	}
}

// Every schema must be a well-formed object schema. A malformed one is
// rejected by the provider at request time, which surfaces as an opaque 400
// rather than pointing at the offending tool.
func TestRegistrySchemasAreWellFormed(t *testing.T) {
	for _, tool := range NewRegistry().all {
		if tool.Description == "" {
			t.Errorf("%s: empty description", tool.Action)
		}
		if tool.Schema["type"] != "object" {
			t.Errorf("%s: schema type is %v, want object", tool.Action, tool.Schema["type"])
		}
		props, ok := tool.Schema["properties"].(map[string]any)
		if !ok {
			t.Errorf("%s: properties missing or wrong type", tool.Action)
			continue
		}
		req, ok := tool.Schema["required"].([]string)
		if !ok {
			t.Errorf("%s: required missing or wrong type", tool.Action)
			continue
		}
		// A required field with no matching property is the specific mistake
		// that makes a model retry forever trying to satisfy it.
		for _, r := range req {
			if _, exists := props[r]; !exists {
				t.Errorf("%s: required field %q has no property definition", tool.Action, r)
			}
		}
	}
}

func TestQuestionsAreReadsEvenWithAWriteVerbInThem(t *testing.T) {
	for _, q := range []string{
		"was that bill approved",
		"who approved this leave?",
		"did we send the invoice",
		"has the period been closed",
		"what did we pay Meralco",
	} {
		if !looksReadOnly(q) {
			t.Errorf("question treated as an instruction: %q", q)
		}
	}
	for _, cmd := range []string{
		"approve the bill",
		"send the invoice to the customer",
		"close the August period",
	} {
		if looksReadOnly(cmd) {
			t.Errorf("instruction treated as a question: %q", cmd)
		}
	}
}
