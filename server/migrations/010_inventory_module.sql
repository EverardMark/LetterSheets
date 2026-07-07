-- ============================================================================
-- Migration 010: Inventory module
--
--   A full inventory / stock-control module, company-scoped for tenant
--   isolation (every procedure keys on p_cid, matching migrations 003-009):
--
--     * inv_categories       — product categories
--     * inv_warehouses       — storage locations (multi-warehouse)
--     * inv_suppliers        — inventory supplier directory
--     * inv_products         — item catalog (SKU, cost/selling price, reorder)
--     * inv_stock            — running balance per product + warehouse
--     * inv_movements        — stock-movement ledger (in/out/adjust/transfer)
--     * inv_purchase_orders  — purchase orders + inv_po_items line items
--     * inv_settings         — accounting-integration account mappings
--     * inv_po_sequences     — per-company PO number counter
--
--   Stock is mutated ONLY through transactional procedures
--   (sp_inv_record_movement / sp_inv_transfer_stock / sp_inv_receive_po) that
--   lock the balance row FOR UPDATE and refuse to drive stock negative.
--   Accounting postings (Dr Inventory / Cr Payable, Dr COGS / Cr Inventory,
--   adjustment gains/losses) are built in the Go layer by reusing the existing
--   journal primitives, and linked back via journal_entry_id.
--
--   Apply BEFORE/with the matching server build (needs a privileged MySQL user —
--   CREATE TABLE / ALTER ROUTINE):
--     mysql -u root -p lettersheets < server/migrations/010_inventory_module.sql
-- ============================================================================


-- ---------- Tables ----------

