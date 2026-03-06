package repository

import (
	"database/sql"
	"lettersheets/internal/models"

	"github.com/google/uuid"
)

type ComplianceRepo struct {
	db *sql.DB
}

func NewComplianceRepo(db *sql.DB) *ComplianceRepo {
	return &ComplianceRepo{db: db}
}

// GetTemplates returns all global templates plus any company-specific ones.
// Returns a ComplianceTemplatesResponse with nested agencies and fields.
func (r *ComplianceRepo) GetTemplates(companyID string) (*models.ComplianceTemplatesResponse, error) {
	resp := &models.ComplianceTemplatesResponse{
		Templates: []models.ComplianceTemplate{},
		Agencies:  []models.ComplianceTemplateAgency{},
		Fields:    []models.ComplianceTemplateField{},
	}

	tRows, err := r.db.Query(`
		SELECT id, COALESCE(company_id,''), code, name, COALESCE(currency_symbol,''), is_global
		FROM compliance_templates
		WHERE is_global = 1 OR company_id = ?
		ORDER BY is_global DESC, name
	`, companyID)
	if err != nil {
		return nil, err
	}
	defer tRows.Close()
	templateIDs := []string{}
	for tRows.Next() {
		var t models.ComplianceTemplate
		var cid string
		if err := tRows.Scan(&t.ID, &cid, &t.Code, &t.Name, &t.CurrencySymbol, &t.IsGlobal); err != nil {
			return nil, err
		}
		if cid != "" {
			t.CompanyID = &cid
		}
		resp.Templates = append(resp.Templates, t)
		templateIDs = append(templateIDs, t.ID)
	}

	if len(templateIDs) == 0 {
		return resp, nil
	}

	// Fetch template agencies
	aRows, err := r.db.Query(`
		SELECT id, template_id, name, COALESCE(full_name,''), color, frequency, COALESCE(website,''), sort_order
		FROM compliance_template_agencies
		WHERE template_id IN (`+placeholders(len(templateIDs))+`)
		ORDER BY sort_order
	`, toAny(templateIDs)...)
	if err != nil {
		return nil, err
	}
	defer aRows.Close()
	agencyIDs := []string{}
	for aRows.Next() {
		var a models.ComplianceTemplateAgency
		if err := aRows.Scan(&a.ID, &a.TemplateID, &a.Name, &a.FullName, &a.Color, &a.Frequency, &a.Website, &a.SortOrder); err != nil {
			return nil, err
		}
		resp.Agencies = append(resp.Agencies, a)
		agencyIDs = append(agencyIDs, a.ID)
	}

	if len(agencyIDs) == 0 {
		return resp, nil
	}

	// Fetch template fields
	fRows, err := r.db.Query(`
		SELECT id, agency_id, field_key, label, field_type, sort_order
		FROM compliance_template_fields
		WHERE agency_id IN (`+placeholders(len(agencyIDs))+`)
		ORDER BY sort_order
	`, toAny(agencyIDs)...)
	if err != nil {
		return nil, err
	}
	defer fRows.Close()
	for fRows.Next() {
		var f models.ComplianceTemplateField
		if err := fRows.Scan(&f.ID, &f.AgencyID, &f.FieldKey, &f.Label, &f.FieldType, &f.SortOrder); err != nil {
			return nil, err
		}
		resp.Fields = append(resp.Fields, f)
	}

	return resp, nil
}

