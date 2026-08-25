package ai

import (
	"context"
	"encoding/json"
	"math"
	"sort"
	"strings"
)

// Retrieval memory: what worked before, put in front of the model now.
//
// This is the loop that makes the assistant improve as it is used, and it is
// deliberately not training. A confirmed action is a labelled example — this
// wording, this action, these arguments, approved by a person — and showing the
// model two or three of its own past successes costs a few hundred tokens and
// takes effect on the very next message. Training the same signal into the
// weights takes hours of GPU, cannot be undone without another run, and was
// measured making this assistant worse.
//
// The trade is honest: retrieval helps only where a past example resembles the
// current request, and it spends prompt budget every turn. Weights generalise
// further and cost nothing at inference. Retrieval is the fast loop; a periodic
// LoRA remains the slow one.

// Remembered is a past interaction worth showing the model again.
type Remembered struct {
	Prompt string
	Calls  []ToolCall
	// Corrected marks an example the user EDITED before confirming. The
	// strongest signal there is: the model proposed something close and a human
	// wrote down what it should have been.
	Corrected bool
}

// Memory returns past confirmed interactions similar to a prompt.
//
// Implementations MUST scope to the company. A remembered example is one
// tenant's data appearing in another tenant's prompt otherwise, which is the
// worst failure this system could have.
type Memory interface {
	Similar(ctx context.Context, companyID, prompt string, limit int) ([]Remembered, error)
}

// NopMemory remembers nothing, so call sites need no nil check.
type NopMemory struct{}

func (NopMemory) Similar(context.Context, string, string, int) ([]Remembered, error) {
	return nil, nil
}

// RankRemembered scores candidates against a prompt and returns the best.
//
// The same BM25 the tool selector uses, over example prompts rather than tool
// descriptions. Corrections are weighted above plain confirmations: a user who
// edited the arguments told us something the model got wrong, which is more
// informative than one it got right.
func RankRemembered(prompt string, candidates []Remembered, limit int) []Remembered {
	if len(candidates) == 0 || limit <= 0 {
		return nil
	}
	query := tokenize(prompt)
	if len(query) == 0 {
		return nil
	}

	// A Selector over the example prompts, so the ranking here is literally the
	// same BM25 that ranks tools — one scoring implementation, not two that
	// drift apart.
	docs := make([][]string, len(candidates))
	df := map[string]int{}
	total := 0
	for i, c := range candidates {
		docs[i] = tokenize(c.Prompt)
		total += len(docs[i])
		seen := map[string]bool{}
		for _, tok := range docs[i] {
			if !seen[tok] {
				df[tok]++
				seen[tok] = true
			}
		}
	}
	avg := float64(total) / float64(len(candidates))
	if avg == 0 {
		return nil
	}
	scorer := &Selector{idf: idfFrom(df, len(candidates)), avgLen: avg}

	type scored struct {
		r     Remembered
		score float64
	}
	ranked := make([]scored, 0, len(candidates))
	for i, c := range candidates {
		s := scorer.score(query, docs[i])
		if c.Corrected {
			s *= correctionBoost
		}
		ranked = append(ranked, scored{r: c, score: s})
	}
	sort.SliceStable(ranked, func(i, j int) bool { return ranked[i].score > ranked[j].score })

	var out []Remembered
	for _, r := range ranked {
		if len(out) >= limit || r.score <= 0 {
			break
		}
		out = append(out, r.r)
	}
	return out
}

// correctionBoost is how much an edited example outweighs a confirmed one.
const correctionBoost = 1.5

// idfFrom builds the inverse document frequencies the scorer needs.
func idfFrom(df map[string]int, docs int) map[string]float64 {
	idf := make(map[string]float64, len(df))
	for term, n := range df {
		idf[term] = math.Log(1 + (float64(docs)-float64(n)+0.5)/(float64(n)+0.5))
	}
	return idf
}

// asMessages renders remembered examples as prior conversation turns.
//
// Prior turns rather than prose in the system prompt: the model was pretrained
// on conversations, and a worked example in the shape of a conversation is read
// as one. Described in prose it becomes something to reason about instead.
func asMessages(remembered []Remembered) []Message {
	var out []Message
	for _, r := range remembered {
		calls := redactIDs(r.Calls)
		if len(calls) == 0 {
			continue
		}
		out = append(out,
			Message{Role: RoleUser, Internal: true, Text: r.Prompt},
			Message{Role: RoleAssistant, Internal: true, ToolCalls: calls},
		)
	}
	return out
}

// redactIDs strips identifiers out of a remembered call.
//
// The single most important line in this file. A remembered example carries the
// ids of the record it acted on MONTHS ago — an invoice that is paid, an
// employee who has left. Replayed verbatim, the model copies them into today's
// proposal, and every one of them passes the grounding guard, because they did
// once appear in a real result. The example is worth keeping for its SHAPE:
// this wording meant this action with these fields. The values must be found
// again from today's data.
func redactIDs(calls []ToolCall) []ToolCall {
	out := make([]ToolCall, 0, len(calls))
	for _, c := range calls {
		var args map[string]any
		if err := json.Unmarshal(c.Args, &args); err != nil {
			continue
		}
		strip(args)
		cleaned, err := json.Marshal(args)
		if err != nil {
			continue
		}
		out = append(out, ToolCall{ID: c.ID, Name: c.Name, Args: cleaned})
	}
	return out
}

func strip(v map[string]any) {
	for k, val := range v {
		switch inner := val.(type) {
		case map[string]any:
			strip(inner)
		case []any:
			for _, item := range inner {
				if m, ok := item.(map[string]any); ok {
					strip(m)
				}
			}
		default:
			if k == "id" || strings.HasSuffix(k, "_id") {
				v[k] = "<look this up>"
			}
		}
	}
}
