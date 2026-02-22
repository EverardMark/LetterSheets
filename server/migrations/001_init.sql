-- ============================================================
-- HR SYSTEM - SINGLE DATABASE (MySQL 8.0+)
-- Hybrid Client-Side Encryption Approach
-- Columns suffixed with _enc are encrypted client-side
-- ============================================================

CREATE DATABASE IF NOT EXISTS lettersheets
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_0900_ai_ci;

USE lettersheets;

-- ============================================================
-- DROP TABLES (reverse dependency order)
-- ============================================================
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS change_history;
DROP TABLE IF EXISTS approval_tasks;
DROP TABLE IF EXISTS approval_requests;
DROP TABLE IF EXISTS approval_workflow_transitions;
DROP TABLE IF EXISTS approval_workflow_nodes;
DROP TABLE IF EXISTS approval_workflows;
DROP TABLE IF EXISTS employees;
DROP TABLE IF EXISTS key_recovery_session_shares;
DROP TABLE IF EXISTS key_recovery_sessions;
DROP TABLE IF EXISTS key_recovery_shares;
DROP TABLE IF EXISTS key_recovery_groups;
DROP TABLE IF EXISTS key_recovery;
DROP TABLE IF EXISTS user_invites;
DROP TABLE IF EXISTS user_sessions;
DROP TABLE IF EXISTS user_company_access;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS company_contacts;
DROP TABLE IF EXISTS branches;
DROP TABLE IF EXISTS positions;
DROP TABLE IF EXISTS departments;
DROP TABLE IF EXISTS company_settings;
DROP TABLE IF EXISTS companies;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- COMPANIES
-- ============================================================
CREATE TABLE companies (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    industry VARCHAR(100),
    address VARCHAR(500),
    city VARCHAR(100),
    state VARCHAR(100),
    province VARCHAR(100),

    -- Encryption metadata
    key_algorithm VARCHAR(50) NOT NULL DEFAULT 'AES-256-GCM',
    key_version INT NOT NULL DEFAULT 1,

    -- Plan and limits
    max_employees INT DEFAULT 500,
    plan VARCHAR(50) NOT NULL DEFAULT 'standard',
    is_active TINYINT(1) NOT NULL DEFAULT 1,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- COMPANY SETTINGS
-- ============================================================
CREATE TABLE company_settings (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    company_id VARCHAR(36) NOT NULL,
    timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Manila',
    date_format VARCHAR(20) NOT NULL DEFAULT 'YYYY-MM-DD',
    currency VARCHAR(10) NOT NULL DEFAULT 'PHP',
    fiscal_year_start INT NOT NULL DEFAULT 1,

    -- Payroll settings
    pay_frequency VARCHAR(20) NOT NULL DEFAULT 'semi_monthly',
    pay_day_1 INT DEFAULT 15,
    pay_day_2 INT DEFAULT 30,
    overtime_required_approval TINYINT(1) NOT NULL DEFAULT 1,

    -- Leave settings
    default_vacation_days DECIMAL(5,2) NOT NULL DEFAULT 5.00,
    default_sick_days DECIMAL(5,2) NOT NULL DEFAULT 5.00,
    leave_accrual_type VARCHAR(20) NOT NULL DEFAULT 'yearly',

    -- Employee ID format
    employee_number_prefix VARCHAR(20) DEFAULT 'EMP',
    employee_number_auto TINYINT(1) NOT NULL DEFAULT 1,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uk_company_settings_company (company_id),
    CONSTRAINT fk_company_settings_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB;

-- ============================================================
-- DEPARTMENTS
-- ============================================================
CREATE TABLE departments (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    company_id VARCHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50),
    parent_id VARCHAR(36),
    department_head VARCHAR(36),
    description TEXT,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uk_departments_name (company_id, name),
    UNIQUE KEY uk_departments_code (company_id, code),
    CONSTRAINT fk_departments_company FOREIGN KEY (company_id) REFERENCES companies(id),
    CONSTRAINT fk_departments_parent FOREIGN KEY (parent_id) REFERENCES departments(id)
) ENGINE=InnoDB;

-- ============================================================
-- POSITIONS
-- ============================================================
CREATE TABLE positions (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    company_id VARCHAR(36) NOT NULL,
    department_id VARCHAR(36),
    title VARCHAR(255) NOT NULL,
    code VARCHAR(50),
    `level` INT NOT NULL DEFAULT 1,
    salary_band VARCHAR(50),
    description TEXT,
    max_headcount INT,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uk_positions_code (company_id, code),
    CONSTRAINT fk_positions_company FOREIGN KEY (company_id) REFERENCES companies(id),
    CONSTRAINT fk_positions_department FOREIGN KEY (department_id) REFERENCES departments(id)
) ENGINE=InnoDB;

-- ============================================================
-- BRANCHES
-- ============================================================
CREATE TABLE branches (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    company_id VARCHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50),
    address VARCHAR(500),
    city VARCHAR(100),
    state VARCHAR(100),
    province VARCHAR(100),
    zip_code VARCHAR(20),
    contact_phone VARCHAR(50),
    contact_email VARCHAR(255),
    branch_head VARCHAR(36),
    is_main TINYINT(1) NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uk_branches_name (company_id, name),
    UNIQUE KEY uk_branches_code (company_id, code),
    CONSTRAINT fk_branches_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB;

-- ============================================================
-- COMPANY CONTACTS
-- ============================================================
CREATE TABLE company_contacts (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    company_id VARCHAR(36) NOT NULL,
    employee_id VARCHAR(36),

    name VARCHAR(255) NOT NULL,
    designation VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(50),

    contact_type VARCHAR(50) NOT NULL,
    is_primary TINYINT(1) NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_company_contacts_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB;

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    username VARCHAR(100) NOT NULL,

    -- Authentication
    password_hash VARCHAR(255) NOT NULL,
    salt VARCHAR(255) NOT NULL,
    totp_secret_enc BLOB,

    -- Account state
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    last_login_at DATETIME,
    failed_login_attempts INT NOT NULL DEFAULT 0,
    locked_until DATETIME,
    password_changed_at DATETIME,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uk_users_email (email),
    UNIQUE KEY uk_users_username (username)
) ENGINE=InnoDB;

-- ============================================================
-- USER COMPANY ACCESS
-- ============================================================
CREATE TABLE user_company_access (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    company_id VARCHAR(36) NOT NULL,

    -- Key wrapping
    wrapped_company_key BLOB NOT NULL,
    key_wrap_algorithm VARCHAR(50) NOT NULL DEFAULT 'AES-256-KW',
    key_version INT NOT NULL DEFAULT 1,

    -- Public key
    public_key BLOB NOT NULL,

    -- Role and permissions
    role VARCHAR(50) NOT NULL DEFAULT 'employee',
    permissions JSON,

    is_active TINYINT(1) NOT NULL DEFAULT 1,
    joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uk_user_company (user_id, company_id),
    CONSTRAINT fk_user_access_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_user_access_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB;

-- ============================================================
-- USER SESSIONS
-- ============================================================
CREATE TABLE user_sessions (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    company_id VARCHAR(36) NOT NULL,

    device_info VARCHAR(500),
    ip_address VARCHAR(45),

    is_active TINYINT(1) NOT NULL DEFAULT 1,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_activity_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_sessions_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB;

-- ============================================================
-- USER INVITES
-- ============================================================
CREATE TABLE user_invites (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    company_id VARCHAR(36) NOT NULL,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'employee',
    invited_by VARCHAR(36) NOT NULL,

    wrapped_company_key BLOB NOT NULL,
    invite_token_hash VARCHAR(255) NOT NULL,

    is_accepted TINYINT(1) NOT NULL DEFAULT 0,
    expires_at DATETIME NOT NULL,
    accepted_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_invites_company FOREIGN KEY (company_id) REFERENCES companies(id),
    CONSTRAINT fk_invites_user FOREIGN KEY (invited_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- ============================================================
-- KEY RECOVERY
-- ============================================================
CREATE TABLE key_recovery (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    company_id VARCHAR(36) NOT NULL,

    wrapped_company_key BLOB NOT NULL,
    recovery_code_hash VARCHAR(255) NOT NULL,

    label VARCHAR(100),
    is_used TINYINT(1) NOT NULL DEFAULT 0,
    used_at DATETIME,
    used_by VARCHAR(36),

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_key_recovery_company FOREIGN KEY (company_id) REFERENCES companies(id),
    CONSTRAINT fk_key_recovery_user FOREIGN KEY (used_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- ============================================================
-- KEY RECOVERY SPLIT (Shamir's Secret Sharing)
-- ============================================================
CREATE TABLE key_recovery_groups (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    company_id VARCHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    total_shares INT NOT NULL,
    threshold INT NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_recovery_groups_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB;

CREATE TABLE key_recovery_shares (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    group_id VARCHAR(36) NOT NULL,
    company_id VARCHAR(36) NOT NULL,

    share_index INT NOT NULL,
    encrypted_share BLOB NOT NULL,

    holder_type VARCHAR(20) NOT NULL,
    holder_user_id VARCHAR(36),
    holder_name VARCHAR(255) NOT NULL,
    holder_email VARCHAR(255),

    is_distributed TINYINT(1) NOT NULL DEFAULT 0,
    distributed_at DATETIME,
    is_revoked TINYINT(1) NOT NULL DEFAULT 0,
    revoked_at DATETIME,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_recovery_shares_group FOREIGN KEY (group_id) REFERENCES key_recovery_groups(id) ON DELETE CASCADE,
    CONSTRAINT fk_recovery_shares_company FOREIGN KEY (company_id) REFERENCES companies(id),
    CONSTRAINT fk_recovery_shares_user FOREIGN KEY (holder_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE key_recovery_sessions (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    company_id VARCHAR(36) NOT NULL,
    group_id VARCHAR(36) NOT NULL,

    initiated_by VARCHAR(255) NOT NULL,
    reason TEXT,

    shares_submitted INT NOT NULL DEFAULT 0,
    shares_required INT NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    expires_at DATETIME NOT NULL,
    completed_at DATETIME,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_recovery_sessions_company FOREIGN KEY (company_id) REFERENCES companies(id),
    CONSTRAINT fk_recovery_sessions_group FOREIGN KEY (group_id) REFERENCES key_recovery_groups(id)
) ENGINE=InnoDB;

CREATE TABLE key_recovery_session_shares (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    session_id VARCHAR(36) NOT NULL,
    share_id VARCHAR(36) NOT NULL,

    submitted_share BLOB NOT NULL,
    submitted_by VARCHAR(255) NOT NULL,
    submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_session_shares_session FOREIGN KEY (session_id) REFERENCES key_recovery_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_session_shares_share FOREIGN KEY (share_id) REFERENCES key_recovery_shares(id)
) ENGINE=InnoDB;

-- ============================================================
-- EMPLOYEES
-- ============================================================
CREATE TABLE employees (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    company_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36),
    employee_number VARCHAR(50) NOT NULL,

    -- === PLAINTEXT COLUMNS ===

    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    suffix VARCHAR(20),
    display_name VARCHAR(255) NOT NULL,

    department_id VARCHAR(36),
    position_id VARCHAR(36),
    employment_type VARCHAR(30) NOT NULL,
    employment_status VARCHAR(30) NOT NULL,
    hire_date DATE NOT NULL,
    regularization_date DATE,
    separation_date DATE,
    separation_reason VARCHAR(255),

    reports_to VARCHAR(36),
    branch_id VARCHAR(36),
    location VARCHAR(255),
    work_schedule VARCHAR(100),

    residential_city VARCHAR(100),
    residential_province VARCHAR(100),

    vacation_leave_balance DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    sick_leave_balance DECIMAL(5,2) NOT NULL DEFAULT 0.00,

    -- Derived metadata
    salary_band VARCHAR(20),
    has_bank_account TINYINT(1) DEFAULT 0,
    has_sss TINYINT(1) DEFAULT 0,
    has_tin TINYINT(1) DEFAULT 0,
    has_philhealth TINYINT(1) DEFAULT 0,
    has_pagibig TINYINT(1) DEFAULT 0,
    benefits_enrolled TINYINT(1) DEFAULT 0,

    -- === ENCRYPTED COLUMNS ===

    birth_date_enc BLOB,
    gender_enc BLOB,
    civil_status_enc BLOB,
    nationality_enc BLOB,
    address_enc BLOB,
    personal_email_enc BLOB,
    personal_phone_enc BLOB,
    emergency_contact_enc BLOB,

    sss_number_enc BLOB,
    tin_enc BLOB,
    philhealth_number_enc BLOB,
    pagibig_number_enc BLOB,

    salary_enc BLOB,
    salary_type_enc BLOB,
    daily_rate_enc BLOB,
    hourly_rate_enc BLOB,
    allowances_enc BLOB,

    bank_name_enc BLOB,
    bank_account_number_enc BLOB,
    bank_account_name_enc BLOB,

    tax_status_enc BLOB,
    tax_exemptions_enc BLOB,

    medical_conditions_enc BLOB,
    blood_type_enc BLOB,

    enc_version INT NOT NULL DEFAULT 1,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uk_employees_number (company_id, employee_number),
    CONSTRAINT fk_employees_company FOREIGN KEY (company_id) REFERENCES companies(id),
    CONSTRAINT fk_employees_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_employees_department FOREIGN KEY (department_id) REFERENCES departments(id),
    CONSTRAINT fk_employees_position FOREIGN KEY (position_id) REFERENCES positions(id),
    CONSTRAINT fk_employees_manager FOREIGN KEY (reports_to) REFERENCES employees(id),
    CONSTRAINT fk_employees_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
) ENGINE=InnoDB;

-- ============================================================
-- APPROVAL WORKFLOWS
-- ============================================================
CREATE TABLE approval_workflows (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    company_id VARCHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    request_type VARCHAR(50) NOT NULL,
    description TEXT,

    department_id VARCHAR(36),
    branch_id VARCHAR(36),
    position_level_min INT,
    position_level_max INT,

    priority INT NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_workflows_company FOREIGN KEY (company_id) REFERENCES companies(id),
    CONSTRAINT fk_workflows_department FOREIGN KEY (department_id) REFERENCES departments(id),
    CONSTRAINT fk_workflows_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
) ENGINE=InnoDB;

-- ============================================================
-- APPROVAL WORKFLOW NODES
-- ============================================================
CREATE TABLE approval_workflow_nodes (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    workflow_id VARCHAR(36) NOT NULL,

    name VARCHAR(255) NOT NULL,
    node_type VARCHAR(30) NOT NULL,
    step_order INT NOT NULL,

    approver_type VARCHAR(30),
    approver_value VARCHAR(100),
    min_level INT,

    parallel_mode VARCHAR(20) DEFAULT 'all',
    required_count INT,

    allow_delegation TINYINT(1) NOT NULL DEFAULT 0,

    escalation_hours INT,
    escalation_target VARCHAR(36),

    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_workflow_nodes_workflow FOREIGN KEY (workflow_id) REFERENCES approval_workflows(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- APPROVAL WORKFLOW TRANSITIONS
-- ============================================================
CREATE TABLE approval_workflow_transitions (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    workflow_id VARCHAR(36) NOT NULL,
    from_node_id VARCHAR(36) NOT NULL,
    to_node_id VARCHAR(36) NOT NULL,

    condition_field VARCHAR(100),
    condition_operator VARCHAR(20),
    condition_value VARCHAR(255),

    priority INT NOT NULL DEFAULT 0,
    on_outcome VARCHAR(20) NOT NULL DEFAULT 'approved',

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_transitions_workflow FOREIGN KEY (workflow_id) REFERENCES approval_workflows(id) ON DELETE CASCADE,
    CONSTRAINT fk_transitions_from FOREIGN KEY (from_node_id) REFERENCES approval_workflow_nodes(id) ON DELETE CASCADE,
    CONSTRAINT fk_transitions_to FOREIGN KEY (to_node_id) REFERENCES approval_workflow_nodes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- APPROVAL REQUESTS
-- ============================================================
CREATE TABLE approval_requests (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    company_id VARCHAR(36) NOT NULL,
    workflow_id VARCHAR(36) NOT NULL,
    current_node_id VARCHAR(36),

    request_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(36) NOT NULL,
    requested_by VARCHAR(36) NOT NULL,

    request_metadata JSON,

    status VARCHAR(20) NOT NULL DEFAULT 'pending',

    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    cancelled_at DATETIME,
    cancelled_by VARCHAR(36),
    cancel_reason TEXT,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_approval_requests_company FOREIGN KEY (company_id) REFERENCES companies(id),
    CONSTRAINT fk_approval_requests_workflow FOREIGN KEY (workflow_id) REFERENCES approval_workflows(id),
    CONSTRAINT fk_approval_requests_node FOREIGN KEY (current_node_id) REFERENCES approval_workflow_nodes(id),
    CONSTRAINT fk_approval_requests_requester FOREIGN KEY (requested_by) REFERENCES employees(id),
    CONSTRAINT fk_approval_requests_canceller FOREIGN KEY (cancelled_by) REFERENCES employees(id)
) ENGINE=InnoDB;

-- ============================================================
-- APPROVAL TASKS
-- ============================================================
CREATE TABLE approval_tasks (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    request_id VARCHAR(36) NOT NULL,
    node_id VARCHAR(36) NOT NULL,

    assigned_to VARCHAR(36) NOT NULL,

    delegated_from VARCHAR(36),
    delegated_at DATETIME,

    decision VARCHAR(20),
    remarks TEXT,
    decided_at DATETIME,

    is_escalated TINYINT(1) NOT NULL DEFAULT 0,
    escalated_at DATETIME,
    escalate_after DATETIME,

    notified_at DATETIME,
    reminded_at DATETIME,
    reminder_count INT NOT NULL DEFAULT 0,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_approval_tasks_request FOREIGN KEY (request_id) REFERENCES approval_requests(id) ON DELETE CASCADE,
    CONSTRAINT fk_approval_tasks_node FOREIGN KEY (node_id) REFERENCES approval_workflow_nodes(id),
    CONSTRAINT fk_approval_tasks_assignee FOREIGN KEY (assigned_to) REFERENCES employees(id),
    CONSTRAINT fk_approval_tasks_delegator FOREIGN KEY (delegated_from) REFERENCES employees(id)
) ENGINE=InnoDB;

-- ============================================================
-- CHANGE HISTORY
-- ============================================================
CREATE TABLE change_history (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    company_id VARCHAR(36) NOT NULL,
    changed_by VARCHAR(36) NOT NULL,
    session_id VARCHAR(36),

    table_name VARCHAR(100) NOT NULL,
    record_id VARCHAR(36) NOT NULL,
    change_type VARCHAR(10) NOT NULL,

    field_name VARCHAR(100) NOT NULL,
    old_value LONGTEXT,
    new_value LONGTEXT,
    is_encrypted TINYINT(1) NOT NULL DEFAULT 0,

    ip_address VARCHAR(45),
    user_agent VARCHAR(500),

    changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_change_history_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB;

-- ============================================================
-- DEFERRED FOREIGN KEYS
-- Added after all tables exist to resolve circular dependencies
-- ============================================================

ALTER TABLE departments
    ADD CONSTRAINT fk_departments_head FOREIGN KEY (department_head) REFERENCES employees(id);

ALTER TABLE branches
    ADD CONSTRAINT fk_branches_head FOREIGN KEY (branch_head) REFERENCES employees(id);

ALTER TABLE company_contacts
    ADD CONSTRAINT fk_company_contacts_employee FOREIGN KEY (employee_id) REFERENCES employees(id);

ALTER TABLE change_history
    ADD CONSTRAINT fk_change_history_user FOREIGN KEY (changed_by) REFERENCES users(id),
    ADD CONSTRAINT fk_change_history_session FOREIGN KEY (session_id) REFERENCES user_sessions(id);

-- ============================================================
-- INDEXES
-- ============================================================

-- Companies
CREATE INDEX idx_companies_active ON companies(is_active);

-- Company Settings
CREATE INDEX idx_company_settings_company ON company_settings(company_id);

-- Departments
CREATE INDEX idx_departments_company ON departments(company_id);
CREATE INDEX idx_departments_parent ON departments(parent_id);

-- Positions
CREATE INDEX idx_positions_company ON positions(company_id);
CREATE INDEX idx_positions_department ON positions(company_id, department_id);
CREATE INDEX idx_positions_level ON positions(company_id, `level`);

-- Branches
CREATE INDEX idx_branches_company ON branches(company_id);

-- Company Contacts
CREATE INDEX idx_company_contacts_company ON company_contacts(company_id);
CREATE INDEX idx_company_contacts_employee ON company_contacts(employee_id);

-- Users
CREATE INDEX idx_users_email ON users(email);

-- User Company Access
CREATE INDEX idx_user_access_user ON user_company_access(user_id);
CREATE INDEX idx_user_access_company ON user_company_access(company_id);
CREATE INDEX idx_user_access_role ON user_company_access(company_id, role);

-- Sessions
CREATE INDEX idx_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_sessions_company ON user_sessions(company_id);
CREATE INDEX idx_sessions_expires ON user_sessions(expires_at);

-- Invites
CREATE INDEX idx_invites_company ON user_invites(company_id);
CREATE INDEX idx_invites_email ON user_invites(email);

-- Key Recovery
CREATE INDEX idx_key_recovery_company ON key_recovery(company_id);
CREATE INDEX idx_recovery_groups_company ON key_recovery_groups(company_id);
CREATE INDEX idx_recovery_shares_group ON key_recovery_shares(group_id);
CREATE INDEX idx_recovery_shares_company ON key_recovery_shares(company_id);
CREATE INDEX idx_recovery_shares_holder ON key_recovery_shares(holder_user_id);
CREATE INDEX idx_recovery_sessions_company ON key_recovery_sessions(company_id, status);
CREATE INDEX idx_recovery_session_shares_session ON key_recovery_session_shares(session_id);

-- Employees
CREATE INDEX idx_employees_company ON employees(company_id);
CREATE INDEX idx_employees_user ON employees(user_id);
CREATE INDEX idx_employees_department ON employees(company_id, department_id);
CREATE INDEX idx_employees_position ON employees(company_id, position_id);
CREATE INDEX idx_employees_branch ON employees(company_id, branch_id);
CREATE INDEX idx_employees_status ON employees(company_id, employment_status);
CREATE INDEX idx_employees_manager ON employees(reports_to);
CREATE INDEX idx_employees_number ON employees(company_id, employee_number);
CREATE INDEX idx_employees_name ON employees(company_id, last_name, first_name);
CREATE INDEX idx_employees_salary_band ON employees(company_id, salary_band);
CREATE INDEX idx_employees_hire_date ON employees(company_id, hire_date);
CREATE INDEX idx_employees_location ON employees(company_id, residential_province, residential_city);

-- Approval Workflows
CREATE INDEX idx_workflows_company ON approval_workflows(company_id);
CREATE INDEX idx_workflows_type ON approval_workflows(company_id, request_type);
CREATE INDEX idx_workflows_scope ON approval_workflows(company_id, department_id, branch_id);

-- Workflow Nodes
CREATE INDEX idx_workflow_nodes_workflow ON approval_workflow_nodes(workflow_id, step_order);

-- Workflow Transitions
CREATE INDEX idx_workflow_transitions_from ON approval_workflow_transitions(from_node_id);
CREATE INDEX idx_workflow_transitions_workflow ON approval_workflow_transitions(workflow_id);

-- Approval Requests
CREATE INDEX idx_approval_requests_company ON approval_requests(company_id, status);
CREATE INDEX idx_approval_requests_requester ON approval_requests(requested_by, status);
CREATE INDEX idx_approval_requests_entity ON approval_requests(request_type, entity_id);
CREATE INDEX idx_approval_requests_workflow ON approval_requests(workflow_id);

-- Approval Tasks
CREATE INDEX idx_approval_tasks_request ON approval_tasks(request_id);
CREATE INDEX idx_approval_tasks_assignee ON approval_tasks(assigned_to, decision);

-- Change History
CREATE INDEX idx_change_history_company ON change_history(company_id, changed_at);
CREATE INDEX idx_change_history_user ON change_history(changed_by, changed_at);
CREATE INDEX idx_change_history_record ON change_history(table_name, record_id, changed_at);
CREATE INDEX idx_change_history_field ON change_history(table_name, field_name, changed_at);
CREATE INDEX idx_change_history_type ON change_history(change_type, changed_at);
