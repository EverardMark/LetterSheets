-- ============================================================
-- STORED PROCEDURES: USER REGISTRATION FLOW
-- All operations log to change_history automatically
-- Soft delete via is_active flag
-- ============================================================

USE lettersheets;

DELIMITER //

-- ============================================================
-- HELPER: Log a single field change
-- ============================================================
DROP PROCEDURE IF EXISTS sp_log_change//
CREATE PROCEDURE sp_log_change(
    IN p_company_id VARCHAR(36),
    IN p_changed_by VARCHAR(36),
    IN p_session_id VARCHAR(36),
    IN p_table_name VARCHAR(100),
    IN p_record_id VARCHAR(36),
    IN p_change_type VARCHAR(10),
    IN p_field_name VARCHAR(100),
    IN p_old_value LONGTEXT,
    IN p_new_value LONGTEXT,
    IN p_is_encrypted TINYINT(1),
    IN p_ip_address VARCHAR(45),
    IN p_user_agent VARCHAR(500)
)
BEGIN
    INSERT INTO change_history (
        id, company_id, changed_by, session_id,
        table_name, record_id, change_type,
        field_name, old_value, new_value, is_encrypted,
        ip_address, user_agent, changed_at
    ) VALUES (
        UUID(), p_company_id, p_changed_by, p_session_id,
        p_table_name, p_record_id, p_change_type,
        p_field_name, p_old_value, p_new_value, p_is_encrypted,
        p_ip_address, p_user_agent, NOW()
    );
END//

-- ============================================================
-- COMPANY: CREATE
-- ============================================================
DROP PROCEDURE IF EXISTS sp_create_company//
CREATE PROCEDURE sp_create_company(
    IN p_id VARCHAR(36),
    IN p_name VARCHAR(255),
    IN p_industry VARCHAR(100),
    IN p_address VARCHAR(500),
    IN p_city VARCHAR(100),
    IN p_state VARCHAR(100),
    IN p_province VARCHAR(100),
    IN p_key_algorithm VARCHAR(50),
    IN p_max_employees INT,
    IN p_plan VARCHAR(50),
    IN p_changed_by VARCHAR(36),
    IN p_session_id VARCHAR(36),
    IN p_ip_address VARCHAR(45),
    IN p_user_agent VARCHAR(500)
)
BEGIN
    DECLARE v_key_algorithm VARCHAR(50);
    DECLARE v_plan VARCHAR(50);

    SET v_key_algorithm = IFNULL(p_key_algorithm, 'AES-256-GCM');
    SET v_plan = IFNULL(p_plan, 'standard');

    INSERT INTO companies (
        id, name, industry, address, city, state, province,
        key_algorithm, key_version, max_employees, plan, is_active,
        created_at, updated_at
    ) VALUES (
        p_id, p_name, p_industry, p_address, p_city, p_state, p_province,
        v_key_algorithm, 1, IFNULL(p_max_employees, 500), v_plan, 1,
        NOW(), NOW()
    );

    -- Log all fields as insert
    CALL sp_log_change(p_id, p_changed_by, p_session_id, 'companies', p_id, 'insert', 'name', NULL, p_name, 0, p_ip_address, p_user_agent);
    CALL sp_log_change(p_id, p_changed_by, p_session_id, 'companies', p_id, 'insert', 'industry', NULL, p_industry, 0, p_ip_address, p_user_agent);
    CALL sp_log_change(p_id, p_changed_by, p_session_id, 'companies', p_id, 'insert', 'address', NULL, p_address, 0, p_ip_address, p_user_agent);
    CALL sp_log_change(p_id, p_changed_by, p_session_id, 'companies', p_id, 'insert', 'city', NULL, p_city, 0, p_ip_address, p_user_agent);
    CALL sp_log_change(p_id, p_changed_by, p_session_id, 'companies', p_id, 'insert', 'state', NULL, p_state, 0, p_ip_address, p_user_agent);
    CALL sp_log_change(p_id, p_changed_by, p_session_id, 'companies', p_id, 'insert', 'province', NULL, p_province, 0, p_ip_address, p_user_agent);
    CALL sp_log_change(p_id, p_changed_by, p_session_id, 'companies', p_id, 'insert', 'key_algorithm', NULL, v_key_algorithm, 0, p_ip_address, p_user_agent);
    CALL sp_log_change(p_id, p_changed_by, p_session_id, 'companies', p_id, 'insert', 'plan', NULL, v_plan, 0, p_ip_address, p_user_agent);

    -- Auto-create default company settings
    INSERT INTO company_settings (id, company_id) VALUES (UUID(), p_id);

    CALL sp_log_change(p_id, p_changed_by, p_session_id, 'company_settings', p_id, 'insert', 'timezone', NULL, 'Asia/Manila', 0, p_ip_address, p_user_agent);
    CALL sp_log_change(p_id, p_changed_by, p_session_id, 'company_settings', p_id, 'insert', 'currency', NULL, 'PHP', 0, p_ip_address, p_user_agent);
    CALL sp_log_change(p_id, p_changed_by, p_session_id, 'company_settings', p_id, 'insert', 'pay_frequency', NULL, 'semi_monthly', 0, p_ip_address, p_user_agent);
