package repository

import (
	"context"
	"database/sql"

	"lettersheets/internal/models"
)

type OnboardingRepo struct {
	db *sql.DB
}

func NewOnboardingRepo(db *sql.DB) *OnboardingRepo {
	return &OnboardingRepo{db: db}
}

// ==================== TEMPLATES ====================

func (r *OnboardingRepo) GetTemplates(ctx context.Context, companyID string) ([]models.OnboardingTemplate, error) {
	rows, err := r.db.QueryContext(ctx, "CALL sp_get_onboarding_templates(?)", companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tpls []models.OnboardingTemplate
	for rows.Next() {
		var t models.OnboardingTemplate
		var createdAt, updatedAt sql.NullString
		err := rows.Scan(&t.ID, &t.CompanyID, &t.Name, &t.Description, &t.Category,
			&t.IsDefault, &t.SortOrder, &createdAt, &updatedAt, &t.ItemCount)
		if err != nil {
			return nil, err
		}
		if createdAt.Valid {
			t.CreatedAt = createdAt.String
		}
		if updatedAt.Valid {
			t.UpdatedAt = updatedAt.String
		}
		tpls = append(tpls, t)
	}
	return tpls, nil
}

func (r *OnboardingRepo) CreateTemplate(ctx context.Context, t *models.OnboardingTemplate, meta *models.RequestMeta) error {
	desc := ""
	if t.Description != nil {
		desc = *t.Description
	}
	_, err := r.db.ExecContext(ctx, "CALL sp_create_onboarding_template(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		t.ID, meta.CompanyID, t.Name, desc, t.Category, t.IsDefault,
		meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent)
	return err
}

func (r *OnboardingRepo) UpdateTemplate(ctx context.Context, t *models.OnboardingTemplate, meta *models.RequestMeta) error {
	desc := ""
	if t.Description != nil {
		desc = *t.Description
	}
	_, err := r.db.ExecContext(ctx, "CALL sp_update_onboarding_template(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		t.ID, meta.CompanyID, t.Name, desc, t.Category, t.IsDefault,
		meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent)
	return err
}

func (r *OnboardingRepo) DeleteTemplate(ctx context.Context, id string, meta *models.RequestMeta) error {
	_, err := r.db.ExecContext(ctx, "CALL sp_delete_onboarding_template(?, ?, ?, ?, ?, ?)",
		id, meta.CompanyID, meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent)
	return err
}

// ==================== TEMPLATE ITEMS ====================

func (r *OnboardingRepo) GetTemplateItems(ctx context.Context, templateID string) ([]models.OnboardingTemplateItem, error) {
	rows, err := r.db.QueryContext(ctx, "CALL sp_get_template_items(?)", templateID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []models.OnboardingTemplateItem
	for rows.Next() {
		var it models.OnboardingTemplateItem
		if err := rows.Scan(&it.ID, &it.TemplateID, &it.CompanyID, &it.Title, &it.Category, &it.Required, &it.SortOrder); err != nil {
			return nil, err
		}
		items = append(items, it)
	}
	return items, nil
}

func (r *OnboardingRepo) UpsertTemplateItem(ctx context.Context, it *models.OnboardingTemplateItem) error {
	_, err := r.db.ExecContext(ctx, "CALL sp_upsert_template_item(?, ?, ?, ?, ?, ?, ?)",
		it.ID, it.TemplateID, it.CompanyID, it.Title, it.Category, it.Required, it.SortOrder)
	return err
}

func (r *OnboardingRepo) DeleteTemplateItem(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, "CALL sp_delete_template_item(?)", id)
	return err
}

// ==================== CHECKLISTS ====================

func (r *OnboardingRepo) GetChecklists(ctx context.Context, companyID, status string) ([]models.OnboardingChecklist, error) {
	rows, err := r.db.QueryContext(ctx, "CALL sp_get_onboarding_checklists(?, ?)", companyID, status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cls []models.OnboardingChecklist
	for rows.Next() {
		var c models.OnboardingChecklist
		var startDate, targetDate, completedDate, createdAt, updatedAt sql.NullString
		err := rows.Scan(&c.ID, &c.CompanyID, &c.EmployeeID, &c.TemplateID,
			&c.Status, &startDate, &targetDate, &completedDate,
			&c.Progress, &c.Notes, &createdAt, &updatedAt,
			&c.FirstName, &c.LastName, &c.Department, &c.Position,
			&c.TotalItems, &c.CompletedItems)
		if err != nil {
			return nil, err
		}
		if startDate.Valid {
			c.StartDate = startDate.String
		}
		if targetDate.Valid {
			c.TargetDate = &targetDate.String
		}
		if completedDate.Valid {
			c.CompletedDate = &completedDate.String
		}
		if createdAt.Valid {
			c.CreatedAt = createdAt.String
		}
		if updatedAt.Valid {
			c.UpdatedAt = updatedAt.String
		}
		cls = append(cls, c)
	}
	return cls, nil
}

func (r *OnboardingRepo) CreateChecklist(ctx context.Context, c *models.OnboardingChecklist, meta *models.RequestMeta) error {
	tplID := ""
	if c.TemplateID != nil {
		tplID = *c.TemplateID
	}
	targetDate := ""
	if c.TargetDate != nil {
		targetDate = *c.TargetDate
	}
	notes := ""
	if c.Notes != nil {
		notes = *c.Notes
	}

	_, err := r.db.ExecContext(ctx, "CALL sp_create_onboarding_checklist(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		c.ID, meta.CompanyID, c.EmployeeID, tplID, c.StartDate, targetDate, notes,
		meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent)
	return err
}

func (r *OnboardingRepo) UpdateChecklistStatus(ctx context.Context, id, companyID, status string, progress int, meta *models.RequestMeta) error {
	_, err := r.db.ExecContext(ctx, "CALL sp_update_onboarding_checklist_status(?, ?, ?, ?, ?, ?, ?, ?)",
		id, companyID, status, progress,
		meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent)
	return err
}

func (r *OnboardingRepo) DeleteChecklist(ctx context.Context, id string, meta *models.RequestMeta) error {
	_, err := r.db.ExecContext(ctx, "CALL sp_delete_onboarding_checklist(?, ?, ?, ?, ?, ?)",
		id, meta.CompanyID, meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent)
	return err
}

// ==================== CHECKLIST ITEMS ====================

func (r *OnboardingRepo) GetItems(ctx context.Context, checklistID string) ([]models.OnboardingItem, error) {
	rows, err := r.db.QueryContext(ctx, "CALL sp_get_onboarding_items(?)", checklistID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []models.OnboardingItem
	for rows.Next() {
		var it models.OnboardingItem
		var completedAt sql.NullString
		err := rows.Scan(&it.ID, &it.ChecklistID, &it.CompanyID, &it.Title, &it.Category,
			&it.Required, &it.Completed, &completedAt, &it.SortOrder, &it.Notes)
		if err != nil {
			return nil, err
		}
		if completedAt.Valid {
			it.CompletedAt = &completedAt.String
		}
		items = append(items, it)
	}
	return items, nil
}

func (r *OnboardingRepo) ToggleItem(ctx context.Context, id string, completed bool) error {
	c := 0
	if completed {
		c = 1
	}
	_, err := r.db.ExecContext(ctx, "CALL sp_toggle_onboarding_item(?, ?)", id, c)
	return err
}

func (r *OnboardingRepo) AddItem(ctx context.Context, it *models.OnboardingItem) error {
	_, err := r.db.ExecContext(ctx, "CALL sp_add_onboarding_item(?, ?, ?, ?, ?, ?, ?)",
		it.ID, it.ChecklistID, it.CompanyID, it.Title, it.Category, it.Required, it.SortOrder)
	return err
}

func (r *OnboardingRepo) DeleteItem(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, "CALL sp_delete_onboarding_item(?)", id)
	return err
}

// ==================== DOCUMENTS ====================
//
// Plain SQL (not stored procedures): file blobs live in onboarding_documents,
// added in migration 018. ls_user has DML but not CREATE ROUTINE, so these
// mirror the recurring-entries repo's approach.

// AddDocument inserts an uploaded file. d.FileData holds the raw bytes.
func (r *OnboardingRepo) AddDocument(ctx context.Context, d *models.OnboardingDocument, data []byte) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO onboarding_documents
			(id, company_id, checklist_id, item_id, file_name, mime_type, file_size, file_data, uploaded_by, uploaded_by_name)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		d.ID, d.CompanyID, d.ChecklistID, d.ItemID, d.FileName, d.MimeType, len(data), data, d.UploadedBy, d.UploadedByName)
	return err
}

