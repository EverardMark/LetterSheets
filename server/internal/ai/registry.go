package ai

import "sort"

// Tool is one ERP action exposed to the model.
//
// The set below is a deliberate allowlist, not a projection of all 451 actions
// in the dispatch switch. Two reasons. First, authorize() defaults to ALLOW for
// actions absent from actionPerm, so auto-deriving the tool set would silently
// hand the model every ungated action the day one is added. Second, a tool the
// model cannot invoke correctly is worse than one it does not have — each entry
// needs a description and schema written for a reader that has never seen the
// UI. Growing this list is a deliberate act; see the doc comment on Registry.
type Tool struct {
	// Action is the value passed as ?action= to /api/execute. Executing through
	// the real endpoint (rather than calling a repo directly) is what keeps the
	// model inside the caller's existing permissions and tenant scope.
	Action string

	// Module and Fn mirror the entry in actionPerm, or are empty for actions
	// that need only a valid session. They are used to pre-filter the tool list
	// so the model is never shown a tool the caller could not run anyway —
	// enforcement still happens in authorize(), this is purely to stop the model
	// proposing something that is going to be refused.
	Module string
	Fn     string

	// Write marks an action that mutates data. Write tools are never executed
	// straight from a model turn: they are returned to the client as a proposed
	// action for a human to confirm.
	Write bool

	Description string
	Schema      map[string]any

	// Curated marks a tool written by hand rather than generated from the
	// handler's request struct.
	//
	// It carries a ranking preference. Generated tools cover the long tail, and
	// there are four times as many of them: nine onboarding actions between
	// them outranked create_employee for "new hire starting monday", and three
	// receipt-shaped reads buried create_exp_claim for "reimburse me for the
	// client lunch receipt". A hand-written description was written to be found
	// by the words a user types; a generated one was derived from a struct. On
	// a close call the former is what the user meant.
	Curated bool

	// Keywords are extra retrieval terms for the selector — the vocabulary a
	// user might type that does not appear in Action or Description
	// ("sick day", "vacation" → create_leave).
	Keywords []string
}

// obj is a small helper so the schema literals below stay readable.
func obj(props map[string]any, required ...string) map[string]any {
	s := map[string]any{"type": "object", "properties": props}
	if len(required) > 0 {
		s["required"] = required
	} else {
		s["required"] = []string{}
	}
	s["additionalProperties"] = false
	return s
}

func str(desc string) map[string]any  { return map[string]any{"type": "string", "description": desc} }
func num(desc string) map[string]any  { return map[string]any{"type": "number", "description": desc} }
func integer(d string) map[string]any { return map[string]any{"type": "integer", "description": d} }
func boolean(d string) map[string]any { return map[string]any{"type": "boolean", "description": d} }

// date documents the wire format explicitly. Small fine-tunes are markedly
// better at emitting YYYY-MM-DD when the format is stated on every date field
// rather than once in the system prompt.
func date(desc string) map[string]any {
	return map[string]any{"type": "string", "description": desc + " Format: YYYY-MM-DD."}
}

