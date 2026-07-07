-- ============================================================================
-- Migration 013: Procurement / Purchase-to-Pay (procure-to-pay) module
--
--   The buy-side mirror of the Sales module (012). Reuses AP (ap_vendors,
--   ap_bills) and Inventory (inv_products, inv_stock, inv_movements, inv_warehouses)
--   rather than duplicating them. Company-scoped for tenant isolation (every SP
--   keys on p_cid, matching migrations 003-012). GL entries are built in the Go
--   layer (postPurJournal), because — exactly like AR — the AP module posts NO GL
--   of its own. Procurement therefore owns the payable + inventory-receipt GL.
--
--   PROCURE-TO-PAY GL MAP (GR/IR three-way match — no double-post):
--     * GOODS RECEIPT (source_type "procurement"): sp_pur_receive increments
--       inv_stock + writes the inv_movements 'in' row atomically (valued at the PO
--       net unit price), then Go posts:
--           Dr Inventory (stock lines) / Dr Expense (non-stock lines)
--           Cr GR/IR clearing
--       once per receipt, guarded by pur_receipts.journal_entry_id.
--     * VENDOR BILL (3-way match): billable qty is capped at qty_received
--       (sp_pur_get_billable returns qty_received - qty_billed). The bill is
--       created in the AP subledger (ap_bills, via the Go AP repo) AND Go posts:
--           Dr GR/IR clearing (net goods) / Dr Input Tax (tax)
--           Cr Accounts Payable
--       once per bill. GR/IR nets to zero when the received qty is fully billed.
--
--   The existing lightweight Inventory PO (inv_purchase_orders) is left intact
--   for simple warehouse restock; this module is the controlled P2P flow with a
--   real vendor (ap_vendors), approval workflow, partial receipts, and AP billing.
--
--   Discounts are NET-BOOKED via per-line discount_pct (qty-invariant so partial
--   receipt/billing sums exactly); there is no separate contra line. Tax is
--   recognised as Input Tax at BILL time only (never at receipt).
--
--   Every order-mutating SP locks the pur_orders header FOR UPDATE first, which
--   serializes approve / receive / bill / cancel for one order.
--
--   Apply BEFORE/with the matching server build (privileged MySQL user):
--     mysql -u root -p lettersheets < server/migrations/013_procurement_module.sql
-- ============================================================================


-- ---------- Tables ----------

