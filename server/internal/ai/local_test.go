package ai

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// The argument-shape mismatch is the single most likely way a fresh LoRA
// fine-tune appears broken, so it is pinned down here rather than discovered
// against a live model.
func TestNormaliseArgsAcceptsBothShapes(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"spec-compliant encoded string", `"{\"employee_id\":\"abc\"}"`, `{"employee_id":"abc"}`},
		{"bare object as emitted by many open models", `{"employee_id":"abc"}`, `{"employee_id":"abc"}`},
		{"empty string", `""`, `{}`},
		{"null", `null`, `{}`},
		{"absent", ``, `{}`},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := normaliseArgs(json.RawMessage(c.in))
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if strings.TrimSpace(string(got)) != c.want {
				t.Errorf("got %s, want %s", got, c.want)
			}
		})
	}
}

// Garbage must surface as an error naming the tool, not as an empty argument
// object that silently proposes a write with every field missing.
func TestNormaliseArgsRejectsGarbage(t *testing.T) {
	for _, in := range []string{`"not json at all"`, `42`, `[1,2,3]`} {
		if _, err := normaliseArgs(json.RawMessage(in)); err == nil {
			t.Errorf("input %s: expected an error, got none", in)
		}
	}
}

func TestLocalProviderRoundTrip(t *testing.T) {
	var captured oaiRequest

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		body, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(body, &captured); err != nil {
			t.Fatalf("server could not decode request: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{
			"choices":[{"message":{"role":"assistant","content":"Filing that now.",
			"tool_calls":[{"id":"call_1","type":"function",
			"function":{"name":"create_leave","arguments":"{\"employee_id\":\"e-1\",\"leave_type\":\"Sick\"}"}}]},
			"finish_reason":"tool_calls"}],
			"usage":{"prompt_tokens":120,"completion_tokens":30}}`)
	}))
	defer srv.Close()

	p := NewLocalProvider(srv.URL, "qwen3:14b", "", 0)
	got, err := p.Complete(context.Background(), Request{
		System:   "You are an ERP assistant.",
		Messages: []Message{{Role: RoleUser, Text: "file a sick day for Ana"}},
		Tools: []ToolDef{{
			Name:        "create_leave",
			Description: "File a leave request.",
			Schema:      obj(map[string]any{"employee_id": str("id")}, "employee_id"),
		}},
	})
	if err != nil {
		t.Fatalf("Complete: %v", err)
	}

	if got.Text != "Filing that now." {
		t.Errorf("text = %q", got.Text)
	}
	if len(got.ToolCalls) != 1 {
		t.Fatalf("want 1 tool call, got %d", len(got.ToolCalls))
	}
	if got.ToolCalls[0].Name != "create_leave" {
		t.Errorf("tool name = %q", got.ToolCalls[0].Name)
	}
	if string(got.ToolCalls[0].Args) != `{"employee_id":"e-1","leave_type":"Sick"}` {
		t.Errorf("args = %s", got.ToolCalls[0].Args)
	}
	if got.Usage.InputTokens != 120 || got.Usage.OutputTokens != 30 {
		t.Errorf("usage = %+v", got.Usage)
	}

	// Determinism is a correctness property here, not a preference.
	if captured.Temperature != 0 {
		t.Errorf("temperature = %v, want 0", captured.Temperature)
	}
	if captured.Messages[0].Role != "system" {
		t.Errorf("system prompt not sent first: %+v", captured.Messages[0])
	}
	if len(captured.Tools) != 1 || captured.Tools[0].Function.Name != "create_leave" {
		t.Errorf("tools not forwarded: %+v", captured.Tools)
	}
	if captured.ToolChoice != "auto" {
		t.Errorf("tool_choice = %q, want auto", captured.ToolChoice)
	}
}

// A model server that is down, misconfigured, or pointed at the wrong port is
// the normal state of a self-hosted setup. The error has to say so.
func TestLocalProviderSurfacesServerErrors(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
		io.WriteString(w, `{"error":{"message":"model qwen3:14b not found, try pulling it"}}`)
	}))
	defer srv.Close()

	_, err := NewLocalProvider(srv.URL, "qwen3:14b", "", 0).
		Complete(context.Background(), Request{Messages: []Message{{Role: RoleUser, Text: "hi"}}})
	if err == nil {
		t.Fatal("expected an error")
	}
	if !strings.Contains(err.Error(), "503") || !strings.Contains(err.Error(), "not found") {
		t.Errorf("error should carry status and server message, got: %v", err)
	}
}

// Tool calls sent back on the next turn must be re-encoded as a JSON string:
// that is the shape the base model saw in training, and feeding back a bare
// object measurably degrades multi-turn tool use.
func TestToolCallsAreReEncodedAsStrings(t *testing.T) {
	out := toOAIMessages("", []Message{{
		Role:      RoleAssistant,
		ToolCalls: []ToolCall{{ID: "c1", Name: "get_leaves", Args: json.RawMessage(`{"status":"Pending"}`)}},
	}})

	if len(out) != 1 || len(out[0].ToolCalls) != 1 {
		t.Fatalf("unexpected shape: %+v", out)
	}
	var asString string
	if err := json.Unmarshal(out[0].ToolCalls[0].Function.Arguments, &asString); err != nil {
		t.Fatalf("arguments did not round-trip as a JSON string: %v", err)
	}
	if asString != `{"status":"Pending"}` {
		t.Errorf("decoded arguments = %q", asString)
	}
}

// Thinking must be sent explicitly, not left to the server's default. Qwen3
// thinks unless told otherwise, and on the deployment host that is the
// difference between a ~1.5s turn and a ~15s one.
func TestThinkingIsSentExplicitly(t *testing.T) {
	var captured oaiRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		json.Unmarshal(body, &captured)
		io.WriteString(w, `{"choices":[{"message":{"role":"assistant","content":"hi"}}],"usage":{}}`)
	}))
	defer srv.Close()

	p := NewLocalProvider(srv.URL, "qwen3-8b", "", 0)
	req := Request{Messages: []Message{{Role: RoleUser, Text: "hi"}}}

	if _, err := p.Complete(context.Background(), req); err != nil {
		t.Fatalf("Complete: %v", err)
	}
	if captured.ChatTemplateKwargs == nil {
		t.Fatal("chat_template_kwargs absent; the server would use its own default")
	}
	if captured.ChatTemplateKwargs["enable_thinking"] != false {
		t.Errorf("enable_thinking = %v, want false by default", captured.ChatTemplateKwargs["enable_thinking"])
	}

	p.SetThinking(true)
	if _, err := p.Complete(context.Background(), req); err != nil {
		t.Fatalf("Complete: %v", err)
	}
	if captured.ChatTemplateKwargs["enable_thinking"] != true {
		t.Errorf("SetThinking(true) not honoured: %v", captured.ChatTemplateKwargs)
	}
}
