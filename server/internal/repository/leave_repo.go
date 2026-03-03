package repository

import (
	"context"
	"database/sql"

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
