-- ============================================================================
-- Migration 023: stop journal entry numbers being reused after a delete
--
--   OPTIONAL and INDEPENDENT of migrations 020–022. This fixes a pre-existing
--   bug that has nothing to do with fiscal periods or expense claims; it is
--   included here only because the period work is what made it easy to hit.
--
--   THE BUG. Two rules disagree about what an entry number belongs to:
--
--     sp_next_entry_number  SELECT MAX(entry_number)+1 ... WHERE is_deleted = 0
--     uk_je_number          UNIQUE (company_id, entry_number)   -- ALL rows
--
--   sp_delete_journal_entry is a SOFT delete, so a deleted entry keeps its row
--   and keeps occupying its number in the unique key — but the allocator can no
--   longer see it and hands the same number out again. The next insert dies with
--
--     Error 1062: Duplicate entry '<company>-1' for key 'acc_journal_entries.uk_je_number'
--
--   To reproduce on any build before this migration: delete the most recent
--   journal entry, then try to create another one.
--
--   THE FIX. Allocate from MAX over every row, deleted or not. Entry numbers
--   then advance monotonically and are never reused — which is what an audit
--   trail wants anyway. Deleting entry 7 leaves a gap at 7; the next entry is 8.
--   A gap is explainable ("that one was deleted"); a reused number is not,
--   because two different documents end up sharing an identifier.
--
--   This only ever makes the allocator return a HIGHER number, so it cannot
--   collide with anything that already exists and needs no data backfill.
--
--   Redefining a procedure needs root:
--     mysql -u root -p lettersheets < server/migrations/023_entry_number_reuse.sql
-- ============================================================================

DROP PROCEDURE IF EXISTS `sp_next_entry_number`;
delimiter ;;
CREATE PROCEDURE `sp_next_entry_number`(IN p_company_id CHAR(36))
BEGIN
    -- Deliberately NOT filtered by is_deleted: a soft-deleted entry still holds
    -- its number in uk_je_number, so skipping it would hand out a duplicate.
    SELECT COALESCE(MAX(entry_number), 0) + 1 AS next_number
    FROM acc_journal_entries
    WHERE company_id = p_company_id;
END
;;
delimiter ;