CREATE TABLE IF NOT EXISTS `inv_categories` (
  `id`          char(36)     NOT NULL DEFAULT (uuid()),
  `company_id`  char(36)     NOT NULL,
  `name`        varchar(100) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `is_active`   tinyint(1)   DEFAULT '1',
  `is_deleted`  tinyint(1)   DEFAULT '0',
  `created_at`  timestamp    NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_invcat` (`company_id`,`is_deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `inv_warehouses` (
  `id`          char(36)     NOT NULL DEFAULT (uuid()),
  `company_id`  char(36)     NOT NULL,
  `name`        varchar(100) NOT NULL,
  `code`        varchar(30)  DEFAULT NULL,
  `location`    varchar(255) DEFAULT NULL,
  `is_default`  tinyint(1)   DEFAULT '0',
  `is_active`   tinyint(1)   DEFAULT '1',
  `is_deleted`  tinyint(1)   DEFAULT '0',
  `created_at`  timestamp    NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_invwh` (`company_id`,`is_deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `inv_suppliers` (
  `id`             char(36)     NOT NULL DEFAULT (uuid()),
  `company_id`     char(36)     NOT NULL,
  `name`           varchar(150) NOT NULL,
  `contact_person` varchar(100) DEFAULT NULL,
  `email`          varchar(150) DEFAULT NULL,
  `phone`          varchar(50)  DEFAULT NULL,
  `address`        varchar(255) DEFAULT NULL,
  `notes`          varchar(500) DEFAULT NULL,
  `is_active`      tinyint(1)   DEFAULT '1',
  `is_deleted`     tinyint(1)   DEFAULT '0',
  `created_at`     timestamp    NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_invsup` (`company_id`,`is_deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `inv_products` (
  `id`            char(36)      NOT NULL DEFAULT (uuid()),
  `company_id`    char(36)      NOT NULL,
  `sku`           varchar(60)   NOT NULL,
  `name`          varchar(150)  NOT NULL,
  `description`   varchar(500)  DEFAULT NULL,
  `category_id`   char(36)      DEFAULT NULL,
  `supplier_id`   char(36)      DEFAULT NULL,
  `unit`          varchar(20)   DEFAULT 'pcs',
  `cost_price`    decimal(15,2) DEFAULT '0.00',
  `selling_price` decimal(15,2) DEFAULT '0.00',
  `reorder_point` decimal(15,2) DEFAULT '0.00',
  `is_active`     tinyint(1)    DEFAULT '1',
  `is_deleted`    tinyint(1)    DEFAULT '0',
  `created_at`    timestamp     NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    timestamp     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_invprod` (`company_id`,`is_deleted`),
  KEY `idx_invprod_cat` (`category_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `inv_stock` (
  `id`           char(36)      NOT NULL DEFAULT (uuid()),
  `company_id`   char(36)      NOT NULL,
  `product_id`   char(36)      NOT NULL,
  `warehouse_id` char(36)      NOT NULL,
  `quantity`     decimal(15,2) DEFAULT '0.00',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_invstock` (`product_id`,`warehouse_id`),
  KEY `idx_invstock_comp` (`company_id`),
  KEY `idx_invstock_wh` (`warehouse_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `inv_movements` (
  `id`                   char(36)      NOT NULL DEFAULT (uuid()),
  `company_id`           char(36)      NOT NULL,
  `product_id`           char(36)      NOT NULL,
  `warehouse_id`         char(36)      NOT NULL,
  `movement_type`        varchar(20)   NOT NULL,
  `quantity`             decimal(15,2) NOT NULL,
  `unit_cost`            decimal(15,2) DEFAULT '0.00',
  `reference`            varchar(100)  DEFAULT NULL,
  `notes`                varchar(500)  DEFAULT NULL,
  `related_warehouse_id` char(36)      DEFAULT NULL,
  `balance_after`        decimal(15,2) DEFAULT '0.00',
  `journal_entry_id`     char(36)      DEFAULT NULL,
  `created_by`           char(36)      DEFAULT NULL,
  `created_at`           timestamp     NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_invmov` (`company_id`,`created_at`),
  KEY `idx_invmov_prod` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `inv_settings` (
  `company_id`            char(36)   NOT NULL,
  `auto_post_gl`          tinyint(1) DEFAULT '0',
  `inventory_account_id`  char(36)   DEFAULT NULL,
  `cogs_account_id`       char(36)   DEFAULT NULL,
  `adjustment_account_id` char(36)   DEFAULT NULL,
  `payable_account_id`    char(36)   DEFAULT NULL,
  `updated_at`            timestamp  NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`company_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `inv_po_sequences` (
  `company_id`  char(36) NOT NULL,
  `next_number` int      DEFAULT '1',
  PRIMARY KEY (`company_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `inv_purchase_orders` (
  `id`               char(36)      NOT NULL DEFAULT (uuid()),
  `company_id`       char(36)      NOT NULL,
  `po_number`        int           NOT NULL,
  `supplier_id`      char(36)      DEFAULT NULL,
  `warehouse_id`     char(36)      DEFAULT NULL,
  `status`           varchar(20)   DEFAULT 'Draft',
  `order_date`       date          DEFAULT NULL,
  `expected_date`    date          DEFAULT NULL,
  `notes`            varchar(500)  DEFAULT NULL,
  `total_amount`     decimal(15,2) DEFAULT '0.00',
  `journal_entry_id` char(36)      DEFAULT NULL,
  `created_by`       char(36)      DEFAULT NULL,
  `is_deleted`       tinyint(1)    DEFAULT '0',
  `created_at`       timestamp     NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       timestamp     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_invpo` (`company_id`,`is_deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `inv_po_items` (
  `id`           char(36)      NOT NULL DEFAULT (uuid()),
  `company_id`   char(36)      NOT NULL,
  `po_id`        char(36)      NOT NULL,
  `product_id`   char(36)      NOT NULL,
  `quantity`     decimal(15,2) DEFAULT '0.00',
  `received_qty` decimal(15,2) DEFAULT '0.00',
  `unit_cost`    decimal(15,2) DEFAULT '0.00',
  PRIMARY KEY (`id`),
  KEY `idx_invpoitem` (`po_id`),
  CONSTRAINT `inv_po_items_ibfk_1` FOREIGN KEY (`po_id`) REFERENCES `inv_purchase_orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- ---------- Categories: CRUD ----------

DROP PROCEDURE IF EXISTS `sp_inv_get_categories`;
delimiter ;;
CREATE PROCEDURE `sp_inv_get_categories`(IN p_cid CHAR(36))
BEGIN
    SELECT c.id, c.company_id, c.name, c.description, c.is_active, c.is_deleted, c.created_at,
        (SELECT COUNT(*) FROM inv_products p WHERE p.category_id = c.id AND p.is_deleted = 0) AS product_count
    FROM inv_categories c
    WHERE c.company_id = p_cid AND c.is_deleted = 0
    ORDER BY c.name;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_inv_create_category`;
delimiter ;;
CREATE PROCEDURE `sp_inv_create_category`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_name VARCHAR(100), IN p_desc VARCHAR(255))
BEGIN
    INSERT INTO inv_categories (id, company_id, name, description)
    VALUES (p_id, p_cid, p_name, NULLIF(p_desc, ''));
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_inv_update_category`;
delimiter ;;
CREATE PROCEDURE `sp_inv_update_category`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_name VARCHAR(100), IN p_desc VARCHAR(255), IN p_active TINYINT)
BEGIN
    UPDATE inv_categories
    SET name = p_name, description = NULLIF(p_desc, ''), is_active = p_active
    WHERE id = p_id AND company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_inv_delete_category`;
delimiter ;;
CREATE PROCEDURE `sp_inv_delete_category`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    UPDATE inv_categories SET is_deleted = 1 WHERE id = p_id AND company_id = p_cid;
    -- Detach the category from any products so they don't dangle.
    UPDATE inv_products SET category_id = NULL WHERE category_id = p_id AND company_id = p_cid;
END
;;
delimiter ;


-- ---------- Warehouses: CRUD ----------

DROP PROCEDURE IF EXISTS `sp_inv_get_warehouses`;
delimiter ;;
CREATE PROCEDURE `sp_inv_get_warehouses`(IN p_cid CHAR(36))
BEGIN
    SELECT w.id, w.company_id, w.name, w.code, w.location, w.is_default, w.is_active, w.is_deleted, w.created_at,
        IFNULL((SELECT SUM(s.quantity) FROM inv_stock s WHERE s.warehouse_id = w.id), 0) AS total_units,
        IFNULL((SELECT SUM(s.quantity * p.cost_price)
                FROM inv_stock s JOIN inv_products p ON s.product_id = p.id AND p.company_id = p_cid
                WHERE s.warehouse_id = w.id), 0) AS stock_value
    FROM inv_warehouses w
    WHERE w.company_id = p_cid AND w.is_deleted = 0
    ORDER BY w.is_default DESC, w.name;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_inv_create_warehouse`;
delimiter ;;
CREATE PROCEDURE `sp_inv_create_warehouse`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_name VARCHAR(100), IN p_code VARCHAR(30), IN p_loc VARCHAR(255), IN p_default TINYINT)
BEGIN
    IF p_default = 1 THEN
        UPDATE inv_warehouses SET is_default = 0 WHERE company_id = p_cid;
    END IF;
    INSERT INTO inv_warehouses (id, company_id, name, code, location, is_default)
    VALUES (p_id, p_cid, p_name, NULLIF(p_code, ''), NULLIF(p_loc, ''), IFNULL(p_default, 0));
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_inv_update_warehouse`;
delimiter ;;
CREATE PROCEDURE `sp_inv_update_warehouse`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_name VARCHAR(100), IN p_code VARCHAR(30), IN p_loc VARCHAR(255), IN p_default TINYINT, IN p_active TINYINT)
BEGIN
    IF p_default = 1 THEN
        UPDATE inv_warehouses SET is_default = 0 WHERE company_id = p_cid AND id != p_id;
    END IF;
    UPDATE inv_warehouses
    SET name = p_name, code = NULLIF(p_code, ''), location = NULLIF(p_loc, ''),
        is_default = IFNULL(p_default, 0), is_active = p_active
    WHERE id = p_id AND company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_inv_delete_warehouse`;
delimiter ;;
CREATE PROCEDURE `sp_inv_delete_warehouse`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    DECLARE v_qty DECIMAL(15,2);
    SELECT IFNULL(SUM(quantity), 0) INTO v_qty FROM inv_stock WHERE warehouse_id = p_id;
    IF v_qty > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot delete a warehouse that still holds stock';
    END IF;
    UPDATE inv_warehouses SET is_deleted = 1, is_default = 0 WHERE id = p_id AND company_id = p_cid;
END
;;
delimiter ;


-- ---------- Suppliers: CRUD ----------

DROP PROCEDURE IF EXISTS `sp_inv_get_suppliers`;
delimiter ;;
CREATE PROCEDURE `sp_inv_get_suppliers`(IN p_cid CHAR(36))
BEGIN
    SELECT s.id, s.company_id, s.name, s.contact_person, s.email, s.phone, s.address, s.notes,
        s.is_active, s.is_deleted, s.created_at,
        (SELECT COUNT(*) FROM inv_products p WHERE p.supplier_id = s.id AND p.is_deleted = 0) AS product_count
    FROM inv_suppliers s
    WHERE s.company_id = p_cid AND s.is_deleted = 0
    ORDER BY s.name;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_inv_create_supplier`;
delimiter ;;
CREATE PROCEDURE `sp_inv_create_supplier`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_name VARCHAR(150), IN p_contact VARCHAR(100), IN p_email VARCHAR(150), IN p_phone VARCHAR(50), IN p_addr VARCHAR(255), IN p_notes VARCHAR(500))
BEGIN
    INSERT INTO inv_suppliers (id, company_id, name, contact_person, email, phone, address, notes)
    VALUES (p_id, p_cid, p_name, NULLIF(p_contact, ''), NULLIF(p_email, ''), NULLIF(p_phone, ''), NULLIF(p_addr, ''), NULLIF(p_notes, ''));
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_inv_update_supplier`;
delimiter ;;
CREATE PROCEDURE `sp_inv_update_supplier`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_name VARCHAR(150), IN p_contact VARCHAR(100), IN p_email VARCHAR(150), IN p_phone VARCHAR(50), IN p_addr VARCHAR(255), IN p_notes VARCHAR(500), IN p_active TINYINT)
BEGIN
    UPDATE inv_suppliers
    SET name = p_name, contact_person = NULLIF(p_contact, ''), email = NULLIF(p_email, ''),
        phone = NULLIF(p_phone, ''), address = NULLIF(p_addr, ''), notes = NULLIF(p_notes, ''), is_active = p_active
    WHERE id = p_id AND company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_inv_delete_supplier`;
delimiter ;;
CREATE PROCEDURE `sp_inv_delete_supplier`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    UPDATE inv_suppliers SET is_deleted = 1 WHERE id = p_id AND company_id = p_cid;
    UPDATE inv_products SET supplier_id = NULL WHERE supplier_id = p_id AND company_id = p_cid;
END
;;
delimiter ;


-- ---------- Products: CRUD ----------

DROP PROCEDURE IF EXISTS `sp_inv_get_products`;
delimiter ;;
CREATE PROCEDURE `sp_inv_get_products`(IN p_cid CHAR(36))
BEGIN
    SELECT p.id, p.company_id, p.sku, p.name, p.description,
        p.category_id, c.name AS category_name,
        p.supplier_id, sup.name AS supplier_name,
        p.unit, p.cost_price, p.selling_price, p.reorder_point,
        p.is_active, p.is_deleted, p.created_at, p.updated_at,
        IFNULL(st.total_qty, 0) AS total_stock,
        IFNULL(st.total_qty, 0) * p.cost_price AS stock_value
    FROM inv_products p
    LEFT JOIN inv_categories c ON p.category_id = c.id AND c.company_id = p_cid
    LEFT JOIN inv_suppliers  sup ON p.supplier_id = sup.id AND sup.company_id = p_cid
    LEFT JOIN (SELECT product_id, SUM(quantity) AS total_qty FROM inv_stock GROUP BY product_id) st
        ON st.product_id = p.id
    WHERE p.company_id = p_cid AND p.is_deleted = 0
    ORDER BY p.name;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_inv_get_product`;
delimiter ;;
CREATE PROCEDURE `sp_inv_get_product`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT p.id, p.company_id, p.sku, p.name, p.description,
        p.category_id, c.name AS category_name,
        p.supplier_id, sup.name AS supplier_name,
        p.unit, p.cost_price, p.selling_price, p.reorder_point,
        p.is_active, p.is_deleted, p.created_at, p.updated_at,
        IFNULL(st.total_qty, 0) AS total_stock,
        IFNULL(st.total_qty, 0) * p.cost_price AS stock_value
    FROM inv_products p
    LEFT JOIN inv_categories c ON p.category_id = c.id AND c.company_id = p_cid
    LEFT JOIN inv_suppliers  sup ON p.supplier_id = sup.id AND sup.company_id = p_cid
    LEFT JOIN (SELECT product_id, SUM(quantity) AS total_qty FROM inv_stock GROUP BY product_id) st
        ON st.product_id = p.id
    WHERE p.id = p_id AND p.company_id = p_cid AND p.is_deleted = 0;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_inv_get_product_stock`;
delimiter ;;
CREATE PROCEDURE `sp_inv_get_product_stock`(IN p_pid CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT s.product_id, s.warehouse_id, w.name AS warehouse_name, s.quantity
    FROM inv_stock s
    JOIN inv_warehouses w ON s.warehouse_id = w.id AND w.company_id = p_cid
    WHERE s.product_id = p_pid AND s.company_id = p_cid
    ORDER BY w.name;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_inv_create_product`;
delimiter ;;
CREATE PROCEDURE `sp_inv_create_product`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_sku VARCHAR(60), IN p_name VARCHAR(150), IN p_desc VARCHAR(500), IN p_cat CHAR(36), IN p_sup CHAR(36), IN p_unit VARCHAR(20), IN p_cost DECIMAL(15,2), IN p_price DECIMAL(15,2), IN p_reorder DECIMAL(15,2))
BEGIN
    IF EXISTS (SELECT 1 FROM inv_products WHERE company_id = p_cid AND sku = p_sku AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A product with this SKU already exists';
    END IF;
    INSERT INTO inv_products (id, company_id, sku, name, description, category_id, supplier_id, unit, cost_price, selling_price, reorder_point)
    VALUES (p_id, p_cid, p_sku, p_name, NULLIF(p_desc, ''), NULLIF(p_cat, ''), NULLIF(p_sup, ''),
        IFNULL(NULLIF(p_unit, ''), 'pcs'), IFNULL(p_cost, 0), IFNULL(p_price, 0), IFNULL(p_reorder, 0));
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_inv_update_product`;
delimiter ;;
CREATE PROCEDURE `sp_inv_update_product`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_sku VARCHAR(60), IN p_name VARCHAR(150), IN p_desc VARCHAR(500), IN p_cat CHAR(36), IN p_sup CHAR(36), IN p_unit VARCHAR(20), IN p_cost DECIMAL(15,2), IN p_price DECIMAL(15,2), IN p_reorder DECIMAL(15,2))
BEGIN
    IF EXISTS (SELECT 1 FROM inv_products WHERE company_id = p_cid AND sku = p_sku AND is_deleted = 0 AND id != p_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A product with this SKU already exists';
    END IF;
    UPDATE inv_products
    SET sku = p_sku, name = p_name, description = NULLIF(p_desc, ''),
        category_id = NULLIF(p_cat, ''), supplier_id = NULLIF(p_sup, ''),
        unit = IFNULL(NULLIF(p_unit, ''), 'pcs'),
        cost_price = IFNULL(p_cost, 0), selling_price = IFNULL(p_price, 0), reorder_point = IFNULL(p_reorder, 0)
    WHERE id = p_id AND company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_inv_toggle_product_active`;
delimiter ;;
CREATE PROCEDURE `sp_inv_toggle_product_active`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_active TINYINT)
BEGIN
    UPDATE inv_products SET is_active = p_active WHERE id = p_id AND company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_inv_delete_product`;
delimiter ;;
CREATE PROCEDURE `sp_inv_delete_product`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    UPDATE inv_products SET is_deleted = 1 WHERE id = p_id AND company_id = p_cid;
    DELETE FROM inv_stock WHERE product_id = p_id AND company_id = p_cid;
END
;;
delimiter ;


-- ---------- Stock movements (transactional) ----------

DROP PROCEDURE IF EXISTS `sp_inv_record_movement`;
delimiter ;;
CREATE PROCEDURE `sp_inv_record_movement`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_pid CHAR(36), IN p_wid CHAR(36), IN p_type VARCHAR(20), IN p_qty DECIMAL(15,2), IN p_cost DECIMAL(15,2), IN p_ref VARCHAR(100), IN p_notes VARCHAR(500), IN p_by CHAR(36))
BEGIN
    DECLARE v_cur   DECIMAL(15,2) DEFAULT 0;
    DECLARE v_delta DECIMAL(15,2);
    DECLARE v_new   DECIMAL(15,2);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    IF (SELECT COUNT(*) FROM inv_products WHERE id = p_pid AND company_id = p_cid AND is_deleted = 0) = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'product not found';
    END IF;
    IF (SELECT COUNT(*) FROM inv_warehouses WHERE id = p_wid AND company_id = p_cid AND is_deleted = 0) = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'warehouse not found';
    END IF;

    START TRANSACTION;

    -- Lock the balance row so concurrent movements can't double-apply.
    SELECT quantity INTO v_cur FROM inv_stock
        WHERE product_id = p_pid AND warehouse_id = p_wid FOR UPDATE;
    IF v_cur IS NULL THEN SET v_cur = 0; END IF;

    SET v_delta = CASE
        WHEN p_type = 'in'  THEN ABS(p_qty)
        WHEN p_type = 'out' THEN -ABS(p_qty)
        ELSE p_qty      -- 'adjust' carries a signed delta
    END;
    SET v_new = v_cur + v_delta;

    IF v_new < 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Insufficient stock for this movement';
    END IF;

    INSERT INTO inv_stock (id, company_id, product_id, warehouse_id, quantity)
        VALUES (UUID(), p_cid, p_pid, p_wid, v_new)
        ON DUPLICATE KEY UPDATE quantity = v_new;

    INSERT INTO inv_movements (id, company_id, product_id, warehouse_id, movement_type, quantity, unit_cost, reference, notes, balance_after, created_by)
        VALUES (p_id, p_cid, p_pid, p_wid, p_type, p_qty, IFNULL(p_cost, 0), NULLIF(p_ref, ''), NULLIF(p_notes, ''), v_new, p_by);

    COMMIT;

    SELECT v_new AS balance_after;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_inv_transfer_stock`;
delimiter ;;
CREATE PROCEDURE `sp_inv_transfer_stock`(IN p_id_out CHAR(36), IN p_id_in CHAR(36), IN p_cid CHAR(36), IN p_pid CHAR(36), IN p_from CHAR(36), IN p_to CHAR(36), IN p_qty DECIMAL(15,2), IN p_ref VARCHAR(100), IN p_notes VARCHAR(500), IN p_by CHAR(36))
BEGIN
    DECLARE v_from DECIMAL(15,2) DEFAULT 0;
    DECLARE v_to   DECIMAL(15,2) DEFAULT 0;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    IF p_from = p_to THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Source and destination warehouse must differ';
    END IF;
    IF ABS(p_qty) <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Transfer quantity must be greater than zero';
    END IF;
    IF (SELECT COUNT(*) FROM inv_products WHERE id = p_pid AND company_id = p_cid AND is_deleted = 0) = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'product not found';
    END IF;
    IF (SELECT COUNT(*) FROM inv_warehouses WHERE id IN (p_from, p_to) AND company_id = p_cid AND is_deleted = 0) < 2 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'warehouse not found';
    END IF;

    START TRANSACTION;

    SELECT quantity INTO v_from FROM inv_stock
        WHERE product_id = p_pid AND warehouse_id = p_from FOR UPDATE;
    IF v_from IS NULL THEN SET v_from = 0; END IF;
    IF v_from < ABS(p_qty) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Insufficient stock at source warehouse';
    END IF;

    SELECT quantity INTO v_to FROM inv_stock
        WHERE product_id = p_pid AND warehouse_id = p_to FOR UPDATE;
    IF v_to IS NULL THEN SET v_to = 0; END IF;

    SET v_from = v_from - ABS(p_qty);
    SET v_to   = v_to + ABS(p_qty);

    INSERT INTO inv_stock (id, company_id, product_id, warehouse_id, quantity)
        VALUES (UUID(), p_cid, p_pid, p_from, v_from)
        ON DUPLICATE KEY UPDATE quantity = v_from;
    INSERT INTO inv_stock (id, company_id, product_id, warehouse_id, quantity)
        VALUES (UUID(), p_cid, p_pid, p_to, v_to)
        ON DUPLICATE KEY UPDATE quantity = v_to;

    INSERT INTO inv_movements (id, company_id, product_id, warehouse_id, movement_type, quantity, reference, notes, related_warehouse_id, balance_after, created_by)
        VALUES (p_id_out, p_cid, p_pid, p_from, 'transfer_out', ABS(p_qty), NULLIF(p_ref, ''), NULLIF(p_notes, ''), p_to, v_from, p_by);
    INSERT INTO inv_movements (id, company_id, product_id, warehouse_id, movement_type, quantity, reference, notes, related_warehouse_id, balance_after, created_by)
        VALUES (p_id_in, p_cid, p_pid, p_to, 'transfer_in', ABS(p_qty), NULLIF(p_ref, ''), NULLIF(p_notes, ''), p_from, v_to, p_by);

    COMMIT;

    SELECT v_from AS from_balance, v_to AS to_balance;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_inv_get_movements`;
delimiter ;;
CREATE PROCEDURE `sp_inv_get_movements`(IN p_cid CHAR(36), IN p_pid CHAR(36), IN p_wid CHAR(36), IN p_type VARCHAR(20), IN p_limit INT)
BEGIN
    SELECT m.id, m.company_id, m.product_id, p.name AS product_name, p.sku AS product_sku,
        m.warehouse_id, w.name AS warehouse_name,
        m.movement_type, m.quantity, m.unit_cost, m.reference, m.notes,
        m.related_warehouse_id, rw.name AS related_warehouse_name,
        m.balance_after, m.journal_entry_id, m.created_by, m.created_at
    FROM inv_movements m
    LEFT JOIN inv_products   p  ON m.product_id = p.id
    LEFT JOIN inv_warehouses w  ON m.warehouse_id = w.id
    LEFT JOIN inv_warehouses rw ON m.related_warehouse_id = rw.id
    WHERE m.company_id = p_cid
        AND (p_pid = '' OR m.product_id = p_pid)
        AND (p_wid = '' OR m.warehouse_id = p_wid)
        AND (p_type = '' OR m.movement_type = p_type)
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT p_limit;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_inv_set_movement_journal`;
delimiter ;;
CREATE PROCEDURE `sp_inv_set_movement_journal`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_jid CHAR(36))
BEGIN
    UPDATE inv_movements SET journal_entry_id = p_jid WHERE id = p_id AND company_id = p_cid;
END
;;
delimiter ;


-- ---------- Stock levels + dashboard ----------

DROP PROCEDURE IF EXISTS `sp_inv_get_stock_levels`;
delimiter ;;
CREATE PROCEDURE `sp_inv_get_stock_levels`(IN p_cid CHAR(36), IN p_wid CHAR(36))
BEGIN
    SELECT s.product_id, p.sku AS product_sku, p.name AS product_name, p.unit,
        s.warehouse_id, w.name AS warehouse_name, s.quantity, p.cost_price,
        s.quantity * p.cost_price AS value
    FROM inv_stock s
    JOIN inv_products   p ON s.product_id = p.id AND p.is_deleted = 0
    JOIN inv_warehouses w ON s.warehouse_id = w.id
    WHERE s.company_id = p_cid AND (p_wid = '' OR s.warehouse_id = p_wid)
    ORDER BY p.name, w.name;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_inv_low_stock`;
delimiter ;;
CREATE PROCEDURE `sp_inv_low_stock`(IN p_cid CHAR(36))
BEGIN
    SELECT t.id, t.sku, t.name, t.unit, t.category_name, t.reorder_point, t.total_stock
    FROM (
        SELECT p.id, p.sku, p.name, p.unit, c.name AS category_name, p.reorder_point,
            IFNULL(SUM(s.quantity), 0) AS total_stock
        FROM inv_products p
        LEFT JOIN inv_categories c ON p.category_id = c.id AND c.company_id = p_cid
        LEFT JOIN inv_stock s ON s.product_id = p.id
        WHERE p.company_id = p_cid AND p.is_deleted = 0 AND p.is_active = 1
        GROUP BY p.id, p.sku, p.name, p.unit, c.name, p.reorder_point
    ) t
    WHERE t.reorder_point > 0 AND t.total_stock <= t.reorder_point
    ORDER BY (t.total_stock - t.reorder_point), t.name;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_inv_stats`;
delimiter ;;
CREATE PROCEDURE `sp_inv_stats`(IN p_cid CHAR(36))
BEGIN
    SELECT
        (SELECT COUNT(*) FROM inv_products WHERE company_id = p_cid AND is_deleted = 0) AS total_products,
        (SELECT COUNT(*) FROM inv_products WHERE company_id = p_cid AND is_deleted = 0 AND is_active = 1) AS active_products,
        (SELECT COUNT(*) FROM inv_warehouses WHERE company_id = p_cid AND is_deleted = 0) AS warehouses,
        IFNULL((SELECT SUM(s.quantity * p.cost_price)
                FROM inv_stock s JOIN inv_products p ON s.product_id = p.id
                WHERE p.company_id = p_cid AND p.is_deleted = 0), 0) AS stock_value,
        IFNULL((SELECT SUM(s.quantity)
                FROM inv_stock s JOIN inv_products p ON s.product_id = p.id
                WHERE p.company_id = p_cid AND p.is_deleted = 0), 0) AS total_units,
        (SELECT COUNT(*) FROM (
            SELECT p.id, IFNULL(SUM(s.quantity), 0) AS q, p.reorder_point AS rp
            FROM inv_products p LEFT JOIN inv_stock s ON s.product_id = p.id
            WHERE p.company_id = p_cid AND p.is_deleted = 0 AND p.is_active = 1
            GROUP BY p.id, p.reorder_point
        ) lo WHERE lo.rp > 0 AND lo.q <= lo.rp AND lo.q > 0) AS low_stock,
        (SELECT COUNT(*) FROM (
            SELECT p.id, IFNULL(SUM(s.quantity), 0) AS q
            FROM inv_products p LEFT JOIN inv_stock s ON s.product_id = p.id
            WHERE p.company_id = p_cid AND p.is_deleted = 0 AND p.is_active = 1
            GROUP BY p.id
        ) oo WHERE oo.q <= 0) AS out_of_stock,
        (SELECT COUNT(*) FROM inv_purchase_orders WHERE company_id = p_cid AND is_deleted = 0 AND status IN ('Draft','Ordered','Partial')) AS open_pos;
END
;;
delimiter ;


-- ---------- Accounting-integration settings ----------

DROP PROCEDURE IF EXISTS `sp_inv_get_settings`;
delimiter ;;
CREATE PROCEDURE `sp_inv_get_settings`(IN p_cid CHAR(36))
BEGIN
    SELECT company_id, auto_post_gl, inventory_account_id, cogs_account_id, adjustment_account_id, payable_account_id
    FROM inv_settings WHERE company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_inv_upsert_settings`;
delimiter ;;
CREATE PROCEDURE `sp_inv_upsert_settings`(IN p_cid CHAR(36), IN p_auto TINYINT, IN p_inv CHAR(36), IN p_cogs CHAR(36), IN p_adj CHAR(36), IN p_pay CHAR(36))
BEGIN
    INSERT INTO inv_settings (company_id, auto_post_gl, inventory_account_id, cogs_account_id, adjustment_account_id, payable_account_id)
    VALUES (p_cid, IFNULL(p_auto, 0), NULLIF(p_inv, ''), NULLIF(p_cogs, ''), NULLIF(p_adj, ''), NULLIF(p_pay, ''))
    ON DUPLICATE KEY UPDATE
        auto_post_gl = IFNULL(p_auto, 0),
        inventory_account_id = NULLIF(p_inv, ''),
        cogs_account_id = NULLIF(p_cogs, ''),
        adjustment_account_id = NULLIF(p_adj, ''),
        payable_account_id = NULLIF(p_pay, '');
END
;;
delimiter ;


-- ---------- Purchase orders ----------

DROP PROCEDURE IF EXISTS `sp_inv_next_po_number`;
delimiter ;;
CREATE PROCEDURE `sp_inv_next_po_number`(IN p_cid CHAR(36), OUT p_num INT)
BEGIN
    INSERT INTO inv_po_sequences (company_id, next_number) VALUES (p_cid, 2)
        ON DUPLICATE KEY UPDATE next_number = next_number + 1;
    SELECT CASE WHEN next_number > 1 THEN next_number - 1 ELSE 1 END INTO p_num
    FROM inv_po_sequences WHERE company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_inv_get_purchase_orders`;
delimiter ;;
CREATE PROCEDURE `sp_inv_get_purchase_orders`(IN p_cid CHAR(36), IN p_status VARCHAR(20))
BEGIN
    SELECT po.id, po.company_id, po.po_number,
        po.supplier_id, sup.name AS supplier_name,
        po.warehouse_id, w.name AS warehouse_name,
        po.status, po.order_date, po.expected_date, po.notes, po.total_amount,
        po.journal_entry_id, po.created_by, po.created_at, po.updated_at,
        (SELECT COUNT(*) FROM inv_po_items i WHERE i.po_id = po.id) AS item_count
    FROM inv_purchase_orders po
    LEFT JOIN inv_suppliers  sup ON po.supplier_id = sup.id AND sup.company_id = p_cid
    LEFT JOIN inv_warehouses w   ON po.warehouse_id = w.id AND w.company_id = p_cid
    WHERE po.company_id = p_cid AND po.is_deleted = 0
        AND (p_status = '' OR po.status = p_status)
    ORDER BY po.po_number DESC;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_inv_get_purchase_order`;
delimiter ;;
CREATE PROCEDURE `sp_inv_get_purchase_order`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT po.id, po.company_id, po.po_number,
        po.supplier_id, sup.name AS supplier_name,
        po.warehouse_id, w.name AS warehouse_name,
        po.status, po.order_date, po.expected_date, po.notes, po.total_amount,
        po.journal_entry_id, po.created_by, po.created_at, po.updated_at,
        (SELECT COUNT(*) FROM inv_po_items i WHERE i.po_id = po.id) AS item_count
    FROM inv_purchase_orders po
    LEFT JOIN inv_suppliers  sup ON po.supplier_id = sup.id AND sup.company_id = p_cid
    LEFT JOIN inv_warehouses w   ON po.warehouse_id = w.id AND w.company_id = p_cid
    WHERE po.id = p_id AND po.company_id = p_cid AND po.is_deleted = 0;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_inv_get_po_items`;
delimiter ;;
CREATE PROCEDURE `sp_inv_get_po_items`(IN p_po CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT i.id, i.company_id, i.po_id, i.product_id, p.name AS product_name, p.sku AS product_sku,
        i.quantity, i.received_qty, i.unit_cost, (i.quantity * i.unit_cost) AS line_total
    FROM inv_po_items i
    JOIN inv_purchase_orders po ON i.po_id = po.id AND po.company_id = p_cid
    LEFT JOIN inv_products p ON i.product_id = p.id
    WHERE i.po_id = p_po AND i.company_id = p_cid
    ORDER BY p.name;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_inv_create_purchase_order`;
delimiter ;;
CREATE PROCEDURE `sp_inv_create_purchase_order`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_sup CHAR(36), IN p_wid CHAR(36), IN p_order DATE, IN p_expected DATE, IN p_notes VARCHAR(500), IN p_by CHAR(36))
BEGIN
    DECLARE v_num INT;
    CALL sp_inv_next_po_number(p_cid, v_num);
    INSERT INTO inv_purchase_orders (id, company_id, po_number, supplier_id, warehouse_id, status, order_date, expected_date, notes, created_by)
    VALUES (p_id, p_cid, v_num, NULLIF(p_sup, ''), NULLIF(p_wid, ''), 'Draft', p_order, p_expected, NULLIF(p_notes, ''), p_by);
    SELECT v_num AS po_number;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_inv_update_purchase_order`;
delimiter ;;
CREATE PROCEDURE `sp_inv_update_purchase_order`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_sup CHAR(36), IN p_wid CHAR(36), IN p_order DATE, IN p_expected DATE, IN p_notes VARCHAR(500))
BEGIN
    UPDATE inv_purchase_orders
    SET supplier_id = NULLIF(p_sup, ''), warehouse_id = NULLIF(p_wid, ''),
        order_date = p_order, expected_date = p_expected, notes = NULLIF(p_notes, '')
    WHERE id = p_id AND company_id = p_cid AND status IN ('Draft','Ordered','Partial');
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_inv_update_po_status`;
delimiter ;;
CREATE PROCEDURE `sp_inv_update_po_status`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_status VARCHAR(20))
BEGIN
    UPDATE inv_purchase_orders SET status = p_status WHERE id = p_id AND company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_inv_delete_purchase_order`;
delimiter ;;
CREATE PROCEDURE `sp_inv_delete_purchase_order`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    UPDATE inv_purchase_orders SET is_deleted = 1
    WHERE id = p_id AND company_id = p_cid AND status != 'Received';
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_inv_add_po_item`;
delimiter ;;
CREATE PROCEDURE `sp_inv_add_po_item`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_po CHAR(36), IN p_pid CHAR(36), IN p_qty DECIMAL(15,2), IN p_cost DECIMAL(15,2))
BEGIN
    IF (SELECT COUNT(*) FROM inv_purchase_orders WHERE id = p_po AND company_id = p_cid AND is_deleted = 0) = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'purchase order not found';
    END IF;
    INSERT INTO inv_po_items (id, company_id, po_id, product_id, quantity, unit_cost)
    VALUES (p_id, p_cid, p_po, p_pid, IFNULL(p_qty, 0), IFNULL(p_cost, 0));
    UPDATE inv_purchase_orders SET total_amount = (
        SELECT IFNULL(SUM(quantity * unit_cost), 0) FROM inv_po_items WHERE po_id = p_po
    ) WHERE id = p_po AND company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_inv_delete_po_item`;
delimiter ;;
CREATE PROCEDURE `sp_inv_delete_po_item`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    DECLARE v_po CHAR(36);
    SELECT po_id INTO v_po FROM inv_po_items WHERE id = p_id AND company_id = p_cid;
    DELETE FROM inv_po_items WHERE id = p_id AND company_id = p_cid;
    IF v_po IS NOT NULL THEN
        UPDATE inv_purchase_orders SET total_amount = (
            SELECT IFNULL(SUM(quantity * unit_cost), 0) FROM inv_po_items WHERE po_id = v_po
        ) WHERE id = v_po AND company_id = p_cid;
    END IF;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_inv_receive_po`;
delimiter ;;
CREATE PROCEDURE `sp_inv_receive_po`(IN p_po CHAR(36), IN p_cid CHAR(36), IN p_by CHAR(36))
BEGIN
    DECLARE v_wid     CHAR(36);
    DECLARE v_status  VARCHAR(20);
    DECLARE v_done    INT DEFAULT 0;
    DECLARE v_item    CHAR(36);
    DECLARE v_pid     CHAR(36);
    DECLARE v_qty     DECIMAL(15,2);
    DECLARE v_recv    DECIMAL(15,2);
    DECLARE v_cost    DECIMAL(15,2);
    DECLARE v_out     DECIMAL(15,2);
    DECLARE v_bal     DECIMAL(15,2);
    DECLARE v_total   DECIMAL(15,2) DEFAULT 0;
    DECLARE cur CURSOR FOR
        SELECT id, product_id, quantity, received_qty, unit_cost
        FROM inv_po_items WHERE po_id = p_po AND company_id = p_cid;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    -- Lock the PO row so a concurrent receive can't double-apply stock; the
    -- second caller then sees status='Received' and is rejected below.
    SELECT warehouse_id, status INTO v_wid, v_status
    FROM inv_purchase_orders WHERE id = p_po AND company_id = p_cid AND is_deleted = 0 FOR UPDATE;

    IF v_status IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'purchase order not found';
    END IF;
    IF v_status = 'Received' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'purchase order already received';
    END IF;
    IF v_status = 'Cancelled' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'cannot receive a cancelled purchase order';
    END IF;
    IF v_wid IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'purchase order has no destination warehouse';
    END IF;

    OPEN cur;
    recv_loop: LOOP
        FETCH cur INTO v_item, v_pid, v_qty, v_recv, v_cost;
        IF v_done THEN LEAVE recv_loop; END IF;
        SET v_out = v_qty - v_recv;
        IF v_out > 0 THEN
            INSERT INTO inv_stock (id, company_id, product_id, warehouse_id, quantity)
                VALUES (UUID(), p_cid, v_pid, v_wid, v_out)
                ON DUPLICATE KEY UPDATE quantity = quantity + v_out;
            SELECT quantity INTO v_bal FROM inv_stock WHERE product_id = v_pid AND warehouse_id = v_wid;
            INSERT INTO inv_movements (id, company_id, product_id, warehouse_id, movement_type, quantity, unit_cost, reference, balance_after, created_by)
                VALUES (UUID(), p_cid, v_pid, v_wid, 'in', v_out, v_cost, CONCAT('PO #', (SELECT po_number FROM inv_purchase_orders WHERE id = p_po)), v_bal, p_by);
            UPDATE inv_po_items SET received_qty = v_qty WHERE id = v_item;
            SET v_total = v_total + (v_out * v_cost);
        END IF;
    END LOOP;
    CLOSE cur;

    UPDATE inv_purchase_orders SET status = 'Received' WHERE id = p_po AND company_id = p_cid;

    COMMIT;

    SELECT v_total AS total_received;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_inv_set_po_journal`;
delimiter ;;
CREATE PROCEDURE `sp_inv_set_po_journal`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_jid CHAR(36))
BEGIN
    UPDATE inv_purchase_orders SET journal_entry_id = p_jid WHERE id = p_id AND company_id = p_cid;
END
;;
delimiter ;
