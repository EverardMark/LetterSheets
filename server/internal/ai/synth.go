package ai

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"sort"
	"strings"
)

// Synthetic training data, generated from the registry and from the rules this
// engine currently enforces by hand.
//
// The rules ARE the teacher. Every deterministic handler written into this
// engine — ask when a field is missing, never claim a write happened, resolve a
// name before using an id, never dump a table when one record was asked for —
// exists because the base model does not do it. Coding one rule per phrasing
// does not generalise, which is the whole complaint against this design and a
// fair one. Turning each rule into a few hundred examples and training on them
// moves the behaviour into the weights, where it applies to phrasings nobody
// enumerated.
//
// What is NOT synthesised: which tool answers which prompt. The base model is
// already at 98% on that, and teaching it from templates would narrow it to the
// phrasings a template happened to contain.

// Synth produces a training set from a registry.
type Synth struct {
	reg  *Registry
	rng  *rand.Rand
	sys  string
	seen map[string]bool
}

func NewSynth(reg *Registry, seed int64, system string) *Synth {
	return &Synth{reg: reg, rng: rand.New(rand.NewSource(seed)), sys: system, seen: map[string]bool{}}
}

// Build returns the whole set, shuffled.
func (s *Synth) Build() []TrainingExample {
	var out []TrainingExample
	out = append(out, s.askForMissingFields()...)
	out = append(out, s.dontKnowFollowUps()...)
	out = append(out, s.delegatedChoice()...)
	out = append(out, s.howDoI()...)
	out = append(out, s.neverClaimDone()...)
	out = append(out, s.readsStayReads()...)
	out = append(out, s.resolveNamesFirst()...)
	out = append(out, s.refuseWithheld()...)
	out = append(out, s.writesWithDetails()...)
	out = append(out, s.readsWithFilters()...)
	out = append(out, s.groundedTwoStep()...)

	s.rng.Shuffle(len(out), func(i, j int) { out[i], out[j] = out[j], out[i] })
	return out
}

// writesNeedingFields returns writes with at least one non-id required field —
// the ones a user can be asked about.
func (s *Synth) writesNeedingFields() []Tool {
	var out []Tool
	for _, tool := range s.reg.All() {
		if !tool.Write {
			continue
		}
		if _, need := missingForWrite([]Tool{tool}, "add "+strings.ReplaceAll(subjectOf(tool.Action), "_", " "), nil); len(need) > 0 {
			out = append(out, tool)
		}
	}
	return out
}

// askForMissingFields: a write named with no details is answered with the
// question, never with a guess and never with a read.
func (s *Synth) askForMissingFields() []TrainingExample {
	var out []TrainingExample
	for _, tool := range s.writesNeedingFields() {
		subject := strings.ReplaceAll(subjectOf(tool.Action), "_", " ")
		// Two phrasings, not six. The first draft generated 2,655 prose answers
		// against 244 calls, which teaches a model to discuss the work instead
		// of doing it.
		for _, phrasing := range []string{
			"add a " + subject,
			"i want to add a " + subject,
		} {
			prompt := s.maybeTypo(phrasing)
			action, need := missingForWrite([]Tool{tool}, phrasing, nil)
			if action == "" {
				continue
			}
			out = append(out, s.example(prompt, nil, fmt.Sprintf(
				"To %s I need %s. Give me those and I will prepare it for you.",
				humaniseAction(action), joinWords(need)), tool))
		}
	}
	return out
}

// dontKnowFollowUps: a reply saying the user cannot supply a field is answered
// with help, not with a read and not by repeating the question.
func (s *Synth) dontKnowFollowUps() []TrainingExample {
	var out []TrainingExample
	for _, tool := range s.writesNeedingFields() {
		subject := strings.ReplaceAll(subjectOf(tool.Action), "_", " ")
		request := "add a " + subject
		action, need := missingForWrite([]Tool{tool}, request, nil)
		if action == "" {
			continue
		}
		asked := fmt.Sprintf("To %s I need %s. Give me those and I will prepare it for you.",
			humaniseAction(action), joinWords(need))
		history := []Message{
			{Role: RoleUser, Text: request},
			{Role: RoleAssistant, Text: asked},
		}
		for _, reply := range []string{
			"i dont know the " + need[0],
			"not sure about the " + need[0],
		} {
			answer := unknownFieldAdvice(s.reg, action, reply)
			ex := s.example(s.maybeTypo(reply), history, answer, tool)
			out = append(out, ex)
		}
	}
	return out
}

