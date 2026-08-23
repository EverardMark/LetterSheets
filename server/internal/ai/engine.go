package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode"

	"github.com/google/uuid"
)

// Executor runs one ERP action for the caller.
//
// The implementation dispatches through the ordinary /api/execute path, which
// is the whole point: the model's calls pass through the same authorize() check
// and the same session-derived company scope as a click in the UI. There is no
// second, weaker route into the data — if the caller could not do it by hand,
// the model cannot do it for them.
type Executor interface {
	Execute(ctx context.Context, action string, args json.RawMessage) (json.RawMessage, error)
}

// Engine runs the prompt → tool-call → result loop.
type Engine struct {
	// router resolves which model serves the calling company. Every company has
	// its own adapter, so the provider is per-turn state, not a field.
	router   Router
	registry *Registry
	selector *Selector
	recorder Recorder

	// extractor reads attached documents into fields before the model turn.
	// Nil is not allowed; NopExtractor stands in when scanning is off so the
	// user is told it is unavailable rather than getting silence.
	extractor Extractor

	// maxIterations caps the read-execute-rethink cycle. Reached in practice
	// when a model loops on a call it cannot get right; the cap turns that into
	// a bounded, explainable failure rather than a hung request.
	maxIterations int

	// topK is how many tools the selector offers per turn.
	topK int

	// followUps enables the conversational handlers in followup.go.
	//
	// Off, the engine answers with whatever the model produces unaided. That is
	// the setting for comparing MODELS: with the handlers on, a stronger model
	// and a weaker one both look competent at the turns the handlers cover, and
	// the comparison says nothing.
	followUps bool

	// now is injectable so tests are not date-dependent.
	now func() time.Time
}

func NewEngine(r Router, reg *Registry, rec Recorder) *Engine {
	if rec == nil {
		rec = NopRecorder{}
	}
	return &Engine{
		router:    r,
		extractor: NopExtractor{},
		registry:  reg,
		selector:  NewSelector(reg),
		recorder:  rec,
		// Eight, not six. Four of the iterations can now be spent by the
		// engine's own interventions rather than by the model's reasoning, and
		// at six a request that needed a lookup AND a chase ran out before
		// reaching an answer it was one step away from.
		followUps:     true,
		maxIterations: 8,
		topK:          DefaultTopK,
		now:           time.Now,
	}
}

// SetFollowUps turns the conversational handlers on or off. See Engine.followUps.
func (e *Engine) SetFollowUps(on bool) { e.followUps = on }

// SetExtractor installs the document reader. Passing nil restores NopExtractor
// rather than leaving a nil to panic on.
func (e *Engine) SetExtractor(x Extractor) {
	if x == nil {
		x = NopExtractor{}
	}
	e.extractor = x
}

// Turn is one user request.
type Turn struct {
	Prompt  string
	History []Message

	// Can reports whether the caller holds a (module, fn) permission.
	Can func(module, fn string) bool

	// CompanyID selects which model serves this turn and partitions the
	// captured training data. It comes from the session, never from the client:
	// it is the key that keeps one tenant's examples out of another's adapter.
	CompanyID string

	// Company is the display name, shown to the model for phrasing only. It is
	// never used for scoping — that comes from the session, server-side.
	Company string

	// Attachments are scans the user included. They are read into fields BEFORE
	// the model turn and passed in as text; the tool-calling model never sees
	// pixels, which keeps its adapter free of vision weights.
	Attachments []Attachment
}

// ExtractedDoc is one scanned document's fields, for the client to act on.
type ExtractedDoc struct {
	Filename   string         `json:"filename"`
	Kind       string         `json:"kind"`
	Fields     map[string]any `json:"fields"`
	Confidence float64        `json:"confidence"`
	Notes      string         `json:"notes,omitempty"`
}

// ToolData is one read's result, for the client to render directly.
type ToolData struct {
	Action string          `json:"action"`
	JSON   json.RawMessage `json:"json"`
}

// Choice is one ambiguity for the user to settle.
type Choice struct {
	// Field is the argument the chosen id belongs to, e.g. "employee_id".
	Field string `json:"field"`
	// Name is the ambiguous name as it appeared, e.g. "Ana Cruz".
	Name    string         `json:"name"`
	Options []ChoiceOption `json:"options"`
}

type ChoiceOption struct {
	ID     string `json:"id"`
	Label  string `json:"label"`  // full name, middle name included
	Detail string `json:"detail"` // department, position — what tells them apart
}

// PendingAction is a write the model proposed, held for a human decision.
type PendingAction struct {
	ID     string          `json:"id"`
	Action string          `json:"action"`
	Args   json.RawMessage `json:"args"`

	// Label and Summary drive the confirmation card. Summary is the validated
	// arguments flattened for display, so the user reads what will actually be
	// sent rather than the model's prose description of it — those can differ,
	// and the arguments are what matters.
	Label   string         `json:"label"`
	Summary map[string]any `json:"summary"`
}

// Result is what the client renders.
type Result struct {
	Text    string          `json:"text"`
	Pending []PendingAction `json:"pending,omitempty"`
	History []Message       `json:"history"`

	// ExampleID ties a later confirm/cancel back to the captured example.
	ExampleID string `json:"example_id,omitempty"`

	// ToolsOffered records the candidate set, for the training row and for
	// debugging "why did it not know about X".
	ToolsOffered []string `json:"tools_offered,omitempty"`

	// Extractions is what was read out of any attached documents.
	//
	// Returned to the CLIENT rather than handed to the model as tool arguments,
	// because an employee's birth date, address and government ID numbers are
	// encrypted with a company key the server has never held. The server can
	// READ them off a scan — it just did the OCR — but it cannot store them.
	// So it passes them back, the browser encrypts them, and the browser
	// submits the update. See ExtractedDoc.
	Extractions []ExtractedDoc `json:"extractions,omitempty"`

	// Data is what the reads actually returned, passed through for the client to
	// render.
	//
	// The point of the prompt box is typing instead of clicking to a screen —
	// so the answer to "show me the employee list" is the list, not an 8B model
	// reciting it. Narrating a result the user could simply look at costs a
	// second model call, which measured at roughly half of a fourteen-second
	// turn on the deployment T4, and produces prose where a table would be both
	// faster and more useful.
	Data []ToolData `json:"data,omitempty"`

	// Choices is a disambiguation the USER should resolve, not the model.
	//
	// Relaying "which Ana?" through the model and asking it to interpret the
	// reply does not work on a small base model: given the roster, both ids and
	// its own question in context, Qwen3-8B answers "Finance" by repeating the
	// question — measured on the deployment host, with and without thinking.
	// Since the server already knows the candidates, it hands them to the client
	// as a list to click. That is deterministic, instant, and independent of how
	// good the model is at pronouns.
	Choices []Choice `json:"choices,omitempty"`

	// Model names the adapter that served this turn. Surfacing it matters
	// because a company on the shared base model and a company on its own
	// adapter will behave differently, and "which model answered this" is the
	// first question when output looks wrong.
	Model string `json:"model,omitempty"`
}

