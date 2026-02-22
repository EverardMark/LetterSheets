package repository

import (
	"context"
	"database/sql"

	"lettersheets/internal/models"
)

type AccessRepo struct {
	db *sql.DB
}

func NewAccessRepo(db *sql.DB) *AccessRepo {
	return &AccessRepo{db: db}
}

func (r *AccessRepo) Create(ctx context.Context, access *models.UserCompanyAccess, meta *models.RequestMeta) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_create_user_company_access(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		access.ID, access.UserID, access.CompanyID,
		access.WrappedCompanyKey, access.KeyWrapAlgorithm, access.PublicKey,
		access.Role, access.Permissions,
		meta.UserID, meta.SessionID, meta.IPAddress, meta.UserAgent,
	)
	return err
}

func (r *AccessRepo) GetUserCompanies(ctx context.Context, userID string) ([]models.UserCompanyAccess, error) {
	rows, err := r.db.QueryContext(ctx, "CALL sp_get_user_companies(?)", userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.UserCompanyAccess
	for rows.Next() {
		var a models.UserCompanyAccess
		err := rows.Scan(
			&a.ID, &a.CompanyID, &a.WrappedCompanyKey, &a.KeyWrapAlgorithm,
			&a.KeyVersion, &a.PublicKey, &a.Role, &a.Permissions, &a.JoinedAt,
			&a.CompanyName, &a.CompanyPlan,
		)
		if err != nil {
			return nil, err
		}
		a.UserID = userID
		a.IsActive = true
		result = append(result, a)
	}
	return result, rows.Err()
}

func (r *AccessRepo) GetCompanyUsers(ctx context.Context, companyID string) ([]models.UserCompanyAccess, error) {
	rows, err := r.db.QueryContext(ctx, "CALL sp_get_company_users(?)", companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.UserCompanyAccess
	for rows.Next() {
		var a models.UserCompanyAccess
		var email, username string
		var lastLogin *sql.NullTime

		err := rows.Scan(
			&a.ID, &a.UserID, &a.Role, &a.Permissions, &a.JoinedAt,
			&email, &username, &lastLogin,
		)
		if err != nil {
			return nil, err
		}
		a.CompanyID = companyID
		a.IsActive = true
		result = append(result, a)
	}
	return result, rows.Err()
}

func (r *AccessRepo) Update(ctx context.Context, access *models.UserCompanyAccess, meta *models.RequestMeta) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_update_user_company_access(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		access.ID, access.Role, access.Permissions,
		access.WrappedCompanyKey, access.KeyWrapAlgorithm, access.KeyVersion,
		access.PublicKey,
		meta.CompanyID, meta.UserID, meta.SessionID, meta.IPAddress, meta.UserAgent,
	)
	return err
}

func (r *AccessRepo) Delete(ctx context.Context, id string, meta *models.RequestMeta) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_delete_user_company_access(?, ?, ?, ?, ?, ?)",
		id, meta.CompanyID, meta.UserID, meta.SessionID, meta.IPAddress, meta.UserAgent,
	)
	return err
}
