package repository

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"time"

	"lettersheets/internal/models"

	"github.com/google/uuid"
)

// LeaveCreditRepo owns accrual-based leave credits. A benefit of type 'leave'
// carries the plan (leave_credit_plans); enrolling an employee in that benefit
// provisions an account; approvals draw it down via the ledger. Plain SQL —
// ls_user has DML but not CREATE ROUTINE, and the accrual math lives in Go.
type LeaveCreditRepo struct {
	db *sql.DB
}

func NewLeaveCreditRepo(db *sql.DB) *LeaveCreditRepo {
	return &LeaveCreditRepo{db: db}
}

const dateLayout = "2006-01-02"

func round2(f float64) float64 { return math.Round(f*100) / 100 }

// parseDBDate parses a date string as returned by the driver. With
// parseTime=true in the DSN, DATE columns come back as time.Time and, when
// scanned into a string, render as RFC3339 ("2026-01-01T00:00:00Z") — so a bare
// "2006-01-02" parse would fail. Accept both forms; result is truncated to date.
func parseDBDate(s string) (time.Time, bool) {
	if s == "" {
		return time.Time{}, false
	}
	for _, layout := range []string{dateLayout, time.RFC3339, "2006-01-02 15:04:05"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UTC().Truncate(24 * time.Hour), true
		}
	}
	return time.Time{}, false
}

// ---------------------------------------------------------------------------
// Plans (config carried by a 'leave' benefit)
// ---------------------------------------------------------------------------

// SavePlan upserts the credit plan for a Leave benefit.
func (r *LeaveCreditRepo) SavePlan(ctx context.Context, companyID string, p *models.LeaveCreditPlan) error {
	var ok int
	err := r.db.QueryRowContext(ctx,
		"SELECT 1 FROM benefits WHERE id = ? AND company_id = ? AND is_deleted = 0",
		p.BenefitID, companyID).Scan(&ok)
	if err == sql.ErrNoRows {
		return sql.ErrNoRows
	}
	if err != nil {
		return err
	}
	if p.AccrualType != "yearly" {
		p.AccrualType = "monthly"
	}
	_, err = r.db.ExecContext(ctx, `
		INSERT INTO leave_credit_plans
			(id, company_id, benefit_id, leave_type, annual_days, accrual_type, carryover_cap)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
			leave_type    = VALUES(leave_type),
			annual_days   = VALUES(annual_days),
			accrual_type  = VALUES(accrual_type),
			carryover_cap = VALUES(carryover_cap)`,
		uuid.New().String(), companyID, p.BenefitID, p.LeaveType, p.AnnualDays, p.AccrualType, p.CarryoverCap)
	return err
}

// GetPlan returns the plan for a benefit, or nil if none configured.
func (r *LeaveCreditRepo) GetPlan(ctx context.Context, companyID, benefitID string) (*models.LeaveCreditPlan, error) {
	var p models.LeaveCreditPlan
	var created, updated sql.NullString
	err := r.db.QueryRowContext(ctx, `
		SELECT id, company_id, benefit_id, leave_type, annual_days, accrual_type, carryover_cap, created_at, updated_at
		FROM leave_credit_plans WHERE company_id = ? AND benefit_id = ?`, companyID, benefitID).
		Scan(&p.ID, &p.CompanyID, &p.BenefitID, &p.LeaveType, &p.AnnualDays, &p.AccrualType, &p.CarryoverCap, &created, &updated)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	p.CreatedAt = created.String
	p.UpdatedAt = updated.String
	return &p, nil
}

// ---------------------------------------------------------------------------
// Sync accounts to the benefit's enrollment (enrolled_benefits JSON)
// ---------------------------------------------------------------------------