// Run executes one turn.
//
// Reads run immediately and their results go back to the model. Writes stop the
// loop and come back as PendingAction for a human to approve — no write reaches
// the database from a model turn alone.
func (e *Engine) Run(ctx context.Context, exec Executor, t Turn) (*Result, error) {
	if strings.TrimSpace(t.Prompt) == "" {
		return nil, fmt.Errorf("prompt is empty")
	}
	if t.Can == nil {
		return nil, fmt.Errorf("permission predicate is required")
	}
	if t.CompanyID == "" {
		// Without a company there is no way to choose a model or to scope the
		// captured example, and guessing either is worse than refusing.
		return nil, fmt.Errorf("company is required")
	}

	provider, err := e.router.For(ctx, t.CompanyID)
	if err != nil {
		return nil, fmt.Errorf("no model available for this company: %w", err)
	}

	offered := e.selector.Select(t.Prompt, t.Can, e.topK)
	defs := make([]ToolDef, len(offered))
	names := make([]string, len(offered))
	for i, tool := range offered {
		defs[i] = ToolDef{Name: tool.Action, Description: tool.Description, Schema: tool.Schema}
		names[i] = tool.Action
	}

	system := e.systemPrompt(t.Company)

	// Scans are read first and folded into the user turn as text. A failed
	// scan is reported in-line rather than aborting: the user can still be
	// asked for the figures, which beats losing the whole request because one
	// photo was blurry.
	prompt := t.Prompt
	var extracted []ExtractedDoc
	for _, att := range t.Attachments {
		// Kind is left empty so the model classifies the document itself — a
		// user photographing an ID does not first tell the system it is one.
		ex, err := e.extractor.Extract(ctx, att, "")
		if err != nil {
			prompt += fmt.Sprintf("\n\n[%s could not be read: %v. Ask the user for the details instead.]", att.Filename, err)
			continue
		}
		prompt += "\n\n" + ex.Describe(att.Filename)
		extracted = append(extracted, ExtractedDoc{
			Filename: att.Filename, Kind: string(ex.Kind),
			Fields: ex.Fields, Confidence: ex.Confidence, Notes: ex.Notes,
		})
	}

	// Trim the replayed conversation to what the window can hold. Without this
	// a couple of large tool results push every later request over the limit and
	// the assistant fails permanently — see budget.go.
	msgs := append(TrimHistory(t.History, HistoryBudget()), Message{Role: RoleUser, Text: prompt})

	// Identifiers the turn is allowed to reference. Seeded from what the user
	// typed — someone pasting a real UUID is legitimate — and extended by every
	// read that comes back. See grounding.go for why this is enforced rather
	// than merely instructed.
	grounding := NewGroundingSet()
	grounding.Observe(prompt)
	for _, m := range t.History {
		grounding.Observe(m.Text)
	}

	// Who the turn has seen, so a write naming a person whose name is shared
	// can be held back and asked about. See ambiguity.go.
	people := NewPersonIndex()
	for _, m := range t.History {
		people.Observe(m.Text)
	}

	// Ids the USER named, as opposed to ids that merely appeared in a read.
	//
	// Naming an id IS the disambiguation. Without this the guard is unable to
	// ever stop firing: "is this person's name shared?" stays true no matter how
	// the user answered, so picking "Ana Cruz (Finance)" from the list produces
	// the same question again, forever.
	userIDs := NewGroundingSet()
	userIDs.Observe(prompt)
	for _, m := range t.History {
		// Internal messages excluded. They carry RoleUser but the engine wrote
		// them, and an injected listing contains every id in the table — taking
		// those as ids the USER named would tell the ambiguity guard that every
		// person in the company had been explicitly identified, which is
		// exactly the guard switching itself off.
		if m.Role == RoleUser && !m.Internal {
			userIDs.Observe(m.Text)
		}
	}

	result := &Result{ToolsOffered: names, Model: provider.Name(), Extractions: extracted}

	// Some turns are conversation about an action rather than a request for
	// data, and are answered without calling the model at all. See followup.go.
	if text, proposed, handled := followUpWith(ctx, e, exec, e.registry, e.selector, offered, t); e.followUps && handled {
		result.Text = text
		if proposed != nil {
			result.Pending = []PendingAction{*proposed}
		}
		result.History = append(msgs, Message{Role: RoleAssistant, Text: text})
		return result, nil
	}

	// forced records that the model has already been told once to stop
	// answering from memory. calledTool records whether it reached for any
	// action at all this turn. See the no-tool-call branch below.
	forced, calledTool, injected, chased, listed := false, false, false, false, false

	for iter := 0; iter < e.maxIterations; iter++ {
		// Once a read has produced data the client will render, the model's
		// remaining job is a one-line caption, not a recitation. Generation is
		// the entire cost on this hardware — ~17 tok/s at a full context — so
		// capping the tail is worth more than any prompt-side saving.
		maxOut := ReservedForOutput
		if len(result.Data) > 0 {
			maxOut = CaptionTokens
			// Unless a write is still on the table, in which case what follows
			// may be a call rather than a caption.
			for _, tool := range offered {
				if tool.Write {
					maxOut = ProposalTokens
					break
				}
			}
		}

		comp, err := provider.Complete(ctx, Request{System: system, Messages: msgs, Tools: defs, MaxTokens: maxOut})
		if err != nil {
			if IsContextOverflow(err) {
				// Trimming should prevent this, but a single enormous turn can
				// still overflow. Telling the user to start fresh is far more
				// use than "internal server error", which leaves them retrying
				// a request that cannot ever succeed.
				result.Text = "This conversation has grown too long for me to hold. " +
					"Start a new one and ask again — narrowing the request (a date range, " +
					"one department) will also keep it shorter."
				result.History = nil
				return result, nil
			}
			return nil, fmt.Errorf("model call failed: %w", err)
		}

		// A tool call the server-side parser did not extract still counts.
		//
		// Blocked twice by the grounding guard, the model stopped emitting
		// structured calls and wrote the call out as literal text instead —
		// "<tool_call> {"name": "create_invoice", ...}" — which vLLM hands back
		// as ordinary prose. Left alone it goes on screen as raw syntax and the
		// turn produces nothing. Recovering it costs nothing in safety: the
		// arguments still go through validation, the grounding guard and the
		// confirmation card, exactly as an extracted call would.
		if len(comp.ToolCalls) == 0 {
			calls, rest := toolCallsInText(comp.Text)
			// The stripped prose is kept either way: syntax too mangled to
			// parse is still syntax, and still must not reach the user.
			comp.Text = rest
			if len(calls) > 0 {
				comp.ToolCalls = calls
			}
		}

		msgs = append(msgs, Message{Role: RoleAssistant, Text: comp.Text, ToolCalls: comp.ToolCalls})

		// No tool calls: the model answered in prose and the turn is over.
		if len(comp.ToolCalls) == 0 {
			// Unless it was asked to SHOW something and fetched nothing.
			//
			// History is replayed each turn, so once a record has been read the
			// model can answer about it from memory — and does. "show me andrew
			// sample details" then comes back as a paragraph describing him
			// with no card underneath, because no read ran and there is nothing
			// for the client to render. Reciting a record the user asked to be
			// shown is precisely what the prompt box exists to avoid.
			//
			// Re-asking rather than rebuilding the card from history is also
			// what keeps it correct: replayed tool results are truncated to fit
			// the context window, so they are not dependably parseable, and
			// they may be several turns stale.
			//
			// Gated on the model not having called anything at all: a read that
			// ran and failed, or a tool name that had to be corrected, has
			// already had its turn, and the prose explaining that is the honest
			// answer. Gated on t.Prompt rather than prompt because notes the
			// server appends — an unreadable attachment, say — are not the
			// user asking to see anything.
			if !forced && !calledTool && len(result.Data) == 0 &&
				(wantsToSee(t.Prompt) || announcesAction(comp.Text)) {
				forced = true
				nudge := "Do not answer from earlier messages, and do not describe what you " +
					"are about to do. Call the action that fetches this data now, so the user " +
					"is shown the record itself."
				if action := resolverFromText(comp.Text); action != "" {
					// Name the action. A generic instruction produced the same
					// refusal a second time — "I need the correct account IDs
					// … from the chart of accounts", with the chart of accounts
					// one call away and unmade. Told to call get_accounts, it
					// calls get_accounts. The same lesson as GroundingError.
					nudge = "Call " + action + " NOW to get the ids you say you need, then " +
						"continue. Do not ask the user for an id — they do not know it either."
				}
				msgs = append(msgs, Message{Role: RoleUser, Internal: true, Text: nudge})
				continue
			}

			// Read the record it needs, then stopped one step short.
			//
			// "approve the bill" reads get_bills, finds exactly one, and
			// answers "There is 1 bill available for approval" — true, useless,
			// and one call away from the proposal the user asked for. The id is
			// now in hand and grounded; what is missing is the instruction to
			// use it.
			// Write intent read off the RANKING, not off a verb list.
			//
			// "turn off the account active" and "mark the notification read"
			// are plainly requests to change something, and both sailed past a
			// hand-maintained list of verbs that happened not to include "turn
			// off" or "mark". The selector has already decided what this prompt
			// is about; if the best match is a write, the prompt wanted a write.
			// That list will never be complete, and this needs no maintaining.
			wantsWrite := wantsToWrite(t.Prompt) || topIsRequestedWrite(offered, t.Prompt)
			if !chased && len(result.Pending) == 0 && wantsWrite && len(result.Data) > 0 {
				if rows, _ := extractRows(result.Data[0].JSON); len(rows) == 1 {
					chased = true
					// Name the action. The last read is not necessarily the
					// right entity — "update the bill" read the bills and then
					// the accounts, and a chase that gestured at "the record"
					// sent the model back with an account id.
					instruction := "That is the record I meant. Call the action that carries out " +
						"my request on it now, using its id."
					if wanted, ok := requestedWrite(offered, t.Prompt); ok {
						instruction = "Call " + wanted.Action + " now, with the id of the record I " +
							"asked about."
					}
					msgs = append(msgs, Message{
						Role: RoleUser, Internal: true,
						Text: instruction + " Do not describe it back to me, and do not say it is " +
							"done — proposing it IS the action.",
					})
					continue
				}
			}

			// A write that needs a record, and no record named: go and read them.
			//
			// "approve the purchase order", "send the invoice", "turn off the
			// account" — the user says "the invoice" because they expect the
			// system to know which one, and the model, having no id and no way
			// to invent one that survives the grounding guard, answers with
			// nothing at all. Thirty-three prompts in the corpus died exactly
			// here. The listing is derived from the write's own name, so this
			// needs no table to maintain, and the rows go back as context: with
			// one candidate the chase above turns it into a proposal, with
			// several the model asks which, with none it says so.
			//
			// The write is looked up by RANK among the offered writes, not
			// taken from position zero. "approve the purchase order" ranks
			// get_purchase_orders first — reasonably, it says "purchase order"
			// twice — and checking only the top tool concluded no write was
			// wanted, so nothing was read, so the model invented an id and my
			// own grounding error became the answer on screen.
			wanted, isWrite := requestedWrite(offered, t.Prompt)
			if !listed && isWrite && len(result.Pending) == 0 && len(result.Data) == 0 {
				if field, list, ok := missingIDFor(e.registry, wanted); ok &&
					(list.Module == "" || t.Can(list.Module, list.Fn)) {
					if out, err := exec.Execute(ctx, list.Action, json.RawMessage(`{}`)); err == nil {
						listed = true
						grounding.ObserveJSON(out)
						people.Observe(string(out))
						msgs = append(msgs, Message{
							Role: RoleUser, Internal: true,
							Text: "Result of " + list.Action + ":\n" + truncateToolResult(string(out)) +
								"\n\nThat is where the " + strings.ReplaceAll(field, "_", " ") +
								" comes from. If exactly one of these is what I meant, carry out my " +
								"request on it now. If several could be, ask me which. If there are " +
								"none, say so. Do not invent an id and do not tell me it is done.",
						})
						continue
					}
				}
			}

			// Nudged, named the action, and STILL refusing: fetch it and hand
			// the result over.
			//
			// "I need the correct account IDs for Office Supplies Expense and
			// Cash on Hand from the chart of accounts" survived being told to
			// call get_accounts, verbatim, twice. Arguing with an 8B model
			// about whether it can do the thing it just described is not a
			// strategy. The read is one it was already offered and permitted to
			// make, so making it here changes nothing about what the user is
			// exposed to — the ids simply arrive, and the proposal it could not
			// assemble becomes assemblable.
			// Not gated on calledTool. A write REJECTED for inventing an id
			// counts as having called something, so requiring that nothing was
			// called excluded the one case that most needs the ids handed over:
			// the model proposes create_journal_entry with a guessed
			// account_id, the guard refuses it, and it falls back to asking the
			// user for the id — which is where it had already been stuck.
			// announcesAction is what distinguishes being stuck from being done.
			// Without it, "Here are the employees." triggered a fetch purely
			// for containing the word "employees".
			if !injected && len(result.Data) == 0 && announcesAction(comp.Text) {
				if action := resolverFromText(comp.Text); action != "" {
					if tool, known := e.registry.Lookup(action); known &&
						(tool.Module == "" || t.Can(tool.Module, tool.Fn)) {
						if out, err := exec.Execute(ctx, tool.Action, json.RawMessage(`{}`)); err == nil {
							injected = true
							// Grounded, so the ids may now legitimately be used
							// in a write — but NOT rendered: the user asked to
							// record an entry, not to see the chart of accounts.
							grounding.ObserveJSON(out)
							people.Observe(string(out))
							msgs = append(msgs, Message{
								Role: RoleUser, Internal: true,
								Text: "Result of " + action + ":\n" + truncateToolResult(string(out)) +
									"\n\nThose are the ids. Use them and complete the request now. " +
									"Do not ask for an id again.",
							})
							continue
						}
					}
				}
			}

			// Told to fetch and still refusing: go and fetch it anyway.
			//
			// An 8B model decides what "looks like" a name, and it is wrong
			// about real records constantly — an employee actually filed as
			// "asd asd" reads as gibberish to it, so it answers "the query is
			// still unclear" and asks which record is meant, about a person it
			// could have found by looking. The user cannot win that argument;
			// they typed the name correctly.
			//
			// So the listing is run here instead, and the row is matched by the
			// user's own words. Nothing is loosened by doing so: the read goes
			// through the same executor, and so through the same authorize()
			// and the same tenant scope, as one the model asked for. The result
			// is kept ONLY when it pins down exactly one record — a whole table
			// underneath "I could not tell what you meant" would be worse than
			// the question alone.
			// Not gated on whether the model called anything: its own read
			// failing — a guessed id that does not exist — leaves the user in
			// exactly the same place as a refusal, with a question where the
			// record should be. Either way the listing is there to be read.
			if len(result.Data) == 0 && wantsToSee(t.Prompt) {
				if row, data, ok := e.fetchByName(ctx, exec, t, offered, prompt); ok {
					result.Data = data
					result.Text = fmt.Sprintf("Showing %s.", row)
					result.History = syncHistory(msgs, result.Text)
					return result, nil
				}
			}

			result.Text = stripIDsFromText(comp.Text)

			// Clean the prose BEFORE narrowing, not after.
			//
			// Narrowing decides which rows to show from the names the answer
			// mentions. Run against the raw text, a model that dumped a
			// truncated markdown table of the roster named only its first
			// employee — and the list collapsed to that one row. Once the dump
			// is removed, only genuine references remain to narrow on.
			if len(result.Data) > 0 {
				result.Text = firstSentence(stripInlineEnumeration(stripFieldEnumeration(result.Text)))
			}
			var fix spellingFix
			result.Data, fix = narrowDataToAnswer(result.Data, result.Text, prompt)
			if fix.Actual != "" {
				result.Text = fmt.Sprintf("I can't find %s — showing the closest match, %s.", fix.Typed, fix.Actual)
			} else if name, ok := singleRecordName(result.Data); ok && recitesFields(comp.Text) {
				// The card below already shows every field being listed. Rather
				// than salvage the sentence, say what is on screen.
				result.Text = fmt.Sprintf("Showing %s.", name)
			} else if claimsCompletionFor(comp.Text, t.Prompt) && len(result.Pending) == 0 {
				// It said the thing was done. Nothing was done.
				//
				// "The loan with ID \"\" has been approved." — no proposal, no
				// call, an empty id, and a user who now believes a loan was
				// approved. Every write in this system goes through a
				// confirmation card, so a turn that produced no card changed
				// nothing, and any sentence claiming otherwise is false. This
				// is the one place the model's own words are discarded outright
				// rather than tidied.
				result.Text = "I have not done that — nothing is changed until you confirm it. " +
					"Tell me which record you mean and I will put it up for approval."
				result.Data = nil
			} else if action, need := missingForWrite(offered, t.Prompt, result.Pending); action != "" {
				// Asked to ADD something, and nothing was proposed.
				//
				// Told "add expense account", with no code and no name, the
				// model called get_accounts, found an empty chart and answered
				// "There are no active expense accounts" — a true statement
				// about a question nobody asked. It reads an add as a check
				// whenever the details are missing, and no amount of ranking
				// fixes that, because create_account was already first on the
				// list. What the user needs is the question the action itself
				// implies: these fields, please.
				result.Text = fmt.Sprintf("To %s I need %s. Give me those and I will prepare it for you.",
					humaniseAction(action), joinWords(need))
				result.Data = nil
			} else if n, noun, ok := listedBack(result.Data, result.Text); ok {
				// Same thing one level up: a caption that names row after row is
				// the table again in prose. "Here are the employees: - asd asd
				// asd (Probationary, Active) - Mark Padama (Regular, Active)..."
				// is not a caption, it is a worse copy of what is underneath it.
				result.Text = fmt.Sprintf("%d %s.", n, noun)
			}
			result.History = syncHistory(msgs, result.Text)
			return result, nil
		}

		calledTool = true

		var pending []PendingAction
		var results []Message
		var choices []Choice

		for _, call := range comp.ToolCalls {
			tool, known := e.registry.Lookup(call.Name)
			if !known {
				// An invented tool name is the classic small-model failure. Say
				// what does exist so the retry has somewhere to go.
				results = append(results, Message{
					Role:       RoleTool,
					ToolCallID: call.ID,
					Text:       fmt.Sprintf("No such action %q. Available actions are: %s.", call.Name, strings.Join(names, ", ")),
				})
				continue
			}

			// Re-check the permission at call time. The selector already
			// filtered, but that filtering is an optimisation, not a control —
			// this is the check that matters, and the handler will check again.
			if tool.Module != "" && !t.Can(tool.Module, tool.Fn) {
				results = append(results, Message{
					Role:       RoleTool,
					ToolCallID: call.ID,
					Text:       fmt.Sprintf("Refused: this user does not have %s:%s permission.", tool.Module, tool.Fn),
				})
				continue
			}

			if err := ValidateArgs(tool, call.Args); err != nil {
				results = append(results, Message{
					Role:       RoleTool,
					ToolCallID: call.ID,
					Text:       fmt.Sprintf("Invalid arguments for %s: %v. Correct them and call it again.", call.Name, err),
				})
				continue
			}

			if tool.Write {
				// Last gate before a human sees this as a proposal. An invented
				// id that reaches the confirmation card looks exactly like a
				// real one, and the user has no way to tell.
				if bad := grounding.Check(tool, call.Args); len(bad) > 0 {
					results = append(results, Message{
						Role:       RoleTool,
						ToolCallID: call.ID,
						Text:       GroundingError(tool, bad).Error(),
					})
					continue
				}

				// Grounding proves the id is real; this checks it is the right
				// real person. Both candidates render identically on the
				// confirmation card, so the card cannot catch this — it has to
				// be caught before the proposal exists.
				if field, matches := findAmbiguity(people, userIDs, tool, call.Args); len(matches) > 1 {
					// Two audiences, one detection. The model is told so it stops
					// and explains; the user is given buttons so the answer never
					// has to travel back through the model.
					choices = appendChoice(choices, field, matches)
					results = append(results, Message{
						Role:       RoleTool,
						ToolCallID: call.ID,
						Text:       AmbiguityError(field, matches).Error(),
					})
					continue
				}

				var summary map[string]any
				_ = json.Unmarshal(call.Args, &summary)
				pending = append(pending, PendingAction{
					ID:      call.ID,
					Action:  tool.Action,
					Args:    call.Args,
					Label:   tool.Description,
					Summary: summary,
				})
				continue
			}

			out, err := exec.Execute(ctx, tool.Action, call.Args)
			if err != nil {
				results = append(results, Message{
					Role:       RoleTool,
					ToolCallID: call.ID,
					Text:       fmt.Sprintf("%s failed: %v", call.Name, err),
				})
				continue
			}
			// Observe the FULL result — grounding and person-matching need every
			// id, even from a result too large to show the model in full.
			grounding.ObserveJSON(out)
			people.Observe(string(out))
			// Hand the full result to the client even though the model only
			// sees a truncated copy — the UI can render ten thousand rows in a
			// table perfectly well, and it is the model that cannot read them.
			// Only the most recent read is kept. A turn that answers "details of
			// Andrew" reads the roster to find his id and then reads his record;
			// rendering both puts the entire company above the one row that was
			// actually asked for. Earlier reads are plumbing.
			result.Data = []ToolData{{Action: tool.Action, JSON: json.RawMessage(out)}}
			results = append(results, Message{
				Role: RoleTool, ToolCallID: call.ID, Text: truncateToolResult(string(out)),
			})
		}

		// A write nobody asked for is dropped.
		//
		// Asked to SHOW the email outbox, the model read it and then proposed
		// retry_email; asked to show a credit memo, it read the memos and
		// proposed apply_credit_memo. It is being helpful, and the result is a
		// confirmation card in reply to a question — the one interaction this
		// whole design exists to prevent the user having to think about.
		// Dropping a proposal can never cause a change, so this is the safe
		// direction to err in.
		if len(pending) > 0 && looksReadOnly(t.Prompt) {
			log.Printf("ai: dropped %d unrequested write proposal(s) on a read request %q",
				len(pending), t.Prompt)
			pending = nil
		}

		// A proposed write ends the turn. Any reads in the same turn have
		// already run — they are what the model used to build the proposal.
		if len(pending) > 0 {
			result.Text = stripIDsFromText(comp.Text)
			result.Pending = pending
			result.History = append(msgs, results...)
			result.ExampleID = e.capture(ctx, provider, system, t, defs, pending)
			return result, nil
		}

		msgs = append(msgs, results...)

		// NOTE: an instruction to "summarise in one sentence" used to be injected
		// here. It stopped the model mid-chain: asked for one person's details it
		// would call get_employees to find the id, be told to summarise, and
		// answer with the whole roster instead of going on to get_employee.
		//
		// Brevity belongs in the system prompt, where it applies to the final
		// answer without ending the turn early. ReservedForOutput does the rest.

		// An unresolved ambiguity ends the turn: there is nothing useful for the
		// model to do next, and looping just burns seconds re-asking.
		if len(choices) > 0 {
			comp2, err := provider.Complete(ctx, Request{System: system, Messages: msgs, Tools: defs, MaxTokens: 1024})
			if err == nil && comp2.Text != "" {
				result.Text = stripIDsFromText(comp2.Text)
			} else {
				result.Text = "There is more than one person with that name — which did you mean?"
			}
			result.Choices = choices
			result.History = msgs
			return result, nil
		}
	}

	// Iteration cap hit.
	//
	// Usually because the request was a write with something missing, and the
	// turn spent its budget reading things trying to find it — this engine now
	// has four separate ways to push a stalled model back to work (the nudge,
	// the injected read, the candidate lookup and the chase), and on a request
	// that cannot be satisfied at all they compound until the cap stops them.
	// Running out of iterations is not itself informative; what the user needs
	// is the same thing they would have got if the model had asked properly.
	if action, need := missingForWrite(offered, t.Prompt, result.Pending); action != "" {
		result.Text = fmt.Sprintf("To %s I need %s. Give me those and I will prepare it for you.",
			humaniseAction(action), joinWords(need))
		result.Data = nil
		result.History = syncHistory(msgs, result.Text)
		return result, nil
	}

	// Nothing specific to ask for. Say so plainly rather than pretend to an answer.
	result.Text = "I wasn't able to work that out — I kept going back and forth without reaching an answer. Try rephrasing, or narrow it to one thing at a time."
	result.History = msgs
	return result, nil
}

