-- ============================================================================
-- Migration 024: add the missing ar_invoices.journal_id column
--
--   OPTIONAL and INDEPENDENT of 020–023. Another pre-existing bug, found while
--   verifying the invoice-email path.
--
--   THE BUG. internal/repository/ar_repo.go scans a journal_id column on
--   ar_invoices in BOTH read paths (GetInvoices and GetInvoice), giving AR the
--   same shape AP already has — ap_bills.journal_id exists. But the column was
--   never added to ar_invoices, in deploy/schema.sql or in any migration. Since
--   sp_get_invoices selects `i.*`, the result is one column short of what Go
--   scans, and both endpoints fail outright:
--
--     get_invoices → scan inv: sql: expected 21 destination arguments in Scan, not 22
--     get_invoice  → sql: expected 19 destination arguments in Scan, not 20
--
--   So the Receivables list does not load and no single invoice can be opened.
--   This is independent of any deployment drift: the column is absent from the
--   canonical schema too, so every install has it.
--
--   THE FIX. Add the column the code already expects. Nullable with no default,
--   matching ap_bills.journal_id — existing rows simply carry NULL, which the
--   repo already handles (it scans into sql.NullString and only populates
--   Invoice.JournalID when valid). No backfill is possible or wanted: historical
--   invoices genuinely have no journal linked.
--
--   Adding a nullable column touches no existing data and cannot fail on
--   duplicates, so this is safe to run on a live database.
--
--   Needs a user with ALTER:
--     mysql -u root -p lettersheets < server/migrations/024_ar_invoice_journal_id.sql
-- ============================================================================

-- MySQL 8.0 has no ADD COLUMN IF NOT EXISTS, so guard on information_schema to
-- keep this migration re-runnable.
SET @needs_col := (
  SELECT COUNT(*) = 0
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name   = 'ar_invoices'
    AND column_name  = 'journal_id'
);

SET @ddl := IF(@needs_col,
  'ALTER TABLE `ar_invoices` ADD COLUMN `journal_id` char(36) DEFAULT NULL AFTER `reference`',
  'SELECT "ar_invoices.journal_id already present — nothing to do" AS note'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
