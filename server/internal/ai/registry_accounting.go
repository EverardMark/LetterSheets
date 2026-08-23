package ai

// The accounting module, as tools.
//
// Kept in its own file because it is bigger than everything else combined: the
// module is ~107 actions against the ~19 the rest of the ERP exposes, and
// mixing them into one literal would bury the HR tools entirely.
//
// Three rules held throughout, each learned from a tool that misbehaved without
// it:
//
//   - Enums mirror the accounting pages exactly. A model offered "Posted" where
//     the UI says "posted" produces a write that fails validation after the
//     user has already confirmed it.
//   - Required means "cannot be invented". An account code, an invoice date, a
//     customer — asking is right; guessing writes a wrong number into a ledger.
//   - Descriptions carry the words a user actually types ("who owes us", "money
//     in", "close the books"), because retrieval is BM25 over this text and the
//     model never sees a tool the selector did not surface.
var accountingTools = []Tool{
	// ─── Chart of accounts ────────────────────────────────────────────────
	{
		Action: "get_account",
		Description: "Read ONE account from the chart of accounts by id, including its balance, " +
			"parent and settings.",
		Schema:   obj(map[string]any{"id": str("Account id, from get_accounts.")}, "id"),
		Keywords: []string{"account details", "gl account", "ledger account"},
	},
	{
		Action: "get_account_tree",
		Description: "The chart of accounts as a hierarchy — headers with their child accounts " +
			"nested underneath. Use when the user wants the structure rather than a flat list.",
		Schema:   obj(map[string]any{}),
		Keywords: []string{"account tree", "hierarchy", "chart structure", "parent accounts"},
	},
	{
		Action: "update_account",
		Description: "Change an existing account in the chart of accounts — rename it, recode it, " +
			"move it under a different parent, change its type or description.",
		Module: "accounting", Fn: "edit", Write: true,
		Schema: obj(map[string]any{
			"id":              str("Account id, from get_accounts."),
			"code":            str("New account code."),
			"name":            str("New account name."),
			"account_type":    acctType("Statement category."),
			"account_subtype": acctSubtype(),
			"description":     str("What the account is for."),
			"parent_id":       str("Id of the parent account to nest under."),
		}, "id"),
		Keywords: []string{"rename account", "edit account", "change account", "recode"},
	},
	{
		Action: "toggle_account_active",
		Description: "Activate or deactivate an account. Deactivating hides it from new entries " +
			"without deleting its history — the usual way to retire an account.",
		Module: "accounting", Fn: "edit", Write: true,
		Schema: obj(map[string]any{
			"id":        str("Account id, from get_accounts."),
			"is_active": boolean("true to activate, false to deactivate."),
		}, "id", "is_active"),
		Keywords: []string{"deactivate account", "disable account", "archive account", "retire account", "reactivate"},
	},
	{
		Action: "delete_account",
		Description: "Permanently delete an account from the chart of accounts. Only possible " +
			"while it has no entries — prefer toggle_account_active to retire one that has been used.",
		Module: "accounting", Fn: "delete", Write: true,
		Schema:   obj(map[string]any{"id": str("Account id, from get_accounts.")}, "id"),
		Keywords: []string{"delete account", "remove account"},
	},
	{
		Action: "get_account_ledger",
		Description: "Every posted transaction against ONE account over a date range, with a " +
			"running balance. The answer to \"what has gone through this account\".",
		Schema: obj(map[string]any{
			"account_id": str("Account id, from get_accounts."),
			"date_from":  date("Start of the range."),
			"date_to":    date("End of the range."),
		}, "account_id"),
		Keywords: []string{"ledger", "account activity", "transactions for account", "general ledger", "gl detail"},
	},
	{
		Action:      "get_coa_templates",
		Description: "List the ready-made chart of accounts templates a company can be set up from.",
		Schema:      obj(map[string]any{}),
		Keywords:    []string{"coa template", "account template", "standard chart"},
	},
	{
		Action: "apply_coa_template",
		Description: "Set up the chart of accounts from a template. Optionally clears the existing " +
			"chart first, which destroys the current accounts — say so plainly when proposing it.",
		Module: "accounting", Fn: "create", Write: true,
		Schema: obj(map[string]any{
			"template_id":    str("Template id, from get_coa_templates."),
			"clear_existing": boolean("Delete the current chart of accounts before applying. Destructive."),
		}, "template_id"),
		Keywords: []string{"apply template", "set up chart of accounts", "initialise accounts"},
	},

	// ─── Customers (AR) ───────────────────────────────────────────────────
	{
		Action: "get_customers",
		Description: "List customers — who the company sells to and bills. Use this to resolve a " +
			"customer name to the customer_id an invoice needs.",
		Schema:   obj(map[string]any{"active_only": boolean("Exclude deactivated customers.")}),
		Keywords: []string{"customers", "clients", "who we bill", "accounts receivable", "buyers"},
	},
	{
		Action:      "get_customer",
		Description: "Read ONE customer's record — contact details, terms and balance.",
		Schema:      obj(map[string]any{"customer_id": str("Customer id, from get_customers.")}, "customer_id"),
		Keywords:    []string{"customer details", "client record"},
	},
	{
		Action:      "create_customer",
		Description: "Add a customer the company can invoice.",
		Module:      "accounting", Fn: "create", Write: true,
		Schema: obj(map[string]any{
			"name":           str("Customer or company name."),
			"contact_person": str("Who to deal with there."),
			"email":          str("Email address."),
			"phone":          str("Phone number."),
			"address":        str("Street address."),
			"city":           str("City."),
			"province":       str("Province."),
			"zip_code":       str("Postal code."),
			"tin":            str("Tax identification number."),
			"payment_terms":  integer("Days to pay, e.g. 30."),
			"credit_limit":   num("Maximum outstanding balance allowed."),
			"notes":          str("Free-text notes."),
		}, "name"),
		Keywords: []string{"add customer", "new client", "register customer"},
	},
	{
		Action:      "update_customer",
		Description: "Change a customer's details — contact, address, terms or credit limit.",
		Module:      "accounting", Fn: "edit", Write: true,
		Schema: obj(map[string]any{
			"id":             str("Customer id, from get_customers."),
			"name":           str("Customer name."),
			"contact_person": str("Contact person."),
			"email":          str("Email address."),
			"phone":          str("Phone number."),
			"address":        str("Street address."),
			"city":           str("City."),
			"province":       str("Province."),
			"zip_code":       str("Postal code."),
			"tin":            str("Tax identification number."),
			"payment_terms":  integer("Days to pay."),
			"credit_limit":   num("Credit limit."),
			"notes":          str("Notes."),
		}, "id"),
		Keywords: []string{"edit customer", "update client", "change customer"},
	},
	{
		Action:      "toggle_customer_active",
		Description: "Activate or deactivate a customer, hiding them from new invoices without losing history.",
		Module:      "accounting", Fn: "edit", Write: true,
		Schema:   obj(map[string]any{"id": str("Customer id, from get_customers.")}, "id"),
		Keywords: []string{"deactivate customer", "archive client", "disable customer"},
	},
	{
		Action:      "delete_customer",
		Description: "Permanently delete a customer. Only possible with no invoices against them.",
		Module:      "accounting", Fn: "delete", Write: true,
		Schema:   obj(map[string]any{"id": str("Customer id, from get_customers.")}, "id"),
		Keywords: []string{"delete customer", "remove client"},
	},

	// ─── Vendors (AP) ─────────────────────────────────────────────────────
	{
		Action: "get_vendors",
		Description: "List vendors and suppliers — who the company buys from and owes. Use this to " +
			"resolve a vendor name to the vendor_id a bill needs.",
		Schema:   obj(map[string]any{"active_only": boolean("Exclude deactivated vendors.")}),
		Keywords: []string{"vendors", "suppliers", "who we owe", "accounts payable", "payees"},
	},
	{
		Action:      "get_vendor",
		Description: "Read ONE vendor's record — contact details, terms and balance.",
		Schema:      obj(map[string]any{"id": str("Vendor id, from get_vendors.")}, "id"),
		Keywords:    []string{"vendor details", "supplier record"},
	},
	{
		Action:      "create_vendor",
		Description: "Add a vendor or supplier the company can receive bills from.",
		Module:      "accounting", Fn: "create", Write: true,
		Schema: obj(map[string]any{
			"name":           str("Vendor or supplier name."),
			"contact_person": str("Who to deal with there."),
			"email":          str("Email address."),
			"phone":          str("Phone number."),
			"address":        str("Street address."),
			"city":           str("City."),
			"province":       str("Province."),
			"zip_code":       str("Postal code."),
			"tin":            str("Tax identification number."),
			"payment_terms":  integer("Days to pay, e.g. 30."),
			"notes":          str("Free-text notes."),
		}, "name"),
		Keywords: []string{"add vendor", "new supplier", "register vendor"},
	},
	{
		Action:      "update_vendor",
		Description: "Change a vendor's details — contact, address or payment terms.",
		Module:      "accounting", Fn: "edit", Write: true,
		Schema: obj(map[string]any{
			"id":             str("Vendor id, from get_vendors."),
			"name":           str("Vendor name."),
			"contact_person": str("Contact person."),
			"email":          str("Email address."),
			"phone":          str("Phone number."),
			"address":        str("Street address."),
			"city":           str("City."),
			"province":       str("Province."),
			"zip_code":       str("Postal code."),
			"tin":            str("Tax identification number."),
			"payment_terms":  integer("Days to pay."),
			"notes":          str("Notes."),
		}, "id"),
		Keywords: []string{"edit vendor", "update supplier", "change vendor"},
	},
	{
		Action:      "toggle_vendor_active",
		Description: "Activate or deactivate a vendor, hiding them from new bills without losing history.",
		Module:      "accounting", Fn: "edit", Write: true,
		Schema:   obj(map[string]any{"id": str("Vendor id, from get_vendors.")}, "id"),
		Keywords: []string{"deactivate vendor", "archive supplier", "disable vendor"},
	},
	{
		Action:      "delete_vendor",
		Description: "Permanently delete a vendor. Only possible with no bills against them.",
		Module:      "accounting", Fn: "delete", Write: true,
		Schema:   obj(map[string]any{"id": str("Vendor id, from get_vendors.")}, "id"),
		Keywords: []string{"delete vendor", "remove supplier"},
	},
}

