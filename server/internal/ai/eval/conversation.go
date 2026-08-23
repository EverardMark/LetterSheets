package eval

import (
	"context"
	"encoding/json"
	"strings"

	"lettersheets/internal/ai"
)

// Multi-turn evaluation.
//
// The single-prompt corpus scores 98% with the conversational handlers on and
// 98% with them off, which sounds like the handlers are pointless. They are not
// — the corpus simply never tests what they do. Every prompt in it is a first
// turn, and every failure the user has actually reported came on a SECOND turn:
// answering a question the assistant asked, correcting it, referring back to
// something, or handing the choice back.
//
// This is the instrument for that, and for the question underneath it — whether
// a larger model handles these unaided, in which case the handlers should go.

// Conversation is a sequence of turns and what each answer must and must not do.
type Conversation struct {
	Name  string
	Turns []Exchange
}

type Exchange struct {
	Say string
	// Want is checked against the answer, lower-cased. Any one match passes.
	Want []string
	// Reject fails the turn outright.
	Reject []string
	// Propose names the action that must be proposed, if any.
	Propose string
}

// Conversations covers the shapes a person actually produces: answering a
// question, misspelling it, delegating, referring back, changing their mind.
func Conversations() []Conversation {
	return []Conversation{
		{"answer the question", []Exchange{
			{Say: "add expense account", Want: []string{"i need", "code"}},
			{Say: "code 6100, name Office Supplies, type Expense", Propose: "create_account"},
		}},
		{"say you do not know", []Exchange{
			{Say: "add expense account", Want: []string{"i need", "code"}},
			{Say: "i dont know the code", Reject: []string{"no active expense accounts", "no accounts"},
				Want: []string{"1000", "5000", "range", "suggest"}},
		}},
		{"misspell the reply", []Exchange{
			{Say: "add expense account", Want: []string{"i need"}},
			{Say: "i dont konw the cdoe", Reject: []string{"no active expense accounts"},
				Want: []string{"1000", "5000", "range", "suggest", "tell me"}},
		}},
		{"hand the choice back", []Exchange{
			{Say: "add expense account", Want: []string{"i need"}},
			{Say: "create one yourslef", Reject: []string{"no active expense accounts"}, Propose: "create_account"},
		}},
		{"ask how", []Exchange{
			{Say: "how will i add expense account?", Reject: []string{"no active expense accounts"},
				Want: []string{"i need", "code"}},
		}},
		{"refer back to a person", []Exchange{
			{Say: "show me all employees", Want: []string{"employee", "1", "2", "3", "asd", "mark"}},
			{Say: "show me mark padama details", Want: []string{"mark"}},
			{Say: "what department is he in", Reject: []string{"which employee", "who do you mean"},
				Want: []string{"test", "department", "none", "no department"}},
		}},
		{"correct the assistant", []Exchange{
			{Say: "show me andres sample details", Want: []string{"andrew", "closest", "can't find", "cannot find"}},
			{Say: "no i meant mark padama", Want: []string{"mark"}},
		}},
		{"change the subject", []Exchange{
			{Say: "add expense account", Want: []string{"i need"}},
			{Say: "actually show me all employees", Reject: []string{"i need code"},
				Want: []string{"employee", "mark", "asd"}},
		}},
	}
}

// RunConversation plays one conversation and returns a line per turn.
func RunConversation(ctx context.Context, e *ai.Engine, exec ai.Executor, c Conversation) (passed, total int, log []string) {
	var hist []ai.Message
	for _, x := range c.Turns {
		total++
		res, err := e.Run(ctx, exec, ai.Turn{
			Prompt: x.Say, History: hist, Can: func(string, string) bool { return true },
			CompanyID: "eval-co", Company: "Acme Corp",
		})
		if err != nil {
			log = append(log, "    FAIL "+x.Say+" -> error "+err.Error())
			continue
		}
		hist = res.History
		text := strings.ToLower(strings.TrimSpace(res.Text))
		var proposed []string
		for _, p := range res.Pending {
			proposed = append(proposed, p.Action)
		}

		bad := ""
		for _, r := range x.Reject {
			if strings.Contains(text, strings.ToLower(r)) {
				bad = "said " + `"` + r + `"`
			}
		}
		if bad == "" && x.Propose != "" && !contains(proposed, x.Propose) {
			bad = "did not propose " + x.Propose
		}
		if bad == "" && len(x.Want) > 0 && x.Propose == "" {
			hit := false
			for _, w := range x.Want {
				if strings.Contains(text, strings.ToLower(w)) {
					hit = true
					break
				}
			}
			if !hit {
				bad = "said none of " + strings.Join(x.Want, "/")
			}
		}

		short := text
		if len(short) > 88 {
			short = short[:88] + "…"
		}
		if bad == "" {
			passed++
			log = append(log, "    ok   "+pad(x.Say, 44)+" "+short)
		} else {
			log = append(log, "    FAIL "+pad(x.Say, 44)+" "+bad+"  |  "+short)
		}
	}
	return passed, total, log
}

// ConversationExecutor answers reads with a small, stable company.
type ConversationExecutor struct{ Calls []string }

func (c *ConversationExecutor) Execute(_ context.Context, action string, _ json.RawMessage) (json.RawMessage, error) {
	c.Calls = append(c.Calls, action)
	switch {
	case strings.Contains(action, "account"):
		return json.RawMessage(`{"accounts":[]}`), nil
	case strings.Contains(action, "employee"):
		return json.RawMessage(`{"employees":[
		 {"id":"11111111-1111-1111-1111-111111111111","first_name":"Mark","last_name":"Padama","department":"test","position":"asd","status":"Active"},
		 {"id":"22222222-2222-2222-2222-222222222222","first_name":"Andrew","last_name":"Sample","department":"","position":"","status":"Active"},
		 {"id":"33333333-3333-3333-3333-333333333333","first_name":"asd","middle_name":"asd","last_name":"asd","department":"test","position":"asd","status":"Active"}]}`), nil
	}
	return json.RawMessage(`{"rows":[]}`), nil
}