// fetchByName runs the highest-ranked argument-free read and keeps its result
// only if the user's own words identify exactly one row in it.
//
// Returns the row's display name alongside the data, so the caller can caption
// the card with the record actually being shown rather than leaving the model's
// "which one did you mean?" sitting above it.
func (e *Engine) fetchByName(ctx context.Context, exec Executor, t Turn, offered []Tool, prompt string) (string, []ToolData, bool) {
	// Search first, if there is one. Asking the server for a name beats pulling
	// every record and picking one out here, and it is what the model should
	// have done itself.
	if tool, terms, ok := searchFor(offered, prompt); ok {
		if tool.Module == "" || t.Can(tool.Module, tool.Fn) {
			args, _ := json.Marshal(map[string]string{"name": terms})
			if out, err := exec.Execute(ctx, tool.Action, args); err == nil {
				data := []ToolData{{Action: tool.Action, JSON: json.RawMessage(out)}}
				if rows, _ := extractRows(out); len(rows) > 0 {
					if len(rows) == 1 {
						if row, isMap := rows[0].(map[string]any); isMap {
							if name := displayNameOf(row); name != "" {
								return name, data, true
							}
						}
					}
					// Several people match. Showing them beats asking the user
					// to disambiguate a name they already gave in full.
					return fmt.Sprintf("%d matches for %q", len(rows), terms), data, true
				}
			}
		}
	}

	tool, ok := firstListingRead(offered)
	if !ok {
		return "", nil, false
	}
	// The same permission pre-check the model's own calls get. authorize()
	// checks again server-side; this only avoids a call certain to be refused.
	if tool.Module != "" && !t.Can(tool.Module, tool.Fn) {
		return "", nil, false
	}

	out, err := exec.Execute(ctx, tool.Action, json.RawMessage(`{}`))
	if err != nil {
		return "", nil, false
	}

	data := []ToolData{{Action: tool.Action, JSON: json.RawMessage(out)}}
	// Match on the prompt alone. The model's text here is a question, not an
	// answer, so it names nobody and would only ever match nothing.
	narrowed, _ := narrowDataToAnswer(data, "", prompt)
	rows, _ := extractRows(narrowed[0].JSON)
	if len(rows) != 1 {
		return "", nil, false
	}
	row, isMap := rows[0].(map[string]any)
	if !isMap {
		return "", nil, false
	}
	name := displayNameOf(row)
	if name == "" {
		return "", nil, false
	}
	return name, narrowed, true
}

