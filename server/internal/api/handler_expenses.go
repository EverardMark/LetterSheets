package api

import (
	"context"
	"encoding/base64"
	"fmt"
	"net/http"
	"strings"
	"time"

	"lettersheets/internal/models"
	"lettersheets/internal/repository"

	"github.com/google/uuid"
)

// Employee expense claims (migration 022).
//
// SELF-SERVICE BOUNDARY: filing, editing and submitting your OWN claim needs no
// module permission — the same rule leave requests and loan applications already
// follow. Everything that touches someone else's claim, the approval decision,
// or the ledger is gated in actionPerm. The scoping is enforced here rather than
// trusted from the request: employeeScope() decides which employee_id a caller
// may act as, and every read and write funnels through it.

// maxReceiptUpload caps one receipt at 10 MB, matching the onboarding document
// limit. Receipts are phone photos of thermal paper; 10 MB is generous.
const maxReceiptUpload = 10 << 20

// ==================== STATS & SETTINGS ====================

func (h *Handler) getExpStats(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	s, err := h.expRepo.Stats(r.Context(), session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, s)
}

func (h *Handler) getExpSettings(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	s, err := h.expRepo.GetSettings(r.Context(), session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, s)
}

func (h *Handler) saveExpSettings(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.ExpenseSettings
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	req.CompanyID = session.CompanyID
	if err := h.expRepo.SaveSettings(r.Context(), &req); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	saved, _ := h.expRepo.GetSettings(r.Context(), session.CompanyID)
	JSON(w, http.StatusOK, saved)
}

// ==================== CATEGORIES ====================

func (h *Handler) getExpCategories(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ActiveOnly bool `json:"active_only"`
	}
	_ = Decode(r, &req)
	cats, err := h.expRepo.ListCategories(r.Context(), session.CompanyID, req.ActiveOnly)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if cats == nil {
		cats = []models.ExpenseCategory{}
	}
	JSON(w, http.StatusOK, cats)
}

func (h *Handler) createExpCategory(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.ExpenseCategory
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		Error(w, http.StatusBadRequest, "name is required")
		return
	}
	req.CompanyID = session.CompanyID
	req.IsActive = true
	id, err := h.expRepo.CreateCategory(r.Context(), &req)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	req.ID = id
	JSON(w, http.StatusCreated, req)
}

func (h *Handler) updateExpCategory(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.ExpenseCategory
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.ID == "" || strings.TrimSpace(req.Name) == "" {
		Error(w, http.StatusBadRequest, "id and name are required")
		return
	}
	req.CompanyID = session.CompanyID
	if err := h.expRepo.UpdateCategory(r.Context(), &req); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	JSON(w, http.StatusOK, req)
}

func (h *Handler) deleteExpCategory(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := h.expRepo.DeleteCategory(r.Context(), session.CompanyID, req.ID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"deleted": true})
}

// ==================== SCOPING ====================

// employeeForUser resolves the caller's own employee record. Empty when the
// login has no employee row (an external accountant, say) — such a user can
// administer claims if permitted but cannot file one.
func (h *Handler) employeeForUser(ctx context.Context, companyID, userID string) string {
	var id string
	_ = h.db.QueryRowContext(ctx,
		`SELECT id FROM employees WHERE user_id=? AND company_id=? AND is_deleted=0 LIMIT 1`,
		userID, companyID).Scan(&id)
	return id
}

// employeeScope decides which employee a caller may act as.
//
// Returns the employee id to use and whether the caller is acting in an
// administrative capacity. A user with expenses/view may pass any employee_id
// (or none, to see everyone); everyone else is silently pinned to their own
// record — the request's employee_id is not trusted.
func (h *Handler) employeeScope(ctx context.Context, session *models.UserSession, requested, fn string) (string, bool) {
	p := NewPermissions(session.Permissions, session.Role)
	if p.Can("expenses", fn) {
		return requested, true
	}
	return h.employeeForUser(ctx, session.CompanyID, session.UserID), false
}