// tools is the allowlist. Company scoping is NOT expressed here: every handler
// takes company_id from the session, so no tool accepts one and the model has
// no way to reach another tenant's data.
var tools = []Tool{
	// ---------- HR: reads ----------
	{
		Action:      "get_employees",
		Description: "List every employee — the staff roster, headcount, who works here, who is in which department. Includes department, position, employment status and hire date. Use this to resolve a person's name to their employee_id before calling anything that needs one.",
		Schema:      obj(map[string]any{}),
		Keywords:    []string{"staff", "roster", "headcount", "people", "who works", "team"},
	},
	{
		Action: "find_employees",
		Description: "Find an employee BY NAME. Use this the moment the user names a person — " +
			"\"details of Ana Cruz\", \"show me Mark Padama\", \"who is J Dela Cruz\" — instead of " +
			"listing everyone and searching by eye. Handles partial names, any word order, and " +
			"misspellings. Returns the matching records, and their ids for anything that needs one.",
		Schema: obj(map[string]any{
			"name": str("The person's name as the user typed it, in any order, partial or misspelled."),
		}, "name"),
		Keywords: []string{"details", "details of", "employee details", "staff details", "person details",
			"show details", "show me", "find", "search", "look up", "who is", "profile", "record for",
			"information about", "by name", "named"},
	},
	{
		Action:      "get_employee",
		Description: "Look up ONE employee's record by id. Use this — not get_employees — whenever the user asks about a single named person, so the answer is that person rather than the whole roster. Resolve the name to an id with get_employees first.",
		Schema: obj(map[string]any{
			"id": str("UUID of the employee, from get_employees."),
		}, "id"),
		Keywords: []string{"details of", "profile", "record for", "information about", "look up", "who is"},
	},
	{
		Action:      "get_departments",
		Description: "List the company's departments.",
		Schema:      obj(map[string]any{}),
		Keywords:    []string{"org", "division", "team", "unit"},
	},
	{
		Action:      "get_positions",
		Description: "List job titles / positions defined for the company.",
		Schema:      obj(map[string]any{}),
		Keywords:    []string{"job title", "role", "designation"},
	},
	{
		Action:      "get_attendance",
		Description: "Read attendance — timesheets, hours worked, who was late, who was absent, clock in and clock out records — over a date range. Both dates are required; for a single day pass the same date twice.",
		Schema: obj(map[string]any{
			"date_from": date("First day to include, inclusive."),
			"date_to":   date("Last day to include, inclusive."),
		}, "date_from", "date_to"),
		Keywords: []string{"timesheet", "hours", "clocked", "late", "absent", "time in"},
	},
	{
		Action: "get_leaves",
		// The description carries the user's vocabulary, not the schema's.
		// Measured on the deployed base model: with "leave requests" alone,
		// "who is off next week" produced a clarifying question instead of a
		// call — the model did not connect "off" to this tool. Naming the
		// phrasings people actually type is what makes a small model reach for
		// the right action, and it costs a few tokens of context.
		Description: "List leave requests — who is off, away, on leave, on holiday or not coming in. Optionally filtered by status and date range. Omit every field to get all leave requests.",
		Schema: obj(map[string]any{
			"status":    map[string]any{"type": "string", "enum": []string{"Pending", "Approved", "Rejected"}, "description": "Only return requests in this state."},
			"date_from": date("Only return leave starting on or after this date."),
			"date_to":   date("Only return leave starting on or before this date."),
		}),
		Keywords: []string{"time off", "vacation", "absence", "on leave", "pto"},
	},

	// ---------- HR: writes ----------
	{
		Action:      "create_leave",
		Write:       true,
		Description: "File a leave request. Filing for yourself needs no special rights; filing for someone else requires leave-create permission. Resolve the person with get_employees first — employee_id is a UUID, never a name.",
		Schema: obj(map[string]any{
			"employee_id": str("UUID of the employee the leave is for, from get_employees."),
			"leave_type":  str("Kind of leave, e.g. Vacation, Sick, Emergency, Maternity. Use the wording the company already uses in existing records where possible."),
			"start_date":  date("First day of leave."),
			"end_date":    date("Last day of leave, inclusive. For a single day, same as start_date."),
			"days":        num("Number of leave days being consumed. Defaults to 1 if omitted."),
			"reason":      str("Free-text reason given by the employee."),
		}, "employee_id", "leave_type", "start_date", "end_date"),
		Keywords: []string{"request leave", "book time off", "sick day", "vacation", "apply leave"},
	},
	{
		Action:      "approve_leave",
		Module:      "leave",
		Fn:          "approve",
		Write:       true,
		Description: "Approve or reject a pending leave request. Requires leave-approve permission.",
		Schema: obj(map[string]any{
			"id":             str("UUID of the leave request, from get_leaves."),
			"status":         map[string]any{"type": "string", "enum": []string{"Approved", "Rejected"}, "description": "The decision."},
			"rejection_note": str("Reason shown to the employee. Only meaningful when status is Rejected."),
		}, "id", "status"),
		Keywords: []string{"approve", "reject", "decline", "sign off", "grant leave"},
	},
	{
		Action:      "clock_in",
		Write:       true,
		Description: "Record a clock-in for an employee, stamped at the current server time.",
		Schema: obj(map[string]any{
			"employee_id": str("UUID of the employee clocking in, from get_employees."),
		}, "employee_id"),
		Keywords: []string{"time in", "start shift", "punch in", "arrive"},
	},
	{
		Action:      "clock_out",
		Write:       true,
		Description: "Close an open attendance record. The id is the attendance record's UUID — get it from get_attendance for today, not the employee's id.",
		Schema: obj(map[string]any{
			"id": str("UUID of the open attendance record, from get_attendance."),
		}, "id"),
		Keywords: []string{"time out", "end shift", "punch out", "leave for the day"},
	},

	{
		Action:      "create_employee",
		Module:      "employees",
		Fn:          "create",
		Write:       true,
		Description: "Add a new employee to the roster. Creates the person's record with their name, department, position and start date. IMPORTANT: it CANNOT set email, phone, address, birth date, salary, bank details or government IDs (SSS, PhilHealth, Pag-IBIG, TIN) — those are encrypted in the browser and must be filled in afterwards under HR > Employees. Say so when you propose this, so nobody assumes the record is complete.",
		Schema: obj(map[string]any{
			"first_name":      str("Given name."),
			"last_name":       str("Family name."),
			"middle_name":     str("Middle name, if given."),
			"department":      str("Department name, e.g. Finance. Use a name from get_departments where one matches."),
			"position":        str("Job title, e.g. Analyst. Use a name from get_positions where one matches."),
			"joined_date":     date("First day of employment. Defaults to today if omitted."),
			"employment_type": map[string]any{"type": "string", "enum": []string{"Regular", "Probationary", "Contractual", "Part-time"}, "description": "Type of engagement."},
			// These four are the options the HR form offers. Any other value is
			// one the UI cannot display or edit, so the model must not invent
			// "Resigned" or "Inactive" — both of which it was previously told
			// were valid.
			"status": map[string]any{"type": "string", "enum": []string{"Active", "On Leave", "Suspended", "Terminated"}, "description": "Employment status. Defaults to Active."},
		}, "first_name", "last_name"),
		Keywords: []string{"add employee", "new hire", "newhire", "hire", "hiring", "starting", "starts",
			"joins", "joining", "onboard", "add staff", "add person", "register employee", "employ"},
	},
	{
		Action:      "create_department",
		Module:      "departments",
		Fn:          "create",
		Write:       true,
		Description: "Create a new department, e.g. Finance or Operations.",
		Schema: obj(map[string]any{
			"name":        str("Department name."),
			"description": str("What the department does."),
		}, "name"),
		Keywords: []string{"add department", "new department", "create team", "new division"},
	},
	{
		Action:      "create_position",
		Module:      "positions",
		Fn:          "create",
		Write:       true,
		Description: "Create a new job title / position, e.g. Senior Analyst.",
		Schema: obj(map[string]any{
			"name":        str("Job title."),
			"department":  str("Department this role sits in, from get_departments."),
			"level":       str("Seniority band, e.g. Junior, Senior, Manager."),
			"description": str("What the role does."),
		}, "name"),
		Keywords: []string{"add position", "new job title", "new role", "create designation"},
	},

	// ---------- Expenses ----------
	{
		Action:      "get_exp_claims",
		Description: "List expense claims. Without expenses-view permission this returns only the caller's own claims, which is the correct answer rather than an error.",
		Schema: obj(map[string]any{
			"status":      map[string]any{"type": "string", "enum": []string{"Draft", "Submitted", "Approved", "Rejected", "Paid"}, "description": "Only return claims in this state."},
			"employee_id": str("Restrict to one employee's claims, from get_employees."),
			"limit":       integer("Maximum number of claims to return."),
		}),
		Keywords: []string{"reimbursement", "expense report", "receipts", "claim"},
	},
	{
		Action:      "create_exp_claim",
		Write:       true,
		Description: "File an expense claim with one or more line items. Filing for yourself needs no special rights; naming another employee requires expenses-create permission, and without it the claim is pinned to the caller regardless of what is sent.",
		Schema: obj(map[string]any{
			"employee_id":    str("UUID of the claimant. Omit to file for yourself."),
			"title":          str("Short summary of the claim, e.g. 'Client lunch, Makati'."),
			"purpose":        str("Business purpose of the spend."),
			"claim_date":     date("Date the claim is filed. Defaults to today."),
			"payment_method": str("How it was paid, e.g. Cash, Personal Card, Company Card."),
			"notes":          str("Any additional note for the approver."),
			"lines": map[string]any{
				"type":        "array",
				"description": "The individual expenses making up this claim. At least one is required.",
				"items": obj(map[string]any{
					"expense_date": date("Date this specific expense was incurred."),
					"category_id":  str("UUID of the expense category, from get_exp_categories."),
					"account_id":   str("UUID of the GL account to charge, from get_accounts. Optional — the category usually supplies it."),
					"description":  str("What was bought."),
					"merchant":     str("Who it was paid to."),
					"receipt_no":   str("Receipt or OR number."),
					"amount":       num("Gross amount in company currency."),
					"tax_amount":   num("Tax portion included in amount, e.g. VAT."),
				}, "amount"),
			},
		}, "title", "lines"),
		Keywords: []string{"expense", "claim", "reimburse", "reimbursement", "receipt", "out of pocket", "spent", "paid for", "lunch", "meal", "taxi", "grab", "fuel", "per diem", "file a claim"},
	},

	// ---------- Accounting: reads ----------
	{
		Action:      "get_accounts",
		Description: "List the chart of accounts. Use this to resolve an account name like 'Utilities Expense' to the account_id that journal entries require.",
		Schema: obj(map[string]any{
			"account_type": map[string]any{"type": "string", "enum": []string{"Asset", "Liability", "Equity", "Revenue", "Expense"}, "description": "Only return accounts of this type."},
			"active_only":  boolean("Exclude deactivated accounts."),
		}),
		Keywords: []string{"chart of accounts", "coa", "gl account", "ledger account"},
	},
	{
		Action: "create_account",
		Description: "Add an account to the chart of accounts — an expense account, a revenue " +
			"account, a bank or asset account, a liability, an equity account. Use this for " +
			"\"add a chart of account\", \"create an expense account\", \"set up a new GL account\". " +
			"Every account needs a code, a name and a type.",
		Module: "accounting", Fn: "create", Write: true,
		Schema: obj(map[string]any{
			"code":         str("Account code, e.g. \"6100\". Ask the user if they have not given one — codes are not guessable."),
			"name":         str("Account name, e.g. \"Office Supplies Expense\"."),
			"account_type": map[string]any{"type": "string", "enum": []string{"Asset", "Liability", "Equity", "Revenue", "Expense"}, "description": "Which of the five statement categories this account belongs to."},
			"account_subtype": map[string]any{"type": "string", "enum": []string{
				"Current Asset", "Fixed Asset", "Other Asset",
				"Current Liability", "Long-term Liability", "Other Liability",
				"Owner Equity", "Retained Earnings",
				"Operating Revenue", "Other Revenue",
				"Operating Expense", "Cost of Sales", "Other Expense",
				"Header",
			}, "description": "Optional finer classification. Must match the account_type — Expense takes Operating Expense, Cost of Sales, Other Expense or Header."},
			"description": str("Optional note describing what the account is for."),
			"parent_id":   str("Optional id of the parent account, from get_accounts, to nest this under a header."),
		}, "code", "name", "account_type"),
		Keywords: []string{"chart of accounts", "coa", "gl account", "ledger account", "expense account",
			"revenue account", "bank account", "new account", "add account"},
	},
	{
		Action:      "get_journal_entries",
		Description: "List journal entries, optionally filtered by status, source and date range. Returns at most 200 entries.",
		Schema: obj(map[string]any{
			"status":      map[string]any{"type": "string", "enum": []string{"Draft", "Posted", "Void"}, "description": "Only return entries in this state."},
			"source_type": str("Filter by what produced the entry, e.g. Manual, Payroll, Sales."),
			"date_from":   date("Only return entries dated on or after this."),
			"date_to":     date("Only return entries dated on or before this."),
		}),
		Keywords: []string{"journal", "je", "ledger", "postings", "double entry"},
	},
}

