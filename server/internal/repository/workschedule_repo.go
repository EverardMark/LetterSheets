package repository

import (
	"context"
	"database/sql"
	"encoding/json"

	"lettersheets/internal/models"
)

type WorkScheduleRepo struct {
	db *sql.DB
}

func NewWorkScheduleRepo(db *sql.DB) *WorkScheduleRepo {
	return &WorkScheduleRepo{db: db}
}

// ==================== WORK SCHEDULES ====================

func (r *WorkScheduleRepo) GetByCompany(ctx context.Context, companyID string) ([]models.WorkSchedule, error) {
	rows, err := r.db.QueryContext(ctx, "CALL sp_get_work_schedules(?)", companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var schedules []models.WorkSchedule
	for rows.Next() {
		var s models.WorkSchedule
		var createdAt, updatedAt sql.NullString
		err := rows.Scan(
			&s.ID, &s.CompanyID, &s.Name, &s.Type, &s.Description,
			&s.Color, &s.IsDefault, &createdAt, &updatedAt,
			&s.EmployeeCount, &s.DepartmentCount, &s.PositionCount,
		)
		if err != nil {
			return nil, err
		}
		if createdAt.Valid {
			s.CreatedAt = createdAt.String
		}
		if updatedAt.Valid {
			s.UpdatedAt = updatedAt.String
		}
		schedules = append(schedules, s)
	}
	return schedules, nil
}

func (r *WorkScheduleRepo) GetByID(ctx context.Context, id, companyID string) (*models.WorkSchedule, error) {
	rows, err := r.db.QueryContext(ctx, "CALL sp_get_work_schedule(?, ?)", id, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, nil
	}

	var s models.WorkSchedule
	var createdAt, updatedAt sql.NullString
	err = rows.Scan(
		&s.ID, &s.CompanyID, &s.Name, &s.Type, &s.Description,
		&s.Color, &s.IsDefault, &createdAt, &updatedAt,
	)
	if err != nil {
		return nil, err
	}
	if createdAt.Valid {
		s.CreatedAt = createdAt.String
	}
	if updatedAt.Valid {
		s.UpdatedAt = updatedAt.String
	}
	return &s, nil
}

func (r *WorkScheduleRepo) Create(ctx context.Context, s *models.WorkSchedule, meta *models.RequestMeta) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_create_work_schedule(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		s.ID, meta.CompanyID, s.Name, s.Type, s.Description, s.Color, s.IsDefault,
		meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent,
	)
	return err
}

func (r *WorkScheduleRepo) Update(ctx context.Context, s *models.WorkSchedule, meta *models.RequestMeta) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_update_work_schedule(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		s.ID, meta.CompanyID, s.Name, s.Type, s.Description, s.Color, s.IsDefault,
		meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent,
	)
	return err
}

func (r *WorkScheduleRepo) Delete(ctx context.Context, id string, meta *models.RequestMeta) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_delete_work_schedule(?, ?, ?, ?, ?, ?)",
		id, meta.CompanyID, meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent,
	)
	return err
}

// ==================== SCHEDULE DAYS ====================

func (r *WorkScheduleRepo) GetDays(ctx context.Context, scheduleID string) ([]models.WorkScheduleDay, error) {
	rows, err := r.db.QueryContext(ctx, "CALL sp_get_work_schedule_days(?)", scheduleID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var days []models.WorkScheduleDay
	for rows.Next() {
		var d models.WorkScheduleDay
		var startTime, endTime sql.NullString
		var createdAt, updatedAt sql.NullString
		err := rows.Scan(
			&d.ID, &d.ScheduleID, &d.DayOfWeek, &startTime, &endTime,
			&d.BreakMinutes, &d.IsRestDay, &createdAt, &updatedAt,
		)
		if err != nil {
			return nil, err
		}
		if startTime.Valid {
			d.StartTime = &startTime.String
		}
		if endTime.Valid {
			d.EndTime = &endTime.String
		}
		if createdAt.Valid {
			d.CreatedAt = createdAt.String
		}
		if updatedAt.Valid {
			d.UpdatedAt = updatedAt.String
		}
		days = append(days, d)
	}
	return days, nil
}

func (r *WorkScheduleRepo) UpsertDay(ctx context.Context, d *models.WorkScheduleDay) error {
	startTime := ""
	if d.StartTime != nil {
		startTime = *d.StartTime
	}
	endTime := ""
	if d.EndTime != nil {
		endTime = *d.EndTime
	}

	_, err := r.db.ExecContext(ctx,
		"CALL sp_upsert_work_schedule_day(?, ?, ?, ?, ?, ?, ?)",
		d.ID, d.ScheduleID, d.DayOfWeek, startTime, endTime,
		d.BreakMinutes, d.IsRestDay,
	)
	return err
}

func (r *WorkScheduleRepo) ClearDays(ctx context.Context, scheduleID string) error {
	_, err := r.db.ExecContext(ctx, "CALL sp_clear_work_schedule_days(?)", scheduleID)
	return err
}

// ==================== SCHEDULE DEFAULTS (dept/position) ====================

func (r *WorkScheduleRepo) GetDefaults(ctx context.Context, companyID string) ([]models.WorkScheduleDefault, error) {
	rows, err := r.db.QueryContext(ctx, "CALL sp_get_work_schedule_defaults(?)", companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var defaults []models.WorkScheduleDefault
	for rows.Next() {
		var d models.WorkScheduleDefault
		var createdAt, updatedAt sql.NullString
		err := rows.Scan(
			&d.ID, &d.CompanyID, &d.ScheduleID, &d.Scope, &d.ScopeValue,
			&createdAt, &updatedAt,
			&d.ScheduleName, &d.ScheduleType, &d.ScheduleColor,
		)
		if err != nil {
			return nil, err
		}
		if createdAt.Valid {
			d.CreatedAt = createdAt.String
		}
		if updatedAt.Valid {
			d.UpdatedAt = updatedAt.String
		}
		defaults = append(defaults, d)
	}
	return defaults, nil
}

func (r *WorkScheduleRepo) GetDefaultsBySchedule(ctx context.Context, scheduleID, companyID string) ([]models.WorkScheduleDefault, error) {
	rows, err := r.db.QueryContext(ctx, "CALL sp_get_work_schedule_defaults_by_schedule(?, ?)", scheduleID, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var defaults []models.WorkScheduleDefault
	for rows.Next() {
		var d models.WorkScheduleDefault
		var createdAt, updatedAt sql.NullString
		err := rows.Scan(
			&d.ID, &d.CompanyID, &d.ScheduleID, &d.Scope, &d.ScopeValue,
			&createdAt, &updatedAt,
		)
		if err != nil {
			return nil, err
		}
		if createdAt.Valid {
			d.CreatedAt = createdAt.String
		}
		if updatedAt.Valid {
			d.UpdatedAt = updatedAt.String
		}
		defaults = append(defaults, d)
	}
	return defaults, nil
}

func (r *WorkScheduleRepo) UpsertDefault(ctx context.Context, d *models.WorkScheduleDefault, meta *models.RequestMeta) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_upsert_work_schedule_default(?, ?, ?, ?, ?, ?, ?, ?, ?)",
		d.ID, meta.CompanyID, d.ScheduleID, d.Scope, d.ScopeValue,
		meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent,
	)
	return err
}

func (r *WorkScheduleRepo) DeleteDefault(ctx context.Context, id string, meta *models.RequestMeta) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_delete_work_schedule_default(?, ?, ?, ?, ?, ?)",
		id, meta.CompanyID, meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent,
	)
	return err
}

