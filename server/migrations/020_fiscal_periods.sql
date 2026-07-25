-- ============================================================================
-- Migration 020: Fiscal years, accounting periods, and year-end close
--
--   Until now nothing stopped a posting into any date — including a prior year
--   that had already been reported on — and there were no closing entries, so
--   Retained Earnings never absorbed prior-year profit and the balance sheet
--   relied on the P&L staying open forever.
--
--   Two tables:
--     acc_fiscal_years    one row per financial year: name, start/end date,
--                         status (Open | Closed), and, once closed, the id of
--                         the closing journal entry plus the equity account the
--                         net result was rolled into.
--     acc_fiscal_periods  the periods inside a year (12 monthly by default, but
--                         the generator accepts 4 or 13 too). Each carries its
--                         own status so a month can be soft-closed while the
--                         year stays open.
--
--   Status meanings, narrowest first:
--     Open    postings allowed.
--     Closed  no postings; can be reopened by a user with accounting/close.
--     Locked  no postings; NOT reopenable from the UI — for periods already
--             filed with the BIR. Reversing a Locked period is a deliberate
--             DBA action, which is the point.
--
--   ENFORCEMENT IS FAIL-OPEN AND LIVES IN GO, not in a trigger or in
--   sp_post_journal_entry. Every GL posting in the app — manual journal,
--   payroll, AP/AR payments, inventory, fixed assets, sales, procurement,
--   returns, recurring — funnels through AccountingRepo.PostJournalEntry, so a
--   single guard there covers all of them (see period_repo.go: IsDateOpen).
--   Fail-open matters for backward compatibility: a company that has never
--   generated a calendar has no period rows, every date resolves to "no period
--   defined", and posting behaves exactly as it did before this migration.
--   Only once a year is generated does the lock start biting.
--
--   The year-end close itself posts a real, ordinary journal entry (source_type
--   'closing') that zeroes every Revenue and Expense account against the chosen
--   equity account. Reopening voids that entry. Both operations deliberately
--   bypass the period guard — the close writes INTO the period it is closing —
--   via AccountingRepo.PostJournalEntryUnchecked.
--
--   Pure DDL — the Go repo uses plain SQL (ls_user has DML but not CREATE
--   ROUTINE), so only this needs root:
--     mysql -u root -p lettersheets < server/migrations/020_fiscal_periods.sql
-- ============================================================================

-- company_id is char(36) to match companies.id as the accounting tables see it
-- (acc_accounts.company_id is char(36)); InnoDB requires an exact string-type
-- match on FK columns or CREATE fails with "1824 Failed to open the referenced
-- table". companies.id is varchar(36), so these carry NO FK to companies and are
-- scoped in SQL like the rest of the accounting module. closing_journal_id and
-- retained_earnings_account_id are loose refs for the same reason plus to keep a
-- voided/purged journal from cascading a fiscal year out of existence.
CREATE TABLE IF NOT EXISTS `acc_fiscal_years` (
  `id`                           char(36)     NOT NULL DEFAULT (uuid()),
  `company_id`                   char(36)     NOT NULL,
  `name`                         varchar(50)  NOT NULL,             -- "FY2026" / "2026"
  `start_date`                   date         NOT NULL,
  `end_date`                     date         NOT NULL,
  `status`                       varchar(10)  NOT NULL DEFAULT 'Open',  -- Open | Closed
  `closing_journal_id`           char(36)     DEFAULT NULL,         -- acc_journal_entries.id (loose ref)
  `retained_earnings_account_id` char(36)     DEFAULT NULL,         -- acc_accounts.id (loose ref)
  `net_income`                   decimal(15,2) DEFAULT NULL,        -- result rolled to equity at close
  `closed_at`                    datetime     DEFAULT NULL,
  `closed_by`                    char(36)     DEFAULT NULL,         -- users.id (loose ref)
  `notes`                        varchar(255) DEFAULT NULL,
  `is_deleted`                   tinyint(1)   NOT NULL DEFAULT 0,
  `created_at`                   timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`                   timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_fy_name` (`company_id`, `name`),
  KEY `idx_fy_company` (`company_id`, `is_deleted`, `start_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `acc_fiscal_periods` (
  `id`             char(36)     NOT NULL DEFAULT (uuid()),
  `company_id`     char(36)     NOT NULL,
  `fiscal_year_id` char(36)     NOT NULL,
  `period_no`      int          NOT NULL,               -- 1..12 (or 1..4 / 1..13)
  `name`           varchar(50)  NOT NULL,               -- "Jan 2026"
  `start_date`     date         NOT NULL,
  `end_date`       date         NOT NULL,
  `status`         varchar(10)  NOT NULL DEFAULT 'Open',-- Open | Closed | Locked
  `closed_at`      datetime     DEFAULT NULL,
  `closed_by`      char(36)     DEFAULT NULL,           -- users.id (loose ref)
  `created_at`     timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_fp_year_no` (`fiscal_year_id`, `period_no`),
  -- The guard's hot path: "which period contains this date for this company?"
  KEY `idx_fp_lookup` (`company_id`, `start_date`, `end_date`),
  KEY `idx_fp_year` (`fiscal_year_id`),
  CONSTRAINT `acc_fiscal_periods_ibfk_1` FOREIGN KEY (`fiscal_year_id`) REFERENCES `acc_fiscal_years` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