// searchFor finds an offered read whose one required argument is a name, and
// reduces the prompt to the words worth searching for.
func searchFor(offered []Tool, prompt string) (Tool, string, bool) {
	terms := nameTermsFrom(prompt)
	if terms == "" {
		return Tool{}, "", false
	}
	for _, tool := range offered {
		if tool.Write {
			continue
		}
		req, ok := tool.Schema["required"].([]string)
		if !ok || len(req) != 1 {
			continue
		}
		switch req[0] {
		case "name", "query", "search":
			return tool, terms, true
		}
	}
	return Tool{}, "", false
}

// nameTermsFrom strips the request down to what might be a name.
//
// "show me asd asd details" searched verbatim matches nobody — the surrounding
// words are the request, not the person. What is left after removing them is
// what the user actually named.
var notAName = map[string]bool{
	"show": true, "me": true, "my": true, "the": true, "a": true, "an": true,
	"details": true, "detail": true, "detials": true, "record": true, "records": true,
	"info": true, "information": true, "profile": true, "employee": true, "employees": true,
	"staff": true, "person": true, "of": true, "for": true, "about": true, "on": true,
	"get": true, "give": true, "find": true, "look": true, "up": true, "search": true,
	"who": true, "is": true, "please": true, "list": true, "display": true, "view": true,
	"open": true, "pull": true, "bring": true, "see": true, "want": true, "to": true,
	"and": true, "s": true,
}

func nameTermsFrom(prompt string) string {
	var kept []string
	for _, w := range strings.FieldsFunc(strings.ToLower(prompt), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r) && r != '\''
	}) {
		if notAName[w] {
			continue
		}
		kept = append(kept, w)
	}
	if len(kept) == 0 || len(kept) > 5 {
		// Nothing left, or so much left that it is a sentence rather than a name.
		return ""
	}
	return strings.Join(kept, " ")
}

// firstListingRead picks the best-ranked read that can be called with no
// arguments — a listing. Anything needing an id cannot be called blind, which
// is the whole reason the model got stuck.
func firstListingRead(offered []Tool) (Tool, bool) {
	for _, tool := range offered {
		if tool.Write {
			continue
		}
		if req, ok := tool.Schema["required"].([]string); ok && len(req) > 0 {
			continue
		}
		return tool, true
	}
	return Tool{}, false
}

func displayNameOf(row map[string]any) string {
	var parts []string
	for _, k := range []string{"first_name", "middle_name", "last_name"} {
		if v, ok := row[k].(string); ok {
			if v = strings.TrimSpace(v); v != "" {
				parts = append(parts, v)
			}
		}
	}
	if len(parts) > 0 {
		return strings.Join(parts, " ")
	}
	for _, k := range []string{"name", "title", "entry_no", "code"} {
		if v, ok := row[k].(string); ok {
			if v = strings.TrimSpace(v); v != "" {
				return v
			}
		}
	}
	return ""
}

// listedBack reports whether a caption reads the table back row by row, and
// what to say instead.
//
// Naming several rows is NOT on its own the signal — "Two people have pending
// leave: Ana and Ben." names two and is a genuine answer, shorter and more use
// than the table under it. What marks a recital is the shape it comes in:
// bullets, or the sheer length of carrying each row's attributes along. So both
// must hold — rows named, and written out as a list.
func listedBack(data []ToolData, text string) (int, string, bool) {
	if len(data) != 1 || strings.TrimSpace(text) == "" {
		return 0, "", false
	}
	const answerLength = 100
	if len(bulletMark.FindAllString(text, 2)) < 2 && len(text) <= answerLength {
		return 0, "", false
	}
	rows, key := extractRows(data[0].JSON)
	if len(rows) < 2 {
		return 0, "", false
	}
	if len(matchRows(rows, strings.ToLower(text))) < 2 {
		return 0, "", false
	}
	noun := strings.ReplaceAll(key, "_", " ")
	if noun == "" {
		noun = "records"
	}
	return len(rows), noun, true
}

