# LetterSheets — HR Module User Manual

A simple, task-oriented guide to the Human Resources module. Currency is Philippine Peso (₱) and statutory defaults follow Philippine rules (SSS, PhilHealth, Pag-IBIG, BIR).

---

## Getting started

Open the app and sign in, then go to the **HR** module. The HR module has these sections (tabs):

| Section | What it's for |
|---|---|
| **Overview** | Dashboard summary of your workforce |
| **Employees** | The staff roster and each person's record |
| **Departments** | Company departments |
| **Positions** | Job titles / roles |
| **Schedules** | Work-hour schedules (shifts) |
| **Attendance** | Daily clock in / clock out |
| **Leave** | Leave requests and approvals |
| **Onboarding** | New-hire checklists |
| **Payroll** | Pay runs and payslips |
| **Benefits** | Benefit plans (HMO, allowances, etc.) |
| **Loans** | Employee loans |
| **Compliance** | Government contributions and filings |

### Recommended setup order

If you're starting fresh, set things up in this order so later steps have the data they need:

1. **Departments** →
2. **Positions** →
3. **Schedules** →
4. **Compliance** (pick your country template) →
5. **Benefits** and **Loan Types** →
6. **Employees** (now you can assign department, position, salary, benefits) →
7. Day-to-day: **Attendance**, **Leave**, **Onboarding**, **Payroll**.

### A note on privacy (important)

Sensitive employee data — **salary, email, phone, birth date, address, government IDs, and bank details** — is **encrypted in your browser** before it is saved. The server never sees these in plain text. This is why:

- You must be **logged in** for the app to read/show these fields (it decrypts them locally). If you see `[decrypt error]`, log out and log back in.
- **Payroll is calculated on your computer**, not the server, because it needs to read salaries.

---

## Overview (dashboard)

The landing page. Read-only — it summarizes everything:

- Top tiles: **Total Employees**, **Present Today**, **On Leave**, **Monthly Payroll**.
- Cards for Recent Employees, Departments, Compliance Status, Pending Leave, Onboarding progress, recent Payroll runs, and Active Loans.
- Use the **View all →**, **Manage →**, and **Details →** links to jump into any section.

---

## Departments

Group your company into departments.

**Add a department**
1. Go to **Departments** → click **Add Department**.
2. Enter a **Department Name** (required) and pick a **color**.
3. Optionally add a **Description**.
4. Click **Add Department**.

**View / edit** — click a department row. The panel has a **Details** tab and an **Employees** tab listing its members. Use **Edit** to change it or **Delete** to remove it.

Search with the **Search departments…** box.

---

## Positions

Define job titles and their pay rules.

**Add a position**
1. Go to **Positions** → click **Add Position**.
2. Enter a **Position Title** (required).
3. Optionally set the **Department**, **Level** (Entry → C-Level), an **OT Multiplier** (e.g. `1.25`), and a **Description**.
4. Click **Add Position**.

> **OT Rate:** leave it at `0` to use the company default (1.25×). The list shows the multiplier like `1.25×`.

Filter by department with the **All Departments** dropdown; click a position to see who holds it.

---

## Schedules (work hours)

Define shifts and the numbers payroll uses.

**Add a schedule**
1. Go to **Schedules** → click **Add Schedule**.
2. **Details tab:** enter a **Schedule Name** (required), pick a **Type** (Fixed / Flexible / Rotating), and set:
   - **Hours / Day** (default 8)
   - **Working Days / Month** (default 22) — used as *daily rate = monthly salary ÷ this number*
   - **Night Diff %** (e.g. `0.10` for a 10% premium on hours worked 10 PM–6 AM)
   - Tick **Company Default** to make this the fallback schedule.
3. **Days tab:** for each weekday set **start time**, **end time**, and **break minutes**, or toggle a day to **Rest**. (Default: Mon–Fri 08:00–17:00 with a 60-min break; Sat/Sun rest.)
4. **Assignments tab:** attach the schedule to whole **Departments** or **Positions** so their staff use it automatically (individual employees can still be overridden).
5. Click **Add Schedule**.

