package repository

import (
	"context"
	"database/sql"

	"lettersheets/internal/models"
)

type PositionRepo struct {
	db *sql.DB
}

func NewPositionRepo(db *sql.DB) *PositionRepo {
	return &PositionRepo{db: db}
}

func (r *PositionRepo) GetByCompany(ctx context.Context, companyID string) ([]models.Position, error) {
	rows, err := r.db.QueryContext(ctx, "CALL sp_get_positions(?)", companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var positions []models.Position
	for rows.Next() {
		var p models.Position
		var createdAt, updatedAt sql.NullString
		err := rows.Scan(
			&p.ID, &p.CompanyID, &p.Name, &p.Department, &p.Level, &p.Description,
			&p.SortOrder, &createdAt, &updatedAt, &p.EmployeeCount,
		)
		if err != nil {
			return nil, err
		}
		if createdAt.Valid {
			p.CreatedAt = createdAt.String
		}
		if updatedAt.Valid {
			p.UpdatedAt = updatedAt.String
		}
		positions = append(positions, p)
	}
	return positions, nil
}

func (r *PositionRepo) Create(ctx context.Context, p *models.Position, meta *models.RequestMeta) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_create_position(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		p.ID, meta.CompanyID, p.Name, p.Department, p.Level, p.Description,
		meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent,
	)
	return err
}

func (r *PositionRepo) Update(ctx context.Context, p *models.Position, meta *models.RequestMeta) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_update_position(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		p.ID, meta.CompanyID, p.Name, p.Department, p.Level, p.Description,
		meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent,
	)
	return err
}

func (r *PositionRepo) Delete(ctx context.Context, id string, meta *models.RequestMeta) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_delete_position(?, ?, ?, ?, ?, ?)",
		id, meta.CompanyID, meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent,
	)
	return err
}
