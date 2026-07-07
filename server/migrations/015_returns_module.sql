-- ============================================================================
-- Migration 015: Returns — AR Credit Memos + AP Debit Memos (order-based)
--
--   The reversal siblings of Sales (012) and Procurement (013). A CREDIT MEMO
--   reverses a customer sale; a DEBIT MEMO reverses a vendor purchase. Both are
--   ORDER-BASED: they credit against a sales order / purchase order (which already
--   track invoiced/billed qty and link to the inventory movements + FROZEN cost),
--   never against a bare invoice/bill line (ar_invoice_items/ap_bill_items carry
--   no order/product/movement link).
--
--   GL is posted in the Go layer (never in SPs), balanced, source-tagged:
--     AR credit memo:  Dr Revenue(net) / Dr Tax / Cr A/R            (source ar_credit_memo)
--                      restock: Dr Inventory / Cr COGS  @frozen cost (source inventory)
--                      scrap:   Dr Adjustment / Cr COGS  @frozen cost (source inventory)
--     AP debit memo:   Dr A/P / Cr GR-IR / Cr Input Tax             (source ap_debit_memo)
--                      Dr GR-IR / Cr Inventory  @frozen receipt net (source procurement)
--     Cash refund:     AR Dr A/R / Cr Cash ; AP Dr Cash / Cr A/P    (source *_refund)
--
--   Frozen cost freezes reversals to the cent (AR: the fulfillment 'out' movement
--   unit_cost; AP: the pur_receipt_items unit_cost). Over-return is capped by a
--   persisted qty_returned counter on the order line, mutated under FOR UPDATE.
--   Applying a memo reduces the linked invoice/bill balance_due via a dedicated
--   allocation table (NOT the payments tables, which feed cash KPIs) and posts NO
--   GL (the memo's own reversal journal already moved the control account).
--
--   Apply BEFORE/with the matching server build (privileged MySQL user):
--     mysql -u root -p lettersheets < server/migrations/015_returns_module.sql
-- ============================================================================


-- ---------- Persisted returned-qty counters on the order lines (idempotent) ----------

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'so_order_items' AND column_name = 'qty_returned');
SET @s := IF(@c = 0, 'ALTER TABLE so_order_items ADD COLUMN qty_returned decimal(15,2) NOT NULL DEFAULT 0.00', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pur_order_items' AND column_name = 'qty_returned');
SET @s := IF(@c = 0, 'ALTER TABLE pur_order_items ADD COLUMN qty_returned decimal(15,2) NOT NULL DEFAULT 0.00', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;


-- ---------- Tables ----------

CREATE TABLE IF NOT EXISTS `ar_credit_memo_sequences` (`company_id` char(36) NOT NULL, `next_number` int DEFAULT '1', PRIMARY KEY (`company_id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS `ap_debit_memo_sequences`  (`company_id` char(36) NOT NULL, `next_number` int DEFAULT '1', PRIMARY KEY (`company_id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `ar_credit_memos` (
  `id`                 char(36)      NOT NULL DEFAULT (uuid()),
  `company_id`         char(36)      NOT NULL,
  `memo_number`        int           NOT NULL,
  `customer_id`        char(36)      NOT NULL,
  `order_id`           char(36)      NOT NULL,
  `invoice_id`         char(36)      DEFAULT NULL,
  `status`             varchar(20)   NOT NULL DEFAULT 'Draft',
  `memo_date`          date          DEFAULT NULL,
  `reason`             varchar(500)  DEFAULT NULL,
  `subtotal`           decimal(15,2) DEFAULT '0.00',
  `tax_amount`         decimal(15,2) DEFAULT '0.00',
  `total_amount`       decimal(15,2) DEFAULT '0.00',
  `amount_applied`     decimal(15,2) DEFAULT '0.00',
  `amount_refunded`    decimal(15,2) DEFAULT '0.00',
  `balance_credit`     decimal(15,2) DEFAULT '0.00',
  `warehouse_id`       char(36)      DEFAULT NULL,
  `revenue_journal_id` char(36)      DEFAULT NULL,
  `refund_journal_id`  char(36)      DEFAULT NULL,
  `movements_posted`   tinyint(1)    DEFAULT '0',
  `created_by`         char(36)      DEFAULT NULL,
  `is_deleted`         tinyint(1)    DEFAULT '0',
  `created_at`         timestamp     NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         timestamp     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_arcm_num` (`company_id`,`memo_number`),
  KEY `idx_arcm` (`company_id`,`is_deleted`),
  KEY `idx_arcm_status` (`company_id`,`status`),
  KEY `idx_arcm_cust` (`customer_id`),
  KEY `idx_arcm_order` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `ar_credit_memo_items` (
  `id`                 char(36)      NOT NULL DEFAULT (uuid()),
  `company_id`         char(36)      NOT NULL,
  `credit_memo_id`     char(36)      NOT NULL,
  `order_item_id`      char(36)      DEFAULT NULL,
  `product_id`         char(36)      DEFAULT NULL,
  `revenue_account_id` char(36)      DEFAULT NULL,
  `description`        varchar(500)  DEFAULT NULL,
  `quantity`           decimal(15,2) NOT NULL DEFAULT '0.00',
  `unit_price`         decimal(15,2) DEFAULT '0.00',
  `amount`             decimal(15,2) DEFAULT '0.00',
  `tax_rate`           decimal(5,2)  DEFAULT '0.00',
  `tax_amount`         decimal(15,2) DEFAULT '0.00',
  `restock`            tinyint(1)    DEFAULT '1',
  `unit_cost`          decimal(15,2) DEFAULT '0.00',
  `warehouse_id`       char(36)      DEFAULT NULL,
  `movement_id`        char(36)      DEFAULT NULL,
  `journal_entry_id`   char(36)      DEFAULT NULL,
  `sort_order`         int           DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_arcmi` (`credit_memo_id`,`order_item_id`),
  KEY `idx_arcmi` (`credit_memo_id`),
  KEY `idx_arcmi_oi` (`order_item_id`),
  CONSTRAINT `ar_credit_memo_items_ibfk_1` FOREIGN KEY (`credit_memo_id`) REFERENCES `ar_credit_memos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `ar_credit_applications` (
  `id`             char(36)      NOT NULL DEFAULT (uuid()),
  `company_id`     char(36)      NOT NULL,
  `credit_memo_id` char(36)      NOT NULL,
  `invoice_id`     char(36)      NOT NULL,
  `amount`         decimal(15,2) NOT NULL DEFAULT '0.00',
  `applied_date`   date          DEFAULT NULL,
  `created_by`     char(36)      DEFAULT NULL,
  `is_deleted`     tinyint(1)    DEFAULT '0',
  `created_at`     timestamp     NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_arca_memo` (`credit_memo_id`),
  KEY `idx_arca_inv` (`invoice_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `ap_debit_memos` (
  `id`                 char(36)      NOT NULL DEFAULT (uuid()),
  `company_id`         char(36)      NOT NULL,
  `memo_number`        int           NOT NULL,
  `vendor_id`          char(36)      NOT NULL,
  `order_id`           char(36)      NOT NULL,
  `bill_id`            char(36)      DEFAULT NULL,
  `status`             varchar(20)   NOT NULL DEFAULT 'Draft',
  `memo_date`          date          DEFAULT NULL,
  `reason`             varchar(500)  DEFAULT NULL,
  `subtotal`           decimal(15,2) DEFAULT '0.00',
  `tax_amount`         decimal(15,2) DEFAULT '0.00',
  `total_amount`       decimal(15,2) DEFAULT '0.00',
  `amount_applied`     decimal(15,2) DEFAULT '0.00',
  `amount_refunded`    decimal(15,2) DEFAULT '0.00',
  `balance_debit`      decimal(15,2) DEFAULT '0.00',
  `warehouse_id`       char(36)      DEFAULT NULL,
  `payable_journal_id` char(36)      DEFAULT NULL,
  `refund_journal_id`  char(36)      DEFAULT NULL,
  `movements_posted`   tinyint(1)    DEFAULT '0',
  `created_by`         char(36)      DEFAULT NULL,
  `is_deleted`         tinyint(1)    DEFAULT '0',
  `created_at`         timestamp     NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         timestamp     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_apdm_num` (`company_id`,`memo_number`),
  KEY `idx_apdm` (`company_id`,`is_deleted`),
  KEY `idx_apdm_status` (`company_id`,`status`),
  KEY `idx_apdm_vendor` (`vendor_id`),
  KEY `idx_apdm_order` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `ap_debit_memo_items` (
  `id`                 char(36)      NOT NULL DEFAULT (uuid()),
  `company_id`         char(36)      NOT NULL,
  `debit_memo_id`      char(36)      NOT NULL,
  `order_item_id`      char(36)      DEFAULT NULL,
  `product_id`         char(36)      DEFAULT NULL,
  `expense_account_id` char(36)      DEFAULT NULL,
  `description`        varchar(500)  DEFAULT NULL,
  `quantity`           decimal(15,2) NOT NULL DEFAULT '0.00',
  `unit_cost`          decimal(15,2) DEFAULT '0.00',
  `amount`             decimal(15,2) DEFAULT '0.00',
  `tax_rate`           decimal(5,2)  DEFAULT '0.00',
  `tax_amount`         decimal(15,2) DEFAULT '0.00',
  `warehouse_id`       char(36)      DEFAULT NULL,
  `movement_id`        char(36)      DEFAULT NULL,
  `journal_entry_id`   char(36)      DEFAULT NULL,
  `sort_order`         int           DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_apdmi` (`debit_memo_id`,`order_item_id`),
  KEY `idx_apdmi` (`debit_memo_id`),
  KEY `idx_apdmi_oi` (`order_item_id`),
  CONSTRAINT `ap_debit_memo_items_ibfk_1` FOREIGN KEY (`debit_memo_id`) REFERENCES `ap_debit_memos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `ap_debit_applications` (
  `id`            char(36)      NOT NULL DEFAULT (uuid()),
  `company_id`    char(36)      NOT NULL,
  `debit_memo_id` char(36)      NOT NULL,
  `bill_id`       char(36)      NOT NULL,
  `amount`        decimal(15,2) NOT NULL DEFAULT '0.00',
  `applied_date`  date          DEFAULT NULL,
  `created_by`    char(36)      DEFAULT NULL,
  `is_deleted`    tinyint(1)    DEFAULT '0',
  `created_at`    timestamp     NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_apda_memo` (`debit_memo_id`),
  KEY `idx_apda_bill` (`bill_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- ---------- Sequences + control resolvers ----------

DROP PROCEDURE IF EXISTS `sp_ar_cm_next_number`;
delimiter ;;
CREATE PROCEDURE `sp_ar_cm_next_number`(IN p_cid CHAR(36), OUT p_num INT)
BEGIN
    INSERT INTO ar_credit_memo_sequences (company_id, next_number) VALUES (p_cid, 2)
        ON DUPLICATE KEY UPDATE next_number = next_number + 1;
    SELECT CASE WHEN next_number > 1 THEN next_number - 1 ELSE 1 END INTO p_num FROM ar_credit_memo_sequences WHERE company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_ap_dm_next_number`;
delimiter ;;
CREATE PROCEDURE `sp_ap_dm_next_number`(IN p_cid CHAR(36), OUT p_num INT)
BEGIN
    INSERT INTO ap_debit_memo_sequences (company_id, next_number) VALUES (p_cid, 2)
        ON DUPLICATE KEY UPDATE next_number = next_number + 1;
    SELECT CASE WHEN next_number > 1 THEN next_number - 1 ELSE 1 END INTO p_num FROM ap_debit_memo_sequences WHERE company_id = p_cid;
END
;;
delimiter ;

-- A/R control = the Dr line of the sales order's revenue journal (Dr A/R / Cr Rev / Cr Tax). Empty if never GL-posted.
DROP PROCEDURE IF EXISTS `sp_ar_cm_ar_control`;
delimiter ;;
CREATE PROCEDURE `sp_ar_cm_ar_control`(IN p_order_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT l.account_id AS ar_account_id
    FROM so_orders o
    JOIN acc_journal_lines l ON l.entry_id = o.revenue_journal_id
    WHERE o.id = p_order_id AND o.company_id = p_cid
      AND o.revenue_journal_id IS NOT NULL AND o.revenue_journal_id <> '' AND l.debit > 0
    ORDER BY l.debit DESC LIMIT 1;
END
;;
delimiter ;

-- A/P control = the Cr line of the bill's journal (Dr GR-IR / Dr Tax / Cr A/P). Empty if never GL-posted.
DROP PROCEDURE IF EXISTS `sp_ap_dm_ap_control`;
delimiter ;;
CREATE PROCEDURE `sp_ap_dm_ap_control`(IN p_bill_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT l.account_id AS ap_account_id
    FROM ap_bills b
    JOIN acc_journal_lines l ON l.entry_id = b.journal_id
    WHERE b.id = p_bill_id AND b.company_id = p_cid
      AND b.journal_id IS NOT NULL AND b.journal_id <> '' AND l.credit > 0
    ORDER BY l.credit DESC LIMIT 1;
END
;;
delimiter ;


-- ============================================================================
-- AR CREDIT MEMOS
-- ============================================================================

-- Creditable order lines: invoiced-but-not-yet-returned qty + frozen COGS cost.
DROP PROCEDURE IF EXISTS `sp_ar_cm_creditable`;
delimiter ;;
CREATE PROCEDURE `sp_ar_cm_creditable`(IN p_order_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT oi.id AS order_item_id, oi.product_id, p.name AS product_name, oi.description,
        oi.qty_invoiced, oi.qty_returned, (oi.qty_invoiced - oi.qty_returned) AS creditable_qty,
        ROUND(oi.unit_price * (1 - IFNULL(oi.discount_pct,0)/100) * (1 - IFNULL(o.discount_pct,0)/100), 2) AS unit_price,
        oi.tax_rate, oi.revenue_account_id, oi.warehouse_id,
        IFNULL(
            (SELECT SUM(m.quantity*m.unit_cost)/NULLIF(SUM(m.quantity),0)
             FROM so_shipment_items si JOIN inv_movements m ON si.movement_id = m.id
             WHERE si.order_item_id = oi.id AND si.company_id = p_cid AND m.movement_type = 'out'),
            IFNULL((SELECT cost_price FROM inv_products WHERE id = oi.product_id AND company_id = p_cid), 0)
        ) AS unit_cost
    FROM so_order_items oi
    JOIN so_orders o ON oi.order_id = o.id AND o.company_id = p_cid
    LEFT JOIN inv_products p ON oi.product_id = p.id AND p.company_id = p_cid
    WHERE oi.order_id = p_order_id AND oi.company_id = p_cid AND (oi.qty_invoiced - oi.qty_returned) > 0
    ORDER BY oi.sort_order, oi.id;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_ar_cm_create`;
delimiter ;;
CREATE PROCEDURE `sp_ar_cm_create`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_order_id CHAR(36), IN p_invoice_id CHAR(36), IN p_memo_date DATE, IN p_reason VARCHAR(500), IN p_warehouse_id CHAR(36), IN p_by CHAR(36))
BEGIN
    DECLARE v_num INT;
    DECLARE v_cust CHAR(36);
    DECLARE v_wh CHAR(36);
    SELECT customer_id, warehouse_id INTO v_cust, v_wh FROM so_orders WHERE id = p_order_id AND company_id = p_cid AND is_deleted = 0;
    IF v_cust IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sales order not found'; END IF;
    IF p_invoice_id IS NOT NULL AND p_invoice_id <> '' AND NOT EXISTS (SELECT 1 FROM ar_invoices WHERE id = p_invoice_id AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invoice not found in company';
    END IF;
    CALL sp_ar_cm_next_number(p_cid, v_num);
    INSERT INTO ar_credit_memos (id, company_id, memo_number, customer_id, order_id, invoice_id, status, memo_date, reason, warehouse_id, created_by)
    VALUES (p_id, p_cid, v_num, v_cust, p_order_id, NULLIF(p_invoice_id,''), 'Draft', IFNULL(p_memo_date, CURDATE()), NULLIF(p_reason,''), IFNULL(NULLIF(p_warehouse_id,''), v_wh), p_by);
    SELECT v_num AS memo_number;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_ar_cm_add_item`;
delimiter ;;
CREATE PROCEDURE `sp_ar_cm_add_item`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_memo_id CHAR(36), IN p_order_item_id CHAR(36), IN p_desc VARCHAR(500), IN p_qty DECIMAL(15,2), IN p_unit_price DECIMAL(15,2), IN p_tax_rate DECIMAL(5,2), IN p_unit_cost DECIMAL(15,2), IN p_restock TINYINT, IN p_sort INT)
BEGIN
    DECLARE v_pid CHAR(36);
    DECLARE v_racct CHAR(36);
    DECLARE v_wh CHAR(36);
    DECLARE v_avail DECIMAL(15,2);
    DECLARE v_order CHAR(36);
    IF NOT EXISTS (SELECT 1 FROM ar_credit_memos WHERE id = p_memo_id AND company_id = p_cid AND is_deleted = 0 AND status = 'Draft') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'credit memo not found or not editable';
    END IF;
    SELECT order_id INTO v_order FROM ar_credit_memos WHERE id = p_memo_id AND company_id = p_cid;
    SELECT oi.product_id, oi.revenue_account_id, oi.warehouse_id, (oi.qty_invoiced - oi.qty_returned)
        INTO v_pid, v_racct, v_wh, v_avail
    FROM so_order_items oi WHERE oi.id = p_order_item_id AND oi.company_id = p_cid AND oi.order_id = v_order;
    IF v_avail IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'order line not on this memo''s order'; END IF;
    IF p_qty <= 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'return quantity must be positive'; END IF;
    IF p_qty > v_avail THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'cannot credit more than was invoiced and not yet returned'; END IF;
    INSERT INTO ar_credit_memo_items (id, company_id, credit_memo_id, order_item_id, product_id, revenue_account_id, description, quantity, unit_price, amount, tax_rate, tax_amount, restock, unit_cost, warehouse_id, sort_order)
    VALUES (p_id, p_cid, p_memo_id, p_order_item_id, v_pid, v_racct, NULLIF(p_desc,''), p_qty, IFNULL(p_unit_price,0),
        ROUND(p_qty*IFNULL(p_unit_price,0),2), IFNULL(p_tax_rate,0), ROUND(p_qty*IFNULL(p_unit_price,0)*IFNULL(p_tax_rate,0)/100,2),
        IFNULL(p_restock,1), IFNULL(p_unit_cost,0), v_wh, IFNULL(p_sort,0));
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_ar_cm_clear_items`;
delimiter ;;
CREATE PROCEDURE `sp_ar_cm_clear_items`(IN p_memo_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    IF NOT EXISTS (SELECT 1 FROM ar_credit_memos WHERE id = p_memo_id AND company_id = p_cid AND status = 'Draft') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'credit memo not editable';
    END IF;
    DELETE FROM ar_credit_memo_items WHERE credit_memo_id = p_memo_id AND company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_ar_cm_update_totals`;
delimiter ;;
CREATE PROCEDURE `sp_ar_cm_update_totals`(IN p_memo_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    UPDATE ar_credit_memo_items SET amount = ROUND(quantity*unit_price,2), tax_amount = ROUND(quantity*unit_price*IFNULL(tax_rate,0)/100,2)
    WHERE credit_memo_id = p_memo_id AND company_id = p_cid;
    UPDATE ar_credit_memos c SET
        subtotal = IFNULL((SELECT SUM(amount) FROM ar_credit_memo_items i WHERE i.credit_memo_id = c.id),0),
        tax_amount = IFNULL((SELECT SUM(tax_amount) FROM ar_credit_memo_items i WHERE i.credit_memo_id = c.id),0)
    WHERE c.id = p_memo_id AND c.company_id = p_cid;
    UPDATE ar_credit_memos SET total_amount = subtotal + tax_amount, balance_credit = subtotal + tax_amount
    WHERE id = p_memo_id AND company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_ar_cm_delete`;
delimiter ;;
CREATE PROCEDURE `sp_ar_cm_delete`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    UPDATE ar_credit_memos SET is_deleted = 1 WHERE id = p_id AND company_id = p_cid AND status = 'Draft';
END
;;
delimiter ;

-- Post: lock memo + order, re-check over-return, bump qty_returned, restock (stock 'in'
-- at frozen cost) for restock lines, set Open. Returns goods lines for Go to post the
-- COGS/scrap reversal. Idempotent via movements_posted.
DROP PROCEDURE IF EXISTS `sp_ar_cm_post`;
delimiter ;;
CREATE PROCEDURE `sp_ar_cm_post`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_by CHAR(36))
BEGIN
    DECLARE v_status VARCHAR(20);
    DECLARE v_order CHAR(36);
    DECLARE v_total DECIMAL(15,2);
    DECLARE v_items INT;
    DECLARE v_done INT DEFAULT 0;
    DECLARE v_iid CHAR(36);
    DECLARE v_oi CHAR(36);
    DECLARE v_pid CHAR(36);
    DECLARE v_qty DECIMAL(15,2);
    DECLARE v_cost DECIMAL(15,2);
    DECLARE v_restock TINYINT;
    DECLARE v_wid CHAR(36);
    DECLARE v_owh CHAR(36);
    DECLARE v_onum INT;
    DECLARE v_avail DECIMAL(15,2);
    DECLARE v_bal DECIMAL(15,2);
    DECLARE v_mid CHAR(36);
    DECLARE cur CURSOR FOR
        SELECT id, order_item_id, product_id, quantity, unit_cost, restock, warehouse_id
        FROM ar_credit_memo_items WHERE credit_memo_id = p_id AND company_id = p_cid;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    START TRANSACTION;
    SELECT status, order_id, total_amount, (SELECT COUNT(*) FROM ar_credit_memo_items WHERE credit_memo_id = p_id)
        INTO v_status, v_order, v_total, v_items
    FROM ar_credit_memos WHERE id = p_id AND company_id = p_cid AND is_deleted = 0 FOR UPDATE;
    IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'credit memo not found'; END IF;
    IF v_status <> 'Draft' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'only a draft credit memo can be posted'; END IF;
    IF v_items = 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'credit memo has no lines'; END IF;
    IF v_total <= 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'credit memo total must be positive'; END IF;

    SELECT warehouse_id, order_number INTO v_owh, v_onum FROM so_orders WHERE id = v_order AND company_id = p_cid FOR UPDATE;

    DROP TEMPORARY TABLE IF EXISTS tmp_arcm_post;
    CREATE TEMPORARY TABLE tmp_arcm_post (item_id CHAR(36), product_id CHAR(36), quantity DECIMAL(15,2), unit_cost DECIMAL(15,2), restock TINYINT, movement_id CHAR(36));

    OPEN cur;
    pl: LOOP
        FETCH cur INTO v_iid, v_oi, v_pid, v_qty, v_cost, v_restock, v_wid;
        IF v_done THEN LEAVE pl; END IF;
        -- re-check over-return under the order lock
        SELECT (qty_invoiced - qty_returned) INTO v_avail FROM so_order_items WHERE id = v_oi AND company_id = p_cid;
        IF v_avail IS NULL OR v_qty > v_avail THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'return exceeds invoiced-and-unreturned quantity'; END IF;
        UPDATE so_order_items SET qty_returned = qty_returned + v_qty WHERE id = v_oi AND company_id = p_cid;

        SET v_mid = NULL;
        IF v_restock = 1 AND v_pid IS NOT NULL AND v_pid <> '' THEN
            SET v_wid = IFNULL(NULLIF(v_wid,''), v_owh);
            IF v_wid IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'no warehouse to restock into'; END IF;
            INSERT INTO inv_stock (id, company_id, product_id, warehouse_id, quantity) VALUES (UUID(), p_cid, v_pid, v_wid, 0)
                ON DUPLICATE KEY UPDATE quantity = quantity;
            SELECT quantity INTO v_bal FROM inv_stock WHERE product_id = v_pid AND warehouse_id = v_wid FOR UPDATE;
            SET v_bal = v_bal + v_qty;
            SET v_mid = UUID();
            UPDATE inv_stock SET quantity = v_bal WHERE product_id = v_pid AND warehouse_id = v_wid;
            INSERT INTO inv_movements (id, company_id, product_id, warehouse_id, movement_type, quantity, unit_cost, reference, balance_after, created_by)
            VALUES (v_mid, p_cid, v_pid, v_wid, 'in', v_qty, v_cost, CONCAT('CM-', LPAD((SELECT memo_number FROM ar_credit_memos WHERE id = p_id), 6, '0')), v_bal, p_by);
            UPDATE ar_credit_memo_items SET movement_id = v_mid WHERE id = v_iid;
        END IF;
        INSERT INTO tmp_arcm_post VALUES (v_iid, v_pid, v_qty, v_cost, v_restock, v_mid);
    END LOOP;
    CLOSE cur;

    UPDATE ar_credit_memos SET status = 'Open', movements_posted = 1 WHERE id = p_id AND company_id = p_cid;
    COMMIT;
    SELECT item_id, product_id, quantity, unit_cost, restock, movement_id FROM tmp_arcm_post;
    DROP TEMPORARY TABLE IF EXISTS tmp_arcm_post;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_ar_cm_set_revenue_journal`;
delimiter ;;
CREATE PROCEDURE `sp_ar_cm_set_revenue_journal`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_jid CHAR(36))
BEGIN
    UPDATE ar_credit_memos SET revenue_journal_id = p_jid WHERE id = p_id AND company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_ar_cm_set_line_journal`;
delimiter ;;
CREATE PROCEDURE `sp_ar_cm_set_line_journal`(IN p_item_id CHAR(36), IN p_cid CHAR(36), IN p_jid CHAR(36))
BEGIN
    UPDATE ar_credit_memo_items SET journal_entry_id = p_jid WHERE id = p_item_id AND company_id = p_cid;
END
;;
delimiter ;

-- Apply credit against an invoice: lock the invoice, guard status+balance, reduce
-- balance_due (no GL — the reversal journal already moved A/R).
DROP PROCEDURE IF EXISTS `sp_ar_cm_apply`;
delimiter ;;
CREATE PROCEDURE `sp_ar_cm_apply`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_invoice_id CHAR(36), IN p_amount DECIMAL(15,2))
BEGIN
    DECLARE v_bal_credit DECIMAL(15,2);
    DECLARE v_status VARCHAR(20);
    DECLARE v_inv_status VARCHAR(20);
    DECLARE v_inv_bal DECIMAL(15,2);
    DECLARE v_memo_cust CHAR(36);
    DECLARE v_inv_cust CHAR(36);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
    START TRANSACTION;
    SELECT status, balance_credit, customer_id INTO v_status, v_bal_credit, v_memo_cust FROM ar_credit_memos WHERE id = p_id AND company_id = p_cid AND is_deleted = 0 FOR UPDATE;
    IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'credit memo not found'; END IF;
    IF v_status NOT IN ('Open') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'only an open credit memo can be applied'; END IF;
    IF p_amount <= 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'apply amount must be positive'; END IF;
    IF p_amount > v_bal_credit THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'application exceeds available credit'; END IF;
    SELECT status, balance_due, customer_id INTO v_inv_status, v_inv_bal, v_inv_cust FROM ar_invoices WHERE id = p_invoice_id AND company_id = p_cid AND is_deleted = 0 FOR UPDATE;
    IF v_inv_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invoice not found'; END IF;
    IF v_inv_cust <> v_memo_cust THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invoice belongs to a different customer'; END IF;
    IF v_inv_status NOT IN ('Sent','Partial') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'invoice is not open for application'; END IF;
    IF p_amount > v_inv_bal THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'application exceeds invoice balance'; END IF;

    INSERT INTO ar_credit_applications (id, company_id, credit_memo_id, invoice_id, amount, applied_date) VALUES (UUID(), p_cid, p_id, p_invoice_id, p_amount, CURDATE());
    UPDATE ar_invoices SET amount_paid = amount_paid + p_amount, balance_due = balance_due - p_amount,
        status = CASE WHEN balance_due - p_amount <= 0 THEN 'Paid' ELSE 'Partial' END
    WHERE id = p_invoice_id AND company_id = p_cid;
    UPDATE ar_credit_memos SET amount_applied = amount_applied + p_amount, balance_credit = balance_credit - p_amount,
        status = CASE WHEN balance_credit - p_amount <= 0 THEN 'Applied' ELSE 'Open' END
    WHERE id = p_id AND company_id = p_cid;
    COMMIT;
END
;;
delimiter ;

-- Refund the entire remaining open credit (single refund; GL posted in Go).
DROP PROCEDURE IF EXISTS `sp_ar_cm_refund`;
delimiter ;;
CREATE PROCEDURE `sp_ar_cm_refund`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_jid CHAR(36))
BEGIN
    DECLARE v_status VARCHAR(20);
    DECLARE v_bal DECIMAL(15,2);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
    START TRANSACTION;
    SELECT status, balance_credit INTO v_status, v_bal FROM ar_credit_memos WHERE id = p_id AND company_id = p_cid AND is_deleted = 0 FOR UPDATE;
    IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'credit memo not found'; END IF;
    IF v_status <> 'Open' OR v_bal <= 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'no open credit to refund'; END IF;
    UPDATE ar_credit_memos SET amount_refunded = amount_refunded + v_bal, balance_credit = 0, status = 'Refunded', refund_journal_id = NULLIF(p_jid,'')
    WHERE id = p_id AND company_id = p_cid AND status = 'Open';
    COMMIT;
    SELECT v_bal AS refunded_amount;
END
;;
delimiter ;

-- Void: reverse applications (restore invoice balances), reverse restock ('out'),
-- decrement qty_returned, set Voided. Returns restock movements + line journals for Go.
DROP PROCEDURE IF EXISTS `sp_ar_cm_void`;
delimiter ;;
CREATE PROCEDURE `sp_ar_cm_void`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_by CHAR(36))
BEGIN
    DECLARE v_status VARCHAR(20);
    DECLARE v_onum INT;
    DECLARE v_done INT DEFAULT 0;
    DECLARE v_oi CHAR(36);
    DECLARE v_pid CHAR(36);
    DECLARE v_qty DECIMAL(15,2);
    DECLARE v_cost DECIMAL(15,2);
    DECLARE v_wid CHAR(36);
    DECLARE v_mid CHAR(36);
    DECLARE v_bal DECIMAL(15,2);
    DECLARE v_newmid CHAR(36);
    DECLARE v_jid CHAR(36);
    DECLARE cur CURSOR FOR
        SELECT i.order_item_id, i.product_id, i.quantity, i.unit_cost, m.warehouse_id, i.movement_id, i.journal_entry_id
        FROM ar_credit_memo_items i
        LEFT JOIN inv_movements m ON i.movement_id = m.id
        WHERE i.credit_memo_id = p_id AND i.company_id = p_cid;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    START TRANSACTION;
    SELECT status INTO v_status FROM ar_credit_memos WHERE id = p_id AND company_id = p_cid AND is_deleted = 0 FOR UPDATE;
    IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'credit memo not found'; END IF;
    IF v_status = 'Voided' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'credit memo already voided'; END IF;
    IF v_status = 'Refunded' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'a refunded credit memo cannot be voided'; END IF;

    -- restore any applied invoice balances
    UPDATE ar_invoices inv
    JOIN (SELECT invoice_id, SUM(amount) AS tot FROM ar_credit_applications WHERE credit_memo_id = p_id AND company_id = p_cid AND is_deleted = 0 GROUP BY invoice_id) a ON a.invoice_id = inv.id
    SET inv.amount_paid = inv.amount_paid - a.tot, inv.balance_due = inv.balance_due + a.tot,
        inv.status = CASE WHEN inv.amount_paid - a.tot <= 0 THEN 'Sent' ELSE 'Partial' END
    WHERE inv.company_id = p_cid;
    UPDATE ar_credit_applications SET is_deleted = 1 WHERE credit_memo_id = p_id AND company_id = p_cid;

    DROP TEMPORARY TABLE IF EXISTS tmp_arcm_void;
    CREATE TEMPORARY TABLE tmp_arcm_void (movement_id CHAR(36), product_id CHAR(36), quantity DECIMAL(15,2), unit_cost DECIMAL(15,2), line_journal_id CHAR(36));

    OPEN cur;
    vl: LOOP
        FETCH cur INTO v_oi, v_pid, v_qty, v_cost, v_wid, v_mid, v_jid;
        IF v_done THEN LEAVE vl; END IF;
        -- give back the returned qty on the order line
        UPDATE so_order_items SET qty_returned = GREATEST(0, qty_returned - v_qty) WHERE id = v_oi AND company_id = p_cid;
        SET v_newmid = NULL;
        IF v_mid IS NOT NULL AND v_pid IS NOT NULL AND v_wid IS NOT NULL THEN
            -- reverse the restock: send goods back OUT at the same frozen cost
            INSERT INTO inv_stock (id, company_id, product_id, warehouse_id, quantity) VALUES (UUID(), p_cid, v_pid, v_wid, 0)
                ON DUPLICATE KEY UPDATE quantity = quantity;
            SELECT quantity INTO v_bal FROM inv_stock WHERE product_id = v_pid AND warehouse_id = v_wid FOR UPDATE;
            IF v_bal < v_qty THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'insufficient stock to reverse restock (already consumed)'; END IF;
            SET v_bal = v_bal - v_qty;
            SET v_newmid = UUID();
            UPDATE inv_stock SET quantity = v_bal WHERE product_id = v_pid AND warehouse_id = v_wid;
            INSERT INTO inv_movements (id, company_id, product_id, warehouse_id, movement_type, quantity, unit_cost, reference, balance_after, created_by)
            VALUES (v_newmid, p_cid, v_pid, v_wid, 'out', v_qty, v_cost, 'CM void', v_bal, p_by);
        END IF;
        INSERT INTO tmp_arcm_void VALUES (v_newmid, v_pid, v_qty, v_cost, v_jid);
    END LOOP;
    CLOSE cur;

    UPDATE ar_credit_memos SET status = 'Voided', balance_credit = 0 WHERE id = p_id AND company_id = p_cid;
    COMMIT;
    SELECT movement_id, product_id, quantity, unit_cost, line_journal_id FROM tmp_arcm_void;
    DROP TEMPORARY TABLE IF EXISTS tmp_arcm_void;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_ar_cm_list`;
delimiter ;;
CREATE PROCEDURE `sp_ar_cm_list`(IN p_cid CHAR(36), IN p_status VARCHAR(20))
BEGIN
    SELECT c.id, c.company_id, c.memo_number, c.customer_id, cu.name AS customer_name, c.order_id, o.order_number,
        c.invoice_id, c.status, c.memo_date, c.reason, c.subtotal, c.tax_amount, c.total_amount,
        c.amount_applied, c.amount_refunded, c.balance_credit, c.warehouse_id, c.created_at, c.updated_at,
        (SELECT COUNT(*) FROM ar_credit_memo_items i WHERE i.credit_memo_id = c.id) AS item_count
    FROM ar_credit_memos c
    LEFT JOIN ar_customers cu ON c.customer_id = cu.id AND cu.company_id = p_cid
    LEFT JOIN so_orders o ON c.order_id = o.id AND o.company_id = p_cid
    WHERE c.company_id = p_cid AND c.is_deleted = 0 AND (p_status = '' OR c.status = p_status)
    ORDER BY c.memo_number DESC;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_ar_cm_get`;
delimiter ;;
CREATE PROCEDURE `sp_ar_cm_get`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT c.id, c.company_id, c.memo_number, c.customer_id, cu.name AS customer_name, c.order_id, o.order_number,
        c.invoice_id, c.status, c.memo_date, c.reason, c.subtotal, c.tax_amount, c.total_amount,
        c.amount_applied, c.amount_refunded, c.balance_credit, c.warehouse_id, c.created_at, c.updated_at,
        (SELECT COUNT(*) FROM ar_credit_memo_items i WHERE i.credit_memo_id = c.id) AS item_count
    FROM ar_credit_memos c
    LEFT JOIN ar_customers cu ON c.customer_id = cu.id AND cu.company_id = p_cid
    LEFT JOIN so_orders o ON c.order_id = o.id AND o.company_id = p_cid
    WHERE c.id = p_id AND c.company_id = p_cid AND c.is_deleted = 0;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_ar_cm_get_items`;
delimiter ;;
CREATE PROCEDURE `sp_ar_cm_get_items`(IN p_memo_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT i.id, i.company_id, i.credit_memo_id, i.order_item_id, i.product_id, p.name AS product_name,
        i.description, i.quantity, i.unit_price, i.amount, i.tax_rate, i.tax_amount, i.restock, i.unit_cost,
        i.warehouse_id, i.movement_id, i.journal_entry_id, i.sort_order
    FROM ar_credit_memo_items i
    LEFT JOIN inv_products p ON i.product_id = p.id AND p.company_id = p_cid
    WHERE i.credit_memo_id = p_memo_id AND i.company_id = p_cid
    ORDER BY i.sort_order, i.id;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_ar_cm_open_credits`;
delimiter ;;
CREATE PROCEDURE `sp_ar_cm_open_credits`(IN p_cid CHAR(36))
BEGIN
    SELECT c.customer_id, cu.name AS customer_name, COUNT(*) AS memo_count, SUM(c.balance_credit) AS open_credit
    FROM ar_credit_memos c
    LEFT JOIN ar_customers cu ON c.customer_id = cu.id AND cu.company_id = p_cid
    WHERE c.company_id = p_cid AND c.is_deleted = 0 AND c.status = 'Open' AND c.balance_credit > 0
    GROUP BY c.customer_id ORDER BY open_credit DESC;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_ar_cm_stats`;
delimiter ;;
CREATE PROCEDURE `sp_ar_cm_stats`(IN p_cid CHAR(36))
BEGIN
    SELECT
        (SELECT COUNT(*) FROM ar_credit_memos WHERE company_id = p_cid AND is_deleted = 0) AS total_memos,
        (SELECT COUNT(*) FROM ar_credit_memos WHERE company_id = p_cid AND is_deleted = 0 AND status = 'Draft') AS draft_memos,
        IFNULL((SELECT SUM(balance_credit) FROM ar_credit_memos WHERE company_id = p_cid AND is_deleted = 0 AND status = 'Open'),0) AS open_credit,
        IFNULL((SELECT SUM(total_amount) FROM ar_credit_memos WHERE company_id = p_cid AND is_deleted = 0 AND status <> 'Voided' AND memo_date >= DATE_FORMAT(CURDATE(),'%Y-%m-01')),0) AS credited_this_month;
END
;;
delimiter ;


-- ============================================================================
-- AP DEBIT MEMOS (buy-side mirror; returns goods to the vendor)
-- ============================================================================

DROP PROCEDURE IF EXISTS `sp_ap_dm_creditable`;
delimiter ;;
CREATE PROCEDURE `sp_ap_dm_creditable`(IN p_order_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT oi.id AS order_item_id, oi.product_id, p.name AS product_name, oi.description,
        oi.qty_billed, oi.qty_returned, (oi.qty_billed - oi.qty_returned) AS returnable_qty,
        oi.tax_rate, oi.expense_account_id, oi.warehouse_id,
        IFNULL(
            (SELECT SUM(ri.quantity*ri.unit_cost)/NULLIF(SUM(ri.quantity),0)
             FROM pur_receipt_items ri JOIN pur_receipts rc ON ri.receipt_id = rc.id AND rc.company_id = p_cid AND rc.status = 'Received'
             WHERE ri.order_item_id = oi.id AND ri.company_id = p_cid),
            ROUND(oi.unit_price*(1-IFNULL(oi.discount_pct,0)/100),2)
        ) AS unit_cost
    FROM pur_order_items oi
    JOIN pur_orders o ON oi.order_id = o.id AND o.company_id = p_cid
    LEFT JOIN inv_products p ON oi.product_id = p.id AND p.company_id = p_cid
    WHERE oi.order_id = p_order_id AND oi.company_id = p_cid AND (oi.qty_billed - oi.qty_returned) > 0
    ORDER BY oi.sort_order, oi.id;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_ap_dm_create`;
delimiter ;;
CREATE PROCEDURE `sp_ap_dm_create`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_order_id CHAR(36), IN p_bill_id CHAR(36), IN p_memo_date DATE, IN p_reason VARCHAR(500), IN p_warehouse_id CHAR(36), IN p_by CHAR(36))
BEGIN
    DECLARE v_num INT;
    DECLARE v_vendor CHAR(36);
    DECLARE v_wh CHAR(36);
    SELECT vendor_id, warehouse_id INTO v_vendor, v_wh FROM pur_orders WHERE id = p_order_id AND company_id = p_cid AND is_deleted = 0;
    IF v_vendor IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'purchase order not found'; END IF;
    IF p_bill_id IS NOT NULL AND p_bill_id <> '' AND NOT EXISTS (SELECT 1 FROM ap_bills WHERE id = p_bill_id AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'bill not found in company';
    END IF;
    CALL sp_ap_dm_next_number(p_cid, v_num);
    INSERT INTO ap_debit_memos (id, company_id, memo_number, vendor_id, order_id, bill_id, status, memo_date, reason, warehouse_id, created_by)
    VALUES (p_id, p_cid, v_num, v_vendor, p_order_id, NULLIF(p_bill_id,''), 'Draft', IFNULL(p_memo_date, CURDATE()), NULLIF(p_reason,''), IFNULL(NULLIF(p_warehouse_id,''), v_wh), p_by);
    SELECT v_num AS memo_number;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_ap_dm_add_item`;
delimiter ;;
CREATE PROCEDURE `sp_ap_dm_add_item`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_memo_id CHAR(36), IN p_order_item_id CHAR(36), IN p_desc VARCHAR(500), IN p_qty DECIMAL(15,2), IN p_unit_cost DECIMAL(15,2), IN p_tax_rate DECIMAL(5,2), IN p_sort INT)
BEGIN
    DECLARE v_pid CHAR(36);
    DECLARE v_exp CHAR(36);
    DECLARE v_wh CHAR(36);
    DECLARE v_avail DECIMAL(15,2);
    DECLARE v_order CHAR(36);
    IF NOT EXISTS (SELECT 1 FROM ap_debit_memos WHERE id = p_memo_id AND company_id = p_cid AND is_deleted = 0 AND status = 'Draft') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'debit memo not found or not editable';
    END IF;
    SELECT order_id INTO v_order FROM ap_debit_memos WHERE id = p_memo_id AND company_id = p_cid;
    SELECT oi.product_id, oi.expense_account_id, oi.warehouse_id, (oi.qty_billed - oi.qty_returned)
        INTO v_pid, v_exp, v_wh, v_avail
    FROM pur_order_items oi WHERE oi.id = p_order_item_id AND oi.company_id = p_cid AND oi.order_id = v_order;
    IF v_avail IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'order line not on this memo''s order'; END IF;
    IF p_qty <= 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'return quantity must be positive'; END IF;
    IF p_qty > v_avail THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'cannot debit more than was billed and not yet returned'; END IF;
    INSERT INTO ap_debit_memo_items (id, company_id, debit_memo_id, order_item_id, product_id, expense_account_id, description, quantity, unit_cost, amount, tax_rate, tax_amount, warehouse_id, sort_order)
    VALUES (p_id, p_cid, p_memo_id, p_order_item_id, v_pid, v_exp, NULLIF(p_desc,''), p_qty, IFNULL(p_unit_cost,0),
        ROUND(p_qty*IFNULL(p_unit_cost,0),2), IFNULL(p_tax_rate,0), ROUND(p_qty*IFNULL(p_unit_cost,0)*IFNULL(p_tax_rate,0)/100,2), v_wh, IFNULL(p_sort,0));
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_ap_dm_clear_items`;
delimiter ;;
CREATE PROCEDURE `sp_ap_dm_clear_items`(IN p_memo_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    IF NOT EXISTS (SELECT 1 FROM ap_debit_memos WHERE id = p_memo_id AND company_id = p_cid AND status = 'Draft') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'debit memo not editable';
    END IF;
    DELETE FROM ap_debit_memo_items WHERE debit_memo_id = p_memo_id AND company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_ap_dm_update_totals`;
delimiter ;;
CREATE PROCEDURE `sp_ap_dm_update_totals`(IN p_memo_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    UPDATE ap_debit_memo_items SET amount = ROUND(quantity*unit_cost,2), tax_amount = ROUND(quantity*unit_cost*IFNULL(tax_rate,0)/100,2)
    WHERE debit_memo_id = p_memo_id AND company_id = p_cid;
    UPDATE ap_debit_memos c SET
        subtotal = IFNULL((SELECT SUM(amount) FROM ap_debit_memo_items i WHERE i.debit_memo_id = c.id),0),
        tax_amount = IFNULL((SELECT SUM(tax_amount) FROM ap_debit_memo_items i WHERE i.debit_memo_id = c.id),0)
    WHERE c.id = p_memo_id AND c.company_id = p_cid;
    UPDATE ap_debit_memos SET total_amount = subtotal + tax_amount, balance_debit = subtotal + tax_amount
    WHERE id = p_memo_id AND company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_ap_dm_delete`;
delimiter ;;
CREATE PROCEDURE `sp_ap_dm_delete`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    UPDATE ap_debit_memos SET is_deleted = 1 WHERE id = p_id AND company_id = p_cid AND status = 'Draft';
END
;;
delimiter ;

-- Post: lock memo + order, re-check, bump qty_returned, ship goods back OUT (stock,
-- refuse-negative) at frozen receipt cost, set Open. Returns lines for Go GL.
DROP PROCEDURE IF EXISTS `sp_ap_dm_post`;
delimiter ;;
CREATE PROCEDURE `sp_ap_dm_post`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_by CHAR(36))
BEGIN
    DECLARE v_status VARCHAR(20);
    DECLARE v_order CHAR(36);
    DECLARE v_total DECIMAL(15,2);
    DECLARE v_items INT;
    DECLARE v_done INT DEFAULT 0;
    DECLARE v_iid CHAR(36);
    DECLARE v_oi CHAR(36);
    DECLARE v_pid CHAR(36);
    DECLARE v_qty DECIMAL(15,2);
    DECLARE v_cost DECIMAL(15,2);
    DECLARE v_exp CHAR(36);
    DECLARE v_wid CHAR(36);
    DECLARE v_owh CHAR(36);
    DECLARE v_avail DECIMAL(15,2);
    DECLARE v_bal DECIMAL(15,2);
    DECLARE v_mid CHAR(36);
    DECLARE cur CURSOR FOR
        SELECT id, order_item_id, product_id, quantity, unit_cost, expense_account_id, warehouse_id
        FROM ap_debit_memo_items WHERE debit_memo_id = p_id AND company_id = p_cid;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    START TRANSACTION;
    SELECT status, order_id, total_amount, (SELECT COUNT(*) FROM ap_debit_memo_items WHERE debit_memo_id = p_id)
        INTO v_status, v_order, v_total, v_items
    FROM ap_debit_memos WHERE id = p_id AND company_id = p_cid AND is_deleted = 0 FOR UPDATE;
    IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'debit memo not found'; END IF;
    IF v_status <> 'Draft' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'only a draft debit memo can be posted'; END IF;
    IF v_items = 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'debit memo has no lines'; END IF;
    IF v_total <= 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'debit memo total must be positive'; END IF;

    SELECT warehouse_id INTO v_owh FROM pur_orders WHERE id = v_order AND company_id = p_cid FOR UPDATE;

    DROP TEMPORARY TABLE IF EXISTS tmp_apdm_post;
    CREATE TEMPORARY TABLE tmp_apdm_post (item_id CHAR(36), product_id CHAR(36), quantity DECIMAL(15,2), unit_cost DECIMAL(15,2), expense_account_id CHAR(36), movement_id CHAR(36));

    OPEN cur;
    pl: LOOP
        FETCH cur INTO v_iid, v_oi, v_pid, v_qty, v_cost, v_exp, v_wid;
        IF v_done THEN LEAVE pl; END IF;
        SELECT (qty_billed - qty_returned) INTO v_avail FROM pur_order_items WHERE id = v_oi AND company_id = p_cid;
        IF v_avail IS NULL OR v_qty > v_avail THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'return exceeds billed-and-unreturned quantity'; END IF;
        UPDATE pur_order_items SET qty_returned = qty_returned + v_qty WHERE id = v_oi AND company_id = p_cid;

        SET v_mid = NULL;
        IF v_pid IS NOT NULL AND v_pid <> '' THEN
            SET v_wid = IFNULL(NULLIF(v_wid,''), v_owh);
            IF v_wid IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'no warehouse to return from'; END IF;
            INSERT INTO inv_stock (id, company_id, product_id, warehouse_id, quantity) VALUES (UUID(), p_cid, v_pid, v_wid, 0)
                ON DUPLICATE KEY UPDATE quantity = quantity;
            SELECT quantity INTO v_bal FROM inv_stock WHERE product_id = v_pid AND warehouse_id = v_wid FOR UPDATE;
            IF v_bal < v_qty THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'insufficient stock to return to vendor'; END IF;
            SET v_bal = v_bal - v_qty;
            SET v_mid = UUID();
            UPDATE inv_stock SET quantity = v_bal WHERE product_id = v_pid AND warehouse_id = v_wid;
            INSERT INTO inv_movements (id, company_id, product_id, warehouse_id, movement_type, quantity, unit_cost, reference, balance_after, created_by)
            VALUES (v_mid, p_cid, v_pid, v_wid, 'out', v_qty, v_cost, CONCAT('DM-', LPAD((SELECT memo_number FROM ap_debit_memos WHERE id = p_id), 6, '0')), v_bal, p_by);
            UPDATE ap_debit_memo_items SET movement_id = v_mid WHERE id = v_iid;
        END IF;
        INSERT INTO tmp_apdm_post VALUES (v_iid, v_pid, v_qty, v_cost, v_exp, v_mid);
    END LOOP;
    CLOSE cur;

    UPDATE ap_debit_memos SET status = 'Open', movements_posted = 1 WHERE id = p_id AND company_id = p_cid;
    COMMIT;
    SELECT item_id, product_id, quantity, unit_cost, expense_account_id, movement_id FROM tmp_apdm_post;
    DROP TEMPORARY TABLE IF EXISTS tmp_apdm_post;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_ap_dm_set_payable_journal`;
delimiter ;;
CREATE PROCEDURE `sp_ap_dm_set_payable_journal`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_jid CHAR(36))
BEGIN
    UPDATE ap_debit_memos SET payable_journal_id = p_jid WHERE id = p_id AND company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_ap_dm_set_line_journal`;
delimiter ;;
CREATE PROCEDURE `sp_ap_dm_set_line_journal`(IN p_item_id CHAR(36), IN p_cid CHAR(36), IN p_jid CHAR(36))
BEGIN
    UPDATE ap_debit_memo_items SET journal_entry_id = p_jid WHERE id = p_item_id AND company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_ap_dm_apply`;
delimiter ;;
CREATE PROCEDURE `sp_ap_dm_apply`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_bill_id CHAR(36), IN p_amount DECIMAL(15,2))
BEGIN
    DECLARE v_bal_debit DECIMAL(15,2);
    DECLARE v_status VARCHAR(20);
    DECLARE v_bill_status VARCHAR(20);
    DECLARE v_bill_bal DECIMAL(15,2);
    DECLARE v_memo_vendor CHAR(36);
    DECLARE v_bill_vendor CHAR(36);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
    START TRANSACTION;
    SELECT status, balance_debit, vendor_id INTO v_status, v_bal_debit, v_memo_vendor FROM ap_debit_memos WHERE id = p_id AND company_id = p_cid AND is_deleted = 0 FOR UPDATE;
    IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'debit memo not found'; END IF;
    IF v_status NOT IN ('Open') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'only an open debit memo can be applied'; END IF;
    IF p_amount <= 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'apply amount must be positive'; END IF;
    IF p_amount > v_bal_debit THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'application exceeds available debit'; END IF;
    SELECT status, balance_due, vendor_id INTO v_bill_status, v_bill_bal, v_bill_vendor FROM ap_bills WHERE id = p_bill_id AND company_id = p_cid AND is_deleted = 0 FOR UPDATE;
    IF v_bill_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'bill not found'; END IF;
    IF v_bill_vendor <> v_memo_vendor THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'bill belongs to a different vendor'; END IF;
    IF v_bill_status NOT IN ('Open','Partial') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'bill is not open for application'; END IF;
    IF p_amount > v_bill_bal THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'application exceeds bill balance'; END IF;

    INSERT INTO ap_debit_applications (id, company_id, debit_memo_id, bill_id, amount, applied_date) VALUES (UUID(), p_cid, p_id, p_bill_id, p_amount, CURDATE());
    UPDATE ap_bills SET amount_paid = amount_paid + p_amount, balance_due = balance_due - p_amount,
        status = CASE WHEN balance_due - p_amount <= 0 THEN 'Paid' ELSE 'Partial' END
    WHERE id = p_bill_id AND company_id = p_cid;
    UPDATE ap_debit_memos SET amount_applied = amount_applied + p_amount, balance_debit = balance_debit - p_amount,
        status = CASE WHEN balance_debit - p_amount <= 0 THEN 'Applied' ELSE 'Open' END
    WHERE id = p_id AND company_id = p_cid;
    COMMIT;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_ap_dm_refund`;
delimiter ;;
CREATE PROCEDURE `sp_ap_dm_refund`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_jid CHAR(36))
BEGIN
    DECLARE v_status VARCHAR(20);
    DECLARE v_bal DECIMAL(15,2);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
    START TRANSACTION;
    SELECT status, balance_debit INTO v_status, v_bal FROM ap_debit_memos WHERE id = p_id AND company_id = p_cid AND is_deleted = 0 FOR UPDATE;
    IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'debit memo not found'; END IF;
    IF v_status <> 'Open' OR v_bal <= 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'no open debit to refund'; END IF;
    UPDATE ap_debit_memos SET amount_refunded = amount_refunded + v_bal, balance_debit = 0, status = 'Refunded', refund_journal_id = NULLIF(p_jid,'')
    WHERE id = p_id AND company_id = p_cid AND status = 'Open';
    COMMIT;
    SELECT v_bal AS refunded_amount;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_ap_dm_void`;
delimiter ;;
CREATE PROCEDURE `sp_ap_dm_void`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_by CHAR(36))
BEGIN
    DECLARE v_status VARCHAR(20);
    DECLARE v_done INT DEFAULT 0;
    DECLARE v_oi CHAR(36);
    DECLARE v_pid CHAR(36);
    DECLARE v_qty DECIMAL(15,2);
    DECLARE v_cost DECIMAL(15,2);
    DECLARE v_wid CHAR(36);
    DECLARE v_mid CHAR(36);
    DECLARE v_bal DECIMAL(15,2);
    DECLARE v_newmid CHAR(36);
    DECLARE v_jid CHAR(36);
    DECLARE cur CURSOR FOR
        SELECT i.order_item_id, i.product_id, i.quantity, i.unit_cost, m.warehouse_id, i.movement_id, i.journal_entry_id
        FROM ap_debit_memo_items i
        LEFT JOIN inv_movements m ON i.movement_id = m.id
        WHERE i.debit_memo_id = p_id AND i.company_id = p_cid;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    START TRANSACTION;
    SELECT status INTO v_status FROM ap_debit_memos WHERE id = p_id AND company_id = p_cid AND is_deleted = 0 FOR UPDATE;
    IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'debit memo not found'; END IF;
    IF v_status = 'Voided' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'debit memo already voided'; END IF;
    IF v_status = 'Refunded' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'a refunded debit memo cannot be voided'; END IF;

    UPDATE ap_bills b
    JOIN (SELECT bill_id, SUM(amount) AS tot FROM ap_debit_applications WHERE debit_memo_id = p_id AND company_id = p_cid AND is_deleted = 0 GROUP BY bill_id) a ON a.bill_id = b.id
    SET b.amount_paid = b.amount_paid - a.tot, b.balance_due = b.balance_due + a.tot,
        b.status = CASE WHEN b.amount_paid - a.tot <= 0 THEN 'Open' ELSE 'Partial' END
    WHERE b.company_id = p_cid;
    UPDATE ap_debit_applications SET is_deleted = 1 WHERE debit_memo_id = p_id AND company_id = p_cid;

    DROP TEMPORARY TABLE IF EXISTS tmp_apdm_void;
    CREATE TEMPORARY TABLE tmp_apdm_void (movement_id CHAR(36), product_id CHAR(36), quantity DECIMAL(15,2), unit_cost DECIMAL(15,2), line_journal_id CHAR(36));

    OPEN cur;
    vl: LOOP
        FETCH cur INTO v_oi, v_pid, v_qty, v_cost, v_wid, v_mid, v_jid;
        IF v_done THEN LEAVE vl; END IF;
        UPDATE pur_order_items SET qty_returned = GREATEST(0, qty_returned - v_qty) WHERE id = v_oi AND company_id = p_cid;
        SET v_newmid = NULL;
        IF v_mid IS NOT NULL AND v_pid IS NOT NULL AND v_wid IS NOT NULL THEN
            -- reverse the vendor return: bring goods back IN
            INSERT INTO inv_stock (id, company_id, product_id, warehouse_id, quantity) VALUES (UUID(), p_cid, v_pid, v_wid, 0)
                ON DUPLICATE KEY UPDATE quantity = quantity;
            SELECT quantity INTO v_bal FROM inv_stock WHERE product_id = v_pid AND warehouse_id = v_wid FOR UPDATE;
            SET v_bal = v_bal + v_qty;
            SET v_newmid = UUID();
            UPDATE inv_stock SET quantity = v_bal WHERE product_id = v_pid AND warehouse_id = v_wid;
            INSERT INTO inv_movements (id, company_id, product_id, warehouse_id, movement_type, quantity, unit_cost, reference, balance_after, created_by)
            VALUES (v_newmid, p_cid, v_pid, v_wid, 'in', v_qty, v_cost, 'DM void', v_bal, p_by);
        END IF;
        INSERT INTO tmp_apdm_void VALUES (v_newmid, v_pid, v_qty, v_cost, v_jid);
    END LOOP;
    CLOSE cur;

    UPDATE ap_debit_memos SET status = 'Voided', balance_debit = 0 WHERE id = p_id AND company_id = p_cid;
    COMMIT;
    SELECT movement_id, product_id, quantity, unit_cost, line_journal_id FROM tmp_apdm_void;
    DROP TEMPORARY TABLE IF EXISTS tmp_apdm_void;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_ap_dm_list`;
delimiter ;;
CREATE PROCEDURE `sp_ap_dm_list`(IN p_cid CHAR(36), IN p_status VARCHAR(20))
BEGIN
    SELECT c.id, c.company_id, c.memo_number, c.vendor_id, v.name AS vendor_name, c.order_id, o.po_number,
        c.bill_id, c.status, c.memo_date, c.reason, c.subtotal, c.tax_amount, c.total_amount,
        c.amount_applied, c.amount_refunded, c.balance_debit, c.warehouse_id, c.created_at, c.updated_at,
        (SELECT COUNT(*) FROM ap_debit_memo_items i WHERE i.debit_memo_id = c.id) AS item_count
    FROM ap_debit_memos c
    LEFT JOIN ap_vendors v ON c.vendor_id = v.id AND v.company_id = p_cid
    LEFT JOIN pur_orders o ON c.order_id = o.id AND o.company_id = p_cid
    WHERE c.company_id = p_cid AND c.is_deleted = 0 AND (p_status = '' OR c.status = p_status)
    ORDER BY c.memo_number DESC;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_ap_dm_get`;
delimiter ;;
CREATE PROCEDURE `sp_ap_dm_get`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT c.id, c.company_id, c.memo_number, c.vendor_id, v.name AS vendor_name, c.order_id, o.po_number,
        c.bill_id, c.status, c.memo_date, c.reason, c.subtotal, c.tax_amount, c.total_amount,
        c.amount_applied, c.amount_refunded, c.balance_debit, c.warehouse_id, c.created_at, c.updated_at,
        (SELECT COUNT(*) FROM ap_debit_memo_items i WHERE i.debit_memo_id = c.id) AS item_count
    FROM ap_debit_memos c
    LEFT JOIN ap_vendors v ON c.vendor_id = v.id AND v.company_id = p_cid
    LEFT JOIN pur_orders o ON c.order_id = o.id AND o.company_id = p_cid
    WHERE c.id = p_id AND c.company_id = p_cid AND c.is_deleted = 0;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_ap_dm_get_items`;
delimiter ;;
CREATE PROCEDURE `sp_ap_dm_get_items`(IN p_memo_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT i.id, i.company_id, i.debit_memo_id, i.order_item_id, i.product_id, p.name AS product_name,
        i.description, i.quantity, i.unit_cost, i.amount, i.tax_rate, i.tax_amount, i.expense_account_id,
        i.warehouse_id, i.movement_id, i.journal_entry_id, i.sort_order
    FROM ap_debit_memo_items i
    LEFT JOIN inv_products p ON i.product_id = p.id AND p.company_id = p_cid
    WHERE i.debit_memo_id = p_memo_id AND i.company_id = p_cid
    ORDER BY i.sort_order, i.id;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_ap_dm_open_credits`;
delimiter ;;
CREATE PROCEDURE `sp_ap_dm_open_credits`(IN p_cid CHAR(36))
BEGIN
    SELECT c.vendor_id, v.name AS vendor_name, COUNT(*) AS memo_count, SUM(c.balance_debit) AS open_debit
    FROM ap_debit_memos c
    LEFT JOIN ap_vendors v ON c.vendor_id = v.id AND v.company_id = p_cid
    WHERE c.company_id = p_cid AND c.is_deleted = 0 AND c.status = 'Open' AND c.balance_debit > 0
    GROUP BY c.vendor_id ORDER BY open_debit DESC;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_ap_dm_stats`;
delimiter ;;
CREATE PROCEDURE `sp_ap_dm_stats`(IN p_cid CHAR(36))
BEGIN
    SELECT
        (SELECT COUNT(*) FROM ap_debit_memos WHERE company_id = p_cid AND is_deleted = 0) AS total_memos,
        (SELECT COUNT(*) FROM ap_debit_memos WHERE company_id = p_cid AND is_deleted = 0 AND status = 'Draft') AS draft_memos,
        IFNULL((SELECT SUM(balance_debit) FROM ap_debit_memos WHERE company_id = p_cid AND is_deleted = 0 AND status = 'Open'),0) AS open_debit,
        IFNULL((SELECT SUM(total_amount) FROM ap_debit_memos WHERE company_id = p_cid AND is_deleted = 0 AND status <> 'Voided' AND memo_date >= DATE_FORMAT(CURDATE(),'%Y-%m-01')),0) AS debited_this_month;
END
;;
delimiter ;
