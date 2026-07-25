package repository

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"lettersheets/internal/models"

	"github.com/google/uuid"
)

// NotificationRepo owns the in-app inbox and the email outbox (migration 021).
//
// The two are deliberately separate stores rather than one "message" table with
// a channel column: the inbox is read constantly and never fails, while the
// outbox is written once and drained by a worker that needs its own retry
// bookkeeping. Merging them would put backoff columns on rows that never send
// and index churn on rows nobody queries.
type NotificationRepo struct {
	db *sql.DB
}

func NewNotificationRepo(db *sql.DB) *NotificationRepo { return &NotificationRepo{db: db} }

// maxEmailAttempts caps retries before a message is parked as Failed. Five tries
// across the backoff schedule below spans roughly a day — long enough to ride out
// a relay outage, short enough that a genuinely bad address stops burning cycles.
const maxEmailAttempts = 5

// ---------------------------------------------------------------------------
// In-app notifications
// ---------------------------------------------------------------------------

// Notify writes one inbox row. Errors are returned but callers generally log and
// continue: failing to notify must never roll back the business action that
// triggered it.
func (r *NotificationRepo) Notify(ctx context.Context, n *models.Notification) (string, error) {
	if n.UserID == "" {
		return "", fmt.Errorf("notification needs a recipient")
	}
	if n.Severity == "" {
		n.Severity = "info"
	}
	if n.Type == "" {
		n.Type = "info"
	}
	id := uuid.New().String()
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO notifications
			(id, company_id, user_id, type, severity, title, body, link, entity_type, entity_id)
		VALUES (?,?,?,?,?,?,?,?,?,?)`,
		id, n.CompanyID, n.UserID, n.Type, n.Severity, truncate(n.Title, 200),
		nullStr(truncate(n.Body, 500)), nullStr(n.Link), nullStr(n.EntityType), nullStr(n.EntityID))
	if err != nil {
		return "", err
	}
	return id, nil
}

// NotifyMany fans one event out to several recipients, skipping duplicates and
// any empty ids. Returns how many rows were written.
func (r *NotificationRepo) NotifyMany(ctx context.Context, userIDs []string, n models.Notification) int {
	seen := map[string]bool{}
	count := 0
	for _, uid := range userIDs {
		if uid == "" || seen[uid] {
			continue
		}
		seen[uid] = true
		one := n
		one.UserID = uid
		if _, err := r.Notify(ctx, &one); err == nil {
			count++
		}
	}
	return count
}

// List returns a user's inbox for one company, newest first.
func (r *NotificationRepo) List(ctx context.Context, companyID, userID string, unreadOnly bool, limit int) ([]models.Notification, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	q := `
		SELECT id, company_id, user_id, type, severity, title, COALESCE(body,''),
		       COALESCE(link,''), COALESCE(entity_type,''), COALESCE(entity_id,''),
		       is_read, COALESCE(read_at,''), created_at
		FROM notifications
		WHERE company_id = ? AND user_id = ?`
	if unreadOnly {
		q += ` AND is_read = 0`
	}
	q += ` ORDER BY created_at DESC LIMIT ?`

	rows, err := r.db.QueryContext(ctx, q, companyID, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.Notification
	for rows.Next() {
		var n models.Notification
		var isRead int
		if err := rows.Scan(&n.ID, &n.CompanyID, &n.UserID, &n.Type, &n.Severity, &n.Title,
			&n.Body, &n.Link, &n.EntityType, &n.EntityID, &isRead, &n.ReadAt, &n.CreatedAt); err != nil {
			return nil, err
		}
		n.IsRead = isRead == 1
		out = append(out, n)
	}
	return out, rows.Err()
}

func (r *NotificationRepo) UnreadCount(ctx context.Context, companyID, userID string) (int, error) {
	var n int
	err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM notifications WHERE company_id=? AND user_id=? AND is_read=0`,
		companyID, userID).Scan(&n)
	return n, err
}

// MarkRead flips one notification. Scoped by user_id as well as id so a guessed
// uuid from another account is a no-op rather than an information leak.
func (r *NotificationRepo) MarkRead(ctx context.Context, companyID, userID, id string, read bool) error {
	if read {
		_, err := r.db.ExecContext(ctx,
			`UPDATE notifications SET is_read=1, read_at=NOW() WHERE id=? AND company_id=? AND user_id=?`,
			id, companyID, userID)
		return err
	}
	_, err := r.db.ExecContext(ctx,
		`UPDATE notifications SET is_read=0, read_at=NULL WHERE id=? AND company_id=? AND user_id=?`,
		id, companyID, userID)
	return err
}