// SyncAccountsForBenefit provisions an account for every employee enrolled in the
// benefit and deactivates accounts of employees no longer enrolled. Idempotent;
// preserves accrual progress (start/last_accrued) on re-provision.
func (r *LeaveCreditRepo) SyncAccountsForBenefit(ctx context.Context, companyID, benefitID string) error {
	plan, err := r.GetPlan(ctx, companyID, benefitID)
	if err != nil || plan == nil {
		return err
	}

	rows, err := r.db.QueryContext(ctx, `
		SELECT id, COALESCE(joined_date, '') FROM employees
		WHERE company_id = ? AND is_deleted = 0
		  AND JSON_CONTAINS(enrolled_benefits, JSON_QUOTE(?))`, companyID, benefitID)
	if err != nil {
		return err
	}
	type emp struct{ id, joined string }
	var enrolled []emp
	for rows.Next() {
		var e emp
		if err := rows.Scan(&e.id, &e.joined); err != nil {
			rows.Close()
			return err
		}
		enrolled = append(enrolled, e)
	}
	rows.Close()

	today := time.Now().Format(dateLayout)
	enrolledIDs := make([]any, 0, len(enrolled))
	for _, e := range enrolled {
		start := e.joined
		if start == "" {
			start = today
		}
		if err := r.provisionAccount(ctx, companyID, e.id, benefitID, plan, start); err != nil {
			return err
		}
		enrolledIDs = append(enrolledIDs, e.id)
	}

	// Deactivate accounts for this benefit whose employee is no longer enrolled.
	if len(enrolledIDs) == 0 {
		_, err = r.db.ExecContext(ctx,
			"UPDATE leave_credit_accounts SET active = 0 WHERE company_id = ? AND benefit_id = ?",
			companyID, benefitID)
		return err
	}
	q := "UPDATE leave_credit_accounts SET active = 0 WHERE company_id = ? AND benefit_id = ? AND employee_id NOT IN (" +
		placeholders(len(enrolledIDs)) + ")"
	args := append([]any{companyID, benefitID}, enrolledIDs...)
	_, err = r.db.ExecContext(ctx, q, args...)
	return err
}

// provisionAccount upserts an active account from a plan. On an existing row it
// refreshes config + reactivates, but keeps accrual_start_date/last_accrued_date
// so accrual progress is never lost.
func (r *LeaveCreditRepo) provisionAccount(ctx context.Context, companyID, employeeID, benefitID string, plan *models.LeaveCreditPlan, start string) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO leave_credit_accounts
			(id, company_id, employee_id, leave_type, benefit_id, annual_days, accrual_type, accrual_start_date, carryover_cap, active)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
		ON DUPLICATE KEY UPDATE
			benefit_id    = VALUES(benefit_id),
			annual_days   = VALUES(annual_days),
			accrual_type  = VALUES(accrual_type),
			carryover_cap = VALUES(carryover_cap),
			active        = 1`,
		uuid.New().String(), companyID, employeeID, plan.LeaveType, benefitID,
		plan.AnnualDays, plan.AccrualType, start, plan.CarryoverCap)
	return err
}

// ---------------------------------------------------------------------------
// Accrual engine — posts due accrual rows up to today. Idempotent.
// ---------------------------------------------------------------------------

func firstOfNextMonth(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC).AddDate(0, 1, 0)
}

// accrualDates returns the scheduled accrual dates in (afterExclusive, today].
// yearly grants at the start date and each anniversary; monthly accrues on the
// first of each month after the start month.
func accrualDates(start, today time.Time, accrualType string, last *time.Time) []time.Time {
	first := firstOfNextMonth(start)
	add := func(t time.Time) time.Time { return t.AddDate(0, 1, 0) }
	if accrualType == "yearly" {
		first = start
		add = func(t time.Time) time.Time { return t.AddDate(1, 0, 0) }
	}
	afterExclusive := start.AddDate(0, 0, -1)
	if last != nil {
		afterExclusive = *last
	}
	var out []time.Time
	for d := first; !d.After(today); d = add(d) {
		if d.After(afterExclusive) {
			out = append(out, d)
		}
	}
	return out
}

// PostAccruals catches up accrual for every active account in the company.
func (r *LeaveCreditRepo) PostAccruals(ctx context.Context, companyID string) (int, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, employee_id, leave_type, annual_days, accrual_type, accrual_start_date, carryover_cap, last_accrued_date
		FROM leave_credit_accounts WHERE company_id = ? AND active = 1`, companyID)
	if err != nil {
		return 0, err
	}
	var accts []models.LeaveCreditAccount
	for rows.Next() {
		var a models.LeaveCreditAccount
		var start sql.NullString
		if err := rows.Scan(&a.ID, &a.EmployeeID, &a.LeaveType, &a.AnnualDays, &a.AccrualType,
			&start, &a.CarryoverCap, &a.LastAccruedDate); err != nil {
			rows.Close()
			return 0, err
		}
		a.AccrualStartDate = start.String
		accts = append(accts, a)
	}
	rows.Close()

	today := time.Now().UTC().Truncate(24 * time.Hour)
	posted := 0
	for i := range accts {
		n, err := r.postForAccount(ctx, companyID, &accts[i], today)
		if err != nil {
			return posted, err
		}
		posted += n
	}
	return posted, nil
}

