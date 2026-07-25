package repository

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"strings"
	"time"

	"lettersheets/internal/models"

	"github.com/google/uuid"
)

// PeriodRepo owns fiscal years and accounting periods — the calendar that says
// which dates the general ledger will still accept a posting for, plus the
// year-end close that rolls Revenue and Expense into equity.
//
// Plain SQL: ls_user has DML but not CREATE ROUTINE, and the calendar math is
// clearer in Go than in a stored procedure anyway.
type PeriodRepo struct {
	db *sql.DB
}

func NewPeriodRepo(db *sql.DB) *PeriodRepo { return &PeriodRepo{db: db} }

// Period statuses. Open is the only one that permits a posting; Locked differs
// from Closed solely in that the UI refuses to reopen it (already-filed periods).
const (
	PeriodOpen   = "Open"
	PeriodClosed = "Closed"
	PeriodLocked = "Locked"
)

// ClosingSourceType tags the year-end journal so it can be found, voided on
// reopen, and — critically — excluded when recomputing a year's P&L activity,
// which would otherwise net itself to zero after the first close.
const ClosingSourceType = "closing"

// ---------------------------------------------------------------------------
// The guard
// ---------------------------------------------------------------------------

// IsDateOpen reports whether companyID may post a journal dated `date`.
//
// FAIL-OPEN BY DESIGN: a company with no fiscal calendar has no period rows, so
// every date returns open and the ledger behaves exactly as it did before
// migration 020. The lock only starts applying once someone generates a year.
// The second return value is a human-readable reason, empty when open.
func (r *PeriodRepo) IsDateOpen(ctx context.Context, companyID, date string) (bool, string, error) {
	return PeriodOpenForDate(ctx, r.db, companyID, date)
}

// rowQuerier is the sliver of *sql.DB that PeriodOpenForDate needs, so the guard
// can be called from AccountingRepo without either repo depending on the other.
type rowQuerier interface {
	QueryRowContext(ctx context.Context, query string, args ...interface{}) *sql.Row
}

// PeriodOpenForDate is the shared implementation behind both PeriodRepo.IsDateOpen
// and the GL posting guard in AccountingRepo. Kept in one place so the two can
// never disagree about what "open" means.
func PeriodOpenForDate(ctx context.Context, db rowQuerier, companyID, date string) (bool, string, error) {
	var status, name, yearStatus, yearName string
	err := db.QueryRowContext(ctx, `
		SELECT p.status, p.name, y.status, y.name
		FROM acc_fiscal_periods p
		JOIN acc_fiscal_years y ON y.id = p.fiscal_year_id AND y.is_deleted = 0
		WHERE p.company_id = ? AND ? BETWEEN p.start_date AND p.end_date
		ORDER BY p.start_date
		LIMIT 1`, companyID, date).Scan(&status, &name, &yearStatus, &yearName)
	if err == sql.ErrNoRows {
		return true, "", nil // no calendar covers this date — unrestricted
	}
	if err != nil {
		return false, "", fmt.Errorf("period lookup: %w", err)
	}
	// A closed year overrides a stray Open period: closing the year is the
	// stronger statement, and its closing entry already zeroed the P&L.
	if yearStatus != PeriodOpen {
		return false, fmt.Sprintf("fiscal year %s is closed", yearName), nil
	}
	if status != PeriodOpen {
		return false, fmt.Sprintf("accounting period %s is %s", name, strings.ToLower(status)), nil
	}
	return true, "", nil
}

// ---------------------------------------------------------------------------
// Fiscal years
// ---------------------------------------------------------------------------

