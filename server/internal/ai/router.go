package ai

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Every company gets its own model.
//
// Served naively that does not scale: a 14B at 4-bit occupies roughly 9GB of
// VRAM, so one deployment per tenant grows linearly with the customer list and
// runs out of hardware in the teens. The workable form is one base model held
// in VRAM once, plus a small LoRA adapter per company (tens to low hundreds of
// MB) hot-swapped per request — what vLLM does under --enable-lora.
//
// Conveniently, vLLM selects the adapter through the `model` field of the
// OpenAI-compatible request, which LocalProvider already sends. So routing a
// company to its own model is a naming decision, not a protocol change, and
// LocalProvider needs no per-tenant state.
//
// Router is the seam. A single-model deployment uses StaticRouter and behaves
// exactly as before; a per-tenant deployment uses AdapterRouter.
type Router interface {
	// For returns the provider serving this company. Implementations must be
	// safe for concurrent use and cheap enough to call on every turn.
	For(ctx context.Context, companyID string) (Provider, error)
}

// StaticRouter serves every company from one model. This is the correct
// configuration before any company has enough data to train on, and for a
// hosted bootstrap provider.
type StaticRouter struct{ P Provider }

func (s StaticRouter) For(context.Context, string) (Provider, error) {
	if s.P == nil {
		return nil, fmt.Errorf("no model configured")
	}
	return s.P, nil
}

// AdapterLookup reports which LoRA adapter serves a company.
//
// The second result is false when the company has no adapter of its own — a
// new tenant, or one that has not yet accumulated enough confirmed actions to
// train on. That is the normal state of every company on its first day, not an
// error, and AdapterRouter answers it with the base model.
type AdapterLookup interface {
	AdapterFor(ctx context.Context, companyID string) (string, bool)
}

// StaticAdapters is a fixed company → adapter map, suitable for a config file
// while the tenant count is small. A database-backed AdapterLookup can replace
// it without touching anything else.
type StaticAdapters map[string]string

func (m StaticAdapters) AdapterFor(_ context.Context, companyID string) (string, bool) {
	name, ok := m[companyID]
	return name, ok && name != ""
}

// SetThinking applies to every provider this router creates from now on, and to
// those already cached.
func (r *AdapterRouter) SetThinking(on bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.thinking = on
	for _, p := range r.cache {
		p.SetThinking(on)
	}
}

// AdapterRouter serves each company from its own LoRA adapter on a shared base
// model, falling back to the base for companies that do not have one yet.
//
// Providers are memoised per adapter so the underlying http.Client — and its
// connection pool — is shared across every tenant rather than rebuilt per
// request.
type AdapterRouter struct {
	baseURL string
	// baseModel serves companies with no adapter of their own. Cold start is
	// the normal case: a company cannot have a trained model until it has
	// generated the data to train one, so this is the path most tenants are on
	// for their first weeks.
	baseModel string
	apiKey    string
	timeout   time.Duration
	lookup    AdapterLookup

	// thinking is applied to every provider this router hands out.
	thinking bool

	// client is shared by every provider this router hands out. Building one
	// http.Client per tenant would give each its own idle connection pool
	// against the same inference server.
	client *http.Client

	mu    sync.RWMutex
	cache map[string]*LocalProvider
}

func NewAdapterRouter(baseURL, baseModel, apiKey string, timeout time.Duration, lookup AdapterLookup) *AdapterRouter {
	if timeout <= 0 {
		timeout = 3 * time.Minute
	}
	if lookup == nil {
		lookup = StaticAdapters{}
	}
	return &AdapterRouter{
		baseURL:   strings.TrimRight(baseURL, "/"),
		baseModel: baseModel,
		apiKey:    apiKey,
		timeout:   timeout,
		lookup:    lookup,
		client:    &http.Client{Timeout: timeout},
		cache:     map[string]*LocalProvider{},
	}
}

func (r *AdapterRouter) For(ctx context.Context, companyID string) (Provider, error) {
	model := r.baseModel
	if adapter, ok := r.lookup.AdapterFor(ctx, companyID); ok {
		model = adapter
	}
	if model == "" {
		return nil, fmt.Errorf("no base model configured and company %s has no adapter", companyID)
	}
	return r.providerFor(model), nil
}

func (r *AdapterRouter) providerFor(model string) *LocalProvider {
	r.mu.RLock()
	p, ok := r.cache[model]
	r.mu.RUnlock()
	if ok {
		return p
	}

	r.mu.Lock()
	defer r.mu.Unlock()
	// Re-check: another goroutine may have built it while the write lock was
	// being acquired.
	if p, ok := r.cache[model]; ok {
		return p
	}
	p = &LocalProvider{
		baseURL:  r.baseURL,
		model:    model,
		apiKey:   r.apiKey,
		client:   r.client,
		thinking: r.thinking,
	}
	r.cache[model] = p
	return p
}

// TrainingReadiness describes whether a company has enough confirmed actions to
// be worth training an adapter on.
//
// The thresholds are not a hard rule — they are the point below which a LoRA
// run tends to produce a model worse than the base it started from, because it
// overfits a handful of phrasings and loses the base model's general tool-use
// ability. Reporting readiness rather than silently training is deliberate:
// promoting a tenant onto a bad adapter is worse than leaving them on the base.
type TrainingReadiness struct {
	CompanyID string `json:"company_id"`
	// Usable counts confirmed and edited examples; cancelled ones carry no
	// training target and are excluded.
	Usable int `json:"usable"`
	// DistinctActions matters more than raw volume. Two thousand examples of
	// one action teach a model that every prompt is that action.
	DistinctActions int    `json:"distinct_actions"`
	Ready           bool   `json:"ready"`
	Reason          string `json:"reason"`
}

const (
	// MinExamplesForAdapter is the floor below which a per-company adapter is
	// not worth training.
	MinExamplesForAdapter = 2000
	// MinActionsForAdapter guards against a dataset dominated by one action.
	MinActionsForAdapter = 6
)

// AssessReadiness applies the thresholds above.
func AssessReadiness(companyID string, usable, distinctActions int) TrainingReadiness {
	t := TrainingReadiness{
		CompanyID:       companyID,
		Usable:          usable,
		DistinctActions: distinctActions,
	}

	switch {
	case usable < MinExamplesForAdapter:
		t.Reason = fmt.Sprintf("%d usable examples; %d needed before a per-company adapter beats the base model",
			usable, MinExamplesForAdapter)
	case distinctActions < MinActionsForAdapter:
		t.Reason = fmt.Sprintf("examples cover only %d distinct actions; %d needed so the adapter does not collapse onto one",
			distinctActions, MinActionsForAdapter)
	default:
		t.Ready = true
		t.Reason = fmt.Sprintf("%d usable examples across %d actions", usable, distinctActions)
	}
	return t
}