CREATE TABLE IF NOT EXISTS `pur_requisition_sequences` (`company_id` char(36) NOT NULL, `next_number` int DEFAULT '1', PRIMARY KEY (`company_id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS `pur_order_sequences`       (`company_id` char(36) NOT NULL, `next_number` int DEFAULT '1', PRIMARY KEY (`company_id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS `pur_receipt_sequences`     (`company_id` char(36) NOT NULL, `next_number` int DEFAULT '1', PRIMARY KEY (`company_id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `pur_settings` (
  `company_id`             char(36)   NOT NULL,
  `auto_post_gl`           tinyint(1) DEFAULT '0',
  `inventory_account_id`   char(36)   DEFAULT NULL,
  `expense_account_id`     char(36)   DEFAULT NULL,
  `gr_ir_account_id`       char(36)   DEFAULT NULL,
  `ap_account_id`          char(36)   DEFAULT NULL,
  `tax_input_account_id`   char(36)   DEFAULT NULL,
  `default_warehouse_id`   char(36)   DEFAULT NULL,
  `default_payment_terms`  int        DEFAULT '30',
  `requisition_approval`   tinyint(1) DEFAULT '1',
  `po_approval`            tinyint(1) DEFAULT '1',
  `updated_at`             timestamp  NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`company_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `pur_requisitions` (
  `id`                 char(36)      NOT NULL DEFAULT (uuid()),
  `company_id`         char(36)      NOT NULL,
  `requisition_number` int           NOT NULL,
  `title`              varchar(200)  DEFAULT NULL,
  `department`         varchar(120)  DEFAULT NULL,
  `status`             varchar(20)   NOT NULL DEFAULT 'Draft',
  `needed_by`          date          DEFAULT NULL,
  `estimated_total`    decimal(15,2) DEFAULT '0.00',
  `notes`              varchar(500)  DEFAULT NULL,
  `converted_po_id`    char(36)      DEFAULT NULL,
  `reject_reason`      varchar(500)  DEFAULT NULL,
  `approved_by`        char(36)      DEFAULT NULL,
  `approved_at`        timestamp     NULL DEFAULT NULL,
  `created_by`         char(36)      DEFAULT NULL,
  `is_deleted`         tinyint(1)    DEFAULT '0',
  `created_at`         timestamp     NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         timestamp     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_purreq_num` (`company_id`,`requisition_number`),
  KEY `idx_purreq` (`company_id`,`is_deleted`),
  KEY `idx_purreq_status` (`company_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `pur_requisition_items` (
  `id`              char(36)      NOT NULL DEFAULT (uuid()),
  `company_id`      char(36)      NOT NULL,
  `requisition_id`  char(36)      NOT NULL,
  `product_id`      char(36)      DEFAULT NULL,
  `description`     varchar(500)  DEFAULT NULL,
  `quantity`        decimal(15,2) NOT NULL DEFAULT '0.00',
  `estimated_price` decimal(15,2) DEFAULT '0.00',
  `line_total`      decimal(15,2) DEFAULT '0.00',
  `sort_order`      int           DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_purreqitem` (`requisition_id`),
  KEY `idx_purreqitem_prod` (`company_id`,`product_id`),
  CONSTRAINT `pur_requisition_items_ibfk_1` FOREIGN KEY (`requisition_id`) REFERENCES `pur_requisitions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `pur_orders` (
  `id`             char(36)      NOT NULL DEFAULT (uuid()),
  `company_id`     char(36)      NOT NULL,
  `po_number`      int           NOT NULL,
  `vendor_id`      char(36)      NOT NULL,
  `requisition_id` char(36)      DEFAULT NULL,
  `warehouse_id`   char(36)      DEFAULT NULL,
  `status`         varchar(20)   NOT NULL DEFAULT 'Draft',
  `order_date`     date          DEFAULT NULL,
  `expected_date`  date          DEFAULT NULL,
  `subtotal`       decimal(15,2) DEFAULT '0.00',
  `tax_amount`     decimal(15,2) DEFAULT '0.00',
  `total_amount`   decimal(15,2) DEFAULT '0.00',
  `notes`          varchar(500)  DEFAULT NULL,
  `bill_seq`       int           DEFAULT '0',
  `approved_by`    char(36)      DEFAULT NULL,
  `approved_at`    timestamp     NULL DEFAULT NULL,
  `created_by`     char(36)      DEFAULT NULL,
  `is_deleted`     tinyint(1)    DEFAULT '0',
  `created_at`     timestamp     NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     timestamp     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_purorder_num` (`company_id`,`po_number`),
  KEY `idx_purorder` (`company_id`,`is_deleted`),
  KEY `idx_purorder_status` (`company_id`,`status`),
  KEY `idx_purorder_vendor` (`vendor_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `pur_order_items` (
  `id`                 char(36)      NOT NULL DEFAULT (uuid()),
  `company_id`         char(36)      NOT NULL,
  `order_id`           char(36)      NOT NULL,
  `product_id`         char(36)      DEFAULT NULL,
  `description`        varchar(500)  DEFAULT NULL,
  `quantity`           decimal(15,2) NOT NULL DEFAULT '0.00',
  `unit_price`         decimal(15,2) DEFAULT '0.00',
  `discount_pct`       decimal(5,2)  DEFAULT '0.00',
  `tax_rate`           decimal(5,2)  DEFAULT '0.00',
  `qty_received`       decimal(15,2) NOT NULL DEFAULT '0.00',
  `qty_billed`         decimal(15,2) NOT NULL DEFAULT '0.00',
  `line_total`         decimal(15,2) DEFAULT '0.00',
  `warehouse_id`       char(36)      DEFAULT NULL,
  `expense_account_id` char(36)      DEFAULT NULL,
  `sort_order`         int           DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_puritem` (`order_id`),
  KEY `idx_puritem_prod` (`company_id`,`product_id`),
  CONSTRAINT `pur_order_items_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `pur_orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `pur_receipts` (
  `id`               char(36)     NOT NULL DEFAULT (uuid()),
  `company_id`       char(36)     NOT NULL,
  `receipt_number`   int          NOT NULL,
  `order_id`         char(36)     NOT NULL,
  `warehouse_id`     char(36)     DEFAULT NULL,
  `status`           varchar(20)  NOT NULL DEFAULT 'Received',
  `receipt_date`     date         DEFAULT NULL,
  `notes`            varchar(500) DEFAULT NULL,
  `journal_entry_id` char(36)     DEFAULT NULL,
  `created_by`       char(36)     DEFAULT NULL,
  `is_deleted`       tinyint(1)   DEFAULT '0',
  `created_at`       timestamp    NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       timestamp    NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_purrcpt_num` (`company_id`,`receipt_number`),
  KEY `idx_purrcpt` (`company_id`,`is_deleted`),
  KEY `idx_purrcpt_order` (`order_id`),
  KEY `idx_purrcpt_status` (`company_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `pur_receipt_items` (
  `id`            char(36)      NOT NULL DEFAULT (uuid()),
  `company_id`    char(36)      NOT NULL,
  `receipt_id`    char(36)      NOT NULL,
  `order_item_id` char(36)      NOT NULL,
  `product_id`    char(36)      DEFAULT NULL,
  `quantity`      decimal(15,2) NOT NULL DEFAULT '0.00',
  `unit_cost`     decimal(15,2) DEFAULT '0.00',
  `movement_id`   char(36)      DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_purrcptitem` (`receipt_id`),
  KEY `idx_purrcptitem_oi` (`order_item_id`),
  CONSTRAINT `pur_receipt_items_ibfk_1` FOREIGN KEY (`receipt_id`) REFERENCES `pur_receipts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `pur_order_bills` (
  `id`               char(36)  NOT NULL DEFAULT (uuid()),
  `company_id`       char(36)  NOT NULL,
  `order_id`         char(36)  NOT NULL,
  `bill_id`          char(36)  NOT NULL,
  `journal_entry_id` char(36)  DEFAULT NULL,
  `created_at`       timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_purbill_order` (`order_id`),
  KEY `idx_purbill_bill` (`bill_id`),
  CONSTRAINT `pur_order_bills_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `pur_orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- ---------- Helpers ----------

DROP PROCEDURE IF EXISTS `sp_pur_assert_account`;
delimiter ;;
CREATE PROCEDURE `sp_pur_assert_account`(IN p_acct CHAR(36), IN p_cid CHAR(36))
BEGIN
    IF p_acct IS NOT NULL AND p_acct <> '' AND NOT EXISTS
        (SELECT 1 FROM acc_accounts WHERE id = p_acct AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'GL account not found in company';
    END IF;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_pur_next_requisition_number`;
delimiter ;;
CREATE PROCEDURE `sp_pur_next_requisition_number`(IN p_cid CHAR(36), OUT p_num INT)
BEGIN
    INSERT INTO pur_requisition_sequences (company_id, next_number) VALUES (p_cid, 2)
        ON DUPLICATE KEY UPDATE next_number = next_number + 1;
    SELECT CASE WHEN next_number > 1 THEN next_number - 1 ELSE 1 END INTO p_num FROM pur_requisition_sequences WHERE company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_pur_next_order_number`;
delimiter ;;
CREATE PROCEDURE `sp_pur_next_order_number`(IN p_cid CHAR(36), OUT p_num INT)
BEGIN
    INSERT INTO pur_order_sequences (company_id, next_number) VALUES (p_cid, 2)
        ON DUPLICATE KEY UPDATE next_number = next_number + 1;
    SELECT CASE WHEN next_number > 1 THEN next_number - 1 ELSE 1 END INTO p_num FROM pur_order_sequences WHERE company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_pur_next_receipt_number`;
delimiter ;;
CREATE PROCEDURE `sp_pur_next_receipt_number`(IN p_cid CHAR(36), OUT p_num INT)
BEGIN
    INSERT INTO pur_receipt_sequences (company_id, next_number) VALUES (p_cid, 2)
        ON DUPLICATE KEY UPDATE next_number = next_number + 1;
    SELECT CASE WHEN next_number > 1 THEN next_number - 1 ELSE 1 END INTO p_num FROM pur_receipt_sequences WHERE company_id = p_cid;
END
;;
delimiter ;


-- ---------- Settings ----------

DROP PROCEDURE IF EXISTS `sp_pur_get_settings`;
delimiter ;;
CREATE PROCEDURE `sp_pur_get_settings`(IN p_cid CHAR(36))
BEGIN
    SELECT company_id, auto_post_gl, inventory_account_id, expense_account_id, gr_ir_account_id,
        ap_account_id, tax_input_account_id, default_warehouse_id, default_payment_terms,
        requisition_approval, po_approval
    FROM pur_settings WHERE company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_pur_upsert_settings`;
delimiter ;;
CREATE PROCEDURE `sp_pur_upsert_settings`(IN p_cid CHAR(36), IN p_auto_post TINYINT, IN p_inv CHAR(36), IN p_exp CHAR(36), IN p_grir CHAR(36), IN p_ap CHAR(36), IN p_tax CHAR(36), IN p_wh CHAR(36), IN p_terms INT, IN p_req_appr TINYINT, IN p_po_appr TINYINT)
BEGIN
    CALL sp_pur_assert_account(p_inv, p_cid);
    CALL sp_pur_assert_account(p_exp, p_cid);
    CALL sp_pur_assert_account(p_grir, p_cid);
    CALL sp_pur_assert_account(p_ap, p_cid);
    CALL sp_pur_assert_account(p_tax, p_cid);
    IF p_wh IS NOT NULL AND p_wh <> '' AND NOT EXISTS (SELECT 1 FROM inv_warehouses WHERE id = p_wh AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'default warehouse not in company';
    END IF;
    IF p_auto_post = 1 AND (p_grir = '' OR p_grir IS NULL OR p_ap = '' OR p_ap IS NULL OR p_inv = '' OR p_inv IS NULL) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Inventory, GR/IR clearing and Accounts Payable accounts are required to enable auto-post';
    END IF;
    INSERT INTO pur_settings (company_id, auto_post_gl, inventory_account_id, expense_account_id, gr_ir_account_id, ap_account_id, tax_input_account_id, default_warehouse_id, default_payment_terms, requisition_approval, po_approval)
    VALUES (p_cid, IFNULL(p_auto_post,0), NULLIF(p_inv,''), NULLIF(p_exp,''), NULLIF(p_grir,''), NULLIF(p_ap,''), NULLIF(p_tax,''), NULLIF(p_wh,''), IFNULL(p_terms,30), IFNULL(p_req_appr,1), IFNULL(p_po_appr,1))
    ON DUPLICATE KEY UPDATE
        auto_post_gl = IFNULL(p_auto_post,0), inventory_account_id = NULLIF(p_inv,''), expense_account_id = NULLIF(p_exp,''),
        gr_ir_account_id = NULLIF(p_grir,''), ap_account_id = NULLIF(p_ap,''), tax_input_account_id = NULLIF(p_tax,''),
        default_warehouse_id = NULLIF(p_wh,''), default_payment_terms = IFNULL(p_terms,30),
        requisition_approval = IFNULL(p_req_appr,1), po_approval = IFNULL(p_po_appr,1);
END
;;
delimiter ;


-- ---------- Requisitions ----------

DROP PROCEDURE IF EXISTS `sp_pur_get_requisitions`;
delimiter ;;
CREATE PROCEDURE `sp_pur_get_requisitions`(IN p_cid CHAR(36), IN p_status VARCHAR(20))
BEGIN
    SELECT r.id, r.company_id, r.requisition_number, r.title, r.department, r.status, r.needed_by,
        r.estimated_total, r.notes, r.converted_po_id, r.reject_reason, r.created_by, r.created_at, r.updated_at,
        (SELECT COUNT(*) FROM pur_requisition_items i WHERE i.requisition_id = r.id) AS item_count
    FROM pur_requisitions r
    WHERE r.company_id = p_cid AND r.is_deleted = 0 AND (p_status = '' OR r.status = p_status)
    ORDER BY r.requisition_number DESC;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_pur_get_requisition`;
delimiter ;;
CREATE PROCEDURE `sp_pur_get_requisition`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT r.id, r.company_id, r.requisition_number, r.title, r.department, r.status, r.needed_by,
        r.estimated_total, r.notes, r.converted_po_id, r.reject_reason, r.created_by, r.created_at, r.updated_at,
        (SELECT COUNT(*) FROM pur_requisition_items i WHERE i.requisition_id = r.id) AS item_count
    FROM pur_requisitions r
    WHERE r.id = p_id AND r.company_id = p_cid AND r.is_deleted = 0;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_pur_get_requisition_items`;
delimiter ;;
CREATE PROCEDURE `sp_pur_get_requisition_items`(IN p_rid CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT i.id, i.company_id, i.requisition_id, i.product_id, p.name AS product_name, p.sku AS product_sku,
        i.description, i.quantity, i.estimated_price, i.line_total, i.sort_order
    FROM pur_requisition_items i
    JOIN pur_requisitions r ON i.requisition_id = r.id AND r.company_id = p_cid
    LEFT JOIN inv_products p ON i.product_id = p.id AND p.company_id = p_cid
    WHERE i.requisition_id = p_rid AND i.company_id = p_cid
    ORDER BY i.sort_order, i.id;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_pur_create_requisition`;
delimiter ;;
CREATE PROCEDURE `sp_pur_create_requisition`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_title VARCHAR(200), IN p_dept VARCHAR(120), IN p_needed_by DATE, IN p_notes VARCHAR(500), IN p_by CHAR(36))
BEGIN
    DECLARE v_num INT;
    CALL sp_pur_next_requisition_number(p_cid, v_num);
    INSERT INTO pur_requisitions (id, company_id, requisition_number, title, department, status, needed_by, notes, created_by)
    VALUES (p_id, p_cid, v_num, NULLIF(p_title,''), NULLIF(p_dept,''), 'Draft', p_needed_by, NULLIF(p_notes,''), p_by);
    SELECT v_num AS requisition_number;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_pur_add_requisition_item`;
delimiter ;;
CREATE PROCEDURE `sp_pur_add_requisition_item`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_rid CHAR(36), IN p_product_id CHAR(36), IN p_desc VARCHAR(500), IN p_qty DECIMAL(15,2), IN p_est_price DECIMAL(15,2), IN p_sort INT)
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pur_requisitions WHERE id = p_rid AND company_id = p_cid AND is_deleted = 0 AND status = 'Draft') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'requisition not found or not editable';
    END IF;
    IF p_product_id IS NOT NULL AND p_product_id <> '' AND NOT EXISTS (SELECT 1 FROM inv_products WHERE id = p_product_id AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'product not found in company';
    END IF;
    INSERT INTO pur_requisition_items (id, company_id, requisition_id, product_id, description, quantity, estimated_price, line_total, sort_order)
    VALUES (p_id, p_cid, p_rid, NULLIF(p_product_id,''), NULLIF(p_desc,''), IFNULL(p_qty,0), IFNULL(p_est_price,0),
        ROUND(IFNULL(p_qty,0)*IFNULL(p_est_price,0),2), IFNULL(p_sort,0));
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_pur_clear_requisition_items`;
delimiter ;;
CREATE PROCEDURE `sp_pur_clear_requisition_items`(IN p_rid CHAR(36), IN p_cid CHAR(36))
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pur_requisitions WHERE id = p_rid AND company_id = p_cid AND status = 'Draft') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'requisition not editable';
    END IF;
    DELETE FROM pur_requisition_items WHERE requisition_id = p_rid AND company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_pur_update_requisition`;
delimiter ;;
CREATE PROCEDURE `sp_pur_update_requisition`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_title VARCHAR(200), IN p_dept VARCHAR(120), IN p_needed_by DATE, IN p_notes VARCHAR(500))
BEGIN
    UPDATE pur_requisitions SET title = NULLIF(p_title,''), department = NULLIF(p_dept,''), needed_by = p_needed_by, notes = NULLIF(p_notes,'')
    WHERE id = p_id AND company_id = p_cid AND status = 'Draft';
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_pur_update_requisition_totals`;
delimiter ;;
CREATE PROCEDURE `sp_pur_update_requisition_totals`(IN p_rid CHAR(36), IN p_cid CHAR(36))
BEGIN
    UPDATE pur_requisition_items SET line_total = ROUND(quantity*estimated_price,2)
    WHERE requisition_id = p_rid AND company_id = p_cid;
    UPDATE pur_requisitions r SET
        estimated_total = IFNULL((SELECT SUM(ROUND(i.quantity*i.estimated_price,2)) FROM pur_requisition_items i WHERE i.requisition_id = r.id),0)
    WHERE r.id = p_rid AND r.company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_pur_submit_requisition`;
delimiter ;;
CREATE PROCEDURE `sp_pur_submit_requisition`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    DECLARE v_cur VARCHAR(20);
    DECLARE v_items INT;
    SELECT status, (SELECT COUNT(*) FROM pur_requisition_items WHERE requisition_id = p_id) INTO v_cur, v_items
    FROM pur_requisitions WHERE id = p_id AND company_id = p_cid AND is_deleted = 0;
    IF v_cur IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'requisition not found'; END IF;
    IF v_cur <> 'Draft' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'only a draft requisition can be submitted'; END IF;
    IF v_items = 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'requisition needs at least one line'; END IF;
    UPDATE pur_requisitions SET status = 'Submitted' WHERE id = p_id AND company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_pur_approve_requisition`;
delimiter ;;
CREATE PROCEDURE `sp_pur_approve_requisition`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_by CHAR(36))
BEGIN
    DECLARE v_cur VARCHAR(20);
    SELECT status INTO v_cur FROM pur_requisitions WHERE id = p_id AND company_id = p_cid AND is_deleted = 0;
    IF v_cur IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'requisition not found'; END IF;
    IF v_cur NOT IN ('Submitted','Draft') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'only a submitted requisition can be approved'; END IF;
    UPDATE pur_requisitions SET status = 'Approved', approved_by = p_by, approved_at = CURRENT_TIMESTAMP, reject_reason = NULL
    WHERE id = p_id AND company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_pur_reject_requisition`;
delimiter ;;
CREATE PROCEDURE `sp_pur_reject_requisition`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_by CHAR(36), IN p_reason VARCHAR(500))
BEGIN
    DECLARE v_cur VARCHAR(20);
    SELECT status INTO v_cur FROM pur_requisitions WHERE id = p_id AND company_id = p_cid AND is_deleted = 0;
    IF v_cur IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'requisition not found'; END IF;
    IF v_cur NOT IN ('Submitted','Draft') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'only a submitted requisition can be rejected'; END IF;
    UPDATE pur_requisitions SET status = 'Rejected', approved_by = p_by, reject_reason = NULLIF(p_reason,'')
    WHERE id = p_id AND company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_pur_delete_requisition`;
delimiter ;;
CREATE PROCEDURE `sp_pur_delete_requisition`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    UPDATE pur_requisitions SET is_deleted = 1 WHERE id = p_id AND company_id = p_cid AND status IN ('Draft','Submitted','Rejected');
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_pur_convert_requisition`;
delimiter ;;
CREATE PROCEDURE `sp_pur_convert_requisition`(IN p_new_order_id CHAR(36), IN p_cid CHAR(36), IN p_rid CHAR(36), IN p_vendor_id CHAR(36), IN p_by CHAR(36))
BEGIN
    DECLARE v_status VARCHAR(20);
    DECLARE v_notes VARCHAR(500);
    DECLARE v_wh CHAR(36);
    DECLARE v_num INT;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    START TRANSACTION;

    SELECT status, notes INTO v_status, v_notes
    FROM pur_requisitions WHERE id = p_rid AND company_id = p_cid AND is_deleted = 0 FOR UPDATE;
    IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'requisition not found'; END IF;
    IF v_status = 'Converted' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'requisition already converted'; END IF;
    IF v_status <> 'Approved' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'only an approved requisition can be converted'; END IF;
    IF NOT EXISTS (SELECT 1 FROM ap_vendors WHERE id = p_vendor_id AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'vendor not found in company';
    END IF;

    SELECT default_warehouse_id INTO v_wh FROM pur_settings WHERE company_id = p_cid;
    IF v_wh IS NOT NULL AND NOT EXISTS (SELECT 1 FROM inv_warehouses WHERE id = v_wh AND company_id = p_cid AND is_deleted = 0) THEN
        SET v_wh = NULL;
    END IF;

    CALL sp_pur_next_order_number(p_cid, v_num);
    INSERT INTO pur_orders (id, company_id, po_number, vendor_id, requisition_id, warehouse_id, status, order_date, notes, created_by)
    VALUES (p_new_order_id, p_cid, v_num, p_vendor_id, p_rid, v_wh, 'Draft', CURDATE(), v_notes, p_by);

    INSERT INTO pur_order_items (id, company_id, order_id, product_id, description, quantity, unit_price, warehouse_id, sort_order)
    SELECT UUID(), p_cid, p_new_order_id, ri.product_id, ri.description, ri.quantity, ri.estimated_price, v_wh, ri.sort_order
    FROM pur_requisition_items ri
    WHERE ri.requisition_id = p_rid AND ri.company_id = p_cid
      AND (ri.product_id IS NULL OR EXISTS (SELECT 1 FROM inv_products WHERE id = ri.product_id AND company_id = p_cid AND is_deleted = 0));

    UPDATE pur_requisitions SET status = 'Converted', converted_po_id = p_new_order_id WHERE id = p_rid AND company_id = p_cid;
    CALL sp_pur_update_order_totals(p_new_order_id, p_cid);

    COMMIT;
    SELECT v_num AS po_number;
END
;;
delimiter ;


-- ---------- Orders ----------

DROP PROCEDURE IF EXISTS `sp_pur_get_orders`;
delimiter ;;
CREATE PROCEDURE `sp_pur_get_orders`(IN p_cid CHAR(36), IN p_status VARCHAR(20), IN p_vendor CHAR(36))
BEGIN
    SELECT o.id, o.company_id, o.po_number, o.vendor_id, v.name AS vendor_name, o.requisition_id, o.warehouse_id,
        w.name AS warehouse_name, o.status, o.order_date, o.expected_date, o.subtotal, o.tax_amount, o.total_amount,
        o.notes, o.bill_seq, o.created_at, o.updated_at,
        (SELECT COUNT(*) FROM pur_order_items i WHERE i.order_id = o.id) AS item_count
    FROM pur_orders o
    LEFT JOIN ap_vendors v ON o.vendor_id = v.id AND v.company_id = p_cid
    LEFT JOIN inv_warehouses w ON o.warehouse_id = w.id AND w.company_id = p_cid
    WHERE o.company_id = p_cid AND o.is_deleted = 0 AND (p_status = '' OR o.status = p_status) AND (p_vendor = '' OR o.vendor_id = p_vendor)
    ORDER BY o.po_number DESC;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_pur_get_order`;
delimiter ;;
CREATE PROCEDURE `sp_pur_get_order`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT o.id, o.company_id, o.po_number, o.vendor_id, v.name AS vendor_name, o.requisition_id, o.warehouse_id,
        w.name AS warehouse_name, o.status, o.order_date, o.expected_date, o.subtotal, o.tax_amount, o.total_amount,
        o.notes, o.bill_seq, o.created_at, o.updated_at,
        (SELECT COUNT(*) FROM pur_order_items i WHERE i.order_id = o.id) AS item_count
    FROM pur_orders o
    LEFT JOIN ap_vendors v ON o.vendor_id = v.id AND v.company_id = p_cid
    LEFT JOIN inv_warehouses w ON o.warehouse_id = w.id AND w.company_id = p_cid
    WHERE o.id = p_id AND o.company_id = p_cid AND o.is_deleted = 0;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_pur_get_order_items`;
delimiter ;;
CREATE PROCEDURE `sp_pur_get_order_items`(IN p_oid CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT oi.id, oi.company_id, oi.order_id, oi.product_id, p.name AS product_name, p.sku AS product_sku,
        oi.description, oi.quantity, oi.unit_price, oi.discount_pct, oi.tax_rate,
        oi.qty_received, oi.qty_billed,
        (oi.quantity - oi.qty_received) AS qty_outstanding,
        (oi.qty_received - oi.qty_billed) AS qty_billable,
        oi.line_total, oi.warehouse_id, w.name AS warehouse_name, oi.expense_account_id, oi.sort_order
    FROM pur_order_items oi
    JOIN pur_orders o ON oi.order_id = o.id AND o.company_id = p_cid
    LEFT JOIN inv_products p ON oi.product_id = p.id AND p.company_id = p_cid
    LEFT JOIN inv_warehouses w ON oi.warehouse_id = w.id AND w.company_id = p_cid
    WHERE oi.order_id = p_oid AND oi.company_id = p_cid
    ORDER BY oi.sort_order, oi.id;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_pur_create_order`;
delimiter ;;
CREATE PROCEDURE `sp_pur_create_order`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_vendor_id CHAR(36), IN p_order_date DATE, IN p_expected DATE, IN p_warehouse_id CHAR(36), IN p_notes VARCHAR(500), IN p_by CHAR(36))
BEGIN
    DECLARE v_num INT;
    DECLARE v_wh CHAR(36);
    IF NOT EXISTS (SELECT 1 FROM ap_vendors WHERE id = p_vendor_id AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'vendor not found in company';
    END IF;
    SET v_wh = NULLIF(p_warehouse_id, '');
    IF v_wh IS NULL THEN SELECT default_warehouse_id INTO v_wh FROM pur_settings WHERE company_id = p_cid; END IF;
    IF v_wh IS NOT NULL AND NOT EXISTS (SELECT 1 FROM inv_warehouses WHERE id = v_wh AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'warehouse not found in company';
    END IF;
    CALL sp_pur_next_order_number(p_cid, v_num);
    INSERT INTO pur_orders (id, company_id, po_number, vendor_id, warehouse_id, status, order_date, expected_date, notes, created_by)
    VALUES (p_id, p_cid, v_num, p_vendor_id, v_wh, 'Draft', p_order_date, p_expected, NULLIF(p_notes,''), p_by);
    SELECT v_num AS po_number;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_pur_add_order_item`;
delimiter ;;
CREATE PROCEDURE `sp_pur_add_order_item`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_oid CHAR(36), IN p_product_id CHAR(36), IN p_desc VARCHAR(500), IN p_qty DECIMAL(15,2), IN p_unit_price DECIMAL(15,2), IN p_discount_pct DECIMAL(5,2), IN p_tax_rate DECIMAL(5,2), IN p_warehouse_id CHAR(36), IN p_expense_account_id CHAR(36), IN p_sort INT)
BEGIN
    DECLARE v_wh CHAR(36);
    IF NOT EXISTS (SELECT 1 FROM pur_orders WHERE id = p_oid AND company_id = p_cid AND is_deleted = 0 AND status = 'Draft') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'order not found or not editable';
    END IF;
    IF p_product_id IS NOT NULL AND p_product_id <> '' AND NOT EXISTS (SELECT 1 FROM inv_products WHERE id = p_product_id AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'product not found in company';
    END IF;
    SET v_wh = NULLIF(p_warehouse_id, '');
    IF v_wh IS NULL THEN SELECT warehouse_id INTO v_wh FROM pur_orders WHERE id = p_oid AND company_id = p_cid; END IF;
    IF v_wh IS NOT NULL AND NOT EXISTS (SELECT 1 FROM inv_warehouses WHERE id = v_wh AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'warehouse not found in company';
    END IF;
    CALL sp_pur_assert_account(p_expense_account_id, p_cid);
    INSERT INTO pur_order_items (id, company_id, order_id, product_id, description, quantity, unit_price, discount_pct, tax_rate, warehouse_id, expense_account_id, line_total, sort_order)
    VALUES (p_id, p_cid, p_oid, NULLIF(p_product_id,''), NULLIF(p_desc,''), IFNULL(p_qty,0), IFNULL(p_unit_price,0), IFNULL(p_discount_pct,0), IFNULL(p_tax_rate,0), v_wh, NULLIF(p_expense_account_id,''),
        ROUND(IFNULL(p_qty,0)*IFNULL(p_unit_price,0)*(1-IFNULL(p_discount_pct,0)/100)*(1+IFNULL(p_tax_rate,0)/100),2), IFNULL(p_sort,0));
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_pur_clear_order_items`;
delimiter ;;
CREATE PROCEDURE `sp_pur_clear_order_items`(IN p_oid CHAR(36), IN p_cid CHAR(36))
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pur_orders WHERE id = p_oid AND company_id = p_cid AND status = 'Draft') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'order not editable';
    END IF;
    DELETE FROM pur_order_items WHERE order_id = p_oid AND company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_pur_update_order`;
delimiter ;;
CREATE PROCEDURE `sp_pur_update_order`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_vendor_id CHAR(36), IN p_order_date DATE, IN p_expected DATE, IN p_warehouse_id CHAR(36), IN p_notes VARCHAR(500))
BEGIN
    IF NOT EXISTS (SELECT 1 FROM ap_vendors WHERE id = p_vendor_id AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'vendor not found in company';
    END IF;
    IF p_warehouse_id IS NOT NULL AND p_warehouse_id <> '' AND NOT EXISTS (SELECT 1 FROM inv_warehouses WHERE id = p_warehouse_id AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'warehouse not found in company';
    END IF;
    UPDATE pur_orders SET vendor_id = p_vendor_id, order_date = p_order_date, expected_date = p_expected,
        warehouse_id = NULLIF(p_warehouse_id,''), notes = NULLIF(p_notes,'')
    WHERE id = p_id AND company_id = p_cid AND status = 'Draft';
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_pur_update_order_totals`;
delimiter ;;
CREATE PROCEDURE `sp_pur_update_order_totals`(IN p_oid CHAR(36), IN p_cid CHAR(36))
BEGIN
    UPDATE pur_order_items SET line_total = ROUND(quantity*unit_price*(1-IFNULL(discount_pct,0)/100)*(1+IFNULL(tax_rate,0)/100),2)
    WHERE order_id = p_oid AND company_id = p_cid;
    UPDATE pur_orders o SET
        subtotal = IFNULL((SELECT SUM(ROUND(oi.quantity*oi.unit_price*(1-IFNULL(oi.discount_pct,0)/100),2)) FROM pur_order_items oi WHERE oi.order_id = o.id),0),
        tax_amount = IFNULL((SELECT SUM(ROUND(oi.quantity*oi.unit_price*(1-IFNULL(oi.discount_pct,0)/100)*IFNULL(oi.tax_rate,0)/100,2)) FROM pur_order_items oi WHERE oi.order_id = o.id),0)
    WHERE o.id = p_oid AND o.company_id = p_cid;
    UPDATE pur_orders SET total_amount = subtotal + tax_amount WHERE id = p_oid AND company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_pur_approve_order`;
delimiter ;;
CREATE PROCEDURE `sp_pur_approve_order`(IN p_oid CHAR(36), IN p_cid CHAR(36), IN p_by CHAR(36))
BEGIN
    DECLARE v_status VARCHAR(20);
    DECLARE v_total DECIMAL(15,2);
    DECLARE v_items INT;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
    START TRANSACTION;
    SELECT status, total_amount, (SELECT COUNT(*) FROM pur_order_items WHERE order_id = p_oid) INTO v_status, v_total, v_items
    FROM pur_orders WHERE id = p_oid AND company_id = p_cid AND is_deleted = 0 FOR UPDATE;
    IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'order not found'; END IF;
    IF v_status <> 'Draft' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'only a draft order can be approved'; END IF;
    IF v_items = 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'order has no line items'; END IF;
    IF v_total <= 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'order total must be positive'; END IF;
    UPDATE pur_orders SET status = 'Approved', approved_by = p_by, approved_at = CURRENT_TIMESTAMP WHERE id = p_oid AND company_id = p_cid;
    COMMIT;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_pur_cancel_order`;
delimiter ;;
CREATE PROCEDURE `sp_pur_cancel_order`(IN p_oid CHAR(36), IN p_cid CHAR(36))
BEGIN
    DECLARE v_status VARCHAR(20);
    DECLARE v_recv DECIMAL(15,2);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
    START TRANSACTION;
    SELECT status, IFNULL((SELECT SUM(qty_received) FROM pur_order_items WHERE order_id = p_oid AND company_id = p_cid),0)
        INTO v_status, v_recv
    FROM pur_orders WHERE id = p_oid AND company_id = p_cid AND is_deleted = 0 FOR UPDATE;
    IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'order not found'; END IF;
    IF v_status IN ('Cancelled','Closed','Billed') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'order cannot be cancelled in its current state'; END IF;
    IF v_recv > 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'cannot cancel an order that has goods received; cancel the receipts first'; END IF;
    UPDATE pur_orders SET status = 'Cancelled' WHERE id = p_oid AND company_id = p_cid;
    COMMIT;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_pur_close_order`;
delimiter ;;
CREATE PROCEDURE `sp_pur_close_order`(IN p_oid CHAR(36), IN p_cid CHAR(36))
BEGIN
    UPDATE pur_orders SET status = 'Closed' WHERE id = p_oid AND company_id = p_cid AND status IN ('Received','Billed','PartiallyReceived');
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_pur_delete_order`;
delimiter ;;
CREATE PROCEDURE `sp_pur_delete_order`(IN p_oid CHAR(36), IN p_cid CHAR(36))
BEGIN
    UPDATE pur_orders SET is_deleted = 1 WHERE id = p_oid AND company_id = p_cid AND status IN ('Draft','Cancelled');
END
;;
delimiter ;


-- ---------- Receipts (goods receipt; increments inv_stock, valued at PO net) ----------

DROP PROCEDURE IF EXISTS `sp_pur_get_receipts`;
delimiter ;;
CREATE PROCEDURE `sp_pur_get_receipts`(IN p_cid CHAR(36), IN p_oid CHAR(36))
BEGIN
    SELECT rc.id, rc.company_id, rc.receipt_number, rc.order_id, o.po_number, rc.warehouse_id, w.name AS warehouse_name,
        rc.status, rc.receipt_date, rc.notes, rc.journal_entry_id, rc.created_at,
        (SELECT COUNT(*) FROM pur_receipt_items i WHERE i.receipt_id = rc.id) AS item_count
    FROM pur_receipts rc
    LEFT JOIN pur_orders o ON rc.order_id = o.id AND o.company_id = p_cid
    LEFT JOIN inv_warehouses w ON rc.warehouse_id = w.id AND w.company_id = p_cid
    WHERE rc.company_id = p_cid AND rc.is_deleted = 0 AND (p_oid = '' OR rc.order_id = p_oid)
    ORDER BY rc.receipt_number DESC;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_pur_get_receipt_items`;
delimiter ;;
CREATE PROCEDURE `sp_pur_get_receipt_items`(IN p_sid CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT ri.id, ri.company_id, ri.receipt_id, ri.order_item_id, ri.product_id, p.name AS product_name, p.sku AS product_sku,
        ri.quantity, ri.unit_cost, ri.movement_id, oi.expense_account_id
    FROM pur_receipt_items ri
    JOIN pur_receipts rc ON ri.receipt_id = rc.id AND rc.company_id = p_cid
    LEFT JOIN pur_order_items oi ON ri.order_item_id = oi.id AND oi.company_id = p_cid
    LEFT JOIN inv_products p ON ri.product_id = p.id AND p.company_id = p_cid
    WHERE ri.receipt_id = p_sid AND ri.company_id = p_cid
    ORDER BY ri.id;
END
;;
delimiter ;

-- Outstanding qty still to receive per line.
DROP PROCEDURE IF EXISTS `sp_pur_get_receivable`;
delimiter ;;
CREATE PROCEDURE `sp_pur_get_receivable`(IN p_oid CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT oi.id AS order_item_id, oi.product_id, p.name AS product_name, oi.description,
        (oi.quantity - oi.qty_received) AS outstanding_qty, oi.unit_price, oi.discount_pct, oi.warehouse_id
    FROM pur_order_items oi
    JOIN pur_orders o ON oi.order_id = o.id AND o.company_id = p_cid
    LEFT JOIN inv_products p ON oi.product_id = p.id AND p.company_id = p_cid
    WHERE oi.order_id = p_oid AND oi.company_id = p_cid AND (oi.quantity - oi.qty_received) > 0
    ORDER BY oi.sort_order, oi.id;
END
;;
delimiter ;

-- Receive: create the receipt, increment inv_stock + write the 'in' movement (valued
-- at PO net unit price), bump qty_received — ALL atomic. Go posts Dr Inventory/Expense
-- / Cr GR-IR afterwards (reading the receipt items).
DROP PROCEDURE IF EXISTS `sp_pur_receive`;
delimiter ;;
CREATE PROCEDURE `sp_pur_receive`(IN p_receipt_id CHAR(36), IN p_cid CHAR(36), IN p_oid CHAR(36), IN p_by CHAR(36), IN p_wid CHAR(36), IN p_receipt_date DATE, IN p_notes VARCHAR(500), IN p_lines JSON)
BEGIN
    DECLARE v_status VARCHAR(20);
    DECLARE v_owh CHAR(36);
    DECLARE v_onum INT;
    DECLARE v_rnum INT;
    DECLARE v_done INT DEFAULT 0;
    DECLARE v_oi CHAR(36);
    DECLARE v_recv DECIMAL(15,2);
    DECLARE v_pid CHAR(36);
    DECLARE v_wid CHAR(36);
    DECLARE v_qord DECIMAL(15,2);
    DECLARE v_qrec DECIMAL(15,2);
    DECLARE v_price DECIMAL(15,2);
    DECLARE v_disc DECIMAL(5,2);
    DECLARE v_net DECIMAL(15,2);
    DECLARE v_onhand DECIMAL(15,2);
    DECLARE v_bal DECIMAL(15,2);
    DECLARE v_mid CHAR(36);
    DECLARE v_sumrec DECIMAL(15,2);
    DECLARE v_sumord DECIMAL(15,2);
    DECLARE cur CURSOR FOR
        SELECT jt.order_item_id, jt.recv_qty, oi.product_id, oi.warehouse_id, oi.quantity, oi.qty_received, oi.unit_price, oi.discount_pct
        FROM JSON_TABLE(p_lines, '$[*]' COLUMNS(order_item_id CHAR(36) PATH '$.order_item_id', recv_qty DECIMAL(15,2) PATH '$.recv_qty')) jt
        JOIN pur_order_items oi ON oi.id = jt.order_item_id AND oi.order_id = p_oid AND oi.company_id = p_cid;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    START TRANSACTION;

    SELECT status, warehouse_id, po_number INTO v_status, v_owh, v_onum
    FROM pur_orders WHERE id = p_oid AND company_id = p_cid AND is_deleted = 0 FOR UPDATE;
    IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'order not found'; END IF;
    IF v_status NOT IN ('Approved','PartiallyReceived') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'order must be approved to receive'; END IF;

    CALL sp_pur_next_receipt_number(p_cid, v_rnum);
    INSERT INTO pur_receipts (id, company_id, receipt_number, order_id, warehouse_id, status, receipt_date, notes, created_by)
    VALUES (p_receipt_id, p_cid, v_rnum, p_oid, NULLIF(p_wid,''), 'Received', IFNULL(p_receipt_date, CURDATE()), NULLIF(p_notes,''), p_by);

    OPEN cur;
    recv_loop: LOOP
        FETCH cur INTO v_oi, v_recv, v_pid, v_wid, v_qord, v_qrec, v_price, v_disc;
        IF v_done THEN LEAVE recv_loop; END IF;
        IF v_recv IS NULL OR v_recv <= 0 THEN ITERATE recv_loop; END IF;
        -- Re-read committed quantities so a duplicate order_item_id in one request
        -- (or a concurrent receipt) can't over-receive against the cursor's stale snapshot.
        SELECT quantity, qty_received INTO v_qord, v_qrec FROM pur_order_items WHERE id = v_oi AND company_id = p_cid;
        IF v_recv > (v_qord - v_qrec) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'receive quantity exceeds the outstanding ordered quantity'; END IF;
        SET v_net = ROUND(v_price*(1-IFNULL(v_disc,0)/100),2);
        SET v_wid = IFNULL(NULLIF(v_wid,''), IFNULL(NULLIF(p_wid,''), v_owh));

        IF v_pid IS NOT NULL AND v_pid <> '' THEN
            IF v_wid IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'no warehouse to receive into'; END IF;
            INSERT INTO inv_stock (id, company_id, product_id, warehouse_id, quantity) VALUES (UUID(), p_cid, v_pid, v_wid, 0)
                ON DUPLICATE KEY UPDATE quantity = quantity;
            SELECT quantity INTO v_onhand FROM inv_stock WHERE product_id = v_pid AND warehouse_id = v_wid FOR UPDATE;
            SET v_bal = v_onhand + v_recv;
            SET v_mid = UUID();
            UPDATE inv_stock SET quantity = v_bal WHERE product_id = v_pid AND warehouse_id = v_wid;
            INSERT INTO inv_movements (id, company_id, product_id, warehouse_id, movement_type, quantity, unit_cost, reference, balance_after, created_by)
            VALUES (v_mid, p_cid, v_pid, v_wid, 'in', v_recv, v_net, CONCAT('PO-', LPAD(v_onum, 6, '0')), v_bal, p_by);
        ELSE
            SET v_mid = NULL;
        END IF;

        INSERT INTO pur_receipt_items (id, company_id, receipt_id, order_item_id, product_id, quantity, unit_cost, movement_id)
        VALUES (UUID(), p_cid, p_receipt_id, v_oi, NULLIF(v_pid,''), v_recv, v_net, v_mid);
        UPDATE pur_order_items SET qty_received = qty_received + v_recv WHERE id = v_oi;
    END LOOP;
    CLOSE cur;

    SELECT IFNULL(SUM(qty_received),0), IFNULL(SUM(quantity),0) INTO v_sumrec, v_sumord FROM pur_order_items WHERE order_id = p_oid AND company_id = p_cid;
    UPDATE pur_orders SET status = IF(v_sumrec >= v_sumord, 'Received', 'PartiallyReceived') WHERE id = p_oid AND company_id = p_cid AND status IN ('Approved','PartiallyReceived');

    COMMIT;
    SELECT p_receipt_id AS receipt_id, v_rnum AS receipt_number;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_pur_set_receipt_journal`;
delimiter ;;
CREATE PROCEDURE `sp_pur_set_receipt_journal`(IN p_receipt_id CHAR(36), IN p_cid CHAR(36), IN p_jid CHAR(36))
BEGIN
    UPDATE pur_receipts SET journal_entry_id = p_jid WHERE id = p_receipt_id AND company_id = p_cid;
END
;;
delimiter ;

-- Cancel a receipt: reverse the stock ('out' movements), un-receive the lines. Returns
-- the reversed lines so Go can post the GR-IR reversal (Dr GR-IR / Cr Inventory).
-- Refuses if any un-received qty would drop below what has already been billed.
DROP PROCEDURE IF EXISTS `sp_pur_cancel_receipt`;
delimiter ;;
CREATE PROCEDURE `sp_pur_cancel_receipt`(IN p_sid CHAR(36), IN p_cid CHAR(36), IN p_by CHAR(36))
BEGIN
    DECLARE v_status VARCHAR(20);
    DECLARE v_oid CHAR(36);
    DECLARE v_onum INT;
    DECLARE v_done INT DEFAULT 0;
    DECLARE v_oi CHAR(36);
    DECLARE v_pid CHAR(36);
    DECLARE v_qty DECIMAL(15,2);
    DECLARE v_cost DECIMAL(15,2);
    DECLARE v_wid CHAR(36);
    DECLARE v_exp CHAR(36);
    DECLARE v_bal DECIMAL(15,2);
    DECLARE v_mid CHAR(36);
    DECLARE v_sumrec DECIMAL(15,2);
    -- ALL receipt lines (product and non-product). Product lines reverse stock;
    -- non-product (expense) lines carry their expense account so Go can reverse
    -- their Dr Expense / Cr GR-IR posting too.
    DECLARE cur CURSOR FOR
        SELECT ri.order_item_id, ri.product_id, ri.quantity, m.warehouse_id, COALESCE(ri.unit_cost, 0), oi.expense_account_id
        FROM pur_receipt_items ri
        LEFT JOIN inv_movements m ON ri.movement_id = m.id
        LEFT JOIN pur_order_items oi ON ri.order_item_id = oi.id AND oi.company_id = p_cid
        WHERE ri.receipt_id = p_sid AND ri.company_id = p_cid;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    START TRANSACTION;

    SELECT rc.status, rc.order_id, o.po_number INTO v_status, v_oid, v_onum
    FROM pur_receipts rc JOIN pur_orders o ON rc.order_id = o.id AND o.company_id = p_cid
    WHERE rc.id = p_sid AND rc.company_id = p_cid AND rc.is_deleted = 0 FOR UPDATE;
    IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'receipt not found'; END IF;
    IF v_status = 'Cancelled' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'receipt already cancelled'; END IF;
    -- Un-receiving below what has already been billed would break qty_billed <= qty_received.
    IF EXISTS (
        SELECT 1 FROM pur_order_items oi
        JOIN (SELECT order_item_id, SUM(quantity) AS sq FROM pur_receipt_items WHERE receipt_id = p_sid AND company_id = p_cid GROUP BY order_item_id) rr
          ON rr.order_item_id = oi.id
        WHERE oi.company_id = p_cid AND oi.qty_billed > (oi.qty_received - rr.sq)
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'cannot cancel a receipt whose quantities have already been billed';
    END IF;

    DROP TEMPORARY TABLE IF EXISTS tmp_pur_cancel;
    CREATE TEMPORARY TABLE tmp_pur_cancel (movement_id CHAR(36), product_id CHAR(36), quantity DECIMAL(15,2), unit_cost DECIMAL(15,2), expense_account_id CHAR(36));

    OPEN cur;
    canc_loop: LOOP
        FETCH cur INTO v_oi, v_pid, v_qty, v_wid, v_cost, v_exp;
        IF v_done THEN LEAVE canc_loop; END IF;
        IF v_pid IS NOT NULL AND v_pid <> '' AND v_wid IS NOT NULL THEN
            -- product line: reverse stock and emit for the Dr GR-IR / Cr Inventory reversal
            INSERT INTO inv_stock (id, company_id, product_id, warehouse_id, quantity) VALUES (UUID(), p_cid, v_pid, v_wid, 0)
                ON DUPLICATE KEY UPDATE quantity = quantity;
            SELECT quantity INTO v_bal FROM inv_stock WHERE product_id = v_pid AND warehouse_id = v_wid FOR UPDATE;
            IF v_bal < v_qty THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'insufficient stock to reverse receipt (already consumed)'; END IF;
            SET v_bal = v_bal - v_qty;
            SET v_mid = UUID();
            UPDATE inv_stock SET quantity = v_bal WHERE product_id = v_pid AND warehouse_id = v_wid;
            INSERT INTO inv_movements (id, company_id, product_id, warehouse_id, movement_type, quantity, unit_cost, reference, balance_after, created_by)
            VALUES (v_mid, p_cid, v_pid, v_wid, 'out', v_qty, v_cost, CONCAT('PO-', LPAD(v_onum, 6, '0'), ' cancel'), v_bal, p_by);
            INSERT INTO tmp_pur_cancel VALUES (v_mid, v_pid, v_qty, v_cost, NULL);
        ELSE
            -- non-product (expense) line: no stock, emit for the Dr GR-IR / Cr Expense reversal
            INSERT INTO tmp_pur_cancel VALUES (NULL, NULL, v_qty, v_cost, v_exp);
        END IF;
    END LOOP;
    CLOSE cur;

    -- Un-receive ALL lines on the receipt (product and non-product).
    UPDATE pur_order_items oi
    JOIN (SELECT order_item_id, SUM(quantity) AS sq FROM pur_receipt_items WHERE receipt_id = p_sid AND company_id = p_cid GROUP BY order_item_id) rr
      ON rr.order_item_id = oi.id
    SET oi.qty_received = GREATEST(0, oi.qty_received - rr.sq)
    WHERE oi.company_id = p_cid;

    UPDATE pur_receipts SET status = 'Cancelled' WHERE id = p_sid AND company_id = p_cid;
    SELECT IFNULL(SUM(qty_received),0) INTO v_sumrec FROM pur_order_items WHERE order_id = v_oid AND company_id = p_cid;
    -- Re-open the order to a receivable state — including one already advanced to
    -- Closed/Billed — since goods have been un-received.
    UPDATE pur_orders SET status = CASE WHEN v_sumrec <= 0 THEN 'Approved' ELSE 'PartiallyReceived' END
        WHERE id = v_oid AND company_id = p_cid AND status IN ('Received','PartiallyReceived','Closed','Billed');

    COMMIT;
    SELECT movement_id, product_id, quantity, unit_cost, expense_account_id FROM tmp_pur_cancel;
    DROP TEMPORARY TABLE IF EXISTS tmp_pur_cancel;
END
;;
delimiter ;


-- ---------- Billing (3-way match: bill up to received qty; reuses ap_bills in Go) ----------

DROP PROCEDURE IF EXISTS `sp_pur_get_billable`;
delimiter ;;
CREATE PROCEDURE `sp_pur_get_billable`(IN p_oid CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT oi.id AS order_item_id, oi.product_id, p.name AS product_name, oi.description,
        (oi.qty_received - oi.qty_billed) AS billable_qty, oi.unit_price, oi.discount_pct, oi.tax_rate, oi.expense_account_id
    FROM pur_order_items oi
    JOIN pur_orders o ON oi.order_id = o.id AND o.company_id = p_cid
    LEFT JOIN inv_products p ON oi.product_id = p.id AND p.company_id = p_cid
    WHERE oi.order_id = p_oid AND oi.company_id = p_cid AND (oi.qty_received - oi.qty_billed) > 0
    ORDER BY oi.sort_order, oi.id;
END
;;
delimiter ;

-- Advance qty_billed under the order lock by the EXACT per-line quantities the bill
-- covered (the snapshot p_lines = [{order_item_id, billed_qty}]), capped at
-- qty_received. Advancing by the caller's snapshot — instead of snapping to live
-- qty_received — means a goods receipt that commits between the billable read and
-- this mark cannot flag the newly-received units as billed. Returns the count of
-- lines that actually advanced (0 => a concurrent bill already took them; caller voids).
DROP PROCEDURE IF EXISTS `sp_pur_mark_billed`;
delimiter ;;
CREATE PROCEDURE `sp_pur_mark_billed`(IN p_oid CHAR(36), IN p_cid CHAR(36), IN p_bill_id CHAR(36), IN p_journal_id CHAR(36), IN p_lines JSON)
BEGIN
    DECLARE v_status VARCHAR(20);
    DECLARE v_count INT DEFAULT 0;
    DECLARE v_seq INT DEFAULT 0;
    DECLARE v_sumbill DECIMAL(15,2);
    DECLARE v_ord DECIMAL(15,2);
    DECLARE v_done INT DEFAULT 0;
    DECLARE v_oi CHAR(36);
    DECLARE v_bqty DECIMAL(15,2);
    DECLARE v_avail DECIMAL(15,2);
    DECLARE cur CURSOR FOR
        SELECT jt.order_item_id, jt.billed_qty
        FROM JSON_TABLE(p_lines, '$[*]' COLUMNS(order_item_id CHAR(36) PATH '$.order_item_id', billed_qty DECIMAL(15,2) PATH '$.billed_qty')) jt;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    START TRANSACTION;
    SELECT status, bill_seq INTO v_status, v_seq FROM pur_orders WHERE id = p_oid AND company_id = p_cid AND is_deleted = 0 FOR UPDATE;
    IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'order not found'; END IF;

    -- Advance each snapshot line's qty_billed by its billed_qty, capped at the
    -- currently-unbilled received qty. A line with nothing left to bill (a concurrent
    -- bill already took it) advances nothing and is not counted.
    OPEN cur;
    mb_loop: LOOP
        FETCH cur INTO v_oi, v_bqty;
        IF v_done THEN LEAVE mb_loop; END IF;
        IF v_bqty IS NULL OR v_bqty <= 0 THEN ITERATE mb_loop; END IF;
        SELECT GREATEST(0, qty_received - qty_billed) INTO v_avail FROM pur_order_items WHERE id = v_oi AND order_id = p_oid AND company_id = p_cid;
        IF v_avail IS NULL OR v_avail <= 0 THEN ITERATE mb_loop; END IF;
        UPDATE pur_order_items SET qty_billed = qty_billed + LEAST(v_bqty, v_avail) WHERE id = v_oi AND order_id = p_oid AND company_id = p_cid;
        SET v_count = v_count + 1;
    END LOOP;
    CLOSE cur;

    IF v_count > 0 THEN
        INSERT INTO pur_order_bills (id, company_id, order_id, bill_id, journal_entry_id) VALUES (UUID(), p_cid, p_oid, p_bill_id, NULLIF(p_journal_id,''));
        UPDATE pur_orders SET bill_seq = v_seq + 1 WHERE id = p_oid AND company_id = p_cid;
        SELECT IFNULL(SUM(qty_billed),0), IFNULL(SUM(quantity),0) INTO v_sumbill, v_ord FROM pur_order_items WHERE order_id = p_oid AND company_id = p_cid;
        IF v_sumbill >= v_ord AND v_ord > 0 THEN
            UPDATE pur_orders SET status = 'Billed' WHERE id = p_oid AND company_id = p_cid;
        END IF;
    END IF;
    COMMIT;
    SELECT v_count AS billed_lines, v_seq + 1 AS bill_seq;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_pur_set_bill_journal`;
delimiter ;;
CREATE PROCEDURE `sp_pur_set_bill_journal`(IN p_bill_id CHAR(36), IN p_cid CHAR(36), IN p_jid CHAR(36))
BEGIN
    UPDATE ap_bills SET journal_id = p_jid WHERE id = p_bill_id AND company_id = p_cid;
END
;;
delimiter ;


-- ---------- Dashboard ----------

DROP PROCEDURE IF EXISTS `sp_pur_stats`;
delimiter ;;
CREATE PROCEDURE `sp_pur_stats`(IN p_cid CHAR(36))
BEGIN
    SELECT
        (SELECT COUNT(*) FROM pur_orders WHERE company_id = p_cid AND is_deleted = 0) AS total_orders,
        (SELECT COUNT(*) FROM pur_orders WHERE company_id = p_cid AND is_deleted = 0 AND status IN ('Approved','PartiallyReceived')) AS open_orders,
        (SELECT COUNT(*) FROM pur_requisitions WHERE company_id = p_cid AND is_deleted = 0 AND status IN ('Draft','Submitted')) AS pending_requisitions,
        (SELECT COUNT(*) FROM pur_requisitions WHERE company_id = p_cid AND is_deleted = 0 AND status = 'Submitted') AS awaiting_req_approval,
        (SELECT COUNT(*) FROM pur_orders o WHERE o.company_id = p_cid AND o.is_deleted = 0 AND o.status IN ('Approved','PartiallyReceived')
            AND EXISTS (SELECT 1 FROM pur_order_items oi WHERE oi.order_id = o.id AND oi.qty_received < oi.quantity)) AS awaiting_receipt,
        (SELECT COUNT(*) FROM pur_orders o WHERE o.company_id = p_cid AND o.is_deleted = 0 AND o.status NOT IN ('Draft','Cancelled')
            AND EXISTS (SELECT 1 FROM pur_order_items oi WHERE oi.order_id = o.id AND oi.qty_received > oi.qty_billed)) AS awaiting_bill,
        (SELECT COUNT(*) FROM ap_vendors WHERE company_id = p_cid AND is_deleted = 0) AS total_vendors,
        IFNULL((SELECT SUM(total_amount) FROM pur_orders WHERE company_id = p_cid AND is_deleted = 0 AND status IN ('Draft','Approved','PartiallyReceived')),0) AS open_po_value,
        IFNULL((SELECT SUM(total_debit) FROM acc_journal_entries WHERE company_id = p_cid AND source_type = 'procurement' AND status = 'Posted' AND memo LIKE 'Goods receipt %' AND entry_date >= DATE_FORMAT(CURDATE(),'%Y-%m-01')),0) AS received_this_month;
END
;;
delimiter ;