---

## Employees

The heart of the module — the staff roster and each person's full record.

**Add an employee**
1. Go to **Employees** → click **Add Employee**.
2. Fill in the tabs (required fields marked below):
   - **Personal:** First Name*, Last Name*, Middle Name, Email*, Phone (with country code), Date of Birth, Address.
   - **Employment:** Department*, Position*, Start Date*, Type* (Regular / Probationary / Contractual / Part-time), Status* (Active / On Leave / Suspended / Terminated).
   - **Compensation:** Basic Monthly Salary* (₱), and toggle which company **benefits** they're enrolled in.
   - **Government IDs:** SSS, PhilHealth, Pag-IBIG, TIN.
   - **Bank:** Bank Name, Account Number.
3. Click **Save**.

> Fields in **Compensation**, **Government IDs**, and **Bank** are marked **Encrypted** — they're protected in your browser before saving.

**View / edit** — click any employee. Use **Edit** to change details or **Delete** to remove them. Search with **Search employees…** (matches name, department, or position).

**Giving an employee a login account (optional)**
- In the employee panel you can **create a login account** (username + an auto-generated temporary password — use **Generate**), or link to an existing user.
- The **Permissions** tab controls which modules/functions that person can access. (Self-service access is always included.)
- Use **reset password** to issue a new temporary password. Passwords are hashed and can never be displayed.

---

## Attendance

Track daily clock in / clock out. (Regular employees can only view their own record.)

**Add / edit a record**
1. Go to **Attendance**. Pick the **date** at the top; optionally filter by **department** or search a name.
2. Click **Add Record** (admins) — pick the **Employee** and set a **Status** (required).
3. Optionally enter **Clock In**, **Clock Out**, and **Remarks**. Click **Add Record**.
4. Click an existing row to **Edit** or **Delete** it.

**Statuses:** Present, Absent, Late, Half Day, On Leave, Holiday, Rest Day. These drive payroll (see below).

---

## Leave

File and approve time off.

**File a request**
1. Go to **Leave** → **New Request**.
2. Choose the **Employee** (admins), a **Leave Type**, and the **Start / End Date**. **Days** auto-calculates (you can adjust, minimum 0.5). Add a **Reason**.
3. Click **Submit Request**. It starts as **Pending**.

**Approve / reject** (admins)
- Use the **Pending** tab. On a pending row, click the **check** to approve or the **✕** to reject (you can add a rejection note).
- Filter with the **All / Pending / Approved / Rejected** tabs.

**Leave types:** Vacation, Sick, Emergency, Maternity, Paternity, Bereavement, Unpaid.

---

## Onboarding

A drag-and-drop board for getting new hires set up.

**First, create a template**
1. Go to **Onboarding** → **Templates** → **New Template**.
2. Name it (e.g. *Pre-Employment Documents*), then add checklist items (e.g. *Birth Certificate, NBI Clearance, Contract Signed*). Mark items **Required** as needed. Save.
3. Each template becomes a **column** on the board.

**Start onboarding a hire**
1. On the board click **New Onboarding**, pick the **Employee**, set a **Target Completion Date**, and click **Start Onboarding**.
2. **Drag** the person's card between columns to move them through stages.
3. Click a card to open the **checklist**: tick items as they're completed, or add custom items. Progress and an **Overdue** flag show automatically; reaching 100% marks them **Completed**.

---

## Payroll

Create pay runs, compute pay, and approve. (Employees see only their finished payslips.)

**One-time setup**
1. Go to **Payroll** → **Settings**.
2. Set the **Pay Schedule** (Semi-Monthly or Monthly), **Working Days/Month**, **Hours/Day**, **OT Multiplier**, and **Night Diff %**.
3. Toggle which deductions apply: **SSS**, **PhilHealth**, **Pag-IBIG (HDMF)**, **Withholding Tax**. Click **Save Settings**.

