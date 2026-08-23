package ai

import "testing"

func TestListActionForEveryWriteThatNeedsAnID(t *testing.T) {
	reg := NewRegistry()
	cases := map[string]string{
		"approve_pur_order":      "get_pur_orders",
		"update_bill":            "get_bills",
		"send_invoice":           "get_invoices",
		"toggle_account_active":  "get_accounts",
		"toggle_customer_active": "get_customers",
		"toggle_vendor_active":   "get_vendors",
		"create_so_shipment":     "get_so_orders",
		"create_pur_receipt":     "get_pur_orders",
		"generate_so_invoice":    "get_so_orders",
		"create_so_quote":        "get_customers",
		"pay_exp_claim":          "get_exp_claims",
	}
	for action, want := range cases {
		tool, ok := reg.Lookup(action)
		if !ok {
			t.Errorf("%s not in the registry", action)
			continue
		}
		field, list, found := missingIDFor(reg, tool)
		if !found {
			t.Errorf("%s: no listing found (required=%v)", action, tool.Schema["required"])
			continue
		}
		if list.Action != want {
			t.Errorf("%s (%s) -> %s, want %s", action, field, list.Action, want)
		}
	}
}

func TestAListingIsCallableWithNoArguments(t *testing.T) {
	reg := NewRegistry()
	for _, tool := range reg.All() {
		if !tool.Write {
			continue
		}
		if _, list, ok := missingIDFor(reg, tool); ok {
			if req, has := list.Schema["required"].([]string); has && len(req) > 0 {
				t.Errorf("%s resolves to %s, which itself requires %v", tool.Action, list.Action, req)
			}
			if list.Write {
				t.Errorf("%s resolves to %s, which is a write", tool.Action, list.Action)
			}
		}
	}
}