// toolCallsInText extracts calls the model wrote into its prose, returning them
// alongside whatever prose is left once they are removed.
//
// The JSON is found by matching braces rather than by regex. A pattern is the
// obvious reach and the wrong tool: every one of these payloads nests an
// "arguments" object, so a non-greedy match ends at the inner brace and a
// greedy one swallows everything between two separate calls. Counting depth —
// while ignoring braces inside strings — is the only version that survives a
// create_invoice with line items, which is exactly the shape that provokes the
// model into writing the call out as text in the first place.
func toolCallsInText(text string) ([]ToolCall, string) {
	const open = "<tool_call>"
	if !strings.Contains(text, open) {
		// No marker at all. The model also drops the wrapper entirely and
		// answers with the bare call object — same failure, one layer further
		// undressed — so a response that IS a call is treated as one.
		if call, ok := bareToolCall(text); ok {
			return []ToolCall{call}, ""
		}
		return nil, text
	}

	var calls []ToolCall
	var kept strings.Builder
	rest := text
	for {
		i := strings.Index(rest, open)
		if i < 0 {
			kept.WriteString(rest)
			break
		}
		kept.WriteString(rest[:i])
		after := rest[i+len(open):]

		body, tail, ok := firstJSONObject(after)
		if !ok {
			// Nothing parseable follows the marker. Drop the marker itself so
			// raw syntax never reaches the user, and carry on.
			rest = after
			continue
		}
		tail = strings.TrimPrefix(strings.TrimSpace(tail), "</tool_call>")

		var parsed struct {
			Name      string          `json:"name"`
			Arguments json.RawMessage `json:"arguments"`
		}
		if err := json.Unmarshal([]byte(body), &parsed); err == nil && parsed.Name != "" {
			args := parsed.Arguments
			if len(args) == 0 {
				args = json.RawMessage(`{}`)
			}
			calls = append(calls, ToolCall{
				ID:   fmt.Sprintf("recovered-%d", len(calls)),
				Name: parsed.Name,
				Args: args,
			})
		}
		rest = tail
	}
	return calls, strings.TrimSpace(kept.String())
}

// bareToolCall reads a whole response that is nothing but a call object.
//
// Deliberately strict: the entire message must be that object, with both a name
// and an arguments field. Anything looser would start treating a model's
// example JSON, or a snippet it is explaining, as an instruction to act.
func bareToolCall(text string) (ToolCall, bool) {
	trimmed := strings.TrimSpace(text)
	if !strings.HasPrefix(trimmed, "{") {
		return ToolCall{}, false
	}
	body, tail, ok := firstJSONObject(trimmed)
	if !ok || strings.TrimSpace(tail) != "" {
		return ToolCall{}, false
	}
	var parsed struct {
		Name      string          `json:"name"`
		Arguments json.RawMessage `json:"arguments"`
	}
	if err := json.Unmarshal([]byte(body), &parsed); err != nil || parsed.Name == "" || len(parsed.Arguments) == 0 {
		return ToolCall{}, false
	}
	return ToolCall{ID: "recovered-0", Name: parsed.Name, Args: parsed.Arguments}, true
}

// firstJSONObject returns the first brace-balanced object in s, and whatever
// follows it.
func firstJSONObject(s string) (body, tail string, ok bool) {
	start := strings.IndexByte(s, '{')
	if start < 0 {
		return "", s, false
	}
	depth, inString, escaped := 0, false, false
	for i := start; i < len(s); i++ {
		c := s[i]
		switch {
		case escaped:
			escaped = false
		case c == '\\' && inString:
			escaped = true
		case c == '"':
			inString = !inString
		case inString:
			// Braces inside a string are text, not structure.
		case c == '{':
			depth++
		case c == '}':
			depth--
			if depth == 0 {
				return s[start : i+1], s[i+1:], true
			}
		}
	}
	return "", s, false
}

// announcesAction reports that the model said it would do something and then
// did not.
//
// "I need the correct account IDs for Office Supplies Expense and Cash on Hand
// from the chart of accounts. Let me retrieve that information." — and then no
// call, and the turn ends there. The user is left holding a promise. Saying it
// is not doing it, so the same nudge that handles a refusal handles this.
var (
	announcement = regexp.MustCompile(`(?i)\b(let me|i'?ll|i will|i need to|i should|i'?m going to)\b[^.]{0,80}?\b(retriev|fetch|get|look|check|call|find|search|list|pull)`)

	// Asking the user for something a read would answer. "I need the correct
	// account IDs for Office Supplies Expense and Cash on Hand from the chart
	// of accounts" — the chart of accounts is one call away, and the user has
	// no more idea what those ids are than the model does.
	needsLookup = regexp.MustCompile(`(?i)\b(i\s+(?:still\s+|also\s+|really\s+)?need|i require|i don'?t have|i do not have|i'?m missing|please provide|could you provide)\b[^.]{0,100}?\b(id|ids|identifier|account|customer|vendor|employee|invoice|bill|record)`)
)

func announcesAction(text string) bool {
	return announcement.MatchString(text) || needsLookup.MatchString(text)
}

// resolverFromText picks the read that would supply what the model just said
// it was missing.
func resolverFromText(text string) string {
	lower := strings.ToLower(text)
	for _, pair := range []struct{ word, action string }{
		{"chart of accounts", "get_accounts"},
		{"account", "get_accounts"},
		{"customer", "get_customers"},
		{"vendor", "get_vendors"},
		{"supplier", "get_vendors"},
		{"employee", "find_employees"},
		{"invoice", "get_invoices"},
		{"bill", "get_bills"},
		{"department", "get_departments"},
		{"position", "get_positions"},
		{"period", "get_fiscal_periods"},
	} {
		if strings.Contains(lower, pair.word) {
			return pair.action
		}
	}
	return ""
}

// missingForWrite names the write the user asked for and the fields it cannot
// be called without, when the turn failed to propose anything.
func missingForWrite(offered []Tool, prompt string, pending []PendingAction) (string, []string) {
	if len(pending) > 0 {
		return "", nil
	}
	// Which write, and whether one was asked for at all, both come from the
	// ranking rather than from a list of verbs. The list did not contain
	// "save", so "save the payroll setting" was not a write request as far as
	// this function was concerned, and it returned nothing to say.
	tool, ok := requestedWrite(offered, prompt)
	if !ok {
		return "", nil
	}

	req, _ := tool.Schema["required"].([]string)
	if len(req) == 0 {
		// Nothing declared required — several handlers validate nothing at all.
		// "save the payroll setting" still cannot be carried out without
		// knowing WHAT to set, so the question is built from the fields the
		// action accepts instead.
		fields := settableFields(tool)
		if len(fields) == 0 {
			return "", nil
		}
		return tool.Action, fields
	}

	lower := strings.ToLower(prompt)
	var need []string
	for _, field := range req {
		// Never ask the user for an id. They do not know the UUID of a bill any
		// more than the model does, and "To approve a bill I need id" is a
		// worse answer than saying nothing. Ids are resolved by reading.
		if field == "id" || strings.HasSuffix(field, "_id") {
			continue
		}
		if strings.Contains(lower, strings.ReplaceAll(field, "_", " ")) {
			continue
		}
		need = append(need, strings.ReplaceAll(field, "_", " "))
	}
	if len(need) == 0 {
		// Everything required was an id. If the action also takes values, the
		// user still has to say which ones — "save the payroll setting"
		// requires only an id, and knowing WHICH settings record to save says
		// nothing about what to put in it. Where there are no values either
		// (approve_bill takes an id and nothing else) there is no question to
		// ask, and the candidate lookup resolves the record instead.
		// Two or more, not one. send_invoice requires an id and takes a single
		// optional skip_email flag, and asking "To send an invoice I need skip
		// email" is worse than asking nothing — the user is missing the
		// invoice, not the flag. Several value fields is the shape of a record
		// that genuinely cannot be filled in without being told.
		if fields := settableFields(tool); len(fields) > 1 {
			return tool.Action, fields
		}
		return "", nil
	}
	return tool.Action, need
}

const doneVerbs = `(approved|created|added|updated|deleted|removed|posted|voided|sent|closed|cancelled|canceled|submitted|recorded|saved|assigned|reconciled|marked|toggled|paid|confirmed)`

var (
	// Always a claim about THIS turn, whatever was asked. "I've created it",
	// "it has been approved", "successfully saved" — none of these can be true
	// of a turn that proposed nothing.
	completionNow = regexp.MustCompile(`(?i)\b(ha(?:s|ve) been|i'?ve|i have|successfully|is now|are now)\b[^.]{0,40}?\b` + doneVerbs + `\b`)

	// Ambiguous on its own. "The invoice was sent to the customer" is a false
	// claim in reply to "send the invoice", and a true answer to "was the
	// invoice sent". Only the request tells them apart, so this one is judged
	// against the prompt rather than in isolation.
	completionPast = regexp.MustCompile(`(?i)\b(was|were)\b[^.]{0,40}?\b` + doneVerbs + `\b`)
)

func claimsCompletion(text string) bool {
	return completionNow.MatchString(text)
}

// syncHistory makes the replayed conversation say what the USER was shown.
//
// The engine rewrites the model's final sentence in several places — a false
// completion claim, a recital of a card, a question about missing fields — but
// the history handed back still carried the model's original words. So the user
// read "To create an account I need code, name and account type", replied "i
// dont know the code", and the next turn replayed a conversation in which that
// question was never asked: what the history contained was "There are no active
// expense accounts". Nothing downstream could make sense of the reply, because
// the thing it replied to was not there.
func syncHistory(msgs []Message, text string) []Message {
	for i := len(msgs) - 1; i >= 0; i-- {
		if msgs[i].Role != RoleAssistant {
			continue
		}
		if len(msgs[i].ToolCalls) > 0 {
			// A tool-call turn is a record of what was called; leave it alone
			// and add the spoken answer after it.
			break
		}
		msgs[i].Text = text
		return msgs
	}
	return append(msgs, Message{Role: RoleAssistant, Text: text})
}

// requestedWrite returns the highest-ranked write the prompt is actually about.
//
// Both which write, and whether one was wanted at all, are read off the
// ranking. Every hand-maintained list of write verbs in this file was wrong at
// least once — missing "turn off", then "mark", then "save" — and each gap
// silently turned a request into a conversation.
func requestedWrite(offered []Tool, prompt string) (Tool, bool) {
	if looksReadOnly(prompt) {
		return Tool{}, false
	}
	lower := strings.ToLower(prompt)
	for _, tool := range offered {
		if !tool.Write {
			continue
		}
		// The prompt has to be ABOUT this tool. When a prompt matches nothing —
		// "thanks, that's all" — the ranking is decided by tiebreak, and
		// whatever lands first would otherwise be taken for what the user
		// wanted. A word in common with the tool's own subject separates a
		// request from a pleasantry.
		for _, word := range strings.Split(subjectOf(tool.Action), "_") {
			if len(word) > 2 && containsWord(lower, word) {
				return tool, true
			}
		}
	}
	return Tool{}, false
}

