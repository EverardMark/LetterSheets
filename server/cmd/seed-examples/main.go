// Command seed-examples loads authored examples into a company's retrieval
// memory.
//
// Waiting for organic use is the honest way to fill the memory and the slow
// one: a company that has confirmed four actions has four examples. But the
// people who run the business already know what the right answer looks like —
// which account a phrase means, what "PO" refers to here, how a request should
// be declined — and writing that down is faster than performing it.
//
// These are NOT training data. They are retrieved and shown to the model at
// inference, take effect on the next message, and are removed with a DELETE. A
// mistake here costs one row, not a retraining run.
//
//	seed-examples -company <uuid> -file examples.jsonl [-dry-run]
//
// Each line is one example:
//
//	{"prompt": "show me who is off",       "action": "get_leaves", "args": {"status": "Approved"}}
//	{"prompt": "book a delivery van",      "answer": "Vans are booked in Fleet, not here — I can log the expense afterwards."}
//
// An example may carry an action, an answer, or both.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql"
	"github.com/google/uuid"

	"lettersheets/internal/ai"
	"lettersheets/internal/config"
	"lettersheets/internal/database"
)

type line struct {
	Prompt string          `json:"prompt"`
	Action string          `json:"action"`
	Args   json.RawMessage `json:"args"`
	Answer string          `json:"answer"`
}

func main() {
	var (
		companyID = flag.String("company", "", "company the examples belong to (required)")
		file      = flag.String("file", "", "JSONL file of examples (required)")
		cfgPath   = flag.String("config", "config.json", "server config, for the database")
		dryRun    = flag.Bool("dry-run", false, "validate and report, write nothing")
	)
	flag.Parse()
	if *companyID == "" || *file == "" {
		flag.Usage()
		os.Exit(2)
	}

	raw, err := os.ReadFile(*file)
	if err != nil {
		log.Fatalf("read %s: %v", *file, err)
	}
	registry := ai.NewRegistry()

	var examples []line
	var problems []string
	for i, l := range strings.Split(string(raw), "\n") {
		l = strings.TrimSpace(l)
		if l == "" || strings.HasPrefix(l, "//") {
			continue
		}
		var ex line
		if err := json.Unmarshal([]byte(l), &ex); err != nil {
			problems = append(problems, fmt.Sprintf("line %d: not valid JSON: %v", i+1, err))
			continue
		}
		if strings.TrimSpace(ex.Prompt) == "" {
			problems = append(problems, fmt.Sprintf("line %d: no prompt", i+1))
			continue
		}
		if ex.Action == "" && strings.TrimSpace(ex.Answer) == "" {
			problems = append(problems, fmt.Sprintf("line %d: neither an action nor an answer", i+1))
			continue
		}

		// An action is checked against the registry and its own schema. A
		// seeded example naming an action that does not exist, or arguments
		// the action would reject, teaches the model to produce a call that
		// can only fail — worse than no example at all.
		if ex.Action != "" {
			tool, known := registry.Lookup(ex.Action)
			if !known {
				problems = append(problems, fmt.Sprintf("line %d: no such action %q", i+1, ex.Action))
				continue
			}
			args := ex.Args
			if len(args) == 0 {
				args = json.RawMessage("{}")
			}
			if err := ai.ValidateArgs(tool, args); err != nil {
				problems = append(problems, fmt.Sprintf("line %d: %s: %v", i+1, ex.Action, err))
				continue
			}
			ex.Args = args
		}
		examples = append(examples, ex)
	}

	for _, p := range problems {
		fmt.Fprintln(os.Stderr, "  REJECTED", p)
	}
	fmt.Printf("%d usable, %d rejected\n", len(examples), len(problems))
	if *dryRun || len(examples) == 0 {
		return
	}

	config.SetPath(*cfgPath)
	cfg, err := config.Get()
	if err != nil {
		log.Fatalf("config: %v", err)
	}
	db, err := database.NewConnection(cfg.Database.ToDBConfig())
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	written := 0
	for _, ex := range examples {
		var calls []ai.ToolCall
		if ex.Action != "" {
			calls = []ai.ToolCall{{ID: "seed", Name: ex.Action, Args: ex.Args}}
		}
		payload, err := json.Marshal(calls)
		if err != nil {
			continue
		}
		// Stored as confirmed, because an authored example IS the intended
		// answer — the same standing as one a person approved in the UI.
		if _, err := db.ExecContext(ctx, `
			INSERT INTO ai_training_examples
			  (id, company_id, user_id, system_prompt, prompt, tools_offered,
			   proposed_calls, final_calls, verdict, provider, created_at, decided_at)
			VALUES (?, ?, NULL, '', ?, '[]', ?, ?, 'confirmed', 'seeded', NOW(), NOW())`,
			uuid.New().String(), *companyID, ex.Prompt, string(payload), string(payload)); err != nil {
			log.Printf("  write failed for %q: %v", ex.Prompt, err)
			continue
		}
		written++
	}
	fmt.Printf("%d examples added to the retrieval memory for company %s\n", written, *companyID)
}
