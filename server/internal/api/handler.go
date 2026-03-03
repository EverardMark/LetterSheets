package api

import (
	"fmt"
	"net/http"
	"time"

	"lettersheets/internal/config"
	"lettersheets/internal/models"
	"lettersheets/internal/repository"

	"github.com/google/uuid"
	"golang.org/x/crypto/argon2"
)

type Handler struct {
	regRepo      *repository.RegistrationRepo
	companyRepo  *repository.CompanyRepo
	userRepo     *repository.UserRepo
	accessRepo   *repository.AccessRepo
	sessionRepo  *repository.SessionRepo
	historyRepo  *repository.ChangeHistoryRepo
	benefitRepo  *repository.BenefitRepo
	employeeRepo *repository.EmployeeRepo
	deptRepo     *repository.DepartmentRepo
	posRepo      *repository.PositionRepo
	attendRepo   *repository.AttendanceRepo
	leaveRepo    *repository.LeaveRepo
	payrollRepo  *repository.PayrollRepo
	onbRepo      *repository.OnboardingRepo
	loanRepo     *repository.LoanRepo
	acctRepo     *repository.AccountingRepo
	apRepo       *repository.APRepo
	arRepo       *repository.ARRepo
	taxRepo      *repository.TaxRepo
	bankRepo     *repository.BankRepo
	reportsRepo  *repository.ReportsRepo
	ticketRepo   *repository.TicketRepo
	schedRepo    *repository.WorkScheduleRepo
	cfg          *config.AppConfig
}

func NewHandler(
	regRepo *repository.RegistrationRepo,
	companyRepo *repository.CompanyRepo,
	userRepo *repository.UserRepo,
	accessRepo *repository.AccessRepo,
	sessionRepo *repository.SessionRepo,
	historyRepo *repository.ChangeHistoryRepo,
	benefitRepo *repository.BenefitRepo,
	employeeRepo *repository.EmployeeRepo,
	deptRepo *repository.DepartmentRepo,
	posRepo *repository.PositionRepo,
	attendRepo *repository.AttendanceRepo,
	leaveRepo *repository.LeaveRepo,
	payrollRepo *repository.PayrollRepo,
	onbRepo *repository.OnboardingRepo,
	loanRepo *repository.LoanRepo,
	acctRepo *repository.AccountingRepo,
	apRepo *repository.APRepo,
	arRepo *repository.ARRepo,
	taxRepo *repository.TaxRepo,
	bankRepo *repository.BankRepo,
	reportsRepo *repository.ReportsRepo,
	ticketRepo *repository.TicketRepo,
	schedRepo *repository.WorkScheduleRepo,
	cfg *config.AppConfig,
) *Handler {
	return &Handler{
		regRepo:      regRepo,
		companyRepo:  companyRepo,
		userRepo:     userRepo,
		accessRepo:   accessRepo,
		sessionRepo:  sessionRepo,
		historyRepo:  historyRepo,
		benefitRepo:  benefitRepo,
		employeeRepo: employeeRepo,
		deptRepo:     deptRepo,
		posRepo:      posRepo,
		attendRepo:   attendRepo,
		leaveRepo:    leaveRepo,
		payrollRepo:  payrollRepo,
		onbRepo:      onbRepo,
		loanRepo:     loanRepo,
		acctRepo:     acctRepo,
		apRepo:       apRepo,
		arRepo:       arRepo,
		taxRepo:      taxRepo,
		bankRepo:     bankRepo,
		reportsRepo:  reportsRepo,
		ticketRepo:   ticketRepo,
		schedRepo:    schedRepo,
		cfg:          cfg,
	}
}

// POST /api/execute?action=xxx
func (h *Handler) Execute(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		Error(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	action := r.URL.Query().Get("action")
	if action == "" {
		Error(w, http.StatusBadRequest, "action parameter is required")
		return
	}

	switch action {

	// ==================== PUBLIC ====================

	case "register":
		h.register(w, r)

	case "login":
		h.login(w, r)

	case "select_company":
		h.selectCompany(w, r)

	case "health":
		JSON(w, http.StatusOK, map[string]string{"status": "ok"})

	// ==================== PROTECTED ====================

	case "logout":
		h.withAuth(w, r, h.logout)

	case "logout_all":
		h.withAuth(w, r, h.logoutAll)

	// Company
	case "get_company":
		h.withAuth(w, r, h.getCompany)

	case "update_company":
		h.withAuth(w, r, h.updateCompany)

	case "delete_company":
		h.withAuth(w, r, h.deleteCompany)

	// User
	case "get_user":
		h.withAuth(w, r, h.getUser)

	case "update_user":
		h.withAuth(w, r, h.updateUser)

	case "change_password":
		h.withAuth(w, r, h.changePassword)

	case "delete_user":
		h.withAuth(w, r, h.deleteUser)

	case "list_users":
		h.withAuth(w, r, h.listUsers)

	case "create_user":
		h.withAuth(w, r, h.createUser)

	// Access
	case "get_user_companies":
		h.withAuth(w, r, h.getUserCompanies)

	case "update_user_access":
		h.withAuth(w, r, h.updateUserAccess)

	case "revoke_user_access":
		h.withAuth(w, r, h.revokeUserAccess)

	// History
	case "get_history":
		h.withAuth(w, r, h.getHistory)

	case "reset_password":
		h.resetPassword(w, r)

	// Benefits
	case "get_benefits":
		h.withAuth(w, r, h.getBenefits)

	case "create_benefit":
		h.withAuth(w, r, h.createBenefit)

	case "update_benefit":
		h.withAuth(w, r, h.updateBenefit)

	case "delete_benefit":
		h.withAuth(w, r, h.deleteBenefit)

	// Employees
	case "get_employees":
		h.withAuth(w, r, h.getEmployees)

	case "get_employee":
		h.withAuth(w, r, h.getEmployee)

	case "create_employee":
		h.withAuth(w, r, h.createEmployee)

	case "update_employee":
		h.withAuth(w, r, h.updateEmployee)

	case "delete_employee":
		h.withAuth(w, r, h.deleteEmployee)

	// Departments
	case "get_departments":
		h.withAuth(w, r, h.getDepartments)

	case "create_department":
		h.withAuth(w, r, h.createDepartment)

	case "update_department":
		h.withAuth(w, r, h.updateDepartment)

	case "delete_department":
		h.withAuth(w, r, h.deleteDepartment)

	// Positions
	case "get_positions":
		h.withAuth(w, r, h.getPositions)

	case "create_position":
		h.withAuth(w, r, h.createPosition)

	case "update_position":
		h.withAuth(w, r, h.updatePosition)

	case "delete_position":
		h.withAuth(w, r, h.deletePosition)

	// Attendance
	case "get_attendance":
		h.withAuth(w, r, h.getAttendance)

	case "clock_in":
		h.withAuth(w, r, h.clockIn)

	case "clock_out":
		h.withAuth(w, r, h.clockOut)

	case "create_attendance":
		h.withAuth(w, r, h.createAttendance)

	case "update_attendance":
		h.withAuth(w, r, h.updateAttendance)

	case "delete_attendance":
		h.withAuth(w, r, h.deleteAttendance)

	// Leaves
	case "get_leaves":
		h.withAuth(w, r, h.getLeaves)

	case "create_leave":
		h.withAuth(w, r, h.createLeave)

	case "update_leave":
		h.withAuth(w, r, h.updateLeave)

	case "approve_leave":
		h.withAuth(w, r, h.approveLeave)

	case "delete_leave":
		h.withAuth(w, r, h.deleteLeave)

	// Payroll
	case "get_payroll_settings":
		h.withAuth(w, r, h.getPayrollSettings)

	case "save_payroll_settings":
		h.withAuth(w, r, h.savePayrollSettings)

	case "get_payroll_runs":
		h.withAuth(w, r, h.getPayrollRuns)

	case "get_payroll_run":
		h.withAuth(w, r, h.getPayrollRun)

	case "create_payroll_run":
		h.withAuth(w, r, h.createPayrollRun)

	case "update_payroll_run":
		h.withAuth(w, r, h.updatePayrollRun)

	case "delete_payroll_run":
		h.withAuth(w, r, h.deletePayrollRun)

	case "get_payroll_items":
		h.withAuth(w, r, h.getPayrollItems)

	case "save_payroll_item":
		h.withAuth(w, r, h.savePayrollItem)

	// Onboarding
	case "get_onboarding_templates":
		h.withAuth(w, r, h.getOnboardingTemplates)
	case "create_onboarding_template":
		h.withAuth(w, r, h.createOnboardingTemplate)
	case "update_onboarding_template":
		h.withAuth(w, r, h.updateOnboardingTemplate)
	case "delete_onboarding_template":
		h.withAuth(w, r, h.deleteOnboardingTemplate)
	case "get_template_items":
		h.withAuth(w, r, h.getTemplateItems)
	case "save_template_item":
		h.withAuth(w, r, h.saveTemplateItem)
	case "delete_template_item":
		h.withAuth(w, r, h.deleteTemplateItem)
	case "get_onboarding_checklists":
		h.withAuth(w, r, h.getOnboardingChecklists)
	case "create_onboarding_checklist":
		h.withAuth(w, r, h.createOnboardingChecklist)
	case "update_onboarding_status":
		h.withAuth(w, r, h.updateOnboardingStatus)
	case "delete_onboarding_checklist":
		h.withAuth(w, r, h.deleteOnboardingChecklist)
	case "get_onboarding_items":
		h.withAuth(w, r, h.getOnboardingItems)
	case "toggle_onboarding_item":
		h.withAuth(w, r, h.toggleOnboardingItem)
	case "add_onboarding_item":
		h.withAuth(w, r, h.addOnboardingItem)
	case "delete_onboarding_item":
		h.withAuth(w, r, h.deleteOnboardingItem)

	// Loans
	case "get_loan_types":
		h.withAuth(w, r, h.getLoanTypes)
	case "create_loan_type":
		h.withAuth(w, r, h.createLoanType)
	case "update_loan_type":
		h.withAuth(w, r, h.updateLoanType)
	case "delete_loan_type":
		h.withAuth(w, r, h.deleteLoanType)
	case "get_loans":
		h.withAuth(w, r, h.getLoans)
	case "get_loan":
		h.withAuth(w, r, h.getLoan)
	case "create_loan":
		h.withAuth(w, r, h.createLoan)
	case "approve_loan":
		h.withAuth(w, r, h.approveLoan)
	case "reject_loan":
		h.withAuth(w, r, h.rejectLoan)
	case "cancel_loan":
		h.withAuth(w, r, h.cancelLoan)
	case "delete_loan":
		h.withAuth(w, r, h.deleteLoan)
	case "get_loan_payments":
		h.withAuth(w, r, h.getLoanPayments)
	case "record_loan_payment":
		h.withAuth(w, r, h.recordLoanPayment)
	case "delete_loan_payment":
		h.withAuth(w, r, h.deleteLoanPayment)

	// Accounting - Chart of Accounts
	case "get_accounts":
		h.withAuth(w, r, h.getAccounts)
	case "get_account":
		h.withAuth(w, r, h.getAccount)
	case "create_account":
		h.withAuth(w, r, h.createAccount)
	case "update_account":
		h.withAuth(w, r, h.updateAccount)
	case "delete_account":
		h.withAuth(w, r, h.deleteAccount)
	case "get_account_tree":
		h.withAuth(w, r, h.getAccountTree)
	case "toggle_account_active":
		h.withAuth(w, r, h.toggleAccountActive)
	case "check_account_code":
		h.withAuth(w, r, h.checkAccountCode)

	// Accounting - COA Templates
	case "get_coa_templates":
		h.withAuth(w, r, h.getCOATemplates)
	case "get_coa_template_items":
		h.withAuth(w, r, h.getCOATemplateItems)
	case "create_coa_template":
		h.withAuth(w, r, h.createCOATemplate)
	case "update_coa_template":
		h.withAuth(w, r, h.updateCOATemplate)
	case "delete_coa_template":
		h.withAuth(w, r, h.deleteCOATemplate)
	case "create_coa_template_item":
		h.withAuth(w, r, h.createCOATemplateItem)
	case "update_coa_template_item":
		h.withAuth(w, r, h.updateCOATemplateItem)
	case "delete_coa_template_item":
		h.withAuth(w, r, h.deleteCOATemplateItem)
	case "duplicate_coa_template":
		h.withAuth(w, r, h.duplicateCOATemplate)
	case "apply_coa_template":
		h.withAuth(w, r, h.applyCOATemplate)

	// --- Journal Entries ---
	case "next_entry_number":
		h.withAuth(w, r, h.nextEntryNumber)
	case "create_journal_entry":
		h.withAuth(w, r, h.createJournalEntry)
	case "get_journal_entries":
		h.withAuth(w, r, h.getJournalEntries)
	case "get_journal_entry":
		h.withAuth(w, r, h.getJournalEntry)
	case "get_journal_lines":
		h.withAuth(w, r, h.getJournalLines)
	case "update_journal_entry":
		h.withAuth(w, r, h.updateJournalEntry)
	case "delete_journal_entry":
		h.withAuth(w, r, h.deleteJournalEntry)
	case "post_journal_entry":
		h.withAuth(w, r, h.postJournalEntry)
	case "void_journal_entry":
		h.withAuth(w, r, h.voidJournalEntry)

	// --- Account Mappings ---
	case "get_account_mappings":
		h.withAuth(w, r, h.getAccountMappings)
	case "upsert_account_mapping":
		h.withAuth(w, r, h.upsertAccountMapping)
	case "delete_account_mapping":
		h.withAuth(w, r, h.deleteAccountMapping)
	case "auto_map_payroll_accounts":
		h.withAuth(w, r, h.autoMapPayrollAccounts)

	// --- Payroll -> Journal ---
	case "get_payroll_run_totals":
		h.withAuth(w, r, h.getPayrollRunTotals)
	case "generate_payroll_journal":
		h.withAuth(w, r, h.generatePayrollJournal)

	// --- General Ledger ---
	case "get_trial_balance":
		h.withAuth(w, r, h.getTrialBalance)
	case "get_account_ledger":
		h.withAuth(w, r, h.getAccountLedger)
	case "get_ledger_summary":
		h.withAuth(w, r, h.getLedgerSummary)

	// --- Accounts Payable ---
	case "get_vendors":
		h.withAuth(w, r, h.getVendors)
	case "get_vendor":
		h.withAuth(w, r, h.getVendor)
	case "create_vendor":
		h.withAuth(w, r, h.createVendor)
	case "update_vendor":
		h.withAuth(w, r, h.updateVendor)
	case "delete_vendor":
		h.withAuth(w, r, h.deleteVendor)
	case "toggle_vendor_active":
		h.withAuth(w, r, h.toggleVendorActive)
	case "get_bills":
		h.withAuth(w, r, h.getBills)
	case "get_bill":
		h.withAuth(w, r, h.getBill)
	case "create_bill":
		h.withAuth(w, r, h.createBill)
	case "update_bill":
		h.withAuth(w, r, h.updateBill)
	case "delete_bill":
		h.withAuth(w, r, h.deleteBill)
	case "approve_bill":
		h.withAuth(w, r, h.approveBill)
	case "void_bill":
		h.withAuth(w, r, h.voidBill)
	case "get_bill_items":
		h.withAuth(w, r, h.getBillItems)
	case "create_bill_payment":
		h.withAuth(w, r, h.createBillPayment)
	case "get_bill_payments":
		h.withAuth(w, r, h.getBillPayments)
	case "delete_bill_payment":
		h.withAuth(w, r, h.deleteBillPayment)
	case "get_ap_aging":
		h.withAuth(w, r, h.getAPAging)
	case "get_ap_summary":
		h.withAuth(w, r, h.getAPSummary)

	// --- Accounts Receivable ---
	case "get_customers":
		h.withAuth(w, r, h.getCustomers)
	case "create_customer":
		h.withAuth(w, r, h.createCustomer)
	case "update_customer":
		h.withAuth(w, r, h.updateCustomer)
	case "delete_customer":
		h.withAuth(w, r, h.deleteCustomer)
	case "toggle_customer_active":
		h.withAuth(w, r, h.toggleCustomerActive)
	case "get_invoices":
		h.withAuth(w, r, h.getInvoices)
	case "get_invoice":
		h.withAuth(w, r, h.getInvoice)
	case "create_invoice":
		h.withAuth(w, r, h.createInvoice)
	case "update_invoice":
		h.withAuth(w, r, h.updateInvoice)
	case "delete_invoice":
		h.withAuth(w, r, h.deleteInvoice)
	case "send_invoice":
		h.withAuth(w, r, h.sendInvoice)
	case "void_invoice":
		h.withAuth(w, r, h.voidInvoice)
	case "create_invoice_payment":
		h.withAuth(w, r, h.createInvoicePayment)
	case "get_invoice_payments":
		h.withAuth(w, r, h.getInvoicePayments)
	case "delete_invoice_payment":
		h.withAuth(w, r, h.deleteInvoicePayment)
	case "get_ar_aging":
		h.withAuth(w, r, h.getARAging)
	case "get_ar_summary":
		h.withAuth(w, r, h.getARSummary)

	// --- Tax Management ---
	case "get_tax_summary":
		h.withAuth(w, r, h.getTaxSummary)
	case "get_tax_detail":
		h.withAuth(w, r, h.getTaxDetail)
	case "get_vat_computation":
		h.withAuth(w, r, h.getVATComputation)

	// --- Bank Reconciliation ---
	case "get_bank_accounts":
		h.withAuth(w, r, h.getBankAccounts)
	case "get_bank_transactions":
		h.withAuth(w, r, h.getBankTransactions)
	case "create_bank_transaction":
		h.withAuth(w, r, h.createBankTransaction)
	case "reconcile_transaction":
		h.withAuth(w, r, h.reconcileTransaction)
	case "unreconcile_transaction":
		h.withAuth(w, r, h.unreconcileTransaction)
	case "delete_bank_transaction":
		h.withAuth(w, r, h.deleteBankTransaction)
	case "get_recon_summary":
		h.withAuth(w, r, h.getReconSummary)
	case "get_unmatched_journal_lines":
		h.withAuth(w, r, h.getUnmatchedJournalLines)

	// --- Financial Reports ---
	case "get_income_statement":
		h.withAuth(w, r, h.getIncomeStatement)
	case "get_balance_sheet":
		h.withAuth(w, r, h.getBalanceSheet)
	case "get_cash_flow":
		h.withAuth(w, r, h.getCashFlow)
	case "get_ticket_categories":
		h.withAuth(w, r, h.getTicketCategories)
	case "create_ticket_category":
		h.withAuth(w, r, h.createTicketCategory)
	case "update_ticket_category":
		h.withAuth(w, r, h.updateTicketCategory)
	case "delete_ticket_category":
		h.withAuth(w, r, h.deleteTicketCategory)
	case "seed_ticket_categories":
		h.withAuth(w, r, h.seedTicketCategories)
	case "get_tickets":
		h.withAuth(w, r, h.getTickets)
	case "get_ticket":
		h.withAuth(w, r, h.getTicket)
	case "create_ticket":
		h.withAuth(w, r, h.createTicket)
	case "update_ticket":
		h.withAuth(w, r, h.updateTicket)
	case "update_ticket_status":
		h.withAuth(w, r, h.updateTicketStatus)
	case "assign_ticket":
		h.withAuth(w, r, h.assignTicket)
	case "delete_ticket":
		h.withAuth(w, r, h.deleteTicket)
	case "add_ticket_comment":
		h.withAuth(w, r, h.addTicketComment)
	case "get_ticket_comments":
		h.withAuth(w, r, h.getTicketComments)
	case "delete_ticket_comment":
		h.withAuth(w, r, h.deleteTicketComment)
	case "get_ticket_stats":
		h.withAuth(w, r, h.getTicketStats)

	// Work Schedules
	case "get_work_schedules":
		h.withAuth(w, r, h.getWorkSchedules)
	case "get_work_schedule":
		h.withAuth(w, r, h.getWorkSchedule)
	case "create_work_schedule":
		h.withAuth(w, r, h.createWorkSchedule)
	case "update_work_schedule":
		h.withAuth(w, r, h.updateWorkSchedule)
	case "delete_work_schedule":
		h.withAuth(w, r, h.deleteWorkSchedule)
	case "get_work_schedule_days":
		h.withAuth(w, r, h.getWorkScheduleDays)
	case "save_work_schedule_days":
		h.withAuth(w, r, h.saveWorkScheduleDays)
	case "get_work_schedule_defaults":
		h.withAuth(w, r, h.getWorkScheduleDefaults)
	case "upsert_work_schedule_default":
		h.withAuth(w, r, h.upsertWorkScheduleDefault)
	case "delete_work_schedule_default":
		h.withAuth(w, r, h.deleteWorkScheduleDefault)
	case "resolve_employee_schedule":
		h.withAuth(w, r, h.resolveEmployeeSchedule)
	case "get_schedule_roster":
		h.withAuth(w, r, h.getScheduleRoster)
	case "bulk_assign_schedule":
		h.withAuth(w, r, h.bulkAssignSchedule)

	default:
		Error(w, http.StatusBadRequest, "unknown action: "+action)
	}
}

// ==================== AUTH HELPER ====================

type authedHandler func(w http.ResponseWriter, r *http.Request, session *models.UserSession)

func (h *Handler) withAuth(w http.ResponseWriter, r *http.Request, fn authedHandler) {
	token := r.Header.Get("Authorization")
	if token == "" {
		Error(w, http.StatusUnauthorized, "missing authorization header")
		return
	}

	// Support "Bearer <token>"
	if len(token) > 7 && token[:7] == "Bearer " {
		token = token[7:]
	}

	session, err := h.sessionRepo.Validate(r.Context(), token)
	if err != nil {
		Error(w, http.StatusInternalServerError, "session validation failed")
		return
	}
	if session == nil {
		Error(w, http.StatusUnauthorized, "invalid or expired session")
		return
	}

	fn(w, r, session)
}

func getMeta(r *http.Request, session *models.UserSession) *models.RequestMeta {
	return &models.RequestMeta{
		UserID:    session.UserID,
		SessionID: session.ID,
		CompanyID: session.CompanyID,
		IPAddress: r.RemoteAddr,
		UserAgent: r.UserAgent(),
	}
}

// ==================== REGISTER ====================

func (h *Handler) register(w http.ResponseWriter, r *http.Request) {
	var req models.RegisterRequest
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.CompanyName == "" || req.Email == "" || req.Username == "" || req.Password == "" {
		Error(w, http.StatusBadRequest, "company_name, email, username, and password are required")
		return
	}
	if len(req.WrappedCompanyKey) == 0 || len(req.PublicKey) == 0 {
		Error(w, http.StatusBadRequest, "wrapped_company_key and public_key are required")
		return
	}
	if req.Salt == "" {
		Error(w, http.StatusBadRequest, "salt is required")
		return
	}

	existing, err := h.userRepo.GetByEmail(r.Context(), req.Email)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to check existing user")
		return
	}
	if existing != nil {
		Error(w, http.StatusConflict, "email already registered")
		return
	}

	companyID := uuid.New().String()
	userID := uuid.New().String()
	accessID := uuid.New().String()
	passwordHash := hashPassword(req.Password, req.Salt)

	err = h.regRepo.Register(r.Context(), &repository.RegisterParams{
		CompanyID:       companyID,
		CompanyName:     req.CompanyName,
		CompanyIndustry: strPtr(req.CompanyIndustry),
		CompanyAddress:  strPtr(req.CompanyAddress),
		CompanyCountry:  strPtr(req.CompanyCountry),
		CompanyCity:     strPtr(req.CompanyCity),
		CompanyState:    strPtr(req.CompanyState),
		CompanyProvince: strPtr(req.CompanyProvince),
		CompanyZip:      strPtr(req.CompanyZip),
		KeyAlgorithm:    strPtr(req.KeyAlgorithm),

		UserID:       userID,
		Email:        req.Email,
		Username:     req.Username,
		PasswordHash: passwordHash,
		Salt:         req.Salt,

		AccessID:             accessID,
		WrappedCompanyKey:    req.WrappedCompanyKey,
		KeyWrapAlgorithm:     strPtr(req.KeyWrapAlgorithm),
		KeyExchangeAlgorithm: strPtr(req.KeyExchangeAlgorithm),
		PublicKey:            req.PublicKey,
		SigningPublicKey:     req.SigningPublicKey,

		IPAddress: r.RemoteAddr,
		UserAgent: r.UserAgent(),
	})
	if err != nil {
		Error(w, http.StatusInternalServerError, "registration failed: "+err.Error())
		return
	}

	JSON(w, http.StatusCreated, map[string]interface{}{
		"company_id": companyID,
		"user_id":    userID,
		"access_id":  accessID,
		"salt":       req.Salt,
	})
}

