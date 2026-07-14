package repository

import (
	"context"
	"database/sql"
	"fmt"

	"lettersheets/internal/models"
)

type LeaveRepo struct {
	db *sql.DB
}

func NewLeaveRepo(db *sql.DB) *LeaveRepo {
	return &LeaveRepo{db: db}
}

func (r *LeaveRepo) GetByCompany(ctx context.Context, companyID, status, dateFrom, dateTo string) ([]models.Leave, error) {
	rows, err := r.db.QueryContext(ctx, "CALL sp_get_leaves(?, ?, ?, ?)", companyID, status, dateFrom, dateTo)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var leaves []models.Leave
	for rows.Next() {
		var l models.Leave
		var startDate, endDate, approvedAt, createdAt, updatedAt sql.NullString
		err := rows.Scan(
			&l.ID, &l.CompanyID, &l.EmployeeID, &l.LeaveType,
			&startDate, &endDate, &l.Days, &l.Reason,
			&l.Status, &l.ApprovedBy, &approvedAt, &l.RejectionNote,
			&createdAt, &updatedAt,
			&l.FirstName, &l.LastName, &l.Department, &l.Position,
		)
		if err != nil {
			return nil, err
		}
		if startDate.Valid {
			l.StartDate = startDate.String
		}
		if endDate.Valid {
			l.EndDate = endDate.String
		}
		if approvedAt.Valid {
			l.ApprovedAt = &approvedAt.String
		}
		if createdAt.Valid {
			l.CreatedAt = createdAt.String
		}
		if updatedAt.Valid {
			l.UpdatedAt = updatedAt.String
		}
		leaves = append(leaves, l)
	}
	return leaves, nil
}

func (r *LeaveRepo) Create(ctx context.Context, l *models.Leave, meta *models.RequestMeta) error {
	reason := ""
	if l.Reason != nil {
		reason = *l.Reason
	}

	_, err := r.db.ExecContext(ctx,
		"CALL sp_create_leave(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		l.ID, meta.CompanyID, l.EmployeeID, l.LeaveType,
		l.StartDate, l.EndDate, l.Days, reason,
		meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent,
	)
	return err
}

func (r *LeaveRepo) Update(ctx context.Context, l *models.Leave, meta *models.RequestMeta) error {
	reason := ""
	if l.Reason != nil {
		reason = *l.Reason
	}

	_, err := r.db.ExecContext(ctx,
		"CALL sp_update_leave(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		l.ID, meta.CompanyID, l.LeaveType,
		l.StartDate, l.EndDate, l.Days, reason,
		meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent,
	)
	return err
}

// AdminUpdate edits a leave's details (type/dates/days/reason) regardless of its
// status. Unlike sp_update_leave — which guards on status='Pending' and so silently
// no-ops on an approved leave — this uses plain SQL (ls_user has DML) so an admin
// can correct an already-approved leave; the handler pairs it with a leave-credit
// reconciliation. It also writes a field-level change_history row per changed field
// (matching what the SPs do elsewhere) so the edit shows up in the History tab.
// Returns rows affected so the caller can distinguish "not found".
func (r *LeaveRepo) AdminUpdate(ctx context.Context, l *models.Leave, meta *models.RequestMeta) (int64, error) {
	// Read the current values first, for the audit diff. Dates are formatted so
	// they compare cleanly against the request's "YYYY-MM-DD" strings.
	var old models.Leave
	var oldReason string
	err := r.db.QueryRowContext(ctx, `
		SELECT leave_type, DATE_FORMAT(start_date,'%Y-%m-%d'), DATE_FORMAT(end_date,'%Y-%m-%d'), days, COALESCE(reason,'')
		FROM leaves WHERE id = ? AND company_id = ? AND is_deleted = 0`,
		l.ID, meta.CompanyID).Scan(&old.LeaveType, &old.StartDate, &old.EndDate, &old.Days, &oldReason)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}

	var reason interface{}
	newReason := ""
	if l.Reason != nil && *l.Reason != "" {
		reason = *l.Reason
		newReason = *l.Reason
	}
	res, err := r.db.ExecContext(ctx, `
		UPDATE leaves
		SET leave_type = ?, start_date = ?, end_date = ?, days = ?, reason = ?, updated_at = NOW()
		WHERE id = ? AND company_id = ? AND is_deleted = 0`,
		l.LeaveType, l.StartDate, l.EndDate, l.Days, reason, l.ID, meta.CompanyID)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return 0, nil
	}

	// Audit trail — one row per changed field, best-effort (never fails the edit).
	r.logChange(ctx, meta, l.ID, "leave_type", old.LeaveType, l.LeaveType)
	r.logChange(ctx, meta, l.ID, "start_date", old.StartDate, l.StartDate)
	r.logChange(ctx, meta, l.ID, "end_date", old.EndDate, l.EndDate)
	r.logChange(ctx, meta, l.ID, "days", fmt.Sprintf("%g", old.Days), fmt.Sprintf("%g", l.Days))
	r.logChange(ctx, meta, l.ID, "reason", oldReason, newReason)
	return n, nil
}

// logChange inserts one change_history row for a single field, skipping unchanged
// fields. Mirrors the change_history writes the stored procedures perform.
func (r *LeaveRepo) logChange(ctx context.Context, meta *models.RequestMeta, recordID, field, oldVal, newVal string) {
	if oldVal == newVal {
		return
	}
	var session interface{}
	if meta.SessionID != "" {
		session = meta.SessionID
	}
	r.db.ExecContext(ctx, `
		INSERT INTO change_history
			(id, company_id, changed_by, session_id, table_name, record_id, change_type, field_name, old_value, new_value, ip_address, user_agent)
		VALUES (UUID(), ?, ?, ?, 'leaves', ?, 'UPDATE', ?, ?, ?, ?, ?)`,
		meta.CompanyID, meta.UserID, session, recordID, field, oldVal, newVal, meta.IPAddress, meta.UserAgent)
}

func (r *LeaveRepo) Approve(ctx context.Context, id, companyID, status, rejectionNote string, meta *models.RequestMeta) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_approve_leave(?, ?, ?, ?, ?, ?, ?, ?)",
		id, companyID, status, rejectionNote,
		meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent,
	)
	return err
}

func (r *LeaveRepo) Delete(ctx context.Context, id string, meta *models.RequestMeta) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_delete_leave(?, ?, ?, ?, ?, ?)",
		id, meta.CompanyID, meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent,
	)
	return err
}
