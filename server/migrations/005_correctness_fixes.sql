-- ============================================================================
-- Migration 005: financial & data-integrity correctness fixes
--
-- H8 balance sheet closes current-year earnings into equity; #27 journal posting
-- is transactional + guards not-found; #32 bank reconciliation validates the
-- matched amount and forbids reusing one entry; #44 clock-out handles overnight /
-- missing clock-in; #45 AR/AP "open" counts include Partial; #48 reports tolerate
-- NULL account_subtype. Pure procedure bodies -- safe to re-run.
--   mysql -u <user> -p lettersheets < server/migrations/005_correctness_fixes.sql
-- ============================================================================


-- ---------- Balance sheet: close P&L into equity (H8) + NULL-subtype (#48) ----------

DROP PROCEDURE IF EXISTS `sp_balance_sheet`;
delimiter ;;
CREATE PROCEDURE `sp_balance_sheet`(IN p_cid CHAR(36), IN p_as_of DATE)
BEGIN
    SELECT * FROM (
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
    ORDER BY sort_type, sort_code;
END
;;
delimiter ;


-- ---------- Journal posting: transactional + fail-open guard (#27) ----------

DROP PROCEDURE IF EXISTS `sp_post_journal_entry`;
delimiter ;;
CREATE PROCEDURE `sp_post_journal_entry`(IN p_entry_id CHAR(36),
    IN p_company_id CHAR(36),
    IN p_user_id CHAR(36))
BEGIN
    DECLARE v_total_dr DECIMAL(15,2);
    DECLARE v_total_cr DECIMAL(15,2);
    DECLARE v_status VARCHAR(10);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    -- FOR UPDATE locks the row so a concurrent post can't double-apply balances;
    -- the second caller then sees status='Posted' and is rejected below.
    SELECT total_debit, total_credit, status INTO v_total_dr, v_total_cr, v_status
    FROM acc_journal_entries WHERE id = p_entry_id AND company_id = p_company_id AND is_deleted = 0
    FOR UPDATE;

    IF v_status IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'journal entry not found';
    END IF;
    IF v_status != 'Draft' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only draft entries can be posted';
    END IF;
    IF v_total_dr != v_total_cr OR v_total_dr = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Debits must equal credits and be non-zero';
    END IF;

    -- Update account balances
    UPDATE acc_accounts a
    INNER JOIN acc_journal_lines jl ON a.id = jl.account_id
    SET a.current_balance = a.current_balance +
        CASE WHEN a.normal_balance = 'Debit' THEN (jl.debit - jl.credit) ELSE (jl.credit - jl.debit) END
    WHERE jl.entry_id = p_entry_id AND a.company_id = p_company_id;

    UPDATE acc_journal_entries SET status = 'Posted', posted_at = NOW(), posted_by = p_user_id
    WHERE id = p_entry_id AND company_id = p_company_id;

    COMMIT;

    SELECT 'posted' AS result;
END
;;
delimiter ;


-- ---------- Bank reconciliation: amount match + no entry reuse (#32) ----------

DROP PROCEDURE IF EXISTS `sp_reconcile_transaction`;
delimiter ;;
CREATE PROCEDURE `sp_reconcile_transaction`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_entry_id CHAR(36))
BEGIN
    DECLARE v_txn_amount DECIMAL(15,2);
    DECLARE v_entry_total DECIMAL(15,2);

    SELECT ABS(amount) INTO v_txn_amount FROM bank_transactions
    WHERE id = p_id AND company_id = p_cid AND is_deleted = 0;
    IF v_txn_amount IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'bank transaction not found';
    END IF;

    SELECT total_debit INTO v_entry_total FROM acc_journal_entries
    WHERE id = p_entry_id AND company_id = p_cid AND is_deleted = 0 AND status = 'Posted';
    IF v_entry_total IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'matched journal entry not found or not posted';
    END IF;

    -- The matched entry must settle the same amount as the transaction.
    IF ABS(v_entry_total - v_txn_amount) > 0.01 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'matched entry amount does not equal the transaction amount';
    END IF;

    -- A posted entry reconciles at most one transaction.
    IF EXISTS (SELECT 1 FROM bank_transactions
               WHERE company_id = p_cid AND matched_entry_id = p_entry_id
                 AND is_reconciled = 1 AND is_deleted = 0 AND id != p_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'journal entry is already matched to another transaction';
    END IF;

    UPDATE bank_transactions SET is_reconciled = 1, matched_entry_id = p_entry_id
    WHERE id = p_id AND company_id = p_cid AND is_deleted = 0;
END
;;
delimiter ;


-- ---------- Attendance: overnight / missing clock-in (#44) ----------

DROP PROCEDURE IF EXISTS `sp_clock_out`;
delimiter ;;
CREATE PROCEDURE `sp_clock_out`(IN p_id          VARCHAR(36),
    IN p_company_id  VARCHAR(36),
    IN p_clock_out   DATETIME,
    IN p_session_id  VARCHAR(36),
    IN p_changed_by  VARCHAR(36),
    IN p_ip_address  VARCHAR(45),
    IN p_user_agent  VARCHAR(500))
BEGIN
    DECLARE v_clock_in DATETIME;
    DECLARE v_hours DECIMAL(5,2);
    DECLARE v_ot DECIMAL(5,2);

    SELECT clock_in INTO v_clock_in
    FROM attendance WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;

    IF v_clock_in IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'no clock-in recorded for this attendance row';
    END IF;

    SET v_hours = TIMESTAMPDIFF(MINUTE, v_clock_in, p_clock_out) / 60.0;
    -- Overnight shift: a clock-out time-of-day before clock-in rolls to next day.
    IF v_hours < 0 THEN
        SET v_hours = v_hours + 24;
    END IF;
    IF v_hours < 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'clock-out precedes clock-in';
    END IF;
    SET v_ot = GREATEST(v_hours - 8, 0);

    UPDATE attendance SET
        clock_out = p_clock_out,
        hours_worked = v_hours,
        overtime_hours = v_ot
    WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;

    INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, new_value, ip_address, user_agent)
    VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'attendance', p_id, 'UPDATE', 'clock_out', p_clock_out, p_ip_address, p_user_agent);
END
;;
delimiter ;


-- ---------- AR/AP summary counts include Partial (#45) ----------

DROP PROCEDURE IF EXISTS `sp_ar_summary`;
delimiter ;;
CREATE PROCEDURE `sp_ar_summary`(IN p_cid CHAR(36))
BEGIN
  SELECT
    (SELECT COUNT(*) FROM ar_customers WHERE company_id=p_cid AND is_deleted=0 AND is_active=1) AS active_customers,
    (SELECT COUNT(*) FROM ar_invoices WHERE company_id=p_cid AND is_deleted=0 AND status IN ('Sent','Partial')) AS open_invoices,
    (SELECT COALESCE(SUM(balance_due),0) FROM ar_invoices WHERE company_id=p_cid AND is_deleted=0 AND status IN ('Sent','Partial')) AS total_receivable,
    (SELECT COALESCE(SUM(balance_due),0) FROM ar_invoices WHERE company_id=p_cid AND is_deleted=0 AND status IN ('Sent','Partial') AND due_date<CURDATE()) AS total_overdue,
    (SELECT COUNT(*) FROM ar_invoices WHERE company_id=p_cid AND is_deleted=0 AND status IN ('Sent','Partial') AND due_date<CURDATE()) AS overdue_count,
    (SELECT COALESCE(SUM(amount),0) FROM ar_invoice_payments WHERE company_id=p_cid AND is_deleted=0 AND payment_date>=DATE_FORMAT(CURDATE(),'%Y-%m-01')) AS collected_this_month;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_ap_summary`;
delimiter ;;
CREATE PROCEDURE `sp_ap_summary`(IN p_company_id CHAR(36))
BEGIN
    SELECT
        (SELECT COUNT(*) FROM ap_vendors WHERE company_id = p_company_id AND is_deleted = 0 AND is_active = 1) AS active_vendors,
        (SELECT COUNT(*) FROM ap_bills WHERE company_id = p_company_id AND is_deleted = 0 AND status IN ('Open','Partial')) AS open_bills,
        (SELECT COALESCE(SUM(balance_due), 0) FROM ap_bills WHERE company_id = p_company_id AND is_deleted = 0 AND status IN ('Open','Partial')) AS total_outstanding,
        (SELECT COALESCE(SUM(balance_due), 0) FROM ap_bills WHERE company_id = p_company_id AND is_deleted = 0 AND status IN ('Open','Partial') AND due_date < CURDATE()) AS total_overdue,
        (SELECT COUNT(*) FROM ap_bills WHERE company_id = p_company_id AND is_deleted = 0 AND status IN ('Open','Partial') AND due_date < CURDATE()) AS overdue_count,
        (SELECT COALESCE(SUM(amount), 0) FROM ap_bill_payments WHERE company_id = p_company_id AND is_deleted = 0 AND payment_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')) AS paid_this_month;
END
;;
delimiter ;


-- ---------- Reports: tolerate NULL account_subtype (#48) ----------

DROP PROCEDURE IF EXISTS `sp_trial_balance`;
delimiter ;;
CREATE PROCEDURE `sp_trial_balance`(IN p_company_id CHAR(36),
    IN p_date_from DATE,
    IN p_date_to DATE)
BEGIN
    SELECT
        a.id,
        a.code,
        a.name,
        a.account_type,
        a.account_subtype,
        a.normal_balance,
        a.is_active,
        COALESCE(SUM(jl.debit), 0) AS total_debit,
        COALESCE(SUM(jl.credit), 0) AS total_credit,
        COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0) AS net_movement,
        a.current_balance
    FROM acc_accounts a
    LEFT JOIN acc_journal_lines jl ON jl.account_id = a.id
        AND jl.entry_id IN (
            SELECT id FROM acc_journal_entries
            WHERE company_id = p_company_id
              AND status = 'Posted'
              AND is_deleted = 0
              AND (p_date_from IS NULL OR entry_date >= p_date_from)
              AND (p_date_to IS NULL OR entry_date <= p_date_to)
        )
    WHERE a.company_id = p_company_id
      AND a.is_active = 1
      AND COALESCE(a.account_subtype,'') != 'Header'
    GROUP BY a.id, a.code, a.name, a.account_type, a.account_subtype, a.normal_balance, a.is_active, a.current_balance
    HAVING total_debit > 0 OR total_credit > 0 OR a.current_balance != 0
    ORDER BY a.code;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_income_statement`;
delimiter ;;
CREATE PROCEDURE `sp_income_statement`(IN p_cid CHAR(36), IN p_from DATE, IN p_to DATE)
BEGIN
    SELECT a.id, a.code, a.name, a.account_type, a.account_subtype, a.normal_balance,
        COALESCE(SUM(jl.debit), 0) AS total_debit,
        COALESCE(SUM(jl.credit), 0) AS total_credit,
        CASE WHEN a.normal_balance='Credit' THEN COALESCE(SUM(jl.credit - jl.debit), 0) ELSE COALESCE(SUM(jl.debit - jl.credit), 0) END AS net_balance
    FROM acc_accounts a
    LEFT JOIN acc_journal_lines jl ON jl.account_id = a.id
        AND jl.entry_id IN (SELECT id FROM acc_journal_entries WHERE company_id=p_cid AND status='Posted' AND is_deleted=0
            AND (p_from IS NULL OR entry_date>=p_from) AND (p_to IS NULL OR entry_date<=p_to))
    WHERE a.company_id = p_cid AND a.is_active = 1 AND a.account_type IN ('Revenue','Expense') AND COALESCE(a.account_subtype,'') != 'Header'
    GROUP BY a.id, a.code, a.name, a.account_type, a.account_subtype, a.normal_balance
    HAVING net_balance != 0
    ORDER BY a.account_type DESC, a.code;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_get_bank_accounts`;
delimiter ;;
CREATE PROCEDURE `sp_get_bank_accounts`(IN p_company_id CHAR(36))
BEGIN
    SELECT id, code, name, current_balance FROM acc_accounts
    WHERE company_id = p_company_id AND is_active = 1
      AND (name LIKE '%Bank%' OR name LIKE '%Cash in Bank%' OR code IN ('1020','1010','1030'))
      AND COALESCE(account_subtype,'') != 'Header'
    ORDER BY code;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_ledger_period_summary`;
delimiter ;;
CREATE PROCEDURE `sp_ledger_period_summary`(IN p_company_id CHAR(36),
    IN p_date_from DATE,
    IN p_date_to DATE)
BEGIN
    SELECT
        COUNT(DISTINCT je.id) AS entry_count,
        COALESCE(SUM(jl.debit), 0) AS total_debits,
        COALESCE(SUM(jl.credit), 0) AS total_credits,
        COUNT(DISTINCT jl.account_id) AS accounts_affected,
        (SELECT COUNT(*) FROM acc_accounts WHERE company_id = p_company_id AND is_active = 1 AND COALESCE(account_subtype,'') != 'Header') AS total_accounts,
        (SELECT COUNT(*) FROM acc_journal_entries WHERE company_id = p_company_id AND status = 'Posted' AND is_deleted = 0) AS total_posted
    FROM acc_journal_lines jl
    INNER JOIN acc_journal_entries je ON je.id = jl.entry_id
    WHERE je.company_id = p_company_id
      AND je.status = 'Posted'
      AND je.is_deleted = 0
      AND (p_date_from IS NULL OR je.entry_date >= p_date_from)
      AND (p_date_to IS NULL OR je.entry_date <= p_date_to);
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_ledger_type_summary`;
delimiter ;;
CREATE PROCEDURE `sp_ledger_type_summary`(IN p_company_id CHAR(36),
    IN p_date_from DATE,
    IN p_date_to DATE)
BEGIN
    SELECT
        a.account_type,
        COUNT(DISTINCT a.id) AS account_count,
        COALESCE(SUM(jl.debit), 0) AS total_debit,
        COALESCE(SUM(jl.credit), 0) AS total_credit,
        SUM(a.current_balance) AS total_balance
    FROM acc_accounts a
    LEFT JOIN acc_journal_lines jl ON jl.account_id = a.id
        AND jl.entry_id IN (
            SELECT id FROM acc_journal_entries
            WHERE company_id = p_company_id
              AND status = 'Posted'
              AND is_deleted = 0
              AND (p_date_from IS NULL OR entry_date >= p_date_from)
              AND (p_date_to IS NULL OR entry_date <= p_date_to)
        )
    WHERE a.company_id = p_company_id
      AND a.is_active = 1
      AND COALESCE(a.account_subtype,'') != 'Header'
    GROUP BY a.account_type
    ORDER BY FIELD(a.account_type, 'Asset', 'Liability', 'Equity', 'Revenue', 'Expense');
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_link_parent_accounts`;
delimiter ;;
CREATE PROCEDURE `sp_link_parent_accounts`(IN p_company_id CHAR(36))
BEGIN
    UPDATE acc_accounts a
    INNER JOIN acc_accounts p ON a.company_id = p.company_id
    SET a.parent_id = p.id
    WHERE a.company_id = p_company_id
      AND p.account_subtype = 'Header'
      AND COALESCE(a.account_subtype,'') != 'Header'
      AND a.account_type = p.account_type
      AND a.parent_id IS NULL;
END
;;
delimiter ;