func topIsRequestedWrite(offered []Tool, prompt string) bool {
	_, ok := requestedWrite(offered, prompt)
	return ok
}

// settableFields names what an action accepts, for asking about a write whose
// handler declares nothing required. Ids are left out — the user does not know
// them — and the list is capped, because a question listing twenty fields is
// not a question.
func settableFields(tool Tool) []string {
	props, ok := tool.Schema["properties"].(map[string]any)
	if !ok || len(props) == 0 {
		return nil
	}
	var out []string
	for name := range props {
		if name == "id" || strings.HasSuffix(name, "_id") {
			continue
		}
		out = append(out, strings.ReplaceAll(name, "_", " "))
	}
	sort.Strings(out)
	if len(out) > 4 {
		out = out[:4]
	}
	return out
}

// claimsCompletionFor is claimsCompletion with the request in view.
func claimsCompletionFor(text, prompt string) bool {
	// Never on a read. An answer to "show me the chart of accounts" may
	// perfectly well say "no accounts have been created yet" — a statement
	// about the data, not a claim about this turn — and replacing it with "I
	// have not done that" was both wrong and baffling. Only a request to change
	// something can be falsely reported as having changed something.
	if looksReadOnly(prompt) {
		return false
	}
	return completionNow.MatchString(text) || completionPast.MatchString(text)
}

// wantsToWrite reports a prompt that asks for something to be created.
func wantsToWrite(prompt string) bool {
	if looksReadOnly(prompt) {
		return false
	}
	lower := strings.ToLower(prompt)
	// Every write verb, not just the creating ones. "approve the bill" changes
	// data as surely as "add an account" does, and leaving approve/void/post
	// out meant a whole class of requests was treated as conversation.
	for _, verb := range []string{
		"add", "create", "new ", "make ", "set up", "raise", "open ", "file ", "enter ", "register",
		"approve", "reject", "void", "post ", "send", "email", "delete", "remove", "update", "edit ",
		"change", "close", "reopen", "cancel", "assign", "pay ", "issue", "submit", "convert",
		"transfer", "adjust", "dispose", "receive", "reconcile", "toggle", "enable", "disable",
		"activate", "deactivate", "run ", "process", "record", "apply",
	} {
		if strings.Contains(lower, verb) {
			return true
		}
	}
	return false
}

func humaniseAction(action string) string {
	parts := strings.Split(action, "_")
	if len(parts) < 2 {
		return strings.ReplaceAll(action, "_", " ")
	}
	subject := strings.Join(parts[1:], " ")
	article := "a "
	if strings.ContainsRune("aeiou", rune(subject[0])) {
		article = "an "
	}
	return parts[0] + " " + article + subject
}

// joinWords renders a list as prose: "a, b and c".
func joinWords(words []string) string {
	switch len(words) {
	case 0:
		return ""
	case 1:
		return words[0]
	}
	return strings.Join(words[:len(words)-1], ", ") + " and " + words[len(words)-1]
}

// wantsToSee reports whether the user asked to be SHOWN data.
//
// Deliberately a small list of verbs rather than anything cleverer: its only
// job is to separate "show me andrew sample details" from "thanks", and the
// cost of a false positive is one wasted model call while the cost of a false
// negative is the failure this exists to fix.
func wantsToSee(prompt string) bool {
	lower := strings.ToLower(prompt)
	for _, w := range []string{
		"show", "list", "display", "detail", "view", "open", "pull up", "bring up",
		"who", "which", "what", "when", "where", "how many", "how much",
		"find", "search", "look up", "get me", "give me", "check",
	} {
		if strings.Contains(lower, w) {
			return true
		}
	}
	return false
}

// narrowDataToAnswer trims a rendered result to the rows the answer is about.
//
// Asked for one person's details, the model reads the whole roster and answers
// from it rather than chaining to get_employee — reasonable, since the roster
// already contains what it needs. But then the table under the answer is the
// entire company when the user asked about one employee.
//
// Rather than fight that with more instructions, this uses what the model
// reliably DOES produce: it names the ids it is talking about, in prose, every
// time ("Andrew Sample ... with the ID 701abbc1-..."). Those ids are extracted
// before they are stripped from the text, and the table is filtered to match.
//
// If the answer names no ids, nothing is filtered — that is the case where the
// user did ask for a list.
func narrowDataToAnswer(data []ToolData, answer, prompt string) ([]ToolData, spellingFix) {
	var fix spellingFix
	if len(data) == 0 {
		return data, fix
	}

	out := make([]ToolData, 0, len(data))
	for _, d := range data {
		rows, key := extractRows(d.JSON)
		if len(rows) < 2 {
			out = append(out, d)
			continue
		}

		// Match against the ANSWER first, then fall back to the PROMPT.
		//
		// The answer is the better signal when the model actually found the
		// record. When it does not — a misspelled name, say — it gives up and
		// says something generic like "there are 10 employees", which names
		// nobody and leaves the whole roster on screen for a request that
		// clearly concerned one person. The user's own words still say who they
		// meant, so they are the fallback.
		kept := matchRows(rows, strings.ToLower(answer))
		if len(kept) != 1 {
			kept = matchRows(rows, strings.ToLower(prompt))
		}

		// Narrow ONLY when the answer is about exactly one record.
		//
		// "Some mentioned, some not" is too loose: asked for the employee list,
		// the model names a few people in its summary and says "and others" —
		// which under that rule filtered a five-person roster down to the three
		// it happened to spell out. Losing rows from a list is worse than
		// showing an extra one.
		//
		// One row named is the case this exists for: "details of Andrew" should
		// not print the company.
		if len(kept) != 1 {
			out = append(out, d)
			continue
		}

		// Judge the spelling against the PROMPT, never against the answer.
		//
		// Which of the two matched says nothing about whether the name was
		// typed correctly: handed "andres sample", the model echoes that
		// spelling straight back in "Andres Sample is not found" — so the
		// answer matches, the fallback never runs, and the contradiction
		// survives. The user's own words are the only reliable record of what
		// they wrote.
		if m, ok := kept[0].(map[string]any); ok {
			if f, found := spellingFixFor(m, strings.ToLower(prompt)); found {
				fix = f
			}
		}

		var rebuilt any = kept
		if key != "" {
			rebuilt = map[string]any{key: kept}
		}
		b, err := json.Marshal(rebuilt)
		if err != nil {
			out = append(out, d)
			continue
		}
		out = append(out, ToolData{Action: d.Action, JSON: b})
	}
	return out, fix
}

// spellingFix is a name the user got wrong, paired with the record it reached.
type spellingFix struct {
	Typed  string // as written: "andres sample"
	Actual string // as filed:   "Andrew Sample"
}

// spellingFixFor works out whether the prompt reached this row by a misspelling
// and, if so, what was written versus what is on file.
//
// Fuzzy matching alone leaves the user misled: they ask for "andres sample",
// a card for ANDREW Sample appears, and nothing on screen says the two are not
// the same person. Worse, the model — which found nobody by that spelling —
// captions it "Andres Sample is not found", flatly contradicting the card below
// it. Naming both spellings resolves that: the answer says plainly that the
// name as typed is not on file, and the card is visibly the closest match
// rather than a silent substitution.
func spellingFixFor(row map[string]any, lowerPrompt string) (spellingFix, bool) {
	var typed, actual []string
	differs := false
	for _, k := range []string{"first_name", "last_name", "name", "title", "entry_no", "code"} {
		v, ok := row[k].(string)
		if !ok {
			continue
		}
		if v = strings.TrimSpace(v); v == "" {
			continue
		}
		actual = append(actual, v)

		// Only parts the user actually wrote can be misspelled. Asked for
		// "andrw", they never typed a surname at all — reporting one as
		// mistyped would be inventing a mistake.
		w, matched := matchedWord(lowerPrompt, strings.ToLower(v))
		if !matched {
			continue
		}
		if w != strings.ToLower(v) {
			differs = true
		}
		typed = append(typed, w)
	}
	if !differs || len(typed) == 0 {
		return spellingFix{}, false
	}
	return spellingFix{Typed: strings.Join(typed, " "), Actual: strings.Join(actual, " ")}, true
}

func matchRows(rows []any, lower string) []any {
	if lower == "" {
		return nil
	}
	kept := make([]any, 0, len(rows))
	for _, r := range rows {
		if m, ok := r.(map[string]any); ok && rowMentionedIn(m, lower) {
			kept = append(kept, r)
		}
	}
	return kept
}

// rowMentionedIn reports whether an answer is talking about this row.
//
// Matching on the NAME, not on an id. An earlier version keyed off UUIDs in the
// answer, which worked exactly as long as the model happened to print one —
// asked the same question twice, it wrote the id once and plain prose the next
// time, and the unfiltered roster came back. Names are what the model always
// produces when it is talking about a record.
//
// A row counts as mentioned only if EVERY name part it has appears in the
// answer. Requiring all parts avoids matching "Mark Padama" on an answer about
// "Mark Santos", and avoids one-word rows matching almost anything.
func rowMentionedIn(row map[string]any, lowerAnswer string) bool {
	var parts []string
	for _, k := range []string{"first_name", "last_name", "name", "title", "entry_no", "code"} {
		if v, ok := row[k].(string); ok {
			if v = strings.TrimSpace(strings.ToLower(v)); v != "" {
				parts = append(parts, v)
			}
		}
	}
	// Nothing nameable to match on — an id-only row cannot be judged, so it is
	// left in rather than silently dropped.
	if len(parts) == 0 {
		return true
	}
	for _, part := range parts {
		if !mentionsName(lowerAnswer, part) {
			return false
		}
	}
	return true
}

