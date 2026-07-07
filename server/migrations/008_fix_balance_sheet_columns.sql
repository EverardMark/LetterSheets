-- ============================================================================
-- Migration 008: fix sp_balance_sheet column count (Balance Sheet report bug)
--
-- sp_balance_sheet did `SELECT * FROM (...) t ORDER BY sort_type, sort_code`,
-- which leaked the two internal ordering columns (sort_type, sort_code) into the
-- result set — 11 columns total. The Go repo (ReportsRepo.BalanceSheet) scans
-- exactly 9 columns (models.ReportRow, same contract as sp_income_statement), so
-- rows.Scan failed with a column-count mismatch, the handler swallowed the error,
-- and the Balance Sheet API returned []  — the report rendered "No data" even
-- with posted entries (the trial balance and income statement were fine).
--
-- Fix: select only the 9 report columns; keep sort_type/sort_code in the derived
-- table for ORDER BY but do not return them. No Go change required.
-- Apply as a privileged user (ALTER ROUTINE):
--   mysql -u root -p lettersheets < server/migrations/008_fix_balance_sheet_columns.sql
-- ============================================================================

DROP PROCEDURE IF EXISTS `sp_balance_sheet`;
delimiter ;;
CREATE PROCEDURE `sp_balance_sheet`(IN p_cid CHAR(36), IN p_as_of DATE)
BEGIN
    SELECT t.id, t.code, t.name, t.account_type, t.account_subtype, t.normal_balance,
        t.total_debit, t.total_credit, t.net_balance
    FROM (
        SELECT a.id, a.code, a.name, a.account_type, a.account_subtype, a.normal_balance,
            COALESCE(SUM(jl.debit), 0) AS total_debit,
            COALESCE(SUM(jl.credit), 0) AS total_credit,
            CASE WHEN a.normal_balance='Debit' THEN COALESCE(SUM(jl.debit - jl.credit), 0) ELSE COALESCE(SUM(jl.credit - jl.debit), 0) END AS net_balance,
            FIELD(a.account_type,'Asset','Liability','Equity') AS sort_type, a.code AS sort_code
        FROM acc_accounts a
        LEFT JOIN acc_journal_lines jl ON jl.account_id = a.id
            AND jl.entry_id IN (SELECT id FROM acc_journal_entries WHERE company_id=p_cid AND status='Posted' AND is_deleted=0
                AND (p_as_of IS NULL OR entry_date<=p_as_of))
        WHERE a.company_id = p_cid AND a.is_active = 1 AND a.account_type IN ('Asset','Liability','Equity') AND COALESCE(a.account_subtype,'') != 'Header'
        GROUP BY a.id, a.code, a.name, a.account_type, a.account_subtype, a.normal_balance
        HAVING net_balance != 0

        UNION ALL

        -- Current-year earnings: net income (Revenue - Expense) rolled into equity
        -- so the statement balances (Assets = Liabilities + Equity + Earnings).
        SELECT NULL AS id, '39999' AS code, 'Current Year Earnings' AS name, 'Equity' AS account_type,
            NULL AS account_subtype, 'Credit' AS normal_balance,
            0 AS total_debit, 0 AS total_credit,
            COALESCE(SUM(jl.credit - jl.debit), 0) AS net_balance,
            3 AS sort_type, 'zzzzz' AS sort_code
        FROM acc_accounts a
        INNER JOIN acc_journal_lines jl ON jl.account_id = a.id
            AND jl.entry_id IN (SELECT id FROM acc_journal_entries WHERE company_id=p_cid AND status='Posted' AND is_deleted=0
                AND (p_as_of IS NULL OR entry_date<=p_as_of))
        WHERE a.company_id = p_cid AND a.account_type IN ('Revenue','Expense')
        HAVING net_balance != 0
    ) t
    ORDER BY t.sort_type, t.sort_code;
END
;;
delimiter ;
