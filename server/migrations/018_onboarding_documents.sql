-- ============================================================================
-- Migration 018: Onboarding document uploads
--
--   Lets HR attach files (signed contracts, IDs, government forms, certificates)
--   to an employee's onboarding checklist. Files are stored inline as a LONGBLOB
--   in the database — consistent with this app's all-in-MySQL storage model
--   (no object store / filesystem is provisioned). A per-file 10 MB cap is
--   enforced in the Go handler before the row is written.
--
--   A document may optionally reference a specific checklist item (item_id) so
--   the UI can show "3 files attached to: Signed employment contract", but the
--   checklist_id is always set so listing/deleting works even for item-less
--   attachments. ON DELETE CASCADE from onboarding_checklists means removing a
--   checklist drops its documents too.
--
--   Plain DDL only — the Go repo uses plain SQL (ls_user has DML but not
--   CREATE ROUTINE), so only this table creation needs root:
--     mysql -u root -p lettersheets < server/migrations/018_onboarding_documents.sql
-- ============================================================================

-- NOTE: id/company_id/checklist_id/item_id are varchar(36) — NOT char(36) — to
-- match the referenced tables (companies.id, onboarding_checklists.id are
-- varchar). InnoDB requires FK columns to share the referenced column's exact
-- string type; char↔varchar fails with "1824 Failed to open the referenced table".
CREATE TABLE IF NOT EXISTS `onboarding_documents` (
  `id`               varchar(36)   NOT NULL DEFAULT (uuid()),
  `company_id`       varchar(36)   NOT NULL,
  `checklist_id`     varchar(36)   NOT NULL,
  `item_id`          varchar(36)   DEFAULT NULL,      -- optional: attach to a specific checklist item
  `file_name`        varchar(255)  NOT NULL,
  `mime_type`        varchar(150)  NOT NULL DEFAULT 'application/octet-stream',
  `file_size`        int           NOT NULL DEFAULT 0, -- bytes; mirrors LENGTH(file_data) for cheap listing
  `file_data`        longblob      NOT NULL,
  `uploaded_by`      varchar(36)   DEFAULT NULL,       -- users.id (no FK: users may be removed, keep the record)
  `uploaded_by_name` varchar(200)  DEFAULT NULL,       -- denormalized display name, avoids a join on list
  `is_deleted`       tinyint(1)    NOT NULL DEFAULT 0,
  `created_at`       timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_onb_doc_checklist` (`checklist_id`, `is_deleted`),
  KEY `idx_onb_doc_item` (`item_id`),
  KEY `idx_onb_doc_company` (`company_id`, `is_deleted`),
  CONSTRAINT `onboarding_documents_ibfk_1` FOREIGN KEY (`checklist_id`) REFERENCES `onboarding_checklists` (`id`) ON DELETE CASCADE,
  CONSTRAINT `onboarding_documents_ibfk_2` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