// GetDocuments lists a checklist's documents (metadata only — no blob), newest
// first. Scoped by company_id so one tenant can't read another's attachments.
func (r *OnboardingRepo) GetDocuments(ctx context.Context, companyID, checklistID string) ([]models.OnboardingDocument, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, company_id, checklist_id, item_id, file_name, mime_type, file_size,
		       uploaded_by, uploaded_by_name, created_at
		FROM onboarding_documents
		WHERE company_id = ? AND checklist_id = ? AND is_deleted = 0
		ORDER BY created_at DESC`, companyID, checklistID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var docs []models.OnboardingDocument
	for rows.Next() {
		var d models.OnboardingDocument
		var itemID, uploadedBy, uploadedByName sql.NullString
		if err := rows.Scan(&d.ID, &d.CompanyID, &d.ChecklistID, &itemID, &d.FileName,
			&d.MimeType, &d.FileSize, &uploadedBy, &uploadedByName, &d.CreatedAt); err != nil {
			return nil, err
		}
		if itemID.Valid {
			d.ItemID = &itemID.String
		}
		if uploadedBy.Valid {
			d.UploadedBy = &uploadedBy.String
		}
		if uploadedByName.Valid {
			d.UploadedByName = &uploadedByName.String
		}
		docs = append(docs, d)
	}
	return docs, rows.Err()
}

// GetDocument returns a single document including its raw bytes, for download.
// Scoped by company_id. Returns sql.ErrNoRows if not found for this tenant.
func (r *OnboardingRepo) GetDocument(ctx context.Context, companyID, id string) (*models.OnboardingDocument, []byte, error) {
	var d models.OnboardingDocument
	var itemID sql.NullString
	var data []byte
	err := r.db.QueryRowContext(ctx, `
		SELECT id, company_id, checklist_id, item_id, file_name, mime_type, file_size, file_data
		FROM onboarding_documents
		WHERE company_id = ? AND id = ? AND is_deleted = 0`, companyID, id).
		Scan(&d.ID, &d.CompanyID, &d.ChecklistID, &itemID, &d.FileName, &d.MimeType, &d.FileSize, &data)
	if err != nil {
		return nil, nil, err
	}
	if itemID.Valid {
		d.ItemID = &itemID.String
	}
	return &d, data, nil
}

// DeleteDocument soft-deletes a document, scoped by company_id.
func (r *OnboardingRepo) DeleteDocument(ctx context.Context, companyID, id string) error {
	_, err := r.db.ExecContext(ctx,
		"UPDATE onboarding_documents SET is_deleted = 1 WHERE company_id = ? AND id = ?", companyID, id)
	return err
}
