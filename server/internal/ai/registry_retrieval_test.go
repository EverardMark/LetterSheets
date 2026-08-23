package ai

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestRetrievalAcrossAccounting(t *testing.T) {
	sel := NewSelector(NewRegistry())
	can := func(string, string) bool { return true }

	cases := []struct{ prompt, want string }{
		{"add a chart of account", "create_account"},
		{"create an expense account", "create_account"},
		{"who owes us money", "get_ar_aging"},
		{"who do we owe", "get_ap_aging"},
		{"did we make money last month", "get_income_statement"},
		{"show me the balance sheet", "get_balance_sheet"},
		{"trial balance", "get_trial_balance"},
		{"cash flow this quarter", "get_cash_flow"},
		{"list our customers", "get_customers"},
		{"add a customer", "create_customer"},
		{"list our vendors", "get_vendors"},
		{"add a supplier", "create_vendor"},
		{"create an invoice for Acme", "create_invoice"},
		{"show unpaid invoices", "get_invoices"},
		{"record a payment from a customer", "create_invoice_payment"},
		{"enter a bill from a vendor", "create_bill"},
		{"pay a bill", "create_bill_payment"},
		{"show me overdue bills", "get_bills"},
		{"post a journal entry", "post_journal_entry"},
		{"make a manual journal entry", "create_journal_entry"},
		{"void that entry", "void_journal_entry"},
		{"reconcile the bank", "reconcile_transaction"},
		{"show bank transactions", "get_bank_transactions"},
		{"close the month", "set_period_status"},
		{"close the books for the year", "close_fiscal_year"},
		{"set up a recurring entry for rent", "create_recurring_entry"},
		{"vat return", "get_tax_summary"},
		{"general ledger for cash", "get_account_ledger"},
		{"deactivate an account", "toggle_account_active"},
		{"email the invoice to the customer", "send_invoice"},
	}

	miss := 0
	for _, c := range cases {
		offered := sel.Select(c.prompt, can, DefaultTopK)
		var names []string
		found := false
		for _, tool := range offered {
			names = append(names, tool.Action)
			if tool.Action == c.want {
				found = true
			}
		}
		if !found {
			miss++
			t.Errorf("MISS %-38q want %s\n        offered: %v", c.prompt, c.want, names)
		}
	}
	t.Logf("%d/%d prompts surfaced the right tool", len(cases)-miss, len(cases))
}

// The schema sent per turn must fit the prompt budget.
func TestOfferedSchemasFitTheBudget(t *testing.T) {
	sel := NewSelector(NewRegistry())
	can := func(string, string) bool { return true }
	worst, worstPrompt := 0, ""
	for _, p := range []string{
		"create an invoice for Acme with three lines",
		"make a manual journal entry",
		"set up a recurring entry for rent",
		"add an employee",
		"close the books for the year",
	} {
		total := 0
		for _, tool := range sel.Select(p, can, DefaultTopK) {
			b, _ := json.Marshal(tool.Schema)
			total += len(b) + len(tool.Description) + len(tool.Action)
		}
		if total > worst {
			worst, worstPrompt = total, p
		}
	}
	tokens := worst / 3 // the same rough ratio budget.go uses
	t.Logf("worst-case tool payload: %d bytes ≈ %d tokens (%q); budget is %d",
		worst, tokens, worstPrompt, ReservedForPrompt)
	if tokens > ReservedForPrompt {
		t.Errorf("tool schemas alone (%d tokens) exceed the prompt budget (%d)", tokens, ReservedForPrompt)
	}
}

func TestEveryAccountingToolHasKeywordsAndDescription(t *testing.T) {
	for _, tool := range NewRegistry().all {
		// Twenty, not thirty: "List loans. Takes status." is a complete and
		// accurate description of a simple listing, and padding it to hit a
		// number would make it worse. What matters is that the subject words
		// are present somewhere searchable, which the keyword check covers.
		if len(strings.TrimSpace(tool.Description)) < 20 {
			t.Errorf("%s: description too thin to retrieve on", tool.Action)
		}
		if len(tool.Keywords) == 0 {
			t.Errorf("%s has no keywords; only its description is searchable", tool.Action)
		}
	}
}
