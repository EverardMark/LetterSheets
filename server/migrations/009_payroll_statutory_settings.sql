-- ============================================================================
-- Migration 009: persist payroll statutory-enable settings
--
-- The payroll Settings UI already exposes working_days, hours_per_day and
-- enable_sss / enable_philhealth / enable_pagibig / enable_tax toggles, and the
-- frontend computeStatutory() gates SSS/PhilHealth/Pag-IBIG/withholding on those
-- flags. But payroll_settings had NO enable_* columns and sp_get/upsert only
-- round-tripped pay_schedule + ot_multiplier — so the flags were silently
-- dropped and statutory deductions were ALWAYS ₱0 for every payroll run.
--
-- Fix: add the four enable_* columns (default ON — PH statutory is mandatory),
-- and redefine sp_get_payroll_settings / sp_upsert_payroll_settings to include
-- working_days, hours_per_day and the enable flags. Requires the matching Go
-- build (models.PayrollSettings + repo scan/args). Apply as a privileged user:
--   mysql -u root -p lettersheets < server/migrations/009_payroll_statutory_settings.sql
-- ============================================================================

ALTER TABLE `payroll_settings`
    ADD COLUMN `enable_sss`        tinyint(1) NOT NULL DEFAULT 1 AFTER `ot_multiplier`,
    ADD COLUMN `enable_philhealth` tinyint(1) NOT NULL DEFAULT 1 AFTER `enable_sss`,
    ADD COLUMN `enable_pagibig`    tinyint(1) NOT NULL DEFAULT 1 AFTER `enable_philhealth`,
    ADD COLUMN `enable_tax`        tinyint(1) NOT NULL DEFAULT 1 AFTER `enable_pagibig`;

DROP PROCEDURE IF EXISTS `sp_get_payroll_settings`;
delimiter ;;
CREATE PROCEDURE `sp_get_payroll_settings`(IN p_company_id VARCHAR(36))
BEGIN
    SELECT id, company_id, pay_schedule, ot_multiplier,
           working_days, hours_per_day,
           enable_sss, enable_philhealth, enable_pagibig, enable_tax,
           created_at, updated_at
    FROM payroll_settings
    WHERE company_id = p_company_id
    LIMIT 1;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_upsert_payroll_settings`;
delimiter ;;
CREATE PROCEDURE `sp_upsert_payroll_settings`(IN p_id                VARCHAR(36),
    IN p_company_id        VARCHAR(36),
    IN p_pay_schedule      VARCHAR(20),
    IN p_ot_mult           DECIMAL(4,2),
    IN p_working_days      INT,
    IN p_hours_per_day     DECIMAL(4,2),
    IN p_enable_sss        TINYINT,
    IN p_enable_philhealth TINYINT,
    IN p_enable_pagibig    TINYINT,
    IN p_enable_tax        TINYINT,
    IN p_session_id        VARCHAR(36),
    IN p_user_id           VARCHAR(36),
    IN p_ip                VARCHAR(45),
    IN p_ua                TEXT)
BEGIN
    INSERT INTO payroll_settings
        (id, company_id, pay_schedule, ot_multiplier, working_days, hours_per_day,
         enable_sss, enable_philhealth, enable_pagibig, enable_tax)
    VALUES
        (p_id, p_company_id, p_pay_schedule, p_ot_mult, IFNULL(p_working_days, 22), IFNULL(p_hours_per_day, 8),
         p_enable_sss, p_enable_philhealth, p_enable_pagibig, p_enable_tax)
    ON DUPLICATE KEY UPDATE
        pay_schedule      = p_pay_schedule,
        ot_multiplier     = p_ot_mult,
        working_days      = IFNULL(p_working_days, working_days),
        hours_per_day     = IFNULL(p_hours_per_day, hours_per_day),
        enable_sss        = p_enable_sss,
        enable_philhealth = p_enable_philhealth,
        enable_pagibig    = p_enable_pagibig,
        enable_tax        = p_enable_tax,
        updated_at        = CURRENT_TIMESTAMP;
END
;;
delimiter ;