// GenerateYear creates a fiscal year and its periods in one transaction.
// periodCount may be 12 (monthly), 4 (quarterly) or 13 (four-weekly-ish); any
// other value is treated as 12. Periods tile the year exactly: each starts the
// day after the previous one ends, and the last ends on the year's end date.
func (r *PeriodRepo) GenerateYear(ctx context.Context, companyID, name, startDate string, periodCount int) (string, error) {
	start, err := time.Parse("2006-01-02", startDate)
	if err != nil {
		return "", fmt.Errorf("invalid start_date: %w", err)
	}
	if periodCount != 4 && periodCount != 13 {
		periodCount = 12
	}
	// A fiscal year is 12 months long regardless of how it is subdivided; the
	// end is the day before the same date next year.
	end := shiftMonths(start, 12).AddDate(0, 0, -1)

	overlaps, err := r.overlappingYear(ctx, companyID, start.Format("2006-01-02"), end.Format("2006-01-02"))
	if err != nil {
		return "", err
	}
	if overlaps != "" {
		return "", fmt.Errorf("dates overlap existing fiscal year %s", overlaps)
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()

	yearID := uuid.New().String()
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO acc_fiscal_years (id, company_id, name, start_date, end_date, status)
		VALUES (?,?,?,?,?, 'Open')`,
		yearID, companyID, name, start.Format("2006-01-02"), end.Format("2006-01-02")); err != nil {
		return "", err
	}

	monthsPer := 12 / periodCount
	if periodCount == 13 {
		monthsPer = 1 // 13-period calendars are handled as 13 four-week-ish blocks below
	}
	for i := 0; i < periodCount; i++ {
		var pStart, pEnd time.Time
		if periodCount == 13 {
			pStart = start.AddDate(0, 0, 28*i)
			if i == periodCount-1 {
				pEnd = end
			} else {
				pEnd = start.AddDate(0, 0, 28*(i+1)-1)
			}
		} else {
			pStart = shiftMonths(start, monthsPer*i)
			if i == periodCount-1 {
				pEnd = end
			} else {
				pEnd = shiftMonths(start, monthsPer*(i+1)).AddDate(0, 0, -1)
			}
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO acc_fiscal_periods
				(id, company_id, fiscal_year_id, period_no, name, start_date, end_date, status)
			VALUES (?,?,?,?,?,?,?, 'Open')`,
			uuid.New().String(), companyID, yearID, i+1,
			periodName(pStart, periodCount), pStart.Format("2006-01-02"), pEnd.Format("2006-01-02")); err != nil {
			return "", err
		}
	}
	if err := tx.Commit(); err != nil {
		return "", err
	}
	return yearID, nil
}

// periodName labels a period from its start date: "Jan 2026" for monthly and
// 13-period calendars, "Q1 2026" for quarterly.
func periodName(start time.Time, periodCount int) string {
	if periodCount == 4 {
		return fmt.Sprintf("Q%d %d", (int(start.Month())-1)/3+1, start.Year())
	}
	return start.Format("Jan 2006")
}

// overlappingYear returns the name of an existing year whose range intersects
// [start,end], or "" when the range is free. Overlapping calendars would make
// IsDateOpen's "first period wins" arbitrary, so they are refused up front.
func (r *PeriodRepo) overlappingYear(ctx context.Context, companyID, start, end string) (string, error) {
	var name string
	err := r.db.QueryRowContext(ctx, `
		SELECT name FROM acc_fiscal_years
		WHERE company_id = ? AND is_deleted = 0
		  AND start_date <= ? AND end_date >= ?
		LIMIT 1`, companyID, end, start).Scan(&name)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return name, nil
}

func (r *PeriodRepo) ListYears(ctx context.Context, companyID string) ([]models.FiscalYear, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT y.id, y.company_id, y.name, y.start_date, y.end_date, y.status,
		       COALESCE(y.closing_journal_id,''), COALESCE(y.retained_earnings_account_id,''),
		       y.net_income, COALESCE(y.closed_at,''), COALESCE(y.closed_by,''),
		       COALESCE(y.notes,''), y.created_at,
		       (SELECT COUNT(*) FROM acc_fiscal_periods p WHERE p.fiscal_year_id = y.id),
		       (SELECT COUNT(*) FROM acc_fiscal_periods p WHERE p.fiscal_year_id = y.id AND p.status = 'Open'),
		       COALESCE((SELECT e.entry_number FROM acc_journal_entries e WHERE e.id = y.closing_journal_id), 0)
		FROM acc_fiscal_years y
		WHERE y.company_id = ? AND y.is_deleted = 0
		ORDER BY y.start_date DESC`, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.FiscalYear
	for rows.Next() {
		y, err := scanFiscalYear(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *y)
	}
	return out, rows.Err()
}

func (r *PeriodRepo) GetYear(ctx context.Context, companyID, id string) (*models.FiscalYear, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT y.id, y.company_id, y.name, y.start_date, y.end_date, y.status,
		       COALESCE(y.closing_journal_id,''), COALESCE(y.retained_earnings_account_id,''),
		       y.net_income, COALESCE(y.closed_at,''), COALESCE(y.closed_by,''),
		       COALESCE(y.notes,''), y.created_at,
		       (SELECT COUNT(*) FROM acc_fiscal_periods p WHERE p.fiscal_year_id = y.id),
		       (SELECT COUNT(*) FROM acc_fiscal_periods p WHERE p.fiscal_year_id = y.id AND p.status = 'Open'),
		       COALESCE((SELECT e.entry_number FROM acc_journal_entries e WHERE e.id = y.closing_journal_id), 0)
		FROM acc_fiscal_years y
		WHERE y.id = ? AND y.company_id = ? AND y.is_deleted = 0`, id, companyID)
	return scanFiscalYear(row)
}

