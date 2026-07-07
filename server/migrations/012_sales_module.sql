-- ============================================================================
-- Migration 012: Sales / Order Management (order-to-cash) module
--
--   Reuses the AR module (ar_customers, ar_invoices) and the Inventory module
--   (inv_products, inv_stock, inv_movements) rather than duplicating them.
--   Company-scoped for tenant isolation (every SP keys on p_cid, matching
--   migrations 003-011). GL entries are built in the Go layer.
--
--   ORDER-TO-CASH GL MAP (no double-post — verified against AR + inventory):
--     * AR posts NO GL at any step -> Sales posts Dr A/R / Cr Revenue / Cr Tax
--       Payable itself, exactly once, at invoice generation (guarded by
--       so_orders.invoice_id / revenue_journal_id).
--     * COGS posts exactly once, by INVENTORY, at fulfillment: sp_so_fulfill
--       decrements inv_stock + writes the inv_movements 'out' row atomically,
--       then Go posts Dr COGS / Cr Inventory via maybePostMovementJournal. Sales
--       posts ZERO COGS/inventory lines itself.
--
--   Revenue journal is built from the SAME per-line rounded figures the AR
--   subledger stores, and Dr A/R = the sum of the emitted Cr lines, so the entry
--   balances to the cent and sp_post_journal_entry cannot reject it.
--
--   Stock reservation is a dedicated per-line ledger (so_reservations). It is
--   ADVISORY against on-hand: available = on_hand - SUM(active reservations).
--   The HARD guard against overselling is that stock can never go negative
--   (sp_so_fulfill SIGNALs if on_hand < ship_qty).
--
--   Discounts are NET-BOOKED via per-line/order discount_pct (qty-invariant so
--   partial invoicing sums exactly); there is no separate contra-revenue line.
--
--   Every order-mutating SP locks the so_orders header FOR UPDATE first, which
--   serializes confirm / fulfill / invoice / cancel for one order.
--
--   Apply BEFORE/with the matching server build (privileged MySQL user):
--     mysql -u root -p lettersheets < server/migrations/012_sales_module.sql
-- ============================================================================


-- ---------- Tables ----------

