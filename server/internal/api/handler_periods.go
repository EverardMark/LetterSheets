package api

import (
	"fmt"
	"log"
	"math"
	"net/http"
	"time"

	"lettersheets/internal/models"
	"lettersheets/internal/repository"

	"github.com/google/uuid"
)

// Fiscal periods and the year-end close (migration 020).
//
// The enforcement half of this feature is not here — it lives in
// AccountingRepo.PostJournalEntry, the single choke point every module's GL
// posting passes through. What lives here is the calendar's CRUD plus the close
// itself, which is the one operation allowed to write into the period it is
// closing (see PostJournalEntryUnchecked).

// ==================== FISCAL YEARS ====================

func (h *Handler) getFiscalYears(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	years, err := h.periodRepo.ListYears(r.Context(), session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if years == nil {
		years = []models.FiscalYear{}
	}
	JSON(w, http.StatusOK, years)
}

// getFiscalYear returns one year with its periods inlined — the shape the
// period grid renders from in a single round trip.
func (h *Handler) getFiscalYear(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	y, err := h.periodRepo.GetYear(r.Context(), session.CompanyID, req.ID)
	if err != nil {
		Error(w, http.StatusNotFound, "fiscal year not found")
		return
	}
	if y.Periods, err = h.periodRepo.ListPeriods(r.Context(), session.CompanyID, y.ID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, y)
}

func (h *Handler) generateFiscalYear(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		Name        string `json:"name"`
		StartDate   string `json:"start_date"`
		PeriodCount int    `json:"period_count"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.StartDate == "" {
		Error(w, http.StatusBadRequest, "start_date is required")
		return
	}
	start, err := time.Parse("2006-01-02", req.StartDate)
	if err != nil {
		Error(w, http.StatusBadRequest, "start_date must be YYYY-MM-DD")
		return
	}
	if req.Name == "" {
		// A fiscal year starting mid-calendar-year spans two of them, so name it
		// for the year it ends in — the convention Philippine filings use.
		endYear := start.AddDate(1, 0, -1).Year()
		if start.Month() == time.January && start.Day() == 1 {
			req.Name = fmt.Sprintf("FY%d", start.Year())
		} else {
			req.Name = fmt.Sprintf("FY%d-%d", start.Year(), endYear)
		}
	}
	id, err := h.periodRepo.GenerateYear(r.Context(), session.CompanyID, req.Name, req.StartDate, req.PeriodCount)
	if err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	y, err := h.periodRepo.GetYear(r.Context(), session.CompanyID, id)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	y.Periods, _ = h.periodRepo.ListPeriods(r.Context(), session.CompanyID, id)
	JSON(w, http.StatusCreated, y)
}

func (h *Handler) deleteFiscalYear(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := h.periodRepo.DeleteYear(r.Context(), session.CompanyID, req.ID); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"deleted": true})
}

// ==================== PERIODS ====================

func (h *Handler) getFiscalPeriods(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		FiscalYearID string `json:"fiscal_year_id"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	periods, err := h.periodRepo.ListPeriods(r.Context(), session.CompanyID, req.FiscalYearID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if periods == nil {
		periods = []models.FiscalPeriod{}
	}
	JSON(w, http.StatusOK, periods)
}

func (h *Handler) setPeriodStatus(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := h.periodRepo.SetPeriodStatus(r.Context(), session.CompanyID, req.ID, req.Status, session.UserID); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]string{"status": req.Status})
}

func (h *Handler) setAllPeriodStatus(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		FiscalYearID string `json:"fiscal_year_id"`
		Status       string `json:"status"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Status != repository.PeriodOpen && req.Status != repository.PeriodClosed && req.Status != repository.PeriodLocked {
		Error(w, http.StatusBadRequest, "status must be Open, Closed or Locked")
		return
	}
	if err := h.periodRepo.SetAllPeriodStatus(r.Context(), session.CompanyID, req.FiscalYearID, req.Status, session.UserID); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]string{"status": req.Status})
}

// checkPeriodOpen lets the UI grey out a date picker before the user fills in a
// whole entry only to have the post rejected. Read-only and cheap.
func (h *Handler) checkPeriodOpen(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		Date string `json:"date"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Date == "" {
		req.Date = time.Now().Format("2006-01-02")
	}
	open, reason, err := h.periodRepo.IsDateOpen(r.Context(), session.CompanyID, req.Date)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]interface{}{"open": open, "reason": reason, "date": req.Date})
}

// ==================== YEAR-END CLOSE ====================

