package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"lettersheets/internal/ai"
)

// AIRepo owns the prompt layer's two tables (migration 025): the captured
// training examples and the company → LoRA adapter map.
//
// It implements ai.Recorder and ai.AdapterLookup, which is why the ai package
// declares those as interfaces — that package must stay free of any database
// dependency so its logic remains testable without one.
type AIRepo struct {
	db *sql.DB
}

func NewAIRepo(db *sql.DB) *AIRepo { return &AIRepo{db: db} }

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

// Record stores a proposal awaiting a human decision.
//
// Callers log and continue on error: losing a training row is acceptable,
// failing the user's request because this table is unavailable is not.
func (r *AIRepo) Record(ctx context.Context, ex ai.TrainingExample) error {
	if ex.CompanyID == "" {
		// Refusing is deliberate. A row with no company could be exported into
		// any tenant's training file, which is the one property this design
		// exists to guarantee.
		return fmt.Errorf("training example has no company")
	}

	tools, err := json.Marshal(ex.Tools)
	if err != nil {
		return fmt.Errorf("encode tools_offered: %w", err)
	}
	proposed, err := json.Marshal(ex.Proposed)
	if err != nil {
		return fmt.Errorf("encode proposed_calls: %w", err)
	}

	_, err = r.db.ExecContext(ctx, `
		INSERT INTO ai_training_examples
			(id, company_id, user_id, system_prompt, prompt, tools_offered, proposed_calls, provider)
		VALUES (?,?,?,?,?,?,?,?)`,
		ex.ID, ex.CompanyID, nullStr(ex.UserID), ex.System, ex.Prompt,
		string(tools), string(proposed), ex.Provider)
	return err
}

// Decide records what the human did with a proposal.
//
// final is the arguments actually approved, which differ from the proposal when
// the user edited them before confirming. Scoping the UPDATE by company_id as
// well as id means a stolen example id from one tenant cannot be used to write
// a verdict into another's dataset.
func (r *AIRepo) Decide(ctx context.Context, companyID, exampleID string, verdict ai.Verdict, final []ai.ToolCall) error {
	var encoded any
	if len(final) > 0 {
		b, err := json.Marshal(final)
		if err != nil {
			return fmt.Errorf("encode final_calls: %w", err)
		}
		encoded = string(b)
	}

	res, err := r.db.ExecContext(ctx, `
		UPDATE ai_training_examples
		   SET verdict = ?, final_calls = ?, decided_at = CURRENT_TIMESTAMP
		 WHERE id = ? AND company_id = ? AND verdict IS NULL`,
		string(verdict), encoded, exampleID, companyID)
	if err != nil {
		return err
	}
	// A zero-row update means the example was already decided or belongs to
	// someone else. Neither is worth failing the user's action over — the write
	// they confirmed has already happened — so this is reported for logging and
	// swallowed by the caller.
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("example %s was already decided or does not belong to this company", exampleID)
	}
	return nil
}

// ---------------------------------------------------------------------------
// Adapter routing
// ---------------------------------------------------------------------------

// AdapterFor implements ai.AdapterLookup.
//
// Only active adapters are returned: a newly trained one is registered inactive
// so it can be reviewed before any user is routed onto it. A miss is the normal
// state of a new tenant, not an error — the router falls back to the shared base
// model.
//
// This runs on every turn, so it is a single indexed primary-key lookup and
// nothing more.
func (r *AIRepo) AdapterFor(ctx context.Context, companyID string) (string, bool) {
	var adapter string
	err := r.db.QueryRowContext(ctx, `
		SELECT adapter FROM ai_company_adapters
		 WHERE company_id = ? AND active = 1`, companyID).Scan(&adapter)
	if err != nil || adapter == "" {
		return "", false
	}
	return adapter, true
}

// SetAdapter registers or updates a company's adapter.
func (r *AIRepo) SetAdapter(ctx context.Context, companyID, adapter string, active bool, trainedOn int, notes string) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO ai_company_adapters (company_id, adapter, active, trained_on, trained_at, notes)
		VALUES (?,?,?,?,CURRENT_TIMESTAMP,?)
		ON DUPLICATE KEY UPDATE
			adapter = VALUES(adapter),
			active = VALUES(active),
			trained_on = VALUES(trained_on),
			trained_at = VALUES(trained_at),
			notes = VALUES(notes)`,
		companyID, adapter, boolToInt(active), nullInt(trainedOn), nullStr(notes))
	return err
}

// ---------------------------------------------------------------------------
// Readiness and export
// ---------------------------------------------------------------------------

// Readiness reports whether a company has accumulated enough usable examples to
// be worth training an adapter on.
//
// Distinct actions are counted alongside raw volume because coverage matters
// more than count: a dataset that is 3,000 rows of one action teaches a model
// that every prompt is that action.
func (r *AIRepo) Readiness(ctx context.Context, companyID string) (ai.TrainingReadiness, error) {
	var usable int
	err := r.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM ai_training_examples
		 WHERE company_id = ? AND verdict IN ('confirmed','edited')`, companyID).Scan(&usable)
	if err != nil {
		return ai.TrainingReadiness{}, err
	}

	// The action name lives inside the JSON call array. Counting distinct
	// first-call names is a good enough proxy for coverage: multi-call turns are
	// rare, and the alternative is a JSON_TABLE join that costs far more than
	// the precision is worth for a threshold check.
	var distinct int
	err = r.db.QueryRowContext(ctx, `
		SELECT COUNT(DISTINCT JSON_UNQUOTE(JSON_EXTRACT(COALESCE(final_calls, proposed_calls), '$[0].name')))
		  FROM ai_training_examples
		 WHERE company_id = ? AND verdict IN ('confirmed','edited')`, companyID).Scan(&distinct)
	if err != nil {
		return ai.TrainingReadiness{}, err
	}

	return ai.AssessReadiness(companyID, usable, distinct), nil
}

