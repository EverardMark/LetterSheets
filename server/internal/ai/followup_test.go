package ai

import (
	"context"
	"strings"
	"testing"
)

func TestHowDoIQuestionsAnswerWithWhatTheActionNeeds(t *testing.T) {
	prov := &scriptedProvider{turns: []Completion{{Text: "should not be called"}}}
	exec := &recordingExecutor{result: `{"accounts":[]}`}
	res, err := newTestEngine(prov, nil).Run(context.Background(), exec,
		basicTurn("how will i add expense account?"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(exec.calls) != 0 {
		t.Errorf("a how-to question read data: %v", exec.calls)
	}
	if prov.i != 0 {
		t.Errorf("a how-to question cost %d model calls", prov.i)
	}
	for _, want := range []string{"code", "name", "account type"} {
		if !strings.Contains(res.Text, want) {
			t.Errorf("answer does not mention %q: %q", want, res.Text)
		}
	}
	if strings.Contains(res.Text, "no active expense accounts") {
		t.Errorf("still reporting the account list: %q", res.Text)
	}
}

func TestIDontKnowTheCodeGetsAdviceNotTheAccountList(t *testing.T) {
	turn := basicTurn("i dont know the code")
	turn.History = []Message{
		{Role: RoleUser, Text: "add expense account"},
		{Role: RoleAssistant, Text: "To create an account I need code, name and account type. Give me those and I will prepare it for you."},
	}
	prov := &scriptedProvider{turns: []Completion{{Text: "should not be called"}}}
	exec := &recordingExecutor{result: `{"accounts":[]}`}
	res, err := newTestEngine(prov, nil).Run(context.Background(), exec, turn)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(exec.calls) != 0 {
		t.Errorf("read data instead of answering: %v", exec.calls)
	}
	if !strings.Contains(res.Text, "1000") || !strings.Contains(strings.ToLower(res.Text), "expense") {
		t.Errorf("no code guidance given: %q", res.Text)
	}
}

func TestAnOrdinaryRequestIsNotIntercepted(t *testing.T) {
	for _, prompt := range []string{
		"show me all employees",
		"add an expense account code 6300 called Repairs",
		"how many employees do we have",
	} {
		reg := NewRegistry()
		offered := NewSelector(reg).Select(prompt, allowAll, DefaultTopK)
		if text, handled := followUp(reg, NewSelector(reg), offered, Turn{Prompt: prompt, Can: allowAll}); handled {
			t.Errorf("%q was intercepted: %q", prompt, text)
		}
	}
}

func TestDontKnowWithoutAPendingQuestionIsNotIntercepted(t *testing.T) {
	// No question was asked, so there is nothing for "I don't know" to answer.
	reg := NewRegistry()
	offered := NewSelector(reg).Select("i dont know the code", allowAll, DefaultTopK)
	if _, handled := followUp(reg, NewSelector(reg), offered, Turn{Prompt: "i dont know the code", Can: allowAll}); handled {
		t.Error("intercepted a reply to a question that was never asked")
	}
}

func TestHistoryCarriesWhatTheUserWasShown(t *testing.T) {
	// The engine rewrote the answer; the replayed conversation must say the
	// same thing, or the next turn is replying to something that was never said.
	prov := &scriptedProvider{turns: []Completion{
		{ToolCalls: []ToolCall{call("c1", "get_accounts", `{}`)}},
		{Text: "There are no active expense accounts in the chart of accounts."},
	}}
	res, err := newTestEngine(prov, nil).Run(context.Background(),
		&recordingExecutor{result: `{"accounts":[]}`}, basicTurn("add expense account"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if !strings.Contains(res.Text, "I need") {
		t.Fatalf("the answer was not rewritten: %q", res.Text)
	}
	var lastAssistant string
	for _, m := range res.History {
		if m.Role == RoleAssistant && m.Text != "" {
			lastAssistant = m.Text
		}
	}
	if lastAssistant != res.Text {
		t.Errorf("history says %q but the user was shown %q", lastAssistant, res.Text)
	}
}

func TestTheWholeReportedConversationHolds(t *testing.T) {
	// add -> asks; "i dont know the code" -> advice, not the account list.
	prov := &scriptedProvider{turns: []Completion{
		{ToolCalls: []ToolCall{call("c1", "get_accounts", `{}`)}},
		{Text: "There are no active expense accounts in the chart of accounts."},
	}}
	exec := &recordingExecutor{result: `{"accounts":[]}`}
	e := newTestEngine(prov, nil)
	first, err := e.Run(context.Background(), exec, basicTurn("add expense account"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	second := basicTurn("i dont know the code")
	second.History = first.History
	res, err := e.Run(context.Background(), exec, second)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if strings.Contains(strings.ToLower(res.Text), "no active expense accounts") {
		t.Errorf("still answering with the account list: %q", res.Text)
	}
	if !strings.Contains(res.Text, "1000") {
		t.Errorf("no code guidance: %q", res.Text)
	}
}

func TestEngineMessagesAreNotMistakenForTheUsersOwn(t *testing.T) {
	history := []Message{
		{Role: RoleUser, Text: "add expense account"},
		{Role: RoleAssistant, Text: "To create an account I need code, name and account type. Give me those and I will prepare it for you."},
		{Role: RoleUser, Internal: true, Text: "Result of get_accounts:\n{\"accounts\":[]}"},
	}
	got, ok := lastUserRequest(history)
	if !ok || got != "add expense account" {
		t.Errorf("lastUserRequest = %q (%v), want the user's own request", got, ok)
	}
}

func TestDontKnowUsesTheUsersRequestNotAnInjectedOne(t *testing.T) {
	reg := NewRegistry()
	turn := Turn{
		Prompt: "i dont know the code",
		Can:    allowAll,
		History: []Message{
			{Role: RoleUser, Text: "add expense account"},
			{Role: RoleAssistant, Text: "To create an account I need code, name and account type. Give me those and I will prepare it for you."},
			{Role: RoleUser, Internal: true, Text: "Result of get_accounts:\n{\"accounts\":[]}"},
		},
	}
	text, handled := followUp(reg, NewSelector(reg), nil, turn)
	if !handled {
		t.Fatal("not handled")
	}
	if !strings.Contains(text, "1000") {
		t.Errorf("generic advice instead of code guidance: %q", text)
	}
}

func TestCreateOneYourselfProposesSomethingConcrete(t *testing.T) {
	turn := basicTurn("create one yourslef")
	turn.History = []Message{
		{Role: RoleUser, Text: "add expense account"},
		{Role: RoleAssistant, Text: "To create an account I need code, name and account type. Give me those and I will prepare it for you."},
	}
	prov := &scriptedProvider{turns: []Completion{{Text: "should not be called"}}}
	exec := &recordingExecutor{result: `{"accounts":[]}`}
	res, err := newTestEngine(prov, nil).Run(context.Background(), exec, turn)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(res.Pending) != 1 || res.Pending[0].Action != "create_account" {
		t.Fatalf("nothing proposed: %+v text=%q", res.Pending, res.Text)
	}
	s := res.Pending[0].Summary
	if s["account_type"] != "Expense" {
		t.Errorf("account_type = %v, want Expense", s["account_type"])
	}
	if s["code"] != "5000" {
		t.Errorf("code = %v, want the first free code in the expense range", s["code"])
	}
	if !strings.Contains(res.Text, "Change anything") {
		t.Errorf("the answer does not invite correction: %q", res.Text)
	}
}

func TestDelegationOnlyAppliesToAQuestionThatWasAsked(t *testing.T) {
	prov := &scriptedProvider{turns: []Completion{{Text: "Nothing to do."}}}
	res, err := newTestEngine(prov, nil).Run(context.Background(),
		&recordingExecutor{}, basicTurn("create one yourself"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(res.Pending) != 0 {
		t.Errorf("proposed something out of nowhere: %+v", res.Pending)
	}
}

func TestDelegationSurvivesTypos(t *testing.T) {
	for _, p := range []string{
		"create one yourslef", "create one yourself", "you decide",
		"make it yourself", "just do it", "up to you", "pick one for me",
	} {
		if !delegatesChoice(p) {
			t.Errorf("not recognised as delegation: %q", p)
		}
	}
	for _, p := range []string{
		"add an expense account code 6300 called Repairs",
		"show me all employees",
		"what did you do yourself",
	} {
		if delegatesChoice(p) && !strings.Contains(p, "yourself") {
			t.Errorf("ordinary request treated as delegation: %q", p)
		}
	}
}

func TestIntentSurvivesMisspelling(t *testing.T) {
	history := []Message{
		{Role: RoleUser, Text: "add expense account"},
		{Role: RoleAssistant, Text: "To create an account I need code, name and account type. Give me those and I will prepare it for you."},
	}
	reg := NewRegistry()
	sel := NewSelector(reg)

	// Misspelt replies must reach the same answers as correct ones.
	for _, p := range []string{"i dont know the code", "i dont konw the code"} {
		text, handled := followUp(reg, sel, nil, Turn{Prompt: p, Can: allowAll, History: history})
		if !handled {
			t.Errorf("%q was not understood", p)
			continue
		}
		if !strings.Contains(text, "1000") {
			t.Errorf("%q got %q, want the code guidance", p, text)
		}
	}
	// Naming no field, this gets the general offer rather than code guidance.
	if text, handled := followUp(reg, sel, nil,
		Turn{Prompt: "im not sure", Can: allowAll, History: history}); !handled ||
		!strings.Contains(text, "Tell me what you do know") {
		t.Errorf("im not sure -> %q", text)
	}
	for _, p := range []string{"create one yourslef", "make it yoursef", "you decide"} {
		if !delegatesChoice(p) {
			t.Errorf("%q not recognised as delegation", p)
		}
	}
}
