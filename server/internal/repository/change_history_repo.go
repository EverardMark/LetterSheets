package repository

import (
	"context"
	"database/sql"

	"lettersheets/internal/models"
)

type ChangeHistoryRepo struct {
	db *sql.DB
}

func NewChangeHistoryRepo(db *sql.DB) *ChangeHistoryRepo {
	return &ChangeHistoryRepo{db: db}
}

func (r *ChangeHistoryRepo) Get(ctx context.Context, companyID string, tableName, recordID *string, limit, offset int) ([]models.ChangeHistory, error) {
	rows, err := r.db.QueryContext(ctx,
		"CALL sp_get_change_history(?, ?, ?, ?, ?)",
		companyID, tableName, recordID, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.ChangeHistory
	for rows.Next() {
		var ch models.ChangeHistory
		err := rows.Scan(
			&ch.ID, &ch.CompanyID, &ch.ChangedBy, &ch.SessionID,
			&ch.TableName, &ch.RecordID, &ch.ChangeType,
			&ch.FieldName, &ch.OldValue, &ch.NewValue, &ch.IsEncrypted,
			&ch.IPAddress, &ch.UserAgent, &ch.ChangedAt,
			&ch.ChangedByEmail, &ch.ChangedByUsername,
		)
		if err != nil {
			return nil, err
		}
		result = append(result, ch)
	}
	return result, rows.Err()
}
