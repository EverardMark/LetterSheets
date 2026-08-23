package ai

import (
	"sort"
	"strings"
)

// listActionFor finds the read that lists the records a write needs an id from.
//
// "approve the purchase order" cannot be proposed without a purchase order id,
// and the user has none — they said "the purchase order" because they expect
// the system to know what that means. Reading the list is how it comes to know.
//
// Derived rather than tabulated: a table of 278 writes mapped to their reads
// would be wrong the day a tool is added. The action's own name carries the
// answer — approve_pur_order needs pur_orders, toggle_account_active needs
// accounts — as long as the search is willing to shorten the subject and to
// borrow the module prefix, which is where the irregular ones live
// (create_fa_maintenance needs an asset_id, and the assets are under get_fa_assets).
func listActionFor(reg *Registry, tool Tool, field string) (Tool, bool) {
	base := strings.TrimSuffix(field, "_id")
	if field == "id" {
		base = subjectOf(tool.Action)
	}
	if base == "" {
		return Tool{}, false
	}

	prefix := modulePrefix(tool.Action)
	parts := strings.Split(base, "_")

	// Longest form first, shortening from the right: account_active before
	// account, so a tool with a compound subject still finds its own list
	// before falling back to its family's.
	for n := len(parts); n >= 1; n-- {
		stem := strings.Join(parts[:n], "_")
		for _, candidate := range []string{
			"get_" + stem + "s",
			"get_" + stem,
			"get_" + prefix + "_" + stem + "s",
			"get_" + prefix + "_" + stem,
		} {
			if prefix == "" && strings.Contains(candidate, "__") {
				continue
			}
			if found, ok := reg.Lookup(candidate); ok && isListing(found) {
				return found, true
			}
		}
	}

	// Nothing matched by name. Fall back to any listing whose own subject ends
	// with the stem — get_inv_products answers a product_id that no prefix
	// rule would have reached.
	for n := len(parts); n >= 1; n-- {
		stem := strings.Join(parts[:n], "_")
		for _, candidate := range reg.All() {
			if !isListing(candidate) {
				continue
			}
			s := subjectOf(candidate.Action)
			if s == stem+"s" || s == stem {
				return candidate, true
			}
		}
	}
	return Tool{}, false
}

// isListing reports a read that can be called with no arguments — the only kind
// useful for finding an id you do not have.
func isListing(t Tool) bool {
	if t.Write || !strings.HasPrefix(t.Action, "get_") {
		return false
	}
	req, ok := t.Schema["required"].([]string)
	return !ok || len(req) == 0
}

func subjectOf(action string) string {
	if i := strings.IndexByte(action, '_'); i >= 0 {
		return action[i+1:]
	}
	return ""
}

// modulePrefix is the short module tag some action families carry — the "fa" of
// create_fa_maintenance, the "so" of create_so_shipment. It is what tells an
// asset_id in a fixed-asset action apart from one anywhere else.
func modulePrefix(action string) string {
	parts := strings.Split(subjectOf(action), "_")
	if len(parts) < 2 {
		return ""
	}
	switch parts[0] {
	case "fa", "so", "po", "pur", "inv", "exp", "crm", "coa", "payroll", "leave", "ticket", "onboarding":
		return parts[0]
	}
	return ""
}

// missingIDFor returns the first required field of a write that is an id, and
// the listing that would supply it.
func missingIDFor(reg *Registry, tool Tool) (string, Tool, bool) {
	req, _ := tool.Schema["required"].([]string)
	for _, field := range req {
		if field != "id" && !strings.HasSuffix(field, "_id") {
			continue
		}
		if list, found := listActionFor(reg, tool, field); found {
			return field, list, true
		}
	}

	// Nothing REQUIRED is an id, but the action may still take one — several
	// handlers validate nothing at all. pay_exp_claim declares no required
	// fields and is meaningless without a claim; going by the required list
	// alone left it with no way to find one.
	props, ok := tool.Schema["properties"].(map[string]any)
	if !ok {
		return "", Tool{}, false
	}
	for _, field := range []string{"id"} {
		if _, has := props[field]; has {
			if list, found := listActionFor(reg, tool, field); found {
				return field, list, true
			}
		}
	}
	var others []string
	for name := range props {
		if strings.HasSuffix(name, "_id") {
			others = append(others, name)
		}
	}
	sort.Strings(others) // deterministic when a write takes several
	for _, field := range others {
		if list, found := listActionFor(reg, tool, field); found {
			return field, list, true
		}
	}
	return "", Tool{}, false
}
