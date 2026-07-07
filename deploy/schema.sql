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

 Date: 25/04/2026 17:00:35
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for acc_account_mappings
-- ----------------------------
DROP TABLE IF EXISTS `acc_account_mappings`;
CREATE TABLE `acc_account_mappings` (
  `id` char(36) NOT NULL DEFAULT (uuid()),
  `company_id` char(36) NOT NULL,
  `mapping_key` varchar(50) NOT NULL,
  `account_id` char(36) NOT NULL,
  `description` varchar(150) DEFAULT NULL,
  `is_deleted` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_mapping` (`company_id`,`mapping_key`,`is_deleted`),
  KEY `account_id` (`account_id`),
  KEY `idx_mapping_company` (`company_id`,`is_deleted`),
  CONSTRAINT `acc_account_mappings_ibfk_1` FOREIGN KEY (`account_id`) REFERENCES `acc_accounts` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for acc_accounts
-- ----------------------------
DROP TABLE IF EXISTS `acc_accounts`;
CREATE TABLE `acc_accounts` (
  `id` char(36) NOT NULL DEFAULT (uuid()),
  `company_id` char(36) NOT NULL,
  `code` varchar(20) NOT NULL,
  `name` varchar(150) NOT NULL,
  `account_type` enum('Asset','Liability','Equity','Revenue','Expense') NOT NULL,
  `account_subtype` varchar(50) DEFAULT NULL,
  `normal_balance` enum('Debit','Credit') NOT NULL,
  `parent_id` char(36) DEFAULT NULL,
  `description` text,
  `is_active` tinyint(1) DEFAULT '1',
  `is_system` tinyint(1) DEFAULT '0',
  `currency` varchar(3) DEFAULT 'PHP',
  `current_balance` decimal(15,2) DEFAULT '0.00',
  `is_deleted` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_acc_code` (`company_id`,`code`),
  KEY `idx_acc_company` (`company_id`),
  KEY `idx_acc_type` (`company_id`,`account_type`),
  KEY `idx_acc_parent` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for acc_coa_template_items
-- ----------------------------
DROP TABLE IF EXISTS `acc_coa_template_items`;
CREATE TABLE `acc_coa_template_items` (
  `id` char(36) NOT NULL DEFAULT (uuid()),
  `template_id` char(36) NOT NULL,
  `code` varchar(20) NOT NULL,
  `name` varchar(150) NOT NULL,
  `account_type` enum('Asset','Liability','Equity','Revenue','Expense') NOT NULL,
  `account_subtype` varchar(50) DEFAULT NULL,
  `normal_balance` enum('Debit','Credit') NOT NULL,
  `is_system` tinyint(1) DEFAULT '0',
  `sort_order` int DEFAULT '0',
  `is_deleted` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cti_template` (`template_id`),
  CONSTRAINT `acc_coa_template_items_ibfk_1` FOREIGN KEY (`template_id`) REFERENCES `acc_coa_templates` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for acc_coa_templates
-- ----------------------------
DROP TABLE IF EXISTS `acc_coa_templates`;
CREATE TABLE `acc_coa_templates` (
  `id` char(36) NOT NULL DEFAULT (uuid()),
  `company_id` char(36) DEFAULT NULL,
  `name` varchar(150) NOT NULL,
  `country` varchar(5) NOT NULL,
  `currency` varchar(3) DEFAULT 'USD',
  `flag` varchar(10) DEFAULT '',
  `description` text,
  `is_global` tinyint(1) DEFAULT '0',
  `is_deleted` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ct_company` (`company_id`),
  KEY `idx_ct_global` (`is_global`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for acc_journal_entries
-- ----------------------------
DROP TABLE IF EXISTS `acc_journal_entries`;
CREATE TABLE `acc_journal_entries` (
  `id` char(36) NOT NULL DEFAULT (uuid()),
  `company_id` char(36) NOT NULL,
  `entry_number` int NOT NULL,
  `entry_date` date NOT NULL,
  `memo` text,
  `source_type` varchar(30) DEFAULT 'manual',
  `source_id` char(36) DEFAULT NULL,
  `status` enum('Draft','Posted','Voided') DEFAULT 'Draft',
  `total_debit` decimal(15,2) DEFAULT '0.00',
  `total_credit` decimal(15,2) DEFAULT '0.00',
  `posted_at` datetime DEFAULT NULL,
  `posted_by` char(36) DEFAULT NULL,
  `voided_at` datetime DEFAULT NULL,
  `voided_by` char(36) DEFAULT NULL,
  `void_reason` text,
  `is_deleted` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_je_number` (`company_id`,`entry_number`),
  KEY `idx_je_company` (`company_id`,`is_deleted`),
  KEY `idx_je_date` (`company_id`,`entry_date`),
  KEY `idx_je_source` (`source_type`,`source_id`),
  KEY `idx_je_status` (`company_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for acc_journal_lines
-- ----------------------------
DROP TABLE IF EXISTS `acc_journal_lines`;
CREATE TABLE `acc_journal_lines` (
  `id` char(36) NOT NULL DEFAULT (uuid()),
  `entry_id` char(36) NOT NULL,
  `account_id` char(36) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `debit` decimal(15,2) DEFAULT '0.00',
  `credit` decimal(15,2) DEFAULT '0.00',
  `sort_order` int DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_jl_entry` (`entry_id`),
  KEY `idx_jl_account` (`account_id`),
  CONSTRAINT `acc_journal_lines_ibfk_1` FOREIGN KEY (`entry_id`) REFERENCES `acc_journal_entries` (`id`) ON DELETE CASCADE,
  CONSTRAINT `acc_journal_lines_ibfk_2` FOREIGN KEY (`account_id`) REFERENCES `acc_accounts` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for ap_bill_items
-- ----------------------------
DROP TABLE IF EXISTS `ap_bill_items`;
CREATE TABLE `ap_bill_items` (
  `id` char(36) NOT NULL DEFAULT (uuid()),
  `bill_id` char(36) NOT NULL,
  `account_id` char(36) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `quantity` decimal(10,2) DEFAULT '1.00',
  `unit_price` decimal(15,2) DEFAULT '0.00',
  `amount` decimal(15,2) DEFAULT '0.00',
  `tax_rate` decimal(5,2) DEFAULT '0.00',
  `tax_amount` decimal(15,2) DEFAULT '0.00',
  `sort_order` int DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `account_id` (`account_id`),
  KEY `idx_billitem_bill` (`bill_id`),
  CONSTRAINT `ap_bill_items_ibfk_1` FOREIGN KEY (`bill_id`) REFERENCES `ap_bills` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ap_bill_items_ibfk_2` FOREIGN KEY (`account_id`) REFERENCES `acc_accounts` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for ap_bill_payments
-- ----------------------------
DROP TABLE IF EXISTS `ap_bill_payments`;
CREATE TABLE `ap_bill_payments` (
  `id` char(36) NOT NULL DEFAULT (uuid()),
  `company_id` char(36) NOT NULL,
  `bill_id` char(36) NOT NULL,
  `payment_date` date NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `payment_method` varchar(50) DEFAULT 'Bank Transfer',
  `reference_no` varchar(100) DEFAULT NULL,
  `account_id` char(36) DEFAULT NULL,
  `journal_id` char(36) DEFAULT NULL,
  `memo` text,
  `is_deleted` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `account_id` (`account_id`),
  KEY `idx_payment_bill` (`bill_id`,`is_deleted`),
  KEY `idx_payment_company` (`company_id`,`is_deleted`),
  CONSTRAINT `ap_bill_payments_ibfk_1` FOREIGN KEY (`bill_id`) REFERENCES `ap_bills` (`id`),
  CONSTRAINT `ap_bill_payments_ibfk_2` FOREIGN KEY (`account_id`) REFERENCES `acc_accounts` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for ap_bills
-- ----------------------------
DROP TABLE IF EXISTS `ap_bills`;
CREATE TABLE `ap_bills` (
  `id` char(36) NOT NULL DEFAULT (uuid()),
  `company_id` char(36) NOT NULL,
  `vendor_id` char(36) NOT NULL,
  `bill_number` varchar(50) NOT NULL,
  `bill_date` date NOT NULL,
  `due_date` date NOT NULL,
  `status` enum('Draft','Open','Partial','Paid','Voided') DEFAULT 'Draft',
  `subtotal` decimal(15,2) DEFAULT '0.00',
  `tax_amount` decimal(15,2) DEFAULT '0.00',
  `total_amount` decimal(15,2) DEFAULT '0.00',
  `amount_paid` decimal(15,2) DEFAULT '0.00',
  `balance_due` decimal(15,2) DEFAULT '0.00',
  `memo` text,
  `reference` varchar(100) DEFAULT NULL,
  `journal_id` char(36) DEFAULT NULL,
  `is_deleted` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_bill_company` (`company_id`,`is_deleted`),
  KEY `idx_bill_vendor` (`vendor_id`,`is_deleted`),
  KEY `idx_bill_status` (`company_id`,`status`),
  KEY `idx_bill_due` (`company_id`,`due_date`),
  CONSTRAINT `ap_bills_ibfk_1` FOREIGN KEY (`vendor_id`) REFERENCES `ap_vendors` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for ap_vendors
-- ----------------------------
DROP TABLE IF EXISTS `ap_vendors`;
CREATE TABLE `ap_vendors` (
  `id` char(36) NOT NULL DEFAULT (uuid()),
  `company_id` char(36) NOT NULL,
  `name` varchar(200) NOT NULL,
  `contact_person` varchar(150) DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `address` text,
  `city` varchar(100) DEFAULT NULL,
  `province` varchar(100) DEFAULT NULL,
  `zip_code` varchar(20) DEFAULT NULL,
  `tin` varchar(30) DEFAULT NULL,
  `payment_terms` int DEFAULT '30',
  `notes` text,
  `is_active` tinyint(1) DEFAULT '1',
  `is_deleted` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_vendor_company` (`company_id`,`is_deleted`),
  KEY `idx_vendor_name` (`company_id`,`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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
-- Table structure for ar_customers
-- ----------------------------
DROP TABLE IF EXISTS `ar_customers`;
CREATE TABLE `ar_customers` (
  `id` char(36) NOT NULL DEFAULT (uuid()),
  `company_id` char(36) NOT NULL,
  `name` varchar(200) NOT NULL,
  `contact_person` varchar(150) DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `address` text,
  `city` varchar(100) DEFAULT NULL,
  `province` varchar(100) DEFAULT NULL,
  `zip_code` varchar(20) DEFAULT NULL,
  `tin` varchar(30) DEFAULT NULL,
  `payment_terms` int DEFAULT '30',
  `notes` text,
  `is_active` tinyint(1) DEFAULT '1',
  `is_deleted` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cust_company` (`company_id`,`is_deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for ar_invoice_items
-- ----------------------------
DROP TABLE IF EXISTS `ar_invoice_items`;
CREATE TABLE `ar_invoice_items` (
  `id` char(36) NOT NULL DEFAULT (uuid()),
  `invoice_id` char(36) NOT NULL,
  `account_id` char(36) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `quantity` decimal(10,2) DEFAULT '1.00',
  `unit_price` decimal(15,2) DEFAULT '0.00',
  `amount` decimal(15,2) DEFAULT '0.00',
  `tax_rate` decimal(5,2) DEFAULT '0.00',
  `tax_amount` decimal(15,2) DEFAULT '0.00',
  `sort_order` int DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `account_id` (`account_id`),
  KEY `idx_invitem` (`invoice_id`),
  CONSTRAINT `ar_invoice_items_ibfk_1` FOREIGN KEY (`invoice_id`) REFERENCES `ar_invoices` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ar_invoice_items_ibfk_2` FOREIGN KEY (`account_id`) REFERENCES `acc_accounts` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for ar_invoice_payments
-- ----------------------------
DROP TABLE IF EXISTS `ar_invoice_payments`;
CREATE TABLE `ar_invoice_payments` (
  `id` char(36) NOT NULL DEFAULT (uuid()),
  `company_id` char(36) NOT NULL,
  `invoice_id` char(36) NOT NULL,
  `payment_date` date NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `payment_method` varchar(50) DEFAULT 'Bank Transfer',
  `reference_no` varchar(100) DEFAULT NULL,
  `account_id` char(36) DEFAULT NULL,
  `memo` text,
  `is_deleted` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `account_id` (`account_id`),
  KEY `idx_invpay` (`invoice_id`,`is_deleted`),
  CONSTRAINT `ar_invoice_payments_ibfk_1` FOREIGN KEY (`invoice_id`) REFERENCES `ar_invoices` (`id`),
  CONSTRAINT `ar_invoice_payments_ibfk_2` FOREIGN KEY (`account_id`) REFERENCES `acc_accounts` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for ar_invoices
-- ----------------------------
DROP TABLE IF EXISTS `ar_invoices`;
CREATE TABLE `ar_invoices` (
  `id` char(36) NOT NULL DEFAULT (uuid()),
  `company_id` char(36) NOT NULL,
  `customer_id` char(36) NOT NULL,
  `invoice_number` varchar(50) NOT NULL,
  `invoice_date` date NOT NULL,
  `due_date` date NOT NULL,
  `status` enum('Draft','Sent','Partial','Paid','Voided') DEFAULT 'Draft',
  `subtotal` decimal(15,2) DEFAULT '0.00',
  `tax_amount` decimal(15,2) DEFAULT '0.00',
  `total_amount` decimal(15,2) DEFAULT '0.00',
  `amount_paid` decimal(15,2) DEFAULT '0.00',
  `balance_due` decimal(15,2) DEFAULT '0.00',
  `memo` text,
  `reference` varchar(100) DEFAULT NULL,
  `is_deleted` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `customer_id` (`customer_id`),
  KEY `idx_inv_company` (`company_id`,`is_deleted`),
  KEY `idx_inv_status` (`company_id`,`status`),
  KEY `idx_inv_due` (`company_id`,`due_date`),
  CONSTRAINT `ar_invoices_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `ar_customers` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for attendance
-- ----------------------------
DROP TABLE IF EXISTS `attendance`;
CREATE TABLE `attendance` (
  `id` varchar(36) NOT NULL,
  `company_id` varchar(36) NOT NULL,
  `employee_id` varchar(36) NOT NULL,
  `date` date NOT NULL,
  `clock_in` datetime DEFAULT NULL,
  `clock_out` datetime DEFAULT NULL,
  `hours_worked` decimal(5,2) DEFAULT NULL,
  `overtime_hours` decimal(5,2) NOT NULL DEFAULT '0.00',
  `status` varchar(20) NOT NULL DEFAULT 'Present',
  `remarks` text,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_attendance_emp_date` (`employee_id`,`date`),
  KEY `idx_attendance_company_date` (`company_id`,`date`,`is_deleted`),
  KEY `idx_attendance_employee` (`employee_id`,`date`,`is_deleted`),
  CONSTRAINT `attendance_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `attendance_ibfk_2` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for bank_transactions
-- ----------------------------
DROP TABLE IF EXISTS `bank_transactions`;
CREATE TABLE `bank_transactions` (
  `id` char(36) NOT NULL DEFAULT (uuid()),
  `company_id` char(36) NOT NULL,
  `account_id` char(36) NOT NULL,
  `txn_date` date NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `reference` varchar(100) DEFAULT NULL,
  `amount` decimal(15,2) NOT NULL,
  `is_reconciled` tinyint(1) DEFAULT '0',
  `matched_entry_id` char(36) DEFAULT NULL,
  `statement_date` date DEFAULT NULL,
  `is_deleted` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_banktxn` (`company_id`,`account_id`,`is_deleted`),
  KEY `idx_banktxn_date` (`account_id`,`txn_date`),
  CONSTRAINT `bank_transactions_ibfk_1` FOREIGN KEY (`account_id`) REFERENCES `acc_accounts` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for benefit_tiers
-- ----------------------------
DROP TABLE IF EXISTS `benefit_tiers`;
CREATE TABLE `benefit_tiers` (
  `id` varchar(36) NOT NULL,
  `benefit_id` varchar(36) NOT NULL,
  `name` varchar(100) NOT NULL,
  `employer_cost` decimal(12,2) NOT NULL DEFAULT '0.00',
  `employee_cost` decimal(12,2) NOT NULL DEFAULT '0.00',
  `sort_order` int NOT NULL DEFAULT '0',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tiers_benefit` (`benefit_id`,`is_deleted`),
  CONSTRAINT `benefit_tiers_ibfk_1` FOREIGN KEY (`benefit_id`) REFERENCES `benefits` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for benefits
-- ----------------------------
DROP TABLE IF EXISTS `benefits`;
CREATE TABLE `benefits` (
  `id` varchar(36) NOT NULL,
  `company_id` varchar(36) NOT NULL,
  `type` varchar(30) NOT NULL DEFAULT 'other',
  `name` varchar(200) NOT NULL,
  `provider` varchar(200) NOT NULL DEFAULT '',
  `status` varchar(20) NOT NULL DEFAULT 'Active',
  `coverage` varchar(500) NOT NULL DEFAULT '',
  `frequency` varchar(20) NOT NULL DEFAULT 'Monthly',
  `enrolled` int NOT NULL DEFAULT '0',
  `eligibility` text,
  `description` text,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_benefits_company` (`company_id`,`is_deleted`),
  CONSTRAINT `benefits_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
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
  `country` varchar(100) DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `state` varchar(100) DEFAULT NULL,
  `province` varchar(100) DEFAULT NULL,
  `zip` varchar(20) DEFAULT NULL,
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
-- Table structure for compliance_agencies
-- ----------------------------
DROP TABLE IF EXISTS `compliance_agencies`;
CREATE TABLE `compliance_agencies` (
  `id` varchar(36) NOT NULL,
  `company_id` varchar(36) NOT NULL,
  `name` varchar(100) NOT NULL,
  `full_name` varchar(255) DEFAULT NULL,
  `color` varchar(20) DEFAULT '#0ea5e9',
  `frequency` varchar(30) NOT NULL DEFAULT 'Monthly',
  `website` varchar(500) DEFAULT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'Not Filed',
  `due_date` date DEFAULT NULL,
  `last_filed` date DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_compliance_agencies_company` (`company_id`),
  CONSTRAINT `fk_compliance_agencies_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for compliance_fields
-- ----------------------------
DROP TABLE IF EXISTS `compliance_fields`;
CREATE TABLE `compliance_fields` (
  `id` varchar(36) NOT NULL,
  `agency_id` varchar(36) NOT NULL,
  `company_id` varchar(36) NOT NULL,
  `field_key` varchar(100) NOT NULL,
  `label` varchar(255) NOT NULL,
  `field_type` varchar(20) NOT NULL DEFAULT 'currency',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_compliance_fields_agency` (`agency_id`),
  KEY `idx_compliance_fields_company` (`company_id`),
  CONSTRAINT `fk_compliance_fields_agency` FOREIGN KEY (`agency_id`) REFERENCES `compliance_agencies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_compliance_fields_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for compliance_template_agencies
-- ----------------------------
DROP TABLE IF EXISTS `compliance_template_agencies`;
CREATE TABLE `compliance_template_agencies` (
  `id` varchar(36) NOT NULL,
  `template_id` varchar(36) NOT NULL,
  `name` varchar(100) NOT NULL,
  `full_name` varchar(255) DEFAULT NULL,
  `color` varchar(20) DEFAULT '#0ea5e9',
  `frequency` varchar(30) NOT NULL DEFAULT 'Monthly',
  `website` varchar(500) DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cta_template` (`template_id`),
  CONSTRAINT `fk_cta_template` FOREIGN KEY (`template_id`) REFERENCES `compliance_templates` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for compliance_template_fields
-- ----------------------------
DROP TABLE IF EXISTS `compliance_template_fields`;
CREATE TABLE `compliance_template_fields` (
  `id` varchar(36) NOT NULL,
  `agency_id` varchar(36) NOT NULL,
  `field_key` varchar(100) NOT NULL,
  `label` varchar(255) NOT NULL,
  `field_type` varchar(20) NOT NULL DEFAULT 'currency',
  `sort_order` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_ctf_agency` (`agency_id`),
  CONSTRAINT `fk_ctf_agency` FOREIGN KEY (`agency_id`) REFERENCES `compliance_template_agencies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for compliance_templates
-- ----------------------------
DROP TABLE IF EXISTS `compliance_templates`;
CREATE TABLE `compliance_templates` (
  `id` varchar(36) NOT NULL,
  `company_id` varchar(36) DEFAULT NULL,
  `code` varchar(20) NOT NULL,
  `name` varchar(100) NOT NULL,
  `currency_symbol` varchar(10) DEFAULT NULL,
  `is_global` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_compliance_templates_code` (`company_id`,`code`),
  KEY `idx_compliance_templates_company` (`company_id`),
  CONSTRAINT `fk_compliance_templates_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for compliance_values
-- ----------------------------
DROP TABLE IF EXISTS `compliance_values`;
CREATE TABLE `compliance_values` (
  `id` varchar(36) NOT NULL,
  `field_id` varchar(36) NOT NULL,
  `company_id` varchar(36) NOT NULL,
  `value_encrypted` text,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_compliance_values_field` (`field_id`),
  KEY `idx_compliance_values_company` (`company_id`),
  CONSTRAINT `fk_compliance_values_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_compliance_values_field` FOREIGN KEY (`field_id`) REFERENCES `compliance_fields` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for currencies
-- ----------------------------
DROP TABLE IF EXISTS `currencies`;
CREATE TABLE `currencies` (
  `code` varchar(3) NOT NULL,
  `name` varchar(100) NOT NULL,
  `symbol` varchar(10) NOT NULL,
  `decimal_places` tinyint NOT NULL DEFAULT '2',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for departments
-- ----------------------------
DROP TABLE IF EXISTS `departments`;
CREATE TABLE `departments` (
  `id` varchar(36) NOT NULL,
  `company_id` varchar(36) NOT NULL,
  `name` varchar(100) NOT NULL,
  `color` varchar(10) NOT NULL DEFAULT '#2d9e8b',
  `description` text,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_departments_company` (`company_id`,`is_deleted`),
  CONSTRAINT `departments_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for employees
-- ----------------------------
DROP TABLE IF EXISTS `employees`;
CREATE TABLE `employees` (
  `id` varchar(36) NOT NULL,
  `company_id` varchar(36) NOT NULL,
  `user_id` varchar(36) DEFAULT NULL,
  `first_name` varchar(100) NOT NULL,
  `last_name` varchar(100) NOT NULL,
  `middle_name` varchar(100) NOT NULL DEFAULT '',
  `department` varchar(100) NOT NULL DEFAULT '',
  `position` varchar(100) NOT NULL DEFAULT '',
  `joined_date` date DEFAULT NULL,
  `employment_type` varchar(30) NOT NULL DEFAULT 'Regular',
  `status` varchar(20) NOT NULL DEFAULT 'Active',
  `email_enc` text,
  `phone_enc` text,
  `birthday_enc` text,
  `address_enc` text,
  `basic_salary_enc` text,
  `sss_no_enc` text,
  `philhealth_no_enc` text,
  `pagibig_no_enc` text,
  `tin_enc` text,
  `bank_name_enc` text,
  `bank_account_enc` text,
  `enrolled_benefits` json DEFAULT NULL,
  `work_schedule_id` varchar(36) DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_employees_company` (`company_id`,`is_deleted`),
  KEY `idx_employees_dept` (`company_id`,`department`,`is_deleted`),
  KEY `idx_employees_status` (`company_id`,`status`,`is_deleted`),
  KEY `idx_employees_schedule` (`work_schedule_id`),
  KEY `idx_employees_user_id` (`user_id`),
  CONSTRAINT `employees_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `employees_ibfk_schedule` FOREIGN KEY (`work_schedule_id`) REFERENCES `work_schedules` (`id`) ON DELETE SET NULL
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
-- Table structure for leaves
-- ----------------------------
DROP TABLE IF EXISTS `leaves`;
CREATE TABLE `leaves` (
  `id` varchar(36) NOT NULL,
  `company_id` varchar(36) NOT NULL,
  `employee_id` varchar(36) NOT NULL,
  `leave_type` varchar(30) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `days` decimal(4,1) NOT NULL DEFAULT '1.0',
  `reason` text,
  `status` varchar(20) NOT NULL DEFAULT 'Pending',
  `approved_by` varchar(36) DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `rejection_note` text,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_leaves_company` (`company_id`,`is_deleted`),
  KEY `idx_leaves_employee` (`employee_id`,`is_deleted`),
  KEY `idx_leaves_status` (`company_id`,`status`,`is_deleted`),
  KEY `idx_leaves_dates` (`company_id`,`start_date`,`end_date`,`is_deleted`),
  CONSTRAINT `leaves_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `leaves_ibfk_2` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for loan_payments
-- ----------------------------
DROP TABLE IF EXISTS `loan_payments`;
CREATE TABLE `loan_payments` (
  `id` char(36) NOT NULL DEFAULT (uuid()),
  `company_id` char(36) NOT NULL,
  `loan_id` char(36) NOT NULL,
  `payment_date` date NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `principal` decimal(12,2) DEFAULT '0.00',
  `interest` decimal(12,2) DEFAULT '0.00',
  `balance_after` decimal(12,2) DEFAULT '0.00',
  `payment_type` enum('Payroll Deduction','Manual Payment','Lump Sum') DEFAULT 'Manual Payment',
  `notes` text,
  `is_deleted` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for loan_types
-- ----------------------------
DROP TABLE IF EXISTS `loan_types`;
CREATE TABLE `loan_types` (
  `id` char(36) NOT NULL DEFAULT (uuid()),
  `company_id` char(36) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` text,
  `max_amount` decimal(12,2) DEFAULT '0.00',
  `interest_rate` decimal(5,2) DEFAULT '0.00',
  `max_term_months` int DEFAULT '12',
  `requires_approval` tinyint(1) DEFAULT '1',
  `is_deleted` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for loans
-- ----------------------------
DROP TABLE IF EXISTS `loans`;
CREATE TABLE `loans` (
  `id` char(36) NOT NULL DEFAULT (uuid()),
  `company_id` char(36) NOT NULL,
  `employee_id` char(36) NOT NULL,
  `loan_type_id` char(36) DEFAULT NULL,
  `loan_type_name` varchar(100) DEFAULT NULL,
  `amount` decimal(12,2) NOT NULL,
  `interest_rate` decimal(5,2) DEFAULT '0.00',
  `term_months` int DEFAULT '1',
  `monthly_payment` decimal(12,2) DEFAULT '0.00',
  `total_payable` decimal(12,2) DEFAULT '0.00',
  `total_paid` decimal(12,2) DEFAULT '0.00',
  `balance` decimal(12,2) DEFAULT '0.00',
  `status` enum('Pending','Approved','Active','Paid','Rejected','Cancelled') DEFAULT 'Pending',
  `applied_date` date DEFAULT NULL,
  `approved_date` date DEFAULT NULL,
  `approved_by` char(36) DEFAULT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `rejection_note` text,
  `notes` text,
  `is_deleted` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for onboarding_checklists
-- ----------------------------
DROP TABLE IF EXISTS `onboarding_checklists`;
CREATE TABLE `onboarding_checklists` (
  `id` varchar(36) NOT NULL,
  `company_id` varchar(36) NOT NULL,
  `employee_id` varchar(36) NOT NULL,
  `template_id` varchar(36) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'In Progress',
  `start_date` date NOT NULL,
  `target_date` date DEFAULT NULL,
  `completed_date` date DEFAULT NULL,
  `progress` int NOT NULL DEFAULT '0',
  `notes` text,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_onb_cl_company` (`company_id`,`is_deleted`),
  KEY `idx_onb_employee` (`employee_id`),
  KEY `idx_onb_cl_employee` (`employee_id`),
  CONSTRAINT `onboarding_checklists_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `onboarding_checklists_ibfk_2` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for onboarding_items
-- ----------------------------
DROP TABLE IF EXISTS `onboarding_items`;
CREATE TABLE `onboarding_items` (
  `id` varchar(36) NOT NULL,
  `checklist_id` varchar(36) NOT NULL,
  `company_id` varchar(36) NOT NULL,
  `title` varchar(200) NOT NULL,
  `category` varchar(50) NOT NULL DEFAULT 'General',
  `required` tinyint(1) NOT NULL DEFAULT '1',
  `completed` tinyint(1) NOT NULL DEFAULT '0',
  `completed_at` datetime DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `notes` varchar(500) DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_onb_items_cl` (`checklist_id`,`is_deleted`),
  CONSTRAINT `onboarding_items_ibfk_1` FOREIGN KEY (`checklist_id`) REFERENCES `onboarding_checklists` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for onboarding_template_items
-- ----------------------------
DROP TABLE IF EXISTS `onboarding_template_items`;
CREATE TABLE `onboarding_template_items` (
  `id` varchar(36) NOT NULL,
  `template_id` varchar(36) NOT NULL,
  `company_id` varchar(36) NOT NULL,
  `title` varchar(200) NOT NULL,
  `category` varchar(50) NOT NULL DEFAULT 'General',
  `required` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_onb_tpl_items` (`template_id`,`is_deleted`),
  CONSTRAINT `onboarding_template_items_ibfk_1` FOREIGN KEY (`template_id`) REFERENCES `onboarding_templates` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for onboarding_templates
-- ----------------------------
DROP TABLE IF EXISTS `onboarding_templates`;
CREATE TABLE `onboarding_templates` (
  `id` varchar(36) NOT NULL,
  `company_id` varchar(36) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` text,
  `category` varchar(50) NOT NULL DEFAULT 'General',
  `is_default` tinyint(1) NOT NULL DEFAULT '0',
  `sort_order` int NOT NULL DEFAULT '0',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_onb_tpl_company` (`company_id`,`is_deleted`),
  CONSTRAINT `onboarding_templates_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for payroll_items
-- ----------------------------
DROP TABLE IF EXISTS `payroll_items`;
CREATE TABLE `payroll_items` (
  `id` varchar(36) NOT NULL,
  `run_id` varchar(36) NOT NULL,
  `company_id` varchar(36) NOT NULL,
  `employee_id` varchar(36) NOT NULL,
  `basic_pay` decimal(12,2) NOT NULL DEFAULT '0.00',
  `days_worked` decimal(5,2) NOT NULL DEFAULT '0.00',
  `hours_worked` decimal(6,2) NOT NULL DEFAULT '0.00',
  `ot_hours` decimal(6,2) NOT NULL DEFAULT '0.00',
  `ot_pay` decimal(12,2) NOT NULL DEFAULT '0.00',
  `holiday_pay` decimal(12,2) NOT NULL DEFAULT '0.00',
  `night_diff` decimal(12,2) NOT NULL DEFAULT '0.00',
  `allowances` decimal(12,2) NOT NULL DEFAULT '0.00',
  `other_earnings` decimal(12,2) NOT NULL DEFAULT '0.00',
  `gross_pay` decimal(12,2) NOT NULL DEFAULT '0.00',
  `sss_ee` decimal(10,2) NOT NULL DEFAULT '0.00',
  `sss_er` decimal(10,2) NOT NULL DEFAULT '0.00',
  `philhealth_ee` decimal(10,2) NOT NULL DEFAULT '0.00',
  `philhealth_er` decimal(10,2) NOT NULL DEFAULT '0.00',
  `pagibig_ee` decimal(10,2) NOT NULL DEFAULT '0.00',
  `pagibig_er` decimal(10,2) NOT NULL DEFAULT '0.00',
  `withholding_tax` decimal(10,2) NOT NULL DEFAULT '0.00',
  `benefit_deductions` decimal(10,2) NOT NULL DEFAULT '0.00',
  `loan_deductions` decimal(10,2) NOT NULL DEFAULT '0.00',
  `other_deductions` decimal(10,2) NOT NULL DEFAULT '0.00',
  `total_deductions` decimal(12,2) NOT NULL DEFAULT '0.00',
  `net_pay` decimal(12,2) NOT NULL DEFAULT '0.00',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `ot_multiplier_used` decimal(4,2) DEFAULT NULL,
  `work_schedule_name` varchar(100) DEFAULT NULL,
  `hours_per_day` decimal(4,2) DEFAULT NULL,
  `working_days_per_month` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_payroll_item` (`run_id`,`employee_id`,`is_deleted`),
  KEY `company_id` (`company_id`),
  KEY `idx_payroll_items_run` (`run_id`,`is_deleted`),
  KEY `idx_payroll_items_emp` (`employee_id`,`is_deleted`),
  CONSTRAINT `payroll_items_ibfk_1` FOREIGN KEY (`run_id`) REFERENCES `payroll_runs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `payroll_items_ibfk_2` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `payroll_items_ibfk_3` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for payroll_runs
-- ----------------------------
DROP TABLE IF EXISTS `payroll_runs`;
CREATE TABLE `payroll_runs` (
  `id` varchar(36) NOT NULL,
  `company_id` varchar(36) NOT NULL,
  `period_start` date NOT NULL,
  `period_end` date NOT NULL,
  `pay_date` date DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'Draft',
  `total_gross` decimal(14,2) NOT NULL DEFAULT '0.00',
  `total_deductions` decimal(14,2) NOT NULL DEFAULT '0.00',
  `total_net` decimal(14,2) NOT NULL DEFAULT '0.00',
  `employee_count` int NOT NULL DEFAULT '0',
  `notes` text,
  `approved_by` varchar(36) DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_payroll_runs_company` (`company_id`,`is_deleted`),
  KEY `idx_payroll_runs_period` (`company_id`,`period_start`,`period_end`),
  CONSTRAINT `payroll_runs_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for payroll_settings
-- ----------------------------
DROP TABLE IF EXISTS `payroll_settings`;
CREATE TABLE `payroll_settings` (
  `id` varchar(36) NOT NULL,
  `company_id` varchar(36) NOT NULL,
  `pay_schedule` varchar(20) NOT NULL DEFAULT 'semi_monthly',
  `working_days` int NOT NULL DEFAULT '22',
  `hours_per_day` decimal(4,2) NOT NULL DEFAULT '8.00',
  `ot_multiplier` decimal(4,2) NOT NULL DEFAULT '1.25',
  `enable_sss` tinyint(1) NOT NULL DEFAULT '1',
  `enable_philhealth` tinyint(1) NOT NULL DEFAULT '1',
  `enable_pagibig` tinyint(1) NOT NULL DEFAULT '1',
  `enable_tax` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `company_id` (`company_id`),
  CONSTRAINT `payroll_settings_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for positions
-- ----------------------------
DROP TABLE IF EXISTS `positions`;
CREATE TABLE `positions` (
  `id` varchar(36) NOT NULL,
  `company_id` varchar(36) NOT NULL,
  `name` varchar(100) NOT NULL,
  `department` varchar(100) NOT NULL DEFAULT '',
  `level` varchar(50) NOT NULL DEFAULT '',
  `description` text,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `ot_multiplier` decimal(4,2) NOT NULL DEFAULT '0.00',
  PRIMARY KEY (`id`),
  KEY `idx_positions_company` (`company_id`,`is_deleted`),
  CONSTRAINT `positions_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for tk_categories
-- ----------------------------
DROP TABLE IF EXISTS `tk_categories`;
CREATE TABLE `tk_categories` (
  `id` char(36) NOT NULL DEFAULT (uuid()),
  `company_id` char(36) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `color` varchar(7) DEFAULT '#6366f1',
  `icon` varchar(30) DEFAULT 'tag',
  `sla_hours` int DEFAULT '48',
  `is_active` tinyint(1) DEFAULT '1',
  `is_deleted` tinyint(1) DEFAULT '0',
  `sort_order` int DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tkcat` (`company_id`,`is_deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for tk_comments
-- ----------------------------
DROP TABLE IF EXISTS `tk_comments`;
CREATE TABLE `tk_comments` (
  `id` char(36) NOT NULL DEFAULT (uuid()),
  `ticket_id` char(36) NOT NULL,
  `author_id` char(36) NOT NULL,
  `content` text NOT NULL,
  `is_internal` tinyint(1) DEFAULT '0',
  `is_deleted` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tkcom` (`ticket_id`,`is_deleted`),
  CONSTRAINT `tk_comments_ibfk_1` FOREIGN KEY (`ticket_id`) REFERENCES `tk_tickets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for tk_sequences
-- ----------------------------
DROP TABLE IF EXISTS `tk_sequences`;
CREATE TABLE `tk_sequences` (
  `company_id` char(36) NOT NULL,
  `next_number` int DEFAULT '1',
  PRIMARY KEY (`company_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for tk_tickets
-- ----------------------------
DROP TABLE IF EXISTS `tk_tickets`;
CREATE TABLE `tk_tickets` (
  `id` char(36) NOT NULL DEFAULT (uuid()),
  `company_id` char(36) NOT NULL,
  `ticket_number` int NOT NULL,
  `subject` varchar(255) NOT NULL,
  `description` text,
  `category_id` char(36) DEFAULT NULL,
  `priority` enum('Low','Medium','High','Urgent') DEFAULT 'Medium',
  `status` enum('Open','In Progress','On Hold','Resolved','Closed') DEFAULT 'Open',
  `created_by` char(36) NOT NULL,
  `assigned_to` char(36) DEFAULT NULL,
  `due_date` datetime DEFAULT NULL,
  `resolved_at` datetime DEFAULT NULL,
  `closed_at` datetime DEFAULT NULL,
  `is_deleted` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `category_id` (`category_id`),
  KEY `idx_tk_company` (`company_id`,`is_deleted`),
  KEY `idx_tk_status` (`company_id`,`status`),
  KEY `idx_tk_assigned` (`assigned_to`,`status`),
  KEY `idx_tk_created` (`created_by`),
  CONSTRAINT `tk_tickets_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `tk_categories` (`id`)
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
  `key_exchange_algorithm` varchar(50) NOT NULL DEFAULT 'RSA-OAEP-2048',
  `key_version` int NOT NULL DEFAULT '1',
  `public_key` blob NOT NULL,
  `signing_public_key` blob,
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
-- Table structure for work_schedule_days
-- ----------------------------
DROP TABLE IF EXISTS `work_schedule_days`;
CREATE TABLE `work_schedule_days` (
  `id` varchar(36) NOT NULL,
  `schedule_id` varchar(36) NOT NULL,
  `day_of_week` tinyint NOT NULL COMMENT '0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat',
  `start_time` time DEFAULT NULL,
  `end_time` time DEFAULT NULL,
  `break_minutes` int NOT NULL DEFAULT '60',
  `is_rest_day` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_schedule_day` (`schedule_id`,`day_of_week`),
  CONSTRAINT `work_schedule_days_ibfk_1` FOREIGN KEY (`schedule_id`) REFERENCES `work_schedules` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for work_schedule_defaults
-- ----------------------------
DROP TABLE IF EXISTS `work_schedule_defaults`;
CREATE TABLE `work_schedule_defaults` (
  `id` varchar(36) NOT NULL,
  `company_id` varchar(36) NOT NULL,
  `schedule_id` varchar(36) NOT NULL,
  `scope` enum('department','position') NOT NULL,
  `scope_value` varchar(100) NOT NULL COMMENT 'matches employees.department or employees.position',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_wsd_scope` (`company_id`,`scope`,`scope_value`,`is_deleted`),
  KEY `idx_wsd_schedule` (`schedule_id`,`is_deleted`),
  KEY `idx_wsd_scope_lookup` (`company_id`,`scope`,`scope_value`,`is_deleted`),
  CONSTRAINT `work_schedule_defaults_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `work_schedule_defaults_ibfk_2` FOREIGN KEY (`schedule_id`) REFERENCES `work_schedules` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Table structure for work_schedules
-- ----------------------------
DROP TABLE IF EXISTS `work_schedules`;
CREATE TABLE `work_schedules` (
  `id` varchar(36) NOT NULL,
  `company_id` varchar(36) NOT NULL,
  `name` varchar(150) NOT NULL,
  `type` enum('Fixed','Flexible','Rotating') NOT NULL DEFAULT 'Fixed',
  `description` text,
  `color` varchar(10) NOT NULL DEFAULT '#2d9e8b',
  `is_default` tinyint(1) NOT NULL DEFAULT '0',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `night_diff_pct` decimal(4,3) NOT NULL DEFAULT '0.100',
  PRIMARY KEY (`id`),
  KEY `idx_ws_company` (`company_id`,`is_deleted`),
  KEY `idx_ws_default` (`company_id`,`is_default`,`is_deleted`),
  CONSTRAINT `work_schedules_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------
-- Procedure structure for sp_account_ledger
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_account_ledger`;
delimiter ;;
CREATE PROCEDURE `sp_account_ledger`(IN p_company_id CHAR(36),
    IN p_account_id CHAR(36),
    IN p_date_from DATE,
    IN p_date_to DATE)
BEGIN
    SELECT
        je.id AS entry_id,
        je.entry_number,
        je.entry_date,
        je.memo,
        je.source_type,
        je.source_id,
        jl.id AS line_id,
        jl.description AS line_description,
        jl.debit,
        jl.credit
    FROM acc_journal_lines jl
    INNER JOIN acc_journal_entries je ON je.id = jl.entry_id
    WHERE jl.account_id = p_account_id
      AND je.company_id = p_company_id
      AND je.status = 'Posted'
      AND je.is_deleted = 0
      AND (p_date_from IS NULL OR je.entry_date >= p_date_from)
      AND (p_date_to IS NULL OR je.entry_date <= p_date_to)
    ORDER BY je.entry_date ASC, je.entry_number ASC;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_account_opening_balance
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_account_opening_balance`;
delimiter ;;
CREATE PROCEDURE `sp_account_opening_balance`(IN p_company_id CHAR(36),
    IN p_account_id CHAR(36),
    IN p_date_from DATE)
BEGIN
    DECLARE v_normal VARCHAR(10);
    SELECT normal_balance INTO v_normal FROM acc_accounts WHERE id = p_account_id;

    SELECT
        CASE WHEN v_normal = 'Debit'
            THEN COALESCE(SUM(jl.debit - jl.credit), 0)
            ELSE COALESCE(SUM(jl.credit - jl.debit), 0)
        END AS opening_balance
    FROM acc_journal_lines jl
    INNER JOIN acc_journal_entries je ON je.id = jl.entry_id
    WHERE jl.account_id = p_account_id
      AND je.company_id = p_company_id
      AND je.status = 'Posted'
      AND je.is_deleted = 0
      AND (p_date_from IS NOT NULL AND je.entry_date < p_date_from);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_add_bill_item
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_add_bill_item`;
delimiter ;;
CREATE PROCEDURE `sp_add_bill_item`(IN p_bill_id CHAR(36),
    IN p_company_id CHAR(36),
    IN p_account_id CHAR(36),
    IN p_description VARCHAR(255),
    IN p_quantity DECIMAL(10,2),
    IN p_unit_price DECIMAL(15,2),
    IN p_amount DECIMAL(15,2),
    IN p_tax_rate DECIMAL(5,2),
    IN p_tax_amount DECIMAL(15,2),
    IN p_sort_order INT)
BEGIN
    IF NOT EXISTS (SELECT 1 FROM ap_bills WHERE id = p_bill_id AND company_id = p_company_id AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'bill not found';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM acc_accounts WHERE id = p_account_id AND company_id = p_company_id AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'account does not belong to company';
    END IF;
    INSERT INTO ap_bill_items (id, bill_id, account_id, description, quantity, unit_price, amount, tax_rate, tax_amount, sort_order)
    VALUES (UUID(), p_bill_id, p_account_id, p_description, p_quantity, p_unit_price, p_amount, p_tax_rate, p_tax_amount, p_sort_order);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_add_invoice_item
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_add_invoice_item`;
delimiter ;;
CREATE PROCEDURE `sp_add_invoice_item`(IN p_iid CHAR(36), IN p_cid CHAR(36), IN p_aid CHAR(36), IN p_desc VARCHAR(255), IN p_qty DECIMAL(10,2), IN p_up DECIMAL(15,2), IN p_amt DECIMAL(15,2), IN p_tr DECIMAL(5,2), IN p_ta DECIMAL(15,2), IN p_so INT)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ar_invoices WHERE id=p_iid AND company_id=p_cid AND is_deleted=0) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='invoice not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM acc_accounts WHERE id=p_aid AND company_id=p_cid AND is_deleted=0) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='account does not belong to company';
  END IF;
  INSERT INTO ar_invoice_items (id,invoice_id,account_id,description,quantity,unit_price,amount,tax_rate,tax_amount,sort_order) VALUES (UUID(),p_iid,p_aid,p_desc,p_qty,p_up,p_amt,p_tr,p_ta,p_so);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_add_journal_line
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_add_journal_line`;
delimiter ;;
CREATE PROCEDURE `sp_add_journal_line`(IN p_entry_id CHAR(36),
    IN p_company_id CHAR(36),
    IN p_account_id CHAR(36),
    IN p_description VARCHAR(255),
    IN p_debit DECIMAL(15,2),
    IN p_credit DECIMAL(15,2),
    IN p_sort_order INT)
BEGIN
    -- Only add the line if the parent entry AND the referenced account both
    -- belong to the caller's company (prevents cross-tenant line injection).
    IF NOT EXISTS (SELECT 1 FROM acc_journal_entries WHERE id = p_entry_id AND company_id = p_company_id AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'journal entry not found';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM acc_accounts WHERE id = p_account_id AND company_id = p_company_id AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'account does not belong to company';
    END IF;
    INSERT INTO acc_journal_lines (id, entry_id, account_id, description, debit, credit, sort_order)
    VALUES (UUID(), p_entry_id, p_account_id, p_description, p_debit, p_credit, p_sort_order);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_add_onboarding_item
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_add_onboarding_item`;
delimiter ;;
CREATE PROCEDURE `sp_add_onboarding_item`(IN p_id           VARCHAR(36),
    IN p_checklist_id  VARCHAR(36),
    IN p_company_id    VARCHAR(36),
    IN p_title         VARCHAR(200),
    IN p_category      VARCHAR(50),
    IN p_required      TINYINT,
    IN p_sort_order    INT)
BEGIN
    INSERT INTO onboarding_items (id, checklist_id, company_id, title, category, required, sort_order)
    VALUES (p_id, p_checklist_id, p_company_id, p_title, p_category, p_required, p_sort_order);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_add_ticket_comment
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_add_ticket_comment`;
delimiter ;;
CREATE PROCEDURE `sp_add_ticket_comment`(IN p_id CHAR(36), IN p_ticket_id CHAR(36), IN p_author_id CHAR(36), IN p_content TEXT, IN p_is_internal TINYINT, IN p_cid CHAR(36))
BEGIN
    IF NOT EXISTS (SELECT 1 FROM tk_tickets WHERE id = p_ticket_id AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ticket not found';
    END IF;
    INSERT INTO tk_comments (id, ticket_id, author_id, content, is_internal)
    VALUES (p_id, p_ticket_id, p_author_id, p_content, IFNULL(p_is_internal, 0));
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_apply_compliance_template
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_apply_compliance_template`;
delimiter ;;
CREATE PROCEDURE `sp_apply_compliance_template`(IN p_company_id VARCHAR(36),
    IN p_template_code VARCHAR(10))
BEGIN
    DECLARE v_template_id INT;
    DECLARE v_agency_id INT;
    DECLARE v_new_agency_id INT;
    DECLARE v_done INT DEFAULT 0;

    DECLARE cur_agencies CURSOR FOR
        SELECT id FROM compliance_template_agencies
        WHERE template_id = v_template_id
        ORDER BY sort_order;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;

    -- Get template
    SELECT id INTO v_template_id FROM compliance_templates WHERE code = p_template_code AND is_active = 1;

    IF v_template_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Template not found';
    END IF;

    -- Delete existing company agencies (soft delete)
    UPDATE compliance_agencies SET is_deleted = 1 WHERE company_id = p_company_id;

    -- Copy agencies
    OPEN cur_agencies;
    agency_loop: LOOP
        FETCH cur_agencies INTO v_agency_id;
        IF v_done THEN LEAVE agency_loop; END IF;

        INSERT INTO compliance_agencies (company_id, name, full_name, color, frequency, website, sort_order)
        SELECT p_company_id, name, full_name, color, frequency, website, sort_order
        FROM compliance_template_agencies WHERE id = v_agency_id;

        SET v_new_agency_id = LAST_INSERT_ID();

        -- Copy fields
        INSERT INTO compliance_fields (agency_id, field_key, label, field_type, sort_order)
        SELECT v_new_agency_id, field_key, label, field_type, sort_order
        FROM compliance_template_fields WHERE agency_id = v_agency_id
        ORDER BY sort_order;
    END LOOP;
    CLOSE cur_agencies;

    -- Return the new agencies
    CALL sp_get_compliance_agencies(p_company_id);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_approve_bill
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_approve_bill`;
delimiter ;;
CREATE PROCEDURE `sp_approve_bill`(IN p_bill_id CHAR(36),
    IN p_company_id CHAR(36))
BEGIN
    DECLARE v_status VARCHAR(10);
    DECLARE v_total DECIMAL(15,2);
    SELECT status, total_amount INTO v_status, v_total FROM ap_bills WHERE id = p_bill_id AND company_id = p_company_id AND is_deleted = 0;

    IF v_status != 'Draft' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only draft bills can be approved';
    END IF;
    IF v_total <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Bill must have line items';
    END IF;

    UPDATE ap_bills SET status = 'Open', balance_due = total_amount - amount_paid
    WHERE id = p_bill_id AND company_id = p_company_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_approve_leave
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_approve_leave`;
delimiter ;;
CREATE PROCEDURE `sp_approve_leave`(IN p_id             VARCHAR(36),
    IN p_company_id     VARCHAR(36),
    IN p_status         VARCHAR(20),
    IN p_rejection_note TEXT,
    IN p_session_id     VARCHAR(36),
    IN p_changed_by     VARCHAR(36),
    IN p_ip_address     VARCHAR(45),
    IN p_user_agent     VARCHAR(500))
BEGIN
    UPDATE leaves SET
        status = p_status,
        approved_by = p_changed_by,
        approved_at = NOW(),
        rejection_note = IF(p_rejection_note = '', NULL, p_rejection_note)
    WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;

    INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, old_value, new_value, ip_address, user_agent)
    VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'leaves', p_id, 'UPDATE', 'status', 'Pending', p_status, p_ip_address, p_user_agent);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_approve_loan
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_approve_loan`;
delimiter ;;
CREATE PROCEDURE `sp_approve_loan`(IN p_company_id CHAR(36), IN p_id CHAR(36), IN p_approved_by CHAR(36),
    IN p_start_date DATE, IN p_end_date DATE)
BEGIN
    UPDATE loans SET status = 'Active', approved_date = CURDATE(), approved_by = p_approved_by,
        start_date = p_start_date, end_date = p_end_date
    WHERE id = p_id AND company_id = p_company_id AND status = 'Pending';
    SELECT * FROM loans WHERE id = p_id AND company_id = p_company_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_ap_aging
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_ap_aging`;
delimiter ;;
CREATE PROCEDURE `sp_ap_aging`(IN p_company_id CHAR(36))
BEGIN
    SELECT
        v.id AS vendor_id,
        v.name AS vendor_name,
        COUNT(b.id) AS bill_count,
        SUM(b.balance_due) AS total_due,
        SUM(CASE WHEN DATEDIFF(CURDATE(), b.due_date) <= 0 THEN b.balance_due ELSE 0 END) AS current_due,
        SUM(CASE WHEN DATEDIFF(CURDATE(), b.due_date) BETWEEN 1 AND 30 THEN b.balance_due ELSE 0 END) AS days_1_30,
        SUM(CASE WHEN DATEDIFF(CURDATE(), b.due_date) BETWEEN 31 AND 60 THEN b.balance_due ELSE 0 END) AS days_31_60,
        SUM(CASE WHEN DATEDIFF(CURDATE(), b.due_date) BETWEEN 61 AND 90 THEN b.balance_due ELSE 0 END) AS days_61_90,
        SUM(CASE WHEN DATEDIFF(CURDATE(), b.due_date) > 90 THEN b.balance_due ELSE 0 END) AS days_over_90
    FROM ap_bills b
    INNER JOIN ap_vendors v ON v.id = b.vendor_id
    WHERE b.company_id = p_company_id
      AND b.is_deleted = 0
      AND b.status IN ('Open','Partial')
    GROUP BY v.id, v.name
    ORDER BY total_due DESC;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_ap_summary
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_ap_summary`;
delimiter ;;
CREATE PROCEDURE `sp_ap_summary`(IN p_company_id CHAR(36))
BEGIN
    SELECT
        (SELECT COUNT(*) FROM ap_vendors WHERE company_id = p_company_id AND is_deleted = 0 AND is_active = 1) AS active_vendors,
        (SELECT COUNT(*) FROM ap_bills WHERE company_id = p_company_id AND is_deleted = 0 AND status IN ('Open','Partial')) AS open_bills,
        (SELECT COALESCE(SUM(balance_due), 0) FROM ap_bills WHERE company_id = p_company_id AND is_deleted = 0 AND status IN ('Open','Partial')) AS total_outstanding,
        (SELECT COALESCE(SUM(balance_due), 0) FROM ap_bills WHERE company_id = p_company_id AND is_deleted = 0 AND status IN ('Open','Partial') AND due_date < CURDATE()) AS total_overdue,
        (SELECT COUNT(*) FROM ap_bills WHERE company_id = p_company_id AND is_deleted = 0 AND status IN ('Open','Partial') AND due_date < CURDATE()) AS overdue_count,
        (SELECT COALESCE(SUM(amount), 0) FROM ap_bill_payments WHERE company_id = p_company_id AND is_deleted = 0 AND payment_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')) AS paid_this_month;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_ar_aging
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_ar_aging`;
delimiter ;;
CREATE PROCEDURE `sp_ar_aging`(IN p_cid CHAR(36))
BEGIN
  SELECT c.id AS customer_id, c.name AS customer_name, COUNT(i.id) AS invoice_count, SUM(i.balance_due) AS total_due,
    SUM(CASE WHEN DATEDIFF(CURDATE(),i.due_date)<=0 THEN i.balance_due ELSE 0 END) AS current_due,
    SUM(CASE WHEN DATEDIFF(CURDATE(),i.due_date) BETWEEN 1 AND 30 THEN i.balance_due ELSE 0 END) AS days_1_30,
    SUM(CASE WHEN DATEDIFF(CURDATE(),i.due_date) BETWEEN 31 AND 60 THEN i.balance_due ELSE 0 END) AS days_31_60,
    SUM(CASE WHEN DATEDIFF(CURDATE(),i.due_date) BETWEEN 61 AND 90 THEN i.balance_due ELSE 0 END) AS days_61_90,
    SUM(CASE WHEN DATEDIFF(CURDATE(),i.due_date) > 90 THEN i.balance_due ELSE 0 END) AS days_over_90
  FROM ar_invoices i INNER JOIN ar_customers c ON c.id=i.customer_id
  WHERE i.company_id=p_cid AND i.is_deleted=0 AND i.status IN ('Sent','Partial')
  GROUP BY c.id, c.name ORDER BY total_due DESC;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_ar_summary
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_ar_summary`;
delimiter ;;
CREATE PROCEDURE `sp_ar_summary`(IN p_cid CHAR(36))
BEGIN
  SELECT
    (SELECT COUNT(*) FROM ar_customers WHERE company_id=p_cid AND is_deleted=0 AND is_active=1) AS active_customers,
    (SELECT COUNT(*) FROM ar_invoices WHERE company_id=p_cid AND is_deleted=0 AND status IN ('Sent','Partial')) AS open_invoices,
    (SELECT COALESCE(SUM(balance_due),0) FROM ar_invoices WHERE company_id=p_cid AND is_deleted=0 AND status IN ('Sent','Partial')) AS total_receivable,
    (SELECT COALESCE(SUM(balance_due),0) FROM ar_invoices WHERE company_id=p_cid AND is_deleted=0 AND status IN ('Sent','Partial') AND due_date<CURDATE()) AS total_overdue,
    (SELECT COUNT(*) FROM ar_invoices WHERE company_id=p_cid AND is_deleted=0 AND status IN ('Sent','Partial') AND due_date<CURDATE()) AS overdue_count,
    (SELECT COALESCE(SUM(amount),0) FROM ar_invoice_payments WHERE company_id=p_cid AND is_deleted=0 AND payment_date>=DATE_FORMAT(CURDATE(),'%Y-%m-01')) AS collected_this_month;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_assign_ticket
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_assign_ticket`;
delimiter ;;
CREATE PROCEDURE `sp_assign_ticket`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_assigned CHAR(36))
BEGIN
    UPDATE tk_tickets SET
        assigned_to = NULLIF(p_assigned, ''),
        status = CASE WHEN status = 'Open' AND NULLIF(p_assigned, '') IS NOT NULL THEN 'In Progress' ELSE status END
    WHERE id = p_id AND company_id = p_cid AND is_deleted = 0;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_auto_map_payroll_accounts
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_auto_map_payroll_accounts`;
delimiter ;;
CREATE PROCEDURE `sp_auto_map_payroll_accounts`(IN p_company_id CHAR(36))
BEGIN
    DECLARE done INT DEFAULT 0;
    DECLARE v_key VARCHAR(50);
    DECLARE v_code VARCHAR(20);
    DECLARE v_desc VARCHAR(150);
    DECLARE v_acct_id CHAR(36);

    -- Mapping key -> account code pairs (BIR template codes)
    DECLARE cur CURSOR FOR
        SELECT k, c, d FROM (
            SELECT 'PAYROLL_SALARIES_DR' AS k, '5010' AS c, 'Salaries and Wages' AS d UNION ALL
            SELECT 'PAYROLL_SSS_EXPENSE_DR', '5030', 'SSS Expense (Employer)' UNION ALL
            SELECT 'PAYROLL_SSSEC_EXPENSE_DR', '5035', 'SSS EC Expense' UNION ALL
            SELECT 'PAYROLL_PHILHEALTH_EXPENSE_DR', '5040', 'PhilHealth Expense (Employer)' UNION ALL
            SELECT 'PAYROLL_PAGIBIG_EXPENSE_DR', '5050', 'Pag-IBIG Expense (Employer)' UNION ALL
            SELECT 'PAYROLL_BENEFITS_EXPENSE_DR', '5020', 'Employee Benefits' UNION ALL
            SELECT 'PAYROLL_SSS_PAYABLE_CR', '2120', 'SSS Payable (EE + ER)' UNION ALL
            SELECT 'PAYROLL_SSSEC_PAYABLE_CR', '2125', 'SSS EC Payable' UNION ALL
            SELECT 'PAYROLL_PHILHEALTH_PAYABLE_CR', '2130', 'PhilHealth Payable (EE + ER)' UNION ALL
            SELECT 'PAYROLL_PAGIBIG_PAYABLE_CR', '2140', 'Pag-IBIG Payable (EE + ER)' UNION ALL
            SELECT 'PAYROLL_TAX_PAYABLE_CR', '2115', 'Withholding Tax Payable - Compensation' UNION ALL
            SELECT 'PAYROLL_CASH_CR', '1020', 'Cash in Bank (Net Pay)' UNION ALL
            SELECT 'PAYROLL_LOANS_PAYABLE_CR', '2200', 'Loans Payable (deductions)' UNION ALL
            SELECT 'PAYROLL_OTHER_DEDUCTIONS_CR', '2020', 'Accrued Expenses (other deductions)' UNION ALL
            SELECT 'LOAN_DISBURSEMENT_DR', '1330', 'Advances to Employees' UNION ALL
            SELECT 'LOAN_DISBURSEMENT_CR', '1020', 'Cash in Bank (loan disbursement)'
        ) AS mappings;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

    OPEN cur;
    read_loop: LOOP
        FETCH cur INTO v_key, v_code, v_desc;
        IF done THEN LEAVE read_loop; END IF;

        -- Find matching account by code for this company
        SELECT id INTO v_acct_id FROM acc_accounts
        WHERE company_id = p_company_id AND code = v_code AND is_active = 1
        LIMIT 1;

        IF v_acct_id IS NOT NULL THEN
            -- Only insert if mapping doesn't exist yet
            IF NOT EXISTS (SELECT 1 FROM acc_account_mappings WHERE company_id = p_company_id AND mapping_key = v_key AND is_deleted = 0) THEN
                INSERT INTO acc_account_mappings (id, company_id, mapping_key, account_id, description)
                VALUES (UUID(), p_company_id, v_key, v_acct_id, v_desc);
            END IF;
        END IF;

        SET v_acct_id = NULL;
    END LOOP;
    CLOSE cur;

    -- Return all mappings
    SELECT m.*, a.code AS account_code, a.name AS account_name, a.account_type
    FROM acc_account_mappings m
    INNER JOIN acc_accounts a ON m.account_id = a.id
    WHERE m.company_id = p_company_id AND m.is_deleted = 0
    ORDER BY m.mapping_key;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_balance_sheet
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_balance_sheet`;
delimiter ;;
CREATE PROCEDURE `sp_balance_sheet`(IN p_cid CHAR(36), IN p_as_of DATE)
BEGIN
    SELECT t.id, t.code, t.name, t.account_type, t.account_subtype, t.normal_balance,
        t.total_debit, t.total_credit, t.net_balance
    FROM (
        SELECT a.id, a.code, a.name, a.account_type, a.account_subtype, a.normal_balance,
            COALESCE(SUM(jl.debit), 0) AS total_debit,
            COALESCE(SUM(jl.credit), 0) AS total_credit,
            CASE WHEN a.normal_balance='Debit' THEN COALESCE(SUM(jl.debit - jl.credit), 0) ELSE COALESCE(SUM(jl.credit - jl.debit), 0) END AS net_balance,
            FIELD(a.account_type,'Asset','Liability','Equity') AS sort_type, a.code AS sort_code
        FROM acc_accounts a
        LEFT JOIN acc_journal_lines jl ON jl.account_id = a.id
            AND jl.entry_id IN (SELECT id FROM acc_journal_entries WHERE company_id=p_cid AND status='Posted' AND is_deleted=0
                AND (p_as_of IS NULL OR entry_date<=p_as_of))
        WHERE a.company_id = p_cid AND a.is_active = 1 AND a.account_type IN ('Asset','Liability','Equity') AND COALESCE(a.account_subtype,'') != 'Header'
        GROUP BY a.id, a.code, a.name, a.account_type, a.account_subtype, a.normal_balance
        HAVING net_balance != 0

        UNION ALL

        -- Current-year earnings: net income (Revenue - Expense) rolled into equity
        -- so the statement balances (Assets = Liabilities + Equity + Earnings).
        SELECT NULL AS id, '39999' AS code, 'Current Year Earnings' AS name, 'Equity' AS account_type,
            NULL AS account_subtype, 'Credit' AS normal_balance,
            0 AS total_debit, 0 AS total_credit,
            COALESCE(SUM(jl.credit - jl.debit), 0) AS net_balance,
            3 AS sort_type, 'zzzzz' AS sort_code
        FROM acc_accounts a
        INNER JOIN acc_journal_lines jl ON jl.account_id = a.id
            AND jl.entry_id IN (SELECT id FROM acc_journal_entries WHERE company_id=p_cid AND status='Posted' AND is_deleted=0
                AND (p_as_of IS NULL OR entry_date<=p_as_of))
        WHERE a.company_id = p_cid AND a.account_type IN ('Revenue','Expense')
        HAVING net_balance != 0
    ) t
    ORDER BY t.sort_type, t.sort_code;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_bank_recon_summary
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_bank_recon_summary`;
delimiter ;;
CREATE PROCEDURE `sp_bank_recon_summary`(IN p_cid CHAR(36), IN p_aid CHAR(36))
BEGIN
    SELECT
        (SELECT current_balance FROM acc_accounts WHERE id = p_aid) AS book_balance,
        COALESCE(SUM(CASE WHEN is_reconciled = 1 THEN amount ELSE 0 END), 0) AS reconciled_total,
        COALESCE(SUM(CASE WHEN is_reconciled = 0 THEN amount ELSE 0 END), 0) AS unreconciled_total,
        COUNT(CASE WHEN is_reconciled = 0 THEN 1 END) AS unreconciled_count,
        COUNT(*) AS total_count
    FROM bank_transactions
    WHERE company_id = p_cid AND account_id = p_aid AND is_deleted = 0;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_bulk_assign_employee_schedule
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_bulk_assign_employee_schedule`;
delimiter ;;
CREATE PROCEDURE `sp_bulk_assign_employee_schedule`(IN p_company_id     VARCHAR(36),
    IN p_employee_ids   JSON,
    IN p_schedule_id    VARCHAR(36),
    IN p_session_id     VARCHAR(36),
    IN p_changed_by     VARCHAR(36),
    IN p_ip_address     VARCHAR(45),
    IN p_user_agent     VARCHAR(500))
BEGIN
    DECLARE i INT DEFAULT 0;
    DECLARE n INT;
    DECLARE v_emp_id VARCHAR(36);

    SET n = JSON_LENGTH(p_employee_ids);

    WHILE i < n DO
        SET v_emp_id = JSON_UNQUOTE(JSON_EXTRACT(p_employee_ids, CONCAT('$[', i, ']')));

        UPDATE employees
        SET work_schedule_id = IF(p_schedule_id = '', NULL, p_schedule_id)
        WHERE id = v_emp_id AND company_id = p_company_id AND is_deleted = 0;

        SET i = i + 1;
    END WHILE;

    INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, new_value, ip_address, user_agent)
    VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'employees', 'bulk', 'BULK_UPDATE', 'work_schedule_id',
            CONCAT(p_schedule_id, ' (', n, ' employees)'), p_ip_address, p_user_agent);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_bulk_create_account
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_bulk_create_account`;
delimiter ;;
CREATE PROCEDURE `sp_bulk_create_account`(IN p_company_id CHAR(36),
    IN p_code VARCHAR(20),
    IN p_name VARCHAR(150),
    IN p_account_type VARCHAR(20),
    IN p_account_subtype VARCHAR(50),
    IN p_normal_balance VARCHAR(10),
    IN p_is_system TINYINT(1),
    IN p_currency VARCHAR(3))
BEGIN
    INSERT INTO acc_accounts (
        id, company_id, code, name,
        account_type, account_subtype, normal_balance,
        is_system, currency
    ) VALUES (
        UUID(), p_company_id, p_code, p_name,
        p_account_type, p_account_subtype, p_normal_balance,
        p_is_system, IFNULL(NULLIF(p_currency, ''), 'PHP')
    );
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_cancel_loan
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_cancel_loan`;
delimiter ;;
CREATE PROCEDURE `sp_cancel_loan`(IN p_company_id CHAR(36), IN p_id CHAR(36))
BEGIN
    UPDATE loans SET status = 'Cancelled' WHERE id = p_id AND company_id = p_company_id AND status IN ('Pending','Approved');
    SELECT * FROM loans WHERE id = p_id AND company_id = p_company_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_cash_flow_summary
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_cash_flow_summary`;
delimiter ;;
CREATE PROCEDURE `sp_cash_flow_summary`(IN p_cid CHAR(36), IN p_from DATE, IN p_to DATE)
BEGIN
    -- Simplified: show cash account movements grouped by source_type
    SELECT je.source_type,
        COALESCE(SUM(jl.debit), 0) AS cash_in,
        COALESCE(SUM(jl.credit), 0) AS cash_out,
        COALESCE(SUM(jl.debit - jl.credit), 0) AS net_cash
    FROM acc_journal_lines jl
    INNER JOIN acc_journal_entries je ON je.id = jl.entry_id
    INNER JOIN acc_accounts a ON a.id = jl.account_id
    WHERE je.company_id = p_cid AND je.status = 'Posted' AND je.is_deleted = 0
      AND a.account_type = 'Asset' AND (a.name LIKE '%Cash%' OR a.name LIKE '%Bank%' OR a.code IN ('1010','1020','1030'))
      AND (p_from IS NULL OR je.entry_date >= p_from) AND (p_to IS NULL OR je.entry_date <= p_to)
    GROUP BY je.source_type
    ORDER BY net_cash DESC;
END
;;
delimiter ;

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
-- Procedure structure for sp_check_account_code
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_check_account_code`;
delimiter ;;
CREATE PROCEDURE `sp_check_account_code`(IN p_company_id CHAR(36),
    IN p_code VARCHAR(20),
    IN p_exclude_id CHAR(36))
BEGIN
    SELECT COUNT(*) AS code_exists
    FROM acc_accounts
    WHERE company_id = p_company_id
      AND code = p_code
      AND is_deleted = 0
      AND (p_exclude_id = '' OR id != p_exclude_id);
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

TRUNCATE TABLE tk_comments;
TRUNCATE TABLE tk_tickets;
TRUNCATE TABLE tk_sequences;
TRUNCATE TABLE tk_categories;

TRUNCATE TABLE acc_journal_lines;
TRUNCATE TABLE acc_journal_entries;
TRUNCATE TABLE acc_account_mappings;
TRUNCATE TABLE acc_accounts;

TRUNCATE TABLE ap_bill_items;
TRUNCATE TABLE ap_bill_payments;
TRUNCATE TABLE ap_bills;
TRUNCATE TABLE ap_vendors;

TRUNCATE TABLE ar_invoice_items;
TRUNCATE TABLE ar_invoice_payments;
TRUNCATE TABLE ar_invoices;
TRUNCATE TABLE ar_customers;

TRUNCATE TABLE bank_transactions;

TRUNCATE TABLE payroll_items;
TRUNCATE TABLE payroll_runs;
TRUNCATE TABLE payroll_settings;

TRUNCATE TABLE loan_payments;
TRUNCATE TABLE loans;
TRUNCATE TABLE loan_types;

TRUNCATE TABLE leaves;

TRUNCATE TABLE attendance;

TRUNCATE TABLE onboarding_items;
TRUNCATE TABLE onboarding_checklists;

TRUNCATE TABLE benefit_tiers;
TRUNCATE TABLE benefits;

TRUNCATE TABLE compliance_values;
TRUNCATE TABLE compliance_fields;
TRUNCATE TABLE compliance_agencies;

TRUNCATE TABLE currencies;

TRUNCATE TABLE approval_tasks;
TRUNCATE TABLE approval_requests;
TRUNCATE TABLE approval_workflow_transitions;
TRUNCATE TABLE approval_workflow_nodes;
TRUNCATE TABLE approval_workflows;

TRUNCATE TABLE key_recovery_session_shares;
TRUNCATE TABLE key_recovery_sessions;
TRUNCATE TABLE key_recovery_shares;
TRUNCATE TABLE key_recovery_groups;
TRUNCATE TABLE key_recovery;

TRUNCATE TABLE change_history;

TRUNCATE TABLE employees;
TRUNCATE TABLE positions;
TRUNCATE TABLE departments;

TRUNCATE TABLE company_contacts;
TRUNCATE TABLE branches;
TRUNCATE TABLE company_settings;

TRUNCATE TABLE user_sessions;
TRUNCATE TABLE user_invites;
TRUNCATE TABLE user_company_access;
TRUNCATE TABLE users;
TRUNCATE TABLE companies;

SET FOREIGN_KEY_CHECKS = 1;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_clear_accounts
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_clear_accounts`;
delimiter ;;
CREATE PROCEDURE `sp_clear_accounts`(IN p_company_id CHAR(36))
BEGIN
    DELETE FROM acc_accounts WHERE company_id = p_company_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_clear_bill_items
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_clear_bill_items`;
delimiter ;;
CREATE PROCEDURE `sp_clear_bill_items`(IN p_bill_id CHAR(36), IN p_company_id CHAR(36))
BEGIN
    DELETE bi FROM ap_bill_items bi
    INNER JOIN ap_bills b ON b.id = bi.bill_id
    WHERE bi.bill_id = p_bill_id AND b.company_id = p_company_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_clear_invoice_items
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_clear_invoice_items`;
delimiter ;;
CREATE PROCEDURE `sp_clear_invoice_items`(IN p_iid CHAR(36), IN p_cid CHAR(36))
BEGIN DELETE ii FROM ar_invoice_items ii INNER JOIN ar_invoices i ON i.id=ii.invoice_id WHERE ii.invoice_id=p_iid AND i.company_id=p_cid; END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_clear_journal_lines
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_clear_journal_lines`;
delimiter ;;
CREATE PROCEDURE `sp_clear_journal_lines`(IN p_entry_id CHAR(36), IN p_company_id CHAR(36))
BEGIN
    DELETE jl FROM acc_journal_lines jl
    INNER JOIN acc_journal_entries je ON je.id = jl.entry_id
    WHERE jl.entry_id = p_entry_id AND je.company_id = p_company_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_clear_work_schedule_days
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_clear_work_schedule_days`;
delimiter ;;
CREATE PROCEDURE `sp_clear_work_schedule_days`(IN p_schedule_id VARCHAR(36))
BEGIN
    DELETE FROM work_schedule_days WHERE schedule_id = p_schedule_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_clock_in
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_clock_in`;
delimiter ;;
CREATE PROCEDURE `sp_clock_in`(IN p_id          VARCHAR(36),
    IN p_company_id  VARCHAR(36),
    IN p_employee_id VARCHAR(36),
    IN p_date        VARCHAR(10),
    IN p_clock_in    DATETIME,
    IN p_session_id  VARCHAR(36),
    IN p_changed_by  VARCHAR(36),
    IN p_ip_address  VARCHAR(45),
    IN p_user_agent  VARCHAR(500))
BEGIN
    INSERT INTO attendance (id, company_id, employee_id, date, clock_in, status)
    VALUES (p_id, p_company_id, p_employee_id, p_date, p_clock_in, 'Present')
    ON DUPLICATE KEY UPDATE clock_in = p_clock_in, status = 'Present', is_deleted = 0;

    INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, new_value, ip_address, user_agent)
    VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'attendance', p_id, 'INSERT', 'clock_in', p_clock_in, p_ip_address, p_user_agent);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_clock_out
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_clock_out`;
delimiter ;;
CREATE PROCEDURE `sp_clock_out`(IN p_id          VARCHAR(36),
    IN p_company_id  VARCHAR(36),
    IN p_clock_out   DATETIME,
    IN p_session_id  VARCHAR(36),
    IN p_changed_by  VARCHAR(36),
    IN p_ip_address  VARCHAR(45),
    IN p_user_agent  VARCHAR(500))
BEGIN
    DECLARE v_clock_in DATETIME;
    DECLARE v_hours DECIMAL(5,2);
    DECLARE v_ot DECIMAL(5,2);

    SELECT clock_in INTO v_clock_in
    FROM attendance WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;

    IF v_clock_in IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'no clock-in recorded for this attendance row';
    END IF;

    SET v_hours = TIMESTAMPDIFF(MINUTE, v_clock_in, p_clock_out) / 60.0;
    -- Overnight shift: a clock-out time-of-day before clock-in rolls to next day.
    IF v_hours < 0 THEN
        SET v_hours = v_hours + 24;
    END IF;
    IF v_hours < 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'clock-out precedes clock-in';
    END IF;
    SET v_ot = GREATEST(v_hours - 8, 0);

    UPDATE attendance SET
        clock_out = p_clock_out,
        hours_worked = v_hours,
        overtime_hours = v_ot
    WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;

    INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, new_value, ip_address, user_agent)
    VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'attendance', p_id, 'UPDATE', 'clock_out', p_clock_out, p_ip_address, p_user_agent);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_create_account
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_create_account`;
delimiter ;;
CREATE PROCEDURE `sp_create_account`(IN p_company_id CHAR(36),
    IN p_code VARCHAR(20),
    IN p_name VARCHAR(150),
    IN p_account_type VARCHAR(20),
    IN p_account_subtype VARCHAR(50),
    IN p_normal_balance VARCHAR(10),
    IN p_parent_id CHAR(36),
    IN p_description TEXT,
    IN p_currency VARCHAR(3))
BEGIN
    DECLARE v_id CHAR(36);
    SET v_id = UUID();

    INSERT INTO acc_accounts (
        id, company_id, code, name,
        account_type, account_subtype, normal_balance,
        parent_id, description, currency
    ) VALUES (
        v_id, p_company_id, p_code, p_name,
        p_account_type, p_account_subtype, p_normal_balance,
        NULLIF(p_parent_id, ''), p_description,
        IFNULL(NULLIF(p_currency, ''), 'PHP')
    );

    SELECT
        a.id, a.company_id, a.code, a.name,
        a.account_type, a.account_subtype,
        a.normal_balance, a.parent_id,
        p.name AS parent_name, p.code AS parent_code,
        a.description, a.is_active, a.is_system,
        a.currency, a.current_balance,
        a.created_at, a.updated_at
    FROM acc_accounts a
    LEFT JOIN acc_accounts p ON a.parent_id = p.id AND p.is_deleted = 0
    WHERE a.id = v_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_create_attendance
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_create_attendance`;
delimiter ;;
CREATE PROCEDURE `sp_create_attendance`(IN p_id          VARCHAR(36),
    IN p_company_id  VARCHAR(36),
    IN p_employee_id VARCHAR(36),
    IN p_date        VARCHAR(10),
    IN p_clock_in    VARCHAR(20),
    IN p_clock_out   VARCHAR(20),
    IN p_status      VARCHAR(20),
    IN p_remarks     TEXT,
    IN p_session_id  VARCHAR(36),
    IN p_changed_by  VARCHAR(36),
    IN p_ip_address  VARCHAR(45),
    IN p_user_agent  VARCHAR(500))
BEGIN
    DECLARE v_hours DECIMAL(5,2) DEFAULT NULL;
    DECLARE v_ot DECIMAL(5,2) DEFAULT 0;

    IF p_clock_in != '' AND p_clock_out != '' THEN
        SET v_hours = TIMESTAMPDIFF(MINUTE, p_clock_in, p_clock_out) / 60.0;
        SET v_ot = GREATEST(v_hours - 8, 0);
    END IF;

    INSERT INTO attendance (id, company_id, employee_id, date, clock_in, clock_out, hours_worked, overtime_hours, status, remarks)
    VALUES (
        p_id, p_company_id, p_employee_id, p_date,
        IF(p_clock_in = '', NULL, p_clock_in),
        IF(p_clock_out = '', NULL, p_clock_out),
        v_hours, v_ot, p_status, IF(p_remarks = '', NULL, p_remarks)
    )
    ON DUPLICATE KEY UPDATE
        clock_in = IF(p_clock_in = '', NULL, p_clock_in),
        clock_out = IF(p_clock_out = '', NULL, p_clock_out),
        hours_worked = v_hours,
        overtime_hours = v_ot,
        status = p_status,
        remarks = IF(p_remarks = '', NULL, p_remarks),
        is_deleted = 0;

    INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, new_value, ip_address, user_agent)
    VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'attendance', p_id, 'INSERT', 'status', p_status, p_ip_address, p_user_agent);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_create_bank_transaction
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_create_bank_transaction`;
delimiter ;;
CREATE PROCEDURE `sp_create_bank_transaction`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_aid CHAR(36), IN p_date DATE, IN p_desc VARCHAR(255), IN p_ref VARCHAR(100), IN p_amt DECIMAL(15,2), IN p_stmt_date DATE)
BEGIN
    INSERT INTO bank_transactions (id, company_id, account_id, txn_date, description, reference, amount, statement_date)
    VALUES (p_id, p_cid, p_aid, p_date, p_desc, p_ref, p_amt, p_stmt_date);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_create_benefit
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_create_benefit`;
delimiter ;;
CREATE PROCEDURE `sp_create_benefit`(IN p_id          VARCHAR(36),
    IN p_company_id  VARCHAR(36),
    IN p_type        VARCHAR(30),
    IN p_name        VARCHAR(200),
    IN p_provider    VARCHAR(200),
    IN p_status      VARCHAR(20),
    IN p_coverage    VARCHAR(500),
    IN p_frequency   VARCHAR(20),
    IN p_enrolled    INT,
    IN p_eligibility TEXT,
    IN p_description TEXT,
    IN p_tiers_json  JSON,
    IN p_session_id  VARCHAR(36),
    IN p_changed_by  VARCHAR(36),
    IN p_ip_address  VARCHAR(45),
    IN p_user_agent  VARCHAR(500))
BEGIN
    DECLARE v_i INT DEFAULT 0;
    DECLARE v_count INT;
    DECLARE v_tier_id VARCHAR(36);
    DECLARE v_tier_name VARCHAR(100);
    DECLARE v_employer DECIMAL(12,2);
    DECLARE v_employee DECIMAL(12,2);

    INSERT INTO benefits (
        id, company_id, type, name, provider, status, coverage,
        frequency, enrolled, eligibility, description
    ) VALUES (
        p_id, p_company_id, p_type, p_name, p_provider, p_status, p_coverage,
        p_frequency, p_enrolled, p_eligibility, p_description
    );

    -- Insert tiers from JSON array
    SET v_count = JSON_LENGTH(p_tiers_json);
    WHILE v_i < v_count DO
        SET v_tier_id = UUID();
        SET v_tier_name = JSON_UNQUOTE(JSON_EXTRACT(p_tiers_json, CONCAT('$[', v_i, '].name')));
        SET v_employer = CAST(JSON_EXTRACT(p_tiers_json, CONCAT('$[', v_i, '].employer_cost')) AS DECIMAL(12,2));
        SET v_employee = CAST(JSON_EXTRACT(p_tiers_json, CONCAT('$[', v_i, '].employee_cost')) AS DECIMAL(12,2));

        INSERT INTO benefit_tiers (id, benefit_id, name, employer_cost, employee_cost, sort_order)
        VALUES (v_tier_id, p_id, v_tier_name, COALESCE(v_employer, 0), COALESCE(v_employee, 0), v_i);

        SET v_i = v_i + 1;
    END WHILE;

    INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, new_value, ip_address, user_agent)
    VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'benefits', p_id, 'INSERT', 'name', p_name, p_ip_address, p_user_agent);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_create_bill
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_create_bill`;
delimiter ;;
CREATE PROCEDURE `sp_create_bill`(IN p_id CHAR(36),
    IN p_company_id CHAR(36),
    IN p_vendor_id CHAR(36),
    IN p_bill_number VARCHAR(50),
    IN p_bill_date DATE,
    IN p_due_date DATE,
    IN p_memo TEXT,
    IN p_reference VARCHAR(100))
BEGIN
    INSERT INTO ap_bills (id, company_id, vendor_id, bill_number, bill_date, due_date, memo, reference)
    VALUES (p_id, p_company_id, p_vendor_id, p_bill_number, p_bill_date, p_due_date, p_memo, p_reference);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_create_bill_payment
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_create_bill_payment`;
delimiter ;;
CREATE PROCEDURE `sp_create_bill_payment`(IN p_id CHAR(36),
    IN p_company_id CHAR(36),
    IN p_bill_id CHAR(36),
    IN p_payment_date DATE,
    IN p_amount DECIMAL(15,2),
    IN p_payment_method VARCHAR(50),
    IN p_reference_no VARCHAR(100),
    IN p_account_id CHAR(36),
    IN p_memo TEXT)
BEGIN
    DECLARE v_balance DECIMAL(15,2);
    DECLARE v_status VARCHAR(10);

    SELECT balance_due, status INTO v_balance, v_status FROM ap_bills
    WHERE id = p_bill_id AND company_id = p_company_id AND is_deleted = 0;

    IF v_status NOT IN ('Open','Partial') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Bill must be open or partial to accept payment';
    END IF;
    IF p_amount > v_balance THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payment exceeds balance due';
    END IF;

    INSERT INTO ap_bill_payments (id, company_id, bill_id, payment_date, amount, payment_method, reference_no, account_id, memo)
    VALUES (p_id, p_company_id, p_bill_id, p_payment_date, p_amount, IFNULL(p_payment_method, 'Bank Transfer'), p_reference_no, p_account_id, p_memo);

    -- Update bill
    UPDATE ap_bills SET
        amount_paid = amount_paid + p_amount,
        balance_due = balance_due - p_amount,
        status = CASE
            WHEN (balance_due - p_amount) <= 0 THEN 'Paid'
            ELSE 'Partial'
        END
    WHERE id = p_bill_id AND company_id = p_company_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_create_coa_template
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_create_coa_template`;
delimiter ;;
CREATE PROCEDURE `sp_create_coa_template`(IN p_company_id CHAR(36),
    IN p_name VARCHAR(150),
    IN p_country VARCHAR(5),
    IN p_currency VARCHAR(3),
    IN p_flag VARCHAR(10),
    IN p_description TEXT,
    IN p_is_global TINYINT(1))
BEGIN
    DECLARE v_id CHAR(36);
    SET v_id = UUID();

    INSERT INTO acc_coa_templates (id, company_id, name, country, currency, flag, description, is_global)
    VALUES (v_id, NULLIF(p_company_id, ''), p_name, p_country, p_currency, p_flag, p_description, p_is_global);

    SELECT id, company_id, name, country, currency, flag, description, is_global, created_at, updated_at
    FROM acc_coa_templates WHERE id = v_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_create_coa_template_item
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_create_coa_template_item`;
delimiter ;;
CREATE PROCEDURE `sp_create_coa_template_item`(IN p_template_id CHAR(36),
    IN p_code VARCHAR(20),
    IN p_name VARCHAR(150),
    IN p_account_type VARCHAR(20),
    IN p_account_subtype VARCHAR(50),
    IN p_normal_balance VARCHAR(10),
    IN p_is_system TINYINT(1),
    IN p_sort_order INT)
BEGIN
    DECLARE v_id CHAR(36);
    SET v_id = UUID();

    INSERT INTO acc_coa_template_items (id, template_id, code, name, account_type, account_subtype, normal_balance, is_system, sort_order)
    VALUES (v_id, p_template_id, p_code, p_name, p_account_type, p_account_subtype, p_normal_balance, p_is_system, p_sort_order);

    SELECT id, template_id, code, name, account_type, account_subtype, normal_balance, is_system, sort_order
    FROM acc_coa_template_items WHERE id = v_id;
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
    IN p_country VARCHAR(100),
    IN p_city VARCHAR(100),
    IN p_state VARCHAR(100),
    IN p_province VARCHAR(100),
    IN p_zip VARCHAR(20),
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
        id, name, industry, address, country, city, state, province, zip,
        key_algorithm, key_version, max_employees, plan, is_active,
        created_at, updated_at
    ) VALUES (
        p_id, p_name, p_industry, p_address, p_country, p_city, p_state, p_province, p_zip,
        v_key_algorithm, 1, IFNULL(p_max_employees, 500), v_plan, 1,
        NOW(), NOW()
    );

    CALL sp_log_change(p_id, p_changed_by, p_session_id, 'companies', p_id, 'insert', 'name', NULL, p_name, 0, p_ip_address, p_user_agent);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_create_compliance_agency
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_create_compliance_agency`;
delimiter ;;
CREATE PROCEDURE `sp_create_compliance_agency`(IN p_company_id VARCHAR(36),
    IN p_name       VARCHAR(50),
    IN p_full_name  VARCHAR(200),
    IN p_color      VARCHAR(10),
    IN p_frequency  VARCHAR(20),
    IN p_website    VARCHAR(300),
    IN p_fields_json JSON)
BEGIN
    DECLARE v_agency_id INT;
    DECLARE v_max_sort INT DEFAULT 0;

    -- Get next sort order
    SELECT COALESCE(MAX(sort_order), 0) + 1 INTO v_max_sort
    FROM compliance_agencies WHERE company_id = p_company_id AND is_deleted = 0;

    -- Insert agency
    INSERT INTO compliance_agencies (company_id, name, full_name, color, frequency, website, sort_order)
    VALUES (p_company_id, p_name, p_full_name, p_color, p_frequency, p_website, v_max_sort);

    SET v_agency_id = LAST_INSERT_ID();

    -- Insert fields from JSON
    INSERT INTO compliance_fields (agency_id, field_key, label, field_type, sort_order)
    SELECT v_agency_id,
           JSON_UNQUOTE(JSON_EXTRACT(j.val, '$.key')),
           JSON_UNQUOTE(JSON_EXTRACT(j.val, '$.label')),
           COALESCE(JSON_UNQUOTE(JSON_EXTRACT(j.val, '$.type')), 'currency'),
           j.ord
    FROM JSON_TABLE(p_fields_json, '$[*]' COLUMNS (
        ord FOR ORDINALITY,
        val JSON PATH '$'
    )) j;

    SELECT v_agency_id AS agency_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_create_customer
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_create_customer`;
delimiter ;;
CREATE PROCEDURE `sp_create_customer`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_name VARCHAR(200), IN p_cp VARCHAR(150), IN p_email VARCHAR(150), IN p_phone VARCHAR(50), IN p_addr TEXT, IN p_city VARCHAR(100), IN p_prov VARCHAR(100), IN p_zip VARCHAR(20), IN p_tin VARCHAR(30), IN p_terms INT, IN p_notes TEXT)
BEGIN INSERT INTO ar_customers (id, company_id, name, contact_person, email, phone, address, city, province, zip_code, tin, payment_terms, notes) VALUES (p_id, p_cid, p_name, p_cp, p_email, p_phone, p_addr, p_city, p_prov, p_zip, p_tin, IFNULL(p_terms,30), p_notes); END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_create_department
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_create_department`;
delimiter ;;
CREATE PROCEDURE `sp_create_department`(IN p_id          VARCHAR(36),
    IN p_company_id  VARCHAR(36),
    IN p_name        VARCHAR(100),
    IN p_color       VARCHAR(10),
    IN p_description TEXT,
    IN p_session_id  VARCHAR(36),
    IN p_changed_by  VARCHAR(36),
    IN p_ip_address  VARCHAR(45),
    IN p_user_agent  VARCHAR(500))
BEGIN
    INSERT INTO departments (id, company_id, name, color, description)
    VALUES (p_id, p_company_id, p_name, p_color, p_description);

    INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, new_value, ip_address, user_agent)
    VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'departments', p_id, 'INSERT', 'name', p_name, p_ip_address, p_user_agent);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_create_employee
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_create_employee`;
delimiter ;;
CREATE PROCEDURE `sp_create_employee`(IN p_id              VARCHAR(36),
    IN p_company_id      VARCHAR(36),
    IN p_first_name      VARCHAR(100),
    IN p_last_name       VARCHAR(100),
    IN p_middle_name     VARCHAR(100),
    IN p_department      VARCHAR(100),
    IN p_position        VARCHAR(100),
    IN p_joined_date     VARCHAR(10),
    IN p_employment_type VARCHAR(30),
    IN p_status          VARCHAR(20),
    IN p_email_enc       TEXT,
    IN p_phone_enc       TEXT,
    IN p_birthday_enc    TEXT,
    IN p_address_enc     TEXT,
    IN p_salary_enc      TEXT,
    IN p_sss_enc         TEXT,
    IN p_philhealth_enc  TEXT,
    IN p_pagibig_enc     TEXT,
    IN p_tin_enc         TEXT,
    IN p_bank_name_enc   TEXT,
    IN p_bank_account_enc TEXT,
    IN p_enrolled_benefits JSON,
    IN p_work_schedule_id VARCHAR(36),
    IN p_session_id      VARCHAR(36),
    IN p_changed_by      VARCHAR(36),
    IN p_ip_address      VARCHAR(45),
    IN p_user_agent      VARCHAR(500))
BEGIN
    INSERT INTO employees (
        id, company_id, first_name, last_name, middle_name,
        department, position, joined_date, employment_type, status,
        email_enc, phone_enc, birthday_enc, address_enc,
        basic_salary_enc, sss_no_enc, philhealth_no_enc,
        pagibig_no_enc, tin_enc, bank_name_enc, bank_account_enc,
        enrolled_benefits, work_schedule_id
    ) VALUES (
        p_id, p_company_id, p_first_name, p_last_name, p_middle_name,
        p_department, p_position,
        IF(p_joined_date = '', NULL, p_joined_date),
        p_employment_type, p_status,
        p_email_enc, p_phone_enc, p_birthday_enc, p_address_enc,
        p_salary_enc, p_sss_enc, p_philhealth_enc,
        p_pagibig_enc, p_tin_enc, p_bank_name_enc, p_bank_account_enc,
        p_enrolled_benefits,
        IF(p_work_schedule_id = '', NULL, p_work_schedule_id)
    );

    INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, new_value, ip_address, user_agent)
    VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'employees', p_id, 'INSERT', 'name', CONCAT(p_first_name, ' ', p_last_name), p_ip_address, p_user_agent);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_create_invoice
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_create_invoice`;
delimiter ;;
CREATE PROCEDURE `sp_create_invoice`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_custid CHAR(36), IN p_num VARCHAR(50), IN p_date DATE, IN p_due DATE, IN p_memo TEXT, IN p_ref VARCHAR(100))
BEGIN INSERT INTO ar_invoices (id,company_id,customer_id,invoice_number,invoice_date,due_date,memo,reference) VALUES (p_id,p_cid,p_custid,p_num,p_date,p_due,p_memo,p_ref); END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_create_invoice_payment
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_create_invoice_payment`;
delimiter ;;
CREATE PROCEDURE `sp_create_invoice_payment`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_iid CHAR(36), IN p_date DATE, IN p_amt DECIMAL(15,2), IN p_method VARCHAR(50), IN p_ref VARCHAR(100), IN p_aid CHAR(36), IN p_memo TEXT)
BEGIN
  DECLARE v_bal DECIMAL(15,2); DECLARE v_st VARCHAR(10);
  SELECT balance_due,status INTO v_bal,v_st FROM ar_invoices WHERE id=p_iid AND company_id=p_cid AND is_deleted=0;
  IF v_st NOT IN ('Sent','Partial') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invoice must be sent to accept payment'; END IF;
  IF p_amt > v_bal THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Payment exceeds balance'; END IF;
  INSERT INTO ar_invoice_payments (id,company_id,invoice_id,payment_date,amount,payment_method,reference_no,account_id,memo) VALUES (p_id,p_cid,p_iid,p_date,p_amt,IFNULL(p_method,'Bank Transfer'),p_ref,p_aid,p_memo);
  UPDATE ar_invoices SET amount_paid=amount_paid+p_amt, balance_due=balance_due-p_amt, status=CASE WHEN (balance_due-p_amt)<=0 THEN 'Paid' ELSE 'Partial' END WHERE id=p_iid AND company_id=p_cid;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_create_journal_entry
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_create_journal_entry`;
delimiter ;;
CREATE PROCEDURE `sp_create_journal_entry`(IN p_id CHAR(36),
    IN p_company_id CHAR(36),
    IN p_entry_number INT,
    IN p_entry_date DATE,
    IN p_memo TEXT,
    IN p_source_type VARCHAR(30),
    IN p_source_id CHAR(36),
    IN p_status VARCHAR(10))
BEGIN
    INSERT INTO acc_journal_entries (id, company_id, entry_number, entry_date, memo, source_type, source_id, status)
    VALUES (p_id, p_company_id, p_entry_number, p_entry_date, p_memo, p_source_type, NULLIF(p_source_id, ''), IFNULL(NULLIF(p_status,''), 'Draft'));
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_create_leave
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_create_leave`;
delimiter ;;
CREATE PROCEDURE `sp_create_leave`(IN p_id          VARCHAR(36),
    IN p_company_id  VARCHAR(36),
    IN p_employee_id VARCHAR(36),
    IN p_leave_type  VARCHAR(30),
    IN p_start_date  VARCHAR(10),
    IN p_end_date    VARCHAR(10),
    IN p_days        DECIMAL(4,1),
    IN p_reason      TEXT,
    IN p_session_id  VARCHAR(36),
    IN p_changed_by  VARCHAR(36),
    IN p_ip_address  VARCHAR(45),
    IN p_user_agent  VARCHAR(500))
BEGIN
    INSERT INTO leaves (id, company_id, employee_id, leave_type, start_date, end_date, days, reason)
    VALUES (p_id, p_company_id, p_employee_id, p_leave_type, p_start_date, p_end_date, p_days,
            IF(p_reason = '', NULL, p_reason));

    INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, new_value, ip_address, user_agent)
    VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'leaves', p_id, 'INSERT', 'leave_type', p_leave_type, p_ip_address, p_user_agent);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_create_loan
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_create_loan`;
delimiter ;;
CREATE PROCEDURE `sp_create_loan`(IN p_company_id CHAR(36), IN p_employee_id CHAR(36),
    IN p_loan_type_id CHAR(36), IN p_loan_type_name VARCHAR(100),
    IN p_amount DECIMAL(12,2), IN p_interest_rate DECIMAL(5,2),
    IN p_term_months INT, IN p_monthly_payment DECIMAL(12,2),
    IN p_total_payable DECIMAL(12,2), IN p_applied_date DATE, IN p_notes TEXT)
BEGIN
    INSERT INTO loans (company_id, employee_id, loan_type_id, loan_type_name, amount, interest_rate,
        term_months, monthly_payment, total_payable, total_paid, balance, status, applied_date, notes)
    VALUES (p_company_id, p_employee_id, p_loan_type_id, p_loan_type_name, p_amount, p_interest_rate,
        p_term_months, p_monthly_payment, p_total_payable, 0, p_total_payable, 'Pending', p_applied_date, p_notes);
    SELECT l.*, e.first_name, e.last_name, e.department, e.position
    FROM loans l LEFT JOIN employees e ON e.id = l.employee_id
    WHERE l.id = LAST_INSERT_ID() OR (l.company_id = p_company_id AND l.employee_id = p_employee_id AND l.status = 'Pending' AND l.is_deleted = 0)
    ORDER BY l.created_at DESC LIMIT 1;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_create_loan_type
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_create_loan_type`;
delimiter ;;
CREATE PROCEDURE `sp_create_loan_type`(IN p_company_id CHAR(36), IN p_name VARCHAR(100), IN p_description TEXT,
    IN p_max_amount DECIMAL(12,2), IN p_interest_rate DECIMAL(5,2),
    IN p_max_term_months INT, IN p_requires_approval TINYINT(1))
BEGIN
    INSERT INTO loan_types (company_id, name, description, max_amount, interest_rate, max_term_months, requires_approval)
    VALUES (p_company_id, p_name, p_description, p_max_amount, p_interest_rate, p_max_term_months, p_requires_approval);
    SELECT * FROM loan_types WHERE id = LAST_INSERT_ID() OR (company_id = p_company_id AND name = p_name AND is_deleted = 0) ORDER BY created_at DESC LIMIT 1;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_create_onboarding_checklist
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_create_onboarding_checklist`;
delimiter ;;
CREATE PROCEDURE `sp_create_onboarding_checklist`(IN p_id          VARCHAR(36),
    IN p_company_id  VARCHAR(36),
    IN p_employee_id VARCHAR(36),
    IN p_template_id VARCHAR(36),
    IN p_start_date  VARCHAR(10),
    IN p_target_date VARCHAR(10),
    IN p_notes       TEXT,
    IN p_session_id  VARCHAR(36),
    IN p_changed_by  VARCHAR(36),
    IN p_ip_address  VARCHAR(45),
    IN p_user_agent  VARCHAR(500))
BEGIN
    INSERT INTO onboarding_checklists (id, company_id, employee_id, template_id, start_date, target_date, notes)
    VALUES (p_id, p_company_id, p_employee_id,
            IF(p_template_id='',NULL,p_template_id),
            p_start_date,
            IF(p_target_date='',NULL,p_target_date),
            IF(p_notes='',NULL,p_notes));

    -- Auto-populate items from template
    IF p_template_id != '' THEN
        INSERT INTO onboarding_items (id, checklist_id, company_id, title, category, required, sort_order)
        SELECT UUID(), p_id, p_company_id, ti.title, ti.category, ti.required, ti.sort_order
        FROM onboarding_template_items ti
        WHERE ti.template_id = p_template_id AND ti.is_deleted = 0;
    END IF;

    INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, new_value, ip_address, user_agent)
    VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'onboarding_checklists', p_id, 'INSERT', 'employee_id', p_employee_id, p_ip_address, p_user_agent);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_create_onboarding_template
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_create_onboarding_template`;
delimiter ;;
CREATE PROCEDURE `sp_create_onboarding_template`(IN p_id          VARCHAR(36),
    IN p_company_id  VARCHAR(36),
    IN p_name        VARCHAR(100),
    IN p_description TEXT,
    IN p_category    VARCHAR(50),
    IN p_is_default  TINYINT,
    IN p_session_id  VARCHAR(36),
    IN p_changed_by  VARCHAR(36),
    IN p_ip_address  VARCHAR(45),
    IN p_user_agent  VARCHAR(500))
BEGIN
    -- If setting as default, unset existing defaults
    IF p_is_default = 1 THEN
        UPDATE onboarding_templates SET is_default = 0
        WHERE company_id = p_company_id AND is_deleted = 0;
    END IF;

    INSERT INTO onboarding_templates (id, company_id, name, description, category, is_default)
    VALUES (p_id, p_company_id, p_name, IF(p_description='',NULL,p_description), p_category, p_is_default);

    INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, new_value, ip_address, user_agent)
    VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'onboarding_templates', p_id, 'INSERT', 'name', p_name, p_ip_address, p_user_agent);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_create_payroll_run
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_create_payroll_run`;
delimiter ;;
CREATE PROCEDURE `sp_create_payroll_run`(IN p_id           VARCHAR(36),
    IN p_company_id   VARCHAR(36),
    IN p_period_start VARCHAR(10),
    IN p_period_end   VARCHAR(10),
    IN p_pay_date     VARCHAR(10),
    IN p_notes        TEXT,
    IN p_session_id   VARCHAR(36),
    IN p_changed_by   VARCHAR(36),
    IN p_ip_address   VARCHAR(45),
    IN p_user_agent   VARCHAR(500))
BEGIN
    INSERT INTO payroll_runs (id, company_id, period_start, period_end, pay_date, notes)
    VALUES (p_id, p_company_id, p_period_start, p_period_end,
            IF(p_pay_date = '', NULL, p_pay_date),
            IF(p_notes = '', NULL, p_notes));

    INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, new_value, ip_address, user_agent)
    VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'payroll_runs', p_id, 'INSERT', 'period', CONCAT(p_period_start, ' to ', p_period_end), p_ip_address, p_user_agent);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_create_position
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_create_position`;
delimiter ;;
CREATE PROCEDURE `sp_create_position`(IN p_id          VARCHAR(36),
    IN p_company_id  VARCHAR(36),
    IN p_name        VARCHAR(100),
    IN p_department  VARCHAR(100),
    IN p_level       VARCHAR(50),
    IN p_description TEXT,
    IN p_session_id  VARCHAR(36),
    IN p_changed_by  VARCHAR(36),
    IN p_ip_address  VARCHAR(45),
    IN p_user_agent  VARCHAR(500))
BEGIN
    INSERT INTO positions (id, company_id, name, department, level, description)
    VALUES (p_id, p_company_id, p_name, p_department, p_level, p_description);

    INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, new_value, ip_address, user_agent)
    VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'positions', p_id, 'INSERT', 'name', p_name, p_ip_address, p_user_agent);
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
-- Procedure structure for sp_create_ticket
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_create_ticket`;
delimiter ;;
CREATE PROCEDURE `sp_create_ticket`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_subject VARCHAR(255), IN p_desc TEXT, IN p_catid CHAR(36), IN p_priority VARCHAR(10), IN p_created_by CHAR(36), IN p_assigned_to CHAR(36))
BEGIN
    DECLARE v_num INT;
    DECLARE v_sla INT DEFAULT 48;
    CALL sp_next_ticket_number(p_cid, v_num);

    IF p_catid IS NOT NULL AND p_catid != '' THEN
        SELECT sla_hours INTO v_sla FROM tk_categories WHERE id = p_catid;
    END IF;

    INSERT INTO tk_tickets (id, company_id, ticket_number, subject, description, category_id, priority, created_by, assigned_to, due_date)
    VALUES (p_id, p_cid, v_num, p_subject, p_desc,
        NULLIF(p_catid, ''),
        IFNULL(p_priority, 'Medium'),
        p_created_by,
        NULLIF(p_assigned_to, ''),
        DATE_ADD(NOW(), INTERVAL v_sla HOUR)
    );
    SELECT v_num AS ticket_number;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_create_ticket_category
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_create_ticket_category`;
delimiter ;;
CREATE PROCEDURE `sp_create_ticket_category`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_name VARCHAR(100), IN p_desc VARCHAR(255), IN p_color VARCHAR(7), IN p_icon VARCHAR(30), IN p_sla INT, IN p_sort INT)
BEGIN
    INSERT INTO tk_categories (id, company_id, name, description, color, icon, sla_hours, sort_order)
    VALUES (p_id, p_cid, p_name, p_desc, IFNULL(p_color,'#6366f1'), IFNULL(p_icon,'tag'), IFNULL(p_sla,48), IFNULL(p_sort,0));
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
    IN p_key_exchange_algorithm VARCHAR(50),
    IN p_public_key BLOB,
    IN p_signing_public_key BLOB,
    IN p_role VARCHAR(50),
    IN p_permissions JSON,
    IN p_changed_by VARCHAR(36),
    IN p_session_id VARCHAR(36),
    IN p_ip_address VARCHAR(45),
    IN p_user_agent VARCHAR(500))
BEGIN
    DECLARE v_role VARCHAR(50);
    DECLARE v_algorithm VARCHAR(50);
    DECLARE v_kex VARCHAR(50);

    SET v_role = IFNULL(p_role, 'employee');
    SET v_algorithm = IFNULL(p_key_wrap_algorithm, 'AES-KW');
    SET v_kex = IFNULL(p_key_exchange_algorithm, 'ML-KEM-768');

    INSERT INTO user_company_access (
        id, user_id, company_id,
        wrapped_company_key, key_wrap_algorithm, key_exchange_algorithm, key_version,
        public_key, signing_public_key, role, permissions,
        is_active, joined_at, updated_at
    ) VALUES (
        p_id, p_user_id, p_company_id,
        p_wrapped_company_key, v_algorithm, v_kex, 1,
        p_public_key, p_signing_public_key, v_role, p_permissions,
        1, NOW(), NOW()
    );

    CALL sp_log_change(
        p_company_id, p_changed_by, p_session_id, 'user_company_access', p_id,
        'insert', 'role', NULL, p_role, 0,
        p_ip_address, p_user_agent
    );
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_create_vendor
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_create_vendor`;
delimiter ;;
CREATE PROCEDURE `sp_create_vendor`(IN p_id CHAR(36),
    IN p_company_id CHAR(36),
    IN p_name VARCHAR(200),
    IN p_contact_person VARCHAR(150),
    IN p_email VARCHAR(150),
    IN p_phone VARCHAR(50),
    IN p_address TEXT,
    IN p_city VARCHAR(100),
    IN p_province VARCHAR(100),
    IN p_zip_code VARCHAR(20),
    IN p_tin VARCHAR(30),
    IN p_payment_terms INT,
    IN p_notes TEXT)
BEGIN
    INSERT INTO ap_vendors (id, company_id, name, contact_person, email, phone, address, city, province, zip_code, tin, payment_terms, notes)
    VALUES (p_id, p_company_id, p_name, p_contact_person, p_email, p_phone, p_address, p_city, p_province, p_zip_code, p_tin, IFNULL(p_payment_terms, 30), p_notes);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_create_work_schedule
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_create_work_schedule`;
delimiter ;;
CREATE PROCEDURE `sp_create_work_schedule`(IN p_id          VARCHAR(36),
    IN p_company_id  VARCHAR(36),
    IN p_name        VARCHAR(150),
    IN p_type        VARCHAR(20),
    IN p_description TEXT,
    IN p_color       VARCHAR(10),
    IN p_is_default  TINYINT,
    IN p_session_id  VARCHAR(36),
    IN p_changed_by  VARCHAR(36),
    IN p_ip_address  VARCHAR(45),
    IN p_user_agent  VARCHAR(500))
BEGIN
    IF p_is_default = 1 THEN
        UPDATE work_schedules SET is_default = 0
        WHERE company_id = p_company_id AND is_deleted = 0;
    END IF;

    INSERT INTO work_schedules (id, company_id, name, type, description, color, is_default)
    VALUES (p_id, p_company_id, p_name, p_type, p_description, p_color, p_is_default);

    INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, new_value, ip_address, user_agent)
    VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'work_schedules', p_id, 'INSERT', 'name', p_name, p_ip_address, p_user_agent);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_delete_account
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_account`;
delimiter ;;
CREATE PROCEDURE `sp_delete_account`(IN p_company_id CHAR(36), IN p_id CHAR(36))
BEGIN
    DECLARE v_has_children INT DEFAULT 0;
    DECLARE v_is_system INT DEFAULT 0;

    SELECT is_system INTO v_is_system
    FROM acc_accounts WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;

    IF v_is_system = 1 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot delete system account';
    END IF;

    SELECT COUNT(*) INTO v_has_children
    FROM acc_accounts WHERE parent_id = p_id AND company_id = p_company_id AND is_deleted = 0;

    IF v_has_children > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot delete account with sub-accounts';
    END IF;

    UPDATE acc_accounts SET is_deleted = 1 WHERE id = p_id AND company_id = p_company_id AND is_system = 0;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_delete_account_mapping
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_account_mapping`;
delimiter ;;
CREATE PROCEDURE `sp_delete_account_mapping`(IN p_company_id CHAR(36),
    IN p_mapping_key VARCHAR(50))
BEGIN
    UPDATE acc_account_mappings SET is_deleted = 1
    WHERE company_id = p_company_id AND mapping_key = p_mapping_key AND is_deleted = 0;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_delete_attendance
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_attendance`;
delimiter ;;
CREATE PROCEDURE `sp_delete_attendance`(IN p_id         VARCHAR(36),
    IN p_company_id VARCHAR(36),
    IN p_session_id VARCHAR(36),
    IN p_changed_by VARCHAR(36),
    IN p_ip_address VARCHAR(45),
    IN p_user_agent VARCHAR(500))
BEGIN
    -- Hard-delete the record since unique key is now (employee_id, date)
    -- and soft-delete would block future inserts for the same day
    DELETE FROM attendance
    WHERE id = p_id AND company_id = p_company_id;

    INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, old_value, ip_address, user_agent)
    VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'attendance', p_id, 'DELETE', 'record', p_id, p_ip_address, p_user_agent);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_delete_bank_transaction
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_bank_transaction`;
delimiter ;;
CREATE PROCEDURE `sp_delete_bank_transaction`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    UPDATE bank_transactions SET is_deleted = 1 WHERE id = p_id AND company_id = p_cid;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_delete_benefit
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_benefit`;
delimiter ;;
CREATE PROCEDURE `sp_delete_benefit`(IN p_id         VARCHAR(36),
    IN p_company_id VARCHAR(36),
    IN p_session_id VARCHAR(36),
    IN p_changed_by VARCHAR(36),
    IN p_ip_address VARCHAR(45),
    IN p_user_agent VARCHAR(500))
BEGIN
    DECLARE v_name VARCHAR(200);

    SELECT name INTO v_name
    FROM benefits WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;

    UPDATE benefits SET is_deleted = 1
    WHERE id = p_id AND company_id = p_company_id;

    UPDATE benefit_tiers SET is_deleted = 1
    WHERE benefit_id = p_id;

    INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, old_value, ip_address, user_agent)
    VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'benefits', p_id, 'DELETE', 'name', v_name, p_ip_address, p_user_agent);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_delete_bill
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_bill`;
delimiter ;;
CREATE PROCEDURE `sp_delete_bill`(IN p_id CHAR(36),
    IN p_company_id CHAR(36))
BEGIN
    DECLARE v_status VARCHAR(10);
    SELECT status INTO v_status FROM ap_bills WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;
    IF v_status IN ('Partial','Paid') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot delete bill with payments';
    END IF;
    DELETE FROM ap_bill_items WHERE bill_id = p_id;
    UPDATE ap_bills SET is_deleted = 1 WHERE id = p_id AND company_id = p_company_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_delete_bill_payment
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_bill_payment`;
delimiter ;;
CREATE PROCEDURE `sp_delete_bill_payment`(IN p_id CHAR(36),
    IN p_company_id CHAR(36))
BEGIN
    DECLARE v_bill_id CHAR(36);
    DECLARE v_amount DECIMAL(15,2);

    SELECT bill_id, amount INTO v_bill_id, v_amount FROM ap_bill_payments
    WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;

    UPDATE ap_bill_payments SET is_deleted = 1 WHERE id = p_id;

    -- Reverse bill amounts
    UPDATE ap_bills SET
        amount_paid = amount_paid - v_amount,
        balance_due = balance_due + v_amount,
        status = CASE
            WHEN (amount_paid - v_amount) <= 0 THEN 'Open'
            ELSE 'Partial'
        END
    WHERE id = v_bill_id AND company_id = p_company_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_delete_coa_template
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_coa_template`;
delimiter ;;
CREATE PROCEDURE `sp_delete_coa_template`(IN p_id CHAR(36),
    IN p_company_id CHAR(36))
BEGIN
    UPDATE acc_coa_templates SET is_deleted = 1
    WHERE id = p_id AND (is_global = 0 OR company_id = p_company_id);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_delete_coa_template_item
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_coa_template_item`;
delimiter ;;
CREATE PROCEDURE `sp_delete_coa_template_item`(IN p_id CHAR(36))
BEGIN
    UPDATE acc_coa_template_items SET is_deleted = 1 WHERE id = p_id;
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
-- Procedure structure for sp_delete_compliance_agency
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_compliance_agency`;
delimiter ;;
CREATE PROCEDURE `sp_delete_compliance_agency`(IN p_agency_id  INT,
    IN p_company_id VARCHAR(36))
BEGIN
    UPDATE compliance_agencies SET is_deleted = 1
    WHERE id = p_agency_id AND company_id = p_company_id;

    SELECT ROW_COUNT() AS deleted;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_delete_customer
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_customer`;
delimiter ;;
CREATE PROCEDURE `sp_delete_customer`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
  IF EXISTS (SELECT 1 FROM ar_invoices WHERE customer_id=p_id AND status IN ('Sent','Partial') AND is_deleted=0) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cannot delete customer with open invoices';
  END IF;
  UPDATE ar_customers SET is_deleted=1 WHERE id=p_id AND company_id=p_cid;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_delete_department
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_department`;
delimiter ;;
CREATE PROCEDURE `sp_delete_department`(IN p_id         VARCHAR(36),
    IN p_company_id VARCHAR(36),
    IN p_session_id VARCHAR(36),
    IN p_changed_by VARCHAR(36),
    IN p_ip_address VARCHAR(45),
    IN p_user_agent VARCHAR(500))
BEGIN
    DECLARE v_name VARCHAR(100);

    SELECT name INTO v_name
    FROM departments WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;

    UPDATE departments SET is_deleted = 1
    WHERE id = p_id AND company_id = p_company_id;

    INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, old_value, ip_address, user_agent)
    VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'departments', p_id, 'DELETE', 'name', v_name, p_ip_address, p_user_agent);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_delete_employee
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_employee`;
delimiter ;;
CREATE PROCEDURE `sp_delete_employee`(IN p_id         VARCHAR(36),
    IN p_company_id VARCHAR(36),
    IN p_session_id VARCHAR(36),
    IN p_changed_by VARCHAR(36),
    IN p_ip_address VARCHAR(45),
    IN p_user_agent VARCHAR(500))
BEGIN
    DECLARE v_name VARCHAR(201);

    SELECT CONCAT(first_name, ' ', last_name) INTO v_name
    FROM employees WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;

    UPDATE employees SET is_deleted = 1
    WHERE id = p_id AND company_id = p_company_id;

    INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, old_value, ip_address, user_agent)
    VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'employees', p_id, 'DELETE', 'name', v_name, p_ip_address, p_user_agent);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_delete_invoice
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_invoice`;
delimiter ;;
CREATE PROCEDURE `sp_delete_invoice`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
  DECLARE v_st VARCHAR(10);
  SELECT status INTO v_st FROM ar_invoices WHERE id=p_id AND company_id=p_cid AND is_deleted=0;
  IF v_st IN ('Partial','Paid') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cannot delete invoice with payments'; END IF;
  DELETE FROM ar_invoice_items WHERE invoice_id=p_id;
  UPDATE ar_invoices SET is_deleted=1 WHERE id=p_id AND company_id=p_cid;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_delete_invoice_payment
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_invoice_payment`;
delimiter ;;
CREATE PROCEDURE `sp_delete_invoice_payment`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
  DECLARE v_iid CHAR(36); DECLARE v_amt DECIMAL(15,2);
  SELECT invoice_id,amount INTO v_iid,v_amt FROM ar_invoice_payments WHERE id=p_id AND company_id=p_cid AND is_deleted=0;
  UPDATE ar_invoice_payments SET is_deleted=1 WHERE id=p_id;
  UPDATE ar_invoices SET amount_paid=amount_paid-v_amt, balance_due=balance_due+v_amt, status=CASE WHEN (amount_paid-v_amt)<=0 THEN 'Sent' ELSE 'Partial' END WHERE id=v_iid AND company_id=p_cid;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_delete_journal_entry
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_journal_entry`;
delimiter ;;
CREATE PROCEDURE `sp_delete_journal_entry`(IN p_id CHAR(36),
    IN p_company_id CHAR(36))
BEGIN
    DECLARE v_status VARCHAR(10);
    SELECT status INTO v_status FROM acc_journal_entries
    WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;

    IF v_status = 'Posted' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot delete posted entries. Void first.';
    END IF;

    DELETE FROM acc_journal_lines WHERE entry_id = p_id;
    UPDATE acc_journal_entries SET is_deleted = 1 WHERE id = p_id AND company_id = p_company_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_delete_leave
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_leave`;
delimiter ;;
CREATE PROCEDURE `sp_delete_leave`(IN p_id         VARCHAR(36),
    IN p_company_id VARCHAR(36),
    IN p_session_id VARCHAR(36),
    IN p_changed_by VARCHAR(36),
    IN p_ip_address VARCHAR(45),
    IN p_user_agent VARCHAR(500))
BEGIN
    UPDATE leaves SET is_deleted = 1
    WHERE id = p_id AND company_id = p_company_id;

    INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, old_value, ip_address, user_agent)
    VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'leaves', p_id, 'DELETE', 'record', p_id, p_ip_address, p_user_agent);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_delete_loan
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_loan`;
delimiter ;;
CREATE PROCEDURE `sp_delete_loan`(IN p_company_id CHAR(36), IN p_id CHAR(36))
BEGIN
    UPDATE loans SET is_deleted = 1 WHERE id = p_id AND company_id = p_company_id;
    UPDATE loan_payments SET is_deleted = 1 WHERE loan_id = p_id AND company_id = p_company_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_delete_loan_payment
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_loan_payment`;
delimiter ;;
CREATE PROCEDURE `sp_delete_loan_payment`(IN p_company_id CHAR(36), IN p_id CHAR(36))
BEGIN
    DECLARE v_loan_id CHAR(36);
    DECLARE v_amount DECIMAL(12,2);

    SELECT loan_id, amount INTO v_loan_id, v_amount FROM loan_payments WHERE id = p_id AND company_id = p_company_id;

    IF v_loan_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'loan payment not found';
    END IF;

    UPDATE loan_payments SET is_deleted = 1 WHERE id = p_id AND company_id = p_company_id;

    UPDATE loans SET total_paid = total_paid - v_amount, balance = balance + v_amount,
        status = IF(status = 'Paid', 'Active', status)
    WHERE id = v_loan_id AND company_id = p_company_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_delete_loan_type
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_loan_type`;
delimiter ;;
CREATE PROCEDURE `sp_delete_loan_type`(IN p_id CHAR(36))
BEGIN
    UPDATE loan_types SET is_deleted = 1 WHERE id = p_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_delete_onboarding_checklist
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_onboarding_checklist`;
delimiter ;;
CREATE PROCEDURE `sp_delete_onboarding_checklist`(IN p_id VARCHAR(36), IN p_company_id VARCHAR(36),
    IN p_session_id VARCHAR(36), IN p_changed_by VARCHAR(36), IN p_ip_address VARCHAR(45), IN p_user_agent VARCHAR(500))
BEGIN
    UPDATE onboarding_items SET is_deleted = 1 WHERE checklist_id = p_id;
    UPDATE onboarding_checklists SET is_deleted = 1 WHERE id = p_id AND company_id = p_company_id;
    INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, old_value, ip_address, user_agent)
    VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'onboarding_checklists', p_id, 'DELETE', 'record', p_id, p_ip_address, p_user_agent);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_delete_onboarding_item
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_onboarding_item`;
delimiter ;;
CREATE PROCEDURE `sp_delete_onboarding_item`(IN p_id VARCHAR(36))
BEGIN
    UPDATE onboarding_items SET is_deleted = 1 WHERE id = p_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_delete_onboarding_template
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_onboarding_template`;
delimiter ;;
CREATE PROCEDURE `sp_delete_onboarding_template`(IN p_id VARCHAR(36), IN p_company_id VARCHAR(36),
    IN p_session_id VARCHAR(36), IN p_changed_by VARCHAR(36), IN p_ip_address VARCHAR(45), IN p_user_agent VARCHAR(500))
BEGIN
    UPDATE onboarding_template_items SET is_deleted = 1 WHERE template_id = p_id;
    UPDATE onboarding_templates SET is_deleted = 1 WHERE id = p_id AND company_id = p_company_id;
    INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, old_value, ip_address, user_agent)
    VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'onboarding_templates', p_id, 'DELETE', 'record', p_id, p_ip_address, p_user_agent);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_delete_payroll_items
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_payroll_items`;
delimiter ;;
CREATE PROCEDURE `sp_delete_payroll_items`(IN p_run_id     VARCHAR(36),
    IN p_company_id VARCHAR(36))
BEGIN
    UPDATE payroll_items SET is_deleted = 1
    WHERE run_id = p_run_id AND company_id = p_company_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_delete_payroll_run
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_payroll_run`;
delimiter ;;
CREATE PROCEDURE `sp_delete_payroll_run`(IN p_id         VARCHAR(36),
    IN p_company_id VARCHAR(36),
    IN p_session_id VARCHAR(36),
    IN p_changed_by VARCHAR(36),
    IN p_ip_address VARCHAR(45),
    IN p_user_agent VARCHAR(500))
BEGIN
    UPDATE payroll_items SET is_deleted = 1 WHERE run_id = p_id;
    UPDATE payroll_runs SET is_deleted = 1 WHERE id = p_id AND company_id = p_company_id;

    INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, old_value, ip_address, user_agent)
    VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'payroll_runs', p_id, 'DELETE', 'record', p_id, p_ip_address, p_user_agent);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_delete_position
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_position`;
delimiter ;;
CREATE PROCEDURE `sp_delete_position`(IN p_id         VARCHAR(36),
    IN p_company_id VARCHAR(36),
    IN p_session_id VARCHAR(36),
    IN p_changed_by VARCHAR(36),
    IN p_ip_address VARCHAR(45),
    IN p_user_agent VARCHAR(500))
BEGIN
    DECLARE v_name VARCHAR(100);

    SELECT name INTO v_name
    FROM positions WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;

    UPDATE positions SET is_deleted = 1
    WHERE id = p_id AND company_id = p_company_id;

    INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, old_value, ip_address, user_agent)
    VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'positions', p_id, 'DELETE', 'name', v_name, p_ip_address, p_user_agent);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_delete_template_item
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_template_item`;
delimiter ;;
CREATE PROCEDURE `sp_delete_template_item`(IN p_id VARCHAR(36))
BEGIN
    UPDATE onboarding_template_items SET is_deleted = 1 WHERE id = p_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_delete_ticket
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_ticket`;
delimiter ;;
CREATE PROCEDURE `sp_delete_ticket`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    UPDATE tk_tickets SET is_deleted = 1 WHERE id = p_id AND company_id = p_cid;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_delete_ticket_category
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_ticket_category`;
delimiter ;;
CREATE PROCEDURE `sp_delete_ticket_category`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    UPDATE tk_tickets SET category_id = NULL WHERE category_id = p_id AND company_id = p_cid;
    UPDATE tk_categories SET is_deleted=1 WHERE id=p_id AND company_id=p_cid;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_delete_ticket_comment
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_ticket_comment`;
delimiter ;;
CREATE PROCEDURE `sp_delete_ticket_comment`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    UPDATE tk_comments tc
    INNER JOIN tk_tickets t ON t.id = tc.ticket_id AND t.company_id = p_cid
    SET tc.is_deleted = 1
    WHERE tc.id = p_id;
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
    FROM user_company_access WHERE id = p_id AND company_id = p_company_id AND is_active = 1;

    IF v_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'access record not found';
    END IF;

    UPDATE user_company_access SET is_active = 0 WHERE id = p_id AND company_id = p_company_id AND is_active = 1;

    CALL sp_log_change(p_company_id, p_changed_by, p_session_id, 'user_company_access', p_id, 'delete', 'is_active', '1', '0', 0, p_ip_address, p_user_agent);
    CALL sp_log_change(p_company_id, p_changed_by, p_session_id, 'user_company_access', p_id, 'delete', 'user_id', v_user_id, NULL, 0, p_ip_address, p_user_agent);
    CALL sp_log_change(p_company_id, p_changed_by, p_session_id, 'user_company_access', p_id, 'delete', 'role', v_role, NULL, 0, p_ip_address, p_user_agent);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_delete_vendor
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_vendor`;
delimiter ;;
CREATE PROCEDURE `sp_delete_vendor`(IN p_id CHAR(36),
    IN p_company_id CHAR(36))
BEGIN
    -- Check no open bills
    IF EXISTS (SELECT 1 FROM ap_bills WHERE vendor_id = p_id AND status IN ('Open','Partial') AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot delete vendor with open bills';
    END IF;
    UPDATE ap_vendors SET is_deleted = 1 WHERE id = p_id AND company_id = p_company_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_delete_work_schedule
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_work_schedule`;
delimiter ;;
CREATE PROCEDURE `sp_delete_work_schedule`(IN p_id         VARCHAR(36),
    IN p_company_id VARCHAR(36),
    IN p_session_id VARCHAR(36),
    IN p_changed_by VARCHAR(36),
    IN p_ip_address VARCHAR(45),
    IN p_user_agent VARCHAR(500))
BEGIN
    DECLARE v_name VARCHAR(150);

    SELECT name INTO v_name
    FROM work_schedules WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;

    UPDATE work_schedules SET is_deleted = 1
    WHERE id = p_id AND company_id = p_company_id;

    -- Unlink employees pointing to this schedule
    UPDATE employees SET work_schedule_id = NULL
    WHERE work_schedule_id = p_id AND company_id = p_company_id AND is_deleted = 0;

    -- Remove day definitions
    DELETE FROM work_schedule_days WHERE schedule_id = p_id;

    -- Soft-delete scope defaults
    UPDATE work_schedule_defaults SET is_deleted = 1
    WHERE schedule_id = p_id AND company_id = p_company_id;

    INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, old_value, ip_address, user_agent)
    VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'work_schedules', p_id, 'DELETE', 'name', v_name, p_ip_address, p_user_agent);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_delete_work_schedule_default
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_delete_work_schedule_default`;
delimiter ;;
CREATE PROCEDURE `sp_delete_work_schedule_default`(IN p_id         VARCHAR(36),
    IN p_company_id VARCHAR(36),
    IN p_session_id VARCHAR(36),
    IN p_changed_by VARCHAR(36),
    IN p_ip_address VARCHAR(45),
    IN p_user_agent VARCHAR(500))
BEGIN
    UPDATE work_schedule_defaults SET is_deleted = 1
    WHERE id = p_id AND company_id = p_company_id;

    INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, old_value, ip_address, user_agent)
    VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'work_schedule_defaults', p_id, 'DELETE', 'id', p_id, p_ip_address, p_user_agent);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_duplicate_coa_template
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_duplicate_coa_template`;
delimiter ;;
CREATE PROCEDURE `sp_duplicate_coa_template`(IN p_source_id CHAR(36),
    IN p_company_id CHAR(36),
    IN p_new_name VARCHAR(150))
BEGIN
    DECLARE v_id CHAR(36);
    SET v_id = UUID();

    INSERT INTO acc_coa_templates (id, company_id, name, country, currency, flag, description, is_global)
    SELECT v_id, p_company_id, p_new_name, country, currency, flag, description, 0
    FROM acc_coa_templates WHERE id = p_source_id;

    INSERT INTO acc_coa_template_items (id, template_id, code, name, account_type, account_subtype, normal_balance, is_system, sort_order)
    SELECT UUID(), v_id, code, name, account_type, account_subtype, normal_balance, is_system, sort_order
    FROM acc_coa_template_items WHERE template_id = p_source_id AND is_deleted = 0;

    SELECT id, company_id, name, country, currency, flag, description, is_global, created_at, updated_at
    FROM acc_coa_templates WHERE id = v_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_account
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_account`;
delimiter ;;
CREATE PROCEDURE `sp_get_account`(IN p_company_id CHAR(36), IN p_id CHAR(36))
BEGIN
    SELECT
        a.id, a.company_id, a.code, a.name,
        a.account_type, a.account_subtype,
        a.normal_balance, a.parent_id,
        p.name AS parent_name, p.code AS parent_code,
        a.description, a.is_active, a.is_system,
        a.currency, a.current_balance,
        a.created_at, a.updated_at
    FROM acc_accounts a
    LEFT JOIN acc_accounts p ON a.parent_id = p.id AND p.is_deleted = 0
    WHERE a.id = p_id
      AND a.company_id = p_company_id
      AND a.is_deleted = 0;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_accounts
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_accounts`;
delimiter ;;
CREATE PROCEDURE `sp_get_accounts`(IN p_company_id CHAR(36),
    IN p_account_type VARCHAR(20),
    IN p_active_only TINYINT(1))
BEGIN
    SELECT
        a.id, a.company_id, a.code, a.name,
        a.account_type, a.account_subtype,
        a.normal_balance, a.parent_id,
        p.name AS parent_name, p.code AS parent_code,
        a.description, a.is_active, a.is_system,
        a.currency, a.current_balance,
        a.created_at, a.updated_at
    FROM acc_accounts a
    LEFT JOIN acc_accounts p ON a.parent_id = p.id AND p.is_deleted = 0
    WHERE a.company_id = p_company_id
      AND a.is_deleted = 0
      AND (p_account_type = '' OR a.account_type = p_account_type)
      AND (p_active_only = 0 OR a.is_active = 1)
    ORDER BY a.code;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_account_mappings
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_account_mappings`;
delimiter ;;
CREATE PROCEDURE `sp_get_account_mappings`(IN p_company_id CHAR(36))
BEGIN
    SELECT m.*, a.code AS account_code, a.name AS account_name, a.account_type
    FROM acc_account_mappings m
    INNER JOIN acc_accounts a ON m.account_id = a.id
    WHERE m.company_id = p_company_id AND m.is_deleted = 0
    ORDER BY m.mapping_key;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_account_tree
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_account_tree`;
delimiter ;;
CREATE PROCEDURE `sp_get_account_tree`(IN p_company_id CHAR(36))
BEGIN
    SELECT
        a.id, a.code, a.name, a.account_type,
        a.account_subtype, a.normal_balance,
        a.parent_id, a.is_active, a.is_system,
        a.current_balance,
        (SELECT COUNT(*) FROM acc_accounts c
         WHERE c.parent_id = a.id AND c.is_deleted = 0) AS child_count
    FROM acc_accounts a
    WHERE a.company_id = p_company_id
      AND a.is_deleted = 0
    ORDER BY a.account_type, a.code;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_attendance
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_attendance`;
delimiter ;;
CREATE PROCEDURE `sp_get_attendance`(IN p_company_id VARCHAR(36),
    IN p_date_from  VARCHAR(10),
    IN p_date_to    VARCHAR(10))
BEGIN
    SELECT a.id, a.company_id, a.employee_id, a.date,
           a.clock_in, a.clock_out, a.hours_worked, a.overtime_hours,
           a.status, a.remarks, a.created_at, a.updated_at,
           e.first_name, e.last_name, e.department, e.position
    FROM attendance a
    JOIN employees e ON e.id = a.employee_id AND e.is_deleted = 0
    WHERE a.company_id = p_company_id
      AND a.date >= p_date_from
      AND a.date <= p_date_to
      AND a.is_deleted = 0
    ORDER BY a.date DESC, e.last_name, e.first_name;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_bank_accounts
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_bank_accounts`;
delimiter ;;
CREATE PROCEDURE `sp_get_bank_accounts`(IN p_company_id CHAR(36))
BEGIN
    SELECT id, code, name, current_balance FROM acc_accounts
    WHERE company_id = p_company_id AND is_active = 1
      AND (name LIKE '%Bank%' OR name LIKE '%Cash in Bank%' OR code IN ('1020','1010','1030'))
      AND COALESCE(account_subtype,'') != 'Header'
    ORDER BY code;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_bank_transactions
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_bank_transactions`;
delimiter ;;
CREATE PROCEDURE `sp_get_bank_transactions`(IN p_company_id CHAR(36), IN p_account_id CHAR(36), IN p_reconciled TINYINT)
BEGIN
    SELECT * FROM bank_transactions
    WHERE company_id = p_company_id AND account_id = p_account_id AND is_deleted = 0
      AND (p_reconciled = -1 OR is_reconciled = p_reconciled)
    ORDER BY txn_date DESC, created_at DESC;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_benefits
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_benefits`;
delimiter ;;
CREATE PROCEDURE `sp_get_benefits`(IN p_company_id VARCHAR(36))
BEGIN
    -- Result set 1: benefits
    SELECT id, company_id, type, name, provider, status, coverage,
           frequency, enrolled, eligibility, description, sort_order,
           created_at, updated_at
    FROM benefits
    WHERE company_id = p_company_id AND is_deleted = 0
    ORDER BY sort_order, created_at;

    -- Result set 2: tiers for all active benefits
    SELECT t.id, t.benefit_id, t.name, t.employer_cost, t.employee_cost, t.sort_order
    FROM benefit_tiers t
    INNER JOIN benefits b ON b.id = t.benefit_id
    WHERE b.company_id = p_company_id AND b.is_deleted = 0 AND t.is_deleted = 0
    ORDER BY t.benefit_id, t.sort_order;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_bill
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_bill`;
delimiter ;;
CREATE PROCEDURE `sp_get_bill`(IN p_id CHAR(36),
    IN p_company_id CHAR(36))
BEGIN
    SELECT b.*, v.name AS vendor_name, v.tin AS vendor_tin
    FROM ap_bills b
    INNER JOIN ap_vendors v ON v.id = b.vendor_id
    WHERE b.id = p_id AND b.company_id = p_company_id AND b.is_deleted = 0;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_bills
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_bills`;
delimiter ;;
CREATE PROCEDURE `sp_get_bills`(IN p_company_id CHAR(36),
    IN p_status VARCHAR(20),
    IN p_vendor_id CHAR(36),
    IN p_date_from DATE,
    IN p_date_to DATE)
BEGIN
    SELECT b.*, v.name AS vendor_name, v.tin AS vendor_tin,
        (SELECT COUNT(*) FROM ap_bill_items WHERE bill_id = b.id) AS item_count,
        (SELECT COUNT(*) FROM ap_bill_payments WHERE bill_id = b.id AND is_deleted = 0) AS payment_count
    FROM ap_bills b
    INNER JOIN ap_vendors v ON v.id = b.vendor_id
    WHERE b.company_id = p_company_id AND b.is_deleted = 0
      AND (p_status = '' OR b.status = p_status)
      AND (p_vendor_id = '' OR b.vendor_id = p_vendor_id)
      AND (p_date_from IS NULL OR b.bill_date >= p_date_from)
      AND (p_date_to IS NULL OR b.bill_date <= p_date_to)
    ORDER BY b.bill_date DESC, b.created_at DESC;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_bill_items
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_bill_items`;
delimiter ;;
CREATE PROCEDURE `sp_get_bill_items`(IN p_bill_id CHAR(36), IN p_company_id CHAR(36))
BEGIN
    SELECT bi.*, a.code AS account_code, a.name AS account_name
    FROM ap_bill_items bi
    INNER JOIN ap_bills b ON b.id = bi.bill_id
    INNER JOIN acc_accounts a ON a.id = bi.account_id
    WHERE bi.bill_id = p_bill_id AND b.company_id = p_company_id
    ORDER BY bi.sort_order;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_bill_payments
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_bill_payments`;
delimiter ;;
CREATE PROCEDURE `sp_get_bill_payments`(IN p_bill_id CHAR(36), IN p_company_id CHAR(36))
BEGIN
    SELECT bp.*, a.code AS account_code, a.name AS account_name
    FROM ap_bill_payments bp
    INNER JOIN ap_bills b ON b.id = bp.bill_id
    LEFT JOIN acc_accounts a ON a.id = bp.account_id
    WHERE bp.bill_id = p_bill_id AND b.company_id = p_company_id AND bp.is_deleted = 0
    ORDER BY bp.payment_date;
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
-- Procedure structure for sp_get_coa_template
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_coa_template`;
delimiter ;;
CREATE PROCEDURE `sp_get_coa_template`(IN p_id CHAR(36))
BEGIN
    SELECT id, company_id, name, country, currency, flag, description, is_global, created_at, updated_at
    FROM acc_coa_templates WHERE id = p_id AND is_deleted = 0;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_coa_templates
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_coa_templates`;
delimiter ;;
CREATE PROCEDURE `sp_get_coa_templates`(IN p_company_id CHAR(36))
BEGIN
    SELECT
        t.id, t.company_id, t.name, t.country, t.currency, t.flag,
        t.description, t.is_global, t.created_at, t.updated_at,
        (SELECT COUNT(*) FROM acc_coa_template_items i WHERE i.template_id = t.id AND i.is_deleted = 0) AS item_count
    FROM acc_coa_templates t
    WHERE t.is_deleted = 0
      AND (t.is_global = 1 OR t.company_id = p_company_id)
    ORDER BY t.is_global DESC, t.name;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_coa_template_items
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_coa_template_items`;
delimiter ;;
CREATE PROCEDURE `sp_get_coa_template_items`(IN p_template_id CHAR(36))
BEGIN
    SELECT id, template_id, code, name, account_type, account_subtype, normal_balance, is_system, sort_order
    FROM acc_coa_template_items
    WHERE template_id = p_template_id AND is_deleted = 0
    ORDER BY sort_order, code;
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
-- Procedure structure for sp_get_compliance_agencies
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_compliance_agencies`;
delimiter ;;
CREATE PROCEDURE `sp_get_compliance_agencies`(IN p_company_id VARCHAR(36))
BEGIN
    -- Agencies
    SELECT id, name, full_name, color, frequency, website, status, due_date, last_filed, sort_order
    FROM compliance_agencies
    WHERE company_id = p_company_id AND is_deleted = 0
    ORDER BY sort_order;

    -- Fields
    SELECT f.id, f.agency_id, f.field_key, f.label, f.field_type, f.sort_order
    FROM compliance_fields f
    JOIN compliance_agencies a ON f.agency_id = a.id
    WHERE a.company_id = p_company_id AND a.is_deleted = 0
    ORDER BY f.agency_id, f.sort_order;

    -- Latest values per field
    SELECT v.field_id, v.period, v.value_encrypted
    FROM compliance_values v
    JOIN compliance_fields f ON v.field_id = f.id
    JOIN compliance_agencies a ON f.agency_id = a.id
    WHERE a.company_id = p_company_id AND a.is_deleted = 0
    ORDER BY v.field_id, v.period DESC;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_compliance_templates
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_compliance_templates`;
delimiter ;;
CREATE PROCEDURE `sp_get_compliance_templates`()
BEGIN
    SELECT t.id, t.code, t.name, t.currency_code,
           COALESCE(c.symbol, '') AS currency_symbol,
           COALESCE(c.name, '')   AS currency_name,
           t.sort_order
    FROM compliance_templates t
    LEFT JOIN currencies c ON t.currency_code = c.code
    WHERE t.is_active = 1
    ORDER BY t.sort_order;

    SELECT a.id, a.template_id, a.name, a.full_name, a.color, a.frequency, a.website, a.sort_order
    FROM compliance_template_agencies a
    JOIN compliance_templates t ON a.template_id = t.id
    WHERE t.is_active = 1
    ORDER BY a.template_id, a.sort_order;

    SELECT f.id, f.agency_id, f.field_key, f.label, f.field_type, f.sort_order
    FROM compliance_template_fields f
    JOIN compliance_template_agencies a ON f.agency_id = a.id
    JOIN compliance_templates t ON a.template_id = t.id
    WHERE t.is_active = 1
    ORDER BY f.agency_id, f.sort_order;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_currencies
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_currencies`;
delimiter ;;
CREATE PROCEDURE `sp_get_currencies`()
BEGIN
    SELECT code, name, symbol, decimal_places
    FROM currencies
    WHERE is_active = 1
    ORDER BY sort_order;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_customer
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_customer`;
delimiter ;;
CREATE PROCEDURE `sp_get_customer`(IN p_id CHAR(36), IN p_company_id CHAR(36))
BEGIN SELECT * FROM ar_customers WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0; END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_customers
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_customers`;
delimiter ;;
CREATE PROCEDURE `sp_get_customers`(IN p_company_id CHAR(36), IN p_active_only TINYINT)
BEGIN SELECT * FROM ar_customers WHERE company_id = p_company_id AND is_deleted = 0 AND (p_active_only = 0 OR is_active = 1) ORDER BY name; END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_departments
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_departments`;
delimiter ;;
CREATE PROCEDURE `sp_get_departments`(IN p_company_id VARCHAR(36))
BEGIN
    SELECT d.id, d.company_id, d.name, d.color, d.description,
           d.sort_order, d.created_at, d.updated_at,
           COUNT(e.id) AS employee_count
    FROM departments d
    LEFT JOIN employees e ON e.department = d.name AND e.company_id = d.company_id AND e.is_deleted = 0
    WHERE d.company_id = p_company_id AND d.is_deleted = 0
    GROUP BY d.id
    ORDER BY d.sort_order, d.name;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_employee
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_employee`;
delimiter ;;
CREATE PROCEDURE `sp_get_employee`(IN p_id         VARCHAR(36),
                                   IN p_company_id VARCHAR(36))
BEGIN
    SELECT e.id, e.company_id, e.first_name, e.last_name, e.middle_name,
           e.department, e.position, e.joined_date, e.employment_type, e.status,
           e.email_enc, e.phone_enc, e.birthday_enc, e.address_enc,
           e.basic_salary_enc, e.sss_no_enc, e.philhealth_no_enc,
           e.pagibig_no_enc, e.tin_enc, e.bank_name_enc, e.bank_account_enc,
           e.enrolled_benefits, e.work_schedule_id,
           e.created_at, e.updated_at,
           e.user_id,
           u.email          AS account_email,
           u.username       AS account_username,
           u.is_active      AS account_active,
           u.last_login_at  AS account_last_login_at,
           ws.name  AS schedule_name,
           ws.type  AS schedule_type,
           ws.color AS schedule_color
    FROM employees e
    LEFT JOIN users          u  ON u.id  = e.user_id
    LEFT JOIN work_schedules ws ON ws.id = e.work_schedule_id AND ws.is_deleted = 0
    WHERE e.id = p_id AND e.company_id = p_company_id AND e.is_deleted = 0;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_employees
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_employees`;
delimiter ;;
CREATE PROCEDURE `sp_get_employees`(IN p_company_id VARCHAR(36))
BEGIN
    SELECT e.id, e.company_id, e.first_name, e.last_name, e.middle_name,
           e.department, e.position, e.joined_date, e.employment_type, e.status,
           e.enrolled_benefits, e.work_schedule_id,
           e.created_at, e.updated_at,
           e.user_id,
           u.username  AS account_username,
           u.is_active AS account_active,
           ws.name  AS schedule_name,
           ws.type  AS schedule_type,
           ws.color AS schedule_color
    FROM employees e
    LEFT JOIN users          u  ON u.id  = e.user_id
    LEFT JOIN work_schedules ws ON ws.id = e.work_schedule_id AND ws.is_deleted = 0
    WHERE e.company_id = p_company_id AND e.is_deleted = 0
    ORDER BY e.last_name, e.first_name;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_invoice
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_invoice`;
delimiter ;;
CREATE PROCEDURE `sp_get_invoice`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN SELECT i.*, c.name AS customer_name, c.tin AS customer_tin FROM ar_invoices i INNER JOIN ar_customers c ON c.id=i.customer_id WHERE i.id=p_id AND i.company_id=p_cid AND i.is_deleted=0; END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_invoices
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_invoices`;
delimiter ;;
CREATE PROCEDURE `sp_get_invoices`(IN p_cid CHAR(36), IN p_status VARCHAR(20), IN p_custid CHAR(36), IN p_from DATE, IN p_to DATE)
BEGIN
  SELECT i.*, c.name AS customer_name, c.tin AS customer_tin,
    (SELECT COUNT(*) FROM ar_invoice_items WHERE invoice_id=i.id) AS item_count,
    (SELECT COUNT(*) FROM ar_invoice_payments WHERE invoice_id=i.id AND is_deleted=0) AS payment_count
  FROM ar_invoices i INNER JOIN ar_customers c ON c.id=i.customer_id
  WHERE i.company_id=p_cid AND i.is_deleted=0
    AND (p_status='' OR i.status=p_status) AND (p_custid='' OR i.customer_id=p_custid)
    AND (p_from IS NULL OR i.invoice_date>=p_from) AND (p_to IS NULL OR i.invoice_date<=p_to)
  ORDER BY i.invoice_date DESC;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_invoice_items
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_invoice_items`;
delimiter ;;
CREATE PROCEDURE `sp_get_invoice_items`(IN p_iid CHAR(36), IN p_cid CHAR(36))
BEGIN SELECT ii.*, a.code AS account_code, a.name AS account_name FROM ar_invoice_items ii INNER JOIN ar_invoices inv ON inv.id=ii.invoice_id INNER JOIN acc_accounts a ON a.id=ii.account_id WHERE ii.invoice_id=p_iid AND inv.company_id=p_cid ORDER BY ii.sort_order; END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_invoice_payments
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_invoice_payments`;
delimiter ;;
CREATE PROCEDURE `sp_get_invoice_payments`(IN p_iid CHAR(36), IN p_cid CHAR(36))
BEGIN SELECT ip.*, a.code AS account_code, a.name AS account_name FROM ar_invoice_payments ip INNER JOIN ar_invoices inv ON inv.id=ip.invoice_id LEFT JOIN acc_accounts a ON a.id=ip.account_id WHERE ip.invoice_id=p_iid AND inv.company_id=p_cid AND ip.is_deleted=0 ORDER BY ip.payment_date; END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_journal_entries
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_journal_entries`;
delimiter ;;
CREATE PROCEDURE `sp_get_journal_entries`(IN p_company_id CHAR(36),
    IN p_status VARCHAR(10),
    IN p_source_type VARCHAR(30),
    IN p_date_from DATE,
    IN p_date_to DATE,
    IN p_limit INT,
    IN p_offset INT)
BEGIN
    SELECT je.*,
        (SELECT COUNT(*) FROM acc_journal_lines WHERE entry_id = je.id) AS line_count
    FROM acc_journal_entries je
    WHERE je.company_id = p_company_id
      AND je.is_deleted = 0
      AND (p_status = '' OR je.status = p_status)
      AND (p_source_type = '' OR je.source_type = p_source_type)
      AND (p_date_from IS NULL OR je.entry_date >= p_date_from)
      AND (p_date_to IS NULL OR je.entry_date <= p_date_to)
    ORDER BY je.entry_number DESC
    LIMIT p_limit OFFSET p_offset;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_journal_entry
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_journal_entry`;
delimiter ;;
CREATE PROCEDURE `sp_get_journal_entry`(IN p_id CHAR(36),
    IN p_company_id CHAR(36))
BEGIN
    SELECT * FROM acc_journal_entries
    WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_journal_lines
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_journal_lines`;
delimiter ;;
CREATE PROCEDURE `sp_get_journal_lines`(IN p_entry_id CHAR(36), IN p_company_id CHAR(36))
BEGIN
    SELECT jl.*, a.code AS account_code, a.name AS account_name, a.account_type
    FROM acc_journal_lines jl
    INNER JOIN acc_journal_entries je ON je.id = jl.entry_id
    INNER JOIN acc_accounts a ON jl.account_id = a.id
    WHERE jl.entry_id = p_entry_id AND je.company_id = p_company_id
    ORDER BY jl.sort_order, jl.debit DESC;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_leaves
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_leaves`;
delimiter ;;
CREATE PROCEDURE `sp_get_leaves`(IN p_company_id VARCHAR(36),
    IN p_status     VARCHAR(20),
    IN p_date_from  VARCHAR(10),
    IN p_date_to    VARCHAR(10))
BEGIN
    SELECT l.id, l.company_id, l.employee_id, l.leave_type,
           l.start_date, l.end_date, l.days, l.reason,
           l.status, l.approved_by, l.approved_at, l.rejection_note,
           l.created_at, l.updated_at,
           e.first_name, e.last_name, e.department, e.position
    FROM leaves l
    JOIN employees e ON e.id = l.employee_id AND e.is_deleted = 0
    WHERE l.company_id = p_company_id
      AND l.is_deleted = 0
      AND (p_status = '' OR l.status = p_status)
      AND (p_date_from = '' OR l.start_date >= p_date_from)
      AND (p_date_to = '' OR l.end_date <= p_date_to)
    ORDER BY
        CASE l.status WHEN 'Pending' THEN 0 WHEN 'Approved' THEN 1 WHEN 'Rejected' THEN 2 WHEN 'Cancelled' THEN 3 ELSE 4 END,
        l.start_date DESC;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_loan
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_loan`;
delimiter ;;
CREATE PROCEDURE `sp_get_loan`(IN p_company_id CHAR(36), IN p_id CHAR(36))
BEGIN
    SELECT l.*,
        e.first_name, e.last_name, e.department, e.position
    FROM loans l
    LEFT JOIN employees e ON e.id = l.employee_id
    WHERE l.id = p_id AND l.company_id = p_company_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_loans
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_loans`;
delimiter ;;
CREATE PROCEDURE `sp_get_loans`(IN p_company_id CHAR(36), IN p_status VARCHAR(20))
BEGIN
    SELECT l.*,
        e.first_name, e.last_name, e.department, e.position
    FROM loans l
    LEFT JOIN employees e ON e.id = l.employee_id
    WHERE l.company_id = p_company_id AND l.is_deleted = 0
        AND (p_status = '' OR l.status = p_status)
    ORDER BY
        CASE l.status
            WHEN 'Pending' THEN 1
            WHEN 'Approved' THEN 2
            WHEN 'Active' THEN 3
            WHEN 'Paid' THEN 4
            WHEN 'Rejected' THEN 5
            WHEN 'Cancelled' THEN 6
        END,
        l.applied_date DESC;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_loan_payments
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_loan_payments`;
delimiter ;;
CREATE PROCEDURE `sp_get_loan_payments`(IN p_company_id CHAR(36), IN p_loan_id CHAR(36))
BEGIN
    SELECT * FROM loan_payments WHERE loan_id = p_loan_id AND company_id = p_company_id AND is_deleted = 0 ORDER BY payment_date DESC;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_loan_types
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_loan_types`;
delimiter ;;
CREATE PROCEDURE `sp_get_loan_types`(IN p_company_id CHAR(36))
BEGIN
    SELECT lt.*,
        (SELECT COUNT(*) FROM loans l WHERE l.loan_type_id = lt.id AND l.is_deleted = 0 AND l.status IN ('Active','Approved')) AS active_loans
    FROM loan_types lt
    WHERE lt.company_id = p_company_id AND lt.is_deleted = 0
    ORDER BY lt.name;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_onboarding_checklist
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_onboarding_checklist`;
delimiter ;;
CREATE PROCEDURE `sp_get_onboarding_checklist`(IN p_id VARCHAR(36), IN p_company_id VARCHAR(36))
BEGIN
    SELECT c.id, c.company_id, c.employee_id, c.template_id,
           c.status, c.start_date, c.target_date, c.completed_date,
           c.progress, c.notes, c.created_at, c.updated_at,
           e.first_name, e.last_name, e.department, e.position
    FROM onboarding_checklists c
    JOIN employees e ON e.id = c.employee_id
    WHERE c.id = p_id AND c.company_id = p_company_id AND c.is_deleted = 0;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_onboarding_checklists
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_onboarding_checklists`;
delimiter ;;
CREATE PROCEDURE `sp_get_onboarding_checklists`(IN p_company_id VARCHAR(36),
    IN p_status     VARCHAR(20))
BEGIN
    SELECT c.id, c.company_id, c.employee_id, c.template_id,
           c.status, c.start_date, c.target_date, c.completed_date,
           c.progress, c.notes, c.created_at, c.updated_at,
           e.first_name, e.last_name, e.department, e.position,
           (SELECT COUNT(*) FROM onboarding_items i WHERE i.checklist_id = c.id AND i.is_deleted = 0) AS total_items,
           (SELECT COUNT(*) FROM onboarding_items i WHERE i.checklist_id = c.id AND i.is_deleted = 0 AND i.completed = 1) AS completed_items
    FROM onboarding_checklists c
    JOIN employees e ON e.id = c.employee_id
    WHERE c.company_id = p_company_id AND c.is_deleted = 0
      AND (p_status = '' OR c.status = p_status)
    ORDER BY
        CASE c.status WHEN 'In Progress' THEN 0 WHEN 'Completed' THEN 1 WHEN 'Cancelled' THEN 2 END,
        c.start_date DESC;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_onboarding_items
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_onboarding_items`;
delimiter ;;
CREATE PROCEDURE `sp_get_onboarding_items`(IN p_checklist_id VARCHAR(36))
BEGIN
    SELECT id, checklist_id, company_id, title, category, required, completed, completed_at, sort_order, notes
    FROM onboarding_items
    WHERE checklist_id = p_checklist_id AND is_deleted = 0
    ORDER BY sort_order, title;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_onboarding_templates
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_onboarding_templates`;
delimiter ;;
CREATE PROCEDURE `sp_get_onboarding_templates`(IN p_company_id VARCHAR(36))
BEGIN
    SELECT t.id, t.company_id, t.name, t.description, t.category,
           t.is_default, t.sort_order, t.created_at, t.updated_at,
           (SELECT COUNT(*) FROM onboarding_template_items ti WHERE ti.template_id = t.id AND ti.is_deleted = 0) AS item_count
    FROM onboarding_templates t
    WHERE t.company_id = p_company_id AND t.is_deleted = 0
    ORDER BY t.is_default DESC, t.sort_order, t.name;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_payroll_items
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_payroll_items`;
delimiter ;;
CREATE PROCEDURE `sp_get_payroll_items`(IN p_run_id VARCHAR(36), IN p_company_id VARCHAR(36))
BEGIN
    SELECT
        pi.id, pi.run_id, pi.company_id, pi.employee_id,
        pi.basic_pay, pi.days_worked, pi.hours_worked,
        pi.ot_hours, pi.ot_pay, pi.holiday_pay, pi.night_diff,
        pi.allowances, pi.other_earnings, pi.gross_pay,
        pi.sss_ee, pi.sss_er, pi.philhealth_ee, pi.philhealth_er,
        pi.pagibig_ee, pi.pagibig_er, pi.withholding_tax,
        pi.benefit_deductions, pi.loan_deductions, pi.other_deductions,
        pi.total_deductions, pi.net_pay,
        pi.created_at, pi.updated_at,
        e.first_name, e.last_name,
        e.department,
        e.position,
        pi.work_schedule_name,
        pi.hours_per_day,
        pi.working_days_per_month,
        pi.ot_multiplier_used
    FROM payroll_items pi
    JOIN employees e ON e.id = pi.employee_id
    WHERE pi.run_id = p_run_id
      AND pi.company_id = p_company_id
    ORDER BY e.last_name, e.first_name;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_payroll_run
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_payroll_run`;
delimiter ;;
CREATE PROCEDURE `sp_get_payroll_run`(IN p_id         VARCHAR(36),
    IN p_company_id VARCHAR(36))
BEGIN
    SELECT id, company_id, period_start, period_end, pay_date,
           status, total_gross, total_deductions, total_net,
           employee_count, notes, approved_by, approved_at,
           created_at, updated_at
    FROM payroll_runs
    WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_payroll_runs
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_payroll_runs`;
delimiter ;;
CREATE PROCEDURE `sp_get_payroll_runs`(IN p_company_id VARCHAR(36))
BEGIN
    SELECT id, company_id, period_start, period_end, pay_date,
           status, total_gross, total_deductions, total_net,
           employee_count, notes, approved_by, approved_at,
           created_at, updated_at
    FROM payroll_runs
    WHERE company_id = p_company_id AND is_deleted = 0
    ORDER BY period_start DESC;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_payroll_run_totals
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_payroll_run_totals`;
delimiter ;;
CREATE PROCEDURE `sp_get_payroll_run_totals`(IN p_run_id CHAR(36),
    IN p_company_id CHAR(36))
BEGIN
    SELECT
        SUM(basic_pay + ot_pay + holiday_pay + night_diff + allowances + other_earnings) AS total_gross,
        SUM(basic_pay) AS total_basic,
        SUM(ot_pay) AS total_ot,
        SUM(holiday_pay) AS total_holiday,
        SUM(night_diff) AS total_night_diff,
        SUM(allowances) AS total_allowances,
        SUM(other_earnings) AS total_other_earnings,
        SUM(sss_ee) AS total_sss_ee,
        SUM(sss_er) AS total_sss_er,
        SUM(philhealth_ee) AS total_philhealth_ee,
        SUM(philhealth_er) AS total_philhealth_er,
        SUM(pagibig_ee) AS total_pagibig_ee,
        SUM(pagibig_er) AS total_pagibig_er,
        SUM(withholding_tax) AS total_tax,
        SUM(benefit_deductions) AS total_benefit_deductions,
        SUM(loan_deductions) AS total_loan_deductions,
        SUM(other_deductions) AS total_other_deductions,
        SUM(net_pay) AS total_net_pay,
        COUNT(*) AS employee_count
    FROM payroll_items
    WHERE run_id = p_run_id AND company_id = p_company_id AND is_deleted = 0;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_payroll_settings
-- ----------------------------
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

-- ----------------------------
-- Procedure structure for sp_get_positions
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_positions`;
delimiter ;;
CREATE PROCEDURE `sp_get_positions`(IN p_company_id VARCHAR(36))
BEGIN
    SELECT p.id, p.company_id, p.name, p.department, p.level, p.description,
           p.sort_order, p.created_at, p.updated_at,
           COUNT(e.id) AS employee_count
    FROM positions p
    LEFT JOIN employees e ON e.position = p.name AND e.company_id = p.company_id AND e.is_deleted = 0
    WHERE p.company_id = p_company_id AND p.is_deleted = 0
    GROUP BY p.id
    ORDER BY p.department, p.sort_order, p.name;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_schedule_roster
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_schedule_roster`;
delimiter ;;
CREATE PROCEDURE `sp_get_schedule_roster`(IN p_company_id VARCHAR(36),
    IN p_date       DATE)
BEGIN
    DECLARE v_dow TINYINT;
    SET v_dow = DAYOFWEEK(p_date) - 1; -- 0=Sun

    SELECT
        e.id AS employee_id, e.first_name, e.last_name,
        e.department, e.position, e.employment_type,
        -- Resolved schedule id: employee → position → department → company default
        COALESCE(
            e.work_schedule_id,
            pos_d.schedule_id,
            dept_d.schedule_id,
            co_def.id
        ) AS schedule_id,
        CASE
            WHEN e.work_schedule_id IS NOT NULL THEN 'employee'
            WHEN pos_d.schedule_id IS NOT NULL THEN 'position'
            WHEN dept_d.schedule_id IS NOT NULL THEN 'department'
            WHEN co_def.id IS NOT NULL THEN 'company_default'
            ELSE 'none'
        END AS resolved_from,
        ws.name AS schedule_name, ws.color AS schedule_color,
        wsd.start_time, wsd.end_time, wsd.break_minutes, wsd.is_rest_day
    FROM employees e
    -- Position default
    LEFT JOIN work_schedule_defaults pos_d
        ON pos_d.company_id = p_company_id AND pos_d.scope = 'position'
        AND pos_d.scope_value = e.position AND pos_d.is_deleted = 0
        AND e.work_schedule_id IS NULL
    -- Department default
    LEFT JOIN work_schedule_defaults dept_d
        ON dept_d.company_id = p_company_id AND dept_d.scope = 'department'
        AND dept_d.scope_value = e.department AND dept_d.is_deleted = 0
        AND e.work_schedule_id IS NULL AND pos_d.schedule_id IS NULL
    -- Company default
    LEFT JOIN work_schedules co_def
        ON co_def.company_id = p_company_id AND co_def.is_default = 1 AND co_def.is_deleted = 0
        AND e.work_schedule_id IS NULL AND pos_d.schedule_id IS NULL AND dept_d.schedule_id IS NULL
    -- Resolved schedule details
    LEFT JOIN work_schedules ws ON ws.id = COALESCE(
        e.work_schedule_id, pos_d.schedule_id, dept_d.schedule_id, co_def.id
    ) AND ws.is_deleted = 0
    -- Day info for the requested date
    LEFT JOIN work_schedule_days wsd ON wsd.schedule_id = ws.id AND wsd.day_of_week = v_dow
    WHERE e.company_id = p_company_id AND e.is_deleted = 0 AND e.status = 'Active'
    ORDER BY wsd.is_rest_day, wsd.start_time, e.last_name, e.first_name;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_template_items
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_template_items`;
delimiter ;;
CREATE PROCEDURE `sp_get_template_items`(IN p_template_id VARCHAR(36))
BEGIN
    SELECT id, template_id, company_id, title, category, required, sort_order
    FROM onboarding_template_items
    WHERE template_id = p_template_id AND is_deleted = 0
    ORDER BY sort_order, title;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_ticket
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_ticket`;
delimiter ;;
CREATE PROCEDURE `sp_get_ticket`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT t.*,
        c.name AS category_name, c.color AS category_color, c.icon AS category_icon, c.sla_hours,
        CONCAT(e1.first_name, ' ', e1.last_name) AS created_by_name,
        CONCAT(e2.first_name, ' ', e2.last_name) AS assigned_to_name,
        CASE WHEN t.status NOT IN ('Resolved','Closed') AND t.due_date IS NOT NULL AND NOW() > t.due_date THEN 1 ELSE 0 END AS is_overdue
    FROM tk_tickets t
    LEFT JOIN tk_categories c ON c.id = t.category_id
    LEFT JOIN employees e1 ON e1.id = t.created_by
    LEFT JOIN employees e2 ON e2.id = t.assigned_to
    WHERE t.id = p_id AND t.company_id = p_cid AND t.is_deleted = 0;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_tickets
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_tickets`;
delimiter ;;
CREATE PROCEDURE `sp_get_tickets`(IN p_cid CHAR(36), IN p_status VARCHAR(20), IN p_priority VARCHAR(10), IN p_catid CHAR(36), IN p_assigned CHAR(36), IN p_created CHAR(36))
BEGIN
    SELECT t.*,
        c.name AS category_name, c.color AS category_color, c.icon AS category_icon,
        CONCAT(e1.first_name, ' ', e1.last_name) AS created_by_name,
        CONCAT(e2.first_name, ' ', e2.last_name) AS assigned_to_name,
        (SELECT COUNT(*) FROM tk_comments WHERE ticket_id = t.id AND is_deleted = 0) AS comment_count,
        CASE
            WHEN t.status IN ('Resolved','Closed') THEN 0
            WHEN t.due_date IS NOT NULL AND NOW() > t.due_date THEN 1
            ELSE 0
        END AS is_overdue
    FROM tk_tickets t
    LEFT JOIN tk_categories c ON c.id = t.category_id
    LEFT JOIN employees e1 ON e1.id = t.created_by
    LEFT JOIN employees e2 ON e2.id = t.assigned_to
    WHERE t.company_id = p_cid AND t.is_deleted = 0
      AND (p_status = '' OR t.status = p_status)
      AND (p_priority = '' OR t.priority = p_priority)
      AND (p_catid = '' OR t.category_id = p_catid)
      AND (p_assigned = '' OR t.assigned_to = p_assigned)
      AND (p_created = '' OR t.created_by = p_created)
    ORDER BY
        FIELD(t.priority, 'Urgent','High','Medium','Low'),
        FIELD(t.status, 'Open','In Progress','On Hold','Resolved','Closed'),
        t.created_at DESC;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_ticket_categories
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_ticket_categories`;
delimiter ;;
CREATE PROCEDURE `sp_get_ticket_categories`(IN p_cid CHAR(36))
BEGIN
    SELECT * FROM tk_categories WHERE company_id = p_cid AND is_deleted = 0 ORDER BY sort_order, name;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_ticket_comments
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_ticket_comments`;
delimiter ;;
CREATE PROCEDURE `sp_get_ticket_comments`(IN p_ticket_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT tc.*,
        CONCAT(e.first_name, ' ', e.last_name) AS author_name
    FROM tk_comments tc
    INNER JOIN tk_tickets t ON t.id = tc.ticket_id AND t.company_id = p_cid AND t.is_deleted = 0
    LEFT JOIN employees e ON e.id = tc.author_id
    WHERE tc.ticket_id = p_ticket_id AND tc.is_deleted = 0
    ORDER BY tc.created_at ASC;
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
-- Procedure structure for sp_get_vendor
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_vendor`;
delimiter ;;
CREATE PROCEDURE `sp_get_vendor`(IN p_id CHAR(36),
    IN p_company_id CHAR(36))
BEGIN
    SELECT * FROM ap_vendors WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_vendors
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_vendors`;
delimiter ;;
CREATE PROCEDURE `sp_get_vendors`(IN p_company_id CHAR(36),
    IN p_active_only TINYINT)
BEGIN
    SELECT * FROM ap_vendors
    WHERE company_id = p_company_id AND is_deleted = 0
      AND (p_active_only = 0 OR is_active = 1)
    ORDER BY name;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_work_schedule
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_work_schedule`;
delimiter ;;
CREATE PROCEDURE `sp_get_work_schedule`(IN p_id         VARCHAR(36),
    IN p_company_id VARCHAR(36))
BEGIN
    SELECT id, company_id, name, type, description, color, is_default,
           created_at, updated_at
    FROM work_schedules
    WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_work_schedules
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_work_schedules`;
delimiter ;;
CREATE PROCEDURE `sp_get_work_schedules`(IN p_company_id VARCHAR(36))
BEGIN
    SELECT ws.id, ws.company_id, ws.name, ws.type, ws.description,
           ws.color, ws.is_default, ws.created_at, ws.updated_at,
           (SELECT COUNT(*) FROM employees e
            WHERE e.work_schedule_id = ws.id AND e.is_deleted = 0) AS employee_count,
           (SELECT COUNT(*) FROM work_schedule_defaults wsd
            WHERE wsd.schedule_id = ws.id AND wsd.scope = 'department' AND wsd.is_deleted = 0) AS department_count,
           (SELECT COUNT(*) FROM work_schedule_defaults wsd
            WHERE wsd.schedule_id = ws.id AND wsd.scope = 'position' AND wsd.is_deleted = 0) AS position_count
    FROM work_schedules ws
    WHERE ws.company_id = p_company_id AND ws.is_deleted = 0
    ORDER BY ws.is_default DESC, ws.name;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_work_schedule_days
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_work_schedule_days`;
delimiter ;;
CREATE PROCEDURE `sp_get_work_schedule_days`(IN p_schedule_id VARCHAR(36))
BEGIN
    SELECT id, schedule_id, day_of_week, start_time, end_time,
           break_minutes, is_rest_day, created_at, updated_at
    FROM work_schedule_days
    WHERE schedule_id = p_schedule_id
    ORDER BY day_of_week;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_work_schedule_defaults
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_work_schedule_defaults`;
delimiter ;;
CREATE PROCEDURE `sp_get_work_schedule_defaults`(IN p_company_id VARCHAR(36))
BEGIN
    SELECT wsd.id, wsd.company_id, wsd.schedule_id, wsd.scope, wsd.scope_value,
           wsd.created_at, wsd.updated_at,
           ws.name AS schedule_name, ws.type AS schedule_type, ws.color AS schedule_color
    FROM work_schedule_defaults wsd
    INNER JOIN work_schedules ws ON ws.id = wsd.schedule_id AND ws.is_deleted = 0
    WHERE wsd.company_id = p_company_id AND wsd.is_deleted = 0
    ORDER BY wsd.scope, wsd.scope_value;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_get_work_schedule_defaults_by_schedule
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_get_work_schedule_defaults_by_schedule`;
delimiter ;;
CREATE PROCEDURE `sp_get_work_schedule_defaults_by_schedule`(IN p_schedule_id VARCHAR(36),
    IN p_company_id  VARCHAR(36))
BEGIN
    SELECT id, company_id, schedule_id, scope, scope_value,
           created_at, updated_at
    FROM work_schedule_defaults
    WHERE schedule_id = p_schedule_id AND company_id = p_company_id AND is_deleted = 0
    ORDER BY scope, scope_value;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_income_statement
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_income_statement`;
delimiter ;;
CREATE PROCEDURE `sp_income_statement`(IN p_cid CHAR(36), IN p_from DATE, IN p_to DATE)
BEGIN
    SELECT a.id, a.code, a.name, a.account_type, a.account_subtype, a.normal_balance,
        COALESCE(SUM(jl.debit), 0) AS total_debit,
        COALESCE(SUM(jl.credit), 0) AS total_credit,
        CASE WHEN a.normal_balance='Credit' THEN COALESCE(SUM(jl.credit - jl.debit), 0) ELSE COALESCE(SUM(jl.debit - jl.credit), 0) END AS net_balance
    FROM acc_accounts a
    LEFT JOIN acc_journal_lines jl ON jl.account_id = a.id
        AND jl.entry_id IN (SELECT id FROM acc_journal_entries WHERE company_id=p_cid AND status='Posted' AND is_deleted=0
            AND (p_from IS NULL OR entry_date>=p_from) AND (p_to IS NULL OR entry_date<=p_to))
    WHERE a.company_id = p_cid AND a.is_active = 1 AND a.account_type IN ('Revenue','Expense') AND COALESCE(a.account_subtype,'') != 'Header'
    GROUP BY a.id, a.code, a.name, a.account_type, a.account_subtype, a.normal_balance
    HAVING net_balance != 0
    ORDER BY a.account_type DESC, a.code;
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
-- Procedure structure for sp_ledger_period_summary
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_ledger_period_summary`;
delimiter ;;
CREATE PROCEDURE `sp_ledger_period_summary`(IN p_company_id CHAR(36),
    IN p_date_from DATE,
    IN p_date_to DATE)
BEGIN
    SELECT
        COUNT(DISTINCT je.id) AS entry_count,
        COALESCE(SUM(jl.debit), 0) AS total_debits,
        COALESCE(SUM(jl.credit), 0) AS total_credits,
        COUNT(DISTINCT jl.account_id) AS accounts_affected,
        (SELECT COUNT(*) FROM acc_accounts WHERE company_id = p_company_id AND is_active = 1 AND COALESCE(account_subtype,'') != 'Header') AS total_accounts,
        (SELECT COUNT(*) FROM acc_journal_entries WHERE company_id = p_company_id AND status = 'Posted' AND is_deleted = 0) AS total_posted
    FROM acc_journal_lines jl
    INNER JOIN acc_journal_entries je ON je.id = jl.entry_id
    WHERE je.company_id = p_company_id
      AND je.status = 'Posted'
      AND je.is_deleted = 0
      AND (p_date_from IS NULL OR je.entry_date >= p_date_from)
      AND (p_date_to IS NULL OR je.entry_date <= p_date_to);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_ledger_type_summary
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_ledger_type_summary`;
delimiter ;;
CREATE PROCEDURE `sp_ledger_type_summary`(IN p_company_id CHAR(36),
    IN p_date_from DATE,
    IN p_date_to DATE)
BEGIN
    SELECT
        a.account_type,
        COUNT(DISTINCT a.id) AS account_count,
        COALESCE(SUM(jl.debit), 0) AS total_debit,
        COALESCE(SUM(jl.credit), 0) AS total_credit,
        SUM(a.current_balance) AS total_balance
    FROM acc_accounts a
    LEFT JOIN acc_journal_lines jl ON jl.account_id = a.id
        AND jl.entry_id IN (
            SELECT id FROM acc_journal_entries
            WHERE company_id = p_company_id
              AND status = 'Posted'
              AND is_deleted = 0
              AND (p_date_from IS NULL OR entry_date >= p_date_from)
              AND (p_date_to IS NULL OR entry_date <= p_date_to)
        )
    WHERE a.company_id = p_company_id
      AND a.is_active = 1
      AND COALESCE(a.account_subtype,'') != 'Header'
    GROUP BY a.account_type
    ORDER BY FIELD(a.account_type, 'Asset', 'Liability', 'Equity', 'Revenue', 'Expense');
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_link_parent_accounts
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_link_parent_accounts`;
delimiter ;;
CREATE PROCEDURE `sp_link_parent_accounts`(IN p_company_id CHAR(36))
BEGIN
    UPDATE acc_accounts a
    INNER JOIN acc_accounts p ON a.company_id = p.company_id
    SET a.parent_id = p.id
    WHERE a.company_id = p_company_id
      AND p.account_subtype = 'Header'
      AND COALESCE(a.account_subtype,'') != 'Header'
      AND a.account_type = p.account_type
      AND a.parent_id IS NULL;
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
-- Procedure structure for sp_next_entry_number
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_next_entry_number`;
delimiter ;;
CREATE PROCEDURE `sp_next_entry_number`(IN p_company_id CHAR(36))
BEGIN
    SELECT COALESCE(MAX(entry_number), 0) + 1 AS next_number
    FROM acc_journal_entries
    WHERE company_id = p_company_id AND is_deleted = 0;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_next_ticket_number
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_next_ticket_number`;
delimiter ;;
CREATE PROCEDURE `sp_next_ticket_number`(IN p_cid CHAR(36), OUT p_num INT)
BEGIN
    INSERT INTO tk_sequences (company_id, next_number) VALUES (p_cid, 2)
        ON DUPLICATE KEY UPDATE next_number = next_number + 1;
    SELECT CASE WHEN next_number > 1 THEN next_number - 1 ELSE 1 END INTO p_num
    FROM tk_sequences WHERE company_id = p_cid;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_post_journal_entry
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_post_journal_entry`;
delimiter ;;
CREATE PROCEDURE `sp_post_journal_entry`(IN p_entry_id CHAR(36),
    IN p_company_id CHAR(36),
    IN p_user_id CHAR(36))
BEGIN
    DECLARE v_total_dr DECIMAL(15,2);
    DECLARE v_total_cr DECIMAL(15,2);
    DECLARE v_status VARCHAR(10);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    -- FOR UPDATE locks the row so a concurrent post can't double-apply balances;
    -- the second caller then sees status='Posted' and is rejected below.
    SELECT total_debit, total_credit, status INTO v_total_dr, v_total_cr, v_status
    FROM acc_journal_entries WHERE id = p_entry_id AND company_id = p_company_id AND is_deleted = 0
    FOR UPDATE;

    IF v_status IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'journal entry not found';
    END IF;
    IF v_status != 'Draft' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only draft entries can be posted';
    END IF;
    IF v_total_dr != v_total_cr OR v_total_dr = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Debits must equal credits and be non-zero';
    END IF;

    -- Update account balances
    UPDATE acc_accounts a
    INNER JOIN acc_journal_lines jl ON a.id = jl.account_id
    SET a.current_balance = a.current_balance +
        CASE WHEN a.normal_balance = 'Debit' THEN (jl.debit - jl.credit) ELSE (jl.credit - jl.debit) END
    WHERE jl.entry_id = p_entry_id AND a.company_id = p_company_id;

    UPDATE acc_journal_entries SET status = 'Posted', posted_at = NOW(), posted_by = p_user_id
    WHERE id = p_entry_id AND company_id = p_company_id;

    COMMIT;

    SELECT 'posted' AS result;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_reconcile_transaction
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_reconcile_transaction`;
delimiter ;;
CREATE PROCEDURE `sp_reconcile_transaction`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_entry_id CHAR(36))
BEGIN
    DECLARE v_txn_amount DECIMAL(15,2);
    DECLARE v_entry_total DECIMAL(15,2);

    SELECT ABS(amount) INTO v_txn_amount FROM bank_transactions
    WHERE id = p_id AND company_id = p_cid AND is_deleted = 0;
    IF v_txn_amount IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'bank transaction not found';
    END IF;

    SELECT total_debit INTO v_entry_total FROM acc_journal_entries
    WHERE id = p_entry_id AND company_id = p_cid AND is_deleted = 0 AND status = 'Posted';
    IF v_entry_total IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'matched journal entry not found or not posted';
    END IF;

    -- The matched entry must settle the same amount as the transaction.
    IF ABS(v_entry_total - v_txn_amount) > 0.01 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'matched entry amount does not equal the transaction amount';
    END IF;

    -- A posted entry reconciles at most one transaction.
    IF EXISTS (SELECT 1 FROM bank_transactions
               WHERE company_id = p_cid AND matched_entry_id = p_entry_id
                 AND is_reconciled = 1 AND is_deleted = 0 AND id != p_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'journal entry is already matched to another transaction';
    END IF;

    UPDATE bank_transactions SET is_reconciled = 1, matched_entry_id = p_entry_id
    WHERE id = p_id AND company_id = p_cid AND is_deleted = 0;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_record_loan_payment
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_record_loan_payment`;
delimiter ;;
CREATE PROCEDURE `sp_record_loan_payment`(IN p_company_id CHAR(36), IN p_loan_id CHAR(36),
    IN p_payment_date DATE, IN p_amount DECIMAL(12,2),
    IN p_principal DECIMAL(12,2), IN p_interest DECIMAL(12,2),
    IN p_payment_type VARCHAR(30), IN p_notes TEXT)
BEGIN
    DECLARE v_balance DECIMAL(12,2);
    DECLARE v_status VARCHAR(20);
    DECLARE v_applied DECIMAL(12,2);
    DECLARE v_new_balance DECIMAL(12,2);

    -- Scope to the caller's company; a foreign or missing loan yields NULL.
    SELECT balance, status INTO v_balance, v_status FROM loans WHERE id = p_loan_id AND company_id = p_company_id;
    IF v_balance IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'loan not found';
    END IF;
    IF v_status != 'Active' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'payments can only be recorded against active loans';
    END IF;

    -- Never apply more than the outstanding balance. Storing the *applied* amount
    -- (not the raw payment) keeps balance/total_paid consistent and makes payment
    -- reversal on delete correct even when the user tenders an overpayment.
    SET v_applied = LEAST(p_amount, v_balance);
    IF v_applied < 0 THEN SET v_applied = 0; END IF;
    SET v_new_balance = v_balance - v_applied;

    INSERT INTO loan_payments (company_id, loan_id, payment_date, amount, principal, interest, balance_after, payment_type, notes)
    VALUES (p_company_id, p_loan_id, p_payment_date, v_applied, p_principal, p_interest, v_new_balance, p_payment_type, p_notes);

    UPDATE loans SET total_paid = total_paid + v_applied, balance = v_new_balance,
        status = IF(v_new_balance <= 0, 'Paid', status)
    WHERE id = p_loan_id AND company_id = p_company_id;

    SELECT * FROM loan_payments WHERE loan_id = p_loan_id AND company_id = p_company_id AND is_deleted = 0
        ORDER BY created_at DESC LIMIT 1;
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
    IN p_company_country VARCHAR(100),
    IN p_company_city VARCHAR(100),
    IN p_company_state VARCHAR(100),
    IN p_company_province VARCHAR(100),
    IN p_company_zip VARCHAR(20),
    IN p_key_algorithm VARCHAR(50),
    IN p_user_id VARCHAR(36),
    IN p_email VARCHAR(255),
    IN p_username VARCHAR(100),
    IN p_password_hash VARCHAR(255),
    IN p_salt VARCHAR(255),
    IN p_access_id VARCHAR(36),
    IN p_wrapped_company_key BLOB,
    IN p_key_wrap_algorithm VARCHAR(50),
    IN p_key_exchange_algorithm VARCHAR(50),
    IN p_public_key BLOB,
    IN p_signing_public_key BLOB,
    IN p_ip_address VARCHAR(45),
    IN p_user_agent VARCHAR(500))
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    CALL sp_create_user(
        p_user_id, p_email, p_username, p_password_hash, p_salt,
        p_company_id, NULL, p_ip_address, p_user_agent
    );

    CALL sp_create_company(
        p_company_id, p_company_name, p_company_industry,
        p_company_address, p_company_country, p_company_city, p_company_state, p_company_province, p_company_zip,
        p_key_algorithm, 500, 'standard',
        p_user_id, NULL, p_ip_address, p_user_agent
    );

    CALL sp_create_user_company_access(
        p_access_id, p_user_id, p_company_id,
        p_wrapped_company_key, p_key_wrap_algorithm, p_key_exchange_algorithm,
        p_public_key, p_signing_public_key,
        'superadmin', NULL,
        p_user_id, NULL, p_ip_address, p_user_agent
    );

    COMMIT;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_reject_loan
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_reject_loan`;
delimiter ;;
CREATE PROCEDURE `sp_reject_loan`(IN p_company_id CHAR(36), IN p_id CHAR(36), IN p_rejection_note TEXT)
BEGIN
    UPDATE loans SET status = 'Rejected', rejection_note = p_rejection_note WHERE id = p_id AND company_id = p_company_id AND status = 'Pending';
    SELECT * FROM loans WHERE id = p_id AND company_id = p_company_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_reset_password_with_key
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_reset_password_with_key`;
delimiter ;;
CREATE PROCEDURE `sp_reset_password_with_key`(IN p_user_id VARCHAR(36),
    IN p_password_hash VARCHAR(255),
    IN p_salt VARCHAR(255),
    IN p_wrapped_company_key BLOB,
    IN p_key_wrap_algorithm VARCHAR(50),
    IN p_key_exchange_algorithm VARCHAR(50),
    IN p_public_key BLOB,
    IN p_signing_public_key BLOB,
    IN p_ip_address VARCHAR(45),
    IN p_user_agent VARCHAR(500))
BEGIN
    UPDATE users
    SET password_hash = p_password_hash,
        salt = p_salt,
        failed_login_attempts = 0,
        locked_until = NULL,
        updated_at = NOW()
    WHERE id = p_user_id;

    UPDATE user_company_access
    SET wrapped_company_key = p_wrapped_company_key,
        key_wrap_algorithm = IFNULL(p_key_wrap_algorithm, 'AES-KW'),
        key_exchange_algorithm = IFNULL(p_key_exchange_algorithm, 'ML-KEM-768'),
        public_key = p_public_key,
        signing_public_key = p_signing_public_key,
        updated_at = NOW()
    WHERE user_id = p_user_id AND is_active = 1;

    INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, old_value, new_value, is_encrypted, ip_address, user_agent)
    SELECT UUID(), company_id, p_user_id, NULL, 'users', p_user_id, 'update', 'password_reset', NULL, NULL, 0, p_ip_address, p_user_agent
    FROM user_company_access WHERE user_id = p_user_id AND is_active = 1 LIMIT 1;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_resolve_employee_schedule
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_resolve_employee_schedule`;
delimiter ;;
CREATE PROCEDURE `sp_resolve_employee_schedule`(IN p_employee_id VARCHAR(36),
    IN p_company_id  VARCHAR(36))
BEGIN
    DECLARE v_schedule_id VARCHAR(36);
    DECLARE v_source VARCHAR(20);
    DECLARE v_dept VARCHAR(100);
    DECLARE v_pos VARCHAR(100);

    -- 1. Direct employee assignment
    SELECT work_schedule_id, department, position
    INTO v_schedule_id, v_dept, v_pos
    FROM employees WHERE id = p_employee_id AND company_id = p_company_id AND is_deleted = 0;

    IF v_schedule_id IS NOT NULL THEN
        SET v_source = 'employee';
    END IF;

    -- 2. Position default
    IF v_schedule_id IS NULL AND v_pos != '' THEN
        SELECT schedule_id INTO v_schedule_id
        FROM work_schedule_defaults
        WHERE company_id = p_company_id AND scope = 'position' AND scope_value = v_pos AND is_deleted = 0
        LIMIT 1;
        IF v_schedule_id IS NOT NULL THEN
            SET v_source = 'position';
        END IF;
    END IF;

    -- 3. Department default
    IF v_schedule_id IS NULL AND v_dept != '' THEN
        SELECT schedule_id INTO v_schedule_id
        FROM work_schedule_defaults
        WHERE company_id = p_company_id AND scope = 'department' AND scope_value = v_dept AND is_deleted = 0
        LIMIT 1;
        IF v_schedule_id IS NOT NULL THEN
            SET v_source = 'department';
        END IF;
    END IF;

    -- 4. Company-wide default
    IF v_schedule_id IS NULL THEN
        SELECT id INTO v_schedule_id
        FROM work_schedules
        WHERE company_id = p_company_id AND is_default = 1 AND is_deleted = 0
        LIMIT 1;
        IF v_schedule_id IS NOT NULL THEN
            SET v_source = 'company_default';
        END IF;
    END IF;

    -- Return resolved schedule + its days
    SELECT ws.id, ws.name, ws.type, ws.color, ws.description,
           v_source AS resolved_from
    FROM work_schedules ws
    WHERE ws.id = v_schedule_id AND ws.is_deleted = 0;

    SELECT wsd.day_of_week, wsd.start_time, wsd.end_time,
           wsd.break_minutes, wsd.is_rest_day
    FROM work_schedule_days wsd
    WHERE wsd.schedule_id = v_schedule_id
    ORDER BY wsd.day_of_week;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_save_compliance_values
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_save_compliance_values`;
delimiter ;;
CREATE PROCEDURE `sp_save_compliance_values`(IN p_company_id VARCHAR(36),
    IN p_agency_id  INT,
    IN p_period     VARCHAR(20),
    IN p_values_json JSON)
