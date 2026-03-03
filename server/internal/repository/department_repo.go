package repository

import (
	"context"
	"database/sql"

	"lettersheets/internal/models"
)

type DepartmentRepo struct {
	db *sql.DB
}

func NewDepartmentRepo(db *sql.DB) *DepartmentRepo {
	return &DepartmentRepo{db: db}
}

func (r *DepartmentRepo) GetByCompany(ctx context.Context, companyID string) ([]models.Department, error) {
	rows, err := r.db.QueryContext(ctx, "CALL sp_get_departments(?)", companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var departments []models.Department
	for rows.Next() {
		var d models.Department
		var createdAt, updatedAt sql.NullString
		err := rows.Scan(
			&d.ID, &d.CompanyID, &d.Name, &d.Color, &d.Description,
			&d.SortOrder, &createdAt, &updatedAt, &d.EmployeeCount,
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
		departments = append(departments, d)
	}
	return departments, nil
}

func (r *DepartmentRepo) Create(ctx context.Context, d *models.Department, meta *models.RequestMeta) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_create_department(?, ?, ?, ?, ?, ?, ?, ?, ?)",
		d.ID, meta.CompanyID, d.Name, d.Color, d.Description,
		meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent,
	)
	return err
}

func (r *DepartmentRepo) Update(ctx context.Context, d *models.Department, meta *models.RequestMeta) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_update_department(?, ?, ?, ?, ?, ?, ?, ?, ?)",
		d.ID, meta.CompanyID, d.Name, d.Color, d.Description,
		meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent,
	)
	return err
}

func (r *DepartmentRepo) Delete(ctx context.Context, id string, meta *models.RequestMeta) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_delete_department(?, ?, ?, ?, ?, ?)",
		id, meta.CompanyID, meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent,
	)
	return err
}
