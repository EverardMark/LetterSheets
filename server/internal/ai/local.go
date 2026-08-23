package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// LocalProvider talks to any server exposing an OpenAI-compatible
// /v1/chat/completions endpoint — Ollama, vLLM, llama.cpp's server, LM Studio,
// TGI. That dialect is the de-facto standard for self-hosted inference, so a
// LoRA fine-tune of Qwen 3 / Llama 3.3 / Mistral is reachable by changing a URL
// in config rather than by writing code.
//
// Implemented on net/http rather than a client library on purpose: the request
// shape is small and stable, and the server currently carries four dependencies
// total. Adding a vendor SDK to speak a format this simple is not a good trade.
type LocalProvider struct {
	baseURL string
	model   string
	apiKey  string
	client  *http.Client

	// thinking turns on the base model's chain-of-thought.
	//
	// Off by default, and that default was measured rather than assumed. On the
	// deployment host (Qwen3-8B-AWQ on a T4), the same request takes ~1.5s with
	// thinking off and ~15s with it on — a tenfold difference that a user typing
	// into a prompt box feels immediately.
	//
	// Thinking does buy accuracy on the base model: it recovers cases the
	// non-thinking path gets wrong. But that accuracy is exactly what a
	// per-company LoRA is trained to deliver without paying for the tokens, so
	// the tradeoff resolves the other way as soon as an adapter exists. Left
	// switchable because before that point it is a reasonable thing to turn on.
	thinking bool
}

// SetThinking turns the base model's chain-of-thought on or off. See the
// `thinking` field for why off is the default.
func (p *LocalProvider) SetThinking(on bool) { p.thinking = on }

// NewLocalProvider builds a provider against an OpenAI-compatible server.
// baseURL is the server root (e.g. "http://127.0.0.1:11434"); the
// /v1/chat/completions path is appended. apiKey may be empty — Ollama and
// llama.cpp ignore it, vLLM can be configured to require one.
func NewLocalProvider(baseURL, model, apiKey string, timeout time.Duration) *LocalProvider {
	if timeout <= 0 {
		// Self-hosted generation on modest hardware is slow, especially at
		// longer contexts. This ceiling is generous on purpose; the caller's
		// context still governs cancellation.
		timeout = 3 * time.Minute
	}
	return &LocalProvider{
		baseURL: strings.TrimRight(baseURL, "/"),
		model:   model,
		apiKey:  apiKey,
		client:  &http.Client{Timeout: timeout},
	}
}

func (p *LocalProvider) Name() string { return "local:" + p.model }

// ---- wire types ----

type oaiRequest struct {
	Model       string       `json:"model"`
	Messages    []oaiMessage `json:"messages"`
	Tools       []oaiTool    `json:"tools,omitempty"`
	ToolChoice  string       `json:"tool_choice,omitempty"`
	MaxTokens   int          `json:"max_tokens,omitempty"`
	Temperature float64      `json:"temperature"`
	Stream      bool         `json:"stream"`

	// ChatTemplateKwargs reaches the model's chat template. Qwen3 and other
	// hybrid-reasoning models read enable_thinking from here; servers that do
	// not understand the field ignore it, so it is safe to send generally.
	ChatTemplateKwargs map[string]any `json:"chat_template_kwargs,omitempty"`
}

type oaiMessage struct {
	Role       string        `json:"role"`
	Content    string        `json:"content,omitempty"`
	ToolCalls  []oaiToolCall `json:"tool_calls,omitempty"`
	ToolCallID string        `json:"tool_call_id,omitempty"`
}

type oaiTool struct {
	Type     string      `json:"type"`
	Function oaiFuncDecl `json:"function"`
}

type oaiFuncDecl struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters"`
}

type oaiToolCall struct {
	ID       string      `json:"id"`
	Type     string      `json:"type"`
	Function oaiFuncCall `json:"function"`
}

// oaiFuncCall.Arguments is declared as json.RawMessage rather than string
// because the format is widely got wrong. The OpenAI spec says arguments is a
// JSON-encoded *string*; instruction-tuned open models regularly emit a bare
// object instead, and some inference servers pass that straight through.
// Accepting RawMessage lets normaliseArgs sort it out instead of the decode
// failing outright — see the comment there.
type oaiFuncCall struct {
	Name      string          `json:"name"`
	Arguments json.RawMessage `json:"arguments"`
}