END//

-- ============================================================
-- COMPANY: READ
-- ============================================================
DROP PROCEDURE IF EXISTS sp_get_company//
CREATE PROCEDURE sp_get_company(
    IN p_id VARCHAR(36)
)
BEGIN
    SELECT c.*, cs.timezone, cs.date_format, cs.currency, cs.fiscal_year_start,
           cs.pay_frequency, cs.pay_day_1, cs.pay_day_2, cs.overtime_required_approval,
           cs.default_vacation_days, cs.default_sick_days, cs.leave_accrual_type,
           cs.employee_number_prefix, cs.employee_number_auto
    FROM companies c
    LEFT JOIN company_settings cs ON cs.company_id = c.id
    WHERE c.id = p_id AND c.is_active = 1;
END//

-- ============================================================
-- COMPANY: UPDATE
-- ============================================================
DROP PROCEDURE IF EXISTS sp_update_company//
CREATE PROCEDURE sp_update_company(
    IN p_id VARCHAR(36),
    IN p_name VARCHAR(255),
    IN p_industry VARCHAR(100),
    IN p_address VARCHAR(500),
    IN p_city VARCHAR(100),
    IN p_state VARCHAR(100),
    IN p_province VARCHAR(100),
    IN p_max_employees INT,
    IN p_plan VARCHAR(50),
    IN p_changed_by VARCHAR(36),
    IN p_session_id VARCHAR(36),
    IN p_ip_address VARCHAR(45),
    IN p_user_agent VARCHAR(500)
)
BEGIN
    DECLARE v_old_name VARCHAR(255);
    DECLARE v_old_industry VARCHAR(100);
    DECLARE v_old_address VARCHAR(500);
    DECLARE v_old_city VARCHAR(100);
    DECLARE v_old_state VARCHAR(100);
    DECLARE v_old_province VARCHAR(100);
    DECLARE v_old_max_employees INT;
    DECLARE v_old_plan VARCHAR(50);

    -- Fetch old values
    SELECT name, industry, address, city, state, province, max_employees, plan
    INTO v_old_name, v_old_industry, v_old_address, v_old_city, v_old_state, v_old_province, v_old_max_employees, v_old_plan
    FROM companies WHERE id = p_id AND is_active = 1;

    -- Update
    UPDATE companies SET
        name = IFNULL(p_name, name),
        industry = IFNULL(p_industry, industry),
        address = IFNULL(p_address, address),
        city = IFNULL(p_city, city),
        state = IFNULL(p_state, state),
        province = IFNULL(p_province, province),
        max_employees = IFNULL(p_max_employees, max_employees),
        plan = IFNULL(p_plan, plan)
    WHERE id = p_id AND is_active = 1;

    -- Log only changed fields
    IF p_name IS NOT NULL AND p_name != v_old_name THEN
        CALL sp_log_change(p_id, p_changed_by, p_session_id, 'companies', p_id, 'update', 'name', v_old_name, p_name, 0, p_ip_address, p_user_agent);
    END IF;
    IF p_industry IS NOT NULL AND (p_industry != v_old_industry OR v_old_industry IS NULL) THEN
        CALL sp_log_change(p_id, p_changed_by, p_session_id, 'companies', p_id, 'update', 'industry', v_old_industry, p_industry, 0, p_ip_address, p_user_agent);
    END IF;
    IF p_address IS NOT NULL AND (p_address != v_old_address OR v_old_address IS NULL) THEN
        CALL sp_log_change(p_id, p_changed_by, p_session_id, 'companies', p_id, 'update', 'address', v_old_address, p_address, 0, p_ip_address, p_user_agent);
    END IF;
    IF p_city IS NOT NULL AND (p_city != v_old_city OR v_old_city IS NULL) THEN
        CALL sp_log_change(p_id, p_changed_by, p_session_id, 'companies', p_id, 'update', 'city', v_old_city, p_city, 0, p_ip_address, p_user_agent);
    END IF;
    IF p_state IS NOT NULL AND (p_state != v_old_state OR v_old_state IS NULL) THEN
        CALL sp_log_change(p_id, p_changed_by, p_session_id, 'companies', p_id, 'update', 'state', v_old_state, p_state, 0, p_ip_address, p_user_agent);
    END IF;
    IF p_province IS NOT NULL AND (p_province != v_old_province OR v_old_province IS NULL) THEN
        CALL sp_log_change(p_id, p_changed_by, p_session_id, 'companies', p_id, 'update', 'province', v_old_province, p_province, 0, p_ip_address, p_user_agent);
    END IF;
    IF p_max_employees IS NOT NULL AND p_max_employees != v_old_max_employees THEN
        CALL sp_log_change(p_id, p_changed_by, p_session_id, 'companies', p_id, 'update', 'max_employees', CAST(v_old_max_employees AS CHAR), CAST(p_max_employees AS CHAR), 0, p_ip_address, p_user_agent);
    END IF;
    IF p_plan IS NOT NULL AND p_plan != v_old_plan THEN
        CALL sp_log_change(p_id, p_changed_by, p_session_id, 'companies', p_id, 'update', 'plan', v_old_plan, p_plan, 0, p_ip_address, p_user_agent);
    END IF;