// delegatedChoice: "you decide" is answered with a concrete proposal or an
// honest offer, never with a read.
func (s *Synth) delegatedChoice() []TrainingExample {
	var out []TrainingExample
	for _, tool := range s.writesNeedingFields() {
		subject := strings.ReplaceAll(subjectOf(tool.Action), "_", " ")
		request := "add a " + subject
		action, need := missingForWrite([]Tool{tool}, request, nil)
		if action == "" {
			continue
		}
		history := []Message{
			{Role: RoleUser, Text: request},
			{Role: RoleAssistant, Text: fmt.Sprintf(
				"To %s I need %s. Give me those and I will prepare it for you.",
				humaniseAction(action), joinWords(need))},
		}
		for _, reply := range []string{"create one yourself", "you decide"} {
			out = append(out, s.example(s.maybeTypo(reply), history,
				"I can prepare that, but I would be guessing at the details. "+
					"Tell me roughly what it is for and I will fill in the rest.", tool))
		}
	}
	return out
}

// howDoI: a question about performing an action is answered with what the
// action needs, not with a read of existing records.
func (s *Synth) howDoI() []TrainingExample {
	var out []TrainingExample
	for _, tool := range s.writesNeedingFields() {
		subject := strings.ReplaceAll(subjectOf(tool.Action), "_", " ")
		action, need := missingForWrite([]Tool{tool}, "add a "+subject, nil)
		if action == "" {
			continue
		}
		answer := "To " + humaniseAction(action) + " I need " + joinWords(need) +
			". Tell me those and I will prepare it — nothing is saved until you confirm it."
		for _, phrasing := range []string{
			"how do i add a " + subject,
			"how will i add " + subject,
		} {
			out = append(out, s.example(s.maybeTypo(phrasing), nil, answer, tool))
		}
	}
	return out
}

// neverClaimDone: nothing is done until the user confirms, so no answer may say
// it was.
func (s *Synth) neverClaimDone() []TrainingExample {
	var out []TrainingExample
	for i, tool := range s.reg.All() {
		if !tool.Write || i%7 != 0 { // a sample, not every action
			continue
		}
		subject := strings.ReplaceAll(subjectOf(tool.Action), "_", " ")
		history := []Message{
			{Role: RoleUser, Text: "please " + strings.Split(tool.Action, "_")[0] + " the " + subject},
		}
		out = append(out, s.example("did you do it?", history,
			"Not yet — I have not changed anything. A proposal has to be confirmed by you "+
				"before it takes effect.", tool))
	}
	return out
}

// readsStayReads: a request to SEE something is answered by reading, never by
// proposing a change.
func (s *Synth) readsStayReads() []TrainingExample {
	var out []TrainingExample
	for _, tool := range s.reg.All() {
		if tool.Write || !isListing(tool) {
			continue
		}
		subject := strings.ReplaceAll(subjectOf(tool.Action), "_", " ")
		for _, phrasing := range []string{"show me the " + subject, "list the " + subject} {
			args, _ := json.Marshal(map[string]any{})
			out = append(out, s.call(s.maybeTypo(phrasing), tool, args))
		}
	}
	return out
}

// resolveNamesFirst: a person named in a request is looked up before any id is
// used, because an invented id is the failure that matters most.
func (s *Synth) resolveNamesFirst() []TrainingExample {
	names := []string{"Mark Padama", "Ana Cruz", "Juan Dela Cruz", "Andrew Sample", "asd asd"}
	find, ok := s.reg.Lookup("find_employees")
	if !ok {
		return nil
	}
	var out []TrainingExample
	for _, name := range names {
		for _, phrasing := range []string{
			"show me %s details", "who is %s", "details of %s", "pull up %s",
		} {
			prompt := fmt.Sprintf(phrasing, name)
			args, _ := json.Marshal(map[string]string{"name": strings.ToLower(name)})
			out = append(out, s.call(s.maybeTypo(prompt), find, args))
		}
	}
	return out
}

// refuseWithheld: credential and session actions are declined, in plain words,
// with the reason.
func (s *Synth) refuseWithheld() []TrainingExample {
	// A slice, not a map: every iteration consumes the random generator, and
	// Go randomises map order, so a map here made the whole dataset differ
	// between runs — the determinism test caught it, which is what it is for.
	prompts := []struct{ ask, answer string }{
		{"reset the password for mark", "I cannot change passwords. Do that from the account screen — I am not able to set or reset a credential."},
		{"change my password", "I cannot change passwords. Do that from the account screen — I am not able to set or reset a credential."},
		{"create a user account for ana", "I cannot create accounts or set passwords. Add the user from the account screen and I can help with everything else."},
		{"log me out", "I cannot sign you in or out — use the menu for that."},
		{"give me an api key", "I cannot issue credentials."},
		{"set up a login for the new hire", "I cannot create accounts or set passwords. Add the login from the account screen; I can prepare the employee record itself."},
	}
	var out []TrainingExample
	for _, p := range prompts {
		out = append(out, s.example(s.maybeTypo(p.ask), nil, p.answer, Tool{}))
	}
	return out
}

