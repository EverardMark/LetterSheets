-- ============================================================================
-- Migration 017: Recurring journal entries — scheduled, lazily generated
--
--   A recurring entry is a saved transaction template plus a schedule. On each
--   due date it produces a real balanced journal entry (posted, or left Draft
--   for review per the template's auto_post flag).
--
--   Two tables:
--     acc_recurring_entries   the template + schedule: frequency / interval /
--                             start / next_run_date / optional end_date /
--                             optional occurrences_limit, plus auto_post and
--                             is_active. next_run_date is the anchor that makes
--                             generation idempotent.
--     acc_recurring_lines     the debit/credit lines copied into each generated
--                             JE (same shape as acc_journal_lines).
--
--   Generation is NOT a cron job — the Go layer generates due entries lazily
--   (idempotent, anchored to next_run_date, with catch-up for missed periods)
--   when the journal is opened or via an explicit "Generate due" action. The
--   date math and the create+post live in Go, mirroring migration 016.
--
--   No stored procedures — the Go repo uses plain SQL (ls_user has DML, not
--   CREATE ROUTINE), so only this DDL needs root:
--     mysql -u root -p lettersheets < server/migrations/017_recurring_entries.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS `acc_recurring_entries` (
  `id`                char(36)      NOT NULL DEFAULT (uuid()),
  `company_id`        char(36)      NOT NULL,
  `name`              varchar(150)  NOT NULL,
  `memo`              varchar(255)  DEFAULT NULL,
  `frequency`         varchar(20)   NOT NULL DEFAULT 'Monthly',   -- Weekly | Monthly | Quarterly | Yearly
  `interval_count`    int           NOT NULL DEFAULT 1,           -- every N periods (e.g. every 2 months)
  `start_date`        date          NOT NULL,
  `next_run_date`     date          NOT NULL,
  `end_date`          date          DEFAULT NULL,
  `auto_post`         tinyint(1)    NOT NULL DEFAULT 1,
  `occurrences_limit` int           DEFAULT NULL,                 -- optional cap on how many times it runs
  `occurrences_count` int           NOT NULL DEFAULT 0,
  `last_run_date`     date          DEFAULT NULL,
  `is_active`         tinyint(1)    NOT NULL DEFAULT 1,
  `is_deleted`        tinyint(1)    NOT NULL DEFAULT 0,
  `created_at`        timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rec_due` (`company_id`, `is_active`, `is_deleted`, `next_run_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `acc_recurring_lines` (
  `id`           char(36)      NOT NULL DEFAULT (uuid()),
  `recurring_id` char(36)      NOT NULL,
  `company_id`   char(36)      NOT NULL,
  `account_id`   char(36)      NOT NULL,
  `description`  varchar(255)  DEFAULT NULL,
  `debit`        decimal(15,2) NOT NULL DEFAULT '0.00',
  `credit`       decimal(15,2) NOT NULL DEFAULT '0.00',
  `line_order`   int           NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_recline_parent` (`recurring_id`),
  KEY `idx_recline_account` (`account_id`),
  CONSTRAINT `acc_recurring_lines_ibfk_1` FOREIGN KEY (`recurring_id`) REFERENCES `acc_recurring_entries` (`id`) ON DELETE CASCADE,
  CONSTRAINT `acc_recurring_lines_ibfk_2` FOREIGN KEY (`account_id`) REFERENCES `acc_accounts` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
