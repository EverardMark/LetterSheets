package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

// Verdict is what the human did with a proposed action.
//
// The confirm step exists for safety, but it doubles as a free labelling
// pipeline: every decision a user makes is a judgement on whether the model
// picked the right action with the right arguments. That is precisely the
// supervision a tool-calling fine-tune needs, and it is the expensive part to
// manufacture synthetically.
type Verdict string

const (
	// VerdictConfirmed — the user accepted the proposal unchanged. A clean
	// positive example.
	VerdictConfirmed Verdict = "confirmed"

	// VerdictEdited — the user changed the arguments before confirming. The
	// strongest signal in the set: the corrected arguments are ground truth for
	// a prompt the model got almost right, which is exactly where training
	// moves the needle.
	VerdictEdited Verdict = "edited"

	// VerdictCancelled — the user rejected it outright. Never a positive
	// example; retained because a run of cancellations on one action is how a
	// bad tool description surfaces.
	VerdictCancelled Verdict = "cancelled"
)

// TrainingExample is one captured interaction.
//
// Tools records the candidate set the selector produced, not the whole
// catalogue. Training has to reproduce inference conditions: a model trained on
// prompts paired with all tools and then served twelve will have learned a task
// it is no longer being asked to do.
type TrainingExample struct {
	ID        string `json:"id"`
	CompanyID string `json:"-"` // never exported into a training file
	// UserID records who typed the prompt, for auditing "who asked the
	// assistant to post this". Like CompanyID it is deliberately excluded from
	// the export — a training file has no use for it and every reason not to
	// carry it.
	UserID string    `json:"-"`
	System string    `json:"system"`
	Prompt string    `json:"prompt"`
	Tools  []ToolDef `json:"tools"`

	// Proposed is what the model asked to do.
	Proposed []ToolCall `json:"proposed"`

	// Final is what the human actually approved. Equal to Proposed for
	// VerdictConfirmed, different for VerdictEdited, empty for
	// VerdictCancelled.
	Final []ToolCall `json:"final,omitempty"`

	// History is the conversation before this turn, for examples where the
	// right answer depends on what was already said. "I don't know the code"
	// has no correct response in isolation.
	History []Message `json:"history,omitempty"`

	// Answer is the right reply when it is PROSE rather than a call — a
	// question about a missing field, advice, a refusal.
	//
	// The exporter originally emitted only tool calls, which quietly excluded
	// every behaviour worth teaching: asking instead of guessing, declining
	// instead of inventing, explaining instead of reading. Those are the turns
	// the hand-written rules currently handle, and they are precisely what a
	// fine-tune has to absorb for the rules to be deletable.
	Answer string `json:"answer,omitempty"`

	Verdict  Verdict `json:"verdict"`
	Provider string  `json:"provider"`
	// CreatedAt is set by the recorder from the database clock.
	CreatedAt string `json:"created_at"`
}

// Recorder persists captured examples. It is an interface so this package stays
// free of any database dependency; the MySQL implementation lives with the
// other repositories.
//
// Implementations must not block the request path on failure — a dropped
// training row is an acceptable loss, a failed user action is not.
type Recorder interface {
	Record(ctx context.Context, ex TrainingExample) error
}

// NopRecorder discards everything. Used when capture is switched off, so call
// sites never need a nil check.
type NopRecorder struct{}

func (NopRecorder) Record(context.Context, TrainingExample) error { return nil }

// ---- export ----

// exportMessage mirrors the OpenAI chat format. Unsloth, Axolotl and
// LLaMA-Factory all ingest this directly, so a dump needs no conversion step
// before training.
type exportMessage struct {
	Role      string           `json:"role"`
	Content   string           `json:"content,omitempty"`
	ToolCalls []exportToolCall `json:"tool_calls,omitempty"`
}

type exportToolCall struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Function struct {
		Name string `json:"name"`
		// Arguments is a JSON-encoded string, matching the convention the base
		// models were pretrained against.
		Arguments string `json:"arguments"`
	} `json:"function"`
}

type exportRow struct {
	Messages []exportMessage `json:"messages"`
	Tools    []oaiTool       `json:"tools"`
}

// ExportJSONL writes examples as one JSON object per line, ready for a LoRA run.
//
// Only confirmed and edited examples are emitted, and edited ones carry the
// user's corrected arguments rather than the model's original — training on the
// model's own mistakes would reinforce them. Cancelled examples are skipped
// entirely: they say an action was wrong but not what the right one was, so
// they carry no target to learn. Returns the number of rows written.
func ExportJSONL(w io.Writer, examples []TrainingExample) (int, error) {
	enc := json.NewEncoder(w)
	written := 0

	for _, ex := range examples {
		calls := ex.Final
		if len(calls) == 0 {
			if ex.Verdict != VerdictConfirmed {
				continue
			}
			calls = ex.Proposed
		}
		// A prose answer is a valid target with no call at all.
		if len(calls) == 0 && ex.Answer == "" {
			continue
		}
		if ex.Verdict == VerdictCancelled {
			continue
		}

		row := exportRow{
			Messages: []exportMessage{{Role: "system", Content: ex.System}},
		}
		for _, m := range ex.History {
			role := "user"
			switch m.Role {
			case RoleAssistant:
				role = "assistant"
			case RoleTool:
				continue // tool results are replayed by the harness, not learned
			}
			if strings.TrimSpace(m.Text) == "" {
				continue
			}
			row.Messages = append(row.Messages, exportMessage{Role: role, Content: m.Text})
		}
		row.Messages = append(row.Messages, exportMessage{Role: "user", Content: ex.Prompt})

		assistant := exportMessage{Role: "assistant", Content: ex.Answer}
		for _, c := range calls {
			var etc exportToolCall
			etc.ID = c.ID
			etc.Type = "function"
			etc.Function.Name = c.Name
			args := c.Args
			if len(args) == 0 {
				args = json.RawMessage("{}")
			}
			etc.Function.Arguments = string(args)
			assistant.ToolCalls = append(assistant.ToolCalls, etc)
		}
		row.Messages = append(row.Messages, assistant)

		for _, t := range ex.Tools {
			row.Tools = append(row.Tools, oaiTool{
				Type:     "function",
				Function: oaiFuncDecl{Name: t.Name, Description: t.Description, Parameters: t.Schema},
			})
		}

		if err := enc.Encode(row); err != nil {
			return written, fmt.Errorf("write row %s: %w", ex.ID, err)
		}
		written++
	}
	return written, nil
}
