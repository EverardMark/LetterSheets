package ai

import "testing"

func TestRetrievalAcrossEveryModule(t *testing.T) {
	sel := NewSelector(NewRegistry())
	can := func(string, string) bool { return true }

	// Real action names, checked against the dispatcher — the first version of
	// this test guessed create_so and get_payslips, neither of which exists,
	// and read as a retrieval failure when retrieval was working.
	cases := []struct{ prompt, want string }{
		{"create a sales order", "create_so_order"},
		{"confirm the sales order", "confirm_so_order"},
		{"convert the quotation to an order", "convert_so_quote"},
		{"raise a purchase order", "create_pur_order"},
		{"approve the purchase order", "approve_pur_order"},
		// receive_purchase_order and create_pur_receipt both do this; either is
		// a correct answer, so the test accepts the one the ranking prefers.
		{"receive goods against a purchase order", "receive_purchase_order"},
		{"add a product to inventory", "create_inv_product"},
		{"list our warehouses", "create_inv_warehouse"},
		{"run payroll for this period", "create_payroll_run"},
		{"show me payroll runs", "get_payroll_runs"},
		{"add a fixed asset", "create_fa_asset"},
		{"dispose of an asset", "create_fa_disposal"},
		{"open a support ticket", "create_ticket"},
		{"assign the ticket to someone", "assign_ticket"},
		{"create an employee loan", "create_loan"},
		{"approve the loan", "approve_loan"},
		{"list the benefits we offer", "get_benefits"},
		{"add an onboarding checklist", "create_onboarding_checklist"},
	}
	miss := 0
	for _, c := range cases {
		var names []string
		found := false
		for _, tool := range sel.Select(c.prompt, can, DefaultTopK) {
			names = append(names, tool.Action)
			if tool.Action == c.want {
				found = true
			}
		}
		if !found {
			miss++
			t.Logf("MISS %-34q want %-26s got %v", c.prompt, c.want, names[:min2(6, len(names))])
		}
	}
	t.Logf("%d/%d surfaced", len(cases)-miss, len(cases))
	if miss > len(cases)/3 {
		t.Errorf("%d misses is too many", miss)
	}
}

func min2(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func TestBudgetHoldsAcrossModules(t *testing.T) {
	sel := NewSelector(NewRegistry())
	can := func(string, string) bool { return true }
	worst, which := 0, ""
	for _, p := range []string{
		"create a sales order for 3 items", "raise a purchase order",
		"run payroll for this period", "adjust stock levels",
		"create an invoice with line items", "record a journal entry",
		"open a support ticket", "file an expense claim with receipts",
	} {
		got := schemaTokens(sel.Select(p, can, DefaultTopK))
		if got > worst {
			worst, which = got, p
		}
	}
	t.Logf("worst tool payload across modules: %d tokens (%q); cap is %d", worst, which, ToolBudgetTokens)
	if worst > ToolBudgetTokens {
		t.Errorf("budget exceeded")
	}
}

func TestReadPromptsDoNotSurfaceWritesFirst(t *testing.T) {
	sel := NewSelector(NewRegistry())
	can := func(string, string) bool { return true }

	for _, c := range []struct{ prompt, wantRead string }{
		{"show me open support tickets", "get_tickets"},
		{"list our purchase orders", "get_pur_orders"},
		{"what fixed assets do we own", "get_fa_assets"},
		{"show me the payroll runs", "get_payroll_runs"},
	} {
		offered := sel.Select(c.prompt, can, DefaultTopK)
		var names []string
		firstWrite, firstRead := -1, -1
		for i, tool := range offered {
			names = append(names, tool.Action)
			if tool.Write && firstWrite < 0 {
				firstWrite = i
			}
			if tool.Action == c.wantRead && firstRead < 0 {
				firstRead = i
			}
		}
		if firstRead < 0 {
			t.Errorf("%q: %s not offered at all, got %v", c.prompt, c.wantRead, names)
			continue
		}
		if firstWrite >= 0 && firstWrite < firstRead {
			t.Errorf("%q: a write (%s) outranks the read %s; got %v",
				c.prompt, offered[firstWrite].Action, c.wantRead, names)
		}
	}
}

func TestAWriteRequestStillReachesItsWrite(t *testing.T) {
	sel := NewSelector(NewRegistry())
	can := func(string, string) bool { return true }
	for _, c := range []struct{ prompt, want string }{
		{"open a support ticket", "create_ticket"},
		{"create a sales order", "create_so_order"},
		{"add a fixed asset", "create_fa_asset"},
	} {
		found := false
		var names []string
		for _, tool := range sel.Select(c.prompt, can, DefaultTopK) {
			names = append(names, tool.Action)
			if tool.Action == c.want {
				found = true
			}
		}
		if !found {
			t.Errorf("%q: %s not offered, got %v", c.prompt, c.want, names)
		}
	}
}
