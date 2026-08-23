package ai

import (
	"encoding/json"
	"math"
	"sort"
	"strings"
	"unicode"
)

// Selecting which tools to show the model is the difference between a prompt
// box that works and one that does not.
//
// Handing over the whole catalogue is not an option: schemas are expensive in
// context, and — more importantly — accuracy falls as the candidate set grows.
// A small LoRA fine-tune degrades much faster than a frontier model here, so
// narrowing has to happen before the model ever sees the list.
//
// Anthropic offers a server-side tool-search tool that solves this, but relying
// on it would mean the feature works on the bootstrap provider and collapses on
// the self-hosted one. So retrieval is done here, in Go, with BM25 over each
// tool's action name, description and keywords. It costs microseconds, needs no
// model, no embeddings and no network, and behaves identically whichever
// Provider is configured.
const (
	// DefaultTopK is how many tools survive scoring. Chosen to keep the schema
	// block small enough for a quantised 14B to attend to reliably while still
	// covering multi-step requests ("who is on leave, and file one for Ana").
	DefaultTopK = 12

	// curatedBoost is how much a hand-written tool outweighs a generated one.
	//
	// Enough to win a close call, not enough to beat a clearly better match:
	// asked to "delete an attendance record", delete_attendance still wins over
	// a curated get_attendance. See Tool.Curated.
	curatedBoost = 1.4

	// writePenalty is how far a write is pushed down for a read-shaped prompt.
	// Enough to lose to any relevant read, not enough to vanish — "show me the
	// invoice so I can void it" should still reach void_invoice.
	// Low enough that a write cannot outrank a read on a read-shaped prompt
	// even when the read is itself penalised for needing an id. At 0.4 the two
	// penalties overlapped: "show me the credit memo" pushed get_credit_memo
	// down for wanting an id, and create_credit_memo answered instead — a
	// proposal to create one in reply to a request to see one.
	writePenalty = 0.15

	// needsIDPenalty pushes down a tool whose required arguments include an id
	// the prompt has not supplied. See Select.
	needsIDPenalty = 0.55

	// bm25K1 and bm25B are the standard BM25 constants. Tool documents are
	// short and similar in length, so these barely matter — they are here so
	// the scoring is recognisable rather than ad hoc.
	bm25K1 = 1.5
	bm25B  = 0.75
)

// resolverTools are always offered regardless of score.
//
// Almost every write in this ERP takes a UUID the user will never type: they
// say "Ana", the action needs employee_id. If the resolver that turns a name
// into an id is not on the list, the model's only remaining option is to invent
// one — which a fine-tune will do confidently. Keeping these three present at
// all times costs a little context and removes the most common way the whole
// flow produces a wrong write.
// find_employees, get_customers and get_vendors earn their place for the same
// reason: they are how a NAME becomes an id. Ranking cannot be relied on to
// surface them — the prompt that needs the search most ("show me asd asd
// details") is precisely the one whose words match no tool description at all,
// and once the catalogue passed ninety tools that prompt stopped surfacing it.
var resolverTools = []string{
	"get_employees", "find_employees", "get_accounts", "get_departments",
	"get_customers", "get_vendors",
}

// Selector ranks tools against a user's prompt.
type Selector struct {
	reg *Registry

	// docs holds the pre-tokenised text of every tool, built once at startup.
	docs map[string][]string

	// subjects holds each action's name minus its leading verb, tokenised.
	// See the coverage term in Select.
	subjects map[string][]string
	// idf is the inverse document frequency of each term across the catalogue.
	idf map[string]float64
	// avgLen is the mean document length in tokens.
	avgLen float64
}

func NewSelector(reg *Registry) *Selector {
	s := &Selector{
		reg:      reg,
		docs:     make(map[string][]string, reg.Len()),
		subjects: make(map[string][]string, reg.Len()),
		idf:      make(map[string]float64),
	}

	df := map[string]int{}
	total := 0
	for _, t := range reg.all {
		toks := tokenize(t.Action + " " + t.Description + " " + strings.Join(t.Keywords, " "))
		s.docs[t.Action] = toks
		// The subject is the action minus its leading verb: create_ticket ->
		// "ticket", create_ticket_category -> "ticket category".
		if i := strings.IndexByte(t.Action, '_'); i >= 0 {
			s.subjects[t.Action] = tokenize(strings.ReplaceAll(t.Action[i+1:], "_", " "))
		}
		total += len(toks)

		seen := map[string]bool{}
		for _, tok := range toks {
			if !seen[tok] {
				df[tok]++
				seen[tok] = true
			}
		}
	}
	if reg.Len() > 0 {
		s.avgLen = float64(total) / float64(reg.Len())
	}

	n := float64(reg.Len())
	for term, freq := range df {
		// Standard BM25 IDF with the +1 smoothing that keeps a term appearing
		// in every document at a small positive weight rather than zero.
		s.idf[term] = math.Log(1 + (n-float64(freq)+0.5)/(float64(freq)+0.5))
	}
	return s
}