type oaiResponse struct {
	Choices []struct {
		Message      oaiMessage `json:"message"`
		FinishReason string     `json:"finish_reason"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
	} `json:"usage"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func (p *LocalProvider) Complete(ctx context.Context, req Request) (*Completion, error) {
	body := oaiRequest{
		Model:     p.model,
		Messages:  toOAIMessages(req.System, req.Messages),
		MaxTokens: req.MaxTokens,
		// Deterministic decoding. This path turns a sentence into a database
		// write, so sampling variety is a liability, not a feature: the same
		// prompt should propose the same action every time, and captured
		// training rows should reflect the model's actual argmax.
		Temperature: 0,
		Stream:      false,
		// Sent explicitly in both directions rather than relying on the server's
		// default: Qwen3 thinks by default, so omitting this would silently make
		// every request ten times slower.
		ChatTemplateKwargs: map[string]any{"enable_thinking": p.thinking},
	}
	for _, t := range req.Tools {
		body.Tools = append(body.Tools, oaiTool{
			Type: "function",
			Function: oaiFuncDecl{
				Name:        t.Name,
				Description: t.Description,
				Parameters:  t.Schema,
			},
		})
	}
	if len(body.Tools) > 0 {
		body.ToolChoice = "auto"
	}

	raw, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("encode request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+"/v1/chat/completions", bytes.NewReader(raw))
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if p.apiKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)
	}

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("call %s: %w", p.baseURL, err)
	}
	defer resp.Body.Close()

	// Cap the read: a misconfigured endpoint (or the wrong URL entirely) can
	// return an unbounded stream, and this runs inside a request handler.
	payload, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("inference server returned %d: %s", resp.StatusCode, truncate(string(payload), 300))
	}

	var out oaiResponse
	if err := json.Unmarshal(payload, &out); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	if out.Error != nil {
		return nil, fmt.Errorf("inference server error: %s", out.Error.Message)
	}
	if len(out.Choices) == 0 {
		return nil, fmt.Errorf("inference server returned no choices")
	}

	msg := out.Choices[0].Message
	comp := &Completion{
		Text: msg.Content,
		Usage: Usage{
			InputTokens:  out.Usage.PromptTokens,
			OutputTokens: out.Usage.CompletionTokens,
		},
		Raw: payload,
	}
	for i, tc := range msg.ToolCalls {
		args, err := normaliseArgs(tc.Function.Arguments)
		if err != nil {
			return nil, fmt.Errorf("tool call %d (%s): %w", i, tc.Function.Name, err)
		}
		id := tc.ID
		if id == "" {
			// Several local servers omit the id. It only has to be unique
			// within the turn so tool results can be matched back.
			id = fmt.Sprintf("call_%d", i)
		}
		comp.ToolCalls = append(comp.ToolCalls, ToolCall{
			ID:   id,
			Name: tc.Function.Name,
			Args: args,
		})
	}
	return comp, nil
}

// normaliseArgs coerces the two shapes real inference servers emit into a JSON
// object.
//
// Spec-compliant output is a JSON-encoded string: "{\"employee_id\":\"...\"}".
// Open-weight models frequently emit the object directly instead, and a plain
// string decode fails on it. Handling both here means a fine-tune that has not
// perfectly learned the escaping convention still produces working tool calls —
// which matters, because that particular mistake is common early in training
// and would otherwise look like a total failure of the feature.
func normaliseArgs(raw json.RawMessage) (json.RawMessage, error) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || string(trimmed) == "null" {
		return json.RawMessage("{}"), nil
	}

	switch trimmed[0] {
	case '{':
		return trimmed, nil
	case '"':
		var s string
		if err := json.Unmarshal(trimmed, &s); err != nil {
			return nil, fmt.Errorf("arguments not decodable as string: %w", err)
		}
		s = strings.TrimSpace(s)
		if s == "" {
			return json.RawMessage("{}"), nil
		}
		if !json.Valid([]byte(s)) {
			return nil, fmt.Errorf("arguments string is not valid JSON: %s", truncate(s, 200))
		}
		return json.RawMessage(s), nil
	default:
		return nil, fmt.Errorf("arguments is neither an object nor a string: %s", truncate(string(trimmed), 200))
	}
}

// toOAIMessages flattens the system prompt and history into the wire format.
func toOAIMessages(system string, msgs []Message) []oaiMessage {
	out := make([]oaiMessage, 0, len(msgs)+1)
	if system != "" {
		out = append(out, oaiMessage{Role: "system", Content: system})
	}

	for _, m := range msgs {
		om := oaiMessage{Role: string(m.Role), Content: m.Text, ToolCallID: m.ToolCallID}
		for _, tc := range m.ToolCalls {
			om.ToolCalls = append(om.ToolCalls, oaiToolCall{
				ID:   tc.ID,
				Type: "function",
				// Re-encode as a string: this direction must be spec-correct,
				// since the model was trained against that shape and feeding
				// back a bare object degrades multi-turn tool use.
				Function: oaiFuncCall{Name: tc.Name, Arguments: mustEncodeString(tc.Args)},
			})
		}
		out = append(out, om)
	}
	return out
}

func mustEncodeString(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 {
		raw = json.RawMessage("{}")
	}
	encoded, err := json.Marshal(string(raw))
	if err != nil {
		// Marshalling a string cannot fail; fall back rather than panic inside
		// a request handler.
		return json.RawMessage(`"{}"`)
	}
	return encoded
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
