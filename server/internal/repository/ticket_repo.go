package repository

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"lettersheets/internal/models"
)

type TicketRepo struct{ db *sql.DB }

func NewTicketRepo(db *sql.DB) *TicketRepo { return &TicketRepo{db: db} }

// parseLabels decodes the JSON_ARRAYAGG label column embedded by sp_get_tickets
// / sp_get_ticket into the ticket's Labels slice. Always returns a non-nil slice
// so the API serializes an empty array (never null) for the frontend.
func parseLabels(js sql.NullString) []models.TicketLabelRef {
	out := []models.TicketLabelRef{}
	if js.Valid && js.String != "" {
		_ = json.Unmarshal([]byte(js.String), &out)
	}
	return out
}

// ==================== CATEGORIES ====================

func (r *TicketRepo) GetCategories(cid string) ([]models.TicketCategory, error) {
	rows, err := r.db.Query("CALL sp_get_ticket_categories(?)", cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.TicketCategory
	for rows.Next() {
		var c models.TicketCategory
		var desc sql.NullString
		if err := rows.Scan(&c.ID, &c.CompanyID, &c.Name, &desc, &c.Color, &c.Icon, &c.SLAHours, &c.IsActive, &c.IsDeleted, &c.SortOrder, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan cat: %w", err)
		}
		if desc.Valid {
			c.Description = desc.String
		}
		out = append(out, c)
	}
	return out, nil
}

func (r *TicketRepo) CreateCategory(c *models.TicketCategory) error {
	rows, err := r.db.Query("CALL sp_create_ticket_category(?,?,?,?,?,?,?,?)",
		c.ID, c.CompanyID, c.Name, c.Description, c.Color, c.Icon, c.SLAHours, c.SortOrder)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *TicketRepo) UpdateCategory(c *models.TicketCategory) error {
	rows, err := r.db.Query("CALL sp_update_ticket_category(?,?,?,?,?,?,?,?)",
		c.ID, c.CompanyID, c.Name, c.Description, c.Color, c.Icon, c.SLAHours, c.SortOrder)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *TicketRepo) DeleteCategory(id, cid string) error {
	rows, err := r.db.Query("CALL sp_delete_ticket_category(?,?)", id, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *TicketRepo) SeedCategories(cid string) error {
	rows, err := r.db.Query("CALL sp_seed_ticket_categories(?)", cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

// ==================== TICKETS ====================

func (r *TicketRepo) CreateTicket(t *models.Ticket) (int, error) {
	rows, err := r.db.Query("CALL sp_create_ticket(?,?,?,?,?,?,?,?)",
		t.ID, t.CompanyID, t.Subject, t.Description, t.CategoryID, t.Priority, t.CreatedBy, t.AssignedTo)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	var num int
	if rows.Next() {
		rows.Scan(&num)
	}
	return num, nil
}

func (r *TicketRepo) GetTickets(cid, status, priority, catID, assigned, created string) ([]models.Ticket, error) {
	rows, err := r.db.Query("CALL sp_get_tickets(?,?,?,?,?,?)", cid, status, priority, catID, assigned, created)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.Ticket
	for rows.Next() {
		var t models.Ticket
		var desc, catID, due, resolvedAt, closedAt, catName, catColor, catIcon, createdName, assignedTo, assignedName, labelsJSON sql.NullString
		if err := rows.Scan(
			&t.ID, &t.CompanyID, &t.TicketNumber, &t.Subject, &desc,
			&catID, &t.Priority, &t.Status, &t.CreatedBy, &assignedTo,
			&due, &resolvedAt, &closedAt,
			&t.IsDeleted, &t.CreatedAt, &t.UpdatedAt,
			&catName, &catColor, &catIcon,
			&createdName, &assignedName,
			&t.CommentCount, &t.IsOverdue,
			&labelsJSON,
		); err != nil {
			return nil, fmt.Errorf("scan ticket: %w", err)
		}
		t.Labels = parseLabels(labelsJSON)
		if desc.Valid {
			t.Description = desc.String
		}
		if catID.Valid {
			t.CategoryID = catID.String
		}
		if due.Valid {
			t.DueDate = due.String
		}
		if resolvedAt.Valid {
			t.ResolvedAt = resolvedAt.String
		}
		if closedAt.Valid {
			t.ClosedAt = closedAt.String
		}
		if catName.Valid {
			t.CategoryName = catName.String
		}
		if catColor.Valid {
			t.CategoryColor = catColor.String
		}
		if catIcon.Valid {
			t.CategoryIcon = catIcon.String
		}
		if createdName.Valid {
			t.CreatedByName = createdName.String
		}
		if assignedTo.Valid {
			t.AssignedTo = assignedTo.String
		}
		if assignedName.Valid {
			t.AssignedToName = assignedName.String
		}
		out = append(out, t)
	}
	return out, nil
}

func (r *TicketRepo) GetTicket(id, cid string) (*models.Ticket, error) {
	rows, err := r.db.Query("CALL sp_get_ticket(?,?)", id, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, fmt.Errorf("ticket not found")
	}
	var t models.Ticket
	var desc, catID, due, resolvedAt, closedAt, catName, catColor, catIcon, createdName, assignedTo, assignedName, labelsJSON sql.NullString
	var sla sql.NullInt64
	if err := rows.Scan(
		&t.ID, &t.CompanyID, &t.TicketNumber, &t.Subject, &desc,
		&catID, &t.Priority, &t.Status, &t.CreatedBy, &assignedTo,
		&due, &resolvedAt, &closedAt,
		&t.IsDeleted, &t.CreatedAt, &t.UpdatedAt,
		&catName, &catColor, &catIcon, &sla,
		&createdName, &assignedName, &t.IsOverdue,
		&labelsJSON,
	); err != nil {
		return nil, fmt.Errorf("scan ticket: %w", err)
	}
	t.Labels = parseLabels(labelsJSON)
	if desc.Valid {
		t.Description = desc.String
	}
	if catID.Valid {
		t.CategoryID = catID.String
	}
	if due.Valid {
		t.DueDate = due.String
	}
	if resolvedAt.Valid {
		t.ResolvedAt = resolvedAt.String
	}
	if closedAt.Valid {
		t.ClosedAt = closedAt.String
	}
	if catName.Valid {
		t.CategoryName = catName.String
	}
	if catColor.Valid {
		t.CategoryColor = catColor.String
	}
	if catIcon.Valid {
		t.CategoryIcon = catIcon.String
	}
	if sla.Valid {
		t.SLAHours = int(sla.Int64)
	}
	if createdName.Valid {
		t.CreatedByName = createdName.String
	}
	if assignedTo.Valid {
		t.AssignedTo = assignedTo.String
	}
	if assignedName.Valid {
		t.AssignedToName = assignedName.String
	}
	return &t, nil
}

func (r *TicketRepo) UpdateTicket(t *models.Ticket) error {
	rows, err := r.db.Query("CALL sp_update_ticket(?,?,?,?,?,?,?)",
		t.ID, t.CompanyID, t.Subject, t.Description, t.CategoryID, t.Priority, t.AssignedTo)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *TicketRepo) UpdateStatus(id, cid, status string) error {
	rows, err := r.db.Query("CALL sp_update_ticket_status(?,?,?)", id, cid, status)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *TicketRepo) AssignTicket(id, cid, assignedTo string) error {
	rows, err := r.db.Query("CALL sp_assign_ticket(?,?,?)", id, cid, assignedTo)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *TicketRepo) DeleteTicket(id, cid string) error {
	rows, err := r.db.Query("CALL sp_delete_ticket(?,?)", id, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

// ==================== COMMENTS ====================

func (r *TicketRepo) GetComments(ticketID, cid string) ([]models.TicketComment, error) {
	rows, err := r.db.Query("CALL sp_get_ticket_comments(?,?)", ticketID, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.TicketComment
	for rows.Next() {
		var c models.TicketComment
		var authorName sql.NullString
		if err := rows.Scan(&c.ID, &c.TicketID, &c.AuthorID, &c.Content, &c.IsInternal, &c.IsDeleted, &c.CreatedAt, &authorName); err != nil {
			return nil, fmt.Errorf("scan comment: %w", err)
		}
		if authorName.Valid {
			c.AuthorName = authorName.String
		}
		out = append(out, c)
	}
	return out, nil
}

func (r *TicketRepo) AddComment(c *models.TicketComment, cid string) error {
	rows, err := r.db.Query("CALL sp_add_ticket_comment(?,?,?,?,?,?)",
		c.ID, c.TicketID, c.AuthorID, c.Content, c.IsInternal, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *TicketRepo) DeleteComment(id, cid string) error {
	rows, err := r.db.Query("CALL sp_delete_ticket_comment(?,?)", id, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

// ==================== STATS ====================

func (r *TicketRepo) GetStats(cid string) (*models.TicketStats, error) {
	rows, err := r.db.Query("CALL sp_ticket_stats(?)", cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var s models.TicketStats
	var avgHrs sql.NullFloat64
	if rows.Next() {
		rows.Scan(&s.Total, &s.OpenCount, &s.InProgress, &s.OnHold, &s.Resolved, &s.ClosedCount,
			&s.Overdue, &s.UrgentOpen, &s.HighOpen, &s.CreatedToday, &s.ResolvedToday, &avgHrs)
		if avgHrs.Valid {
			s.AvgResolutionHours = avgHrs.Float64
		}
	}
	return &s, nil
}

func (r *TicketRepo) GetCategoryStats(cid string) ([]models.TicketCategoryStats, error) {
	rows, err := r.db.Query("CALL sp_ticket_stats_by_category(?)", cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.TicketCategoryStats
	for rows.Next() {
		var c models.TicketCategoryStats
		rows.Scan(&c.ID, &c.Name, &c.Color, &c.Icon, &c.Total, &c.Active, &c.Overdue)
		out = append(out, c)
	}
	return out, nil
}

// ==================== LABELS ====================

func (r *TicketRepo) GetLabels(cid string) ([]models.TicketLabel, error) {
	rows, err := r.db.Query("CALL sp_get_labels(?)", cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.TicketLabel
	for rows.Next() {
		var l models.TicketLabel
		var desc sql.NullString
		if err := rows.Scan(&l.ID, &l.CompanyID, &l.Name, &l.Color, &desc, &l.IsDeleted, &l.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan label: %w", err)
		}
		if desc.Valid {
			l.Description = desc.String
		}
		out = append(out, l)
	}
	return out, nil
}

func (r *TicketRepo) CreateLabel(l *models.TicketLabel) error {
	rows, err := r.db.Query("CALL sp_create_label(?,?,?,?,?)", l.ID, l.CompanyID, l.Name, l.Color, l.Description)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *TicketRepo) UpdateLabel(l *models.TicketLabel) error {
	rows, err := r.db.Query("CALL sp_update_label(?,?,?,?,?)", l.ID, l.CompanyID, l.Name, l.Color, l.Description)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *TicketRepo) DeleteLabel(id, cid string) error {
	rows, err := r.db.Query("CALL sp_delete_label(?,?)", id, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *TicketRepo) AddTicketLabel(ticketID, labelID, cid string) error {
	rows, err := r.db.Query("CALL sp_add_ticket_label(?,?,?)", ticketID, labelID, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *TicketRepo) RemoveTicketLabel(ticketID, labelID, cid string) error {
	rows, err := r.db.Query("CALL sp_remove_ticket_label(?,?,?)", ticketID, labelID, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

// ==================== TIMELINE EVENTS ====================

func (r *TicketRepo) AddEvent(id, ticketID, cid, actor, evType, oldVal, newVal string) error {
	rows, err := r.db.Query("CALL sp_add_ticket_event(?,?,?,?,?,?,?)", id, ticketID, cid, actor, evType, oldVal, newVal)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *TicketRepo) GetEvents(ticketID, cid string) ([]models.TicketEvent, error) {
	rows, err := r.db.Query("CALL sp_get_ticket_events(?,?)", ticketID, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.TicketEvent
	for rows.Next() {
		var e models.TicketEvent
		var actorID, oldVal, newVal, actorName sql.NullString
		if err := rows.Scan(&e.ID, &e.TicketID, &actorID, &e.EventType, &oldVal, &newVal, &e.CreatedAt, &actorName); err != nil {
			return nil, fmt.Errorf("scan event: %w", err)
		}
		if actorID.Valid {
			e.ActorID = actorID.String
		}
		if oldVal.Valid {
			e.OldValue = oldVal.String
		}
		if newVal.Valid {
			e.NewValue = newVal.String
		}
		if actorName.Valid {
			e.ActorName = actorName.String
		}
		out = append(out, e)
	}
	return out, nil
}

// ==================== COMMENT EDIT + REACTIONS ====================

func (r *TicketRepo) UpdateComment(id, cid, author, content string) error {
	rows, err := r.db.Query("CALL sp_update_ticket_comment(?,?,?,?)", id, cid, author, content)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *TicketRepo) ToggleReaction(commentID, cid, userID, emoji string) error {
	rows, err := r.db.Query("CALL sp_toggle_comment_reaction(?,?,?,?)", commentID, cid, userID, emoji)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *TicketRepo) GetReactions(ticketID, cid string) ([]models.TicketReaction, error) {
	rows, err := r.db.Query("CALL sp_get_ticket_reactions(?,?)", ticketID, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.TicketReaction
	for rows.Next() {
		var re models.TicketReaction
		if err := rows.Scan(&re.CommentID, &re.Emoji, &re.UserID); err != nil {
			return nil, fmt.Errorf("scan reaction: %w", err)
		}
		out = append(out, re)
	}
	return out, nil
}