// Select returns the tools to offer the model for this prompt, already filtered
// to what the caller is permitted to run.
//
// It never returns an empty slice for a non-empty catalogue: a prompt matching
// nothing still gets the resolvers plus the highest-scoring remainder, so the
// model can answer "I can't do that, but here is what I can see" instead of
// being handed nothing and hallucinating a tool name.
func (s *Selector) Select(prompt string, can func(module, fn string) bool, topK int) []Tool {
	if topK <= 0 {
		topK = DefaultTopK
	}
	allowed := s.reg.Permitted(can)
	if len(allowed) <= topK && fits(allowed) {
		return allowed
	}

	// A prompt that asks to SEE something should not be answered with a way to
	// change it. "show me open support tickets" surfaced create_ticket_category
	// and assign_ticket above get_tickets, and the model duly proposed a write
	// — a confirmation card in reply to a question. Reads are not boosted here;
	// writes are pushed down, and only while the request contains no verb that
	// asks for a change.
	readOnly := looksReadOnly(prompt)
	hasID := idPattern.MatchString(prompt)

	query := tokenize(prompt)
	type scored struct {
		tool  Tool
		score float64
	}

	ranked := make([]scored, 0, len(allowed))
	for _, t := range allowed {
		score := s.score(query, s.docs[t.Action])

		// Coverage: how much of THIS tool's subject the prompt accounts for.
		//
		// BM25 alone cannot separate a family that shares a word. "open a
		// support ticket" scored create_ticket_category, assign_ticket,
		// delete_ticket and seed_ticket_categories all above create_ticket —
		// every one of them says "ticket", several say it more often, and the
		// one whose subject is EXACTLY "ticket" was buried by its own
		// relatives. A tool whose subject the prompt covers completely is more
		// likely to be the one meant than a tool carrying a subject the prompt
		// never mentioned.
		// Resolvers are exempt: coverage separates members of a FAMILY, and a
		// general-purpose lookup competes in none. find_employees carries
		// "employees" in its subject, a word nobody types when naming a person,
		// so "show me andrew sample details" scored it down and let
		// get_tax_detail — which merely contains "detail" — lead instead.
		if !isResolver(t.Action) {
			score *= coverageWeight(query, s.subjects[t.Action])
		}

		if t.Curated {
			score *= curatedBoost
		}
		if readOnly && t.Write {
			score *= writePenalty
		}
		if !hasID && needsID(t) {
			// A tool that cannot be called yet should not lead the list.
			//
			// "show me all employees" put get_employee — which requires an id
			// the prompt does not contain — above get_employees, which is the
			// whole answer. It stays offered, because chaining to it after a
			// lookup is exactly right; it just should not be the first thing
			// the model sees.
			score *= needsIDPenalty
		}
		ranked = append(ranked, scored{tool: t, score: score})
	}

	// Sort by score, then by action name so that equal scores — common when a
	// prompt matches nothing — produce a stable, reproducible tool list. An
	// unstable list would silently poison the captured training data, since two
	// identical prompts could be recorded against different candidate sets.
	sort.Slice(ranked, func(i, j int) bool {
		if ranked[i].score != ranked[j].score {
			return ranked[i].score > ranked[j].score
		}
		// Then the SHORTER action name. Within a family the shorter name is the
		// primary thing and the longer one a satellite: create_ticket is what
		// "open a support ticket" means, create_ticket_category is not. Purely
		// alphabetical put category first and the ticket itself off the list.
		ni, nj := strings.Count(ranked[i].tool.Action, "_"), strings.Count(ranked[j].tool.Action, "_")
		if ni != nj {
			return ni < nj
		}
		// Alphabetical last, so equal scores still produce a stable,
		// reproducible list — an unstable one would poison captured training
		// data, since one prompt could be recorded against two candidate sets.
		return ranked[i].tool.Action < ranked[j].tool.Action
	})

	scoreOf := make(map[string]float64, len(ranked))
	for _, r := range ranked {
		scoreOf[r.tool.Action] = r.score
	}

	out := make([]Tool, 0, topK)
	taken := make(map[string]bool, topK)

	// Resolvers get a guaranteed QUOTA, not the whole list.
	//
	// Reserving a slot each was fine at three resolvers and twelve slots. At
	// six it swallowed a top-5 whole: every prompt, whatever it asked, was
	// answered with the same six name-to-id lookups and nothing relevant. Half
	// the list is the most a guarantee should ever take, and the resolvers
	// compete for those places on the same score as everything else — so an
	// accounting prompt gets get_accounts, an HR one gets get_employees.
	// A third, not a half. At 438 tools the resolvers are a smaller share of
	// what matters: six guaranteed lookups out of twelve slots left only six
	// for the module the user was actually asking about.
	quota := topK / 3
	if quota < 1 {
		quota = 1
	}
	for _, r := range ranked {
		if len(out) >= quota {
			break
		}
		if !isResolver(r.tool.Action) || taken[r.tool.Action] {
			continue
		}
		out = append(out, r.tool)
		taken[r.tool.Action] = true
	}

	for _, r := range ranked {
		if len(out) >= topK {
			break
		}
		if taken[r.tool.Action] {
			continue
		}
		// Stop at the BUDGET as well as the count.
		//
		// topK alone assumes every tool costs about the same, which stopped
		// being true once accounting arrived: an invoice or journal entry
		// carries a nested line-item schema several times the size of "get
		// employees by id". Twelve of those overflow the prompt window, and the
		// turn fails outright rather than answering with fewer tools. Ranking
		// already put the best candidates first, so cutting the tail is the
		// cheapest thing to give up.
		if !fits(append(out, r.tool)) {
			// SKIP it, do not stop. Breaking here meant one oversized schema at
			// the top of the ranking — a sales order with its line items —
			// blocked every tool behind it, and the model was offered nothing
			// but the six resolvers no matter what was asked. Smaller tools
			// further down still fit, and are still relevant.
			continue
		}
		out = append(out, r.tool)
		taken[r.tool.Action] = true
	}

	// Hand them over in RANK order, resolvers included.
	//
	// Guaranteeing a resolver a place is not the same as putting it first, and
	// the list was built resolvers-first. An 8B model reaches for the tool at
	// the top: asked to "add expense account" it called get_accounts — sitting
	// at position one on every single prompt — read an empty chart, and
	// answered "there are no active expense accounts", three times running, to
	// three different questions. create_account was in the list the whole time,
	// five places down.
	sort.Slice(out, func(i, j int) bool {
		si, sj := scoreOf[out[i].Action], scoreOf[out[j].Action]
		if si != sj {
			return si > sj
		}
		return out[i].Action < out[j].Action
	})
	return out
}

