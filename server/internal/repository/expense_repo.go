package repository

import (
	"context"
	"database/sql"
	"fmt"

	"lettersheets/internal/models"

	"github.com/google/uuid"
)

// ExpenseRepo owns employee expense claims (migration 022) — the bridge between
// an employee spending their own money and the general ledger recognising both
// the expense and the debt owed back to them.
//
// The repo is deliberately ledger-agnostic: it stores which journals a claim
// produced but never posts one itself. Posting lives in the handler, which is
// the only layer that already holds AccountingRepo, and which owns the identical
// create-lines-post-reverse dance for every other module.
type ExpenseRepo struct {
	db *sql.DB
}

func NewExpenseRepo(db *sql.DB) *ExpenseRepo { return &ExpenseRepo{db: db} }

// Claim statuses.
const (
	ClaimDraft     = "Draft"
	ClaimSubmitted = "Submitted"
	ClaimApproved  = "Approved"
	ClaimRejected  = "Rejected"
	ClaimPaid      = "Paid"
	ClaimCancelled = "Cancelled"
)

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

// GetSettings returns the company's expense configuration, materialising
// sensible defaults for a company that has never opened the settings screen.
func (r *ExpenseRepo) GetSettings(ctx context.Context, companyID string) (*models.ExpenseSettings, error) {
	s := models.ExpenseSettings{CompanyID: companyID, AutoPostGL: true, RequireApproval: true}
	var autoPost, reqReceipt, reqApproval int
	var threshold sql.NullFloat64
	err := r.db.QueryRowContext(ctx, `
		SELECT COALESCE(employee_payable_account_id,''), COALESCE(default_cash_account_id,''),
		       COALESCE(tax_input_account_id,''), auto_post_gl, require_receipt, require_approval,
		       approval_threshold
		FROM exp_settings WHERE company_id = ?`, companyID).
		Scan(&s.EmployeePayableAccountID, &s.DefaultCashAccountID, &s.TaxInputAccountID,
			&autoPost, &reqReceipt, &reqApproval, &threshold)
	if err == sql.ErrNoRows {
		return &s, nil
	}
	if err != nil {
		return nil, err
	}
	s.AutoPostGL, s.RequireReceipt, s.RequireApproval = autoPost == 1, reqReceipt == 1, reqApproval == 1
	if threshold.Valid {
		v := threshold.Float64
		s.ApprovalThreshold = &v
	}
	return &s, nil
}

func (r *ExpenseRepo) SaveSettings(ctx context.Context, s *models.ExpenseSettings) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO exp_settings
			(company_id, employee_payable_account_id, default_cash_account_id, tax_input_account_id,
			 auto_post_gl, require_receipt, require_approval, approval_threshold)
		VALUES (?,?,?,?,?,?,?,?)
		ON DUPLICATE KEY UPDATE
			employee_payable_account_id = VALUES(employee_payable_account_id),
			default_cash_account_id     = VALUES(default_cash_account_id),
			tax_input_account_id        = VALUES(tax_input_account_id),
			auto_post_gl                = VALUES(auto_post_gl),
			require_receipt             = VALUES(require_receipt),
			require_approval            = VALUES(require_approval),
			approval_threshold          = VALUES(approval_threshold)`,
		s.CompanyID, nullStr(s.EmployeePayableAccountID), nullStr(s.DefaultCashAccountID),
		nullStr(s.TaxInputAccountID), boolToInt(s.AutoPostGL), boolToInt(s.RequireReceipt),
		boolToInt(s.RequireApproval), s.ApprovalThreshold)
	return err
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

func (r *ExpenseRepo) ListCategories(ctx context.Context, companyID string, activeOnly bool) ([]models.ExpenseCategory, error) {
	q := `
		SELECT c.id, c.company_id, c.name, COALESCE(c.description,''), COALESCE(c.account_id,''),
		       COALESCE(a.code,''), COALESCE(a.name,''), c.daily_cap, c.is_active,
		       (SELECT COUNT(*) FROM exp_claim_lines l WHERE l.category_id = c.id)
		FROM exp_categories c
		LEFT JOIN acc_accounts a ON a.id = c.account_id
		WHERE c.company_id = ? AND c.is_deleted = 0`
	if activeOnly {
		q += ` AND c.is_active = 1`
	}
	q += ` ORDER BY c.name`

	rows, err := r.db.QueryContext(ctx, q, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.ExpenseCategory
	for rows.Next() {
		var c models.ExpenseCategory
		var cap sql.NullFloat64
		var active int
		if err := rows.Scan(&c.ID, &c.CompanyID, &c.Name, &c.Description, &c.AccountID,
			&c.AccountCode, &c.AccountName, &cap, &active, &c.ClaimCount); err != nil {
			return nil, err
		}
		c.IsActive = active == 1
		if cap.Valid {
			v := cap.Float64
			c.DailyCap = &v
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *ExpenseRepo) CreateCategory(ctx context.Context, c *models.ExpenseCategory) (string, error) {
	id := uuid.New().String()
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO exp_categories (id, company_id, name, description, account_id, daily_cap, is_active)
		VALUES (?,?,?,?,?,?,?)`,
		id, c.CompanyID, c.Name, nullStr(c.Description), nullStr(c.AccountID), c.DailyCap, boolToInt(c.IsActive))
	if err != nil {
		return "", err
	}
	return id, nil
}