// acctType and acctSubtype mirror TYPES and SUBTYPES in accounting.jsx. The
// subtype list is the union of all five types' options, since JSON Schema
// cannot express "valid subtypes depend on the type chosen" — the description
// carries that rule instead.
func acctType(desc string) map[string]any {
	return map[string]any{
		"type":        "string",
		"enum":        []string{"Asset", "Liability", "Equity", "Revenue", "Expense"},
		"description": desc,
	}
}

func acctSubtype() map[string]any {
	return map[string]any{
		"type": "string",
		"enum": []string{
			"Current Asset", "Fixed Asset", "Other Asset",
			"Current Liability", "Long-term Liability", "Other Liability",
			"Owner Equity", "Retained Earnings",
			"Operating Revenue", "Other Revenue",
			"Operating Expense", "Cost of Sales", "Other Expense",
			"Header",
		},
		"description": "Finer classification. Must belong to the account_type: Asset takes the " +
			"Asset subtypes, Expense takes Operating Expense / Cost of Sales / Other Expense, and so on. " +
			"Header marks a grouping account that holds no entries itself.",
	}
}

// lineItems is the shape shared by invoice and bill lines. The account field is
// named per document because the description differs — revenue for an invoice,
// expense for a bill — and a model given "the account" picks the wrong side.
func lineItems(accountField, accountDesc string) map[string]any {
	return map[string]any{
		"type":        "array",
		"description": "The lines making up the document. At least one is needed for it to total anything.",
		"items": map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"required":             []string{accountField, "quantity", "unit_price"},
			"properties": map[string]any{
				accountField:  str(accountDesc),
				"description": str("What this line is for."),
				"quantity":    num("How many."),
				"unit_price":  num("Price each, in pesos."),
				"tax_rate":    num("Tax percentage for this line, e.g. 12 for 12% VAT. Omit for none."),
			},
		},
	}
}