// looksReadOnly reports a prompt that asks to see, not to change.
// needsID reports whether a tool cannot be called without an identifier.
func needsID(t Tool) bool {
	req, ok := t.Schema["required"].([]string)
	if !ok {
		return false
	}
	for _, r := range req {
		if r == "id" || strings.HasSuffix(r, "_id") {
			return true
		}
	}
	return false
}

func looksReadOnly(prompt string) bool {
	lower := strings.ToLower(strings.TrimSpace(prompt))

	// An interrogative asks; it does not instruct. Checked BEFORE the verbs,
	// because "was that bill approved" contains "approve" and is a question
	// about a record, not a request to change one — read as an instruction it
	// sent the turn chasing a proposal the user never asked for.
	if strings.HasSuffix(lower, "?") {
		return true
	}
	for _, opener := range []string{
		"was ", "were ", "is ", "are ", "did ", "do ", "does ", "has ", "have ",
		"can ", "could ", "should ", "what ", "who ", "which ", "when ", "where ", "how ",
		// A leading read verb settles it too, before any write verb further in
		// gets a say: "show me the close preview" is a request to look at
		// something, and reading "close" out of the middle of it turned that
		// into a proposal to close a purchase order.
		"show ", "list ", "display ", "view ", "see ", "find ", "search ", "look ",
		// check/download/preview/export are reads in this ERP — check_email
		// asks whether an address is taken, download_* fetches a file. Missing
		// from the list, "check the email" was not read-shaped, writes went
		// unpenalised, and a proposal came back in reply to a question.
		"check ", "download ", "preview ", "export ",
	} {
		if strings.HasPrefix(lower, opener) {
			return true
		}
	}
	for _, verb := range []string{
		"create", "add ", "new ", "make ", "delete", "remove", "update", "edit ", "change",
		"approve", "reject", "post ", "void", "send", "email", "close", "reopen", "run ",
		"file ", "enter ", "record", "raise", "assign", "cancel", "pay ", "issue",
		"set ", "toggle", "enable", "disable", "activate", "deactivate", "reconcile",
		"submit", "convert", "transfer", "adjust", "dispose", "receive", "import",
	} {
		if strings.Contains(lower, verb) {
			return false
		}
	}
	for _, verb := range []string{
		"show", "list", "display", "view", "see ", "what", "which", "who", "how many",
		"how much", "find", "search", "look up", "get me", "give me", "report", "summary",
	} {
		if strings.Contains(lower, verb) {
			return true
		}
	}
	return false
}

