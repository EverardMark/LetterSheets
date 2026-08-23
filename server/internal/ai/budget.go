package ai

import "strings"

// Context budgeting.
//
// The client replays the conversation on every turn, and a single tool result
// can be thousands of tokens — a ten-person roster, a month of attendance. Left
// unbounded, history grows past the model's context window and then EVERY
// request fails, including a bare "hello", because the history rides along with
// it. That is what happened in production: three turns of ordinary use and the
// assistant returned nothing but errors until the page was reloaded.
//
// Capping by message count, which is what this did first, does not help. Forty
// short messages fit easily; two long tool results do not. The budget has to be
// in tokens.

const (
	// ContextWindow is the deployed model's max_model_len. Kept here rather
	// than read from the server because the trim has to happen BEFORE the
	// request, and being wrong in the safe direction only costs a little
	// history.
	ContextWindow = 8192

	// ReservedForOutput is what the response may consume.
	ReservedForOutput = 1024

	// ReservedForPrompt covers the system prompt plus the tool schemas —
	// measured at roughly 2,250 tokens for twelve tools, rounded up.
	// ToolBudgetTokens is how much of the prompt the tool schemas may occupy.
	//
	// Below ReservedForPrompt because the system prompt and the user's own
	// message share that allowance. See Selector.Select.
	ToolBudgetTokens = 2000

	// BytesPerToken is the rough ratio used to size things without a tokenizer.
	BytesPerToken = 3

	ReservedForPrompt = 2800

	// CaptionTokens caps the sentence written over a rendered table.
	//
	// Generation is the whole latency budget on this hardware: at roughly
	// 17 tok/s under a full context, 500 output tokens is thirty seconds and
	// 40 is two. A caption needs 40.
	// ProposalTokens is the cap once data is on screen but a WRITE is still
	// possible.
	//
	// CaptionTokens alone assumed the only thing left to say was a sentence
	// about what was read. It is not: "create an invoice for Acme" reads the
	// accounts, then has to emit a create_invoice call with line items — far
	// more than sixty tokens. Cut off mid-object, the call is unparseable, so
	// the turn produced no proposal and half a JSON literal went to screen.
	ProposalTokens = 512

	CaptionTokens = 60

	// MaxToolResultTokens caps ONE tool result. A read that would fill the
	// whole window is not usable as context anyway, and truncating it leaves
	// room for the conversation around it.
	MaxToolResultTokens = 1500
)

// HistoryBudget is what remains for replayed conversation.
func HistoryBudget() int {
	return ContextWindow - ReservedForOutput - ReservedForPrompt
}

// estimateTokens approximates a token count from text length.
//
// Deliberately pessimistic at 3 characters per token. Prose runs closer to 4,
// but tool results are JSON — punctuation, quoted keys, UUIDs — which tokenises
// far worse, and UUIDs in particular are about a dozen tokens each. Guessing
// low here means overflowing the window, which fails the whole request;
// guessing high only drops a little older history.
func estimateTokens(s string) int {
	return len(s) / 3
}

func messageTokens(m Message) int {
	n := estimateTokens(m.Text)
	for _, c := range m.ToolCalls {
		n += estimateTokens(c.Name) + estimateTokens(string(c.Args))
	}
	// Per-message role and delimiter overhead.
	return n + 8
}

// truncateToolResult shortens an oversized tool result, telling the model it
// was cut rather than letting it silently believe it saw everything — a model
// that thinks a truncated roster is the whole roster will confidently report
// the wrong headcount.
func truncateToolResult(s string) string {
	max := MaxToolResultTokens * 3
	if len(s) <= max {
		return s
	}
	return s[:max] + "\n…[truncated: this result was too large to read in full. " +
		"Narrow it with a filter such as a date range, a status, or a specific name, " +
		"and tell the user you are showing a partial result.]"
}

// TrimHistory drops the oldest messages until the replayed conversation fits.
//
// Trims from the front because recent turns are what a follow-up refers to.
// Tool results are truncated in place first, since they are almost always the
// bulk and the least useful once they have been answered.
//
// A trailing tool result whose assistant tool_call was trimmed away would be an
// orphan, which some servers reject outright, so the result walks back to a
// clean boundary: the kept slice never begins with a tool message.
func TrimHistory(history []Message, budget int) []Message {
	if budget <= 0 || len(history) == 0 {
		return nil
	}

	shrunk := make([]Message, len(history))
	for i, m := range history {
		if m.Role == RoleTool {
			m.Text = truncateToolResult(m.Text)
		}
		shrunk[i] = m
	}

	total := 0
	for _, m := range shrunk {
		total += messageTokens(m)
	}
	if total <= budget {
		return shrunk
	}

	// Keep the newest messages that fit.
	start := len(shrunk)
	used := 0
	for i := len(shrunk) - 1; i >= 0; i-- {
		t := messageTokens(shrunk[i])
		if used+t > budget {
			break
		}
		used += t
		start = i
	}

	// Never start on a tool result orphaned from the call it answers.
	for start < len(shrunk) && shrunk[start].Role == RoleTool {
		start++
	}
	if start >= len(shrunk) {
		return nil
	}
	return shrunk[start:]
}

// IsContextOverflow reports whether an error is the model refusing an
// over-long request, so the caller can say something useful instead of
// surfacing a 500.
func IsContextOverflow(err error) bool {
	if err == nil {
		return false
	}
	s := strings.ToLower(err.Error())
	return strings.Contains(s, "maximum context length") ||
		strings.Contains(s, "context_length_exceeded") ||
		strings.Contains(s, "longer than the maximum")
}
