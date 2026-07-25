-- ============================================================================
-- Migration 022: Employee expense claims / reimbursements
--
--   The missing bridge between HR and Accounting. An employee spends their own
--   money on the company's behalf; today that either never reaches the books or
--   arrives as a hand-typed journal entry with no receipt and no approval trail.
--
--   Five tables:
--     exp_categories      spend types (Transport, Meals, Supplies, …), each
--                         mapped to the GL expense account it should hit. This
--                         is what lets a non-accountant file a claim: they pick
--                         "Meals", not account 6120.
--     exp_claims          the claim header: employee, period, status, totals,
--                         and the two journals it produces over its life.
--     exp_claim_lines     one row per receipt/expense, each with its own date,
--                         category, resolved account, amount and optional
--                         input VAT split out.
--     exp_claim_receipts  scanned receipts as LONGBLOB, mirroring migration 018
--                         (onboarding_documents) — this app stores files in
--                         MySQL; no object store is provisioned.
--     exp_settings        per-company GL wiring + policy switches.
--
--   LIFECYCLE and what each transition does to the ledger:
--
--     Draft ──submit──▶ Submitted ──approve──▶ Approved ──pay──▶ Paid
--                            │                     │
--                            └──reject──▶ Rejected └──(reopen)──▶ Submitted
--
--     approve  posts the accrual:  Dr each line's expense account
--                                  Dr input VAT (when a line splits tax out)
--                                     Cr employee_payable_account  (a liability:
--                                        the company now owes the employee)
--     pay      settles it:         Dr employee_payable_account
--                                     Cr the cash/bank account chosen at payment
--
--   Two journals, not one, because the debt and its settlement are genuinely
--   separate events — a claim approved in March and paid in April must land in
--   the correct month, and AP works the same way (bill, then payment).
--   Un-approving or voiding reverses whichever journals exist, so the GL never
--   keeps a dangling accrual for a claim that no longer stands.
--
--   PAYROLL ROUTE: payment_method='Payroll' marks the claim as settled through
--   the next payroll run instead of a cash disbursement. The accrual is
--   identical; only the settlement journal's credit account differs, so nothing
--   here needs to know about payroll internals.
--
--   Plain DDL only — the Go repo uses plain SQL (ls_user has DML but not CREATE
--   ROUTINE), including claim numbering, which uses the same
--   INSERT … ON DUPLICATE KEY UPDATE sequence trick the procurement SPs use.
--   Only this needs root:
--     mysql -u root -p lettersheets < server/migrations/022_expense_claims.sql
-- ============================================================================

-- FK column types are matched to what they reference or the FK is dropped:
--   company_id  varchar(36) -> companies.id  (varchar)  — FK kept
--   employee_id varchar(36) -> employees.id  (varchar)  — FK kept
--   *_account_id char(36)   -> acc_accounts.id (char)   — LOOSE, no FK, so the
--     module stays decoupled from the COA the way inventory/procurement do and
--     a chart reshuffle can't cascade-delete a claim's history.

