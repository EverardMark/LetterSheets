-- ============================================================================
-- Migration 021: In-app notifications and a transactional email outbox
--
--   Before this, nothing the ERP did could reach a person who wasn't already
--   looking at the screen. Approvals waited silently, invoices were "sent" by
--   flipping a status column, and overdue follow-ups were only visible to
--   whoever opened the CRM. Two tables fix that:
--
--     notifications  in-app inbox, one row per (user, event). Cheap, always
--                    available, and the only channel that works for employees
--                    whose contact details are end-to-end encrypted (see below).
--     email_outbox   store-and-forward queue. Nothing is sent inline on the
--                    request path: senders write a Pending row and a background
--                    worker drains it, so a dead SMTP host slows nobody down and
--                    a failed send is retried instead of lost.
--
--   WHY AN OUTBOX AND NOT A DIRECT SEND: an SMTP dial inside a request handler
--   couples every approve/submit action to a third party's uptime, and a crash
--   between "action committed" and "mail sent" loses the mail with no record.
--   A queue makes delivery observable (status/attempts/last_error are visible in
--   the UI) and makes a retry a row update rather than a re-run of the action.
--
--   EMAIL IS OFF UNTIL CONFIGURED. With no smtp block in config.json the worker
--   never starts and rows simply accumulate as Pending — visible in Settings,
--   sent to nobody. Turning on outbound mail is an explicit, deliberate act by
--   the operator, which is the correct default for a system that can email
--   customers.
--
--   REACHABILITY CAVEAT: users.email and ar_customers.email are plaintext, so
--   staff accounts and customers can be emailed. employees.email_enc is
--   end-to-end encrypted and the server cannot read it — an employee with no
--   linked user account is reachable by in-app notification only. Senders
--   resolve employee -> users via employees.user_id and skip the email leg when
--   there is no account.
--
--   Plain DDL only — the Go repo uses plain SQL (ls_user has DML but not
--   CREATE ROUTINE), so only this needs root:
--     mysql -u root -p lettersheets < server/migrations/021_notifications.sql
-- ============================================================================

-- company_id/user_id are varchar(36) to match companies.id and users.id exactly;
-- InnoDB rejects a char↔varchar FK with "1824 Failed to open the referenced
-- table". entity_type/entity_id are a loose polymorphic pointer (claim, leave,
-- invoice, ticket, …) so any module can raise a notification without this table
-- growing a column per module.
CREATE TABLE IF NOT EXISTS `notifications` (
  `id`          varchar(36)  NOT NULL DEFAULT (uuid()),
  `company_id`  varchar(36)  NOT NULL,
  `user_id`     varchar(36)  NOT NULL,               -- recipient
  `type`        varchar(40)  NOT NULL DEFAULT 'info',-- expense_submitted | leave_approved | ...
  `severity`    varchar(10)  NOT NULL DEFAULT 'info',-- info | success | warning | error
  `title`       varchar(200) NOT NULL,
  `body`        varchar(500) DEFAULT NULL,
  `link`        varchar(255) DEFAULT NULL,           -- in-app route, e.g. /expenses/claims?id=…
  `entity_type` varchar(40)  DEFAULT NULL,
  `entity_id`   varchar(36)  DEFAULT NULL,
  `is_read`     tinyint(1)   NOT NULL DEFAULT 0,
  `read_at`     datetime     DEFAULT NULL,
  `created_at`  timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- The bell polls "my unread, newest first" constantly; this index serves it.
  KEY `idx_notif_inbox` (`user_id`, `company_id`, `is_read`, `created_at`),
  KEY `idx_notif_entity` (`entity_type`, `entity_id`),
  CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `email_outbox` (
  `id`          varchar(36)   NOT NULL DEFAULT (uuid()),
  `company_id`  varchar(36)   NOT NULL,
  `to_email`    varchar(255)  NOT NULL,
  `to_name`     varchar(200)  DEFAULT NULL,
  `cc_email`    varchar(255)  DEFAULT NULL,
  `subject`     varchar(255)  NOT NULL,
  `body_text`   mediumtext    NOT NULL,              -- always present; the fallback part
  `body_html`   mediumtext,                          -- optional richer part
  `status`      varchar(10)   NOT NULL DEFAULT 'Pending', -- Pending | Sent | Failed | Cancelled
  `attempts`    int           NOT NULL DEFAULT 0,
  `last_error`  varchar(500)  DEFAULT NULL,
  `next_try_at` datetime      DEFAULT NULL,          -- exponential backoff anchor
  `sent_at`     datetime      DEFAULT NULL,
  `entity_type` varchar(40)   DEFAULT NULL,
  `entity_id`   varchar(36)   DEFAULT NULL,
  `created_by`  varchar(36)   DEFAULT NULL,          -- users.id (loose ref)
  `created_at`  timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- The worker's claim query: Pending, due, oldest first.
  KEY `idx_outbox_due` (`status`, `next_try_at`),
  KEY `idx_outbox_company` (`company_id`, `status`, `created_at`),
  KEY `idx_outbox_entity` (`entity_type`, `entity_id`),
  CONSTRAINT `email_outbox_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
