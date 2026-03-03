package repository

import (
	"context"
	"database/sql"
	"encoding/json"

	"lettersheets/internal/models"
)

type BenefitRepo struct {
	db *sql.DB
}

func NewBenefitRepo(db *sql.DB) *BenefitRepo {
	return &BenefitRepo{db: db}
}

func (r *BenefitRepo) GetByCompany(ctx context.Context, companyID string) ([]models.Benefit, error) {
	rows, err := r.db.QueryContext(ctx, "CALL sp_get_benefits(?)", companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// Result set 1: benefits
	var benefits []models.Benefit
	for rows.Next() {
		var b models.Benefit
		var createdAt, updatedAt sql.NullString
		err := rows.Scan(
			&b.ID, &b.CompanyID, &b.Type, &b.Name, &b.Provider, &b.Status,
			&b.Coverage, &b.Frequency, &b.Enrolled, &b.Eligibility, &b.Description,
			&b.SortOrder, &createdAt, &updatedAt,
		)
		if err != nil {
			return nil, err
		}
		if createdAt.Valid {
			b.CreatedAt = createdAt.String
		}
		if updatedAt.Valid {
			b.UpdatedAt = updatedAt.String
		}
		b.Tiers = []models.BenefitTier{} // initialize empty
		benefits = append(benefits, b)
	}

	// Result set 2: tiers
	if rows.NextResultSet() {
		// Build index for quick lookup
		idxMap := make(map[string]int)
		for i, b := range benefits {
			idxMap[b.ID] = i
		}

		for rows.Next() {
			var t models.BenefitTier
			err := rows.Scan(
				&t.ID, &t.BenefitID, &t.Name,
				&t.EmployerCost, &t.EmployeeCost, &t.SortOrder,
			)
			if err != nil {
				return nil, err
			}
			if idx, ok := idxMap[t.BenefitID]; ok {
				benefits[idx].Tiers = append(benefits[idx].Tiers, t)
			}
		}
	}

	return benefits, nil
}

func (r *BenefitRepo) Create(ctx context.Context, b *models.Benefit, meta *models.RequestMeta) error {
	tiersJSON, err := json.Marshal(b.Tiers)
	if err != nil {
		return err
	}

	_, err = r.db.ExecContext(ctx,
		"CALL sp_create_benefit(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		b.ID, meta.CompanyID, b.Type, b.Name, b.Provider, b.Status,
		b.Coverage, b.Frequency, b.Enrolled, b.Eligibility, b.Description,
		string(tiersJSON),
		meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent,
	)
	return err
}

func (r *BenefitRepo) Update(ctx context.Context, b *models.Benefit, meta *models.RequestMeta) error {
	tiersJSON, err := json.Marshal(b.Tiers)
	if err != nil {
		return err
	}

	_, err = r.db.ExecContext(ctx,
		"CALL sp_update_benefit(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		b.ID, meta.CompanyID, b.Type, b.Name, b.Provider, b.Status,
		b.Coverage, b.Frequency, b.Enrolled, b.Eligibility, b.Description,
		string(tiersJSON),
		meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent,
	)
	return err
}

func (r *BenefitRepo) Delete(ctx context.Context, id string, meta *models.RequestMeta) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_delete_benefit(?, ?, ?, ?, ?, ?)",
		id, meta.CompanyID, meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent,
	)
	return err
}