// ownsClaim reports whether the caller may see/edit this specific claim.
func (h *Handler) ownsClaim(ctx context.Context, session *models.UserSession, c *models.ExpenseClaim) bool {
	p := NewPermissions(session.Permissions, session.Role)
	if p.Can("expenses", "view") {
		return true
	}
	return c.EmployeeID != "" && c.EmployeeID == h.employeeForUser(ctx, session.CompanyID, session.UserID)
}

// ==================== CLAIMS: READ ====================

func (h *Handler) getExpClaims(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		Status     string `json:"status"`
		EmployeeID string `json:"employee_id"`
		Limit      int    `json:"limit"`
	}
	_ = Decode(r, &req)

	empID, isAdmin := h.employeeScope(r.Context(), session, req.EmployeeID, "view")
	if !isAdmin && empID == "" {
		// No employee record and no view right: nothing to show, which is the
		// correct answer rather than an error.
		JSON(w, http.StatusOK, []models.ExpenseClaim{})
		return
	}
	claims, err := h.expRepo.List(r.Context(), session.CompanyID, req.Status, empID, req.Limit)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if claims == nil {
		claims = []models.ExpenseClaim{}
	}
	JSON(w, http.StatusOK, claims)
}

func (h *Handler) getExpClaim(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	c, err := h.expRepo.Get(r.Context(), session.CompanyID, req.ID)
	if err != nil {
		Error(w, http.StatusNotFound, "claim not found")
		return
	}
	if !h.ownsClaim(r.Context(), session, c) {
		Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	JSON(w, http.StatusOK, c)
}

// ==================== CLAIMS: WRITE ====================

type expClaimLineReq struct {
	ExpenseDate string  `json:"expense_date"`
	CategoryID  string  `json:"category_id"`
	AccountID   string  `json:"account_id"`
	Description string  `json:"description"`
	Merchant    string  `json:"merchant"`
	ReceiptNo   string  `json:"receipt_no"`
	Amount      float64 `json:"amount"`
	TaxAmount   float64 `json:"tax_amount"`
}

// resolveLines validates the submitted lines and freezes each one's GL account.
// The account comes from the line if given, otherwise from its category — and it
// is stored on the line rather than looked up later, so re-pointing a category
// at a different account never rewrites history.
func (h *Handler) resolveLines(ctx context.Context, companyID string, in []expClaimLineReq) ([]models.ExpenseClaimLine, error) {
	if len(in) == 0 {
		return nil, fmt.Errorf("a claim needs at least one expense line")
	}
	cats, err := h.expRepo.ListCategories(ctx, companyID, false)
	if err != nil {
		return nil, err
	}
	catAccount := map[string]string{}
	for _, c := range cats {
		catAccount[c.ID] = c.AccountID
	}

	out := make([]models.ExpenseClaimLine, 0, len(in))
	for i, l := range in {
		if strings.TrimSpace(l.Description) == "" {
			return nil, fmt.Errorf("line %d needs a description", i+1)
		}
		if l.ExpenseDate == "" {
			return nil, fmt.Errorf("line %d needs an expense date", i+1)
		}
		if l.Amount <= 0 {
			return nil, fmt.Errorf("line %d amount must be greater than zero", i+1)
		}
		if l.TaxAmount < 0 {
			return nil, fmt.Errorf("line %d tax cannot be negative", i+1)
		}
		account := l.AccountID
		if account == "" {
			account = catAccount[l.CategoryID]
		}
		if account == "" {
			return nil, fmt.Errorf("line %d has no expense account — pick a category that is mapped to one", i+1)
		}
		out = append(out, models.ExpenseClaimLine{
			ExpenseDate: l.ExpenseDate, CategoryID: l.CategoryID, AccountID: account,
			Description: l.Description, Merchant: l.Merchant, ReceiptNo: l.ReceiptNo,
			Amount: round2(l.Amount), TaxAmount: round2(l.TaxAmount), LineOrder: i,
		})
	}
	return out, nil
}

func (h *Handler) createExpClaim(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		EmployeeID    string            `json:"employee_id"`
		Title         string            `json:"title"`
		Purpose       string            `json:"purpose"`
		ClaimDate     string            `json:"claim_date"`
		PaymentMethod string            `json:"payment_method"`
		Notes         string            `json:"notes"`
		Lines         []expClaimLineReq `json:"lines"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	ctx := r.Context()

	// Filing on behalf of someone else needs the create right; otherwise the
	// claim is pinned to the caller no matter what employee_id they sent.
	empID, _ := h.employeeScope(ctx, session, req.EmployeeID, "create")
	if empID == "" {
		Error(w, http.StatusBadRequest, "your login is not linked to an employee record, so you cannot file a claim")
		return
	}
	if strings.TrimSpace(req.Title) == "" {
		Error(w, http.StatusBadRequest, "title is required")
		return
	}
	lines, err := h.resolveLines(ctx, session.CompanyID, req.Lines)
	if err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.ClaimDate == "" {
		req.ClaimDate = time.Now().Format("2006-01-02")
	}
	c := &models.ExpenseClaim{
		CompanyID: session.CompanyID, EmployeeID: empID, Title: req.Title, Purpose: req.Purpose,
		ClaimDate: req.ClaimDate, PaymentMethod: req.PaymentMethod, Notes: req.Notes, Lines: lines,
	}
	id, err := h.expRepo.Create(ctx, c)
	if err != nil {
		Error(w, http.StatusInternalServerError, "create claim: "+err.Error())
		return
	}
	saved, _ := h.expRepo.Get(ctx, session.CompanyID, id)
	JSON(w, http.StatusCreated, saved)
}

func (h *Handler) updateExpClaim(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID            string            `json:"id"`
		Title         string            `json:"title"`
		Purpose       string            `json:"purpose"`
		ClaimDate     string            `json:"claim_date"`
		PaymentMethod string            `json:"payment_method"`
		Notes         string            `json:"notes"`
		Lines         []expClaimLineReq `json:"lines"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	ctx := r.Context()
	existing, err := h.expRepo.Get(ctx, session.CompanyID, req.ID)
	if err != nil {
		Error(w, http.StatusNotFound, "claim not found")
		return
	}
	if !h.canEditClaim(ctx, session, existing) {
		Error(w, http.StatusForbidden, "you can only edit your own claims")
		return
	}
	lines, err := h.resolveLines(ctx, session.CompanyID, req.Lines)
	if err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	c := &models.ExpenseClaim{
		ID: req.ID, CompanyID: session.CompanyID, Title: req.Title, Purpose: req.Purpose,
		ClaimDate:     defaultIfEmpty(req.ClaimDate, existing.ClaimDate),
		PaymentMethod: req.PaymentMethod, Notes: req.Notes, Lines: lines,
	}
	if err := h.expRepo.Update(ctx, c); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	saved, _ := h.expRepo.Get(ctx, session.CompanyID, req.ID)
	JSON(w, http.StatusOK, saved)
}

// canEditClaim: an owner may edit their own claim, anyone with expenses/edit may
// edit any. The repo separately refuses to edit a claim past Draft/Rejected, so
// this only answers "whose claim is it".
func (h *Handler) canEditClaim(ctx context.Context, session *models.UserSession, c *models.ExpenseClaim) bool {
	p := NewPermissions(session.Permissions, session.Role)
	if p.Can("expenses", "edit") {
		return true
	}
	return c.EmployeeID == h.employeeForUser(ctx, session.CompanyID, session.UserID)
}

func (h *Handler) deleteExpClaim(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	ctx := r.Context()
	c, err := h.expRepo.Get(ctx, session.CompanyID, req.ID)
	if err != nil {
		Error(w, http.StatusNotFound, "claim not found")
		return
	}
	if !h.canEditClaim(ctx, session, c) {
		Error(w, http.StatusForbidden, "you can only delete your own claims")
		return
	}
	if err := h.expRepo.Delete(ctx, session.CompanyID, req.ID); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"deleted": true})
}

