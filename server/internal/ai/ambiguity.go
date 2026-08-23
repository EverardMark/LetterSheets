package ai

import (
	"encoding/json"
	"fmt"
	"strings"
)

// Name ambiguity: two people called Ana, and the model picks one.
//
// This is the same failure as an unresolved 1:N biometric match, and it
// deserves the same answer. Asked to "file a sick day for Ana Cruz" in a
// company with two Ana Cruzes, a model reading the roster will pick whichever
// row it saw first — silently, confidently, and with no signal to the user that
// a choice was made at all. The confirmation card does not save them either:
// both candidates render as "Ana Cruz", so the card looks correct whichever one
// was chosen.
//
// Grounding (see grounding.go) proves an id came from a real read. It cannot
// tell you the model picked the RIGHT real person. This does: when a write
// names someone whose name is shared, the proposal is withheld and the user is
// asked which one, with whatever distinguishes them.
//
// Deliberately narrow. It only fires when the chosen person's display name is
// shared by someone else in the same roster — an unambiguous name proposes as
// normal, so the common case costs nothing.

// person is one employee harvested from a tool result.
type person struct {
	ID         string
	First      string
	Middle     string
	Last       string
	Department string
	Position   string
}

// FullName is what a user would say and what the card shows. The middle name is
// included because it is frequently the only thing separating two people who
// share a first and last name — which is exactly the case this guard exists for.
func (p person) FullName() string {
	parts := []string{p.First, p.Middle, p.Last}
	out := make([]string, 0, 3)
	for _, s := range parts {
		if s = strings.TrimSpace(s); s != "" {
			out = append(out, s)
		}
	}
	return strings.Join(out, " ")
}

// shortName ignores the middle name, since that is how people are usually
// referred to and therefore the level at which collisions actually bite.
func (p person) shortName() string {
	return strings.TrimSpace(strings.TrimSpace(p.First) + " " + strings.TrimSpace(p.Last))
}

// distinguisher is what to show the user so they can tell two same-named people
// apart. Department and position first because they are meaningful; the id tail
// only as a last resort, since it means nothing to a human but is at least
// unique.
func (p person) distinguisher() string {
	var bits []string
	if d := strings.TrimSpace(p.Department); d != "" {
		bits = append(bits, d)
	}
	if pos := strings.TrimSpace(p.Position); pos != "" {
		bits = append(bits, pos)
	}
	if len(bits) == 0 {
		id := p.ID
		if len(id) > 8 {
			id = id[:8]
		}
		return "id " + id
	}
	return strings.Join(bits, ", ")
}

// PersonIndex accumulates everyone the turn has seen.
type PersonIndex struct {
	byID map[string]person
}

func NewPersonIndex() *PersonIndex {
	return &PersonIndex{byID: map[string]person{}}
}

// Observe harvests employee records from a tool result.
//
// Walks the decoded JSON looking for objects that carry an id together with a
// first or last name, rather than assuming the shape of any one action's
// response. Several actions return people under different keys — "employees",
// a bare array, nested inside a leave record — and a parser tied to one of them
// would quietly stop working when the model used another.
func (x *PersonIndex) Observe(raw string) {
	var v any
	if err := json.Unmarshal([]byte(raw), &v); err != nil {
		return
	}
	x.walk(v)
}

func (x *PersonIndex) walk(v any) {
	switch t := v.(type) {
	case map[string]any:
		if p, ok := personFrom(t); ok {
			// Keep the first sighting: later results may be partial (a leave row
			// carries a name but no department), and overwriting a full record
			// with a thin one loses the distinguisher.
			if _, seen := x.byID[p.ID]; !seen {
				x.byID[p.ID] = p
			}
		}
		for _, sub := range t {
			x.walk(sub)
		}
	case []any:
		for _, sub := range t {
			x.walk(sub)
		}
	}
}

func personFrom(m map[string]any) (person, bool) {
	id, _ := m["id"].(string)
	if id == "" {
		return person{}, false
	}
	first, _ := m["first_name"].(string)
	last, _ := m["last_name"].(string)
	if first == "" && last == "" {
		return person{}, false
	}
	mid, _ := m["middle_name"].(string)
	dept, _ := m["department"].(string)
	pos, _ := m["position"].(string)
	return person{ID: id, First: first, Middle: mid, Last: last, Department: dept, Position: pos}, true
}

// Lookup returns the person behind an id, if the turn has seen them.
func (x *PersonIndex) Lookup(id string) (person, bool) {
	p, ok := x.byID[id]
	return p, ok
}

// Ambiguous reports the other people sharing this person's name.
//
// Comparison is on first+last, case-insensitively: "Ana Cruz" and "ana cruz"
// are the same collision, and a differing middle name is precisely what makes
// the pair worth asking about rather than a reason to treat them as distinct.
func (x *PersonIndex) Ambiguous(id string) []person {
	target, ok := x.byID[id]
	if !ok {
		return nil
	}
	key := strings.ToLower(target.shortName())
	if key == "" {
		return nil
	}

	var matches []person
	for _, p := range x.byID {
		if strings.ToLower(p.shortName()) == key {
			matches = append(matches, p)
		}
	}
	if len(matches) < 2 {
		return nil
	}
	return matches
}

// AmbiguityError is what goes back to the model instead of a proposal.
//
// Each candidate carries its id. That is not decoration: without it the model
// has to re-read the roster to act on the user's answer, and a small model
// asked "which one?" then told "the one in Finance" will simply ask again —
// observed on the deployment host, twice in a row. Putting the ids in the
// message means the answer can be acted on directly from context.
//
// The user never sees this text; the model paraphrases it, and the ids drop out
// of the paraphrase naturally.
func AmbiguityError(field string, matches []person) error {
	var b strings.Builder
	name := matches[0].shortName()
	fmt.Fprintf(&b, "There are %d people called %s, so %q is ambiguous. Do NOT guess.",
		len(matches), name, field)
	b.WriteString("\nCandidates:")
	for _, p := range matches {
		fmt.Fprintf(&b, "\n  - %s (%s) -> %s = %q", p.FullName(), p.distinguisher(), field, p.ID)
	}
	// Both instructions below were added after watching the model get this
	// wrong on the deployment host: it echoed the raw ids into its reply, and
	// then, once the user had answered, asked "is this correct?" in prose
	// instead of making the call — leaving the user to confirm twice, once to
	// nobody.
	b.WriteString("\nAsk the user which one. List them by NAME and DEPARTMENT only — " +
		"never show these ids to the user, they are internal.")
	b.WriteString("\nOnce the user answers, immediately call the action again with the " +
		"matching id. Do NOT ask them to confirm first: the system already shows " +
		"a confirmation step before anything is saved.")
	return fmt.Errorf("%s", b.String())
}