BEGIN
    -- Verify ownership
    IF NOT EXISTS (SELECT 1 FROM compliance_agencies WHERE id = p_agency_id AND company_id = p_company_id AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Agency not found';
    END IF;

    -- Upsert values
    INSERT INTO compliance_values (field_id, period, value_encrypted)
    SELECT
        JSON_UNQUOTE(JSON_EXTRACT(j.val, '$.field_id')),
        p_period,
        JSON_UNQUOTE(JSON_EXTRACT(j.val, '$.value'))
    FROM JSON_TABLE(p_values_json, '$[*]' COLUMNS (
        val JSON PATH '$'
    )) j
    ON DUPLICATE KEY UPDATE
        value_encrypted = VALUES(value_encrypted),
        updated_at = CURRENT_TIMESTAMP;

    SELECT 'ok' AS result;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_seed_ticket_categories
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_seed_ticket_categories`;
delimiter ;;
CREATE PROCEDURE `sp_seed_ticket_categories`(IN p_cid CHAR(36))
BEGIN
    IF NOT EXISTS (SELECT 1 FROM tk_categories WHERE company_id = p_cid AND is_deleted = 0) THEN
        INSERT INTO tk_categories (id, company_id, name, description, color, icon, sla_hours, sort_order) VALUES
            (UUID(), p_cid, 'IT Support',       'Hardware, software, network issues',    '#3b82f6', 'monitor',     24, 1),
            (UUID(), p_cid, 'HR Request',        'Leave, benefits, policy questions',     '#10b981', 'users',       48, 2),
            (UUID(), p_cid, 'Facilities',        'Office maintenance, supplies',          '#f59e0b', 'home',        72, 3),
            (UUID(), p_cid, 'Finance',           'Reimbursements, payroll inquiries',     '#8b5cf6', 'dollar-sign', 48, 4),
            (UUID(), p_cid, 'Access Request',    'System access, permissions',            '#ef4444', 'key',         12, 5),
            (UUID(), p_cid, 'General',           'Other requests and inquiries',          '#6366f1', 'message-circle', 48, 6);
    END IF;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_send_invoice
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_send_invoice`;
delimiter ;;
CREATE PROCEDURE `sp_send_invoice`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
  DECLARE v_st VARCHAR(10); DECLARE v_tot DECIMAL(15,2);
  SELECT status,total_amount INTO v_st,v_tot FROM ar_invoices WHERE id=p_id AND company_id=p_cid AND is_deleted=0;
  IF v_st != 'Draft' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Only draft invoices can be sent'; END IF;
  IF v_tot <= 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invoice must have line items'; END IF;
  UPDATE ar_invoices SET status='Sent', balance_due=total_amount-amount_paid WHERE id=p_id AND company_id=p_cid;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_tax_payable_detail
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_tax_payable_detail`;
delimiter ;;
CREATE PROCEDURE `sp_tax_payable_detail`(IN p_company_id CHAR(36),
    IN p_account_id CHAR(36),
    IN p_date_from DATE,
    IN p_date_to DATE)
BEGIN
    SELECT je.entry_number, je.entry_date, je.memo, je.source_type,
        jl.description AS line_desc, jl.debit, jl.credit
    FROM acc_journal_lines jl
    INNER JOIN acc_journal_entries je ON je.id = jl.entry_id
    WHERE jl.account_id = p_account_id AND je.company_id = p_company_id
      AND je.status = 'Posted' AND je.is_deleted = 0
      AND (p_date_from IS NULL OR je.entry_date >= p_date_from)
      AND (p_date_to IS NULL OR je.entry_date <= p_date_to)
    ORDER BY je.entry_date, je.entry_number;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_tax_summary
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_tax_summary`;
delimiter ;;
CREATE PROCEDURE `sp_tax_summary`(IN p_company_id CHAR(36),
    IN p_date_from DATE,
    IN p_date_to DATE)
BEGIN
    -- Output VAT (from revenue journal entries credited to VAT accounts)
    -- Input VAT (from expense journal entries debited to VAT accounts)
    -- Withholding taxes (payable accounts)
    SELECT
        a.id AS account_id, a.code, a.name, a.account_type, a.account_subtype,
        COALESCE(SUM(jl.debit), 0) AS total_debit,
        COALESCE(SUM(jl.credit), 0) AS total_credit,
        a.current_balance
    FROM acc_accounts a
    LEFT JOIN acc_journal_lines jl ON jl.account_id = a.id
        AND jl.entry_id IN (
            SELECT id FROM acc_journal_entries
            WHERE company_id = p_company_id AND status = 'Posted' AND is_deleted = 0
              AND (p_date_from IS NULL OR entry_date >= p_date_from)
              AND (p_date_to IS NULL OR entry_date <= p_date_to)
        )
    WHERE a.company_id = p_company_id AND a.is_active = 1
      AND (a.name LIKE '%VAT%' OR a.name LIKE '%Tax%' OR a.name LIKE '%Withholding%'
           OR a.code IN ('1310','2110','2115','2150'))
    GROUP BY a.id, a.code, a.name, a.account_type, a.account_subtype, a.current_balance
    ORDER BY a.code;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_ticket_stats
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_ticket_stats`;
delimiter ;;
CREATE PROCEDURE `sp_ticket_stats`(IN p_cid CHAR(36))
BEGIN
    SELECT
        COUNT(*) AS total,
        SUM(status = 'Open') AS open_count,
        SUM(status = 'In Progress') AS in_progress,
        SUM(status = 'On Hold') AS on_hold,
        SUM(status = 'Resolved') AS resolved,
        SUM(status = 'Closed') AS closed_count,
        SUM(status NOT IN ('Resolved','Closed') AND due_date IS NOT NULL AND NOW() > due_date) AS overdue,
        SUM(priority = 'Urgent' AND status NOT IN ('Resolved','Closed')) AS urgent_open,
        SUM(priority = 'High' AND status NOT IN ('Resolved','Closed')) AS high_open,
        SUM(DATE(created_at) = CURDATE()) AS created_today,
        SUM(DATE(resolved_at) = CURDATE()) AS resolved_today,
        AVG(CASE WHEN resolved_at IS NOT NULL THEN TIMESTAMPDIFF(HOUR, created_at, resolved_at) END) AS avg_resolution_hours
    FROM tk_tickets WHERE company_id = p_cid AND is_deleted = 0;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_ticket_stats_by_category
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_ticket_stats_by_category`;
delimiter ;;
CREATE PROCEDURE `sp_ticket_stats_by_category`(IN p_cid CHAR(36))
BEGIN
    SELECT c.id, c.name, c.color, c.icon,
        COUNT(t.id) AS total,
        SUM(t.status IN ('Open','In Progress','On Hold')) AS active,
        SUM(t.status NOT IN ('Resolved','Closed') AND t.due_date IS NOT NULL AND NOW() > t.due_date) AS overdue
    FROM tk_categories c
    LEFT JOIN tk_tickets t ON t.category_id = c.id AND t.is_deleted = 0
    WHERE c.company_id = p_cid AND c.is_deleted = 0
    GROUP BY c.id, c.name, c.color, c.icon
    ORDER BY active DESC, c.sort_order;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_toggle_account_active
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_toggle_account_active`;
delimiter ;;
CREATE PROCEDURE `sp_toggle_account_active`(IN p_company_id CHAR(36), IN p_id CHAR(36), IN p_is_active TINYINT)
BEGIN
    -- Idempotent when given an explicit desired state; falls back to a flip only
    -- when p_is_active is NULL (legacy behavior).
    UPDATE acc_accounts SET is_active = IF(p_is_active IS NULL, NOT is_active, p_is_active)
    WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0 AND is_system = 0;

    SELECT id, is_active FROM acc_accounts WHERE id = p_id AND company_id = p_company_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_toggle_customer_active
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_toggle_customer_active`;
delimiter ;;
CREATE PROCEDURE `sp_toggle_customer_active`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN UPDATE ar_customers SET is_active = NOT is_active WHERE id=p_id AND company_id=p_cid AND is_deleted=0; END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_toggle_onboarding_item
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_toggle_onboarding_item`;
delimiter ;;
CREATE PROCEDURE `sp_toggle_onboarding_item`(IN p_id        VARCHAR(36),
    IN p_completed TINYINT)
BEGIN
    UPDATE onboarding_items SET
        completed = p_completed,
        completed_at = IF(p_completed = 1, NOW(), NULL)
    WHERE id = p_id AND is_deleted = 0;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_toggle_vendor_active
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_toggle_vendor_active`;
delimiter ;;
CREATE PROCEDURE `sp_toggle_vendor_active`(IN p_id CHAR(36),
    IN p_company_id CHAR(36))
BEGIN
    UPDATE ap_vendors SET is_active = NOT is_active WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_trial_balance
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_trial_balance`;
delimiter ;;
CREATE PROCEDURE `sp_trial_balance`(IN p_company_id CHAR(36),
    IN p_date_from DATE,
    IN p_date_to DATE)
BEGIN
    SELECT
        a.id,
        a.code,
        a.name,
        a.account_type,
        a.account_subtype,
        a.normal_balance,
        a.is_active,
        COALESCE(SUM(jl.debit), 0) AS total_debit,
        COALESCE(SUM(jl.credit), 0) AS total_credit,
        COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0) AS net_movement,
        a.current_balance
    FROM acc_accounts a
    LEFT JOIN acc_journal_lines jl ON jl.account_id = a.id
        AND jl.entry_id IN (
            SELECT id FROM acc_journal_entries
            WHERE company_id = p_company_id
              AND status = 'Posted'
              AND is_deleted = 0
              AND (p_date_from IS NULL OR entry_date >= p_date_from)
              AND (p_date_to IS NULL OR entry_date <= p_date_to)
        )
    WHERE a.company_id = p_company_id
      AND a.is_active = 1
      AND COALESCE(a.account_subtype,'') != 'Header'
    GROUP BY a.id, a.code, a.name, a.account_type, a.account_subtype, a.normal_balance, a.is_active, a.current_balance
    HAVING total_debit > 0 OR total_credit > 0 OR a.current_balance != 0
    ORDER BY a.code;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_unmatched_journal_lines
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_unmatched_journal_lines`;
delimiter ;;
CREATE PROCEDURE `sp_unmatched_journal_lines`(IN p_cid CHAR(36), IN p_aid CHAR(36))
BEGIN
    SELECT jl.id AS line_id, je.id AS entry_id, je.entry_number, je.entry_date, je.memo,
        jl.description, jl.debit, jl.credit,
        (jl.debit - jl.credit) AS net_amount
    FROM acc_journal_lines jl
    INNER JOIN acc_journal_entries je ON je.id = jl.entry_id
    WHERE jl.account_id = p_aid AND je.company_id = p_cid
      AND je.status = 'Posted' AND je.is_deleted = 0
      AND je.id NOT IN (SELECT matched_entry_id FROM bank_transactions WHERE company_id = p_cid AND account_id = p_aid AND is_reconciled = 1 AND is_deleted = 0 AND matched_entry_id IS NOT NULL)
    ORDER BY je.entry_date, je.entry_number;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_unreconcile_transaction
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_unreconcile_transaction`;
delimiter ;;
CREATE PROCEDURE `sp_unreconcile_transaction`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    UPDATE bank_transactions SET is_reconciled = 0, matched_entry_id = NULL
    WHERE id = p_id AND company_id = p_cid AND is_deleted = 0;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_update_account
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_update_account`;
delimiter ;;
CREATE PROCEDURE `sp_update_account`(IN p_company_id CHAR(36), IN p_id CHAR(36),
    IN p_code VARCHAR(20),
    IN p_name VARCHAR(150),
    IN p_account_type VARCHAR(20),
    IN p_account_subtype VARCHAR(50),
    IN p_normal_balance VARCHAR(10),
    IN p_parent_id CHAR(36),
    IN p_description TEXT,
    IN p_is_active TINYINT(1),
    IN p_currency VARCHAR(3))
BEGIN
    UPDATE acc_accounts SET
        code = p_code,
        name = p_name,
        account_type = p_account_type,
        account_subtype = p_account_subtype,
        normal_balance = p_normal_balance,
        parent_id = NULLIF(p_parent_id, ''),
        description = p_description,
        is_active = p_is_active,
        currency = IFNULL(NULLIF(p_currency, ''), 'PHP')
    WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0 AND is_system = 0;

    SELECT
        a.id, a.company_id, a.code, a.name,
        a.account_type, a.account_subtype,
        a.normal_balance, a.parent_id,
        p.name AS parent_name, p.code AS parent_code,
        a.description, a.is_active, a.is_system,
        a.currency, a.current_balance,
        a.created_at, a.updated_at
    FROM acc_accounts a
    LEFT JOIN acc_accounts p ON a.parent_id = p.id AND p.is_deleted = 0
    WHERE a.id = p_id AND a.company_id = p_company_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_update_attendance
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_update_attendance`;
delimiter ;;
CREATE PROCEDURE `sp_update_attendance`(IN p_id          VARCHAR(36),
    IN p_company_id  VARCHAR(36),
    IN p_clock_in    VARCHAR(20),
    IN p_clock_out   VARCHAR(20),
    IN p_status      VARCHAR(20),
    IN p_remarks     TEXT,
    IN p_session_id  VARCHAR(36),
    IN p_changed_by  VARCHAR(36),
    IN p_ip_address  VARCHAR(45),
    IN p_user_agent  VARCHAR(500))
BEGIN
    DECLARE v_hours DECIMAL(5,2) DEFAULT NULL;
    DECLARE v_ot DECIMAL(5,2) DEFAULT 0;

    IF p_clock_in != '' AND p_clock_out != '' THEN
        SET v_hours = TIMESTAMPDIFF(MINUTE, p_clock_in, p_clock_out) / 60.0;
        SET v_ot = GREATEST(v_hours - 8, 0);
    END IF;

    UPDATE attendance SET
        clock_in = IF(p_clock_in = '', NULL, p_clock_in),
        clock_out = IF(p_clock_out = '', NULL, p_clock_out),
        hours_worked = v_hours,
        overtime_hours = v_ot,
        status = p_status,
        remarks = IF(p_remarks = '', NULL, p_remarks)
    WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;

    INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, new_value, ip_address, user_agent)
    VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'attendance', p_id, 'UPDATE', 'status', p_status, p_ip_address, p_user_agent);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_update_benefit
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_update_benefit`;
delimiter ;;
CREATE PROCEDURE `sp_update_benefit`(IN p_id          VARCHAR(36),
    IN p_company_id  VARCHAR(36),
    IN p_type        VARCHAR(30),
    IN p_name        VARCHAR(200),
    IN p_provider    VARCHAR(200),
    IN p_status      VARCHAR(20),
    IN p_coverage    VARCHAR(500),
    IN p_frequency   VARCHAR(20),
    IN p_enrolled    INT,
    IN p_eligibility TEXT,
    IN p_description TEXT,
    IN p_tiers_json  JSON,
    IN p_session_id  VARCHAR(36),
    IN p_changed_by  VARCHAR(36),
    IN p_ip_address  VARCHAR(45),
    IN p_user_agent  VARCHAR(500))
BEGIN
    DECLARE v_old_name VARCHAR(200);
    DECLARE v_old_status VARCHAR(20);
    DECLARE v_i INT DEFAULT 0;
    DECLARE v_count INT;
    DECLARE v_tier_id VARCHAR(36);
    DECLARE v_tier_name VARCHAR(100);
    DECLARE v_employer DECIMAL(12,2);
    DECLARE v_employee DECIMAL(12,2);

    SELECT name, status INTO v_old_name, v_old_status
    FROM benefits WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;

    UPDATE benefits SET
        type = p_type,
        name = p_name,
        provider = p_provider,
        status = p_status,
        coverage = p_coverage,
        frequency = p_frequency,
        enrolled = p_enrolled,
        eligibility = p_eligibility,
        description = p_description
    WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;

    -- Replace tiers: soft-delete old, insert new
    UPDATE benefit_tiers SET is_deleted = 1 WHERE benefit_id = p_id;

    SET v_count = JSON_LENGTH(p_tiers_json);
    WHILE v_i < v_count DO
        SET v_tier_id = UUID();
        SET v_tier_name = JSON_UNQUOTE(JSON_EXTRACT(p_tiers_json, CONCAT('$[', v_i, '].name')));
        SET v_employer = CAST(JSON_EXTRACT(p_tiers_json, CONCAT('$[', v_i, '].employer_cost')) AS DECIMAL(12,2));
        SET v_employee = CAST(JSON_EXTRACT(p_tiers_json, CONCAT('$[', v_i, '].employee_cost')) AS DECIMAL(12,2));

        INSERT INTO benefit_tiers (id, benefit_id, name, employer_cost, employee_cost, sort_order)
        VALUES (v_tier_id, p_id, v_tier_name, COALESCE(v_employer, 0), COALESCE(v_employee, 0), v_i);

        SET v_i = v_i + 1;
    END WHILE;

    IF v_old_name != p_name THEN
        INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, old_value, new_value, ip_address, user_agent)
        VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'benefits', p_id, 'UPDATE', 'name', v_old_name, p_name, p_ip_address, p_user_agent);
    END IF;
    IF v_old_status != p_status THEN
        INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, old_value, new_value, ip_address, user_agent)
        VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'benefits', p_id, 'UPDATE', 'status', v_old_status, p_status, p_ip_address, p_user_agent);
    END IF;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_update_bill
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_update_bill`;
delimiter ;;
CREATE PROCEDURE `sp_update_bill`(IN p_id CHAR(36),
    IN p_company_id CHAR(36),
    IN p_vendor_id CHAR(36),
    IN p_bill_number VARCHAR(50),
    IN p_bill_date DATE,
    IN p_due_date DATE,
    IN p_memo TEXT,
    IN p_reference VARCHAR(100))
BEGIN
    DECLARE v_status VARCHAR(10);
    SELECT status INTO v_status FROM ap_bills WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;
    IF v_status IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'bill not found';
    END IF;
    IF v_status NOT IN ('Draft','Open') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Can only edit draft or open bills';
    END IF;
    UPDATE ap_bills SET
        vendor_id = p_vendor_id, bill_number = p_bill_number, bill_date = p_bill_date,
        due_date = p_due_date, memo = p_memo, reference = p_reference
    WHERE id = p_id AND company_id = p_company_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_update_bill_totals
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_update_bill_totals`;
delimiter ;;
CREATE PROCEDURE `sp_update_bill_totals`(IN p_bill_id CHAR(36), IN p_company_id CHAR(36))
BEGIN
    UPDATE ap_bills b SET
        subtotal = (SELECT COALESCE(SUM(amount), 0) FROM ap_bill_items WHERE bill_id = p_bill_id),
        tax_amount = (SELECT COALESCE(SUM(tax_amount), 0) FROM ap_bill_items WHERE bill_id = p_bill_id),
        total_amount = (SELECT COALESCE(SUM(amount + tax_amount), 0) FROM ap_bill_items WHERE bill_id = p_bill_id),
        balance_due = (SELECT COALESCE(SUM(amount + tax_amount), 0) FROM ap_bill_items WHERE bill_id = p_bill_id) - b.amount_paid
    WHERE id = p_bill_id AND company_id = p_company_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_update_coa_template
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_update_coa_template`;
delimiter ;;
CREATE PROCEDURE `sp_update_coa_template`(IN p_id CHAR(36),
    IN p_name VARCHAR(150),
    IN p_country VARCHAR(5),
    IN p_currency VARCHAR(3),
    IN p_flag VARCHAR(10),
    IN p_description TEXT)
BEGIN
    UPDATE acc_coa_templates SET
        name = p_name, country = p_country, currency = p_currency,
        flag = p_flag, description = p_description
    WHERE id = p_id AND is_deleted = 0;

    SELECT id, company_id, name, country, currency, flag, description, is_global, created_at, updated_at
    FROM acc_coa_templates WHERE id = p_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_update_coa_template_item
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_update_coa_template_item`;
delimiter ;;
CREATE PROCEDURE `sp_update_coa_template_item`(IN p_id CHAR(36),
    IN p_code VARCHAR(20),
    IN p_name VARCHAR(150),
    IN p_account_type VARCHAR(20),
    IN p_account_subtype VARCHAR(50),
    IN p_normal_balance VARCHAR(10),
    IN p_is_system TINYINT(1),
    IN p_sort_order INT)
