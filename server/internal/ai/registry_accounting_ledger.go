package ai

// Journal entries, banking, fiscal periods, recurring entries and the reports.
// See the file comment on registry_accounting.go for the rules these follow.
var accountingLedgerTools = []Tool{
	// ─── Journal entries ──────────────────────────────────────────────────
	{
		Action:      "get_journal_entry",
		Description: "Read ONE journal entry with all of its debit and credit lines.",
		Schema:      obj(map[string]any{"id": str("Entry id, from get_journal_entries.")}, "id"),
		Keywords:    []string{"journal entry", "entry details", "view entry"},
	},
	{
		Action:      "get_journal_lines",
		Description: "The individual debit and credit lines of one journal entry.",
		Schema:      obj(map[string]any{"entry_id": str("Entry id, from get_journal_entries.")}, "entry_id"),
		Keywords:    []string{"journal lines", "debits and credits", "entry lines"},
	},
	{
		Action: "create_journal_entry",
		Description: "Write a manual journal entry. Total debits MUST equal total credits, and every " +
			"line names an account from get_accounts. Created as a Draft — post_journal_entry is what " +
			"puts it into the ledger.",
		Module: "accounting", Fn: "create", Write: true,
		Schema: obj(map[string]any{
			"entry_date": date("Date of the entry."),
			"memo":       str("What the entry is for."),
			"lines":      journalLines(),
		}, "entry_date", "lines"),
		Keywords: []string{"journal entry", "manual entry", "debit and credit", "adjusting entry", "book an entry"},
	},
	{
		Action: "update_journal_entry",
		Description: "Change a DRAFT journal entry. Debits must still equal credits. Posted entries " +
			"cannot be edited — void and re-enter instead.",
		Module: "accounting", Fn: "edit", Write: true,
		Schema: obj(map[string]any{
			"id":         str("Entry id, from get_journal_entries."),
			"entry_date": date("Date of the entry."),
			"memo":       str("What the entry is for."),
			"lines":      journalLines(),
		}, "id"),
		Keywords: []string{"edit journal entry", "change entry", "fix entry"},
	},
	{
		Action: "post_journal_entry",
		Description: "Post a draft journal entry to the ledger. This is what makes it real, and it " +
			"cannot be edited afterwards — only voided.",
		Module: "accounting", Fn: "edit", Write: true,
		Schema:   obj(map[string]any{"id": str("Entry id, from get_journal_entries.")}, "id"),
		Keywords: []string{"post entry", "post journal", "commit entry", "finalise entry"},
	},
	{
		Action: "void_journal_entry",
		Description: "Void a posted journal entry, reversing its effect while leaving the audit trail " +
			"intact. The correct way to undo something already posted.",
		Module: "accounting", Fn: "edit", Write: true,
		Schema: obj(map[string]any{
			"id":     str("Entry id, from get_journal_entries."),
			"reason": str("Why it is being voided — kept on the record."),
		}, "id"),
		Keywords: []string{"void entry", "reverse entry", "undo posting", "cancel entry"},
	},
	{
		Action:      "delete_journal_entry",
		Description: "Permanently delete a DRAFT journal entry. Posted entries must be voided instead.",
		Module:      "accounting", Fn: "delete", Write: true,
		Schema:   obj(map[string]any{"id": str("Entry id, from get_journal_entries.")}, "id"),
		Keywords: []string{"delete entry", "remove draft entry"},
	},

	// ─── Banking ──────────────────────────────────────────────────────────
	{
		Action:      "get_bank_accounts",
		Description: "List the bank and cash accounts money actually moves through.",
		Schema:      obj(map[string]any{}),
		Keywords:    []string{"bank accounts", "cash accounts", "where the money is"},
	},
	{
		Action: "get_bank_transactions",
		Description: "Transactions on a bank account, optionally only those still unreconciled — the " +
			"working list when matching a statement.",
		Schema: obj(map[string]any{
			"account_id": str("Bank account id, from get_bank_accounts."),
			"reconciled": boolean("true for matched transactions only, false for unmatched only."),
		}),
		Keywords: []string{"bank transactions", "statement lines", "bank feed", "unreconciled"},
	},
	{
		Action:      "create_bank_transaction",
		Description: "Add a transaction to a bank account — a statement line to be matched against the books.",
		Module:      "accounting", Fn: "create", Write: true,
		Schema: obj(map[string]any{
			"account_id":  str("Bank account id, from get_bank_accounts."),
			"txn_date":    date("Date on the statement."),
			"description": str("Description as it appears on the statement."),
			"amount":      num("Amount. Negative for money leaving the account."),
			"reference":   str("Cheque number or bank reference."),
		}, "account_id", "txn_date", "amount"),
		Keywords: []string{"add bank transaction", "statement line", "import transaction"},
	},
	{
		Action:      "reconcile_transaction",
		Description: "Match a bank transaction to a journal entry, marking it reconciled.",
		Module:      "accounting", Fn: "edit", Write: true,
		Schema: obj(map[string]any{
			"id":       str("Bank transaction id, from get_bank_transactions."),
			"entry_id": str("Journal entry it matches, from get_journal_entries."),
		}, "id", "entry_id"),
		Keywords: []string{"reconcile", "match transaction", "tick off", "bank reconciliation"},
	},
	{
		Action:      "unreconcile_transaction",
		Description: "Undo a reconciliation, returning the transaction to the unmatched list.",
		Module:      "accounting", Fn: "edit", Write: true,
		Schema:   obj(map[string]any{"id": str("Bank transaction id, from get_bank_transactions.")}, "id"),
		Keywords: []string{"unreconcile", "unmatch", "undo reconciliation"},
	},
	{
		Action: "get_unmatched_journal_lines",
		Description: "Journal lines on a bank account with no bank transaction matched to them — the " +
			"other half of a reconciliation.",
		Schema:   obj(map[string]any{"account_id": str("Bank account id, from get_bank_accounts.")}),
		Keywords: []string{"unmatched entries", "outstanding items", "reconciliation candidates"},
	},

	// ─── Fiscal years and periods ─────────────────────────────────────────
	{
		Action:      "get_fiscal_years",
		Description: "List the company's fiscal years and whether each is open or closed.",
		Schema:      obj(map[string]any{}),
		Keywords:    []string{"fiscal year", "financial year", "accounting year"},
	},
	{
		Action: "get_fiscal_periods",
		Description: "The periods within a fiscal year and the status of each — which months are open " +
			"to post into.",
		Schema:   obj(map[string]any{"fiscal_year_id": str("Fiscal year id, from get_fiscal_years.")}),
		Keywords: []string{"periods", "months", "open period", "closed period"},
	},
	{
		Action:      "generate_fiscal_year",
		Description: "Create a fiscal year and its periods.",
		Module:      "accounting", Fn: "create", Write: true,
		Schema: obj(map[string]any{
			"name":         str("Name of the year, e.g. \"FY2026\"."),
			"start_date":   date("First day of the year."),
			"period_count": integer("How many periods to create. 12 for monthly, 4 for quarterly."),
		}, "name", "start_date"),
		Keywords: []string{"create fiscal year", "new financial year", "set up year"},
	},
	{
		Action:      "set_period_status",
		Description: "Open or close ONE accounting period. Closing stops anyone posting into it.",
		Module:      "accounting", Fn: "close", Write: true,
		Schema: obj(map[string]any{
			"id":     str("Period id, from get_fiscal_periods."),
			"status": periodStatus(),
		}, "id", "status"),
		Keywords: []string{"close period", "open period", "lock month", "close the month"},
	},
	{
		Action:      "set_all_period_status",
		Description: "Open or close EVERY period in a fiscal year at once.",
		Module:      "accounting", Fn: "close", Write: true,
		Schema: obj(map[string]any{
			"fiscal_year_id": str("Fiscal year id, from get_fiscal_years."),
			"status":         periodStatus(),
		}, "status"),
		Keywords: []string{"close all periods", "open all periods", "lock the year"},
	},
	{
		Action: "close_fiscal_year",
		Description: "Close a fiscal year. This posts the year's profit or loss into the equity account " +
			"given and locks the year — the largest single action in accounting. Confirm the equity " +
			"account with the user before proposing it.",
		Module: "accounting", Fn: "close", Write: true,
		Schema: obj(map[string]any{
			"fiscal_year_id":    str("Fiscal year id, from get_fiscal_years."),
			"equity_account_id": str("Equity account the result closes into, from get_accounts — usually Retained Earnings."),
			"notes":             str("Notes kept with the closing."),
		}, "fiscal_year_id", "equity_account_id"),
		Keywords: []string{"close the year", "year end", "close books", "year-end close", "closing entries"},
	},
	{
		Action:      "reopen_fiscal_year",
		Description: "Reopen a closed fiscal year, reversing the closing entries so it can be posted into again.",
		Module:      "accounting", Fn: "close", Write: true,
		Schema: obj(map[string]any{
			"fiscal_year_id": str("Fiscal year id, from get_fiscal_years."),
			"reason":         str("Why it is being reopened — kept on the record."),
		}, "fiscal_year_id"),
		Keywords: []string{"reopen year", "undo year end", "unlock the year"},
	},

	// ─── Recurring entries ────────────────────────────────────────────────
	{
		Action:      "get_recurring_entries",
		Description: "List the recurring journal entries set up to repeat — rent, depreciation, subscriptions.",
		Schema:      obj(map[string]any{}),
		Keywords:    []string{"recurring", "repeating entries", "standing entries", "scheduled entries"},
	},
	{
		Action:      "get_due_recurring",
		Description: "Recurring entries due to run now.",
		Schema:      obj(map[string]any{}),
		Keywords:    []string{"due recurring", "what is due", "pending recurring"},
	},
	{
		Action:      "create_recurring_entry",
		Description: "Set up a journal entry that repeats on a schedule. Debits must equal credits, as with any entry.",
		Module:      "accounting", Fn: "create", Write: true,
		Schema: obj(map[string]any{
			"name":              str("What to call this recurring entry."),
			"start_date":        date("First run date."),
			"frequency":         recurFrequency(),
			"interval_count":    integer("Run every N of the chosen frequency. 1 for every month, 3 for quarterly."),
			"end_date":          date("Stop after this date. Omit to run indefinitely."),
			"occurrences_limit": integer("Stop after this many runs."),
			"auto_post":         boolean("Post each generated entry automatically instead of leaving it a draft."),
			"memo":              str("Memo carried onto each generated entry."),
			"lines":             journalLines(),
		}, "name", "start_date"),
		Keywords: []string{"recurring entry", "repeat monthly", "standing journal", "schedule an entry"},
	},
	{
		Action:      "update_recurring_entry",
		Description: "Change a recurring entry's schedule, memo or lines.",
		Module:      "accounting", Fn: "edit", Write: true,
		Schema: obj(map[string]any{
			"id":                str("Recurring entry id, from get_recurring_entries."),
			"name":              str("Name."),
			"frequency":         recurFrequency(),
			"interval_count":    integer("Run every N of the chosen frequency."),
			"end_date":          date("Stop after this date."),
			"occurrences_limit": integer("Stop after this many runs."),
			"auto_post":         boolean("Post generated entries automatically."),
			"memo":              str("Memo."),
			"lines":             journalLines(),
		}, "id"),
		Keywords: []string{"edit recurring", "change schedule", "update repeating entry"},
	},
	{
		Action: "run_recurring_now",
		Description: "Generate this recurring entry's next journal entry immediately, rather than " +
			"waiting for its schedule.",
		Module: "accounting", Fn: "edit", Write: true,
		Schema:   obj(map[string]any{"id": str("Recurring entry id, from get_recurring_entries.")}, "id"),
		Keywords: []string{"run now", "generate entry", "trigger recurring"},
	},
	{
		Action:      "toggle_recurring_active",
		Description: "Pause or resume a recurring entry without deleting it.",
		Module:      "accounting", Fn: "edit", Write: true,
		Schema: obj(map[string]any{
			"id":     str("Recurring entry id, from get_recurring_entries."),
			"active": boolean("true to resume, false to pause."),
		}, "id"),
		Keywords: []string{"pause recurring", "stop repeating", "resume recurring", "disable schedule"},
	},
	{
		Action:      "delete_recurring_entry",
		Description: "Delete a recurring entry. Entries it already generated are untouched.",
		Module:      "accounting", Fn: "delete", Write: true,
		Schema:   obj(map[string]any{"id": str("Recurring entry id, from get_recurring_entries.")}, "id"),
		Keywords: []string{"delete recurring", "remove schedule"},
	},

	// ─── Reports ──────────────────────────────────────────────────────────
	{
		Action: "get_trial_balance",
		Description: "Trial balance — every account with its debit and credit totals for a period, and " +
			"whether the books balance.",
		Schema: obj(map[string]any{
			"date_from": date("Start of the period."),
			"date_to":   date("End of the period."),
		}),
		Keywords: []string{"trial balance", "tb", "do the books balance"},
	},
	{
		Action: "get_income_statement",
		Description: "Income statement — revenue less expenses for a period, and the profit or loss. " +
			"The answer to \"did we make money\".",
		Schema: obj(map[string]any{
			"date_from": date("Start of the period."),
			"date_to":   date("End of the period."),
		}),
		Keywords: []string{"income statement", "profit and loss", "p&l", "pnl", "did we make money", "earnings", "profit"},
	},
	{
		Action: "get_balance_sheet",
		Description: "Balance sheet as at a date — assets, liabilities and equity. The answer to " +
			"\"what do we own and what do we owe\".",
		Schema:   obj(map[string]any{"as_of": date("The date to report as at. Defaults to today.")}),
		Keywords: []string{"balance sheet", "financial position", "what we own", "assets and liabilities", "net worth"},
	},
	{
		Action:      "get_cash_flow",
		Description: "Cash flow for a period — where cash came from and where it went.",
		Schema: obj(map[string]any{
			"date_from": date("Start of the period."),
			"date_to":   date("End of the period."),
		}),
		Keywords: []string{"cash flow", "cashflow", "where the cash went", "cash movement"},
	},
	{
		Action:      "get_ar_aging",
		Description: "Receivables aging — who owes the company money and how overdue each amount is.",
		Schema:      obj(map[string]any{}),
		Keywords:    []string{"ar aging", "who owes us", "overdue invoices", "receivables aging", "debtors"},
	},
	{
		Action:      "get_ap_aging",
		Description: "Payables aging — who the company owes and how overdue each amount is.",
		Schema:      obj(map[string]any{}),
		Keywords:    []string{"ap aging", "who we owe", "overdue bills", "payables aging", "creditors"},
	},
	{
		Action:      "get_ar_summary",
		Description: "Receivables at a glance — total outstanding, overdue and collected.",
		Schema:      obj(map[string]any{}),
		Keywords:    []string{"receivables summary", "ar total", "outstanding invoices"},
	},
	{
		Action:      "get_ap_summary",
		Description: "Payables at a glance — total outstanding, overdue and paid.",
		Schema:      obj(map[string]any{}),
		Keywords:    []string{"payables summary", "ap total", "outstanding bills"},
	},
	{
		Action:      "get_ledger_summary",
		Description: "Totals per account over a period — a condensed general ledger.",
		Schema: obj(map[string]any{
			"date_from": date("Start of the period."),
			"date_to":   date("End of the period."),
		}),
		Keywords: []string{"ledger summary", "account totals", "gl summary"},
	},
	{
		Action:      "get_tax_summary",
		Description: "Tax collected and paid over a period — the starting point for a VAT return.",
		Schema: obj(map[string]any{
			"date_from": date("Start of the period."),
			"date_to":   date("End of the period."),
		}),
		Keywords: []string{"tax summary", "vat", "bir", "tax return", "input and output tax"},
	},
	{
		Action:      "get_tax_detail",
		Description: "The individual transactions behind a tax figure.",
		Schema: obj(map[string]any{
			"account_id": str("Tax account id, from get_accounts."),
			"date_from":  date("Start of the period."),
			"date_to":    date("End of the period."),
		}),
		Keywords: []string{"tax detail", "vat detail", "tax transactions"},
	},
}