// ==================== LIFECYCLE ====================

func (h *Handler) submitExpClaim(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	ctx := r.Context()
	c, err := h.expRepo.Get(ctx, session.CompanyID, req.ID)
	if err != nil {
		Error(w, http.StatusNotFound, "claim not found")
		return
	}
	if !h.canEditClaim(ctx, session, c) {
		Error(w, http.StatusForbidden, "you can only submit your own claims")
		return
	}
	if len(c.Lines) == 0 {
		Error(w, http.StatusBadRequest, "add at least one expense line before submitting")
		return
	}
	settings, _ := h.expRepo.GetSettings(ctx, session.CompanyID)
	if settings != nil && settings.RequireReceipt && c.ReceiptCount == 0 {
		Error(w, http.StatusBadRequest, "company policy requires a receipt attachment on every claim")
		return
	}
	if err := h.expRepo.Submit(ctx, session.CompanyID, req.ID, session.UserID); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}

	// Tell whoever can approve. Both channels: in-app for everyone, email for
	// those whose login has a readable address.
	body := fmt.Sprintf("%s submitted expense claim #%d (%s) for %s.",
		c.EmployeeName, c.ClaimNumber, c.Title, formatPeso(c.TotalAmount))
	approvers := h.notifyPermissionHolders(ctx, session.CompanyID, "expenses", "approve", models.Notification{
		Type: "expense_submitted", Severity: "info",
		Title: "Expense claim awaiting approval",
		Body:  body, Link: "/expenses/claims", EntityType: "expense_claim", EntityID: c.ID,
	})
	for uid, email := range h.notifRepo.EmailsForUsers(ctx, approvers) {
		_ = uid
		h.queueEmail(ctx, session.CompanyID, email, "", "Expense claim awaiting approval", body,
			"expense_claim", c.ID, session.UserID)
	}

	saved, _ := h.expRepo.Get(ctx, session.CompanyID, req.ID)
	JSON(w, http.StatusOK, saved)
}

