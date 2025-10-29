/*
 Navicat Premium Dump SQL

 Source Server         : Local
 Source Server Type    : MySQL
 Source Server Version : 90300 (9.3.0)
 Source Host           : localhost:3306
 Source Schema         : ls

 Target Server Type    : MySQL
 Target Server Version : 90300 (9.3.0)
 File Encoding         : 65001

 Date: 29/10/2025 20:15:43
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for audit_logs
-- ----------------------------
DROP TABLE IF EXISTS `audit_logs`;
CREATE TABLE `audit_logs` (
  `audit_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned DEFAULT NULL,
  `company_id` bigint unsigned DEFAULT NULL,
  `branch_id` bigint unsigned DEFAULT NULL,
  `action` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'e.g., login, logout, data_access, data_modify',
  `resource_type` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'e.g., user, order, product',
  `resource_id` bigint unsigned DEFAULT NULL,
  `details_encrypted` varbinary(5000) DEFAULT NULL COMMENT 'Encrypted audit details',
  `ip_address_encrypted` varbinary(500) DEFAULT NULL COMMENT 'Encrypted IP address',
  `user_agent` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `status_id` bigint unsigned DEFAULT NULL COMMENT 'Operation status',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`audit_id`),
  KEY `idx_user_action` (`user_id`,`action`),
  KEY `idx_company` (`company_id`),
  KEY `idx_branch` (`branch_id`),
  KEY `idx_status` (`status_id`),
  KEY `idx_resource` (`resource_type`,`resource_id`),
  KEY `idx_created` (`created_at`),
  CONSTRAINT `audit_logs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `audit_logs_ibfk_2` FOREIGN KEY (`company_id`) REFERENCES `companies` (`company_id`) ON DELETE SET NULL,
  CONSTRAINT `audit_logs_ibfk_3` FOREIGN KEY (`branch_id`) REFERENCES `company_branches` (`branch_id`) ON DELETE SET NULL,
  CONSTRAINT `audit_logs_ibfk_4` FOREIGN KEY (`status_id`) REFERENCES `status_lookup` (`status_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for companies
-- ----------------------------
DROP TABLE IF EXISTS `companies`;
CREATE TABLE `companies` (
  `company_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `company_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Internal company identifier',
  `company_name_encrypted` varbinary(500) NOT NULL COMMENT 'Encrypted company name',
  `legal_name_encrypted` varbinary(500) NOT NULL COMMENT 'Encrypted legal company name',
  `registration_number_encrypted` varbinary(500) DEFAULT NULL COMMENT 'Encrypted business registration number',
  `tax_id_encrypted` varbinary(500) DEFAULT NULL COMMENT 'Encrypted tax identification number',
  `vat_number_encrypted` varbinary(500) DEFAULT NULL COMMENT 'Encrypted VAT number',
  `email_encrypted` varbinary(500) DEFAULT NULL COMMENT 'Encrypted company email',
  `phone_encrypted` varbinary(500) DEFAULT NULL COMMENT 'Encrypted company phone',
  `website_encrypted` varbinary(500) DEFAULT NULL COMMENT 'Encrypted company website',
  `street_address_encrypted` varbinary(1000) DEFAULT NULL COMMENT 'Encrypted street address',
  `city_encrypted` varbinary(500) DEFAULT NULL COMMENT 'Encrypted city',
  `state_encrypted` varbinary(500) DEFAULT NULL COMMENT 'Encrypted state/province',
  `postal_code_encrypted` varbinary(500) DEFAULT NULL COMMENT 'Encrypted postal code',
  `country_encrypted` varbinary(500) DEFAULT NULL COMMENT 'Encrypted country',
  `company_type` enum('headquarters','subsidiary','branch','franchise') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'headquarters',
  `parent_company_id` bigint unsigned DEFAULT NULL,
  `industry` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `employee_count_range` enum('1-10','11-50','51-200','201-500','501-1000','1000+') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status_id` bigint unsigned NOT NULL,
  `established_date` date DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`company_id`),
  UNIQUE KEY `company_code` (`company_code`),
  KEY `idx_company_code` (`company_code`),
  KEY `idx_parent` (`parent_company_id`),
  KEY `idx_status` (`status_id`),
  CONSTRAINT `companies_ibfk_1` FOREIGN KEY (`parent_company_id`) REFERENCES `companies` (`company_id`),
  CONSTRAINT `companies_ibfk_2` FOREIGN KEY (`status_id`) REFERENCES `status_lookup` (`status_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for company_branches
-- ----------------------------
DROP TABLE IF EXISTS `company_branches`;
CREATE TABLE `company_branches` (
  `branch_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint unsigned NOT NULL,
  `branch_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Internal branch identifier',
  `branch_name_encrypted` varbinary(500) NOT NULL COMMENT 'Encrypted branch name',
  `branch_email_encrypted` varbinary(500) DEFAULT NULL COMMENT 'Encrypted branch email',
  `branch_phone_encrypted` varbinary(500) DEFAULT NULL COMMENT 'Encrypted branch phone',
  `branch_fax_encrypted` varbinary(500) DEFAULT NULL COMMENT 'Encrypted branch fax',
  `street_address_encrypted` varbinary(1000) NOT NULL COMMENT 'Encrypted street address',
  `city_encrypted` varbinary(500) NOT NULL COMMENT 'Encrypted city',
  `state_encrypted` varbinary(500) DEFAULT NULL COMMENT 'Encrypted state/province',
  `postal_code_encrypted` varbinary(500) NOT NULL COMMENT 'Encrypted postal code',
  `country_encrypted` varbinary(500) NOT NULL COMMENT 'Encrypted country',
  `branch_type` enum('main','regional','local','warehouse','retail','office') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'office',
  `time_zone` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `currency_code` varchar(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ISO 4217 currency code',
  `opening_hours` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT 'JSON or text format for hours',
  `capacity_info` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT 'Branch capacity information',
  `status_id` bigint unsigned NOT NULL,
  `is_primary` tinyint(1) DEFAULT '0',
  `opened_date` date DEFAULT NULL,
  `closed_date` date DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`branch_id`),
  UNIQUE KEY `branch_code` (`branch_code`),
  KEY `idx_company` (`company_id`),
  KEY `idx_branch_code` (`branch_code`),
  KEY `idx_status` (`status_id`),
  CONSTRAINT `company_branches_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`company_id`) ON DELETE CASCADE,
  CONSTRAINT `company_branches_ibfk_2` FOREIGN KEY (`status_id`) REFERENCES `status_lookup` (`status_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for departments
-- ----------------------------
DROP TABLE IF EXISTS `departments`;
CREATE TABLE `departments` (
  `department_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned DEFAULT NULL COMMENT 'NULL means company-wide department',
  `department_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `department_name` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `parent_department_id` bigint unsigned DEFAULT NULL,
  `manager_user_id` bigint unsigned DEFAULT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `status_id` bigint unsigned NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`department_id`),
  UNIQUE KEY `unique_company_dept_code` (`company_id`,`department_code`),
  KEY `manager_user_id` (`manager_user_id`),
  KEY `idx_company` (`company_id`),
  KEY `idx_branch` (`branch_id`),
  KEY `idx_parent` (`parent_department_id`),
  KEY `idx_status` (`status_id`),
  KEY `idx_code` (`department_code`),
  CONSTRAINT `departments_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`company_id`) ON DELETE CASCADE,
  CONSTRAINT `departments_ibfk_2` FOREIGN KEY (`branch_id`) REFERENCES `company_branches` (`branch_id`),
  CONSTRAINT `departments_ibfk_3` FOREIGN KEY (`parent_department_id`) REFERENCES `departments` (`department_id`),
  CONSTRAINT `departments_ibfk_4` FOREIGN KEY (`manager_user_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `departments_ibfk_5` FOREIGN KEY (`status_id`) REFERENCES `status_lookup` (`status_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for password_reset_tokens
-- ----------------------------
DROP TABLE IF EXISTS `password_reset_tokens`;
CREATE TABLE `password_reset_tokens` (
  `token_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `token_hash` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Hashed token (not encrypted)',
  `status_id` bigint unsigned NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` timestamp NOT NULL,
  `used_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`token_id`),
  UNIQUE KEY `token_hash` (`token_hash`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_status` (`status_id`),
  KEY `idx_expires` (`expires_at`),
  CONSTRAINT `password_reset_tokens_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `password_reset_tokens_ibfk_2` FOREIGN KEY (`status_id`) REFERENCES `status_lookup` (`status_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for permissions
-- ----------------------------
DROP TABLE IF EXISTS `permissions`;
CREATE TABLE `permissions` (
  `permission_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `permission_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `permission_description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `resource` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'e.g., users, orders, inventory',
  `action` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'e.g., create, read, update, delete',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`permission_id`),
  UNIQUE KEY `permission_name` (`permission_name`),
  UNIQUE KEY `unique_resource_action` (`resource`,`action`),
  KEY `idx_resource` (`resource`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for role_permissions
-- ----------------------------
DROP TABLE IF EXISTS `role_permissions`;
CREATE TABLE `role_permissions` (
  `role_permission_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `role_id` bigint unsigned NOT NULL,
  `permission_id` bigint unsigned NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`role_permission_id`),
  UNIQUE KEY `unique_role_permission` (`role_id`,`permission_id`),
  KEY `permission_id` (`permission_id`),
  CONSTRAINT `role_permissions_ibfk_1` FOREIGN KEY (`role_id`) REFERENCES `roles` (`role_id`) ON DELETE CASCADE,
  CONSTRAINT `role_permissions_ibfk_2` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`permission_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for roles
-- ----------------------------
DROP TABLE IF EXISTS `roles`;
CREATE TABLE `roles` (
  `role_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint unsigned DEFAULT NULL COMMENT 'NULL means system-wide role',
  `role_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `role_description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `status_id` bigint unsigned NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`role_id`),
  UNIQUE KEY `unique_company_role` (`company_id`,`role_name`),
  KEY `idx_role_name` (`role_name`),
  KEY `idx_company` (`company_id`),
  KEY `idx_status` (`status_id`),
  CONSTRAINT `roles_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`company_id`) ON DELETE CASCADE,
  CONSTRAINT `roles_ibfk_2` FOREIGN KEY (`status_id`) REFERENCES `status_lookup` (`status_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for status_lookup
-- ----------------------------
DROP TABLE IF EXISTS `status_lookup`;
CREATE TABLE `status_lookup` (
  `status_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `status_category` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'e.g., user, company, sql_operation, transaction',
  `status_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Internal code identifier',
  `status_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Display name',
  `status_description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `status_order` tinyint unsigned DEFAULT '0' COMMENT 'Display order',
  `severity_level` enum('info','success','warning','error','critical') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Severity level for system statuses',
  `http_status_code` int DEFAULT NULL COMMENT 'Associated HTTP status code if applicable',
  `is_active` tinyint(1) DEFAULT '1',
  `is_default` tinyint(1) DEFAULT '0',
  `is_terminal` tinyint(1) DEFAULT '0' COMMENT 'Indicates if this is a final state',
  `metadata` json DEFAULT NULL COMMENT 'Additional status properties',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`status_id`),
  UNIQUE KEY `unique_category_code` (`status_category`,`status_code`),
  KEY `idx_category` (`status_category`),
  KEY `idx_code` (`status_code`),
  KEY `idx_severity` (`severity_level`),
  KEY `idx_active` (`is_active`)
) ENGINE=InnoDB AUTO_INCREMENT=80 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for user_employment
-- ----------------------------
DROP TABLE IF EXISTS `user_employment`;
CREATE TABLE `user_employment` (
  `employment_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `company_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned DEFAULT NULL,
  `employee_id` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `department_id` bigint unsigned NOT NULL,
  `job_title` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `employment_type` enum('full-time','part-time','contract','intern','consultant') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `salary_encrypted` varbinary(500) DEFAULT NULL COMMENT 'Encrypted salary',
  `tax_id_encrypted` varbinary(500) DEFAULT NULL COMMENT 'Encrypted tax ID',
  `hire_date` date NOT NULL,
  `termination_date` date DEFAULT NULL,
  `reporting_to_user_id` bigint unsigned DEFAULT NULL,
  `status_id` bigint unsigned NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`employment_id`),
  UNIQUE KEY `unique_company_employee_id` (`company_id`,`employee_id`),
  KEY `reporting_to_user_id` (`reporting_to_user_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_company` (`company_id`),
  KEY `idx_branch` (`branch_id`),
  KEY `idx_employee_id` (`employee_id`),
  KEY `idx_department` (`department_id`),
  KEY `idx_status` (`status_id`),
  CONSTRAINT `user_employment_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `user_employment_ibfk_2` FOREIGN KEY (`company_id`) REFERENCES `companies` (`company_id`),
  CONSTRAINT `user_employment_ibfk_3` FOREIGN KEY (`branch_id`) REFERENCES `company_branches` (`branch_id`),
  CONSTRAINT `user_employment_ibfk_4` FOREIGN KEY (`department_id`) REFERENCES `departments` (`department_id`),
  CONSTRAINT `user_employment_ibfk_5` FOREIGN KEY (`reporting_to_user_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `user_employment_ibfk_6` FOREIGN KEY (`status_id`) REFERENCES `status_lookup` (`status_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for user_preferences
-- ----------------------------
DROP TABLE IF EXISTS `user_preferences`;
CREATE TABLE `user_preferences` (
  `preference_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `preference_key` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `preference_value_encrypted` varbinary(2000) DEFAULT NULL COMMENT 'Encrypted preference value',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`preference_id`),
  UNIQUE KEY `unique_user_preference` (`user_id`,`preference_key`),
  CONSTRAINT `user_preferences_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for user_roles
-- ----------------------------
DROP TABLE IF EXISTS `user_roles`;
CREATE TABLE `user_roles` (
  `user_role_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `role_id` bigint unsigned NOT NULL,
  `assigned_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `assigned_by` bigint unsigned DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`user_role_id`),
  UNIQUE KEY `unique_user_role` (`user_id`,`role_id`),
  KEY `role_id` (`role_id`),
  KEY `assigned_by` (`assigned_by`),
  KEY `idx_expires` (`expires_at`),
  CONSTRAINT `user_roles_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `user_roles_ibfk_2` FOREIGN KEY (`role_id`) REFERENCES `roles` (`role_id`) ON DELETE CASCADE,
  CONSTRAINT `user_roles_ibfk_3` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for user_sessions
-- ----------------------------
DROP TABLE IF EXISTS `user_sessions`;
CREATE TABLE `user_sessions` (
  `session_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `session_token` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ip_address_encrypted` varbinary(500) DEFAULT NULL COMMENT 'Encrypted IP address',
  `user_agent` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `status_id` bigint unsigned NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` timestamp NOT NULL,
  `last_activity_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`session_id`),
  UNIQUE KEY `session_token` (`session_token`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_token` (`session_token`),
  KEY `idx_status` (`status_id`),
  KEY `idx_expires` (`expires_at`),
  CONSTRAINT `user_sessions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `user_sessions_ibfk_2` FOREIGN KEY (`status_id`) REFERENCES `status_lookup` (`status_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for users
-- ----------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `user_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `username` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `company_id` bigint unsigned DEFAULT NULL,
  `primary_branch_id` bigint unsigned DEFAULT NULL,
  `first_name_encrypted` varbinary(500) NOT NULL COMMENT 'Encrypted first name',
  `last_name_encrypted` varbinary(500) NOT NULL COMMENT 'Encrypted last name',
  `email_encrypted` varbinary(500) NOT NULL COMMENT 'Encrypted email address',
  `phone_encrypted` varbinary(500) DEFAULT NULL COMMENT 'Encrypted phone number',
  `date_of_birth_encrypted` varbinary(500) DEFAULT NULL COMMENT 'Encrypted date of birth',
  `ssn_encrypted` varbinary(500) DEFAULT NULL COMMENT 'Encrypted SSN/National ID',
  `password_hash` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Bcrypt/Argon2 hashed password',
  `password_salt` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Salt for password hashing',
  `status_id` bigint unsigned NOT NULL,
  `email_verified` tinyint(1) DEFAULT '0',
  `phone_verified` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `last_login_at` timestamp NULL DEFAULT NULL,
  `password_changed_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `username` (`username`),
  KEY `idx_username` (`username`),
  KEY `idx_status` (`status_id`),
  KEY `idx_company` (`company_id`),
  KEY `idx_branch` (`primary_branch_id`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `users_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`company_id`),
  CONSTRAINT `users_ibfk_2` FOREIGN KEY (`primary_branch_id`) REFERENCES `company_branches` (`branch_id`),
  CONSTRAINT `users_ibfk_3` FOREIGN KEY (`status_id`) REFERENCES `status_lookup` (`status_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Procedure structure for sp_register_user
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_register_user`;
delimiter ;;
CREATE PROCEDURE `sp_register_user`(IN p_username VARCHAR(100),
    IN p_first_name_encrypted VARBINARY(500),
    IN p_last_name_encrypted VARBINARY(500),
    IN p_email_encrypted VARBINARY(500),
    IN p_phone_encrypted VARBINARY(500),
    IN p_date_of_birth_encrypted VARBINARY(500),
    IN p_ssn_encrypted VARBINARY(500),
    IN p_password_hash VARCHAR(255),
    IN p_password_salt VARCHAR(64),
    IN p_company_id BIGINT UNSIGNED,
    IN p_primary_branch_id BIGINT UNSIGNED,
    OUT p_user_id BIGINT UNSIGNED,
    OUT p_status_code VARCHAR(50),
    OUT p_message VARCHAR(500))
proc_label: BEGIN
    -- Declare variables
    DECLARE v_status_id BIGINT UNSIGNED;
    DECLARE v_username_exists INT DEFAULT 0;
    DECLARE v_company_exists INT DEFAULT 0;
    DECLARE v_branch_exists INT DEFAULT 0;
    DECLARE v_company_active INT DEFAULT 0;
    DECLARE v_branch_active INT DEFAULT 0;
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        -- Rollback on any error
        ROLLBACK;
        SET p_user_id = NULL;
        SET p_status_code = 'sql_error';
        SET p_message = 'An error occurred during user registration. Please try again.';
    END;
    
    -- Start transaction
    START TRANSACTION;
    
    -- Input validation
    IF p_username IS NULL OR TRIM(p_username) = '' THEN
        SET p_user_id = NULL;
        SET p_status_code = 'validation_error';
        SET p_message = 'Username is required';
        ROLLBACK;
        LEAVE proc_label;
    END IF;
    
    IF p_first_name_encrypted IS NULL THEN
        SET p_user_id = NULL;
        SET p_status_code = 'validation_error';
        SET p_message = 'First name is required';
        ROLLBACK;
        LEAVE proc_label;
    END IF;
    
    IF p_last_name_encrypted IS NULL THEN
        SET p_user_id = NULL;
        SET p_status_code = 'validation_error';
        SET p_message = 'Last name is required';
        ROLLBACK;
        LEAVE proc_label;
    END IF;
    
    IF p_email_encrypted IS NULL THEN
        SET p_user_id = NULL;
        SET p_status_code = 'validation_error';
        SET p_message = 'Email is required';
        ROLLBACK;
        LEAVE proc_label;
    END IF;
    
    IF p_password_hash IS NULL OR p_password_salt IS NULL THEN
        SET p_user_id = NULL;
        SET p_status_code = 'validation_error';
        SET p_message = 'Password hash and salt are required';
        ROLLBACK;
        LEAVE proc_label;
    END IF;
    
    -- Check if username already exists
    SELECT COUNT(*) INTO v_username_exists
    FROM users
    WHERE username = p_username AND deleted_at IS NULL;
    
    IF v_username_exists > 0 THEN
        SET p_user_id = NULL;
        SET p_status_code = 'duplicate_entry';
        SET p_message = 'Username already exists';
        ROLLBACK;
        LEAVE proc_label;
    END IF;
    
    -- Validate company if provided
    IF p_company_id IS NOT NULL THEN
        SELECT COUNT(*) INTO v_company_exists
        FROM companies
        WHERE company_id = p_company_id AND deleted_at IS NULL;
        
        IF v_company_exists = 0 THEN
            SET p_user_id = NULL;
            SET p_status_code = 'validation_error';
            SET p_message = 'Invalid company ID';
            ROLLBACK;
            LEAVE proc_label;
        END IF;
        
        -- Check if company is active
        SELECT COUNT(*) INTO v_company_active
        FROM companies c
        INNER JOIN status_lookup sl ON c.status_id = sl.status_id
        WHERE c.company_id = p_company_id 
        AND sl.status_code = 'active' 
        AND c.deleted_at IS NULL;
        
        IF v_company_active = 0 THEN
            SET p_user_id = NULL;
            SET p_status_code = 'validation_error';
            SET p_message = 'Company is not active';
            ROLLBACK;
            LEAVE proc_label;
        END IF;
    END IF;
    
    -- Validate branch if provided
    IF p_primary_branch_id IS NOT NULL THEN
        SELECT COUNT(*) INTO v_branch_exists
        FROM company_branches
        WHERE branch_id = p_primary_branch_id AND deleted_at IS NULL;
        
        IF v_branch_exists = 0 THEN
            SET p_user_id = NULL;
            SET p_status_code = 'validation_error';
            SET p_message = 'Invalid branch ID';
            ROLLBACK;
            LEAVE proc_label;
        END IF;
        
        -- Check if branch is active
        SELECT COUNT(*) INTO v_branch_active
        FROM company_branches cb
        INNER JOIN status_lookup sl ON cb.status_id = sl.status_id
        WHERE cb.branch_id = p_primary_branch_id 
        AND sl.status_code = 'active' 
        AND cb.deleted_at IS NULL;
        
        IF v_branch_active = 0 THEN
            SET p_user_id = NULL;
            SET p_status_code = 'validation_error';
            SET p_message = 'Branch is not active';
            ROLLBACK;
            LEAVE proc_label;
        END IF;
        
        -- Validate branch belongs to company
        IF p_company_id IS NOT NULL THEN
            SELECT COUNT(*) INTO v_branch_exists
            FROM company_branches
            WHERE branch_id = p_primary_branch_id 
            AND company_id = p_company_id
            AND deleted_at IS NULL;
            
            IF v_branch_exists = 0 THEN
                SET p_user_id = NULL;
                SET p_status_code = 'validation_error';
                SET p_message = 'Branch does not belong to specified company';
                ROLLBACK;
                LEAVE proc_label;
            END IF;
        END IF;
    END IF;
    
    -- Get active status ID for user
    SELECT status_id INTO v_status_id
    FROM status_lookup
    WHERE status_category = 'user' 
    AND status_code = 'active'
    LIMIT 1;
    
    IF v_status_id IS NULL THEN
        SET p_user_id = NULL;
        SET p_status_code = 'configuration_error';
        SET p_message = 'User status configuration not found';
        ROLLBACK;
        LEAVE proc_label;
    END IF;
    
    -- Insert new user
    INSERT INTO users (
        username,
        company_id,
        primary_branch_id,
        first_name_encrypted,
        last_name_encrypted,
        email_encrypted,
        phone_encrypted,
        date_of_birth_encrypted,
        ssn_encrypted,
        password_hash,
        password_salt,
        status_id,
        email_verified,
        phone_verified,
        created_at,
        updated_at
    ) VALUES (
        p_username,
        p_company_id,
        p_primary_branch_id,
        p_first_name_encrypted,
        p_last_name_encrypted,
        p_email_encrypted,
        p_phone_encrypted,
        p_date_of_birth_encrypted,
        p_ssn_encrypted,
        p_password_hash,
        p_password_salt,
        v_status_id,
        FALSE,
        FALSE,
        NOW(),
        NOW()
    );
    
    -- Get the newly created user ID
    SET p_user_id = LAST_INSERT_ID();
    
    -- Log audit entry
    INSERT INTO audit_logs (
        user_id,
        company_id,
        branch_id,
        action,
        resource_type,
        resource_id,
        details_encrypted,
        created_at
    ) VALUES (
        p_user_id,
        p_company_id,
        p_primary_branch_id,
        'user_registration',
        'user',
        p_user_id,
        NULL,
        NOW()
    );
    
    -- Commit transaction
    COMMIT;
    
    -- Set success response
    SET p_status_code = 'success';
    SET p_message = 'User registered successfully';
    
END
;;
delimiter ;

SET FOREIGN_KEY_CHECKS = 1;