BEGIN
    UPDATE acc_coa_template_items SET
        code = p_code, name = p_name, account_type = p_account_type,
        account_subtype = p_account_subtype, normal_balance = p_normal_balance,
        is_system = p_is_system, sort_order = p_sort_order
    WHERE id = p_id AND is_deleted = 0;
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
-- Procedure structure for sp_update_compliance_agency
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_update_compliance_agency`;
delimiter ;;
CREATE PROCEDURE `sp_update_compliance_agency`(IN p_agency_id  INT,
    IN p_company_id VARCHAR(36),
    IN p_name       VARCHAR(50),
    IN p_full_name  VARCHAR(200),
    IN p_color      VARCHAR(10),
    IN p_frequency  VARCHAR(20),
    IN p_website    VARCHAR(300),
    IN p_status     VARCHAR(20),
    IN p_due_date   DATE,
    IN p_last_filed DATE,
    IN p_fields_json JSON)
BEGIN
    -- Verify ownership
    IF NOT EXISTS (SELECT 1 FROM compliance_agencies WHERE id = p_agency_id AND company_id = p_company_id AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Agency not found';
    END IF;

    -- Update agency
    UPDATE compliance_agencies SET
        name = p_name, full_name = p_full_name, color = p_color,
        frequency = p_frequency, website = p_website,
        status = p_status, due_date = p_due_date, last_filed = p_last_filed
    WHERE id = p_agency_id AND company_id = p_company_id;

    -- Replace fields: delete old, insert new
    DELETE FROM compliance_fields WHERE agency_id = p_agency_id;

    INSERT INTO compliance_fields (agency_id, field_key, label, field_type, sort_order)
    SELECT p_agency_id,
           JSON_UNQUOTE(JSON_EXTRACT(j.val, '$.key')),
           JSON_UNQUOTE(JSON_EXTRACT(j.val, '$.label')),
           COALESCE(JSON_UNQUOTE(JSON_EXTRACT(j.val, '$.type')), 'currency'),
           j.ord
    FROM JSON_TABLE(p_fields_json, '$[*]' COLUMNS (
        ord FOR ORDINALITY,
        val JSON PATH '$'
    )) j;

    SELECT p_agency_id AS agency_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_update_customer
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_update_customer`;
delimiter ;;
CREATE PROCEDURE `sp_update_customer`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_name VARCHAR(200), IN p_cp VARCHAR(150), IN p_email VARCHAR(150), IN p_phone VARCHAR(50), IN p_addr TEXT, IN p_city VARCHAR(100), IN p_prov VARCHAR(100), IN p_zip VARCHAR(20), IN p_tin VARCHAR(30), IN p_terms INT, IN p_notes TEXT)
BEGIN UPDATE ar_customers SET name=p_name,contact_person=p_cp,email=p_email,phone=p_phone,address=p_addr,city=p_city,province=p_prov,zip_code=p_zip,tin=p_tin,payment_terms=IFNULL(p_terms,30),notes=p_notes WHERE id=p_id AND company_id=p_cid AND is_deleted=0; END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_update_department
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_update_department`;
delimiter ;;
CREATE PROCEDURE `sp_update_department`(IN p_id          VARCHAR(36),
    IN p_company_id  VARCHAR(36),
    IN p_name        VARCHAR(100),
    IN p_color       VARCHAR(10),
    IN p_description TEXT,
    IN p_session_id  VARCHAR(36),
    IN p_changed_by  VARCHAR(36),
    IN p_ip_address  VARCHAR(45),
    IN p_user_agent  VARCHAR(500))
BEGIN
    DECLARE v_old_name VARCHAR(100);

    SELECT name INTO v_old_name
    FROM departments WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;

    UPDATE departments SET
        name = p_name,
        color = p_color,
        description = p_description
    WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;

    IF v_old_name != p_name THEN
        UPDATE employees SET department = p_name
        WHERE company_id = p_company_id AND department = v_old_name AND is_deleted = 0;

        INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, old_value, new_value, ip_address, user_agent)
        VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'departments', p_id, 'UPDATE', 'name', v_old_name, p_name, p_ip_address, p_user_agent);
    END IF;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_update_employee
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_update_employee`;
delimiter ;;
CREATE PROCEDURE `sp_update_employee`(IN p_id              VARCHAR(36),
    IN p_company_id      VARCHAR(36),
    IN p_first_name      VARCHAR(100),
    IN p_last_name       VARCHAR(100),
    IN p_middle_name     VARCHAR(100),
    IN p_department      VARCHAR(100),
    IN p_position        VARCHAR(100),
    IN p_joined_date     VARCHAR(10),
    IN p_employment_type VARCHAR(30),
    IN p_status          VARCHAR(20),
    IN p_email_enc       TEXT,
    IN p_phone_enc       TEXT,
    IN p_birthday_enc    TEXT,
    IN p_address_enc     TEXT,
    IN p_salary_enc      TEXT,
    IN p_sss_enc         TEXT,
    IN p_philhealth_enc  TEXT,
    IN p_pagibig_enc     TEXT,
    IN p_tin_enc         TEXT,
    IN p_bank_name_enc   TEXT,
    IN p_bank_account_enc TEXT,
    IN p_enrolled_benefits JSON,
    IN p_work_schedule_id VARCHAR(36),
    IN p_session_id      VARCHAR(36),
    IN p_changed_by      VARCHAR(36),
    IN p_ip_address      VARCHAR(45),
    IN p_user_agent      VARCHAR(500))