// ==================== LOGIN ====================

func (h *Handler) login(w http.ResponseWriter, r *http.Request) {
	var req models.LoginRequest
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Email == "" || req.Password == "" {
		Error(w, http.StatusBadRequest, "email and password are required")
		return
	}

	user, err := h.userRepo.GetByEmail(r.Context(), req.Email)
	if err != nil {
		Error(w, http.StatusInternalServerError, "login failed")
		return
	}
	if user == nil {
		Error(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	if user.LockedUntil != nil && user.LockedUntil.After(time.Now()) {
		Error(w, http.StatusForbidden, "account is locked, try again later")
		return
	}

	if !user.IsActive {
		Error(w, http.StatusForbidden, "account is deactivated")
		return
	}

	if !verifyPassword(req.Password, user.Salt, user.PasswordHash) {
		_ = h.userRepo.LoginFailure(r.Context(), user.ID, h.cfg.Server.MaxLoginAttempts, h.cfg.Server.LockoutMinutes)
		Error(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	_ = h.userRepo.LoginSuccess(r.Context(), user.ID)

	companies, err := h.accessRepo.GetUserCompanies(r.Context(), user.ID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to get companies")
		return
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"user": map[string]interface{}{
			"id":            user.ID,
			"email":         user.Email,
			"username":      user.Username,
			"salt":          user.Salt,
			"is_active":     user.IsActive,
			"last_login_at": user.LastLoginAt,
			"created_at":    user.CreatedAt,
			"updated_at":    user.UpdatedAt,
		},
		"companies": companies,
	})
}

// ==================== SELECT COMPANY ====================

func (h *Handler) selectCompany(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserID     string `json:"user_id"`
		CompanyID  string `json:"company_id"`
		DeviceInfo string `json:"device_info"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.UserID == "" || req.CompanyID == "" {
		Error(w, http.StatusBadRequest, "user_id and company_id are required")
		return
	}

	companies, err := h.accessRepo.GetUserCompanies(r.Context(), req.UserID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to verify access")
		return
	}

	var access *models.UserCompanyAccess
	for _, c := range companies {
		if c.CompanyID == req.CompanyID {
			access = &c
			break
		}
	}

	if access == nil {
		Error(w, http.StatusForbidden, "no access to this company")
		return
	}

	sessionID := uuid.New().String()
	expiresAt := time.Now().Add(time.Duration(h.cfg.Server.SessionHours) * time.Hour)

	err = h.sessionRepo.Create(r.Context(), sessionID, req.UserID, req.CompanyID, req.DeviceInfo, r.RemoteAddr, expiresAt)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"session_id":             sessionID,
		"expires_at":             expiresAt,
		"wrapped_company_key":    access.WrappedCompanyKey,
		"key_wrap_algorithm":     access.KeyWrapAlgorithm,
		"key_exchange_algorithm": access.KeyExchangeAlgorithm,
		"key_version":            access.KeyVersion,
		"role":                   access.Role,
		"permissions":            access.Permissions,
	})
}

// ==================== LOGOUT ====================

func (h *Handler) logout(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	if err := h.sessionRepo.Invalidate(r.Context(), session.ID); err != nil {
		Error(w, http.StatusInternalServerError, "failed to logout")
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "logged out"})
}

func (h *Handler) logoutAll(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	if err := h.sessionRepo.InvalidateAll(r.Context(), session.UserID); err != nil {
		Error(w, http.StatusInternalServerError, "failed to logout all sessions")
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "all sessions invalidated"})
}

// ==================== COMPANY ====================

func (h *Handler) getCompany(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	company, err := h.companyRepo.GetByID(r.Context(), session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to get company")
		return
	}
	if company == nil {
		Error(w, http.StatusNotFound, "company not found")
		return
	}
	JSON(w, http.StatusOK, company)
}

func (h *Handler) updateCompany(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	if session.Role != models.RoleSuperAdmin && session.Role != models.RoleAdmin {
		Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	var req struct {
		Name         *string `json:"name"`
		Industry     *string `json:"industry"`
		Address      *string `json:"address"`
		City         *string `json:"city"`
		State        *string `json:"state"`
		Province     *string `json:"province"`
		MaxEmployees *int    `json:"max_employees"`
		Plan         *string `json:"plan"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	company := &models.Company{ID: session.CompanyID}
	if req.Name != nil {
		company.Name = *req.Name
	}
	if req.Industry != nil {
		company.Industry = req.Industry
	}
	if req.Address != nil {
		company.Address = req.Address
	}
	if req.City != nil {
		company.City = req.City
	}
	if req.State != nil {
		company.State = req.State
	}
	if req.Province != nil {
		company.Province = req.Province
	}
	if req.MaxEmployees != nil {
		company.MaxEmployees = *req.MaxEmployees
	}
	if req.Plan != nil {
		company.Plan = *req.Plan
	}

	meta := getMeta(r, session)
	if err := h.companyRepo.Update(r.Context(), company, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to update company")
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "company updated"})
}

func (h *Handler) deleteCompany(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	if session.Role != models.RoleSuperAdmin {
		Error(w, http.StatusForbidden, "only superadmin can delete company")
		return
	}

	meta := getMeta(r, session)
	if err := h.companyRepo.Delete(r.Context(), session.CompanyID, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to delete company")
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "company deactivated"})
}

// ==================== USER ====================

func (h *Handler) getUser(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	user, err := h.userRepo.GetByID(r.Context(), session.UserID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to get user")
		return
	}
	if user == nil {
		Error(w, http.StatusNotFound, "user not found")
		return
	}
	JSON(w, http.StatusOK, user)
}

func (h *Handler) updateUser(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		Email    *string `json:"email"`
		Username *string `json:"username"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	user := &models.User{ID: session.UserID}
	if req.Email != nil {
		user.Email = *req.Email
	}
	if req.Username != nil {
		user.Username = *req.Username
	}

	meta := getMeta(r, session)
	if err := h.userRepo.Update(r.Context(), user, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to update user")
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "user updated"})
}

func (h *Handler) changePassword(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.CurrentPassword == "" || req.NewPassword == "" {
		Error(w, http.StatusBadRequest, "current_password and new_password are required")
		return
	}

	user, err := h.userRepo.GetByEmail(r.Context(), session.Email)
	if err != nil || user == nil {
		Error(w, http.StatusInternalServerError, "failed to verify user")
		return
	}

	if !verifyPassword(req.CurrentPassword, user.Salt, user.PasswordHash) {
		Error(w, http.StatusUnauthorized, "current password is incorrect")
		return
	}

	newSalt := uuid.New().String()
	newHash := hashPassword(req.NewPassword, newSalt)

	meta := getMeta(r, session)
	if err := h.userRepo.ChangePassword(r.Context(), session.UserID, newHash, newSalt, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to change password")
		return
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"message":  "password changed",
		"new_salt": newSalt,
	})
}

func (h *Handler) deleteUser(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	if session.Role != models.RoleSuperAdmin && session.Role != models.RoleAdmin {
		Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	var req struct {
		UserID string `json:"user_id"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.UserID == "" {
		Error(w, http.StatusBadRequest, "user_id is required")
		return
	}
	if req.UserID == session.UserID {
		Error(w, http.StatusForbidden, "cannot delete yourself")
		return
	}

	meta := getMeta(r, session)
	if err := h.userRepo.Delete(r.Context(), req.UserID, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to deactivate user")
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "user deactivated"})
}