// writesWithDetails: the user supplies the values, the assistant proposes. The
// core positive example, and the one the first draft of this file left out
// entirely — 2,655 prose answers against 244 calls would have taught the model
// to discuss the work rather than do it.
//
// Writes needing an id are excluded: the value would have to be invented, and
// an example containing a made-up id teaches exactly the failure the grounding
// guard exists to stop.
func (s *Synth) writesWithDetails() []TrainingExample {
	var out []TrainingExample
	for _, tool := range s.reg.All() {
		if !tool.Write {
			continue
		}
		req, _ := tool.Schema["required"].([]string)
		if len(req) == 0 || len(req) > 4 {
			continue
		}
		skip := false
		for _, f := range req {
			if f == "id" || strings.HasSuffix(f, "_id") {
				skip = true
			}
		}
		if skip {
			continue
		}

		values := map[string]any{}
		var said []string
		for _, field := range req {
			v, phrase := s.valueFor(tool, field)
			if v == nil {
				skip = true
				break
			}
			values[field] = v
			said = append(said, phrase)
		}
		if skip {
			continue
		}

		subject := strings.ReplaceAll(subjectOf(tool.Action), "_", " ")
		verb := strings.Split(tool.Action, "_")[0]
		args, err := json.Marshal(values)
		if err != nil {
			continue
		}
		for _, shape := range []string{
			"%s a %s with %s",
			"%s %s: %s",
			"please %s a %s, %s",
		} {
			prompt := fmt.Sprintf(shape, verb, subject, strings.Join(said, ", "))
			out = append(out, s.call(s.maybeTypo(prompt), tool, args))
		}
	}
	return out
}

// valueFor invents a plausible value for a field, and the words a user would
// say to supply it.
func (s *Synth) valueFor(tool Tool, field string) (any, string) {
	props, _ := tool.Schema["properties"].(map[string]any)
	spec, _ := props[field].(map[string]any)
	label := strings.ReplaceAll(field, "_", " ")

	if enum, ok := spec["enum"].([]string); ok && len(enum) > 0 {
		v := enum[s.rng.Intn(len(enum))]
		return v, label + " " + v
	}
	switch spec["type"] {
	case "number", "integer":
		n := (s.rng.Intn(20) + 1) * 500
		return n, fmt.Sprintf("%s %d", label, n)
	case "boolean":
		return true, label + " yes"
	case "array":
		return nil, ""
	}
	if strings.Contains(field, "date") {
		return "2026-08-22", label + " 2026-08-22"
	}
	if field == "code" {
		return "6100", "code 6100"
	}
	if field == "name" || field == "title" || field == "subject" {
		v := strings.Title(strings.ReplaceAll(subjectOf(tool.Action), "_", " "))
		return v, fmt.Sprintf("%s %q", label, v)
	}
	return "Sample " + label, fmt.Sprintf("%s %q", label, "Sample "+label)
}

// readsWithFilters: reads that take arguments should receive them, not be
// called bare and filtered by eye afterwards.
func (s *Synth) readsWithFilters() []TrainingExample {
	var out []TrainingExample
	for _, tool := range s.reg.All() {
		if tool.Write || !strings.HasPrefix(tool.Action, "get_") {
			continue
		}
		props, ok := tool.Schema["properties"].(map[string]any)
		if !ok || len(props) == 0 {
			continue
		}
		var fields []string
		for field := range props {
			fields = append(fields, field)
		}
		sort.Strings(fields) // map order is random; the set must not be
		for _, field := range fields {
			spec, _ := props[field].(map[string]any)
			enum, has := spec["enum"].([]string)
			if !has || len(enum) == 0 {
				continue
			}
			subject := strings.ReplaceAll(subjectOf(tool.Action), "_", " ")
			value := enum[s.rng.Intn(len(enum))]
			args, err := json.Marshal(map[string]any{field: value})
			if err != nil {
				continue
			}
			for _, shape := range []string{"show me %s %s", "which %s are %s", "list %s %s"} {
				prompt := fmt.Sprintf(shape, value, subject)
				if strings.HasPrefix(shape, "which") {
					prompt = fmt.Sprintf(shape, subject, value)
				}
				out = append(out, s.call(s.maybeTypo(strings.ToLower(prompt)), tool, args))
			}
			break // one filtered example per tool is enough
		}
	}
	return out
}