BEGIN
    DECLARE v_old_status VARCHAR(20);

    SELECT status INTO v_old_status
    FROM employees WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;

    UPDATE employees SET
        first_name = p_first_name,
        last_name = p_last_name,
        middle_name = p_middle_name,
        department = p_department,
        position = p_position,
        joined_date = IF(p_joined_date = '', NULL, p_joined_date),
        employment_type = p_employment_type,
        status = p_status,
        email_enc = p_email_enc,
        phone_enc = p_phone_enc,
        birthday_enc = p_birthday_enc,
        address_enc = p_address_enc,
        basic_salary_enc = p_salary_enc,
        sss_no_enc = p_sss_enc,
        philhealth_no_enc = p_philhealth_enc,
        pagibig_no_enc = p_pagibig_enc,
        tin_enc = p_tin_enc,
        bank_name_enc = p_bank_name_enc,
        bank_account_enc = p_bank_account_enc,
        enrolled_benefits = p_enrolled_benefits,
        work_schedule_id = IF(p_work_schedule_id = '', NULL, p_work_schedule_id)
    WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;

    INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, new_value, ip_address, user_agent)
    VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'employees', p_id, 'UPDATE', 'name', CONCAT(p_first_name, ' ', p_last_name), p_ip_address, p_user_agent);

    IF v_old_status != p_status THEN
        INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, old_value, new_value, ip_address, user_agent)
        VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'employees', p_id, 'UPDATE', 'status', v_old_status, p_status, p_ip_address, p_user_agent);
    END IF;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_update_invoice
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_update_invoice`;
delimiter ;;
CREATE PROCEDURE `sp_update_invoice`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_custid CHAR(36), IN p_num VARCHAR(50), IN p_date DATE, IN p_due DATE, IN p_memo TEXT, IN p_ref VARCHAR(100))
BEGIN
  DECLARE v_st VARCHAR(10);
  SELECT status INTO v_st FROM ar_invoices WHERE id=p_id AND company_id=p_cid AND is_deleted=0;
  IF v_st IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='invoice not found'; END IF;
  IF v_st NOT IN ('Draft','Sent') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Can only edit draft/sent invoices'; END IF;
  UPDATE ar_invoices SET customer_id=p_custid,invoice_number=p_num,invoice_date=p_date,due_date=p_due,memo=p_memo,reference=p_ref WHERE id=p_id AND company_id=p_cid;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_update_invoice_totals
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_update_invoice_totals`;
delimiter ;;
CREATE PROCEDURE `sp_update_invoice_totals`(IN p_iid CHAR(36), IN p_cid CHAR(36))
BEGIN
  UPDATE ar_invoices SET
    subtotal=(SELECT COALESCE(SUM(amount),0) FROM ar_invoice_items WHERE invoice_id=p_iid),
    tax_amount=(SELECT COALESCE(SUM(tax_amount),0) FROM ar_invoice_items WHERE invoice_id=p_iid),
    total_amount=(SELECT COALESCE(SUM(amount+tax_amount),0) FROM ar_invoice_items WHERE invoice_id=p_iid),
    balance_due=(SELECT COALESCE(SUM(amount+tax_amount),0) FROM ar_invoice_items WHERE invoice_id=p_iid) - amount_paid
  WHERE id=p_iid AND company_id=p_cid;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_update_journal_entry
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_update_journal_entry`;
delimiter ;;
CREATE PROCEDURE `sp_update_journal_entry`(IN p_id CHAR(36),
    IN p_company_id CHAR(36),
    IN p_entry_date DATE,
    IN p_memo TEXT)
BEGIN
    DECLARE v_status VARCHAR(10);
    SELECT status INTO v_status FROM acc_journal_entries
    WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;

    -- Not found for this company: signal instead of silently succeeding, so the
    -- caller aborts before touching the (now company-scoped) journal lines.
    IF v_status IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'journal entry not found';
    END IF;
    IF v_status != 'Draft' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Can only edit draft entries';
    END IF;

    UPDATE acc_journal_entries SET entry_date = p_entry_date, memo = p_memo
    WHERE id = p_id AND company_id = p_company_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_update_journal_totals
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_update_journal_totals`;
delimiter ;;
CREATE PROCEDURE `sp_update_journal_totals`(IN p_entry_id CHAR(36), IN p_company_id CHAR(36))
BEGIN
    UPDATE acc_journal_entries je SET
        total_debit = (SELECT COALESCE(SUM(debit), 0) FROM acc_journal_lines WHERE entry_id = p_entry_id),
        total_credit = (SELECT COALESCE(SUM(credit), 0) FROM acc_journal_lines WHERE entry_id = p_entry_id)
    WHERE id = p_entry_id AND company_id = p_company_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_update_leave
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_update_leave`;
delimiter ;;
CREATE PROCEDURE `sp_update_leave`(IN p_id          VARCHAR(36),
    IN p_company_id  VARCHAR(36),
    IN p_leave_type  VARCHAR(30),
    IN p_start_date  VARCHAR(10),
    IN p_end_date    VARCHAR(10),
    IN p_days        DECIMAL(4,1),
    IN p_reason      TEXT,
    IN p_session_id  VARCHAR(36),
    IN p_changed_by  VARCHAR(36),
    IN p_ip_address  VARCHAR(45),
    IN p_user_agent  VARCHAR(500))
BEGIN
    UPDATE leaves SET
        leave_type = p_leave_type,
        start_date = p_start_date,
        end_date = p_end_date,
        days = p_days,
        reason = IF(p_reason = '', NULL, p_reason)
    WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0 AND status = 'Pending';

    INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, new_value, ip_address, user_agent)
    VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'leaves', p_id, 'UPDATE', 'leave_type', p_leave_type, p_ip_address, p_user_agent);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_update_loan_type
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_update_loan_type`;
delimiter ;;
CREATE PROCEDURE `sp_update_loan_type`(IN p_id CHAR(36), IN p_name VARCHAR(100), IN p_description TEXT,
    IN p_max_amount DECIMAL(12,2), IN p_interest_rate DECIMAL(5,2),
    IN p_max_term_months INT, IN p_requires_approval TINYINT(1))
