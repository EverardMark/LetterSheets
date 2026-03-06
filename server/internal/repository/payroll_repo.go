package repository

import (
	"context"
	"database/sql"

	"lettersheets/internal/models"
)

type PayrollRepo struct {
	db *sql.DB
}

func NewPayrollRepo(db *sql.DB) *PayrollRepo {
	return &PayrollRepo{db: db}
}

// ==================== SETTINGS ====================

func (r *PayrollRepo) GetSettings(ctx context.Context, companyID string) (*models.PayrollSettings, error) {
	rows, err := r.db.QueryContext(ctx, "CALL sp_get_payroll_settings(?)", companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, nil // no settings yet
	}

	var s models.PayrollSettings
	var createdAt, updatedAt sql.NullString
	err = rows.Scan(
		&s.ID, &s.CompanyID, &s.PaySchedule,
		&s.OTMultiplier,
		&createdAt, &updatedAt,
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

func (r *PayrollRepo) UpsertSettings(ctx context.Context, s *models.PayrollSettings, meta *models.RequestMeta) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_upsert_payroll_settings(?, ?, ?, ?, ?, ?, ?, ?)",
		s.ID, meta.CompanyID, s.PaySchedule,
		s.OTMultiplier,
		meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent,
	)
	return err
}

// ==================== RUNS ====================

func (r *PayrollRepo) GetRuns(ctx context.Context, companyID string) ([]models.PayrollRun, error) {
	rows, err := r.db.QueryContext(ctx, "CALL sp_get_payroll_runs(?)", companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var runs []models.PayrollRun
	for rows.Next() {
		var run models.PayrollRun
		var periodStart, periodEnd, payDate, approvedAt, createdAt, updatedAt sql.NullString
		err := rows.Scan(
			&run.ID, &run.CompanyID, &periodStart, &periodEnd, &payDate,
			&run.Status, &run.TotalGross, &run.TotalDeductions, &run.TotalNet,
			&run.EmployeeCount, &run.Notes, &run.ApprovedBy, &approvedAt,
			&createdAt, &updatedAt,
		)
		if err != nil {
			return nil, err
		}
		if periodStart.Valid {
			run.PeriodStart = periodStart.String
		}
		if periodEnd.Valid {
			run.PeriodEnd = periodEnd.String
		}
		if payDate.Valid {
			run.PayDate = &payDate.String
		}
		if approvedAt.Valid {
			run.ApprovedAt = &approvedAt.String
		}
		if createdAt.Valid {
			run.CreatedAt = createdAt.String
		}
		if updatedAt.Valid {
			run.UpdatedAt = updatedAt.String
		}
		runs = append(runs, run)
	}
	return runs, nil
}

func (r *PayrollRepo) GetRun(ctx context.Context, id, companyID string) (*models.PayrollRun, error) {
	rows, err := r.db.QueryContext(ctx, "CALL sp_get_payroll_run(?, ?)", id, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, nil
	}

	var run models.PayrollRun
	var periodStart, periodEnd, payDate, approvedAt, createdAt, updatedAt sql.NullString
	err = rows.Scan(
		&run.ID, &run.CompanyID, &periodStart, &periodEnd, &payDate,
		&run.Status, &run.TotalGross, &run.TotalDeductions, &run.TotalNet,
		&run.EmployeeCount, &run.Notes, &run.ApprovedBy, &approvedAt,
		&createdAt, &updatedAt,
	)
	if err != nil {
		return nil, err
	}
	if periodStart.Valid {
		run.PeriodStart = periodStart.String
	}
	if periodEnd.Valid {
		run.PeriodEnd = periodEnd.String
	}
	if payDate.Valid {
		run.PayDate = &payDate.String
	}
	if approvedAt.Valid {
		run.ApprovedAt = &approvedAt.String
	}
	if createdAt.Valid {
		run.CreatedAt = createdAt.String
	}
	if updatedAt.Valid {
		run.UpdatedAt = updatedAt.String
	}
	return &run, nil
}

func (r *PayrollRepo) CreateRun(ctx context.Context, run *models.PayrollRun, meta *models.RequestMeta) error {
	payDate := ""
	notes := ""
	if run.PayDate != nil {
		payDate = *run.PayDate
	}
	if run.Notes != nil {
		notes = *run.Notes
	}

	_, err := r.db.ExecContext(ctx,
		"CALL sp_create_payroll_run(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		run.ID, meta.CompanyID, run.PeriodStart, run.PeriodEnd, payDate, notes,
		meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent,
	)
	return err
}

func (r *PayrollRepo) UpdateRunStatus(ctx context.Context, run *models.PayrollRun, meta *models.RequestMeta) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_update_payroll_run_status(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		run.ID, meta.CompanyID, run.Status,
		run.TotalGross, run.TotalDeductions, run.TotalNet, run.EmployeeCount,
		meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent,
	)
	return err
}

