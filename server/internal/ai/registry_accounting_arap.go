package ai

// Invoices, bills and their payments — the two sides of trading. See the file
// comment on registry_accounting.go for the rules these follow.
var accountingARAPTools = []Tool{
	// ─── Invoices (money in) ──────────────────────────────────────────────
	{
		Action: "get_invoices",
		Description: "List invoices the company has issued — what customers have been billed and " +
			"what is still outstanding. Filter by customer, status or date range.",
		Schema: obj(map[string]any{
			"status":      invoiceStatus(),
			"customer_id": str("Only this customer's invoices, from get_customers."),
			"date_from":   date("Earliest invoice date."),
			"date_to":     date("Latest invoice date."),
		}),
		Keywords: []string{"invoices", "sales", "billed", "money in", "receivables", "what customers owe",
			"unpaid invoices", "overdue invoices", "outstanding invoices", "open invoices", "paid invoices"},
	},
	{
		Action:      "get_invoice",
		Description: "Read ONE invoice in full, with its line items, totals and payments.",
		Schema:      obj(map[string]any{"id": str("Invoice id, from get_invoices.")}, "id"),
		Keywords:    []string{"invoice details", "view invoice"},
	},
	{
		Action: "create_invoice",
		Description: "Raise an invoice to a customer. Each line names the revenue account it posts " +
			"to, so resolve accounts with get_accounts and the customer with get_customers first.",
		Module: "accounting", Fn: "create", Write: true,
		Schema: obj(map[string]any{
			"customer_id":    str("Customer being invoiced, from get_customers."),
			"invoice_date":   date("Date of the invoice."),
			"invoice_number": str("Invoice number. Left blank, the system assigns one."),
			"due_date":       date("When payment is due."),
			"memo":           str("Note shown on the invoice."),
			"reference":      str("PO or other reference."),
			"items":          lineItems("account_id", "The revenue account this line posts to, from get_accounts."),
		}, "customer_id", "invoice_date"),
		Keywords: []string{"create invoice", "bill a customer", "raise invoice", "new invoice", "charge customer"},
	},
	{
		Action:      "update_invoice",
		Description: "Change an unpaid invoice — its dates, memo, reference or line items.",
		Module:      "accounting", Fn: "edit", Write: true,
		Schema: obj(map[string]any{
			"id":             str("Invoice id, from get_invoices."),
			"customer_id":    str("Customer, from get_customers."),
			"invoice_date":   date("Date of the invoice."),
			"invoice_number": str("Invoice number."),
			"due_date":       date("When payment is due."),
			"memo":           str("Note shown on the invoice."),
			"reference":      str("PO or other reference."),
			"items":          lineItems("account_id", "The revenue account this line posts to."),
		}, "id"),
		Keywords: []string{"edit invoice", "change invoice", "amend invoice"},
	},
	{
		Action: "void_invoice",
		Description: "Void an invoice. It stays on the record marked void, which is the correct way " +
			"to cancel one that has already been issued.",
		Module: "accounting", Fn: "edit", Write: true,
		Schema:   obj(map[string]any{"id": str("Invoice id, from get_invoices.")}, "id"),
		Keywords: []string{"void invoice", "cancel invoice"},
	},
	{
		Action:      "delete_invoice",
		Description: "Permanently delete an invoice. Prefer void_invoice for anything already issued.",
		Module:      "accounting", Fn: "delete", Write: true,
		Schema:   obj(map[string]any{"id": str("Invoice id, from get_invoices.")}, "id"),
		Keywords: []string{"delete invoice", "remove invoice"},
	},
	{
		Action:      "send_invoice",
		Description: "Email an invoice to the customer. This sends a message on the company's behalf.",
		Module:      "accounting", Fn: "edit", Write: true,
		Schema: obj(map[string]any{
			"id":         str("Invoice id, from get_invoices."),
			"skip_email": boolean("Mark it sent without actually emailing."),
		}, "id"),
		Keywords: []string{"send invoice", "email invoice", "issue invoice to customer"},
	},
	{
		Action:      "get_invoice_payments",
		Description: "Payments received against one invoice.",
		Schema:      obj(map[string]any{"invoice_id": str("Invoice id, from get_invoices.")}, "invoice_id"),
		Keywords:    []string{"invoice payments", "what has been paid"},
	},
	{
		Action:      "create_invoice_payment",
		Description: "Record a payment RECEIVED from a customer against an invoice — money in.",
		Module:      "accounting", Fn: "create", Write: true,
		Schema: obj(map[string]any{
			"invoice_id":     str("Invoice being paid, from get_invoices."),
			"payment_date":   date("Date the money was received."),
			"amount":         num("Amount received, in pesos."),
			"payment_method": paymentMethod(),
			"reference_no":   str("Cheque number or transaction reference."),
			"account_id":     str("Bank or cash account the money landed in, from get_accounts."),
			"notes":          str("Notes."),
		}, "invoice_id", "payment_date", "amount"),
		Keywords: []string{"record payment", "customer paid", "receive payment", "money received", "collection"},
	},
	{
		Action:      "delete_invoice_payment",
		Description: "Remove a recorded customer payment, reversing its effect on the invoice's balance.",
		Module:      "accounting", Fn: "delete", Write: true,
		Schema:   obj(map[string]any{"id": str("Payment id, from get_invoice_payments.")}, "id"),
		Keywords: []string{"delete receipt", "undo customer payment", "reverse collection"},
	},

	// ─── Bills (money out) ────────────────────────────────────────────────
	{
		Action: "get_bills",
		Description: "List bills the company has received — what vendors have charged and what is " +
			"still unpaid. Filter by vendor, status or date range.",
		Schema: obj(map[string]any{
			"status":    billStatus(),
			"vendor_id": str("Only this vendor's bills, from get_vendors."),
			"date_from": date("Earliest bill date."),
			"date_to":   date("Latest bill date."),
		}),
		Keywords: []string{"bills", "purchases", "money out", "payables", "what we owe", "supplier invoices",
			"unpaid bills", "overdue bills", "outstanding bills", "open bills", "due bills"},
	},
	{
		Action:      "get_bill",
		Description: "Read ONE bill in full, with its line items, totals and payments.",
		Schema:      obj(map[string]any{"id": str("Bill id, from get_bills.")}, "id"),
		Keywords:    []string{"bill details", "view bill"},
	},
	{
		Action: "create_bill",
		Description: "Enter a bill received from a vendor. Each line names the expense account it " +
			"posts to, so resolve accounts with get_accounts and the vendor with get_vendors first.",
		Module: "accounting", Fn: "create", Write: true,
		Schema: obj(map[string]any{
			"vendor_id":   str("Vendor who sent the bill, from get_vendors."),
			"bill_date":   date("Date of the bill."),
			"bill_number": str("The vendor's bill or invoice number."),
			"due_date":    date("When payment is due."),
			"memo":        str("Note about the bill."),
			"reference":   str("PO or other reference."),
			"items":       lineItems("account_id", "The expense account this line posts to, from get_accounts."),
		}, "vendor_id", "bill_date"),
		Keywords: []string{"enter bill", "record bill", "vendor invoice", "new bill", "supplier charge"},
	},
	{
		Action:      "update_bill",
		Description: "Change an unpaid bill — its dates, memo, reference or line items.",
		Module:      "accounting", Fn: "edit", Write: true,
		Schema: obj(map[string]any{
			"id":          str("Bill id, from get_bills."),
			"vendor_id":   str("Vendor, from get_vendors."),
			"bill_date":   date("Date of the bill."),
			"bill_number": str("Vendor bill number."),
			"due_date":    date("When payment is due."),
			"memo":        str("Note about the bill."),
			"reference":   str("PO or other reference."),
			"items":       lineItems("account_id", "The expense account this line posts to."),
		}, "id"),
		Keywords: []string{"edit bill", "change bill", "amend bill"},
	},
	{
		Action:      "approve_bill",
		Description: "Approve a bill for payment, moving it out of draft and into the payables queue.",
		Module:      "accounting", Fn: "edit", Write: true,
		Schema:   obj(map[string]any{"id": str("Bill id, from get_bills.")}, "id"),
		Keywords: []string{"approve bill", "authorise payment", "ok the bill"},
	},
	{
		Action:      "void_bill",
		Description: "Void a bill. It stays on the record marked void rather than disappearing.",
		Module:      "accounting", Fn: "edit", Write: true,
		Schema:   obj(map[string]any{"id": str("Bill id, from get_bills.")}, "id"),
		Keywords: []string{"void bill", "cancel bill"},
	},
	{
		Action:      "delete_bill",
		Description: "Permanently delete a bill. Prefer void_bill for anything already entered and approved.",
		Module:      "accounting", Fn: "delete", Write: true,
		Schema:   obj(map[string]any{"id": str("Bill id, from get_bills.")}, "id"),
		Keywords: []string{"delete bill", "remove bill"},
	},
	{
		Action: "get_bill_payments",
		Description: "Payments made against ONE bill — what has been paid off it and when. Needs the " +
			"bill, so find it with get_bills first. For the overall picture of what the company has " +
			"paid and still owes, get_ap_summary is the one wanted.",
		Schema:   obj(map[string]any{"bill_id": str("Bill id, from get_bills.")}, "bill_id"),
		Keywords: []string{"bill payments", "what we have paid"},
	},
	{
		Action:      "create_bill_payment",
		Description: "Record a payment MADE to a vendor against a bill — money out.",
		Module:      "accounting", Fn: "create", Write: true,
		Schema: obj(map[string]any{
			"bill_id":        str("Bill being paid, from get_bills."),
			"payment_date":   date("Date the payment was made."),
			"amount":         num("Amount paid, in pesos."),
			"payment_method": paymentMethod(),
			"reference_no":   str("Cheque number or transaction reference."),
			"account_id":     str("Bank or cash account the money came from, from get_accounts."),
			"notes":          str("Notes."),
		}, "bill_id", "payment_date", "amount"),
		Keywords: []string{"pay bill", "paid vendor", "make payment", "money paid", "settle bill"},
	},
	{
		Action:      "delete_bill_payment",
		Description: "Remove a recorded bill payment, reversing its effect on the bill's balance.",
		Module:      "accounting", Fn: "delete", Write: true,
		Schema:   obj(map[string]any{"id": str("Payment id, from get_bill_payments.")}, "id"),
		Keywords: []string{"delete payment", "undo payment", "reverse payment"},
	},
}
