-- ============================================================================
-- Migration 003: multi-tenant scoping + correctness fixes
--
-- company_id scoping for procedures that previously keyed only on a client id
-- (IDOR: C4-C8, H2), fail-open NULL-guard fixes, loan overpayment (H7),
-- LAST_INSERT_ID (#29), loan payment status guard (#30), idempotent account
-- toggle (#35). Apply BEFORE/with the matching server build.
--   mysql -u <user> -p lettersheets < server/migrations/003_fix_tenant_scoping.sql
-- ============================================================================


-- ---------- Loans (C5, C6, H1, H7, #29, #30) ----------

DROP PROCEDURE IF EXISTS `sp_get_loan`;
delimiter ;;
CREATE PROCEDURE `sp_get_loan`(IN p_company_id CHAR(36), IN p_id CHAR(36))
BEGIN
    SELECT l.*,
        e.first_name, e.last_name, e.department, e.position
    FROM loans l
    LEFT JOIN employees e ON e.id = l.employee_id
    WHERE l.id = p_id AND l.company_id = p_company_id;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_approve_loan`;
delimiter ;;
CREATE PROCEDURE `sp_approve_loan`(IN p_company_id CHAR(36), IN p_id CHAR(36), IN p_approved_by CHAR(36),
    IN p_start_date DATE, IN p_end_date DATE)
BEGIN
    UPDATE loans SET status = 'Active', approved_date = CURDATE(), approved_by = p_approved_by,
        start_date = p_start_date, end_date = p_end_date
    WHERE id = p_id AND company_id = p_company_id AND status = 'Pending';
    SELECT * FROM loans WHERE id = p_id AND company_id = p_company_id;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_reject_loan`;
delimiter ;;
CREATE PROCEDURE `sp_reject_loan`(IN p_company_id CHAR(36), IN p_id CHAR(36), IN p_rejection_note TEXT)
BEGIN
    UPDATE loans SET status = 'Rejected', rejection_note = p_rejection_note WHERE id = p_id AND company_id = p_company_id AND status = 'Pending';
    SELECT * FROM loans WHERE id = p_id AND company_id = p_company_id;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_cancel_loan`;
delimiter ;;
CREATE PROCEDURE `sp_cancel_loan`(IN p_company_id CHAR(36), IN p_id CHAR(36))
BEGIN
    UPDATE loans SET status = 'Cancelled' WHERE id = p_id AND company_id = p_company_id AND status IN ('Pending','Approved');
    SELECT * FROM loans WHERE id = p_id AND company_id = p_company_id;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_delete_loan`;
delimiter ;;
CREATE PROCEDURE `sp_delete_loan`(IN p_company_id CHAR(36), IN p_id CHAR(36))
BEGIN
    UPDATE loans SET is_deleted = 1 WHERE id = p_id AND company_id = p_company_id;
    UPDATE loan_payments SET is_deleted = 1 WHERE loan_id = p_id AND company_id = p_company_id;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_get_loan_payments`;
delimiter ;;
CREATE PROCEDURE `sp_get_loan_payments`(IN p_company_id CHAR(36), IN p_loan_id CHAR(36))
BEGIN
    SELECT * FROM loan_payments WHERE loan_id = p_loan_id AND company_id = p_company_id AND is_deleted = 0 ORDER BY payment_date DESC;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_record_loan_payment`;
delimiter ;;
CREATE PROCEDURE `sp_record_loan_payment`(IN p_company_id CHAR(36), IN p_loan_id CHAR(36),
    IN p_payment_date DATE, IN p_amount DECIMAL(12,2),
    IN p_principal DECIMAL(12,2), IN p_interest DECIMAL(12,2),
    IN p_payment_type VARCHAR(30), IN p_notes TEXT)
BEGIN
    DECLARE v_balance DECIMAL(12,2);
    DECLARE v_status VARCHAR(20);
    DECLARE v_applied DECIMAL(12,2);
    DECLARE v_new_balance DECIMAL(12,2);

    -- Scope to the caller's company; a foreign or missing loan yields NULL.
    SELECT balance, status INTO v_balance, v_status FROM loans WHERE id = p_loan_id AND company_id = p_company_id;
    IF v_balance IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'loan not found';
    END IF;
    IF v_status != 'Active' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'payments can only be recorded against active loans';
    END IF;

    -- Never apply more than the outstanding balance. Storing the *applied* amount
    -- (not the raw payment) keeps balance/total_paid consistent and makes payment
    -- reversal on delete correct even when the user tenders an overpayment.
    SET v_applied = LEAST(p_amount, v_balance);
    IF v_applied < 0 THEN SET v_applied = 0; END IF;
    SET v_new_balance = v_balance - v_applied;

    INSERT INTO loan_payments (company_id, loan_id, payment_date, amount, principal, interest, balance_after, payment_type, notes)
    VALUES (p_company_id, p_loan_id, p_payment_date, v_applied, p_principal, p_interest, v_new_balance, p_payment_type, p_notes);

    UPDATE loans SET total_paid = total_paid + v_applied, balance = v_new_balance,
        status = IF(v_new_balance <= 0, 'Paid', status)
    WHERE id = p_loan_id AND company_id = p_company_id;

    SELECT * FROM loan_payments WHERE loan_id = p_loan_id AND company_id = p_company_id AND is_deleted = 0
        ORDER BY created_at DESC LIMIT 1;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_delete_loan_payment`;
delimiter ;;
CREATE PROCEDURE `sp_delete_loan_payment`(IN p_company_id CHAR(36), IN p_id CHAR(36))
BEGIN
    DECLARE v_loan_id CHAR(36);
    DECLARE v_amount DECIMAL(12,2);

    SELECT loan_id, amount INTO v_loan_id, v_amount FROM loan_payments WHERE id = p_id AND company_id = p_company_id;

    IF v_loan_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'loan payment not found';
    END IF;

    UPDATE loan_payments SET is_deleted = 1 WHERE id = p_id AND company_id = p_company_id;

    UPDATE loans SET total_paid = total_paid - v_amount, balance = balance + v_amount,
        status = IF(status = 'Paid', 'Active', status)
    WHERE id = v_loan_id AND company_id = p_company_id;
END
;;
delimiter ;


-- ---------- Chart of accounts (C7, #35) ----------

DROP PROCEDURE IF EXISTS `sp_get_account`;
delimiter ;;
CREATE PROCEDURE `sp_get_account`(IN p_company_id CHAR(36), IN p_id CHAR(36))
BEGIN
    SELECT
        a.id, a.company_id, a.code, a.name,
        a.account_type, a.account_subtype,
        a.normal_balance, a.parent_id,
        p.name AS parent_name, p.code AS parent_code,
        a.description, a.is_active, a.is_system,
        a.currency, a.current_balance,
        a.created_at, a.updated_at
    FROM acc_accounts a
    LEFT JOIN acc_accounts p ON a.parent_id = p.id AND p.is_deleted = 0
    WHERE a.id = p_id
      AND a.company_id = p_company_id
      AND a.is_deleted = 0;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_update_account`;
delimiter ;;
CREATE PROCEDURE `sp_update_account`(IN p_company_id CHAR(36), IN p_id CHAR(36),
    IN p_code VARCHAR(20),
    IN p_name VARCHAR(150),
    IN p_account_type VARCHAR(20),
    IN p_account_subtype VARCHAR(50),
    IN p_normal_balance VARCHAR(10),
    IN p_parent_id CHAR(36),
    IN p_description TEXT,
    IN p_is_active TINYINT(1),
    IN p_currency VARCHAR(3))
BEGIN
    UPDATE acc_accounts SET
        code = p_code,
        name = p_name,
        account_type = p_account_type,
        account_subtype = p_account_subtype,
        normal_balance = p_normal_balance,
        parent_id = NULLIF(p_parent_id, ''),
        description = p_description,
        is_active = p_is_active,
        currency = IFNULL(NULLIF(p_currency, ''), 'PHP')
    WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0 AND is_system = 0;

    SELECT
        a.id, a.company_id, a.code, a.name,
        a.account_type, a.account_subtype,
        a.normal_balance, a.parent_id,
        p.name AS parent_name, p.code AS parent_code,
        a.description, a.is_active, a.is_system,
        a.currency, a.current_balance,
        a.created_at, a.updated_at
    FROM acc_accounts a
    LEFT JOIN acc_accounts p ON a.parent_id = p.id AND p.is_deleted = 0
    WHERE a.id = p_id AND a.company_id = p_company_id;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_delete_account`;
delimiter ;;
CREATE PROCEDURE `sp_delete_account`(IN p_company_id CHAR(36), IN p_id CHAR(36))
BEGIN
    DECLARE v_has_children INT DEFAULT 0;
    DECLARE v_is_system INT DEFAULT 0;

    SELECT is_system INTO v_is_system
    FROM acc_accounts WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;

    IF v_is_system = 1 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot delete system account';
    END IF;

    SELECT COUNT(*) INTO v_has_children
    FROM acc_accounts WHERE parent_id = p_id AND company_id = p_company_id AND is_deleted = 0;

    IF v_has_children > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot delete account with sub-accounts';
    END IF;

    UPDATE acc_accounts SET is_deleted = 1 WHERE id = p_id AND company_id = p_company_id AND is_system = 0;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_toggle_account_active`;
delimiter ;;
CREATE PROCEDURE `sp_toggle_account_active`(IN p_company_id CHAR(36), IN p_id CHAR(36), IN p_is_active TINYINT)
BEGIN
    -- Idempotent when given an explicit desired state; falls back to a flip only
    -- when p_is_active is NULL (legacy behavior).
    UPDATE acc_accounts SET is_active = IF(p_is_active IS NULL, NOT is_active, p_is_active)
    WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0 AND is_system = 0;

    SELECT id, is_active FROM acc_accounts WHERE id = p_id AND company_id = p_company_id;
END
;;
delimiter ;


-- ---------- Journal lines (C8 + fail-open guard) ----------

DROP PROCEDURE IF EXISTS `sp_get_journal_lines`;
delimiter ;;
CREATE PROCEDURE `sp_get_journal_lines`(IN p_entry_id CHAR(36), IN p_company_id CHAR(36))
BEGIN
    SELECT jl.*, a.code AS account_code, a.name AS account_name, a.account_type
    FROM acc_journal_lines jl
    INNER JOIN acc_journal_entries je ON je.id = jl.entry_id
    INNER JOIN acc_accounts a ON jl.account_id = a.id
    WHERE jl.entry_id = p_entry_id AND je.company_id = p_company_id
    ORDER BY jl.sort_order, jl.debit DESC;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_clear_journal_lines`;
delimiter ;;
CREATE PROCEDURE `sp_clear_journal_lines`(IN p_entry_id CHAR(36), IN p_company_id CHAR(36))
BEGIN
    DELETE jl FROM acc_journal_lines jl
    INNER JOIN acc_journal_entries je ON je.id = jl.entry_id
    WHERE jl.entry_id = p_entry_id AND je.company_id = p_company_id;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_add_journal_line`;
delimiter ;;
CREATE PROCEDURE `sp_add_journal_line`(IN p_entry_id CHAR(36),
    IN p_company_id CHAR(36),
    IN p_account_id CHAR(36),
    IN p_description VARCHAR(255),
    IN p_debit DECIMAL(15,2),
    IN p_credit DECIMAL(15,2),
    IN p_sort_order INT)
BEGIN
    -- Only add the line if the parent entry AND the referenced account both
    -- belong to the caller's company (prevents cross-tenant line injection).
    IF NOT EXISTS (SELECT 1 FROM acc_journal_entries WHERE id = p_entry_id AND company_id = p_company_id AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'journal entry not found';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM acc_accounts WHERE id = p_account_id AND company_id = p_company_id AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'account does not belong to company';
    END IF;
    INSERT INTO acc_journal_lines (id, entry_id, account_id, description, debit, credit, sort_order)
    VALUES (UUID(), p_entry_id, p_account_id, p_description, p_debit, p_credit, p_sort_order);
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_update_journal_totals`;
delimiter ;;
CREATE PROCEDURE `sp_update_journal_totals`(IN p_entry_id CHAR(36), IN p_company_id CHAR(36))
BEGIN
    UPDATE acc_journal_entries je SET
        total_debit = (SELECT COALESCE(SUM(debit), 0) FROM acc_journal_lines WHERE entry_id = p_entry_id),
        total_credit = (SELECT COALESCE(SUM(credit), 0) FROM acc_journal_lines WHERE entry_id = p_entry_id)
    WHERE id = p_entry_id AND company_id = p_company_id;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_update_journal_entry`;
delimiter ;;
CREATE PROCEDURE `sp_update_journal_entry`(IN p_id CHAR(36),
    IN p_company_id CHAR(36),
    IN p_entry_date DATE,
    IN p_memo TEXT)
BEGIN
    DECLARE v_status VARCHAR(10);
    SELECT status INTO v_status FROM acc_journal_entries
    WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;

    -- Not found for this company: signal instead of silently succeeding, so the
    -- caller aborts before touching the (now company-scoped) journal lines.
    IF v_status IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'journal entry not found';
    END IF;
    IF v_status != 'Draft' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Can only edit draft entries';
    END IF;

    UPDATE acc_journal_entries SET entry_date = p_entry_date, memo = p_memo
    WHERE id = p_id AND company_id = p_company_id;
END
;;
delimiter ;


-- ---------- User-company access (C4) ----------

DROP PROCEDURE IF EXISTS `sp_update_user_company_access`;
delimiter ;;
CREATE PROCEDURE `sp_update_user_company_access`(IN p_id VARCHAR(36),
    IN p_role VARCHAR(50),
    IN p_permissions JSON,
    IN p_wrapped_company_key BLOB,
    IN p_key_wrap_algorithm VARCHAR(50),
    IN p_key_version INT,
    IN p_public_key BLOB,
    IN p_company_id VARCHAR(36),
    IN p_changed_by VARCHAR(36),
    IN p_session_id VARCHAR(36),
    IN p_ip_address VARCHAR(45),
    IN p_user_agent VARCHAR(500))
BEGIN
    DECLARE v_old_role VARCHAR(50);
    DECLARE v_old_permissions JSON;
    DECLARE v_old_key_wrap_algorithm VARCHAR(50);
    DECLARE v_old_key_version INT;

    SELECT role, permissions, key_wrap_algorithm, key_version
    INTO v_old_role, v_old_permissions, v_old_key_wrap_algorithm, v_old_key_version
    FROM user_company_access WHERE id = p_id AND company_id = p_company_id AND is_active = 1;

    IF v_old_role IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'access record not found';
    END IF;

    UPDATE user_company_access SET
        role = IFNULL(p_role, role),
        permissions = IFNULL(p_permissions, permissions),
        wrapped_company_key = IFNULL(p_wrapped_company_key, wrapped_company_key),
        key_wrap_algorithm = IFNULL(p_key_wrap_algorithm, key_wrap_algorithm),
        key_version = IFNULL(p_key_version, key_version),
        public_key = IFNULL(p_public_key, public_key)
    WHERE id = p_id AND company_id = p_company_id AND is_active = 1;

    IF p_role IS NOT NULL AND p_role != v_old_role THEN
        CALL sp_log_change(p_company_id, p_changed_by, p_session_id, 'user_company_access', p_id, 'update', 'role', v_old_role, p_role, 0, p_ip_address, p_user_agent);
    END IF;
    IF p_permissions IS NOT NULL AND CAST(p_permissions AS CHAR) != CAST(v_old_permissions AS CHAR) THEN
        CALL sp_log_change(p_company_id, p_changed_by, p_session_id, 'user_company_access', p_id, 'update', 'permissions', CAST(v_old_permissions AS CHAR), CAST(p_permissions AS CHAR), 0, p_ip_address, p_user_agent);
    END IF;
    IF p_key_wrap_algorithm IS NOT NULL AND p_key_wrap_algorithm != v_old_key_wrap_algorithm THEN
        CALL sp_log_change(p_company_id, p_changed_by, p_session_id, 'user_company_access', p_id, 'update', 'key_wrap_algorithm', v_old_key_wrap_algorithm, p_key_wrap_algorithm, 0, p_ip_address, p_user_agent);
    END IF;
    IF p_key_version IS NOT NULL AND p_key_version != v_old_key_version THEN
        CALL sp_log_change(p_company_id, p_changed_by, p_session_id, 'user_company_access', p_id, 'update', 'key_version', CAST(v_old_key_version AS CHAR), CAST(p_key_version AS CHAR), 0, p_ip_address, p_user_agent);
    END IF;
    IF p_wrapped_company_key IS NOT NULL THEN
        CALL sp_log_change(p_company_id, p_changed_by, p_session_id, 'user_company_access', p_id, 'update', 'wrapped_company_key', NULL, NULL, 1, p_ip_address, p_user_agent);
    END IF;
    IF p_public_key IS NOT NULL THEN
        CALL sp_log_change(p_company_id, p_changed_by, p_session_id, 'user_company_access', p_id, 'update', 'public_key', NULL, NULL, 1, p_ip_address, p_user_agent);
    END IF;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_delete_user_company_access`;
delimiter ;;
CREATE PROCEDURE `sp_delete_user_company_access`(IN p_id VARCHAR(36),
    IN p_company_id VARCHAR(36),
    IN p_changed_by VARCHAR(36),
    IN p_session_id VARCHAR(36),
    IN p_ip_address VARCHAR(45),
    IN p_user_agent VARCHAR(500))
BEGIN
    DECLARE v_user_id VARCHAR(36);
    DECLARE v_role VARCHAR(50);

    SELECT user_id, role INTO v_user_id, v_role
    FROM user_company_access WHERE id = p_id AND company_id = p_company_id AND is_active = 1;

    IF v_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'access record not found';
    END IF;

    UPDATE user_company_access SET is_active = 0 WHERE id = p_id AND company_id = p_company_id AND is_active = 1;

    CALL sp_log_change(p_company_id, p_changed_by, p_session_id, 'user_company_access', p_id, 'delete', 'is_active', '1', '0', 0, p_ip_address, p_user_agent);
    CALL sp_log_change(p_company_id, p_changed_by, p_session_id, 'user_company_access', p_id, 'delete', 'user_id', v_user_id, NULL, 0, p_ip_address, p_user_agent);
    CALL sp_log_change(p_company_id, p_changed_by, p_session_id, 'user_company_access', p_id, 'delete', 'role', v_role, NULL, 0, p_ip_address, p_user_agent);
END
;;
delimiter ;


-- ---------- AR invoices (H2 + fail-open guard) ----------

DROP PROCEDURE IF EXISTS `sp_get_invoice_items`;
delimiter ;;
CREATE PROCEDURE `sp_get_invoice_items`(IN p_iid CHAR(36), IN p_cid CHAR(36))
BEGIN SELECT ii.*, a.code AS account_code, a.name AS account_name FROM ar_invoice_items ii INNER JOIN ar_invoices inv ON inv.id=ii.invoice_id INNER JOIN acc_accounts a ON a.id=ii.account_id WHERE ii.invoice_id=p_iid AND inv.company_id=p_cid ORDER BY ii.sort_order; END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_get_invoice_payments`;
delimiter ;;
CREATE PROCEDURE `sp_get_invoice_payments`(IN p_iid CHAR(36), IN p_cid CHAR(36))
BEGIN SELECT ip.*, a.code AS account_code, a.name AS account_name FROM ar_invoice_payments ip INNER JOIN ar_invoices inv ON inv.id=ip.invoice_id LEFT JOIN acc_accounts a ON a.id=ip.account_id WHERE ip.invoice_id=p_iid AND inv.company_id=p_cid AND ip.is_deleted=0 ORDER BY ip.payment_date; END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_clear_invoice_items`;
delimiter ;;
CREATE PROCEDURE `sp_clear_invoice_items`(IN p_iid CHAR(36), IN p_cid CHAR(36))
BEGIN DELETE ii FROM ar_invoice_items ii INNER JOIN ar_invoices i ON i.id=ii.invoice_id WHERE ii.invoice_id=p_iid AND i.company_id=p_cid; END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_add_invoice_item`;
delimiter ;;
CREATE PROCEDURE `sp_add_invoice_item`(IN p_iid CHAR(36), IN p_cid CHAR(36), IN p_aid CHAR(36), IN p_desc VARCHAR(255), IN p_qty DECIMAL(10,2), IN p_up DECIMAL(15,2), IN p_amt DECIMAL(15,2), IN p_tr DECIMAL(5,2), IN p_ta DECIMAL(15,2), IN p_so INT)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ar_invoices WHERE id=p_iid AND company_id=p_cid AND is_deleted=0) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='invoice not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM acc_accounts WHERE id=p_aid AND company_id=p_cid AND is_deleted=0) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='account does not belong to company';
  END IF;
  INSERT INTO ar_invoice_items (id,invoice_id,account_id,description,quantity,unit_price,amount,tax_rate,tax_amount,sort_order) VALUES (UUID(),p_iid,p_aid,p_desc,p_qty,p_up,p_amt,p_tr,p_ta,p_so);
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_update_invoice_totals`;
delimiter ;;
CREATE PROCEDURE `sp_update_invoice_totals`(IN p_iid CHAR(36), IN p_cid CHAR(36))
BEGIN
  UPDATE ar_invoices SET
    subtotal=(SELECT COALESCE(SUM(amount),0) FROM ar_invoice_items WHERE invoice_id=p_iid),
    tax_amount=(SELECT COALESCE(SUM(tax_amount),0) FROM ar_invoice_items WHERE invoice_id=p_iid),
    total_amount=(SELECT COALESCE(SUM(amount+tax_amount),0) FROM ar_invoice_items WHERE invoice_id=p_iid),
    balance_due=(SELECT COALESCE(SUM(amount+tax_amount),0) FROM ar_invoice_items WHERE invoice_id=p_iid) - amount_paid
  WHERE id=p_iid AND company_id=p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_update_invoice`;
delimiter ;;
CREATE PROCEDURE `sp_update_invoice`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_custid CHAR(36), IN p_num VARCHAR(50), IN p_date DATE, IN p_due DATE, IN p_memo TEXT, IN p_ref VARCHAR(100))
BEGIN
  DECLARE v_st VARCHAR(10);
  SELECT status INTO v_st FROM ar_invoices WHERE id=p_id AND company_id=p_cid AND is_deleted=0;
  IF v_st IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='invoice not found'; END IF;
  IF v_st NOT IN ('Draft','Sent') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Can only edit draft/sent invoices'; END IF;
  UPDATE ar_invoices SET customer_id=p_custid,invoice_number=p_num,invoice_date=p_date,due_date=p_due,memo=p_memo,reference=p_ref WHERE id=p_id AND company_id=p_cid;
END
;;
delimiter ;


-- ---------- AP bills (H2 + fail-open guard) ----------

DROP PROCEDURE IF EXISTS `sp_get_bill_items`;
delimiter ;;
CREATE PROCEDURE `sp_get_bill_items`(IN p_bill_id CHAR(36), IN p_company_id CHAR(36))
BEGIN
    SELECT bi.*, a.code AS account_code, a.name AS account_name
    FROM ap_bill_items bi
    INNER JOIN ap_bills b ON b.id = bi.bill_id
    INNER JOIN acc_accounts a ON a.id = bi.account_id
    WHERE bi.bill_id = p_bill_id AND b.company_id = p_company_id
    ORDER BY bi.sort_order;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_get_bill_payments`;
delimiter ;;
CREATE PROCEDURE `sp_get_bill_payments`(IN p_bill_id CHAR(36), IN p_company_id CHAR(36))
BEGIN
    SELECT bp.*, a.code AS account_code, a.name AS account_name
    FROM ap_bill_payments bp
    INNER JOIN ap_bills b ON b.id = bp.bill_id
    LEFT JOIN acc_accounts a ON a.id = bp.account_id
    WHERE bp.bill_id = p_bill_id AND b.company_id = p_company_id AND bp.is_deleted = 0
    ORDER BY bp.payment_date;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_clear_bill_items`;
delimiter ;;
CREATE PROCEDURE `sp_clear_bill_items`(IN p_bill_id CHAR(36), IN p_company_id CHAR(36))
BEGIN
    DELETE bi FROM ap_bill_items bi
    INNER JOIN ap_bills b ON b.id = bi.bill_id
    WHERE bi.bill_id = p_bill_id AND b.company_id = p_company_id;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_add_bill_item`;
delimiter ;;
CREATE PROCEDURE `sp_add_bill_item`(IN p_bill_id CHAR(36),
    IN p_company_id CHAR(36),
    IN p_account_id CHAR(36),
    IN p_description VARCHAR(255),
    IN p_quantity DECIMAL(10,2),
    IN p_unit_price DECIMAL(15,2),
    IN p_amount DECIMAL(15,2),
    IN p_tax_rate DECIMAL(5,2),
    IN p_tax_amount DECIMAL(15,2),
    IN p_sort_order INT)
BEGIN
    IF NOT EXISTS (SELECT 1 FROM ap_bills WHERE id = p_bill_id AND company_id = p_company_id AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'bill not found';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM acc_accounts WHERE id = p_account_id AND company_id = p_company_id AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'account does not belong to company';
    END IF;
    INSERT INTO ap_bill_items (id, bill_id, account_id, description, quantity, unit_price, amount, tax_rate, tax_amount, sort_order)
    VALUES (UUID(), p_bill_id, p_account_id, p_description, p_quantity, p_unit_price, p_amount, p_tax_rate, p_tax_amount, p_sort_order);
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_update_bill_totals`;
delimiter ;;
CREATE PROCEDURE `sp_update_bill_totals`(IN p_bill_id CHAR(36), IN p_company_id CHAR(36))
BEGIN
    UPDATE ap_bills b SET
        subtotal = (SELECT COALESCE(SUM(amount), 0) FROM ap_bill_items WHERE bill_id = p_bill_id),
        tax_amount = (SELECT COALESCE(SUM(tax_amount), 0) FROM ap_bill_items WHERE bill_id = p_bill_id),
        total_amount = (SELECT COALESCE(SUM(amount + tax_amount), 0) FROM ap_bill_items WHERE bill_id = p_bill_id),
        balance_due = (SELECT COALESCE(SUM(amount + tax_amount), 0) FROM ap_bill_items WHERE bill_id = p_bill_id) - b.amount_paid
    WHERE id = p_bill_id AND company_id = p_company_id;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_update_bill`;
delimiter ;;
CREATE PROCEDURE `sp_update_bill`(IN p_id CHAR(36),
    IN p_company_id CHAR(36),
    IN p_vendor_id CHAR(36),
    IN p_bill_number VARCHAR(50),
    IN p_bill_date DATE,
    IN p_due_date DATE,
    IN p_memo TEXT,
    IN p_reference VARCHAR(100))
BEGIN
    DECLARE v_status VARCHAR(10);
    SELECT status INTO v_status FROM ap_bills WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;
    IF v_status IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'bill not found';
    END IF;
    IF v_status NOT IN ('Draft','Open') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Can only edit draft or open bills';
    END IF;
    UPDATE ap_bills SET
        vendor_id = p_vendor_id, bill_number = p_bill_number, bill_date = p_bill_date,
        due_date = p_due_date, memo = p_memo, reference = p_reference
    WHERE id = p_id AND company_id = p_company_id;
END
;;
delimiter ;