END//

-- ============================================================
-- COMPANY: SOFT DELETE
-- ============================================================
DROP PROCEDURE IF EXISTS sp_delete_company//
CREATE PROCEDURE sp_delete_company(
    IN p_id VARCHAR(36),
    IN p_changed_by VARCHAR(36),
    IN p_session_id VARCHAR(36),
    IN p_ip_address VARCHAR(45),
    IN p_user_agent VARCHAR(500)
)
BEGIN
    UPDATE companies SET is_active = 0 WHERE id = p_id AND is_active = 1;

    CALL sp_log_change(p_id, p_changed_by, p_session_id, 'companies', p_id, 'delete', 'is_active', '1', '0', 0, p_ip_address, p_user_agent);

    -- Soft delete all user access for this company
    UPDATE user_company_access SET is_active = 0 WHERE company_id = p_id AND is_active = 1;
END//

-- ============================================================
-- USER: CREATE
-- ============================================================
DROP PROCEDURE IF EXISTS sp_create_user//
CREATE PROCEDURE sp_create_user(
    IN p_id VARCHAR(36),
    IN p_email VARCHAR(255),
    IN p_username VARCHAR(100),
    IN p_password_hash VARCHAR(255),
    IN p_salt VARCHAR(255),
    IN p_company_id VARCHAR(36),
    IN p_session_id VARCHAR(36),
    IN p_ip_address VARCHAR(45),
    IN p_user_agent VARCHAR(500)
)
BEGIN
    INSERT INTO users (
        id, email, username, password_hash, salt,
        is_active, failed_login_attempts,
        created_at, updated_at
    ) VALUES (
        p_id, p_email, p_username, p_password_hash, p_salt,
        1, 0,
        NOW(), NOW()
    );

    -- Log insert (password_hash and salt not logged for security)
    CALL sp_log_change(p_company_id, p_id, p_session_id, 'users', p_id, 'insert', 'email', NULL, p_email, 0, p_ip_address, p_user_agent);
    CALL sp_log_change(p_company_id, p_id, p_session_id, 'users', p_id, 'insert', 'username', NULL, p_username, 0, p_ip_address, p_user_agent);
END//

-- ============================================================
-- USER: READ
-- ============================================================
DROP PROCEDURE IF EXISTS sp_get_user//
CREATE PROCEDURE sp_get_user(
    IN p_id VARCHAR(36)
)
BEGIN
    SELECT id, email, username, is_active, last_login_at,
           password_changed_at, created_at, updated_at
    FROM users
    WHERE id = p_id AND is_active = 1;
END//