// MatchesName reports whether haystack refers to needle, tolerating one typo.
// Exported for the employee search, which needs the same tolerance server-side:
// a name search that fails on a single wrong letter is a name search users
// stop trusting.
func MatchesName(haystack, needle string) bool { return mentionsName(haystack, needle) }

// mentionsName is containsWord plus tolerance for a typo.
//
// People misspell names constantly — "andres" for "Andrew" is what prompted
// this — and an exact match means the request silently degrades into a dump of
// the entire table. One or two characters out on a word of four or more is
// treated as the same name; shorter words are matched exactly, since at three
// characters an edit distance of one is a different word.
func mentionsName(haystack, needle string) bool {
	_, ok := matchedWord(haystack, needle)
	return ok
}

// matchedWord is mentionsName that also hands back the word it matched on, so a
// caller can tell an exact hit from a near one and report the spelling used.
func matchedWord(haystack, needle string) (string, bool) {
	if containsWord(haystack, needle) {
		return needle, true
	}
	if len(needle) < 4 || !hasLetter(needle) {
		// Never fuzzy-match a number.
		//
		// Typo tolerance is for names. Applied to an account code it is
		// actively harmful: 2000 and 1000 differ by one edit, so asking to
		// credit "Cash on Hand 2000" was answered with "I can't find cash on
		// hand 2000 — showing the closest match, Cash on Hand 1000". A digit
		// out is a different account, not a misspelling.
		return "", false
	}
	tolerance := 1
	if len(needle) >= 6 {
		tolerance = 2
	}
	for _, w := range strings.FieldsFunc(haystack, func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	}) {
		// Length is a cheap pre-filter: words differing by more than the
		// tolerance cannot possibly be within it.
		if diff := len(w) - len(needle); diff > tolerance || diff < -tolerance {
			continue
		}
		if editDistance(w, needle) <= tolerance {
			return w, true
		}
	}
	return "", false
}

func hasLetter(s string) bool {
	for _, r := range s {
		if unicode.IsLetter(r) {
			return true
		}
	}
	return false
}

// editDistance is Damerau-Levenshtein: insert, delete, substitute, and
// TRANSPOSE, each costing one.
//
// Transposition has to count as a single edit. Swapped adjacent letters are the
// most common typing mistake there is — "jonh" for "john" — and plain
// Levenshtein scores that as two substitutions, putting it outside a tolerance
// of one and treating the two as different names.
func editDistance(a, b string) int {
	rows := make([][]int, len(a)+1)
	for i := range rows {
		rows[i] = make([]int, len(b)+1)
		rows[i][0] = i
	}
	for j := 0; j <= len(b); j++ {
		rows[0][j] = j
	}
	for i := 1; i <= len(a); i++ {
		for j := 1; j <= len(b); j++ {
			cost := 1
			if a[i-1] == b[j-1] {
				cost = 0
			}
			rows[i][j] = min3(rows[i][j-1]+1, rows[i-1][j]+1, rows[i-1][j-1]+cost)
			if i > 1 && j > 1 && a[i-1] == b[j-2] && a[i-2] == b[j-1] {
				if t := rows[i-2][j-2] + 1; t < rows[i][j] {
					rows[i][j] = t
				}
			}
		}
	}
	return rows[len(a)][len(b)]
}

func min3(a, b, c int) int {
	if b < a {
		a = b
	}
	if c < a {
		a = c
	}
	return a
}

// containsWord matches on word boundaries rather than substrings.
//
// Plain Contains is wrong here and quietly so: "Ana" is inside "management",
// "Sample" is inside "sampled", and a one-letter name matches nearly any
// sentence. The failure is invisible — the table just shows the wrong subset.
func containsWord(haystack, needle string) bool {
	if needle == "" {
		return false
	}
	for i := 0; ; {
		j := strings.Index(haystack[i:], needle)
		if j < 0 {
			return false
		}
		start := i + j
		end := start + len(needle)
		beforeOK := start == 0 || !isWordByte(haystack[start-1])
		afterOK := end == len(haystack) || !isWordByte(haystack[end])
		if beforeOK && afterOK {
			return true
		}
		i = start + 1
		if i >= len(haystack) {
			return false
		}
	}
}

