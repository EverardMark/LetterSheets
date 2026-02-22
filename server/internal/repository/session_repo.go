package repository

import (
	"context"
	"database/sql"
	"time"

	"lettersheets/internal/models"
)

type SessionRepo struct {
	db *sql.DB
}

func NewSessionRepo(db *sql.DB) *SessionRepo {
	return &SessionRepo{db: db}
}

func (r *SessionRepo) Create(ctx context.Context, id, userID, companyID, deviceInfo, ipAddress string, expiresAt time.Time) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_create_session(?, ?, ?, ?, ?, ?)",
		id, userID, companyID, deviceInfo, ipAddress, expiresAt,
	)
	return err
}

func (r *SessionRepo) Validate(ctx context.Context, sessionID string) (*models.UserSession, error) {
	row := r.db.QueryRowContext(ctx, "CALL sp_validate_session(?)", sessionID)

	var s models.UserSession
	err := row.Scan(
		&s.ID, &s.UserID, &s.CompanyID, &s.ExpiresAt,
		&s.Email, &s.Username, &s.UserActive,
		&s.Role, &s.Permissions, &s.WrappedCompanyKey,
		&s.KeyWrapAlgorithm, &s.KeyVersion, &s.PublicKey,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *SessionRepo) Invalidate(ctx context.Context, sessionID string) error {
	_, err := r.db.ExecContext(ctx, "CALL sp_invalidate_session(?)", sessionID)
	return err
}

func (r *SessionRepo) InvalidateAll(ctx context.Context, userID string) error {
	_, err := r.db.ExecContext(ctx, "CALL sp_invalidate_all_sessions(?)", userID)
	return err
}