// GetAgencies returns all compliance agencies for a company with their fields and values.
func (r *ComplianceRepo) GetAgencies(companyID string) (*models.ComplianceAgenciesResponse, error) {
	resp := &models.ComplianceAgenciesResponse{
		Agencies: []models.ComplianceAgency{},
		Fields:   []models.ComplianceField{},
		Values:   []models.ComplianceValue{},
	}

	aRows, err := r.db.Query(`
		SELECT id, company_id, name, COALESCE(full_name,''), color, frequency,
		       COALESCE(website,''), status, due_date, last_filed, sort_order,
		       created_at, updated_at
		FROM compliance_agencies
		WHERE company_id = ?
		ORDER BY sort_order, name
	`, companyID)
	if err != nil {
		return nil, err
	}
	defer aRows.Close()
	agencyIDs := []string{}
	for aRows.Next() {
		var a models.ComplianceAgency
		if err := aRows.Scan(
			&a.ID, &a.CompanyID, &a.Name, &a.FullName, &a.Color, &a.Frequency,
			&a.Website, &a.Status, &a.DueDate, &a.LastFiled, &a.SortOrder,
			&a.CreatedAt, &a.UpdatedAt,
		); err != nil {
			return nil, err
		}
		resp.Agencies = append(resp.Agencies, a)
		agencyIDs = append(agencyIDs, a.ID)
	}

	if len(agencyIDs) == 0 {
		return resp, nil
	}

	fRows, err := r.db.Query(`
		SELECT id, agency_id, company_id, field_key, label, field_type, sort_order
		FROM compliance_fields
		WHERE agency_id IN (`+placeholders(len(agencyIDs))+`)
		ORDER BY sort_order
	`, toAny(agencyIDs)...)
	if err != nil {
		return nil, err
	}
	defer fRows.Close()
	fieldIDs := []string{}
	for fRows.Next() {
		var f models.ComplianceField
		if err := fRows.Scan(&f.ID, &f.AgencyID, &f.CompanyID, &f.FieldKey, &f.Label, &f.FieldType, &f.SortOrder); err != nil {
			return nil, err
		}
		resp.Fields = append(resp.Fields, f)
		fieldIDs = append(fieldIDs, f.ID)
	}

	if len(fieldIDs) == 0 {
		return resp, nil
	}

	vRows, err := r.db.Query(`
		SELECT id, field_id, company_id, COALESCE(value_encrypted,''), updated_at
		FROM compliance_values
		WHERE field_id IN (`+placeholders(len(fieldIDs))+`)
	`, toAny(fieldIDs)...)
	if err != nil {
		return nil, err
	}
	defer vRows.Close()
	for vRows.Next() {
		var v models.ComplianceValue
		if err := vRows.Scan(&v.ID, &v.FieldID, &v.CompanyID, &v.ValueEncrypted, &v.UpdatedAt); err != nil {
			return nil, err
		}
		resp.Values = append(resp.Values, v)
	}

	return resp, nil
}

// ApplyTemplate creates compliance agencies + fields for a company from a template.
// Existing agencies for this company are deleted first (full replace).
func (r *ComplianceRepo) ApplyTemplate(companyID, templateCode string) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Find template
	var templateID string
	err = tx.QueryRow(`
		SELECT id FROM compliance_templates
		WHERE code = ? AND (is_global = 1 OR company_id = ?)
		LIMIT 1
	`, templateCode, companyID).Scan(&templateID)
	if err == sql.ErrNoRows {
		// CUSTOM or unknown code — just wipe existing agencies without seeding
		if _, err2 := tx.Exec(`DELETE FROM compliance_agencies WHERE company_id = ?`, companyID); err2 != nil {
			return err2
		}
		return tx.Commit()
	}
	if err != nil {
		return err
	}

	// Wipe existing
	if _, err = tx.Exec(`DELETE FROM compliance_agencies WHERE company_id = ?`, companyID); err != nil {
		return err
	}

	// Fetch template agencies + fields
	aRows, err := tx.Query(`
		SELECT id, name, COALESCE(full_name,''), color, frequency, COALESCE(website,''), sort_order
		FROM compliance_template_agencies WHERE template_id = ? ORDER BY sort_order
	`, templateID)
	if err != nil {
		return err
	}
	defer aRows.Close()

	type tmplAgency struct {
		id, name, fullName, color, freq, website string
		order                                    int
	}
	var agencies []tmplAgency
	for aRows.Next() {
		var a tmplAgency
		if err := aRows.Scan(&a.id, &a.name, &a.fullName, &a.color, &a.freq, &a.website, &a.order); err != nil {
			return err
		}
		agencies = append(agencies, a)
	}

	for _, a := range agencies {
		agencyID := uuid.New().String()
		if _, err := tx.Exec(`
			INSERT INTO compliance_agencies (id, company_id, name, full_name, color, frequency, website, status, sort_order)
			VALUES (?, ?, ?, ?, ?, ?, ?, 'Not Filed', ?)
		`, agencyID, companyID, a.name, a.fullName, a.color, a.freq, a.website, a.order); err != nil {
			return err
		}

		fRows, err := tx.Query(`
			SELECT field_key, label, field_type, sort_order
			FROM compliance_template_fields WHERE agency_id = ? ORDER BY sort_order
		`, a.id)
		if err != nil {
			return err
		}
		for fRows.Next() {
			var key, label, ftype string
			var forder int
			if err := fRows.Scan(&key, &label, &ftype, &forder); err != nil {
				fRows.Close()
				return err
			}
			if _, err := tx.Exec(`
				INSERT INTO compliance_fields (id, agency_id, company_id, field_key, label, field_type, sort_order)
				VALUES (?, ?, ?, ?, ?, ?, ?)
			`, uuid.New().String(), agencyID, companyID, key, label, ftype, forder); err != nil {
				fRows.Close()
				return err
			}
		}
		fRows.Close()
	}

	return tx.Commit()
}

