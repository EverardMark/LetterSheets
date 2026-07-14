package repository

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"lettersheets/internal/models"

	"github.com/google/uuid"
)

// RecurringRepo owns recurring journal-entry templates. A template is a saved
// set of balanced lines plus a schedule; the Go layer generates a real JE from
// it whenever next_run_date falls due. Plain SQL — ls_user has DML but not
// CREATE ROUTINE, and the schedule math lives here in Go.
type RecurringRepo struct {
	db *sql.DB
}

func NewRecurringRepo(db *sql.DB) *RecurringRepo { return &RecurringRepo{db: db} }

// NextOccurrence returns the date of occurrence #index of a schedule, counting
// occurrence 0 as start itself. Month-based cadences keep the start day-of-month
// where possible and clamp to the month's last day (e.g. a 31st anchor lands on
// Feb 28/29), so a monthly series never drifts earlier over time.
func NextOccurrence(start time.Time, freq string, interval, index int) time.Time {
	n := interval * index
	switch freq {
	case "Weekly":
		return start.AddDate(0, 0, 7*n)
	case "Quarterly":
		return shiftMonths(start, 3*n)
	case "Yearly":
		return shiftMonths(start, 12*n)
	default: // Monthly
		return shiftMonths(start, n)
	}
}

// shiftMonths moves `start` forward by `months`, preserving the start day-of-month
// and clamping to the target month's length.
func shiftMonths(start time.Time, months int) time.Time {
	anchorDay := start.Day()
	first := time.Date(start.Year(), start.Month(), 1, 0, 0, 0, 0, time.UTC).AddDate(0, months, 0)
	dim := daysInMonth(first.Year(), first.Month())
	d := anchorDay
	if d > dim {
		d = dim
	}
	return time.Date(first.Year(), first.Month(), d, 0, 0, 0, 0, time.UTC)
}