func (h *Handler) listUsers(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	if session.Role != models.RoleSuperAdmin && session.Role != models.RoleAdmin && session.Role != models.RoleHR {
		Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	users, err := h.accessRepo.GetCompanyUsers(r.Context(), session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list users")
		return
	}
	JSON(w, http.StatusOK, users)
}

func (h *Handler) createUser(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	if session.Role != models.RoleSuperAdmin && session.Role != models.RoleAdmin {
		Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	var req struct {
		Email                string `json:"email"`
		Username             string `json:"username"`
		Password             string `json:"password"`
		Role                 string `json:"role"`
		WrappedCompanyKey    []byte `json:"wrapped_company_key"`
		KeyWrapAlgorithm     string `json:"key_wrap_algorithm"`
		KeyExchangeAlgorithm string `json:"key_exchange_algorithm"`
		PublicKey            []byte `json:"public_key"`
		SigningPublicKey     []byte `json:"signing_public_key"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Email == "" || req.Username == "" || req.Password == "" {
		Error(w, http.StatusBadRequest, "email, username, and password are required")
		return
	}
	if len(req.WrappedCompanyKey) == 0 || len(req.PublicKey) == 0 {
		Error(w, http.StatusBadRequest, "wrapped_company_key and public_key are required")
		return
	}

	existing, err := h.userRepo.GetByEmail(r.Context(), req.Email)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to check existing user")
		return
	}
	if existing != nil {
		Error(w, http.StatusConflict, "email already registered")
		return
	}

	role := req.Role
	if role == "" {
		role = models.RoleEmployee
	}
	if role == models.RoleSuperAdmin {
		Error(w, http.StatusForbidden, "cannot create superadmin")
		return
	}

	userID := uuid.New().String()
	salt := uuid.New().String()
	passwordHash := hashPassword(req.Password, salt)

	meta := getMeta(r, session)
	err = h.userRepo.Create(r.Context(), &models.User{
		ID:           userID,
		Email:        req.Email,
		Username:     req.Username,
		PasswordHash: passwordHash,
		Salt:         salt,
	}, meta)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to create user")
		return
	}

	accessID := uuid.New().String()
	algorithm := req.KeyWrapAlgorithm
	if algorithm == "" {
		algorithm = "AES-256-KW"
	}

	kexAlgorithm := req.KeyExchangeAlgorithm
	if kexAlgorithm == "" {
		kexAlgorithm = "ML-KEM-768"
	}

	err = h.accessRepo.Create(r.Context(), &models.UserCompanyAccess{
		ID:                   accessID,
		UserID:               userID,
		CompanyID:            session.CompanyID,
		WrappedCompanyKey:    req.WrappedCompanyKey,
		KeyWrapAlgorithm:     algorithm,
		KeyExchangeAlgorithm: kexAlgorithm,
		PublicKey:            req.PublicKey,
		SigningPublicKey:     req.SigningPublicKey,
		Role:                 role,
	}, meta)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to grant company access")
		return
	}

	JSON(w, http.StatusCreated, map[string]interface{}{
		"user_id":   userID,
		"access_id": accessID,
		"salt":      salt,
	})
}

// ==================== ACCESS ====================

func (h *Handler) getUserCompanies(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	companies, err := h.accessRepo.GetUserCompanies(r.Context(), session.UserID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to get companies")
		return
	}
	JSON(w, http.StatusOK, companies)
}

func (h *Handler) updateUserAccess(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	if session.Role != models.RoleSuperAdmin && session.Role != models.RoleAdmin {
		Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	var req struct {
		AccessID             string  `json:"access_id"`
		Role                 *string `json:"role"`
		Permissions          *string `json:"permissions"`
		WrappedCompanyKey    []byte  `json:"wrapped_company_key"`
		KeyWrapAlgorithm     *string `json:"key_wrap_algorithm"`
		KeyExchangeAlgorithm *string `json:"key_exchange_algorithm"`
		KeyVersion           *int    `json:"key_version"`
		PublicKey            []byte  `json:"public_key"`
		SigningPublicKey     []byte  `json:"signing_public_key"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.AccessID == "" {
		Error(w, http.StatusBadRequest, "access_id is required")
		return
	}

	access := &models.UserCompanyAccess{ID: req.AccessID}
	if req.Role != nil {
		access.Role = *req.Role
	}
	if req.Permissions != nil {
		access.Permissions = req.Permissions
	}
	if req.WrappedCompanyKey != nil {
		access.WrappedCompanyKey = req.WrappedCompanyKey
	}
	if req.KeyWrapAlgorithm != nil {
		access.KeyWrapAlgorithm = *req.KeyWrapAlgorithm
	}
	if req.KeyExchangeAlgorithm != nil {
		access.KeyExchangeAlgorithm = *req.KeyExchangeAlgorithm
	}
	if req.KeyVersion != nil {
		access.KeyVersion = *req.KeyVersion
	}
	if req.PublicKey != nil {
		access.PublicKey = req.PublicKey
	}
	if req.SigningPublicKey != nil {
		access.SigningPublicKey = req.SigningPublicKey
	}

	meta := getMeta(r, session)
	if err := h.accessRepo.Update(r.Context(), access, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to update access")
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "access updated"})
}

func (h *Handler) revokeUserAccess(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	if session.Role != models.RoleSuperAdmin && session.Role != models.RoleAdmin {
		Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	var req struct {
		AccessID string `json:"access_id"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.AccessID == "" {
		Error(w, http.StatusBadRequest, "access_id is required")
		return
	}

	meta := getMeta(r, session)
	if err := h.accessRepo.Delete(r.Context(), req.AccessID, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to revoke access")
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "access revoked"})
}

// ==================== HISTORY ====================

func (h *Handler) getHistory(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	if session.Role != models.RoleSuperAdmin && session.Role != models.RoleAdmin && session.Role != models.RoleHR {
		Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	var req struct {
		TableName *string `json:"table_name"`
		RecordID  *string `json:"record_id"`
		Limit     *int    `json:"limit"`
		Offset    *int    `json:"offset"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	limit := 50
	if req.Limit != nil && *req.Limit > 0 && *req.Limit <= 200 {
		limit = *req.Limit
	}

	offset := 0
	if req.Offset != nil && *req.Offset >= 0 {
		offset = *req.Offset
	}

	history, err := h.historyRepo.Get(r.Context(), session.CompanyID, req.TableName, req.RecordID, limit, offset)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to get change history")
		return
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"records": history,
		"limit":   limit,
		"offset":  offset,
	})
}

// ==================== HELPERS ====================

// ==================== ONBOARDING ====================

func (h *Handler) getOnboardingTemplates(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	tpls, err := h.onbRepo.GetTemplates(r.Context(), session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	if tpls == nil {
		tpls = []models.OnboardingTemplate{}
	}
	JSON(w, http.StatusOK, map[string]interface{}{"templates": tpls})
}

func (h *Handler) createOnboardingTemplate(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.OnboardingTemplate
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Name == "" {
		Error(w, http.StatusBadRequest, "name is required")
		return
	}
	req.ID = uuid.New().String()
	req.CompanyID = session.CompanyID
	if err := h.onbRepo.CreateTemplate(r.Context(), &req, getMeta(r, session)); err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	JSON(w, http.StatusCreated, req)
}

func (h *Handler) updateOnboardingTemplate(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.OnboardingTemplate
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id required")
		return
	}
	req.CompanyID = session.CompanyID
	if err := h.onbRepo.UpdateTemplate(r.Context(), &req, getMeta(r, session)); err != nil {
		Error(w, http.StatusInternalServerError, "failed")
		return
	}
	JSON(w, http.StatusOK, req)
}

func (h *Handler) deleteOnboardingTemplate(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id required")
		return
	}
	if err := h.onbRepo.DeleteTemplate(r.Context(), req.ID, getMeta(r, session)); err != nil {
		Error(w, http.StatusInternalServerError, "failed")
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}

func (h *Handler) getTemplateItems(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		TemplateID string `json:"template_id"`
	}
	if err := Decode(r, &req); err != nil || req.TemplateID == "" {
		Error(w, http.StatusBadRequest, "template_id required")
		return
	}
	items, err := h.onbRepo.GetTemplateItems(r.Context(), req.TemplateID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	if items == nil {
		items = []models.OnboardingTemplateItem{}
	}
	JSON(w, http.StatusOK, map[string]interface{}{"items": items})
}

func (h *Handler) saveTemplateItem(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.OnboardingTemplateItem
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.ID == "" {
		req.ID = uuid.New().String()
	}
	req.CompanyID = session.CompanyID
	if err := h.onbRepo.UpsertTemplateItem(r.Context(), &req); err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	JSON(w, http.StatusOK, req)
}

func (h *Handler) deleteTemplateItem(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id required")
		return
	}
	if err := h.onbRepo.DeleteTemplateItem(r.Context(), req.ID); err != nil {
		Error(w, http.StatusInternalServerError, "failed")
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}

func (h *Handler) getOnboardingChecklists(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		Status string `json:"status"`
	}
	Decode(r, &req)
	cls, err := h.onbRepo.GetChecklists(r.Context(), session.CompanyID, req.Status)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	if cls == nil {
		cls = []models.OnboardingChecklist{}
	}
	JSON(w, http.StatusOK, map[string]interface{}{"checklists": cls})
}

func (h *Handler) createOnboardingChecklist(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.OnboardingChecklist
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.EmployeeID == "" || req.StartDate == "" {
		Error(w, http.StatusBadRequest, "employee_id and start_date required")
		return
	}
	req.ID = uuid.New().String()
	req.CompanyID = session.CompanyID
	if err := h.onbRepo.CreateChecklist(r.Context(), &req, getMeta(r, session)); err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	JSON(w, http.StatusCreated, req)
}

func (h *Handler) updateOnboardingStatus(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID       string `json:"id"`
		Status   string `json:"status"`
		Progress int    `json:"progress"`
	}
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id required")
		return
	}
	if err := h.onbRepo.UpdateChecklistStatus(r.Context(), req.ID, session.CompanyID, req.Status, req.Progress, getMeta(r, session)); err != nil {
		Error(w, http.StatusInternalServerError, "failed")
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "updated"})
}

func (h *Handler) deleteOnboardingChecklist(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id required")
		return
	}
	if err := h.onbRepo.DeleteChecklist(r.Context(), req.ID, getMeta(r, session)); err != nil {
		Error(w, http.StatusInternalServerError, "failed")
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}

func (h *Handler) getOnboardingItems(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ChecklistID string `json:"checklist_id"`
	}
	if err := Decode(r, &req); err != nil || req.ChecklistID == "" {
		Error(w, http.StatusBadRequest, "checklist_id required")
		return
	}
	items, err := h.onbRepo.GetItems(r.Context(), req.ChecklistID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	if items == nil {
		items = []models.OnboardingItem{}
	}
	JSON(w, http.StatusOK, map[string]interface{}{"items": items})
}

func (h *Handler) toggleOnboardingItem(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID        string `json:"id"`
		Completed bool   `json:"completed"`
	}
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id required")
		return
	}
	if err := h.onbRepo.ToggleItem(r.Context(), req.ID, req.Completed); err != nil {
		Error(w, http.StatusInternalServerError, "failed")
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "toggled"})
}

func (h *Handler) addOnboardingItem(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.OnboardingItem
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.ID == "" {
		req.ID = uuid.New().String()
	}
	req.CompanyID = session.CompanyID
	if err := h.onbRepo.AddItem(r.Context(), &req); err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	JSON(w, http.StatusOK, req)
}

func (h *Handler) deleteOnboardingItem(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id required")
		return
	}
	if err := h.onbRepo.DeleteItem(r.Context(), req.ID); err != nil {
		Error(w, http.StatusInternalServerError, "failed")
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}

