package api

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	"lettersheets/internal/ai"
	"lettersheets/internal/models"
	"lettersheets/internal/repository"
)

// The prompt layer's HTTP surface: two actions.
//
//	ai_prompt   turn a sentence into an answer, or into a proposed write
//	ai_confirm  execute a proposal the user approved, and label it for training
//
// Reads run inside ai_prompt. Writes never do — they come back as pending
// actions and only execute when a human sends them to ai_confirm.

// SetAI installs the prompt layer. It is a setter rather than another pair of
// arguments on NewHandler because the AI layer is optional: with no model
// configured the server runs exactly as before and both actions report that
// the assistant is switched off.
func (h *Handler) SetAI(engine *ai.Engine, repo *repository.AIRepo, registry *ai.Registry) {
	h.aiEngine = engine
	h.aiRepo = repo
	h.aiRegistry = registry
}

func (h *Handler) aiEnabled() bool { return h.aiEngine != nil }

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

// aiExecutor runs a model's tool call by re-entering the public dispatch path.
//
// It would be faster to call the repositories directly, and that is exactly why
// it does not. Going back through /api/execute means every tool call passes the
// same authorize() check and the same session-derived company scope as a click
// in the UI. There is no second, weaker route into the data: if the caller could
// not perform the action by hand, the model cannot perform it for them, and that
// property holds without this file having to restate a single permission rule.
//
// The cost is one extra session validation per tool call — a primary-key lookup.
type aiExecutor struct {
	h     *Handler
	token string
}

// captureWriter is a minimal http.ResponseWriter that buffers the response.
// Hand-rolled rather than pulling httptest into non-test code.
type captureWriter struct {
	status int
	body   bytes.Buffer
	header http.Header
}

func (c *captureWriter) Header() http.Header {
	if c.header == nil {
		c.header = http.Header{}
	}
	return c.header
}
func (c *captureWriter) Write(b []byte) (int, error) { return c.body.Write(b) }
func (c *captureWriter) WriteHeader(s int)           { c.status = s }

func (e *aiExecutor) Execute(ctx context.Context, action string, args json.RawMessage) (json.RawMessage, error) {
	if len(args) == 0 {
		args = json.RawMessage("{}")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"/api/execute?action="+action, bytes.NewReader(args))
	if err != nil {
		return nil, fmt.Errorf("build internal request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	// The caller's own token. This is what makes the re-entry meaningful rather
	// than ceremonial — the action is authorized as them, not as the server.
	req.Header.Set("Authorization", e.token)

	rec := &captureWriter{status: http.StatusOK}
	e.h.Execute(rec, req)

	var wrapped Response
	if err := json.Unmarshal(rec.body.Bytes(), &wrapped); err != nil {
		return nil, fmt.Errorf("%s returned an unreadable response", action)
	}
	if !wrapped.Success {
		// Handler errors are written for a person. They are passed to the model
		// unchanged anyway: it is usually the fastest way for it to work out
		// that it sent a name where an id belongs.
		msg := wrapped.Error
		if msg == "" {
			msg = fmt.Sprintf("failed with status %d", rec.status)
		}
		return nil, fmt.Errorf("%s", msg)
	}

	out, err := json.Marshal(stripForModel(wrapped.Data))
	if err != nil {
		return nil, fmt.Errorf("%s returned data that could not be re-encoded", action)
	}
	// Cap what goes back into the context. get_employees on a large roster can
	// be hundreds of KB, and a model that gets a truncated blob it cannot parse
	// is better off told the result was too large to read.
	const maxToolResult = 96 << 10
	if len(out) > maxToolResult {
		return nil, fmt.Errorf(
			"%s returned too much data to read at once (%d KB) — narrow it with a filter such as a date range or status",
			action, len(out)>>10)
	}
	return out, nil
}

// modelNoiseFields are dropped from every tool result before the model sees it.
//
// Bookkeeping columns the model never reasons about but always pays to read.
var modelNoiseFields = map[string]bool{
	"company_id": true, "created_at": true, "updated_at": true, "is_deleted": true,
}

// stripForModel removes fields that cost tokens and buy nothing.
//
// Two kinds, and the first matters for more than speed:
//
//  1. Anything ending in _enc. Employee email, phone, address, salary, bank
//     details and government IDs are encrypted client-side — the server holds
//     only ciphertext and the model cannot decrypt it either. Sending it is
//     pure cost: measured on a 10-person roster it was most of a 7KB payload,
//     and base64 is expensive per character. It is also PII ciphertext leaving
//     this host for the inference box with no possible use on arrival, which is
//     a poor trade even though it stays unreadable.
//
//  2. Row bookkeeping. company_id is fixed for the whole conversation and
//     created_at/updated_at are rarely what anyone asked about.
//
// Nothing here changes what the ERP returns to the UI — only what the model is
// shown. A field the model genuinely needs must not be added to the lists above.
func stripForModel(v any) any {
	switch t := v.(type) {
	case map[string]any:
		out := make(map[string]any, len(t))
		for k, val := range t {
			if strings.HasSuffix(k, "_enc") || modelNoiseFields[k] {
				continue
			}
			out[k] = stripForModel(val)
		}
		return out
	case []any:
		out := make([]any, len(t))
		for i, val := range t {
			out[i] = stripForModel(val)
		}
		return out
	}
	return v
}

// ---------------------------------------------------------------------------
// ai_prompt
// ---------------------------------------------------------------------------

type aiPromptReq struct {
	Prompt  string       `json:"prompt"`
	History []ai.Message `json:"history"`

	// Attachments are base64 data URIs or raw base64 images the user scanned.
	Attachments []aiAttachment `json:"attachments"`
}

type aiAttachment struct {
	Filename  string `json:"filename"`
	MediaType string `json:"media_type"`
	Data      string `json:"data"` // base64
}

func (h *Handler) aiPrompt(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	if !h.aiEnabled() {
		Error(w, http.StatusServiceUnavailable, "the assistant is not enabled on this server")
		return
	}

	var req aiPromptReq
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Prompt) == "" {
		Error(w, http.StatusBadRequest, "prompt is required")
		return
	}

	// Cap the conversation the client can replay. History is client-supplied,
	// so an unbounded array is a way to run up the model bill and blow the
	// context window on someone else's dime.
	const maxHistory = 40
	if len(req.History) > maxHistory {
		req.History = req.History[len(req.History)-maxHistory:]
	}

	attachments, err := decodeAttachments(req.Attachments)
	if err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}

	perms := NewPermissions(session.Permissions, session.Role)

	res, err := h.aiEngine.Run(r.Context(), &aiExecutor{h: h, token: r.Header.Get("Authorization")}, ai.Turn{
		Prompt:      req.Prompt,
		History:     req.History,
		Can:         perms.Can,
		CompanyID:   session.CompanyID,
		Attachments: attachments,
	})
	if err != nil {
		ServerError(w, "ai_prompt", err)
		return
	}

	JSON(w, http.StatusOK, res)
}