-- ============================================================
-- USER: READ BY EMAIL (for login)
-- ============================================================
DROP PROCEDURE IF EXISTS sp_get_user_by_email//
CREATE PROCEDURE sp_get_user_by_email(
    IN p_email VARCHAR(255)
)
BEGIN
    SELECT id, email, username, password_hash, salt, totp_secret_enc,
           is_active, failed_login_attempts, locked_until,
           last_login_at, created_at, updated_at
    FROM users
    WHERE email = p_email;
END//

-- ============================================================
-- USER: UPDATE
-- ============================================================
DROP PROCEDURE IF EXISTS sp_update_user//
CREATE PROCEDURE sp_update_user(
    IN p_id VARCHAR(36),
    IN p_email VARCHAR(255),
    IN p_username VARCHAR(100),
    IN p_company_id VARCHAR(36),
    IN p_changed_by VARCHAR(36),
    IN p_session_id VARCHAR(36),
    IN p_ip_address VARCHAR(45),
    IN p_user_agent VARCHAR(500)
)
BEGIN
    DECLARE v_old_email VARCHAR(255);
    DECLARE v_old_username VARCHAR(100);

    SELECT email, username
    INTO v_old_email, v_old_username
    FROM users WHERE id = p_id AND is_active = 1;

    UPDATE users SET
        email = IFNULL(p_email, email),
        username = IFNULL(p_username, username)
    WHERE id = p_id AND is_active = 1;

    IF p_email IS NOT NULL AND p_email != v_old_email THEN
        CALL sp_log_change(p_company_id, p_changed_by, p_session_id, 'users', p_id, 'update', 'email', v_old_email, p_email, 0, p_ip_address, p_user_agent);
    END IF;
    IF p_username IS NOT NULL AND p_username != v_old_username THEN
        CALL sp_log_change(p_company_id, p_changed_by, p_session_id, 'users', p_id, 'update', 'username', v_old_username, p_username, 0, p_ip_address, p_user_agent);
    END IF;
END//

-- ============================================================
-- USER: CHANGE PASSWORD
-- ============================================================
DROP PROCEDURE IF EXISTS sp_change_password//
CREATE PROCEDURE sp_change_password(
    IN p_id VARCHAR(36),
    IN p_password_hash VARCHAR(255),
    IN p_salt VARCHAR(255),
    IN p_company_id VARCHAR(36),
    IN p_session_id VARCHAR(36),
    IN p_ip_address VARCHAR(45),
    IN p_user_agent VARCHAR(500)
)
BEGIN
    UPDATE users SET
        password_hash = p_password_hash,
        salt = p_salt,
        password_changed_at = NOW(),
        failed_login_attempts = 0,
        locked_until = NULL
    WHERE id = p_id AND is_active = 1;

    -- Log that password changed without storing actual hash
    CALL sp_log_change(p_company_id, p_id, p_session_id, 'users', p_id, 'update', 'password_hash', '[redacted]', '[redacted]', 0, p_ip_address, p_user_agent);
    CALL sp_log_change(p_company_id, p_id, p_session_id, 'users', p_id, 'update', 'password_changed_at', NULL, CAST(NOW() AS CHAR), 0, p_ip_address, p_user_agent);
END//

-- ============================================================
-- USER: SOFT DELETE
-- ============================================================
DROP PROCEDURE IF EXISTS sp_delete_user//
CREATE PROCEDURE sp_delete_user(
    IN p_id VARCHAR(36),
    IN p_company_id VARCHAR(36),
    IN p_changed_by VARCHAR(36),
    IN p_session_id VARCHAR(36),
    IN p_ip_address VARCHAR(45),
    IN p_user_agent VARCHAR(500)
)
BEGIN
    UPDATE users SET is_active = 0 WHERE id = p_id AND is_active = 1;

    CALL sp_log_change(p_company_id, p_changed_by, p_session_id, 'users', p_id, 'delete', 'is_active', '1', '0', 0, p_ip_address, p_user_agent);

    -- Soft delete all company access for this user
    UPDATE user_company_access SET is_active = 0 WHERE user_id = p_id AND is_active = 1;
END//

-- ============================================================
-- USER: UPDATE LOGIN STATE (login success/failure)
-- ============================================================
DROP PROCEDURE IF EXISTS sp_login_success//
CREATE PROCEDURE sp_login_success(
    IN p_user_id VARCHAR(36)
)
BEGIN
    UPDATE users SET
        last_login_at = NOW(),
        failed_login_attempts = 0,
        locked_until = NULL
    WHERE id = p_user_id;
END//