// ==================== PAYROLL ====================

func (h *Handler) getPayrollSettings(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	settings, err := h.payrollRepo.GetSettings(r.Context(), session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to get payroll settings: "+err.Error())
		return
	}
	if settings == nil {
		settings = &models.PayrollSettings{
			PaySchedule: "semi_monthly", WorkingDays: 22, HoursPerDay: 8,
			OTMultiplier: 1.25, NightDiffPct: 0.10,
			EnableSSS: true, EnablePhilHealth: true, EnablePagibig: true, EnableTax: true,
		}
	}
	JSON(w, http.StatusOK, map[string]interface{}{"settings": settings})
}

func (h *Handler) savePayrollSettings(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.PayrollSettings
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ID == "" {
		req.ID = uuid.New().String()
	}
	req.CompanyID = session.CompanyID
	meta := getMeta(r, session)

	if err := h.payrollRepo.UpsertSettings(r.Context(), &req, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to save payroll settings: "+err.Error())
		return
	}
	JSON(w, http.StatusOK, req)
}

func (h *Handler) getPayrollRuns(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	runs, err := h.payrollRepo.GetRuns(r.Context(), session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to get payroll runs: "+err.Error())
		return
	}
	if runs == nil {
		runs = []models.PayrollRun{}
	}
	JSON(w, http.StatusOK, map[string]interface{}{"runs": runs})
}

func (h *Handler) getPayrollRun(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id is required")
		return
	}
	run, err := h.payrollRepo.GetRun(r.Context(), req.ID, session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to get payroll run")
		return
	}
	JSON(w, http.StatusOK, map[string]interface{}{"run": run})
}

func (h *Handler) createPayrollRun(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.PayrollRun
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.PeriodStart == "" || req.PeriodEnd == "" {
		Error(w, http.StatusBadRequest, "period_start and period_end are required")
		return
	}
	req.ID = uuid.New().String()
	req.CompanyID = session.CompanyID
	meta := getMeta(r, session)

	if err := h.payrollRepo.CreateRun(r.Context(), &req, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to create payroll run: "+err.Error())
		return
	}
	JSON(w, http.StatusCreated, req)
}

func (h *Handler) updatePayrollRun(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.PayrollRun
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ID == "" {
		Error(w, http.StatusBadRequest, "id is required")
		return
	}
	req.CompanyID = session.CompanyID
	meta := getMeta(r, session)

	if err := h.payrollRepo.UpdateRunStatus(r.Context(), &req, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to update payroll run")
		return
	}
	JSON(w, http.StatusOK, req)
}

func (h *Handler) deletePayrollRun(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id is required")
		return
	}
	meta := getMeta(r, session)
	if err := h.payrollRepo.DeleteRun(r.Context(), req.ID, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to delete payroll run")
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "payroll run deleted"})
}

func (h *Handler) getPayrollItems(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		RunID string `json:"run_id"`
	}
	if err := Decode(r, &req); err != nil || req.RunID == "" {
		Error(w, http.StatusBadRequest, "run_id is required")
		return
	}
	items, err := h.payrollRepo.GetItems(r.Context(), req.RunID, session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to get payroll items: "+err.Error())
		return
	}
	if items == nil {
		items = []models.PayrollItem{}
	}
	JSON(w, http.StatusOK, map[string]interface{}{"items": items})
}

func (h *Handler) savePayrollItem(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.PayrollItem
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ID == "" {
		req.ID = uuid.New().String()
	}
	req.CompanyID = session.CompanyID

	if err := h.payrollRepo.UpsertItem(r.Context(), &req); err != nil {
		Error(w, http.StatusInternalServerError, "failed to save payroll item: "+err.Error())
		return
	}
	JSON(w, http.StatusOK, req)
}

// ==================== LEAVES ====================

func (h *Handler) getLeaves(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		Status   string `json:"status"`
		DateFrom string `json:"date_from"`
		DateTo   string `json:"date_to"`
	}
	Decode(r, &req)

	leaves, err := h.leaveRepo.GetByCompany(r.Context(), session.CompanyID, req.Status, req.DateFrom, req.DateTo)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to get leaves: "+err.Error())
		return
	}
	if leaves == nil {
		leaves = []models.Leave{}
	}
	JSON(w, http.StatusOK, map[string]interface{}{"leaves": leaves})
}

func (h *Handler) createLeave(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.Leave
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.EmployeeID == "" || req.LeaveType == "" || req.StartDate == "" || req.EndDate == "" {
		Error(w, http.StatusBadRequest, "employee_id, leave_type, start_date, end_date are required")
		return
	}
	if req.Days <= 0 {
		req.Days = 1
	}

	req.ID = uuid.New().String()
	req.CompanyID = session.CompanyID
	meta := getMeta(r, session)

	if err := h.leaveRepo.Create(r.Context(), &req, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to create leave: "+err.Error())
		return
	}

	JSON(w, http.StatusCreated, req)
}

func (h *Handler) updateLeave(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.Leave
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ID == "" {
		Error(w, http.StatusBadRequest, "id is required")
		return
	}

	req.CompanyID = session.CompanyID
	meta := getMeta(r, session)

	if err := h.leaveRepo.Update(r.Context(), &req, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to update leave")
		return
	}

	JSON(w, http.StatusOK, req)
}

func (h *Handler) approveLeave(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID            string `json:"id"`
		Status        string `json:"status"`
		RejectionNote string `json:"rejection_note"`
	}
	if err := Decode(r, &req); err != nil || req.ID == "" || req.Status == "" {
		Error(w, http.StatusBadRequest, "id and status are required")
		return
	}

	meta := getMeta(r, session)
	if err := h.leaveRepo.Approve(r.Context(), req.ID, session.CompanyID, req.Status, req.RejectionNote, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to approve/reject leave: "+err.Error())
		return
	}

	JSON(w, http.StatusOK, map[string]string{"message": "leave " + req.Status})
}

func (h *Handler) deleteLeave(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id is required")
		return
	}

	meta := getMeta(r, session)
	if err := h.leaveRepo.Delete(r.Context(), req.ID, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to delete leave")
		return
	}

	JSON(w, http.StatusOK, map[string]string{"message": "leave deleted"})
}

// ==================== ATTENDANCE ====================

func (h *Handler) getAttendance(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		DateFrom string `json:"date_from"`
		DateTo   string `json:"date_to"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.DateFrom == "" || req.DateTo == "" {
		Error(w, http.StatusBadRequest, "date_from and date_to are required")
		return
	}

	records, err := h.attendRepo.GetByDateRange(r.Context(), session.CompanyID, req.DateFrom, req.DateTo)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to get attendance: "+err.Error())
		return
	}
	if records == nil {
		records = []models.Attendance{}
	}
	JSON(w, http.StatusOK, map[string]interface{}{
		"attendance": records,
	})
}

func (h *Handler) clockIn(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		EmployeeID string `json:"employee_id"`
	}
	if err := Decode(r, &req); err != nil || req.EmployeeID == "" {
		Error(w, http.StatusBadRequest, "employee_id is required")
		return
	}

	id := uuid.New().String()
	meta := getMeta(r, session)

	if err := h.attendRepo.ClockIn(r.Context(), id, req.EmployeeID, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to clock in: "+err.Error())
		return
	}

	JSON(w, http.StatusCreated, map[string]string{"id": id, "message": "clocked in"})
}

func (h *Handler) clockOut(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id is required")
		return
	}

	meta := getMeta(r, session)
	if err := h.attendRepo.ClockOut(r.Context(), req.ID, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to clock out: "+err.Error())
		return
	}

	JSON(w, http.StatusOK, map[string]string{"message": "clocked out"})
}

func (h *Handler) createAttendance(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.Attendance
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.EmployeeID == "" || req.Date == "" {
		Error(w, http.StatusBadRequest, "employee_id and date are required")
		return
	}
	if req.Status == "" {
		req.Status = "Present"
	}

	req.ID = uuid.New().String()
	req.CompanyID = session.CompanyID
	meta := getMeta(r, session)

	if err := h.attendRepo.Create(r.Context(), &req, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to create attendance: "+err.Error())
		return
	}

	JSON(w, http.StatusCreated, req)
}

func (h *Handler) updateAttendance(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.Attendance
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ID == "" {
		Error(w, http.StatusBadRequest, "id is required")
		return
	}

	req.CompanyID = session.CompanyID
	meta := getMeta(r, session)

	if err := h.attendRepo.Update(r.Context(), &req, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to update attendance")
		return
	}

	JSON(w, http.StatusOK, req)
}

func (h *Handler) deleteAttendance(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id is required")
		return
	}

	meta := getMeta(r, session)
	if err := h.attendRepo.Delete(r.Context(), req.ID, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to delete attendance")
		return
	}

	JSON(w, http.StatusOK, map[string]string{"message": "attendance deleted"})
}

// ==================== POSITIONS ====================

func (h *Handler) getPositions(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	positions, err := h.posRepo.GetByCompany(r.Context(), session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to get positions: "+err.Error())
		return
	}
	if positions == nil {
		positions = []models.Position{}
	}
	JSON(w, http.StatusOK, map[string]interface{}{
		"positions": positions,
	})
}

func (h *Handler) createPosition(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.Position
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		Error(w, http.StatusBadRequest, "name is required")
		return
	}

	req.ID = uuid.New().String()
	req.CompanyID = session.CompanyID
	meta := getMeta(r, session)

	if err := h.posRepo.Create(r.Context(), &req, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to create position: "+err.Error())
		return
	}

	JSON(w, http.StatusCreated, req)
}

func (h *Handler) updatePosition(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.Position
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ID == "" {
		Error(w, http.StatusBadRequest, "id is required")
		return
	}

	req.CompanyID = session.CompanyID
	meta := getMeta(r, session)

	if err := h.posRepo.Update(r.Context(), &req, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to update position")
		return
	}

	JSON(w, http.StatusOK, req)
}

func (h *Handler) deletePosition(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id is required")
		return
	}

	meta := getMeta(r, session)
	if err := h.posRepo.Delete(r.Context(), req.ID, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to delete position")
		return
	}

	JSON(w, http.StatusOK, map[string]string{"message": "position deleted"})
}

// ==================== DEPARTMENTS ====================

func (h *Handler) getDepartments(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	depts, err := h.deptRepo.GetByCompany(r.Context(), session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to get departments: "+err.Error())
		return
	}
	if depts == nil {
		depts = []models.Department{}
	}
	JSON(w, http.StatusOK, map[string]interface{}{
		"departments": depts,
	})
}

func (h *Handler) createDepartment(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.Department
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		Error(w, http.StatusBadRequest, "name is required")
		return
	}
	if req.Color == "" {
		req.Color = "#2d9e8b"
	}

	req.ID = uuid.New().String()
	req.CompanyID = session.CompanyID
	meta := getMeta(r, session)

	if err := h.deptRepo.Create(r.Context(), &req, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to create department: "+err.Error())
		return
	}

	JSON(w, http.StatusCreated, req)
}

func (h *Handler) updateDepartment(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.Department
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ID == "" {
		Error(w, http.StatusBadRequest, "id is required")
		return
	}

	req.CompanyID = session.CompanyID
	meta := getMeta(r, session)

	if err := h.deptRepo.Update(r.Context(), &req, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to update department")
		return
	}

	JSON(w, http.StatusOK, req)
}

func (h *Handler) deleteDepartment(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id is required")
		return
	}

	meta := getMeta(r, session)
	if err := h.deptRepo.Delete(r.Context(), req.ID, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to delete department")
		return
	}

	JSON(w, http.StatusOK, map[string]string{"message": "department deleted"})
}

// ==================== EMPLOYEES ====================

func (h *Handler) getEmployees(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	employees, err := h.employeeRepo.GetByCompany(r.Context(), session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to get employees: "+err.Error())
		return
	}
	if employees == nil {
		employees = []models.Employee{}
	}
	JSON(w, http.StatusOK, map[string]interface{}{
		"employees": employees,
	})
}

func (h *Handler) getEmployee(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id is required")
		return
	}

	emp, err := h.employeeRepo.GetByID(r.Context(), req.ID, session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to get employee")
		return
	}
	if emp == nil {
		Error(w, http.StatusNotFound, "employee not found")
		return
	}

	JSON(w, http.StatusOK, emp)
}

func (h *Handler) createEmployee(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.Employee
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	if req.FirstName == "" || req.LastName == "" {
		Error(w, http.StatusBadRequest, "first_name and last_name are required")
		return
	}

	req.ID = uuid.New().String()
	req.CompanyID = session.CompanyID
	meta := getMeta(r, session)

	if err := h.employeeRepo.Create(r.Context(), &req, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to create employee: "+err.Error())
		return
	}

	JSON(w, http.StatusCreated, req)
}

func (h *Handler) updateEmployee(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.Employee
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.ID == "" {
		Error(w, http.StatusBadRequest, "id is required")
		return
	}

	req.CompanyID = session.CompanyID
	meta := getMeta(r, session)

	if err := h.employeeRepo.Update(r.Context(), &req, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to update employee: "+err.Error())
		return
	}

	JSON(w, http.StatusOK, req)
}

func (h *Handler) deleteEmployee(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id is required")
		return
	}

	meta := getMeta(r, session)
	if err := h.employeeRepo.Delete(r.Context(), req.ID, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to delete employee")
		return
	}

	JSON(w, http.StatusOK, map[string]string{"message": "employee deleted"})
}

// ==================== BENEFITS ====================

func (h *Handler) getBenefits(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	benefits, err := h.benefitRepo.GetByCompany(r.Context(), session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to get benefits")
		return
	}
	if benefits == nil {
		benefits = []models.Benefit{}
	}
	JSON(w, http.StatusOK, map[string]interface{}{
		"benefits": benefits,
	})
}

func (h *Handler) createBenefit(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.Benefit
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Name == "" && req.Type == "" {
		Error(w, http.StatusBadRequest, "name or type is required")
		return
	}
	if req.Name == "" {
		req.Name = req.Type
	}
	if req.Tiers == nil {
		req.Tiers = []models.BenefitTier{}
	}

	req.ID = uuid.New().String()
	req.CompanyID = session.CompanyID
	meta := getMeta(r, session)

	if err := h.benefitRepo.Create(r.Context(), &req, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to create benefit: "+err.Error())
		return
	}

	JSON(w, http.StatusCreated, req)
}

func (h *Handler) updateBenefit(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.Benefit
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.ID == "" {
		Error(w, http.StatusBadRequest, "id is required")
		return
	}
	if req.Tiers == nil {
		req.Tiers = []models.BenefitTier{}
	}

	req.CompanyID = session.CompanyID
	meta := getMeta(r, session)

	if err := h.benefitRepo.Update(r.Context(), &req, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to update benefit")
		return
	}

	JSON(w, http.StatusOK, req)
}

func (h *Handler) deleteBenefit(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		BenefitID string `json:"benefit_id"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.BenefitID == "" {
		Error(w, http.StatusBadRequest, "benefit_id is required")
		return
	}

	meta := getMeta(r, session)
	if err := h.benefitRepo.Delete(r.Context(), req.BenefitID, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to delete benefit")
		return
	}

	JSON(w, http.StatusOK, map[string]string{"message": "benefit deleted"})
}

