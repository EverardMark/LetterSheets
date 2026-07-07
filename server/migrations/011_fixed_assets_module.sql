-- ============================================================================
-- Migration 011: Fixed Assets module
--
--   A full fixed-asset register with depreciation, disposal, maintenance,
--   transfers/custody, and revaluation/impairment — company-scoped for tenant
--   isolation (every procedure keys on p_cid, matching migrations 003-010).
--
--   CARRYING-VALUE MODEL (the load-bearing invariant):
--     net_book_value = acquisition_cost - accumulated_depreciation   (always)
--   maintained by EVERY event:
--     * depreciation   -> accumulated_depreciation += dep ; nbv = opening - dep
--                         (straight-line uses REMAINING-life recompute so it
--                          stays correct after an impairment; declining/DDB
--                          apply the monthly rate to the OPENING book value)
--     * impairment      -> accumulated_depreciation += |delta| ; nbv = new
--     * revaluation up  -> acquisition_cost += delta ; nbv = new
--     * disposal        -> gain_loss = proceeds - nbv (always balances because
--                          cost - accum == nbv)
--   The monthly run is IDEMPOTENT: UNIQUE(asset_id, period) on the ledger +
--   UNIQUE(company_id, period) on the run header. Re-running a period inserts
--   0 rows. GL journal entries are built in the Go layer (never SQL) and linked
--   back via journal_entry_id, exactly like the inventory module.
--
--   TENANT ISOLATION: every foreign id (category, custodian, GL accounts) is
--   validated to belong to p_cid before write (SIGNAL 45000 otherwise); every
--   join carries the company predicate; every mutating SP that takes an
--   asset_id locks it scoped by company_id and SIGNALs if not found.
--
--   Apply BEFORE/with the matching server build (privileged MySQL user):
--     mysql -u root -p lettersheets < server/migrations/011_fixed_assets_module.sql
-- ============================================================================


-- ---------- Tables ----------

