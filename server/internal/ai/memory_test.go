package ai

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

type fakeMemory struct {
	byCompany map[string][]Remembered
	askedFor  string
}

func (f *fakeMemory) Similar(_ context.Context, companyID, prompt string, limit int) ([]Remembered, error) {
	f.askedFor = companyID
	return RankRemembered(prompt, f.byCompany[companyID], limit), nil
}

func TestAPastConfirmationIsShownToTheModel(t *testing.T) {
	mem := &fakeMemory{byCompany: map[string][]Remembered{
		"co-1": {{
			Prompt: "add expense account for office supplies",
			Calls: []ToolCall{{ID: "c1", Name: "create_account",
				Args: json.RawMessage(`{"code":"6100","name":"Office Supplies Expense","account_type":"Expense"}`)}},
		}},
	}}
	prov := &scriptedProvider{turns: []Completion{{Text: "ok"}}}
	e := newTestEngine(prov, nil)
	e.SetMemory(mem)

	turn := basicTurn("add expense account for stationery")
	turn.CompanyID = "co-1"
	if _, err := e.Run(context.Background(), &recordingExecutor{}, turn); err != nil {
		t.Fatalf("Run: %v", err)
	}
	if mem.askedFor != "co-1" {
		t.Errorf("memory queried for %q", mem.askedFor)
	}

	sent := prov.seen[0].Messages
	found := false
	for _, m := range sent {
		for _, c := range m.ToolCalls {
			if c.Name == "create_account" {
				found = true
			}
		}
	}
	if !found {
		t.Error("the past example was not put in front of the model")
	}
}

// The most important property in the file: a remembered example must not carry
// the id of the record it acted on months ago.
func TestRememberedIDsAreNotReplayed(t *testing.T) {
	calls := []ToolCall{{ID: "c1", Name: "approve_bill",
		Args: json.RawMessage(`{"id":"6f1c9d20-0a11-4e6b-9a31-1c2f3d4e5a01","note":"ok"}`)}}
	out := redactIDs(calls)
	if len(out) != 1 {
		t.Fatalf("got %d calls", len(out))
	}
	var args map[string]any
	_ = json.Unmarshal(out[0].Args, &args)
	if args["id"] == "6f1c9d20-0a11-4e6b-9a31-1c2f3d4e5a01" {
		t.Error("a stale id survived into the example")
	}
	if args["note"] != "ok" {
		t.Errorf("a non-id field was lost: %v", args["note"])
	}
}

func TestNestedAndListedIDsAreRedactedToo(t *testing.T) {
	calls := []ToolCall{{ID: "c1", Name: "create_invoice",
		Args: json.RawMessage(`{"customer_id":"abc","items":[{"account_id":"def","quantity":2}]}`)}}
	body := string(redactIDs(calls)[0].Args)
	for _, stale := range []string{`"abc"`, `"def"`} {
		if strings.Contains(body, stale) {
			t.Errorf("stale id %s survived: %s", stale, body)
		}
	}
	if !strings.Contains(body, `"quantity":2`) {
		t.Errorf("a real value was lost: %s", body)
	}
}

func TestCorrectionsOutrankPlainConfirmations(t *testing.T) {
	candidates := []Remembered{
		{Prompt: "file a leave request for monday", Calls: []ToolCall{{Name: "create_leave"}}},
		{Prompt: "file a leave request for monday", Calls: []ToolCall{{Name: "create_leave"}}, Corrected: true},
	}
	got := RankRemembered("file a leave request for monday", candidates, 1)
	if len(got) != 1 || !got[0].Corrected {
		t.Error("the corrected example did not win")
	}
}

func TestMemoryIsNotConsultedMidConversation(t *testing.T) {
	mem := &fakeMemory{byCompany: map[string][]Remembered{"co-1": {{
		Prompt: "anything", Calls: []ToolCall{{Name: "create_account", Args: json.RawMessage(`{}`)}},
	}}}}
	prov := &scriptedProvider{turns: []Completion{{Text: "ok"}}}
	e := newTestEngine(prov, nil)
	e.SetMemory(mem)

	turn := basicTurn("and the next one")
	turn.CompanyID = "co-1"
	turn.History = []Message{{Role: RoleUser, Text: "earlier"}, {Role: RoleAssistant, Text: "answer"}}
	if _, err := e.Run(context.Background(), &recordingExecutor{}, turn); err != nil {
		t.Fatalf("Run: %v", err)
	}
	if mem.askedFor != "" {
		t.Error("memory was consulted mid-conversation, where the conversation itself is better context")
	}
}

func TestUnrelatedMemoriesAreNotShown(t *testing.T) {
	got := RankRemembered("show me the trial balance", []Remembered{
		{Prompt: "file a sick day for Ana", Calls: []ToolCall{{Name: "create_leave"}}},
	}, 2)
	if len(got) != 0 {
		t.Errorf("an unrelated memory was returned: %+v", got)
	}
}
