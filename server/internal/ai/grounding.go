package ai

import (
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// Identifier grounding: a write may only reference IDs the model has actually
// seen.
//
// This exists because of a measured failure, not a hypothetical one. Asked to
// "file a sick day for Ana tomorrow", the base model on the deployment host
// proposed create_leave with employee_id 123e4567-e89b-12d3-a456-426614174000 —
// the example UUID from the RFC — instead of calling get_employees to find out
// who Ana is. The system prompt says never to invent an id. It did anyway.
//
// Instructions are advisory; this is not. The reasoning is simple enough to be
// airtight: the only way to know a real employee_id is to have read one. So an
// id in a proposed write must appear either in a tool result from this turn or
// in what the user typed. Anything else was manufactured, and no amount of
// plausibility makes it real.
//
// This does not attempt to catch invented free text — a fabricated merchant or
// receipt number is a judgement call that belongs on the confirmation card in
// front of a human. It catches the class of error that is mechanically
// decidable, and it catches all of it.

// idPattern matches a UUID in any of the shapes these handlers accept.
var idPattern = regexp.MustCompile(`[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}`)

// idField reports whether a schema field is expected to hold an identifier.
// Naming convention rather than schema annotation: every handler in this
// codebase names them this way, and a field that opts out by being called
// something else simply is not checked.
func idField(name string) bool {
	return name == "id" || strings.HasSuffix(name, "_id")
}

// GroundingSet accumulates the identifiers a turn has legitimately seen.
type GroundingSet struct {
	seen map[string]bool
}

func NewGroundingSet() *GroundingSet {
	return &GroundingSet{seen: map[string]bool{}}
}

// Observe harvests every identifier-looking token from text — a tool result, or
// the user's own prompt.
//
// Deliberately crude: it scans for UUID-shaped substrings anywhere in the text
// rather than parsing the JSON and walking known fields. A read returns nested
// structures that differ per action, and a parser that understood each one
// would be another thing to keep in step with thirty handlers. Over-collecting
// is the safe direction — the guard's job is to catch wholesale fabrication,
// not to police which field an id came from.
func (g *GroundingSet) Observe(text string) {
	for _, m := range idPattern.FindAllString(text, -1) {
		g.seen[strings.ToLower(m)] = true
	}
}

// Has reports whether this exact identifier has been seen.
func (g *GroundingSet) Has(id string) bool {
	return g.seen[strings.ToLower(id)]
}

// ObserveJSON records the identifiers carried by a tool result.
//
// Observe alone scans for UUIDs in text, which was enough while every id in
// play was a UUID. It is not enough to decide what an id field is ALLOWED to
// contain — for that the guard needs the actual values a read returned,
// whatever shape they take.
func (g *GroundingSet) ObserveJSON(raw json.RawMessage) {
	g.Observe(string(raw))
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		return
	}
	g.observeValue("", v)
}

func (g *GroundingSet) observeValue(key string, v any) {
	switch t := v.(type) {
	case map[string]any:
		for k, sub := range t {
			g.observeValue(k, sub)
		}
	case []any:
		for _, sub := range t {
			g.observeValue(key, sub)
		}
	case string:
		if idField(key) && t != "" {
			g.seen[strings.ToLower(t)] = true
		}
	case float64:
		if idField(key) {
			g.seen[strings.ToLower(strconv.FormatFloat(t, 'f', -1, 64))] = true
		}
	}
}

// Check reports identifiers in args that the turn has never seen.
//
// EVERY id field is checked, not only UUID-shaped values. The original guard
// tested the UUID pattern on the reasoning that fabrication always takes UUID
// form, "because that is what the schema asks for". Live, the opposite happened:
// unable to produce a UUID it had never seen, the model invented
// customer_id "CUST-001", account_id "123" and fiscal_year_id "2026" — none
// UUID-shaped, all straight past the guard and onto a confirmation card where
// they read as real. An id the turn has not seen is fabricated whatever it
// looks like, and the model is told to resolve it with a read instead.
func (g *GroundingSet) Check(tool Tool, args json.RawMessage) []string {
	props, _ := tool.Schema["properties"].(map[string]any)
	if props == nil || len(args) == 0 {
		return nil
	}

	var decoded map[string]any
	if err := json.Unmarshal(args, &decoded); err != nil {
		return nil // ValidateArgs reports malformed input; not this guard's job.
	}

	ungrounded := map[string]bool{}
	g.walk(decoded, props, ungrounded)

	if len(ungrounded) == 0 {
		return nil
	}
	out := make([]string, 0, len(ungrounded))
	for k := range ungrounded {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func (g *GroundingSet) walk(vals map[string]any, props map[string]any, out map[string]bool) {
	for name, raw := range vals {
		spec, _ := props[name].(map[string]any)

		switch v := raw.(type) {
		case string:
			if idField(name) && v != "" && !g.seen[strings.ToLower(v)] {
				out[name+"="+v] = true
			}
		case float64:
			if idField(name) {
				n := strconv.FormatFloat(v, 'f', -1, 64)
				if !g.seen[strings.ToLower(n)] {
					out[name+"="+n] = true
				}
			}
		case []any:
			itemSpec, _ := spec["items"].(map[string]any)
			itemProps, _ := itemSpec["properties"].(map[string]any)
			for _, it := range v {
				if m, ok := it.(map[string]any); ok && itemProps != nil {
					g.walk(m, itemProps, out)
				}
			}
		case map[string]any:
			if sub, ok := spec["properties"].(map[string]any); ok {
				g.walk(v, sub, out)
			}
		}
	}
}

// GroundingError builds the message sent back to the model.
//
// It names the offending values and says what to do instead, because a bare
// refusal makes a small model retry the identical call. Naming the resolver by
// action is what turns the retry into a lookup.
// resolverFor maps an id field to the read that produces it.
//
// Naming the specific action matters more than it looks. Told only that an id
// was invented, the model retried with another invented one, then put the
// customer's NAME in the id field, then gave up and wrote the whole call out as
// prose — turns wasted because "the matching get_* action" never says which.
// Told "call get_customers", it calls get_customers.
var resolverFor = map[string]string{
	"employee_id":       "find_employees",
	"account_id":        "get_accounts",
	"parent_id":         "get_accounts",
	"equity_account_id": "get_accounts",
	"customer_id":       "get_customers",
	"vendor_id":         "get_vendors",
	"invoice_id":        "get_invoices",
	"bill_id":           "get_bills",
	"entry_id":          "get_journal_entries",
	"department_id":     "get_departments",
	"position_id":       "get_positions",
	"fiscal_year_id":    "get_fiscal_years",
	"template_id":       "get_coa_templates",
}

func GroundingError(tool Tool, ungrounded []string) error {
	resolvers := map[string]bool{}
	for _, bad := range ungrounded {
		field := bad
		if i := strings.IndexByte(field, '='); i >= 0 {
			field = field[:i]
		}
		if r, ok := resolverFor[field]; ok {
			resolvers[r] = true
		}
	}
	names := make([]string, 0, len(resolvers))
	for r := range resolvers {
		names = append(names, r)
	}
	sort.Strings(names)

	resolver := "the matching get_* action"
	if len(names) > 0 {
		resolver = strings.Join(names, " and ")
	}
	return fmt.Errorf(
		"%s was called with %s, which has not appeared in any result this turn — that id was invented. "+
			"Call %s first and use an id from its output. Never guess an id, and never put a name in an id field",
		tool.Action, strings.Join(ungrounded, ", "), resolver)
}