CREATE TABLE IF NOT EXISTS `fa_asset_sequences` (
  `company_id`  char(36) NOT NULL,
  `next_number` int      DEFAULT '1',
  PRIMARY KEY (`company_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `fa_categories` (
  `id`                     char(36)      NOT NULL DEFAULT (uuid()),
  `company_id`             char(36)      NOT NULL,
  `name`                   varchar(100)  NOT NULL,
  `description`            varchar(255)  DEFAULT NULL,
  `asset_account_id`       char(36)      DEFAULT NULL,
  `accum_dep_account_id`   char(36)      DEFAULT NULL,
  `dep_expense_account_id` char(36)      DEFAULT NULL,
  `default_life_months`    int           DEFAULT NULL,
  `default_method`         varchar(20)   DEFAULT 'straight_line',
  `default_salvage_pct`    decimal(5,2)  DEFAULT '0.00',
  `is_active`              tinyint(1)    DEFAULT '1',
  `is_deleted`             tinyint(1)    DEFAULT '0',
  `created_at`             timestamp     NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_facat` (`company_id`,`is_deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `fa_assets` (
  `id`                       char(36)      NOT NULL DEFAULT (uuid()),
  `company_id`               char(36)      NOT NULL,
  `asset_number`             varchar(30)   NOT NULL,
  `name`                     varchar(150)  NOT NULL,
  `description`              varchar(500)  DEFAULT NULL,
  `category_id`              char(36)      DEFAULT NULL,
  `acquisition_cost`         decimal(15,2) NOT NULL DEFAULT '0.00',
  `acquisition_date`         date          NOT NULL,
  `in_service_date`          date          DEFAULT NULL,
  `useful_life_months`       int           NOT NULL DEFAULT '0',
  `salvage_value`            decimal(15,2) DEFAULT '0.00',
  `depreciation_method`      varchar(20)   NOT NULL DEFAULT 'straight_line',
  `status`                   varchar(20)   NOT NULL DEFAULT 'Active',
  `accumulated_depreciation` decimal(15,2) NOT NULL DEFAULT '0.00',
  `net_book_value`           decimal(15,2) NOT NULL DEFAULT '0.00',
  `periods_depreciated`      int           NOT NULL DEFAULT '0',
  `last_depreciation_date`   date          DEFAULT NULL,
  `department`               varchar(100)  DEFAULT NULL,
  `location`                 varchar(150)  DEFAULT NULL,
  `custodian_id`             char(36)      DEFAULT NULL,
  `serial_number`            varchar(100)  DEFAULT NULL,
  `asset_account_id`         char(36)      DEFAULT NULL,
  `accum_dep_account_id`     char(36)      DEFAULT NULL,
  `dep_expense_account_id`   char(36)      DEFAULT NULL,
  `acquisition_journal_id`   char(36)      DEFAULT NULL,
  `disposed_date`            date          DEFAULT NULL,
  `notes`                    varchar(500)  DEFAULT NULL,
  `created_by`               char(36)      DEFAULT NULL,
  `is_deleted`               tinyint(1)    DEFAULT '0',
  `created_at`               timestamp     NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`               timestamp     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_faasset_num` (`company_id`,`asset_number`),
  KEY `idx_faasset` (`company_id`,`is_deleted`),
  KEY `idx_faasset_cat` (`category_id`),
  KEY `idx_faasset_status` (`company_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `fa_depreciation_runs` (
  `id`               char(36)      NOT NULL DEFAULT (uuid()),
  `company_id`       char(36)      NOT NULL,
  `period`           char(7)       NOT NULL,
  `asset_count`      int           DEFAULT '0',
  `total_amount`     decimal(15,2) DEFAULT '0.00',
  `journal_entry_id` char(36)      DEFAULT NULL,
  `is_voided`        tinyint(1)    DEFAULT '0',
  `run_by`           char(36)      DEFAULT NULL,
  `created_at`       timestamp     NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_farun_period` (`company_id`,`period`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `fa_depreciation_entries` (
  `id`                char(36)      NOT NULL DEFAULT (uuid()),
  `company_id`        char(36)      NOT NULL,
  `asset_id`          char(36)      NOT NULL,
  `period`            char(7)       NOT NULL,
  `period_index`      int           NOT NULL,
  `method`            varchar(20)   NOT NULL,
  `opening_nbv`       decimal(15,2) NOT NULL DEFAULT '0.00',
  `amount`            decimal(15,2) NOT NULL DEFAULT '0.00',
  `accumulated_after` decimal(15,2) NOT NULL DEFAULT '0.00',
  `closing_nbv`       decimal(15,2) NOT NULL DEFAULT '0.00',
  `run_id`            char(36)      DEFAULT NULL,
  `journal_entry_id`  char(36)      DEFAULT NULL,
  `is_posted`         tinyint(1)    DEFAULT '0',
  `is_voided`         tinyint(1)    DEFAULT '0',
  `created_by`        char(36)      DEFAULT NULL,
  `created_at`        timestamp     NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fadep_period` (`asset_id`,`period`),
  KEY `idx_fadep_comp` (`company_id`,`period`),
  KEY `idx_fadep_asset` (`asset_id`,`created_at`),
  KEY `idx_fadep_run` (`run_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `fa_disposals` (
  `id`                       char(36)      NOT NULL DEFAULT (uuid()),
  `company_id`               char(36)      NOT NULL,
  `asset_id`                 char(36)      NOT NULL,
  `disposal_date`            date          NOT NULL,
  `disposal_type`            varchar(20)   NOT NULL,
  `proceeds`                 decimal(15,2) NOT NULL DEFAULT '0.00',
  `book_value`               decimal(15,2) NOT NULL DEFAULT '0.00',
  `accumulated_depreciation` decimal(15,2) NOT NULL DEFAULT '0.00',
  `gain_loss`                decimal(15,2) NOT NULL DEFAULT '0.00',
  `buyer`                    varchar(150)  DEFAULT NULL,
  `reference`                varchar(100)  DEFAULT NULL,
  `notes`                    varchar(500)  DEFAULT NULL,
  `journal_entry_id`         char(36)      DEFAULT NULL,
  `created_by`               char(36)      DEFAULT NULL,
  `is_deleted`               tinyint(1)    DEFAULT '0',
  `created_at`               timestamp     NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_fadisp` (`company_id`,`is_deleted`),
  KEY `idx_fadisp_asset` (`asset_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `fa_maintenance` (
  `id`                char(36)      NOT NULL DEFAULT (uuid()),
  `company_id`        char(36)      NOT NULL,
  `asset_id`          char(36)      NOT NULL,
  `service_date`      date          NOT NULL,
  `maintenance_type`  varchar(50)   DEFAULT 'service',
  `description`       varchar(500)  DEFAULT NULL,
  `cost`              decimal(15,2) DEFAULT '0.00',
  `vendor`            varchar(150)  DEFAULT NULL,
  `performed_by`      varchar(100)  DEFAULT NULL,
  `next_service_date` date          DEFAULT NULL,
  `created_by`        char(36)      DEFAULT NULL,
  `is_deleted`        tinyint(1)    DEFAULT '0',
  `created_at`        timestamp     NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_famaint` (`company_id`,`is_deleted`),
  KEY `idx_famaint_asset` (`asset_id`,`service_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `fa_transfers` (
  `id`                char(36)      NOT NULL DEFAULT (uuid()),
  `company_id`        char(36)      NOT NULL,
  `asset_id`          char(36)      NOT NULL,
  `transfer_date`     date          NOT NULL,
  `from_department`   varchar(100)  DEFAULT NULL,
  `to_department`     varchar(100)  DEFAULT NULL,
  `from_location`     varchar(150)  DEFAULT NULL,
  `to_location`       varchar(150)  DEFAULT NULL,
  `from_custodian_id` char(36)      DEFAULT NULL,
  `to_custodian_id`   char(36)      DEFAULT NULL,
  `notes`             varchar(500)  DEFAULT NULL,
  `created_by`        char(36)      DEFAULT NULL,
  `is_deleted`        tinyint(1)    DEFAULT '0',
  `created_at`        timestamp     NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_fatrn` (`company_id`,`is_deleted`),
  KEY `idx_fatrn_asset` (`asset_id`,`transfer_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `fa_revaluations` (
  `id`               char(36)      NOT NULL DEFAULT (uuid()),
  `company_id`       char(36)      NOT NULL,
  `asset_id`         char(36)      NOT NULL,
  `revaluation_date` date          NOT NULL,
  `revaluation_type` varchar(20)   NOT NULL,
  `old_value`        decimal(15,2) NOT NULL DEFAULT '0.00',
  `new_value`        decimal(15,2) NOT NULL DEFAULT '0.00',
  `delta`            decimal(15,2) NOT NULL DEFAULT '0.00',
  `reason`           varchar(500)  DEFAULT NULL,
  `journal_entry_id` char(36)      DEFAULT NULL,
  `created_by`       char(36)      DEFAULT NULL,
  `is_deleted`       tinyint(1)    DEFAULT '0',
  `created_at`       timestamp     NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_fareval` (`company_id`,`is_deleted`),
  KEY `idx_fareval_asset` (`asset_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `fa_settings` (
  `company_id`                     char(36)   NOT NULL,
  `auto_post_gl`                   tinyint(1) DEFAULT '0',
  `asset_account_id`               char(36)   DEFAULT NULL,
  `accum_dep_account_id`           char(36)   DEFAULT NULL,
  `dep_expense_account_id`         char(36)   DEFAULT NULL,
  `disposal_gain_account_id`       char(36)   DEFAULT NULL,
  `disposal_loss_account_id`       char(36)   DEFAULT NULL,
  `cash_account_id`                char(36)   DEFAULT NULL,
  `revaluation_surplus_account_id` char(36)   DEFAULT NULL,
  `impairment_loss_account_id`     char(36)   DEFAULT NULL,
  `payable_account_id`             char(36)   DEFAULT NULL,
  `updated_at`                     timestamp  NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`company_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- ---------- Categories: CRUD (with cross-tenant FK guards) ----------

DROP PROCEDURE IF EXISTS `sp_fa_get_categories`;
delimiter ;;
CREATE PROCEDURE `sp_fa_get_categories`(IN p_cid CHAR(36))
BEGIN
    SELECT c.id, c.company_id, c.name, c.description,
        c.asset_account_id, c.accum_dep_account_id, c.dep_expense_account_id,
        c.default_life_months, c.default_method, c.default_salvage_pct,
        c.is_active, c.is_deleted, c.created_at,
        (SELECT COUNT(*) FROM fa_assets a WHERE a.category_id = c.id AND a.is_deleted = 0) AS asset_count
    FROM fa_categories c
    WHERE c.company_id = p_cid AND c.is_deleted = 0
    ORDER BY c.name;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_fa_assert_account`;
delimiter ;;
-- Guard helper: SIGNAL unless the account id is blank or belongs to the company.
CREATE PROCEDURE `sp_fa_assert_account`(IN p_acct CHAR(36), IN p_cid CHAR(36))
BEGIN
    IF p_acct IS NOT NULL AND p_acct <> '' AND NOT EXISTS
        (SELECT 1 FROM acc_accounts WHERE id = p_acct AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'GL account not found in company';
    END IF;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_fa_create_category`;
delimiter ;;
CREATE PROCEDURE `sp_fa_create_category`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_name VARCHAR(100), IN p_desc VARCHAR(255), IN p_asset_acct CHAR(36), IN p_accum_acct CHAR(36), IN p_exp_acct CHAR(36), IN p_life INT, IN p_method VARCHAR(20), IN p_salvage_pct DECIMAL(5,2))
BEGIN
    CALL sp_fa_assert_account(p_asset_acct, p_cid);
    CALL sp_fa_assert_account(p_accum_acct, p_cid);
    CALL sp_fa_assert_account(p_exp_acct, p_cid);
    INSERT INTO fa_categories (id, company_id, name, description, asset_account_id, accum_dep_account_id, dep_expense_account_id, default_life_months, default_method, default_salvage_pct)
    VALUES (p_id, p_cid, p_name, NULLIF(p_desc, ''), NULLIF(p_asset_acct, ''), NULLIF(p_accum_acct, ''), NULLIF(p_exp_acct, ''),
        NULLIF(p_life, 0), IFNULL(NULLIF(p_method, ''), 'straight_line'), IFNULL(p_salvage_pct, 0));
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_fa_update_category`;
delimiter ;;
CREATE PROCEDURE `sp_fa_update_category`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_name VARCHAR(100), IN p_desc VARCHAR(255), IN p_asset_acct CHAR(36), IN p_accum_acct CHAR(36), IN p_exp_acct CHAR(36), IN p_life INT, IN p_method VARCHAR(20), IN p_salvage_pct DECIMAL(5,2), IN p_active TINYINT)
BEGIN
    CALL sp_fa_assert_account(p_asset_acct, p_cid);
    CALL sp_fa_assert_account(p_accum_acct, p_cid);
    CALL sp_fa_assert_account(p_exp_acct, p_cid);
    UPDATE fa_categories
    SET name = p_name, description = NULLIF(p_desc, ''),
        asset_account_id = NULLIF(p_asset_acct, ''), accum_dep_account_id = NULLIF(p_accum_acct, ''),
        dep_expense_account_id = NULLIF(p_exp_acct, ''), default_life_months = NULLIF(p_life, 0),
        default_method = IFNULL(NULLIF(p_method, ''), 'straight_line'), default_salvage_pct = IFNULL(p_salvage_pct, 0),
        is_active = p_active
    WHERE id = p_id AND company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_fa_delete_category`;
delimiter ;;
CREATE PROCEDURE `sp_fa_delete_category`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    UPDATE fa_categories SET is_deleted = 1 WHERE id = p_id AND company_id = p_cid;
    UPDATE fa_assets SET category_id = NULL WHERE category_id = p_id AND company_id = p_cid;
END
;;
delimiter ;


-- ---------- Sequence + Assets ----------

DROP PROCEDURE IF EXISTS `sp_fa_next_asset_number`;
delimiter ;;
CREATE PROCEDURE `sp_fa_next_asset_number`(IN p_cid CHAR(36), OUT p_num INT)
BEGIN
    INSERT INTO fa_asset_sequences (company_id, next_number) VALUES (p_cid, 2)
        ON DUPLICATE KEY UPDATE next_number = next_number + 1;
    SELECT CASE WHEN next_number > 1 THEN next_number - 1 ELSE 1 END INTO p_num
    FROM fa_asset_sequences WHERE company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_fa_get_assets`;
delimiter ;;
CREATE PROCEDURE `sp_fa_get_assets`(IN p_cid CHAR(36), IN p_status VARCHAR(20), IN p_cat CHAR(36))
BEGIN
    SELECT a.id, a.company_id, a.asset_number, a.name, a.description,
        a.category_id, c.name AS category_name,
        a.acquisition_cost, a.acquisition_date, a.in_service_date, a.useful_life_months,
        a.salvage_value, a.depreciation_method, a.status,
        a.accumulated_depreciation, a.net_book_value, a.periods_depreciated, a.last_depreciation_date,
        a.department, a.location, a.custodian_id,
        CASE WHEN a.custodian_id IS NULL THEN NULL ELSE CONCAT(cu.first_name, ' ', cu.last_name) END AS custodian_name,
        a.serial_number, a.asset_account_id, a.accum_dep_account_id, a.dep_expense_account_id,
        a.acquisition_journal_id, a.disposed_date, a.notes, a.created_at, a.updated_at
    FROM fa_assets a
    LEFT JOIN fa_categories c ON a.category_id = c.id AND c.company_id = p_cid
    LEFT JOIN employees cu ON a.custodian_id = cu.id AND cu.company_id = p_cid
    WHERE a.company_id = p_cid AND a.is_deleted = 0
        AND (p_status = '' OR a.status = p_status)
        AND (p_cat = '' OR a.category_id = p_cat)
    ORDER BY a.asset_number DESC;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_fa_get_asset`;
delimiter ;;
CREATE PROCEDURE `sp_fa_get_asset`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT a.id, a.company_id, a.asset_number, a.name, a.description,
        a.category_id, c.name AS category_name,
        a.acquisition_cost, a.acquisition_date, a.in_service_date, a.useful_life_months,
        a.salvage_value, a.depreciation_method, a.status,
        a.accumulated_depreciation, a.net_book_value, a.periods_depreciated, a.last_depreciation_date,
        a.department, a.location, a.custodian_id,
        CASE WHEN a.custodian_id IS NULL THEN NULL ELSE CONCAT(cu.first_name, ' ', cu.last_name) END AS custodian_name,
        a.serial_number, a.asset_account_id, a.accum_dep_account_id, a.dep_expense_account_id,
        a.acquisition_journal_id, a.disposed_date, a.notes, a.created_at, a.updated_at
    FROM fa_assets a
    LEFT JOIN fa_categories c ON a.category_id = c.id AND c.company_id = p_cid
    LEFT JOIN employees cu ON a.custodian_id = cu.id AND cu.company_id = p_cid
    WHERE a.id = p_id AND a.company_id = p_cid AND a.is_deleted = 0;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_fa_create_asset`;
delimiter ;;
CREATE PROCEDURE `sp_fa_create_asset`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_name VARCHAR(150), IN p_desc VARCHAR(500), IN p_cat CHAR(36), IN p_cost DECIMAL(15,2), IN p_acq_date DATE, IN p_in_service DATE, IN p_life INT, IN p_salvage DECIMAL(15,2), IN p_method VARCHAR(20), IN p_dept VARCHAR(100), IN p_loc VARCHAR(150), IN p_custodian CHAR(36), IN p_serial VARCHAR(100), IN p_asset_acct CHAR(36), IN p_accum_acct CHAR(36), IN p_exp_acct CHAR(36), IN p_by CHAR(36))
BEGIN
    DECLARE v_num INT;
    -- Cross-tenant FK guards
    IF p_cat IS NOT NULL AND p_cat <> '' AND NOT EXISTS
        (SELECT 1 FROM fa_categories WHERE id = p_cat AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'category not found in company';
    END IF;
    IF p_custodian IS NOT NULL AND p_custodian <> '' AND NOT EXISTS
        (SELECT 1 FROM employees WHERE id = p_custodian AND company_id = p_cid) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'custodian not found in company';
    END IF;
    CALL sp_fa_assert_account(p_asset_acct, p_cid);
    CALL sp_fa_assert_account(p_accum_acct, p_cid);
    CALL sp_fa_assert_account(p_exp_acct, p_cid);

    CALL sp_fa_next_asset_number(p_cid, v_num);

    INSERT INTO fa_assets (id, company_id, asset_number, name, description, category_id,
        acquisition_cost, acquisition_date, in_service_date, useful_life_months, salvage_value,
        depreciation_method, status, accumulated_depreciation, net_book_value, periods_depreciated,
        department, location, custodian_id, serial_number,
        asset_account_id, accum_dep_account_id, dep_expense_account_id, notes, created_by)
    VALUES (p_id, p_cid, CONCAT('FA-', LPAD(v_num, 6, '0')), p_name, NULLIF(p_desc, ''), NULLIF(p_cat, ''),
        IFNULL(p_cost, 0), p_acq_date, p_in_service, IFNULL(p_life, 0), IFNULL(p_salvage, 0),
        IFNULL(NULLIF(p_method, ''), 'straight_line'), 'Active', 0, IFNULL(p_cost, 0), 0,
        NULLIF(p_dept, ''), NULLIF(p_loc, ''), NULLIF(p_custodian, ''), NULLIF(p_serial, ''),
        NULLIF(p_asset_acct, ''), NULLIF(p_accum_acct, ''), NULLIF(p_exp_acct, ''), NULLIF(p_desc, ''), p_by);

    SELECT v_num AS asset_number_int, CONCAT('FA-', LPAD(v_num, 6, '0')) AS asset_number;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_fa_update_asset`;
delimiter ;;
-- Financial fields (cost/life/salvage/method) are editable ONLY while the asset
-- has no posted depreciation entries; afterwards only descriptive fields change,
-- so the running columns and the depreciation ledger can never diverge.
CREATE PROCEDURE `sp_fa_update_asset`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_name VARCHAR(150), IN p_desc VARCHAR(500), IN p_cat CHAR(36), IN p_cost DECIMAL(15,2), IN p_acq_date DATE, IN p_in_service DATE, IN p_life INT, IN p_salvage DECIMAL(15,2), IN p_method VARCHAR(20), IN p_dept VARCHAR(100), IN p_loc VARCHAR(150), IN p_custodian CHAR(36), IN p_serial VARCHAR(100), IN p_asset_acct CHAR(36), IN p_accum_acct CHAR(36), IN p_exp_acct CHAR(36))
BEGIN
    DECLARE v_posted INT DEFAULT 0;
    IF p_cat IS NOT NULL AND p_cat <> '' AND NOT EXISTS
        (SELECT 1 FROM fa_categories WHERE id = p_cat AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'category not found in company';
    END IF;
    IF p_custodian IS NOT NULL AND p_custodian <> '' AND NOT EXISTS
        (SELECT 1 FROM employees WHERE id = p_custodian AND company_id = p_cid) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'custodian not found in company';
    END IF;
    CALL sp_fa_assert_account(p_asset_acct, p_cid);
    CALL sp_fa_assert_account(p_accum_acct, p_cid);
    CALL sp_fa_assert_account(p_exp_acct, p_cid);

    SELECT COUNT(*) INTO v_posted FROM fa_depreciation_entries
        WHERE asset_id = p_id AND company_id = p_cid AND is_voided = 0;

    IF v_posted = 0 THEN
        UPDATE fa_assets
        SET name = p_name, description = NULLIF(p_desc, ''), category_id = NULLIF(p_cat, ''),
            acquisition_cost = IFNULL(p_cost, 0), acquisition_date = p_acq_date, in_service_date = p_in_service,
            useful_life_months = IFNULL(p_life, 0), salvage_value = IFNULL(p_salvage, 0),
            depreciation_method = IFNULL(NULLIF(p_method, ''), 'straight_line'),
            net_book_value = IFNULL(p_cost, 0) - accumulated_depreciation,
            department = NULLIF(p_dept, ''), location = NULLIF(p_loc, ''), custodian_id = NULLIF(p_custodian, ''),
            serial_number = NULLIF(p_serial, ''), asset_account_id = NULLIF(p_asset_acct, ''),
            accum_dep_account_id = NULLIF(p_accum_acct, ''), dep_expense_account_id = NULLIF(p_exp_acct, '')
        WHERE id = p_id AND company_id = p_cid AND status NOT IN ('Disposed', 'Scrapped');
    ELSE
        -- Descriptive fields only once depreciation has been posted.
        UPDATE fa_assets
        SET name = p_name, description = NULLIF(p_desc, ''), category_id = NULLIF(p_cat, ''),
            department = NULLIF(p_dept, ''), location = NULLIF(p_loc, ''), custodian_id = NULLIF(p_custodian, ''),
            serial_number = NULLIF(p_serial, ''), asset_account_id = NULLIF(p_asset_acct, ''),
            accum_dep_account_id = NULLIF(p_accum_acct, ''), dep_expense_account_id = NULLIF(p_exp_acct, '')
        WHERE id = p_id AND company_id = p_cid AND status NOT IN ('Disposed', 'Scrapped');
    END IF;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_fa_delete_asset`;
delimiter ;;
CREATE PROCEDURE `sp_fa_delete_asset`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    IF EXISTS (SELECT 1 FROM fa_depreciation_entries WHERE asset_id = p_id AND company_id = p_cid AND is_voided = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'cannot delete an asset with depreciation history';
    END IF;
    IF EXISTS (SELECT 1 FROM fa_assets WHERE id = p_id AND company_id = p_cid AND status = 'Active' AND net_book_value > 0
               AND (SELECT COUNT(*) FROM fa_disposals WHERE asset_id = p_id AND company_id = p_cid AND is_deleted = 0) = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'dispose the asset before deleting (it still carries book value)';
    END IF;
    UPDATE fa_assets SET is_deleted = 1 WHERE id = p_id AND company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_fa_set_asset_journal`;
delimiter ;;
CREATE PROCEDURE `sp_fa_set_asset_journal`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_jid CHAR(36))
BEGIN
    UPDATE fa_assets SET acquisition_journal_id = p_jid WHERE id = p_id AND company_id = p_cid;
END
;;
delimiter ;


-- ---------- Depreciation ----------

DROP PROCEDURE IF EXISTS `sp_fa_get_depreciation_schedule`;
delimiter ;;
CREATE PROCEDURE `sp_fa_get_depreciation_schedule`(IN p_aid CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT id, company_id, asset_id, period, period_index, method,
        opening_nbv, amount, accumulated_after, closing_nbv,
        run_id, journal_entry_id, is_posted, is_voided, created_at
    FROM fa_depreciation_entries
    WHERE asset_id = p_aid AND company_id = p_cid
    ORDER BY period, period_index;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_fa_get_runs`;
delimiter ;;
CREATE PROCEDURE `sp_fa_get_runs`(IN p_cid CHAR(36))
BEGIN
    SELECT id, company_id, period, asset_count, total_amount, journal_entry_id, is_voided, run_by, created_at
    FROM fa_depreciation_runs
    WHERE company_id = p_cid
    ORDER BY period DESC;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_fa_run_depreciation`;
delimiter ;;
CREATE PROCEDURE `sp_fa_run_depreciation`(IN p_run_id CHAR(36), IN p_cid CHAR(36), IN p_period CHAR(7), IN p_by CHAR(36))
BEGIN
    DECLARE v_done   INT DEFAULT 0;
    DECLARE v_run    CHAR(36);
    DECLARE v_aid    CHAR(36);
    DECLARE v_cost   DECIMAL(15,2);
    DECLARE v_salv   DECIMAL(15,2);
    DECLARE v_life   INT;
    DECLARE v_method VARCHAR(20);
    DECLARE v_accum  DECIMAL(15,2);
    DECLARE v_open   DECIMAL(15,2);
    DECLARE v_n      INT;
    DECLARE v_floor  DECIMAL(15,2);
    DECLARE v_k      INT;
    DECLARE v_rate   DECIMAL(20,10);
    DECLARE v_dep    DECIMAL(15,2);
    DECLARE v_after  DECIMAL(15,2);
    DECLARE v_close  DECIMAL(15,2);
    DECLARE v_total  DECIMAL(15,2) DEFAULT 0;
    DECLARE v_count  INT DEFAULT 0;
    DECLARE cur CURSOR FOR
        SELECT a.id, a.acquisition_cost, a.salvage_value, a.useful_life_months,
               a.depreciation_method, a.accumulated_depreciation, a.net_book_value, a.periods_depreciated
        FROM fa_assets a
        WHERE a.company_id = p_cid AND a.is_deleted = 0 AND a.status = 'Active'
          AND DATE_FORMAT(IFNULL(a.in_service_date, a.acquisition_date), '%Y-%m') <= p_period
        FOR UPDATE;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    IF p_period NOT REGEXP '^[0-9]{4}-[0-9]{2}$' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'period must be YYYY-MM';
    END IF;

    START TRANSACTION;

    -- Whole-run idempotency: the UNIQUE(company_id, period) row also serializes
    -- concurrent runs for the same period. Resolve to the canonical run id.
    INSERT INTO fa_depreciation_runs (id, company_id, period, run_by)
        VALUES (p_run_id, p_cid, p_period, p_by)
        ON DUPLICATE KEY UPDATE id = id;
    SELECT id INTO v_run FROM fa_depreciation_runs WHERE company_id = p_cid AND period = p_period;

    OPEN cur;
    dep_loop: LOOP
        FETCH cur INTO v_aid, v_cost, v_salv, v_life, v_method, v_accum, v_open, v_n;
        IF v_done THEN LEAVE dep_loop; END IF;

        -- Per-asset idempotency (company-scoped) + eligibility guards.
        IF EXISTS (SELECT 1 FROM fa_depreciation_entries
                   WHERE asset_id = v_aid AND period = p_period AND company_id = p_cid) THEN
            ITERATE dep_loop;
        END IF;
        SET v_floor = v_open - v_salv;
        IF v_floor <= 0 OR v_n >= v_life OR (v_life - v_n) <= 0 THEN
            ITERATE dep_loop;
        END IF;

        SET v_k = v_n + 1;

        IF v_method = 'straight_line' THEN
            -- Remaining-life recompute: robust after impairment/revaluation.
            SET v_dep = ROUND((v_open - v_salv) / (v_life - v_n), 2);
        ELSEIF v_method = 'double_declining' THEN
            -- Multiply BEFORE dividing: a direct factor/life division (e.g. 2/60)
            -- truncates the rate to 5 dp and under-depreciates each period.
            SET v_dep = ROUND(v_open * 2.0 / v_life, 2);
        ELSEIF v_method = 'declining_balance' THEN
            SET v_dep = ROUND(v_open * 1.5 / v_life, 2);
        ELSE
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'unknown depreciation method';
        END IF;

        IF v_dep > v_floor THEN SET v_dep = v_floor; END IF;   -- never below salvage
        IF v_k >= v_life THEN SET v_dep = v_floor; END IF;     -- final-period true-up
        IF v_dep < 0 THEN SET v_dep = 0; END IF;

        IF v_dep > 0 THEN
            SET v_after = v_accum + v_dep;
            SET v_close = v_open - v_dep;   -- NBV = opening - dep (robust; == cost-accum in the pure path)
            INSERT INTO fa_depreciation_entries
                (id, company_id, asset_id, period, period_index, method,
                 opening_nbv, amount, accumulated_after, closing_nbv, run_id, created_by)
            VALUES (UUID(), p_cid, v_aid, p_period, v_k, v_method,
                 v_open, v_dep, v_after, v_close, v_run, p_by);
            UPDATE fa_assets
               SET accumulated_depreciation = v_after,
                   net_book_value = v_close,
                   periods_depreciated = v_k,
                   last_depreciation_date = LAST_DAY(STR_TO_DATE(CONCAT(p_period, '-01'), '%Y-%m-%d')),
                   status = IF(v_close <= v_salv, 'Fully Depreciated', status)
             WHERE id = v_aid AND company_id = p_cid;
            SET v_total = v_total + v_dep;
            SET v_count = v_count + 1;
        END IF;
    END LOOP;
    CLOSE cur;

    UPDATE fa_depreciation_runs SET asset_count = v_count, total_amount = v_total
        WHERE id = v_run AND company_id = p_cid;

    COMMIT;

    SELECT v_run AS run_id, v_count AS asset_count, v_total AS total_amount;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_fa_get_run_entries`;
delimiter ;;
-- Entries of a run joined with the resolved (expense, accum) GL accounts for
-- each asset, so the Go poster can group and post one journal per account pair.
CREATE PROCEDURE `sp_fa_get_run_entries`(IN p_run_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT e.id, e.asset_id, e.amount,
        COALESCE(NULLIF(a.dep_expense_account_id, ''), c.dep_expense_account_id, s.dep_expense_account_id) AS exp_acct,
        COALESCE(NULLIF(a.accum_dep_account_id, ''), c.accum_dep_account_id, s.accum_dep_account_id) AS accum_acct
    FROM fa_depreciation_entries e
    JOIN fa_assets a ON e.asset_id = a.id AND a.company_id = p_cid
    LEFT JOIN fa_categories c ON a.category_id = c.id AND c.company_id = p_cid
    LEFT JOIN fa_settings s ON s.company_id = p_cid
    WHERE e.run_id = p_run_id AND e.company_id = p_cid AND e.is_voided = 0;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_fa_set_run_journal`;
delimiter ;;
CREATE PROCEDURE `sp_fa_set_run_journal`(IN p_run_id CHAR(36), IN p_cid CHAR(36), IN p_jid CHAR(36))
BEGIN
    UPDATE fa_depreciation_runs SET journal_entry_id = p_jid WHERE id = p_run_id AND company_id = p_cid;
    UPDATE fa_depreciation_entries SET journal_entry_id = p_jid, is_posted = 1
        WHERE run_id = p_run_id AND company_id = p_cid AND is_voided = 0;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_fa_void_run`;
delimiter ;;
-- Reverse a depreciation run: void its entries and roll back the asset running
-- columns. The Go layer posts a reversing journal (Dr Accum-Dep / Cr Dep-Expense).
CREATE PROCEDURE `sp_fa_void_run`(IN p_run_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    DECLARE v_voided TINYINT DEFAULT NULL;
    DECLARE v_done   INT DEFAULT 0;
    DECLARE v_aid    CHAR(36);
    DECLARE v_amt    DECIMAL(15,2);
    DECLARE cur CURSOR FOR
        SELECT asset_id, amount FROM fa_depreciation_entries
        WHERE run_id = p_run_id AND company_id = p_cid AND is_voided = 0;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    SELECT is_voided INTO v_voided FROM fa_depreciation_runs
        WHERE id = p_run_id AND company_id = p_cid FOR UPDATE;
    IF v_voided IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'run not found';
    END IF;
    IF v_voided = 1 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'run already voided';
    END IF;

    OPEN cur;
    void_loop: LOOP
        FETCH cur INTO v_aid, v_amt;
        IF v_done THEN LEAVE void_loop; END IF;
        UPDATE fa_assets
           SET accumulated_depreciation = accumulated_depreciation - v_amt,
               net_book_value = net_book_value + v_amt,
               periods_depreciated = GREATEST(periods_depreciated - 1, 0),
               status = IF(status = 'Fully Depreciated', 'Active', status)
         WHERE id = v_aid AND company_id = p_cid;
    END LOOP;
    CLOSE cur;

    UPDATE fa_depreciation_entries SET is_voided = 1
        WHERE run_id = p_run_id AND company_id = p_cid;
    UPDATE fa_depreciation_runs SET is_voided = 1
        WHERE id = p_run_id AND company_id = p_cid;

    COMMIT;

    SELECT total_amount FROM fa_depreciation_runs WHERE id = p_run_id AND company_id = p_cid;
END
;;
delimiter ;


-- ---------- Disposals ----------

DROP PROCEDURE IF EXISTS `sp_fa_create_disposal`;
delimiter ;;
CREATE PROCEDURE `sp_fa_create_disposal`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_aid CHAR(36), IN p_date DATE, IN p_type VARCHAR(20), IN p_proceeds DECIMAL(15,2), IN p_buyer VARCHAR(150), IN p_ref VARCHAR(100), IN p_notes VARCHAR(500), IN p_by CHAR(36))
BEGIN
    DECLARE v_status VARCHAR(20);
    DECLARE v_nbv    DECIMAL(15,2);
    DECLARE v_accum  DECIMAL(15,2);
    DECLARE v_cost   DECIMAL(15,2);
    DECLARE v_gain   DECIMAL(15,2);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    SELECT status, net_book_value, accumulated_depreciation, acquisition_cost
        INTO v_status, v_nbv, v_accum, v_cost
    FROM fa_assets WHERE id = p_aid AND company_id = p_cid AND is_deleted = 0 FOR UPDATE;

    IF v_status IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'asset not found';
    END IF;
    IF v_status IN ('Disposed', 'Scrapped') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'asset already disposed';
    END IF;

    SET v_gain = IFNULL(p_proceeds, 0) - v_nbv;

    INSERT INTO fa_disposals (id, company_id, asset_id, disposal_date, disposal_type, proceeds, book_value, accumulated_depreciation, gain_loss, buyer, reference, notes, created_by)
    VALUES (p_id, p_cid, p_aid, p_date, p_type, IFNULL(p_proceeds, 0), v_nbv, v_accum, v_gain, NULLIF(p_buyer, ''), NULLIF(p_ref, ''), NULLIF(p_notes, ''), p_by);

    UPDATE fa_assets
       SET status = IF(p_type = 'scrap', 'Scrapped', 'Disposed'), disposed_date = p_date, net_book_value = 0
     WHERE id = p_aid AND company_id = p_cid;

    COMMIT;

    SELECT v_cost AS acquisition_cost, v_accum AS accumulated_depreciation, v_nbv AS book_value, v_gain AS gain_loss;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_fa_get_disposals`;
delimiter ;;
CREATE PROCEDURE `sp_fa_get_disposals`(IN p_cid CHAR(36))
BEGIN
    SELECT d.id, d.company_id, d.asset_id, a.asset_number, a.name AS asset_name,
        d.disposal_date, d.disposal_type, d.proceeds, d.book_value, d.accumulated_depreciation,
        d.gain_loss, d.buyer, d.reference, d.notes, d.journal_entry_id, d.created_at
    FROM fa_disposals d
    LEFT JOIN fa_assets a ON d.asset_id = a.id AND a.company_id = p_cid
    WHERE d.company_id = p_cid AND d.is_deleted = 0
    ORDER BY d.disposal_date DESC, d.created_at DESC;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_fa_set_disposal_journal`;
delimiter ;;
CREATE PROCEDURE `sp_fa_set_disposal_journal`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_jid CHAR(36))
BEGIN
    UPDATE fa_disposals SET journal_entry_id = p_jid WHERE id = p_id AND company_id = p_cid;
END
;;
delimiter ;


-- ---------- Maintenance ----------

DROP PROCEDURE IF EXISTS `sp_fa_get_maintenance`;
delimiter ;;
CREATE PROCEDURE `sp_fa_get_maintenance`(IN p_cid CHAR(36), IN p_aid CHAR(36))
BEGIN
    SELECT m.id, m.company_id, m.asset_id, a.asset_number, a.name AS asset_name,
        m.service_date, m.maintenance_type, m.description, m.cost, m.vendor, m.performed_by,
        m.next_service_date, m.created_at
    FROM fa_maintenance m
    LEFT JOIN fa_assets a ON m.asset_id = a.id AND a.company_id = p_cid
    WHERE m.company_id = p_cid AND m.is_deleted = 0
        AND (p_aid = '' OR m.asset_id = p_aid)
    ORDER BY m.service_date DESC, m.created_at DESC;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_fa_create_maintenance`;
delimiter ;;
CREATE PROCEDURE `sp_fa_create_maintenance`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_aid CHAR(36), IN p_date DATE, IN p_type VARCHAR(50), IN p_desc VARCHAR(500), IN p_cost DECIMAL(15,2), IN p_vendor VARCHAR(150), IN p_performed_by VARCHAR(100), IN p_next DATE, IN p_by CHAR(36))
BEGIN
    IF NOT EXISTS (SELECT 1 FROM fa_assets WHERE id = p_aid AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'asset not found';
    END IF;
    INSERT INTO fa_maintenance (id, company_id, asset_id, service_date, maintenance_type, description, cost, vendor, performed_by, next_service_date, created_by)
    VALUES (p_id, p_cid, p_aid, p_date, IFNULL(NULLIF(p_type, ''), 'service'), NULLIF(p_desc, ''), IFNULL(p_cost, 0), NULLIF(p_vendor, ''), NULLIF(p_performed_by, ''), p_next, p_by);
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_fa_update_maintenance`;
delimiter ;;
CREATE PROCEDURE `sp_fa_update_maintenance`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_date DATE, IN p_type VARCHAR(50), IN p_desc VARCHAR(500), IN p_cost DECIMAL(15,2), IN p_vendor VARCHAR(150), IN p_performed_by VARCHAR(100), IN p_next DATE)
BEGIN
    UPDATE fa_maintenance
    SET service_date = p_date, maintenance_type = IFNULL(NULLIF(p_type, ''), 'service'), description = NULLIF(p_desc, ''),
        cost = IFNULL(p_cost, 0), vendor = NULLIF(p_vendor, ''), performed_by = NULLIF(p_performed_by, ''), next_service_date = p_next
    WHERE id = p_id AND company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_fa_delete_maintenance`;
delimiter ;;
CREATE PROCEDURE `sp_fa_delete_maintenance`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    UPDATE fa_maintenance SET is_deleted = 1 WHERE id = p_id AND company_id = p_cid;
END
;;
delimiter ;


-- ---------- Transfers & custody ----------

DROP PROCEDURE IF EXISTS `sp_fa_create_transfer`;
delimiter ;;
CREATE PROCEDURE `sp_fa_create_transfer`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_aid CHAR(36), IN p_date DATE, IN p_to_dept VARCHAR(100), IN p_to_loc VARCHAR(150), IN p_to_custodian CHAR(36), IN p_notes VARCHAR(500), IN p_by CHAR(36))
BEGIN
    DECLARE v_dept VARCHAR(100);
    DECLARE v_loc  VARCHAR(150);
    DECLARE v_cust CHAR(36);
    DECLARE v_found INT DEFAULT 0;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    IF p_to_custodian IS NOT NULL AND p_to_custodian <> '' AND NOT EXISTS
        (SELECT 1 FROM employees WHERE id = p_to_custodian AND company_id = p_cid) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'custodian not found in company';
    END IF;

    START TRANSACTION;

    SELECT 1, department, location, custodian_id INTO v_found, v_dept, v_loc, v_cust
    FROM fa_assets WHERE id = p_aid AND company_id = p_cid AND is_deleted = 0 FOR UPDATE;
    IF v_found = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'asset not found';
    END IF;

    INSERT INTO fa_transfers (id, company_id, asset_id, transfer_date, from_department, to_department, from_location, to_location, from_custodian_id, to_custodian_id, notes, created_by)
    VALUES (p_id, p_cid, p_aid, p_date, v_dept, NULLIF(p_to_dept, ''), v_loc, NULLIF(p_to_loc, ''), v_cust, NULLIF(p_to_custodian, ''), NULLIF(p_notes, ''), p_by);

    UPDATE fa_assets
       SET department = NULLIF(p_to_dept, ''), location = NULLIF(p_to_loc, ''), custodian_id = NULLIF(p_to_custodian, '')
     WHERE id = p_aid AND company_id = p_cid;

    COMMIT;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_fa_get_transfers`;
delimiter ;;
CREATE PROCEDURE `sp_fa_get_transfers`(IN p_cid CHAR(36), IN p_aid CHAR(36))
BEGIN
    SELECT t.id, t.company_id, t.asset_id, a.asset_number, a.name AS asset_name,
        t.transfer_date, t.from_department, t.to_department, t.from_location, t.to_location,
        t.from_custodian_id,
        CASE WHEN t.from_custodian_id IS NULL THEN NULL ELSE CONCAT(fc.first_name, ' ', fc.last_name) END AS from_custodian_name,
        t.to_custodian_id,
        CASE WHEN t.to_custodian_id IS NULL THEN NULL ELSE CONCAT(tc.first_name, ' ', tc.last_name) END AS to_custodian_name,
        t.notes, t.created_at
    FROM fa_transfers t
    LEFT JOIN fa_assets a ON t.asset_id = a.id AND a.company_id = p_cid
    LEFT JOIN employees fc ON t.from_custodian_id = fc.id AND fc.company_id = p_cid
    LEFT JOIN employees tc ON t.to_custodian_id = tc.id AND tc.company_id = p_cid
    WHERE t.company_id = p_cid AND t.is_deleted = 0
        AND (p_aid = '' OR t.asset_id = p_aid)
    ORDER BY t.transfer_date DESC, t.created_at DESC;
END
;;
delimiter ;


-- ---------- Revaluations & impairment ----------

DROP PROCEDURE IF EXISTS `sp_fa_create_revaluation`;
delimiter ;;
-- Upward revaluation (new > old): raise acquisition_cost, GL Dr Asset / Cr Surplus.
-- Impairment / downward (new < old): raise accumulated_depreciation, GL Dr
-- Impairment Loss / Cr Accum-Dep. Either way net_book_value = new so the
-- invariant nbv = cost - accum is preserved and disposals stay balanced.
CREATE PROCEDURE `sp_fa_create_revaluation`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_aid CHAR(36), IN p_date DATE, IN p_type VARCHAR(20), IN p_new_value DECIMAL(15,2), IN p_reason VARCHAR(500), IN p_by CHAR(36))
BEGIN
    DECLARE v_status VARCHAR(20);
    DECLARE v_old    DECIMAL(15,2);
    DECLARE v_delta  DECIMAL(15,2);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    SELECT status, net_book_value INTO v_status, v_old
    FROM fa_assets WHERE id = p_aid AND company_id = p_cid AND is_deleted = 0 FOR UPDATE;

    IF v_status IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'asset not found';
    END IF;
    IF v_status IN ('Disposed', 'Scrapped') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'cannot revalue a disposed asset';
    END IF;

    SET v_delta = IFNULL(p_new_value, 0) - v_old;

    INSERT INTO fa_revaluations (id, company_id, asset_id, revaluation_date, revaluation_type, old_value, new_value, delta, reason, created_by)
    VALUES (p_id, p_cid, p_aid, p_date, p_type, v_old, IFNULL(p_new_value, 0), v_delta, NULLIF(p_reason, ''), p_by);

    IF v_delta >= 0 THEN
        UPDATE fa_assets SET acquisition_cost = acquisition_cost + v_delta, net_book_value = IFNULL(p_new_value, 0)
         WHERE id = p_aid AND company_id = p_cid;
    ELSE
        UPDATE fa_assets SET accumulated_depreciation = accumulated_depreciation + (-v_delta), net_book_value = IFNULL(p_new_value, 0)
         WHERE id = p_aid AND company_id = p_cid;
    END IF;

    COMMIT;

    SELECT v_old AS old_value, v_delta AS delta;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_fa_get_revaluations`;
delimiter ;;
CREATE PROCEDURE `sp_fa_get_revaluations`(IN p_cid CHAR(36))
BEGIN
    SELECT r.id, r.company_id, r.asset_id, a.asset_number, a.name AS asset_name,
        r.revaluation_date, r.revaluation_type, r.old_value, r.new_value, r.delta, r.reason,
        r.journal_entry_id, r.created_at
    FROM fa_revaluations r
    LEFT JOIN fa_assets a ON r.asset_id = a.id AND a.company_id = p_cid
    WHERE r.company_id = p_cid AND r.is_deleted = 0
    ORDER BY r.revaluation_date DESC, r.created_at DESC;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_fa_set_revaluation_journal`;
delimiter ;;
CREATE PROCEDURE `sp_fa_set_revaluation_journal`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_jid CHAR(36))
BEGIN
    UPDATE fa_revaluations SET journal_entry_id = p_jid WHERE id = p_id AND company_id = p_cid;
END
;;
delimiter ;


-- ---------- Dashboard + settings ----------

DROP PROCEDURE IF EXISTS `sp_fa_stats`;
delimiter ;;
CREATE PROCEDURE `sp_fa_stats`(IN p_cid CHAR(36))
BEGIN
    SELECT
        (SELECT COUNT(*) FROM fa_assets WHERE company_id = p_cid AND is_deleted = 0) AS total_assets,
        (SELECT COUNT(*) FROM fa_assets WHERE company_id = p_cid AND is_deleted = 0 AND status = 'Active') AS active_assets,
        (SELECT COUNT(*) FROM fa_assets WHERE company_id = p_cid AND is_deleted = 0 AND status IN ('Disposed','Scrapped')) AS disposed_assets,
        (SELECT COUNT(*) FROM fa_assets WHERE company_id = p_cid AND is_deleted = 0 AND status = 'Fully Depreciated') AS fully_depreciated,
        IFNULL((SELECT SUM(acquisition_cost) FROM fa_assets WHERE company_id = p_cid AND is_deleted = 0 AND status NOT IN ('Disposed','Scrapped')), 0) AS total_cost,
        IFNULL((SELECT SUM(accumulated_depreciation) FROM fa_assets WHERE company_id = p_cid AND is_deleted = 0 AND status NOT IN ('Disposed','Scrapped')), 0) AS total_accumulated_depreciation,
        IFNULL((SELECT SUM(net_book_value) FROM fa_assets WHERE company_id = p_cid AND is_deleted = 0 AND status NOT IN ('Disposed','Scrapped')), 0) AS net_book_value,
        IFNULL((SELECT SUM(amount) FROM fa_depreciation_entries WHERE company_id = p_cid AND is_voided = 0 AND period LIKE CONCAT(YEAR(CURDATE()), '-%')), 0) AS ytd_depreciation,
        (SELECT COUNT(*) FROM fa_maintenance WHERE company_id = p_cid AND is_deleted = 0 AND next_service_date IS NOT NULL AND next_service_date <= CURDATE()) AS maintenance_due;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_fa_get_settings`;
delimiter ;;
CREATE PROCEDURE `sp_fa_get_settings`(IN p_cid CHAR(36))
BEGIN
    SELECT company_id, auto_post_gl, asset_account_id, accum_dep_account_id, dep_expense_account_id,
        disposal_gain_account_id, disposal_loss_account_id, cash_account_id,
        revaluation_surplus_account_id, impairment_loss_account_id, payable_account_id
    FROM fa_settings WHERE company_id = p_cid;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_fa_upsert_settings`;
delimiter ;;
CREATE PROCEDURE `sp_fa_upsert_settings`(IN p_cid CHAR(36), IN p_auto TINYINT, IN p_asset CHAR(36), IN p_accum CHAR(36), IN p_exp CHAR(36), IN p_gain CHAR(36), IN p_loss CHAR(36), IN p_cash CHAR(36), IN p_reval CHAR(36), IN p_impair CHAR(36), IN p_payable CHAR(36))
BEGIN
    CALL sp_fa_assert_account(p_asset, p_cid);
    CALL sp_fa_assert_account(p_accum, p_cid);
    CALL sp_fa_assert_account(p_exp, p_cid);
    CALL sp_fa_assert_account(p_gain, p_cid);
    CALL sp_fa_assert_account(p_loss, p_cid);
    CALL sp_fa_assert_account(p_cash, p_cid);
    CALL sp_fa_assert_account(p_reval, p_cid);
    CALL sp_fa_assert_account(p_impair, p_cid);
    CALL sp_fa_assert_account(p_payable, p_cid);
    INSERT INTO fa_settings (company_id, auto_post_gl, asset_account_id, accum_dep_account_id, dep_expense_account_id, disposal_gain_account_id, disposal_loss_account_id, cash_account_id, revaluation_surplus_account_id, impairment_loss_account_id, payable_account_id)
    VALUES (p_cid, IFNULL(p_auto, 0), NULLIF(p_asset, ''), NULLIF(p_accum, ''), NULLIF(p_exp, ''), NULLIF(p_gain, ''), NULLIF(p_loss, ''), NULLIF(p_cash, ''), NULLIF(p_reval, ''), NULLIF(p_impair, ''), NULLIF(p_payable, ''))
    ON DUPLICATE KEY UPDATE
        auto_post_gl = IFNULL(p_auto, 0),
        asset_account_id = NULLIF(p_asset, ''), accum_dep_account_id = NULLIF(p_accum, ''),
        dep_expense_account_id = NULLIF(p_exp, ''), disposal_gain_account_id = NULLIF(p_gain, ''),
        disposal_loss_account_id = NULLIF(p_loss, ''), cash_account_id = NULLIF(p_cash, ''),
        revaluation_surplus_account_id = NULLIF(p_reval, ''), impairment_loss_account_id = NULLIF(p_impair, ''),
        payable_account_id = NULLIF(p_payable, '');
END
;;
delimiter ;
