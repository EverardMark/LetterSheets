-- ============================================================================
-- Migration 025: AI prompt layer — per-company models and their training data
--
--   The prompt box turns a sentence into an ERP action. Two tables support it:
--
--     ai_training_examples  every proposed action, and what the human did with
--                           it. This is the training set.
--     ai_company_adapters   which LoRA adapter serves which company.
--
--   WHY THE EXAMPLES TABLE IS THE POINT, NOT A LOG: the architecture is one
--   fine-tuned model per company, and a model cannot exist before there is data
--   to train it on. Every write the assistant proposes is shown to a human for
--   approval, which means every confirmation is a labelled (prompt -> tool call)
--   pair verified by someone who knows the business. That is exactly the
--   supervision a tool-calling fine-tune needs and the expensive part to
--   manufacture synthetically. The confirm step exists for safety; harvesting it
--   is free.
--
--   VERDICTS CARRY DIFFERENT WEIGHT:
--     confirmed  accepted unchanged        -> a clean positive
--     edited     arguments corrected first -> the strongest signal in the set. A
--                prompt the model nearly got right plus the human's correction
--                is where training actually moves the needle, so final_calls is
--                stored separately from proposed_calls and the export uses the
--                former. Training on the model's own rejected output would
--                reinforce the mistake it just made.
--     cancelled  rejected outright        -> never a positive example. Kept
--                because a run of cancellations on one action is how a bad tool
--                description surfaces, and nothing else would reveal it.
--
--   WHY tools_offered IS STORED: the candidate tool set is chosen per prompt by
--   a BM25 selector, not fixed. Training has to reproduce inference conditions —
--   a model trained against the full catalogue and then served twelve tools has
--   learned a different task. Replaying an example requires knowing what it was
--   actually offered, so the set is recorded with the row.
--
--   TENANT ISOLATION IS THE WHOLE POINT: company_id is NOT NULL and every export
--   filters on it. One company's phrasing must never reach another company's
--   adapter — that is the property that makes per-company models worth the
--   trouble, and it is enforced here rather than trusted to the caller.
--
--   NO PII GUARANTEE: prompt text is whatever a user typed and may name people
--   or amounts. Rows are tenant-scoped and the export deliberately omits
--   company_id, but a training file built from this table still leaves the
--   server — treat a dump as production data, not as anonymised.
--
--   COLUMN TYPES: company_id/user_id are varchar(36) with utf8mb4_0900_ai_ci to
--   match companies.id and users.id EXACTLY. MySQL refuses a foreign key whose
--   column differs from its referent in either type or collation, and CHAR(36)
--   with utf8mb4_unicode_ci differs in both — it fails at apply time with
--   "incompatible", naming the constraint rather than the mismatch.
--
--   Plain DDL only — the Go repo uses plain SQL (ls_user has DML but not
--   CREATE ROUTINE), so only this needs root:
--     mysql -u root -p lettersheets < server/migrations/025_ai_prompt_layer.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS `ai_training_examples` (
  `id`             varchar(36)  NOT NULL,
  `company_id`     varchar(36)  NOT NULL,
  -- The user who typed the prompt. Kept for auditing "who asked the assistant
  -- to post this", not for training; the export drops it.
  `user_id`        varchar(36)  NULL,

  -- The system prompt in force. It carries the date and company name, both of
  -- which change, so replaying an example needs the original rather than a
  -- regenerated one.
  `system_prompt`  TEXT         NOT NULL,
  `prompt`         TEXT         NOT NULL,

  -- JSON arrays. tools_offered is the candidate set the selector produced;
  -- proposed_calls is what the model asked to do; final_calls is what the human
  -- actually approved (NULL when cancelled).
  `tools_offered`  JSON         NOT NULL,
  `proposed_calls` JSON         NOT NULL,
  `final_calls`    JSON         NULL,

  -- NULL until the user decides. A row that stays NULL means they walked away
  -- mid-confirmation, which is neither a positive nor a rejection.
  `verdict`        ENUM('confirmed','edited','cancelled') NULL,

  -- Which model produced the proposal. A dataset mixing a bootstrap model's
  -- output with a fine-tune's needs to be filterable by origin, or the second
  -- generation trains on the first's quirks without anyone noticing.
  `provider`       VARCHAR(128) NOT NULL,

  `created_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `decided_at`     TIMESTAMP    NULL,

  PRIMARY KEY (`id`),
  -- The export query is (company_id, verdict) and the readiness count is the
  -- same, so they share one index.
  KEY `idx_ai_ex_company_verdict` (`company_id`, `verdict`),
  KEY `idx_ai_ex_company_created` (`company_id`, `created_at`),
  CONSTRAINT `fk_ai_ex_company` FOREIGN KEY (`company_id`)
    REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE IF NOT EXISTS `ai_company_adapters` (
  `company_id`  varchar(36)  NOT NULL,

  -- The adapter name as the inference server knows it. With vLLM's multi-LoRA
  -- serving this is the value sent as the request's `model` field, so one base
  -- model stays resident and adapters are hot-swapped per request. Deploying a
  -- separate model per tenant would cost ~9GB of VRAM each and stop scaling in
  -- the teens; this costs one base plus a few hundred MB per company.
  `adapter`     VARCHAR(191) NOT NULL,

  -- Off by default so a newly trained adapter can be registered and reviewed
  -- before any user is routed onto it. Flipping this is the promotion step.
  `active`      TINYINT(1)   NOT NULL DEFAULT 0,

  -- Provenance for the weights currently serving this company: how many
  -- examples it was trained on and when. Without it there is no way to answer
  -- "is this company's model stale" short of guessing.
  `trained_on`  INT          NULL,
  `trained_at`  TIMESTAMP    NULL,
  `notes`       VARCHAR(500) NULL,

  `created_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- One adapter per company. A second row would make "which model is serving
  -- this tenant" ambiguous, and the answer has to be deterministic.
  PRIMARY KEY (`company_id`),
  CONSTRAINT `fk_ai_adapter_company` FOREIGN KEY (`company_id`)
    REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
