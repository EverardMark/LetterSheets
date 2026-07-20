package repository

import (
	"context"
	"database/sql"

	"lettersheets/internal/models"
)

// CRMRepo owns the front-office sales funnel (leads, opportunities, activities)
// that sits upstream of the Sales module. Plain SQL — ls_user has DML but not
// CREATE ROUTINE (see migration 019). CRM "accounts" are ar_customers, so
// opportunities reference customer_id there rather than duplicating a master.
type CRMRepo struct {
	db *sql.DB
}

func NewCRMRepo(db *sql.DB) *CRMRepo { return &CRMRepo{db: db} }

// ---------------------------------------------------------------------------
// LEADS
// ---------------------------------------------------------------------------

func (r *CRMRepo) GetLeads(ctx context.Context, companyID, status string) ([]models.CRMLead, error) {
	q := `SELECT id, company_id, name, company_name, title, email, phone, source, status,
	             rating, owner_id, notes, is_converted, converted_customer_id,
	             converted_opportunity_id, converted_at, created_at, updated_at
	      FROM crm_leads
	      WHERE company_id = ? AND is_deleted = 0`
	args := []interface{}{companyID}
	if status != "" {
		q += " AND status = ?"
		args = append(args, status)
	}
	q += " ORDER BY created_at DESC"

	rows, err := r.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []models.CRMLead
	for rows.Next() {
		var l models.CRMLead
		var companyName, title, email, phone, rating, owner, notes, convCust, convOpp, convAt sql.NullString
		if err := rows.Scan(&l.ID, &l.CompanyID, &l.Name, &companyName, &title, &email, &phone,
			&l.Source, &l.Status, &rating, &owner, &notes, &l.IsConverted, &convCust, &convOpp,
			&convAt, &l.CreatedAt, &l.UpdatedAt); err != nil {
			return nil, err
		}
		l.CompanyName = companyName.String
		l.Title = title.String
		l.Email = email.String
		l.Phone = phone.String
		l.Rating = rating.String
		l.Notes = notes.String
		if owner.Valid {
			l.OwnerID = &owner.String
		}
		if convCust.Valid {
			l.ConvertedCustomerID = &convCust.String
		}
		if convOpp.Valid {
			l.ConvertedOpportunityID = &convOpp.String
		}
		if convAt.Valid {
			l.ConvertedAt = &convAt.String
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func (r *CRMRepo) CreateLead(ctx context.Context, l *models.CRMLead) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO crm_leads (id, company_id, name, company_name, title, email, phone,
		                       source, status, rating, owner_id, notes)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		l.ID, l.CompanyID, l.Name, l.CompanyName, l.Title, l.Email, l.Phone,
		l.Source, l.Status, l.Rating, l.OwnerID, l.Notes)
	return err
}

func (r *CRMRepo) UpdateLead(ctx context.Context, l *models.CRMLead) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE crm_leads
		SET name=?, company_name=?, title=?, email=?, phone=?, source=?, status=?,
		    rating=?, owner_id=?, notes=?
		WHERE id=? AND company_id=? AND is_deleted=0`,
		l.Name, l.CompanyName, l.Title, l.Email, l.Phone, l.Source, l.Status,
		l.Rating, l.OwnerID, l.Notes, l.ID, l.CompanyID)
	return err
}

func (r *CRMRepo) DeleteLead(ctx context.Context, id, companyID string) error {
	_, err := r.db.ExecContext(ctx,
		"UPDATE crm_leads SET is_deleted=1 WHERE id=? AND company_id=?", id, companyID)
	return err
}

// MarkLeadConverted records that a lead became a customer + opportunity.
func (r *CRMRepo) MarkLeadConverted(ctx context.Context, id, companyID, customerID, opportunityID string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE crm_leads
		SET is_converted=1, status='Qualified', converted_customer_id=?,
		    converted_opportunity_id=?, converted_at=NOW()
		WHERE id=? AND company_id=?`,
		customerID, opportunityID, id, companyID)
	return err
}

// ---------------------------------------------------------------------------
// OPPORTUNITIES
// ---------------------------------------------------------------------------

func (r *CRMRepo) GetOpportunities(ctx context.Context, companyID, stage string) ([]models.CRMOpportunity, error) {
	q := `SELECT o.id, o.company_id, o.name, o.customer_id, o.stage, o.amount, o.probability,
	             o.expected_close_date, o.source, o.owner_id, o.lost_reason, o.quote_id,
	             o.closed_at, o.notes, o.created_at, o.updated_at, c.name AS customer_name
	      FROM crm_opportunities o
	      JOIN ar_customers c ON c.id = o.customer_id
	      WHERE o.company_id = ? AND o.is_deleted = 0`
	args := []interface{}{companyID}
	if stage != "" {
		q += " AND o.stage = ?"
		args = append(args, stage)
	}
	q += " ORDER BY o.updated_at DESC"

	rows, err := r.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []models.CRMOpportunity
	for rows.Next() {
		o, err := scanOpportunity(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *o)
	}
	return out, rows.Err()
}

