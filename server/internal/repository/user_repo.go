package repository

import (
	"context"
	"database/sql"

	"lettersheets/internal/models"
)

type UserRepo struct {
	db *sql.DB
}

func (r *UserRepo) ResetPasswordWithKey(ctx context.Context, userID, passwordHash, salt, wrappedCompanyKey, keyWrapAlgorithm, publicKey, ipAddress, userAgent string) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_reset_password_with_key(?, ?, ?, ?, ?, ?, ?, ?)",
		userID, passwordHash, salt, wrappedCompanyKey, keyWrapAlgorithm, publicKey, ipAddress, userAgent,
	)
	return err
}

func NewUserRepo(db *sql.DB) *UserRepo {
	return &UserRepo{db: db}
}

func (r *UserRepo) Create(ctx context.Context, user *models.User, meta *models.RequestMeta) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_create_user(?, ?, ?, ?, ?, ?, ?, ?, ?)",
		user.ID, user.Email, user.Username, user.PasswordHash, user.Salt,
		meta.CompanyID, meta.SessionID, meta.IPAddress, meta.UserAgent,
	)
	return err
}

func (r *UserRepo) GetByID(ctx context.Context, id string) (*models.User, error) {
	row := r.db.QueryRowContext(ctx, "CALL sp_get_user(?)", id)

	var u models.User
	err := row.Scan(
		&u.ID, &u.Email, &u.Username, &u.IsActive,
		&u.LastLoginAt, &u.PasswordChangedAt,
		&u.CreatedAt, &u.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *UserRepo) GetByEmail(ctx context.Context, email string) (*models.User, error) {
	row := r.db.QueryRowContext(ctx, "CALL sp_get_user_by_email(?)", email)

	var u models.User
	err := row.Scan(
		&u.ID, &u.Email, &u.Username, &u.PasswordHash, &u.Salt, &u.TOTPSecretEnc,
		&u.IsActive, &u.FailedLoginAttempts, &u.LockedUntil,
		&u.LastLoginAt, &u.CreatedAt, &u.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *UserRepo) Update(ctx context.Context, user *models.User, meta *models.RequestMeta) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_update_user(?, ?, ?, ?, ?, ?, ?, ?)",
		user.ID, user.Email, user.Username,
		meta.CompanyID, meta.UserID, meta.SessionID, meta.IPAddress, meta.UserAgent,
	)
	return err
}

func (r *UserRepo) ChangePassword(ctx context.Context, userID, passwordHash, salt string, meta *models.RequestMeta) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_change_password(?, ?, ?, ?, ?, ?, ?)",
		userID, passwordHash, salt,
		meta.CompanyID, meta.SessionID, meta.IPAddress, meta.UserAgent,
	)
	return err
}

func (r *UserRepo) Delete(ctx context.Context, id string, meta *models.RequestMeta) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_delete_user(?, ?, ?, ?, ?, ?)",
		id, meta.CompanyID, meta.UserID, meta.SessionID, meta.IPAddress, meta.UserAgent,
	)
	return err
}

func (r *UserRepo) LoginSuccess(ctx context.Context, userID string) error {
	_, err := r.db.ExecContext(ctx, "CALL sp_login_success(?)", userID)
	return err
}

func (r *UserRepo) LoginFailure(ctx context.Context, userID string, maxAttempts, lockoutMinutes int) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_login_failure(?, ?, ?)",
		userID, maxAttempts, lockoutMinutes,
	)
	return err
}
