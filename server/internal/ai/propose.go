package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

// proposeDefaults builds a proposal for a write whose values the user has asked
// the assistant to choose.
//
// "create one yourslef" is a reasonable instruction and was being answered with
// a read of the empty chart of accounts. What it asks for is a concrete
// suggestion, and a suggestion is safe here in a way it would not be elsewhere:
// the confirmation card shows exactly what will be created, so choosing badly
// costs a glance rather than a wrong record.
//
// Only fields the system can actually derive are filled — an account code from
// the codes already in use, a name from the type. Anything else and it says so
// rather than inventing.
func (e *Engine) proposeDefaults(ctx context.Context, exec Executor, t Turn, tool Tool) (*PendingAction, string, bool) {
	if tool.Action != "create_account" {
		return nil, "", false
	}

	kind := expenseIfUnsaid(t)
	code, err := e.nextAccountCode(ctx, exec, kind)
	if err != nil {
		return nil, "", false
	}
	name := defaultAccountName(kind)

	args, marshalErr := json.Marshal(map[string]any{
		"code":         code,
		"name":         name,
		"account_type": kind,
	})
	if marshalErr != nil {
		return nil, "", false
	}
	var summary map[string]any
	_ = json.Unmarshal(args, &summary)

	return &PendingAction{
			ID:      "proposed-default",
			Action:  tool.Action,
			Args:    args,
			Label:   tool.Description,
			Summary: summary,
		}, fmt.Sprintf("I have picked %s %q with code %s — the next free code in the %s range. "+
			"Change anything you like before confirming, or tell me a different name.",
			article(kind), name, code, strings.ToLower(kind)), true
}

// nextAccountCode reads the chart and returns the next free code in the range
// the account type belongs to. Philippine practice, and this product's own
// chart: assets 1000, liabilities 2000, equity 3000, revenue 4000, expenses 5000.
func (e *Engine) nextAccountCode(ctx context.Context, exec Executor, kind string) (string, error) {
	base := map[string]int{
		"Asset": 1000, "Liability": 2000, "Equity": 3000, "Revenue": 4000, "Expense": 5000,
	}[kind]
	if base == 0 {
		base = 5000
	}

	out, err := exec.Execute(ctx, "get_accounts", json.RawMessage(`{}`))
	if err != nil {
		return "", err
	}
	rows, _ := extractRows(out)

	used := map[int]bool{}
	for _, r := range rows {
		m, ok := r.(map[string]any)
		if !ok {
			continue
		}
		code, _ := m["code"].(string)
		var n int
		if _, err := fmt.Sscanf(code, "%d", &n); err == nil {
			used[n] = true
		}
	}
	for n := base; n < base+1000; n += 100 {
		if !used[n] {
			return fmt.Sprintf("%d", n), nil
		}
	}
	return fmt.Sprintf("%d", base), nil
}

// expenseIfUnsaid reads the account type out of the conversation, defaulting to
// Expense — which is what the user was asking for when this path was written,
// and the only type it is safe to assume, since a wrong guess is visible on the
// card.
func expenseIfUnsaid(t Turn) string {
	text := strings.ToLower(t.Prompt)
	for _, m := range t.History {
		if !m.Internal {
			text += " " + strings.ToLower(m.Text)
		}
	}
	for _, kind := range []string{"Asset", "Liability", "Equity", "Revenue", "Expense"} {
		if strings.Contains(text, strings.ToLower(kind)) {
			return kind
		}
	}
	return "Expense"
}

func defaultAccountName(kind string) string {
	switch kind {
	case "Asset":
		return "Other Assets"
	case "Liability":
		return "Other Liabilities"
	case "Equity":
		return "Other Equity"
	case "Revenue":
		return "Other Income"
	}
	return "General Expense"
}

func article(kind string) string {
	if strings.ContainsAny(kind[:1], "AEIOU") {
		return "an " + strings.ToLower(kind) + " account"
	}
	return "a " + strings.ToLower(kind) + " account"
}
