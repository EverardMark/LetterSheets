package ai

import (
	"context"
	"regexp"
	"strings"
)

// Conversational turns that the tool-calling loop answers badly.
//
// Both shapes here arrived from the same screenshot. Asked "add expense
// account", the assistant correctly replied "I need code, name and account
// type" — and then answered BOTH follow-ups, "i dont know the code" and "how
// will i add expense account?", with "There are no active expense accounts in
// the system". Neither is a request for data, and handing either to a model
// holding four hundred tools gets a read of whatever the words happened to
// match.
//
// They are answered here, before the model is called at all: no round trip, no
// tools, and the same answer every time.

// howToDo matches a question about carrying out an action rather than a request
// for data. "how will i add an expense account" is a question about a write,
// and read-shaped only in its grammar — the leading "how" sent it down the data
// path, where the accounts were read and reported back.
var howToDo = regexp.MustCompile(`(?i)^\s*(how\s+(do|can|will|would|should|might)\s+(i|we|you)|how\s+to|what.{0,20}\bsteps\b|walk me through)\b`)

// dontKnow matches a user saying they cannot supply something just asked for.
var dontKnow = regexp.MustCompile(`(?i)\b(i\s+)?(do\s*n'?t|dont|don't|do not)\s+know\b|\bnot\s+sure\b|\bno\s+idea\b|\bwhat\s+should\s+(i|it)\s+be\b`)

// askedForFields recognises this engine's own request for missing fields, so a
// reply to it can be understood as a reply to it.
var askedForFields = regexp.MustCompile(`(?i)\bI need\b.*\bGive me those\b`)

// delegated matches the user handing the choice back: "create one yourself",
// "you decide", "pick one", "whatever you think".
//
// Asked for a code, a name and a type and told "create one yourslef", the
// assistant went back to reading the empty chart of accounts. The user was not
// asking a question — they were saying "stop asking me and propose something",
// which is a reasonable thing to say to an assistant, and answerable: the
// values it was missing are ones the system can pick, and the confirmation card
// is where the user sees the choice before it happens.
var delegated = regexp.MustCompile(`(?i)\b(you\s+(decide|choose|pick)|(create|make|add|do|pick|choose)\s+(it|one|any)?\s*(for\s+me)|up\s+to\s+you|whatever\s+you\s+(think|like)|any\s+(one|will\s+do)|surprise\s+me|just\s+(do|make|create)\s+it)\b`)

// delegatesChoice is the regex above plus a typo-tolerant test for "yourself".
//
// The instruction that prompted this was typed "create one yourslef", and a
// pattern demanding the letters in order does not match it. People misspell
// while typing quickly, and an assistant that only understands correct spelling
// is the same assistant that could not find "andres sample".
// containsFuzzy is word matching that survives a typo, for the words an intent
// actually hinges on.
//
// Every detector here started as a regex over exact spellings, which is a rule
// that people fail constantly and quickly: "yourslef", "konw", "detials". The
// assistant already tolerates a misspelled NAME; tolerating a misspelled
// instruction is the same courtesy. Short words are matched exactly — at three
// letters an edit is a different word.
func containsFuzzy(prompt string, words ...string) bool {
	lower := strings.ToLower(prompt)
	for _, w := range words {
		if MatchesName(lower, w) {
			return true
		}
	}
	return false
}

func delegatesChoice(prompt string) bool {
	lower := strings.ToLower(prompt)
	if delegated.MatchString(lower) {
		return true
	}
	if !MatchesName(lower, "yourself") && !MatchesName(lower, "yourselves") {
		return false
	}
	for _, verb := range []string{"create", "make", "add", "do", "pick", "choose", "decide", "fill"} {
		if strings.Contains(lower, verb) {
			return true
		}
	}
	return false
}

// followUp answers a conversational turn without calling the model, or returns
// false to let the normal loop run.
func followUp(reg *Registry, sel *Selector, offered []Tool, t Turn) (string, bool) {
	text, _, ok := followUpWith(nil, nil, nil, reg, sel, offered, t)
	return text, ok
}

