package eval

import (
	"context"
	"encoding/json"
	"sort"
	"strings"
)

// Result is what one prompt produced.
type Result struct {
	Case
	Called   []string // reads that executed
	Proposed []string // writes offered for confirmation
	Text     string
	Err      error

	Pass   bool
	Reason string // why it failed, as a CLASS not an instance
}

// Score judges a turn.
//
// Deliberately lenient about WHICH tool answered and strict about the shape of
// the answer. Whether "receive goods" is best served by receive_purchase_order
// or create_pur_receipt is a judgement call; whether a read request came back
// as a write proposal, or raw tool-call syntax reached the user, is not.
func Score(r *Result) {
	switch {
	case r.Err != nil:
		r.Pass, r.Reason = false, "error"
	case strings.Contains(r.Text, "tool_call"), strings.Contains(r.Text, `"arguments"`):
		r.Pass, r.Reason = false, "leaked tool-call syntax"
	case !r.Write && len(r.Proposed) > 0:
		r.Pass, r.Reason = false, "read request answered with a write proposal"
	case !r.Write && len(r.Called) == 0:
		r.Pass, r.Reason = false, "read request did nothing"
	case r.Write && len(r.Proposed) == 0 && !asksForDetail(r.Text):
		r.Pass, r.Reason = false, "write asked for, nothing proposed and nothing asked"
	case r.Write && len(r.Proposed) == 0:
		// Asked for what it was missing and ran nothing — the right answer to
		// "add a new benefit" with no name and no type. Judged BEFORE the
		// which-action check below, because there is no action to judge: an
		// earlier version reached that check, found nothing matching, and
		// reported the correct behaviour as "answered by an unrelated action".
		r.Pass, r.Reason = true, "asked for missing detail"
	default:
		if contains(r.Called, r.Want) || contains(r.Proposed, r.Want) {
			r.Pass = true
			break
		}
		// A DIFFERENT action answered. Whether that is fine depends entirely on
		// which one: get_credit_memo answering a prompt built from
		// get_credit_memos is the same question; create_quote_from_opportunity
		// answering "delete the opportunity" is a different one, and counting
		// it as a pass hid a real miss behind a reassuring label.
		answered := append(append([]string{}, r.Called...), r.Proposed...)
		if sameFamily(r.Want, answered) {
			r.Pass, r.Reason = true, "answered by a sibling action"
			break
		}
		r.Pass, r.Reason = false, "answered by an unrelated action"
	}
}

// asksForDetail recognises the correct response to a write with no details:
// naming what is missing rather than guessing at it.
func asksForDetail(text string) bool {
	low := strings.ToLower(text)
	for _, s := range []string{"i need", "could you", "please provide", "which ", "what "} {
		if strings.Contains(low, s) {
			return true
		}
	}
	return strings.HasSuffix(strings.TrimSpace(text), "?")
}

// sameFamily reports whether any action that ran shares a subject stem with the
// one the prompt was built from — get_credit_memo and get_credit_memos, or
// create_so_order and confirm_so_order.
func sameFamily(want string, answered []string) bool {
	_, wantSubject := split(want)
	wantStem := stem(wantSubject)
	if wantStem == "" {
		return false
	}
	for _, action := range answered {
		_, subject := split(action)
		s := stem(subject)
		if s == "" {
			continue
		}
		if strings.HasPrefix(s, wantStem) || strings.HasPrefix(wantStem, s) {
			return true
		}
	}
	return false
}

