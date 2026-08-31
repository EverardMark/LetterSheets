package repository

import (
	"context"
	"database/sql"

	"lettersheets/internal/models"
)

// FaceRepo stores face-recognition templates for the time clock.
//
// Every embedding arrives already encrypted with the company key, so this repo
// moves opaque strings around and never has a reason to inspect one. See
// migrations/026_face_templates.sql for why the storage model is shaped that
// way.
type FaceRepo struct {
	db *sql.DB
}

func NewFaceRepo(db *sql.DB) *FaceRepo {
	return &FaceRepo{db: db}
}

// GetByCompany returns the enrolled roster for a kiosk to sync. Templates for
// deleted or inactive employees are filtered out in SQL so a device cannot
// match against someone who has left.
func (r *FaceRepo) GetByCompany(ctx context.Context, companyID string) ([]models.FaceTemplate, error) {
	rows, err := r.db.QueryContext(ctx, "CALL sp_get_face_templates(?)", companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []models.FaceTemplate
	for rows.Next() {
		var t models.FaceTemplate
		var consentAt, enrolledBy, createdAt, updatedAt sql.NullString
		err := rows.Scan(
			&t.ID, &t.CompanyID, &t.EmployeeID, &t.EmbeddingEnc, &t.Model, &t.Dims,
			&t.Quality, &consentAt, &enrolledBy, &t.Device,
			&createdAt, &updatedAt,
			&t.FirstName, &t.LastName, &t.Department, &t.Position,
		)
		if err != nil {
			return nil, err
		}
		if consentAt.Valid {
			t.ConsentAt = &consentAt.String
		}
		if enrolledBy.Valid {
			t.EnrolledBy = &enrolledBy.String
		}
		if createdAt.Valid {
			t.CreatedAt = createdAt.String
		}
		if updatedAt.Valid {
			t.UpdatedAt = updatedAt.String
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// Save enrolls or re-enrolls one employee. The procedure upserts, so a
// re-enrollment replaces the previous template rather than adding a second one.
func (r *FaceRepo) Save(ctx context.Context, t *models.FaceTemplate, meta *models.RequestMeta) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_save_face_template(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		t.ID, meta.CompanyID, t.EmployeeID, t.EmbeddingEnc, t.Model, t.Dims,
		t.Quality, t.Device,
		meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent,
	)
	return err
}

// Delete destroys an employee's template outright. This is a hard delete by
// design — "remove my face" has to mean the row is gone, not flagged.
func (r *FaceRepo) Delete(ctx context.Context, employeeID string, meta *models.RequestMeta) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_delete_face_template(?, ?, ?, ?, ?, ?)",
		meta.CompanyID, employeeID,
		meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent,
	)
	return err
}