func (r *LeaveCreditRepo) postForAccount(ctx context.Context, companyID string, a *models.LeaveCreditAccount, today time.Time) (int, error) {
	start, ok := parseDBDate(a.AccrualStartDate)
	if !ok {
		return 0, nil // skip malformed
	}
	var last *time.Time
	if a.LastAccruedDate != nil {
		if lt, ok := parseDBDate(*a.LastAccruedDate); ok {
			last = &lt
		}
	}
	dates := accrualDates(start, today, a.AccrualType, last)
	if len(dates) == 0 {
		return 0, nil
	}

	rate := a.AnnualDays
	if a.AccrualType != "yearly" {
		rate = a.AnnualDays / 12
	}
	bal, err := r.balance(ctx, a.EmployeeID, a.LeaveType)
	if err != nil {
		return 0, err
	}

	posted := 0
	for _, d := range dates {
		amt := round2(rate)
		if a.CarryoverCap != nil && bal+amt > *a.CarryoverCap {
			amt = round2(math.Max(0, *a.CarryoverCap-bal))
		}
		if amt > 0 {
			bal = round2(bal + amt)
			if err := r.insertTxn(ctx, companyID, a.EmployeeID, a.LeaveType, "accrual", amt, bal, d, "Accrual", nil); err != nil {
				return posted, err
			}
			posted++
		}
	}
	final := dates[len(dates)-1].Format(dateLayout)
	if _, err := r.db.ExecContext(ctx,
		"UPDATE leave_credit_accounts SET last_accrued_date = ? WHERE id = ?", final, a.ID); err != nil {
		return posted, err
	}
	return posted, nil
}

// ---------------------------------------------------------------------------
// Usage on leave approval / reversal on reject-delete
// ---------------------------------------------------------------------------

// RecordUsageForLeave deducts an approved leave from its matching active account,
// once. No-op if there is no active account for the leave's type.
func (r *LeaveCreditRepo) RecordUsageForLeave(ctx context.Context, companyID, leaveID string) error {
	var empID, leaveType, status string
	var days float64
	err := r.db.QueryRowContext(ctx, `
		SELECT employee_id, leave_type, days, status FROM leaves
		WHERE id = ? AND company_id = ? AND is_deleted = 0`, leaveID, companyID).Scan(&empID, &leaveType, &days, &status)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return err
	}
	if status != "Approved" || days <= 0 {
		return nil
	}
	var exists int
	if err := r.db.QueryRowContext(ctx,
		"SELECT 1 FROM leave_credit_accounts WHERE company_id = ? AND employee_id = ? AND leave_type = ? AND active = 1",
		companyID, empID, leaveType).Scan(&exists); err == sql.ErrNoRows {
		return nil // not an accruing leave for this employee
	} else if err != nil {
		return err
	}
	net, err := r.leaveNet(ctx, leaveID)
	if err != nil {
		return err
	}
	if net < 0 {
		return nil // already deducted
	}
	bal, err := r.balance(ctx, empID, leaveType)
	if err != nil {
		return err
	}
	bal = round2(bal - days)
	return r.insertTxn(ctx, companyID, empID, leaveType, "usage", -days, bal,
		time.Now(), "Leave "+leaveID[:8], &leaveID)
}

// ReverseForLeave undoes a leave's usage (reject/delete/un-approve). Idempotent.
func (r *LeaveCreditRepo) ReverseForLeave(ctx context.Context, companyID, leaveID string) error {
	var empID, leaveType string
	if err := r.db.QueryRowContext(ctx,
		"SELECT employee_id, leave_type FROM leaves WHERE id = ? AND company_id = ?",
		leaveID, companyID).Scan(&empID, &leaveType); err != nil {
		if err == sql.ErrNoRows {
			return nil
		}
		return err
	}
	net, err := r.leaveNet(ctx, leaveID)
	if err != nil {
		return err
	}
	if net >= 0 {
		return nil
	}
	bal, err := r.balance(ctx, empID, leaveType)
	if err != nil {
		return err
	}
	reversal := round2(-net)
	bal = round2(bal + reversal)
	return r.insertTxn(ctx, companyID, empID, leaveType, "reversal", reversal, bal,
		time.Now(), "Reversal for leave "+leaveID[:8], &leaveID)
}