func hashPassword(password, salt string) string {
	hash := argon2.IDKey([]byte(password), []byte(salt), 1, 64*1024, 4, 32)
	return fmt.Sprintf("%x", hash)
}

func verifyPassword(password, salt, storedHash string) bool {
	return hashPassword(password, salt) == storedHash
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func (h *Handler) resetPassword(w http.ResponseWriter, r *http.Request) {
	var req models.ResetPasswordRequest
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Email == "" || req.Password == "" || req.Salt == "" {
		Error(w, http.StatusBadRequest, "email, password, and salt are required")
		return
	}
	if req.WrappedCompanyKey == "" || req.PublicKey == "" {
		Error(w, http.StatusBadRequest, "wrapped_company_key and public_key are required")
		return
	}

	user, err := h.userRepo.GetByEmail(r.Context(), req.Email)
	if err != nil || user == nil {
		Error(w, http.StatusNotFound, "user not found")
		return
	}

	passwordHash := hashPassword(req.Password, req.Salt)

	err = h.userRepo.ResetPasswordWithKey(r.Context(), user.ID, passwordHash, req.Salt,
		req.WrappedCompanyKey, req.KeyWrapAlgorithm, req.PublicKey,
		r.RemoteAddr, r.UserAgent())
	if err != nil {
		Error(w, http.StatusInternalServerError, "password reset failed: "+err.Error())
		return
	}

	JSON(w, http.StatusOK, map[string]string{"status": "password reset successful"})
}

// ==================== LOAN HANDLERS ====================

func (h *Handler) getLoanTypes(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	types, err := h.loanRepo.GetLoanTypes(session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	if types == nil {
		types = []models.LoanType{}
	}
	JSON(w, http.StatusOK, map[string]interface{}{"loan_types": types})
}

func (h *Handler) createLoanType(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.LoanType
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Name == "" {
		Error(w, http.StatusBadRequest, "name is required")
		return
	}
	t, err := h.loanRepo.CreateLoanType(session.CompanyID, req.Name, req.Description,
		req.MaxAmount, req.InterestRate, req.MaxTermMonths, req.RequiresApproval)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	JSON(w, http.StatusCreated, t)
}

func (h *Handler) updateLoanType(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.LoanType
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id required")
		return
	}
	t, err := h.loanRepo.UpdateLoanType(req.ID, req.Name, req.Description,
		req.MaxAmount, req.InterestRate, req.MaxTermMonths, req.RequiresApproval)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	JSON(w, http.StatusOK, t)
}

func (h *Handler) deleteLoanType(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id required")
		return
	}
	if err := h.loanRepo.DeleteLoanType(req.ID); err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}

func (h *Handler) getLoans(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		Status string `json:"status"`
	}
	Decode(r, &req)

	loans, err := h.loanRepo.GetLoans(session.CompanyID, req.Status)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	if loans == nil {
		loans = []models.Loan{}
	}
	JSON(w, http.StatusOK, map[string]interface{}{"loans": loans})
}

func (h *Handler) getLoan(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id required")
		return
	}
	loan, err := h.loanRepo.GetLoan(req.ID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	JSON(w, http.StatusOK, loan)
}

func (h *Handler) createLoan(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.Loan
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.EmployeeID == "" {
		Error(w, http.StatusBadRequest, "employee_id is required")
		return
	}
	if req.Amount <= 0 {
		Error(w, http.StatusBadRequest, "amount must be greater than 0")
		return
	}
	if req.TermMonths <= 0 {
		req.TermMonths = 12
	}
	if req.AppliedDate == "" {
		req.AppliedDate = time.Now().Format("2006-01-02")
	}

	loan, err := h.loanRepo.CreateLoan(session.CompanyID, req.EmployeeID,
		req.LoanTypeID, req.LoanTypeName, req.Amount, req.InterestRate,
		req.TermMonths, req.MonthlyPayment, req.TotalPayable,
		req.AppliedDate, req.Notes)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	JSON(w, http.StatusCreated, loan)
}

func (h *Handler) approveLoan(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID        string `json:"id"`
		StartDate string `json:"start_date"`
		EndDate   string `json:"end_date"`
	}
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id required")
		return
	}
	if req.StartDate == "" {
		req.StartDate = time.Now().Format("2006-01-02")
	}
	if _, err := h.loanRepo.ApproveLoan(req.ID, session.UserID, req.StartDate, req.EndDate); err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "approved"})
}

func (h *Handler) rejectLoan(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID            string `json:"id"`
		RejectionNote string `json:"rejection_note"`
	}
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id required")
		return
	}
	if err := h.loanRepo.RejectLoan(req.ID, req.RejectionNote); err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "rejected"})
}

func (h *Handler) cancelLoan(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id required")
		return
	}
	if err := h.loanRepo.CancelLoan(req.ID); err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "cancelled"})
}

func (h *Handler) deleteLoan(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id required")
		return
	}
	if err := h.loanRepo.DeleteLoan(req.ID); err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}

func (h *Handler) getLoanPayments(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		LoanID string `json:"loan_id"`
	}
	if err := Decode(r, &req); err != nil || req.LoanID == "" {
		Error(w, http.StatusBadRequest, "loan_id required")
		return
	}
	payments, err := h.loanRepo.GetPayments(req.LoanID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	if payments == nil {
		payments = []models.LoanPayment{}
	}
	JSON(w, http.StatusOK, map[string]interface{}{"payments": payments})
}

func (h *Handler) recordLoanPayment(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.LoanPayment
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.LoanID == "" {
		Error(w, http.StatusBadRequest, "loan_id is required")
		return
	}
	if req.Amount <= 0 {
		Error(w, http.StatusBadRequest, "amount must be greater than 0")
		return
	}
	if req.PaymentDate == "" {
		req.PaymentDate = time.Now().Format("2006-01-02")
	}
	if req.PaymentType == "" {
		req.PaymentType = "Manual Payment"
	}

	p, err := h.loanRepo.RecordPayment(session.CompanyID, req.LoanID, req.PaymentDate,
		req.Amount, req.Principal, req.Interest, req.PaymentType, req.Notes)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	JSON(w, http.StatusCreated, p)
}

func (h *Handler) deleteLoanPayment(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id required")
		return
	}
	if err := h.loanRepo.DeletePayment(req.ID); err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}

// ==================== ACCOUNTING HANDLERS ====================

func (h *Handler) getAccounts(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		AccountType string `json:"account_type"`
		ActiveOnly  bool   `json:"active_only"`
	}
	Decode(r, &req)

	accounts, err := h.acctRepo.GetAccounts(session.CompanyID, req.AccountType, req.ActiveOnly)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	if accounts == nil {
		accounts = []models.Account{}
	}
	JSON(w, http.StatusOK, map[string]interface{}{"accounts": accounts})
}

func (h *Handler) getAccount(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id required")
		return
	}
	account, err := h.acctRepo.GetAccount(req.ID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	JSON(w, http.StatusOK, account)
}

func (h *Handler) createAccount(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.Account
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Code == "" || req.Name == "" || req.AccountType == "" {
		Error(w, http.StatusBadRequest, "code, name, account_type are required")
		return
	}
	if req.NormalBalance == "" {
		switch req.AccountType {
		case "Asset", "Expense":
			req.NormalBalance = "Debit"
		default:
			req.NormalBalance = "Credit"
		}
	}
	if req.Currency == "" {
		req.Currency = "PHP"
	}

	account, err := h.acctRepo.CreateAccount(session.CompanyID, req.Code, req.Name,
		req.AccountType, req.AccountSubtype, req.NormalBalance,
		req.ParentID, req.Description, req.Currency)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	JSON(w, http.StatusCreated, account)
}

func (h *Handler) updateAccount(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.Account
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id required")
		return
	}

	account, err := h.acctRepo.UpdateAccount(req.ID, req.Code, req.Name,
		req.AccountType, req.AccountSubtype, req.NormalBalance,
		req.ParentID, req.Description, req.IsActive, req.Currency)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	JSON(w, http.StatusOK, account)
}

func (h *Handler) deleteAccount(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id required")
		return
	}
	if err := h.acctRepo.DeleteAccount(req.ID); err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}

func (h *Handler) getAccountTree(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	accounts, err := h.acctRepo.GetAccountTree(session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	if accounts == nil {
		accounts = []models.Account{}
	}
	JSON(w, http.StatusOK, map[string]interface{}{"accounts": accounts})
}

func (h *Handler) toggleAccountActive(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id required")
		return
	}
	account, err := h.acctRepo.ToggleAccountActive(req.ID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	JSON(w, http.StatusOK, account)
}

func (h *Handler) checkAccountCode(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		Code      string `json:"code"`
		ExcludeID string `json:"exclude_id"`
	}
	if err := Decode(r, &req); err != nil || req.Code == "" {
		Error(w, http.StatusBadRequest, "code required")
		return
	}
	exists, err := h.acctRepo.CheckAccountCode(session.CompanyID, req.Code, req.ExcludeID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"exists": exists})
}

// ==================== COA TEMPLATE HANDLERS ====================

func (h *Handler) getCOATemplates(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	templates, err := h.acctRepo.GetCOATemplates(session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	if templates == nil {
		templates = []models.COATemplate{}
	}
	JSON(w, http.StatusOK, map[string]interface{}{"templates": templates})
}

func (h *Handler) getCOATemplateItems(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		TemplateID string `json:"template_id"`
	}
	if err := Decode(r, &req); err != nil || req.TemplateID == "" {
		Error(w, http.StatusBadRequest, "template_id required")
		return
	}
	items, err := h.acctRepo.GetCOATemplateItems(req.TemplateID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	if items == nil {
		items = []models.COATemplateItem{}
	}
	JSON(w, http.StatusOK, map[string]interface{}{"items": items})
}

func (h *Handler) createCOATemplate(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.COATemplate
	if err := Decode(r, &req); err != nil || req.Name == "" {
		Error(w, http.StatusBadRequest, "name required")
		return
	}
	tpl, err := h.acctRepo.CreateCOATemplate(session.CompanyID, req.Name, req.Country, req.Currency, req.Flag, req.Description, false)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	JSON(w, http.StatusCreated, tpl)
}

func (h *Handler) updateCOATemplate(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.COATemplate
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id required")
		return
	}
	tpl, err := h.acctRepo.UpdateCOATemplate(req.ID, req.Name, req.Country, req.Currency, req.Flag, req.Description)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	JSON(w, http.StatusOK, tpl)
}

func (h *Handler) deleteCOATemplate(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id required")
		return
	}
	if err := h.acctRepo.DeleteCOATemplate(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}

func (h *Handler) createCOATemplateItem(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.COATemplateItem
	if err := Decode(r, &req); err != nil || req.TemplateID == "" || req.Code == "" {
		Error(w, http.StatusBadRequest, "template_id and code required")
		return
	}
	if err := h.acctRepo.CreateCOATemplateItem(req.TemplateID, req.Code, req.Name,
		req.AccountType, req.AccountSubtype, req.NormalBalance, req.IsSystem, req.SortOrder); err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	JSON(w, http.StatusCreated, map[string]string{"message": "created"})
}

func (h *Handler) updateCOATemplateItem(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.COATemplateItem
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id required")
		return
	}
	if err := h.acctRepo.UpdateCOATemplateItem(req.ID, req.Code, req.Name,
		req.AccountType, req.AccountSubtype, req.NormalBalance, req.IsSystem, req.SortOrder); err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "updated"})
}

func (h *Handler) deleteCOATemplateItem(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id required")
		return
	}
	if err := h.acctRepo.DeleteCOATemplateItem(req.ID); err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}

func (h *Handler) duplicateCOATemplate(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		SourceID string `json:"source_id"`
		NewName  string `json:"new_name"`
	}
	if err := Decode(r, &req); err != nil || req.SourceID == "" || req.NewName == "" {
		Error(w, http.StatusBadRequest, "source_id and new_name required")
		return
	}
	tpl, err := h.acctRepo.DuplicateCOATemplate(req.SourceID, session.CompanyID, req.NewName)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
		return
	}
	JSON(w, http.StatusCreated, tpl)
}

func (h *Handler) applyCOATemplate(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		TemplateID    string `json:"template_id"`
		ClearExisting bool   `json:"clear_existing"`
	}
	if err := Decode(r, &req); err != nil || req.TemplateID == "" {
		Error(w, http.StatusBadRequest, "template_id required")
		return
	}

	// Get template items
	items, err := h.acctRepo.GetCOATemplateItems(req.TemplateID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to get items: "+err.Error())
		return
	}
	if len(items) == 0 {
		Error(w, http.StatusBadRequest, "template has no items")
		return
	}

	// Get template for currency
	tpl, err := h.acctRepo.GetCOATemplate(req.TemplateID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to get template: "+err.Error())
		return
	}

	if req.ClearExisting {
		if err := h.acctRepo.ClearAccounts(session.CompanyID); err != nil {
			Error(w, http.StatusInternalServerError, "failed to clear: "+err.Error())
			return
		}
	}

	currency := tpl.Currency
	if currency == "" {
		currency = "PHP"
	}

	for _, item := range items {
		if err := h.acctRepo.BulkCreateAccount(session.CompanyID, item.Code, item.Name,
			item.AccountType, item.AccountSubtype, item.NormalBalance, item.IsSystem, currency); err != nil {
			Error(w, http.StatusInternalServerError, "failed insert "+item.Code+": "+err.Error())
			return
		}
	}

	if err := h.acctRepo.LinkParentAccounts(session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, "failed linking: "+err.Error())
		return
	}

	JSON(w, http.StatusOK, map[string]interface{}{"message": "template applied", "count": len(items)})
}

// ==================== JOURNAL ENTRIES ====================

func (h *Handler) nextEntryNumber(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	n, err := h.acctRepo.NextEntryNumber(session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]interface{}{"next_number": n})
}