func (r *CRMRepo) GetOpportunity(ctx context.Context, id, companyID string) (*models.CRMOpportunity, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT o.id, o.company_id, o.name, o.customer_id, o.stage, o.amount, o.probability,
		       o.expected_close_date, o.source, o.owner_id, o.lost_reason, o.quote_id,
		       o.closed_at, o.notes, o.created_at, o.updated_at, c.name AS customer_name
		FROM crm_opportunities o
		JOIN ar_customers c ON c.id = o.customer_id
		WHERE o.id = ? AND o.company_id = ? AND o.is_deleted = 0`, id, companyID)
	return scanOpportunity(row)
}

// scanner is satisfied by both *sql.Row and *sql.Rows.
type scanner interface {
	Scan(dest ...interface{}) error
}

func scanOpportunity(s scanner) (*models.CRMOpportunity, error) {
	var o models.CRMOpportunity
	var expClose, source, owner, lostReason, quoteID, closedAt, notes sql.NullString
	if err := s.Scan(&o.ID, &o.CompanyID, &o.Name, &o.CustomerID, &o.Stage, &o.Amount, &o.Probability,
		&expClose, &source, &owner, &lostReason, &quoteID, &closedAt, &notes,
		&o.CreatedAt, &o.UpdatedAt, &o.CustomerName); err != nil {
		return nil, err
	}
	o.Source = source.String
	o.LostReason = lostReason.String
	o.Notes = notes.String
	if expClose.Valid {
		o.ExpectedCloseDate = &expClose.String
	}
	if owner.Valid {
		o.OwnerID = &owner.String
	}
	if quoteID.Valid {
		o.QuoteID = &quoteID.String
	}
	if closedAt.Valid {
		o.ClosedAt = &closedAt.String
	}
	return &o, nil
}

func (r *CRMRepo) CreateOpportunity(ctx context.Context, o *models.CRMOpportunity) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO crm_opportunities (id, company_id, name, customer_id, stage, amount,
		                               probability, expected_close_date, source, owner_id, notes)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		o.ID, o.CompanyID, o.Name, o.CustomerID, o.Stage, o.Amount, o.Probability,
		nullifyDate(o.ExpectedCloseDate), o.Source, o.OwnerID, o.Notes)
	return err
}

func (r *CRMRepo) UpdateOpportunity(ctx context.Context, o *models.CRMOpportunity) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE crm_opportunities
		SET name=?, customer_id=?, amount=?, probability=?, expected_close_date=?,
		    source=?, owner_id=?, notes=?
		WHERE id=? AND company_id=? AND is_deleted=0`,
		o.Name, o.CustomerID, o.Amount, o.Probability, nullifyDate(o.ExpectedCloseDate),
		o.Source, o.OwnerID, o.Notes, o.ID, o.CompanyID)
	return err
}

// SetStage moves an opportunity to a new stage. Won/Lost stamp closed_at; moving
// back to an open stage clears it. lostReason is only stored for the Lost stage.
func (r *CRMRepo) SetStage(ctx context.Context, id, companyID, stage, lostReason string) error {
	closed := stage == "Won" || stage == "Lost"
	var err error
	if closed {
		lr := sql.NullString{}
		if stage == "Lost" && lostReason != "" {
			lr = sql.NullString{String: lostReason, Valid: true}
		}
		_, err = r.db.ExecContext(ctx, `
			UPDATE crm_opportunities
			SET stage=?, lost_reason=?, closed_at=NOW(),
			    probability = CASE WHEN ?='Won' THEN 100 ELSE 0 END
			WHERE id=? AND company_id=? AND is_deleted=0`,
			stage, lr, stage, id, companyID)
	} else {
		_, err = r.db.ExecContext(ctx, `
			UPDATE crm_opportunities
			SET stage=?, closed_at=NULL, lost_reason=NULL
			WHERE id=? AND company_id=? AND is_deleted=0`,
			stage, id, companyID)
	}
	return err
}

// SetQuoteID links a won opportunity to the Sales quote it generated.
func (r *CRMRepo) SetQuoteID(ctx context.Context, id, companyID, quoteID string) error {
	_, err := r.db.ExecContext(ctx,
		"UPDATE crm_opportunities SET quote_id=? WHERE id=? AND company_id=? AND is_deleted=0",
		quoteID, id, companyID)
	return err
}

func (r *CRMRepo) DeleteOpportunity(ctx context.Context, id, companyID string) error {
	_, err := r.db.ExecContext(ctx,
		"UPDATE crm_opportunities SET is_deleted=1 WHERE id=? AND company_id=?", id, companyID)
	return err
}

// nullifyDate turns an empty/nil date pointer into a NULL so blank dates don't
// become MySQL's '0000-00-00'.
func nullifyDate(d *string) interface{} {
	if d == nil || *d == "" {
		return nil
	}
	return *d
}

// ---------------------------------------------------------------------------
// ACTIVITIES
// ---------------------------------------------------------------------------

