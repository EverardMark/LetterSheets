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

type RegisterParams struct {
	CompanyID       string
	CompanyName     string
	CompanyIndustry *string
	CompanyAddress  *string
	CompanyCountry  *string
	CompanyCity     *string
	CompanyState    *string
	CompanyProvince *string
	CompanyZip      *string
	KeyAlgorithm    *string

	UserID       string
	Email        string
	Username     string
	PasswordHash string
	Salt         string

	AccessID             string
	WrappedCompanyKey    []byte
	KeyWrapAlgorithm     *string
	KeyExchangeAlgorithm *string
	PublicKey            []byte
	SigningPublicKey     []byte

	IPAddress string
	UserAgent string
}

func (r *RegistrationRepo) Register(ctx context.Context, p *RegisterParams) error {
	_, err := r.db.ExecContext(ctx, "CALL sp_register(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
		p.CompanyID,
		p.CompanyName,
		p.CompanyIndustry,
		p.CompanyAddress,
		p.CompanyCountry,
		p.CompanyCity,
		p.CompanyState,
		p.CompanyProvince,
		p.CompanyZip,
		p.KeyAlgorithm,
		p.UserID,
		p.Email,
		p.Username,
		p.PasswordHash,
		p.Salt,
		p.AccessID,
		p.WrappedCompanyKey,
		p.KeyWrapAlgorithm,
		p.KeyExchangeAlgorithm,
		p.PublicKey,
		p.SigningPublicKey,
		p.IPAddress,
		p.UserAgent,
	)
	return err
}