// decodeAttachments turns the wire form into engine attachments.
func decodeAttachments(in []aiAttachment) ([]ai.Attachment, error) {
	// More than a couple of scans in one turn is not a real workflow, and each
	// one is a separate vision-model call on the request path.
	const maxAttachments = 4
	if len(in) > maxAttachments {
		return nil, fmt.Errorf("at most %d attachments per message", maxAttachments)
	}

	var out []ai.Attachment
	for _, a := range in {
		data := a.Data
		mediaType := a.MediaType

		// Accept a full data URI as well as bare base64: the browser's
		// FileReader produces the former, and making the client strip it is a
		// step that gets forgotten.
		if strings.HasPrefix(data, "data:") {
			if i := strings.Index(data, ","); i > 0 {
				meta := data[5:i]
				if j := strings.Index(meta, ";"); j > 0 {
					meta = meta[:j]
				}
				if mediaType == "" {
					mediaType = meta
				}
				data = data[i+1:]
			}
		}

		raw, err := base64.StdEncoding.DecodeString(data)
		if err != nil {
			return nil, fmt.Errorf("attachment %q is not valid base64", a.Filename)
		}
		out = append(out, ai.Attachment{
			Filename:  a.Filename,
			MediaType: mediaType,
			Data:      raw,
		})
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// ai_confirm
// ---------------------------------------------------------------------------

type aiConfirmReq struct {
	// ExampleID ties this decision back to the captured proposal. Optional —
	// a missing or unknown id costs a training row, never the action.
	ExampleID string `json:"example_id"`

	// Verdict is "confirmed", "edited" or "cancelled".
	Verdict string `json:"verdict"`

	// Actions is what to run. Sent back by the client because the user may have
	// edited the arguments, which is the point of the confirm step.
	Actions []aiConfirmAction `json:"actions"`
}

type aiConfirmAction struct {
	Action string          `json:"action"`
	Args   json.RawMessage `json:"args"`
}

func (h *Handler) aiConfirm(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	if !h.aiEnabled() {
		Error(w, http.StatusServiceUnavailable, "the assistant is not enabled on this server")
		return
	}

	var req aiConfirmReq
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	verdict := ai.Verdict(req.Verdict)
	switch verdict {
	case ai.VerdictConfirmed, ai.VerdictEdited, ai.VerdictCancelled:
	default:
		Error(w, http.StatusBadRequest, "verdict must be confirmed, edited or cancelled")
		return
	}

	// A cancellation runs nothing. It is still recorded: a run of cancellations
	// on one action is how a bad tool description surfaces, and nothing else
	// would reveal it.
	if verdict == ai.VerdictCancelled {
		h.recordVerdict(r.Context(), session.CompanyID, req.ExampleID, verdict, nil)
		JSON(w, http.StatusOK, map[string]any{"executed": 0, "cancelled": true})
		return
	}

	if len(req.Actions) == 0 {
		Error(w, http.StatusBadRequest, "no actions to confirm")
		return
	}

	perms := NewPermissions(session.Permissions, session.Role)
	exec := &aiExecutor{h: h, token: r.Header.Get("Authorization")}

	// Everything is validated before anything runs. A three-action proposal
	// where the third is malformed should fail whole, not leave the first two
	// posted with no way to tell the user which.
	final := make([]ai.ToolCall, 0, len(req.Actions))
	for i, a := range req.Actions {
		tool, known := h.aiRegistry.Lookup(a.Action)
		if !known {
			// The client echoes back what the model proposed, so this is either
			// a stale page or a hand-crafted request. Either way the allowlist
			// is the boundary — an arbitrary action must not become reachable
			// just because it arrived through this endpoint.
			Error(w, http.StatusBadRequest, fmt.Sprintf("%q is not an action the assistant can perform", a.Action))
			return
		}
		if !tool.Write {
			Error(w, http.StatusBadRequest, fmt.Sprintf("%s is a read and does not need confirming", a.Action))
			return
		}
		if tool.Module != "" && !perms.Can(tool.Module, tool.Fn) {
			Error(w, http.StatusForbidden, "insufficient permissions")
			return
		}
		// Re-validate the arguments: the user may have edited them, and an
		// edited value is exactly as untrusted as a generated one.
		if err := ai.ValidateArgs(tool, a.Args); err != nil {
			Error(w, http.StatusBadRequest, fmt.Sprintf("%s: %v", a.Action, err))
			return
		}
		final = append(final, ai.ToolCall{
			ID:   fmt.Sprintf("call_%d", i),
			Name: a.Action,
			Args: a.Args,
		})
	}

	results := make([]map[string]any, 0, len(final))
	for _, call := range final {
		out, err := exec.Execute(r.Context(), call.Name, call.Args)
		if err != nil {
			// Partial completion is reported rather than hidden. The user needs
			// to know which of their actions landed before deciding what to do
			// about the one that did not.
			JSON(w, http.StatusOK, map[string]any{
				"executed": len(results),
				"results":  results,
				"failed":   call.Name,
				"error":    err.Error(),
			})
			return
		}
		results = append(results, map[string]any{"action": call.Name, "data": json.RawMessage(out)})
	}

	h.recordVerdict(r.Context(), session.CompanyID, req.ExampleID, verdict, final)

	JSON(w, http.StatusOK, map[string]any{
		"executed": len(results),
		"results":  results,
	})
}

// recordVerdict labels the captured example. Failures are logged and dropped:
// the user's action has already happened, and losing a training row must never
// turn a successful write into an error.
func (h *Handler) recordVerdict(ctx context.Context, companyID, exampleID string, verdict ai.Verdict, final []ai.ToolCall) {
	if h.aiRepo == nil || exampleID == "" {
		return
	}
	if err := h.aiRepo.Decide(ctx, companyID, exampleID, verdict, final); err != nil {
		log.Printf("ai: could not record verdict for %s: %v", exampleID, err)
	}
}

// ---------------------------------------------------------------------------
// ai_training_status
// ---------------------------------------------------------------------------

// aiTrainingStatus reports how close this company is to having enough data for
// its own adapter. Surfacing it matters because the answer to "why is the
// assistant not as good here" is usually "this tenant is still on the shared
// base model", and that should be visible rather than guessed at.
func (h *Handler) aiTrainingStatus(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	if !h.aiEnabled() || h.aiRepo == nil {
		Error(w, http.StatusServiceUnavailable, "the assistant is not enabled on this server")
		return
	}
	readiness, err := h.aiRepo.Readiness(r.Context(), session.CompanyID)
	if err != nil {
		ServerError(w, "ai_training_status", err)
		return
	}
	JSON(w, http.StatusOK, readiness)
}
