package ai

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

const roster = `{"employees":[
  {"id":"11111111-1111-1111-1111-111111111111","first_name":"Ana","last_name":"Cruz","department":"Finance","position":"Analyst"},
  {"id":"22222222-2222-2222-2222-222222222222","first_name":"Ana","middle_name":"Marie","last_name":"Cruz","department":"Operations","position":"Supervisor"},
  {"id":"33333333-3333-3333-3333-333333333333","first_name":"Ben","last_name":"Reyes","department":"Sales","position":"Rep"}
]}`

func TestPersonIndexHarvestsRoster(t *testing.T) {
	x := NewPersonIndex()
	x.Observe(roster)

	p, ok := x.Lookup("22222222-2222-2222-2222-222222222222")
	if !ok {
		t.Fatal("employee not indexed")
	}
	// The middle name is often the only thing separating two people who share a
	// first and last name, so it must survive into the display name.
	if p.FullName() != "Ana Marie Cruz" {
		t.Errorf("FullName = %q, want the middle name included", p.FullName())
	}
	if p.shortName() != "Ana Cruz" {
		t.Errorf("shortName = %q", p.shortName())
	}
}

func TestAmbiguousDetectsSharedName(t *testing.T) {
	x := NewPersonIndex()
	x.Observe(roster)

	if m := x.Ambiguous("11111111-1111-1111-1111-111111111111"); len(m) != 2 {
		t.Errorf("two Ana Cruzes should collide, got %d", len(m))
	}
	if m := x.Ambiguous("33333333-3333-3333-3333-333333333333"); len(m) != 0 {
		t.Errorf("a unique name should not collide, got %d", len(m))
	}
}

// The question is useless without a way to answer it, so the message must carry
// something that tells the candidates apart.
func TestAmbiguityErrorNamesTheDistinguishers(t *testing.T) {
	x := NewPersonIndex()
	x.Observe(roster)
	err := AmbiguityError("employee_id", x.Ambiguous("11111111-1111-1111-1111-111111111111"))

	for _, want := range []string{"2 people called Ana Cruz", "ambiguous", "Finance", "Operations", "Ana Marie Cruz",
		// The ids must be present or the model has to re-read the roster to act
		// on the user's answer — which is how the ask-again loop starts.
		"11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("message should mention %q, got:\n%s", want, err)
		}
	}
}

// Falls back to an id fragment when the people are otherwise identical —
// meaningless to a human but at least unique, which beats an unanswerable
// question.
func TestAmbiguityErrorFallsBackToID(t *testing.T) {
	x := NewPersonIndex()
	x.Observe(`{"employees":[
	  {"id":"aaaaaaaa-1111-1111-1111-111111111111","first_name":"Ana","last_name":"Cruz"},
	  {"id":"bbbbbbbb-2222-2222-2222-222222222222","first_name":"Ana","last_name":"Cruz"}]}`)

	err := AmbiguityError("employee_id", x.Ambiguous("aaaaaaaa-1111-1111-1111-111111111111"))
	if !strings.Contains(err.Error(), "id aaaaaaaa") {
		t.Errorf("expected an id fallback, got:\n%s", err)
	}
}

