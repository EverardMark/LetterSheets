# LetterSheets — Deployment Guide

The server side (**MySQL + Go API**) runs on one host via Docker Compose behind a
Caddy reverse proxy that terminates TLS. The **Electron desktop app** is the
client — built with the server's URL and distributed to users as an installer.

```
   Electron desktop app  ──HTTPS──►  Caddy (:443, auto Let's Encrypt)
   (VITE_API_BASE=https://erp.example.com)      │  reverse_proxy
                                                ▼
                                        Go API (:8080, internal)
                                                │
                                                ▼
                                        MySQL 8.4 (internal volume)
```

---

## ⚠️ 0. Security prerequisites — do these FIRST

The audit found live secrets committed to git history. **Do not deploy until:**

1. **Generate brand-new secrets** for production. Never reuse the values from the
   old `server/config.json` / `ppks/LS.pem` — they are compromised.
2. **Purge the old secrets from git history** (so a repo clone can't recover them).
   The full inventory is **7 files** — including three (`server/LS.pem`,
   `server/ERP.pem`, `server/test/company.key`) that are history-only and easy to
   miss. This exact list was tested on an isolated clone: all paths drop to 0
   commits, `git fsck` stays clean, and the source is untouched.
   ```bash
   pip install git-filter-repo            # or: brew install git-filter-repo
   # run on a FRESH clone; filter-repo drops the origin remote by design
   git filter-repo --invert-paths \
     --path fff-recovery-key.json \
     --path test-corporation-recovery-key.json \
     --path ppks/LS.pem \
     --path server/LS.pem \
     --path server/ERP.pem \
     --path server/test/company.key \
     --path server/config.json
   git remote add origin https://github.com/EverardMark/LetterSheets.git
   git push --force --all && git push --force --tags   # coordinate with collaborators first
   ```
   `git rm --cached` (already done for the in-HEAD ones) does NOT remove them from
   history — only a history rewrite does.
3. The database starts **empty** (`deploy/schema.sql` is schema + stored procedures
   only, no data). Users register fresh companies through the app. If you are
   migrating an existing database instead, see §6.

---

## 1. Provision the AWS host

- Launch an **EC2** instance (Ubuntu 22.04+, `t3.small` is a fine start) — or any
  VM. For a managed database instead of the in-compose MySQL, see §7.
- **Security group:** allow inbound **80** and **443** from anywhere, **22** from
  your IP only. Do **not** expose 3306 or 8080.
- Point a **DNS A record** (e.g. `erp.example.com`) at the instance's public IP.
  Caddy needs this to issue the TLS certificate.
- Install Docker + Compose:
  ```bash
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER && newgrp docker
  ```

## 2. Configure secrets

```bash
git clone <your-repo> lettersheets && cd lettersheets
cp deploy/.env.example .env
# edit .env: set LS_DOMAIN, and strong UNIQUE LS_DB_PASSWORD + MYSQL_ROOT_PASSWORD
```

`.env` is git-ignored. Values are injected as `LS_*` environment variables — no
`config.json` is baked into the image. (On ECS/Fargate, supply the same variables
from **AWS Secrets Manager** / the task definition instead of a `.env` file.)

## 3. Launch

```bash
docker compose up -d --build
docker compose logs -f api     # watch for "Connected to database" / "Server starting"
```

On first start MySQL auto-loads `deploy/schema.sql` (66 tables, 240 procedures).
Caddy obtains a Let's Encrypt certificate for `LS_DOMAIN` automatically. Verify:

```bash
curl https://erp.example.com/api/execute?action=health   # {"success":true,"data":{"status":"ok"}}
```

## 4. Build & distribute the Electron client

Build the desktop app pointing at the deployed server, then ship the installer:

```bash
cd app/web
VITE_API_BASE=https://erp.example.com npm run electron:build
# outputs installers under app/web/release/ (dmg / nsis / AppImage)
```

`VITE_API_BASE` is baked into the bundle at build time; every API call becomes
`https://erp.example.com/api/execute`. Rebuild if the server URL changes. (With
`VITE_API_BASE` unset, calls fall back to a relative `/api/execute` — used by the
dev server via its Vite proxy.)

## 5. Verify one real password reset

The password-reset proof-of-possession (finding C2) uses ML-DSA signatures
produced in the browser (`@noble/post-quantum`) and verified server-side
(`cloudflare/circl`). These are cross-library, so confirm interop once with a real
end-to-end reset (register a test user, download the recovery file, run
"Forgot password"). If it fails, the two libraries disagree on the signing
context — tell me and I'll align it.

---

## 6. Upgrading an EXISTING database (not a fresh deploy)

`deploy/schema.sql` contains the fixes from migrations 003–005. It has NOT been
regenerated since, so it is missing every table added from migration 010 onward
(inventory, fixed assets, sales, procurement, returns, leave credits, recurring
entries, onboarding documents, CRM, and 020–022 below). **A fresh deploy from
`schema.sql` alone will be missing those modules** — apply the migrations after
it, or regenerate `schema.sql` from a fully-migrated database with `mysqldump`.

If you have a live database from before this work, apply the migrations in order:

```bash
mysql -u <user> -p lettersheets < server/migrations/003_fix_tenant_scoping.sql
mysql -u <user> -p lettersheets < server/migrations/004_password_reset_challenge.sql
mysql -u <user> -p lettersheets < server/migrations/005_correctness_fixes.sql
```

**Deploy the server and these migrations together** — the Go code now passes
`company_id` into procedures whose signatures changed.

### Migrations 020–022 (fiscal periods, notifications, expense claims)

These are pure DDL (`CREATE TABLE` only, no stored procedures), but `ls_user`
has DML rights and not `CREATE`, so they must be applied **as root**:

```bash
mysql -u root -p lettersheets < server/migrations/020_fiscal_periods.sql
mysql -u root -p lettersheets < server/migrations/021_notifications.sql
mysql -u root -p lettersheets < server/migrations/022_expense_claims.sql
```

Notes on rollout order and behaviour:

- **020 is safe to apply before or after the binary.** The period guard lives in
  Go (`AccountingRepo.PostJournalEntry`) and fails open: with no fiscal year
  generated, every date still posts exactly as it did before. Nothing is
  restricted until someone creates a fiscal year in Accounting → Periods & Close.
- **021 turns nothing on by itself.** Outbound email stays off until the `smtp`
  block in `config.json` sets `enabled: true` plus `host` and `from_email` (see
  `config.json.example`, or the `LS_SMTP_*` environment variables). Until then
  queued messages accumulate as `Pending` and are visible in Settings → Email;
  the worker does not start and nothing is sent.
- **022 needs configuration before use.** Expense claims cannot be approved until
  Expenses → Settings names an employee-reimbursements-payable account, and
  cannot be filed until Expenses → Categories exist and are mapped to expense
  accounts. Both refuse with a plain-English error rather than guessing.

## 7. Optional: managed MySQL (RDS)

For production durability, use **RDS MySQL 8.x** instead of the `db` service:

1. Create the RDS instance (private subnet, security group allowing 3306 from the
   API host only).
2. Load the schema once: `mysql -h <rds-endpoint> -u admin -p < deploy/schema.sql`.
3. Remove the `db` service from `docker-compose.yml` and point the API at RDS:
   set `LS_DB_HOST=<rds-endpoint>` in `.env`.

## 8. Operations

- **Update the app:** `git pull && docker compose up -d --build`.
- **Back up MySQL:**
  `docker compose exec db mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" lettersheets > backup.sql`
  (schema + data; store off-host). For RDS, enable automated snapshots.
- **Config knobs** (all optional `LS_*` env vars): `LS_SESSION_HOURS`,
  `LS_MAX_LOGIN_ATTEMPTS`, `LS_LOCKOUT_MINUTES`, `LS_ALLOWED_ORIGINS`,
  `LS_TRUST_PROXY_HEADERS`, and `LS_TLS_CERT_FILE`/`LS_TLS_KEY_FILE` (only if you
  terminate TLS in the Go server instead of Caddy).
- **Direct TLS with a purchased cert (no Caddy):** point `tls_cert_file` at the
  full chain (leaf cert + CA bundle concatenated, e.g. GoDaddy's `<hash>.crt` +
  `gd_bundle-g2-g1.crt`) and `tls_key_file` at the private key. During the
  client migration window also set `tls_port` (e.g. 443): HTTPS serves there
  while plain HTTP stays on `port` for already-installed clients. Once every
  client targets the HTTPS URL, set `port` to the TLS port and clear `tls_port`
  to stop serving plaintext. Binding 443 as a non-root user needs
  `sudo setcap 'cap_net_bind_service=+ep' /path/to/lettersheets` (re-apply after
  every binary redeploy).
- The API uses **bearer-token** auth (not cookies), so CORS is not a security
  boundary here; `LS_ALLOWED_ORIGINS` can stay empty for the desktop client.
