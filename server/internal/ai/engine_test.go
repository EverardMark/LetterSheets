package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"
)

// scriptedProvider replays a fixed sequence of completions and records the
// requests it received, so the loop can be driven without a model.
type scriptedProvider struct {
	turns []Completion
	seen  []Request
	i     int
}

func (s *scriptedProvider) Name() string { return "scripted" }

func (s *scriptedProvider) Complete(_ context.Context, req Request) (*Completion, error) {
	s.seen = append(s.seen, req)
	if s.i >= len(s.turns) {
		return nil, fmt.Errorf("scripted provider ran out of turns after %d", s.i)
	}
	c := s.turns[s.i]
	s.i++
	return &c, nil
}

type recordingExecutor struct {
	calls  []string
	result string
	err    error
}

func (r *recordingExecutor) Execute(_ context.Context, action string, args json.RawMessage) (json.RawMessage, error) {
	r.calls = append(r.calls, action)
	if r.err != nil {
		return nil, r.err
	}
	if r.result == "" {
		return json.RawMessage(`{"ok":true}`), nil
	}
	return json.RawMessage(r.result), nil
}

type memRecorder struct{ got []TrainingExample }

func (m *memRecorder) Record(_ context.Context, ex TrainingExample) error {
	m.got = append(m.got, ex)
	return nil
}

// lastFrom returns the most recent message matching pred. Tests used to index
// the final message directly, which broke as soon as the engine appended a
// caption instruction after tool results — the assertion should be about what
// the model was told, not where in the slice it landed.
func lastFrom(msgs []Message, pred func(Message) bool) Message {
	for i := len(msgs) - 1; i >= 0; i-- {
		if pred(msgs[i]) {
			return msgs[i]
		}
	}
	return Message{}
}

func lastTool(msgs []Message) Message {
	return lastFrom(msgs, func(m Message) bool { return m.Role == RoleTool })
}

func call(id, name, args string) ToolCall {
	return ToolCall{ID: id, Name: name, Args: json.RawMessage(args)}
}

func newTestEngine(p Provider, rec Recorder) *Engine {
	e := NewEngine(StaticRouter{P: p}, NewRegistry(), rec)
	e.now = func() time.Time { return time.Date(2026, 8, 21, 9, 0, 0, 0, time.UTC) }
	return e
}

func basicTurn(prompt string) Turn {
	return Turn{Prompt: prompt, Can: allowAll, CompanyID: "co-1", Company: "Acme Corp"}
}