// Registry is the immutable, sorted tool catalogue built once at startup.
//
// To expose another action: add a Tool above with a description written for
// someone who has never seen the UI, a schema matching the handler's request
// struct exactly, and — if the action appears in actionPerm — the same module
// and fn. Verify the schema against the handler rather than against the model
// struct: several handlers accept a narrower anonymous struct than the model
// they populate, and a schema promising fields the handler ignores teaches the
// model a call shape that silently does nothing.
type Registry struct {
	byName map[string]Tool
	all    []Tool
}

func NewRegistry() *Registry {
	r := &Registry{byName: make(map[string]Tool, len(tools)+len(accountingTools))}
	for _, group := range [][]Tool{tools, accountingTools, accountingARAPTools, accountingLedgerTools, crmTools} {
		for _, t := range group {
			t.Curated = true
			r.all = append(r.all, t)
		}
	}
	r.all = append(r.all, generatedTools...)
	sort.Slice(r.all, func(i, j int) bool { return r.all[i].Action < r.all[j].Action })
	for _, t := range r.all {
		r.byName[t.Action] = t
	}
	return r
}

// Lookup returns the tool for an action name. The second result is false for
// any action not on the allowlist — including real, valid ERP actions. Callers
// must treat that as a refusal, never as a reason to fall through to the
// dispatch switch: an unknown name coming back from a model is the expected
// failure mode of a small fine-tune, not an edge case.
func (r *Registry) Lookup(action string) (Tool, bool) {
	t, ok := r.byName[action]
	return t, ok
}

// Permitted returns the tools the caller could actually invoke. can reports
// whether the session holds a (module, fn) right; it is the api package's
// Permissions.Can, passed in to keep this package free of any dependency on the
// handler layer.
func (r *Registry) Permitted(can func(module, fn string) bool) []Tool {
	out := make([]Tool, 0, len(r.all))
	for _, t := range r.all {
		if t.Module == "" || can(t.Module, t.Fn) {
			out = append(out, t)
		}
	}
	return out
}

// Len reports the catalogue size, for logging and for the selector's scoring.
func (r *Registry) Len() int { return len(r.all) }

// All returns every tool, for callers that need to walk the catalogue —
// the evaluation corpus is generated from it, so a tool added tomorrow is
// exercised tomorrow without anyone remembering to add a test.
func (r *Registry) All() []Tool {
	out := make([]Tool, len(r.all))
	copy(out, r.all)
	return out
}
