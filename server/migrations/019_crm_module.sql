-- ============================================================================
-- Migration 019: CRM module (Lead-to-Order front office)
--
--   Adds the sales funnel that sits UPSTREAM of the existing Sales module
--   (which starts at "quote"). Three tables:
--
--     crm_leads          unqualified inbound contacts. "Convert" turns a lead
--                        into an ar_customers row + a crm_opportunities row.
--     crm_opportunities  the pipeline/deal: stage, amount, probability, owner,
--                        expected close. Links to an ar_customers account and,
--                        once won, optionally to a so_quotes (Sales) record.
--     crm_activities     calls/emails/meetings/tasks/notes logged against a lead
--                        or an opportunity, with follow-up due dates.
--
--   Reuse over duplication: CRM "accounts" ARE ar_customers — a won deal already
--   knows the customer that AR/Sales will invoice. No parallel customer master.
--
--   FK column types are matched to each referenced column to avoid
--   "1824 Failed to open the referenced table":
--     company_id  varchar(36) -> companies.id     (varchar)
--     customer_id char(36)    -> ar_customers.id  (char)
--   owner_id / quote_id / converted_* are LOOSE refs (no FK): owners (users) may
--   be removed, and quote_id crosses into the Sales module — keep CRM decoupled.
--
--   Pure DDL — the Go repo uses plain SQL (ls_user lacks CREATE ROUTINE), so
--   only this needs root:
--     mysql -u root -p lettersheets < server/migrations/019_crm_module.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS `crm_leads` (
  `id`                       varchar(36)  NOT NULL DEFAULT (uuid()),
  `company_id`               varchar(36)  NOT NULL,
  `name`                     varchar(150) NOT NULL,               -- contact person
  `company_name`            varchar(200) DEFAULT NULL,            -- their organization
  `title`                    varchar(100) DEFAULT NULL,           -- job title
  `email`                    varchar(150) DEFAULT NULL,
  `phone`                    varchar(50)  DEFAULT NULL,
  `source`                   varchar(50)  NOT NULL DEFAULT 'Other', -- Website | Referral | Cold Call | Event | Other
  `status`                   varchar(20)  NOT NULL DEFAULT 'New',   -- New | Contacted | Qualified | Unqualified
  `rating`                   varchar(10)  DEFAULT NULL,           -- Hot | Warm | Cold
  `owner_id`                 varchar(36)  DEFAULT NULL,           -- users.id (loose ref)
  `notes`                    text,
  `is_converted`             tinyint(1)   NOT NULL DEFAULT 0,
  `converted_customer_id`    char(36)     DEFAULT NULL,           -- ar_customers.id (loose ref)
  `converted_opportunity_id` varchar(36)  DEFAULT NULL,           -- crm_opportunities.id (loose ref)
  `converted_at`             datetime     DEFAULT NULL,
  `is_deleted`               tinyint(1)   NOT NULL DEFAULT 0,
  `created_at`               timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`               timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_crm_leads_company` (`company_id`, `is_deleted`, `status`),
  KEY `idx_crm_leads_owner` (`owner_id`),
  CONSTRAINT `crm_leads_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `crm_opportunities` (
  `id`                   varchar(36)   NOT NULL DEFAULT (uuid()),
  `company_id`           varchar(36)   NOT NULL,
  `name`                 varchar(200)  NOT NULL,                 -- deal name
  `customer_id`          char(36)      NOT NULL,                 -- ar_customers.id (the account)
  `stage`                varchar(20)   NOT NULL DEFAULT 'Prospecting', -- Prospecting | Qualification | Proposal | Negotiation | Won | Lost
  `amount`               decimal(15,2) NOT NULL DEFAULT '0.00',
  `probability`          int           NOT NULL DEFAULT 10,      -- 0-100
  `expected_close_date`  date          DEFAULT NULL,
  `source`               varchar(50)   DEFAULT NULL,
  `owner_id`             varchar(36)   DEFAULT NULL,             -- users.id (loose ref)
  `lost_reason`          varchar(255)  DEFAULT NULL,
  `quote_id`             char(36)      DEFAULT NULL,             -- so_quotes.id once converted (loose ref)
  `closed_at`            datetime      DEFAULT NULL,             -- set when stage -> Won/Lost
  `notes`                text,
  `is_deleted`           tinyint(1)    NOT NULL DEFAULT 0,
  `created_at`           timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_crm_opp_company` (`company_id`, `is_deleted`, `stage`),
  KEY `idx_crm_opp_customer` (`customer_id`),
  KEY `idx_crm_opp_owner` (`owner_id`),
  CONSTRAINT `crm_opp_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `crm_opp_ibfk_2` FOREIGN KEY (`customer_id`) REFERENCES `ar_customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `crm_activities` (
  `id`            varchar(36)  NOT NULL DEFAULT (uuid()),
  `company_id`    varchar(36)  NOT NULL,
  `related_type`  varchar(20)  NOT NULL,                         -- 'lead' | 'opportunity'
  `related_id`    varchar(36)  NOT NULL,                         -- crm_leads.id or crm_opportunities.id (polymorphic, loose)
  `type`          varchar(20)  NOT NULL DEFAULT 'Note',          -- Call | Email | Meeting | Task | Note
  `subject`       varchar(200) NOT NULL,
  `notes`         text,
  `due_date`      datetime     DEFAULT NULL,                     -- for Task/follow-up
  `completed`     tinyint(1)   NOT NULL DEFAULT 0,
  `completed_at`  datetime     DEFAULT NULL,
  `owner_id`      varchar(36)  DEFAULT NULL,                     -- users.id (loose ref)
  `is_deleted`    tinyint(1)   NOT NULL DEFAULT 0,
  `created_at`    timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_crm_act_related` (`related_type`, `related_id`, `is_deleted`),
  KEY `idx_crm_act_company` (`company_id`, `is_deleted`),
  KEY `idx_crm_act_due` (`company_id`, `completed`, `due_date`),
  CONSTRAINT `crm_act_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