func (r *ExpenseRepo) UpdateCategory(ctx context.Context, c *models.ExpenseCategory) error {
	res, err := r.db.ExecContext(ctx, `
		UPDATE exp_categories SET name=?, description=?, account_id=?, daily_cap=?, is_active=?
		WHERE id=? AND company_id=? AND is_deleted=0`,
		c.Name, nullStr(c.Description), nullStr(c.AccountID), c.DailyCap, boolToInt(c.IsActive),
		c.ID, c.CompanyID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("category not found")
	}
	return nil
}

// DeleteCategory soft-deletes. Existing claim lines keep working because they
// froze the account id at save time rather than resolving it through the
// category on every read.
func (r *ExpenseRepo) DeleteCategory(ctx context.Context, companyID, id string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE exp_categories SET is_deleted=1, is_active=0 WHERE id=? AND company_id=?`, id, companyID)
	return err
}

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

// nextClaimNumber allocates the next per-company claim number inside the caller's
// transaction. The INSERT … ON DUPLICATE KEY UPDATE bumps and reads the counter
// atomically, the same trick the procurement stored procedures use.
func nextClaimNumber(ctx context.Context, tx *sql.Tx, companyID string) (int, error) {
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO exp_claim_sequences (company_id, next_number) VALUES (?, 2)
		ON DUPLICATE KEY UPDATE next_number = next_number + 1`, companyID); err != nil {
		return 0, err
	}
	var next int
	if err := tx.QueryRowContext(ctx,
		`SELECT next_number FROM exp_claim_sequences WHERE company_id=?`, companyID).Scan(&next); err != nil {
		return 0, err
	}
	return next - 1, nil
}