BEGIN
    UPDATE loan_types SET name = p_name, description = p_description, max_amount = p_max_amount,
        interest_rate = p_interest_rate, max_term_months = p_max_term_months, requires_approval = p_requires_approval
    WHERE id = p_id;
    SELECT * FROM loan_types WHERE id = p_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_update_onboarding_checklist_status
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_update_onboarding_checklist_status`;
delimiter ;;
CREATE PROCEDURE `sp_update_onboarding_checklist_status`(IN p_id          VARCHAR(36),
    IN p_company_id  VARCHAR(36),
    IN p_status      VARCHAR(20),
    IN p_progress    INT,
    IN p_session_id  VARCHAR(36),
    IN p_changed_by  VARCHAR(36),
    IN p_ip_address  VARCHAR(45),
    IN p_user_agent  VARCHAR(500))
BEGIN
    UPDATE onboarding_checklists SET
        status = p_status,
        progress = p_progress,
        completed_date = IF(p_status = 'Completed', CURDATE(), NULL)
    WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;

    INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, new_value, ip_address, user_agent)
    VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'onboarding_checklists', p_id, 'UPDATE', 'status', p_status, p_ip_address, p_user_agent);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_update_onboarding_template
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_update_onboarding_template`;
delimiter ;;
CREATE PROCEDURE `sp_update_onboarding_template`(IN p_id          VARCHAR(36),
    IN p_company_id  VARCHAR(36),
    IN p_name        VARCHAR(100),
    IN p_description TEXT,
    IN p_category    VARCHAR(50),
    IN p_is_default  TINYINT,
    IN p_session_id  VARCHAR(36),
    IN p_changed_by  VARCHAR(36),
    IN p_ip_address  VARCHAR(45),
    IN p_user_agent  VARCHAR(500))
