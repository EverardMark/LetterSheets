package repository

import (
	"context"
	"database/sql"
	"time"

	"lettersheets/internal/models"
)

type UserRepo struct {
	db *sql.DB
}

// ---- Password-reset challenges (proof-of-possession for reset, C2) ----

// CreateResetChallenge stores a server-issued challenge for a user.
func (r *UserRepo) CreateResetChallenge(ctx context.Context, id, userID string, challenge []byte, expiresAt time.Time) error {
	_, err := r.db.ExecContext(ctx, "CALL sp_create_reset_challenge(?, ?, ?, ?)", id, userID, challenge, expiresAt)
	return err
}

// GetResetChallenge returns (userID, challenge, expiresAt, used, found, err).
func (r *UserRepo) GetResetChallenge(ctx context.Context, id string) (string, []byte, time.Time, bool, bool, error) {
	var userID string
	var challenge []byte
	var expiresAt time.Time
	var used bool
	err := r.db.QueryRowContext(ctx, "CALL sp_get_reset_challenge(?)", id).Scan(&userID, &challenge, &expiresAt, &used)
	if err == sql.ErrNoRows {
		return "", nil, time.Time{}, false, false, nil
	}
	if err != nil {
		return "", nil, time.Time{}, false, false, err
	}
	return userID, challenge, expiresAt, used, true, nil
}

// ConsumeResetChallenge atomically marks the challenge used. It returns true
// only if this call was the one that flipped an unused, unexpired challenge to
// used — the real single-use gate against replay.
func (r *UserRepo) ConsumeResetChallenge(ctx context.Context, id string) (bool, error) {
	res, err := r.db.ExecContext(ctx, "CALL sp_consume_reset_challenge(?)", id)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// GetUserSigningKeys returns the active ML-DSA signing public keys for a user
// (one per company access row).
func (r *UserRepo) GetUserSigningKeys(ctx context.Context, userID string) ([][]byte, error) {
	rows, err := r.db.QueryContext(ctx, "CALL sp_get_user_signing_keys(?)", userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var keys [][]byte
	for rows.Next() {
		var k []byte
		if err := rows.Scan(&k); err != nil {
			return nil, err
		}
		if len(k) > 0 {
			keys = append(keys, k)
		}
	}
	return keys, rows.Err()
}

func (r *UserRepo) ResetPasswordWithKey(ctx context.Context, userID, passwordHash, salt, wrappedCompanyKey, keyWrapAlgorithm, keyExchangeAlgorithm, publicKey, signingPublicKey, ipAddress, userAgent string) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_reset_password_with_key(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		userID, passwordHash, salt, wrappedCompanyKey, keyWrapAlgorithm, keyExchangeAlgorithm, publicKey, signingPublicKey, ipAddress, userAgent,
	)
	return err
}

func (r *UserRepo) AdminResetPassword(ctx context.Context, userID, passwordHash, salt string, wrappedCompanyKey []byte, keyWrapAlgorithm, keyExchangeAlgorithm string, publicKey, signingPublicKey []byte, ipAddress, userAgent string) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_reset_password_with_key(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		userID, passwordHash, salt, wrappedCompanyKey, keyWrapAlgorithm, keyExchangeAlgorithm, publicKey, signingPublicKey, ipAddress, userAgent,
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

// ChangePasswordWithKeys rotates the password AND re-persists the company keys the
// client re-wrapped under the new password-derived KEK — atomically. The old
// single-table sp_change_password rotated the salt WITHOUT rewrapping the company
// key, which would lock the user out of all E2E-encrypted data on next login; this
// replaces that path. Plain SQL (ls_user has DML on both tables) — no migration.
func (r *UserRepo) ChangePasswordWithKeys(ctx context.Context, userID, passwordHash, salt string, wrappedKeys map[string][]byte) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx,
		`UPDATE users SET password_hash = ?, salt = ?, password_changed_at = NOW() WHERE id = ?`,
		passwordHash, salt, userID); err != nil {
		return err
	}
	for companyID, wrapped := range wrappedKeys {
		if _, err := tx.ExecContext(ctx,
			`UPDATE user_company_access SET wrapped_company_key = ? WHERE user_id = ? AND company_id = ?`,
			wrapped, userID, companyID); err != nil {
			return err
		}
	}
	return tx.Commit()
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