func (h *Handler) createJournalEntry(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		EntryDate  string `json:"entry_date"`
		Memo       string `json:"memo"`
		SourceType string `json:"source_type"`
		SourceID   string `json:"source_id"`
		Status     string `json:"status"`
		Lines      []struct {
			AccountID   string  `json:"account_id"`
			Description string  `json:"description"`
			Debit       float64 `json:"debit"`
			Credit      float64 `json:"credit"`
		} `json:"lines"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.EntryDate == "" || len(req.Lines) == 0 {
		Error(w, http.StatusBadRequest, "entry_date and lines required")
		return
	}

	entryNum, _ := h.acctRepo.NextEntryNumber(session.CompanyID)
	entryID := uuid.New().String()
	sourceType := req.SourceType
	if sourceType == "" {
		sourceType = "manual"
	}

	if err := h.acctRepo.CreateJournalEntry(entryID, session.CompanyID, entryNum, req.EntryDate, req.Memo, sourceType, req.SourceID, req.Status); err != nil {
		Error(w, http.StatusInternalServerError, "create entry: "+err.Error())
		return
	}

	for i, line := range req.Lines {
		if err := h.acctRepo.AddJournalLine(entryID, line.AccountID, line.Description, line.Debit, line.Credit, i); err != nil {
			Error(w, http.StatusInternalServerError, "add line: "+err.Error())
			return
		}
	}

	if err := h.acctRepo.UpdateJournalTotals(entryID); err != nil {
		Error(w, http.StatusInternalServerError, "update totals: "+err.Error())
		return
	}

	entry, _ := h.acctRepo.GetJournalEntry(entryID, session.CompanyID)
	JSON(w, http.StatusOK, entry)
}

func (h *Handler) getJournalEntries(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		Status     string `json:"status"`
		SourceType string `json:"source_type"`
		DateFrom   string `json:"date_from"`
		DateTo     string `json:"date_to"`
	}
	Decode(r, &req)

	entries, err := h.acctRepo.GetJournalEntries(session.CompanyID, req.Status, req.SourceType, req.DateFrom, req.DateTo, 200, 0)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if entries == nil {
		entries = []models.JournalEntry{}
	}
	JSON(w, http.StatusOK, entries)
}

func (h *Handler) getJournalEntry(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	entry, err := h.acctRepo.GetJournalEntry(req.ID, session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	ls, _ := h.acctRepo.GetJournalLines(req.ID)
	JSON(w, http.StatusOK, map[string]interface{}{"entry": entry, "lines": ls})
}

func (h *Handler) getJournalLines(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		EntryID string `json:"entry_id"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	ls, err := h.acctRepo.GetJournalLines(req.EntryID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if ls == nil {
		ls = []models.JournalLine{}
	}
	JSON(w, http.StatusOK, ls)
}

func (h *Handler) updateJournalEntry(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID        string `json:"id"`
		EntryDate string `json:"entry_date"`
		Memo      string `json:"memo"`
		Lines     []struct {
			AccountID   string  `json:"account_id"`
			Description string  `json:"description"`
			Debit       float64 `json:"debit"`
			Credit      float64 `json:"credit"`
		} `json:"lines"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}

	if err := h.acctRepo.UpdateJournalEntry(req.ID, session.CompanyID, req.EntryDate, req.Memo); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	if len(req.Lines) > 0 {
		h.acctRepo.ClearJournalLines(req.ID)
		for i, line := range req.Lines {
			h.acctRepo.AddJournalLine(req.ID, line.AccountID, line.Description, line.Debit, line.Credit, i)
		}
		h.acctRepo.UpdateJournalTotals(req.ID)
	}

	entry, _ := h.acctRepo.GetJournalEntry(req.ID, session.CompanyID)
	JSON(w, http.StatusOK, entry)
}

func (h *Handler) deleteJournalEntry(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := h.acctRepo.DeleteJournalEntry(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}

func (h *Handler) postJournalEntry(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := h.acctRepo.PostJournalEntry(req.ID, session.CompanyID, session.UserID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	entry, _ := h.acctRepo.GetJournalEntry(req.ID, session.CompanyID)
	JSON(w, http.StatusOK, entry)
}

func (h *Handler) voidJournalEntry(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID     string `json:"id"`
		Reason string `json:"reason"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := h.acctRepo.VoidJournalEntry(req.ID, session.CompanyID, session.UserID, req.Reason); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	entry, _ := h.acctRepo.GetJournalEntry(req.ID, session.CompanyID)
	JSON(w, http.StatusOK, entry)
}

// ==================== ACCOUNT MAPPINGS ====================

func (h *Handler) getAccountMappings(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	mappings, err := h.acctRepo.GetAccountMappings(session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if mappings == nil {
		mappings = []models.AccountMapping{}
	}
	JSON(w, http.StatusOK, mappings)
}

func (h *Handler) upsertAccountMapping(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		MappingKey  string `json:"mapping_key"`
		AccountID   string `json:"account_id"`
		Description string `json:"description"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	m, err := h.acctRepo.UpsertAccountMapping(session.CompanyID, req.MappingKey, req.AccountID, req.Description)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, m)
}

func (h *Handler) deleteAccountMapping(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		MappingKey string `json:"mapping_key"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	h.acctRepo.DeleteAccountMapping(session.CompanyID, req.MappingKey)
	JSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}

func (h *Handler) autoMapPayrollAccounts(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	mappings, err := h.acctRepo.AutoMapPayrollAccounts(session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, mappings)
}

// ==================== PAYROLL -> JOURNAL ====================

func (h *Handler) getPayrollRunTotals(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		RunID string `json:"run_id"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	totals, err := h.acctRepo.GetPayrollRunTotals(req.RunID, session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, totals)
}

func (h *Handler) generatePayrollJournal(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		RunID     string `json:"run_id"`
		EntryDate string `json:"entry_date"`
		Memo      string `json:"memo"`
		AutoPost  bool   `json:"auto_post"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.RunID == "" {
		Error(w, http.StatusBadRequest, "run_id required")
		return
	}

	// Get payroll totals
	totals, err := h.acctRepo.GetPayrollRunTotals(req.RunID, session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "fetch totals: "+err.Error())
		return
	}

	// Get account mappings
	mappings, err := h.acctRepo.GetAccountMappings(session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "fetch mappings: "+err.Error())
		return
	}
	mmap := make(map[string]string) // mapping_key -> account_id
	for _, m := range mappings {
		mmap[m.MappingKey] = m.AccountID
	}

	// Validate required mappings exist
	required := []string{"PAYROLL_SALARIES_DR", "PAYROLL_CASH_CR", "PAYROLL_SSS_PAYABLE_CR", "PAYROLL_PHILHEALTH_PAYABLE_CR", "PAYROLL_PAGIBIG_PAYABLE_CR", "PAYROLL_TAX_PAYABLE_CR", "PAYROLL_SSS_EXPENSE_DR", "PAYROLL_PHILHEALTH_EXPENSE_DR", "PAYROLL_PAGIBIG_EXPENSE_DR"}
	for _, k := range required {
		if mmap[k] == "" {
			Error(w, http.StatusBadRequest, "missing account mapping: "+k+". Run auto-map first.")
			return
		}
	}

	// Build journal lines
	type line struct {
		acctID string
		desc   string
		dr     float64
		cr     float64
	}
	var lines []line

	// DEBITS (expenses)
	if totals.TotalGross > 0 {
		lines = append(lines, line{mmap["PAYROLL_SALARIES_DR"], "Gross salaries and wages", totals.TotalGross, 0})
	}
	if totals.TotalSSSER > 0 {
		lines = append(lines, line{mmap["PAYROLL_SSS_EXPENSE_DR"], "SSS employer share", totals.TotalSSSER, 0})
	}
	sssECER := 0.0 // SSS EC is part of employer cost, comes from sss_er breakdown
	if mmap["PAYROLL_SSSEC_EXPENSE_DR"] != "" && sssECER > 0 {
		lines = append(lines, line{mmap["PAYROLL_SSSEC_EXPENSE_DR"], "SSS EC employer", sssECER, 0})
	}
	if totals.TotalPhilHealthER > 0 {
		lines = append(lines, line{mmap["PAYROLL_PHILHEALTH_EXPENSE_DR"], "PhilHealth employer share", totals.TotalPhilHealthER, 0})
	}
	if totals.TotalPagIBIGER > 0 {
		lines = append(lines, line{mmap["PAYROLL_PAGIBIG_EXPENSE_DR"], "Pag-IBIG employer share", totals.TotalPagIBIGER, 0})
	}

	// CREDITS (payables)
	sssTotal := totals.TotalSSSEE + totals.TotalSSSER
	if sssTotal > 0 {
		lines = append(lines, line{mmap["PAYROLL_SSS_PAYABLE_CR"], "SSS payable (EE + ER)", 0, sssTotal})
	}
	phTotal := totals.TotalPhilHealthEE + totals.TotalPhilHealthER
	if phTotal > 0 {
		lines = append(lines, line{mmap["PAYROLL_PHILHEALTH_PAYABLE_CR"], "PhilHealth payable (EE + ER)", 0, phTotal})
	}
	pgTotal := totals.TotalPagIBIGEE + totals.TotalPagIBIGER
	if pgTotal > 0 {
		lines = append(lines, line{mmap["PAYROLL_PAGIBIG_PAYABLE_CR"], "Pag-IBIG payable (EE + ER)", 0, pgTotal})
	}
	if totals.TotalTax > 0 {
		lines = append(lines, line{mmap["PAYROLL_TAX_PAYABLE_CR"], "Withholding tax payable", 0, totals.TotalTax})
	}
	if totals.TotalLoanDeduct > 0 && mmap["PAYROLL_LOANS_PAYABLE_CR"] != "" {
		lines = append(lines, line{mmap["PAYROLL_LOANS_PAYABLE_CR"], "Loan deductions", 0, totals.TotalLoanDeduct})
	}
	if totals.TotalBenefitDeduct > 0 && mmap["PAYROLL_BENEFITS_EXPENSE_DR"] != "" {
		// Benefits deducted from employee, credit goes to benefit payable or accrued
		lines = append(lines, line{mmap["PAYROLL_OTHER_DEDUCTIONS_CR"], "Benefit deductions", 0, totals.TotalBenefitDeduct})
	}
	if totals.TotalOtherDeduct > 0 && mmap["PAYROLL_OTHER_DEDUCTIONS_CR"] != "" {
		lines = append(lines, line{mmap["PAYROLL_OTHER_DEDUCTIONS_CR"], "Other deductions", 0, totals.TotalOtherDeduct})
	}
	// Net pay credit to cash
	if totals.TotalNetPay > 0 {
		lines = append(lines, line{mmap["PAYROLL_CASH_CR"], "Net pay disbursement", 0, totals.TotalNetPay})
	}

	// Create journal entry
	entryNum, _ := h.acctRepo.NextEntryNumber(session.CompanyID)
	entryID := uuid.New().String()
	entryDate := req.EntryDate
	if entryDate == "" {
		entryDate = time.Now().Format("2006-01-02")
	}
	memo := req.Memo
	if memo == "" {
		memo = fmt.Sprintf("Payroll run %d employees", totals.EmployeeCount)
	}

	if err := h.acctRepo.CreateJournalEntry(entryID, session.CompanyID, entryNum, entryDate, memo, "payroll", req.RunID, "Draft"); err != nil {
		Error(w, http.StatusInternalServerError, "create entry: "+err.Error())
		return
	}

	for i, l := range lines {
		if err := h.acctRepo.AddJournalLine(entryID, l.acctID, l.desc, l.dr, l.cr, i); err != nil {
			Error(w, http.StatusInternalServerError, "add line: "+err.Error())
			return
		}
	}
	h.acctRepo.UpdateJournalTotals(entryID)

	if req.AutoPost {
		if err := h.acctRepo.PostJournalEntry(entryID, session.CompanyID, session.UserID); err != nil {
			Error(w, http.StatusInternalServerError, "auto-post failed: "+err.Error())
			return
		}
	}

	entry, _ := h.acctRepo.GetJournalEntry(entryID, session.CompanyID)
	entryLines, _ := h.acctRepo.GetJournalLines(entryID)
	JSON(w, http.StatusOK, map[string]interface{}{"entry": entry, "lines": entryLines})
}

// ==================== GENERAL LEDGER ====================

func (h *Handler) getTrialBalance(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		DateFrom string `json:"date_from"`
		DateTo   string `json:"date_to"`
	}
	Decode(r, &req)

	rows, err := h.acctRepo.TrialBalance(session.CompanyID, req.DateFrom, req.DateTo)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if rows == nil {
		rows = []models.TrialBalanceRow{}
	}
	JSON(w, http.StatusOK, rows)
}

func (h *Handler) getAccountLedger(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		AccountID string `json:"account_id"`
		DateFrom  string `json:"date_from"`
		DateTo    string `json:"date_to"`
	}
	if err := Decode(r, &req); err != nil || req.AccountID == "" {
		Error(w, http.StatusBadRequest, "account_id required")
		return
	}

	txns, err := h.acctRepo.AccountLedger(session.CompanyID, req.AccountID, req.DateFrom, req.DateTo)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if txns == nil {
		txns = []models.LedgerTransaction{}
	}

	opening, _ := h.acctRepo.AccountOpeningBalance(session.CompanyID, req.AccountID, req.DateFrom)

	JSON(w, http.StatusOK, map[string]interface{}{
		"transactions":    txns,
		"opening_balance": opening,
	})
}

func (h *Handler) getLedgerSummary(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		DateFrom string `json:"date_from"`
		DateTo   string `json:"date_to"`
	}
	Decode(r, &req)

	period, err := h.acctRepo.LedgerPeriodSummary(session.CompanyID, req.DateFrom, req.DateTo)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	types, err := h.acctRepo.LedgerTypeSummary(session.CompanyID, req.DateFrom, req.DateTo)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if types == nil {
		types = []models.LedgerTypeSummary{}
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"period": period,
		"types":  types,
	})
}

// ==================== ACCOUNTS PAYABLE ====================

func (h *Handler) getVendors(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ActiveOnly bool `json:"active_only"`
	}
	Decode(r, &req)
	vendors, err := h.apRepo.GetVendors(session.CompanyID, req.ActiveOnly)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if vendors == nil {
		vendors = []models.Vendor{}
	}
	JSON(w, http.StatusOK, vendors)
}

func (h *Handler) getVendor(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id required")
		return
	}
	v, err := h.apRepo.GetVendor(req.ID, session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, v)
}

func (h *Handler) createVendor(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.Vendor
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Name == "" {
		Error(w, http.StatusBadRequest, "name required")
		return
	}
	req.ID = uuid.New().String()
	req.CompanyID = session.CompanyID
	if err := h.apRepo.CreateVendor(&req); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusCreated, req)
}

