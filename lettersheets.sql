/*
 Navicat Premium Dump SQL

 Source Server         : Local
 Source Server Type    : MySQL
 Source Server Version : 90300 (9.3.0)
 Source Host           : localhost:3306
 Source Schema         : lettersheets

 Target Server Type    : MySQL
 Target Server Version : 90300 (9.3.0)
 File Encoding         : 65001

 Date: 22/02/2026 14:15:50
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for approval_requests
-- ----------------------------
DROP TABLE IF EXISTS `approval_requests`;
CREATE TABLE `approval_requests` (
  `id` varchar(36) NOT NULL,
  `company_id` varchar(36) NOT NULL,
  `workflow_id` varchar(36) NOT NULL,
  `current_node_id` varchar(36) DEFAULT NULL,
  `request_type` varchar(50) NOT NULL,
  `entity_id` varchar(36) NOT NULL,
  `requested_by` varchar(36) NOT NULL,
  `request_metadata` json DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'pending',
  `started_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` datetime DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  `cancelled_by` varchar(36) DEFAULT NULL,
  `cancel_reason` text,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_approval_requests_node` (`current_node_id`),
  KEY `fk_approval_requests_canceller` (`cancelled_by`),
  KEY `idx_approval_requests_company` (`company_id`,`status`),
  KEY `idx_approval_requests_requester` (`requested_by`,`status`),
  KEY `idx_approval_requests_entity` (`request_type`,`entity_id`),
  KEY `idx_approval_requests_workflow` (`workflow_id`),
  CONSTRAINT `fk_approval_requests_canceller` FOREIGN KEY (`cancelled_by`) REFERENCES `employees` (`id`),
  CONSTRAINT `fk_approval_requests_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_approval_requests_node` FOREIGN KEY (`current_node_id`) REFERENCES `approval_workflow_nodes` (`id`),
  CONSTRAINT `fk_approval_requests_requester` FOREIGN KEY (`requested_by`) REFERENCES `employees` (`id`),
  CONSTRAINT `fk_approval_requests_workflow` FOREIGN KEY (`workflow_id`) REFERENCES `approval_workflows` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for approval_tasks
-- ----------------------------
DROP TABLE IF EXISTS `approval_tasks`;
CREATE TABLE `approval_tasks` (
  `id` varchar(36) NOT NULL,
  `request_id` varchar(36) NOT NULL,
  `node_id` varchar(36) NOT NULL,
  `assigned_to` varchar(36) NOT NULL,
  `delegated_from` varchar(36) DEFAULT NULL,
  `delegated_at` datetime DEFAULT NULL,
  `decision` varchar(20) DEFAULT NULL,
  `remarks` text,
  `decided_at` datetime DEFAULT NULL,
  `is_escalated` tinyint(1) NOT NULL DEFAULT '0',
  `escalated_at` datetime DEFAULT NULL,
  `escalate_after` datetime DEFAULT NULL,
  `notified_at` datetime DEFAULT NULL,
  `reminded_at` datetime DEFAULT NULL,
  `reminder_count` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_approval_tasks_node` (`node_id`),
  KEY `fk_approval_tasks_delegator` (`delegated_from`),
  KEY `idx_approval_tasks_request` (`request_id`),
  KEY `idx_approval_tasks_assignee` (`assigned_to`,`decision`),
  CONSTRAINT `fk_approval_tasks_assignee` FOREIGN KEY (`assigned_to`) REFERENCES `employees` (`id`),
  CONSTRAINT `fk_approval_tasks_delegator` FOREIGN KEY (`delegated_from`) REFERENCES `employees` (`id`),
  CONSTRAINT `fk_approval_tasks_node` FOREIGN KEY (`node_id`) REFERENCES `approval_workflow_nodes` (`id`),
  CONSTRAINT `fk_approval_tasks_request` FOREIGN KEY (`request_id`) REFERENCES `approval_requests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for approval_workflow_nodes
-- ----------------------------
DROP TABLE IF EXISTS `approval_workflow_nodes`;
CREATE TABLE `approval_workflow_nodes` (
  `id` varchar(36) NOT NULL,
  `workflow_id` varchar(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `node_type` varchar(30) NOT NULL,
  `step_order` int NOT NULL,
  `approver_type` varchar(30) DEFAULT NULL,
  `approver_value` varchar(100) DEFAULT NULL,
  `min_level` int DEFAULT NULL,
  `parallel_mode` varchar(20) DEFAULT 'all',
  `required_count` int DEFAULT NULL,
  `allow_delegation` tinyint(1) NOT NULL DEFAULT '0',
  `escalation_hours` int DEFAULT NULL,
  `escalation_target` varchar(36) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_workflow_nodes_workflow` (`workflow_id`,`step_order`),
  CONSTRAINT `fk_workflow_nodes_workflow` FOREIGN KEY (`workflow_id`) REFERENCES `approval_workflows` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for approval_workflow_transitions
-- ----------------------------
DROP TABLE IF EXISTS `approval_workflow_transitions`;
CREATE TABLE `approval_workflow_transitions` (
  `id` varchar(36) NOT NULL,
  `workflow_id` varchar(36) NOT NULL,
  `from_node_id` varchar(36) NOT NULL,
  `to_node_id` varchar(36) NOT NULL,
  `condition_field` varchar(100) DEFAULT NULL,
  `condition_operator` varchar(20) DEFAULT NULL,
  `condition_value` varchar(255) DEFAULT NULL,
  `priority` int NOT NULL DEFAULT '0',
  `on_outcome` varchar(20) NOT NULL DEFAULT 'approved',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_transitions_to` (`to_node_id`),
  KEY `idx_workflow_transitions_from` (`from_node_id`),
  KEY `idx_workflow_transitions_workflow` (`workflow_id`),
  CONSTRAINT `fk_transitions_from` FOREIGN KEY (`from_node_id`) REFERENCES `approval_workflow_nodes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_transitions_to` FOREIGN KEY (`to_node_id`) REFERENCES `approval_workflow_nodes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_transitions_workflow` FOREIGN KEY (`workflow_id`) REFERENCES `approval_workflows` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for approval_workflows
-- ----------------------------
DROP TABLE IF EXISTS `approval_workflows`;
CREATE TABLE `approval_workflows` (
  `id` varchar(36) NOT NULL,
  `company_id` varchar(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `request_type` varchar(50) NOT NULL,
  `description` text,
  `department_id` varchar(36) DEFAULT NULL,
  `branch_id` varchar(36) DEFAULT NULL,
  `position_level_min` int DEFAULT NULL,
  `position_level_max` int DEFAULT NULL,
  `priority` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_workflows_department` (`department_id`),
  KEY `fk_workflows_branch` (`branch_id`),
  KEY `idx_workflows_company` (`company_id`),
  KEY `idx_workflows_type` (`company_id`,`request_type`),
  KEY `idx_workflows_scope` (`company_id`,`department_id`,`branch_id`),
  CONSTRAINT `fk_workflows_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`),
  CONSTRAINT `fk_workflows_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_workflows_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for branches
-- ----------------------------
DROP TABLE IF EXISTS `branches`;
CREATE TABLE `branches` (
  `id` varchar(36) NOT NULL,
  `company_id` varchar(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `code` varchar(50) DEFAULT NULL,
  `address` varchar(500) DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `state` varchar(100) DEFAULT NULL,
  `province` varchar(100) DEFAULT NULL,
  `zip_code` varchar(20) DEFAULT NULL,
  `contact_phone` varchar(50) DEFAULT NULL,
  `contact_email` varchar(255) DEFAULT NULL,
  `branch_head` varchar(36) DEFAULT NULL,
  `is_main` tinyint(1) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_branches_name` (`company_id`,`name`),
  UNIQUE KEY `uk_branches_code` (`company_id`,`code`),
  KEY `fk_branches_head` (`branch_head`),
  KEY `idx_branches_company` (`company_id`),
  CONSTRAINT `fk_branches_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_branches_head` FOREIGN KEY (`branch_head`) REFERENCES `employees` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for change_history
-- ----------------------------
DROP TABLE IF EXISTS `change_history`;
CREATE TABLE `change_history` (
  `id` varchar(36) NOT NULL,
  `company_id` varchar(36) NOT NULL,
  `changed_by` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `session_id` varchar(36) DEFAULT NULL,
  `table_name` varchar(100) NOT NULL,
  `record_id` varchar(36) NOT NULL,
  `change_type` varchar(10) NOT NULL,
  `field_name` varchar(100) NOT NULL,
  `old_value` longtext,
  `new_value` longtext,
  `is_encrypted` tinyint(1) NOT NULL DEFAULT '0',
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` varchar(500) DEFAULT NULL,
  `changed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_change_history_session` (`session_id`),
  KEY `idx_change_history_company` (`company_id`,`changed_at`),
  KEY `idx_change_history_user` (`changed_by`,`changed_at`),
  KEY `idx_change_history_record` (`table_name`,`record_id`,`changed_at`),
  KEY `idx_change_history_field` (`table_name`,`field_name`,`changed_at`),
  KEY `idx_change_history_type` (`change_type`,`changed_at`),
  CONSTRAINT `fk_change_history_session` FOREIGN KEY (`session_id`) REFERENCES `user_sessions` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for companies
-- ----------------------------
DROP TABLE IF EXISTS `companies`;
CREATE TABLE `companies` (
  `id` varchar(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `industry` varchar(100) DEFAULT NULL,
  `address` varchar(500) DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `state` varchar(100) DEFAULT NULL,
  `province` varchar(100) DEFAULT NULL,
  `key_algorithm` varchar(50) NOT NULL DEFAULT 'AES-256-GCM',
  `key_version` int NOT NULL DEFAULT '1',
  `max_employees` int DEFAULT '500',
  `plan` varchar(50) NOT NULL DEFAULT 'standard',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_companies_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for company_contacts
-- ----------------------------
DROP TABLE IF EXISTS `company_contacts`;
CREATE TABLE `company_contacts` (
  `id` varchar(36) NOT NULL,
  `company_id` varchar(36) NOT NULL,
  `employee_id` varchar(36) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `designation` varchar(100) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `contact_type` varchar(50) NOT NULL,
  `is_primary` tinyint(1) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_company_contacts_company` (`company_id`),
  KEY `idx_company_contacts_employee` (`employee_id`),
  CONSTRAINT `fk_company_contacts_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_company_contacts_employee` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for company_settings
-- ----------------------------
DROP TABLE IF EXISTS `company_settings`;
CREATE TABLE `company_settings` (
  `id` varchar(36) NOT NULL,
  `company_id` varchar(36) NOT NULL,
  `timezone` varchar(50) NOT NULL DEFAULT 'Asia/Manila',
  `date_format` varchar(20) NOT NULL DEFAULT 'YYYY-MM-DD',
  `currency` varchar(10) NOT NULL DEFAULT 'PHP',
  `fiscal_year_start` int NOT NULL DEFAULT '1',
  `pay_frequency` varchar(20) NOT NULL DEFAULT 'semi_monthly',
  `pay_day_1` int DEFAULT '15',
  `pay_day_2` int DEFAULT '30',
  `overtime_required_approval` tinyint(1) NOT NULL DEFAULT '1',
  `default_vacation_days` decimal(5,2) NOT NULL DEFAULT '5.00',
  `default_sick_days` decimal(5,2) NOT NULL DEFAULT '5.00',
  `leave_accrual_type` varchar(20) NOT NULL DEFAULT 'yearly',
  `employee_number_prefix` varchar(20) DEFAULT 'EMP',
  `employee_number_auto` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_company_settings_company` (`company_id`),
  KEY `idx_company_settings_company` (`company_id`),
  CONSTRAINT `fk_company_settings_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for departments
-- ----------------------------
DROP TABLE IF EXISTS `departments`;
CREATE TABLE `departments` (
  `id` varchar(36) NOT NULL,
  `company_id` varchar(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `code` varchar(50) DEFAULT NULL,
  `parent_id` varchar(36) DEFAULT NULL,
  `department_head` varchar(36) DEFAULT NULL,
  `description` text,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_departments_name` (`company_id`,`name`),
  UNIQUE KEY `uk_departments_code` (`company_id`,`code`),
  KEY `fk_departments_head` (`department_head`),
  KEY `idx_departments_company` (`company_id`),
  KEY `idx_departments_parent` (`parent_id`),
  CONSTRAINT `fk_departments_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_departments_head` FOREIGN KEY (`department_head`) REFERENCES `employees` (`id`),
  CONSTRAINT `fk_departments_parent` FOREIGN KEY (`parent_id`) REFERENCES `departments` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for employees
-- ----------------------------
DROP TABLE IF EXISTS `employees`;
CREATE TABLE `employees` (
  `id` varchar(36) NOT NULL,
  `company_id` varchar(36) NOT NULL,
  `user_id` varchar(36) DEFAULT NULL,
  `employee_number` varchar(50) NOT NULL,
  `first_name` varchar(100) NOT NULL,
  `last_name` varchar(100) NOT NULL,
  `middle_name` varchar(100) DEFAULT NULL,
  `suffix` varchar(20) DEFAULT NULL,
  `display_name` varchar(255) NOT NULL,
  `department_id` varchar(36) DEFAULT NULL,
  `position_id` varchar(36) DEFAULT NULL,
  `employment_type` varchar(30) NOT NULL,
  `employment_status` varchar(30) NOT NULL,
  `hire_date` date NOT NULL,
  `regularization_date` date DEFAULT NULL,
  `separation_date` date DEFAULT NULL,
  `separation_reason` varchar(255) DEFAULT NULL,
  `reports_to` varchar(36) DEFAULT NULL,
  `branch_id` varchar(36) DEFAULT NULL,
  `location` varchar(255) DEFAULT NULL,
  `work_schedule` varchar(100) DEFAULT NULL,
  `residential_city` varchar(100) DEFAULT NULL,
  `residential_province` varchar(100) DEFAULT NULL,
  `vacation_leave_balance` decimal(5,2) NOT NULL DEFAULT '0.00',
  `sick_leave_balance` decimal(5,2) NOT NULL DEFAULT '0.00',
  `salary_band` varchar(20) DEFAULT NULL,
  `has_bank_account` tinyint(1) DEFAULT '0',
  `has_sss` tinyint(1) DEFAULT '0',
  `has_tin` tinyint(1) DEFAULT '0',
  `has_philhealth` tinyint(1) DEFAULT '0',
  `has_pagibig` tinyint(1) DEFAULT '0',
  `benefits_enrolled` tinyint(1) DEFAULT '0',
  `birth_date_enc` blob,
  `gender_enc` blob,
  `civil_status_enc` blob,
  `nationality_enc` blob,
  `address_enc` blob,
  `personal_email_enc` blob,
  `personal_phone_enc` blob,
  `emergency_contact_enc` blob,
  `sss_number_enc` blob,
  `tin_enc` blob,
  `philhealth_number_enc` blob,
  `pagibig_number_enc` blob,
  `salary_enc` blob,
  `salary_type_enc` blob,
  `daily_rate_enc` blob,
  `hourly_rate_enc` blob,
  `allowances_enc` blob,
  `bank_name_enc` blob,
  `bank_account_number_enc` blob,
  `bank_account_name_enc` blob,
  `tax_status_enc` blob,
  `tax_exemptions_enc` blob,
  `medical_conditions_enc` blob,
  `blood_type_enc` blob,
  `enc_version` int NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_employees_number` (`company_id`,`employee_number`),
  KEY `fk_employees_department` (`department_id`),
  KEY `fk_employees_position` (`position_id`),
  KEY `fk_employees_branch` (`branch_id`),
  KEY `idx_employees_company` (`company_id`),
  KEY `idx_employees_user` (`user_id`),
  KEY `idx_employees_department` (`company_id`,`department_id`),
  KEY `idx_employees_position` (`company_id`,`position_id`),
  KEY `idx_employees_branch` (`company_id`,`branch_id`),
  KEY `idx_employees_status` (`company_id`,`employment_status`),
  KEY `idx_employees_manager` (`reports_to`),
  KEY `idx_employees_number` (`company_id`,`employee_number`),
  KEY `idx_employees_name` (`company_id`,`last_name`,`first_name`),
  KEY `idx_employees_salary_band` (`company_id`,`salary_band`),
  KEY `idx_employees_hire_date` (`company_id`,`hire_date`),
  KEY `idx_employees_location` (`company_id`,`residential_province`,`residential_city`),
  CONSTRAINT `fk_employees_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`),
  CONSTRAINT `fk_employees_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_employees_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`),
  CONSTRAINT `fk_employees_manager` FOREIGN KEY (`reports_to`) REFERENCES `employees` (`id`),
  CONSTRAINT `fk_employees_position` FOREIGN KEY (`position_id`) REFERENCES `positions` (`id`),
  CONSTRAINT `fk_employees_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for key_recovery
-- ----------------------------
DROP TABLE IF EXISTS `key_recovery`;
CREATE TABLE `key_recovery` (
  `id` varchar(36) NOT NULL,
  `company_id` varchar(36) NOT NULL,
  `wrapped_company_key` blob NOT NULL,
  `recovery_code_hash` varchar(255) NOT NULL,
  `label` varchar(100) DEFAULT NULL,
  `is_used` tinyint(1) NOT NULL DEFAULT '0',
  `used_at` datetime DEFAULT NULL,
  `used_by` varchar(36) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_key_recovery_user` (`used_by`),
  KEY `idx_key_recovery_company` (`company_id`),
  CONSTRAINT `fk_key_recovery_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_key_recovery_user` FOREIGN KEY (`used_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for key_recovery_groups
-- ----------------------------
DROP TABLE IF EXISTS `key_recovery_groups`;
CREATE TABLE `key_recovery_groups` (
  `id` varchar(36) NOT NULL,
  `company_id` varchar(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `total_shares` int NOT NULL,
  `threshold` int NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_recovery_groups_company` (`company_id`),
  CONSTRAINT `fk_recovery_groups_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for key_recovery_session_shares
-- ----------------------------
DROP TABLE IF EXISTS `key_recovery_session_shares`;
CREATE TABLE `key_recovery_session_shares` (
  `id` varchar(36) NOT NULL,
  `session_id` varchar(36) NOT NULL,
  `share_id` varchar(36) NOT NULL,
  `submitted_share` blob NOT NULL,
  `submitted_by` varchar(255) NOT NULL,
  `submitted_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_session_shares_share` (`share_id`),
  KEY `idx_recovery_session_shares_session` (`session_id`),
  CONSTRAINT `fk_session_shares_session` FOREIGN KEY (`session_id`) REFERENCES `key_recovery_sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_session_shares_share` FOREIGN KEY (`share_id`) REFERENCES `key_recovery_shares` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for key_recovery_sessions
-- ----------------------------
DROP TABLE IF EXISTS `key_recovery_sessions`;
CREATE TABLE `key_recovery_sessions` (
  `id` varchar(36) NOT NULL,
  `company_id` varchar(36) NOT NULL,
  `group_id` varchar(36) NOT NULL,
  `initiated_by` varchar(255) NOT NULL,
  `reason` text,
  `shares_submitted` int NOT NULL DEFAULT '0',
  `shares_required` int NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'pending',
  `expires_at` datetime NOT NULL,
  `completed_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_recovery_sessions_group` (`group_id`),
  KEY `idx_recovery_sessions_company` (`company_id`,`status`),
  CONSTRAINT `fk_recovery_sessions_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_recovery_sessions_group` FOREIGN KEY (`group_id`) REFERENCES `key_recovery_groups` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for key_recovery_shares
-- ----------------------------
DROP TABLE IF EXISTS `key_recovery_shares`;
CREATE TABLE `key_recovery_shares` (
  `id` varchar(36) NOT NULL,
  `group_id` varchar(36) NOT NULL,
  `company_id` varchar(36) NOT NULL,
  `share_index` int NOT NULL,
  `encrypted_share` blob NOT NULL,
  `holder_type` varchar(20) NOT NULL,
  `holder_user_id` varchar(36) DEFAULT NULL,
  `holder_name` varchar(255) NOT NULL,
  `holder_email` varchar(255) DEFAULT NULL,
  `is_distributed` tinyint(1) NOT NULL DEFAULT '0',
  `distributed_at` datetime DEFAULT NULL,
  `is_revoked` tinyint(1) NOT NULL DEFAULT '0',
  `revoked_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_recovery_shares_group` (`group_id`),
  KEY `idx_recovery_shares_company` (`company_id`),
  KEY `idx_recovery_shares_holder` (`holder_user_id`),
  CONSTRAINT `fk_recovery_shares_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_recovery_shares_group` FOREIGN KEY (`group_id`) REFERENCES `key_recovery_groups` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_recovery_shares_user` FOREIGN KEY (`holder_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for positions
-- ----------------------------
DROP TABLE IF EXISTS `positions`;
CREATE TABLE `positions` (
  `id` varchar(36) NOT NULL,
  `company_id` varchar(36) NOT NULL,
  `department_id` varchar(36) DEFAULT NULL,
  `title` varchar(255) NOT NULL,
  `code` varchar(50) DEFAULT NULL,
  `level` int NOT NULL DEFAULT '1',
  `salary_band` varchar(50) DEFAULT NULL,
  `description` text,
  `max_headcount` int DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_positions_code` (`company_id`,`code`),
  KEY `fk_positions_department` (`department_id`),
  KEY `idx_positions_company` (`company_id`),
  KEY `idx_positions_department` (`company_id`,`department_id`),
  KEY `idx_positions_level` (`company_id`,`level`),
  CONSTRAINT `fk_positions_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_positions_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for user_company_access
-- ----------------------------
DROP TABLE IF EXISTS `user_company_access`;
CREATE TABLE `user_company_access` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `company_id` varchar(36) NOT NULL,
  `wrapped_company_key` blob NOT NULL,
  `key_wrap_algorithm` varchar(50) NOT NULL DEFAULT 'AES-256-KW',
  `key_version` int NOT NULL DEFAULT '1',
  `public_key` blob NOT NULL,
  `role` varchar(50) NOT NULL DEFAULT 'employee',
  `permissions` json DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `joined_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_company` (`user_id`,`company_id`),
  KEY `idx_user_access_user` (`user_id`),
  KEY `idx_user_access_company` (`company_id`),
  KEY `idx_user_access_role` (`company_id`,`role`),
  CONSTRAINT `fk_user_access_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_user_access_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for user_invites
-- ----------------------------
DROP TABLE IF EXISTS `user_invites`;
CREATE TABLE `user_invites` (
  `id` varchar(36) NOT NULL,
  `company_id` varchar(36) NOT NULL,
  `email` varchar(255) NOT NULL,
  `role` varchar(50) NOT NULL DEFAULT 'employee',
  `invited_by` varchar(36) NOT NULL,
  `wrapped_company_key` blob NOT NULL,
  `invite_token_hash` varchar(255) NOT NULL,
  `is_accepted` tinyint(1) NOT NULL DEFAULT '0',
  `expires_at` datetime NOT NULL,
  `accepted_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_invites_user` (`invited_by`),
  KEY `idx_invites_company` (`company_id`),
  KEY `idx_invites_email` (`email`),
  CONSTRAINT `fk_invites_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_invites_user` FOREIGN KEY (`invited_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for user_sessions
-- ----------------------------
DROP TABLE IF EXISTS `user_sessions`;
CREATE TABLE `user_sessions` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `company_id` varchar(36) NOT NULL,
  `device_info` varchar(500) DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `expires_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_activity_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sessions_user` (`user_id`),
  KEY `idx_sessions_company` (`company_id`),
  KEY `idx_sessions_expires` (`expires_at`),
  CONSTRAINT `fk_sessions_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for users
-- ----------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` varchar(36) NOT NULL,
  `email` varchar(255) NOT NULL,
  `username` varchar(100) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `salt` varchar(255) NOT NULL,
  `totp_secret_enc` blob,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `last_login_at` datetime DEFAULT NULL,
  `failed_login_attempts` int NOT NULL DEFAULT '0',
  `locked_until` datetime DEFAULT NULL,
  `password_changed_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_users_email` (`email`),
  UNIQUE KEY `uk_users_username` (`username`),
  KEY `idx_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Procedure structure for sp_change_password
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_change_password`;
delimiter ;;
CREATE PROCEDURE `sp_change_password`(IN p_id VARCHAR(36),
    IN p_password_hash VARCHAR(255),
    IN p_salt VARCHAR(255),
    IN p_company_id VARCHAR(36),
    IN p_session_id VARCHAR(36),
    IN p_ip_address VARCHAR(45),
    IN p_user_agent VARCHAR(500))
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
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_clean_all_tables
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_clean_all_tables`;
delimiter ;;
CREATE PROCEDURE `sp_clean_all_tables`()
BEGIN
    SET FOREIGN_KEY_CHECKS = 0;

    TRUNCATE TABLE change_history;
    TRUNCATE TABLE user_sessions;
    TRUNCATE TABLE user_company_access;
    TRUNCATE TABLE employee_documents;
    TRUNCATE TABLE employee_bank_details;
    TRUNCATE TABLE employee_government_ids;
    TRUNCATE TABLE employee_emergency_contacts;
    TRUNCATE TABLE employees;
    TRUNCATE TABLE company_contacts;
    TRUNCATE TABLE branches;
    TRUNCATE TABLE departments;
    TRUNCATE TABLE company_settings;
    TRUNCATE TABLE users;
    TRUNCATE TABLE companies;

    SET FOREIGN_KEY_CHECKS = 1;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_create_company
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_create_company`;
delimiter ;;
CREATE PROCEDURE `sp_create_company`(IN p_id VARCHAR(36),
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
    IN p_user_agent VARCHAR(500))
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
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_create_session
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_create_session`;
delimiter ;;
CREATE PROCEDURE `sp_create_session`(IN p_id VARCHAR(36),
    IN p_user_id VARCHAR(36),
    IN p_company_id VARCHAR(36),
    IN p_device_info VARCHAR(500),
    IN p_ip_address VARCHAR(45),
    IN p_expires_at DATETIME)
BEGIN
    INSERT INTO user_sessions (
        id, user_id, company_id, device_info, ip_address,
        is_active, expires_at, created_at, last_activity_at
    ) VALUES (
        p_id, p_user_id, p_company_id, p_device_info, p_ip_address,
        1, p_expires_at, NOW(), NOW()
    );
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_create_user
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_create_user`;
delimiter ;;
CREATE PROCEDURE `sp_create_user`(IN p_id VARCHAR(36),
    IN p_email VARCHAR(255),
    IN p_username VARCHAR(100),
    IN p_password_hash VARCHAR(255),
    IN p_salt VARCHAR(255),
    IN p_company_id VARCHAR(36),
    IN p_session_id VARCHAR(36),
    IN p_ip_address VARCHAR(45),
    IN p_user_agent VARCHAR(500))
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
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_create_user_company_access
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_create_user_company_access`;
delimiter ;;
CREATE PROCEDURE `sp_create_user_company_access`(IN p_id VARCHAR(36),
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
    IN p_user_agent VARCHAR(500))
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
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_delete_company
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_company`;
delimiter ;;
CREATE PROCEDURE `sp_delete_company`(IN p_id VARCHAR(36),
    IN p_changed_by VARCHAR(36),
    IN p_session_id VARCHAR(36),
    IN p_ip_address VARCHAR(45),
    IN p_user_agent VARCHAR(500))
BEGIN
    UPDATE companies SET is_active = 0 WHERE id = p_id AND is_active = 1;

    CALL sp_log_change(p_id, p_changed_by, p_session_id, 'companies', p_id, 'delete', 'is_active', '1', '0', 0, p_ip_address, p_user_agent);

    -- Soft delete all user access for this company
    UPDATE user_company_access SET is_active = 0 WHERE company_id = p_id AND is_active = 1;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_delete_user
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_user`;
delimiter ;;
CREATE PROCEDURE `sp_delete_user`(IN p_id VARCHAR(36),
    IN p_company_id VARCHAR(36),
    IN p_changed_by VARCHAR(36),
    IN p_session_id VARCHAR(36),
    IN p_ip_address VARCHAR(45),
    IN p_user_agent VARCHAR(500))
BEGIN
    UPDATE users SET is_active = 0 WHERE id = p_id AND is_active = 1;

    CALL sp_log_change(p_company_id, p_changed_by, p_session_id, 'users', p_id, 'delete', 'is_active', '1', '0', 0, p_ip_address, p_user_agent);

    -- Soft delete all company access for this user
    UPDATE user_company_access SET is_active = 0 WHERE user_id = p_id AND is_active = 1;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_delete_user_company_access
-- ----------------------------
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
    FROM user_company_access WHERE id = p_id AND is_active = 1;

    UPDATE user_company_access SET is_active = 0 WHERE id = p_id AND is_active = 1;

    CALL sp_log_change(p_company_id, p_changed_by, p_session_id, 'user_company_access', p_id, 'delete', 'is_active', '1', '0', 0, p_ip_address, p_user_agent);
    CALL sp_log_change(p_company_id, p_changed_by, p_session_id, 'user_company_access', p_id, 'delete', 'user_id', v_user_id, NULL, 0, p_ip_address, p_user_agent);
    CALL sp_log_change(p_company_id, p_changed_by, p_session_id, 'user_company_access', p_id, 'delete', 'role', v_role, NULL, 0, p_ip_address, p_user_agent);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_change_history
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_change_history`;
delimiter ;;
CREATE PROCEDURE `sp_get_change_history`(IN p_company_id VARCHAR(36),
    IN p_table_name VARCHAR(100),
    IN p_record_id VARCHAR(36),
    IN p_limit INT,
    IN p_offset INT)
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
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_company
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_company`;
delimiter ;;
CREATE PROCEDURE `sp_get_company`(IN p_id VARCHAR(36))
BEGIN
    SELECT c.*, cs.timezone, cs.date_format, cs.currency, cs.fiscal_year_start,
           cs.pay_frequency, cs.pay_day_1, cs.pay_day_2, cs.overtime_required_approval,
           cs.default_vacation_days, cs.default_sick_days, cs.leave_accrual_type,
           cs.employee_number_prefix, cs.employee_number_auto
    FROM companies c
    LEFT JOIN company_settings cs ON cs.company_id = c.id
    WHERE c.id = p_id AND c.is_active = 1;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_company_users
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_company_users`;
delimiter ;;
CREATE PROCEDURE `sp_get_company_users`(IN p_company_id VARCHAR(36))
BEGIN
    SELECT uca.id, uca.user_id, uca.role, uca.permissions, uca.joined_at,
           u.email, u.username, u.last_login_at
    FROM user_company_access uca
    INNER JOIN users u ON u.id = uca.user_id AND u.is_active = 1
    WHERE uca.company_id = p_company_id AND uca.is_active = 1;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_user
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_user`;
delimiter ;;
CREATE PROCEDURE `sp_get_user`(IN p_id VARCHAR(36))
BEGIN
    SELECT id, email, username, is_active, last_login_at,
           password_changed_at, created_at, updated_at
    FROM users
    WHERE id = p_id AND is_active = 1;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_user_by_email
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_user_by_email`;
delimiter ;;
CREATE PROCEDURE `sp_get_user_by_email`(IN p_email VARCHAR(255))
BEGIN
    SELECT id, email, username, password_hash, salt, totp_secret_enc,
           is_active, failed_login_attempts, locked_until,
           last_login_at, created_at, updated_at
    FROM users
    WHERE email = p_email;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_user_companies
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_user_companies`;
delimiter ;;
CREATE PROCEDURE `sp_get_user_companies`(IN p_user_id VARCHAR(36))
BEGIN
    SELECT uca.id, uca.company_id, uca.wrapped_company_key, uca.key_wrap_algorithm,
           uca.key_version, uca.public_key, uca.role, uca.permissions, uca.joined_at,
           c.name AS company_name, c.plan AS company_plan
    FROM user_company_access uca
    INNER JOIN companies c ON c.id = uca.company_id AND c.is_active = 1
    WHERE uca.user_id = p_user_id AND uca.is_active = 1;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_invalidate_all_sessions
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_invalidate_all_sessions`;
delimiter ;;
CREATE PROCEDURE `sp_invalidate_all_sessions`(IN p_user_id VARCHAR(36))
BEGIN
    UPDATE user_sessions SET is_active = 0
    WHERE user_id = p_user_id AND is_active = 1;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_invalidate_session
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_invalidate_session`;
delimiter ;;
CREATE PROCEDURE `sp_invalidate_session`(IN p_id VARCHAR(36))
BEGIN
    UPDATE user_sessions SET is_active = 0 WHERE id = p_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_login_failure
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_login_failure`;
delimiter ;;
CREATE PROCEDURE `sp_login_failure`(IN p_user_id VARCHAR(36),
    IN p_max_attempts INT,
    IN p_lockout_minutes INT)
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
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_login_success
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_login_success`;
delimiter ;;
CREATE PROCEDURE `sp_login_success`(IN p_user_id VARCHAR(36))
BEGIN
    UPDATE users SET
        last_login_at = NOW(),
        failed_login_attempts = 0,
        locked_until = NULL
    WHERE id = p_user_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_log_change
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_log_change`;
delimiter ;;
CREATE PROCEDURE `sp_log_change`(IN p_company_id VARCHAR(36),
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
    IN p_user_agent VARCHAR(500))
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
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_register
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_register`;
delimiter ;;
CREATE PROCEDURE `sp_register`(IN p_company_id VARCHAR(36),
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
    IN p_user_agent VARCHAR(500))
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

		-- 1. Create user first
		CALL sp_create_user(
				p_user_id, p_email, p_username, p_password_hash, p_salt,
				p_company_id, NULL, p_ip_address, p_user_agent
		);

		-- 2. Create company
		CALL sp_create_company(
				p_company_id, p_company_name, p_company_industry,
				p_company_address, p_company_city, p_company_state, p_company_province,
				p_key_algorithm, 500, 'standard',
				p_user_id, NULL, p_ip_address, p_user_agent
		);

		-- 3. Link user to company as superadmin
		CALL sp_create_user_company_access(
				p_access_id, p_user_id, p_company_id,
				p_wrapped_company_key, p_key_wrap_algorithm, p_public_key,
				'superadmin', NULL,
				p_user_id, NULL, p_ip_address, p_user_agent
		);

    COMMIT;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_update_company
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_update_company`;
delimiter ;;
CREATE PROCEDURE `sp_update_company`(IN p_id VARCHAR(36),
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
    IN p_user_agent VARCHAR(500))
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
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_update_user
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_update_user`;
delimiter ;;
CREATE PROCEDURE `sp_update_user`(IN p_id VARCHAR(36),
    IN p_email VARCHAR(255),
    IN p_username VARCHAR(100),
    IN p_company_id VARCHAR(36),
    IN p_changed_by VARCHAR(36),
    IN p_session_id VARCHAR(36),
    IN p_ip_address VARCHAR(45),
    IN p_user_agent VARCHAR(500))
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
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_update_user_company_access
-- ----------------------------
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
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_validate_session
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_validate_session`;
delimiter ;;
CREATE PROCEDURE `sp_validate_session`(IN p_id VARCHAR(36))
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
END
;;
delimiter ;

SET FOREIGN_KEY_CHECKS = 1;
