-- ============================================================================
-- Migration 016: Leave credits — accrual-based, driven by "Leave" benefits
--
--   A benefit of type 'leave' IS the credit plan: leave_credit_plans holds its
--   entitlement (which leave type, annual days, accrual cadence, cap), keyed by
--   benefit_id. Enrolling an employee in that benefit (employees.enrolled_benefits)
--   provisions a leave_credit_account; un-enrolling deactivates it.
--
--   Three tables:
--     leave_credit_plans          config per Leave benefit (benefit_id UNIQUE).
--     leave_credit_accounts       one per (employee, leave_type): the running
--                                 account + how far accrual is posted; links back
--                                 to the benefit that provisioned it.
--     leave_credit_transactions   the ledger: accrual / usage / adjustment /
--                                 reversal / opening, each signed, running
--                                 balance_after. Current balance = SUM(days).
--
--   Accrual is NOT a cron job — the Go layer posts due accrual rows lazily
--   (idempotent, anchored to last_accrued_date) when credits are read or a leave
--   is approved, plus a manual "Post Accruals" action. Approving an accruing
--   leave posts a usage row; rejecting/deleting posts a reversal.
--
--   No stored procedures — the Go repo uses plain SQL (ls_user has DML, not
--   CREATE ROUTINE), and the benefits SPs are left untouched, so only this DDL
--   needs root:
--     mysql -u root -p lettersheets < server/migrations/016_leave_credits.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS `leave_credit_plans` (
  `id`            varchar(36)  NOT NULL,
  `company_id`    varchar(36)  NOT NULL,
  `benefit_id`    varchar(36)  NOT NULL,             -- the 'leave' benefit this configures
  `leave_type`    varchar(30)  NOT NULL,             -- which leave request type it grants
  `annual_days`   decimal(5,1) NOT NULL DEFAULT 0.0,
  `accrual_type`  varchar(10)  NOT NULL DEFAULT 'monthly',
  `carryover_cap` decimal(6,1) DEFAULT NULL,
  `created_at`    datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_lcp_benefit` (`benefit_id`),
  KEY `idx_lcp_company` (`company_id`),
  CONSTRAINT `lcp_ibfk_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `lcp_ibfk_benefit` FOREIGN KEY (`benefit_id`) REFERENCES `benefits` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `leave_credit_accounts` (
  `id`                 varchar(36)  NOT NULL,
  `company_id`         varchar(36)  NOT NULL,
  `employee_id`        varchar(36)  NOT NULL,
  `leave_type`         varchar(30)  NOT NULL,             -- e.g. 'Vacation Leave'
  `benefit_id`         varchar(36)  DEFAULT NULL,         -- Leave benefit that provisioned it
  `annual_days`        decimal(5,1) NOT NULL DEFAULT 0.0, -- entitlement per year
  `accrual_type`       varchar(10)  NOT NULL DEFAULT 'monthly', -- 'monthly' | 'yearly'
  `accrual_start_date` date         NOT NULL,             -- when accrual begins
  `carryover_cap`      decimal(6,1) DEFAULT NULL,         -- max balance; NULL = unlimited
  `last_accrued_date`  date         DEFAULT NULL,         -- posted-through date (NULL = none yet)
  `active`             tinyint(1)   NOT NULL DEFAULT 1,
  `created_at`         datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_lca_emp_type` (`employee_id`, `leave_type`),
  KEY `idx_lca_company` (`company_id`, `active`),
  KEY `idx_lca_benefit` (`benefit_id`),
  CONSTRAINT `lca_ibfk_company`  FOREIGN KEY (`company_id`)  REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `lca_ibfk_employee` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `leave_credit_transactions` (
  `id`             varchar(36)  NOT NULL,
  `company_id`     varchar(36)  NOT NULL,
  `employee_id`    varchar(36)  NOT NULL,
  `leave_type`     varchar(30)  NOT NULL,
  `txn_type`       varchar(12)  NOT NULL,   -- accrual|usage|adjustment|reversal|opening
  `days`           decimal(6,2) NOT NULL,   -- signed: +accrual/opening/reversal, -usage, +/-adjustment
  `balance_after`  decimal(8,2) NOT NULL,
  `effective_date` date         NOT NULL,
  `note`           varchar(255) NOT NULL DEFAULT '',
  `leave_id`       varchar(36)  DEFAULT NULL,  -- source leave for usage/reversal (no FK: leaves soft-delete)
  `created_at`     datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_lct_acct` (`company_id`, `employee_id`, `leave_type`),
  KEY `idx_lct_leave` (`leave_id`),
  CONSTRAINT `lct_ibfk_company`  FOREIGN KEY (`company_id`)  REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `lct_ibfk_employee` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