func (r *NotificationRepo) MarkAllRead(ctx context.Context, companyID, userID string) (int64, error) {
	res, err := r.db.ExecContext(ctx,
		`UPDATE notifications SET is_read=1, read_at=NOW() WHERE company_id=? AND user_id=? AND is_read=0`,
		companyID, userID)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (r *NotificationRepo) Delete(ctx context.Context, companyID, userID, id string) error {
	_, err := r.db.ExecContext(ctx,
		`DELETE FROM notifications WHERE id=? AND company_id=? AND user_id=?`, id, companyID, userID)
	return err
}

// PurgeRead drops read notifications older than the given number of days, so the
// table does not grow without bound. Called opportunistically by the worker.
func (r *NotificationRepo) PurgeRead(ctx context.Context, olderThanDays int) (int64, error) {
	res, err := r.db.ExecContext(ctx,
		`DELETE FROM notifications WHERE is_read=1 AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
		olderThanDays)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// ---------------------------------------------------------------------------
// Recipient lookup
// ---------------------------------------------------------------------------

// UsersWithPermission returns the user ids in a company that hold a given
// module/function right, plus every admin (who bypass the permission map). This
// is how "notify whoever can approve this" is answered without hardcoding names.
func (r *NotificationRepo) UsersWithPermission(ctx context.Context, companyID, module, fn string) ([]string, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT user_id FROM user_company_access
		WHERE company_id = ? AND is_active = 1
		  AND (role IN ('superadmin','admin')
		       OR JSON_CONTAINS(COALESCE(permissions, JSON_OBJECT()), JSON_QUOTE(?), CONCAT('$.', ?)))`,
		companyID, fn, module)
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

// UserForEmployee resolves the login account behind an employee record, plus that
// account's email. Returns ("", "") when the employee has no user account — the
// common case for rank-and-file staff, who are then reachable in-app only
// (employees.email_enc is end-to-end encrypted and unreadable by the server).
func (r *NotificationRepo) UserForEmployee(ctx context.Context, companyID, employeeID string) (userID, email, name string) {
	row := r.db.QueryRowContext(ctx, `
		SELECT COALESCE(e.user_id,''), COALESCE(u.email,''), CONCAT(e.first_name,' ',e.last_name)
		FROM employees e
		LEFT JOIN users u ON u.id = e.user_id
		WHERE e.id = ? AND e.company_id = ? AND e.is_deleted = 0`, employeeID, companyID)
	_ = row.Scan(&userID, &email, &name)
	return
}

// EmailsForUsers maps user ids to addresses, skipping inactive accounts.
func (r *NotificationRepo) EmailsForUsers(ctx context.Context, userIDs []string) map[string]string {
	out := map[string]string{}
	for _, id := range userIDs {
		if id == "" {
			continue
		}
		var email string
		if err := r.db.QueryRowContext(ctx,
			`SELECT email FROM users WHERE id=? AND is_active=1`, id).Scan(&email); err == nil && email != "" {
			out[id] = email
		}
	}
	return out
}

// ---------------------------------------------------------------------------
// Email outbox
// ---------------------------------------------------------------------------

// Queue writes a Pending message. It never dials anything — see the package
// comment on migration 021 for why sending is deferred to the worker.
func (r *NotificationRepo) Queue(ctx context.Context, e *models.OutboxEmail) (string, error) {
	if e.ToEmail == "" {
		return "", fmt.Errorf("email needs a recipient address")
	}
	id := uuid.New().String()
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO email_outbox
			(id, company_id, to_email, to_name, cc_email, subject, body_text, body_html,
			 status, next_try_at, entity_type, entity_id, created_by)
		VALUES (?,?,?,?,?,?,?,?, 'Pending', NOW(), ?,?,?)`,
		id, e.CompanyID, e.ToEmail, nullStr(e.ToName), nullStr(e.CCEmail),
		truncate(e.Subject, 255), e.BodyText, nullStr(e.BodyHTML),
		nullStr(e.EntityType), nullStr(e.EntityID), nullStr(e.CreatedBy))
	if err != nil {
		return "", err
	}
	return id, nil
}

// ClaimDue returns messages that are due to be attempted, oldest first.
//
// Not a locking claim: this app runs a single server process and one worker
// goroutine, so there is no second consumer to race with. If that ever changes,
// this is the function to convert to SELECT … FOR UPDATE SKIP LOCKED.
func (r *NotificationRepo) ClaimDue(ctx context.Context, limit int) ([]models.OutboxEmail, error) {
	if limit <= 0 {
		limit = 20
	}
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, company_id, to_email, COALESCE(to_name,''), COALESCE(cc_email,''),
		       subject, body_text, COALESCE(body_html,''), status, attempts,
		       COALESCE(last_error,''), COALESCE(next_try_at,''), COALESCE(sent_at,''),
		       COALESCE(entity_type,''), COALESCE(entity_id,''), created_at
		FROM email_outbox
		WHERE status = 'Pending' AND (next_try_at IS NULL OR next_try_at <= NOW())
		ORDER BY created_at
		LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanOutbox(rows)
}

func (r *NotificationRepo) MarkSent(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE email_outbox
		SET status='Sent', sent_at=NOW(), attempts=attempts+1, last_error=NULL, next_try_at=NULL
		WHERE id=?`, id)
	return err
}

// MarkAttemptFailed records a failure and schedules the retry. Once attempts
// reach maxEmailAttempts the row parks as Failed and stops being claimed —
// visible in Settings, where a human can fix the address and hit Retry.
func (r *NotificationRepo) MarkAttemptFailed(ctx context.Context, id string, attempts int, reason string) error {
	next := attempts + 1
	if next >= maxEmailAttempts {
		_, err := r.db.ExecContext(ctx, `
			UPDATE email_outbox SET status='Failed', attempts=?, last_error=?, next_try_at=NULL WHERE id=?`,
			next, truncate(reason, 500), id)
		return err
	}
	// Exponential backoff: 1, 5, 25, 125 minutes.
	delay := time.Duration(pow5(next)) * time.Minute
	_, err := r.db.ExecContext(ctx, `
		UPDATE email_outbox
		SET attempts=?, last_error=?, next_try_at=DATE_ADD(NOW(), INTERVAL ? SECOND)
		WHERE id=?`, next, truncate(reason, 500), int(delay.Seconds()), id)
	return err
}

// ListOutbox powers the operator-facing queue view.
func (r *NotificationRepo) ListOutbox(ctx context.Context, companyID, status string, limit int) ([]models.OutboxEmail, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	q := `
		SELECT id, company_id, to_email, COALESCE(to_name,''), COALESCE(cc_email,''),
		       subject, body_text, COALESCE(body_html,''), status, attempts,
		       COALESCE(last_error,''), COALESCE(next_try_at,''), COALESCE(sent_at,''),
		       COALESCE(entity_type,''), COALESCE(entity_id,''), created_at
		FROM email_outbox
		WHERE company_id = ?`
	args := []interface{}{companyID}
	if status != "" && status != "all" {
		q += ` AND status = ?`
		args = append(args, status)
	}
	q += ` ORDER BY created_at DESC LIMIT ?`
	args = append(args, limit)

	rows, err := r.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanOutbox(rows)
}

// Requeue puts a Failed or Cancelled message back in line with its attempt
// counter reset, so a fixed relay gets a full retry budget.
func (r *NotificationRepo) Requeue(ctx context.Context, companyID, id string) error {
	res, err := r.db.ExecContext(ctx, `
		UPDATE email_outbox
		SET status='Pending', attempts=0, last_error=NULL, next_try_at=NOW()
		WHERE id=? AND company_id=? AND status IN ('Failed','Cancelled')`, id, companyID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("only failed or cancelled messages can be retried")
	}
	return nil
}

// Cancel stops a message that has not gone out yet.
func (r *NotificationRepo) Cancel(ctx context.Context, companyID, id string) error {
	res, err := r.db.ExecContext(ctx, `
		UPDATE email_outbox SET status='Cancelled', next_try_at=NULL
		WHERE id=? AND company_id=? AND status='Pending'`, id, companyID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("only pending messages can be cancelled")
	}
	return nil
}

// OutboxCounts summarises the queue for the settings screen.
func (r *NotificationRepo) OutboxCounts(ctx context.Context, companyID string) (map[string]int, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT status, COUNT(*) FROM email_outbox WHERE company_id=? GROUP BY status`, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int{"Pending": 0, "Sent": 0, "Failed": 0, "Cancelled": 0}
	for rows.Next() {
		var s string
		var n int
		if err := rows.Scan(&s, &n); err != nil {
			return nil, err
		}
		out[s] = n
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

func scanOutbox(rows *sql.Rows) ([]models.OutboxEmail, error) {
	var out []models.OutboxEmail
	for rows.Next() {
		var e models.OutboxEmail
		if err := rows.Scan(&e.ID, &e.CompanyID, &e.ToEmail, &e.ToName, &e.CCEmail,
			&e.Subject, &e.BodyText, &e.BodyHTML, &e.Status, &e.Attempts,
			&e.LastError, &e.NextTryAt, &e.SentAt, &e.EntityType, &e.EntityID, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// pow5 returns 5^(n-1) capped at 125 — the backoff multiplier in minutes.
func pow5(n int) int {
	v := 1
	for i := 1; i < n && v < 125; i++ {
		v *= 5
	}
	return v
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max]
}