// stem normalises a subject enough to recognise the same noun.
//
// Trimming a trailing "s" was not enough: entry/entries and history/histories
// are the same subject and did not match, so get_journal_entries answering a
// prompt built from get_journal_entry was reported as "an unrelated action".
// The module abbreviations are folded for the same reason — pur_order and
// purchase_order name one thing in two ways.
func stem(subject string) string {
	s := strings.NewReplacer(
		"pur_", "purchase_", "po_", "purchase_order_", "so_", "sales_order_",
		"inv_", "inventory_", "fa_", "fixed_asset_", "exp_", "expense_",
	).Replace(subject)
	switch {
	case strings.HasSuffix(s, "ies"):
		return strings.TrimSuffix(s, "ies") + "y"
	case strings.HasSuffix(s, "ses"), strings.HasSuffix(s, "xes"), strings.HasSuffix(s, "ches"):
		return strings.TrimSuffix(s, "es")
	case strings.HasSuffix(s, "s"):
		return strings.TrimSuffix(s, "s")
	}
	return s
}

func contains(list []string, want string) bool {
	for _, s := range list {
		if s == want {
			return true
		}
	}
	return false
}

// Report summarises a run: pass rate overall, per module, and failures grouped
// by class so there is something to FIX rather than a list to react to.
func Report(results []Result) string {
	var b strings.Builder
	pass := 0
	byModule := map[string][2]int{}
	byReason := map[string][]string{}
	diverted := 0

	for _, r := range results {
		m := byModule[r.Module]
		m[1]++
		if r.Pass {
			pass++
			m[0]++
			if r.Reason == "answered by a sibling action" {
				diverted++
			}
		} else {
			// What ANSWERED, not just what was wanted. Without it every failure
			// line needed a separate run to diagnose.
			got := strings.Join(append(append([]string{}, r.Called...), r.Proposed...), ",")
			if got == "" {
				got = "(nothing)"
			}
			byReason[r.Reason] = append(byReason[r.Reason],
				pad(r.Prompt, 38)+" want "+pad(r.Want, 26)+" got "+got)
		}
		byModule[r.Module] = m
	}

	b.WriteString("PASS " + itoa(pass) + "/" + itoa(len(results)))
	if len(results) > 0 {
		b.WriteString("  (" + itoa(pass*100/len(results)) + "%)")
	}
	b.WriteString(", of which " + itoa(diverted) + " were answered by a sibling action\n\n")

	mods := make([]string, 0, len(byModule))
	for m := range byModule {
		mods = append(mods, m)
	}
	sort.Strings(mods)
	b.WriteString("by module:\n")
	for _, m := range mods {
		c := byModule[m]
		b.WriteString("  " + pad(m, 16) + itoa(c[0]) + "/" + itoa(c[1]) + "\n")
	}

	if len(byReason) == 0 {
		return b.String()
	}
	reasons := make([]string, 0, len(byReason))
	for r := range byReason {
		reasons = append(reasons, r)
	}
	sort.Slice(reasons, func(i, j int) bool { return len(byReason[reasons[i]]) > len(byReason[reasons[j]]) })

	b.WriteString("\nfailures by class:\n")
	for _, reason := range reasons {
		ex := byReason[reason]
		b.WriteString("  " + itoa(len(ex)) + "x  " + reason + "\n")
		for i, e := range ex {
			if i >= 40 {
				b.WriteString("        ... and " + itoa(len(ex)-40) + " more\n")
				break
			}
			b.WriteString("        " + e + "\n")
		}
	}
	return b.String()
}

func itoa(n int) string {
	b, _ := json.Marshal(n)
	return string(b)
}

func pad(s string, n int) string {
	for len(s) < n {
		s += " "
	}
	return s
}

// Executor answers any read with a plausible row, so a turn can complete
// without a database. Ids are UUIDs because the grounding guard requires a
// write's ids to have come from a read.
type Executor struct{ Calls []string }

func (e *Executor) Execute(_ context.Context, action string, _ json.RawMessage) (json.RawMessage, error) {
	e.Calls = append(e.Calls, action)
	key := "rows"
	if _, subject := split(action); subject != "" {
		key = subject
	}
	row := map[string]any{
		"id": "11111111-2222-3333-4444-555566667777", "name": "Sample", "code": "1000",
		"status": "Active", "first_name": "Mark", "last_name": "Padama", "amount": 1000,
	}
	b, _ := json.Marshal(map[string]any{key: []any{row}})
	return b, nil
}