// coverageWeight scores how completely a prompt accounts for a tool's subject:
// full coverage keeps the score, a subject half unmentioned loses a quarter.
func coverageWeight(query, subject []string) float64 {
	if len(subject) == 0 {
		return 1
	}
	inQuery := make(map[string]bool, len(query))
	for _, q := range query {
		inQuery[q] = true
	}
	hit := 0
	for _, tok := range subject {
		if inQuery[tok] {
			hit++
		}
	}
	return 0.5 + 0.5*float64(hit)/float64(len(subject))
}

func isResolver(action string) bool {
	for _, name := range resolverTools {
		if name == action {
			return true
		}
	}
	return false
}

// fits reports whether a tool set serialises small enough to leave room for the
// system prompt and the user's own words.
func fits(tools []Tool) bool {
	return schemaTokens(tools) <= ToolBudgetTokens
}

func schemaTokens(tools []Tool) int {
	total := 0
	for _, t := range tools {
		b, err := json.Marshal(t.Schema)
		if err != nil {
			continue
		}
		total += len(b) + len(t.Description) + len(t.Action)
	}
	return total / BytesPerToken
}

func (s *Selector) score(query, doc []string) float64 {
	if len(doc) == 0 {
		return 0
	}
	tf := make(map[string]int, len(doc))
	for _, tok := range doc {
		tf[tok]++
	}

	var total float64
	norm := bm25K1 * (1 - bm25B + bm25B*float64(len(doc))/s.avgLen)
	for _, q := range query {
		f := float64(tf[q])
		if f == 0 {
			continue
		}
		total += s.idf[q] * (f * (bm25K1 + 1)) / (f + norm)
	}
	return total
}

// stopwords are dropped from both queries and documents. The list is short on
// purpose: it covers words that appear in ordinary ERP phrasing without
// carrying intent, and nothing domain-specific — dropping "leave" or "pay"
// because they look common would remove exactly the signal being matched on.
var stopwords = map[string]bool{
	"a": true, "all": true, "an": true, "and": true, "any": true, "are": true,
	"as": true, "at": true, "be": true, "by": true, "can": true, "did": true,
	"do": true, "does": true, "for": true, "from": true, "get": true,
	"give": true, "has": true, "have": true, "how": true, "i": true, "in": true,
	"is": true, "it": true, "list": true, "me": true, "my": true, "of": true,
	"on": true, "or": true, "please": true, "show": true, "that": true,
	"the": true, "then": true, "there": true, "this": true, "to": true,
	"use": true, "was": true, "were": true, "what": true, "when": true,
	"which": true, "who": true, "will": true, "with": true, "you": true,
	"your": true,
}

// tokenize lowercases, splits on anything that is not a letter or digit, drops
// stopwords and one-character tokens, and applies a crude plural strip so
// "employees" in a prompt matches "employee" in a description.
func tokenize(s string) []string {
	fields := strings.FieldsFunc(strings.ToLower(s), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})

	out := make([]string, 0, len(fields))
	for _, f := range fields {
		if len(f) < 2 || stopwords[f] {
			continue
		}
		out = append(out, singular(f))
	}
	return out
}

// singular strips a trailing plural "s". It deliberately stops there: real
// stemming (Porter and friends) would collapse "posting" and "posted" onto
// "post", which is useful, but it also collapses distinctions this domain cares
// about, and it is another dependency to carry for a corpus of a few dozen
// short documents.
func singular(w string) string {
	if len(w) > 3 && strings.HasSuffix(w, "s") && !strings.HasSuffix(w, "ss") && !strings.HasSuffix(w, "us") {
		return w[:len(w)-1]
	}
	return w
}