func (h *Handler) updateVendor(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.Vendor
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	req.CompanyID = session.CompanyID
	if err := h.apRepo.UpdateVendor(&req); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, req)
}

func (h *Handler) deleteVendor(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := h.apRepo.DeleteVendor(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}

func (h *Handler) toggleVendorActive(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := h.apRepo.ToggleVendorActive(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "toggled"})
}

func (h *Handler) getBills(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		Status   string `json:"status"`
		VendorID string `json:"vendor_id"`
		DateFrom string `json:"date_from"`
		DateTo   string `json:"date_to"`
	}
	Decode(r, &req)
	bills, err := h.apRepo.GetBills(session.CompanyID, req.Status, req.VendorID, req.DateFrom, req.DateTo)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if bills == nil {
		bills = []models.Bill{}
	}
	JSON(w, http.StatusOK, bills)
}

func (h *Handler) getBill(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id required")
		return
	}
	bill, err := h.apRepo.GetBill(req.ID, session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	items, _ := h.apRepo.GetBillItems(req.ID)
	payments, _ := h.apRepo.GetBillPayments(req.ID)
	JSON(w, http.StatusOK, map[string]interface{}{"bill": bill, "items": items, "payments": payments})
}

func (h *Handler) createBill(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		VendorID   string `json:"vendor_id"`
		BillNumber string `json:"bill_number"`
		BillDate   string `json:"bill_date"`
		DueDate    string `json:"due_date"`
		Memo       string `json:"memo"`
		Reference  string `json:"reference"`
		Items      []struct {
			AccountID   string  `json:"account_id"`
			Description string  `json:"description"`
			Quantity    float64 `json:"quantity"`
			UnitPrice   float64 `json:"unit_price"`
			TaxRate     float64 `json:"tax_rate"`
		} `json:"items"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.VendorID == "" || req.BillDate == "" {
		Error(w, http.StatusBadRequest, "vendor_id and bill_date required")
		return
	}

	billID := uuid.New().String()
	bill := &models.Bill{
		ID: billID, CompanyID: session.CompanyID, VendorID: req.VendorID,
		BillNumber: req.BillNumber, BillDate: req.BillDate, DueDate: req.DueDate,
		Memo: req.Memo, Reference: req.Reference,
	}
	if err := h.apRepo.CreateBill(bill); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	for i, item := range req.Items {
		amt := item.Quantity * item.UnitPrice
		taxAmt := amt * item.TaxRate / 100
		h.apRepo.AddBillItem(billID, item.AccountID, item.Description, item.Quantity, item.UnitPrice, amt, item.TaxRate, taxAmt, i)
	}
	h.apRepo.UpdateBillTotals(billID)

	result, _ := h.apRepo.GetBill(billID, session.CompanyID)
	JSON(w, http.StatusCreated, result)
}

func (h *Handler) updateBill(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID         string `json:"id"`
		VendorID   string `json:"vendor_id"`
		BillNumber string `json:"bill_number"`
		BillDate   string `json:"bill_date"`
		DueDate    string `json:"due_date"`
		Memo       string `json:"memo"`
		Reference  string `json:"reference"`
		Items      []struct {
			AccountID   string  `json:"account_id"`
			Description string  `json:"description"`
			Quantity    float64 `json:"quantity"`
			UnitPrice   float64 `json:"unit_price"`
			TaxRate     float64 `json:"tax_rate"`
		} `json:"items"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}

	bill := &models.Bill{
		ID: req.ID, CompanyID: session.CompanyID, VendorID: req.VendorID,
		BillNumber: req.BillNumber, BillDate: req.BillDate, DueDate: req.DueDate,
		Memo: req.Memo, Reference: req.Reference,
	}
	if err := h.apRepo.UpdateBill(bill); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	if len(req.Items) > 0 {
		h.apRepo.ClearBillItems(req.ID)
		for i, item := range req.Items {
			amt := item.Quantity * item.UnitPrice
			taxAmt := amt * item.TaxRate / 100
			h.apRepo.AddBillItem(req.ID, item.AccountID, item.Description, item.Quantity, item.UnitPrice, amt, item.TaxRate, taxAmt, i)
		}
		h.apRepo.UpdateBillTotals(req.ID)
	}

	result, _ := h.apRepo.GetBill(req.ID, session.CompanyID)
	JSON(w, http.StatusOK, result)
}

func (h *Handler) deleteBill(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := h.apRepo.DeleteBill(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}

func (h *Handler) approveBill(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := h.apRepo.ApproveBill(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	bill, _ := h.apRepo.GetBill(req.ID, session.CompanyID)
	JSON(w, http.StatusOK, bill)
}

func (h *Handler) voidBill(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := h.apRepo.VoidBill(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "voided"})
}

func (h *Handler) getBillItems(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		BillID string `json:"bill_id"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	items, err := h.apRepo.GetBillItems(req.BillID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if items == nil {
		items = []models.BillItem{}
	}
	JSON(w, http.StatusOK, items)
}

func (h *Handler) createBillPayment(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.BillPayment
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.BillID == "" || req.Amount <= 0 {
		Error(w, http.StatusBadRequest, "bill_id and positive amount required")
		return
	}
	req.ID = uuid.New().String()
	req.CompanyID = session.CompanyID
	if req.PaymentDate == "" {
		req.PaymentDate = time.Now().Format("2006-01-02")
	}

	if err := h.apRepo.CreateBillPayment(&req); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	bill, _ := h.apRepo.GetBill(req.BillID, session.CompanyID)
	JSON(w, http.StatusCreated, map[string]interface{}{"payment": req, "bill": bill})
}

func (h *Handler) getBillPayments(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		BillID string `json:"bill_id"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	payments, err := h.apRepo.GetBillPayments(req.BillID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if payments == nil {
		payments = []models.BillPayment{}
	}
	JSON(w, http.StatusOK, payments)
}

func (h *Handler) deleteBillPayment(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := h.apRepo.DeleteBillPayment(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}

func (h *Handler) getAPAging(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	aging, err := h.apRepo.GetAPAging(session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if aging == nil {
		aging = []models.APAging{}
	}
	JSON(w, http.StatusOK, aging)
}

func (h *Handler) getAPSummary(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	s, err := h.apRepo.GetAPSummary(session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, s)
}

// ==================== ACCOUNTS RECEIVABLE ====================

func (h *Handler) getCustomers(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ActiveOnly bool `json:"active_only"`
	}
	Decode(r, &req)
	c, err := h.arRepo.GetCustomers(session.CompanyID, req.ActiveOnly)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if c == nil {
		c = []models.Customer{}
	}
	JSON(w, http.StatusOK, c)
}
func (h *Handler) createCustomer(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.Customer
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Name == "" {
		Error(w, http.StatusBadRequest, "name required")
		return
	}
	req.ID = uuid.New().String()
	req.CompanyID = session.CompanyID
	if err := h.arRepo.CreateCustomer(&req); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusCreated, req)
}
func (h *Handler) updateCustomer(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.Customer
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	req.CompanyID = session.CompanyID
	if err := h.arRepo.UpdateCustomer(&req); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, req)
}
func (h *Handler) deleteCustomer(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	if err := h.arRepo.DeleteCustomer(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}
func (h *Handler) toggleCustomerActive(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	h.arRepo.ToggleCustomerActive(req.ID, session.CompanyID)
	JSON(w, http.StatusOK, map[string]string{"message": "toggled"})
}
func (h *Handler) getInvoices(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		Status     string `json:"status"`
		CustomerID string `json:"customer_id"`
		DateFrom   string `json:"date_from"`
		DateTo     string `json:"date_to"`
	}
	Decode(r, &req)
	inv, err := h.arRepo.GetInvoices(session.CompanyID, req.Status, req.CustomerID, req.DateFrom, req.DateTo)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if inv == nil {
		inv = []models.Invoice{}
	}
	JSON(w, http.StatusOK, inv)
}
func (h *Handler) getInvoice(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	inv, err := h.arRepo.GetInvoice(req.ID, session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	items, _ := h.arRepo.GetInvoiceItems(req.ID)
	payments, _ := h.arRepo.GetInvoicePayments(req.ID)
	JSON(w, http.StatusOK, map[string]interface{}{"invoice": inv, "items": items, "payments": payments})
}
func (h *Handler) createInvoice(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		CustomerID    string `json:"customer_id"`
		InvoiceNumber string `json:"invoice_number"`
		InvoiceDate   string `json:"invoice_date"`
		DueDate       string `json:"due_date"`
		Memo          string `json:"memo"`
		Reference     string `json:"reference"`
		Items         []struct {
			AccountID   string  `json:"account_id"`
			Description string  `json:"description"`
			Quantity    float64 `json:"quantity"`
			UnitPrice   float64 `json:"unit_price"`
			TaxRate     float64 `json:"tax_rate"`
		} `json:"items"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.CustomerID == "" || req.InvoiceDate == "" {
		Error(w, http.StatusBadRequest, "customer_id and invoice_date required")
		return
	}
	iid := uuid.New().String()
	inv := &models.Invoice{ID: iid, CompanyID: session.CompanyID, CustomerID: req.CustomerID, InvoiceNumber: req.InvoiceNumber, InvoiceDate: req.InvoiceDate, DueDate: req.DueDate, Memo: req.Memo, Reference: req.Reference}
	if err := h.arRepo.CreateInvoice(inv); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	for i, item := range req.Items {
		amt := item.Quantity * item.UnitPrice
		ta := amt * item.TaxRate / 100
		h.arRepo.AddInvoiceItem(iid, item.AccountID, item.Description, item.Quantity, item.UnitPrice, amt, item.TaxRate, ta, i)
	}
	h.arRepo.UpdateInvoiceTotals(iid)
	result, _ := h.arRepo.GetInvoice(iid, session.CompanyID)
	JSON(w, http.StatusCreated, result)
}
func (h *Handler) updateInvoice(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID            string `json:"id"`
		CustomerID    string `json:"customer_id"`
		InvoiceNumber string `json:"invoice_number"`
		InvoiceDate   string `json:"invoice_date"`
		DueDate       string `json:"due_date"`
		Memo          string `json:"memo"`
		Reference     string `json:"reference"`
		Items         []struct {
			AccountID   string  `json:"account_id"`
			Description string  `json:"description"`
			Quantity    float64 `json:"quantity"`
			UnitPrice   float64 `json:"unit_price"`
			TaxRate     float64 `json:"tax_rate"`
		} `json:"items"`
	}
	Decode(r, &req)
	inv := &models.Invoice{ID: req.ID, CompanyID: session.CompanyID, CustomerID: req.CustomerID, InvoiceNumber: req.InvoiceNumber, InvoiceDate: req.InvoiceDate, DueDate: req.DueDate, Memo: req.Memo, Reference: req.Reference}
	if err := h.arRepo.UpdateInvoice(inv); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if len(req.Items) > 0 {
		h.arRepo.ClearInvoiceItems(req.ID)
		for i, item := range req.Items {
			amt := item.Quantity * item.UnitPrice
			ta := amt * item.TaxRate / 100
			h.arRepo.AddInvoiceItem(req.ID, item.AccountID, item.Description, item.Quantity, item.UnitPrice, amt, item.TaxRate, ta, i)
		}
		h.arRepo.UpdateInvoiceTotals(req.ID)
	}
	result, _ := h.arRepo.GetInvoice(req.ID, session.CompanyID)
	JSON(w, http.StatusOK, result)
}
func (h *Handler) deleteInvoice(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	if err := h.arRepo.DeleteInvoice(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}
func (h *Handler) sendInvoice(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	if err := h.arRepo.SendInvoice(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	inv, _ := h.arRepo.GetInvoice(req.ID, session.CompanyID)
	JSON(w, http.StatusOK, inv)
}
func (h *Handler) voidInvoice(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	if err := h.arRepo.VoidInvoice(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "voided"})
}
func (h *Handler) createInvoicePayment(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.InvoicePayment
	Decode(r, &req)
	if req.InvoiceID == "" || req.Amount <= 0 {
		Error(w, http.StatusBadRequest, "invoice_id and positive amount required")
		return
	}
	req.ID = uuid.New().String()
	req.CompanyID = session.CompanyID
	if req.PaymentDate == "" {
		req.PaymentDate = time.Now().Format("2006-01-02")
	}
	if err := h.arRepo.CreateInvoicePayment(&req); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	inv, _ := h.arRepo.GetInvoice(req.InvoiceID, session.CompanyID)
	JSON(w, http.StatusCreated, map[string]interface{}{"payment": req, "invoice": inv})
}
func (h *Handler) getInvoicePayments(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		InvoiceID string `json:"invoice_id"`
	}
	Decode(r, &req)
	p, _ := h.arRepo.GetInvoicePayments(req.InvoiceID)
	if p == nil {
		p = []models.InvoicePayment{}
	}
	JSON(w, http.StatusOK, p)
}
func (h *Handler) deleteInvoicePayment(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	h.arRepo.DeleteInvoicePayment(req.ID, session.CompanyID)
	JSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}
func (h *Handler) getARAging(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	a, _ := h.arRepo.GetARAging(session.CompanyID)
	if a == nil {
		a = []models.ARAging{}
	}
	JSON(w, http.StatusOK, a)
}
func (h *Handler) getARSummary(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	s, _ := h.arRepo.GetARSummary(session.CompanyID)
	JSON(w, http.StatusOK, s)
}

// ==================== TAX MANAGEMENT ====================

func (h *Handler) getTaxSummary(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		DateFrom string `json:"date_from"`
		DateTo   string `json:"date_to"`
	}
	Decode(r, &req)
	rows, _ := h.taxRepo.TaxSummary(session.CompanyID, req.DateFrom, req.DateTo)
	if rows == nil {
		rows = []models.TaxAccountRow{}
	}
	JSON(w, http.StatusOK, rows)
}
func (h *Handler) getTaxDetail(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		AccountID string `json:"account_id"`
		DateFrom  string `json:"date_from"`
		DateTo    string `json:"date_to"`
	}
	Decode(r, &req)
	rows, _ := h.taxRepo.TaxDetail(session.CompanyID, req.AccountID, req.DateFrom, req.DateTo)
	if rows == nil {
		rows = []models.TaxDetail{}
	}
	JSON(w, http.StatusOK, rows)
}
func (h *Handler) getVATComputation(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		DateFrom string `json:"date_from"`
		DateTo   string `json:"date_to"`
	}
	Decode(r, &req)
	v, _ := h.taxRepo.VATComputation(session.CompanyID, req.DateFrom, req.DateTo)
	JSON(w, http.StatusOK, v)
}

// ==================== BANK RECONCILIATION ====================

func (h *Handler) getBankAccounts(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	a, _ := h.bankRepo.GetBankAccounts(session.CompanyID)
	if a == nil {
		a = []models.BankAccount{}
	}
	JSON(w, http.StatusOK, a)
}
func (h *Handler) getBankTransactions(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		AccountID  string `json:"account_id"`
		Reconciled int    `json:"reconciled"`
	}
	req.Reconciled = -1
	Decode(r, &req)
	t, _ := h.bankRepo.GetBankTransactions(session.CompanyID, req.AccountID, req.Reconciled)
	if t == nil {
		t = []models.BankTransaction{}
	}
	JSON(w, http.StatusOK, t)
}
func (h *Handler) createBankTransaction(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.BankTransaction
	Decode(r, &req)
	req.ID = uuid.New().String()
	req.CompanyID = session.CompanyID
	if err := h.bankRepo.CreateBankTransaction(&req); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusCreated, req)
}
func (h *Handler) reconcileTransaction(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID      string `json:"id"`
		EntryID string `json:"entry_id"`
	}
	Decode(r, &req)
	h.bankRepo.ReconcileTransaction(req.ID, session.CompanyID, req.EntryID)
	JSON(w, http.StatusOK, map[string]string{"message": "reconciled"})
}
func (h *Handler) unreconcileTransaction(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	h.bankRepo.UnreconcileTransaction(req.ID, session.CompanyID)
	JSON(w, http.StatusOK, map[string]string{"message": "unreconciled"})
}
func (h *Handler) deleteBankTransaction(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	h.bankRepo.DeleteBankTransaction(req.ID, session.CompanyID)
	JSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}
func (h *Handler) getReconSummary(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		AccountID string `json:"account_id"`
	}
	Decode(r, &req)
	s, _ := h.bankRepo.GetReconSummary(session.CompanyID, req.AccountID)
	JSON(w, http.StatusOK, s)
}
func (h *Handler) getUnmatchedJournalLines(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		AccountID string `json:"account_id"`
	}
	Decode(r, &req)
	l, _ := h.bankRepo.GetUnmatchedJournalLines(session.CompanyID, req.AccountID)
	if l == nil {
		l = []models.UnmatchedJournalLine{}
	}
	JSON(w, http.StatusOK, l)
}

// ==================== FINANCIAL REPORTS ====================

func (h *Handler) getIncomeStatement(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		DateFrom string `json:"date_from"`
		DateTo   string `json:"date_to"`
	}
	Decode(r, &req)
	rows, _ := h.reportsRepo.IncomeStatement(session.CompanyID, req.DateFrom, req.DateTo)
	if rows == nil {
		rows = []models.ReportRow{}
	}
	JSON(w, http.StatusOK, rows)
}
func (h *Handler) getBalanceSheet(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		AsOf string `json:"as_of"`
	}
	Decode(r, &req)
	rows, _ := h.reportsRepo.BalanceSheet(session.CompanyID, req.AsOf)
	if rows == nil {
		rows = []models.ReportRow{}
	}
	JSON(w, http.StatusOK, rows)
}
func (h *Handler) getCashFlow(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		DateFrom string `json:"date_from"`
		DateTo   string `json:"date_to"`
	}
	Decode(r, &req)
	rows, _ := h.reportsRepo.CashFlow(session.CompanyID, req.DateFrom, req.DateTo)
	if rows == nil {
		rows = []models.CashFlowRow{}
	}
	JSON(w, http.StatusOK, rows)
}

// ==================== TICKET CATEGORIES ====================

func (h *Handler) getTicketCategories(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	cats, err := h.ticketRepo.GetCategories(session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if cats == nil {
		cats = []models.TicketCategory{}
	}
	JSON(w, http.StatusOK, cats)
}

func (h *Handler) createTicketCategory(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.TicketCategory
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Name == "" {
		Error(w, http.StatusBadRequest, "name required")
		return
	}
	req.ID = uuid.New().String()
	req.CompanyID = session.CompanyID
	if err := h.ticketRepo.CreateCategory(&req); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusCreated, req)
}

func (h *Handler) updateTicketCategory(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.TicketCategory
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	req.CompanyID = session.CompanyID
	if err := h.ticketRepo.UpdateCategory(&req); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, req)
}

func (h *Handler) deleteTicketCategory(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	if err := h.ticketRepo.DeleteCategory(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}

func (h *Handler) seedTicketCategories(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	if err := h.ticketRepo.SeedCategories(session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	cats, _ := h.ticketRepo.GetCategories(session.CompanyID)
	JSON(w, http.StatusOK, cats)
}

// ==================== TICKETS ====================

func (h *Handler) getTickets(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		Status   string `json:"status"`
		Priority string `json:"priority"`
		Category string `json:"category_id"`
		Assigned string `json:"assigned_to"`
		Created  string `json:"created_by"`
	}
	Decode(r, &req)
	tickets, err := h.ticketRepo.GetTickets(session.CompanyID, req.Status, req.Priority, req.Category, req.Assigned, req.Created)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if tickets == nil {
		tickets = []models.Ticket{}
	}
	JSON(w, http.StatusOK, tickets)
}

func (h *Handler) getTicket(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	ticket, err := h.ticketRepo.GetTicket(req.ID, session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	comments, _ := h.ticketRepo.GetComments(req.ID)
	if comments == nil {
		comments = []models.TicketComment{}
	}
	JSON(w, http.StatusOK, map[string]interface{}{"ticket": ticket, "comments": comments})
}

func (h *Handler) createTicket(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		Subject     string `json:"subject"`
		Description string `json:"description"`
		CategoryID  string `json:"category_id"`
		Priority    string `json:"priority"`
		AssignedTo  string `json:"assigned_to"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Subject == "" {
		Error(w, http.StatusBadRequest, "subject required")
		return
	}

	t := &models.Ticket{
		ID: uuid.New().String(), CompanyID: session.CompanyID,
		Subject: req.Subject, Description: req.Description,
		CategoryID: req.CategoryID, Priority: req.Priority,
		CreatedBy: session.UserID, AssignedTo: req.AssignedTo,
	}
	num, err := h.ticketRepo.CreateTicket(t)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	t.TicketNumber = num
	result, _ := h.ticketRepo.GetTicket(t.ID, session.CompanyID)
	if result != nil {
		JSON(w, http.StatusCreated, result)
	} else {
		JSON(w, http.StatusCreated, t)
	}
}

func (h *Handler) updateTicket(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID          string `json:"id"`
		Subject     string `json:"subject"`
		Description string `json:"description"`
		CategoryID  string `json:"category_id"`
		Priority    string `json:"priority"`
		AssignedTo  string `json:"assigned_to"`
	}
	Decode(r, &req)
	t := &models.Ticket{
		ID: req.ID, CompanyID: session.CompanyID,
		Subject: req.Subject, Description: req.Description,
		CategoryID: req.CategoryID, Priority: req.Priority, AssignedTo: req.AssignedTo,
	}
	if err := h.ticketRepo.UpdateTicket(t); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	result, _ := h.ticketRepo.GetTicket(req.ID, session.CompanyID)
	JSON(w, http.StatusOK, result)
}

func (h *Handler) updateTicketStatus(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	}
	Decode(r, &req)
	if err := h.ticketRepo.UpdateStatus(req.ID, session.CompanyID, req.Status); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	result, _ := h.ticketRepo.GetTicket(req.ID, session.CompanyID)
	JSON(w, http.StatusOK, result)
}