DROP PROCEDURE IF EXISTS sp_login_failure//
CREATE PROCEDURE sp_login_failure(
    IN p_user_id VARCHAR(36),
    IN p_max_attempts INT,
    IN p_lockout_minutes INT
)
BEGIN
    DECLARE v_attempts INT;

    UPDATE users SET
        failed_login_attempts = failed_login_attempts + 1
    WHERE id = p_user_id;

    SELECT failed_login_attempts INTO v_attempts
    FROM users WHERE id = p_user_id;

    -- Lock account if max attempts exceeded
    IF v_attempts >= p_max_attempts THEN
        UPDATE users SET
            locked_until = DATE_ADD(NOW(), INTERVAL p_lockout_minutes MINUTE)
        WHERE id = p_user_id;
    END IF;
END//

-- ============================================================
-- USER COMPANY ACCESS: CREATE
-- ============================================================
DROP PROCEDURE IF EXISTS sp_create_user_company_access//
CREATE PROCEDURE sp_create_user_company_access(
    IN p_id VARCHAR(36),
    IN p_user_id VARCHAR(36),
    IN p_company_id VARCHAR(36),
    IN p_wrapped_company_key BLOB,
    IN p_key_wrap_algorithm VARCHAR(50),
    IN p_public_key BLOB,
    IN p_role VARCHAR(50),
    IN p_permissions JSON,
    IN p_changed_by VARCHAR(36),
    IN p_session_id VARCHAR(36),
    IN p_ip_address VARCHAR(45),
    IN p_user_agent VARCHAR(500)
)
BEGIN
    DECLARE v_role VARCHAR(50);
    DECLARE v_algorithm VARCHAR(50);

    SET v_role = IFNULL(p_role, 'employee');
    SET v_algorithm = IFNULL(p_key_wrap_algorithm, 'AES-256-KW');

    INSERT INTO user_company_access (
        id, user_id, company_id,
        wrapped_company_key, key_wrap_algorithm, key_version,
        public_key, role, permissions,
        is_active, joined_at, updated_at
    ) VALUES (
        p_id, p_user_id, p_company_id,
        p_wrapped_company_key, v_algorithm, 1,
        p_public_key, v_role, p_permissions,
        1, NOW(), NOW()
    );

    CALL sp_log_change(p_company_id, p_changed_by, p_session_id, 'user_company_access', p_id, 'insert', 'user_id', NULL, p_user_id, 0, p_ip_address, p_user_agent);
    CALL sp_log_change(p_company_id, p_changed_by, p_session_id, 'user_company_access', p_id, 'insert', 'role', NULL, v_role, 0, p_ip_address, p_user_agent);
    CALL sp_log_change(p_company_id, p_changed_by, p_session_id, 'user_company_access', p_id, 'insert', 'key_wrap_algorithm', NULL, v_algorithm, 0, p_ip_address, p_user_agent);
    CALL sp_log_change(p_company_id, p_changed_by, p_session_id, 'user_company_access', p_id, 'insert', 'wrapped_company_key', NULL, NULL, 1, p_ip_address, p_user_agent);
    CALL sp_log_change(p_company_id, p_changed_by, p_session_id, 'user_company_access', p_id, 'insert', 'public_key', NULL, NULL, 1, p_ip_address, p_user_agent);
END//

-- ============================================================
-- USER COMPANY ACCESS: READ (get companies for a user)
-- ============================================================
DROP PROCEDURE IF EXISTS sp_get_user_companies//
CREATE PROCEDURE sp_get_user_companies(
    IN p_user_id VARCHAR(36)
)
BEGIN
    SELECT uca.id, uca.company_id, uca.wrapped_company_key, uca.key_wrap_algorithm,
           uca.key_version, uca.public_key, uca.role, uca.permissions, uca.joined_at,
           c.name AS company_name, c.plan AS company_plan
    FROM user_company_access uca
    INNER JOIN companies c ON c.id = uca.company_id AND c.is_active = 1
    WHERE uca.user_id = p_user_id AND uca.is_active = 1;
END//

-- ============================================================
-- USER COMPANY ACCESS: READ (get users for a company)
-- ============================================================
DROP PROCEDURE IF EXISTS sp_get_company_users//
CREATE PROCEDURE sp_get_company_users(
    IN p_company_id VARCHAR(36)
)
BEGIN
    SELECT uca.id, uca.user_id, uca.role, uca.permissions, uca.joined_at,
           u.email, u.username, u.last_login_at
    FROM user_company_access uca
    INNER JOIN users u ON u.id = uca.user_id AND u.is_active = 1
    WHERE uca.company_id = p_company_id AND uca.is_active = 1;