func (r *CRMRepo) GetActivities(ctx context.Context, companyID, relatedType, relatedID string) ([]models.CRMActivity, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, company_id, related_type, related_id, type, subject, notes,
		       due_date, completed, completed_at, owner_id, created_at, updated_at
		FROM crm_activities
		WHERE company_id=? AND related_type=? AND related_id=? AND is_deleted=0
		ORDER BY COALESCE(due_date, created_at) DESC`, companyID, relatedType, relatedID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanActivities(rows)
}

// GetOverdueTasks lists incomplete Task activities past their due date.
func (r *CRMRepo) GetOverdueTasks(ctx context.Context, companyID string) ([]models.CRMActivity, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, company_id, related_type, related_id, type, subject, notes,
		       due_date, completed, completed_at, owner_id, created_at, updated_at
		FROM crm_activities
		WHERE company_id=? AND is_deleted=0 AND completed=0
		      AND due_date IS NOT NULL AND due_date < NOW()
		ORDER BY due_date ASC`, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanActivities(rows)
}

func scanActivities(rows *sql.Rows) ([]models.CRMActivity, error) {
	var out []models.CRMActivity
	for rows.Next() {
		var a models.CRMActivity
		var notes, dueDate, completedAt, owner sql.NullString
		if err := rows.Scan(&a.ID, &a.CompanyID, &a.RelatedType, &a.RelatedID, &a.Type,
			&a.Subject, &notes, &dueDate, &a.Completed, &completedAt, &owner,
			&a.CreatedAt, &a.UpdatedAt); err != nil {
			return nil, err
		}
		a.Notes = notes.String
		if dueDate.Valid {
			a.DueDate = &dueDate.String
		}
		if completedAt.Valid {
			a.CompletedAt = &completedAt.String
		}
		if owner.Valid {
			a.OwnerID = &owner.String
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (r *CRMRepo) CreateActivity(ctx context.Context, a *models.CRMActivity) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO crm_activities (id, company_id, related_type, related_id, type, subject,
		                            notes, due_date, owner_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		a.ID, a.CompanyID, a.RelatedType, a.RelatedID, a.Type, a.Subject,
		a.Notes, nullifyDate(a.DueDate), a.OwnerID)
	return err
}

func (r *CRMRepo) SetActivityCompleted(ctx context.Context, id, companyID string, completed bool) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE crm_activities
		SET completed=?, completed_at = CASE WHEN ? THEN NOW() ELSE NULL END
		WHERE id=? AND company_id=? AND is_deleted=0`,
		completed, completed, id, companyID)
	return err
}

func (r *CRMRepo) DeleteActivity(ctx context.Context, id, companyID string) error {
	_, err := r.db.ExecContext(ctx,
		"UPDATE crm_activities SET is_deleted=1 WHERE id=? AND company_id=?", id, companyID)
	return err
}

// ---------------------------------------------------------------------------
// OVERVIEW
// ---------------------------------------------------------------------------

func (r *CRMRepo) GetOverview(ctx context.Context, companyID string) (*models.CRMOverview, error) {
	ov := &models.CRMOverview{ByStage: []models.CRMStageStat{}}

	// Per-stage rollup for all non-deleted opportunities.
	rows, err := r.db.QueryContext(ctx, `
		SELECT stage, COUNT(*), COALESCE(SUM(amount),0),
		       COALESCE(SUM(amount * probability / 100),0)
		FROM crm_opportunities
		WHERE company_id=? AND is_deleted=0
		GROUP BY stage`, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	openStages := map[string]bool{"Prospecting": true, "Qualification": true, "Proposal": true, "Negotiation": true}
	for rows.Next() {
		var s models.CRMStageStat
		if err := rows.Scan(&s.Stage, &s.Count, &s.Amount, &s.WeightedValue); err != nil {
			return nil, err
		}
		switch {
		case openStages[s.Stage]:
			ov.OpenCount += s.Count
			ov.OpenValue += s.Amount
			ov.WeightedValue += s.WeightedValue
		case s.Stage == "Won":
			ov.WonCount += s.Count
			ov.WonValue += s.Amount
		case s.Stage == "Lost":
			ov.LostCount += s.Count
		}
		ov.ByStage = append(ov.ByStage, s)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if ov.WonCount+ov.LostCount > 0 {
		ov.WinRate = float64(ov.WonCount) / float64(ov.WonCount+ov.LostCount) * 100
	}

	// New (unconverted, status=New) leads.
	if err := r.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM crm_leads
		WHERE company_id=? AND is_deleted=0 AND is_converted=0 AND status='New'`,
		companyID).Scan(&ov.NewLeads); err != nil {
		return nil, err
	}

	// Overdue, incomplete task follow-ups.
	if err := r.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM crm_activities
		WHERE company_id=? AND is_deleted=0 AND completed=0
		      AND due_date IS NOT NULL AND due_date < NOW()`,
		companyID).Scan(&ov.OverdueTasks); err != nil {
		return nil, err
	}

	return ov, nil
}
