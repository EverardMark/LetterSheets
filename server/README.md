# HR System - Hybrid Encryption Architecture

## Overview

This HR system uses a hybrid client-server encryption model where sensitive employee data (salary, government IDs, banking, medical) is encrypted client-side with a company-owned key. The server never sees plaintext for these fields.

## Database Architecture

Single multi-tenant database. All tables filtered by `company_id`. Users are global and can access multiple companies.

```
Tables
  ├── companies
  ├── company_settings
  ├── departments
  ├── positions
  ├── branches
  ├── company_contacts
  ├── users                        (global, no company_id)
  ├── user_company_access          (maps users to companies with keys/roles)
  ├── user_sessions
  ├── user_invites
  ├── key_recovery
  ├── key_recovery_groups
  ├── key_recovery_shares
  ├── key_recovery_sessions
  ├── key_recovery_session_shares
  ├── employees
  ├── approval_workflows
  ├── approval_workflow_nodes
  ├── approval_workflow_transitions
  ├── approval_requests
  ├── approval_tasks
  └── change_history
```

## Login Flow

```
1. User logs in → server authenticates against users table
2. Server queries user_company_access → returns list of companies
3. User selects company → server returns wrapped_company_key + salt
4. Client derives key from password + salt (Argon2id)
5. Client unwraps company master key → held in memory for session
6. All API calls include company_id, server filters all queries by it
7. Client decrypts _enc columns locally as needed
```

## Key Hierarchy

```
Company Master Key (AES-256)
  ├── Generated on company creation by admin's device
  ├── Never sent to server in plaintext
  │
  ├── Wrapped per user → user_company_access.wrapped_company_key
  ├── Wrapped per recovery code → key_recovery.wrapped_company_key
  └── Split via Shamir's → key_recovery_shares.encrypted_share
```

## Data Classification

### Plaintext (Server can read, query, index)
- Employee name, department, position, hire date
- Employment type and status
- Org structure and reporting lines
- Leave balances
- Approval workflow states
- Derived metadata (salary bands, boolean flags)

### Encrypted (Client-side only)
- Salary and compensation details
- Bank account information
- Government IDs (SSS, TIN, PhilHealth, Pag-IBIG)
- Personal address and contact info
- Tax status and exemptions
- Medical information

## Security Invariants

1. Company master key NEVER exists on the server in plaintext
2. Encrypted columns are opaque blobs to the server
3. All changes are tracked in change_history
4. Derived metadata is computed client-side
5. Every query filters by company_id for tenant isolation
6. A user can access multiple companies with separate wrapped keys
7. Even if rows leak across tenants, encrypted data is useless without the key