**Run payroll**
1. Click **New Run**, set the **Period Start / End** (auto-filled from your schedule), and click **Create Run**. It starts as **Draft**.
2. Open the run and click **⚡ Compute Payroll**. The app reads attendance for the period and each employee's (encrypted) salary and calculates:
   - **Basic pay** from days worked (Present/Late = 1 day, Half Day = 0.5; Absent, On Leave, Holiday, and Rest Day are not paid),
   - **Overtime**, **statutory deductions** (SSS, PhilHealth, Pag-IBIG, BIR tax), and any **active loan** repayment.
3. Review the per-employee table and totals (**Gross, Deductions, Net**).
4. Click **Approve** when correct. (Use **Delete** to discard a draft.)

> **Why it can be slow:** payroll math runs in your browser because it must decrypt salaries locally. Stay logged in and keep the tab open while it computes.
>
> **Statutory tables** use Philippine 2024 figures (SSS schedule, PhilHealth 5%, Pag-IBIG, BIR TRAIN graduated tax). Verify against the latest official tables before relying on them for filing.

---

## Benefits

Set up the benefit plans employees can enroll in.

**Add a benefit**
1. Go to **Benefits** → **Add Benefit**.
2. Set the **Benefit Type** (HMO, Life, Dental, Rice Subsidy, Transportation, etc.), **Name**, **Provider** (e.g. Maxicare), **Status**, **Frequency**, and a **Coverage Description**.
3. Under **Tiers & Costs**, add at least one tier with an **Employer ₱** and **Employee ₱** share (use **Add Tier** for more).
4. Save.

Each benefit card shows a cost range and how many employees are **Enrolled**. Open a benefit's **Employees** tab to see who is / isn't enrolled. (Enrollment itself is toggled per person on the employee's **Compensation** tab.)

---

## Loans

Manage employee loans and repayments.

**Set up loan types first**
1. Go to **Loans** → **Loan Types** → **New Type**.
2. Set **Name**, **Max Amount**, **Interest Rate (%)**, **Max Term (months)**, and whether it **Requires Approval**. Save.

**Create a loan**
1. Click **New Loan**, pick the **Employee** and **Loan Type**, enter the **Amount** and **Term (months)**. A box shows the **Interest**, **Total Payable**, and **Monthly Payment**.
2. Click **Submit Application**. It starts as **Pending**.

**Approve and manage**
- On a pending loan, click the **check** to approve (this activates it and sets the due date) or **✕** to reject.
- Open an **Active** loan to **Record Payment** (Manual, Payroll Deduction, or Lump Sum) and watch the balance and progress bar update. Approved active loans are also auto-deducted during payroll.
- **Statuses:** Pending, Approved, Active, Paid, Rejected, Cancelled.

---

## Compliance

Track government contributions and filings.

**First-time setup**
1. Go to **Compliance** → choose your **country template**. For the **Philippines** this preloads **SSS, PhilHealth, Pag-IBIG, and BIR**. (Templates also exist for US, Singapore, UK, India, or start Custom/empty.)
2. Click **Use {Country} Template** (or start empty).

**Manage an agency**
1. Click an agency card, then **Edit** (or **Add Agency** for a new one).
2. Set the **Short Name** (required, e.g. `SSS`), **Full Name**, **Frequency**, **Due Date**, **Last Filed**, and **Status** (Remitted / Filed / Due / Overdue / Not Filed).
3. Under **Contribution Fields**, add the values you track (Currency / Percentage / Text) — e.g. Employer Share, Employee Share, Withholding Tax.
4. Save.

Cards are color-coded by status so you can see at a glance what's **Due** or **Overdue**.

---

## Roles at a glance

- **Admin / HR users** get the full experience: add, edit, approve, run payroll, and manage everyone.
- **Employee-role users** see a self-service view — only their own attendance, leave, loans, and payslips, without admin controls.

---

## Quick tips

- **Stay logged in** to view salaries, IDs, and to run payroll — those need your browser's decryption key.
- Set up **Departments and Positions before Employees** so the dropdowns are populated.
- Set **Payroll Settings** and **Attendance** before computing a run — payroll reads both.
- All amounts are in **Philippine Peso (₱)**; double-check statutory tables against current official rates before filing.
