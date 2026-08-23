// Package ai is the provider-agnostic LLM layer behind the prompt-first UI.
//
// Nothing in here knows about Claude, Ollama, or any specific vendor: the rest
// of the server talks to the Provider interface, and the concrete backend is
// chosen once at startup from config. That indirection is deliberate — the
// deployment target is a self-hosted LoRA fine-tune of an open-weight base
// (Qwen 3 / Llama 3.3 / Mistral), and a hosted model is only the bootstrap used
// to accumulate training data. Swapping between them must not touch call sites.
package ai

import (
	"context"
	"encoding/json"
)

type Role string

const (
	RoleSystem    Role = "system"
	RoleUser      Role = "user"
	RoleAssistant Role = "assistant"
	RoleTool      Role = "tool"
)

// Message is one turn of the conversation in provider-neutral form. Providers
// translate to and from their own wire shapes; callers never see those.
type Message struct {
	// Internal marks a message this engine wrote to steer the model — a nudge,
	// an injected read result, a chase — rather than something the user said.
	//
	// They are RoleUser because that is the only role a provider will accept
	// mid-conversation, which made them indistinguishable from the user's own
	// words: "i dont know the code" was answered against "Result of
	// get_accounts: ..." because that was the most recent user-role message in
	// the history. Anything reasoning about what the USER asked has to skip
	// these.
	Internal bool `json:"internal,omitempty"`

	Role Role   `json:"role"`
	Text string `json:"text,omitempty"`

	// ToolCalls is set only on assistant turns where the model asked to invoke
	// one or more ERP actions.
	ToolCalls []ToolCall `json:"tool_calls,omitempty"`

	// ToolCallID ties a RoleTool message back to the ToolCall it answers.
	ToolCallID string `json:"tool_call_id,omitempty"`
}

// ToolCall is the model's request to run one ERP action. Args is left as raw
// JSON: it is validated against the tool's schema before anything executes, and
// small models routinely emit inputs that do not match (missing required fields,
// invented enum values), so decoding must be a checked step rather than a cast.
type ToolCall struct {
	ID   string          `json:"id"`
	Name string          `json:"name"`
	Args json.RawMessage `json:"args"`
}

// ToolDef describes one callable ERP action to the model. Schema is a JSON
// Schema object; both providers accept that shape, so the registry builds it
// once and neither backend needs its own copy.
type ToolDef struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Schema      map[string]any `json:"schema"`
}

// Request is one completion request. System is passed separately from Messages
// because providers place it differently on the wire.
type Request struct {
	System   string
	Messages []Message
	Tools    []ToolDef

	// MaxTokens of 0 lets the provider pick its own default.
	MaxTokens int
}

// Completion is what came back. Text and ToolCalls are not mutually exclusive —
// a model may narrate and call in the same turn.
type Completion struct {
	Text      string
	ToolCalls []ToolCall
	Usage     Usage

	// Raw is the provider's unmodified response, retained only so the dataset
	// sink can record exactly what the bootstrap model produced.
	Raw json.RawMessage
}

type Usage struct {
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
}

// Provider is the single seam between the ERP and whatever model is serving it.
//
// Implementations must be safe for concurrent use: one instance is shared by
// every request the server handles.
type Provider interface {
	// Name identifies the backend in logs and in captured training rows, so a
	// dataset can be filtered by which model generated each example.
	Name() string

	// Complete runs one turn. It must not retry on its own — the caller owns
	// the agent loop and its iteration cap.
	Complete(ctx context.Context, req Request) (*Completion, error)
}