func daysInMonth(y int, m time.Month) int {
	// Day 0 of the next month is the last day of month m.
	return time.Date(y, m+1, 0, 0, 0, 0, 0, time.UTC).Day()
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

// Create inserts a recurring template and its lines in one transaction. The
// caller supplies the already-computed first next_run_date.
func (r *RecurringRepo) Create(ctx context.Context, companyID string, e *models.RecurringEntry) (string, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()

	id := uuid.New().String()
	_, err = tx.ExecContext(ctx, `
		INSERT INTO acc_recurring_entries
			(id, company_id, name, memo, frequency, interval_count, start_date,
			 next_run_date, end_date, auto_post, occurrences_limit, is_active)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
		id, companyID, e.Name, nullStr(e.Memo), e.Frequency, e.IntervalCount, e.StartDate,
		e.NextRunDate, nullStr(e.EndDate), boolToInt(e.AutoPost), e.OccurrencesLimit, boolToInt(e.IsActive))
	if err != nil {
		return "", err
	}
	if err := insertRecurringLines(ctx, tx, id, companyID, e.Lines); err != nil {
		return "", err
	}
	if err := tx.Commit(); err != nil {
		return "", err
	}
	return id, nil
}

// Update replaces the template's editable fields and its lines.
func (r *RecurringRepo) Update(ctx context.Context, companyID string, e *models.RecurringEntry) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	res, err := tx.ExecContext(ctx, `
		UPDATE acc_recurring_entries
		SET name=?, memo=?, frequency=?, interval_count=?, start_date=?, next_run_date=?,
		    end_date=?, auto_post=?, occurrences_limit=?, is_active=?
		WHERE id=? AND company_id=? AND is_deleted=0`,
		e.Name, nullStr(e.Memo), e.Frequency, e.IntervalCount, e.StartDate, e.NextRunDate,
		nullStr(e.EndDate), boolToInt(e.AutoPost), e.OccurrencesLimit, boolToInt(e.IsActive),
		e.ID, companyID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM acc_recurring_lines WHERE recurring_id=? AND company_id=?`, e.ID, companyID); err != nil {
		return err
	}
	if err := insertRecurringLines(ctx, tx, e.ID, companyID, e.Lines); err != nil {
		return err
	}
	return tx.Commit()
}

func insertRecurringLines(ctx context.Context, tx *sql.Tx, recurringID, companyID string, lines []models.RecurringLine) error {
	for i, l := range lines {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO acc_recurring_lines
				(id, recurring_id, company_id, account_id, description, debit, credit, line_order)
			VALUES (?,?,?,?,?,?,?,?)`,
			uuid.New().String(), recurringID, companyID, l.AccountID, nullStr(l.Description), l.Debit, l.Credit, i); err != nil {
			return err
		}
	}
	return nil
}

// List returns all active/inactive (non-deleted) templates with a line summary.
func (r *RecurringRepo) List(ctx context.Context, companyID string) ([]models.RecurringEntry, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT e.id, e.company_id, e.name, COALESCE(e.memo,''), e.frequency, e.interval_count,
		       e.start_date, e.next_run_date, COALESCE(e.end_date,''), e.auto_post,
		       e.occurrences_limit, e.occurrences_count, COALESCE(e.last_run_date,''),
		       e.is_active, e.created_at, e.updated_at,
		       COALESCE((SELECT SUM(debit) FROM acc_recurring_lines l WHERE l.recurring_id=e.id),0) AS total_debit,
		       (SELECT COUNT(*) FROM acc_recurring_lines l WHERE l.recurring_id=e.id) AS line_count
		FROM acc_recurring_entries e
		WHERE e.company_id=? AND e.is_deleted=0
		ORDER BY e.is_active DESC, e.next_run_date ASC`, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.RecurringEntry
	for rows.Next() {
		e, err := scanRecurring(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *e)
	}
	return out, rows.Err()
}

// Get returns one template with its lines (account code/name joined for display).
func (r *RecurringRepo) Get(ctx context.Context, companyID, id string) (*models.RecurringEntry, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT e.id, e.company_id, e.name, COALESCE(e.memo,''), e.frequency, e.interval_count,
		       e.start_date, e.next_run_date, COALESCE(e.end_date,''), e.auto_post,
		       e.occurrences_limit, e.occurrences_count, COALESCE(e.last_run_date,''),
		       e.is_active, e.created_at, e.updated_at, 0, 0
		FROM acc_recurring_entries e
		WHERE e.id=? AND e.company_id=? AND e.is_deleted=0`, id, companyID)
	e, err := scanRecurring(row)
	if err != nil {
		return nil, err
	}
	lines, err := r.GetLines(ctx, companyID, id)
	if err != nil {
		return nil, err
	}
	e.Lines = lines
	return e, nil
}

func (r *RecurringRepo) GetLines(ctx context.Context, companyID, recurringID string) ([]models.RecurringLine, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT l.id, l.recurring_id, l.account_id, COALESCE(a.code,''), COALESCE(a.name,''),
		       COALESCE(l.description,''), l.debit, l.credit, l.line_order
		FROM acc_recurring_lines l
		LEFT JOIN acc_accounts a ON a.id = l.account_id
		WHERE l.recurring_id=? AND l.company_id=?
		ORDER BY l.line_order`, recurringID, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.RecurringLine
	for rows.Next() {
		var l models.RecurringLine
		if err := rows.Scan(&l.ID, &l.RecurringID, &l.AccountID, &l.AccountCode, &l.AccountName,
			&l.Description, &l.Debit, &l.Credit, &l.LineOrder); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func (r *RecurringRepo) Delete(ctx context.Context, companyID, id string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE acc_recurring_entries SET is_deleted=1, is_active=0 WHERE id=? AND company_id=?`, id, companyID)
	return err
}

func (r *RecurringRepo) SetActive(ctx context.Context, companyID, id string, active bool) error {
	_, err := r.db.ExecContext(ctx, `UPDATE acc_recurring_entries SET is_active=? WHERE id=? AND company_id=? AND is_deleted=0`, boolToInt(active), id, companyID)
	return err
}

// GetDue returns active templates whose next_run_date is on/before asOf and that
// haven't hit their end_date or occurrences_limit. These are the ones to generate.
func (r *RecurringRepo) GetDue(ctx context.Context, companyID, asOf string) ([]models.RecurringEntry, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT e.id, e.company_id, e.name, COALESCE(e.memo,''), e.frequency, e.interval_count,
		       e.start_date, e.next_run_date, COALESCE(e.end_date,''), e.auto_post,
		       e.occurrences_limit, e.occurrences_count, COALESCE(e.last_run_date,''),
		       e.is_active, e.created_at, e.updated_at,
		       COALESCE((SELECT SUM(debit) FROM acc_recurring_lines l WHERE l.recurring_id=e.id),0),
		       (SELECT COUNT(*) FROM acc_recurring_lines l WHERE l.recurring_id=e.id)
		FROM acc_recurring_entries e
		WHERE e.company_id=? AND e.is_deleted=0 AND e.is_active=1
		  AND e.next_run_date <= ?
		  AND (e.end_date IS NULL OR e.next_run_date <= e.end_date)
		  AND (e.occurrences_limit IS NULL OR e.occurrences_count < e.occurrences_limit)
		ORDER BY e.next_run_date ASC`, companyID, asOf)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.RecurringEntry
	for rows.Next() {
		e, err := scanRecurring(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *e)
	}
	return out, rows.Err()
}

// CompaniesWithDue returns the ids of companies that have at least one recurring
// template due on/before asOf — the work list for the background scheduler, so it
// only touches companies that actually need generation.
func (r *RecurringRepo) CompaniesWithDue(ctx context.Context, asOf string) ([]string, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT DISTINCT company_id FROM acc_recurring_entries
		WHERE is_deleted=0 AND is_active=1 AND next_run_date <= ?
		  AND (end_date IS NULL OR next_run_date <= end_date)
		  AND (occurrences_limit IS NULL OR occurrences_count < occurrences_limit)`, asOf)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// RecordRun persists the state change after one occurrence is generated: it bumps
// the run bookkeeping and moves next_run_date forward, deactivating the template
// when it has passed its end_date or hit its occurrences_limit.
func (r *RecurringRepo) RecordRun(ctx context.Context, companyID, id, ranDate, newNextRun string, newCount int, active bool) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE acc_recurring_entries
		SET last_run_date=?, next_run_date=?, occurrences_count=?, is_active=?
		WHERE id=? AND company_id=?`,
		ranDate, newNextRun, newCount, boolToInt(active), id, companyID)
	return err
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// rowScanner unifies *sql.Row and *sql.Rows for scanRecurring.
type rowScanner interface {
	Scan(dest ...interface{}) error
}

func scanRecurring(s rowScanner) (*models.RecurringEntry, error) {
	var e models.RecurringEntry
	var autoPost, isActive int
	var startDate, nextRun, endDate, lastRun string
	if err := s.Scan(&e.ID, &e.CompanyID, &e.Name, &e.Memo, &e.Frequency, &e.IntervalCount,
		&startDate, &nextRun, &endDate, &autoPost, &e.OccurrencesLimit, &e.OccurrencesCount,
		&lastRun, &isActive, &e.CreatedAt, &e.UpdatedAt, &e.TotalDebit, &e.LineCount); err != nil {
		if err == sql.ErrNoRows {
			return nil, err
		}
		return nil, fmt.Errorf("scan recurring: %w", err)
	}
	e.StartDate = dateOnly(startDate)
	e.NextRunDate = dateOnly(nextRun)
	e.EndDate = dateOnly(endDate)
	e.LastRunDate = dateOnly(lastRun)
	e.AutoPost = autoPost == 1
	e.IsActive = isActive == 1
	return &e, nil
}

// dateOnly trims a DATE/DATETIME string returned by the driver to YYYY-MM-DD.
func dateOnly(s string) string {
	if len(s) >= 10 {
		return s[:10]
	}
	return s
}

func nullStr(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