func isWordByte(b byte) bool {
	return b == '_' || (b >= '0' && b <= '9') || (b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z')
}

// extractRows finds the row array in a tool result, and the key it sat under
// so the shape can be rebuilt. Handlers return either a bare array or an object
// wrapping one.
func extractRows(raw json.RawMessage) ([]any, string) {
	var asArray []any
	if err := json.Unmarshal(raw, &asArray); err == nil {
		return asArray, ""
	}
	var asObj map[string]any
	if err := json.Unmarshal(raw, &asObj); err != nil {
		return nil, ""
	}
	// A single record is recognised BEFORE any hunt for a nested array.
	//
	// get_employee returns one employee, and that employee carries an
	// enrolled_benefits array of its own — so scanning for "the first array
	// property" returned the benefits, and an employee enrolled in nothing
	// looked like no rows at all. The caption for a single record then could
	// not be generated, and the field-by-field recital it was meant to replace
	// went to screen unchanged. A list response has no id or name of its own,
	// so it still falls through to the scan.
	if isRecord(asObj) {
		return []any{asObj}, ""
	}
	for k, v := range asObj {
		if arr, ok := v.([]any); ok {
			return arr, k
		}
	}
	return nil, ""
}

// isRecord reports whether an object is itself one record rather than a wrapper
// around a list of them.
func isRecord(obj map[string]any) bool {
	for _, k := range []string{"id", "first_name", "name", "title", "entry_no", "code"} {
		if v, ok := obj[k].(string); ok && strings.TrimSpace(v) != "" {
			return true
		}
	}
	return false
}

// bulletMark matches a list marker anywhere in a line, including one the model
// ran together into a single paragraph.
var bulletMark = regexp.MustCompile(`(?:^|\s)[-*\x{2022}\x{2013}\x{2014}]\s`)

// markdownTableRow matches a row of a markdown table: two or more pipes.
// The model reaches for one of these as readily as for bullets when asked to
// show records.
var markdownTableRow = regexp.MustCompile(`^\s*\|.*\|`)

// firstSentence keeps the opening sentence and discards the rest.
//
// The blunt instrument, and the one that finally works. Told not to bullet, the
// model produced a markdown table; told not to table, it would find a third
// shape. When the data is already rendered on screen, no second format of it is
// wanted, so the prose is cut to one sentence regardless of what the model chose
// to do — a caption cannot become a duplicate of the card if it cannot exceed a
// sentence.
func firstSentence(text string) string {
	text = strings.TrimSpace(text)
	if i := strings.IndexAny(text, "\n"); i >= 0 {
		text = text[:i]
	}
	// Split on ". " rather than "." so decimals and abbreviations survive.
	if i := strings.Index(text, ". "); i >= 0 {
		text = text[:i+1]
	}
	return strings.TrimSpace(text)
}

// bulletedField matches an explicitly bulleted field line: "- First Name: Andrew".
var bulletedField = regexp.MustCompile(`^\s*[-*\x{2022}\x{2013}\x{2014}]\s*[^:]{1,40}:\s*\S`)

// shortLabelField matches an unbulleted "Label: value" where the label is a few
// words at most — "Status: Active", not "Two people have pending leave: Ana".
var shortLabelField = regexp.MustCompile(`^\s*(?:[A-Za-z0-9()/_'-]+\s+){0,2}[A-Za-z0-9()/_'-]+\s*:\s*\S`)

// stripFieldEnumeration removes a field-by-field listing from an answer that
// already has a card or table under it.
//
// The system prompt forbids this in three different wordings. The model does it
// anyway — it is what an instruct model does when asked for "details". Three
// rounds of prompting were three too many; this is deterministic.
//
// It matters beyond tidiness: in the case that prompted it, the prose read
// "Department: Test" while the record's department was empty. The model had
// filled the gap from neighbouring rows. The card is generated from the data
// and is correct, so cutting the prose removes a confidently wrong duplicate.
//
// Applied ONLY when there is rendered data to replace it. With nothing on
// screen, a field listing IS the answer and is left alone.
func stripFieldEnumeration(text string) string {
	lines := strings.Split(text, "\n")

	// Unbulleted "Label: value" only counts as enumeration when several lines
	// share the shape. One such line is usually an ordinary sentence — an
	// earlier version stripped "Two people have pending leave: Ana and Ben."
	shortLabelCount := 0
	for _, ln := range lines {
		if shortLabelField.MatchString(ln) {
			shortLabelCount++
		}
	}
	stripShort := shortLabelCount >= 3

	kept := make([]string, 0, len(lines))
	for _, ln := range lines {
		if strings.TrimSpace(ln) == "" {
			continue
		}
		if bulletedField.MatchString(ln) || markdownTableRow.MatchString(ln) {
			continue
		}
		if stripShort && shortLabelField.MatchString(ln) {
			continue
		}
		kept = append(kept, strings.TrimSpace(ln))
	}

	// A lead-in whose list was just removed ("...has the following details:")
	// is left dangling. Trailing bullet punctuation goes with it — stripping
	// the list items off "Here are the details of all employees: -" otherwise
	// leaves that orphaned dash on screen.
	for len(kept) > 0 {
		trimmed := strings.TrimRight(kept[len(kept)-1], " -\u2013\u2014*\u2022")
		if trimmed == "" {
			kept = kept[:len(kept)-1]
			continue
		}
		if !strings.HasSuffix(trimmed, ":") {
			kept[len(kept)-1] = trimmed
			break
		}
		kept = kept[:len(kept)-1]
	}
	return strings.TrimSpace(strings.Join(kept, " "))
}

// inlineLabel matches a "label: " pair inside a running sentence, and isValue
// the same thing written out as prose.
//
// Both forms exist because the model produces both. Told not to write
// "department: test", it wrote `department is "test"` instead — the same
// recitation with the colon spelled differently. Pattern-matching the prose is
// a losing game played one form at a time, which is why what follows does not
// try to repair such a sentence, only to recognise it and use its own.
var (
	inlineLabel = regexp.MustCompile(`(?i)[a-z][a-z _]{0,24}:\s`)
	isValue     = regexp.MustCompile(`(?i)\b[a-z][a-z _]{0,24}\s+(?:is|are|was)\s+"`)
)

// recitesFields reports whether the text reads back a record field by field.
// Two or more pairs is the signal; one is an ordinary sentence.
func recitesFields(text string) bool {
	n := len(inlineLabel.FindAllString(text, 3)) + len(isValue.FindAllString(text, 3))
	return n >= 2
}

// singleRecordName returns the display name when the rendered data is exactly
// one record, so a caption can name what is on screen without the model.
func singleRecordName(data []ToolData) (string, bool) {
	if len(data) != 1 {
		return "", false
	}
	rows, _ := extractRows(data[0].JSON)
	if len(rows) != 1 {
		return "", false
	}
	row, ok := rows[0].(map[string]any)
	if !ok {
		return "", false
	}
	name := displayNameOf(row)
	return name, name != ""
}

// stripInlineEnumeration cuts a field list the model wrote on ONE line.
//
// stripFieldEnumeration works line by line, which catches bullets and stacked
// "Label: value" rows but not "...has the following details: department: test,
// position: asd, status: Active." — one line, one sentence, straight past both
// that and firstSentence, and onto the screen directly above a card already
// showing every one of those fields.
//
// Two or more label pairs after the colon is the signal. One is an ordinary
// sentence — "Two people have pending leave: Ana and Ben." must survive — so
// the count is what separates a list from prose, exactly as it does line-wise.
func stripInlineEnumeration(text string) string {
	i := strings.Index(text, ":")
	if i < 0 {
		return text
	}
	if len(inlineLabel.FindAllString(text[i+1:], 3)) < 2 {
		return text
	}
	lead := strings.TrimRight(strings.TrimSpace(text[:i]), " ,;:")
	if lead == "" {
		return ""
	}
	return lead + "."
}

// stripMarkdown removes emphasis markers from prose.
//
// The answer bubble renders plain text, so "**First Name:**" arrives on screen
// with the asterisks visible. Instructing the model not to use markdown does not
// stick — it is trained to. Stripping is deterministic and cheaper than adding a
// markdown renderer for one line of caption.
func stripMarkdown(text string) string {
	for _, m := range []string{"**", "__", "`"} {
		text = strings.ReplaceAll(text, m, "")
	}
	return text
}

// stripIDsFromText removes UUIDs from anything shown to the user.
//
// The system prompt already tells the model not to print ids. It does anyway —
// observed repeatedly in production, inside otherwise-good answers. A UUID is
// meaningless to a person, eats a line of screen, and makes the reply read like
// debug output, so this removes them rather than asking the model again.
//
// Applied ONLY to prose. Tool arguments, the data passthrough and captured
// training rows keep their ids — those are machine paths where the id is the
// entire point.
func stripIDsFromText(text string) string {
	if !idPattern.MatchString(text) {
		return strings.TrimSpace(stripMarkdown(text))
	}
	out := idPattern.ReplaceAllString(text, "")
	// Tidy what removal leaves behind: empty backticks and parens, doubled
	// spaces, a space before punctuation.
	for _, pair := range [][2]string{
		{"``", ""}, {"()", ""}, {"  ", " "},
		{" .", "."}, {" ,", ","}, {" )", ")"}, {"( ", "("},
	} {
		for strings.Contains(out, pair[0]) {
			out = strings.ReplaceAll(out, pair[0], pair[1])
		}
	}
	return strings.TrimSpace(stripMarkdown(out))
}

// appendChoice adds a user-facing picker for one ambiguous field, skipping
// duplicates when several proposed actions collide on the same person.
func appendChoice(choices []Choice, field string, matches []person) []Choice {
	for _, c := range choices {
		if c.Field == field && c.Name == matches[0].shortName() {
			return choices
		}
	}
	opts := make([]ChoiceOption, 0, len(matches))
	for _, p := range matches {
		opts = append(opts, ChoiceOption{ID: p.ID, Label: p.FullName(), Detail: p.distinguisher()})
	}
	return append(choices, Choice{Field: field, Name: matches[0].shortName(), Options: opts})
}

// findAmbiguity reports the field and the candidates when a write names a
// person whose name is shared with someone else the turn has seen.
func findAmbiguity(people *PersonIndex, userIDs *GroundingSet, tool Tool, args json.RawMessage) (string, []person) {
	props, _ := tool.Schema["properties"].(map[string]any)
	if props == nil || len(args) == 0 {
		return "", nil
	}
	var decoded map[string]any
	if err := json.Unmarshal(args, &decoded); err != nil {
		return "", nil
	}

	for name, raw := range decoded {
		if !idField(name) {
			continue
		}
		id, ok := raw.(string)
		if !ok || id == "" {
			continue
		}
		// Already settled by the user naming this exact id — either by picking
		// from the list or by pasting it. Asking again would be asking them to
		// answer a question they have answered.
		if userIDs.Has(id) {
			continue
		}
		if matches := people.Ambiguous(id); len(matches) > 1 {
			return name, matches
		}
	}
	return "", nil
}

// capture records the proposal as a training example. Failures are logged and
// swallowed: losing a training row is acceptable, failing the user's request
// because the dataset table is unavailable is not.
func (e *Engine) capture(ctx context.Context, provider Provider, system string, t Turn, defs []ToolDef, pending []PendingAction) string {
	id := uuid.New().String()

	calls := make([]ToolCall, len(pending))
	for i, p := range pending {
		calls[i] = ToolCall{ID: p.ID, Name: p.Action, Args: p.Args}
	}

	err := e.recorder.Record(ctx, TrainingExample{
		ID: id,
		// CompanyID is what keeps this example inside one tenant's dataset.
		// Every export filters on it; without it an example would be eligible
		// to train another company's adapter.
		CompanyID: t.CompanyID,
		System:    system,
		Prompt:    t.Prompt,
		Tools:     defs,
		Proposed:  calls,
		Provider:  provider.Name(),
	})
	if err != nil {
		log.Printf("ai: could not record training example %s: %v", id, err)
		return ""
	}
	return id
}

// systemPrompt is deliberately short.
//
// Long, rule-heavy system prompts are a frontier-model habit that transfers
// badly: every token here is prepended to every request, and a 14B fine-tune
// follows a handful of clear rules far better than twenty hedged ones. The
// behaviour that matters is taught by the training data, not restated in prose.
// The date must be injected — a model has no clock, and half of what people
// type at an ERP is relative ("last month", "next week").
func (e *Engine) systemPrompt(company string) string {
	now := e.now()
	var b strings.Builder

	b.WriteString("You are the assistant inside LetterSheets, an ERP system.\n\n")
	if company != "" {
		fmt.Fprintf(&b, "Company: %s\n", company)
	}
	fmt.Fprintf(&b, "Today is %s (%s).\n", now.Format("2006-01-02"), now.Format("Monday"))
	b.WriteString("Amounts are Philippine Pesos.\n\n")
	b.WriteString("Rules:\n")
	b.WriteString("- IDs are UUIDs. Never invent one. To act on a person, call get_employees first and use the id from the result.\n")
	b.WriteString("- Read actions run immediately. Actions that change data are shown to the user for approval before anything is saved, so propose them plainly rather than asking permission in prose.\n")
	// Measured against the base model on the deployment host: without this,
	// Qwen3-8B answers "who is off next week" by asking which department is
	// meant, instead of calling get_leaves with the obvious date range. An
	// instruct model's default caution reads as unhelpful in an ERP, where the
	// user is looking at their own company's data and expects an answer.
	b.WriteString("- Prefer calling an action over asking a question. Work out date ranges yourself from today's date, and pick the obvious filter rather than asking which one to use. State any assumption in one short sentence alongside the result.\n")
	b.WriteString("- Ask only when acting could affect the wrong person or the wrong money, and the request genuinely does not say which.\n")
	b.WriteString("- Use only the actions you have been given. If none of them can do what was asked, say so in one sentence and stop.\n")
	b.WriteString("- Answer from what the actions return. Do not estimate or fill in gaps.\n")
	// Output tokens dominate latency on a small self-hosted model: on the
	// deployment T4, reciting a ten-row roster verbatim cost ~700 tokens and
	// over thirty seconds, versus a two-line summary in a couple. Users asking
	// "show me the employee list" want the answer, not the table read aloud —
	// the table is one click away in the module.
	// The client renders results as a table or a detail card. Anything the
	// model writes out on top of that is duplicated on screen — and on this
	// hardware, output tokens are the entire latency budget, so reciting a
	// record costs seconds to produce something the user is already looking at.
	b.WriteString("- Results are shown to the user as a table or a detail card. NEVER list the fields or rows back — no bulleted field lists, no \"First Name: ...\" lines.\n")
	b.WriteString("- Reply with ONE short sentence about what you found: a count, a total, or what stands out. If there is nothing to add, say nothing more than that.\n")
	// UUIDs are internal and unreadable to a person. They also cost roughly a
	// dozen tokens each, which on a long list is most of the response.
	b.WriteString("- Never show ids to the user. Refer to people and records by name.\n")

	return b.String()
}