func (h *Handler) assignTicket(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID         string `json:"id"`
		AssignedTo string `json:"assigned_to"`
	}
	Decode(r, &req)
	if err := h.ticketRepo.AssignTicket(req.ID, session.CompanyID, req.AssignedTo); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	result, _ := h.ticketRepo.GetTicket(req.ID, session.CompanyID)
	JSON(w, http.StatusOK, result)
}

func (h *Handler) deleteTicket(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	if err := h.ticketRepo.DeleteTicket(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}

// ==================== COMMENTS ====================

func (h *Handler) addTicketComment(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		TicketID   string `json:"ticket_id"`
		Content    string `json:"content"`
		IsInternal bool   `json:"is_internal"`
	}
	Decode(r, &req)
	if req.TicketID == "" || req.Content == "" {
		Error(w, http.StatusBadRequest, "ticket_id and content required")
		return
	}
	c := &models.TicketComment{
		ID: uuid.New().String(), TicketID: req.TicketID,
		AuthorID: session.UserID, Content: req.Content, IsInternal: req.IsInternal,
	}
	if err := h.ticketRepo.AddComment(c); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusCreated, c)
}

func (h *Handler) getTicketComments(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		TicketID string `json:"ticket_id"`
	}
	Decode(r, &req)
	comments, _ := h.ticketRepo.GetComments(req.TicketID)
	if comments == nil {
		comments = []models.TicketComment{}
	}
	JSON(w, http.StatusOK, comments)
}

func (h *Handler) deleteTicketComment(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	h.ticketRepo.DeleteComment(req.ID)
	JSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}

// ==================== STATS ====================

func (h *Handler) getTicketStats(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	stats, _ := h.ticketRepo.GetStats(session.CompanyID)
	catStats, _ := h.ticketRepo.GetCategoryStats(session.CompanyID)
	if catStats == nil {
		catStats = []models.TicketCategoryStats{}
	}
	JSON(w, http.StatusOK, map[string]interface{}{"stats": stats, "categories": catStats})
}

// ==================== WORK SCHEDULES ====================

func (h *Handler) getWorkSchedules(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	schedules, err := h.schedRepo.GetByCompany(r.Context(), session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if schedules == nil {
		schedules = []models.WorkSchedule{}
	}
	JSON(w, http.StatusOK, schedules)
}

func (h *Handler) getWorkSchedule(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)

	sched, err := h.schedRepo.GetByID(r.Context(), req.ID, session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if sched == nil {
		Error(w, http.StatusNotFound, "schedule not found")
		return
	}

	days, _ := h.schedRepo.GetDays(r.Context(), req.ID)
	if days == nil {
		days = []models.WorkScheduleDay{}
	}
	sched.Days = days

	defaults, _ := h.schedRepo.GetDefaultsBySchedule(r.Context(), req.ID, session.CompanyID)
	if defaults == nil {
		defaults = []models.WorkScheduleDefault{}
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"schedule": sched,
		"defaults": defaults,
	})
}

func (h *Handler) createWorkSchedule(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.WorkSchedule
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Name == "" {
		Error(w, http.StatusBadRequest, "name required")
		return
	}
	req.ID = uuid.New().String()
	req.CompanyID = session.CompanyID
	meta := getMeta(r, session)

	if err := h.schedRepo.Create(r.Context(), &req, meta); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusCreated, req)
}

func (h *Handler) updateWorkSchedule(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.WorkSchedule
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.ID == "" {
		Error(w, http.StatusBadRequest, "id required")
		return
	}
	req.CompanyID = session.CompanyID
	meta := getMeta(r, session)

	if err := h.schedRepo.Update(r.Context(), &req, meta); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, req)
}

func (h *Handler) deleteWorkSchedule(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	meta := getMeta(r, session)

	if err := h.schedRepo.Delete(r.Context(), req.ID, meta); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}

// ==================== SCHEDULE DAYS ====================

func (h *Handler) getWorkScheduleDays(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ScheduleID string `json:"schedule_id"`
	}
	Decode(r, &req)
	days, err := h.schedRepo.GetDays(r.Context(), req.ScheduleID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if days == nil {
		days = []models.WorkScheduleDay{}
	}
	JSON(w, http.StatusOK, days)
}

func (h *Handler) saveWorkScheduleDays(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ScheduleID string                   `json:"schedule_id"`
		Days       []models.WorkScheduleDay `json:"days"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}

	ctx := r.Context()
	h.schedRepo.ClearDays(ctx, req.ScheduleID)

	for i := range req.Days {
		d := &req.Days[i]
		if d.ID == "" {
			d.ID = uuid.New().String()
		}
		d.ScheduleID = req.ScheduleID
		if err := h.schedRepo.UpsertDay(ctx, d); err != nil {
			Error(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	days, _ := h.schedRepo.GetDays(ctx, req.ScheduleID)
	if days == nil {
		days = []models.WorkScheduleDay{}
	}
	JSON(w, http.StatusOK, days)
}

// ==================== SCHEDULE DEFAULTS ====================

func (h *Handler) getWorkScheduleDefaults(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	defaults, err := h.schedRepo.GetDefaults(r.Context(), session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if defaults == nil {
		defaults = []models.WorkScheduleDefault{}
	}
	JSON(w, http.StatusOK, defaults)
}

func (h *Handler) upsertWorkScheduleDefault(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.WorkScheduleDefault
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.ScheduleID == "" || req.Scope == "" || req.ScopeValue == "" {
		Error(w, http.StatusBadRequest, "schedule_id, scope, and scope_value required")
		return
	}
	if req.ID == "" {
		req.ID = uuid.New().String()
	}
	req.CompanyID = session.CompanyID
	meta := getMeta(r, session)

	if err := h.schedRepo.UpsertDefault(r.Context(), &req, meta); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, req)
}

func (h *Handler) deleteWorkScheduleDefault(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	meta := getMeta(r, session)

	if err := h.schedRepo.DeleteDefault(r.Context(), req.ID, meta); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}

// ==================== SCHEDULE RESOLUTION ====================

func (h *Handler) resolveEmployeeSchedule(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		EmployeeID string `json:"employee_id"`
	}
	Decode(r, &req)

	resolved, err := h.schedRepo.ResolveEmployeeSchedule(r.Context(), req.EmployeeID, session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if resolved == nil {
		JSON(w, http.StatusOK, map[string]interface{}{"schedule": nil, "resolved_from": "none"})
		return
	}
	JSON(w, http.StatusOK, resolved)
}

func (h *Handler) getScheduleRoster(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		Date string `json:"date"`
	}
	Decode(r, &req)

	entries, err := h.schedRepo.GetRoster(r.Context(), session.CompanyID, req.Date)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if entries == nil {
		entries = []models.RosterEntry{}
	}
	JSON(w, http.StatusOK, entries)
}

func (h *Handler) bulkAssignSchedule(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		EmployeeIDs []string `json:"employee_ids"`
		ScheduleID  string   `json:"schedule_id"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if len(req.EmployeeIDs) == 0 {
		Error(w, http.StatusBadRequest, "employee_ids required")
		return
	}
	meta := getMeta(r, session)

	if err := h.schedRepo.BulkAssign(r.Context(), session.CompanyID, req.EmployeeIDs, req.ScheduleID, meta); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]interface{}{
		"message": "assigned",
		"count":   len(req.EmployeeIDs),
	})
}