BEGIN
    IF p_is_default = 1 THEN
        UPDATE onboarding_templates SET is_default = 0
        WHERE company_id = p_company_id AND is_deleted = 0;
    END IF;

    UPDATE onboarding_templates SET
        name = p_name,
        description = IF(p_description='',NULL,p_description),
        category = p_category,
        is_default = p_is_default
    WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;

    INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, new_value, ip_address, user_agent)
    VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'onboarding_templates', p_id, 'UPDATE', 'name', p_name, p_ip_address, p_user_agent);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_update_payroll_run_status
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_update_payroll_run_status`;
delimiter ;;
CREATE PROCEDURE `sp_update_payroll_run_status`(IN p_id              VARCHAR(36),
    IN p_company_id      VARCHAR(36),
    IN p_status          VARCHAR(20),
    IN p_total_gross     DECIMAL(14,2),
    IN p_total_deductions DECIMAL(14,2),
    IN p_total_net       DECIMAL(14,2),
    IN p_employee_count  INT,
    IN p_session_id      VARCHAR(36),
    IN p_changed_by      VARCHAR(36),
    IN p_ip_address      VARCHAR(45),
    IN p_user_agent      VARCHAR(500))
BEGIN
    UPDATE payroll_runs SET
        status = p_status,
        total_gross = p_total_gross,
        total_deductions = p_total_deductions,
        total_net = p_total_net,
        employee_count = p_employee_count,
        approved_by = IF(p_status IN ('Approved','Paid'), p_changed_by, approved_by),
        approved_at = IF(p_status IN ('Approved','Paid'), NOW(), approved_at)
    WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;

    INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, new_value, ip_address, user_agent)
    VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'payroll_runs', p_id, 'UPDATE', 'status', p_status, p_ip_address, p_user_agent);
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_update_position
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_update_position`;
delimiter ;;
CREATE PROCEDURE `sp_update_position`(IN p_id          VARCHAR(36),
    IN p_company_id  VARCHAR(36),
    IN p_name        VARCHAR(100),
    IN p_department  VARCHAR(100),
    IN p_level       VARCHAR(50),
    IN p_description TEXT,
    IN p_session_id  VARCHAR(36),
    IN p_changed_by  VARCHAR(36),
    IN p_ip_address  VARCHAR(45),
    IN p_user_agent  VARCHAR(500))