CREATE TABLE IF NOT EXISTS `so_quote_sequences`    (`company_id` char(36) NOT NULL, `next_number` int DEFAULT '1', PRIMARY KEY (`company_id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS `so_order_sequences`    (`company_id` char(36) NOT NULL, `next_number` int DEFAULT '1', PRIMARY KEY (`company_id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS `so_shipment_sequences` (`company_id` char(36) NOT NULL, `next_number` int DEFAULT '1', PRIMARY KEY (`company_id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `so_settings` (
  `company_id`                 char(36)   NOT NULL,
  `auto_post_gl`               tinyint(1) DEFAULT '0',
  `auto_invoice_on_fulfill`    tinyint(1) DEFAULT '0',
  `default_revenue_account_id` char(36)   DEFAULT NULL,
  `ar_account_id`              char(36)   DEFAULT NULL,
  `tax_payable_account_id`     char(36)   DEFAULT NULL,
  `default_warehouse_id`       char(36)   DEFAULT NULL,
  `default_price_list_id`      char(36)   DEFAULT NULL,
  `default_payment_terms`      int        DEFAULT '30',
  `quote_valid_days`           int        DEFAULT '30',
  `updated_at`                 timestamp  NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`company_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `so_price_lists` (
  `id`          char(36)     NOT NULL DEFAULT (uuid()),
  `company_id`  char(36)     NOT NULL,
  `name`        varchar(120) NOT NULL,
  `customer_id` char(36)     DEFAULT NULL,
  `tier`        varchar(40)  DEFAULT NULL,
  `is_default`  tinyint(1)   DEFAULT '0',
  `valid_from`  date         DEFAULT NULL,
  `valid_to`    date         DEFAULT NULL,
  `is_active`   tinyint(1)   DEFAULT '1',
  `is_deleted`  tinyint(1)   DEFAULT '0',
  `created_at`  timestamp    NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sopl` (`company_id`,`is_deleted`),
  KEY `idx_sopl_cust` (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `so_price_list_items` (
  `id`            char(36)      NOT NULL DEFAULT (uuid()),
  `company_id`    char(36)      NOT NULL,
  `price_list_id` char(36)      NOT NULL,
  `product_id`    char(36)      NOT NULL,
  `min_qty`       decimal(15,2) DEFAULT '0.00',
  `unit_price`    decimal(15,2) DEFAULT '0.00',
  `discount_pct`  decimal(5,2)  DEFAULT '0.00',
  PRIMARY KEY (`id`),
  KEY `idx_sopli` (`price_list_id`),
  KEY `idx_sopli_prod` (`company_id`,`product_id`),
  CONSTRAINT `so_price_list_items_ibfk_1` FOREIGN KEY (`price_list_id`) REFERENCES `so_price_lists` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `so_quotes` (
  `id`                 char(36)      NOT NULL DEFAULT (uuid()),
  `company_id`         char(36)      NOT NULL,
  `quote_number`       int           NOT NULL,
  `customer_id`        char(36)      NOT NULL,
  `price_list_id`      char(36)      DEFAULT NULL,
  `status`             varchar(20)   NOT NULL DEFAULT 'Draft',
  `quote_date`         date          DEFAULT NULL,
  `valid_until`        date          DEFAULT NULL,
  `subtotal`           decimal(15,2) DEFAULT '0.00',
  `discount_pct`       decimal(5,2)  DEFAULT '0.00',
  `discount_amount`    decimal(15,2) DEFAULT '0.00',
  `tax_amount`         decimal(15,2) DEFAULT '0.00',
  `total_amount`       decimal(15,2) DEFAULT '0.00',
  `notes`              varchar(500)  DEFAULT NULL,
  `converted_order_id` char(36)      DEFAULT NULL,
  `created_by`         char(36)      DEFAULT NULL,
  `is_deleted`         tinyint(1)    DEFAULT '0',
  `created_at`         timestamp     NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         timestamp     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_soquote_num` (`company_id`,`quote_number`),
  KEY `idx_soquote` (`company_id`,`is_deleted`),
  KEY `idx_soquote_status` (`company_id`,`status`),
  KEY `idx_soquote_cust` (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `so_quote_items` (
  `id`           char(36)      NOT NULL DEFAULT (uuid()),
  `company_id`   char(36)      NOT NULL,
  `quote_id`     char(36)      NOT NULL,
  `product_id`   char(36)      DEFAULT NULL,
  `description`  varchar(500)  DEFAULT NULL,
  `quantity`     decimal(15,2) NOT NULL DEFAULT '0.00',
  `unit_price`   decimal(15,2) DEFAULT '0.00',
  `discount_pct` decimal(5,2)  DEFAULT '0.00',
  `tax_rate`     decimal(5,2)  DEFAULT '0.00',
  `line_total`   decimal(15,2) DEFAULT '0.00',
  `sort_order`   int           DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_soqitem` (`quote_id`),
  KEY `idx_soqitem_prod` (`company_id`,`product_id`),
  CONSTRAINT `so_quote_items_ibfk_1` FOREIGN KEY (`quote_id`) REFERENCES `so_quotes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `so_orders` (
  `id`                 char(36)      NOT NULL DEFAULT (uuid()),
  `company_id`         char(36)      NOT NULL,
  `order_number`       int           NOT NULL,
  `customer_id`        char(36)      NOT NULL,
  `quote_id`           char(36)      DEFAULT NULL,
  `price_list_id`      char(36)      DEFAULT NULL,
  `warehouse_id`       char(36)      DEFAULT NULL,
  `status`             varchar(20)   NOT NULL DEFAULT 'Draft',
  `order_date`         date          DEFAULT NULL,
  `expected_ship_date` date          DEFAULT NULL,
  `subtotal`           decimal(15,2) DEFAULT '0.00',
  `discount_pct`       decimal(5,2)  DEFAULT '0.00',
  `discount_amount`    decimal(15,2) DEFAULT '0.00',
  `tax_amount`         decimal(15,2) DEFAULT '0.00',
  `total_amount`       decimal(15,2) DEFAULT '0.00',
  `notes`              varchar(500)  DEFAULT NULL,
  `invoice_seq`        int           DEFAULT '0',
  `invoice_id`         char(36)      DEFAULT NULL,
  `revenue_journal_id` char(36)      DEFAULT NULL,
  `created_by`         char(36)      DEFAULT NULL,
  `is_deleted`         tinyint(1)    DEFAULT '0',
  `created_at`         timestamp     NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         timestamp     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_soorder_num` (`company_id`,`order_number`),
  KEY `idx_soorder` (`company_id`,`is_deleted`),
  KEY `idx_soorder_status` (`company_id`,`status`),
  KEY `idx_soorder_cust` (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `so_order_items` (
  `id`                 char(36)      NOT NULL DEFAULT (uuid()),
  `company_id`         char(36)      NOT NULL,
  `order_id`           char(36)      NOT NULL,
  `product_id`         char(36)      DEFAULT NULL,
  `description`        varchar(500)  DEFAULT NULL,
  `quantity`           decimal(15,2) NOT NULL DEFAULT '0.00',
  `unit_price`         decimal(15,2) DEFAULT '0.00',
  `discount_pct`       decimal(5,2)  DEFAULT '0.00',
  `tax_rate`           decimal(5,2)  DEFAULT '0.00',
  `qty_reserved`       decimal(15,2) NOT NULL DEFAULT '0.00',
  `qty_fulfilled`      decimal(15,2) NOT NULL DEFAULT '0.00',
  `qty_invoiced`       decimal(15,2) NOT NULL DEFAULT '0.00',
  `line_total`         decimal(15,2) DEFAULT '0.00',
  `warehouse_id`       char(36)      DEFAULT NULL,
  `revenue_account_id` char(36)      DEFAULT NULL,
  `sort_order`         int           DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_soitem` (`order_id`),
  KEY `idx_soitem_prod` (`company_id`,`product_id`),
  CONSTRAINT `so_order_items_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `so_orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `so_reservations` (
  `id`            char(36)      NOT NULL DEFAULT (uuid()),
  `company_id`    char(36)      NOT NULL,
  `order_id`      char(36)      NOT NULL,
  `order_item_id` char(36)      NOT NULL,
  `product_id`    char(36)      NOT NULL,
  `warehouse_id`  char(36)      NOT NULL,
  `qty_reserved`  decimal(15,2) NOT NULL DEFAULT '0.00',
  `status`        varchar(20)   NOT NULL DEFAULT 'Active',
  `created_at`    timestamp     NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    timestamp     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sores` (`order_item_id`,`warehouse_id`),
  KEY `idx_sores_avail` (`company_id`,`product_id`,`warehouse_id`,`status`),
  KEY `idx_sores_order` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `so_shipments` (
  `id`              char(36)     NOT NULL DEFAULT (uuid()),
  `company_id`      char(36)     NOT NULL,
  `shipment_number` int          NOT NULL,
  `order_id`        char(36)     NOT NULL,
  `warehouse_id`    char(36)     DEFAULT NULL,
  `status`          varchar(20)  NOT NULL DEFAULT 'Shipped',
  `carrier`         varchar(120) DEFAULT NULL,
  `tracking_number` varchar(120) DEFAULT NULL,
  `ship_date`       date         DEFAULT NULL,
  `delivered_date`  date         DEFAULT NULL,
  `notes`           varchar(500) DEFAULT NULL,
  `created_by`      char(36)     DEFAULT NULL,
  `is_deleted`      tinyint(1)   DEFAULT '0',
  `created_at`      timestamp    NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      timestamp    NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_soship_num` (`company_id`,`shipment_number`),
  KEY `idx_soship` (`company_id`,`is_deleted`),
  KEY `idx_soship_order` (`order_id`),
  KEY `idx_soship_status` (`company_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `so_shipment_items` (
  `id`               char(36)      NOT NULL DEFAULT (uuid()),
  `company_id`       char(36)      NOT NULL,
  `shipment_id`      char(36)      NOT NULL,
  `order_item_id`    char(36)      NOT NULL,
  `product_id`       char(36)      DEFAULT NULL,
  `quantity`         decimal(15,2) NOT NULL DEFAULT '0.00',
  `movement_id`      char(36)      DEFAULT NULL,
  `journal_entry_id` char(36)      DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_soshipitem` (`shipment_id`),
  KEY `idx_soshipitem_oi` (`order_item_id`),
  CONSTRAINT `so_shipment_items_ibfk_1` FOREIGN KEY (`shipment_id`) REFERENCES `so_shipments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `so_order_invoices` (
  `id`                 char(36)  NOT NULL DEFAULT (uuid()),
  `company_id`         char(36)  NOT NULL,
  `order_id`           char(36)  NOT NULL,
  `invoice_id`         char(36)  NOT NULL,
  `revenue_journal_id` char(36)  DEFAULT NULL,
  `created_at`         timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_soinv_order` (`order_id`),
  KEY `idx_soinv_inv` (`invoice_id`),
  CONSTRAINT `so_order_invoices_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `so_orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- ---------- Helpers ----------

DROP PROCEDURE IF EXISTS `sp_so_assert_account`;
delimiter ;;
CREATE PROCEDURE `sp_so_assert_account`(IN p_acct CHAR(36), IN p_cid CHAR(36))
BEGIN
    IF p_acct IS NOT NULL AND p_acct <> '' AND NOT EXISTS
        (SELECT 1 FROM acc_accounts WHERE id = p_acct AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'GL account not found in company';
    END IF;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_next_quote_number`;
delimiter ;;
CREATE PROCEDURE `sp_so_next_quote_number`(IN p_cid CHAR(36), OUT p_num INT)
BEGIN
    INSERT INTO so_quote_sequences (company_id, next_number) VALUES (p_cid, 2)
        ON DUPLICATE KEY UPDATE next_number = next_number + 1;
    SELECT CASE WHEN next_number > 1 THEN next_number - 1 ELSE 1 END INTO p_num FROM so_quote_sequences WHERE company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_next_order_number`;
delimiter ;;
CREATE PROCEDURE `sp_so_next_order_number`(IN p_cid CHAR(36), OUT p_num INT)
BEGIN
    INSERT INTO so_order_sequences (company_id, next_number) VALUES (p_cid, 2)
        ON DUPLICATE KEY UPDATE next_number = next_number + 1;
    SELECT CASE WHEN next_number > 1 THEN next_number - 1 ELSE 1 END INTO p_num FROM so_order_sequences WHERE company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_next_shipment_number`;
delimiter ;;
CREATE PROCEDURE `sp_so_next_shipment_number`(IN p_cid CHAR(36), OUT p_num INT)
BEGIN
    INSERT INTO so_shipment_sequences (company_id, next_number) VALUES (p_cid, 2)
        ON DUPLICATE KEY UPDATE next_number = next_number + 1;
    SELECT CASE WHEN next_number > 1 THEN next_number - 1 ELSE 1 END INTO p_num FROM so_shipment_sequences WHERE company_id = p_cid;
END
;;
delimiter ;

-- Availability (ATP) for display: floored at 0, company-scoped.
DROP PROCEDURE IF EXISTS `sp_so_check_availability`;
delimiter ;;
CREATE PROCEDURE `sp_so_check_availability`(IN p_cid CHAR(36), IN p_product_id CHAR(36), IN p_warehouse_id CHAR(36))
BEGIN
    DECLARE v_onhand DECIMAL(15,2) DEFAULT 0;
    DECLARE v_res DECIMAL(15,2) DEFAULT 0;
    SET v_onhand = IFNULL((SELECT st.quantity FROM inv_stock st JOIN inv_products p ON st.product_id = p.id AND p.company_id = p_cid
        WHERE st.product_id = p_product_id AND st.warehouse_id = p_warehouse_id), 0);
    SET v_res = IFNULL((SELECT SUM(qty_reserved) FROM so_reservations
        WHERE company_id = p_cid AND product_id = p_product_id AND warehouse_id = p_warehouse_id AND status = 'Active'), 0);
    SELECT GREATEST(0, v_onhand - v_res) AS available_qty, v_onhand AS on_hand, v_res AS reserved;
END
;;
delimiter ;

-- Resolve the effective unit price (customer/tier price list, date-valid, tiered by qty; else product selling_price).
DROP PROCEDURE IF EXISTS `sp_so_resolve_price`;
delimiter ;;
CREATE PROCEDURE `sp_so_resolve_price`(IN p_cid CHAR(36), IN p_customer_id CHAR(36), IN p_product_id CHAR(36), IN p_qty DECIMAL(15,2), IN p_price_list_id CHAR(36))
BEGIN
    DECLARE v_price DECIMAL(15,2) DEFAULT NULL;
    -- price-list item: explicit list if given, else a valid customer-specific or default list; highest min_qty <= qty wins.
    SELECT (pli.unit_price * (1 - IFNULL(pli.discount_pct,0)/100)) INTO v_price
    FROM so_price_list_items pli
    JOIN so_price_lists pl ON pli.price_list_id = pl.id AND pl.company_id = p_cid
    WHERE pli.company_id = p_cid AND pli.product_id = p_product_id
      AND pl.is_active = 1 AND pl.is_deleted = 0
      AND (pl.valid_from IS NULL OR pl.valid_from <= CURDATE())
      AND (pl.valid_to IS NULL OR pl.valid_to >= CURDATE())
      AND (p_price_list_id IS NULL OR p_price_list_id = '' OR pl.id = p_price_list_id)
      AND (pl.customer_id IS NULL OR pl.customer_id = p_customer_id)
      AND pli.min_qty <= IFNULL(p_qty, 0)
    ORDER BY (pl.customer_id = p_customer_id) DESC, pli.min_qty DESC, pl.is_default ASC
    LIMIT 1;

    IF v_price IS NULL THEN
        SELECT selling_price INTO v_price FROM inv_products WHERE id = p_product_id AND company_id = p_cid AND is_deleted = 0;
    END IF;
    SELECT IFNULL(v_price, 0) AS unit_price;
END
;;
delimiter ;


-- ---------- Settings ----------

DROP PROCEDURE IF EXISTS `sp_so_get_settings`;
delimiter ;;
CREATE PROCEDURE `sp_so_get_settings`(IN p_cid CHAR(36))
BEGIN
    SELECT company_id, auto_post_gl, auto_invoice_on_fulfill, default_revenue_account_id, ar_account_id,
        tax_payable_account_id, default_warehouse_id, default_price_list_id, default_payment_terms, quote_valid_days
    FROM so_settings WHERE company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_upsert_settings`;
delimiter ;;
CREATE PROCEDURE `sp_so_upsert_settings`(IN p_cid CHAR(36), IN p_auto_post TINYINT, IN p_auto_invoice TINYINT, IN p_revenue CHAR(36), IN p_ar CHAR(36), IN p_tax CHAR(36), IN p_wh CHAR(36), IN p_pl CHAR(36), IN p_terms INT, IN p_quote_days INT)
BEGIN
    CALL sp_so_assert_account(p_revenue, p_cid);
    CALL sp_so_assert_account(p_ar, p_cid);
    CALL sp_so_assert_account(p_tax, p_cid);
    IF p_wh IS NOT NULL AND p_wh <> '' AND NOT EXISTS (SELECT 1 FROM inv_warehouses WHERE id = p_wh AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'default warehouse not in company';
    END IF;
    IF p_pl IS NOT NULL AND p_pl <> '' AND NOT EXISTS (SELECT 1 FROM so_price_lists WHERE id = p_pl AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'default price list not in company';
    END IF;
    IF p_auto_post = 1 AND (p_ar = '' OR p_ar IS NULL OR p_revenue = '' OR p_revenue IS NULL) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Receivable and default revenue accounts are required to enable auto-post';
    END IF;
    INSERT INTO so_settings (company_id, auto_post_gl, auto_invoice_on_fulfill, default_revenue_account_id, ar_account_id, tax_payable_account_id, default_warehouse_id, default_price_list_id, default_payment_terms, quote_valid_days)
    VALUES (p_cid, IFNULL(p_auto_post,0), IFNULL(p_auto_invoice,0), NULLIF(p_revenue,''), NULLIF(p_ar,''), NULLIF(p_tax,''), NULLIF(p_wh,''), NULLIF(p_pl,''), IFNULL(p_terms,30), IFNULL(p_quote_days,30))
    ON DUPLICATE KEY UPDATE
        auto_post_gl = IFNULL(p_auto_post,0), auto_invoice_on_fulfill = IFNULL(p_auto_invoice,0),
        default_revenue_account_id = NULLIF(p_revenue,''), ar_account_id = NULLIF(p_ar,''), tax_payable_account_id = NULLIF(p_tax,''),
        default_warehouse_id = NULLIF(p_wh,''), default_price_list_id = NULLIF(p_pl,''),
        default_payment_terms = IFNULL(p_terms,30), quote_valid_days = IFNULL(p_quote_days,30);
END
;;
delimiter ;


-- ---------- Price lists ----------

DROP PROCEDURE IF EXISTS `sp_so_get_price_lists`;
delimiter ;;
CREATE PROCEDURE `sp_so_get_price_lists`(IN p_cid CHAR(36))
BEGIN
    SELECT pl.id, pl.company_id, pl.name, pl.customer_id, cu.name AS customer_name, pl.tier, pl.is_default,
        pl.valid_from, pl.valid_to, pl.is_active, pl.created_at,
        (SELECT COUNT(*) FROM so_price_list_items i WHERE i.price_list_id = pl.id) AS item_count
    FROM so_price_lists pl
    LEFT JOIN ar_customers cu ON pl.customer_id = cu.id AND cu.company_id = p_cid
    WHERE pl.company_id = p_cid AND pl.is_deleted = 0
    ORDER BY pl.name;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_get_price_list_items`;
delimiter ;;
CREATE PROCEDURE `sp_so_get_price_list_items`(IN p_plid CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT i.id, i.company_id, i.price_list_id, i.product_id, p.name AS product_name, p.sku AS product_sku,
        i.min_qty, i.unit_price, i.discount_pct
    FROM so_price_list_items i
    JOIN so_price_lists pl ON i.price_list_id = pl.id AND pl.company_id = p_cid
    LEFT JOIN inv_products p ON i.product_id = p.id AND p.company_id = p_cid
    WHERE i.price_list_id = p_plid AND i.company_id = p_cid
    ORDER BY p.name, i.min_qty;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_create_price_list`;
delimiter ;;
CREATE PROCEDURE `sp_so_create_price_list`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_name VARCHAR(120), IN p_customer_id CHAR(36), IN p_tier VARCHAR(40), IN p_is_default TINYINT, IN p_valid_from DATE, IN p_valid_to DATE)
BEGIN
    IF p_customer_id IS NOT NULL AND p_customer_id <> '' AND NOT EXISTS (SELECT 1 FROM ar_customers WHERE id = p_customer_id AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'customer not found in company';
    END IF;
    INSERT INTO so_price_lists (id, company_id, name, customer_id, tier, is_default, valid_from, valid_to)
    VALUES (p_id, p_cid, p_name, NULLIF(p_customer_id,''), NULLIF(p_tier,''), IFNULL(p_is_default,0), p_valid_from, p_valid_to);
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_update_price_list`;
delimiter ;;
CREATE PROCEDURE `sp_so_update_price_list`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_name VARCHAR(120), IN p_customer_id CHAR(36), IN p_tier VARCHAR(40), IN p_is_default TINYINT, IN p_valid_from DATE, IN p_valid_to DATE, IN p_active TINYINT)
BEGIN
    IF p_customer_id IS NOT NULL AND p_customer_id <> '' AND NOT EXISTS (SELECT 1 FROM ar_customers WHERE id = p_customer_id AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'customer not found in company';
    END IF;
    UPDATE so_price_lists
    SET name = p_name, customer_id = NULLIF(p_customer_id,''), tier = NULLIF(p_tier,''), is_default = IFNULL(p_is_default,0),
        valid_from = p_valid_from, valid_to = p_valid_to, is_active = p_active
    WHERE id = p_id AND company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_delete_price_list`;
delimiter ;;
CREATE PROCEDURE `sp_so_delete_price_list`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    UPDATE so_price_lists SET is_deleted = 1 WHERE id = p_id AND company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_add_price_list_item`;
delimiter ;;
CREATE PROCEDURE `sp_so_add_price_list_item`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_plid CHAR(36), IN p_product_id CHAR(36), IN p_min_qty DECIMAL(15,2), IN p_unit_price DECIMAL(15,2), IN p_discount_pct DECIMAL(5,2))
BEGIN
    IF NOT EXISTS (SELECT 1 FROM so_price_lists WHERE id = p_plid AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'price list not found';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM inv_products WHERE id = p_product_id AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'product not found in company';
    END IF;
    INSERT INTO so_price_list_items (id, company_id, price_list_id, product_id, min_qty, unit_price, discount_pct)
    VALUES (p_id, p_cid, p_plid, p_product_id, IFNULL(p_min_qty,0), IFNULL(p_unit_price,0), IFNULL(p_discount_pct,0));
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_delete_price_list_item`;
delimiter ;;
CREATE PROCEDURE `sp_so_delete_price_list_item`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    DELETE FROM so_price_list_items WHERE id = p_id AND company_id = p_cid;
END
;;
delimiter ;


-- ---------- Quotes ----------

DROP PROCEDURE IF EXISTS `sp_so_get_quotes`;
delimiter ;;
CREATE PROCEDURE `sp_so_get_quotes`(IN p_cid CHAR(36), IN p_status VARCHAR(20))
BEGIN
    SELECT q.id, q.company_id, q.quote_number, q.customer_id, cu.name AS customer_name, q.price_list_id, q.status,
        q.quote_date, q.valid_until, q.subtotal, q.discount_pct, q.discount_amount, q.tax_amount, q.total_amount,
        q.notes, q.converted_order_id, q.created_at, q.updated_at,
        (SELECT COUNT(*) FROM so_quote_items i WHERE i.quote_id = q.id) AS item_count
    FROM so_quotes q
    LEFT JOIN ar_customers cu ON q.customer_id = cu.id AND cu.company_id = p_cid
    WHERE q.company_id = p_cid AND q.is_deleted = 0 AND (p_status = '' OR q.status = p_status)
    ORDER BY q.quote_number DESC;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_get_quote`;
delimiter ;;
CREATE PROCEDURE `sp_so_get_quote`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT q.id, q.company_id, q.quote_number, q.customer_id, cu.name AS customer_name, q.price_list_id, q.status,
        q.quote_date, q.valid_until, q.subtotal, q.discount_pct, q.discount_amount, q.tax_amount, q.total_amount,
        q.notes, q.converted_order_id, q.created_at, q.updated_at,
        (SELECT COUNT(*) FROM so_quote_items i WHERE i.quote_id = q.id) AS item_count
    FROM so_quotes q
    LEFT JOIN ar_customers cu ON q.customer_id = cu.id AND cu.company_id = p_cid
    WHERE q.id = p_id AND q.company_id = p_cid AND q.is_deleted = 0;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_get_quote_items`;
delimiter ;;
CREATE PROCEDURE `sp_so_get_quote_items`(IN p_qid CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT i.id, i.company_id, i.quote_id, i.product_id, p.name AS product_name, p.sku AS product_sku,
        i.description, i.quantity, i.unit_price, i.discount_pct, i.tax_rate, i.line_total, i.sort_order
    FROM so_quote_items i
    JOIN so_quotes q ON i.quote_id = q.id AND q.company_id = p_cid
    LEFT JOIN inv_products p ON i.product_id = p.id AND p.company_id = p_cid
    WHERE i.quote_id = p_qid AND i.company_id = p_cid
    ORDER BY i.sort_order, i.id;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_create_quote`;
delimiter ;;
CREATE PROCEDURE `sp_so_create_quote`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_custid CHAR(36), IN p_quote_date DATE, IN p_valid_until DATE, IN p_price_list_id CHAR(36), IN p_discount_pct DECIMAL(5,2), IN p_notes VARCHAR(500), IN p_by CHAR(36))
BEGIN
    DECLARE v_num INT;
    IF NOT EXISTS (SELECT 1 FROM ar_customers WHERE id = p_custid AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'customer not found in company';
    END IF;
    IF p_price_list_id IS NOT NULL AND p_price_list_id <> '' AND NOT EXISTS (SELECT 1 FROM so_price_lists WHERE id = p_price_list_id AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'price list not found in company';
    END IF;
    CALL sp_so_next_quote_number(p_cid, v_num);
    INSERT INTO so_quotes (id, company_id, quote_number, customer_id, price_list_id, status, quote_date, valid_until, discount_pct, notes, created_by)
    VALUES (p_id, p_cid, v_num, p_custid, NULLIF(p_price_list_id,''), 'Draft', p_quote_date, p_valid_until, IFNULL(p_discount_pct,0), NULLIF(p_notes,''), p_by);
    SELECT v_num AS quote_number;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_add_quote_item`;
delimiter ;;
CREATE PROCEDURE `sp_so_add_quote_item`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_qid CHAR(36), IN p_product_id CHAR(36), IN p_desc VARCHAR(500), IN p_qty DECIMAL(15,2), IN p_unit_price DECIMAL(15,2), IN p_discount_pct DECIMAL(5,2), IN p_tax_rate DECIMAL(5,2), IN p_sort INT)
BEGIN
    IF NOT EXISTS (SELECT 1 FROM so_quotes WHERE id = p_qid AND company_id = p_cid AND is_deleted = 0 AND status IN ('Draft','Sent')) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'quote not found or not editable';
    END IF;
    IF p_product_id IS NOT NULL AND p_product_id <> '' AND NOT EXISTS (SELECT 1 FROM inv_products WHERE id = p_product_id AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'product not found in company';
    END IF;
    INSERT INTO so_quote_items (id, company_id, quote_id, product_id, description, quantity, unit_price, discount_pct, tax_rate, line_total, sort_order)
    VALUES (p_id, p_cid, p_qid, NULLIF(p_product_id,''), NULLIF(p_desc,''), IFNULL(p_qty,0), IFNULL(p_unit_price,0), IFNULL(p_discount_pct,0), IFNULL(p_tax_rate,0),
        ROUND(IFNULL(p_qty,0)*IFNULL(p_unit_price,0)*(1-IFNULL(p_discount_pct,0)/100)*(1+IFNULL(p_tax_rate,0)/100),2), IFNULL(p_sort,0));
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_clear_quote_items`;
delimiter ;;
CREATE PROCEDURE `sp_so_clear_quote_items`(IN p_qid CHAR(36), IN p_cid CHAR(36))
BEGIN
    IF NOT EXISTS (SELECT 1 FROM so_quotes WHERE id = p_qid AND company_id = p_cid AND status IN ('Draft','Sent')) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'quote not editable';
    END IF;
    DELETE FROM so_quote_items WHERE quote_id = p_qid AND company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_update_quote`;
delimiter ;;
CREATE PROCEDURE `sp_so_update_quote`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_custid CHAR(36), IN p_quote_date DATE, IN p_valid_until DATE, IN p_price_list_id CHAR(36), IN p_discount_pct DECIMAL(5,2), IN p_notes VARCHAR(500))
BEGIN
    IF NOT EXISTS (SELECT 1 FROM ar_customers WHERE id = p_custid AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'customer not found in company';
    END IF;
    UPDATE so_quotes SET customer_id = p_custid, quote_date = p_quote_date, valid_until = p_valid_until,
        price_list_id = NULLIF(p_price_list_id,''), discount_pct = IFNULL(p_discount_pct,0), notes = NULLIF(p_notes,'')
    WHERE id = p_id AND company_id = p_cid AND status IN ('Draft','Sent');
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_update_quote_totals`;
delimiter ;;
CREATE PROCEDURE `sp_so_update_quote_totals`(IN p_qid CHAR(36), IN p_cid CHAR(36))
BEGIN
    UPDATE so_quotes q SET
        subtotal = IFNULL((SELECT SUM(ROUND(qi.quantity*qi.unit_price*(1-IFNULL(qi.discount_pct,0)/100),2)) FROM so_quote_items qi WHERE qi.quote_id = q.id),0),
        tax_amount = IFNULL((SELECT SUM(ROUND(qi.quantity*qi.unit_price*(1-IFNULL(qi.discount_pct,0)/100)*(1-IFNULL(q.discount_pct,0)/100)*IFNULL(qi.tax_rate,0)/100,2)) FROM so_quote_items qi WHERE qi.quote_id = q.id),0)
    WHERE q.id = p_qid AND q.company_id = p_cid;
    UPDATE so_quotes SET discount_amount = ROUND(subtotal*IFNULL(discount_pct,0)/100,2),
        total_amount = subtotal - ROUND(subtotal*IFNULL(discount_pct,0)/100,2) + tax_amount
    WHERE id = p_qid AND company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_update_quote_status`;
delimiter ;;
CREATE PROCEDURE `sp_so_update_quote_status`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_status VARCHAR(20))
BEGIN
    DECLARE v_cur VARCHAR(20);
    DECLARE v_total DECIMAL(15,2);
    DECLARE v_items INT;
    SELECT status, total_amount, (SELECT COUNT(*) FROM so_quote_items WHERE quote_id = p_id) INTO v_cur, v_total, v_items
    FROM so_quotes WHERE id = p_id AND company_id = p_cid AND is_deleted = 0;
    IF v_cur IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'quote not found'; END IF;
    IF v_cur = 'Converted' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'quote already converted'; END IF;
    IF p_status = 'Sent' AND (v_items = 0 OR v_total <= 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'quote needs at least one line and a positive total';
    END IF;
    UPDATE so_quotes SET status = p_status WHERE id = p_id AND company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_delete_quote`;
delimiter ;;
CREATE PROCEDURE `sp_so_delete_quote`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    UPDATE so_quotes SET is_deleted = 1 WHERE id = p_id AND company_id = p_cid AND status IN ('Draft','Sent','Rejected','Expired');
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_convert_quote`;
delimiter ;;
CREATE PROCEDURE `sp_so_convert_quote`(IN p_new_order_id CHAR(36), IN p_cid CHAR(36), IN p_qid CHAR(36), IN p_by CHAR(36))
BEGIN
    DECLARE v_status VARCHAR(20);
    DECLARE v_custid CHAR(36);
    DECLARE v_plid CHAR(36);
    DECLARE v_disc DECIMAL(5,2);
    DECLARE v_notes VARCHAR(500);
    DECLARE v_wh CHAR(36);
    DECLARE v_num INT;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    START TRANSACTION;

    SELECT status, customer_id, price_list_id, discount_pct, notes INTO v_status, v_custid, v_plid, v_disc, v_notes
    FROM so_quotes WHERE id = p_qid AND company_id = p_cid AND is_deleted = 0 FOR UPDATE;
    IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'quote not found'; END IF;
    IF v_status = 'Converted' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'quote already converted'; END IF;
    IF v_status <> 'Accepted' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'only an accepted quote can be converted'; END IF;

    -- default warehouse from settings, guarded to company
    SELECT default_warehouse_id INTO v_wh FROM so_settings WHERE company_id = p_cid;
    IF v_wh IS NOT NULL AND NOT EXISTS (SELECT 1 FROM inv_warehouses WHERE id = v_wh AND company_id = p_cid AND is_deleted = 0) THEN
        SET v_wh = NULL;
    END IF;

    CALL sp_so_next_order_number(p_cid, v_num);
    INSERT INTO so_orders (id, company_id, order_number, customer_id, quote_id, price_list_id, warehouse_id, status, order_date, discount_pct, notes, created_by)
    VALUES (p_new_order_id, p_cid, v_num, v_custid, p_qid, v_plid, v_wh, 'Draft', CURDATE(), IFNULL(v_disc,0), v_notes, p_by);

    INSERT INTO so_order_items (id, company_id, order_id, product_id, description, quantity, unit_price, discount_pct, tax_rate, warehouse_id, sort_order)
    SELECT UUID(), p_cid, p_new_order_id, qi.product_id, qi.description, qi.quantity, qi.unit_price, qi.discount_pct, qi.tax_rate, v_wh, qi.sort_order
    FROM so_quote_items qi
    WHERE qi.quote_id = p_qid AND qi.company_id = p_cid
      AND (qi.product_id IS NULL OR EXISTS (SELECT 1 FROM inv_products WHERE id = qi.product_id AND company_id = p_cid AND is_deleted = 0));

    UPDATE so_quotes SET status = 'Converted', converted_order_id = p_new_order_id WHERE id = p_qid AND company_id = p_cid;
    CALL sp_so_update_order_totals(p_new_order_id, p_cid);

    COMMIT;
    SELECT v_num AS order_number;
END
;;
delimiter ;


-- ---------- Orders ----------

DROP PROCEDURE IF EXISTS `sp_so_get_orders`;
delimiter ;;
CREATE PROCEDURE `sp_so_get_orders`(IN p_cid CHAR(36), IN p_status VARCHAR(20), IN p_custid CHAR(36))
BEGIN
    SELECT o.id, o.company_id, o.order_number, o.customer_id, cu.name AS customer_name, o.quote_id, o.price_list_id,
        o.warehouse_id, w.name AS warehouse_name, o.status, o.order_date, o.expected_ship_date, o.subtotal, o.discount_pct,
        o.discount_amount, o.tax_amount, o.total_amount, o.notes, o.invoice_id, o.revenue_journal_id, o.created_at, o.updated_at,
        (SELECT COUNT(*) FROM so_order_items i WHERE i.order_id = o.id) AS item_count, o.invoice_seq
    FROM so_orders o
    LEFT JOIN ar_customers cu ON o.customer_id = cu.id AND cu.company_id = p_cid
    LEFT JOIN inv_warehouses w ON o.warehouse_id = w.id AND w.company_id = p_cid
    WHERE o.company_id = p_cid AND o.is_deleted = 0 AND (p_status = '' OR o.status = p_status) AND (p_custid = '' OR o.customer_id = p_custid)
    ORDER BY o.order_number DESC;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_get_order`;
delimiter ;;
CREATE PROCEDURE `sp_so_get_order`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT o.id, o.company_id, o.order_number, o.customer_id, cu.name AS customer_name, o.quote_id, o.price_list_id,
        o.warehouse_id, w.name AS warehouse_name, o.status, o.order_date, o.expected_ship_date, o.subtotal, o.discount_pct,
        o.discount_amount, o.tax_amount, o.total_amount, o.notes, o.invoice_id, o.revenue_journal_id, o.created_at, o.updated_at,
        (SELECT COUNT(*) FROM so_order_items i WHERE i.order_id = o.id) AS item_count, o.invoice_seq
    FROM so_orders o
    LEFT JOIN ar_customers cu ON o.customer_id = cu.id AND cu.company_id = p_cid
    LEFT JOIN inv_warehouses w ON o.warehouse_id = w.id AND w.company_id = p_cid
    WHERE o.id = p_id AND o.company_id = p_cid AND o.is_deleted = 0;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_get_order_items`;
delimiter ;;
CREATE PROCEDURE `sp_so_get_order_items`(IN p_oid CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT oi.id, oi.company_id, oi.order_id, oi.product_id, p.name AS product_name, p.sku AS product_sku,
        oi.description, oi.quantity, oi.unit_price, oi.discount_pct, oi.tax_rate,
        oi.qty_reserved, oi.qty_fulfilled, oi.qty_invoiced,
        (oi.quantity - oi.qty_fulfilled) AS qty_backordered,
        oi.line_total, oi.warehouse_id, w.name AS warehouse_name, oi.revenue_account_id, oi.sort_order,
        GREATEST(0, IFNULL((SELECT st.quantity FROM inv_stock st WHERE st.product_id = oi.product_id AND st.warehouse_id = oi.warehouse_id),0)
            - IFNULL((SELECT SUM(r.qty_reserved) FROM so_reservations r WHERE r.company_id = p_cid AND r.product_id = oi.product_id AND r.warehouse_id = oi.warehouse_id AND r.status = 'Active'),0)) AS available_qty
    FROM so_order_items oi
    JOIN so_orders o ON oi.order_id = o.id AND o.company_id = p_cid
    LEFT JOIN inv_products p ON oi.product_id = p.id AND p.company_id = p_cid
    LEFT JOIN inv_warehouses w ON oi.warehouse_id = w.id AND w.company_id = p_cid
    WHERE oi.order_id = p_oid AND oi.company_id = p_cid
    ORDER BY oi.sort_order, oi.id;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_create_order`;
delimiter ;;
CREATE PROCEDURE `sp_so_create_order`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_custid CHAR(36), IN p_order_date DATE, IN p_expected DATE, IN p_price_list_id CHAR(36), IN p_warehouse_id CHAR(36), IN p_discount_pct DECIMAL(5,2), IN p_notes VARCHAR(500), IN p_by CHAR(36))
BEGIN
    DECLARE v_num INT;
    DECLARE v_wh CHAR(36);
    IF NOT EXISTS (SELECT 1 FROM ar_customers WHERE id = p_custid AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'customer not found in company';
    END IF;
    IF p_price_list_id IS NOT NULL AND p_price_list_id <> '' AND NOT EXISTS (SELECT 1 FROM so_price_lists WHERE id = p_price_list_id AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'price list not found in company';
    END IF;
    SET v_wh = NULLIF(p_warehouse_id, '');
    IF v_wh IS NULL THEN SELECT default_warehouse_id INTO v_wh FROM so_settings WHERE company_id = p_cid; END IF;
    IF v_wh IS NOT NULL AND NOT EXISTS (SELECT 1 FROM inv_warehouses WHERE id = v_wh AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'warehouse not found in company';
    END IF;
    CALL sp_so_next_order_number(p_cid, v_num);
    INSERT INTO so_orders (id, company_id, order_number, customer_id, price_list_id, warehouse_id, status, order_date, expected_ship_date, discount_pct, notes, created_by)
    VALUES (p_id, p_cid, v_num, p_custid, NULLIF(p_price_list_id,''), v_wh, 'Draft', p_order_date, p_expected, IFNULL(p_discount_pct,0), NULLIF(p_notes,''), p_by);
    SELECT v_num AS order_number;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_add_order_item`;
delimiter ;;
CREATE PROCEDURE `sp_so_add_order_item`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_oid CHAR(36), IN p_product_id CHAR(36), IN p_desc VARCHAR(500), IN p_qty DECIMAL(15,2), IN p_unit_price DECIMAL(15,2), IN p_discount_pct DECIMAL(5,2), IN p_tax_rate DECIMAL(5,2), IN p_warehouse_id CHAR(36), IN p_revenue_account_id CHAR(36), IN p_sort INT)
BEGIN
    DECLARE v_wh CHAR(36);
    IF NOT EXISTS (SELECT 1 FROM so_orders WHERE id = p_oid AND company_id = p_cid AND is_deleted = 0 AND status = 'Draft') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'order not found or not editable';
    END IF;
    IF p_product_id IS NOT NULL AND p_product_id <> '' AND NOT EXISTS (SELECT 1 FROM inv_products WHERE id = p_product_id AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'product not found in company';
    END IF;
    SET v_wh = NULLIF(p_warehouse_id, '');
    IF v_wh IS NULL THEN SELECT warehouse_id INTO v_wh FROM so_orders WHERE id = p_oid AND company_id = p_cid; END IF;
    IF v_wh IS NOT NULL AND NOT EXISTS (SELECT 1 FROM inv_warehouses WHERE id = v_wh AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'warehouse not found in company';
    END IF;
    CALL sp_so_assert_account(p_revenue_account_id, p_cid);
    INSERT INTO so_order_items (id, company_id, order_id, product_id, description, quantity, unit_price, discount_pct, tax_rate, warehouse_id, revenue_account_id, line_total, sort_order)
    VALUES (p_id, p_cid, p_oid, NULLIF(p_product_id,''), NULLIF(p_desc,''), IFNULL(p_qty,0), IFNULL(p_unit_price,0), IFNULL(p_discount_pct,0), IFNULL(p_tax_rate,0), v_wh, NULLIF(p_revenue_account_id,''),
        ROUND(IFNULL(p_qty,0)*IFNULL(p_unit_price,0)*(1-IFNULL(p_discount_pct,0)/100)*(1+IFNULL(p_tax_rate,0)/100),2), IFNULL(p_sort,0));
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_clear_order_items`;
delimiter ;;
CREATE PROCEDURE `sp_so_clear_order_items`(IN p_oid CHAR(36), IN p_cid CHAR(36))
BEGIN
    IF NOT EXISTS (SELECT 1 FROM so_orders WHERE id = p_oid AND company_id = p_cid AND status = 'Draft') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'order not editable';
    END IF;
    DELETE FROM so_order_items WHERE order_id = p_oid AND company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_update_order`;
delimiter ;;
CREATE PROCEDURE `sp_so_update_order`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_custid CHAR(36), IN p_order_date DATE, IN p_expected DATE, IN p_price_list_id CHAR(36), IN p_warehouse_id CHAR(36), IN p_discount_pct DECIMAL(5,2), IN p_notes VARCHAR(500))
BEGIN
    IF NOT EXISTS (SELECT 1 FROM ar_customers WHERE id = p_custid AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'customer not found in company';
    END IF;
    UPDATE so_orders SET customer_id = p_custid, order_date = p_order_date, expected_ship_date = p_expected,
        price_list_id = NULLIF(p_price_list_id,''), warehouse_id = NULLIF(p_warehouse_id,''), discount_pct = IFNULL(p_discount_pct,0), notes = NULLIF(p_notes,'')
    WHERE id = p_id AND company_id = p_cid AND status = 'Draft';
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_update_order_totals`;
delimiter ;;
CREATE PROCEDURE `sp_so_update_order_totals`(IN p_oid CHAR(36), IN p_cid CHAR(36))
BEGIN
    UPDATE so_order_items SET line_total = ROUND(quantity*unit_price*(1-IFNULL(discount_pct,0)/100)*(1+IFNULL(tax_rate,0)/100),2)
    WHERE order_id = p_oid AND company_id = p_cid;
    UPDATE so_orders o SET
        subtotal = IFNULL((SELECT SUM(ROUND(oi.quantity*oi.unit_price*(1-IFNULL(oi.discount_pct,0)/100),2)) FROM so_order_items oi WHERE oi.order_id = o.id),0),
        tax_amount = IFNULL((SELECT SUM(ROUND(oi.quantity*oi.unit_price*(1-IFNULL(oi.discount_pct,0)/100)*(1-IFNULL(o.discount_pct,0)/100)*IFNULL(oi.tax_rate,0)/100,2)) FROM so_order_items oi WHERE oi.order_id = o.id),0)
    WHERE o.id = p_oid AND o.company_id = p_cid;
    UPDATE so_orders SET discount_amount = ROUND(subtotal*IFNULL(discount_pct,0)/100,2),
        total_amount = subtotal - ROUND(subtotal*IFNULL(discount_pct,0)/100,2) + tax_amount
    WHERE id = p_oid AND company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_confirm_order`;
delimiter ;;
CREATE PROCEDURE `sp_so_confirm_order`(IN p_oid CHAR(36), IN p_cid CHAR(36), IN p_by CHAR(36))
BEGIN
    DECLARE v_status VARCHAR(20);
    DECLARE v_owh CHAR(36);
    DECLARE v_total DECIMAL(15,2);
    DECLARE v_items INT;
    DECLARE v_done INT DEFAULT 0;
    DECLARE v_iid CHAR(36);
    DECLARE v_pid CHAR(36);
    DECLARE v_wid CHAR(36);
    DECLARE v_qty DECIMAL(15,2);
    DECLARE v_ful DECIMAL(15,2);
    DECLARE v_onhand DECIMAL(15,2);
    DECLARE v_res DECIMAL(15,2);
    DECLARE v_need DECIMAL(15,2);
    DECLARE cur CURSOR FOR
        SELECT id, product_id, warehouse_id, quantity, qty_fulfilled FROM so_order_items
        WHERE order_id = p_oid AND company_id = p_cid AND product_id IS NOT NULL AND product_id <> '';
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    START TRANSACTION;

    SELECT status, warehouse_id, total_amount, (SELECT COUNT(*) FROM so_order_items WHERE order_id = p_oid) INTO v_status, v_owh, v_total, v_items
    FROM so_orders WHERE id = p_oid AND company_id = p_cid AND is_deleted = 0 FOR UPDATE;
    IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'order not found'; END IF;
    IF v_status <> 'Draft' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'only a draft order can be confirmed'; END IF;
    IF v_items = 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'order has no line items'; END IF;
    IF v_total <= 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'order total must be positive'; END IF;

    OPEN cur;
    conf_loop: LOOP
        FETCH cur INTO v_iid, v_pid, v_wid, v_qty, v_ful;
        IF v_done THEN LEAVE conf_loop; END IF;
        SET v_wid = IFNULL(NULLIF(v_wid, ''), v_owh);
        IF v_wid IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'order line has no warehouse to reserve from'; END IF;
        IF NOT EXISTS (SELECT 1 FROM inv_products WHERE id = v_pid AND company_id = p_cid AND is_deleted = 0) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'product not in company';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM inv_warehouses WHERE id = v_wid AND company_id = p_cid AND is_deleted = 0) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'warehouse not in company';
        END IF;
        SET v_onhand = IFNULL((SELECT st.quantity FROM inv_stock st JOIN inv_products p ON st.product_id = p.id AND p.company_id = p_cid WHERE st.product_id = v_pid AND st.warehouse_id = v_wid), 0);
        SET v_res = IFNULL((SELECT SUM(qty_reserved) FROM so_reservations WHERE company_id = p_cid AND product_id = v_pid AND warehouse_id = v_wid AND status = 'Active'), 0);
        SET v_need = v_qty - v_ful;
        IF v_need > 0 AND (v_onhand - v_res) < v_need THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Insufficient available stock to confirm order';
        END IF;
        INSERT INTO so_reservations (id, company_id, order_id, order_item_id, product_id, warehouse_id, qty_reserved, status)
        VALUES (UUID(), p_cid, p_oid, v_iid, v_pid, v_wid, GREATEST(0, v_need), 'Active')
        ON DUPLICATE KEY UPDATE qty_reserved = GREATEST(0, v_need), status = 'Active';
        UPDATE so_order_items SET qty_reserved = GREATEST(0, v_need), warehouse_id = v_wid WHERE id = v_iid;
    END LOOP;
    CLOSE cur;

    UPDATE so_orders SET status = 'Confirmed' WHERE id = p_oid AND company_id = p_cid;
    COMMIT;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_cancel_order`;
delimiter ;;
CREATE PROCEDURE `sp_so_cancel_order`(IN p_oid CHAR(36), IN p_cid CHAR(36))
BEGIN
    DECLARE v_status VARCHAR(20);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
    START TRANSACTION;
    SELECT status INTO v_status FROM so_orders WHERE id = p_oid AND company_id = p_cid AND is_deleted = 0 FOR UPDATE;
    IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'order not found'; END IF;
    IF v_status IN ('Cancelled','Closed','Invoiced','Fulfilled') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'order cannot be cancelled in its current state'; END IF;
    -- release whatever remains reserved (do not reverse shipped stock/COGS)
    UPDATE so_reservations SET qty_reserved = 0, status = 'Released' WHERE order_id = p_oid AND company_id = p_cid AND status = 'Active';
    UPDATE so_order_items SET qty_reserved = 0 WHERE order_id = p_oid AND company_id = p_cid;
    UPDATE so_orders SET status = 'Cancelled' WHERE id = p_oid AND company_id = p_cid;
    COMMIT;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_close_order`;
delimiter ;;
CREATE PROCEDURE `sp_so_close_order`(IN p_oid CHAR(36), IN p_cid CHAR(36))
BEGIN
    UPDATE so_orders SET status = 'Closed' WHERE id = p_oid AND company_id = p_cid AND status = 'Invoiced';
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_delete_order`;
delimiter ;;
CREATE PROCEDURE `sp_so_delete_order`(IN p_oid CHAR(36), IN p_cid CHAR(36))
BEGIN
    UPDATE so_orders SET is_deleted = 1 WHERE id = p_oid AND company_id = p_cid AND status IN ('Draft','Cancelled');
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_get_reservations`;
delimiter ;;
CREATE PROCEDURE `sp_so_get_reservations`(IN p_cid CHAR(36), IN p_oid CHAR(36))
BEGIN
    SELECT r.id, r.company_id, r.order_id, r.order_item_id, r.product_id, p.name AS product_name,
        r.warehouse_id, w.name AS warehouse_name, r.qty_reserved, r.status
    FROM so_reservations r
    LEFT JOIN inv_products p ON r.product_id = p.id AND p.company_id = p_cid
    LEFT JOIN inv_warehouses w ON r.warehouse_id = w.id AND w.company_id = p_cid
    WHERE r.company_id = p_cid AND (p_oid = '' OR r.order_id = p_oid) AND r.status = 'Active'
    ORDER BY r.created_at DESC;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_get_backorders`;
delimiter ;;
CREATE PROCEDURE `sp_so_get_backorders`(IN p_cid CHAR(36))
BEGIN
    SELECT o.id AS order_id, o.order_number, o.customer_id, cu.name AS customer_name, o.status,
        oi.id AS order_item_id, oi.product_id, p.name AS product_name, p.sku AS product_sku,
        oi.quantity, oi.qty_fulfilled, (oi.quantity - oi.qty_fulfilled) AS qty_backordered
    FROM so_order_items oi
    JOIN so_orders o ON oi.order_id = o.id AND o.company_id = p_cid AND o.is_deleted = 0
    LEFT JOIN ar_customers cu ON o.customer_id = cu.id AND cu.company_id = p_cid
    LEFT JOIN inv_products p ON oi.product_id = p.id AND p.company_id = p_cid
    WHERE oi.company_id = p_cid AND o.status IN ('Confirmed','PartiallyFulfilled') AND oi.qty_fulfilled < oi.quantity
    ORDER BY o.order_number DESC;
END
;;
delimiter ;


-- ---------- Shipments (fulfillment) ----------

DROP PROCEDURE IF EXISTS `sp_so_get_shipments`;
delimiter ;;
CREATE PROCEDURE `sp_so_get_shipments`(IN p_cid CHAR(36), IN p_oid CHAR(36))
BEGIN
    SELECT s.id, s.company_id, s.shipment_number, s.order_id, o.order_number, s.warehouse_id, w.name AS warehouse_name,
        s.status, s.carrier, s.tracking_number, s.ship_date, s.delivered_date, s.notes, s.created_at,
        (SELECT COUNT(*) FROM so_shipment_items i WHERE i.shipment_id = s.id) AS item_count
    FROM so_shipments s
    LEFT JOIN so_orders o ON s.order_id = o.id AND o.company_id = p_cid
    LEFT JOIN inv_warehouses w ON s.warehouse_id = w.id AND w.company_id = p_cid
    WHERE s.company_id = p_cid AND s.is_deleted = 0 AND (p_oid = '' OR s.order_id = p_oid)
    ORDER BY s.shipment_number DESC;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_get_shipment_items`;
delimiter ;;
CREATE PROCEDURE `sp_so_get_shipment_items`(IN p_sid CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT i.id, i.company_id, i.shipment_id, i.order_item_id, i.product_id, p.name AS product_name, p.sku AS product_sku,
        i.quantity, i.movement_id, i.journal_entry_id
    FROM so_shipment_items i
    JOIN so_shipments s ON i.shipment_id = s.id AND s.company_id = p_cid
    LEFT JOIN inv_products p ON i.product_id = p.id AND p.company_id = p_cid
    WHERE i.shipment_id = p_sid AND i.company_id = p_cid
    ORDER BY i.id;
END
;;
delimiter ;

-- Fulfill: create the shipment, decrement inv_stock + write the 'out' movement,
-- bump counters, release reservations — ALL atomic. Go posts COGS afterwards
-- (reading the movement ids off so_shipment_items).
DROP PROCEDURE IF EXISTS `sp_so_fulfill`;
delimiter ;;
CREATE PROCEDURE `sp_so_fulfill`(IN p_ship_id CHAR(36), IN p_cid CHAR(36), IN p_oid CHAR(36), IN p_by CHAR(36), IN p_wid CHAR(36), IN p_carrier VARCHAR(120), IN p_tracking VARCHAR(120), IN p_shipdate DATE, IN p_notes VARCHAR(500), IN p_lines JSON)
BEGIN
    DECLARE v_status VARCHAR(20);
    DECLARE v_owh CHAR(36);
    DECLARE v_onum INT;
    DECLARE v_shipnum INT;
    DECLARE v_done INT DEFAULT 0;
    DECLARE v_oi CHAR(36);
    DECLARE v_ship DECIMAL(15,2);
    DECLARE v_pid CHAR(36);
    DECLARE v_wid CHAR(36);
    DECLARE v_qord DECIMAL(15,2);
    DECLARE v_qful DECIMAL(15,2);
    DECLARE v_onhand DECIMAL(15,2);
    DECLARE v_cost DECIMAL(15,2);
    DECLARE v_bal DECIMAL(15,2);
    DECLARE v_mid CHAR(36);
    DECLARE v_sumful DECIMAL(15,2);
    DECLARE v_sumord DECIMAL(15,2);
    DECLARE cur CURSOR FOR
        SELECT jt.order_item_id, jt.ship_qty, oi.product_id, oi.warehouse_id, oi.quantity, oi.qty_fulfilled
        FROM JSON_TABLE(p_lines, '$[*]' COLUMNS(order_item_id CHAR(36) PATH '$.order_item_id', ship_qty DECIMAL(15,2) PATH '$.ship_qty')) jt
        JOIN so_order_items oi ON oi.id = jt.order_item_id AND oi.order_id = p_oid AND oi.company_id = p_cid;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    START TRANSACTION;

    SELECT status, warehouse_id, order_number INTO v_status, v_owh, v_onum
    FROM so_orders WHERE id = p_oid AND company_id = p_cid AND is_deleted = 0 FOR UPDATE;
    IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'order not found'; END IF;
    IF v_status NOT IN ('Confirmed','PartiallyFulfilled') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'order must be confirmed to fulfill'; END IF;

    CALL sp_so_next_shipment_number(p_cid, v_shipnum);
    INSERT INTO so_shipments (id, company_id, shipment_number, order_id, warehouse_id, status, carrier, tracking_number, ship_date, notes, created_by)
    VALUES (p_ship_id, p_cid, v_shipnum, p_oid, NULLIF(p_wid,''), 'Shipped', NULLIF(p_carrier,''), NULLIF(p_tracking,''), p_shipdate, NULLIF(p_notes,''), p_by);

    OPEN cur;
    ful_loop: LOOP
        FETCH cur INTO v_oi, v_ship, v_pid, v_wid, v_qord, v_qful;
        IF v_done THEN LEAVE ful_loop; END IF;
        IF v_ship IS NULL OR v_ship <= 0 THEN ITERATE ful_loop; END IF;
        -- Re-read the committed quantities so a duplicate order_item_id in one request
        -- (or a concurrent shipment) can't over-fulfill against the cursor's stale snapshot.
        SELECT quantity, qty_fulfilled INTO v_qord, v_qful FROM so_order_items WHERE id = v_oi AND company_id = p_cid;
        IF v_ship > (v_qord - v_qful) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ship quantity exceeds the remaining unfulfilled quantity'; END IF;
        SET v_wid = IFNULL(NULLIF(v_wid,''), IFNULL(NULLIF(p_wid,''), v_owh));

        IF v_pid IS NOT NULL AND v_pid <> '' THEN
            IF v_wid IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'no warehouse to ship from'; END IF;
            INSERT INTO inv_stock (id, company_id, product_id, warehouse_id, quantity) VALUES (UUID(), p_cid, v_pid, v_wid, 0)
                ON DUPLICATE KEY UPDATE quantity = quantity;
            SELECT quantity INTO v_onhand FROM inv_stock WHERE product_id = v_pid AND warehouse_id = v_wid FOR UPDATE;
            IF v_onhand < v_ship THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'insufficient stock to ship'; END IF;
            SET v_cost = IFNULL((SELECT cost_price FROM inv_products WHERE id = v_pid AND company_id = p_cid), 0);
            SET v_bal = v_onhand - v_ship;
            SET v_mid = UUID();
            UPDATE inv_stock SET quantity = v_bal WHERE product_id = v_pid AND warehouse_id = v_wid;
            INSERT INTO inv_movements (id, company_id, product_id, warehouse_id, movement_type, quantity, unit_cost, reference, balance_after, created_by)
            VALUES (v_mid, p_cid, v_pid, v_wid, 'out', v_ship, v_cost, CONCAT('SO-', LPAD(v_onum, 6, '0')), v_bal, p_by);
            UPDATE so_reservations SET qty_reserved = GREATEST(0, qty_reserved - v_ship), status = IF(GREATEST(0, qty_reserved - v_ship) = 0, 'Released', 'Active')
                WHERE order_item_id = v_oi AND warehouse_id = v_wid AND company_id = p_cid AND status = 'Active';
        ELSE
            SET v_mid = NULL;
        END IF;

        INSERT INTO so_shipment_items (id, company_id, shipment_id, order_item_id, product_id, quantity, movement_id)
        VALUES (UUID(), p_cid, p_ship_id, v_oi, NULLIF(v_pid,''), v_ship, v_mid);
        UPDATE so_order_items SET qty_fulfilled = qty_fulfilled + v_ship, qty_reserved = GREATEST(0, qty_reserved - v_ship) WHERE id = v_oi;
    END LOOP;
    CLOSE cur;

    SELECT IFNULL(SUM(qty_fulfilled),0), IFNULL(SUM(quantity),0) INTO v_sumful, v_sumord FROM so_order_items WHERE order_id = p_oid AND company_id = p_cid;
    UPDATE so_orders SET status = IF(v_sumful >= v_sumord, 'Fulfilled', 'PartiallyFulfilled') WHERE id = p_oid AND company_id = p_cid;

    COMMIT;
    SELECT p_ship_id AS shipment_id;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_set_shipment_item_journal`;
delimiter ;;
CREATE PROCEDURE `sp_so_set_shipment_item_journal`(IN p_movement_id CHAR(36), IN p_cid CHAR(36), IN p_jid CHAR(36))
BEGIN
    UPDATE so_shipment_items SET journal_entry_id = p_jid WHERE movement_id = p_movement_id AND company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_so_mark_shipment_delivered`;
delimiter ;;
CREATE PROCEDURE `sp_so_mark_shipment_delivered`(IN p_sid CHAR(36), IN p_cid CHAR(36), IN p_date DATE)
BEGIN
    UPDATE so_shipments SET status = 'Delivered', delivered_date = IFNULL(p_date, CURDATE())
    WHERE id = p_sid AND company_id = p_cid AND status = 'Shipped';
END
;;
delimiter ;

-- Cancel a shipment: reverse the stock ('in' movements), un-fulfill the lines,
-- re-open reservations if the order is still active. Returns the reversed lines
-- so Go can post the COGS reversal (Dr Inventory / Cr COGS).
DROP PROCEDURE IF EXISTS `sp_so_cancel_shipment`;
delimiter ;;
CREATE PROCEDURE `sp_so_cancel_shipment`(IN p_sid CHAR(36), IN p_cid CHAR(36), IN p_by CHAR(36))
BEGIN
    DECLARE v_status VARCHAR(20);
    DECLARE v_oid CHAR(36);
    DECLARE v_onum INT;
    DECLARE v_ostatus VARCHAR(20);
    DECLARE v_done INT DEFAULT 0;
    DECLARE v_oi CHAR(36);
    DECLARE v_pid CHAR(36);
    DECLARE v_qty DECIMAL(15,2);
    DECLARE v_wid CHAR(36);
    DECLARE v_cost DECIMAL(15,2);
    DECLARE v_bal DECIMAL(15,2);
    DECLARE v_mid CHAR(36);
    DECLARE v_sumful DECIMAL(15,2);
    DECLARE cur CURSOR FOR
        SELECT si.order_item_id, si.product_id, si.quantity, m.warehouse_id, COALESCE(m.unit_cost, 0)
        FROM so_shipment_items si
        JOIN inv_movements m ON si.movement_id = m.id
        WHERE si.shipment_id = p_sid AND si.company_id = p_cid AND si.product_id IS NOT NULL;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    START TRANSACTION;

    SELECT s.status, s.order_id, o.order_number, o.status INTO v_status, v_oid, v_onum, v_ostatus
    FROM so_shipments s JOIN so_orders o ON s.order_id = o.id AND o.company_id = p_cid
    WHERE s.id = p_sid AND s.company_id = p_cid AND s.is_deleted = 0 FOR UPDATE;
    IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'shipment not found'; END IF;
    IF v_status = 'Cancelled' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'shipment already cancelled'; END IF;
    IF v_ostatus = 'Invoiced' OR v_ostatus = 'Closed' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'cannot cancel a shipment of an invoiced order'; END IF;
    -- Un-fulfilling any line below what has already been invoiced would break
    -- qty_invoiced <= qty_fulfilled and reverse COGS for recognised revenue.
    IF EXISTS (
        SELECT 1 FROM so_order_items oi
        JOIN (SELECT order_item_id, SUM(quantity) AS sq FROM so_shipment_items WHERE shipment_id = p_sid AND company_id = p_cid GROUP BY order_item_id) sh
          ON sh.order_item_id = oi.id
        WHERE oi.company_id = p_cid AND oi.qty_invoiced > (oi.qty_fulfilled - sh.sq)
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'cannot cancel a shipment whose quantities have already been invoiced';
    END IF;

    -- temp table to hand the reversal movements back to Go for the COGS reversal
    DROP TEMPORARY TABLE IF EXISTS tmp_so_cancel;
    CREATE TEMPORARY TABLE tmp_so_cancel (movement_id CHAR(36), product_id CHAR(36), quantity DECIMAL(15,2), unit_cost DECIMAL(15,2));

    OPEN cur;
    canc_loop: LOOP
        FETCH cur INTO v_oi, v_pid, v_qty, v_wid, v_cost;
        IF v_done THEN LEAVE canc_loop; END IF;
        INSERT INTO inv_stock (id, company_id, product_id, warehouse_id, quantity) VALUES (UUID(), p_cid, v_pid, v_wid, 0)
            ON DUPLICATE KEY UPDATE quantity = quantity;
        SELECT quantity INTO v_bal FROM inv_stock WHERE product_id = v_pid AND warehouse_id = v_wid FOR UPDATE;
        SET v_bal = v_bal + v_qty;
        SET v_mid = UUID();
        UPDATE inv_stock SET quantity = v_bal WHERE product_id = v_pid AND warehouse_id = v_wid;
        INSERT INTO inv_movements (id, company_id, product_id, warehouse_id, movement_type, quantity, unit_cost, reference, balance_after, created_by)
        VALUES (v_mid, p_cid, v_pid, v_wid, 'in', v_qty, v_cost, CONCAT('SO-', LPAD(v_onum, 6, '0'), ' cancel'), v_bal, p_by);
        UPDATE so_order_items SET qty_fulfilled = GREATEST(0, qty_fulfilled - v_qty) WHERE id = v_oi AND company_id = p_cid;
        INSERT INTO tmp_so_cancel VALUES (v_mid, v_pid, v_qty, v_cost);
    END LOOP;
    CLOSE cur;

    UPDATE so_shipments SET status = 'Cancelled' WHERE id = p_sid AND company_id = p_cid;
    SELECT IFNULL(SUM(qty_fulfilled),0) INTO v_sumful FROM so_order_items WHERE order_id = v_oid AND company_id = p_cid;
    UPDATE so_orders SET status = CASE WHEN v_sumful <= 0 THEN 'Confirmed' ELSE 'PartiallyFulfilled' END
        WHERE id = v_oid AND company_id = p_cid AND status IN ('Fulfilled','PartiallyFulfilled');

    COMMIT;
    SELECT movement_id, product_id, quantity, unit_cost FROM tmp_so_cancel;
    DROP TEMPORARY TABLE IF EXISTS tmp_so_cancel;
END
;;
delimiter ;


-- ---------- Invoicing (reuses AR; revenue built in Go) ----------

DROP PROCEDURE IF EXISTS `sp_so_get_uninvoiced`;
delimiter ;;
CREATE PROCEDURE `sp_so_get_uninvoiced`(IN p_oid CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT oi.id AS order_item_id, oi.product_id, p.name AS product_name, oi.description,
        (oi.qty_fulfilled - oi.qty_invoiced) AS billable_qty, oi.unit_price, oi.discount_pct, oi.tax_rate, oi.revenue_account_id
    FROM so_order_items oi
    JOIN so_orders o ON oi.order_id = o.id AND o.company_id = p_cid
    LEFT JOIN inv_products p ON oi.product_id = p.id AND p.company_id = p_cid
    WHERE oi.order_id = p_oid AND oi.company_id = p_cid AND (oi.qty_fulfilled - oi.qty_invoiced) > 0
    ORDER BY oi.sort_order, oi.id;
END
;;
delimiter ;

-- Mark billable qty invoiced under the order lock; returns count of lines invoiced.
DROP PROCEDURE IF EXISTS `sp_so_mark_invoiced`;
delimiter ;;
CREATE PROCEDURE `sp_so_mark_invoiced`(IN p_oid CHAR(36), IN p_cid CHAR(36), IN p_invoice_id CHAR(36), IN p_journal_id CHAR(36))
BEGIN
    DECLARE v_status VARCHAR(20);
    DECLARE v_count INT DEFAULT 0;
    DECLARE v_seq INT DEFAULT 0;
    DECLARE v_sumful DECIMAL(15,2);
    DECLARE v_suminv DECIMAL(15,2);
    DECLARE v_ord DECIMAL(15,2);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    START TRANSACTION;
    SELECT status, invoice_seq INTO v_status, v_seq FROM so_orders WHERE id = p_oid AND company_id = p_cid AND is_deleted = 0 FOR UPDATE;
    IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'order not found'; END IF;

    SELECT COUNT(*) INTO v_count FROM so_order_items WHERE order_id = p_oid AND company_id = p_cid AND qty_fulfilled > qty_invoiced;
    IF v_count > 0 THEN
        UPDATE so_order_items SET qty_invoiced = qty_fulfilled WHERE order_id = p_oid AND company_id = p_cid AND qty_fulfilled > qty_invoiced;
        INSERT INTO so_order_invoices (id, company_id, order_id, invoice_id, revenue_journal_id) VALUES (UUID(), p_cid, p_oid, p_invoice_id, NULLIF(p_journal_id,''));
        UPDATE so_orders SET invoice_seq = v_seq + 1,
            invoice_id = IF(v_seq = 0, p_invoice_id, invoice_id),
            revenue_journal_id = IF(v_seq = 0, NULLIF(p_journal_id,''), revenue_journal_id)
        WHERE id = p_oid AND company_id = p_cid;
        SELECT IFNULL(SUM(qty_fulfilled),0), IFNULL(SUM(qty_invoiced),0), IFNULL(SUM(quantity),0) INTO v_sumful, v_suminv, v_ord FROM so_order_items WHERE order_id = p_oid AND company_id = p_cid;
        IF v_suminv >= v_ord AND v_ord > 0 THEN
            UPDATE so_orders SET status = 'Invoiced' WHERE id = p_oid AND company_id = p_cid;
        END IF;
    END IF;
    COMMIT;
    SELECT v_count AS invoiced_lines, v_seq + 1 AS invoice_seq;
END
;;
delimiter ;


-- ---------- Dashboard ----------

DROP PROCEDURE IF EXISTS `sp_so_stats`;
delimiter ;;
CREATE PROCEDURE `sp_so_stats`(IN p_cid CHAR(36))
BEGIN
    SELECT
        (SELECT COUNT(*) FROM so_orders WHERE company_id = p_cid AND is_deleted = 0) AS total_orders,
        (SELECT COUNT(*) FROM so_orders WHERE company_id = p_cid AND is_deleted = 0 AND status IN ('Confirmed','PartiallyFulfilled')) AS open_orders,
        (SELECT COUNT(*) FROM so_quotes WHERE company_id = p_cid AND is_deleted = 0 AND status IN ('Draft','Sent')) AS draft_quotes,
        (SELECT COUNT(*) FROM so_order_items oi JOIN so_orders o ON oi.order_id = o.id AND o.company_id = p_cid AND o.is_deleted = 0
            WHERE o.status IN ('Confirmed','PartiallyFulfilled') AND oi.qty_fulfilled < oi.quantity) AS backorders_pending,
        (SELECT COUNT(*) FROM ar_customers WHERE company_id = p_cid AND is_deleted = 0) AS total_customers,
        IFNULL((SELECT SUM(total_amount) FROM so_orders WHERE company_id = p_cid AND is_deleted = 0 AND status IN ('Draft','Confirmed','PartiallyFulfilled')),0) AS open_order_value,
        IFNULL((SELECT SUM(total_credit) FROM acc_journal_entries WHERE company_id = p_cid AND source_type = 'sales' AND status = 'Posted' AND entry_date >= DATE_FORMAT(CURDATE(),'%Y-%m-01')),0) AS revenue_this_month;
END
;;
delimiter ;
