package ai

// Hand-written where the generated descriptions collided.
//
// Every tool here was reachable already; what was missing was anything to tell
// it apart from its neighbours. create_crm_opportunity and
// create_quote_from_opportunity both say "opportunity", and the generated text —
// derived from a struct — gave the model no way to know that one records a deal
// and the other converts a recorded deal into a quotation. Asked to add an
// opportunity, it proposed the conversion.
var crmTools = []Tool{
	{
		Action: "get_crm_opportunities",
		Description: "List sales opportunities — deals in the pipeline, what stage each is at and " +
			"what it is worth. The answer to \"what are we working on\" and \"what is in the pipeline\".",
		Schema: obj(map[string]any{
			"stage": str("Only opportunities at this stage."),
		}),
		Keywords: []string{"opportunities", "opportunity", "pipeline", "deals", "prospects",
			"what are we working on", "sales pipeline", "forecast"},
	},
	{
		Action: "create_crm_opportunity",
		Description: "Record a NEW sales opportunity — a deal being worked on, with the customer, " +
			"what it is worth and how likely it is. This creates the opportunity itself. It does " +
			"NOT produce a quotation; converting one into a quote is create_quote_from_opportunity.",
		Write: true,
		Schema: obj(map[string]any{
			"name":                str("What the deal is called, e.g. \"Acme — 200 units, Q4\"."),
			"customer_id":         str("The customer, from get_customers."),
			"stage":               str("Pipeline stage, e.g. Prospecting, Proposal, Negotiation."),
			"amount":              num("What the deal is worth, in pesos."),
			"probability":         num("Chance of winning, 0 to 100."),
			"expected_close_date": date("When it is expected to close."),
			"source":              str("Where the lead came from."),
			"owner_id":            str("Employee who owns the deal, from find_employees."),
			"notes":               str("Notes."),
		}, "customer_id", "name", "probability", "stage"),
		Keywords: []string{"add opportunity", "new opportunity", "new deal", "log a deal",
			"record an opportunity", "add to pipeline", "new prospect"},
	},
	{
		Action: "update_crm_opportunity",
		Description: "Change an existing sales opportunity — move it to another stage, revise the " +
			"amount or probability, mark it won or lost. Changes the opportunity itself; it does " +
			"not create a quotation.",
		Write: true,
		Schema: obj(map[string]any{
			"id":                  str("Opportunity id, from get_crm_opportunities."),
			"name":                str("What the deal is called."),
			"customer_id":         str("The customer, from get_customers."),
			"stage":               str("Pipeline stage."),
			"amount":              num("What the deal is worth, in pesos."),
			"probability":         num("Chance of winning, 0 to 100."),
			"expected_close_date": date("When it is expected to close."),
			"lost_reason":         str("Why it was lost, if it was."),
			"notes":               str("Notes."),
		}, "id"),
		Keywords: []string{"update opportunity", "edit opportunity", "move stage", "advance the deal",
			"mark won", "mark lost", "change probability", "update the deal"},
	},
	{
		Action: "create_quote_from_opportunity",
		Description: "Turn an EXISTING opportunity into a sales quotation. Use only when the user " +
			"asks to quote a deal they already have — it needs an opportunity that exists, refuses " +
			"one that already has a quote, and is not the way to create or change an opportunity.",
		Write: true,
		Schema: obj(map[string]any{
			"id": str("Opportunity id to convert, from get_crm_opportunities."),
		}, "id"),
		Keywords: []string{"quote the opportunity", "convert to quote", "raise a quote from the deal",
			"quotation from opportunity", "turn the deal into a quote"},
	},
	{
		Action: "get_leave_credit_history",
		Description: "One employee's leave credit history — how their balance has moved over time, " +
			"what was earned, used and adjusted. Needs the employee, so resolve the name with " +
			"find_employees first.",
		Schema: obj(map[string]any{
			"employee_id": str("Employee id, from find_employees."),
			"leave_type":  str("Only this type of leave, e.g. Vacation, Sick."),
		}, "employee_id"),
		Keywords: []string{"leave credit history", "leave balance history", "leave ledger",
			"credits earned", "credits used", "leave movement", "leave adjustments"},
	},
}