END//

-- ============================================================
-- USER COMPANY ACCESS: UPDATE (role, permissions, key)
-- ============================================================
DROP PROCEDURE IF EXISTS sp_update_user_company_access//
CREATE PROCEDURE sp_update_user_company_access(
    IN p_id VARCHAR(36),
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
    IN p_user_agent VARCHAR(500)
)
BEGIN
    DECLARE v_old_role VARCHAR(50);
    DECLARE v_old_permissions JSON;
    DECLARE v_old_key_wrap_algorithm VARCHAR(50);
    DECLARE v_old_key_version INT;

    SELECT role, permissions, key_wrap_algorithm, key_version
    INTO v_old_role, v_old_permissions, v_old_key_wrap_algorithm, v_old_key_version
    FROM user_company_access WHERE id = p_id AND is_active = 1;

    UPDATE user_company_access SET
        role = IFNULL(p_role, role),
        permissions = IFNULL(p_permissions, permissions),
        wrapped_company_key = IFNULL(p_wrapped_company_key, wrapped_company_key),
        key_wrap_algorithm = IFNULL(p_key_wrap_algorithm, key_wrap_algorithm),
        key_version = IFNULL(p_key_version, key_version),
        public_key = IFNULL(p_public_key, public_key)
    WHERE id = p_id AND is_active = 1;

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
END//

-- ============================================================
-- USER COMPANY ACCESS: SOFT DELETE (revoke access)
-- ============================================================
DROP PROCEDURE IF EXISTS sp_delete_user_company_access//
CREATE PROCEDURE sp_delete_user_company_access(
    IN p_id VARCHAR(36),
    IN p_company_id VARCHAR(36),
    IN p_changed_by VARCHAR(36),
    IN p_session_id VARCHAR(36),
    IN p_ip_address VARCHAR(45),
    IN p_user_agent VARCHAR(500)
)
BEGIN
    DECLARE v_user_id VARCHAR(36);
    DECLARE v_role VARCHAR(50);

    SELECT user_id, role INTO v_user_id, v_role
    FROM user_company_access WHERE id = p_id AND is_active = 1;

    UPDATE user_company_access SET is_active = 0 WHERE id = p_id AND is_active = 1;

    CALL sp_log_change(p_company_id, p_changed_by, p_session_id, 'user_company_access', p_id, 'delete', 'is_active', '1', '0', 0, p_ip_address, p_user_agent);
    CALL sp_log_change(p_company_id, p_changed_by, p_session_id, 'user_company_access', p_id, 'delete', 'user_id', v_user_id, NULL, 0, p_ip_address, p_user_agent);
    CALL sp_log_change(p_company_id, p_changed_by, p_session_id, 'user_company_access', p_id, 'delete', 'role', v_role, NULL, 0, p_ip_address, p_user_agent);
END//

-- ============================================================
-- USER SESSION: CREATE
-- ============================================================
DROP PROCEDURE IF EXISTS sp_create_session//
CREATE PROCEDURE sp_create_session(
    IN p_id VARCHAR(36),
    IN p_user_id VARCHAR(36),
    IN p_company_id VARCHAR(36),
    IN p_device_info VARCHAR(500),
    IN p_ip_address VARCHAR(45),
    IN p_expires_at DATETIME
)
BEGIN
    INSERT INTO user_sessions (
        id, user_id, company_id, device_info, ip_address,
        is_active, expires_at, created_at, last_activity_at
    ) VALUES (
        p_id, p_user_id, p_company_id, p_device_info, p_ip_address,
        1, p_expires_at, NOW(), NOW()
    );
END//

-- ============================================================
-- USER SESSION: INVALIDATE
-- ============================================================
DROP PROCEDURE IF EXISTS sp_invalidate_session//
CREATE PROCEDURE sp_invalidate_session(
    IN p_id VARCHAR(36)
)
BEGIN
    UPDATE user_sessions SET is_active = 0 WHERE id = p_id;
END//

-- ============================================================
-- USER SESSION: INVALIDATE ALL (for a user)
-- ============================================================
DROP PROCEDURE IF EXISTS sp_invalidate_all_sessions//
CREATE PROCEDURE sp_invalidate_all_sessions(
    IN p_user_id VARCHAR(36)
)
BEGIN
    UPDATE user_sessions SET is_active = 0
    WHERE user_id = p_user_id AND is_active = 1;