// End to end: the write must be withheld and the user asked, not proposed.
func TestEngineAsksWhichPersonInsteadOfProposing(t *testing.T) {
	prov := &scriptedProvider{turns: []Completion{
		{ToolCalls: []ToolCall{call("c1", "get_employees", `{}`)}},
		{ToolCalls: []ToolCall{call("c2", "create_leave",
			`{"employee_id":"11111111-1111-1111-1111-111111111111","leave_type":"Sick","start_date":"2026-08-22","end_date":"2026-08-22"}`)}},
		{Text: "There are two people called Ana Cruz — which one did you mean?"},
	}}
	exec := &recordingExecutor{result: roster}
	rec := &memRecorder{}

	res, err := newTestEngine(prov, rec).Run(context.Background(), exec, basicTurn("file a sick day for Ana Cruz tomorrow"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(res.Pending) != 0 {
		t.Errorf("an ambiguous write was proposed: %+v", res.Pending)
	}
	if len(rec.got) != 0 {
		t.Errorf("an ambiguous proposal was captured for training: %+v", rec.got)
	}

	feedback := lastTool(prov.seen[2].Messages)
	if !strings.Contains(feedback.Text, "ambiguous") {
		t.Errorf("model was not asked to disambiguate, got: %q", feedback.Text)
	}
	if !strings.Contains(res.Text, "Ana Cruz") {
		t.Errorf("user was not told about the collision, got: %q", res.Text)
	}
}

// An unambiguous name must still propose normally — the guard must not make the
// common case worse.
func TestEngineProposesWhenNameIsUnique(t *testing.T) {
	prov := &scriptedProvider{turns: []Completion{
		{ToolCalls: []ToolCall{call("c1", "get_employees", `{}`)}},
		{ToolCalls: []ToolCall{call("c2", "create_leave",
			`{"employee_id":"33333333-3333-3333-3333-333333333333","leave_type":"Vacation","start_date":"2026-08-25","end_date":"2026-08-25"}`)}},
	}}
	exec := &recordingExecutor{result: roster}

	res, err := newTestEngine(prov, nil).Run(context.Background(), exec, basicTurn("book Ben Reyes off on the 25th"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(res.Pending) != 1 {
		t.Fatalf("a unique name should propose normally, got %d pending", len(res.Pending))
	}
}

func TestFindAmbiguityIgnoresNonPersonIDs(t *testing.T) {
	x := NewPersonIndex()
	x.Observe(roster)
	tool, _ := NewRegistry().Lookup("clock_out")
	// An attendance record id is not a person and must not trip the guard.
	if _, m := findAmbiguity(x, NewGroundingSet(), tool, json.RawMessage(`{"id":"99999999-9999-9999-9999-999999999999"}`)); len(m) > 0 {
		t.Errorf("unexpected ambiguity: %v", m)
	}
}

// The user-facing picker is what actually settles this — the model has proven
// unable to interpret the answer, so the choices must reach the client with
// enough to render clickable options.
func TestEngineReturnsChoicesForTheUser(t *testing.T) {
	prov := &scriptedProvider{turns: []Completion{
		{ToolCalls: []ToolCall{call("c1", "get_employees", `{}`)}},
		{ToolCalls: []ToolCall{call("c2", "create_leave",
			`{"employee_id":"11111111-1111-1111-1111-111111111111","leave_type":"Sick","start_date":"2026-08-22","end_date":"2026-08-22"}`)}},
		{Text: "There are two people called Ana Cruz."},
	}}
	exec := &recordingExecutor{result: roster}

	res, err := newTestEngine(prov, nil).Run(context.Background(), exec, basicTurn("file a sick day for Ana Cruz"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(res.Pending) != 0 {
		t.Errorf("an ambiguous write was proposed: %+v", res.Pending)
	}
	if len(res.Choices) != 1 {
		t.Fatalf("want 1 choice for the user, got %d", len(res.Choices))
	}
	c := res.Choices[0]
	if c.Field != "employee_id" || c.Name != "Ana Cruz" {
		t.Errorf("choice = %+v", c)
	}
	if len(c.Options) != 2 {
		t.Fatalf("want 2 options, got %d", len(c.Options))
	}
	// Each option needs an id to act on and something a human can tell apart.
	for _, o := range c.Options {
		if o.ID == "" || o.Label == "" || o.Detail == "" {
			t.Errorf("incomplete option: %+v", o)
		}
	}
	if c.Options[0].Label == c.Options[1].Label && c.Options[0].Detail == c.Options[1].Detail {
		t.Error("the two options are indistinguishable to a reader")
	}
}

// Once the user has named an id — by picking from the list or pasting it — the
// question is answered and must not be asked again. Without this the guard can
// never stop firing, because the name stays shared forever.
func TestAmbiguityStopsOnceUserNamesTheID(t *testing.T) {
	chosen := "11111111-1111-1111-1111-111111111111"

	prov := &scriptedProvider{turns: []Completion{
		{ToolCalls: []ToolCall{call("c1", "get_employees", `{}`)}},
		{ToolCalls: []ToolCall{call("c2", "create_leave",
			`{"employee_id":"`+chosen+`","leave_type":"Sick","start_date":"2026-08-27","end_date":"2026-08-27"}`)}},
	}}
	exec := &recordingExecutor{result: roster}

	turn := basicTurn(`file a sick day for Ana Cruz on the 27th

(By "Ana Cruz" I mean Ana Cruz, Finance, Analyst - employee_id is ` + chosen + `.)`)

	res, err := newTestEngine(prov, nil).Run(context.Background(), exec, turn)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(res.Choices) != 0 {
		t.Errorf("asked again after the user already chose: %+v", res.Choices)
	}
	if len(res.Pending) != 1 {
		t.Fatalf("want the write proposed, got %d pending", len(res.Pending))
	}
	if res.Pending[0].Summary["employee_id"] != chosen {
		t.Errorf("proposed the wrong person: %+v", res.Pending[0].Summary)
	}
}