BEGIN
    DECLARE v_old_name VARCHAR(100);

    SELECT name INTO v_old_name
    FROM positions WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;

    UPDATE positions SET
        name = p_name,
        department = p_department,
        level = p_level,
        description = p_description
    WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;

    IF v_old_name != p_name THEN
        UPDATE employees SET position = p_name
        WHERE company_id = p_company_id AND position = v_old_name AND is_deleted = 0;

        INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, old_value, new_value, ip_address, user_agent)
        VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'positions', p_id, 'UPDATE', 'name', v_old_name, p_name, p_ip_address, p_user_agent);
    END IF;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_update_ticket
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_update_ticket`;
delimiter ;;
CREATE PROCEDURE `sp_update_ticket`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_subject VARCHAR(255), IN p_desc TEXT, IN p_catid CHAR(36), IN p_priority VARCHAR(10), IN p_assigned CHAR(36))
BEGIN
    UPDATE tk_tickets SET
        subject = p_subject, description = p_desc,
        category_id = NULLIF(p_catid, ''),
        priority = IFNULL(p_priority, priority),
        assigned_to = NULLIF(p_assigned, ''),
        status = CASE WHEN assigned_to IS NULL AND NULLIF(p_assigned,'') IS NOT NULL AND status = 'Open' THEN 'In Progress' ELSE status END
    WHERE id = p_id AND company_id = p_cid AND is_deleted = 0;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_update_ticket_category
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_update_ticket_category`;
delimiter ;;
CREATE PROCEDURE `sp_update_ticket_category`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_name VARCHAR(100), IN p_desc VARCHAR(255), IN p_color VARCHAR(7), IN p_icon VARCHAR(30), IN p_sla INT, IN p_sort INT)
BEGIN
    UPDATE tk_categories SET name=p_name, description=p_desc, color=IFNULL(p_color,color), icon=IFNULL(p_icon,icon),
        sla_hours=IFNULL(p_sla,sla_hours), sort_order=IFNULL(p_sort,sort_order)
    WHERE id=p_id AND company_id=p_cid AND is_deleted=0;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_update_ticket_status
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_update_ticket_status`;
delimiter ;;
CREATE PROCEDURE `sp_update_ticket_status`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_status VARCHAR(20))
BEGIN
    UPDATE tk_tickets SET
        status = p_status,
        resolved_at = CASE WHEN p_status = 'Resolved' THEN NOW() ELSE resolved_at END,
        closed_at = CASE WHEN p_status = 'Closed' THEN NOW() ELSE closed_at END
    WHERE id = p_id AND company_id = p_cid AND is_deleted = 0;
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
    FROM user_company_access WHERE id = p_id AND company_id = p_company_id AND is_active = 1;

    IF v_old_role IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'access record not found';
    END IF;

    UPDATE user_company_access SET
        role = IFNULL(p_role, role),
        permissions = IFNULL(p_permissions, permissions),
        wrapped_company_key = IFNULL(p_wrapped_company_key, wrapped_company_key),
        key_wrap_algorithm = IFNULL(p_key_wrap_algorithm, key_wrap_algorithm),
        key_version = IFNULL(p_key_version, key_version),
        public_key = IFNULL(p_public_key, public_key)
    WHERE id = p_id AND company_id = p_company_id AND is_active = 1;

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
-- Procedure structure for sp_update_vendor
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_update_vendor`;
delimiter ;;
CREATE PROCEDURE `sp_update_vendor`(IN p_id CHAR(36),
    IN p_company_id CHAR(36),
    IN p_name VARCHAR(200),
    IN p_contact_person VARCHAR(150),
    IN p_email VARCHAR(150),
    IN p_phone VARCHAR(50),
    IN p_address TEXT,
    IN p_city VARCHAR(100),
    IN p_province VARCHAR(100),
    IN p_zip_code VARCHAR(20),
    IN p_tin VARCHAR(30),
    IN p_payment_terms INT,
    IN p_notes TEXT)
