package ai

import (
	"strings"
	"testing"
)

func msg(role Role, text string) Message { return Message{Role: role, Text: text} }

// The production failure: a couple of large tool results push the replayed
// history past the window, and then every request fails — including a bare
// "hello" — because the history rides along with it.
func TestTrimHistoryKeepsConversationUnderBudget(t *testing.T) {
	big := strings.Repeat("x", 30000) // ~10k tokens on its own
	history := []Message{
		msg(RoleUser, "show me the employee list"),
		{Role: RoleAssistant, ToolCalls: []ToolCall{{ID: "c1", Name: "get_employees", Args: []byte(`{}`)}}},
		msg(RoleTool, big),
		msg(RoleAssistant, strings.Repeat("y", 6000)),
		msg(RoleUser, "hello"),
	}

	got := TrimHistory(history, HistoryBudget())

	total := 0
	for _, m := range got {
		total += messageTokens(m)
	}
	if total > HistoryBudget() {
		t.Errorf("trimmed history is %d tokens, budget is %d", total, HistoryBudget())
	}
	if len(got) == 0 {
		t.Fatal("trimmed everything; the model would lose all context")
	}
	// Recency is what a follow-up refers to, so the newest turn must survive.
	if got[len(got)-1].Text != "hello" {
		t.Errorf("most recent message was dropped: %+v", got[len(got)-1])
	}
}

// A tool result whose originating tool_call was trimmed away is an orphan, and
// some servers reject the request outright.
func TestTrimHistoryNeverStartsOnAnOrphanToolResult(t *testing.T) {
	history := []Message{
		msg(RoleUser, strings.Repeat("a", 20000)),
		{Role: RoleAssistant, ToolCalls: []ToolCall{{ID: "c1", Name: "get_leaves", Args: []byte(`{}`)}}},
		msg(RoleTool, strings.Repeat("b", 20000)),
		msg(RoleUser, "and next week?"),
	}
	got := TrimHistory(history, 500)
	if len(got) > 0 && got[0].Role == RoleTool {
		t.Errorf("history begins with an orphaned tool result: %+v", got[0])
	}
}

// A truncated result must say so. A model that believes a cut-off roster is the
// whole roster reports the wrong headcount with full confidence.
func TestTruncateToolResultAnnouncesItself(t *testing.T) {
	got := truncateToolResult(strings.Repeat("z", MaxToolResultTokens*3+500))
	if !strings.Contains(got, "truncated") {
		t.Error("truncation was silent")
	}
	if !strings.Contains(got, "partial") {
		t.Error("model was not told to disclose the partial result to the user")
	}
	if estimateTokens(got) > MaxToolResultTokens+120 {
		t.Errorf("still %d tokens after truncation", estimateTokens(got))
	}
}

func TestTruncateToolResultLeavesSmallResultsAlone(t *testing.T) {
	in := `{"employees":[{"id":"e-1","first_name":"Ana"}]}`
	if truncateToolResult(in) != in {
		t.Error("a small result was modified")
	}
}

// Short conversations must pass through untouched.
func TestTrimHistoryNoOpWhenItFits(t *testing.T) {
	history := []Message{msg(RoleUser, "who is off next week"), msg(RoleAssistant, "Nobody.")}
	got := TrimHistory(history, HistoryBudget())
	if len(got) != 2 {
		t.Errorf("a short history was trimmed: %d messages", len(got))
	}
}

func TestIsContextOverflow(t *testing.T) {
	overflow := []string{
		"inference server returned 400: This model's maximum context length is 8192 tokens",
		"context_length_exceeded",
		"the input is longer than the maximum",
	}
	for _, s := range overflow {
		if !IsContextOverflow(errString(s)) {
			t.Errorf("not recognised as overflow: %s", s)
		}
	}
	if IsContextOverflow(errString("connection refused")) {
		t.Error("an unrelated error was treated as overflow")
	}
	if IsContextOverflow(nil) {
		t.Error("nil treated as overflow")
	}
}

type errString string

func (e errString) Error() string { return string(e) }

// The budget must leave real room for conversation after the fixed costs.
func TestHistoryBudgetIsUsable(t *testing.T) {
	if b := HistoryBudget(); b < 2000 {
		t.Errorf("history budget is only %d tokens; barely any conversation survives", b)
	}
	if ReservedForPrompt+ReservedForOutput+HistoryBudget() != ContextWindow {
		t.Error("the reservations do not add up to the window")
	}
}