// getClosePreview shows exactly what the close will post before anyone commits
// to it: every P&L account's balance, the resulting net income, the equity
// account it will land on, and any warnings worth stopping for.
func (h *Handler) getClosePreview(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		FiscalYearID string `json:"fiscal_year_id"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	ctx := r.Context()
	y, err := h.periodRepo.GetYear(ctx, session.CompanyID, req.FiscalYearID)
	if err != nil {
		Error(w, http.StatusNotFound, "fiscal year not found")
		return
	}
	preview, err := h.buildClosePreview(r, session.CompanyID, y)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, preview)
}

func (h *Handler) buildClosePreview(r *http.Request, companyID string, y *models.FiscalYear) (*models.ClosePreview, error) {
	ctx := r.Context()
	activity, err := h.periodRepo.PLActivity(ctx, companyID, y.StartDate, y.EndDate)
	if err != nil {
		return nil, err
	}
	p := &models.ClosePreview{FiscalYear: y, Warnings: []string{},
		Revenue: []models.AccountActivity{}, Expenses: []models.AccountActivity{}}
	for _, a := range activity {
		if a.AccountType == "Revenue" {
			p.Revenue = append(p.Revenue, a)
			p.TotalRevenue += a.Balance
		} else {
			p.Expenses = append(p.Expenses, a)
			p.TotalExpenses += a.Balance
		}
	}
	p.TotalRevenue, p.TotalExpenses = round2(p.TotalRevenue), round2(p.TotalExpenses)
	p.NetIncome = round2(p.TotalRevenue - p.TotalExpenses)

	if p.DraftEntries, err = h.periodRepo.DraftCountInRange(ctx, companyID, y.StartDate, y.EndDate); err != nil {
		return nil, err
	}
	if p.DraftEntries > 0 {
		p.Warnings = append(p.Warnings, fmt.Sprintf(
			"%d draft journal entr%s dated inside this year will be stranded — a closed period will not accept them.",
			p.DraftEntries, plural(p.DraftEntries, "y", "ies")))
	}
	if p.SuggestedEquity, err = h.periodRepo.SuggestEquityAccount(ctx, companyID); err != nil {
		return nil, err
	}
	if p.SuggestedEquity == nil {
		p.Warnings = append(p.Warnings, "No equity account found. Create a Retained Earnings account before closing.")
	}
	if len(activity) == 0 {
		p.Warnings = append(p.Warnings, "No revenue or expense activity was posted in this year — the close will record nothing.")
	}
	if y.Status != repository.PeriodOpen {
		p.Warnings = append(p.Warnings, "This year is already closed.")
	}
	return p, nil
}

// closeFiscalYear posts the closing entry and locks the year.
//
// ORDER MATTERS: the closing entry is dated the last day of the year being
// closed, so it must be posted BEFORE the periods flip to Closed. It uses
// PostJournalEntryUnchecked for the same reason — it is the one write that is
// legitimately allowed into the period it is sealing.
func (h *Handler) closeFiscalYear(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		FiscalYearID    string `json:"fiscal_year_id"`
		EquityAccountID string `json:"equity_account_id"`
		Notes           string `json:"notes"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	ctx := r.Context()

	h.closeMu.Lock()
	defer h.closeMu.Unlock()

	y, err := h.periodRepo.GetYear(ctx, session.CompanyID, req.FiscalYearID)
	if err != nil {
		Error(w, http.StatusNotFound, "fiscal year not found")
		return
	}
	if y.Status != repository.PeriodOpen {
		Error(w, http.StatusBadRequest, "this fiscal year is already closed")
		return
	}

	equityID := req.EquityAccountID
	if equityID == "" {
		suggested, err := h.periodRepo.SuggestEquityAccount(ctx, session.CompanyID)
		if err != nil || suggested == nil {
			Error(w, http.StatusBadRequest, "no equity account to close into — create a Retained Earnings account or pass equity_account_id")
			return
		}
		equityID = suggested.ID
	}

	activity, err := h.periodRepo.PLActivity(ctx, session.CompanyID, y.StartDate, y.EndDate)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	lines, netIncome := repository.BuildClosingLines(activity, equityID, y.Name)

	// A year with no P&L activity is still closeable — it just has nothing to
	// post. Recording it as closed is the point; a journal is not required.
	journalID := ""
	if len(lines) > 0 {
		journalID, err = h.postClosingEntry(session.CompanyID, session.UserID, y, lines)
		if err != nil {
			Error(w, http.StatusInternalServerError, "post closing entry: "+err.Error())
			return
		}
	}

	if err := h.periodRepo.MarkYearClosed(ctx, session.CompanyID, y.ID, journalID, equityID, session.UserID, netIncome); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := h.periodRepo.SetAllPeriodStatus(ctx, session.CompanyID, y.ID, repository.PeriodClosed, session.UserID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.notifyPermissionHolders(ctx, session.CompanyID, "accounting", "view", models.Notification{
		Type: "year_closed", Severity: "warning",
		Title: "Fiscal year " + y.Name + " closed",
		Body: fmt.Sprintf("Net result %s rolled to equity. Postings dated in this year are now blocked.",
			formatPeso(netIncome)),
		Link: "/accounting/periods", EntityType: "fiscal_year", EntityID: y.ID,
	})

	saved, _ := h.periodRepo.GetYear(ctx, session.CompanyID, y.ID)
	JSON(w, http.StatusOK, map[string]interface{}{
		"fiscal_year": saved, "journal_id": journalID, "net_income": netIncome, "lines": len(lines),
	})
}

// postClosingEntry writes and posts the closing journal. Kept separate so the
// close handler reads as policy and this reads as mechanics.
func (h *Handler) postClosingEntry(companyID, userID string, y *models.FiscalYear, lines []repository.ClosingLine) (string, error) {
	entryNum, _ := h.acctRepo.NextEntryNumber(companyID)
	entryID := uuid.New().String()
	memo := "Year-end closing entry — " + y.Name

	if err := h.acctRepo.CreateJournalEntry(entryID, companyID, entryNum, y.EndDate, memo,
		repository.ClosingSourceType, y.ID, "Draft"); err != nil {
		return "", err
	}
	for i, l := range lines {
		if err := h.acctRepo.AddJournalLine(entryID, companyID, l.AccountID, l.Description, l.Debit, l.Credit, i); err != nil {
			return "", err
		}
	}
	if err := h.acctRepo.UpdateJournalTotals(entryID, companyID); err != nil {
		return "", err
	}
	if err := h.acctRepo.PostJournalEntryUnchecked(entryID, companyID, userID); err != nil {
		return "", err
	}
	return entryID, nil
}

// reopenFiscalYear voids the closing entry and reopens the year and its periods.
// Locked periods stay locked — reopening a year must not silently unlock a
// period someone deliberately sealed after filing it.
func (h *Handler) reopenFiscalYear(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		FiscalYearID string `json:"fiscal_year_id"`
		Reason       string `json:"reason"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	ctx := r.Context()

	h.closeMu.Lock()
	defer h.closeMu.Unlock()

	y, err := h.periodRepo.GetYear(ctx, session.CompanyID, req.FiscalYearID)
	if err != nil {
		Error(w, http.StatusNotFound, "fiscal year not found")
		return
	}
	if y.Status == repository.PeriodOpen {
		Error(w, http.StatusBadRequest, "this fiscal year is already open")
		return
	}
	reason := req.Reason
	if reason == "" {
		reason = "Fiscal year " + y.Name + " reopened"
	}
	if y.ClosingJournalID != "" {
		if err := h.acctRepo.VoidJournalEntryUnchecked(y.ClosingJournalID, session.CompanyID, session.UserID, reason); err != nil {
			Error(w, http.StatusInternalServerError, "void closing entry: "+err.Error())
			return
		}
	}
	if err := h.periodRepo.MarkYearOpen(ctx, session.CompanyID, y.ID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := h.periodRepo.SetAllPeriodStatus(ctx, session.CompanyID, y.ID, repository.PeriodOpen, session.UserID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.notifyPermissionHolders(ctx, session.CompanyID, "accounting", "view", models.Notification{
		Type: "year_reopened", Severity: "warning",
		Title: "Fiscal year " + y.Name + " reopened",
		Body:  "The closing entry was voided and postings to this year are allowed again.",
		Link:  "/accounting/periods", EntityType: "fiscal_year", EntityID: y.ID,
	})

	saved, _ := h.periodRepo.GetYear(ctx, session.CompanyID, y.ID)
	JSON(w, http.StatusOK, saved)
}

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

func plural(n int, one, many string) string {
	if n == 1 {
		return one
	}
	return many
}

func formatPeso(f float64) string {
	return fmt.Sprintf("₱%.2f", f)
}

func round2(x float64) float64 { return math.Round(x*100) / 100 }

// postOrDiscard posts a freshly-built draft and, if the ledger refuses it,
// deletes the draft before returning the error.
//
// This exists because migration 020 gave PostJournalEntry a new way to fail:
// before the fiscal-period guard, a post that got this far essentially always
// succeeded, so every module's "create draft → add lines → post" sequence could
// treat failure as impossible. Now a posting dated into a closed period is
// rejected, and without this the rejected draft stays behind — cluttering the
// journal, and getting counted by the year-end close as a "stranded draft" that
// can never be posted. A retry after reopening the period would then create a
// second entry that looks like a duplicate of the first.
//
// The cleanup is a HARD delete (DiscardDraftJournal), not the usual soft one:
// a soft-deleted row keeps its entry_number reserved against uk_je_number while
// sp_next_entry_number skips it, so the next create would collide.
func (h *Handler) postOrDiscard(entryID, companyID, userID string) error {
	err := h.acctRepo.PostJournalEntry(entryID, companyID, userID)
	if err == nil {
		return nil
	}
	if delErr := h.acctRepo.DiscardDraftJournal(entryID, companyID); delErr != nil {
		log.Printf("journal %s: post rejected and draft cleanup failed: %v", entryID, delErr)
	}
	return err
}
