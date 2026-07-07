-- ============================================================================
-- Migration 014: Payment → GL (close the cash-movement loop)
--
--   AR and AP record payments but post NO general-ledger entry, so paying a
--   vendor bill or receiving a customer payment never moves Cash and never
--   relieves the AP/AR control account — the balance sheet drifts after any
--   payment. This adds the cash journal, posted in the Go layer:
--     * Vendor bill payment : Dr Accounts Payable / Cr Cash
--     * Customer payment     : Dr Cash / Cr Accounts Receivable
--
--   The control account is DERIVED FROM THE DOCUMENT'S OWN JOURNAL (not settings),
--   so a payment can only relieve what was actually posted:
--     * AP control = the Cr line of the bill's journal (ap_bills.journal_id).
--     * AR control = the Dr line of the invoice's revenue journal
--       (so_order_invoices.revenue_journal_id).
--   A bill/invoice that was never GL-posted (e.g. entered directly in AP/AR with
--   no journal) returns no control account, so its payment posts no GL — the
--   entry can never go one-sided.
--
--   Apply BEFORE/with the matching server build (privileged MySQL user):
--     mysql -u root -p lettersheets < server/migrations/014_payment_gl.sql
-- ============================================================================


-- ---------- Schema: AR payments need a journal link (AP payments already have one) ----------

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'ar_invoice_payments' AND column_name = 'journal_id');
SET @ddl = IF(@col_exists = 0,
    'ALTER TABLE ar_invoice_payments ADD COLUMN journal_id char(36) DEFAULT NULL',
    'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ---------- Control-account resolvers (derive from the document's own journal) ----------

-- AP control = the credited account on the bill's journal (procurement bill: the single Cr AP line).
DROP PROCEDURE IF EXISTS `sp_pay_ap_control`;
delimiter ;;
CREATE PROCEDURE `sp_pay_ap_control`(IN p_bill_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT l.account_id AS ap_account_id
    FROM ap_bills b
    JOIN acc_journal_lines l ON l.entry_id = b.journal_id
    WHERE b.id = p_bill_id AND b.company_id = p_cid
      AND b.journal_id IS NOT NULL AND b.journal_id <> '' AND l.credit > 0
    ORDER BY l.credit DESC
    LIMIT 1;
END
;;
delimiter ;

-- AR control = the debited account on the invoice's revenue journal (sales revenue: the single Dr A/R line).
DROP PROCEDURE IF EXISTS `sp_pay_ar_control`;
delimiter ;;
CREATE PROCEDURE `sp_pay_ar_control`(IN p_invoice_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT l.account_id AS ar_account_id
    FROM so_order_invoices oi
    JOIN acc_journal_lines l ON l.entry_id = oi.revenue_journal_id
    WHERE oi.invoice_id = p_invoice_id AND oi.company_id = p_cid
      AND oi.revenue_journal_id IS NOT NULL AND oi.revenue_journal_id <> '' AND l.debit > 0
    ORDER BY l.debit DESC
    LIMIT 1;
END
;;
delimiter ;


-- ---------- Store the payment's journal link (for later void-on-delete) ----------

DROP PROCEDURE IF EXISTS `sp_set_bill_payment_journal`;
delimiter ;;
CREATE PROCEDURE `sp_set_bill_payment_journal`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_jid CHAR(36))
BEGIN
    UPDATE ap_bill_payments SET journal_id = p_jid WHERE id = p_id AND company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_set_invoice_payment_journal`;
delimiter ;;
CREATE PROCEDURE `sp_set_invoice_payment_journal`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_jid CHAR(36))
BEGIN
    UPDATE ar_invoice_payments SET journal_id = p_jid WHERE id = p_id AND company_id = p_cid;
END
;;
delimiter ;


-- ---------- Void a payment's journal on delete (reverses Cash/control balances) ----------

DROP PROCEDURE IF EXISTS `sp_void_journal_by_source`;
delimiter ;;
CREATE PROCEDURE `sp_void_journal_by_source`(IN p_cid CHAR(36), IN p_source_type VARCHAR(30), IN p_source_id CHAR(36), IN p_user CHAR(36), IN p_reason VARCHAR(255))
BEGIN
    DECLARE v_eid CHAR(36);
    SELECT id INTO v_eid FROM acc_journal_entries
    WHERE company_id = p_cid AND source_type = p_source_type AND source_id = p_source_id AND status = 'Posted'
    ORDER BY entry_number DESC LIMIT 1;
    IF v_eid IS NOT NULL THEN
        CALL sp_void_journal_entry(v_eid, p_cid, p_user, p_reason);
    END IF;
END
;;
delimiter ;
