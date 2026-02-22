package repository

import (
	"context"
	"database/sql"

	"lettersheets/internal/models"
)

type CompanyRepo struct {
	db *sql.DB
}

func NewCompanyRepo(db *sql.DB) *CompanyRepo {
	return &CompanyRepo{db: db}
}

func (r *CompanyRepo) Create(ctx context.Context, company *models.Company, meta *models.RequestMeta) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_create_company(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		company.ID, company.Name, company.Industry, company.Address,
		company.City, company.State, company.Province,
		company.KeyAlgorithm, company.MaxEmployees, company.Plan,
		meta.UserID, meta.SessionID, meta.IPAddress, meta.UserAgent,
	)
	return err
}

func (r *CompanyRepo) GetByID(ctx context.Context, id string) (*models.Company, error) {
	row := r.db.QueryRowContext(ctx, "CALL sp_get_company(?)", id)

	var c models.Company
	err := row.Scan(
		&c.ID, &c.Name, &c.Industry, &c.Address, &c.City, &c.State, &c.Province,
		&c.KeyAlgorithm, &c.KeyVersion, &c.MaxEmployees, &c.Plan, &c.IsActive,
		&c.CreatedAt, &c.UpdatedAt,
		&c.Timezone, &c.DateFormat, &c.Currency, &c.FiscalYearStart,
		&c.PayFrequency, &c.PayDay1, &c.PayDay2, &c.OvertimeRequiredApproval,
		&c.DefaultVacationDays, &c.DefaultSickDays, &c.LeaveAccrualType,
		&c.EmployeeNumberPrefix, &c.EmployeeNumberAuto,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *CompanyRepo) Update(ctx context.Context, company *models.Company, meta *models.RequestMeta) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_update_company(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		company.ID, company.Name, company.Industry, company.Address,
		company.City, company.State, company.Province,
		company.MaxEmployees, company.Plan,
		meta.UserID, meta.SessionID, meta.IPAddress, meta.UserAgent,
	)
	return err
}

func (r *CompanyRepo) Delete(ctx context.Context, id string, meta *models.RequestMeta) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_delete_company(?, ?, ?, ?, ?)",
		id, meta.UserID, meta.SessionID, meta.IPAddress, meta.UserAgent,
	)
	return err
}