// Create inserts a Draft claim with its lines and computed totals.
func (r *ExpenseRepo) Create(ctx context.Context, c *models.ExpenseClaim) (string, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()

	num, err := nextClaimNumber(ctx, tx, c.CompanyID)
	if err != nil {
		return "", err
	}
	id := uuid.New().String()
	sub, tax, total, start, end := summarizeLines(c.Lines)

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO exp_claims
			(id, company_id, claim_number, employee_id, title, purpose, claim_date,
			 period_start, period_end, status, subtotal, tax_total, total_amount,
			 payment_method, notes)
		VALUES (?,?,?,?,?,?,?,?,?, 'Draft', ?,?,?,?,?)`,
		id, c.CompanyID, num, c.EmployeeID, c.Title, nullStr(c.Purpose), c.ClaimDate,
		nullStr(start), nullStr(end), sub, tax, total,
		defaultStr(c.PaymentMethod, "Cash"), nullStr(c.Notes)); err != nil {
		return "", err
	}
	if err := insertClaimLines(ctx, tx, id, c.CompanyID, c.Lines); err != nil {
		return "", err
	}
	if err := tx.Commit(); err != nil {
		return "", err
	}
	return id, nil
}

// Update replaces an editable claim's header and lines. Only Draft and Rejected
// claims are editable — once submitted, the numbers are what an approver is
// looking at, and once approved they are in the ledger.
func (r *ExpenseRepo) Update(ctx context.Context, c *models.ExpenseClaim) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var status string
	if err := tx.QueryRowContext(ctx,
		`SELECT status FROM exp_claims WHERE id=? AND company_id=? AND is_deleted=0 FOR UPDATE`,
		c.ID, c.CompanyID).Scan(&status); err != nil {
		if err == sql.ErrNoRows {
			return fmt.Errorf("claim not found")
		}
		return err
	}
	if status != ClaimDraft && status != ClaimRejected {
		return fmt.Errorf("a %s claim cannot be edited", status)
	}

	sub, tax, total, start, end := summarizeLines(c.Lines)
	if _, err := tx.ExecContext(ctx, `
		UPDATE exp_claims
		SET title=?, purpose=?, claim_date=?, period_start=?, period_end=?,
		    subtotal=?, tax_total=?, total_amount=?, payment_method=?, notes=?
		WHERE id=? AND company_id=?`,
		c.Title, nullStr(c.Purpose), c.ClaimDate, nullStr(start), nullStr(end),
		sub, tax, total, defaultStr(c.PaymentMethod, "Cash"), nullStr(c.Notes),
		c.ID, c.CompanyID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx,
		`DELETE FROM exp_claim_lines WHERE claim_id=? AND company_id=?`, c.ID, c.CompanyID); err != nil {
		return err
	}
	if err := insertClaimLines(ctx, tx, c.ID, c.CompanyID, c.Lines); err != nil {
		return err
	}
	return tx.Commit()
}

func insertClaimLines(ctx context.Context, tx *sql.Tx, claimID, companyID string, lines []models.ExpenseClaimLine) error {
	for i, l := range lines {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO exp_claim_lines
				(id, claim_id, company_id, expense_date, category_id, account_id, description,
				 merchant, receipt_no, amount, tax_amount, line_order)
			VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
			uuid.New().String(), claimID, companyID, l.ExpenseDate, nullStr(l.CategoryID),
			l.AccountID, l.Description, nullStr(l.Merchant), nullStr(l.ReceiptNo),
			round2(l.Amount), round2(l.TaxAmount), i); err != nil {
			return err
		}
	}
	return nil
}

// summarizeLines returns the header totals and the covered date range derived
// from the lines, so the header can never disagree with what it contains.
func summarizeLines(lines []models.ExpenseClaimLine) (subtotal, tax, total float64, start, end string) {
	for _, l := range lines {
		subtotal += round2(l.Amount)
		tax += round2(l.TaxAmount)
		d := dateOnly(l.ExpenseDate)
		if d == "" {
			continue
		}
		if start == "" || d < start {
			start = d
		}
		if end == "" || d > end {
			end = d
		}
	}
	subtotal, tax = round2(subtotal), round2(tax)
	return subtotal, tax, round2(subtotal + tax), start, end
}

const claimSelect = `
	SELECT c.id, c.company_id, c.claim_number, c.employee_id,
	       CONCAT(COALESCE(e.first_name,''),' ',COALESCE(e.last_name,'')) AS employee_name,
	       c.title, COALESCE(c.purpose,''), c.claim_date,
	       COALESCE(c.period_start,''), COALESCE(c.period_end,''), c.status,
	       c.subtotal, c.tax_total, c.total_amount, c.payment_method,
	       COALESCE(c.submitted_at,''), COALESCE(c.approved_at,''), COALESCE(c.approved_by,''),
	       COALESCE(c.rejected_at,''), COALESCE(c.reject_reason,''),
	       COALESCE(c.paid_at,''), COALESCE(c.payment_reference,''), COALESCE(c.payment_account_id,''),
	       COALESCE(c.accrual_journal_id,''), COALESCE(c.payment_journal_id,''), COALESCE(c.notes,''),
	       (SELECT COUNT(*) FROM exp_claim_lines l WHERE l.claim_id = c.id),
	       (SELECT COUNT(*) FROM exp_claim_receipts rc WHERE rc.claim_id = c.id AND rc.is_deleted = 0),
	       c.created_at, c.updated_at
	FROM exp_claims c
	LEFT JOIN employees e ON e.id = c.employee_id`

// List returns claims filtered by status and/or employee. employeeID is how
// self-service works: a user without expenses/view sees only their own claims.
func (r *ExpenseRepo) List(ctx context.Context, companyID, status, employeeID string, limit int) ([]models.ExpenseClaim, error) {
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	q := claimSelect + ` WHERE c.company_id = ? AND c.is_deleted = 0`
	args := []interface{}{companyID}
	if status != "" && status != "all" {
		q += ` AND c.status = ?`
		args = append(args, status)
	}
	if employeeID != "" {
		q += ` AND c.employee_id = ?`
		args = append(args, employeeID)
	}
	q += ` ORDER BY c.claim_date DESC, c.claim_number DESC LIMIT ?`
	args = append(args, limit)

	rows, err := r.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.ExpenseClaim
	for rows.Next() {
		c, err := scanClaim(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *c)
	}
	return out, rows.Err()
}

func (r *ExpenseRepo) Get(ctx context.Context, companyID, id string) (*models.ExpenseClaim, error) {
	row := r.db.QueryRowContext(ctx, claimSelect+` WHERE c.id = ? AND c.company_id = ? AND c.is_deleted = 0`, id, companyID)
	c, err := scanClaim(row)
	if err != nil {
		return nil, err
	}
	if c.Lines, err = r.GetLines(ctx, companyID, id); err != nil {
		return nil, err
	}
	if c.Receipts, err = r.ListReceipts(ctx, companyID, id); err != nil {
		return nil, err
	}
	return c, nil
}

func (r *ExpenseRepo) GetLines(ctx context.Context, companyID, claimID string) ([]models.ExpenseClaimLine, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT l.id, l.claim_id, l.company_id, l.expense_date, COALESCE(l.category_id,''),
		       COALESCE(cat.name,''), l.account_id, COALESCE(a.code,''), COALESCE(a.name,''),
		       l.description, COALESCE(l.merchant,''), COALESCE(l.receipt_no,''),
		       l.amount, l.tax_amount, l.line_order
		FROM exp_claim_lines l
		LEFT JOIN exp_categories cat ON cat.id = l.category_id
		LEFT JOIN acc_accounts a ON a.id = l.account_id
		WHERE l.claim_id = ? AND l.company_id = ?
		ORDER BY l.line_order`, claimID, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.ExpenseClaimLine
	for rows.Next() {
		var l models.ExpenseClaimLine
		var d string
		if err := rows.Scan(&l.ID, &l.ClaimID, &l.CompanyID, &d, &l.CategoryID, &l.CategoryName,
			&l.AccountID, &l.AccountCode, &l.AccountName, &l.Description, &l.Merchant,
			&l.ReceiptNo, &l.Amount, &l.TaxAmount, &l.LineOrder); err != nil {
			return nil, err
		}
		l.ExpenseDate = dateOnly(d)
		out = append(out, l)
	}
	return out, rows.Err()
}