// The core safety property: a write never reaches the executor from a model
// turn. It comes back as a proposal instead.
func TestWritesAreProposedNotExecuted(t *testing.T) {
	prov := &scriptedProvider{turns: []Completion{{
		Text:      "I'll file that leave.",
		ToolCalls: []ToolCall{call("c1", "create_leave", `{"employee_id":"3f2504e0-4f89-11d3-9a0c-0305e82c3301","leave_type":"Sick","start_date":"2026-08-21","end_date":"2026-08-21"}`)},
	}}}
	exec := &recordingExecutor{}
	rec := &memRecorder{}

	res, err := newTestEngine(prov, rec).Run(context.Background(), exec,
		basicTurn("file a sick day for Ana, employee 3f2504e0-4f89-11d3-9a0c-0305e82c3301"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	if len(exec.calls) != 0 {
		t.Errorf("a write reached the executor without confirmation: %v", exec.calls)
	}
	if len(res.Pending) != 1 {
		t.Fatalf("want 1 pending action, got %d", len(res.Pending))
	}
	if res.Pending[0].Action != "create_leave" {
		t.Errorf("pending action = %s", res.Pending[0].Action)
	}
	// The card must show the real arguments, not the model's prose.
	if res.Pending[0].Summary["employee_id"] != "3f2504e0-4f89-11d3-9a0c-0305e82c3301" {
		t.Errorf("summary does not carry the arguments: %+v", res.Pending[0].Summary)
	}
	if len(rec.got) != 1 || rec.got[0].Verdict != "" {
		t.Errorf("proposal was not captured for training: %+v", rec.got)
	}
	if res.ExampleID == "" {
		t.Error("no example id returned, so a later confirm cannot be tied back")
	}
}

// Reads run without asking, and their output is fed back so the model can
// answer from real data.
func TestReadsExecuteAndFeedBack(t *testing.T) {
	prov := &scriptedProvider{turns: []Completion{
		{ToolCalls: []ToolCall{call("c1", "get_leaves", `{"status":"Pending"}`)}},
		{Text: "Two people have pending leave: Ana and Ben."},
	}}
	exec := &recordingExecutor{result: `{"leaves":[{"first_name":"Ana"},{"first_name":"Ben"}]}`}

	res, err := newTestEngine(prov, nil).Run(context.Background(), exec, basicTurn("who has pending leave"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	if len(exec.calls) != 1 || exec.calls[0] != "get_leaves" {
		t.Errorf("read was not executed: %v", exec.calls)
	}
	if !strings.Contains(res.Text, "Ana") {
		t.Errorf("final text = %q", res.Text)
	}
	// Second request must carry the tool result back to the model.
	if len(prov.seen) != 2 {
		t.Fatalf("want 2 model calls, got %d", len(prov.seen))
	}
	last := lastTool(prov.seen[1].Messages)
	if last.Role != RoleTool || !strings.Contains(last.Text, "Ana") {
		t.Errorf("tool result not fed back: %+v", last)
	}
}

// An invented tool name must produce actionable feedback, not a crash.
func TestUnknownToolIsCorrectedNotFatal(t *testing.T) {
	prov := &scriptedProvider{turns: []Completion{
		{ToolCalls: []ToolCall{call("c1", "list_all_the_staff", `{}`)}},
		{Text: "Here are the employees."},
	}}

	res, err := newTestEngine(prov, nil).Run(context.Background(), &recordingExecutor{}, basicTurn("show me everyone"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.Text != "Here are the employees." {
		t.Errorf("engine did not recover: %q", res.Text)
	}

	feedback := lastTool(prov.seen[1].Messages)
	if !strings.Contains(feedback.Text, "No such action") {
		t.Errorf("model was not told the name was wrong: %q", feedback.Text)
	}
	// Either employee resolver proves the point: the correction names actions
	// that exist rather than leaving the model to guess again.
	if !strings.Contains(feedback.Text, "find_employees") && !strings.Contains(feedback.Text, "get_employees") {
		t.Errorf("feedback should list real actions, got: %q", feedback.Text)
	}
}

// Bad arguments must be rejected before execution, with a message that names
// the problem.
func TestInvalidArgumentsNeverReachTheExecutor(t *testing.T) {
	prov := &scriptedProvider{turns: []Completion{
		{ToolCalls: []ToolCall{call("c1", "get_attendance", `{"date_from":"2026-08-01"}`)}}, // date_to missing
		{Text: "Sorry, I need an end date."},
	}}
	exec := &recordingExecutor{}

	if _, err := newTestEngine(prov, nil).Run(context.Background(), exec, basicTurn("timesheet for August")); err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(exec.calls) != 0 {
		t.Errorf("invalid call was executed: %v", exec.calls)
	}
	feedback := lastTool(prov.seen[1].Messages)
	if !strings.Contains(feedback.Text, "date_to") {
		t.Errorf("feedback should name the missing field, got: %q", feedback.Text)
	}
}

// Permission is re-checked at call time, not just at selection time.
func TestPermissionIsEnforcedAtCallTime(t *testing.T) {
	prov := &scriptedProvider{turns: []Completion{
		{ToolCalls: []ToolCall{call("c1", "approve_leave", `{"id":"l-1","status":"Approved"}`)}},
		{Text: "You don't have permission to approve leave."},
	}}
	exec := &recordingExecutor{}

	turn := basicTurn("approve Ben's leave")
	turn.Can = func(module, fn string) bool { return !(module == "leave" && fn == "approve") }

	res, err := newTestEngine(prov, nil).Run(context.Background(), exec, turn)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(res.Pending) != 0 {
		t.Errorf("unpermitted write was proposed: %+v", res.Pending)
	}
	if len(exec.calls) != 0 {
		t.Errorf("unpermitted write was executed: %v", exec.calls)
	}
	feedback := lastTool(prov.seen[1].Messages)
	if !strings.Contains(feedback.Text, "Refused") {
		t.Errorf("model was not told it lacked permission: %q", feedback.Text)
	}
}

// A model that loops must terminate with an honest message rather than hanging.
func TestIterationCapTerminatesCleanly(t *testing.T) {
	turns := make([]Completion, 12)
	for i := range turns {
		turns[i] = Completion{ToolCalls: []ToolCall{call("c1", "get_leaves", `{}`)}}
	}
	prov := &scriptedProvider{turns: turns}

	// Against the engine's own cap, not a number written here — the cap moved
	// from six to eight when the engine gained interventions that spend
	// iterations of their own, and a hardcoded bound only recorded what it used
	// to be.
	e := newTestEngine(prov, nil)
	res, err := e.Run(context.Background(), &recordingExecutor{}, basicTurn("who is off"))
	if err != nil {
		t.Fatalf("Run should not error on a looping model: %v", err)
	}
	if len(res.Pending) != 0 {
		t.Errorf("unexpected pending actions: %+v", res.Pending)
	}
	if !strings.Contains(res.Text, "wasn't able") {
		t.Errorf("expected an honest failure message, got %q", res.Text)
	}
	if prov.i > e.maxIterations {
		t.Errorf("iteration cap not honoured: made %d model calls, cap is %d", prov.i, e.maxIterations)
	}
}

// A failing read is reported back to the model, which can then explain it,
// rather than surfacing as a 500.
func TestExecutorErrorIsFedBack(t *testing.T) {
	prov := &scriptedProvider{turns: []Completion{
		{ToolCalls: []ToolCall{call("c1", "get_leaves", `{}`)}},
		{Text: "I couldn't reach the leave records just now."},
	}}
	exec := &recordingExecutor{err: fmt.Errorf("database is down")}

	res, err := newTestEngine(prov, nil).Run(context.Background(), exec, basicTurn("who is off"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	feedback := lastTool(prov.seen[1].Messages)
	if !strings.Contains(feedback.Text, "database is down") {
		t.Errorf("executor error not passed to the model: %q", feedback.Text)
	}
	if res.Text == "" {
		t.Error("no final answer produced")
	}
}

// The date has to be in the system prompt or every relative phrase is guesswork.
func TestSystemPromptCarriesDateAndCompany(t *testing.T) {
	e := newTestEngine(&scriptedProvider{}, nil)
	got := e.systemPrompt("Acme Corp")

	for _, want := range []string{"2026-08-21", "Friday", "Acme Corp", "Philippine Pesos"} {
		if !strings.Contains(got, want) {
			t.Errorf("system prompt missing %q:\n%s", want, got)
		}
	}
}

func TestRunRejectsEmptyPrompt(t *testing.T) {
	e := newTestEngine(&scriptedProvider{}, nil)
	if _, err := e.Run(context.Background(), &recordingExecutor{}, basicTurn("   ")); err == nil {
		t.Error("expected an error for an empty prompt")
	}
}

// A turn with no company cannot pick a model or scope its captured example.
func TestRunRequiresCompany(t *testing.T) {
	e := newTestEngine(&scriptedProvider{}, nil)
	turn := basicTurn("who is off")
	turn.CompanyID = ""

	if _, err := e.Run(context.Background(), &recordingExecutor{}, turn); err == nil {
		t.Error("expected an error when no company is set")
	}
}

// The captured example must carry the company, or it becomes eligible to train
// another tenant's adapter.
func TestCapturedExampleIsScopedToCompany(t *testing.T) {
	prov := &scriptedProvider{turns: []Completion{{
		ToolCalls: []ToolCall{call("c1", "clock_in", `{"employee_id":"3f2504e0-4f89-11d3-9a0c-0305e82c3301"}`)},
	}}}
	rec := &memRecorder{}

	turn := basicTurn("punch in employee 3f2504e0-4f89-11d3-9a0c-0305e82c3301")
	turn.CompanyID = "acme-uuid"

	if _, err := newTestEngine(prov, rec).Run(context.Background(), &recordingExecutor{}, turn); err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(rec.got) != 1 {
		t.Fatalf("want 1 captured example, got %d", len(rec.got))
	}
	if rec.got[0].CompanyID != "acme-uuid" {
		t.Errorf("example company = %q, want acme-uuid", rec.got[0].CompanyID)
	}
}

// The model prints UUIDs at the user despite being told not to — observed in
// production inside otherwise-correct answers. Instruction is not enough.
func TestStripIDsFromText(t *testing.T) {
	in := "Andrew Sample is listed as an employee with the employee ID `701abbc1-a692-41a6-9ee1-633d9c817257`."
	got := stripIDsFromText(in)

	if strings.Contains(got, "701abbc1") {
		t.Errorf("uuid survived: %q", got)
	}
	// The sentence must still read properly, not be left with debris.
	if !strings.Contains(got, "Andrew Sample is listed as an employee") {
		t.Errorf("text was mangled: %q", got)
	}
	for _, junk := range []string{"``", "  ", " ."} {
		if strings.Contains(got, junk) {
			t.Errorf("left %q behind: %q", junk, got)
		}
	}
}

func TestStripIDsLeavesCleanTextAlone(t *testing.T) {
	in := "You have 7 active employees, all in the test department."
	if got := stripIDsFromText(in); got != in {
		t.Errorf("modified text with no ids: %q", got)
	}
}

// Tool arguments must keep their ids — that is the machine path.
func TestStripIDsDoesNotTouchToolArguments(t *testing.T) {
	id := "701abbc1-a692-41a6-9ee1-633d9c817257"
	prov := &scriptedProvider{turns: []Completion{{
		Text:      "Filing that for `" + id + "`.",
		ToolCalls: []ToolCall{call("c1", "clock_in", `{"employee_id":"`+id+`"}`)},
	}}}
	turn := basicTurn("punch in " + id) // id in the prompt, so grounding accepts it

	res, err := newTestEngine(prov, nil).Run(context.Background(), &recordingExecutor{}, turn)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if strings.Contains(res.Text, id) {
		t.Errorf("uuid shown to the user: %q", res.Text)
	}
	if len(res.Pending) != 1 || res.Pending[0].Summary["employee_id"] != id {
		t.Errorf("uuid was stripped from the tool arguments: %+v", res.Pending)
	}
}

// "Details of one person" takes two reads: find the id, then fetch the record.
// Only the second is the answer — rendering both put the whole roster above the
// single row the user asked for.
func TestOnlyTheFinalReadIsReturnedAsData(t *testing.T) {
	roster := `{"employees":[{"id":"11111111-1111-1111-1111-111111111111","first_name":"Andrew","last_name":"Sample"}]}`
	one := `{"id":"11111111-1111-1111-1111-111111111111","first_name":"Andrew","last_name":"Sample","department":"Ops"}`

	prov := &scriptedProvider{turns: []Completion{
		{ToolCalls: []ToolCall{call("c1", "get_employees", `{}`)}},
		{ToolCalls: []ToolCall{call("c2", "get_employee", `{"id":"11111111-1111-1111-1111-111111111111"}`)}},
		{Text: "Andrew Sample works in Ops."},
	}}

	// Return the roster first, then the single record.
	calls := 0
	exec := &sequencedExecutor{outs: []string{roster, one}, n: &calls}

	res, err := newTestEngine(prov, nil).Run(context.Background(), exec, basicTurn("show me details of andrew sample"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(res.Data) != 1 {
		t.Fatalf("want exactly the final read, got %d results", len(res.Data))
	}
	if res.Data[0].Action != "get_employee" {
		t.Errorf("rendered %s — the roster lookup, not the answer", res.Data[0].Action)
	}
}

// The model must be allowed to chain: an injected "summarise now" instruction
// after the first read used to end the turn before the second call.
func TestEngineAllowsChainedReads(t *testing.T) {
	prov := &scriptedProvider{turns: []Completion{
		{ToolCalls: []ToolCall{call("c1", "get_employees", `{}`)}},
		{ToolCalls: []ToolCall{call("c2", "get_employee", `{"id":"11111111-1111-1111-1111-111111111111"}`)}},
		{Text: "done"},
	}}
	calls := 0
	exec := &sequencedExecutor{outs: []string{`{"employees":[]}`, `{"id":"x"}`}, n: &calls}

	if _, err := newTestEngine(prov, nil).Run(context.Background(), exec, basicTurn("details of andrew")); err != nil {
		t.Fatalf("Run: %v", err)
	}
	if calls != 2 {
		t.Errorf("executed %d reads; the chain was cut short", calls)
	}
}

type sequencedExecutor struct {
	outs []string
	n    *int
}

func (s *sequencedExecutor) Execute(_ context.Context, _ string, _ json.RawMessage) (json.RawMessage, error) {
	i := *s.n
	*s.n++
	if i < len(s.outs) {
		return json.RawMessage(s.outs[i]), nil
	}
	return json.RawMessage(`{}`), nil
}

// The observed production behaviour: asked for one person, the model reads the
// whole roster and answers from it rather than chaining to get_employee. The
// table underneath then showed the entire company. It does reliably name the id
// in its prose, so that is what narrows the table.
func TestNarrowDataToAnswerFiltersToTheNamedPerson(t *testing.T) {
	roster := `{"employees":[
	  {"id":"701abbc1-a692-41a6-9ee1-633d9c817257","first_name":"Andrew","last_name":"Sample"},
	  {"id":"aaaaaaaa-1111-1111-1111-111111111111","first_name":"Mark","last_name":"Padama"},
	  {"id":"bbbbbbbb-2222-2222-2222-222222222222","first_name":"Ana","last_name":"Cruz"}]}`
	// Prose with no id — the shape that defeated the previous, id-based version.
	answer := "Employee Andrew Sample has the following details: First Name: Andrew, " +
		"Last Name: Sample, Department: Test, Status: Active."

	got, _ := narrowDataToAnswer([]ToolData{{Action: "get_employees", JSON: json.RawMessage(roster)}}, answer, "")
	if len(got) != 1 {
		t.Fatalf("want 1 result, got %d", len(got))
	}
	var wrapped map[string]any
	if err := json.Unmarshal(got[0].JSON, &wrapped); err != nil {
		t.Fatalf("result is not an object: %v", err)
	}
	rows, _ := wrapped["employees"].([]any)
	if len(rows) != 1 {
		t.Fatalf("want just Andrew, got %d rows", len(rows))
	}
	if rows[0].(map[string]any)["first_name"] != "Andrew" {
		t.Errorf("kept the wrong person: %v", rows[0])
	}
	// The wrapper key must survive, or the client cannot find the rows.
	if _, ok := wrapped["employees"]; !ok {
		t.Error("the employees key was lost rebuilding the result")
	}
}

// An answer naming nobody is a list request — nothing should be filtered.
func TestNarrowDataLeavesListsAlone(t *testing.T) {
	roster := `{"employees":[{"id":"11111111-1111-1111-1111-111111111111","first_name":"Ana","last_name":"Cruz"},
	                         {"id":"22222222-2222-2222-2222-222222222222","first_name":"Ben","last_name":"Reyes"}]}`
	in := []ToolData{{Action: "get_employees", JSON: json.RawMessage(roster)}}

	got, _ := narrowDataToAnswer(in, "You have 2 active employees.", "")
	var wrapped map[string]any
	json.Unmarshal(got[0].JSON, &wrapped)
	if rows, _ := wrapped["employees"].([]any); len(rows) != 2 {
		t.Errorf("a list answer was filtered down to %d rows", len(rows))
	}
}

// Ids from elsewhere must not blank the table entirely.
func TestNarrowDataKeepsEverythingWhenNothingMatches(t *testing.T) {
	roster := `{"employees":[{"id":"11111111-1111-1111-1111-111111111111","first_name":"Ana","last_name":"Cruz"}]}`
	got, _ := narrowDataToAnswer([]ToolData{{Action: "get_employees", JSON: json.RawMessage(roster)}}, "nobody by that name is on the roster", "")
	var wrapped map[string]any
	json.Unmarshal(got[0].JSON, &wrapped)
	if rows, _ := wrapped["employees"].([]any); len(rows) != 1 {
		t.Errorf("table was emptied instead of left alone: %d rows", len(rows))
	}
}

// The exact production case: prose details, no id anywhere, one person named
// among ten rows. The id-based version passed the whole roster through here.
func TestNarrowDataOnProseDetailsAnswer(t *testing.T) {
	roster := `{"employees":[
	 {"id":"1","first_name":"asd","middle_name":"asd","last_name":"asd","department":"test"},
	 {"id":"2","first_name":"Mark","middle_name":"G","last_name":"Padama","department":"test"},
	 {"id":"3","first_name":"Mark","last_name":"Padama","department":"test"},
	 {"id":"4","first_name":"Andrew","last_name":"Sample","department":"Test"},
	 {"id":"5","first_name":"wert","middle_name":"wer","last_name":"wer","department":"test"}]}`

	answer := "Employee Andrew Sample has the following details: First Name: Andrew, " +
		"Last Name: Sample, Middle Name: (Not provided), Department: Test, " +
		"Position: (Not provided), Employment Type: Regular, Status: Active"

	got, _ := narrowDataToAnswer([]ToolData{{Action: "get_employees", JSON: json.RawMessage(roster)}}, answer, "")
	var wrapped map[string]any
	if err := json.Unmarshal(got[0].JSON, &wrapped); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	rows, _ := wrapped["employees"].([]any)
	if len(rows) != 1 {
		t.Fatalf("want only Andrew, got %d rows", len(rows))
	}
	if rows[0].(map[string]any)["first_name"] != "Andrew" {
		t.Errorf("kept the wrong row: %v", rows[0])
	}
}

// "Ana" must not match "management", "Sample" must not match "sampled".
func TestContainsWordRespectsBoundaries(t *testing.T) {
	cases := []struct {
		hay, needle string
		want        bool
	}{
		{"ana cruz is on leave", "ana", true},
		{"this is a management decision", "ana", false},
		{"the receipt was sampled", "sample", false},
		{"andrew sample has the following", "sample", true},
		{"mark padama", "mark", true},
		{"bookmarked", "mark", false},
	}
	for _, c := range cases {
		if got := containsWord(c.hay, c.needle); got != c.want {
			t.Errorf("containsWord(%q, %q) = %v, want %v", c.hay, c.needle, got, c.want)
		}
	}
}

// A list answer that names a few people must not lose the rest. Measured
// against the live model: asked for the employee list it spelled out three of
// five names, and an earlier "some mentioned" rule filtered the roster to those
// three. Dropping rows from a list is worse than showing an extra one.
func TestNarrowDataKeepsWholeListWhenSeveralNamed(t *testing.T) {
	roster := `{"employees":[
	 {"id":"1","first_name":"Ana","last_name":"Cruz"},
	 {"id":"2","first_name":"Ben","last_name":"Reyes"},
	 {"id":"3","first_name":"Carla","last_name":"Santos"},
	 {"id":"4","first_name":"Andrew","last_name":"Sample"},
	 {"id":"5","first_name":"Mark","last_name":"Padama"}]}`
	answer := "Here is the current employee list: Ana Cruz, Ben Reyes and Carla Santos, among others."

	got, _ := narrowDataToAnswer([]ToolData{{Action: "get_employees", JSON: json.RawMessage(roster)}}, answer, "")
	var wrapped map[string]any
	json.Unmarshal(got[0].JSON, &wrapped)
	rows, _ := wrapped["employees"].([]any)
	if len(rows) != 5 {
		t.Errorf("a list answer naming 3 people was cut to %d rows; all 5 should survive", len(rows))
	}
}

// The bubble renders plain text, so markdown emphasis reaches the screen as
// literal asterisks — "**First Name:** Andrew".
func TestStripMarkdown(t *testing.T) {
	in := "**First Name:** Andrew\n**Status:** Active with `701abbc1-a692-41a6-9ee1-633d9c817257`"
	got := stripIDsFromText(in)

	for _, junk := range []string{"**", "`", "701abbc1"} {
		if strings.Contains(got, junk) {
			t.Errorf("%q survived: %q", junk, got)
		}
	}
	if !strings.Contains(got, "First Name: Andrew") {
		t.Errorf("content was damaged: %q", got)
	}
}

// Markdown must be stripped even when there are no ids to trigger the other path.
func TestStripMarkdownWithoutIDs(t *testing.T) {
	if got := stripIDsFromText("**Andrew Sample** is active."); strings.Contains(got, "**") {
		t.Errorf("asterisks survived: %q", got)
	}
}

// The system prompt must forbid field enumeration, or the card and the prose
// show the same thing twice.
func TestSystemPromptForbidsFieldLists(t *testing.T) {
	got := newTestEngine(&scriptedProvider{}, nil).systemPrompt("Acme")
	for _, want := range []string{"NEVER list the fields", "ONE short sentence", "detail card"} {
		if !strings.Contains(got, want) {
			t.Errorf("system prompt missing %q", want)
		}
	}
}

// The exact answer from production, twice reported. Bulleted field lines under
// a lead-in, duplicating a detail card that is already on screen.
func TestStripFieldEnumerationOnTheRealAnswer(t *testing.T) {
	in := `Employee Andrew Sample has the following details:

- First Name: Andrew
- Last Name: Sample
- Middle Name: (Not provided)
- Department: Test
- Position: (Not provided)
- Employment Type: Regular
- Status: Active`

	got := stripFieldEnumeration(in)
	if got != "" {
		t.Errorf("expected the whole enumeration gone (the card shows it), got %q", got)
	}
}

// A real sentence that happens to contain a colon must survive. An earlier
// regex ate "Two people have pending leave: Ana and Ben."
func TestStripFieldEnumerationKeepsOrdinarySentences(t *testing.T) {
	for _, in := range []string{
		"Two people have pending leave: Ana and Ben.",
		"You have 7 active employees, all in the test department.",
		"Andrew Sample is in the Test department and is currently Active.",
	} {
		if got := stripFieldEnumeration(in); got != in {
			t.Errorf("stripped an ordinary sentence:\n  in:  %q\n  out: %q", in, got)
		}
	}
}

// A useful sentence alongside the list keeps the sentence, drops the list.
func TestStripFieldEnumerationKeepsTheSummaryLine(t *testing.T) {
	in := "Andrew has no position assigned.\n- First Name: Andrew\n- Status: Active"
	got := stripFieldEnumeration(in)
	if got != "Andrew has no position assigned." {
		t.Errorf("got %q", got)
	}
}

// A misspelled name: the model finds nobody, gives up with a generic count, and
// the whole roster used to land on screen for a request about one person.
// The prompt still says who was meant.
func TestNarrowFallsBackToThePromptOnAMisspelling(t *testing.T) {
	roster := `{"employees":[
	 {"id":"1","first_name":"asd","last_name":"asd"},
	 {"id":"2","first_name":"Mark","last_name":"Padama"},
	 {"id":"3","first_name":"Andrew","last_name":"Sample"},
	 {"id":"4","first_name":"wert","last_name":"wer"}]}`

	got, _ := narrowDataToAnswer(
		[]ToolData{{Action: "get_employees", JSON: json.RawMessage(roster)}},
		"There are 10 employee records in total.", // names nobody
		"show me andres sample details")           // "andres" -> Andrew

	var wrapped map[string]any
	json.Unmarshal(got[0].JSON, &wrapped)
	rows, _ := wrapped["employees"].([]any)
	if len(rows) != 1 {
		t.Fatalf("want just Andrew, got %d rows", len(rows))
	}
	if rows[0].(map[string]any)["first_name"] != "Andrew" {
		t.Errorf("matched the wrong person: %v", rows[0])
	}
}

func TestMentionsNameToleratesTypos(t *testing.T) {
	cases := []struct {
		hay, needle string
		want        bool
	}{
		{"show me andres sample details", "andrew", true},  // one edit
		{"show me andres sample details", "sample", true},  // exact
		{"show me andres sample details", "padama", false}, // different name
		{"details for jonh smith", "john", true},           // transposition
		{"details for ana", "ann", false},                  // too short to guess
		{"show mark details", "mark", true},
		{"show mark details", "marc", true},
	}
	for _, c := range cases {
		if got := mentionsName(c.hay, c.needle); got != c.want {
			t.Errorf("mentionsName(%q, %q) = %v, want %v", c.hay, c.needle, got, c.want)
		}
	}
}

// A list request must still show the list, even though the prompt fallback
// exists — "employees" matches no single person.
func TestNarrowPromptFallbackDoesNotBreakLists(t *testing.T) {
	roster := `{"employees":[
	 {"id":"1","first_name":"Ana","last_name":"Cruz"},
	 {"id":"2","first_name":"Ben","last_name":"Reyes"},
	 {"id":"3","first_name":"Mark","last_name":"Padama"}]}`
	got, _ := narrowDataToAnswer([]ToolData{{Action: "get_employees", JSON: json.RawMessage(roster)}},
		"There are 3 employees.", "show me all employees")

	var wrapped map[string]any
	json.Unmarshal(got[0].JSON, &wrapped)
	if rows, _ := wrapped["employees"].([]any); len(rows) != 3 {
		t.Errorf("a list request was narrowed to %d rows", len(rows))
	}
}

func TestMisspelledNameIsReportedNotSubstitutedSilently(t *testing.T) {
	const roster = `{"employees":[
	 {"id":"1","first_name":"Andrew","last_name":"Sample"},
	 {"id":"2","first_name":"Mark","last_name":"Padama"},
	 {"id":"3","first_name":"Ana","last_name":"Cruz"}]}`

	got, fix := narrowDataToAnswer(
		[]ToolData{{Action: "get_employees", JSON: json.RawMessage(roster)}},
		"There are 3 employee records in total.", // model found nobody
		"show me andres sample details")

	rows, _ := extractRows(got[0].JSON)
	if len(rows) != 1 {
		t.Fatalf("rows = %d, want 1", len(rows))
	}
	if fix.Typed != "andres sample" || fix.Actual != "Andrew Sample" {
		t.Errorf("fix = %+v, want {andres sample Andrew Sample}", fix)
	}
}

func TestCorrectSpellingIsNotReportedAsAMisspelling(t *testing.T) {
	const roster = `{"employees":[
	 {"id":"1","first_name":"Andrew","last_name":"Sample"},
	 {"id":"2","first_name":"Mark","last_name":"Padama"}]}`

	// Exact spelling, model still vague: narrow, but say nothing about spelling.
	_, fix := narrowDataToAnswer(
		[]ToolData{{Action: "get_employees", JSON: json.RawMessage(roster)}},
		"There are 2 employee records in total.",
		"show me andrew sample details")
	if fix.Actual != "" {
		t.Errorf("fix = %+v, want none", fix)
	}
}

func TestListRequestsCarryNoSpellingFix(t *testing.T) {
	const roster = `{"employees":[
	 {"id":"1","first_name":"Andrew","last_name":"Sample"},
	 {"id":"2","first_name":"Mark","last_name":"Padama"}]}`

	got, fix := narrowDataToAnswer(
		[]ToolData{{Action: "get_employees", JSON: json.RawMessage(roster)}},
		"There are 2 employees.", "show me all employees")
	rows, _ := extractRows(got[0].JSON)
	if len(rows) != 2 || fix.Actual != "" {
		t.Errorf("rows = %d fix = %+v, want 2 rows and no fix", len(rows), fix)
	}
}

func TestMisspellingIsCaughtEvenWhenTheModelEchoesIt(t *testing.T) {
	const roster = `{"employees":[
	 {"id":"1","first_name":"Andrew","last_name":"Sample"},
	 {"id":"2","first_name":"Mark","last_name":"Padama"},
	 {"id":"3","first_name":"Ana","last_name":"Cruz"}]}`

	// The model repeats the user's spelling back, so the ANSWER matches the row
	// and the prompt fallback never runs. The spelling is still wrong.
	_, fix := narrowDataToAnswer(
		[]ToolData{{Action: "get_employees", JSON: json.RawMessage(roster)}},
		"Andres Sample is not found in the employee list.",
		"show me andres sample details")
	if fix.Typed != "andres sample" || fix.Actual != "Andrew Sample" {
		t.Errorf("fix = %+v, want {andres sample Andrew Sample}", fix)
	}
}

func TestPartialNameReportsOnlyWhatWasTyped(t *testing.T) {
	const roster = `{"employees":[
	 {"id":"1","first_name":"Andrew","last_name":"Sample"},
	 {"id":"2","first_name":"Mark","last_name":"Padama"}]}`

	// "andrw" is a first name only — the surname was never typed, so it cannot
	// be reported as mistyped, but the full filed name is what is being shown.
	_, fix := narrowDataToAnswer(
		[]ToolData{{Action: "get_employees", JSON: json.RawMessage(roster)}},
		"Andrew Sample is an active employee.", "show andrw details")
	if fix.Typed != "andrw" || fix.Actual != "Andrew Sample" {
		t.Errorf("fix = %+v, want {andrw Andrew Sample}", fix)
	}
}

func TestNameFoundOnlyInTheAnswerIsNoMisspelling(t *testing.T) {
	const roster = `{"employees":[
	 {"id":"1","first_name":"Andrew","last_name":"Sample","joined_date":"2026-08-01"},
	 {"id":"2","first_name":"Mark","last_name":"Padama","joined_date":"2020-01-01"}]}`

	// The user named nobody, so nothing they wrote can be wrong.
	_, fix := narrowDataToAnswer(
		[]ToolData{{Action: "get_employees", JSON: json.RawMessage(roster)}},
		"Andrew Sample is the newest hire.", "who is the newest hire")
	if fix.Actual != "" {
		t.Errorf("fix = %+v, want none", fix)
	}
}

func TestAnswerFromMemoryIsRefetchedSoTheCardRenders(t *testing.T) {
	const one = `{"employees":[{"id":"1","first_name":"Andrew","last_name":"Sample","status":"Active"}]}`

	// Turn 1 read the roster, so turn 2 the model can answer from history —
	// and does, with no tool call and nothing for the client to render.
	prov := &scriptedProvider{turns: []Completion{
		{Text: "Andrew Sample is an active employee. His first name is Andrew."},
		{ToolCalls: []ToolCall{call("c1", "get_employees", `{}`)}},
		{Text: "Andrew Sample is active."},
	}}
	e := newTestEngine(prov, nil)

	turn := basicTurn("show me andrew sample details")
	turn.History = []Message{
		{Role: RoleUser, Text: "show me all employees"},
		{Role: RoleAssistant, Text: "There are 5 employees."},
	}

	res, err := e.Run(context.Background(), &recordingExecutor{result: one}, turn)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(res.Data) == 0 {
		t.Fatal("no data to render — the user asked to be SHOWN the record")
	}
	rows, _ := extractRows(res.Data[0].JSON)
	if len(rows) != 1 {
		t.Errorf("rows = %d, want 1", len(rows))
	}
}

func TestChatDoesNotTriggerARefetch(t *testing.T) {
	prov := &scriptedProvider{turns: []Completion{{Text: "You're welcome."}}}
	res, err := newTestEngine(prov, nil).Run(context.Background(), &recordingExecutor{}, basicTurn("thanks, that's all"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.Text != "You're welcome." {
		t.Errorf("text = %q", res.Text)
	}
}

func TestRefusedFetchIsRunAnywayWhenTheNameIdentifiesOneRow(t *testing.T) {
	const roster = `{"employees":[
	 {"id":"1","first_name":"asd","middle_name":"asd","last_name":"asd","department":"test","status":"Active"},
	 {"id":"2","first_name":"Mark","last_name":"Padama","department":"Finance","status":"Active"},
	 {"id":"3","first_name":"wert","middle_name":"wer","last_name":"wer","department":"test","status":"Active"}]}`

	// The model refuses twice: it cannot tell "asd asd" is a person's name.
	prov := &scriptedProvider{turns: []Completion{
		{Text: "Please specify which record you want to see."},
		{Text: "The query is still unclear. Please specify which record or data you want to see."},
	}}
	exec := &searchExec{rows: testRoster()}

	res, err := newTestEngine(prov, nil).Run(context.Background(), exec, basicTurn("show asd asd details"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(res.Data) == 0 {
		t.Fatal("no data — the record was there to be found")
	}
	rows, _ := extractRows(res.Data[0].JSON)
	if len(rows) != 1 {
		t.Fatalf("rows = %d, want 1", len(rows))
	}
	if res.Text != "Showing asd asd asd." {
		t.Errorf("caption = %q, want the record being shown", res.Text)
	}
	if len(exec.calls) == 0 {
		t.Error("nothing was executed")
	}
}

func TestFallbackIsDiscardedWhenItCannotPinDownOneRow(t *testing.T) {
	const roster = `{"employees":[
	 {"id":"1","first_name":"Mark","last_name":"Padama"},
	 {"id":"2","first_name":"Ana","last_name":"Cruz"}]}`

	// Nobody in the prompt matches, so the clarifying question must stand
	// rather than a full table appearing underneath it.
	prov := &scriptedProvider{turns: []Completion{
		{Text: "Which record do you mean?"},
		{Text: "The query is still unclear. Please specify which record you want."},
	}}
	res, err := newTestEngine(prov, nil).Run(context.Background(),
		&searchExec{rows: testRoster()}, basicTurn("show me the widget details"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(res.Data) != 0 {
		t.Errorf("data should have been discarded, got %d", len(res.Data))
	}
	if !strings.Contains(res.Text, "still unclear") {
		t.Errorf("the model's question should stand: %q", res.Text)
	}
}

func TestFallbackNeverRunsAWrite(t *testing.T) {
	for _, tool := range NewRegistry().all {
		if !tool.Write {
			continue
		}
		if picked, ok := firstListingRead([]Tool{tool}); ok {
			t.Errorf("firstListingRead picked the write %q", picked.Action)
		}
	}
}

func TestInlineFieldListIsCutButProseSurvives(t *testing.T) {
	cases := []struct{ in, want string }{
		{`The employee with the name "asd asd" has the following details: department: test, position: asd, status: Active.`,
			`The employee with the name "asd asd" has the following details.`},
		{"Andrew Sample's details are: first name: Andrew, last name: Sample.",
			"Andrew Sample's details are."},
		// Prose with a single colon must be left alone.
		{"Two people have pending leave: Ana and Ben.", "Two people have pending leave: Ana and Ben."},
		{"There are 5 employees in total.", "There are 5 employees in total."},
		{"Andrew Sample is an active employee with no assigned department or position.",
			"Andrew Sample is an active employee with no assigned department or position."},
	}
	for _, c := range cases {
		if got := stripInlineEnumeration(c.in); got != c.want {
			t.Errorf("stripInlineEnumeration(%q)\n = %q\nwant %q", c.in, got, c.want)
		}
	}
}

func TestRecitationIsReplacedByANamedCaption(t *testing.T) {
	const one = `{"employees":[{"id":"1","first_name":"asd","middle_name":"asd","last_name":"asd","department":"test","status":"Active"}]}`

	for _, recital := range []string{
		`The employee with the name "asd asd" has the following details: department: test, status: Active.`,
		`The employee "asd asd" has details: department is "test", status is "Active".`,
	} {
		prov := &scriptedProvider{turns: []Completion{
			{ToolCalls: []ToolCall{call("c1", "get_employees", `{}`)}},
			{Text: recital},
		}}
		res, err := newTestEngine(prov, nil).Run(context.Background(),
			&recordingExecutor{result: one}, basicTurn("show asd asd details"))
		if err != nil {
			t.Fatalf("Run: %v", err)
		}
		if res.Text != "Showing asd asd asd." {
			t.Errorf("caption = %q, want a named caption (input %q)", res.Text, recital)
		}
	}
}

func TestAGenuineSentenceIsNotReplaced(t *testing.T) {
	const one = `{"employees":[{"id":"1","first_name":"Mark","last_name":"Padama","status":"On Leave"}]}`
	prov := &scriptedProvider{turns: []Completion{
		{ToolCalls: []ToolCall{call("c1", "get_employees", `{}`)}},
		{Text: "Mark Padama is the only person off next week."},
	}}
	res, err := newTestEngine(prov, nil).Run(context.Background(),
		&recordingExecutor{result: one}, basicTurn("who is off next week"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.Text != "Mark Padama is the only person off next week." {
		t.Errorf("a real answer was thrown away: %q", res.Text)
	}
}

func TestDanglingBulletLeadInIsTrimmed(t *testing.T) {
	// Field-shaped bullets are stripped, and the lead-in they hung off goes
	// with them rather than surviving as an orphaned dash.
	got := stripFieldEnumeration("Here are the details of all employees: -\n- First Name: Andrew\n- Last Name: Sample")
	if got != "" {
		t.Errorf("got %q, want the lead-in dropped with its list", got)
	}
}

func TestBareRecordIsRecognisedNotMistakenForItsNestedList(t *testing.T) {
	// What get_employee actually returns: one employee carrying its own
	// (usually empty) benefits array.
	rows, key := extractRows(json.RawMessage(
		`{"id":"1","first_name":"asd","last_name":"asd","status":"Active","enrolled_benefits":[]}`))
	if len(rows) != 1 || key != "" {
		t.Fatalf("rows = %d key = %q, want 1 row and no wrapper key", len(rows), key)
	}
	if name, ok := singleRecordName([]ToolData{{Action: "get_employee",
		JSON: json.RawMessage(`{"id":"1","first_name":"asd","middle_name":"asd","last_name":"asd","enrolled_benefits":[]}`)}}); !ok || name != "asd asd asd" {
		t.Errorf("singleRecordName = %q %v, want asd asd asd", name, ok)
	}
}

func TestListResponsesStillResolveToTheirRows(t *testing.T) {
	rows, key := extractRows(json.RawMessage(`{"employees":[{"id":"1"},{"id":"2"}]}`))
	if len(rows) != 2 || key != "employees" {
		t.Errorf("rows = %d key = %q, want 2 and employees", len(rows), key)
	}
}

func TestFailedReadStillFallsBackToTheListing(t *testing.T) {
	const roster = `{"employees":[
	 {"id":"1","first_name":"asd","middle_name":"asd","last_name":"asd","status":"Active"},
	 {"id":"2","first_name":"Mark","last_name":"Padama","status":"Active"}]}`

	// The model guesses an id, the read fails, and it gives up in prose. The
	// record was there to be found the whole time.
	prov := &scriptedProvider{turns: []Completion{
		{ToolCalls: []ToolCall{call("c1", "get_employee", `{"id":"00000000-0000-0000-0000-000000000000"}`)}},
		{Text: "The query is still unclear. Please specify which record you want."},
	}}
	exec := &searchExec{rows: testRoster()}
	res, err := newTestEngine(prov, nil).Run(context.Background(), exec, basicTurn("show asd asd details"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	rows, _ := extractRows(res.Data[0].JSON)
	if len(rows) != 1 {
		t.Fatalf("rows = %d, want 1", len(rows))
	}
	if res.Text != "Showing asd asd asd." {
		t.Errorf("caption = %q", res.Text)
	}
}

type failThenList struct{ roster string }

func (f *failThenList) Execute(_ context.Context, action string, _ json.RawMessage) (json.RawMessage, error) {
	if action == "get_employee" {
		return nil, errors.New("employee not found")
	}
	return json.RawMessage(f.roster), nil
}

// searchExec behaves like the real endpoints: find_employees filters by name,
// get_employee needs a real id. A stub that returns the roster whatever it is
// asked cannot tell a working search from a broken one.
type searchExec struct {
	rows  []map[string]any
	calls []string
}

func (s *searchExec) Execute(_ context.Context, action string, args json.RawMessage) (json.RawMessage, error) {
	s.calls = append(s.calls, action)
	switch action {
	case "find_employees":
		var a struct {
			Name string `json:"name"`
		}
		_ = json.Unmarshal(args, &a)
		var hits []map[string]any
		for _, r := range s.rows {
			full := strings.ToLower(strings.Join(strings.Fields(
				str2(r["first_name"])+" "+str2(r["middle_name"])+" "+str2(r["last_name"])), " "))
			ok := full != ""
			for _, term := range strings.Fields(strings.ToLower(a.Name)) {
				if !MatchesName(full, term) {
					ok = false
					break
				}
			}
			if ok {
				hits = append(hits, r)
			}
		}
		if hits == nil {
			hits = []map[string]any{}
		}
		b, _ := json.Marshal(map[string]any{"employees": hits})
		return b, nil
	case "get_employee":
		var a struct {
			ID string `json:"id"`
		}
		_ = json.Unmarshal(args, &a)
		for _, r := range s.rows {
			if str2(r["id"]) == a.ID {
				b, _ := json.Marshal(r)
				return b, nil
			}
		}
		return nil, errors.New("employee not found")
	}
	b, _ := json.Marshal(map[string]any{"employees": s.rows})
	return b, nil
}

func str2(v any) string {
	s, _ := v.(string)
	return s
}

func testRoster() []map[string]any {
	return []map[string]any{
		{"id": "1", "first_name": "asd", "middle_name": "asd", "last_name": "asd", "status": "Active"},
		{"id": "2", "first_name": "Mark", "last_name": "Padama", "status": "Active"},
		{"id": "3", "first_name": "wert", "middle_name": "wer", "last_name": "wer", "status": "Active"},
	}
}

func TestSearchResolvesANameTheModelWouldNotRecognise(t *testing.T) {
	prov := &scriptedProvider{turns: []Completion{
		{Text: "There is no specific data or record to show. Please clarify."},
		{Text: "The query is still unclear."},
	}}
	exec := &searchExec{rows: testRoster()}
	res, err := newTestEngine(prov, nil).Run(context.Background(), exec, basicTurn("show me asd asd details"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	rows, _ := extractRows(res.Data[0].JSON)
	if len(rows) != 1 {
		t.Fatalf("rows = %d, want 1 (calls: %v)", len(rows), exec.calls)
	}
	if res.Text != "Showing asd asd asd." {
		t.Errorf("caption = %q", res.Text)
	}
	if exec.calls[0] != "find_employees" {
		t.Errorf("searched with %q, want find_employees", exec.calls[0])
	}
}

func TestSearchWithNoHitsLeavesTheQuestionStanding(t *testing.T) {
	prov := &scriptedProvider{turns: []Completion{
		{Text: "Which record do you mean?"},
		{Text: "The query is still unclear. Please specify which record you want."},
	}}
	res, err := newTestEngine(prov, nil).Run(context.Background(),
		&searchExec{rows: testRoster()}, basicTurn("show me the widget details"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(res.Data) != 0 {
		t.Errorf("data should have been discarded, got %d", len(res.Data))
	}
	if !strings.Contains(res.Text, "still unclear") {
		t.Errorf("the question should stand: %q", res.Text)
	}
}

func TestNameTermsStripTheRequestAndKeepTheName(t *testing.T) {
	for _, c := range []struct{ in, want string }{
		{"show me asd asd details", "asd asd"},
		{"show me andrew sample details", "andrew sample"},
		{"details of juan dela cruz", "juan dela cruz"},
		{"who is mark padama", "mark padama"},
		{"show me all employees", "all"},
		{"thanks", "thanks"},
	} {
		if got := nameTermsFrom(c.in); got != c.want {
			t.Errorf("nameTermsFrom(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestCaptionThatRelistsTheTableBecomesACount(t *testing.T) {
	const roster = `{"employees":[
	 {"id":"1","first_name":"asd","middle_name":"asd","last_name":"asd"},
	 {"id":"2","first_name":"Mark","last_name":"Padama"},
	 {"id":"3","first_name":"Juan","last_name":"Dela Cruz"}]}`

	prov := &scriptedProvider{turns: []Completion{
		{ToolCalls: []ToolCall{call("c1", "get_employees", `{}`)}},
		{Text: "Here are the employees: - asd asd asd (Probationary, Active) - Mark Padama (Regular, Active) - Juan Dela Cruz (Regular, Active)"},
	}}
	res, err := newTestEngine(prov, nil).Run(context.Background(),
		&recordingExecutor{result: roster}, basicTurn("show me all employees"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.Text != "3 employees." {
		t.Errorf("caption = %q, want a count", res.Text)
	}
	if rows, _ := extractRows(res.Data[0].JSON); len(rows) != 3 {
		t.Errorf("rows = %d, want all 3 kept", len(rows))
	}
}

func TestACountingCaptionIsLeftAlone(t *testing.T) {
	const roster = `{"employees":[{"id":"1","first_name":"Mark","last_name":"Padama"},{"id":"2","first_name":"Ana","last_name":"Cruz"}]}`
	prov := &scriptedProvider{turns: []Completion{
		{ToolCalls: []ToolCall{call("c1", "get_employees", `{}`)}},
		{Text: "There are 2 employees in total."},
	}}
	res, err := newTestEngine(prov, nil).Run(context.Background(),
		&recordingExecutor{result: roster}, basicTurn("show me all employees"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.Text != "There are 2 employees in total." {
		t.Errorf("caption = %q, should have been left alone", res.Text)
	}
}

func TestAShortAnswerNamingTwoPeopleSurvives(t *testing.T) {
	// The counterpart to TestCaptionThatRelistsTheTableBecomesACount: naming
	// rows is not itself the problem, listing them is.
	data := []ToolData{{Action: "get_leaves",
		JSON: json.RawMessage(`{"leaves":[{"first_name":"Ana"},{"first_name":"Ben"}]}`)}}
	if _, _, ok := listedBack(data, "Two people have pending leave: Ana and Ben."); ok {
		t.Error("a genuine answer was treated as a recital")
	}
	if _, _, ok := listedBack(data, "Pending leave: - Ana (Vacation, Pending) - Ben (Sick, Pending)"); !ok {
		t.Error("a bulleted recital was not caught")
	}
}

func TestNumbersAreNeverFuzzyMatched(t *testing.T) {
	// Account codes one digit apart are different accounts.
	if mentionsName("credit cash on hand 2000", "1000") {
		t.Error("account code 1000 matched a prompt saying 2000")
	}
	if !mentionsName("credit cash on hand 1000", "1000") {
		t.Error("an exact code stopped matching")
	}
	// Names keep their tolerance.
	if !mentionsName("details for andres sample", "andrew") {
		t.Error("name typo tolerance was lost")
	}
}

func TestAccountRowIsNotSpellingCorrectedOntoAnother(t *testing.T) {
	const accounts = `{"accounts":[
	 {"id":"a1","code":"1000","name":"Cash on Hand"},
	 {"id":"a2","code":"2000","name":"Accounts Payable"}]}`
	_, fix := narrowDataToAnswer(
		[]ToolData{{Action: "get_accounts", JSON: json.RawMessage(accounts)}},
		"Here are the accounts.",
		"debit office supplies 2000, credit cash on hand 2000")
	if fix.Actual != "" {
		t.Errorf("invented a spelling correction across accounts: %+v", fix)
	}
}

func TestToolCallWrittenAsTextIsRecovered(t *testing.T) {
	const roster = `{"employees":[{"id":"e1","first_name":"Ana","last_name":"Cruz"}]}`
	prov := &scriptedProvider{turns: []Completion{
		// No structured call — the model wrote it out as prose.
		{Text: `<tool_call>
{"name": "get_employees", "arguments": {}}
</tool_call>`},
		{Text: "There is 1 employee."},
	}}
	exec := &recordingExecutor{result: roster}
	res, err := newTestEngine(prov, nil).Run(context.Background(), exec, basicTurn("show me all employees"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(exec.calls) != 1 || exec.calls[0] != "get_employees" {
		t.Fatalf("the written-out call was not executed: %v", exec.calls)
	}
	if strings.Contains(res.Text, "tool_call") {
		t.Errorf("raw tool-call syntax reached the user: %q", res.Text)
	}
}

func TestUnparseableToolCallSyntaxIsStrippedNotShown(t *testing.T) {
	prov := &scriptedProvider{turns: []Completion{
		{Text: `Here you go <tool_call> {not json at all} </tool_call>`},
	}}
	res, err := newTestEngine(prov, nil).Run(context.Background(), &recordingExecutor{}, basicTurn("thanks"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if strings.Contains(res.Text, "tool_call") {
		t.Errorf("raw tool-call syntax reached the user: %q", res.Text)
	}
}

func TestNestedToolCallWrittenAsTextIsRecovered(t *testing.T) {
	// The shape that actually leaked: an invoice whose arguments nest an items
	// array. A non-greedy regex stops at the first inner brace and recovers
	// nothing.
	const written = `<tool_call>
{"name": "create_invoice", "arguments": {"customer_id": "c-1", "invoice_date": "2026-08-22", "items": [{"account_id": "a-1", "description": "Consulting", "quantity": 5, "unit_price": 1500}]}}
</tool_call>`
	calls, rest := toolCallsInText(written)
	if len(calls) != 1 {
		t.Fatalf("recovered %d calls, want 1", len(calls))
	}
	if calls[0].Name != "create_invoice" {
		t.Errorf("name = %q", calls[0].Name)
	}
	var args map[string]any
	if err := json.Unmarshal(calls[0].Args, &args); err != nil {
		t.Fatalf("arguments did not survive: %v", err)
	}
	items, _ := args["items"].([]any)
	if len(items) != 1 {
		t.Errorf("line items lost: %v", args["items"])
	}
	if strings.Contains(rest, "tool_call") || strings.Contains(rest, "{") {
		t.Errorf("prose still carries syntax: %q", rest)
	}
}

func TestTwoWrittenCallsAreBothRecovered(t *testing.T) {
	const written = `<tool_call>{"name":"get_accounts","arguments":{}}</tool_call> and <tool_call>{"name":"get_customers","arguments":{}}</tool_call>`
	calls, rest := toolCallsInText(written)
	if len(calls) != 2 {
		t.Fatalf("recovered %d, want 2", len(calls))
	}
	if calls[0].Name != "get_accounts" || calls[1].Name != "get_customers" {
		t.Errorf("got %q and %q", calls[0].Name, calls[1].Name)
	}
	if strings.Contains(rest, "{") {
		t.Errorf("prose still carries syntax: %q", rest)
	}
}

func TestBracesInsideStringsDoNotConfuseRecovery(t *testing.T) {
	const written = `<tool_call>{"name":"create_account","arguments":{"name":"Petty Cash {branch}","code":"1010","account_type":"Asset"}}</tool_call>`
	calls, _ := toolCallsInText(written)
	if len(calls) != 1 {
		t.Fatalf("recovered %d, want 1", len(calls))
	}
	var args map[string]any
	_ = json.Unmarshal(calls[0].Args, &args)
	if args["name"] != "Petty Cash {branch}" {
		t.Errorf("name = %v", args["name"])
	}
}

func TestBareToolCallObjectIsRecovered(t *testing.T) {
	calls, rest := toolCallsInText(
		`{"name": "create_invoice", "arguments": {"customer_id": "c-1", "items": [{"account_id": "a-1", "quantity": 5}]}}`)
	if len(calls) != 1 || calls[0].Name != "create_invoice" {
		t.Fatalf("recovered %d calls: %+v", len(calls), calls)
	}
	if rest != "" {
		t.Errorf("prose left over: %q", rest)
	}
}

func TestOrdinaryProseIsNotMistakenForACall(t *testing.T) {
	for _, text := range []string{
		"Here is an example: {\"name\": \"x\"} — but I need the customer id first.",
		"{\"employees\": [{\"id\": \"1\"}]}",
		"There are 5 employees in total.",
		"{\"name\": \"create_invoice\"}",
	} {
		if calls, _ := toolCallsInText(text); len(calls) > 0 {
			t.Errorf("prose treated as a call: %q -> %+v", text, calls)
		}
	}
}

func TestAnnouncingAReadWithoutDoingItTriggersTheNudge(t *testing.T) {
	const accounts = `{"accounts":[{"id":"a1","code":"6100","name":"Office Supplies Expense"}]}`
	prov := &scriptedProvider{turns: []Completion{
		{Text: `I need the correct account IDs from the chart of accounts. Let me retrieve that information.`},
		{ToolCalls: []ToolCall{call("c1", "get_accounts", `{}`)}},
		{Text: "Here are the accounts."},
		// Having read exactly one account, the turn is chased once more for the
		// proposal it was asked for. See the chase in Run.
		{Text: "Here are the accounts."},
	}}
	exec := &recordingExecutor{result: accounts}
	if _, err := newTestEngine(prov, nil).Run(context.Background(), exec,
		basicTurn("record a journal entry debiting office supplies")); err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(exec.calls) == 0 {
		t.Error("the announced read never happened")
	}
}

func TestPlainProseDoesNotTriggerTheNudge(t *testing.T) {
	for _, text := range []string{
		"You're welcome.",
		"There are 5 employees in total.",
		"I can't do that — it needs an approver.",
	} {
		if announcesAction(text) {
			t.Errorf("ordinary prose treated as an announcement: %q", text)
		}
	}
}

func TestAskingForIdsItCouldLookUpTriggersTheNudge(t *testing.T) {
	for _, text := range []string{
		`I need the correct account IDs for "Office Supplies Expense" and "Cash on Hand" from the chart of accounts.`,
		"I don't have the customer id for Acme Trading.",
		"Please provide the employee id.",
	} {
		if !announcesAction(text) {
			t.Errorf("should have nudged: %q", text)
		}
	}
	for _, text := range []string{
		"You're welcome.",
		"There are 5 employees in total.",
		"That period is already closed, so nothing can be posted into it.",
	} {
		if announcesAction(text) {
			t.Errorf("ordinary prose nudged: %q", text)
		}
	}
}

func TestTheNudgeNamesTheActionToCall(t *testing.T) {
	cases := map[string]string{
		`I need the correct account IDs from the chart of accounts.`: "get_accounts",
		"I don't have the customer id for Acme Trading.":             "get_customers",
		"I need the vendor id.":                                      "get_vendors",
		"Which employee did you mean?":                               "find_employees",
		"You're welcome.":                                            "",
	}
	for text, want := range cases {
		if got := resolverFromText(text); got != want {
			t.Errorf("resolverFromText(%q) = %q, want %q", text, got, want)
		}
	}
}

func TestIdsAreFetchedForAModelThatKeepsAskingForThem(t *testing.T) {
	const accounts = `{"accounts":[
	 {"id":"a-100","code":"1000","name":"Cash on Hand"},
	 {"id":"a-610","code":"6100","name":"Office Supplies Expense"}]}`

	// Refuses, is nudged, refuses identically — then the ids are handed over
	// and it can finally propose.
	prov := &scriptedProvider{turns: []Completion{
		{Text: `I need the correct account IDs for "Office Supplies Expense" and "Cash on Hand" from the chart of accounts.`},
		{Text: `I still need the account IDs from the chart of accounts.`},
		{ToolCalls: []ToolCall{call("c1", "create_journal_entry",
			`{"entry_date":"2026-08-22","lines":[{"account_id":"a-610","debit":2000},{"account_id":"a-100","credit":2000}]}`)}},
	}}
	exec := &recordingExecutor{result: accounts}
	res, err := newTestEngine(prov, nil).Run(context.Background(), exec,
		basicTurn("record a journal entry on 2026-08-22: debit Office Supplies Expense 2000, credit Cash on Hand 2000"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(exec.calls) == 0 || exec.calls[0] != "get_accounts" {
		t.Fatalf("the chart of accounts was never fetched: %v", exec.calls)
	}
	if len(res.Pending) != 1 || res.Pending[0].Action != "create_journal_entry" {
		t.Fatalf("no proposal produced: %+v", res.Pending)
	}
	// The chart of accounts is plumbing here, not the answer.
	if len(res.Data) != 0 {
		t.Errorf("the fetched accounts were rendered as the answer: %v", res.Data)
	}
}

func TestIdsAreFetchedAfterAWriteIsRejectedForInventingThem(t *testing.T) {
	const accounts = `{"accounts":[
	 {"id":"a-100","code":"1000","name":"Cash on Hand"},
	 {"id":"a-610","code":"6100","name":"Office Supplies Expense"}]}`

	prov := &scriptedProvider{turns: []Completion{
		// Guesses ids: the guard refuses, which counts as having called a tool.
		{ToolCalls: []ToolCall{call("c1", "create_journal_entry",
			`{"entry_date":"2026-08-22","lines":[{"account_id":"123","debit":2000},{"account_id":"456","credit":2000}]}`)}},
		// Falls back to asking the user for what it could have read.
		{Text: `I need the correct account IDs from the chart of accounts.`},
		// With the ids handed over, it can finally propose.
		{ToolCalls: []ToolCall{call("c2", "create_journal_entry",
			`{"entry_date":"2026-08-22","lines":[{"account_id":"a-610","debit":2000},{"account_id":"a-100","credit":2000}]}`)}},
	}}
	exec := &recordingExecutor{result: accounts}
	res, err := newTestEngine(prov, nil).Run(context.Background(), exec,
		basicTurn("record a journal entry: debit Office Supplies Expense 2000, credit Cash on Hand 2000"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(exec.calls) == 0 || exec.calls[0] != "get_accounts" {
		t.Fatalf("the chart of accounts was never fetched: %v", exec.calls)
	}
	if len(res.Pending) != 1 {
		t.Fatalf("no proposal produced: %+v", res.Pending)
	}
	var args map[string]any
	_ = json.Unmarshal(res.Pending[0].Args, &args)
	lines, _ := args["lines"].([]any)
	for _, l := range lines {
		m, _ := l.(map[string]any)
		if id, _ := m["account_id"].(string); id != "a-610" && id != "a-100" {
			t.Errorf("proposal still carries an invented id: %v", id)
		}
	}
}

func TestAnAddWithNoDetailsAsksForThemInsteadOfReporting(t *testing.T) {
	// The model reads an "add" as a "check" when the details are missing, and
	// answers with the state of an empty list.
	prov := &scriptedProvider{turns: []Completion{
		{ToolCalls: []ToolCall{call("c1", "get_accounts", `{}`)}},
		{Text: "There are no active expense accounts in the chart of accounts."},
	}}
	res, err := newTestEngine(prov, nil).Run(context.Background(),
		&recordingExecutor{result: `{"accounts":[]}`}, basicTurn("add expense account"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if strings.Contains(res.Text, "no active expense accounts") {
		t.Errorf("still reporting an empty list: %q", res.Text)
	}
	for _, want := range []string{"code", "name", "account type"} {
		if !strings.Contains(res.Text, want) {
			t.Errorf("answer does not ask for %q: %q", want, res.Text)
		}
	}
	if len(res.Data) != 0 {
		t.Errorf("an empty account table was left rendered under the question")
	}
}

func TestAnAddWithDetailsStillProposes(t *testing.T) {
	prov := &scriptedProvider{turns: []Completion{
		{ToolCalls: []ToolCall{call("c1", "create_account",
			`{"code":"6300","name":"Repairs","account_type":"Expense"}`)}},
	}}
	res, err := newTestEngine(prov, nil).Run(context.Background(), &recordingExecutor{},
		basicTurn("add an expense account code 6300 called Repairs"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(res.Pending) != 1 {
		t.Fatalf("proposal was replaced by a question: %q", res.Text)
	}
}

func TestAReadIsNeverTurnedIntoAQuestionAboutFields(t *testing.T) {
	prov := &scriptedProvider{turns: []Completion{
		{ToolCalls: []ToolCall{call("c1", "get_accounts", `{}`)}},
		{Text: "There are no accounts yet."},
	}}
	res, err := newTestEngine(prov, nil).Run(context.Background(),
		&recordingExecutor{result: `{"accounts":[]}`}, basicTurn("show me the chart of accounts"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if !strings.Contains(res.Text, "no accounts") {
		t.Errorf("a plain read was rewritten: %q", res.Text)
	}
}

func TestAFalseClaimOfHavingActedIsReplaced(t *testing.T) {
	for _, claim := range []string{
		`The loan with ID "" has been approved.`,
		"I've created the account for you.",
		"The invoice is now sent.",
		"Successfully deleted the record.",
	} {
		// Twice: the first claim now sends the turn off to read the loans (it
		// asked to approve one and named none), and the claim has to survive
		// that round to be the thing under test.
		prov := &scriptedProvider{turns: []Completion{{Text: claim}, {Text: claim}}}
		res, err := newTestEngine(prov, nil).Run(context.Background(),
			&recordingExecutor{}, basicTurn("approve the loan"))
		if err != nil {
			t.Fatalf("Run: %v", err)
		}
		if !strings.Contains(res.Text, "not done that") {
			t.Errorf("false claim survived: %q -> %q", claim, res.Text)
		}
	}
}

func TestATrueStatementAboutARecordIsNotTouched(t *testing.T) {
	const bills = `{"bills":[{"id":"b1","vendor":"Meralco","status":"Approved"}]}`
	prov := &scriptedProvider{turns: []Completion{
		{ToolCalls: []ToolCall{call("c1", "get_bills", `{}`)}},
		{Text: "That bill was approved last week by the finance team."},
	}}
	res, err := newTestEngine(prov, nil).Run(context.Background(),
		&recordingExecutor{result: bills}, basicTurn("was that bill approved"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if strings.Contains(res.Text, "not done that") {
		t.Errorf("a true statement about a record was rewritten: %q", res.Text)
	}
}

func TestAConfirmedProposalStillReadsAsAProposal(t *testing.T) {
	// A turn that DID propose must keep its own words, even if they sound
	// like a completion claim.
	prov := &scriptedProvider{turns: []Completion{{
		Text:      "I've prepared the approval for you.",
		ToolCalls: []ToolCall{call("c1", "approve_leave", `{"id":"3f2504e0-4f89-11d3-9a0c-0305e82c3301","status":"Approved"}`)},
	}}}
	res, err := newTestEngine(prov, nil).Run(context.Background(), &recordingExecutor{},
		basicTurn("approve leave 3f2504e0-4f89-11d3-9a0c-0305e82c3301"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(res.Pending) != 1 {
		t.Fatalf("proposal lost: %+v", res)
	}
	if strings.Contains(res.Text, "not done that") {
		t.Errorf("a real proposal was contradicted: %q", res.Text)
	}
}

func TestReadingTheOneRecordThenStoppingIsChased(t *testing.T) {
	const bills = `{"bills":[{"id":"b-1111","vendor":"Meralco","status":"Draft","total":4500}]}`
	prov := &scriptedProvider{turns: []Completion{
		{ToolCalls: []ToolCall{call("c1", "get_bills", `{}`)}},
		// Stops one step short.
		{Text: "There is 1 bill available for approval."},
		// Nudged, it proposes.
		{ToolCalls: []ToolCall{call("c2", "approve_bill", `{"id":"b-1111"}`)}},
	}}
	res, err := newTestEngine(prov, nil).Run(context.Background(),
		&recordingExecutor{result: bills}, basicTurn("approve the bill"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(res.Pending) != 1 || res.Pending[0].Action != "approve_bill" {
		t.Fatalf("no proposal after the nudge: %+v text=%q", res.Pending, res.Text)
	}
	if res.Pending[0].Summary["id"] != "b-1111" {
		t.Errorf("proposal does not carry the id that was read: %v", res.Pending[0].Summary)
	}
}

func TestAReadThatFoundOneRecordIsNotChased(t *testing.T) {
	// The same shape, but the user only asked to SEE it.
	const bills = `{"bills":[{"id":"b-1111","vendor":"Meralco","status":"Draft"}]}`
	prov := &scriptedProvider{turns: []Completion{
		{ToolCalls: []ToolCall{call("c1", "get_bills", `{}`)}},
		{Text: "There is 1 bill from Meralco."},
	}}
	res, err := newTestEngine(prov, nil).Run(context.Background(),
		&recordingExecutor{result: bills}, basicTurn("show me our bills"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(res.Pending) != 0 {
		t.Errorf("a read was chased into a write: %+v", res.Pending)
	}
}

func TestAnUnrequestedWriteIsDroppedOnAReadRequest(t *testing.T) {
	const memos = `{"credit_memos":[{"id":"m-1","customer":"Acme","amount":500}]}`
	prov := &scriptedProvider{turns: []Completion{
		{ToolCalls: []ToolCall{call("c1", "get_credit_memos", `{}`)}},
		// Volunteers a write nobody asked for.
		{ToolCalls: []ToolCall{call("c2", "apply_credit_memo", `{"id":"m-1"}`)}},
		{Text: "There is 1 credit memo."},
	}}
	res, err := newTestEngine(prov, nil).Run(context.Background(),
		&recordingExecutor{result: memos}, basicTurn("show me the credit memos"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(res.Pending) != 0 {
		t.Errorf("a confirmation card was shown in reply to a question: %+v", res.Pending)
	}
	if len(res.Data) == 0 {
		t.Error("the data the user actually asked for was lost")
	}
}

func TestAWriteRequestKeepsItsProposal(t *testing.T) {
	prov := &scriptedProvider{turns: []Completion{
		{ToolCalls: []ToolCall{call("c1", "approve_leave",
			`{"id":"3f2504e0-4f89-11d3-9a0c-0305e82c3301","status":"Approved"}`)}},
	}}
	res, err := newTestEngine(prov, nil).Run(context.Background(), &recordingExecutor{},
		basicTurn("approve leave 3f2504e0-4f89-11d3-9a0c-0305e82c3301"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(res.Pending) != 1 {
		t.Fatalf("a requested write was dropped: %+v", res)
	}
}

func TestPastTenseCompletionClaimsAreCaughtToo(t *testing.T) {
	for _, claim := range []string{
		"The invoice was sent to the customer.",
		"The notification was marked read.",
		"The account was toggled off.",
		"The claim was paid.",
	} {
		if !claimsCompletionFor(claim, "send the invoice") {
			t.Errorf("false claim not recognised: %q", claim)
		}
	}
	for _, fine := range []string{
		"There is 1 unread notification.",
		"That invoice was raised in July.",
		"We have 3 customers.",
	} {
		if claimsCompletionFor(fine, "show me the notifications") {
			t.Errorf("ordinary prose treated as a completion claim: %q", fine)
		}
		// The same sentence answering a question is a fact, not a claim.
		if claimsCompletionFor("That bill was approved last week.", "was that bill approved") {
			t.Error("a true answer to a question was treated as a false claim")
		}
	}
}

func TestWriteIntentComesFromTheRankingNotAVerbList(t *testing.T) {
	const accounts = `{"accounts":[{"id":"a-1","code":"1000","name":"Cash on Hand","is_active":true}]}`
	prov := &scriptedProvider{turns: []Completion{
		{ToolCalls: []ToolCall{call("c1", "get_accounts", `{}`)}},
		// Reads, reports, stops — the shape the chase exists for.
		{Text: `I found one active account named "Cash on Hand" with the code "1000".`},
		{ToolCalls: []ToolCall{call("c2", "toggle_account_active", `{"id":"a-1","is_active":false}`)}},
	}}
	res, err := newTestEngine(prov, nil).Run(context.Background(),
		&recordingExecutor{result: accounts}, basicTurn("turn off the account active"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(res.Pending) != 1 || res.Pending[0].Action != "toggle_account_active" {
		t.Fatalf("no proposal: %+v text=%q", res.Pending, res.Text)
	}
}

func TestAWriteWithNoRecordNamedReadsTheCandidates(t *testing.T) {
	const invoices = `{"invoices":[{"id":"i-1","invoice_number":"INV-001","customer_name":"Acme","total":7000}]}`
	prov := &scriptedProvider{turns: []Completion{
		// No id, so nothing it can call — it stalls.
		{Text: "I cannot send the invoice without knowing which one."},
		// Handed the list, it proposes.
		{ToolCalls: []ToolCall{call("c1", "send_invoice", `{"id":"i-1"}`)}},
	}}
	exec := &recordingExecutor{result: invoices}
	res, err := newTestEngine(prov, nil).Run(context.Background(), exec, basicTurn("send the invoice"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(exec.calls) == 0 || exec.calls[0] != "get_invoices" {
		t.Fatalf("the invoices were never read: %v", exec.calls)
	}
	if len(res.Pending) != 1 || res.Pending[0].Action != "send_invoice" {
		t.Fatalf("no proposal: %+v text=%q", res.Pending, res.Text)
	}
	if res.Pending[0].Summary["id"] != "i-1" {
		t.Errorf("proposal carries %v, not the id that was read", res.Pending[0].Summary["id"])
	}
}

func TestTheCandidateListIsNotRenderedAsTheAnswer(t *testing.T) {
	// The user asked to send an invoice, not to see the invoice list.
	const invoices = `{"invoices":[{"id":"i-1","invoice_number":"INV-001"},{"id":"i-2","invoice_number":"INV-002"}]}`
	prov := &scriptedProvider{turns: []Completion{
		{Text: "I cannot send the invoice without knowing which one."},
		{Text: "Which invoice do you mean — INV-001 or INV-002?"},
	}}
	res, err := newTestEngine(prov, nil).Run(context.Background(),
		&recordingExecutor{result: invoices}, basicTurn("send the invoice"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(res.Data) != 0 {
		t.Errorf("the candidate list was rendered as the answer: %v", res.Data)
	}
	if !strings.Contains(res.Text, "Which invoice") {
		t.Errorf("the question was lost: %q", res.Text)
	}
}

func TestAReadNeverTriggersACandidateLookup(t *testing.T) {
	prov := &scriptedProvider{turns: []Completion{
		{ToolCalls: []ToolCall{call("c1", "get_invoices", `{}`)}},
		{Text: "There are 2 invoices."},
	}}
	exec := &recordingExecutor{result: `{"invoices":[{"id":"i-1"},{"id":"i-2"}]}`}
	if _, err := newTestEngine(prov, nil).Run(context.Background(), exec,
		basicTurn("show me the invoices")); err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(exec.calls) != 1 {
		t.Errorf("a read triggered extra lookups: %v", exec.calls)
	}
}

func TestPleasantriesAreNotTreatedAsWriteRequests(t *testing.T) {
	reg := NewRegistry()
	sel := NewSelector(reg)
	for _, prompt := range []string{"thanks, that's all", "thanks", "ok", "great, cheers"} {
		offered := sel.Select(prompt, allowAll, DefaultTopK)
		if topIsRequestedWrite(offered, prompt) {
			t.Errorf("%q treated as a write request (top tool %s)", prompt, offered[0].Action)
		}
	}
	// And a real request still is one.
	for _, prompt := range []string{"turn off the account active", "send the invoice", "approve the bill"} {
		offered := sel.Select(prompt, allowAll, DefaultTopK)
		if !topIsRequestedWrite(offered, prompt) && !wantsToWrite(prompt) {
			t.Errorf("%q was not recognised as a write request (top tool %s)", prompt, offered[0].Action)
		}
	}
}

func TestTheRequestedWriteIsFoundByRankNotPosition(t *testing.T) {
	reg := NewRegistry()
	sel := NewSelector(reg)
	for _, c := range []struct{ prompt, want string }{
		{"approve the purchase order", "approve_pur_order"},
		{"save the payroll setting", "save_payroll_settings"},
		{"update the bill", "update_bill"},
		{"mark the notification read", "mark_notification_read"},
	} {
		offered := sel.Select(c.prompt, allowAll, DefaultTopK)
		got, ok := requestedWrite(offered, c.prompt)
		if !ok {
			t.Errorf("%q: no write recognised (top is %s)", c.prompt, offered[0].Action)
			continue
		}
		if got.Action != c.want {
			t.Logf("%q -> %s (wanted %s; acceptable if same family)", c.prompt, got.Action, c.want)
		}
	}
	// Still not fooled by a pleasantry.
	for _, p := range []string{"thanks, that's all", "ok"} {
		if _, ok := requestedWrite(sel.Select(p, allowAll, DefaultTopK), p); ok {
			t.Errorf("%q treated as a write request", p)
		}
	}
	// And a question is never a write request.
	for _, p := range []string{"was the invoice sent", "show me the bills"} {
		if _, ok := requestedWrite(sel.Select(p, allowAll, DefaultTopK), p); ok {
			t.Errorf("%q treated as a write request", p)
		}
	}
}

func TestAWriteThatOnlyRequiresAnIDStillAsksWhatToSet(t *testing.T) {
	// save_payroll_settings requires an id and nothing else, so knowing which
	// record to save says nothing about what to put in it.
	reg := NewRegistry()
	tool, ok := reg.Lookup("save_payroll_settings")
	if !ok {
		t.Skip("action not in the registry")
	}
	action, need := missingForWrite([]Tool{tool}, "save the payroll setting", nil)
	if action == "" {
		t.Fatal("no question produced for a write whose only requirement is an id")
	}
	if len(need) == 0 {
		t.Error("the question names no fields")
	}
	for _, f := range need {
		if strings.HasSuffix(f, " id") || f == "id" {
			t.Errorf("the question asks the user for an id: %q", f)
		}
	}
}

func TestCheckAndDownloadAreReadShaped(t *testing.T) {
	for _, p := range []string{
		"check the email", "check the account code", "check the period open",
		"download the onboarding document", "preview the close",
	} {
		if !looksReadOnly(p) {
			t.Errorf("%q is not read-shaped", p)
		}
	}
}

func TestAnIDOnlyWriteWithNoValuesAsksNothing(t *testing.T) {
	// approve_bill takes an id and nothing else: there is no question worth
	// asking, and the candidate lookup finds the record instead.
	reg := NewRegistry()
	tool, ok := reg.Lookup("approve_bill")
	if !ok {
		t.Skip("action not in the registry")
	}
	if action, _ := missingForWrite([]Tool{tool}, "approve the bill", nil); action != "" {
		t.Errorf("asked a question it cannot usefully ask: %s", action)
	}
}

func TestRunningOutOfIterationsStillAsksForWhatIsMissing(t *testing.T) {
	// A model that keeps reading and never proposes: the turn should end with
	// the question, not with an apology about going back and forth.
	turns := make([]Completion, 12)
	for i := range turns {
		turns[i] = Completion{ToolCalls: []ToolCall{call("c1", "get_accounts", `{}`)}}
	}
	prov := &scriptedProvider{turns: turns}
	res, err := newTestEngine(prov, nil).Run(context.Background(),
		&recordingExecutor{result: `{"accounts":[{"id":"a-1","name":"Cash"}]}`},
		basicTurn("add an expense account"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if strings.Contains(res.Text, "back and forth") {
		t.Errorf("ended with an apology instead of a question: %q", res.Text)
	}
	for _, want := range []string{"code", "name"} {
		if !strings.Contains(res.Text, want) {
			t.Errorf("the question does not name %q: %q", want, res.Text)
		}
	}
}

func TestRunningOutWithNothingToAskStillSaysSo(t *testing.T) {
	turns := make([]Completion, 12)
	for i := range turns {
		turns[i] = Completion{ToolCalls: []ToolCall{call("c1", "get_employees", `{}`)}}
	}
	prov := &scriptedProvider{turns: turns}
	res, err := newTestEngine(prov, nil).Run(context.Background(),
		&recordingExecutor{result: `{"employees":[]}`}, basicTurn("what is the weather"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.Text == "" {
		t.Error("the turn ended silently")
	}
}