// groundedTwoStep: an id used in a write must have come from a read.
//
// This covers the writes writesWithDetails skips — the ones requiring an id —
// and covers them the RIGHT way. The id appears in a tool result in the
// conversation, and the assistant then uses that exact value. An example
// containing an id from nowhere would teach the fabrication the grounding guard
// spends its whole existence catching.
func (s *Synth) groundedTwoStep() []TrainingExample {
	const realID = "6f1c9d20-0a11-4e6b-9a31-1c2f3d4e5a01"
	var out []TrainingExample
	for _, tool := range s.reg.All() {
		if !tool.Write {
			continue
		}
		field, list, ok := missingIDFor(s.reg, tool)
		if !ok {
			continue
		}
		req, _ := tool.Schema["required"].([]string)
		values := map[string]any{field: realID}
		usable := true
		for _, f := range req {
			if f == field {
				continue
			}
			if f == "id" || strings.HasSuffix(f, "_id") {
				usable = false
				break
			}
			v, _ := s.valueFor(tool, f)
			if v == nil {
				usable = false
				break
			}
			values[f] = v
		}
		if !usable {
			continue
		}
		args, err := json.Marshal(values)
		if err != nil {
			continue
		}

		subject := strings.ReplaceAll(subjectOf(tool.Action), "_", " ")
		verb := strings.Split(tool.Action, "_")[0]
		listSubject := strings.ReplaceAll(subjectOf(list.Action), "_", " ")
		history := []Message{
			{Role: RoleUser, Text: "show me the " + listSubject},
			{Role: RoleAssistant, Text: fmt.Sprintf(
				"There is 1 %s: %q, id %s.", strings.TrimSuffix(listSubject, "s"), "Sample", realID)},
		}
		for _, shape := range []string{"%s that one", "%s it", "now %s that %s"} {
			prompt := fmt.Sprintf(shape, verb, subject)
			if strings.Count(shape, "%s") == 1 {
				prompt = fmt.Sprintf(shape, verb)
			}
			ex := s.call(s.maybeTypo(prompt), tool, args)
			ex.History = history
			out = append(out, ex)
		}
	}
	return out
}

// example builds a prose-answer row.
func (s *Synth) example(prompt string, history []Message, answer string, tool Tool) TrainingExample {
	return TrainingExample{
		System:  s.sys,
		Prompt:  prompt,
		History: history,
		Answer:  answer,
		Tools:   s.toolsFor(prompt, tool),
		Verdict: VerdictConfirmed,
	}
}

// call builds a tool-call row.
func (s *Synth) call(prompt string, tool Tool, args json.RawMessage) TrainingExample {
	return TrainingExample{
		System:   s.sys,
		Prompt:   prompt,
		Proposed: []ToolCall{{ID: "call-1", Name: tool.Action, Args: args}},
		Tools:    s.toolsFor(prompt, tool),
		Verdict:  VerdictConfirmed,
	}
}

// toolsFor reproduces inference conditions: the candidate set the selector
// would have offered, with the intended tool guaranteed present.
func (s *Synth) toolsFor(prompt string, tool Tool) []ToolDef {
	sel := NewSelector(s.reg)
	offered := sel.Select(prompt, func(string, string) bool { return true }, DefaultTopK)
	has := false
	for _, t := range offered {
		if t.Action == tool.Action {
			has = true
		}
	}
	if !has && tool.Action != "" {
		if len(offered) > 0 {
			offered[len(offered)-1] = tool
		} else {
			offered = []Tool{tool}
		}
	}
	defs := make([]ToolDef, len(offered))
	for i, t := range offered {
		defs[i] = ToolDef{Name: t.Action, Description: t.Description, Schema: t.Schema}
	}
	return defs
}

// maybeTypo misspells a word about a fifth of the time.
//
// Typos are not noise to be cleaned up, they are the input. A model that only
// understands correct spelling is the one that could not find "andres sample"
// or understand "create one yourslef", and no amount of rules fixes that as
// well as training on the real distribution does.
func (s *Synth) maybeTypo(prompt string) string {
	if s.rng.Intn(5) != 0 {
		return prompt
	}
	words := strings.Fields(prompt)
	if len(words) == 0 {
		return prompt
	}
	i := s.rng.Intn(len(words))
	w := words[i]
	if len(w) < 4 {
		return prompt
	}
	switch s.rng.Intn(3) {
	case 0: // transpose two letters
		j := s.rng.Intn(len(w) - 1)
		words[i] = w[:j] + string(w[j+1]) + string(w[j]) + w[j+2:]
	case 1: // drop a letter
		j := s.rng.Intn(len(w))
		words[i] = w[:j] + w[j+1:]
	case 2: // drop an apostrophe
		words[i] = strings.ReplaceAll(w, "'", "")
	}
	return strings.Join(words, " ")
}
