package repository

import (
	"context"
	"database/sql"
	"time"

	"lettersheets/internal/models"
)

type AttendanceRepo struct {
	db *sql.DB
}

func NewAttendanceRepo(db *sql.DB) *AttendanceRepo {
	return &AttendanceRepo{db: db}
}

func (r *AttendanceRepo) GetByDateRange(ctx context.Context, companyID, dateFrom, dateTo string) ([]models.Attendance, error) {
	rows, err := r.db.QueryContext(ctx, "CALL sp_get_attendance(?, ?, ?)", companyID, dateFrom, dateTo)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []models.Attendance
	for rows.Next() {
		var a models.Attendance
		var dt, clockIn, clockOut, createdAt, updatedAt sql.NullString
		var hoursWorked sql.NullFloat64
		err := rows.Scan(
			&a.ID, &a.CompanyID, &a.EmployeeID, &dt,
			&clockIn, &clockOut, &hoursWorked, &a.OvertimeHours,
			&a.Status, &a.Remarks, &createdAt, &updatedAt,
			&a.FirstName, &a.LastName, &a.Department, &a.Position,
		)
		if err != nil {
			return nil, err
		}
		if dt.Valid {
			a.Date = dt.String
		}
		if clockIn.Valid {
			a.ClockIn = &clockIn.String
		}
		if clockOut.Valid {
			a.ClockOut = &clockOut.String
		}
		if hoursWorked.Valid {
			a.HoursWorked = &hoursWorked.Float64
		}
		if createdAt.Valid {
			a.CreatedAt = createdAt.String
		}
		if updatedAt.Valid {
			a.UpdatedAt = updatedAt.String
		}
		records = append(records, a)
	}
	return records, nil
}

func (r *AttendanceRepo) ClockIn(ctx context.Context, id, employeeID string, meta *models.RequestMeta) error {
	now := time.Now().Format("2006-01-02 15:04:05")
	today := time.Now().Format("2006-01-02")
	_, err := r.db.ExecContext(ctx,
		"CALL sp_clock_in(?, ?, ?, ?, ?, ?, ?, ?, ?)",
		id, meta.CompanyID, employeeID, today, now,
		meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent,
	)
	return err
}

func (r *AttendanceRepo) ClockOut(ctx context.Context, id string, meta *models.RequestMeta) error {
	now := time.Now().Format("2006-01-02 15:04:05")
	_, err := r.db.ExecContext(ctx,
		"CALL sp_clock_out(?, ?, ?, ?, ?, ?, ?)",
		id, meta.CompanyID, now,
		meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent,
	)
	return err
}

func (r *AttendanceRepo) Create(ctx context.Context, a *models.Attendance, meta *models.RequestMeta) error {
	clockIn := ""
	clockOut := ""
	remarks := ""
	if a.ClockIn != nil {
		clockIn = *a.ClockIn
	}
	if a.ClockOut != nil {
		clockOut = *a.ClockOut
	}
	if a.Remarks != nil {
		remarks = *a.Remarks
	}

	_, err := r.db.ExecContext(ctx,
		"CALL sp_create_attendance(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		a.ID, meta.CompanyID, a.EmployeeID, a.Date,
		clockIn, clockOut, a.Status, remarks,
		meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent,
	)
	return err
}

func (r *AttendanceRepo) Update(ctx context.Context, a *models.Attendance, meta *models.RequestMeta) error {
	clockIn := ""
	clockOut := ""
	remarks := ""
	if a.ClockIn != nil {
		clockIn = *a.ClockIn
	}
	if a.ClockOut != nil {
		clockOut = *a.ClockOut
	}
	if a.Remarks != nil {
		remarks = *a.Remarks
	}

	_, err := r.db.ExecContext(ctx,
		"CALL sp_update_attendance(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		a.ID, meta.CompanyID,
		clockIn, clockOut, a.Status, remarks,
		meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent,
	)
	return err
}

func (r *AttendanceRepo) Delete(ctx context.Context, id string, meta *models.RequestMeta) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_delete_attendance(?, ?, ?, ?, ?, ?)",
		id, meta.CompanyID, meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent,
	)
	return err
}