// Delete soft-deletes a claim. Refused once it has touched the ledger: a claim
// with journals behind it must be un-approved (which reverses them) first.
func (r *ExpenseRepo) Delete(ctx context.Context, companyID, id string) error {
	var status, accrual string
	if err := r.db.QueryRowContext(ctx,
		`SELECT status, COALESCE(accrual_journal_id,'') FROM exp_claims WHERE id=? AND company_id=? AND is_deleted=0`,
		id, companyID).Scan(&status, &accrual); err != nil {
		if err == sql.ErrNoRows {
			return fmt.Errorf("claim not found")
		}
		return err
	}
	if accrual != "" {
		return fmt.Errorf("this claim has posted to the ledger — un-approve it first")
	}
	if status == ClaimPaid {
		return fmt.Errorf("a paid claim cannot be deleted")
	}
	_, err := r.db.ExecContext(ctx,
		`UPDATE exp_claims SET is_deleted=1 WHERE id=? AND company_id=?`, id, companyID)
	return err
}

// ---------------------------------------------------------------------------
// Status transitions
//
// Each of these is a guarded UPDATE rather than a generic SetStatus, so an
// illegal transition (paying an unapproved claim, approving a draft) is refused
// by the WHERE clause itself and cannot be reached by a malformed request.
// ---------------------------------------------------------------------------

func (r *ExpenseRepo) Submit(ctx context.Context, companyID, id, userID string) error {
	res, err := r.db.ExecContext(ctx, `
		UPDATE exp_claims SET status='Submitted', submitted_at=NOW(), submitted_by=?,
		       rejected_at=NULL, rejected_by=NULL, reject_reason=NULL
		WHERE id=? AND company_id=? AND is_deleted=0 AND status IN ('Draft','Rejected')`,
		nullStr(userID), id, companyID)
	return affectedOr(res, err, "only a draft or rejected claim can be submitted")
}

