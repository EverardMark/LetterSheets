package eval

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"lettersheets/internal/ai"
)

// TestCorpus runs the generated corpus against the live model.
//
// Skipped unless EVAL_URL is set, because it needs a GPU on the other end and
// takes minutes rather than milliseconds. Run it after any change to the
// registry, the selector or the engine:
//
//	EVAL_URL=http://host:8000 EVAL_KEY=... EVAL_PER_MODULE=4 go test ./internal/ai/eval/ -run TestCorpus -v -timeout 60m
func TestCorpus(t *testing.T) {
	base := os.Getenv("EVAL_URL")
	if base == "" {
		t.Skip("set EVAL_URL to run the corpus against a live model")
	}
	// Unset means a sample; an explicit 0 means the whole catalogue. Reading
	// "0" as "unset" silently ran 165 prompts when 438 were asked for.
	perModule := 3
	if raw := os.Getenv("EVAL_PER_MODULE"); raw != "" {
		perModule, _ = strconv.Atoi(raw)
	}
	workers, _ := strconv.Atoi(os.Getenv("EVAL_WORKERS"))
	if workers == 0 {
		workers = 4
	}

	reg := ai.NewRegistry()
	cases := Build(reg, perModule)
	t.Logf("running %d prompts (%d per module, %d at a time)", len(cases), perModule, workers)

	// EVAL_FOLLOWUPS=0 measures the model unaided, which is the only fair way to
	// compare two models: with the handlers on, both look competent at the turns
	// the handlers cover.
	engine := ai.NewEngine(
		ai.StaticRouter{P: ai.NewLocalProvider(base, "qwen3-8b", os.Getenv("EVAL_KEY"), 180*time.Second)},
		reg, nil)
	if os.Getenv("EVAL_FOLLOWUPS") == "0" {
		engine.SetFollowUps(false)
	}

	results := make([]Result, len(cases))
	var wg sync.WaitGroup
	sem := make(chan struct{}, workers)

	// Progress is written to a FILE, not to the test log.
	//
	// go test buffers the binary's output — stdout and stderr alike — until the
	// test returns, so a seven-minute run shows a blank terminal and a cursor
	// with no way to tell it from a hang. A file can be tailed while the run is
	// in flight, which is the only thing that reliably works here.
	var done int64
	start := time.Now()
	progressPath := os.Getenv("EVAL_PROGRESS")
	if progressPath == "" {
		// /tmp, not os.TempDir(): on macOS the latter is a per-user directory
		// under /var/folders with an unguessable name, so the file was written
		// where nobody would think to look for it.
		progressPath = "/tmp/eval-progress.txt"
		if _, err := os.Stat("/tmp"); err != nil {
			progressPath = filepath.Join(os.TempDir(), "eval-progress.txt")
		}
	}
	progress, _ := os.Create(progressPath)
	if progress != nil {
		defer progress.Close()
		fmt.Fprintf(progress, "%d prompts, %d at a time\n\n", len(cases), workers)
	}
	var pmu sync.Mutex
	note := func(format string, args ...any) {
		if progress == nil {
			return
		}
		pmu.Lock()
		defer pmu.Unlock()
		fmt.Fprintf(progress, format, args...)
		_ = progress.Sync()
	}
	t.Logf("progress: tail -f %s", progressPath)

	for i, c := range cases {
		wg.Add(1)
		go func(i int, c Case) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			ex := &Executor{}
			res, err := engine.Run(context.Background(), ex, ai.Turn{
				Prompt: c.Prompt, Can: func(string, string) bool { return true },
				CompanyID: "eval-co", Company: "Acme Corp",
			})
			r := Result{Case: c, Called: ex.Calls, Err: err}
			if res != nil {
				r.Text = res.Text
				for _, p := range res.Pending {
					r.Proposed = append(r.Proposed, p.Action)
				}
			}
			Score(&r)
			results[i] = r

			n := atomic.AddInt64(&done, 1)
			if r.Pass {
				note(".")
			} else {
				note("\n  FAIL %-46q %s\n", c.Prompt, r.Reason)
			}
			if n%50 == 0 || int(n) == len(cases) {
				note("  %d/%d  %s elapsed\n", n, len(cases), time.Since(start).Round(time.Second))
			}
		}(i, c)
	}
	wg.Wait()
	report := Report(results)
	note("\n%s", report)
	t.Log("\n" + report)
}