BEGIN
    UPDATE ap_vendors SET
        name = p_name, contact_person = p_contact_person, email = p_email,
        phone = p_phone, address = p_address, city = p_city, province = p_province,
        zip_code = p_zip_code, tin = p_tin, payment_terms = IFNULL(p_payment_terms, 30), notes = p_notes
    WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_update_work_schedule
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_update_work_schedule`;
delimiter ;;
CREATE PROCEDURE `sp_update_work_schedule`(IN p_id          VARCHAR(36),
    IN p_company_id  VARCHAR(36),
    IN p_name        VARCHAR(150),
    IN p_type        VARCHAR(20),
    IN p_description TEXT,
    IN p_color       VARCHAR(10),
    IN p_is_default  TINYINT,
    IN p_session_id  VARCHAR(36),
    IN p_changed_by  VARCHAR(36),
    IN p_ip_address  VARCHAR(45),
    IN p_user_agent  VARCHAR(500))
BEGIN
    DECLARE v_old_name VARCHAR(150);

    SELECT name INTO v_old_name
    FROM work_schedules WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;

    IF p_is_default = 1 THEN
        UPDATE work_schedules SET is_default = 0
        WHERE company_id = p_company_id AND is_deleted = 0 AND id != p_id;
    END IF;

    UPDATE work_schedules SET
        name = p_name, type = p_type, description = p_description,
        color = p_color, is_default = p_is_default
    WHERE id = p_id AND company_id = p_company_id AND is_deleted = 0;

    IF v_old_name != p_name THEN
        INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, old_value, new_value, ip_address, user_agent)
        VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'work_schedules', p_id, 'UPDATE', 'name', v_old_name, p_name, p_ip_address, p_user_agent);
    END IF;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_upsert_account_mapping
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_upsert_account_mapping`;
delimiter ;;
CREATE PROCEDURE `sp_upsert_account_mapping`(IN p_company_id CHAR(36),
    IN p_mapping_key VARCHAR(50),
    IN p_account_id CHAR(36),
    IN p_description VARCHAR(150))
BEGIN
    IF EXISTS (SELECT 1 FROM acc_account_mappings WHERE company_id = p_company_id AND mapping_key = p_mapping_key AND is_deleted = 0) THEN
        UPDATE acc_account_mappings SET account_id = p_account_id, description = p_description
        WHERE company_id = p_company_id AND mapping_key = p_mapping_key AND is_deleted = 0;
    ELSE
        INSERT INTO acc_account_mappings (id, company_id, mapping_key, account_id, description)
        VALUES (UUID(), p_company_id, p_mapping_key, p_account_id, p_description);
    END IF;
    SELECT * FROM acc_account_mappings WHERE company_id = p_company_id AND mapping_key = p_mapping_key AND is_deleted = 0;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_upsert_payroll_item
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_upsert_payroll_item`;
delimiter ;;
CREATE PROCEDURE `sp_upsert_payroll_item`(IN p_id                    VARCHAR(36),
    IN p_run_id                VARCHAR(36),
    IN p_company_id            VARCHAR(36),
    IN p_employee_id           VARCHAR(36),
    IN p_basic_pay             DECIMAL(14,2),
    IN p_days_worked           DECIMAL(6,2),
    IN p_hours_worked          DECIMAL(8,2),
    IN p_ot_hours              DECIMAL(8,2),
    IN p_ot_pay                DECIMAL(14,2),
    IN p_holiday_pay           DECIMAL(14,2),
    IN p_night_diff            DECIMAL(14,2),
    IN p_allowances            DECIMAL(14,2),
    IN p_other_earnings        DECIMAL(14,2),
    IN p_gross_pay             DECIMAL(14,2),
    IN p_sss_ee                DECIMAL(10,2),
    IN p_sss_er                DECIMAL(10,2),
    IN p_philhealth_ee         DECIMAL(10,2),
    IN p_philhealth_er         DECIMAL(10,2),
    IN p_pagibig_ee            DECIMAL(10,2),
    IN p_pagibig_er            DECIMAL(10,2),
    IN p_withholding_tax       DECIMAL(14,2),
    IN p_benefit_deductions    DECIMAL(14,2),
    IN p_loan_deductions       DECIMAL(14,2),
    IN p_other_deductions      DECIMAL(14,2),
    IN p_total_deductions      DECIMAL(14,2),
    IN p_net_pay               DECIMAL(14,2),
    IN p_work_schedule_name    VARCHAR(100),
    IN p_hours_per_day         DECIMAL(4,2),
    IN p_working_days_per_month INT,
    IN p_ot_multiplier_used    DECIMAL(4,2))
BEGIN
    INSERT INTO payroll_items (
        id, run_id, company_id, employee_id,
        basic_pay, days_worked, hours_worked,
        ot_hours, ot_pay, holiday_pay, night_diff,
        allowances, other_earnings, gross_pay,
        sss_ee, sss_er, philhealth_ee, philhealth_er,
        pagibig_ee, pagibig_er, withholding_tax,
        benefit_deductions, loan_deductions, other_deductions,
        total_deductions, net_pay,
        work_schedule_name, hours_per_day, working_days_per_month,
        ot_multiplier_used
    ) VALUES (
        p_id, p_run_id, p_company_id, p_employee_id,
        p_basic_pay, p_days_worked, p_hours_worked,
        p_ot_hours, p_ot_pay, p_holiday_pay, p_night_diff,
        p_allowances, p_other_earnings, p_gross_pay,
        p_sss_ee, p_sss_er, p_philhealth_ee, p_philhealth_er,
        p_pagibig_ee, p_pagibig_er, p_withholding_tax,
        p_benefit_deductions, p_loan_deductions, p_other_deductions,
        p_total_deductions, p_net_pay,
        p_work_schedule_name, p_hours_per_day, p_working_days_per_month,
        p_ot_multiplier_used
    )
    ON DUPLICATE KEY UPDATE
        basic_pay               = p_basic_pay,
        days_worked             = p_days_worked,
        hours_worked            = p_hours_worked,
        ot_hours                = p_ot_hours,
        ot_pay                  = p_ot_pay,
        holiday_pay             = p_holiday_pay,
        night_diff              = p_night_diff,
        allowances              = p_allowances,
        other_earnings          = p_other_earnings,
        gross_pay               = p_gross_pay,
        sss_ee                  = p_sss_ee,
        sss_er                  = p_sss_er,
        philhealth_ee           = p_philhealth_ee,
        philhealth_er           = p_philhealth_er,
        pagibig_ee              = p_pagibig_ee,
        pagibig_er              = p_pagibig_er,
        withholding_tax         = p_withholding_tax,
        benefit_deductions      = p_benefit_deductions,
        loan_deductions         = p_loan_deductions,
        other_deductions        = p_other_deductions,
        total_deductions        = p_total_deductions,
        net_pay                 = p_net_pay,
        work_schedule_name      = p_work_schedule_name,
        hours_per_day           = p_hours_per_day,
        working_days_per_month  = p_working_days_per_month,
        ot_multiplier_used      = p_ot_multiplier_used,
        updated_at              = CURRENT_TIMESTAMP;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_upsert_payroll_settings
-- ----------------------------
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

-- ----------------------------
-- Procedure structure for sp_upsert_template_item
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_upsert_template_item`;
delimiter ;;
CREATE PROCEDURE `sp_upsert_template_item`(IN p_id          VARCHAR(36),
    IN p_template_id VARCHAR(36),
    IN p_company_id  VARCHAR(36),
    IN p_title       VARCHAR(200),
    IN p_category    VARCHAR(50),
    IN p_required    TINYINT,
    IN p_sort_order  INT)
BEGIN
    INSERT INTO onboarding_template_items (id, template_id, company_id, title, category, required, sort_order)
    VALUES (p_id, p_template_id, p_company_id, p_title, p_category, p_required, p_sort_order)
    ON DUPLICATE KEY UPDATE
        title = p_title, category = p_category, required = p_required, sort_order = p_sort_order, is_deleted = 0;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_upsert_work_schedule_day
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_upsert_work_schedule_day`;
delimiter ;;
CREATE PROCEDURE `sp_upsert_work_schedule_day`(IN p_id            VARCHAR(36),
    IN p_schedule_id   VARCHAR(36),
    IN p_day_of_week   TINYINT,
    IN p_start_time    VARCHAR(8),
    IN p_end_time      VARCHAR(8),
    IN p_break_minutes INT,
    IN p_is_rest_day   TINYINT)
BEGIN
    INSERT INTO work_schedule_days (id, schedule_id, day_of_week, start_time, end_time, break_minutes, is_rest_day)
    VALUES (p_id, p_schedule_id, p_day_of_week,
            IF(p_is_rest_day = 1, NULL, p_start_time),
            IF(p_is_rest_day = 1, NULL, p_end_time),
            p_break_minutes, p_is_rest_day)
    ON DUPLICATE KEY UPDATE
        start_time = IF(p_is_rest_day = 1, NULL, p_start_time),
        end_time = IF(p_is_rest_day = 1, NULL, p_end_time),
        break_minutes = p_break_minutes,
        is_rest_day = p_is_rest_day;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_upsert_work_schedule_default
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_upsert_work_schedule_default`;
delimiter ;;
CREATE PROCEDURE `sp_upsert_work_schedule_default`(IN p_id          VARCHAR(36),
    IN p_company_id  VARCHAR(36),
    IN p_schedule_id VARCHAR(36),
    IN p_scope       VARCHAR(20),
    IN p_scope_value VARCHAR(100),
    IN p_session_id  VARCHAR(36),
    IN p_changed_by  VARCHAR(36),
    IN p_ip_address  VARCHAR(45),
    IN p_user_agent  VARCHAR(500))
BEGIN
    INSERT INTO work_schedule_defaults (id, company_id, schedule_id, scope, scope_value)
    VALUES (p_id, p_company_id, p_schedule_id, p_scope, p_scope_value)
    ON DUPLICATE KEY UPDATE
        schedule_id = p_schedule_id,
        is_deleted = 0;

    INSERT INTO change_history (id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, new_value, ip_address, user_agent)
    VALUES (UUID(), p_company_id, p_changed_by, p_session_id, 'work_schedule_defaults', p_id, 'UPSERT',
            CONCAT(p_scope, ':', p_scope_value), p_schedule_id, p_ip_address, p_user_agent);
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

-- ----------------------------
-- Procedure structure for sp_vat_computation
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_vat_computation`;
delimiter ;;
CREATE PROCEDURE `sp_vat_computation`(IN p_company_id CHAR(36),
    IN p_date_from DATE,
    IN p_date_to DATE)
BEGIN
    SELECT
        COALESCE((SELECT SUM(jl.credit) FROM acc_journal_lines jl INNER JOIN acc_journal_entries je ON je.id=jl.entry_id
            INNER JOIN acc_accounts a ON a.id=jl.account_id
            WHERE je.company_id=p_company_id AND je.status='Posted' AND je.is_deleted=0
              AND (a.name LIKE '%Output VAT%' OR a.code='2110')
              AND (p_date_from IS NULL OR je.entry_date>=p_date_from) AND (p_date_to IS NULL OR je.entry_date<=p_date_to)
        ), 0) AS output_vat,
        COALESCE((SELECT SUM(jl.debit) FROM acc_journal_lines jl INNER JOIN acc_journal_entries je ON je.id=jl.entry_id
            INNER JOIN acc_accounts a ON a.id=jl.account_id
            WHERE je.company_id=p_company_id AND je.status='Posted' AND je.is_deleted=0
              AND (a.name LIKE '%Input VAT%' OR a.code='1310')
              AND (p_date_from IS NULL OR je.entry_date>=p_date_from) AND (p_date_to IS NULL OR je.entry_date<=p_date_to)
        ), 0) AS input_vat;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_void_bill
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_void_bill`;
delimiter ;;
CREATE PROCEDURE `sp_void_bill`(IN p_bill_id CHAR(36),
    IN p_company_id CHAR(36))
BEGIN
    DECLARE v_paid DECIMAL(15,2);
    SELECT amount_paid INTO v_paid FROM ap_bills WHERE id = p_bill_id AND company_id = p_company_id AND is_deleted = 0;
    IF v_paid > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot void bill with payments. Delete payments first.';
    END IF;
    UPDATE ap_bills SET status = 'Voided' WHERE id = p_bill_id AND company_id = p_company_id;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_void_invoice
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_void_invoice`;
delimiter ;;
CREATE PROCEDURE `sp_void_invoice`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
  DECLARE v_paid DECIMAL(15,2);
  SELECT amount_paid INTO v_paid FROM ar_invoices WHERE id=p_id AND company_id=p_cid AND is_deleted=0;
  IF v_paid > 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cannot void invoice with payments'; END IF;
  UPDATE ar_invoices SET status='Voided' WHERE id=p_id AND company_id=p_cid;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_void_journal_entry
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_void_journal_entry`;
delimiter ;;
CREATE PROCEDURE `sp_void_journal_entry`(IN p_entry_id CHAR(36),
    IN p_company_id CHAR(36),
    IN p_user_id CHAR(36),
    IN p_reason TEXT)
BEGIN
    DECLARE v_status VARCHAR(10);

    SELECT status INTO v_status FROM acc_journal_entries
    WHERE id = p_entry_id AND company_id = p_company_id AND is_deleted = 0;

    IF v_status != 'Posted' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only posted entries can be voided';
    END IF;

    -- Reverse account balances
    UPDATE acc_accounts a
    INNER JOIN acc_journal_lines jl ON a.id = jl.account_id
    SET a.current_balance = a.current_balance -
        CASE WHEN a.normal_balance = 'Debit' THEN (jl.debit - jl.credit) ELSE (jl.credit - jl.debit) END
    WHERE jl.entry_id = p_entry_id AND a.company_id = p_company_id;

    UPDATE acc_journal_entries SET status = 'Voided', voided_at = NOW(), voided_by = p_user_id, void_reason = p_reason
    WHERE id = p_entry_id;

    SELECT 'voided' AS result;
END
;;
delimiter ;

-- ----------------------------
-- Password-reset proof-of-possession (C2) — see migration 004
-- ----------------------------
DROP TABLE IF EXISTS `password_reset_challenges`;
CREATE TABLE `password_reset_challenges` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `challenge` varbinary(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `used` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_prc_user` (`user_id`),
  KEY `idx_prc_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP PROCEDURE IF EXISTS `sp_create_reset_challenge`;
delimiter ;;
CREATE PROCEDURE `sp_create_reset_challenge`(IN p_id CHAR(36), IN p_user_id CHAR(36),
    IN p_challenge VARBINARY(64), IN p_expires_at DATETIME)
BEGIN
    INSERT INTO password_reset_challenges (id, user_id, challenge, expires_at)
    VALUES (p_id, p_user_id, p_challenge, p_expires_at);
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_get_reset_challenge`;
delimiter ;;
CREATE PROCEDURE `sp_get_reset_challenge`(IN p_id CHAR(36))
BEGIN
    SELECT user_id, challenge, expires_at, used
    FROM password_reset_challenges WHERE id = p_id;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_consume_reset_challenge`;
delimiter ;;
CREATE PROCEDURE `sp_consume_reset_challenge`(IN p_id CHAR(36))
BEGIN
    UPDATE password_reset_challenges
    SET used = 1
    WHERE id = p_id AND used = 0 AND expires_at > NOW();
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_get_user_signing_keys`;
delimiter ;;
CREATE PROCEDURE `sp_get_user_signing_keys`(IN p_user_id CHAR(36))
BEGIN
    SELECT signing_public_key
    FROM user_company_access
    WHERE user_id = p_user_id AND is_active = 1 AND signing_public_key IS NOT NULL;
END
;;
delimiter ;

SET FOREIGN_KEY_CHECKS = 1;


-- ============================================================
-- Migration 007 appended: GitHub-style ticketing (labels, timeline,
-- reactions, comment edit). Redefines sp_get_tickets/sp_get_ticket.
-- ============================================================
-- ============================================================================
-- Migration 007: GitHub-Issues-style features for the ticketing module
--
--   * Labels        — many-to-many colored labels per ticket (tk_labels +
--                     tk_ticket_labels), separate from the single category.
--   * Timeline      — auto-logged activity events (tk_events): opened, status
--                     changed, assigned, priority changed, labeled/unlabeled.
--   * Reactions     — emoji reactions on comments (tk_comment_reactions).
--   * Comment edit  — sp_update_ticket_comment (author-only, tenant-scoped).
--
-- Every new procedure is company-scoped (IDOR-safe) via a join/guard against
-- tk_tickets / tk_labels, matching migrations 003 & 006. sp_get_tickets and
-- sp_get_ticket are redefined to embed the ticket's labels as a JSON array.
-- Apply BEFORE/with the matching server build (needs a privileged MySQL user —
-- CREATE TABLE / ALTER ROUTINE):
--   mysql -u root -p lettersheets < server/migrations/007_ticketing_github_features.sql
-- ============================================================================


-- ---------- Tables ----------

CREATE TABLE IF NOT EXISTS `tk_labels` (
  `id`          char(36)     NOT NULL DEFAULT (uuid()),
  `company_id`  char(36)     NOT NULL,
  `name`        varchar(50)  NOT NULL,
  `color`       varchar(7)   DEFAULT '#6366f1',
  `description` varchar(255) DEFAULT NULL,
  `is_deleted`  tinyint(1)   DEFAULT '0',
  `created_at`  timestamp    NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tklabel` (`company_id`,`is_deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `tk_ticket_labels` (
  `ticket_id` char(36) NOT NULL,
  `label_id`  char(36) NOT NULL,
  PRIMARY KEY (`ticket_id`,`label_id`),
  KEY `idx_ttl_label` (`label_id`),
  CONSTRAINT `tk_ticket_labels_ibfk_1` FOREIGN KEY (`ticket_id`) REFERENCES `tk_tickets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `tk_ticket_labels_ibfk_2` FOREIGN KEY (`label_id`)  REFERENCES `tk_labels`  (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `tk_events` (
  `id`         char(36)    NOT NULL DEFAULT (uuid()),
  `ticket_id`  char(36)    NOT NULL,
  `actor_id`   char(36)    DEFAULT NULL,
  `event_type` varchar(30) NOT NULL,
  `old_value`  varchar(255) DEFAULT NULL,
  `new_value`  varchar(255) DEFAULT NULL,
  `created_at` timestamp   NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tkevt` (`ticket_id`,`created_at`),
  CONSTRAINT `tk_events_ibfk_1` FOREIGN KEY (`ticket_id`) REFERENCES `tk_tickets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `tk_comment_reactions` (
  `comment_id` char(36)    NOT NULL,
  `user_id`    char(36)    NOT NULL,
  `emoji`      varchar(16) NOT NULL,
  `created_at` timestamp   NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`comment_id`,`user_id`,`emoji`),
  KEY `idx_tkreact` (`comment_id`),
  CONSTRAINT `tk_comment_reactions_ibfk_1` FOREIGN KEY (`comment_id`) REFERENCES `tk_comments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- ---------- Labels: CRUD ----------

DROP PROCEDURE IF EXISTS `sp_get_labels`;
delimiter ;;
CREATE PROCEDURE `sp_get_labels`(IN p_cid CHAR(36))
BEGIN
    SELECT id, company_id, name, color, description, is_deleted, created_at
    FROM tk_labels
    WHERE company_id = p_cid AND is_deleted = 0
    ORDER BY name;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_create_label`;
delimiter ;;
CREATE PROCEDURE `sp_create_label`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_name VARCHAR(50), IN p_color VARCHAR(7), IN p_desc VARCHAR(255))
BEGIN
    INSERT INTO tk_labels (id, company_id, name, color, description)
    VALUES (p_id, p_cid, p_name, IFNULL(p_color, '#6366f1'), NULLIF(p_desc, ''));
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_update_label`;
delimiter ;;
CREATE PROCEDURE `sp_update_label`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_name VARCHAR(50), IN p_color VARCHAR(7), IN p_desc VARCHAR(255))
BEGIN
    UPDATE tk_labels
    SET name = p_name, color = IFNULL(p_color, color), description = NULLIF(p_desc, '')
    WHERE id = p_id AND company_id = p_cid AND is_deleted = 0;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_delete_label`;
delimiter ;;
CREATE PROCEDURE `sp_delete_label`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    -- Remove associations for this company's tickets, then soft-delete the label.
    DELETE tl FROM tk_ticket_labels tl
    JOIN tk_labels l ON l.id = tl.label_id
    WHERE tl.label_id = p_id AND l.company_id = p_cid;

    UPDATE tk_labels SET is_deleted = 1 WHERE id = p_id AND company_id = p_cid;
END
;;
delimiter ;


-- ---------- Labels: ticket associations (company-scoped) ----------

DROP PROCEDURE IF EXISTS `sp_add_ticket_label`;
delimiter ;;
CREATE PROCEDURE `sp_add_ticket_label`(IN p_ticket_id CHAR(36), IN p_label_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    IF NOT EXISTS (SELECT 1 FROM tk_tickets WHERE id = p_ticket_id AND company_id = p_cid AND is_deleted = 0)
       OR NOT EXISTS (SELECT 1 FROM tk_labels WHERE id = p_label_id AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ticket or label not found';
    END IF;
    INSERT IGNORE INTO tk_ticket_labels (ticket_id, label_id) VALUES (p_ticket_id, p_label_id);
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_remove_ticket_label`;
delimiter ;;
CREATE PROCEDURE `sp_remove_ticket_label`(IN p_ticket_id CHAR(36), IN p_label_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    DELETE tl FROM tk_ticket_labels tl
    JOIN tk_tickets t ON t.id = tl.ticket_id AND t.company_id = p_cid
    WHERE tl.ticket_id = p_ticket_id AND tl.label_id = p_label_id;
END
;;
delimiter ;


-- ---------- Timeline events (company-scoped) ----------

DROP PROCEDURE IF EXISTS `sp_add_ticket_event`;
delimiter ;;
CREATE PROCEDURE `sp_add_ticket_event`(IN p_id CHAR(36), IN p_ticket_id CHAR(36), IN p_cid CHAR(36), IN p_actor CHAR(36), IN p_type VARCHAR(30), IN p_old VARCHAR(255), IN p_new VARCHAR(255))
BEGIN
    IF NOT EXISTS (SELECT 1 FROM tk_tickets WHERE id = p_ticket_id AND company_id = p_cid AND is_deleted = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ticket not found';
    END IF;
    INSERT INTO tk_events (id, ticket_id, actor_id, event_type, old_value, new_value)
    VALUES (p_id, p_ticket_id, NULLIF(p_actor, ''), p_type, NULLIF(p_old, ''), NULLIF(p_new, ''));
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_get_ticket_events`;
delimiter ;;
CREATE PROCEDURE `sp_get_ticket_events`(IN p_ticket_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT ev.id, ev.ticket_id, ev.actor_id, ev.event_type, ev.old_value, ev.new_value, ev.created_at,
        CONCAT(e.first_name, ' ', e.last_name) AS actor_name
    FROM tk_events ev
    INNER JOIN tk_tickets t ON t.id = ev.ticket_id AND t.company_id = p_cid
    LEFT JOIN employees e ON e.id = ev.actor_id
    WHERE ev.ticket_id = p_ticket_id
    ORDER BY ev.created_at ASC;
END
;;
delimiter ;


-- ---------- Comment edit (author-only, company-scoped) ----------

DROP PROCEDURE IF EXISTS `sp_update_ticket_comment`;
delimiter ;;
CREATE PROCEDURE `sp_update_ticket_comment`(IN p_id CHAR(36), IN p_cid CHAR(36), IN p_author CHAR(36), IN p_content TEXT)
BEGIN
    UPDATE tk_comments c
    INNER JOIN tk_tickets t ON t.id = c.ticket_id AND t.company_id = p_cid
    SET c.content = p_content
    WHERE c.id = p_id AND c.author_id = p_author AND c.is_deleted = 0;
END
;;
delimiter ;


-- ---------- Reactions (company-scoped, toggle) ----------

DROP PROCEDURE IF EXISTS `sp_toggle_comment_reaction`;
delimiter ;;
CREATE PROCEDURE `sp_toggle_comment_reaction`(IN p_comment_id CHAR(36), IN p_cid CHAR(36), IN p_user CHAR(36), IN p_emoji VARCHAR(16))
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM tk_comments c
        INNER JOIN tk_tickets t ON t.id = c.ticket_id
        WHERE c.id = p_comment_id AND t.company_id = p_cid AND c.is_deleted = 0
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Comment not found';
    END IF;

    IF EXISTS (SELECT 1 FROM tk_comment_reactions WHERE comment_id = p_comment_id AND user_id = p_user AND emoji = p_emoji) THEN
        DELETE FROM tk_comment_reactions WHERE comment_id = p_comment_id AND user_id = p_user AND emoji = p_emoji;
    ELSE
        INSERT INTO tk_comment_reactions (comment_id, user_id, emoji) VALUES (p_comment_id, p_user, p_emoji);
    END IF;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_get_ticket_reactions`;
delimiter ;;
CREATE PROCEDURE `sp_get_ticket_reactions`(IN p_ticket_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT r.comment_id, r.emoji, r.user_id
    FROM tk_comment_reactions r
    INNER JOIN tk_comments c ON c.id = r.comment_id
    INNER JOIN tk_tickets t ON t.id = c.ticket_id AND t.company_id = p_cid
    WHERE c.ticket_id = p_ticket_id;
END
;;
delimiter ;


-- ---------- Tickets: embed labels JSON (redefine, adds trailing `labels` col) ----------

DROP PROCEDURE IF EXISTS `sp_get_tickets`;
delimiter ;;
CREATE PROCEDURE `sp_get_tickets`(IN p_cid CHAR(36), IN p_status VARCHAR(20), IN p_priority VARCHAR(10), IN p_catid CHAR(36), IN p_assigned CHAR(36), IN p_created CHAR(36))
BEGIN
    SELECT t.*,
        c.name AS category_name, c.color AS category_color, c.icon AS category_icon,
        CONCAT(e1.first_name, ' ', e1.last_name) AS created_by_name,
        CONCAT(e2.first_name, ' ', e2.last_name) AS assigned_to_name,
        (SELECT COUNT(*) FROM tk_comments WHERE ticket_id = t.id AND is_deleted = 0) AS comment_count,
        CASE
            WHEN t.status IN ('Resolved','Closed') THEN 0
            WHEN t.due_date IS NOT NULL AND NOW() > t.due_date THEN 1
            ELSE 0
        END AS is_overdue,
        (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', l.id, 'name', l.name, 'color', l.color))
           FROM tk_ticket_labels tl
           INNER JOIN tk_labels l ON l.id = tl.label_id AND l.is_deleted = 0
          WHERE tl.ticket_id = t.id) AS labels
    FROM tk_tickets t
    LEFT JOIN tk_categories c ON c.id = t.category_id
    LEFT JOIN employees e1 ON e1.id = t.created_by
    LEFT JOIN employees e2 ON e2.id = t.assigned_to
    WHERE t.company_id = p_cid AND t.is_deleted = 0
      AND (p_status = '' OR t.status = p_status)
      AND (p_priority = '' OR t.priority = p_priority)
      AND (p_catid = '' OR t.category_id = p_catid)
      AND (p_assigned = '' OR t.assigned_to = p_assigned)
      AND (p_created = '' OR t.created_by = p_created)
    ORDER BY
        FIELD(t.priority, 'Urgent','High','Medium','Low'),
        FIELD(t.status, 'Open','In Progress','On Hold','Resolved','Closed'),
        t.created_at DESC;
END
;;
delimiter ;

DROP PROCEDURE IF EXISTS `sp_get_ticket`;
delimiter ;;
CREATE PROCEDURE `sp_get_ticket`(IN p_id CHAR(36), IN p_cid CHAR(36))
BEGIN
    SELECT t.*,
        c.name AS category_name, c.color AS category_color, c.icon AS category_icon, c.sla_hours,
        CONCAT(e1.first_name, ' ', e1.last_name) AS created_by_name,
        CONCAT(e2.first_name, ' ', e2.last_name) AS assigned_to_name,
        CASE WHEN t.status NOT IN ('Resolved','Closed') AND t.due_date IS NOT NULL AND NOW() > t.due_date THEN 1 ELSE 0 END AS is_overdue,
        (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', l.id, 'name', l.name, 'color', l.color))
           FROM tk_ticket_labels tl
           INNER JOIN tk_labels l ON l.id = tl.label_id AND l.is_deleted = 0
          WHERE tl.ticket_id = t.id) AS labels
    FROM tk_tickets t
    LEFT JOIN tk_categories c ON c.id = t.category_id
    LEFT JOIN employees e1 ON e1.id = t.created_by
    LEFT JOIN employees e2 ON e2.id = t.assigned_to
    WHERE t.id = p_id AND t.company_id = p_cid AND t.is_deleted = 0;
END
;;
delimiter ;


-- ============================================================================
-- Migration 010: Inventory module (appended)
-- ============================================================================

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


-- ============================================================================
-- Migration 011: Fixed Assets module (appended)
-- ============================================================================

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


-- ============================================================================
-- Migration 012: Sales / Order Management module (appended)
-- ============================================================================

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