// followUpWith is followUp with the means to propose. The executor is needed
// only by the delegated branch, which reads existing records to choose a value.
func followUpWith(ctx context.Context, e *Engine, exec Executor, reg *Registry, sel *Selector,
	offered []Tool, t Turn) (string, *PendingAction, bool) {
	prompt := strings.TrimSpace(t.Prompt)

	// "Create one yourself" — the user handing the choice back. Only meaningful
	// as a reply to a question this engine asked.
	if e != nil && delegatesChoice(prompt) && lastAskedForFields(t.History) {
		if earlier, ok := lastUserRequest(t.History); ok {
			if tool, isWrite := requestedWrite(sel.Select(earlier, t.Can, DefaultTopK), earlier); isWrite {
				if pending, say, made := e.proposeDefaults(ctx, exec, t, tool); made {
					return say, pending, true
				}
				return "I can prepare that, but I would be guessing at the details. " +
					"Tell me roughly what it is for and I will fill in the rest.", nil, true
			}
		}
	}

	// "How do I add an expense account?" — the honest answer is what the action
	// needs, which is exactly what the write path already computes.
	//
	// The tools are chosen again from the question with its "how do I" removed.
	// A question is read-shaped by design, so writes were pushed down the
	// ranking and create_account was not among the tools offered for it — the
	// list has to be built for the request the question is ABOUT.
	if howToDo.MatchString(prompt) || containsFuzzy(prompt, "howto") {
		asked := strippedQuestion(prompt)
		if action, need := missingForWrite(sel.Select(asked, t.Can, DefaultTopK), asked, nil); action != "" {
			return "To " + humaniseAction(action) + " I need " + joinWords(need) +
				". Tell me those and I will prepare it — nothing is saved until you confirm it.", nil, true
		}
	}

	// "I don't know the code" — a reply to the question this engine asked one
	// turn ago. The prompt on its own names nothing, so the request it belongs
	// to has to come from the history.
	if (dontKnow.MatchString(prompt) || containsFuzzy(prompt, "know", "unsure", "idea")) &&
		lastAskedForFields(t.History) {
		if earlier, ok := lastUserRequest(t.History); ok {
			if action, _ := missingForWrite(sel.Select(earlier, t.Can, DefaultTopK), earlier, nil); action != "" {
				return unknownFieldAdvice(reg, action, prompt), nil, true
			}
		}
	}
	return "", nil, false
}

// strippedQuestion turns "how do I add an expense account?" into "add an
// expense account", so the write it is asking about can be recognised.
func strippedQuestion(prompt string) string {
	out := howToDo.ReplaceAllString(prompt, "")
	return strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(out), "?"))
}

func lastAskedForFields(history []Message) bool {
	for i := len(history) - 1; i >= 0; i-- {
		if history[i].Role == RoleAssistant && history[i].Text != "" {
			return askedForFields.MatchString(history[i].Text)
		}
	}
	return false
}

func lastUserRequest(history []Message) (string, bool) {
	for i := len(history) - 1; i >= 0; i-- {
		// Skip the engine's own steering messages. They carry RoleUser because
		// that is the only role a provider accepts mid-conversation, and the
		// most recent one is almost always "Result of get_accounts: ..." rather
		// than anything the user typed.
		if history[i].Internal {
			continue
		}
		if history[i].Role == RoleUser && strings.TrimSpace(history[i].Text) != "" {
			return history[i].Text, true
		}
	}
	return "", false
}

// unknownFieldAdvice answers "I don't know X" with something better than
// repeating the question.
func unknownFieldAdvice(reg *Registry, action, prompt string) string {
	tool, ok := reg.Lookup(action)
	if !ok {
		return "I can look that up for you — tell me which part you are unsure of."
	}
	lower := strings.ToLower(prompt)

	// A code the user does not have is one the system can propose. Account
	// codes follow the statement category — assets 1000, liabilities 2000,
	// equity 3000, revenue 4000, expenses 5000 or 6000 — so the answer is a
	// suggestion, not another question.
	if strings.Contains(lower, "code") {
		if _, hasCode := propertyOf(tool, "code"); hasCode {
			return "You do not need to know it — codes follow the account type: assets start at 1000, " +
				"liabilities 2000, equity 3000, revenue 4000 and expenses 5000 or 6000. " +
				"Tell me the name and the type and I will suggest the next free code in that range."
		}
	}

	var fields []string
	if req, has := tool.Schema["required"].([]string); has {
		for _, f := range req {
			if f == "id" || strings.HasSuffix(f, "_id") {
				continue
			}
			fields = append(fields, strings.ReplaceAll(f, "_", " "))
		}
	}
	if len(fields) == 0 {
		return "Tell me what you do know and I will fill in the rest."
	}
	return "Tell me what you do know — " + joinWords(fields) +
		" — and I will work out the rest or suggest a value."
}

func propertyOf(tool Tool, name string) (any, bool) {
	props, ok := tool.Schema["properties"].(map[string]any)
	if !ok {
		return nil, false
	}
	v, has := props[name]
	return v, has
}