END//

-- ============================================================
-- USER SESSION: VALIDATE
-- ============================================================
DROP PROCEDURE IF EXISTS sp_validate_session//
CREATE PROCEDURE sp_validate_session(
    IN p_id VARCHAR(36)
)
BEGIN
    SELECT s.id, s.user_id, s.company_id, s.expires_at,
           u.email, u.username, u.is_active AS user_active,
           uca.role, uca.permissions, uca.wrapped_company_key,
           uca.key_wrap_algorithm, uca.key_version, uca.public_key
    FROM user_sessions s
    INNER JOIN users u ON u.id = s.user_id
    INNER JOIN user_company_access uca ON uca.user_id = s.user_id AND uca.company_id = s.company_id AND uca.is_active = 1
    WHERE s.id = p_id
      AND s.is_active = 1
      AND s.expires_at > NOW()
      AND u.is_active = 1;

    -- Update last activity
    UPDATE user_sessions SET last_activity_at = NOW()
    WHERE id = p_id AND is_active = 1;
END//

-- ============================================================
-- FULL REGISTRATION: Company + Admin User + Access
-- Orchestrates the complete registration flow
-- ============================================================
DROP PROCEDURE IF EXISTS sp_register//
CREATE PROCEDURE sp_register(
    -- Company
    IN p_company_id VARCHAR(36),
    IN p_company_name VARCHAR(255),
    IN p_company_industry VARCHAR(100),
    IN p_company_address VARCHAR(500),
    IN p_company_city VARCHAR(100),
    IN p_company_state VARCHAR(100),
    IN p_company_province VARCHAR(100),
    IN p_key_algorithm VARCHAR(50),
    -- User
    IN p_user_id VARCHAR(36),
    IN p_email VARCHAR(255),
    IN p_username VARCHAR(100),
    IN p_password_hash VARCHAR(255),
    IN p_salt VARCHAR(255),
    -- Access
    IN p_access_id VARCHAR(36),
    IN p_wrapped_company_key BLOB,
    IN p_key_wrap_algorithm VARCHAR(50),
    IN p_public_key BLOB,
    -- Meta
    IN p_ip_address VARCHAR(45),
    IN p_user_agent VARCHAR(500)
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    -- 1. Create company (user is changed_by since they're the first admin)
    CALL sp_create_company(
        p_company_id, p_company_name, p_company_industry,
        p_company_address, p_company_city, p_company_state, p_company_province,
        p_key_algorithm, 500, 'standard',
        p_user_id, NULL, p_ip_address, p_user_agent
    );

    -- 2. Create user
    CALL sp_create_user(
        p_user_id, p_email, p_username, p_password_hash, p_salt,
        p_company_id, NULL, p_ip_address, p_user_agent
    );

    -- 3. Link user to company as superadmin
    CALL sp_create_user_company_access(
        p_access_id, p_user_id, p_company_id,
        p_wrapped_company_key, p_key_wrap_algorithm, p_public_key,
        'superadmin', NULL,
        p_user_id, NULL, p_ip_address, p_user_agent
    );

    COMMIT;
END//

-- ============================================================
-- CHANGE HISTORY: READ (for a specific record)
-- ============================================================
DROP PROCEDURE IF EXISTS sp_get_change_history//
CREATE PROCEDURE sp_get_change_history(
    IN p_company_id VARCHAR(36),
    IN p_table_name VARCHAR(100),
    IN p_record_id VARCHAR(36),
    IN p_limit INT,
    IN p_offset INT
)
BEGIN
    DECLARE v_limit INT;
    DECLARE v_offset INT;

    SET v_limit = IFNULL(p_limit, 50);
    SET v_offset = IFNULL(p_offset, 0);

    SELECT ch.*, u.email AS changed_by_email, u.username AS changed_by_username
    FROM change_history ch
    LEFT JOIN users u ON u.id = ch.changed_by
    WHERE ch.company_id = p_company_id
      AND (p_table_name IS NULL OR ch.table_name = p_table_name)
      AND (p_record_id IS NULL OR ch.record_id = p_record_id)
    ORDER BY ch.changed_at DESC
    LIMIT v_limit OFFSET v_offset;
END//

DELIMITER ;
