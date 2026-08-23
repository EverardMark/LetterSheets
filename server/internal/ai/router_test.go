package ai

import (
	"context"
	"strings"
	"testing"
)

// A company with its own adapter must be served by it; one without must fall
// back to the shared base rather than failing. Cold start is the normal state
// of every tenant on day one.
func TestAdapterRouterRoutesPerCompany(t *testing.T) {
	r := NewAdapterRouter("http://vllm:8000", "qwen3-14b-base", "", 0,
		StaticAdapters{"acme": "lora-acme", "beta": "lora-beta"})

	cases := []struct{ company, wantModel string }{
		{"acme", "lora-acme"},
		{"beta", "lora-beta"},
		{"brand-new-tenant", "qwen3-14b-base"},
	}

	for _, c := range cases {
		p, err := r.For(context.Background(), c.company)
		if err != nil {
			t.Fatalf("%s: %v", c.company, err)
		}
		if !strings.Contains(p.Name(), c.wantModel) {
			t.Errorf("company %s served by %s, want %s", c.company, p.Name(), c.wantModel)
		}
	}
}

// Providers are memoised so every tenant shares one connection pool against the
// inference server rather than opening its own.
func TestAdapterRouterReusesProviders(t *testing.T) {
	r := NewAdapterRouter("http://vllm:8000", "base", "", 0, StaticAdapters{"acme": "lora-acme"})

	first, _ := r.For(context.Background(), "acme")
	second, _ := r.For(context.Background(), "acme")
	if first != second {
		t.Error("router rebuilt the provider instead of reusing it")
	}

	base1, _ := r.For(context.Background(), "new-a")
	base2, _ := r.For(context.Background(), "new-b")
	if base1 != base2 {
		t.Error("two cold-start companies got separate base providers")
	}

	lp, ok := first.(*LocalProvider)
	if !ok {
		t.Fatal("expected a LocalProvider")
	}
	baselp := base1.(*LocalProvider)
	if lp.client != baselp.client {
		t.Error("adapters do not share an http.Client, so each has its own connection pool")
	}
}

func TestAdapterRouterErrorsWithNoModelAtAll(t *testing.T) {
	r := NewAdapterRouter("http://vllm:8000", "", "", 0, nil)
	if _, err := r.For(context.Background(), "acme"); err == nil {
		t.Error("expected an error when neither an adapter nor a base model exists")
	}
}

// Promoting a company onto an undertrained adapter is worse than leaving it on
// the base model, so readiness is reported rather than assumed.
func TestAssessReadiness(t *testing.T) {
	if got := AssessReadiness("acme", 120, 9); got.Ready {
		t.Errorf("120 examples should not be ready: %+v", got)
	} else if !strings.Contains(got.Reason, "2000") {
		t.Errorf("reason should state the threshold, got %q", got.Reason)
	}

	// Volume alone is not enough: a dataset that is all one action teaches the
	// model that every prompt is that action.
	if got := AssessReadiness("acme", 5000, 2); got.Ready {
		t.Errorf("2 distinct actions should not be ready: %+v", got)
	} else if !strings.Contains(got.Reason, "distinct actions") {
		t.Errorf("reason should name the coverage problem, got %q", got.Reason)
	}

	if got := AssessReadiness("acme", 3000, 11); !got.Ready {
		t.Errorf("3000 examples across 11 actions should be ready: %+v", got)
	}
}
