package repository

import (
	"context"
	"database/sql"
)

type RegistrationRepo struct {
	db *sql.DB
}

func NewRegistrationRepo(db *sql.DB) *RegistrationRepo {
	return &RegistrationRepo{db: db}
}

// Register creates a company, admin user, and user_company_access in one transaction
// via the sp_register stored procedure
func (r *RegistrationRepo) Register(ctx context.Context, params *RegisterParams) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_register(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		// Company
		params.CompanyID, params.CompanyName, params.CompanyIndustry,
		params.CompanyAddress, params.CompanyCity, params.CompanyState,
		params.CompanyProvince, params.KeyAlgorithm,
		// User
		params.UserID, params.Email, params.Username,
		params.PasswordHash, params.Salt,
		// Access
		params.AccessID, params.WrappedCompanyKey,
		params.KeyWrapAlgorithm, params.PublicKey,
		// Meta
		params.IPAddress, params.UserAgent,
	)
	return err
}

// RegisterParams contains all data needed for full registration
type RegisterParams struct {
	// Company
	CompanyID       string
	CompanyName     string
	CompanyIndustry *string
	CompanyAddress  *string
	CompanyCity     *string
	CompanyState    *string
	CompanyProvince *string
	KeyAlgorithm    *string

	// User
	UserID       string
	Email        string
	Username     string
	PasswordHash string
	Salt         string

	// Access
	AccessID          string
	WrappedCompanyKey []byte
	KeyWrapAlgorithm  *string
	PublicKey         []byte

	// Meta
	IPAddress string
	UserAgent string
}