// ExportExamples returns one company's usable examples, newest last.
//
// Cancelled and undecided rows are excluded here rather than in the exporter so
// the query does the filtering the index already supports. company_id is
// required and never defaulted — an export with no tenant scope is the one
// mistake that would silently cross-contaminate models.
func (r *AIRepo) ExportExamples(ctx context.Context, companyID string, limit int) ([]ai.TrainingExample, error) {
	if companyID == "" {
		return nil, fmt.Errorf("export requires a company")
	}
	if limit <= 0 {
		limit = 100000
	}

	rows, err := r.db.QueryContext(ctx, `
		SELECT id, company_id, system_prompt, prompt, tools_offered,
		       proposed_calls, final_calls, verdict, provider, created_at
		  FROM ai_training_examples
		 WHERE company_id = ? AND verdict IN ('confirmed','edited')
		 ORDER BY created_at ASC
		 LIMIT ?`, companyID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []ai.TrainingExample
	for rows.Next() {
		var (
			ex       ai.TrainingExample
			tools    string
			proposed string
			final    sql.NullString
			verdict  sql.NullString
		)
		if err := rows.Scan(&ex.ID, &ex.CompanyID, &ex.System, &ex.Prompt, &tools,
			&proposed, &final, &verdict, &ex.Provider, &ex.CreatedAt); err != nil {
			return nil, err
		}

		// A row whose JSON will not decode is skipped rather than failing the
		// whole export: one malformed example should not cost a company its
		// entire training set.
		if err := json.Unmarshal([]byte(tools), &ex.Tools); err != nil {
			continue
		}
		if err := json.Unmarshal([]byte(proposed), &ex.Proposed); err != nil {
			continue
		}
		if final.Valid && final.String != "" {
			_ = json.Unmarshal([]byte(final.String), &ex.Final)
		}
		ex.Verdict = ai.Verdict(verdict.String)

		out = append(out, ex)
	}
	return out, rows.Err()
}

func nullInt(n int) any {
	if n <= 0 {
		return nil
	}
	return n
}

// Similar returns past confirmed interactions for a company, for the retrieval
// memory to rank.
//
// Ranking happens in Go rather than SQL: MySQL full-text would need an index
// tuned for this, and the candidate pool is small — one company's confirmed
// actions — so pulling the recent ones and scoring them in memory is both
// simpler and identical to how tools are ranked.
//
// The company filter is not a nicety. A remembered example is one tenant's
// wording and data; leaking it into another tenant's prompt would be the worst
// failure this system could have, so the scope is enforced here, at the query,
// and not left to the caller.
func (r *AIRepo) Similar(ctx context.Context, companyID, prompt string, limit int) ([]ai.Remembered, error) {
	if companyID == "" {
		return nil, fmt.Errorf("retrieval requires a company")
	}
	if limit <= 0 {
		limit = 3
	}

	// A pool of recent confirmations, ranked in memory. Capped so a long-lived
	// company does not pull thousands of rows on every prompt.
	const pool = 300
	rows, err := r.db.QueryContext(ctx, `
		SELECT prompt, proposed_calls, final_calls, verdict
		  FROM ai_training_examples
		 WHERE company_id = ? AND verdict IN ('confirmed','edited')
		 ORDER BY created_at DESC
		 LIMIT ?`, companyID, pool)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var candidates []ai.Remembered
	for rows.Next() {
		var (
			p        string
			proposed string
			final    sql.NullString
			verdict  sql.NullString
		)
		if err := rows.Scan(&p, &proposed, &final, &verdict); err != nil {
			return nil, err
		}

		// The user's corrected arguments are the truth where they exist; the
		// model's original proposal is what it got wrong.
		raw := proposed
		corrected := verdict.Valid && verdict.String == string(ai.VerdictEdited)
		if corrected && final.Valid && final.String != "" {
			raw = final.String
		}

		var calls []ai.ToolCall
		if err := json.Unmarshal([]byte(raw), &calls); err != nil || len(calls) == 0 {
			continue
		}
		candidates = append(candidates, ai.Remembered{Prompt: p, Calls: calls, Corrected: corrected})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return ai.RankRemembered(prompt, candidates, limit), nil
}