// CreateAgency inserts a new compliance agency and its field definitions.
func (r *ComplianceRepo) CreateAgency(a *models.ComplianceAgency, fields []models.ComplianceFieldInput) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err = tx.Exec(`
		INSERT INTO compliance_agencies (id, company_id, name, full_name, color, frequency, website, status, due_date, last_filed)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, a.ID, a.CompanyID, a.Name, a.FullName, a.Color, a.Frequency, a.Website, a.Status, a.DueDate, a.LastFiled); err != nil {
		return err
	}

	for i, f := range fields {
		if _, err = tx.Exec(`
			INSERT INTO compliance_fields (id, agency_id, company_id, field_key, label, field_type, sort_order)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`, uuid.New().String(), a.ID, a.CompanyID, f.Key, f.Label, f.Type, i); err != nil {
			return err
		}
	}

	return tx.Commit()
}

// UpdateAgency updates agency metadata and replaces its field definitions.
func (r *ComplianceRepo) UpdateAgency(a *models.ComplianceAgency, fields []models.ComplianceFieldInput) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err = tx.Exec(`
		UPDATE compliance_agencies
		SET name=?, full_name=?, color=?, frequency=?, website=?, status=?, due_date=?, last_filed=?
		WHERE id=? AND company_id=?
	`, a.Name, a.FullName, a.Color, a.Frequency, a.Website, a.Status, a.DueDate, a.LastFiled, a.ID, a.CompanyID); err != nil {
		return err
	}

	// Replace fields: delete then re-insert to preserve values via FK cascade
	if _, err = tx.Exec(`DELETE FROM compliance_fields WHERE agency_id=? AND company_id=?`, a.ID, a.CompanyID); err != nil {
		return err
	}
	for i, f := range fields {
		if _, err = tx.Exec(`
			INSERT INTO compliance_fields (id, agency_id, company_id, field_key, label, field_type, sort_order)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`, uuid.New().String(), a.ID, a.CompanyID, f.Key, f.Label, f.Type, i); err != nil {
			return err
		}
	}

	return tx.Commit()
}

// DeleteAgency removes a compliance agency and cascades to fields and values.
func (r *ComplianceRepo) DeleteAgency(companyID, agencyID string) error {
	_, err := r.db.Exec(
		`DELETE FROM compliance_agencies WHERE id=? AND company_id=?`,
		agencyID, companyID,
	)
	return err
}

// --- helpers (shared with other repos) ---

func placeholders(n int) string {
	if n == 0 {
		return ""
	}
	s := "?"
	for i := 1; i < n; i++ {
		s += ",?"
	}
	return s
}

func toAny(ss []string) []any {
	out := make([]any, len(ss))
	for i, s := range ss {
		out[i] = s
	}
	return out
}