func invoiceStatus() map[string]any {
	return map[string]any{
		"type":        "string",
		"enum":        []string{"Draft", "Sent", "Partial", "Paid", "Overdue", "Void"},
		"description": "Only invoices in this state.",
	}
}

func billStatus() map[string]any {
	return map[string]any{
		"type":        "string",
		"enum":        []string{"Draft", "Approved", "Partial", "Paid", "Overdue", "Void"},
		"description": "Only bills in this state.",
	}
}

func paymentMethod() map[string]any {
	return map[string]any{
		"type":        "string",
		"enum":        []string{"Cash", "Check", "Bank Transfer", "Credit Card", "GCash", "Other"},
		"description": "How the money moved.",
	}
}

// journalLines is the debit/credit shape shared by manual and recurring entries.
// Both sides are on every line because that is how the ledger stores them: a
// line carries either a debit or a credit, and the model must be able to say
// which.
func journalLines() map[string]any {
	return map[string]any{
		"type": "array",
		"description": "The debit and credit lines. Total debits MUST equal total credits or the " +
			"entry will be rejected. Each line carries a debit OR a credit, not both.",
		"items": map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"required":             []string{"account_id"},
			"properties": map[string]any{
				"account_id":  str("Account this line hits, from get_accounts."),
				"description": str("What this line is for."),
				"debit":       num("Debit amount. Zero or omitted if this is a credit line."),
				"credit":      num("Credit amount. Zero or omitted if this is a debit line."),
			},
		},
	}
}

func periodStatus() map[string]any {
	return map[string]any{
		"type":        "string",
		"enum":        []string{"Open", "Closed"},
		"description": "Open allows posting into the period; Closed prevents it.",
	}
}

func recurFrequency() map[string]any {
	return map[string]any{
		"type":        "string",
		"enum":        []string{"Daily", "Weekly", "Monthly", "Quarterly", "Yearly"},
		"description": "How often the entry repeats.",
	}
}