// Adjust posts a signed manual adjustment.
func (r *LeaveCreditRepo) Adjust(ctx context.Context, companyID, employeeID, leaveType string, days float64, note string) error {
	var exists int
	if err := r.db.QueryRowContext(ctx,
		"SELECT 1 FROM leave_credit_accounts WHERE company_id = ? AND employee_id = ? AND leave_type = ?",
		companyID, employeeID, leaveType).Scan(&exists); err == sql.ErrNoRows {
		return sql.ErrNoRows
	} else if err != nil {
		return err
	}
	bal, err := r.balance(ctx, employeeID, leaveType)
	if err != nil {
		return err
	}
	bal = round2(bal + days)
	if note == "" {
		note = "Manual adjustment"
	}
	return r.insertTxn(ctx, companyID, employeeID, leaveType, "adjustment", round2(days), bal, time.Now(), note, nil)
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

// GetBenefitCredits returns the active accounts (with balances) provisioned by a
// benefit. Call SyncAccountsForBenefit + PostAccruals first for current data.
func (r *LeaveCreditRepo) GetBenefitCredits(ctx context.Context, companyID, benefitID string) ([]models.LeaveCreditAccount, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT a.id, a.company_id, a.employee_id, a.leave_type, a.benefit_id, a.annual_days, a.accrual_type,
		       a.accrual_start_date, a.carryover_cap, a.last_accrued_date, a.active, a.created_at, a.updated_at,
		       COALESCE(e.first_name,''), COALESCE(e.last_name,''),
		       COALESCE(SUM(t.days), 0) AS balance,
		       COALESCE(SUM(CASE WHEN t.txn_type IN ('accrual','opening') THEN t.days ELSE 0 END), 0) AS accrued,
		       COALESCE(SUM(CASE WHEN t.txn_type IN ('usage','reversal') THEN -t.days ELSE 0 END), 0) AS used
		FROM leave_credit_accounts a
		JOIN employees e ON e.id = a.employee_id
		LEFT JOIN leave_credit_transactions t
		       ON t.employee_id = a.employee_id AND t.leave_type = a.leave_type AND t.company_id = a.company_id
		WHERE a.company_id = ? AND a.benefit_id = ? AND a.active = 1
		GROUP BY a.id ORDER BY e.last_name, e.first_name`, companyID, benefitID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []models.LeaveCreditAccount
	for rows.Next() {
		var a models.LeaveCreditAccount
		var start, created, updated sql.NullString
		if err := rows.Scan(&a.ID, &a.CompanyID, &a.EmployeeID, &a.LeaveType, &a.BenefitID, &a.AnnualDays, &a.AccrualType,
			&start, &a.CarryoverCap, &a.LastAccruedDate, &a.Active, &created, &updated,
			&a.FirstName, &a.LastName, &a.Balance, &a.Accrued, &a.Used); err != nil {
			return nil, err
		}
		a.AccrualStartDate = start.String
		a.CreatedAt = created.String
		a.UpdatedAt = updated.String
		a.Balance = round2(a.Balance)
		a.Accrued = round2(a.Accrued)
		a.Used = round2(a.Used)
		out = append(out, a)
	}
	return out, rows.Err()
}

// GetBalances returns active leave-credit accounts (with balance/accrued/used)
// for the company, optionally scoped to one employee. Used by the Leave page and
// employee record to show "days left". Call PostAccruals first for current data.
func (r *LeaveCreditRepo) GetBalances(ctx context.Context, companyID, employeeID string) ([]models.LeaveCreditAccount, error) {
	q := `
		SELECT a.id, a.company_id, a.employee_id, a.leave_type, a.benefit_id, a.annual_days, a.accrual_type,
		       a.accrual_start_date, a.carryover_cap, a.last_accrued_date, a.active, a.created_at, a.updated_at,
		       COALESCE(e.first_name,''), COALESCE(e.last_name,''),
		       COALESCE(SUM(t.days), 0) AS balance,
		       COALESCE(SUM(CASE WHEN t.txn_type IN ('accrual','opening') THEN t.days ELSE 0 END), 0) AS accrued,
		       COALESCE(SUM(CASE WHEN t.txn_type IN ('usage','reversal') THEN -t.days ELSE 0 END), 0) AS used
		FROM leave_credit_accounts a
		JOIN employees e ON e.id = a.employee_id
		LEFT JOIN leave_credit_transactions t
		       ON t.employee_id = a.employee_id AND t.leave_type = a.leave_type AND t.company_id = a.company_id
		WHERE a.company_id = ? AND a.active = 1`
	args := []any{companyID}
	if employeeID != "" {
		q += " AND a.employee_id = ?"
		args = append(args, employeeID)
	}
	q += " GROUP BY a.id ORDER BY e.last_name, e.first_name, a.leave_type"

	rows, err := r.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []models.LeaveCreditAccount
	for rows.Next() {
		var a models.LeaveCreditAccount
		var start, created, updated sql.NullString
		if err := rows.Scan(&a.ID, &a.CompanyID, &a.EmployeeID, &a.LeaveType, &a.BenefitID, &a.AnnualDays, &a.AccrualType,
			&start, &a.CarryoverCap, &a.LastAccruedDate, &a.Active, &created, &updated,
			&a.FirstName, &a.LastName, &a.Balance, &a.Accrued, &a.Used); err != nil {
			return nil, err
		}
		a.AccrualStartDate = start.String
		a.CreatedAt = created.String
		a.UpdatedAt = updated.String
		a.Balance = round2(a.Balance)
		a.Accrued = round2(a.Accrued)
		a.Used = round2(a.Used)
		out = append(out, a)
	}
	return out, rows.Err()
}

// GetTransactions returns the ledger for an employee (optionally one type).
func (r *LeaveCreditRepo) GetTransactions(ctx context.Context, companyID, employeeID, leaveType string) ([]models.LeaveCreditTransaction, error) {
	q := `
		SELECT id, company_id, employee_id, leave_type, txn_type, days, balance_after, effective_date, note, leave_id, created_at
		FROM leave_credit_transactions
		WHERE company_id = ? AND employee_id = ?`
	args := []any{companyID, employeeID}
	if leaveType != "" {
		q += " AND leave_type = ?"
		args = append(args, leaveType)
	}
	q += " ORDER BY effective_date DESC, created_at DESC"

	rows, err := r.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []models.LeaveCreditTransaction
	for rows.Next() {
		var t models.LeaveCreditTransaction
		var eff, created sql.NullString
		if err := rows.Scan(&t.ID, &t.CompanyID, &t.EmployeeID, &t.LeaveType, &t.TxnType,
			&t.Days, &t.BalanceAfter, &eff, &t.Note, &t.LeaveID, &created); err != nil {
			return nil, err
		}
		t.EffectiveDate = eff.String
		t.CreatedAt = created.String
		out = append(out, t)
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

func (r *LeaveCreditRepo) balance(ctx context.Context, employeeID, leaveType string) (float64, error) {
	var bal sql.NullFloat64
	err := r.db.QueryRowContext(ctx,
		"SELECT COALESCE(SUM(days),0) FROM leave_credit_transactions WHERE employee_id = ? AND leave_type = ?",
		employeeID, leaveType).Scan(&bal)
	return round2(bal.Float64), err
}

func (r *LeaveCreditRepo) leaveNet(ctx context.Context, leaveID string) (float64, error) {
	var net sql.NullFloat64
	err := r.db.QueryRowContext(ctx,
		"SELECT COALESCE(SUM(days),0) FROM leave_credit_transactions WHERE leave_id = ?",
		leaveID).Scan(&net)
	return round2(net.Float64), err
}

func (r *LeaveCreditRepo) insertTxn(ctx context.Context, companyID, employeeID, leaveType, txnType string,
	days, balanceAfter float64, effective time.Time, note string, leaveID *string) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO leave_credit_transactions
			(id, company_id, employee_id, leave_type, txn_type, days, balance_after, effective_date, note, leave_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		uuid.New().String(), companyID, employeeID, leaveType, txnType,
		days, balanceAfter, effective.Format(dateLayout), note, leaveID)
	if err != nil {
		return fmt.Errorf("insert leave credit txn: %w", err)
	}
	return nil
}