func (r *ExpenseRepo) Approve(ctx context.Context, companyID, id, userID, journalID string) error {
	res, err := r.db.ExecContext(ctx, `
		UPDATE exp_claims SET status='Approved', approved_at=NOW(), approved_by=?, accrual_journal_id=?
		WHERE id=? AND company_id=? AND is_deleted=0 AND status='Submitted'`,
		nullStr(userID), nullStr(journalID), id, companyID)
	return affectedOr(res, err, "only a submitted claim can be approved")
}

func (r *ExpenseRepo) Reject(ctx context.Context, companyID, id, userID, reason string) error {
	res, err := r.db.ExecContext(ctx, `
		UPDATE exp_claims SET status='Rejected', rejected_at=NOW(), rejected_by=?, reject_reason=?
		WHERE id=? AND company_id=? AND is_deleted=0 AND status='Submitted'`,
		nullStr(userID), nullStr(reason), id, companyID)
	return affectedOr(res, err, "only a submitted claim can be rejected")
}

// Unapprove walks an Approved claim back to Submitted. The caller is responsible
// for voiding the accrual journal first; this clears the pointer to it.
func (r *ExpenseRepo) Unapprove(ctx context.Context, companyID, id string) error {
	res, err := r.db.ExecContext(ctx, `
		UPDATE exp_claims SET status='Submitted', approved_at=NULL, approved_by=NULL, accrual_journal_id=NULL
		WHERE id=? AND company_id=? AND is_deleted=0 AND status='Approved'`, id, companyID)
	return affectedOr(res, err, "only an approved claim can be un-approved")
}

func (r *ExpenseRepo) MarkPaid(ctx context.Context, companyID, id, userID, reference, paymentAccountID, journalID string) error {
	res, err := r.db.ExecContext(ctx, `
		UPDATE exp_claims
		SET status='Paid', paid_at=NOW(), paid_by=?, payment_reference=?,
		    payment_account_id=?, payment_journal_id=?
		WHERE id=? AND company_id=? AND is_deleted=0 AND status='Approved'`,
		nullStr(userID), nullStr(reference), nullStr(paymentAccountID), nullStr(journalID), id, companyID)
	return affectedOr(res, err, "only an approved claim can be paid")
}

// Unpay reverts a payment, for when a disbursement is cancelled. The caller
// voids the payment journal; this drops the pointer and the payment details.
func (r *ExpenseRepo) Unpay(ctx context.Context, companyID, id string) error {
	res, err := r.db.ExecContext(ctx, `
		UPDATE exp_claims
		SET status='Approved', paid_at=NULL, paid_by=NULL, payment_reference=NULL,
		    payment_account_id=NULL, payment_journal_id=NULL
		WHERE id=? AND company_id=? AND is_deleted=0 AND status='Paid'`, id, companyID)
	return affectedOr(res, err, "only a paid claim can have its payment reversed")
}

func (r *ExpenseRepo) Cancel(ctx context.Context, companyID, id string) error {
	res, err := r.db.ExecContext(ctx, `
		UPDATE exp_claims SET status='Cancelled'
		WHERE id=? AND company_id=? AND is_deleted=0 AND status IN ('Draft','Submitted','Rejected')`,
		id, companyID)
	return affectedOr(res, err, "an approved or paid claim cannot be cancelled")
}

// ---------------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------------

func (r *ExpenseRepo) AddReceipt(ctx context.Context, rc *models.ExpenseReceipt, data []byte) (string, error) {
	id := uuid.New().String()
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO exp_claim_receipts
			(id, company_id, claim_id, line_id, file_name, mime_type, file_size, file_data,
			 uploaded_by, uploaded_by_name)
		VALUES (?,?,?,?,?,?,?,?,?,?)`,
		id, rc.CompanyID, rc.ClaimID, nullStr(rc.LineID), rc.FileName, rc.MimeType,
		len(data), data, nullStr(rc.UploadedBy), nullStr(rc.UploadedByName))
	if err != nil {
		return "", err
	}
	return id, nil
}

// ListReceipts returns metadata only — never file_data, which would balloon
// every claim list response with megabytes of image bytes nobody asked for.
func (r *ExpenseRepo) ListReceipts(ctx context.Context, companyID, claimID string) ([]models.ExpenseReceipt, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, company_id, claim_id, COALESCE(line_id,''), file_name, mime_type, file_size,
		       COALESCE(uploaded_by,''), COALESCE(uploaded_by_name,''), created_at
		FROM exp_claim_receipts
		WHERE claim_id = ? AND company_id = ? AND is_deleted = 0
		ORDER BY created_at`, claimID, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.ExpenseReceipt
	for rows.Next() {
		var rc models.ExpenseReceipt
		if err := rows.Scan(&rc.ID, &rc.CompanyID, &rc.ClaimID, &rc.LineID, &rc.FileName,
			&rc.MimeType, &rc.FileSize, &rc.UploadedBy, &rc.UploadedByName, &rc.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, rc)
	}
	return out, rows.Err()
}