// approveExpClaim posts the accrual and marks the claim Approved.
//
// ORDER: the journal is posted BEFORE the status flips, then the status update
// is the guarded write that can still fail on a race (two approvers clicking at
// once). If it does, the journal we just posted is voided again — better a
// voided entry in the audit trail than an accrual with no claim behind it.
func (h *Handler) approveExpClaim(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	ctx := r.Context()
	c, err := h.expRepo.Get(ctx, session.CompanyID, req.ID)
	if err != nil {
		Error(w, http.StatusNotFound, "claim not found")
		return
	}
	if c.Status != repository.ClaimSubmitted {
		Error(w, http.StatusBadRequest, "only a submitted claim can be approved")
		return
	}
	settings, err := h.expRepo.GetSettings(ctx, session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if settings.EmployeePayableAccountID == "" {
		Error(w, http.StatusBadRequest, "set the employee reimbursements payable account in Expenses > Settings before approving")
		return
	}

	journalID, err := h.postExpenseAccrual(ctx, session, c, settings)
	if err != nil {
		Error(w, http.StatusBadRequest, "post accrual: "+err.Error())
		return
	}
	if err := h.expRepo.Approve(ctx, session.CompanyID, c.ID, session.UserID, journalID); err != nil {
		// Compensate: undo the ledger effect of an approval that did not stick.
		if journalID != "" {
			_ = h.acctRepo.VoidJournalEntry(journalID, session.CompanyID, session.UserID,
				"Approval of expense claim #"+fmt.Sprint(c.ClaimNumber)+" did not complete")
		}
		Error(w, http.StatusBadRequest, err.Error())
		return
	}

	h.notifyClaimant(ctx, session, c, "expense_approved", "success",
		fmt.Sprintf("Expense claim #%d approved", c.ClaimNumber),
		fmt.Sprintf("Your claim %q for %s was approved and is now awaiting payment.", c.Title, formatPeso(c.TotalAmount)))

	saved, _ := h.expRepo.Get(ctx, session.CompanyID, c.ID)
	JSON(w, http.StatusOK, saved)
}

// postExpenseAccrual writes the approval journal:
//
//	Dr  each line's expense account      (line.amount)
//	Dr  input VAT account                (total tax, when any line splits it out)
//	    Cr  employee reimbursements payable   (claim total)
//
// Lines hitting the same account are merged so the entry reads as an accountant
// would write it rather than as a transcript of the claim form.
func (h *Handler) postExpenseAccrual(ctx context.Context, session *models.UserSession, c *models.ExpenseClaim, s *models.ExpenseSettings) (string, error) {
	if c.TotalAmount <= 0 {
		return "", fmt.Errorf("claim total must be greater than zero")
	}
	byAccount := map[string]float64{}
	order := []string{}
	for _, l := range c.Lines {
		if _, seen := byAccount[l.AccountID]; !seen {
			order = append(order, l.AccountID)
		}
		byAccount[l.AccountID] = round2(byAccount[l.AccountID] + l.Amount)
	}
	if c.TaxTotal > 0 && s.TaxInputAccountID == "" {
		// Without an input-VAT account the tax has nowhere to go, and silently
		// folding it into expense would misstate creditable input tax.
		return "", fmt.Errorf("this claim has input VAT — set the input tax account in Expenses > Settings")
	}

	entryNum, _ := h.acctRepo.NextEntryNumber(session.CompanyID)
	entryID := uuid.New().String()
	memo := fmt.Sprintf("Expense claim #%d — %s (%s)", c.ClaimNumber, c.Title, c.EmployeeName)

	if err := h.acctRepo.CreateJournalEntry(entryID, session.CompanyID, entryNum, c.ClaimDate, memo,
		"expense_claim", c.ID, "Draft"); err != nil {
		return "", err
	}
	i := 0
	for _, acct := range order {
		if err := h.acctRepo.AddJournalLine(entryID, session.CompanyID, acct, c.Title, byAccount[acct], 0, i); err != nil {
			return "", err
		}
		i++
	}
	if c.TaxTotal > 0 {
		if err := h.acctRepo.AddJournalLine(entryID, session.CompanyID, s.TaxInputAccountID,
			"Input VAT on claim #"+fmt.Sprint(c.ClaimNumber), round2(c.TaxTotal), 0, i); err != nil {
			return "", err
		}
		i++
	}
	if err := h.acctRepo.AddJournalLine(entryID, session.CompanyID, s.EmployeePayableAccountID,
		"Payable to "+c.EmployeeName, 0, round2(c.TotalAmount), i); err != nil {
		return "", err
	}
	if err := h.acctRepo.UpdateJournalTotals(entryID, session.CompanyID); err != nil {
		return "", err
	}
	if s.AutoPostGL {
		// Guarded post: a claim dated inside a closed period is refused here,
		// which is exactly the behaviour migration 020 exists to produce.
		//
		// postOrDiscard drops the draft if the period guard refuses it.
		if err := h.postOrDiscard(entryID, session.CompanyID, session.UserID); err != nil {
			return "", err
		}
	}
	return entryID, nil
}

func (h *Handler) rejectExpClaim(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID     string `json:"id"`
		Reason string `json:"reason"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	ctx := r.Context()
	c, err := h.expRepo.Get(ctx, session.CompanyID, req.ID)
	if err != nil {
		Error(w, http.StatusNotFound, "claim not found")
		return
	}
	if err := h.expRepo.Reject(ctx, session.CompanyID, req.ID, session.UserID, req.Reason); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	reason := req.Reason
	if reason == "" {
		reason = "No reason given."
	}
	h.notifyClaimant(ctx, session, c, "expense_rejected", "warning",
		fmt.Sprintf("Expense claim #%d returned", c.ClaimNumber),
		fmt.Sprintf("Your claim %q was returned. Reason: %s You can edit and resubmit it.", c.Title, reason))

	saved, _ := h.expRepo.Get(ctx, session.CompanyID, req.ID)
	JSON(w, http.StatusOK, saved)
}

// unapproveExpClaim walks an approved claim back to Submitted, voiding the
// accrual so the liability does not linger.
func (h *Handler) unapproveExpClaim(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID     string `json:"id"`
		Reason string `json:"reason"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	ctx := r.Context()
	c, err := h.expRepo.Get(ctx, session.CompanyID, req.ID)
	if err != nil {
		Error(w, http.StatusNotFound, "claim not found")
		return
	}
	if c.AccrualJournalID != "" {
		reason := defaultIfEmpty(req.Reason, fmt.Sprintf("Expense claim #%d un-approved", c.ClaimNumber))
		if err := h.acctRepo.VoidJournalEntry(c.AccrualJournalID, session.CompanyID, session.UserID, reason); err != nil {
			Error(w, http.StatusBadRequest, "void accrual: "+err.Error())
			return
		}
	}
	if err := h.expRepo.Unapprove(ctx, session.CompanyID, req.ID); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	saved, _ := h.expRepo.Get(ctx, session.CompanyID, req.ID)
	JSON(w, http.StatusOK, saved)
}

// payExpClaim settles the liability against cash or bank.
func (h *Handler) payExpClaim(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID          string `json:"id"`
		PaymentDate string `json:"payment_date"`
		AccountID   string `json:"account_id"`
		Reference   string `json:"reference"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	ctx := r.Context()
	c, err := h.expRepo.Get(ctx, session.CompanyID, req.ID)
	if err != nil {
		Error(w, http.StatusNotFound, "claim not found")
		return
	}
	if c.Status != repository.ClaimApproved {
		Error(w, http.StatusBadRequest, "only an approved claim can be paid")
		return
	}
	settings, err := h.expRepo.GetSettings(ctx, session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if settings.EmployeePayableAccountID == "" {
		Error(w, http.StatusBadRequest, "set the employee reimbursements payable account in Expenses > Settings")
		return
	}
	payAccount := defaultIfEmpty(req.AccountID, settings.DefaultCashAccountID)
	if payAccount == "" {
		Error(w, http.StatusBadRequest, "choose the cash or bank account this was paid from")
		return
	}
	payDate := defaultIfEmpty(req.PaymentDate, time.Now().Format("2006-01-02"))

	journalID, err := h.postExpensePayment(session, c, settings.EmployeePayableAccountID, payAccount, payDate, settings.AutoPostGL)
	if err != nil {
		Error(w, http.StatusBadRequest, "post payment: "+err.Error())
		return
	}
	if err := h.expRepo.MarkPaid(ctx, session.CompanyID, c.ID, session.UserID, req.Reference, payAccount, journalID); err != nil {
		if journalID != "" {
			_ = h.acctRepo.VoidJournalEntry(journalID, session.CompanyID, session.UserID,
				"Payment of expense claim #"+fmt.Sprint(c.ClaimNumber)+" did not complete")
		}
		Error(w, http.StatusBadRequest, err.Error())
		return
	}

	h.notifyClaimant(ctx, session, c, "expense_paid", "success",
		fmt.Sprintf("Expense claim #%d paid", c.ClaimNumber),
		fmt.Sprintf("%s for %q was paid on %s.", formatPeso(c.TotalAmount), c.Title, payDate))

	saved, _ := h.expRepo.Get(ctx, session.CompanyID, c.ID)
	JSON(w, http.StatusOK, saved)
}

// postExpensePayment writes the settlement journal:
//
//	Dr  employee reimbursements payable  (claim total)
//	    Cr  cash / bank                       (claim total)
func (h *Handler) postExpensePayment(session *models.UserSession, c *models.ExpenseClaim, payableAccount, cashAccount, date string, autoPost bool) (string, error) {
	amount := round2(c.TotalAmount)
	if amount <= 0 {
		return "", fmt.Errorf("nothing to pay")
	}
	entryNum, _ := h.acctRepo.NextEntryNumber(session.CompanyID)
	entryID := uuid.New().String()
	memo := fmt.Sprintf("Reimbursement of expense claim #%d — %s", c.ClaimNumber, c.EmployeeName)

	if err := h.acctRepo.CreateJournalEntry(entryID, session.CompanyID, entryNum, date, memo,
		"expense_payment", c.ID, "Draft"); err != nil {
		return "", err
	}
	if err := h.acctRepo.AddJournalLine(entryID, session.CompanyID, payableAccount, "Settle payable to "+c.EmployeeName, amount, 0, 0); err != nil {
		return "", err
	}
	if err := h.acctRepo.AddJournalLine(entryID, session.CompanyID, cashAccount, "Reimbursement paid", 0, amount, 1); err != nil {
		return "", err
	}
	if err := h.acctRepo.UpdateJournalTotals(entryID, session.CompanyID); err != nil {
		return "", err
	}
	if autoPost {
		if err := h.postOrDiscard(entryID, session.CompanyID, session.UserID); err != nil {
			return "", err
		}
	}
	return entryID, nil
}

func (h *Handler) unpayExpClaim(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID     string `json:"id"`
		Reason string `json:"reason"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	ctx := r.Context()
	c, err := h.expRepo.Get(ctx, session.CompanyID, req.ID)
	if err != nil {
		Error(w, http.StatusNotFound, "claim not found")
		return
	}
	if c.PaymentJournalID != "" {
		reason := defaultIfEmpty(req.Reason, fmt.Sprintf("Payment of expense claim #%d reversed", c.ClaimNumber))
		if err := h.acctRepo.VoidJournalEntry(c.PaymentJournalID, session.CompanyID, session.UserID, reason); err != nil {
			Error(w, http.StatusBadRequest, "void payment: "+err.Error())
			return
		}
	}
	if err := h.expRepo.Unpay(ctx, session.CompanyID, req.ID); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	saved, _ := h.expRepo.Get(ctx, session.CompanyID, req.ID)
	JSON(w, http.StatusOK, saved)
}

func (h *Handler) cancelExpClaim(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	ctx := r.Context()
	c, err := h.expRepo.Get(ctx, session.CompanyID, req.ID)
	if err != nil {
		Error(w, http.StatusNotFound, "claim not found")
		return
	}
	if !h.canEditClaim(ctx, session, c) {
		Error(w, http.StatusForbidden, "you can only cancel your own claims")
		return
	}
	if err := h.expRepo.Cancel(ctx, session.CompanyID, req.ID); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	saved, _ := h.expRepo.Get(ctx, session.CompanyID, req.ID)
	JSON(w, http.StatusOK, saved)
}

// notifyClaimant tells the employee behind a claim what happened to it, in-app
// always and by email when their login has a readable address.
func (h *Handler) notifyClaimant(ctx context.Context, session *models.UserSession, c *models.ExpenseClaim, typ, severity, title, body string) {
	userID, email, _ := h.notifRepo.UserForEmployee(ctx, session.CompanyID, c.EmployeeID)
	h.notifyUser(ctx, session.CompanyID, userID, models.Notification{
		Type: typ, Severity: severity, Title: title, Body: body,
		Link: "/expenses/claims", EntityType: "expense_claim", EntityID: c.ID,
	})
	h.queueEmail(ctx, session.CompanyID, email, c.EmployeeName, title, body, "expense_claim", c.ID, session.UserID)
}

// ==================== RECEIPTS ====================

func (h *Handler) uploadExpReceipt(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ClaimID  string `json:"claim_id"`
		LineID   string `json:"line_id"`
		FileName string `json:"file_name"`
		MimeType string `json:"mime_type"`
		FileData string `json:"file_data"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.ClaimID == "" || req.FileName == "" || req.FileData == "" {
		Error(w, http.StatusBadRequest, "claim_id, file_name and file_data are required")
		return
	}
	ctx := r.Context()
	c, err := h.expRepo.Get(ctx, session.CompanyID, req.ClaimID)
	if err != nil {
		Error(w, http.StatusNotFound, "claim not found")
		return
	}
	if !h.canEditClaim(ctx, session, c) {
		Error(w, http.StatusForbidden, "you can only attach receipts to your own claims")
		return
	}

	// file_data arrives base64, optionally with the browser's data: URL prefix.
	b64 := req.FileData
	if i := strings.Index(b64, "base64,"); i != -1 {
		b64 = b64[i+len("base64,"):]
	}
	data, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		Error(w, http.StatusBadRequest, "file_data must be base64")
		return
	}
	if len(data) == 0 {
		Error(w, http.StatusBadRequest, "empty file")
		return
	}
	if len(data) > maxReceiptUpload {
		Error(w, http.StatusRequestEntityTooLarge, "receipt exceeds the 10 MB limit")
		return
	}

	rc := &models.ExpenseReceipt{
		CompanyID: session.CompanyID, ClaimID: req.ClaimID, LineID: req.LineID,
		FileName: req.FileName, MimeType: defaultIfEmpty(req.MimeType, "application/octet-stream"),
		UploadedBy: session.UserID, UploadedByName: session.Username,
	}
	id, err := h.expRepo.AddReceipt(ctx, rc, data)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	rc.ID, rc.FileSize = id, len(data)
	JSON(w, http.StatusCreated, rc)
}

func (h *Handler) getExpReceipts(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ClaimID string `json:"claim_id"`
	}
	if err := Decode(r, &req); err != nil || req.ClaimID == "" {
		Error(w, http.StatusBadRequest, "claim_id required")
		return
	}
	ctx := r.Context()
	c, err := h.expRepo.Get(ctx, session.CompanyID, req.ClaimID)
	if err != nil {
		Error(w, http.StatusNotFound, "claim not found")
		return
	}
	if !h.ownsClaim(ctx, session, c) {
		Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	JSON(w, http.StatusOK, c.Receipts)
}

// downloadExpReceipt returns the file as base64 in JSON, matching how the
// onboarding module ships documents to the browser.
func (h *Handler) downloadExpReceipt(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id required")
		return
	}
	ctx := r.Context()
	rc, data, err := h.expRepo.GetReceiptData(ctx, session.CompanyID, req.ID)
	if err != nil {
		Error(w, http.StatusNotFound, err.Error())
		return
	}
	// Re-check ownership against the parent claim: a receipt id must not be a
	// way around the claim-level access rule.
	c, err := h.expRepo.Get(ctx, session.CompanyID, rc.ClaimID)
	if err != nil || !h.ownsClaim(ctx, session, c) {
		Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	JSON(w, http.StatusOK, map[string]interface{}{
		"id": rc.ID, "file_name": rc.FileName, "mime_type": rc.MimeType,
		"file_size": rc.FileSize, "file_data": base64.StdEncoding.EncodeToString(data),
	})
}

func (h *Handler) deleteExpReceipt(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id required")
		return
	}
	ctx := r.Context()
	rc, _, err := h.expRepo.GetReceiptData(ctx, session.CompanyID, req.ID)
	if err != nil {
		Error(w, http.StatusNotFound, err.Error())
		return
	}
	c, err := h.expRepo.Get(ctx, session.CompanyID, rc.ClaimID)
	if err != nil || !h.canEditClaim(ctx, session, c) {
		Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	if err := h.expRepo.DeleteReceipt(ctx, session.CompanyID, req.ID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"deleted": true})
}

func defaultIfEmpty(s, fallback string) string {
	if strings.TrimSpace(s) == "" {
		return fallback
	}
	return s
}