// DeleteYear soft-deletes a year. Refused once the year has been closed: the
// closing entry is real ledger history and orphaning it would leave equity
// carrying a balance nothing explains.
func (r *PeriodRepo) DeleteYear(ctx context.Context, companyID, id string) error {
	var status string
	if err := r.db.QueryRowContext(ctx,
		`SELECT status FROM acc_fiscal_years WHERE id=? AND company_id=? AND is_deleted=0`,
		id, companyID).Scan(&status); err != nil {
		if err == sql.ErrNoRows {
			return fmt.Errorf("fiscal year not found")
		}
		return err
	}
	if status != PeriodOpen {
		return fmt.Errorf("reopen the year before deleting it")
	}
	_, err := r.db.ExecContext(ctx,
		`UPDATE acc_fiscal_years SET is_deleted=1 WHERE id=? AND company_id=?`, id, companyID)
	return err
}

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

// ListPeriods returns a year's periods enriched with the posted/draft journal
// counts a reviewer needs before closing one. The draft count is the important
// number: closing a period strands its drafts, since they can never be posted.
func (r *PeriodRepo) ListPeriods(ctx context.Context, companyID, yearID string) ([]models.FiscalPeriod, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT p.id, p.company_id, p.fiscal_year_id, p.period_no, p.name,
		       p.start_date, p.end_date, p.status,
		       COALESCE(p.closed_at,''), COALESCE(p.closed_by,''),
		       (SELECT COUNT(*) FROM acc_journal_entries e
		         WHERE e.company_id = p.company_id AND e.is_deleted = 0 AND e.status = 'Posted'
		           AND e.entry_date BETWEEN p.start_date AND p.end_date),
		       (SELECT COUNT(*) FROM acc_journal_entries e
		         WHERE e.company_id = p.company_id AND e.is_deleted = 0 AND e.status = 'Draft'
		           AND e.entry_date BETWEEN p.start_date AND p.end_date),
		       COALESCE((SELECT SUM(e.total_debit) FROM acc_journal_entries e
		         WHERE e.company_id = p.company_id AND e.is_deleted = 0 AND e.status = 'Posted'
		           AND e.entry_date BETWEEN p.start_date AND p.end_date), 0),
		       COALESCE((SELECT SUM(e.total_credit) FROM acc_journal_entries e
		         WHERE e.company_id = p.company_id AND e.is_deleted = 0 AND e.status = 'Posted'
		           AND e.entry_date BETWEEN p.start_date AND p.end_date), 0)
		FROM acc_fiscal_periods p
		WHERE p.company_id = ? AND p.fiscal_year_id = ?
		ORDER BY p.period_no`, companyID, yearID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.FiscalPeriod
	for rows.Next() {
		var p models.FiscalPeriod
		var start, end, closedAt string
		if err := rows.Scan(&p.ID, &p.CompanyID, &p.FiscalYearID, &p.PeriodNo, &p.Name,
			&start, &end, &p.Status, &closedAt, &p.ClosedBy,
			&p.EntryCount, &p.DraftCount, &p.PostedDebit, &p.PostedCredit); err != nil {
			return nil, err
		}
		p.StartDate, p.EndDate, p.ClosedAt = dateOnly(start), dateOnly(end), closedAt
		out = append(out, p)
	}
	return out, rows.Err()
}

// SetPeriodStatus moves one period between Open/Closed/Locked. Reopening a
// Locked period is refused here as well as in the UI — unlocking is a
// deliberate database-level act, which is the whole point of the state.
func (r *PeriodRepo) SetPeriodStatus(ctx context.Context, companyID, periodID, status, userID string) error {
	if status != PeriodOpen && status != PeriodClosed && status != PeriodLocked {
		return fmt.Errorf("status must be Open, Closed or Locked")
	}
	var current, yearStatus string
	err := r.db.QueryRowContext(ctx, `
		SELECT p.status, y.status FROM acc_fiscal_periods p
		JOIN acc_fiscal_years y ON y.id = p.fiscal_year_id
		WHERE p.id = ? AND p.company_id = ?`, periodID, companyID).Scan(&current, &yearStatus)
	if err != nil {
		if err == sql.ErrNoRows {
			return fmt.Errorf("period not found")
		}
		return err
	}
	if current == PeriodLocked && status != PeriodLocked {
		return fmt.Errorf("period is locked and cannot be reopened from the app")
	}
	if yearStatus != PeriodOpen && status == PeriodOpen {
		return fmt.Errorf("reopen the fiscal year first")
	}
	if status == PeriodOpen {
		_, err = r.db.ExecContext(ctx,
			`UPDATE acc_fiscal_periods SET status=?, closed_at=NULL, closed_by=NULL WHERE id=? AND company_id=?`,
			status, periodID, companyID)
	} else {
		_, err = r.db.ExecContext(ctx,
			`UPDATE acc_fiscal_periods SET status=?, closed_at=NOW(), closed_by=? WHERE id=? AND company_id=?`,
			status, nullStr(userID), periodID, companyID)
	}
	return err
}

// SetAllPeriodStatus applies a status to every period in a year, skipping Locked
// ones so a bulk reopen can never silently unlock a filed period.
func (r *PeriodRepo) SetAllPeriodStatus(ctx context.Context, companyID, yearID, status, userID string) error {
	if status == PeriodOpen {
		_, err := r.db.ExecContext(ctx, `
			UPDATE acc_fiscal_periods SET status='Open', closed_at=NULL, closed_by=NULL
			WHERE fiscal_year_id=? AND company_id=? AND status <> 'Locked'`, yearID, companyID)
		return err
	}
	_, err := r.db.ExecContext(ctx, `
		UPDATE acc_fiscal_periods SET status=?, closed_at=NOW(), closed_by=?
		WHERE fiscal_year_id=? AND company_id=? AND status <> 'Locked'`,
		status, nullStr(userID), yearID, companyID)
	return err
}

// ---------------------------------------------------------------------------
// Year-end close
// ---------------------------------------------------------------------------

// PLActivity returns each Revenue/Expense account's posted movement over a date
// range, signed in the account's normal direction. Prior closing entries are
// excluded — without that, re-previewing an already-closed year would show a
// net of zero, because the closing entry perfectly offsets the year's activity.
func (r *PeriodRepo) PLActivity(ctx context.Context, companyID, from, to string) ([]models.AccountActivity, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT a.id, a.code, a.name, a.account_type, a.normal_balance,
		       COALESCE(SUM(l.debit),0), COALESCE(SUM(l.credit),0)
		FROM acc_journal_lines l
		JOIN acc_journal_entries e ON e.id = l.entry_id
		JOIN acc_accounts a ON a.id = l.account_id
		WHERE e.company_id = ? AND e.is_deleted = 0 AND e.status = 'Posted'
		  AND e.source_type <> ?
		  AND e.entry_date BETWEEN ? AND ?
		  AND a.account_type IN ('Revenue','Expense')
		GROUP BY a.id, a.code, a.name, a.account_type, a.normal_balance
		HAVING SUM(l.debit) <> 0 OR SUM(l.credit) <> 0
		ORDER BY a.account_type, a.code`, companyID, ClosingSourceType, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.AccountActivity
	for rows.Next() {
		var a models.AccountActivity
		if err := rows.Scan(&a.AccountID, &a.Code, &a.Name, &a.AccountType, &a.NormalBalance, &a.Debit, &a.Credit); err != nil {
			return nil, err
		}
		if a.NormalBalance == "Credit" {
			a.Balance = round2(a.Credit - a.Debit)
		} else {
			a.Balance = round2(a.Debit - a.Credit)
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// DraftCountInRange counts drafts dated inside a range — entries a close would
// strand, since a closed period will not accept them afterwards.
func (r *PeriodRepo) DraftCountInRange(ctx context.Context, companyID, from, to string) (int, error) {
	var n int
	err := r.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM acc_journal_entries
		WHERE company_id=? AND is_deleted=0 AND status='Draft' AND entry_date BETWEEN ? AND ?`,
		companyID, from, to).Scan(&n)
	return n, err
}

// SuggestEquityAccount picks the account a year-end close should roll into:
// an explicitly named Retained Earnings account when one exists, otherwise any
// non-system equity account. The caller may always override.
func (r *PeriodRepo) SuggestEquityAccount(ctx context.Context, companyID string) (*models.Account, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT id, code, name, account_type, COALESCE(account_subtype,''), normal_balance
		FROM acc_accounts
		WHERE company_id = ? AND is_deleted = 0 AND is_active = 1 AND account_type = 'Equity'
		ORDER BY
		  CASE
		    WHEN name LIKE '%Retained Earnings%' THEN 0
		    WHEN COALESCE(account_subtype,'') LIKE '%Retained%' THEN 1
		    WHEN name LIKE '%Accumulated%' THEN 2
		    ELSE 3
		  END, code
		LIMIT 1`, companyID)
	var a models.Account
	if err := row.Scan(&a.ID, &a.Code, &a.Name, &a.AccountType, &a.AccountSubtype, &a.NormalBalance); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &a, nil
}

// ClosingLine is one leg of the year-end closing entry.
type ClosingLine struct {
	AccountID   string
	Description string
	Debit       float64
	Credit      float64
}

// BuildClosingLines turns a year's P&L activity into the closing entry: every
// Revenue and Expense account is written to the side opposite its balance so it
// ends at zero, and the net result lands on the equity account. Returns the
// lines and the net income (positive = profit).
func BuildClosingLines(activity []models.AccountActivity, equityAccountID, yearName string) ([]ClosingLine, float64) {
	var totalRevenue, totalExpense float64
	lines := make([]ClosingLine, 0, len(activity)+1)

	for _, a := range activity {
		if a.Balance == 0 {
			continue
		}
		if a.AccountType == "Revenue" {
			totalRevenue += a.Balance
		} else {
			totalExpense += a.Balance
		}
		// Reverse the balance: a credit-normal account carrying a credit balance
		// is closed with a debit, and vice versa. Negative balances (contra
		// activity) flip the side, which the sign test below handles.
		l := ClosingLine{AccountID: a.AccountID, Description: "Close " + yearName + " — " + a.Name}
		normalIsCredit := a.NormalBalance == "Credit"
		amt := math.Abs(a.Balance)
		closeWithDebit := normalIsCredit == (a.Balance > 0)
		if closeWithDebit {
			l.Debit = round2(amt)
		} else {
			l.Credit = round2(amt)
		}
		lines = append(lines, l)
	}

	net := round2(totalRevenue - totalExpense)
	if net != 0 {
		eq := ClosingLine{AccountID: equityAccountID, Description: "Net result " + yearName}
		if net > 0 {
			eq.Credit = net // profit increases equity
		} else {
			eq.Debit = -net // loss decreases equity
		}
		lines = append(lines, eq)
	}
	return lines, net
}

// MarkYearClosed records the outcome of a successful close.
func (r *PeriodRepo) MarkYearClosed(ctx context.Context, companyID, yearID, journalID, equityAccountID, userID string, netIncome float64) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE acc_fiscal_years
		SET status='Closed', closing_journal_id=?, retained_earnings_account_id=?,
		    net_income=?, closed_at=NOW(), closed_by=?
		WHERE id=? AND company_id=? AND is_deleted=0`,
		journalID, equityAccountID, netIncome, nullStr(userID), yearID, companyID)
	return err
}

// MarkYearOpen clears the close record after the closing entry has been voided.
func (r *PeriodRepo) MarkYearOpen(ctx context.Context, companyID, yearID string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE acc_fiscal_years
		SET status='Open', closing_journal_id=NULL, net_income=NULL, closed_at=NULL, closed_by=NULL
		WHERE id=? AND company_id=? AND is_deleted=0`, yearID, companyID)
	return err
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

func scanFiscalYear(s rowScanner) (*models.FiscalYear, error) {
	var y models.FiscalYear
	var start, end string
	var net sql.NullFloat64
	if err := s.Scan(&y.ID, &y.CompanyID, &y.Name, &start, &end, &y.Status,
		&y.ClosingJournalID, &y.RetainedEarningsAccountID, &net, &y.ClosedAt, &y.ClosedBy,
		&y.Notes, &y.CreatedAt, &y.PeriodCount, &y.OpenPeriodCount, &y.ClosingEntryNumber); err != nil {
		if err == sql.ErrNoRows {
			return nil, err
		}
		return nil, fmt.Errorf("scan fiscal year: %w", err)
	}
	y.StartDate, y.EndDate = dateOnly(start), dateOnly(end)
	if net.Valid {
		v := net.Float64
		y.NetIncome = &v
	}
	return &y, nil
}