// GetReceiptData fetches one receipt's bytes for download.
func (r *ExpenseRepo) GetReceiptData(ctx context.Context, companyID, id string) (*models.ExpenseReceipt, []byte, error) {
	var rc models.ExpenseReceipt
	var data []byte
	err := r.db.QueryRowContext(ctx, `
		SELECT id, company_id, claim_id, file_name, mime_type, file_size, file_data
		FROM exp_claim_receipts WHERE id=? AND company_id=? AND is_deleted=0`, id, companyID).
		Scan(&rc.ID, &rc.CompanyID, &rc.ClaimID, &rc.FileName, &rc.MimeType, &rc.FileSize, &data)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil, fmt.Errorf("receipt not found")
		}
		return nil, nil, err
	}
	return &rc, data, nil
}

func (r *ExpenseRepo) DeleteReceipt(ctx context.Context, companyID, id string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE exp_claim_receipts SET is_deleted=1 WHERE id=? AND company_id=?`, id, companyID)
	return err
}

func (r *ExpenseRepo) ReceiptCount(ctx context.Context, companyID, claimID string) (int, error) {
	var n int
	err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM exp_claim_receipts WHERE claim_id=? AND company_id=? AND is_deleted=0`,
		claimID, companyID).Scan(&n)
	return n, err
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

func (r *ExpenseRepo) Stats(ctx context.Context, companyID string) (*models.ExpenseStats, error) {
	var s models.ExpenseStats
	err := r.db.QueryRowContext(ctx, `
		SELECT
		  COUNT(*),
		  SUM(status = 'Submitted'),
		  SUM(status = 'Approved'),
		  COALESCE(SUM(CASE WHEN status = 'Submitted' THEN total_amount ELSE 0 END), 0),
		  COALESCE(SUM(CASE WHEN status = 'Approved'  THEN total_amount ELSE 0 END), 0),
		  COALESCE(SUM(CASE WHEN status = 'Paid'
		                     AND paid_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
		                    THEN total_amount ELSE 0 END), 0)
		FROM exp_claims
		WHERE company_id = ? AND is_deleted = 0`, companyID).
		Scan(&s.TotalClaims, &s.PendingApproval, &s.AwaitingPayment,
			&s.PendingAmount, &s.PayableAmount, &s.PaidThisMonth)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

func scanClaim(s rowScanner) (*models.ExpenseClaim, error) {
	var c models.ExpenseClaim
	var claimDate, periodStart, periodEnd string
	if err := s.Scan(&c.ID, &c.CompanyID, &c.ClaimNumber, &c.EmployeeID, &c.EmployeeName,
		&c.Title, &c.Purpose, &claimDate, &periodStart, &periodEnd, &c.Status,
		&c.Subtotal, &c.TaxTotal, &c.TotalAmount, &c.PaymentMethod,
		&c.SubmittedAt, &c.ApprovedAt, &c.ApprovedBy, &c.RejectedAt, &c.RejectReason,
		&c.PaidAt, &c.PaymentReference, &c.PaymentAccountID,
		&c.AccrualJournalID, &c.PaymentJournalID, &c.Notes,
		&c.LineCount, &c.ReceiptCount, &c.CreatedAt, &c.UpdatedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, err
		}
		return nil, fmt.Errorf("scan claim: %w", err)
	}
	c.ClaimDate = dateOnly(claimDate)
	c.PeriodStart, c.PeriodEnd = dateOnly(periodStart), dateOnly(periodEnd)
	return &c, nil
}

// affectedOr turns "the guarded UPDATE matched nothing" into the caller's
// explanation of which transition was attempted illegally.
func affectedOr(res sql.Result, err error, msg string) error {
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("%s", msg)
	}
	return nil
}

func defaultStr(s, fallback string) string {
	if s == "" {
		return fallback
	}
	return s
}