// ==================== RESOLUTION ====================

func (r *WorkScheduleRepo) ResolveEmployeeSchedule(ctx context.Context, employeeID, companyID string) (*models.ResolvedSchedule, error) {
	rows, err := r.db.QueryContext(ctx, "CALL sp_resolve_employee_schedule(?, ?)", employeeID, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, nil
	}

	var rs models.ResolvedSchedule
	err = rows.Scan(&rs.ID, &rs.Name, &rs.Type, &rs.Color, &rs.Description, &rs.ResolvedFrom)
	if err != nil {
		return nil, err
	}

	// Move to second result set (days)
	if !rows.NextResultSet() {
		return &rs, nil
	}
	for rows.Next() {
		var d models.WorkScheduleDay
		var startTime, endTime sql.NullString
		err := rows.Scan(&d.DayOfWeek, &startTime, &endTime, &d.BreakMinutes, &d.IsRestDay)
		if err != nil {
			return nil, err
		}
		if startTime.Valid {
			d.StartTime = &startTime.String
		}
		if endTime.Valid {
			d.EndTime = &endTime.String
		}
		rs.Days = append(rs.Days, d)
	}
	return &rs, nil
}

func (r *WorkScheduleRepo) GetRoster(ctx context.Context, companyID, date string) ([]models.RosterEntry, error) {
	rows, err := r.db.QueryContext(ctx, "CALL sp_get_schedule_roster(?, ?)", companyID, date)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []models.RosterEntry
	for rows.Next() {
		var e models.RosterEntry
		var scheduleID, scheduleName, scheduleColor sql.NullString
		var startTime, endTime sql.NullString
		var breakMin sql.NullInt64
		var isRestDay sql.NullBool
		err := rows.Scan(
			&e.EmployeeID, &e.FirstName, &e.LastName,
			&e.Department, &e.Position, &e.EmploymentType,
			&scheduleID, &e.ResolvedFrom,
			&scheduleName, &scheduleColor,
			&startTime, &endTime, &breakMin, &isRestDay,
		)
		if err != nil {
			return nil, err
		}
		if scheduleID.Valid {
			e.ScheduleID = &scheduleID.String
		}
		if scheduleName.Valid {
			e.ScheduleName = &scheduleName.String
		}
		if scheduleColor.Valid {
			e.ScheduleColor = &scheduleColor.String
		}
		if startTime.Valid {
			e.StartTime = &startTime.String
		}
		if endTime.Valid {
			e.EndTime = &endTime.String
		}
		if breakMin.Valid {
			v := int(breakMin.Int64)
			e.BreakMinutes = &v
		}
		if isRestDay.Valid {
			e.IsRestDay = isRestDay.Bool
		}
		entries = append(entries, e)
	}
	return entries, nil
}

// BulkAssign sets work_schedule_id on multiple employees
func (r *WorkScheduleRepo) BulkAssign(ctx context.Context, companyID string, employeeIDs []string, scheduleID string, meta *models.RequestMeta) error {
	idsJSON, err := json.Marshal(employeeIDs)
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx,
		"CALL sp_bulk_assign_employee_schedule(?, ?, ?, ?, ?, ?, ?)",
		meta.CompanyID, string(idsJSON), scheduleID,
		meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent,
	)
	return err
}
