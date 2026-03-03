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