CREATE TABLE IF NOT EXISTS `exp_categories` (
  `id`          varchar(36)  NOT NULL DEFAULT (uuid()),
  `company_id`  varchar(36)  NOT NULL,
  `name`        varchar(100) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `account_id`  char(36)     DEFAULT NULL,          -- acc_accounts.id, the expense account (loose ref)
  `daily_cap`   decimal(15,2) DEFAULT NULL,         -- optional per-day policy ceiling; advisory, warned in UI
  `is_active`   tinyint(1)   NOT NULL DEFAULT 1,
  `is_deleted`  tinyint(1)   NOT NULL DEFAULT 0,
  `created_at`  timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_expcat_company` (`company_id`, `is_deleted`, `is_active`),
  CONSTRAINT `exp_categories_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `exp_claim_sequences` (
  `company_id`  varchar(36) NOT NULL,
  `next_number` int         NOT NULL DEFAULT 1,
  PRIMARY KEY (`company_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `exp_claims` (
  `id`                  varchar(36)   NOT NULL DEFAULT (uuid()),
  `company_id`          varchar(36)   NOT NULL,
  `claim_number`        int           NOT NULL,
  `employee_id`         varchar(36)   NOT NULL,
  `title`               varchar(200)  NOT NULL,
  `purpose`             varchar(500)  DEFAULT NULL,
  `claim_date`          date          NOT NULL,             -- when the claim is filed
  `period_start`        date          DEFAULT NULL,         -- earliest line date, denormalized for list filters
  `period_end`          date          DEFAULT NULL,
  `status`              varchar(12)   NOT NULL DEFAULT 'Draft', -- Draft|Submitted|Approved|Rejected|Paid|Cancelled
  `subtotal`            decimal(15,2) NOT NULL DEFAULT '0.00',
  `tax_total`           decimal(15,2) NOT NULL DEFAULT '0.00',
  `total_amount`        decimal(15,2) NOT NULL DEFAULT '0.00',
  `payment_method`      varchar(12)   NOT NULL DEFAULT 'Cash',  -- Cash | Payroll
  `submitted_at`        datetime      DEFAULT NULL,
  `submitted_by`        varchar(36)   DEFAULT NULL,         -- users.id (loose ref)
  `approved_at`         datetime      DEFAULT NULL,
  `approved_by`         varchar(36)   DEFAULT NULL,
  `rejected_at`         datetime      DEFAULT NULL,
  `rejected_by`         varchar(36)   DEFAULT NULL,
  `reject_reason`       varchar(500)  DEFAULT NULL,
  `paid_at`             datetime      DEFAULT NULL,
  `paid_by`             varchar(36)   DEFAULT NULL,
  `payment_reference`   varchar(100)  DEFAULT NULL,         -- cheque no / transfer ref
  `payment_account_id`  char(36)      DEFAULT NULL,         -- cash/bank account credited on payment (loose ref)
  `accrual_journal_id`  char(36)      DEFAULT NULL,         -- JE posted at approval (loose ref)
  `payment_journal_id`  char(36)      DEFAULT NULL,         -- JE posted at payment (loose ref)
  `notes`               varchar(500)  DEFAULT NULL,
  `is_deleted`          tinyint(1)    NOT NULL DEFAULT 0,
  `created_at`          timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_expclaim_num` (`company_id`, `claim_number`),
  KEY `idx_expclaim_company` (`company_id`, `is_deleted`, `status`, `claim_date`),
  KEY `idx_expclaim_employee` (`employee_id`, `is_deleted`),
  CONSTRAINT `exp_claims_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `exp_claims_ibfk_2` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `exp_claim_lines` (
  `id`           varchar(36)   NOT NULL DEFAULT (uuid()),
  `claim_id`     varchar(36)   NOT NULL,
  `company_id`   varchar(36)   NOT NULL,
  `expense_date` date          NOT NULL,
  `category_id`  varchar(36)   DEFAULT NULL,         -- exp_categories.id (loose: a category may be retired)
  `account_id`   char(36)      NOT NULL,             -- resolved at save time from the category, frozen here
  `description`  varchar(255)  NOT NULL,
  `merchant`     varchar(150)  DEFAULT NULL,
  `receipt_no`   varchar(100)  DEFAULT NULL,         -- OR number — the BIR-relevant one
  `amount`       decimal(15,2) NOT NULL DEFAULT '0.00', -- net of tax_amount
  `tax_amount`   decimal(15,2) NOT NULL DEFAULT '0.00', -- creditable input VAT, if any
  `line_order`   int           NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_expline_claim` (`claim_id`),
  KEY `idx_expline_account` (`account_id`),
  CONSTRAINT `exp_claim_lines_ibfk_1` FOREIGN KEY (`claim_id`) REFERENCES `exp_claims` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `exp_claim_receipts` (
  `id`               varchar(36)  NOT NULL DEFAULT (uuid()),
  `company_id`       varchar(36)  NOT NULL,
  `claim_id`         varchar(36)  NOT NULL,
  `line_id`          varchar(36)  DEFAULT NULL,      -- optional: attach to one line
  `file_name`        varchar(255) NOT NULL,
  `mime_type`        varchar(150) NOT NULL DEFAULT 'application/octet-stream',
  `file_size`        int          NOT NULL DEFAULT 0,
  `file_data`        longblob     NOT NULL,
  `uploaded_by`      varchar(36)  DEFAULT NULL,
  `uploaded_by_name` varchar(200) DEFAULT NULL,
  `is_deleted`       tinyint(1)   NOT NULL DEFAULT 0,
  `created_at`       timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_exprcpt_claim` (`claim_id`, `is_deleted`),
  KEY `idx_exprcpt_company` (`company_id`, `is_deleted`),
  CONSTRAINT `exp_claim_receipts_ibfk_1` FOREIGN KEY (`claim_id`) REFERENCES `exp_claims` (`id`) ON DELETE CASCADE,
  CONSTRAINT `exp_claim_receipts_ibfk_2` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `exp_settings` (
  `company_id`                 varchar(36)   NOT NULL,
  `employee_payable_account_id` char(36)     DEFAULT NULL, -- liability credited on approval
  `default_cash_account_id`    char(36)      DEFAULT NULL, -- account credited on payment
  `tax_input_account_id`       char(36)      DEFAULT NULL, -- creditable input VAT
  `auto_post_gl`               tinyint(1)    NOT NULL DEFAULT 1, -- approval posts, vs. leaves a draft JE
  `require_receipt`            tinyint(1)    NOT NULL DEFAULT 0, -- block submit with no attachment
  `require_approval`           tinyint(1)    NOT NULL DEFAULT 1,
  `approval_threshold`         decimal(15,2) DEFAULT NULL,  -- above this, admin-level approval only
  `updated_at`                 timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`company_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