func (r *PayrollRepo) DeleteRun(ctx context.Context, id string, meta *models.RequestMeta) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_delete_payroll_run(?, ?, ?, ?, ?, ?)",
		id, meta.CompanyID, meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent,
	)
	return err
}

// ==================== ITEMS ====================

func (r *PayrollRepo) GetItems(ctx context.Context, runID, companyID string) ([]models.PayrollItem, error) {
	rows, err := r.db.QueryContext(ctx, "CALL sp_get_payroll_items(?, ?)", runID, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []models.PayrollItem
	for rows.Next() {
		var it models.PayrollItem
		var createdAt, updatedAt sql.NullString
		var workScheduleName sql.NullString
		var hoursPerDay sql.NullFloat64
		var workingDaysPerMonth sql.NullInt64
		var otMultiplierUsed sql.NullFloat64
		err := rows.Scan(
			&it.ID, &it.RunID, &it.CompanyID, &it.EmployeeID,
			&it.BasicPay, &it.DaysWorked, &it.HoursWorked,
			&it.OTHours, &it.OTPay, &it.HolidayPay, &it.NightDiff,
			&it.Allowances, &it.OtherEarnings, &it.GrossPay,
			&it.SSSEE, &it.SSSER, &it.PhilHealthEE, &it.PhilHealthER,
			&it.PagibigEE, &it.PagibigER, &it.WithholdingTax,
			&it.BenefitDeductions, &it.LoanDeductions, &it.OtherDeductions,
			&it.TotalDeductions, &it.NetPay,
			&createdAt, &updatedAt,
			&it.FirstName, &it.LastName, &it.Department, &it.Position,
			&workScheduleName, &hoursPerDay, &workingDaysPerMonth, &otMultiplierUsed,
		)
		if err != nil {
			return nil, err
		}
		if workScheduleName.Valid {
			it.WorkScheduleName = &workScheduleName.String
		}
		if hoursPerDay.Valid {
			it.HoursPerDay = hoursPerDay.Float64
		}
		if workingDaysPerMonth.Valid {
			it.WorkingDaysPerMonth = int(workingDaysPerMonth.Int64)
		}
		if otMultiplierUsed.Valid {
			it.OTMultiplierUsed = otMultiplierUsed.Float64
		}
		if createdAt.Valid {
			it.CreatedAt = createdAt.String
		}
		if updatedAt.Valid {
			it.UpdatedAt = updatedAt.String
		}
		items = append(items, it)
	}
	return items, nil
}

func (r *PayrollRepo) UpsertItem(ctx context.Context, it *models.PayrollItem) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_upsert_payroll_item(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		it.ID, it.RunID, it.CompanyID, it.EmployeeID,
		it.BasicPay, it.DaysWorked, it.HoursWorked,
		it.OTHours, it.OTPay, it.HolidayPay, it.NightDiff,
		it.Allowances, it.OtherEarnings, it.GrossPay,
		it.SSSEE, it.SSSER, it.PhilHealthEE, it.PhilHealthER,
		it.PagibigEE, it.PagibigER, it.WithholdingTax,
		it.BenefitDeductions, it.LoanDeductions, it.OtherDeductions,
		it.TotalDeductions, it.NetPay,
		it.WorkScheduleName, it.HoursPerDay, it.WorkingDaysPerMonth, it.OTMultiplierUsed,
	)
	return err
}

func (r *PayrollRepo) DeleteItems(ctx context.Context, runID, companyID string) error {
	_, err := r.db.ExecContext(ctx, "CALL sp_delete_payroll_items(?, ?)", runID, companyID)
	return err
}
