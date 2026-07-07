package api

import (
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"strings"
	"time"

	"lettersheets/internal/config"
	"lettersheets/internal/models"
	"lettersheets/internal/repository"

	"github.com/google/uuid"
	"golang.org/x/crypto/argon2"
)

type Handler struct {
	db             *sql.DB
	regRepo        *repository.RegistrationRepo
	companyRepo    *repository.CompanyRepo
	userRepo       *repository.UserRepo
	accessRepo     *repository.AccessRepo
	sessionRepo    *repository.SessionRepo
	historyRepo    *repository.ChangeHistoryRepo
	benefitRepo    *repository.BenefitRepo
	employeeRepo   *repository.EmployeeRepo
	deptRepo       *repository.DepartmentRepo
	posRepo        *repository.PositionRepo
	attendRepo     *repository.AttendanceRepo
	leaveRepo      *repository.LeaveRepo
	payrollRepo    *repository.PayrollRepo
	onbRepo        *repository.OnboardingRepo
	loanRepo       *repository.LoanRepo
	acctRepo       *repository.AccountingRepo
	apRepo         *repository.APRepo
	arRepo         *repository.ARRepo
	taxRepo        *repository.TaxRepo
	bankRepo       *repository.BankRepo
	reportsRepo    *repository.ReportsRepo
	ticketRepo     *repository.TicketRepo
	schedRepo      *repository.WorkScheduleRepo
	complianceRepo *repository.ComplianceRepo
	invRepo        *repository.InventoryRepo
	faRepo         *repository.FixedAssetsRepo
	soRepo         *repository.SalesRepo
	procRepo       *repository.ProcurementRepo
	returnsRepo    *repository.ReturnsRepo
	cfg            *config.AppConfig
}

func NewHandler(
	db *sql.DB,
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
	complianceRepo *repository.ComplianceRepo,
	invRepo *repository.InventoryRepo,
	faRepo *repository.FixedAssetsRepo,
	soRepo *repository.SalesRepo,
	procRepo *repository.ProcurementRepo,
	returnsRepo *repository.ReturnsRepo,
	cfg *config.AppConfig,
) *Handler {
	trustProxyHeaders = cfg.Server.TrustProxyHeaders
	return &Handler{
		db:             db,
		regRepo:        regRepo,
		companyRepo:    companyRepo,
		userRepo:       userRepo,
		accessRepo:     accessRepo,
		sessionRepo:    sessionRepo,
		historyRepo:    historyRepo,
		benefitRepo:    benefitRepo,
		employeeRepo:   employeeRepo,
		deptRepo:       deptRepo,
		posRepo:        posRepo,
		attendRepo:     attendRepo,
		leaveRepo:      leaveRepo,
		payrollRepo:    payrollRepo,
		onbRepo:        onbRepo,
		loanRepo:       loanRepo,
		acctRepo:       acctRepo,
		apRepo:         apRepo,
		arRepo:         arRepo,
		taxRepo:        taxRepo,
		bankRepo:       bankRepo,
		reportsRepo:    reportsRepo,
		ticketRepo:     ticketRepo,
		schedRepo:      schedRepo,
		complianceRepo: complianceRepo,
		invRepo:        invRepo,
		faRepo:         faRepo,
		soRepo:         soRepo,
		procRepo:       procRepo,
		returnsRepo:    returnsRepo,
		cfg:            cfg,
	}
}

// POST /api/execute?action=xxx
func (h *Handler) Execute(w http.ResponseWriter, r *http.Request) {
	action := r.URL.Query().Get("action")

	// health is reachable via GET so load balancers / container health checks
	// (which probe with GET) work.
	if action == "health" {
		JSON(w, http.StatusOK, map[string]string{"status": "ok"})
		return
	}

	if r.Method != http.MethodPost {
		Error(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

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

	case "request_password_reset":
		h.requestPasswordReset(w, r)

	case "reset_password":
		h.resetPassword(w, r)

	case "admin_reset_password":
		h.withAuth(w, r, h.adminResetPassword)

	case "create_employee_account":
		h.withAuth(w, r, h.createEmployeeAccount)

	case "update_permissions":
		h.withAuth(w, r, h.updatePermissions)

	case "get_permissions":
		h.withAuth(w, r, h.getPermissions)

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
	case "get_customer":
		h.withAuth(w, r, h.getCustomer)
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
	case "get_labels":
		h.withAuth(w, r, h.getLabels)
	case "create_label":
		h.withAuth(w, r, h.createLabel)
	case "update_label":
		h.withAuth(w, r, h.updateLabel)
	case "delete_label":
		h.withAuth(w, r, h.deleteLabel)
	case "add_ticket_label":
		h.withAuth(w, r, h.addTicketLabel)
	case "remove_ticket_label":
		h.withAuth(w, r, h.removeTicketLabel)
	case "update_ticket_comment":
		h.withAuth(w, r, h.updateTicketComment)
	case "toggle_comment_reaction":
		h.withAuth(w, r, h.toggleCommentReaction)

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

	// --- Compliance ---
	case "get_compliance_templates":
		h.withAuth(w, r, h.getComplianceTemplates)
	case "get_compliance_agencies":
		h.withAuth(w, r, h.getComplianceAgencies)
	case "apply_compliance_template":
		h.withAuth(w, r, h.applyComplianceTemplate)
	case "create_compliance_agency":
		h.withAuth(w, r, h.createComplianceAgency)
	case "update_compliance_agency":
		h.withAuth(w, r, h.updateComplianceAgency)
	case "delete_compliance_agency":
		h.withAuth(w, r, h.deleteComplianceAgency)

	// --- Inventory ---
	case "get_inv_stats":
		h.withAuth(w, r, h.getInvStats)
	case "get_inv_low_stock":
		h.withAuth(w, r, h.getInvLowStock)
	case "get_inv_categories":
		h.withAuth(w, r, h.getInvCategories)
	case "create_inv_category":
		h.withAuth(w, r, h.createInvCategory)
	case "update_inv_category":
		h.withAuth(w, r, h.updateInvCategory)
	case "delete_inv_category":
		h.withAuth(w, r, h.deleteInvCategory)
	case "get_inv_warehouses":
		h.withAuth(w, r, h.getInvWarehouses)
	case "create_inv_warehouse":
		h.withAuth(w, r, h.createInvWarehouse)
	case "update_inv_warehouse":
		h.withAuth(w, r, h.updateInvWarehouse)
	case "delete_inv_warehouse":
		h.withAuth(w, r, h.deleteInvWarehouse)
	case "get_inv_suppliers":
		h.withAuth(w, r, h.getInvSuppliers)
	case "create_inv_supplier":
		h.withAuth(w, r, h.createInvSupplier)
	case "update_inv_supplier":
		h.withAuth(w, r, h.updateInvSupplier)
	case "delete_inv_supplier":
		h.withAuth(w, r, h.deleteInvSupplier)
	case "get_inv_products":
		h.withAuth(w, r, h.getInvProducts)
	case "get_inv_product":
		h.withAuth(w, r, h.getInvProduct)
	case "create_inv_product":
		h.withAuth(w, r, h.createInvProduct)
	case "update_inv_product":
		h.withAuth(w, r, h.updateInvProduct)
	case "toggle_inv_product":
		h.withAuth(w, r, h.toggleInvProduct)
	case "delete_inv_product":
		h.withAuth(w, r, h.deleteInvProduct)
	case "get_inv_movements":
		h.withAuth(w, r, h.getInvMovements)
	case "record_inv_movement":
		h.withAuth(w, r, h.recordInvMovement)
	case "transfer_inv_stock":
		h.withAuth(w, r, h.transferInvStock)
	case "get_inv_stock_levels":
		h.withAuth(w, r, h.getInvStockLevels)
	case "get_inv_settings":
		h.withAuth(w, r, h.getInvSettings)
	case "save_inv_settings":
		h.withAuth(w, r, h.saveInvSettings)
	case "get_purchase_orders":
		h.withAuth(w, r, h.getPurchaseOrders)
	case "get_purchase_order":
		h.withAuth(w, r, h.getPurchaseOrder)
	case "create_purchase_order":
		h.withAuth(w, r, h.createPurchaseOrder)
	case "update_purchase_order":
		h.withAuth(w, r, h.updatePurchaseOrder)
	case "delete_purchase_order":
		h.withAuth(w, r, h.deletePurchaseOrder)
	case "update_po_status":
		h.withAuth(w, r, h.updatePOStatus)
	case "add_po_item":
		h.withAuth(w, r, h.addPOItem)
	case "delete_po_item":
		h.withAuth(w, r, h.deletePOItem)
	case "receive_purchase_order":
		h.withAuth(w, r, h.receivePurchaseOrder)

	// --- Fixed Assets ---
	case "get_fa_stats":
		h.withAuth(w, r, h.getFAStats)
	case "get_fa_categories":
		h.withAuth(w, r, h.getFACategories)
	case "create_fa_category":
		h.withAuth(w, r, h.createFACategory)
	case "update_fa_category":
		h.withAuth(w, r, h.updateFACategory)
	case "delete_fa_category":
		h.withAuth(w, r, h.deleteFACategory)
	case "get_fa_assets":
		h.withAuth(w, r, h.getFAAssets)
	case "get_fa_asset":
		h.withAuth(w, r, h.getFAAsset)
	case "create_fa_asset":
		h.withAuth(w, r, h.createFAAsset)
	case "update_fa_asset":
		h.withAuth(w, r, h.updateFAAsset)
	case "delete_fa_asset":
		h.withAuth(w, r, h.deleteFAAsset)
	case "get_fa_depreciation_schedule":
		h.withAuth(w, r, h.getFADepreciationSchedule)
	case "get_fa_runs":
		h.withAuth(w, r, h.getFARuns)
	case "run_fa_depreciation":
		h.withAuth(w, r, h.runFADepreciation)
	case "void_fa_run":
		h.withAuth(w, r, h.voidFARun)
	case "get_fa_disposals":
		h.withAuth(w, r, h.getFADisposals)
	case "create_fa_disposal":
		h.withAuth(w, r, h.createFADisposal)
	case "get_fa_maintenance":
		h.withAuth(w, r, h.getFAMaintenance)
	case "create_fa_maintenance":
		h.withAuth(w, r, h.createFAMaintenance)
	case "update_fa_maintenance":
		h.withAuth(w, r, h.updateFAMaintenance)
	case "delete_fa_maintenance":
		h.withAuth(w, r, h.deleteFAMaintenance)
	case "get_fa_transfers":
		h.withAuth(w, r, h.getFATransfers)
	case "create_fa_transfer":
		h.withAuth(w, r, h.createFATransfer)
	case "get_fa_revaluations":
		h.withAuth(w, r, h.getFARevaluations)
	case "create_fa_revaluation":
		h.withAuth(w, r, h.createFARevaluation)
	case "get_fa_settings":
		h.withAuth(w, r, h.getFASettings)
	case "save_fa_settings":
		h.withAuth(w, r, h.saveFASettings)

	// --- Sales / Order Management ---
	case "get_so_stats":
		h.withAuth(w, r, h.getSOStats)
	case "get_so_backorders":
		h.withAuth(w, r, h.getSOBackorders)
	case "get_so_settings":
		h.withAuth(w, r, h.getSOSettings)
	case "save_so_settings":
		h.withAuth(w, r, h.saveSOSettings)
	case "resolve_so_price":
		h.withAuth(w, r, h.resolveSOPrice)
	case "check_so_availability":
		h.withAuth(w, r, h.checkSOAvailability)
	case "get_so_price_lists":
		h.withAuth(w, r, h.getSOPriceLists)
	case "get_so_price_list":
		h.withAuth(w, r, h.getSOPriceList)
	case "create_so_price_list":
		h.withAuth(w, r, h.createSOPriceList)
	case "update_so_price_list":
		h.withAuth(w, r, h.updateSOPriceList)
	case "delete_so_price_list":
		h.withAuth(w, r, h.deleteSOPriceList)
	case "add_so_price_list_item":
		h.withAuth(w, r, h.addSOPriceListItem)
	case "delete_so_price_list_item":
		h.withAuth(w, r, h.deleteSOPriceListItem)
	case "get_so_quotes":
		h.withAuth(w, r, h.getSOQuotes)
	case "get_so_quote":
		h.withAuth(w, r, h.getSOQuote)
	case "create_so_quote":
		h.withAuth(w, r, h.createSOQuote)
	case "update_so_quote":
		h.withAuth(w, r, h.updateSOQuote)
	case "update_so_quote_status":
		h.withAuth(w, r, h.updateSOQuoteStatus)
	case "delete_so_quote":
		h.withAuth(w, r, h.deleteSOQuote)
	case "convert_so_quote":
		h.withAuth(w, r, h.convertSOQuote)
	case "get_so_orders":
		h.withAuth(w, r, h.getSOOrders)
	case "get_so_order":
		h.withAuth(w, r, h.getSOOrder)
	case "create_so_order":
		h.withAuth(w, r, h.createSOOrder)
	case "update_so_order":
		h.withAuth(w, r, h.updateSOOrder)
	case "confirm_so_order":
		h.withAuth(w, r, h.confirmSOOrder)
	case "cancel_so_order":
		h.withAuth(w, r, h.cancelSOOrder)
	case "close_so_order":
		h.withAuth(w, r, h.closeSOOrder)
	case "delete_so_order":
		h.withAuth(w, r, h.deleteSOOrder)
	case "get_so_reservations":
		h.withAuth(w, r, h.getSOReservations)
	case "get_so_shipments":
		h.withAuth(w, r, h.getSOShipments)
	case "create_so_shipment":
		h.withAuth(w, r, h.createSOShipment)
	case "cancel_so_shipment":
		h.withAuth(w, r, h.cancelSOShipment)
	case "mark_so_shipment_delivered":
		h.withAuth(w, r, h.markSOShipmentDelivered)
	case "generate_so_invoice":
		h.withAuth(w, r, h.generateSOInvoice)

	// --- Procurement / Purchase-to-Pay ---
	case "get_pur_stats":
		h.withAuth(w, r, h.getPurStats)
	case "get_pur_settings":
		h.withAuth(w, r, h.getPurSettings)
	case "save_pur_settings":
		h.withAuth(w, r, h.savePurSettings)
	case "get_pur_requisitions":
		h.withAuth(w, r, h.getPurRequisitions)
	case "get_pur_requisition":
		h.withAuth(w, r, h.getPurRequisition)
	case "create_pur_requisition":
		h.withAuth(w, r, h.createPurRequisition)
	case "update_pur_requisition":
		h.withAuth(w, r, h.updatePurRequisition)
	case "submit_pur_requisition":
		h.withAuth(w, r, h.submitPurRequisition)
	case "approve_pur_requisition":
		h.withAuth(w, r, h.approvePurRequisition)
	case "reject_pur_requisition":
		h.withAuth(w, r, h.rejectPurRequisition)
	case "delete_pur_requisition":
		h.withAuth(w, r, h.deletePurRequisition)
	case "convert_pur_requisition":
		h.withAuth(w, r, h.convertPurRequisition)
	case "get_pur_orders":
		h.withAuth(w, r, h.getPurOrders)
	case "get_pur_order":
		h.withAuth(w, r, h.getPurOrder)
	case "create_pur_order":
		h.withAuth(w, r, h.createPurOrder)
	case "update_pur_order":
		h.withAuth(w, r, h.updatePurOrder)
	case "approve_pur_order":
		h.withAuth(w, r, h.approvePurOrder)
	case "cancel_pur_order":
		h.withAuth(w, r, h.cancelPurOrder)
	case "close_pur_order":
		h.withAuth(w, r, h.closePurOrder)
	case "delete_pur_order":
		h.withAuth(w, r, h.deletePurOrder)
	case "get_pur_receipts":
		h.withAuth(w, r, h.getPurReceipts)
	case "get_pur_receivable":
		h.withAuth(w, r, h.getPurReceivable)
	case "create_pur_receipt":
		h.withAuth(w, r, h.createPurReceipt)
	case "cancel_pur_receipt":
		h.withAuth(w, r, h.cancelPurReceipt)
	case "get_pur_billable":
		h.withAuth(w, r, h.getPurBillable)
	case "generate_pur_bill":
		h.withAuth(w, r, h.generatePurBill)

	// --- Returns: AR credit memos ---
	case "get_ar_returns_stats":
		h.withAuth(w, r, h.getReturnsStatsAR)
	case "get_credit_memos":
		h.withAuth(w, r, h.getCreditMemos)
	case "get_credit_memo":
		h.withAuth(w, r, h.getCreditMemo)
	case "get_cm_creditable":
		h.withAuth(w, r, h.getCMCreditable)
	case "create_credit_memo":
		h.withAuth(w, r, h.createCreditMemo)
	case "update_credit_memo":
		h.withAuth(w, r, h.updateCreditMemo)
	case "delete_credit_memo":
		h.withAuth(w, r, h.deleteCreditMemo)
	case "post_credit_memo":
		h.withAuth(w, r, h.postCreditMemo)
	case "apply_credit_memo":
		h.withAuth(w, r, h.applyCreditMemo)
	case "refund_credit_memo":
		h.withAuth(w, r, h.refundCreditMemo)
	case "void_credit_memo":
		h.withAuth(w, r, h.voidCreditMemo)

	// --- Returns: AP debit memos ---
	case "get_ap_returns_stats":
		h.withAuth(w, r, h.getReturnsStatsAP)
	case "get_debit_memos":
		h.withAuth(w, r, h.getDebitMemos)
	case "get_debit_memo":
		h.withAuth(w, r, h.getDebitMemo)
	case "get_dm_creditable":
		h.withAuth(w, r, h.getDMCreditable)
	case "create_debit_memo":
		h.withAuth(w, r, h.createDebitMemo)
	case "update_debit_memo":
		h.withAuth(w, r, h.updateDebitMemo)
	case "delete_debit_memo":
		h.withAuth(w, r, h.deleteDebitMemo)
	case "post_debit_memo":
		h.withAuth(w, r, h.postDebitMemo)
	case "apply_debit_memo":
		h.withAuth(w, r, h.applyDebitMemo)
	case "refund_debit_memo":
		h.withAuth(w, r, h.refundDebitMemo)
	case "void_debit_memo":
		h.withAuth(w, r, h.voidDebitMemo)

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

	// Server-side authorization. The UI hides actions via permissions.js, but
	// that is cosmetic — enforce the same policy here so an authenticated user
	// cannot invoke a privileged action by calling the API directly.
	if !authorize(r.URL.Query().Get("action"), session) {
		Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	fn(w, r, session)
}

// perm is a required (module, function) permission, matching MODULE_REGISTRY in
// app/web/src/utils/permissions.js.
type perm struct{ module, fn string }

// actionPerm maps a protected action to the module permission it requires.
//
// Actions NOT listed here require only a valid session — these are reads
// (get_*), self-service create/own-data actions (clock_in/out, create_leave,
// create_loan, change_password, ...), and the company/user/access/permission
// management actions that already perform an explicit inline role check inside
// their handler (delete_company, create_user, update_permissions, ...). Listing
// those here too would double-gate them, so they are intentionally omitted.
//
// superadmin/admin bypass every entry below (see Permissions.IsSuperAdmin).
// Where a management action has no exact matching function in MODULE_REGISTRY
// (e.g. work schedules, which the UI groups under attendance), it is mapped to
// the closest existing module/function.
var actionPerm = map[string]perm{
	// --- Employees / org structure ---
	"create_employee":   {"employees", "create"},
	"update_employee":   {"employees", "edit"},
	"delete_employee":   {"employees", "delete"},
	"get_permissions":   {"employees", "view"},
	"create_department": {"departments", "create"},
	"update_department": {"departments", "edit"},
	"delete_department": {"departments", "delete"},
	"create_position":   {"positions", "create"},
	"update_position":   {"positions", "edit"},
	"delete_position":   {"positions", "delete"},

	// --- Attendance / work schedules (UI groups schedules under attendance) ---
	"create_attendance":            {"attendance", "create"},
	"update_attendance":            {"attendance", "edit"},
	"delete_attendance":            {"attendance", "delete"},
	"create_work_schedule":         {"attendance", "edit"},
	"update_work_schedule":         {"attendance", "edit"},
	"delete_work_schedule":         {"attendance", "delete"},
	"save_work_schedule_days":      {"attendance", "edit"},
	"bulk_assign_schedule":         {"attendance", "edit"},
	"upsert_work_schedule_default": {"attendance", "edit"},
	"delete_work_schedule_default": {"attendance", "delete"},

	// --- Leave (create is self-service; approve/delete are privileged) ---
	"approve_leave": {"leave", "approve"},
	"delete_leave":  {"leave", "delete"},

	// --- Payroll ---
	"create_payroll_run":        {"payroll", "create"},
	"update_payroll_run":        {"payroll", "create"},
	"delete_payroll_run":        {"payroll", "create"},
	"save_payroll_item":         {"payroll", "create"},
	"generate_payroll_journal":  {"payroll", "approve"},
	"save_payroll_settings":     {"payroll", "settings"},
	"auto_map_payroll_accounts": {"payroll", "settings"},

	// --- Benefits ---
	"create_benefit": {"benefits", "create"},
	"update_benefit": {"benefits", "edit"},
	"delete_benefit": {"benefits", "delete"},

	// --- Loans (create is self-service application; rest are privileged) ---
	"approve_loan":        {"loans", "approve"},
	"reject_loan":         {"loans", "reject"},
	"cancel_loan":         {"loans", "approve"},
	"delete_loan":         {"loans", "delete"},
	"record_loan_payment": {"loans", "payments"},
	"delete_loan_payment": {"loans", "payments"},
	"create_loan_type":    {"loans", "create"},
	"update_loan_type":    {"loans", "create"},
	"delete_loan_type":    {"loans", "delete"},

	// --- Compliance ---
	"create_compliance_agency":  {"compliance", "create"},
	"update_compliance_agency":  {"compliance", "edit"},
	"delete_compliance_agency":  {"compliance", "delete"},
	"apply_compliance_template": {"compliance", "create"},

	// --- Onboarding ---
	"create_onboarding_checklist": {"onboarding", "create"},
	"delete_onboarding_checklist": {"onboarding", "delete"},
	"create_onboarding_template":  {"onboarding", "create"},
	"update_onboarding_template":  {"onboarding", "edit"},
	"delete_onboarding_template":  {"onboarding", "delete"},
	"add_onboarding_item":         {"onboarding", "edit"},
	"delete_onboarding_item":      {"onboarding", "delete"},
	"update_onboarding_status":    {"onboarding", "edit"},
	"toggle_onboarding_item":      {"onboarding", "edit"},

	// --- Accounting: chart of accounts ---
	"create_account":        {"accounting", "create"},
	"update_account":        {"accounting", "edit"},
	"delete_account":        {"accounting", "delete"},
	"toggle_account_active": {"accounting", "edit"},

	// --- Accounting: journal / general ledger ---
	"create_journal_entry": {"accounting", "create"},
	"update_journal_entry": {"accounting", "edit"},
	"delete_journal_entry": {"accounting", "delete"},
	"post_journal_entry":   {"accounting", "edit"},
	"void_journal_entry":   {"accounting", "edit"},

	// --- Accounting: AR (customers / invoices) ---
	"create_customer":        {"accounting", "create"},
	"update_customer":        {"accounting", "edit"},
	"delete_customer":        {"accounting", "delete"},
	"toggle_customer_active": {"accounting", "edit"},
	"create_invoice":         {"accounting", "create"},
	"update_invoice":         {"accounting", "edit"},
	"delete_invoice":         {"accounting", "delete"},
	"void_invoice":           {"accounting", "edit"},
	"send_invoice":           {"accounting", "edit"},
	"create_invoice_payment": {"accounting", "create"},
	"delete_invoice_payment": {"accounting", "delete"},

	// --- Accounting: AP (vendors / bills) ---
	"create_vendor":        {"accounting", "create"},
	"update_vendor":        {"accounting", "edit"},
	"delete_vendor":        {"accounting", "delete"},
	"toggle_vendor_active": {"accounting", "edit"},
	"create_bill":          {"accounting", "create"},
	"update_bill":          {"accounting", "edit"},
	"delete_bill":          {"accounting", "delete"},
	"void_bill":            {"accounting", "edit"},
	"approve_bill":         {"accounting", "edit"},
	"create_bill_payment":  {"accounting", "create"},
	"delete_bill_payment":  {"accounting", "delete"},

	// --- Accounting: bank & reconciliation ---
	"create_bank_transaction": {"accounting", "create"},
	"delete_bank_transaction": {"accounting", "delete"},
	"reconcile_transaction":   {"accounting", "edit"},
	"unreconcile_transaction": {"accounting", "edit"},

	// --- Accounting: chart-of-accounts templates & mappings ---
	"create_coa_template":      {"accounting", "create"},
	"update_coa_template":      {"accounting", "edit"},
	"delete_coa_template":      {"accounting", "delete"},
	"duplicate_coa_template":   {"accounting", "create"},
	"apply_coa_template":       {"accounting", "create"},
	"create_coa_template_item": {"accounting", "create"},
	"update_coa_template_item": {"accounting", "edit"},
	"delete_coa_template_item": {"accounting", "delete"},
	"upsert_account_mapping":   {"accounting", "edit"},
	"delete_account_mapping":   {"accounting", "delete"},

	// --- Ticketing (create ticket/comment is open to any authenticated user) ---
	"assign_ticket":          {"ticketing", "edit"},
	"update_ticket":          {"ticketing", "edit"},
	"update_ticket_status":   {"ticketing", "edit"},
	"delete_ticket":          {"ticketing", "delete"},
	"delete_ticket_comment":  {"ticketing", "delete"},
	"create_ticket_category": {"ticketing", "edit"},
	"update_ticket_category": {"ticketing", "edit"},
	"delete_ticket_category": {"ticketing", "delete"},
	"seed_ticket_categories": {"ticketing", "edit"},
	// Labels + ticket-label associations (reading labels stays open like categories)
	"create_label":        {"ticketing", "edit"},
	"update_label":        {"ticketing", "edit"},
	"delete_label":        {"ticketing", "delete"},
	"add_ticket_label":    {"ticketing", "edit"},
	"remove_ticket_label": {"ticketing", "edit"},

	// --- Inventory (reads require only a valid session) ---
	"create_inv_category":    {"inventory", "create"},
	"update_inv_category":    {"inventory", "edit"},
	"delete_inv_category":    {"inventory", "delete"},
	"create_inv_warehouse":   {"inventory", "create"},
	"update_inv_warehouse":   {"inventory", "edit"},
	"delete_inv_warehouse":   {"inventory", "delete"},
	"create_inv_supplier":    {"inventory", "create"},
	"update_inv_supplier":    {"inventory", "edit"},
	"delete_inv_supplier":    {"inventory", "delete"},
	"create_inv_product":     {"inventory", "create"},
	"update_inv_product":     {"inventory", "edit"},
	"toggle_inv_product":     {"inventory", "edit"},
	"delete_inv_product":     {"inventory", "delete"},
	"record_inv_movement":    {"inventory", "create"},
	"transfer_inv_stock":     {"inventory", "create"},
	"save_inv_settings":      {"inventory", "edit"},
	"create_purchase_order":  {"inventory", "create"},
	"update_purchase_order":  {"inventory", "edit"},
	"delete_purchase_order":  {"inventory", "delete"},
	"update_po_status":       {"inventory", "edit"},
	"add_po_item":            {"inventory", "edit"},
	"delete_po_item":         {"inventory", "edit"},
	"receive_purchase_order": {"inventory", "edit"},

	// --- Fixed Assets (reads require only a valid session) ---
	"create_fa_category":    {"fixed_assets", "create"},
	"update_fa_category":    {"fixed_assets", "edit"},
	"delete_fa_category":    {"fixed_assets", "delete"},
	"create_fa_asset":       {"fixed_assets", "create"},
	"update_fa_asset":       {"fixed_assets", "edit"},
	"delete_fa_asset":       {"fixed_assets", "delete"},
	"run_fa_depreciation":   {"fixed_assets", "create"},
	"void_fa_run":           {"fixed_assets", "delete"},
	"create_fa_disposal":    {"fixed_assets", "create"},
	"create_fa_maintenance": {"fixed_assets", "create"},
	"update_fa_maintenance": {"fixed_assets", "edit"},
	"delete_fa_maintenance": {"fixed_assets", "delete"},
	"create_fa_transfer":    {"fixed_assets", "create"},
	"create_fa_revaluation": {"fixed_assets", "create"},
	"save_fa_settings":      {"fixed_assets", "edit"},

	// --- Sales / Order Management (reads require only a valid session) ---
	"save_so_settings":           {"sales", "edit"},
	"create_so_price_list":       {"sales", "create"},
	"update_so_price_list":       {"sales", "edit"},
	"delete_so_price_list":       {"sales", "delete"},
	"add_so_price_list_item":     {"sales", "edit"},
	"delete_so_price_list_item":  {"sales", "edit"},
	"create_so_quote":            {"sales", "create"},
	"update_so_quote":            {"sales", "edit"},
	"update_so_quote_status":     {"sales", "edit"},
	"delete_so_quote":            {"sales", "delete"},
	"convert_so_quote":           {"sales", "create"},
	"create_so_order":            {"sales", "create"},
	"update_so_order":            {"sales", "edit"},
	"confirm_so_order":           {"sales", "edit"},
	"cancel_so_order":            {"sales", "edit"},
	"close_so_order":             {"sales", "edit"},
	"delete_so_order":            {"sales", "delete"},
	"create_so_shipment":         {"sales", "create"},
	"cancel_so_shipment":         {"sales", "edit"},
	"mark_so_shipment_delivered": {"sales", "edit"},
	"generate_so_invoice":        {"sales", "create"},

	// --- Procurement / Purchase-to-Pay (reads require only a valid session) ---
	"save_pur_settings":       {"procurement", "edit"},
	"create_pur_requisition":  {"procurement", "create"},
	"update_pur_requisition":  {"procurement", "edit"},
	"submit_pur_requisition":  {"procurement", "edit"},
	"approve_pur_requisition": {"procurement", "edit"},
	"reject_pur_requisition":  {"procurement", "edit"},
	"delete_pur_requisition":  {"procurement", "delete"},
	"convert_pur_requisition": {"procurement", "create"},
	"create_pur_order":        {"procurement", "create"},
	"update_pur_order":        {"procurement", "edit"},
	"approve_pur_order":       {"procurement", "edit"},
	"cancel_pur_order":        {"procurement", "edit"},
	"close_pur_order":         {"procurement", "edit"},
	"delete_pur_order":        {"procurement", "delete"},
	"create_pur_receipt":      {"procurement", "create"},
	"cancel_pur_receipt":      {"procurement", "edit"},
	"generate_pur_bill":       {"procurement", "create"},

	// --- Returns: AR credit memos (Sales module) / AP debit memos (Procurement module) ---
	"create_credit_memo": {"sales", "create"},
	"update_credit_memo": {"sales", "edit"},
	"delete_credit_memo": {"sales", "delete"},
	"post_credit_memo":   {"sales", "create"},
	"apply_credit_memo":  {"sales", "edit"},
	"refund_credit_memo": {"sales", "edit"},
	"void_credit_memo":   {"sales", "delete"},
	"create_debit_memo":  {"procurement", "create"},
	"update_debit_memo":  {"procurement", "edit"},
	"delete_debit_memo":  {"procurement", "delete"},
	"post_debit_memo":    {"procurement", "create"},
	"apply_debit_memo":   {"procurement", "edit"},
	"refund_debit_memo":  {"procurement", "edit"},
	"void_debit_memo":    {"procurement", "delete"},
}

// authorize enforces the actionPerm policy. Actions absent from the map require
// only a valid session (already checked by withAuth).
func authorize(action string, session *models.UserSession) bool {
	req, ok := actionPerm[action]
	if !ok {
		return true
	}
	return NewPermissions(session.Permissions, session.Role).Can(req.module, req.fn)
}

// trustProxyHeaders is set once at handler construction from config. When true,
// clientIP derives the caller IP from proxy headers; otherwise it uses the
// direct socket address (which cannot be spoofed by the client).
var trustProxyHeaders bool

// clientIP returns the best-effort caller IP for audit logging.
func clientIP(r *http.Request) string {
	if trustProxyHeaders {
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			// First hop is the original client.
			if i := strings.IndexByte(xff, ','); i >= 0 {
				return strings.TrimSpace(xff[:i])
			}
			return strings.TrimSpace(xff)
		}
		if xrip := r.Header.Get("X-Real-IP"); xrip != "" {
			return strings.TrimSpace(xrip)
		}
	}
	return r.RemoteAddr
}

func getMeta(r *http.Request, session *models.UserSession) *models.RequestMeta {
	return &models.RequestMeta{
		UserID:    session.UserID,
		SessionID: session.ID,
		CompanyID: session.CompanyID,
		IPAddress: clientIP(r),
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
		ServerError(w, "register", err)
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
	// Delete child items first to avoid FK constraint errors
	items, err := h.onbRepo.GetItems(r.Context(), req.ID)
	if err == nil {
		for _, it := range items {
			_ = h.onbRepo.DeleteItem(r.Context(), it.ID)
		}
	}
	if err := h.onbRepo.DeleteChecklist(r.Context(), req.ID, getMeta(r, session)); err != nil {
		Error(w, http.StatusInternalServerError, "failed: "+err.Error())
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
			PaySchedule:      "semi_monthly",
			OTMultiplier:     1.25,
			WorkingDays:      22,
			HoursPerDay:      8,
			EnableSSS:        true,
			EnablePhilHealth: true,
			EnablePagibig:    true,
			EnableTax:        true,
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
	var req struct {
		models.Employee

		// Optional: auto-create user account
		CreateAccount        bool   `json:"create_account"`
		AccountEmail         string `json:"account_email"`
		AccountUsername      string `json:"account_username"`
		AccountPassword      string `json:"account_password"`
		AccountSalt          string `json:"account_salt"`
		WrappedCompanyKey    []byte `json:"wrapped_company_key"`
		KeyWrapAlgorithm     string `json:"key_wrap_algorithm"`
		KeyExchangeAlgorithm string `json:"key_exchange_algorithm"`
		PublicKey            []byte `json:"public_key"`
		SigningPublicKey     []byte `json:"signing_public_key"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	if req.FirstName == "" || req.LastName == "" {
		Error(w, http.StatusBadRequest, "first_name and last_name are required")
		return
	}

	req.Employee.ID = uuid.New().String()
	req.Employee.CompanyID = session.CompanyID
	meta := getMeta(r, session)

	if err := h.employeeRepo.Create(r.Context(), &req.Employee, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to create employee: "+err.Error())
		return
	}

	result := map[string]interface{}{
		"employee": req.Employee,
	}

	// Auto-create user account if requested
	if req.CreateAccount {
		if req.AccountEmail == "" || req.AccountUsername == "" || req.AccountPassword == "" || req.AccountSalt == "" {
			Error(w, http.StatusBadRequest, "account_email, account_username, account_password, and account_salt are required for account creation")
			return
		}
		if len(req.WrappedCompanyKey) == 0 || len(req.PublicKey) == 0 {
			Error(w, http.StatusBadRequest, "wrapped_company_key and public_key are required for account creation")
			return
		}

		existing, err := h.userRepo.GetByEmail(r.Context(), req.AccountEmail)
		if err != nil {
			Error(w, http.StatusInternalServerError, "failed to check existing user")
			return
		}
		if existing != nil {
			Error(w, http.StatusConflict, "email already registered")
			return
		}

		userID := uuid.New().String()
		accessID := uuid.New().String()
		accountHash := hashPassword(req.AccountPassword, req.AccountSalt)

		err = h.userRepo.Create(r.Context(), &models.User{
			ID:           userID,
			Email:        req.AccountEmail,
			Username:     req.AccountUsername,
			PasswordHash: accountHash,
			Salt:         req.AccountSalt,
		}, meta)
		if err != nil {
			Error(w, http.StatusInternalServerError, "failed to create user account: "+err.Error())
			return
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
			KeyWrapAlgorithm:     req.KeyWrapAlgorithm,
			KeyExchangeAlgorithm: kexAlgorithm,
			PublicKey:            req.PublicKey,
			SigningPublicKey:     req.SigningPublicKey,
			Role:                 models.RoleEmployee,
		}, meta)
		if err != nil {
			ServerError(w, "grant company access", err)
			return
		}

		h.employeeRepo.LinkUser(r.Context(), req.Employee.ID, userID, meta)

		result["user_id"] = userID
		result["access_id"] = accessID
		result["account_created"] = true
	}

	JSON(w, http.StatusCreated, result)
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

// requestPasswordReset issues a random challenge the client must sign with its
// recovery ML-DSA key to prove account ownership before resetPassword will act.
func (h *Handler) requestPasswordReset(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if err := Decode(r, &req); err != nil || req.Email == "" {
		Error(w, http.StatusBadRequest, "email is required")
		return
	}

	challenge := make([]byte, 32)
	if _, err := rand.Read(challenge); err != nil {
		Error(w, http.StatusInternalServerError, "failed to generate challenge")
		return
	}
	challengeID := uuid.New().String()

	// Only persist (and thus make usable) a challenge for a real user. For an
	// unknown email we still return a well-formed challenge so this endpoint does
	// not reveal whether an address is registered; that challenge simply never
	// verifies at reset time.
	if user, uErr := h.userRepo.GetByEmail(r.Context(), req.Email); uErr == nil && user != nil {
		expiresAt := time.Now().Add(15 * time.Minute)
		if err := h.userRepo.CreateResetChallenge(r.Context(), challengeID, user.ID, challenge, expiresAt); err != nil {
			Error(w, http.StatusInternalServerError, "failed to create reset challenge")
			return
		}
	}

	JSON(w, http.StatusOK, map[string]string{
		"challenge_id": challengeID,
		"challenge":    base64.StdEncoding.EncodeToString(challenge),
	})
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

	// Proof of possession (C2): the caller must sign a server-issued challenge
	// with the account's ML-DSA recovery signing key. Without this, anyone who
	// knows an email could overwrite the account's password and key material.
	if req.ChallengeID == "" || req.Signature == "" {
		Error(w, http.StatusBadRequest, "challenge_id and signature are required")
		return
	}
	sig, decErr := base64.StdEncoding.DecodeString(req.Signature)
	if decErr != nil {
		Error(w, http.StatusBadRequest, "invalid signature encoding")
		return
	}
	chUserID, challenge, expiresAt, used, found, chErr := h.userRepo.GetResetChallenge(r.Context(), req.ChallengeID)
	if chErr != nil {
		Error(w, http.StatusInternalServerError, "password reset failed")
		return
	}
	if !found || used || time.Now().After(expiresAt) || chUserID != user.ID {
		Error(w, http.StatusForbidden, "invalid or expired reset challenge")
		return
	}
	signingKeys, keyErr := h.userRepo.GetUserSigningKeys(r.Context(), user.ID)
	if keyErr != nil {
		Error(w, http.StatusInternalServerError, "password reset failed")
		return
	}
	verified := false
	for _, pk := range signingKeys {
		if verifyMLDSA65(pk, challenge, sig) {
			verified = true
			break
		}
	}
	if !verified {
		Error(w, http.StatusForbidden, "signature verification failed")
		return
	}
	// Atomically consume the challenge; this is the real single-use gate.
	consumed, consErr := h.userRepo.ConsumeResetChallenge(r.Context(), req.ChallengeID)
	if consErr != nil || !consumed {
		Error(w, http.StatusForbidden, "invalid or expired reset challenge")
		return
	}

	passwordHash := hashPassword(req.Password, req.Salt)

	err = h.userRepo.ResetPasswordWithKey(r.Context(), user.ID, passwordHash, req.Salt,
		req.WrappedCompanyKey, req.KeyWrapAlgorithm, req.KeyExchangeAlgorithm,
		req.PublicKey, req.SigningPublicKey,
		r.RemoteAddr, r.UserAgent())
	if err != nil {
		Error(w, http.StatusInternalServerError, "password reset failed: "+err.Error())
		return
	}

	JSON(w, http.StatusOK, map[string]string{"status": "password reset successful"})
}

// ==================== ADMIN RESET EMPLOYEE PASSWORD ====================

func (h *Handler) adminResetPassword(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	if session.Role != models.RoleSuperAdmin && session.Role != models.RoleAdmin {
		Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	var req struct {
		UserID               string `json:"user_id"`
		Password             string `json:"password"`
		Salt                 string `json:"salt"`
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

	if req.UserID == "" || req.Password == "" || req.Salt == "" {
		Error(w, http.StatusBadRequest, "user_id, password, and salt are required")
		return
	}
	if len(req.WrappedCompanyKey) == 0 || len(req.PublicKey) == 0 {
		Error(w, http.StatusBadRequest, "wrapped_company_key and public_key are required")
		return
	}

	user, err := h.userRepo.GetByID(r.Context(), req.UserID)
	if err != nil || user == nil {
		Error(w, http.StatusNotFound, "user not found")
		return
	}

	passwordHash := hashPassword(req.Password, req.Salt)

	kexAlg := req.KeyExchangeAlgorithm
	if kexAlg == "" {
		kexAlg = "ML-KEM-768"
	}
	kwAlg := req.KeyWrapAlgorithm
	if kwAlg == "" {
		kwAlg = "AES-KW"
	}

	err = h.userRepo.AdminResetPassword(r.Context(), req.UserID, passwordHash, req.Salt,
		req.WrappedCompanyKey, kwAlg, kexAlg,
		req.PublicKey, req.SigningPublicKey,
		r.RemoteAddr, r.UserAgent(),
	)
	if err != nil {
		Error(w, http.StatusInternalServerError, "password reset failed: "+err.Error())
		return
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"status":   "password reset successful",
		"username": user.Username,
	})
}

func (h *Handler) createEmployeeAccount(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	if session.Role != models.RoleSuperAdmin && session.Role != models.RoleAdmin {
		Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	var req struct {
		EmployeeID           string `json:"employee_id"`
		Email                string `json:"email"`
		Username             string `json:"username"`
		Password             string `json:"password"`
		Salt                 string `json:"salt"`
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

	if req.EmployeeID == "" || req.Email == "" || req.Username == "" || req.Password == "" || req.Salt == "" {
		Error(w, http.StatusBadRequest, "employee_id, email, username, password, and salt are required")
		return
	}
	if len(req.WrappedCompanyKey) == 0 || len(req.PublicKey) == 0 {
		Error(w, http.StatusBadRequest, "wrapped_company_key and public_key are required")
		return
	}

	passwordHash := hashPassword(req.Password, req.Salt)
	meta := getMeta(r, session)

	kexAlg := req.KeyExchangeAlgorithm
	if kexAlg == "" {
		kexAlg = "ML-KEM-768"
	}
	kwAlg := req.KeyWrapAlgorithm
	if kwAlg == "" {
		kwAlg = "AES-KW"
	}

	// Branch on whether a user with this email already exists.
	existing, err := h.userRepo.GetByEmail(r.Context(), req.Email)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to check existing user")
		return
	}

	if existing != nil {
		// A user with that email already exists. Three sub-cases.
		linkedEmpID, err := h.employeeRepo.FindByUserID(r.Context(), existing.ID, session.CompanyID)
		if err != nil {
			Error(w, http.StatusInternalServerError, "failed to check link status: "+err.Error())
			return
		}
		if linkedEmpID == req.EmployeeID {
			// Already linked to the same employee. Idempotent success.
			JSON(w, http.StatusOK, map[string]interface{}{
				"user_id":  existing.ID,
				"username": existing.Username,
				"linked":   true,
				"reused":   true,
			})
			return
		}
		if linkedEmpID != "" {
			// Linked to a different employee. Real conflict.
			Error(w, http.StatusConflict, "email already linked to another employee")
			return
		}

		// Orphan: user exists but is not linked to any employee in this
		// company. This happens when a previous create-account attempt
		// partially completed. Reuse the user: refresh password and keys
		// to match what the admin just generated, then link.
		if err := h.userRepo.AdminResetPassword(
			r.Context(), existing.ID, passwordHash, req.Salt,
			req.WrappedCompanyKey, kwAlg, kexAlg,
			req.PublicKey, req.SigningPublicKey,
			r.RemoteAddr, r.UserAgent(),
		); err != nil {
			Error(w, http.StatusInternalServerError, "failed to refresh account: "+err.Error())
			return
		}
		if err := h.employeeRepo.LinkUser(r.Context(), req.EmployeeID, existing.ID, meta); err != nil {
			Error(w, http.StatusInternalServerError, "failed to link employee: "+err.Error())
			return
		}
		JSON(w, http.StatusOK, map[string]interface{}{
			"user_id":  existing.ID,
			"username": existing.Username,
			"linked":   true,
			"reused":   true,
		})
		return
	}

	// No existing user. Normal create flow.
	userID := uuid.New().String()
	accessID := uuid.New().String()

	err = h.userRepo.Create(r.Context(), &models.User{
		ID:           userID,
		Email:        req.Email,
		Username:     req.Username,
		PasswordHash: passwordHash,
		Salt:         req.Salt,
	}, meta)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to create user: "+err.Error())
		return
	}

	err = h.accessRepo.Create(r.Context(), &models.UserCompanyAccess{
		ID:                   accessID,
		UserID:               userID,
		CompanyID:            session.CompanyID,
		WrappedCompanyKey:    req.WrappedCompanyKey,
		KeyWrapAlgorithm:     kwAlg,
		KeyExchangeAlgorithm: kexAlg,
		PublicKey:            req.PublicKey,
		SigningPublicKey:     req.SigningPublicKey,
		Role:                 models.RoleEmployee,
	}, meta)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to grant access: "+err.Error())
		return
	}

	if err := h.employeeRepo.LinkUser(r.Context(), req.EmployeeID, userID, meta); err != nil {
		Error(w, http.StatusInternalServerError, "failed to link employee: "+err.Error())
		return
	}

	JSON(w, http.StatusCreated, map[string]interface{}{
		"user_id":   userID,
		"username":  req.Username,
		"access_id": accessID,
		"linked":    true,
		"reused":    false,
	})
}

// ==================== PERMISSION HANDLERS ====================

func (h *Handler) updatePermissions(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	if session.Role != models.RoleSuperAdmin && session.Role != models.RoleAdmin {
		Error(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	var req struct {
		EmployeeID  string      `json:"employee_id"`
		Permissions interface{} `json:"permissions"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.EmployeeID == "" {
		Error(w, http.StatusBadRequest, "employee_id is required")
		return
	}

	var permsJSON []byte
	if req.Permissions != nil {
		var err error
		permsJSON, err = json.Marshal(req.Permissions)
		if err != nil {
			Error(w, http.StatusBadRequest, "invalid permissions format")
			return
		}
	}

	result, err := h.db.ExecContext(r.Context(),
		"UPDATE employees SET permissions = ? WHERE id = ? AND company_id = ?",
		permsJSON, req.EmployeeID, session.CompanyID,
	)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to update permissions: "+err.Error())
		return
	}
	rows, _ := result.RowsAffected()

	JSON(w, http.StatusOK, map[string]interface{}{
		"status":        "permissions updated",
		"rows_affected": rows,
	})
}

func (h *Handler) getPermissions(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		EmployeeID string `json:"employee_id"`
	}
	if err := Decode(r, &req); err != nil || req.EmployeeID == "" {
		Error(w, http.StatusBadRequest, "employee_id is required")
		return
	}

	var perms sql.NullString
	err := h.db.QueryRowContext(r.Context(),
		"SELECT permissions FROM employees WHERE id = ? AND company_id = ?",
		req.EmployeeID, session.CompanyID,
	).Scan(&perms)
	if err != nil {
		JSON(w, http.StatusOK, map[string]interface{}{"permissions": nil})
		return
	}

	if !perms.Valid || perms.String == "" {
		JSON(w, http.StatusOK, map[string]interface{}{"permissions": nil})
		return
	}
	JSON(w, http.StatusOK, map[string]interface{}{
		"permissions": json.RawMessage(perms.String),
	})
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
	loan, err := h.loanRepo.GetLoan(session.CompanyID, req.ID)
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
	if _, err := h.loanRepo.ApproveLoan(session.CompanyID, req.ID, session.UserID, req.StartDate, req.EndDate); err != nil {
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
	if err := h.loanRepo.RejectLoan(session.CompanyID, req.ID, req.RejectionNote); err != nil {
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
	if err := h.loanRepo.CancelLoan(session.CompanyID, req.ID); err != nil {
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
	if err := h.loanRepo.DeleteLoan(session.CompanyID, req.ID); err != nil {
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
	payments, err := h.loanRepo.GetPayments(session.CompanyID, req.LoanID)
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
	if err := h.loanRepo.DeletePayment(session.CompanyID, req.ID); err != nil {
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
	account, err := h.acctRepo.GetAccount(session.CompanyID, req.ID)
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

	account, err := h.acctRepo.UpdateAccount(session.CompanyID, req.ID, req.Code, req.Name,
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
	if err := h.acctRepo.DeleteAccount(session.CompanyID, req.ID); err != nil {
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
		ID       string `json:"id"`
		IsActive *bool  `json:"is_active"`
	}
	if err := Decode(r, &req); err != nil || req.ID == "" {
		Error(w, http.StatusBadRequest, "id required")
		return
	}
	account, err := h.acctRepo.ToggleAccountActive(session.CompanyID, req.ID, req.IsActive)
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

	// Enforce double-entry integrity before writing anything. sp_post_journal_entry
	// checks this at post time, but an unbalanced or half-written Draft must never
	// be persisted in the first place (it corrupts drafts and any report that reads
	// them). Validating up front also means a bad request writes zero rows.
	var totalDebit, totalCredit float64
	for _, line := range req.Lines {
		if line.AccountID == "" {
			Error(w, http.StatusBadRequest, "each line requires an account_id")
			return
		}
		if line.Debit < 0 || line.Credit < 0 {
			Error(w, http.StatusBadRequest, "debit and credit must be non-negative")
			return
		}
		// Exactly one of debit/credit must be non-zero.
		if (line.Debit == 0) == (line.Credit == 0) {
			Error(w, http.StatusBadRequest, "each line must have exactly one of debit or credit set")
			return
		}
		totalDebit += line.Debit
		totalCredit += line.Credit
	}
	if totalDebit == 0 {
		Error(w, http.StatusBadRequest, "entry total must be greater than zero")
		return
	}
	if math.Abs(totalDebit-totalCredit) > 0.005 {
		Error(w, http.StatusBadRequest, "entry is unbalanced: total debits must equal total credits")
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
		if err := h.acctRepo.AddJournalLine(entryID, session.CompanyID, line.AccountID, line.Description, line.Debit, line.Credit, i); err != nil {
			Error(w, http.StatusInternalServerError, "add line: "+err.Error())
			return
		}
	}

	if err := h.acctRepo.UpdateJournalTotals(entryID, session.CompanyID); err != nil {
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
	ls, _ := h.acctRepo.GetJournalLines(req.ID, session.CompanyID)
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
	ls, err := h.acctRepo.GetJournalLines(req.EntryID, session.CompanyID)
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
		// Validate double-entry integrity before rewriting the lines.
		var totalDebit, totalCredit float64
		for _, line := range req.Lines {
			if line.AccountID == "" {
				Error(w, http.StatusBadRequest, "each line requires an account_id")
				return
			}
			if line.Debit < 0 || line.Credit < 0 {
				Error(w, http.StatusBadRequest, "debit and credit must be non-negative")
				return
			}
			if (line.Debit == 0) == (line.Credit == 0) {
				Error(w, http.StatusBadRequest, "each line must have exactly one of debit or credit set")
				return
			}
			totalDebit += line.Debit
			totalCredit += line.Credit
		}
		if math.Abs(totalDebit-totalCredit) > 0.005 {
			Error(w, http.StatusBadRequest, "entry is unbalanced: total debits must equal total credits")
			return
		}

		// Company-scoped and error-checked so a failure aborts rather than
		// silently leaving a half-rewritten entry.
		if err := h.acctRepo.ClearJournalLines(req.ID, session.CompanyID); err != nil {
			Error(w, http.StatusInternalServerError, "clear lines: "+err.Error())
			return
		}
		for i, line := range req.Lines {
			if err := h.acctRepo.AddJournalLine(req.ID, session.CompanyID, line.AccountID, line.Description, line.Debit, line.Credit, i); err != nil {
				Error(w, http.StatusInternalServerError, "add line: "+err.Error())
				return
			}
		}
		if err := h.acctRepo.UpdateJournalTotals(req.ID, session.CompanyID); err != nil {
			Error(w, http.StatusInternalServerError, "update totals: "+err.Error())
			return
		}
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
		// SSS employer share includes the EC (Employees' Compensation) premium; it is
		// not tracked separately, so there is no dedicated EC line.
		lines = append(lines, line{mmap["PAYROLL_SSS_EXPENSE_DR"], "SSS employer share", totals.TotalSSSER, 0})
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
		if err := h.acctRepo.AddJournalLine(entryID, session.CompanyID, l.acctID, l.desc, l.dr, l.cr, i); err != nil {
			Error(w, http.StatusInternalServerError, "add line: "+err.Error())
			return
		}
	}
	h.acctRepo.UpdateJournalTotals(entryID, session.CompanyID)

	if req.AutoPost {
		if err := h.acctRepo.PostJournalEntry(entryID, session.CompanyID, session.UserID); err != nil {
			Error(w, http.StatusInternalServerError, "auto-post failed: "+err.Error())
			return
		}
	}

	entry, _ := h.acctRepo.GetJournalEntry(entryID, session.CompanyID)
	entryLines, _ := h.acctRepo.GetJournalLines(entryID, session.CompanyID)
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
	items, _ := h.apRepo.GetBillItems(req.ID, session.CompanyID)
	payments, _ := h.apRepo.GetBillPayments(req.ID, session.CompanyID)
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
		if err := h.apRepo.AddBillItem(billID, session.CompanyID, item.AccountID, item.Description, item.Quantity, item.UnitPrice, amt, item.TaxRate, taxAmt, i); err != nil {
			Error(w, http.StatusInternalServerError, "add item: "+err.Error())
			return
		}
	}
	if err := h.apRepo.UpdateBillTotals(billID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, "update totals: "+err.Error())
		return
	}

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
		if err := h.apRepo.ClearBillItems(req.ID, session.CompanyID); err != nil {
			Error(w, http.StatusInternalServerError, "clear items: "+err.Error())
			return
		}
		for i, item := range req.Items {
			amt := item.Quantity * item.UnitPrice
			taxAmt := amt * item.TaxRate / 100
			if err := h.apRepo.AddBillItem(req.ID, session.CompanyID, item.AccountID, item.Description, item.Quantity, item.UnitPrice, amt, item.TaxRate, taxAmt, i); err != nil {
				Error(w, http.StatusInternalServerError, "add item: "+err.Error())
				return
			}
		}
		if err := h.apRepo.UpdateBillTotals(req.ID, session.CompanyID); err != nil {
			Error(w, http.StatusInternalServerError, "update totals: "+err.Error())
			return
		}
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
	items, err := h.apRepo.GetBillItems(req.BillID, session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if items == nil {
		items = []models.BillItem{}
	}
	JSON(w, http.StatusOK, items)
}

// postCashJournal posts a balanced 2-line cash-movement journal (Dr drAcct / Cr
// crAcct for amount) — used for AR/AP payments. Skips silently if an account is
// unmapped or the amount is non-positive, so a payment is never blocked by GL.
func (h *Handler) postCashJournal(session *models.UserSession, drAcct, crAcct, memo, sourceType, sourceID string, amount float64) string {
	amount = math.Round(amount*100) / 100
	if drAcct == "" || crAcct == "" || amount <= 0 {
		return ""
	}
	entryNum, _ := h.acctRepo.NextEntryNumber(session.CompanyID)
	entryID := uuid.New().String()
	date := time.Now().Format("2006-01-02")
	if err := h.acctRepo.CreateJournalEntry(entryID, session.CompanyID, entryNum, date, memo, sourceType, sourceID, "Draft"); err != nil {
		log.Printf("%s journal create: %v", sourceType, err)
		return ""
	}
	h.acctRepo.AddJournalLine(entryID, session.CompanyID, drAcct, memo, amount, 0, 0)
	h.acctRepo.AddJournalLine(entryID, session.CompanyID, crAcct, memo, 0, amount, 1)
	h.acctRepo.UpdateJournalTotals(entryID, session.CompanyID)
	if err := h.acctRepo.PostJournalEntry(entryID, session.CompanyID, session.UserID); err != nil {
		log.Printf("%s journal post: %v", sourceType, err)
		return ""
	}
	return entryID
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
	// Cash movement: Dr Accounts Payable / Cr Cash — only if the bill was GL-posted
	// (a payable exists to relieve) and a cash/bank account was supplied.
	glPosted := false
	if req.AccountID != "" {
		if apAcct, e := h.apRepo.PayAPControl(req.BillID, session.CompanyID); e == nil && apAcct != "" {
			memo := "Bill payment"
			if bill != nil {
				memo = "Payment for bill " + bill.BillNumber
			}
			if jid := h.postCashJournal(session, apAcct, req.AccountID, memo, "ap_payment", req.ID, req.Amount); jid != "" {
				h.apRepo.SetBillPaymentJournal(req.ID, session.CompanyID, jid)
				req.JournalID = jid
				glPosted = true
			}
		}
	}
	JSON(w, http.StatusCreated, map[string]interface{}{"payment": req, "bill": bill, "gl_posted": glPosted})
}

func (h *Handler) getBillPayments(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		BillID string `json:"bill_id"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	payments, err := h.apRepo.GetBillPayments(req.BillID, session.CompanyID)
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
	// Reverse the payment's cash journal (Dr AP / Cr Cash) before removing it.
	h.acctRepo.VoidJournalBySource(session.CompanyID, "ap_payment", req.ID, session.UserID, "Bill payment deleted")
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
func (h *Handler) getCustomer(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		CustomerID string `json:"customer_id"`
	}
	if err := Decode(r, &req); err != nil || req.CustomerID == "" {
		Error(w, http.StatusBadRequest, "customer_id required")
		return
	}
	customer, err := h.arRepo.GetCustomer(session.CompanyID, req.CustomerID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, customer)
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
	items, _ := h.arRepo.GetInvoiceItems(req.ID, session.CompanyID)
	payments, _ := h.arRepo.GetInvoicePayments(req.ID, session.CompanyID)
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
		if err := h.arRepo.AddInvoiceItem(iid, session.CompanyID, item.AccountID, item.Description, item.Quantity, item.UnitPrice, amt, item.TaxRate, ta, i); err != nil {
			Error(w, http.StatusInternalServerError, "add item: "+err.Error())
			return
		}
	}
	if err := h.arRepo.UpdateInvoiceTotals(iid, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, "update totals: "+err.Error())
		return
	}
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
		if err := h.arRepo.ClearInvoiceItems(req.ID, session.CompanyID); err != nil {
			Error(w, http.StatusInternalServerError, "clear items: "+err.Error())
			return
		}
		for i, item := range req.Items {
			amt := item.Quantity * item.UnitPrice
			ta := amt * item.TaxRate / 100
			if err := h.arRepo.AddInvoiceItem(req.ID, session.CompanyID, item.AccountID, item.Description, item.Quantity, item.UnitPrice, amt, item.TaxRate, ta, i); err != nil {
				Error(w, http.StatusInternalServerError, "add item: "+err.Error())
				return
			}
		}
		if err := h.arRepo.UpdateInvoiceTotals(req.ID, session.CompanyID); err != nil {
			Error(w, http.StatusInternalServerError, "update totals: "+err.Error())
			return
		}
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
	// Cash movement: Dr Cash / Cr Accounts Receivable — only if the invoice was
	// GL-posted (a receivable exists to relieve) and a cash/bank account was supplied.
	glPosted := false
	if req.AccountID != "" {
		if arAcct, e := h.arRepo.PayARControl(req.InvoiceID, session.CompanyID); e == nil && arAcct != "" {
			memo := "Invoice payment"
			if inv != nil {
				memo = "Payment for invoice " + inv.InvoiceNumber
			}
			if jid := h.postCashJournal(session, req.AccountID, arAcct, memo, "ar_payment", req.ID, req.Amount); jid != "" {
				h.arRepo.SetInvoicePaymentJournal(req.ID, session.CompanyID, jid)
				req.JournalID = jid
				glPosted = true
			}
		}
	}
	JSON(w, http.StatusCreated, map[string]interface{}{"payment": req, "invoice": inv, "gl_posted": glPosted})
}
func (h *Handler) getInvoicePayments(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		InvoiceID string `json:"invoice_id"`
	}
	Decode(r, &req)
	p, _ := h.arRepo.GetInvoicePayments(req.InvoiceID, session.CompanyID)
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
	// Reverse the payment's cash journal (Dr Cash / Cr AR) before removing it.
	h.acctRepo.VoidJournalBySource(session.CompanyID, "ar_payment", req.ID, session.UserID, "Invoice payment deleted")
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
	comments, _ := h.ticketRepo.GetComments(req.ID, session.CompanyID)
	if comments == nil {
		comments = []models.TicketComment{}
	}
	events, _ := h.ticketRepo.GetEvents(req.ID, session.CompanyID)
	if events == nil {
		events = []models.TicketEvent{}
	}
	reactions, _ := h.ticketRepo.GetReactions(req.ID, session.CompanyID)
	if reactions == nil {
		reactions = []models.TicketReaction{}
	}
	JSON(w, http.StatusOK, map[string]interface{}{"ticket": ticket, "comments": comments, "events": events, "reactions": reactions})
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
	h.logTicketEvent(t.ID, session, "opened", "", "")
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
	old, _ := h.ticketRepo.GetTicket(req.ID, session.CompanyID)
	t := &models.Ticket{
		ID: req.ID, CompanyID: session.CompanyID,
		Subject: req.Subject, Description: req.Description,
		CategoryID: req.CategoryID, Priority: req.Priority, AssignedTo: req.AssignedTo,
	}
	if err := h.ticketRepo.UpdateTicket(t); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if old != nil && req.Priority != "" && old.Priority != req.Priority {
		h.logTicketEvent(req.ID, session, "priority_changed", old.Priority, req.Priority)
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
	old, _ := h.ticketRepo.GetTicket(req.ID, session.CompanyID)
	if err := h.ticketRepo.UpdateStatus(req.ID, session.CompanyID, req.Status); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if old != nil && old.Status != req.Status {
		h.logTicketEvent(req.ID, session, "status_changed", old.Status, req.Status)
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
	old, _ := h.ticketRepo.GetTicket(req.ID, session.CompanyID)
	if err := h.ticketRepo.AssignTicket(req.ID, session.CompanyID, req.AssignedTo); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	result, _ := h.ticketRepo.GetTicket(req.ID, session.CompanyID)
	if old != nil && result != nil && old.AssignedTo != result.AssignedTo {
		if result.AssignedTo == "" {
			h.logTicketEvent(req.ID, session, "unassigned", old.AssignedToName, "")
		} else {
			h.logTicketEvent(req.ID, session, "assigned", old.AssignedToName, result.AssignedToName)
		}
	}
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
	if err := h.ticketRepo.AddComment(c, session.CompanyID); err != nil {
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
	comments, _ := h.ticketRepo.GetComments(req.TicketID, session.CompanyID)
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
	if err := h.ticketRepo.DeleteComment(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
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

// logTicketEvent records a timeline event best-effort — a logging failure must
// never fail the underlying mutation, so the error is intentionally ignored.
func (h *Handler) logTicketEvent(ticketID string, session *models.UserSession, evType, oldVal, newVal string) {
	_ = h.ticketRepo.AddEvent(uuid.New().String(), ticketID, session.CompanyID, session.UserID, evType, oldVal, newVal)
}

// labelName resolves a label id to its name for nicer timeline entries.
func (h *Handler) labelName(labelID, cid string) string {
	labels, _ := h.ticketRepo.GetLabels(cid)
	for _, l := range labels {
		if l.ID == labelID {
			return l.Name
		}
	}
	return ""
}

// ==================== TICKET LABELS ====================

func (h *Handler) getLabels(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	labels, err := h.ticketRepo.GetLabels(session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if labels == nil {
		labels = []models.TicketLabel{}
	}
	JSON(w, http.StatusOK, labels)
}

func (h *Handler) createLabel(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.TicketLabel
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
	if req.Color == "" {
		req.Color = "#6366f1"
	}
	if err := h.ticketRepo.CreateLabel(&req); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusCreated, req)
}

func (h *Handler) updateLabel(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.TicketLabel
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.ID == "" {
		Error(w, http.StatusBadRequest, "id required")
		return
	}
	req.CompanyID = session.CompanyID
	if err := h.ticketRepo.UpdateLabel(&req); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, req)
}

func (h *Handler) deleteLabel(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	if err := h.ticketRepo.DeleteLabel(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}

func (h *Handler) addTicketLabel(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		TicketID string `json:"ticket_id"`
		LabelID  string `json:"label_id"`
	}
	Decode(r, &req)
	if req.TicketID == "" || req.LabelID == "" {
		Error(w, http.StatusBadRequest, "ticket_id and label_id required")
		return
	}
	if err := h.ticketRepo.AddTicketLabel(req.TicketID, req.LabelID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.logTicketEvent(req.TicketID, session, "labeled", "", h.labelName(req.LabelID, session.CompanyID))
	result, _ := h.ticketRepo.GetTicket(req.TicketID, session.CompanyID)
	JSON(w, http.StatusOK, result)
}

func (h *Handler) removeTicketLabel(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		TicketID string `json:"ticket_id"`
		LabelID  string `json:"label_id"`
	}
	Decode(r, &req)
	if req.TicketID == "" || req.LabelID == "" {
		Error(w, http.StatusBadRequest, "ticket_id and label_id required")
		return
	}
	name := h.labelName(req.LabelID, session.CompanyID)
	if err := h.ticketRepo.RemoveTicketLabel(req.TicketID, req.LabelID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.logTicketEvent(req.TicketID, session, "unlabeled", name, "")
	result, _ := h.ticketRepo.GetTicket(req.TicketID, session.CompanyID)
	JSON(w, http.StatusOK, result)
}

// ==================== COMMENT EDIT + REACTIONS ====================

func (h *Handler) updateTicketComment(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID      string `json:"id"`
		Content string `json:"content"`
	}
	Decode(r, &req)
	if req.ID == "" || req.Content == "" {
		Error(w, http.StatusBadRequest, "id and content required")
		return
	}
	if err := h.ticketRepo.UpdateComment(req.ID, session.CompanyID, session.UserID, req.Content); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "updated"})
}

func (h *Handler) toggleCommentReaction(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		CommentID string `json:"comment_id"`
		Emoji     string `json:"emoji"`
	}
	Decode(r, &req)
	if req.CommentID == "" || req.Emoji == "" {
		Error(w, http.StatusBadRequest, "comment_id and emoji required")
		return
	}
	if err := h.ticketRepo.ToggleReaction(req.CommentID, session.CompanyID, session.UserID, req.Emoji); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]string{"message": "ok"})
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

// ==================== COMPLIANCE ====================

func (h *Handler) getComplianceTemplates(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	templates, err := h.complianceRepo.GetTemplates(session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, templates)
}

func (h *Handler) getComplianceAgencies(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	resp, err := h.complianceRepo.GetAgencies(session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, resp)
}

func (h *Handler) applyComplianceTemplate(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		TemplateCode string `json:"template_code"`
	}
	if err := Decode(r, &req); err != nil || req.TemplateCode == "" {
		Error(w, http.StatusBadRequest, "template_code required")
		return
	}
	if err := h.complianceRepo.ApplyTemplate(session.CompanyID, req.TemplateCode); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) createComplianceAgency(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.UpsertComplianceAgencyRequest
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Name == "" {
		Error(w, http.StatusBadRequest, "name required")
		return
	}
	agency := &models.ComplianceAgency{
		ID:        uuid.New().String(),
		CompanyID: session.CompanyID,
		Name:      req.Name,
		FullName:  req.FullName,
		Color:     req.Color,
		Frequency: req.Frequency,
		Website:   req.Website,
		Status:    req.Status,
		DueDate:   req.DueDate,
		LastFiled: req.LastFiled,
	}
	if agency.Color == "" {
		agency.Color = "#0ea5e9"
	}
	if agency.Frequency == "" {
		agency.Frequency = "Monthly"
	}
	if agency.Status == "" {
		agency.Status = "Not Filed"
	}
	if err := h.complianceRepo.CreateAgency(agency, req.Fields); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusCreated, agency)
}

func (h *Handler) updateComplianceAgency(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.UpsertComplianceAgencyRequest
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.AgencyID == "" {
		Error(w, http.StatusBadRequest, "agency_id required")
		return
	}
	agency := &models.ComplianceAgency{
		ID:        req.AgencyID,
		CompanyID: session.CompanyID,
		Name:      req.Name,
		FullName:  req.FullName,
		Color:     req.Color,
		Frequency: req.Frequency,
		Website:   req.Website,
		Status:    req.Status,
		DueDate:   req.DueDate,
		LastFiled: req.LastFiled,
	}
	if err := h.complianceRepo.UpdateAgency(agency, req.Fields); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, agency)
}

func (h *Handler) deleteComplianceAgency(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		AgencyID string `json:"agency_id"`
	}
	if err := Decode(r, &req); err != nil || req.AgencyID == "" {
		Error(w, http.StatusBadRequest, "agency_id required")
		return
	}
	if err := h.complianceRepo.DeleteAgency(session.CompanyID, req.AgencyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ==================== INVENTORY ====================

// postInvJournal builds and posts a balanced two-line journal entry for an
// inventory event, reusing the accounting journal primitives. Returns the new
// entry ID, or "" if posting was skipped (amount/accounts missing). Errors are
// logged but never block the underlying stock operation.
func (h *Handler) postInvJournal(session *models.UserSession, drAcct, crAcct, memo, sourceID string, amount float64) string {
	if amount <= 0 || drAcct == "" || crAcct == "" {
		return ""
	}
	entryNum, _ := h.acctRepo.NextEntryNumber(session.CompanyID)
	entryID := uuid.New().String()
	date := time.Now().Format("2006-01-02")
	if err := h.acctRepo.CreateJournalEntry(entryID, session.CompanyID, entryNum, date, memo, "inventory", sourceID, "Draft"); err != nil {
		log.Printf("inv journal create: %v", err)
		return ""
	}
	if err := h.acctRepo.AddJournalLine(entryID, session.CompanyID, drAcct, memo, amount, 0, 0); err != nil {
		log.Printf("inv journal dr line: %v", err)
		return ""
	}
	if err := h.acctRepo.AddJournalLine(entryID, session.CompanyID, crAcct, memo, 0, amount, 1); err != nil {
		log.Printf("inv journal cr line: %v", err)
		return ""
	}
	h.acctRepo.UpdateJournalTotals(entryID, session.CompanyID)
	if err := h.acctRepo.PostJournalEntry(entryID, session.CompanyID, session.UserID); err != nil {
		log.Printf("inv journal post: %v", err)
		return ""
	}
	return entryID
}

// maybePostMovementJournal posts (and links) a GL entry for a manual stock
// movement when inventory→accounting auto-posting is enabled. Transfers never
// post — the asset stays on the same account.
func (h *Handler) maybePostMovementJournal(session *models.UserSession, m *models.InvMovement, reqCost float64) {
	s, err := h.invRepo.GetSettings(session.CompanyID)
	if err != nil || s == nil || !s.AutoPostGL {
		return
	}
	cost := reqCost
	if cost <= 0 {
		if p, e := h.invRepo.GetProduct(m.ProductID, session.CompanyID); e == nil && p != nil {
			cost = p.CostPrice
		}
	}
	amount := math.Abs(m.Quantity) * cost
	if amount <= 0 {
		return
	}
	var dr, cr, memo string
	switch m.MovementType {
	case "in":
		dr, cr, memo = s.InventoryAccountID, s.PayableAccountID, "Inventory stock-in"
	case "out":
		dr, cr, memo = s.COGSAccountID, s.InventoryAccountID, "Inventory stock-out (COGS)"
	case "adjust":
		if m.Quantity >= 0 {
			dr, cr, memo = s.InventoryAccountID, s.AdjustmentAccountID, "Inventory adjustment (increase)"
		} else {
			dr, cr, memo = s.AdjustmentAccountID, s.InventoryAccountID, "Inventory adjustment (decrease)"
		}
	default:
		return
	}
	if jid := h.postInvJournal(session, dr, cr, memo, m.ID, amount); jid != "" {
		h.invRepo.SetMovementJournal(m.ID, session.CompanyID, jid)
		m.JournalEntryID = jid
	}
}

// --- Dashboard ---

func (h *Handler) getInvStats(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	stats, err := h.invRepo.Stats(session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, stats)
}

func (h *Handler) getInvLowStock(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	rows, err := h.invRepo.LowStock(session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if rows == nil {
		rows = []models.InvLowStock{}
	}
	JSON(w, http.StatusOK, rows)
}

// --- Categories ---

func (h *Handler) getInvCategories(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	cats, err := h.invRepo.GetCategories(session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if cats == nil {
		cats = []models.InvCategory{}
	}
	JSON(w, http.StatusOK, cats)
}

func (h *Handler) createInvCategory(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Name == "" {
		Error(w, http.StatusBadRequest, "name required")
		return
	}
	c := &models.InvCategory{ID: uuid.New().String(), CompanyID: session.CompanyID, Name: req.Name, Description: req.Description, IsActive: true}
	if err := h.invRepo.CreateCategory(c); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusCreated, c)
}

func (h *Handler) updateInvCategory(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID          string `json:"id"`
		Name        string `json:"name"`
		Description string `json:"description"`
		IsActive    bool   `json:"is_active"`
	}
	Decode(r, &req)
	c := &models.InvCategory{ID: req.ID, CompanyID: session.CompanyID, Name: req.Name, Description: req.Description, IsActive: req.IsActive}
	if err := h.invRepo.UpdateCategory(c); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, c)
}

func (h *Handler) deleteInvCategory(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	if err := h.invRepo.DeleteCategory(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// --- Warehouses ---

func (h *Handler) getInvWarehouses(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	whs, err := h.invRepo.GetWarehouses(session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if whs == nil {
		whs = []models.InvWarehouse{}
	}
	JSON(w, http.StatusOK, whs)
}

func (h *Handler) createInvWarehouse(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		Name      string `json:"name"`
		Code      string `json:"code"`
		Location  string `json:"location"`
		IsDefault bool   `json:"is_default"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Name == "" {
		Error(w, http.StatusBadRequest, "name required")
		return
	}
	wh := &models.InvWarehouse{ID: uuid.New().String(), CompanyID: session.CompanyID, Name: req.Name, Code: req.Code, Location: req.Location, IsDefault: req.IsDefault, IsActive: true}
	if err := h.invRepo.CreateWarehouse(wh); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusCreated, wh)
}

func (h *Handler) updateInvWarehouse(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID        string `json:"id"`
		Name      string `json:"name"`
		Code      string `json:"code"`
		Location  string `json:"location"`
		IsDefault bool   `json:"is_default"`
		IsActive  bool   `json:"is_active"`
	}
	Decode(r, &req)
	wh := &models.InvWarehouse{ID: req.ID, CompanyID: session.CompanyID, Name: req.Name, Code: req.Code, Location: req.Location, IsDefault: req.IsDefault, IsActive: req.IsActive}
	if err := h.invRepo.UpdateWarehouse(wh); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, wh)
}

func (h *Handler) deleteInvWarehouse(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	if err := h.invRepo.DeleteWarehouse(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// --- Suppliers ---

func (h *Handler) getInvSuppliers(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	sups, err := h.invRepo.GetSuppliers(session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if sups == nil {
		sups = []models.InvSupplier{}
	}
	JSON(w, http.StatusOK, sups)
}

func (h *Handler) createInvSupplier(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		Name          string `json:"name"`
		ContactPerson string `json:"contact_person"`
		Email         string `json:"email"`
		Phone         string `json:"phone"`
		Address       string `json:"address"`
		Notes         string `json:"notes"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Name == "" {
		Error(w, http.StatusBadRequest, "name required")
		return
	}
	s := &models.InvSupplier{ID: uuid.New().String(), CompanyID: session.CompanyID, Name: req.Name, ContactPerson: req.ContactPerson, Email: req.Email, Phone: req.Phone, Address: req.Address, Notes: req.Notes, IsActive: true}
	if err := h.invRepo.CreateSupplier(s); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusCreated, s)
}

func (h *Handler) updateInvSupplier(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID            string `json:"id"`
		Name          string `json:"name"`
		ContactPerson string `json:"contact_person"`
		Email         string `json:"email"`
		Phone         string `json:"phone"`
		Address       string `json:"address"`
		Notes         string `json:"notes"`
		IsActive      bool   `json:"is_active"`
	}
	Decode(r, &req)
	s := &models.InvSupplier{ID: req.ID, CompanyID: session.CompanyID, Name: req.Name, ContactPerson: req.ContactPerson, Email: req.Email, Phone: req.Phone, Address: req.Address, Notes: req.Notes, IsActive: req.IsActive}
	if err := h.invRepo.UpdateSupplier(s); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, s)
}

func (h *Handler) deleteInvSupplier(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	if err := h.invRepo.DeleteSupplier(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// --- Products ---

func (h *Handler) getInvProducts(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	prods, err := h.invRepo.GetProducts(session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if prods == nil {
		prods = []models.InvProduct{}
	}
	JSON(w, http.StatusOK, prods)
}

func (h *Handler) getInvProduct(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	p, err := h.invRepo.GetProduct(req.ID, session.CompanyID)
	if err != nil {
		Error(w, http.StatusNotFound, err.Error())
		return
	}
	stock, _ := h.invRepo.GetProductStock(req.ID, session.CompanyID)
	if stock == nil {
		stock = []models.InvStockLevel{}
	}
	JSON(w, http.StatusOK, map[string]interface{}{"product": p, "stock": stock})
}

func (h *Handler) createInvProduct(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		SKU          string  `json:"sku"`
		Name         string  `json:"name"`
		Description  string  `json:"description"`
		CategoryID   string  `json:"category_id"`
		SupplierID   string  `json:"supplier_id"`
		Unit         string  `json:"unit"`
		CostPrice    float64 `json:"cost_price"`
		SellingPrice float64 `json:"selling_price"`
		ReorderPoint float64 `json:"reorder_point"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.SKU == "" || req.Name == "" {
		Error(w, http.StatusBadRequest, "sku and name required")
		return
	}
	p := &models.InvProduct{
		ID: uuid.New().String(), CompanyID: session.CompanyID,
		SKU: req.SKU, Name: req.Name, Description: req.Description,
		CategoryID: req.CategoryID, SupplierID: req.SupplierID, Unit: req.Unit,
		CostPrice: req.CostPrice, SellingPrice: req.SellingPrice, ReorderPoint: req.ReorderPoint,
	}
	if err := h.invRepo.CreateProduct(p); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	result, _ := h.invRepo.GetProduct(p.ID, session.CompanyID)
	if result != nil {
		JSON(w, http.StatusCreated, result)
		return
	}
	JSON(w, http.StatusCreated, p)
}

func (h *Handler) updateInvProduct(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID           string  `json:"id"`
		SKU          string  `json:"sku"`
		Name         string  `json:"name"`
		Description  string  `json:"description"`
		CategoryID   string  `json:"category_id"`
		SupplierID   string  `json:"supplier_id"`
		Unit         string  `json:"unit"`
		CostPrice    float64 `json:"cost_price"`
		SellingPrice float64 `json:"selling_price"`
		ReorderPoint float64 `json:"reorder_point"`
	}
	Decode(r, &req)
	p := &models.InvProduct{
		ID: req.ID, CompanyID: session.CompanyID,
		SKU: req.SKU, Name: req.Name, Description: req.Description,
		CategoryID: req.CategoryID, SupplierID: req.SupplierID, Unit: req.Unit,
		CostPrice: req.CostPrice, SellingPrice: req.SellingPrice, ReorderPoint: req.ReorderPoint,
	}
	if err := h.invRepo.UpdateProduct(p); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	result, _ := h.invRepo.GetProduct(req.ID, session.CompanyID)
	JSON(w, http.StatusOK, result)
}

func (h *Handler) toggleInvProduct(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID       string `json:"id"`
		IsActive bool   `json:"is_active"`
	}
	Decode(r, &req)
	if err := h.invRepo.ToggleProductActive(req.ID, session.CompanyID, req.IsActive); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) deleteInvProduct(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	if err := h.invRepo.DeleteProduct(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// --- Stock movements ---

func (h *Handler) getInvMovements(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ProductID   string `json:"product_id"`
		WarehouseID string `json:"warehouse_id"`
		Type        string `json:"movement_type"`
		Limit       int    `json:"limit"`
	}
	Decode(r, &req)
	if req.Limit <= 0 || req.Limit > 500 {
		req.Limit = 200
	}
	moves, err := h.invRepo.GetMovements(session.CompanyID, req.ProductID, req.WarehouseID, req.Type, req.Limit)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if moves == nil {
		moves = []models.InvMovement{}
	}
	JSON(w, http.StatusOK, moves)
}

func (h *Handler) recordInvMovement(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ProductID   string  `json:"product_id"`
		WarehouseID string  `json:"warehouse_id"`
		Type        string  `json:"movement_type"`
		Quantity    float64 `json:"quantity"`
		UnitCost    float64 `json:"unit_cost"`
		Reference   string  `json:"reference"`
		Notes       string  `json:"notes"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.ProductID == "" || req.WarehouseID == "" {
		Error(w, http.StatusBadRequest, "product and warehouse required")
		return
	}
	if req.Type != "in" && req.Type != "out" && req.Type != "adjust" {
		Error(w, http.StatusBadRequest, "movement_type must be in, out or adjust")
		return
	}
	if req.Quantity == 0 {
		Error(w, http.StatusBadRequest, "quantity must be non-zero")
		return
	}
	if (req.Type == "in" || req.Type == "out") && req.Quantity < 0 {
		Error(w, http.StatusBadRequest, "quantity must be positive")
		return
	}
	m := &models.InvMovement{
		ID: uuid.New().String(), CompanyID: session.CompanyID,
		ProductID: req.ProductID, WarehouseID: req.WarehouseID,
		MovementType: req.Type, Quantity: req.Quantity, UnitCost: req.UnitCost,
		Reference: req.Reference, Notes: req.Notes, CreatedBy: session.UserID,
	}
	bal, err := h.invRepo.RecordMovement(m)
	if err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	h.maybePostMovementJournal(session, m, req.UnitCost)
	JSON(w, http.StatusCreated, map[string]interface{}{"balance_after": bal, "journal_entry_id": m.JournalEntryID})
}

func (h *Handler) transferInvStock(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ProductID     string  `json:"product_id"`
		FromWarehouse string  `json:"from_warehouse_id"`
		ToWarehouse   string  `json:"to_warehouse_id"`
		Quantity      float64 `json:"quantity"`
		Reference     string  `json:"reference"`
		Notes         string  `json:"notes"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.ProductID == "" || req.FromWarehouse == "" || req.ToWarehouse == "" {
		Error(w, http.StatusBadRequest, "product and both warehouses required")
		return
	}
	if req.Quantity <= 0 {
		Error(w, http.StatusBadRequest, "quantity must be positive")
		return
	}
	err := h.invRepo.TransferStock(uuid.New().String(), uuid.New().String(), session.CompanyID,
		req.ProductID, req.FromWarehouse, req.ToWarehouse, req.Quantity, req.Reference, req.Notes, session.UserID)
	if err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	JSON(w, http.StatusCreated, map[string]bool{"ok": true})
}

func (h *Handler) getInvStockLevels(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		WarehouseID string `json:"warehouse_id"`
	}
	Decode(r, &req)
	levels, err := h.invRepo.GetStockLevels(session.CompanyID, req.WarehouseID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if levels == nil {
		levels = []models.InvStockLevel{}
	}
	JSON(w, http.StatusOK, levels)
}

// --- Settings ---

func (h *Handler) getInvSettings(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	s, err := h.invRepo.GetSettings(session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, s)
}

func (h *Handler) saveInvSettings(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		AutoPostGL          bool   `json:"auto_post_gl"`
		InventoryAccountID  string `json:"inventory_account_id"`
		COGSAccountID       string `json:"cogs_account_id"`
		AdjustmentAccountID string `json:"adjustment_account_id"`
		PayableAccountID    string `json:"payable_account_id"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	s := &models.InvSettings{
		CompanyID: session.CompanyID, AutoPostGL: req.AutoPostGL,
		InventoryAccountID: req.InventoryAccountID, COGSAccountID: req.COGSAccountID,
		AdjustmentAccountID: req.AdjustmentAccountID, PayableAccountID: req.PayableAccountID,
	}
	if err := h.invRepo.UpsertSettings(s); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, s)
}

// --- Purchase orders ---

func (h *Handler) getPurchaseOrders(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		Status string `json:"status"`
	}
	Decode(r, &req)
	pos, err := h.invRepo.GetPurchaseOrders(session.CompanyID, req.Status)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if pos == nil {
		pos = []models.InvPurchaseOrder{}
	}
	JSON(w, http.StatusOK, pos)
}

func (h *Handler) getPurchaseOrder(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	po, err := h.invRepo.GetPurchaseOrder(req.ID, session.CompanyID)
	if err != nil {
		Error(w, http.StatusNotFound, err.Error())
		return
	}
	items, _ := h.invRepo.GetPOItems(req.ID, session.CompanyID)
	if items == nil {
		items = []models.InvPOItem{}
	}
	po.Items = items
	JSON(w, http.StatusOK, po)
}

func (h *Handler) createPurchaseOrder(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		SupplierID   string `json:"supplier_id"`
		WarehouseID  string `json:"warehouse_id"`
		OrderDate    string `json:"order_date"`
		ExpectedDate string `json:"expected_date"`
		Notes        string `json:"notes"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	po := &models.InvPurchaseOrder{
		ID: uuid.New().String(), CompanyID: session.CompanyID,
		SupplierID: req.SupplierID, WarehouseID: req.WarehouseID,
		OrderDate: req.OrderDate, ExpectedDate: req.ExpectedDate, Notes: req.Notes,
		CreatedBy: session.UserID,
	}
	num, err := h.invRepo.CreatePurchaseOrder(po)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	po.PONumber = num
	result, _ := h.invRepo.GetPurchaseOrder(po.ID, session.CompanyID)
	if result != nil {
		JSON(w, http.StatusCreated, result)
		return
	}
	JSON(w, http.StatusCreated, po)
}

func (h *Handler) updatePurchaseOrder(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID           string `json:"id"`
		SupplierID   string `json:"supplier_id"`
		WarehouseID  string `json:"warehouse_id"`
		OrderDate    string `json:"order_date"`
		ExpectedDate string `json:"expected_date"`
		Notes        string `json:"notes"`
	}
	Decode(r, &req)
	po := &models.InvPurchaseOrder{
		ID: req.ID, CompanyID: session.CompanyID,
		SupplierID: req.SupplierID, WarehouseID: req.WarehouseID,
		OrderDate: req.OrderDate, ExpectedDate: req.ExpectedDate, Notes: req.Notes,
	}
	if err := h.invRepo.UpdatePurchaseOrder(po); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	result, _ := h.invRepo.GetPurchaseOrder(req.ID, session.CompanyID)
	JSON(w, http.StatusOK, result)
}

func (h *Handler) updatePOStatus(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	}
	Decode(r, &req)
	if err := h.invRepo.UpdatePOStatus(req.ID, session.CompanyID, req.Status); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) deletePurchaseOrder(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	if err := h.invRepo.DeletePurchaseOrder(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) addPOItem(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		POID      string  `json:"po_id"`
		ProductID string  `json:"product_id"`
		Quantity  float64 `json:"quantity"`
		UnitCost  float64 `json:"unit_cost"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.POID == "" || req.ProductID == "" {
		Error(w, http.StatusBadRequest, "po_id and product_id required")
		return
	}
	it := &models.InvPOItem{ID: uuid.New().String(), CompanyID: session.CompanyID, POID: req.POID, ProductID: req.ProductID, Quantity: req.Quantity, UnitCost: req.UnitCost}
	if err := h.invRepo.AddPOItem(it); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	items, _ := h.invRepo.GetPOItems(req.POID, session.CompanyID)
	JSON(w, http.StatusCreated, items)
}

func (h *Handler) deletePOItem(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	if err := h.invRepo.DeletePOItem(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) receivePurchaseOrder(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	if req.ID == "" {
		Error(w, http.StatusBadRequest, "id required")
		return
	}
	total, err := h.invRepo.ReceivePO(req.ID, session.CompanyID, session.UserID)
	if err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	// Post the received-goods journal (Dr Inventory / Cr Payable) if enabled.
	if total > 0 {
		if s, e := h.invRepo.GetSettings(session.CompanyID); e == nil && s != nil && s.AutoPostGL {
			memo := "Goods received"
			if po, _ := h.invRepo.GetPurchaseOrder(req.ID, session.CompanyID); po != nil {
				memo = fmt.Sprintf("Goods received PO #%d", po.PONumber)
			}
			if jid := h.postInvJournal(session, s.InventoryAccountID, s.PayableAccountID, memo, req.ID, total); jid != "" {
				h.invRepo.SetPOJournal(req.ID, session.CompanyID, jid)
			}
		}
	}
	po, _ := h.invRepo.GetPurchaseOrder(req.ID, session.CompanyID)
	if po != nil {
		items, _ := h.invRepo.GetPOItems(req.ID, session.CompanyID)
		po.Items = items
	}
	JSON(w, http.StatusOK, map[string]interface{}{"po": po, "total_received": total})
}

// ==================== FIXED ASSETS ====================

// faLine is one line of a fixed-assets journal entry.
type faLine struct {
	acct string
	dr   float64
	cr   float64
}

// postFAJournal builds and posts a balanced N-line journal for a fixed-asset
// event, reusing the accounting primitives. Zero-amount lines are dropped; every
// remaining line must carry an account and the entry must balance to the cent.
// Returns the entry id, or "" if posting was skipped/failed (logged, never
// blocks the FA operation). source_type is "fixed_assets".
func (h *Handler) postFAJournal(session *models.UserSession, memo, sourceID string, lines []faLine) string {
	var kept []faLine
	var sumDr, sumCr float64
	for _, l := range lines {
		if l.dr == 0 && l.cr == 0 {
			continue
		}
		if l.acct == "" {
			log.Printf("fa journal %q: unmapped account, skipping post", memo)
			return ""
		}
		kept = append(kept, l)
		sumDr += l.dr
		sumCr += l.cr
	}
	if len(kept) < 2 || sumDr <= 0 || math.Abs(sumDr-sumCr) > 0.005 {
		if sumDr > 0 {
			log.Printf("fa journal %q not balanced (dr=%.2f cr=%.2f), skipping", memo, sumDr, sumCr)
		}
		return ""
	}
	entryNum, _ := h.acctRepo.NextEntryNumber(session.CompanyID)
	entryID := uuid.New().String()
	date := time.Now().Format("2006-01-02")
	if err := h.acctRepo.CreateJournalEntry(entryID, session.CompanyID, entryNum, date, memo, "fixed_assets", sourceID, "Draft"); err != nil {
		log.Printf("fa journal create: %v", err)
		return ""
	}
	for i, l := range kept {
		if err := h.acctRepo.AddJournalLine(entryID, session.CompanyID, l.acct, memo, l.dr, l.cr, i); err != nil {
			log.Printf("fa journal line: %v", err)
			return ""
		}
	}
	h.acctRepo.UpdateJournalTotals(entryID, session.CompanyID)
	if err := h.acctRepo.PostJournalEntry(entryID, session.CompanyID, session.UserID); err != nil {
		log.Printf("fa journal post: %v", err)
		return ""
	}
	return entryID
}

type faAccts struct{ asset, accum, expense string }

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

// resolveFAAccounts resolves an asset's GL accounts using the precedence
// asset-override -> category-default -> company settings.
func (h *Handler) resolveFAAccounts(cid string, a *models.FAAsset, s *models.FASettings) faAccts {
	res := faAccts{asset: a.AssetAccountID, accum: a.AccumDepAccountID, expense: a.DepExpenseAccountID}
	if (res.asset == "" || res.accum == "" || res.expense == "") && a.CategoryID != "" {
		if cats, err := h.faRepo.GetCategories(cid); err == nil {
			for _, c := range cats {
				if c.ID == a.CategoryID {
					res.asset = firstNonEmpty(res.asset, c.AssetAccountID)
					res.accum = firstNonEmpty(res.accum, c.AccumDepAccountID)
					res.expense = firstNonEmpty(res.expense, c.DepExpenseAccountID)
				}
			}
		}
	}
	res.asset = firstNonEmpty(res.asset, s.AssetAccountID)
	res.accum = firstNonEmpty(res.accum, s.AccumDepAccountID)
	res.expense = firstNonEmpty(res.expense, s.DepExpenseAccountID)
	return res
}

// --- Dashboard ---

func (h *Handler) getFAStats(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	stats, err := h.faRepo.Stats(session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, stats)
}

// --- Categories ---

func (h *Handler) getFACategories(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	cats, err := h.faRepo.GetCategories(session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if cats == nil {
		cats = []models.FACategory{}
	}
	JSON(w, http.StatusOK, cats)
}

func (h *Handler) createFACategory(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		Name                string  `json:"name"`
		Description         string  `json:"description"`
		AssetAccountID      string  `json:"asset_account_id"`
		AccumDepAccountID   string  `json:"accum_dep_account_id"`
		DepExpenseAccountID string  `json:"dep_expense_account_id"`
		DefaultLifeMonths   int     `json:"default_life_months"`
		DefaultMethod       string  `json:"default_method"`
		DefaultSalvagePct   float64 `json:"default_salvage_pct"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Name == "" {
		Error(w, http.StatusBadRequest, "name required")
		return
	}
	c := &models.FACategory{
		ID: uuid.New().String(), CompanyID: session.CompanyID, Name: req.Name, Description: req.Description,
		AssetAccountID: req.AssetAccountID, AccumDepAccountID: req.AccumDepAccountID, DepExpenseAccountID: req.DepExpenseAccountID,
		DefaultLifeMonths: req.DefaultLifeMonths, DefaultMethod: req.DefaultMethod, DefaultSalvagePct: req.DefaultSalvagePct,
	}
	if err := h.faRepo.CreateCategory(c); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	JSON(w, http.StatusCreated, c)
}

func (h *Handler) updateFACategory(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID                  string  `json:"id"`
		Name                string  `json:"name"`
		Description         string  `json:"description"`
		AssetAccountID      string  `json:"asset_account_id"`
		AccumDepAccountID   string  `json:"accum_dep_account_id"`
		DepExpenseAccountID string  `json:"dep_expense_account_id"`
		DefaultLifeMonths   int     `json:"default_life_months"`
		DefaultMethod       string  `json:"default_method"`
		DefaultSalvagePct   float64 `json:"default_salvage_pct"`
		IsActive            bool    `json:"is_active"`
	}
	Decode(r, &req)
	c := &models.FACategory{
		ID: req.ID, CompanyID: session.CompanyID, Name: req.Name, Description: req.Description,
		AssetAccountID: req.AssetAccountID, AccumDepAccountID: req.AccumDepAccountID, DepExpenseAccountID: req.DepExpenseAccountID,
		DefaultLifeMonths: req.DefaultLifeMonths, DefaultMethod: req.DefaultMethod, DefaultSalvagePct: req.DefaultSalvagePct, IsActive: req.IsActive,
	}
	if err := h.faRepo.UpdateCategory(c); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	JSON(w, http.StatusOK, c)
}

func (h *Handler) deleteFACategory(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	if err := h.faRepo.DeleteCategory(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// --- Assets ---

func (h *Handler) getFAAssets(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		Status   string `json:"status"`
		Category string `json:"category_id"`
	}
	Decode(r, &req)
	assets, err := h.faRepo.GetAssets(session.CompanyID, req.Status, req.Category)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if assets == nil {
		assets = []models.FAAsset{}
	}
	JSON(w, http.StatusOK, assets)
}

func (h *Handler) getFAAsset(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	a, err := h.faRepo.GetAsset(req.ID, session.CompanyID)
	if err != nil {
		Error(w, http.StatusNotFound, err.Error())
		return
	}
	if sched, e := h.faRepo.GetDepreciationSchedule(req.ID, session.CompanyID); e == nil {
		a.Schedule = sched
	}
	if maint, e := h.faRepo.GetMaintenance(session.CompanyID, req.ID); e == nil {
		a.Maintenance = maint
	}
	if trans, e := h.faRepo.GetTransfers(session.CompanyID, req.ID); e == nil {
		a.Transfers = trans
	}
	JSON(w, http.StatusOK, a)
}

func (h *Handler) createFAAsset(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		Name               string  `json:"name"`
		Description        string  `json:"description"`
		CategoryID         string  `json:"category_id"`
		AcquisitionCost    float64 `json:"acquisition_cost"`
		AcquisitionDate    string  `json:"acquisition_date"`
		InServiceDate      string  `json:"in_service_date"`
		UsefulLifeMonths   int     `json:"useful_life_months"`
		SalvageValue       float64 `json:"salvage_value"`
		DepreciationMethod string  `json:"depreciation_method"`
		Department         string  `json:"department"`
		Location           string  `json:"location"`
		CustodianID        string  `json:"custodian_id"`
		SerialNumber       string  `json:"serial_number"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Name == "" || req.AcquisitionDate == "" {
		Error(w, http.StatusBadRequest, "name and acquisition_date required")
		return
	}

	// Resolve category defaults for any omitted life/method/salvage.
	if req.CategoryID != "" {
		if cats, err := h.faRepo.GetCategories(session.CompanyID); err == nil {
			for _, c := range cats {
				if c.ID == req.CategoryID {
					if req.UsefulLifeMonths == 0 {
						req.UsefulLifeMonths = c.DefaultLifeMonths
					}
					if req.DepreciationMethod == "" {
						req.DepreciationMethod = c.DefaultMethod
					}
					if req.SalvageValue == 0 && c.DefaultSalvagePct > 0 {
						req.SalvageValue = math.Round(req.AcquisitionCost*c.DefaultSalvagePct) / 100
					}
				}
			}
		}
	}
	if req.DepreciationMethod == "" {
		req.DepreciationMethod = "straight_line"
	}

	a := &models.FAAsset{
		ID: uuid.New().String(), CompanyID: session.CompanyID,
		Name: req.Name, Description: req.Description, CategoryID: req.CategoryID,
		AcquisitionCost: req.AcquisitionCost, AcquisitionDate: req.AcquisitionDate, InServiceDate: req.InServiceDate,
		UsefulLifeMonths: req.UsefulLifeMonths, SalvageValue: req.SalvageValue, DepreciationMethod: req.DepreciationMethod,
		Department: req.Department, Location: req.Location, CustodianID: req.CustodianID, SerialNumber: req.SerialNumber,
	}
	num, err := h.faRepo.CreateAsset(a, session.UserID)
	if err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	a.AssetNumber = num

	// Acquisition GL: Dr asset cost / Cr payable (when auto-post is enabled).
	glPosted := false
	if s, e := h.faRepo.GetSettings(session.CompanyID); e == nil && s != nil && s.AutoPostGL && a.AcquisitionCost > 0 {
		res := h.resolveFAAccounts(session.CompanyID, a, s)
		jid := h.postFAJournal(session, fmt.Sprintf("Acquisition %s %s", a.AssetNumber, a.Name), a.ID,
			[]faLine{{res.asset, a.AcquisitionCost, 0}, {s.PayableAccountID, 0, a.AcquisitionCost}})
		if jid != "" {
			h.faRepo.SetAssetJournal(a.ID, session.CompanyID, jid)
			glPosted = true
		}
	}
	result, _ := h.faRepo.GetAsset(a.ID, session.CompanyID)
	if result == nil {
		result = a
	}
	JSON(w, http.StatusCreated, map[string]interface{}{"asset": result, "gl_posted": glPosted})
}

func (h *Handler) updateFAAsset(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID                 string  `json:"id"`
		Name               string  `json:"name"`
		Description        string  `json:"description"`
		CategoryID         string  `json:"category_id"`
		AcquisitionCost    float64 `json:"acquisition_cost"`
		AcquisitionDate    string  `json:"acquisition_date"`
		InServiceDate      string  `json:"in_service_date"`
		UsefulLifeMonths   int     `json:"useful_life_months"`
		SalvageValue       float64 `json:"salvage_value"`
		DepreciationMethod string  `json:"depreciation_method"`
		Department         string  `json:"department"`
		Location           string  `json:"location"`
		CustodianID        string  `json:"custodian_id"`
		SerialNumber       string  `json:"serial_number"`
	}
	Decode(r, &req)
	a := &models.FAAsset{
		ID: req.ID, CompanyID: session.CompanyID,
		Name: req.Name, Description: req.Description, CategoryID: req.CategoryID,
		AcquisitionCost: req.AcquisitionCost, AcquisitionDate: req.AcquisitionDate, InServiceDate: req.InServiceDate,
		UsefulLifeMonths: req.UsefulLifeMonths, SalvageValue: req.SalvageValue, DepreciationMethod: req.DepreciationMethod,
		Department: req.Department, Location: req.Location, CustodianID: req.CustodianID, SerialNumber: req.SerialNumber,
	}
	if err := h.faRepo.UpdateAsset(a); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	result, _ := h.faRepo.GetAsset(req.ID, session.CompanyID)
	JSON(w, http.StatusOK, result)
}

func (h *Handler) deleteFAAsset(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	if err := h.faRepo.DeleteAsset(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// --- Depreciation ---

func (h *Handler) getFADepreciationSchedule(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		AssetID string `json:"asset_id"`
	}
	Decode(r, &req)
	sched, err := h.faRepo.GetDepreciationSchedule(req.AssetID, session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if sched == nil {
		sched = []models.FADepreciationEntry{}
	}
	JSON(w, http.StatusOK, sched)
}

func (h *Handler) getFARuns(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	runs, err := h.faRepo.GetRuns(session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if runs == nil {
		runs = []models.FADepreciationRun{}
	}
	JSON(w, http.StatusOK, runs)
}

// postFADepreciationJournals posts one consolidated entry per (expense, accum)
// account pair for a run, and links them back. Returns whether a journal posted.
func (h *Handler) postFADepreciationJournals(session *models.UserSession, runID, period string) bool {
	lines, err := h.faRepo.GetRunEntries(runID, session.CompanyID)
	if err != nil || len(lines) == 0 {
		return false
	}
	type key struct{ exp, accum string }
	grp := map[key]float64{}
	for _, l := range lines {
		grp[key{l.ExpAcct, l.AccumAcct}] += l.Amount
	}
	var jl []faLine
	for k, amt := range grp {
		if amt <= 0 {
			continue
		}
		jl = append(jl, faLine{k.exp, amt, 0}, faLine{k.accum, 0, amt})
	}
	jid := h.postFAJournal(session, "Depreciation "+period, runID, jl)
	if jid != "" {
		h.faRepo.SetRunJournal(runID, session.CompanyID, jid)
		return true
	}
	return false
}

func (h *Handler) runFADepreciation(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		Period string `json:"period"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Period == "" {
		Error(w, http.StatusBadRequest, "period (YYYY-MM) required")
		return
	}
	runID, count, total, err := h.faRepo.RunDepreciation(uuid.New().String(), session.CompanyID, req.Period, session.UserID)
	if err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	glPosted := false
	if total > 0 {
		if s, e := h.faRepo.GetSettings(session.CompanyID); e == nil && s != nil && s.AutoPostGL {
			glPosted = h.postFADepreciationJournals(session, runID, req.Period)
		}
	}
	JSON(w, http.StatusOK, map[string]interface{}{"run_id": runID, "asset_count": count, "total_amount": total, "gl_posted": glPosted})
}

func (h *Handler) voidFARun(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID     string `json:"id"`
		Period string `json:"period"`
	}
	Decode(r, &req)
	if req.ID == "" {
		Error(w, http.StatusBadRequest, "id required")
		return
	}
	// Capture the account groupings before the entries are voided out.
	lines, _ := h.faRepo.GetRunEntries(req.ID, session.CompanyID)
	total, err := h.faRepo.VoidRun(req.ID, session.CompanyID)
	if err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if total > 0 && len(lines) > 0 {
		if s, e := h.faRepo.GetSettings(session.CompanyID); e == nil && s != nil && s.AutoPostGL {
			type key struct{ exp, accum string }
			grp := map[key]float64{}
			for _, l := range lines {
				grp[key{l.ExpAcct, l.AccumAcct}] += l.Amount
			}
			var jl []faLine
			for k, amt := range grp {
				if amt <= 0 {
					continue
				}
				// Reverse of depreciation: Dr Accum-Dep / Cr Dep-Expense.
				jl = append(jl, faLine{k.accum, amt, 0}, faLine{k.exp, 0, amt})
			}
			h.postFAJournal(session, "Reversal of depreciation "+req.Period, req.ID, jl)
		}
	}
	JSON(w, http.StatusOK, map[string]interface{}{"ok": true, "reversed": total})
}

// --- Disposals ---

func (h *Handler) getFADisposals(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	rows, err := h.faRepo.GetDisposals(session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if rows == nil {
		rows = []models.FADisposal{}
	}
	JSON(w, http.StatusOK, rows)
}

func (h *Handler) createFADisposal(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		AssetID   string  `json:"asset_id"`
		Date      string  `json:"disposal_date"`
		Type      string  `json:"disposal_type"`
		Proceeds  float64 `json:"proceeds"`
		Buyer     string  `json:"buyer"`
		Reference string  `json:"reference"`
		Notes     string  `json:"notes"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.AssetID == "" || req.Date == "" {
		Error(w, http.StatusBadRequest, "asset_id and disposal_date required")
		return
	}
	if req.Type == "" {
		req.Type = "sale"
	}
	d := &models.FADisposal{
		ID: uuid.New().String(), CompanyID: session.CompanyID, AssetID: req.AssetID,
		DisposalDate: req.Date, DisposalType: req.Type, Proceeds: req.Proceeds,
		Buyer: req.Buyer, Reference: req.Reference, Notes: req.Notes,
	}
	cost, accum, book, gain, err := h.faRepo.CreateDisposal(d, session.UserID)
	if err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	d.BookValue = book
	d.AccumulatedDepreciation = accum
	d.GainLoss = gain

	glPosted := false
	if s, e := h.faRepo.GetSettings(session.CompanyID); e == nil && s != nil && s.AutoPostGL {
		asset, _ := h.faRepo.GetAsset(req.AssetID, session.CompanyID)
		if asset != nil {
			res := h.resolveFAAccounts(session.CompanyID, asset, s)
			lines := []faLine{
				{res.accum, accum, 0}, // Dr accumulated depreciation
				{res.asset, 0, cost},  // Cr asset cost
				{s.CashAccountID, req.Proceeds, 0},
			}
			if gain > 0 {
				lines = append(lines, faLine{s.DisposalGainAccountID, 0, gain})
			} else if gain < 0 {
				lines = append(lines, faLine{s.DisposalLossAccountID, -gain, 0})
			}
			jid := h.postFAJournal(session, fmt.Sprintf("Disposal %s", asset.AssetNumber), d.ID, lines)
			if jid != "" {
				h.faRepo.SetDisposalJournal(d.ID, session.CompanyID, jid)
				glPosted = true
			}
		}
	}
	JSON(w, http.StatusCreated, map[string]interface{}{"disposal": d, "gl_posted": glPosted})
}

// --- Maintenance ---

func (h *Handler) getFAMaintenance(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		AssetID string `json:"asset_id"`
	}
	Decode(r, &req)
	rows, err := h.faRepo.GetMaintenance(session.CompanyID, req.AssetID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if rows == nil {
		rows = []models.FAMaintenance{}
	}
	JSON(w, http.StatusOK, rows)
}

func (h *Handler) createFAMaintenance(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		AssetID         string  `json:"asset_id"`
		ServiceDate     string  `json:"service_date"`
		MaintenanceType string  `json:"maintenance_type"`
		Description     string  `json:"description"`
		Cost            float64 `json:"cost"`
		Vendor          string  `json:"vendor"`
		PerformedBy     string  `json:"performed_by"`
		NextServiceDate string  `json:"next_service_date"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.AssetID == "" || req.ServiceDate == "" {
		Error(w, http.StatusBadRequest, "asset_id and service_date required")
		return
	}
	m := &models.FAMaintenance{
		ID: uuid.New().String(), CompanyID: session.CompanyID, AssetID: req.AssetID,
		ServiceDate: req.ServiceDate, MaintenanceType: req.MaintenanceType, Description: req.Description,
		Cost: req.Cost, Vendor: req.Vendor, PerformedBy: req.PerformedBy, NextServiceDate: req.NextServiceDate,
	}
	if err := h.faRepo.CreateMaintenance(m, session.UserID); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	JSON(w, http.StatusCreated, m)
}

func (h *Handler) updateFAMaintenance(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID              string  `json:"id"`
		ServiceDate     string  `json:"service_date"`
		MaintenanceType string  `json:"maintenance_type"`
		Description     string  `json:"description"`
		Cost            float64 `json:"cost"`
		Vendor          string  `json:"vendor"`
		PerformedBy     string  `json:"performed_by"`
		NextServiceDate string  `json:"next_service_date"`
	}
	Decode(r, &req)
	m := &models.FAMaintenance{
		ID: req.ID, CompanyID: session.CompanyID,
		ServiceDate: req.ServiceDate, MaintenanceType: req.MaintenanceType, Description: req.Description,
		Cost: req.Cost, Vendor: req.Vendor, PerformedBy: req.PerformedBy, NextServiceDate: req.NextServiceDate,
	}
	if err := h.faRepo.UpdateMaintenance(m); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, m)
}

func (h *Handler) deleteFAMaintenance(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	if err := h.faRepo.DeleteMaintenance(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// --- Transfers ---

func (h *Handler) getFATransfers(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		AssetID string `json:"asset_id"`
	}
	Decode(r, &req)
	rows, err := h.faRepo.GetTransfers(session.CompanyID, req.AssetID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if rows == nil {
		rows = []models.FATransfer{}
	}
	JSON(w, http.StatusOK, rows)
}

func (h *Handler) createFATransfer(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		AssetID       string `json:"asset_id"`
		TransferDate  string `json:"transfer_date"`
		ToDepartment  string `json:"to_department"`
		ToLocation    string `json:"to_location"`
		ToCustodianID string `json:"to_custodian_id"`
		Notes         string `json:"notes"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.AssetID == "" || req.TransferDate == "" {
		Error(w, http.StatusBadRequest, "asset_id and transfer_date required")
		return
	}
	t := &models.FATransfer{
		ID: uuid.New().String(), CompanyID: session.CompanyID, AssetID: req.AssetID,
		TransferDate: req.TransferDate, ToDepartment: req.ToDepartment, ToLocation: req.ToLocation,
		ToCustodianID: req.ToCustodianID, Notes: req.Notes,
	}
	if err := h.faRepo.CreateTransfer(t, session.UserID); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	JSON(w, http.StatusCreated, t)
}

// --- Revaluations & impairment ---

func (h *Handler) getFARevaluations(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	rows, err := h.faRepo.GetRevaluations(session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if rows == nil {
		rows = []models.FARevaluation{}
	}
	JSON(w, http.StatusOK, rows)
}

func (h *Handler) createFARevaluation(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		AssetID  string  `json:"asset_id"`
		Date     string  `json:"revaluation_date"`
		Type     string  `json:"revaluation_type"`
		NewValue float64 `json:"new_value"`
		Reason   string  `json:"reason"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.AssetID == "" || req.Date == "" {
		Error(w, http.StatusBadRequest, "asset_id and revaluation_date required")
		return
	}
	if req.Type == "" {
		req.Type = "revaluation"
	}
	v := &models.FARevaluation{
		ID: uuid.New().String(), CompanyID: session.CompanyID, AssetID: req.AssetID,
		RevaluationDate: req.Date, RevaluationType: req.Type, NewValue: req.NewValue, Reason: req.Reason,
	}
	old, delta, err := h.faRepo.CreateRevaluation(v, session.UserID)
	if err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	v.OldValue = old
	v.Delta = delta

	glPosted := false
	if s, e := h.faRepo.GetSettings(session.CompanyID); e == nil && s != nil && s.AutoPostGL && delta != 0 {
		asset, _ := h.faRepo.GetAsset(req.AssetID, session.CompanyID)
		if asset != nil {
			res := h.resolveFAAccounts(session.CompanyID, asset, s)
			var lines []faLine
			var memo string
			if delta > 0 {
				memo = "Revaluation increase " + asset.AssetNumber
				lines = []faLine{{res.asset, delta, 0}, {s.RevaluationSurplusAccountID, 0, delta}}
			} else {
				memo = "Impairment " + asset.AssetNumber
				lines = []faLine{{s.ImpairmentLossAccountID, -delta, 0}, {res.accum, 0, -delta}}
			}
			jid := h.postFAJournal(session, memo, v.ID, lines)
			if jid != "" {
				h.faRepo.SetRevaluationJournal(v.ID, session.CompanyID, jid)
				glPosted = true
			}
		}
	}
	JSON(w, http.StatusCreated, map[string]interface{}{"revaluation": v, "gl_posted": glPosted})
}

// --- Settings ---

func (h *Handler) getFASettings(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	s, err := h.faRepo.GetSettings(session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, s)
}

func (h *Handler) saveFASettings(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.FASettings
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	req.CompanyID = session.CompanyID
	if err := h.faRepo.UpsertSettings(&req); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	JSON(w, http.StatusOK, &req)
}

// ==================== SALES / ORDER MANAGEMENT ====================

type soLine struct {
	acct string
	dr   float64
	cr   float64
}

func soRound2(x float64) float64 { return math.Round(x*100) / 100 }

// postSOJournal builds and posts a balanced N-line journal for a sales event
// (revenue). Same discipline as postFAJournal; source_type "sales".
func (h *Handler) postSOJournal(session *models.UserSession, memo, sourceID string, lines []soLine) string {
	var kept []soLine
	var sumDr, sumCr float64
	for _, l := range lines {
		if l.dr == 0 && l.cr == 0 {
			continue
		}
		if l.acct == "" {
			log.Printf("sales journal %q: unmapped account, skipping post", memo)
			return ""
		}
		kept = append(kept, l)
		sumDr += l.dr
		sumCr += l.cr
	}
	if len(kept) < 2 || sumDr <= 0 || math.Abs(sumDr-sumCr) > 0.005 {
		if sumDr > 0 {
			log.Printf("sales journal %q not balanced (dr=%.2f cr=%.2f), skipping", memo, sumDr, sumCr)
		}
		return ""
	}
	entryNum, _ := h.acctRepo.NextEntryNumber(session.CompanyID)
	entryID := uuid.New().String()
	date := time.Now().Format("2006-01-02")
	if err := h.acctRepo.CreateJournalEntry(entryID, session.CompanyID, entryNum, date, memo, "sales", sourceID, "Draft"); err != nil {
		log.Printf("sales journal create: %v", err)
		return ""
	}
	for i, l := range kept {
		if err := h.acctRepo.AddJournalLine(entryID, session.CompanyID, l.acct, memo, l.dr, l.cr, i); err != nil {
			log.Printf("sales journal line: %v", err)
			return ""
		}
	}
	h.acctRepo.UpdateJournalTotals(entryID, session.CompanyID)
	if err := h.acctRepo.PostJournalEntry(entryID, session.CompanyID, session.UserID); err != nil {
		log.Printf("sales journal post: %v", err)
		return ""
	}
	return entryID
}

// --- Dashboard / settings / helpers ---

func (h *Handler) getSOStats(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	stats, err := h.soRepo.Stats(session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, stats)
}

func (h *Handler) getSOBackorders(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	rows, err := h.soRepo.GetBackorders(session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if rows == nil {
		rows = []models.SOBackorder{}
	}
	JSON(w, http.StatusOK, rows)
}

func (h *Handler) getSOSettings(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	s, err := h.soRepo.GetSettings(session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, s)
}

func (h *Handler) saveSOSettings(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.SOSettings
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	req.CompanyID = session.CompanyID
	if req.DefaultPaymentTerms == 0 {
		req.DefaultPaymentTerms = 30
	}
	if req.QuoteValidDays == 0 {
		req.QuoteValidDays = 30
	}
	if err := h.soRepo.UpsertSettings(&req); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	// Warn if revenue auto-post is on but COGS (inventory) posting is off.
	warn := ""
	if req.AutoPostGL {
		if s, e := h.invRepo.GetSettings(session.CompanyID); e == nil && (s == nil || !s.AutoPostGL) {
			warn = "Inventory GL auto-posting is off, so COGS will not post on fulfillment; enable it in Inventory → Settings to keep margins correct."
		}
	}
	JSON(w, http.StatusOK, map[string]interface{}{"settings": &req, "warning": warn})
}

func (h *Handler) resolveSOPrice(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		CustomerID  string  `json:"customer_id"`
		ProductID   string  `json:"product_id"`
		Quantity    float64 `json:"quantity"`
		PriceListID string  `json:"price_list_id"`
	}
	Decode(r, &req)
	price, err := h.soRepo.ResolvePrice(session.CompanyID, req.CustomerID, req.ProductID, req.Quantity, req.PriceListID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]float64{"unit_price": price})
}

func (h *Handler) checkSOAvailability(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ProductID   string `json:"product_id"`
		WarehouseID string `json:"warehouse_id"`
	}
	Decode(r, &req)
	avail, onHand, reserved, err := h.soRepo.CheckAvailability(session.CompanyID, req.ProductID, req.WarehouseID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]float64{"available_qty": avail, "on_hand": onHand, "reserved": reserved})
}

// --- Price lists ---

func (h *Handler) getSOPriceLists(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	rows, err := h.soRepo.GetPriceLists(session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if rows == nil {
		rows = []models.SOPriceList{}
	}
	JSON(w, http.StatusOK, rows)
}

func (h *Handler) getSOPriceList(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	items, err := h.soRepo.GetPriceListItems(req.ID, session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if items == nil {
		items = []models.SOPriceListItem{}
	}
	JSON(w, http.StatusOK, map[string]interface{}{"items": items})
}

func (h *Handler) createSOPriceList(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		Name       string `json:"name"`
		CustomerID string `json:"customer_id"`
		Tier       string `json:"tier"`
		IsDefault  bool   `json:"is_default"`
		ValidFrom  string `json:"valid_from"`
		ValidTo    string `json:"valid_to"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Name == "" {
		Error(w, http.StatusBadRequest, "name required")
		return
	}
	pl := &models.SOPriceList{ID: uuid.New().String(), CompanyID: session.CompanyID, Name: req.Name, CustomerID: req.CustomerID, Tier: req.Tier, IsDefault: req.IsDefault, ValidFrom: req.ValidFrom, ValidTo: req.ValidTo}
	if err := h.soRepo.CreatePriceList(pl); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	JSON(w, http.StatusCreated, pl)
}

func (h *Handler) updateSOPriceList(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID         string `json:"id"`
		Name       string `json:"name"`
		CustomerID string `json:"customer_id"`
		Tier       string `json:"tier"`
		IsDefault  bool   `json:"is_default"`
		ValidFrom  string `json:"valid_from"`
		ValidTo    string `json:"valid_to"`
		IsActive   bool   `json:"is_active"`
	}
	Decode(r, &req)
	pl := &models.SOPriceList{ID: req.ID, CompanyID: session.CompanyID, Name: req.Name, CustomerID: req.CustomerID, Tier: req.Tier, IsDefault: req.IsDefault, ValidFrom: req.ValidFrom, ValidTo: req.ValidTo, IsActive: req.IsActive}
	if err := h.soRepo.UpdatePriceList(pl); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	JSON(w, http.StatusOK, pl)
}

func (h *Handler) deleteSOPriceList(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	if err := h.soRepo.DeletePriceList(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) addSOPriceListItem(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		PriceListID string  `json:"price_list_id"`
		ProductID   string  `json:"product_id"`
		MinQty      float64 `json:"min_qty"`
		UnitPrice   float64 `json:"unit_price"`
		DiscountPct float64 `json:"discount_pct"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	it := &models.SOPriceListItem{ID: uuid.New().String(), CompanyID: session.CompanyID, PriceListID: req.PriceListID, ProductID: req.ProductID, MinQty: req.MinQty, UnitPrice: req.UnitPrice, DiscountPct: req.DiscountPct}
	if err := h.soRepo.AddPriceListItem(it); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	items, _ := h.soRepo.GetPriceListItems(req.PriceListID, session.CompanyID)
	JSON(w, http.StatusCreated, items)
}

func (h *Handler) deleteSOPriceListItem(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	if err := h.soRepo.DeletePriceListItem(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// --- Quotes ---

type soItemReq struct {
	ProductID        string  `json:"product_id"`
	Description      string  `json:"description"`
	Quantity         float64 `json:"quantity"`
	UnitPrice        float64 `json:"unit_price"`
	DiscountPct      float64 `json:"discount_pct"`
	TaxRate          float64 `json:"tax_rate"`
	WarehouseID      string  `json:"warehouse_id"`
	RevenueAccountID string  `json:"revenue_account_id"`
}

func (h *Handler) getSOQuotes(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		Status string `json:"status"`
	}
	Decode(r, &req)
	rows, err := h.soRepo.GetQuotes(session.CompanyID, req.Status)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if rows == nil {
		rows = []models.SOQuote{}
	}
	JSON(w, http.StatusOK, rows)
}

func (h *Handler) getSOQuote(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	q, err := h.soRepo.GetQuote(req.ID, session.CompanyID)
	if err != nil {
		Error(w, http.StatusNotFound, err.Error())
		return
	}
	items, _ := h.soRepo.GetQuoteItems(req.ID, session.CompanyID)
	q.Items = items
	JSON(w, http.StatusOK, q)
}

func (h *Handler) createSOQuote(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		CustomerID  string      `json:"customer_id"`
		QuoteDate   string      `json:"quote_date"`
		ValidUntil  string      `json:"valid_until"`
		PriceListID string      `json:"price_list_id"`
		DiscountPct float64     `json:"discount_pct"`
		Notes       string      `json:"notes"`
		Items       []soItemReq `json:"items"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.CustomerID == "" {
		Error(w, http.StatusBadRequest, "customer_id required")
		return
	}
	q := &models.SOQuote{ID: uuid.New().String(), CompanyID: session.CompanyID, CustomerID: req.CustomerID, QuoteDate: req.QuoteDate, ValidUntil: req.ValidUntil, PriceListID: req.PriceListID, DiscountPct: req.DiscountPct, Notes: req.Notes}
	num, err := h.soRepo.CreateQuote(q, session.UserID)
	if err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	q.QuoteNumber = num
	for i, it := range req.Items {
		item := &models.SOQuoteItem{ID: uuid.New().String(), CompanyID: session.CompanyID, QuoteID: q.ID, ProductID: it.ProductID, Description: it.Description, Quantity: it.Quantity, UnitPrice: it.UnitPrice, DiscountPct: it.DiscountPct, TaxRate: it.TaxRate, SortOrder: i}
		if err := h.soRepo.AddQuoteItem(item); err != nil {
			Error(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	h.soRepo.UpdateQuoteTotals(q.ID, session.CompanyID)
	result, _ := h.soRepo.GetQuote(q.ID, session.CompanyID)
	if result != nil {
		result.Items, _ = h.soRepo.GetQuoteItems(q.ID, session.CompanyID)
		JSON(w, http.StatusCreated, result)
		return
	}
	JSON(w, http.StatusCreated, q)
}

func (h *Handler) updateSOQuote(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID          string      `json:"id"`
		CustomerID  string      `json:"customer_id"`
		QuoteDate   string      `json:"quote_date"`
		ValidUntil  string      `json:"valid_until"`
		PriceListID string      `json:"price_list_id"`
		DiscountPct float64     `json:"discount_pct"`
		Notes       string      `json:"notes"`
		Items       []soItemReq `json:"items"`
	}
	Decode(r, &req)
	q := &models.SOQuote{ID: req.ID, CompanyID: session.CompanyID, CustomerID: req.CustomerID, QuoteDate: req.QuoteDate, ValidUntil: req.ValidUntil, PriceListID: req.PriceListID, DiscountPct: req.DiscountPct, Notes: req.Notes}
	if err := h.soRepo.UpdateQuote(q); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.Items != nil {
		if err := h.soRepo.ClearQuoteItems(req.ID, session.CompanyID); err != nil {
			Error(w, http.StatusBadRequest, err.Error())
			return
		}
		for i, it := range req.Items {
			item := &models.SOQuoteItem{ID: uuid.New().String(), CompanyID: session.CompanyID, QuoteID: req.ID, ProductID: it.ProductID, Description: it.Description, Quantity: it.Quantity, UnitPrice: it.UnitPrice, DiscountPct: it.DiscountPct, TaxRate: it.TaxRate, SortOrder: i}
			if err := h.soRepo.AddQuoteItem(item); err != nil {
				Error(w, http.StatusBadRequest, err.Error())
				return
			}
		}
	}
	h.soRepo.UpdateQuoteTotals(req.ID, session.CompanyID)
	result, _ := h.soRepo.GetQuote(req.ID, session.CompanyID)
	if result != nil {
		result.Items, _ = h.soRepo.GetQuoteItems(req.ID, session.CompanyID)
	}
	JSON(w, http.StatusOK, result)
}

func (h *Handler) updateSOQuoteStatus(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	}
	Decode(r, &req)
	if err := h.soRepo.UpdateQuoteStatus(req.ID, session.CompanyID, req.Status); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) deleteSOQuote(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	if err := h.soRepo.DeleteQuote(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) convertSOQuote(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	orderID := uuid.New().String()
	num, err := h.soRepo.ConvertQuote(orderID, session.CompanyID, req.ID, session.UserID)
	if err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	order, _ := h.soRepo.GetOrder(orderID, session.CompanyID)
	JSON(w, http.StatusCreated, map[string]interface{}{"order_id": orderID, "order_number": num, "order": order})
}

// --- Orders ---

func (h *Handler) getSOOrders(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		Status   string `json:"status"`
		Customer string `json:"customer_id"`
	}
	Decode(r, &req)
	rows, err := h.soRepo.GetOrders(session.CompanyID, req.Status, req.Customer)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if rows == nil {
		rows = []models.SOOrder{}
	}
	JSON(w, http.StatusOK, rows)
}

func (h *Handler) getSOOrder(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	o, err := h.soRepo.GetOrder(req.ID, session.CompanyID)
	if err != nil {
		Error(w, http.StatusNotFound, err.Error())
		return
	}
	o.Items, _ = h.soRepo.GetOrderItems(req.ID, session.CompanyID)
	o.Shipments, _ = h.soRepo.GetShipments(session.CompanyID, req.ID)
	JSON(w, http.StatusOK, o)
}

func (h *Handler) createSOOrder(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		CustomerID   string      `json:"customer_id"`
		OrderDate    string      `json:"order_date"`
		ExpectedDate string      `json:"expected_ship_date"`
		PriceListID  string      `json:"price_list_id"`
		WarehouseID  string      `json:"warehouse_id"`
		DiscountPct  float64     `json:"discount_pct"`
		Notes        string      `json:"notes"`
		Items        []soItemReq `json:"items"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.CustomerID == "" {
		Error(w, http.StatusBadRequest, "customer_id required")
		return
	}
	o := &models.SOOrder{ID: uuid.New().String(), CompanyID: session.CompanyID, CustomerID: req.CustomerID, OrderDate: req.OrderDate, ExpectedShipDate: req.ExpectedDate, PriceListID: req.PriceListID, WarehouseID: req.WarehouseID, DiscountPct: req.DiscountPct, Notes: req.Notes}
	num, err := h.soRepo.CreateOrder(o, session.UserID)
	if err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	o.OrderNumber = num
	for i, it := range req.Items {
		item := &models.SOOrderItem{ID: uuid.New().String(), CompanyID: session.CompanyID, OrderID: o.ID, ProductID: it.ProductID, Description: it.Description, Quantity: it.Quantity, UnitPrice: it.UnitPrice, DiscountPct: it.DiscountPct, TaxRate: it.TaxRate, WarehouseID: it.WarehouseID, RevenueAccountID: it.RevenueAccountID, SortOrder: i}
		if err := h.soRepo.AddOrderItem(item); err != nil {
			Error(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	h.soRepo.UpdateOrderTotals(o.ID, session.CompanyID)
	result, _ := h.soRepo.GetOrder(o.ID, session.CompanyID)
	if result != nil {
		result.Items, _ = h.soRepo.GetOrderItems(o.ID, session.CompanyID)
		JSON(w, http.StatusCreated, result)
		return
	}
	JSON(w, http.StatusCreated, o)
}

func (h *Handler) updateSOOrder(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID           string      `json:"id"`
		CustomerID   string      `json:"customer_id"`
		OrderDate    string      `json:"order_date"`
		ExpectedDate string      `json:"expected_ship_date"`
		PriceListID  string      `json:"price_list_id"`
		WarehouseID  string      `json:"warehouse_id"`
		DiscountPct  float64     `json:"discount_pct"`
		Notes        string      `json:"notes"`
		Items        []soItemReq `json:"items"`
	}
	Decode(r, &req)
	o := &models.SOOrder{ID: req.ID, CompanyID: session.CompanyID, CustomerID: req.CustomerID, OrderDate: req.OrderDate, ExpectedShipDate: req.ExpectedDate, PriceListID: req.PriceListID, WarehouseID: req.WarehouseID, DiscountPct: req.DiscountPct, Notes: req.Notes}
	if err := h.soRepo.UpdateOrder(o); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.Items != nil {
		if err := h.soRepo.ClearOrderItems(req.ID, session.CompanyID); err != nil {
			Error(w, http.StatusBadRequest, err.Error())
			return
		}
		for i, it := range req.Items {
			item := &models.SOOrderItem{ID: uuid.New().String(), CompanyID: session.CompanyID, OrderID: req.ID, ProductID: it.ProductID, Description: it.Description, Quantity: it.Quantity, UnitPrice: it.UnitPrice, DiscountPct: it.DiscountPct, TaxRate: it.TaxRate, WarehouseID: it.WarehouseID, RevenueAccountID: it.RevenueAccountID, SortOrder: i}
			if err := h.soRepo.AddOrderItem(item); err != nil {
				Error(w, http.StatusBadRequest, err.Error())
				return
			}
		}
	}
	h.soRepo.UpdateOrderTotals(req.ID, session.CompanyID)
	result, _ := h.soRepo.GetOrder(req.ID, session.CompanyID)
	if result != nil {
		result.Items, _ = h.soRepo.GetOrderItems(req.ID, session.CompanyID)
	}
	JSON(w, http.StatusOK, result)
}

func (h *Handler) confirmSOOrder(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	if err := h.soRepo.ConfirmOrder(req.ID, session.CompanyID, session.UserID); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	result, _ := h.soRepo.GetOrder(req.ID, session.CompanyID)
	if result != nil {
		result.Items, _ = h.soRepo.GetOrderItems(req.ID, session.CompanyID)
	}
	JSON(w, http.StatusOK, result)
}

func (h *Handler) cancelSOOrder(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	if err := h.soRepo.CancelOrder(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) closeSOOrder(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	if err := h.soRepo.CloseOrder(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) deleteSOOrder(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	if err := h.soRepo.DeleteOrder(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) getSOReservations(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		OrderID string `json:"order_id"`
	}
	Decode(r, &req)
	rows, err := h.soRepo.GetReservations(session.CompanyID, req.OrderID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if rows == nil {
		rows = []models.SOReservation{}
	}
	JSON(w, http.StatusOK, rows)
}

// --- Shipments / fulfillment ---

func (h *Handler) getSOShipments(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		OrderID string `json:"order_id"`
	}
	Decode(r, &req)
	rows, err := h.soRepo.GetShipments(session.CompanyID, req.OrderID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if rows == nil {
		rows = []models.SOShipment{}
	}
	JSON(w, http.StatusOK, rows)
}

func (h *Handler) createSOShipment(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		OrderID     string `json:"order_id"`
		WarehouseID string `json:"warehouse_id"`
		Carrier     string `json:"carrier"`
		Tracking    string `json:"tracking_number"`
		ShipDate    string `json:"ship_date"`
		Notes       string `json:"notes"`
		Lines       []struct {
			OrderItemID string  `json:"order_item_id"`
			ShipQty     float64 `json:"ship_qty"`
		} `json:"lines"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.OrderID == "" || len(req.Lines) == 0 {
		Error(w, http.StatusBadRequest, "order_id and lines required")
		return
	}
	order, err := h.soRepo.GetOrder(req.OrderID, session.CompanyID)
	if err != nil {
		Error(w, http.StatusNotFound, "order not found")
		return
	}
	items, _ := h.soRepo.GetOrderItems(req.OrderID, session.CompanyID)
	valid := map[string]bool{}
	for _, it := range items {
		valid[it.ID] = true
	}
	// Merge duplicate order-item lines so a repeated id can't over-fulfill.
	merged := map[string]float64{}
	for _, l := range req.Lines {
		if l.ShipQty <= 0 {
			continue
		}
		if !valid[l.OrderItemID] {
			Error(w, http.StatusBadRequest, "unknown order item in this order")
			return
		}
		merged[l.OrderItemID] += l.ShipQty
	}
	var flines []repository.SOFulfillLine
	for oiid, q := range merged {
		flines = append(flines, repository.SOFulfillLine{OrderItemID: oiid, ShipQty: q})
	}
	if len(flines) == 0 {
		Error(w, http.StatusBadRequest, "nothing to ship")
		return
	}
	wid := req.WarehouseID
	if wid == "" {
		wid = order.WarehouseID
	}
	shipID := uuid.New().String()
	if err := h.soRepo.Fulfill(shipID, session.CompanyID, req.OrderID, session.UserID, wid, req.Carrier, req.Tracking, req.ShipDate, req.Notes, flines); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	// COGS is inventory's: post Dr COGS / Cr Inventory once per movement created by the fulfill SP.
	cogsPosted := false
	sitems, _ := h.soRepo.GetShipmentItems(shipID, session.CompanyID)
	for _, si := range sitems {
		if si.MovementID == "" || si.ProductID == "" {
			continue
		}
		cost := 0.0
		if p, e := h.invRepo.GetProduct(si.ProductID, session.CompanyID); e == nil && p != nil {
			cost = p.CostPrice
		}
		m := &models.InvMovement{ID: si.MovementID, CompanyID: session.CompanyID, ProductID: si.ProductID, MovementType: "out", Quantity: si.Quantity}
		h.maybePostMovementJournal(session, m, cost)
		if m.JournalEntryID != "" {
			h.soRepo.SetShipmentItemJournal(si.MovementID, session.CompanyID, m.JournalEntryID)
			cogsPosted = true
		}
	}
	// Optional auto-invoice for the newly fulfilled quantities.
	invoiceInfo := map[string]interface{}{}
	if s, e := h.soRepo.GetSettings(session.CompanyID); e == nil && s.AutoInvoiceOnFulfill {
		if inv, revPosted, ierr := h.doGenerateSOInvoice(session, req.OrderID); ierr == nil && inv != nil {
			invoiceInfo = map[string]interface{}{"invoice_id": inv.ID, "invoice_number": inv.InvoiceNumber, "revenue_posted": revPosted}
		}
	}
	shipments, _ := h.soRepo.GetShipments(session.CompanyID, req.OrderID)
	JSON(w, http.StatusCreated, map[string]interface{}{"shipment_id": shipID, "cogs_posted": cogsPosted, "shipments": shipments, "auto_invoice": invoiceInfo})
}

func (h *Handler) markSOShipmentDelivered(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID   string `json:"id"`
		Date string `json:"delivered_date"`
	}
	Decode(r, &req)
	if err := h.soRepo.MarkShipmentDelivered(req.ID, session.CompanyID, req.Date); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) cancelSOShipment(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	lines, err := h.soRepo.CancelShipment(req.ID, session.CompanyID, session.UserID)
	if err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	// Reverse the COGS: Dr Inventory / Cr COGS for each reversed movement. This is
	// an inventory event, so post it with source_type "inventory" (reusing the
	// inventory poster) — keeps it out of the sales revenue KPI.
	if s, e := h.invRepo.GetSettings(session.CompanyID); e == nil && s != nil && s.AutoPostGL {
		for _, l := range lines {
			amt := soRound2(l.Quantity * l.UnitCost)
			if amt <= 0 {
				continue
			}
			jid := h.postInvJournal(session, s.InventoryAccountID, s.COGSAccountID, "Shipment cancellation (COGS reversal)", l.MovementID, amt)
			if jid != "" {
				h.invRepo.SetMovementJournal(l.MovementID, session.CompanyID, jid)
			}
		}
	}
	JSON(w, http.StatusOK, map[string]interface{}{"ok": true, "reversed_lines": len(lines)})
}

// --- Invoicing ---

// doGenerateSOInvoice builds an AR invoice from the order's uninvoiced quantities
// and posts the revenue journal (Dr A/R / Cr Revenue / Cr Tax) exactly once.
func (h *Handler) doGenerateSOInvoice(session *models.UserSession, orderID string) (*models.Invoice, bool, error) {
	order, err := h.soRepo.GetOrder(orderID, session.CompanyID)
	if err != nil {
		return nil, false, err
	}
	lines, err := h.soRepo.GetUninvoiced(orderID, session.CompanyID)
	if err != nil {
		return nil, false, err
	}
	if len(lines) == 0 {
		return nil, false, fmt.Errorf("nothing to invoice")
	}
	s, _ := h.soRepo.GetSettings(session.CompanyID)
	orderDisc := order.DiscountPct / 100

	iid := uuid.New().String()
	seq := order.InvoiceSeq + 1
	invoiceNumber := fmt.Sprintf("SO-%06d-%d", order.OrderNumber, seq)
	invDate := time.Now().Format("2006-01-02")
	dueDate := invDate
	if od := order.OrderDate; len(od) >= 10 {
		if t, e := time.Parse("2006-01-02", od[:10]); e == nil {
			dueDate = t.AddDate(0, 0, s.DefaultPaymentTerms).Format("2006-01-02")
		}
	}
	inv := &models.Invoice{ID: iid, CompanyID: session.CompanyID, CustomerID: order.CustomerID, InvoiceNumber: invoiceNumber, InvoiceDate: invDate, DueDate: dueDate, Reference: fmt.Sprintf("SO-%06d", order.OrderNumber)}
	if err := h.arRepo.CreateInvoice(inv); err != nil {
		return nil, false, err
	}

	revByAcct := map[string]float64{}
	var totalTax float64
	for i, l := range lines {
		revAcct := l.RevenueAccountID
		if revAcct == "" {
			revAcct = s.DefaultRevenueAccountID
		}
		effUnit := l.UnitPrice * (1 - l.DiscountPct/100) * (1 - orderDisc)
		amt := soRound2(l.BillableQty * effUnit)
		ta := soRound2(amt * l.TaxRate / 100)
		desc := l.Description
		if desc == "" {
			desc = l.ProductName
		}
		if err := h.arRepo.AddInvoiceItem(iid, session.CompanyID, revAcct, desc, l.BillableQty, effUnit, amt, l.TaxRate, ta, i); err != nil {
			h.arRepo.VoidInvoice(iid, session.CompanyID)
			return nil, false, err
		}
		revByAcct[revAcct] += amt
		totalTax += ta
	}
	h.arRepo.UpdateInvoiceTotals(iid, session.CompanyID)
	h.arRepo.SendInvoice(iid, session.CompanyID)

	// Revenue GL — built from the same rounded per-line figures.
	revenuePosted := false
	journalID := ""
	if s.AutoPostGL {
		var jl []soLine
		var sumNet float64
		for acct, net := range revByAcct {
			n := soRound2(net)
			if n == 0 {
				continue
			}
			jl = append(jl, soLine{acct, 0, n})
			sumNet += n
		}
		if totalTax > 0 && s.TaxPayableAccountID != "" {
			jl = append(jl, soLine{s.TaxPayableAccountID, 0, soRound2(totalTax)})
		}
		drAR := soRound2(sumNet + totalTax)
		jl = append(jl, soLine{s.ARAccountID, drAR, 0})
		journalID = h.postSOJournal(session, "Sales invoice "+invoiceNumber, iid, jl)
		if journalID == "" {
			// Could not post revenue (unmapped account / tax without account). Void the
			// AR invoice so qty_invoiced never advances and the sale can be re-invoiced.
			h.arRepo.VoidInvoice(iid, session.CompanyID)
			return nil, false, fmt.Errorf("revenue could not be posted — check the Receivable, Revenue and Tax Payable account mappings in Sales settings")
		}
		revenuePosted = true
	}

	count, err := h.soRepo.MarkInvoiced(orderID, session.CompanyID, iid, journalID)
	if err != nil || count == 0 {
		// Either MarkInvoiced errored (its own transaction rolled back, so qty_invoiced
		// did not advance) or a concurrent invoice already billed these lines. Undo THIS
		// invoice completely: void the AR invoice AND reverse the revenue journal we just
		// posted, so revenue can never be double-counted by the losing racer.
		h.arRepo.VoidInvoice(iid, session.CompanyID)
		if journalID != "" {
			h.acctRepo.VoidJournalEntry(journalID, session.CompanyID, session.UserID, "Sales invoice superseded by concurrent invoicing")
		}
		if err != nil {
			return nil, false, err
		}
		return nil, false, fmt.Errorf("nothing to invoice — already billed")
	}
	result, _ := h.arRepo.GetInvoice(iid, session.CompanyID)
	if result == nil {
		result = inv
	}
	return result, revenuePosted, nil
}

func (h *Handler) generateSOInvoice(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		OrderID string `json:"order_id"`
	}
	Decode(r, &req)
	if req.OrderID == "" {
		Error(w, http.StatusBadRequest, "order_id required")
		return
	}
	inv, revenuePosted, err := h.doGenerateSOInvoice(session, req.OrderID)
	if err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	JSON(w, http.StatusCreated, map[string]interface{}{"invoice": inv, "revenue_posted": revenuePosted})
}

// ==================== PROCUREMENT / PURCHASE-TO-PAY ====================

type purLine struct {
	acct string
	dr   float64
	cr   float64
}

func purRound2(x float64) float64 { return math.Round(x*100) / 100 }

// purNet returns the net unit price after discount, rounded to cents.
func purNet(unitPrice, discountPct float64) float64 {
	return purRound2(unitPrice * (1 - discountPct/100))
}

// glBalanced drops zero lines and reports whether the remaining lines form a
// postable journal: at least two lines, every line mapped to an account, a
// positive total, and debits equal to credits within a cent. It is the single
// guard that stops a mis-mapped or lopsided entry from ever posting.
func glBalanced(lines []purLine) ([]purLine, bool) {
	var kept []purLine
	var sumDr, sumCr float64
	for _, l := range lines {
		if l.dr == 0 && l.cr == 0 {
			continue
		}
		if l.acct == "" {
			return nil, false
		}
		kept = append(kept, l)
		sumDr += l.dr
		sumCr += l.cr
	}
	if len(kept) < 2 || sumDr <= 0 || math.Abs(sumDr-sumCr) > 0.005 {
		return nil, false
	}
	return kept, true
}

// postPurJournal builds and posts a balanced N-line journal for a procurement
// event (goods receipt or vendor bill). source_type "procurement". Returns ""
// (skips) if glBalanced rejects the lines — so a mis-mapped chart of accounts can
// never post a lopsided entry.
func (h *Handler) postPurJournal(session *models.UserSession, memo, sourceID string, lines []purLine) string {
	kept, ok := glBalanced(lines)
	if !ok {
		log.Printf("procurement journal %q: unmapped or unbalanced, skipping post", memo)
		return ""
	}
	entryNum, _ := h.acctRepo.NextEntryNumber(session.CompanyID)
	entryID := uuid.New().String()
	date := time.Now().Format("2006-01-02")
	if err := h.acctRepo.CreateJournalEntry(entryID, session.CompanyID, entryNum, date, memo, "procurement", sourceID, "Draft"); err != nil {
		log.Printf("procurement journal create: %v", err)
		return ""
	}
	for i, l := range kept {
		if err := h.acctRepo.AddJournalLine(entryID, session.CompanyID, l.acct, memo, l.dr, l.cr, i); err != nil {
			log.Printf("procurement journal line: %v", err)
			return ""
		}
	}
	h.acctRepo.UpdateJournalTotals(entryID, session.CompanyID)
	if err := h.acctRepo.PostJournalEntry(entryID, session.CompanyID, session.UserID); err != nil {
		log.Printf("procurement journal post: %v", err)
		return ""
	}
	return entryID
}

// --- Dashboard / settings ---

func (h *Handler) getPurStats(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	stats, err := h.procRepo.Stats(session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, stats)
}

func (h *Handler) getPurSettings(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	s, err := h.procRepo.GetSettings(session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, s)
}

func (h *Handler) savePurSettings(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req models.PurSettings
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	req.CompanyID = session.CompanyID
	if req.DefaultPaymentTerms == 0 {
		req.DefaultPaymentTerms = 30
	}
	if err := h.procRepo.UpsertSettings(&req); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	JSON(w, http.StatusOK, &req)
}

// --- Requisitions ---

type purReqItemReq struct {
	ProductID      string  `json:"product_id"`
	Description    string  `json:"description"`
	Quantity       float64 `json:"quantity"`
	EstimatedPrice float64 `json:"estimated_price"`
}

func (h *Handler) getPurRequisitions(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		Status string `json:"status"`
	}
	Decode(r, &req)
	rows, err := h.procRepo.GetRequisitions(session.CompanyID, req.Status)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if rows == nil {
		rows = []models.PurRequisition{}
	}
	JSON(w, http.StatusOK, rows)
}

func (h *Handler) getPurRequisition(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	q, err := h.procRepo.GetRequisition(req.ID, session.CompanyID)
	if err != nil {
		Error(w, http.StatusNotFound, err.Error())
		return
	}
	q.Items, _ = h.procRepo.GetRequisitionItems(req.ID, session.CompanyID)
	JSON(w, http.StatusOK, q)
}

func (h *Handler) createPurRequisition(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		Title      string          `json:"title"`
		Department string          `json:"department"`
		NeededBy   string          `json:"needed_by"`
		Notes      string          `json:"notes"`
		Items      []purReqItemReq `json:"items"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	q := &models.PurRequisition{ID: uuid.New().String(), CompanyID: session.CompanyID, Title: req.Title, Department: req.Department, NeededBy: req.NeededBy, Notes: req.Notes}
	num, err := h.procRepo.CreateRequisition(q, session.UserID)
	if err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	q.RequisitionNumber = num
	for i, it := range req.Items {
		item := &models.PurRequisitionItem{ID: uuid.New().String(), CompanyID: session.CompanyID, RequisitionID: q.ID, ProductID: it.ProductID, Description: it.Description, Quantity: it.Quantity, EstimatedPrice: it.EstimatedPrice, SortOrder: i}
		if err := h.procRepo.AddRequisitionItem(item); err != nil {
			Error(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	h.procRepo.UpdateRequisitionTotals(q.ID, session.CompanyID)
	result, _ := h.procRepo.GetRequisition(q.ID, session.CompanyID)
	if result != nil {
		result.Items, _ = h.procRepo.GetRequisitionItems(q.ID, session.CompanyID)
		JSON(w, http.StatusCreated, result)
		return
	}
	JSON(w, http.StatusCreated, q)
}

func (h *Handler) updatePurRequisition(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID         string          `json:"id"`
		Title      string          `json:"title"`
		Department string          `json:"department"`
		NeededBy   string          `json:"needed_by"`
		Notes      string          `json:"notes"`
		Items      []purReqItemReq `json:"items"`
	}
	Decode(r, &req)
	q := &models.PurRequisition{ID: req.ID, CompanyID: session.CompanyID, Title: req.Title, Department: req.Department, NeededBy: req.NeededBy, Notes: req.Notes}
	if err := h.procRepo.UpdateRequisition(q); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.Items != nil {
		if err := h.procRepo.ClearRequisitionItems(req.ID, session.CompanyID); err != nil {
			Error(w, http.StatusBadRequest, err.Error())
			return
		}
		for i, it := range req.Items {
			item := &models.PurRequisitionItem{ID: uuid.New().String(), CompanyID: session.CompanyID, RequisitionID: req.ID, ProductID: it.ProductID, Description: it.Description, Quantity: it.Quantity, EstimatedPrice: it.EstimatedPrice, SortOrder: i}
			if err := h.procRepo.AddRequisitionItem(item); err != nil {
				Error(w, http.StatusBadRequest, err.Error())
				return
			}
		}
	}
	h.procRepo.UpdateRequisitionTotals(req.ID, session.CompanyID)
	result, _ := h.procRepo.GetRequisition(req.ID, session.CompanyID)
	if result != nil {
		result.Items, _ = h.procRepo.GetRequisitionItems(req.ID, session.CompanyID)
	}
	JSON(w, http.StatusOK, result)
}

func (h *Handler) submitPurRequisition(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	if err := h.procRepo.SubmitRequisition(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) approvePurRequisition(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	if err := h.procRepo.ApproveRequisition(req.ID, session.CompanyID, session.UserID); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) rejectPurRequisition(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID     string `json:"id"`
		Reason string `json:"reason"`
	}
	Decode(r, &req)
	if err := h.procRepo.RejectRequisition(req.ID, session.CompanyID, session.UserID, req.Reason); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) deletePurRequisition(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	if err := h.procRepo.DeleteRequisition(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) convertPurRequisition(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID       string `json:"id"`
		VendorID string `json:"vendor_id"`
	}
	Decode(r, &req)
	if req.VendorID == "" {
		Error(w, http.StatusBadRequest, "vendor_id required")
		return
	}
	orderID := uuid.New().String()
	num, err := h.procRepo.ConvertRequisition(orderID, session.CompanyID, req.ID, req.VendorID, session.UserID)
	if err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	order, _ := h.procRepo.GetOrder(orderID, session.CompanyID)
	JSON(w, http.StatusCreated, map[string]interface{}{"order_id": orderID, "po_number": num, "order": order})
}

// --- Orders ---

type purOrderItemReq struct {
	ProductID        string  `json:"product_id"`
	Description      string  `json:"description"`
	Quantity         float64 `json:"quantity"`
	UnitPrice        float64 `json:"unit_price"`
	DiscountPct      float64 `json:"discount_pct"`
	TaxRate          float64 `json:"tax_rate"`
	WarehouseID      string  `json:"warehouse_id"`
	ExpenseAccountID string  `json:"expense_account_id"`
}

func (h *Handler) getPurOrders(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		Status string `json:"status"`
		Vendor string `json:"vendor_id"`
	}
	Decode(r, &req)
	rows, err := h.procRepo.GetOrders(session.CompanyID, req.Status, req.Vendor)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if rows == nil {
		rows = []models.PurOrder{}
	}
	JSON(w, http.StatusOK, rows)
}

func (h *Handler) getPurOrder(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	o, err := h.procRepo.GetOrder(req.ID, session.CompanyID)
	if err != nil {
		Error(w, http.StatusNotFound, err.Error())
		return
	}
	o.Items, _ = h.procRepo.GetOrderItems(req.ID, session.CompanyID)
	o.Receipts, _ = h.procRepo.GetReceipts(session.CompanyID, req.ID)
	JSON(w, http.StatusOK, o)
}

func (h *Handler) createPurOrder(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		VendorID     string            `json:"vendor_id"`
		OrderDate    string            `json:"order_date"`
		ExpectedDate string            `json:"expected_date"`
		WarehouseID  string            `json:"warehouse_id"`
		Notes        string            `json:"notes"`
		Items        []purOrderItemReq `json:"items"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.VendorID == "" {
		Error(w, http.StatusBadRequest, "vendor_id required")
		return
	}
	o := &models.PurOrder{ID: uuid.New().String(), CompanyID: session.CompanyID, VendorID: req.VendorID, OrderDate: req.OrderDate, ExpectedDate: req.ExpectedDate, WarehouseID: req.WarehouseID, Notes: req.Notes}
	num, err := h.procRepo.CreateOrder(o, session.UserID)
	if err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	o.PONumber = num
	for i, it := range req.Items {
		item := &models.PurOrderItem{ID: uuid.New().String(), CompanyID: session.CompanyID, OrderID: o.ID, ProductID: it.ProductID, Description: it.Description, Quantity: it.Quantity, UnitPrice: it.UnitPrice, DiscountPct: it.DiscountPct, TaxRate: it.TaxRate, WarehouseID: it.WarehouseID, ExpenseAccountID: it.ExpenseAccountID, SortOrder: i}
		if err := h.procRepo.AddOrderItem(item); err != nil {
			Error(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	h.procRepo.UpdateOrderTotals(o.ID, session.CompanyID)
	result, _ := h.procRepo.GetOrder(o.ID, session.CompanyID)
	if result != nil {
		result.Items, _ = h.procRepo.GetOrderItems(o.ID, session.CompanyID)
		JSON(w, http.StatusCreated, result)
		return
	}
	JSON(w, http.StatusCreated, o)
}

func (h *Handler) updatePurOrder(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID           string            `json:"id"`
		VendorID     string            `json:"vendor_id"`
		OrderDate    string            `json:"order_date"`
		ExpectedDate string            `json:"expected_date"`
		WarehouseID  string            `json:"warehouse_id"`
		Notes        string            `json:"notes"`
		Items        []purOrderItemReq `json:"items"`
	}
	Decode(r, &req)
	o := &models.PurOrder{ID: req.ID, CompanyID: session.CompanyID, VendorID: req.VendorID, OrderDate: req.OrderDate, ExpectedDate: req.ExpectedDate, WarehouseID: req.WarehouseID, Notes: req.Notes}
	if err := h.procRepo.UpdateOrder(o); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.Items != nil {
		if err := h.procRepo.ClearOrderItems(req.ID, session.CompanyID); err != nil {
			Error(w, http.StatusBadRequest, err.Error())
			return
		}
		for i, it := range req.Items {
			item := &models.PurOrderItem{ID: uuid.New().String(), CompanyID: session.CompanyID, OrderID: req.ID, ProductID: it.ProductID, Description: it.Description, Quantity: it.Quantity, UnitPrice: it.UnitPrice, DiscountPct: it.DiscountPct, TaxRate: it.TaxRate, WarehouseID: it.WarehouseID, ExpenseAccountID: it.ExpenseAccountID, SortOrder: i}
			if err := h.procRepo.AddOrderItem(item); err != nil {
				Error(w, http.StatusBadRequest, err.Error())
				return
			}
		}
	}
	h.procRepo.UpdateOrderTotals(req.ID, session.CompanyID)
	result, _ := h.procRepo.GetOrder(req.ID, session.CompanyID)
	if result != nil {
		result.Items, _ = h.procRepo.GetOrderItems(req.ID, session.CompanyID)
	}
	JSON(w, http.StatusOK, result)
}

func (h *Handler) approvePurOrder(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	if err := h.procRepo.ApproveOrder(req.ID, session.CompanyID, session.UserID); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	result, _ := h.procRepo.GetOrder(req.ID, session.CompanyID)
	if result != nil {
		result.Items, _ = h.procRepo.GetOrderItems(req.ID, session.CompanyID)
	}
	JSON(w, http.StatusOK, result)
}

func (h *Handler) cancelPurOrder(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	if err := h.procRepo.CancelOrder(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) closePurOrder(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	if err := h.procRepo.CloseOrder(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) deletePurOrder(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	if err := h.procRepo.DeleteOrder(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// --- Receipts (goods receipt) ---

func (h *Handler) getPurReceipts(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		OrderID string `json:"order_id"`
	}
	Decode(r, &req)
	rows, err := h.procRepo.GetReceipts(session.CompanyID, req.OrderID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if rows == nil {
		rows = []models.PurReceipt{}
	}
	JSON(w, http.StatusOK, rows)
}

func (h *Handler) getPurReceivable(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		OrderID string `json:"order_id"`
	}
	Decode(r, &req)
	rows, err := h.procRepo.GetReceivable(req.OrderID, session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if rows == nil {
		rows = []models.PurReceivable{}
	}
	JSON(w, http.StatusOK, rows)
}

// createPurReceipt records a goods receipt (stock in) and posts the inventory GL:
//
//	Dr Inventory (stock lines) / Dr Expense (non-stock lines)  ·  Cr GR/IR clearing
//
// once per receipt, valued at the PO net unit price, guarded by pur_receipts.journal_entry_id.
func (h *Handler) createPurReceipt(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		OrderID     string `json:"order_id"`
		WarehouseID string `json:"warehouse_id"`
		ReceiptDate string `json:"receipt_date"`
		Notes       string `json:"notes"`
		Lines       []struct {
			OrderItemID string  `json:"order_item_id"`
			RecvQty     float64 `json:"recv_qty"`
		} `json:"lines"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.OrderID == "" || len(req.Lines) == 0 {
		Error(w, http.StatusBadRequest, "order_id and lines required")
		return
	}
	order, err := h.procRepo.GetOrder(req.OrderID, session.CompanyID)
	if err != nil {
		Error(w, http.StatusNotFound, "order not found")
		return
	}
	items, _ := h.procRepo.GetOrderItems(req.OrderID, session.CompanyID)
	valid := map[string]bool{}
	for _, it := range items {
		valid[it.ID] = true
	}
	// Merge duplicate order-item lines so a repeated id can't over-receive.
	merged := map[string]float64{}
	for _, l := range req.Lines {
		if l.RecvQty <= 0 {
			continue
		}
		if !valid[l.OrderItemID] {
			Error(w, http.StatusBadRequest, "unknown order item in this order")
			return
		}
		merged[l.OrderItemID] += l.RecvQty
	}
	var flines []repository.ProcReceiveLine
	for oiid, q := range merged {
		flines = append(flines, repository.ProcReceiveLine{OrderItemID: oiid, RecvQty: q})
	}
	if len(flines) == 0 {
		Error(w, http.StatusBadRequest, "nothing to receive")
		return
	}
	wid := req.WarehouseID
	if wid == "" {
		wid = order.WarehouseID
	}
	receiptID := uuid.New().String()
	if err := h.procRepo.Receive(receiptID, session.CompanyID, req.OrderID, session.UserID, wid, req.ReceiptDate, req.Notes, flines); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	// GL: Dr Inventory/Expense / Cr GR-IR, once, from the committed receipt lines.
	glPosted := false
	if s, e := h.procRepo.GetSettings(session.CompanyID); e == nil && s.AutoPostGL {
		ritems, _ := h.procRepo.GetReceiptItems(receiptID, session.CompanyID)
		drByAcct := map[string]float64{}
		var total float64
		for _, ri := range ritems {
			amt := purRound2(ri.Quantity * ri.UnitCost)
			if amt <= 0 {
				continue
			}
			acct := s.InventoryAccountID
			if ri.ProductID == "" {
				acct = ri.ExpenseAccountID
				if acct == "" {
					acct = s.ExpenseAccountID
				}
			}
			drByAcct[acct] += amt
			total += amt
		}
		if total > 0 {
			var jl []purLine
			for acct, amt := range drByAcct {
				jl = append(jl, purLine{acct, purRound2(amt), 0})
			}
			jl = append(jl, purLine{s.GRIRAccountID, 0, purRound2(total)})
			if jid := h.postPurJournal(session, fmt.Sprintf("Goods receipt PO-%06d", order.PONumber), receiptID, jl); jid != "" {
				h.procRepo.SetReceiptJournal(receiptID, session.CompanyID, jid)
				glPosted = true
			}
		}
	}
	receipts, _ := h.procRepo.GetReceipts(session.CompanyID, req.OrderID)
	JSON(w, http.StatusCreated, map[string]interface{}{"receipt_id": receiptID, "gl_posted": glPosted, "receipts": receipts})
}

// cancelPurReceipt reverses a goods receipt (stock out) and reverses the GR/IR:
// Dr GR/IR clearing / Cr Inventory for each reversed movement.
func (h *Handler) cancelPurReceipt(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	lines, err := h.procRepo.CancelReceipt(req.ID, session.CompanyID, session.UserID)
	if err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if s, e := h.procRepo.GetSettings(session.CompanyID); e == nil && s != nil && s.AutoPostGL {
		for _, l := range lines {
			amt := purRound2(l.Quantity * l.UnitCost)
			if amt <= 0 {
				continue
			}
			// Product lines credit Inventory; non-stock (expense) lines credit the
			// same expense account they were debited to on receipt.
			crAcct := s.InventoryAccountID
			if l.ProductID == "" {
				crAcct = l.ExpenseAccountID
				if crAcct == "" {
					crAcct = s.ExpenseAccountID
				}
			}
			src := l.MovementID
			if src == "" {
				src = req.ID
			}
			h.postPurJournal(session, "Goods receipt cancellation (GR/IR reversal)", src, []purLine{{s.GRIRAccountID, amt, 0}, {crAcct, 0, amt}})
		}
	}
	JSON(w, http.StatusOK, map[string]interface{}{"ok": true, "reversed_lines": len(lines)})
}

// --- Billing (3-way match: bill up to received qty; reuses ap_bills) ---

func (h *Handler) getPurBillable(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		OrderID string `json:"order_id"`
	}
	Decode(r, &req)
	rows, err := h.procRepo.GetBillable(req.OrderID, session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if rows == nil {
		rows = []models.PurBillable{}
	}
	JSON(w, http.StatusOK, rows)
}

// doGeneratePurBill creates an AP vendor bill from the order's received-but-unbilled
// quantities (3-way match) and posts the payable journal exactly once:
//
//	Dr GR/IR clearing (net goods) / Dr Input Tax (tax)  ·  Cr Accounts Payable (gross)
//
// The bill lands in the AP subledger (Open) so it can be aged and paid there. GR/IR
// nets to zero against the receipt once the received qty is fully billed.
func (h *Handler) doGeneratePurBill(session *models.UserSession, orderID string) (*models.Bill, bool, error) {
	order, err := h.procRepo.GetOrder(orderID, session.CompanyID)
	if err != nil {
		return nil, false, err
	}
	lines, err := h.procRepo.GetBillable(orderID, session.CompanyID)
	if err != nil {
		return nil, false, err
	}
	if len(lines) == 0 {
		return nil, false, fmt.Errorf("nothing to bill — receive goods first")
	}
	s, serr := h.procRepo.GetSettings(session.CompanyID)
	if serr != nil || s == nil {
		return nil, false, fmt.Errorf("procurement settings unavailable")
	}
	// Snapshot the exact per-line quantities this bill covers, so MarkBilled advances
	// qty_billed by these amounts (not by live qty_received, which a concurrent receipt
	// could have inflated).
	billedLines := make([]repository.ProcBilledLine, 0, len(lines))
	for _, l := range lines {
		billedLines = append(billedLines, repository.ProcBilledLine{OrderItemID: l.OrderItemID, BilledQty: l.BillableQty})
	}

	// A zero-value billable batch (free / fully-discounted lines) raises no payable —
	// AP rejects a zero-total bill — and the receipt posted no GL to clear. Just advance
	// the 3-way match so the order can reach Billed, without creating an AP bill.
	var preNet, preTax float64
	for _, l := range lines {
		net := purNet(l.UnitPrice, l.DiscountPct)
		amt := purRound2(l.BillableQty * net)
		preNet += amt
		preTax += purRound2(amt * l.TaxRate / 100)
	}
	if purRound2(preNet+preTax) <= 0 {
		count, merr := h.procRepo.MarkBilled(orderID, session.CompanyID, "", "", billedLines)
		if merr != nil {
			return nil, false, merr
		}
		if count == 0 {
			return nil, false, fmt.Errorf("nothing to bill — already billed")
		}
		return nil, false, nil
	}

	billID := uuid.New().String()
	seq := order.BillSeq + 1
	billNumber := fmt.Sprintf("PO-%06d-%d", order.PONumber, seq)
	billDate := time.Now().Format("2006-01-02")
	dueDate := billDate
	if od := order.OrderDate; len(od) >= 10 {
		if t, e := time.Parse("2006-01-02", od[:10]); e == nil {
			dueDate = t.AddDate(0, 0, s.DefaultPaymentTerms).Format("2006-01-02")
		}
	}
	bill := &models.Bill{ID: billID, CompanyID: session.CompanyID, VendorID: order.VendorID, BillNumber: billNumber, BillDate: billDate, DueDate: dueDate, Reference: fmt.Sprintf("PO-%06d", order.PONumber)}
	if err := h.apRepo.CreateBill(bill); err != nil {
		return nil, false, err
	}

	// Bill lines post against the GR/IR clearing account so they net the receipt
	// accrual. If GR/IR is unmapped, fall back to the inventory/expense account so
	// the AP bill still carries a valid GL account per line.
	var grNet, totalTax float64
	for i, l := range lines {
		net := purNet(l.UnitPrice, l.DiscountPct)
		amt := purRound2(l.BillableQty * net)
		ta := purRound2(amt * l.TaxRate / 100)
		desc := l.Description
		if desc == "" {
			desc = l.ProductName
		}
		acct := s.GRIRAccountID
		if acct == "" {
			if l.ProductID != "" {
				acct = s.InventoryAccountID
			} else {
				acct = l.ExpenseAccountID
				if acct == "" {
					acct = s.ExpenseAccountID
				}
			}
		}
		if err := h.apRepo.AddBillItem(billID, session.CompanyID, acct, desc, l.BillableQty, net, amt, l.TaxRate, ta, i); err != nil {
			h.apRepo.VoidBill(billID, session.CompanyID)
			return nil, false, err
		}
		grNet += amt
		totalTax += ta
	}
	h.apRepo.UpdateBillTotals(billID, session.CompanyID)
	if err := h.apRepo.ApproveBill(billID, session.CompanyID); err != nil {
		h.apRepo.VoidBill(billID, session.CompanyID)
		return nil, false, err
	}

	// Payable GL — Dr GR/IR + Dr Input Tax / Cr Accounts Payable. A zero-value bill
	// (e.g. a fully-discounted line) has nothing to post, so skip the journal rather
	// than mistaking the empty (correctly-skipped) result for a posting failure.
	glPosted := false
	journalID := ""
	if s.AutoPostGL && purRound2(grNet+totalTax) > 0 {
		var jl []purLine
		if grNet > 0 {
			jl = append(jl, purLine{s.GRIRAccountID, purRound2(grNet), 0})
		}
		if totalTax > 0 {
			jl = append(jl, purLine{s.TaxInputAccountID, purRound2(totalTax), 0})
		}
		jl = append(jl, purLine{s.APAccountID, 0, purRound2(grNet + totalTax)})
		journalID = h.postPurJournal(session, "Vendor bill "+billNumber, billID, jl)
		if journalID == "" {
			// Could not post the payable (unmapped GR/IR, Payable, or Input Tax with
			// tax present). Void the bill so qty_billed never advances and the receipt
			// can be re-billed after the accounts are mapped.
			h.apRepo.VoidBill(billID, session.CompanyID)
			return nil, false, fmt.Errorf("vendor bill could not be posted — check the GR/IR clearing, Accounts Payable and Input Tax account mappings in Procurement settings")
		}
		h.procRepo.SetBillJournal(billID, session.CompanyID, journalID)
		glPosted = true
	}

	count, err := h.procRepo.MarkBilled(orderID, session.CompanyID, billID, journalID, billedLines)
	if err != nil || count == 0 {
		// MarkBilled rolled back (qty_billed did not advance) or a concurrent bill
		// already billed these lines. Undo THIS bill completely so the payable and
		// its GL can never be double-counted by the losing racer.
		h.apRepo.VoidBill(billID, session.CompanyID)
		if journalID != "" {
			h.acctRepo.VoidJournalEntry(journalID, session.CompanyID, session.UserID, "Vendor bill superseded by concurrent billing")
		}
		if err != nil {
			return nil, false, err
		}
		return nil, false, fmt.Errorf("nothing to bill — already billed")
	}
	result, _ := h.apRepo.GetBill(billID, session.CompanyID)
	if result == nil {
		result = bill
	}
	return result, glPosted, nil
}

func (h *Handler) generatePurBill(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		OrderID string `json:"order_id"`
	}
	Decode(r, &req)
	if req.OrderID == "" {
		Error(w, http.StatusBadRequest, "order_id required")
		return
	}
	bill, glPosted, err := h.doGeneratePurBill(session, req.OrderID)
	if err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	JSON(w, http.StatusCreated, map[string]interface{}{"bill": bill, "gl_posted": glPosted})
}

// ==================== RETURNS — AR CREDIT MEMOS / AP DEBIT MEMOS ====================

// postReturnsJournal posts a balanced N-line journal for a returns event under a
// caller-supplied source_type (ar_credit_memo / ap_debit_memo), reusing the same
// glBalanced guard as the procurement poster.
func (h *Handler) postReturnsJournal(session *models.UserSession, memo, sourceType, sourceID string, lines []purLine) string {
	kept, ok := glBalanced(lines)
	if !ok {
		log.Printf("%s journal %q: unmapped or unbalanced, skipping post", sourceType, memo)
		return ""
	}
	entryNum, _ := h.acctRepo.NextEntryNumber(session.CompanyID)
	entryID := uuid.New().String()
	date := time.Now().Format("2006-01-02")
	if err := h.acctRepo.CreateJournalEntry(entryID, session.CompanyID, entryNum, date, memo, sourceType, sourceID, "Draft"); err != nil {
		log.Printf("%s journal create: %v", sourceType, err)
		return ""
	}
	for i, l := range kept {
		if err := h.acctRepo.AddJournalLine(entryID, session.CompanyID, l.acct, memo, l.dr, l.cr, i); err != nil {
			log.Printf("%s journal line: %v", sourceType, err)
			return ""
		}
	}
	h.acctRepo.UpdateJournalTotals(entryID, session.CompanyID)
	if err := h.acctRepo.PostJournalEntry(entryID, session.CompanyID, session.UserID); err != nil {
		log.Printf("%s journal post: %v", sourceType, err)
		return ""
	}
	return entryID
}

type returnItemReq struct {
	OrderItemID string  `json:"order_item_id"`
	Description string  `json:"description"`
	Quantity    float64 `json:"quantity"`
	UnitPrice   float64 `json:"unit_price"`
	UnitCost    float64 `json:"unit_cost"`
	TaxRate     float64 `json:"tax_rate"`
	Restock     bool    `json:"restock"`
}

// --- AR credit memos ---

func (h *Handler) getReturnsStatsAR(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	s, err := h.returnsRepo.CMStats(session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	oc, _ := h.returnsRepo.CMOpenCredits(session.CompanyID)
	if oc == nil {
		oc = []models.ReturnOpenCredit{}
	}
	JSON(w, http.StatusOK, map[string]interface{}{"stats": s, "open_credits": oc})
}

func (h *Handler) getCreditMemos(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		Status string `json:"status"`
	}
	Decode(r, &req)
	rows, err := h.returnsRepo.ListCreditMemos(session.CompanyID, req.Status)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if rows == nil {
		rows = []models.CreditMemo{}
	}
	JSON(w, http.StatusOK, rows)
}

func (h *Handler) getCreditMemo(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	m, err := h.returnsRepo.GetCreditMemo(req.ID, session.CompanyID)
	if err != nil {
		Error(w, http.StatusNotFound, err.Error())
		return
	}
	m.Items, _ = h.returnsRepo.GetCreditMemoItems(req.ID, session.CompanyID)
	JSON(w, http.StatusOK, m)
}

func (h *Handler) getCMCreditable(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		OrderID string `json:"order_id"`
	}
	Decode(r, &req)
	rows, err := h.returnsRepo.CMCreditable(req.OrderID, session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if rows == nil {
		rows = []models.ReturnCreditableLine{}
	}
	JSON(w, http.StatusOK, rows)
}

func (h *Handler) createCreditMemo(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		OrderID     string          `json:"order_id"`
		InvoiceID   string          `json:"invoice_id"`
		MemoDate    string          `json:"memo_date"`
		Reason      string          `json:"reason"`
		WarehouseID string          `json:"warehouse_id"`
		Items       []returnItemReq `json:"items"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.OrderID == "" {
		Error(w, http.StatusBadRequest, "order_id required")
		return
	}
	id := uuid.New().String()
	if _, err := h.returnsRepo.CreateCreditMemo(id, session.CompanyID, req.OrderID, req.InvoiceID, req.MemoDate, req.Reason, req.WarehouseID, session.UserID); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	for i, it := range req.Items {
		if err := h.returnsRepo.AddCreditMemoItem(uuid.New().String(), session.CompanyID, id, it.OrderItemID, it.Description, it.Quantity, it.UnitPrice, it.TaxRate, it.UnitCost, it.Restock, i); err != nil {
			Error(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	h.returnsRepo.UpdateCreditMemoTotals(id, session.CompanyID)
	m, _ := h.returnsRepo.GetCreditMemo(id, session.CompanyID)
	if m != nil {
		m.Items, _ = h.returnsRepo.GetCreditMemoItems(id, session.CompanyID)
	}
	JSON(w, http.StatusCreated, m)
}

func (h *Handler) updateCreditMemo(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID    string          `json:"id"`
		Items []returnItemReq `json:"items"`
	}
	Decode(r, &req)
	if req.Items != nil {
		if err := h.returnsRepo.ClearCreditMemoItems(req.ID, session.CompanyID); err != nil {
			Error(w, http.StatusBadRequest, err.Error())
			return
		}
		for i, it := range req.Items {
			if err := h.returnsRepo.AddCreditMemoItem(uuid.New().String(), session.CompanyID, req.ID, it.OrderItemID, it.Description, it.Quantity, it.UnitPrice, it.TaxRate, it.UnitCost, it.Restock, i); err != nil {
				Error(w, http.StatusBadRequest, err.Error())
				return
			}
		}
	}
	h.returnsRepo.UpdateCreditMemoTotals(req.ID, session.CompanyID)
	m, _ := h.returnsRepo.GetCreditMemo(req.ID, session.CompanyID)
	if m != nil {
		m.Items, _ = h.returnsRepo.GetCreditMemoItems(req.ID, session.CompanyID)
	}
	JSON(w, http.StatusOK, m)
}

func (h *Handler) deleteCreditMemo(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	if err := h.returnsRepo.DeleteCreditMemo(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// postCreditMemo restocks the goods and posts the reversal GL:
//
//	Dr Revenue / Dr Tax / Cr A/R   (source ar_credit_memo)
//	restock: Dr Inventory / Cr COGS ; scrap: Dr Adjustment / Cr COGS  (source inventory)
func (h *Handler) postCreditMemo(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	memo, err := h.returnsRepo.GetCreditMemo(req.ID, session.CompanyID)
	if err != nil {
		Error(w, http.StatusNotFound, err.Error())
		return
	}
	items, _ := h.returnsRepo.GetCreditMemoItems(req.ID, session.CompanyID)
	sSettings, _ := h.soRepo.GetSettings(session.CompanyID)
	arAcct := ""
	if sSettings != nil && sSettings.AutoPostGL {
		arAcct, _ = h.returnsRepo.ARControl(memo.OrderID, session.CompanyID)
		if arAcct == "" {
			Error(w, http.StatusBadRequest, "the order's revenue was never posted to the GL — cannot issue a GL credit memo (turn off Sales auto-post or post the order's revenue first)")
			return
		}
	}
	goods, err := h.returnsRepo.PostCreditMemo(req.ID, session.CompanyID, session.UserID)
	if err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	memoLabel := fmt.Sprintf("Credit memo CM-%06d", memo.MemoNumber)
	glPosted := false
	// revenue reversal
	if sSettings != nil && sSettings.AutoPostGL {
		revByAcct := map[string]float64{}
		var totalTax float64
		for _, it := range items {
			acct := it.RevenueAccountID
			if acct == "" {
				acct = sSettings.DefaultRevenueAccountID
			}
			revByAcct[acct] += it.Amount
			totalTax += it.TaxAmount
		}
		var jl []purLine
		var sumNet float64
		for acct, net := range revByAcct {
			n := purRound2(net)
			if n == 0 {
				continue
			}
			jl = append(jl, purLine{acct, n, 0})
			sumNet += n
		}
		if totalTax > 0 && sSettings.TaxPayableAccountID != "" {
			jl = append(jl, purLine{sSettings.TaxPayableAccountID, purRound2(totalTax), 0})
		}
		jl = append(jl, purLine{arAcct, 0, purRound2(sumNet + totalTax)})
		if jid := h.postReturnsJournal(session, memoLabel, "ar_credit_memo", memo.ID, jl); jid != "" {
			h.returnsRepo.SetCMRevenueJournal(memo.ID, session.CompanyID, jid)
			glPosted = true
		}
	}
	// COGS / scrap reversal (inventory), decoupled from the financial gate
	if s, e := h.invRepo.GetSettings(session.CompanyID); e == nil && s != nil && s.AutoPostGL {
		for _, gl := range goods {
			if gl.ProductID == "" {
				continue
			}
			amt := purRound2(gl.Quantity * gl.UnitCost)
			if amt <= 0 {
				continue
			}
			dr := s.InventoryAccountID
			if !gl.Restock {
				dr = s.AdjustmentAccountID
			}
			src := gl.MovementID
			if src == "" {
				src = gl.ItemID
			}
			if jid := h.postInvJournal(session, dr, s.COGSAccountID, memoLabel+" (COGS reversal)", src, amt); jid != "" {
				h.returnsRepo.SetCMLineJournal(gl.ItemID, session.CompanyID, jid)
			}
		}
	}
	result, _ := h.returnsRepo.GetCreditMemo(req.ID, session.CompanyID)
	if result != nil {
		result.Items, _ = h.returnsRepo.GetCreditMemoItems(req.ID, session.CompanyID)
	}
	JSON(w, http.StatusOK, map[string]interface{}{"memo": result, "gl_posted": glPosted})
}

func (h *Handler) applyCreditMemo(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID        string  `json:"id"`
		InvoiceID string  `json:"invoice_id"`
		Amount    float64 `json:"amount"`
	}
	Decode(r, &req)
	if err := h.returnsRepo.ApplyCreditMemo(req.ID, session.CompanyID, req.InvoiceID, req.Amount); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) refundCreditMemo(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID        string `json:"id"`
		AccountID string `json:"account_id"`
	}
	Decode(r, &req)
	memo, err := h.returnsRepo.GetCreditMemo(req.ID, session.CompanyID)
	if err != nil {
		Error(w, http.StatusNotFound, err.Error())
		return
	}
	if memo.Status != "Open" || memo.BalanceCredit <= 0 {
		Error(w, http.StatusBadRequest, "no open credit to refund")
		return
	}
	jid := ""
	if s, _ := h.soRepo.GetSettings(session.CompanyID); s != nil && s.AutoPostGL {
		if req.AccountID == "" {
			Error(w, http.StatusBadRequest, "choose a cash/bank account to refund from")
			return
		}
		arAcct, _ := h.returnsRepo.ARControl(memo.OrderID, session.CompanyID)
		if arAcct == "" {
			Error(w, http.StatusBadRequest, "the order's revenue was never GL-posted — cannot post a cash refund")
			return
		}
		jid = h.postCashJournal(session, arAcct, req.AccountID, fmt.Sprintf("Credit memo refund CM-%06d", memo.MemoNumber), "ar_credit_refund", memo.ID, memo.BalanceCredit)
		if jid == "" {
			Error(w, http.StatusBadRequest, "refund could not be posted — check the cash/bank account mapping")
			return
		}
	}
	amt, err := h.returnsRepo.RefundCreditMemo(req.ID, session.CompanyID, jid)
	if err != nil {
		if jid != "" {
			h.acctRepo.VoidJournalEntry(jid, session.CompanyID, session.UserID, "refund reversed")
		}
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]interface{}{"refunded": amt, "gl_posted": jid != ""})
}

func (h *Handler) voidCreditMemo(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	lines, err := h.returnsRepo.VoidCreditMemo(req.ID, session.CompanyID, session.UserID)
	if err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	// reverse the revenue journal + each line's COGS journal
	h.acctRepo.VoidJournalBySource(session.CompanyID, "ar_credit_memo", req.ID, session.UserID, "Credit memo voided")
	for _, l := range lines {
		if l.LineJournalID != "" {
			h.acctRepo.VoidJournalEntry(l.LineJournalID, session.CompanyID, session.UserID, "Credit memo voided")
		}
	}
	JSON(w, http.StatusOK, map[string]interface{}{"ok": true, "reversed_lines": len(lines)})
}

// --- AP debit memos ---

func (h *Handler) getReturnsStatsAP(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	s, err := h.returnsRepo.DMStats(session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	oc, _ := h.returnsRepo.DMOpenCredits(session.CompanyID)
	if oc == nil {
		oc = []models.ReturnOpenCredit{}
	}
	JSON(w, http.StatusOK, map[string]interface{}{"stats": s, "open_credits": oc})
}

func (h *Handler) getDebitMemos(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		Status string `json:"status"`
	}
	Decode(r, &req)
	rows, err := h.returnsRepo.ListDebitMemos(session.CompanyID, req.Status)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if rows == nil {
		rows = []models.DebitMemo{}
	}
	JSON(w, http.StatusOK, rows)
}

func (h *Handler) getDebitMemo(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	m, err := h.returnsRepo.GetDebitMemo(req.ID, session.CompanyID)
	if err != nil {
		Error(w, http.StatusNotFound, err.Error())
		return
	}
	m.Items, _ = h.returnsRepo.GetDebitMemoItems(req.ID, session.CompanyID)
	JSON(w, http.StatusOK, m)
}

func (h *Handler) getDMCreditable(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		OrderID string `json:"order_id"`
	}
	Decode(r, &req)
	rows, err := h.returnsRepo.DMCreditable(req.OrderID, session.CompanyID)
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if rows == nil {
		rows = []models.ReturnCreditableLine{}
	}
	JSON(w, http.StatusOK, rows)
}

func (h *Handler) createDebitMemo(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		OrderID     string          `json:"order_id"`
		BillID      string          `json:"bill_id"`
		MemoDate    string          `json:"memo_date"`
		Reason      string          `json:"reason"`
		WarehouseID string          `json:"warehouse_id"`
		Items       []returnItemReq `json:"items"`
	}
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.OrderID == "" {
		Error(w, http.StatusBadRequest, "order_id required")
		return
	}
	id := uuid.New().String()
	if _, err := h.returnsRepo.CreateDebitMemo(id, session.CompanyID, req.OrderID, req.BillID, req.MemoDate, req.Reason, req.WarehouseID, session.UserID); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	for i, it := range req.Items {
		if err := h.returnsRepo.AddDebitMemoItem(uuid.New().String(), session.CompanyID, id, it.OrderItemID, it.Description, it.Quantity, it.UnitCost, it.TaxRate, i); err != nil {
			Error(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	h.returnsRepo.UpdateDebitMemoTotals(id, session.CompanyID)
	m, _ := h.returnsRepo.GetDebitMemo(id, session.CompanyID)
	if m != nil {
		m.Items, _ = h.returnsRepo.GetDebitMemoItems(id, session.CompanyID)
	}
	JSON(w, http.StatusCreated, m)
}

func (h *Handler) updateDebitMemo(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID    string          `json:"id"`
		Items []returnItemReq `json:"items"`
	}
	Decode(r, &req)
	if req.Items != nil {
		if err := h.returnsRepo.ClearDebitMemoItems(req.ID, session.CompanyID); err != nil {
			Error(w, http.StatusBadRequest, err.Error())
			return
		}
		for i, it := range req.Items {
			if err := h.returnsRepo.AddDebitMemoItem(uuid.New().String(), session.CompanyID, req.ID, it.OrderItemID, it.Description, it.Quantity, it.UnitCost, it.TaxRate, i); err != nil {
				Error(w, http.StatusBadRequest, err.Error())
				return
			}
		}
	}
	h.returnsRepo.UpdateDebitMemoTotals(req.ID, session.CompanyID)
	m, _ := h.returnsRepo.GetDebitMemo(req.ID, session.CompanyID)
	if m != nil {
		m.Items, _ = h.returnsRepo.GetDebitMemoItems(req.ID, session.CompanyID)
	}
	JSON(w, http.StatusOK, m)
}

func (h *Handler) deleteDebitMemo(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	if err := h.returnsRepo.DeleteDebitMemo(req.ID, session.CompanyID); err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// postDebitMemo ships goods back and posts:
//
//	Dr A/P / Cr GR-IR / Cr Input Tax    (source ap_debit_memo)
//	Dr GR-IR / Cr Inventory|Expense     (source procurement, per line)
func (h *Handler) postDebitMemo(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	memo, err := h.returnsRepo.GetDebitMemo(req.ID, session.CompanyID)
	if err != nil {
		Error(w, http.StatusNotFound, err.Error())
		return
	}
	items, _ := h.returnsRepo.GetDebitMemoItems(req.ID, session.CompanyID)
	pSettings, _ := h.procRepo.GetSettings(session.CompanyID)
	var net, tax float64
	for _, it := range items {
		net += it.Amount
		tax += it.TaxAmount
	}
	apAcct := ""
	if pSettings != nil && pSettings.AutoPostGL {
		if memo.BillID == "" {
			Error(w, http.StatusBadRequest, "link a vendor bill to post a GL debit memo (or turn off Procurement auto-post)")
			return
		}
		apAcct, _ = h.returnsRepo.APControl(memo.BillID, session.CompanyID)
		if apAcct == "" {
			Error(w, http.StatusBadRequest, "the bill was never posted to the GL — cannot issue a GL debit memo")
			return
		}
		// GR/IR and (when the return carries tax) Input Tax must be mapped, else the
		// payable journal can't balance while the per-line stock journals still would —
		// which would leave GR/IR un-netted. Fail before moving stock.
		if pSettings.GRIRAccountID == "" {
			Error(w, http.StatusBadRequest, "map the GR/IR clearing account in Procurement settings first")
			return
		}
		if tax > 0 && pSettings.TaxInputAccountID == "" {
			Error(w, http.StatusBadRequest, "this return carries tax — map the Input Tax account in Procurement settings first")
			return
		}
	}
	goods, err := h.returnsRepo.PostDebitMemo(req.ID, session.CompanyID, session.UserID)
	if err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	memoLabel := fmt.Sprintf("Debit memo DM-%06d", memo.MemoNumber)
	glPosted := false
	if pSettings != nil && pSettings.AutoPostGL {
		var jl []purLine
		jl = append(jl, purLine{apAcct, purRound2(net + tax), 0})
		if net > 0 {
			jl = append(jl, purLine{pSettings.GRIRAccountID, 0, purRound2(net)})
		}
		if tax > 0 {
			jl = append(jl, purLine{pSettings.TaxInputAccountID, 0, purRound2(tax)})
		}
		if jid := h.postReturnsJournal(session, memoLabel, "ap_debit_memo", memo.ID, jl); jid != "" {
			h.returnsRepo.SetDMPayableJournal(memo.ID, session.CompanyID, jid)
			glPosted = true
		}
		// Stock reversal per line (Dr GR-IR / Cr Inventory|Expense) — only when the
		// payable journal posted, so GR/IR always nets to zero across the two legs.
		if glPosted {
			for _, gl := range goods {
				amt := purRound2(gl.Quantity * gl.UnitCost)
				if amt <= 0 {
					continue
				}
				cr := pSettings.InventoryAccountID
				if gl.ProductID == "" {
					cr = gl.ExpenseAccountID
					if cr == "" {
						cr = pSettings.ExpenseAccountID
					}
				}
				src := gl.MovementID
				if src == "" {
					src = gl.ItemID
				}
				if jid := h.postPurJournal(session, memoLabel+" (stock return)", src, []purLine{{pSettings.GRIRAccountID, amt, 0}, {cr, 0, amt}}); jid != "" {
					h.returnsRepo.SetDMLineJournal(gl.ItemID, session.CompanyID, jid)
				}
			}
		}
	}
	result, _ := h.returnsRepo.GetDebitMemo(req.ID, session.CompanyID)
	if result != nil {
		result.Items, _ = h.returnsRepo.GetDebitMemoItems(req.ID, session.CompanyID)
	}
	JSON(w, http.StatusOK, map[string]interface{}{"memo": result, "gl_posted": glPosted})
}

func (h *Handler) applyDebitMemo(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID     string  `json:"id"`
		BillID string  `json:"bill_id"`
		Amount float64 `json:"amount"`
	}
	Decode(r, &req)
	if err := h.returnsRepo.ApplyDebitMemo(req.ID, session.CompanyID, req.BillID, req.Amount); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) refundDebitMemo(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID        string `json:"id"`
		AccountID string `json:"account_id"`
	}
	Decode(r, &req)
	memo, err := h.returnsRepo.GetDebitMemo(req.ID, session.CompanyID)
	if err != nil {
		Error(w, http.StatusNotFound, err.Error())
		return
	}
	if memo.Status != "Open" || memo.BalanceDebit <= 0 {
		Error(w, http.StatusBadRequest, "no open debit to refund")
		return
	}
	jid := ""
	if s, _ := h.procRepo.GetSettings(session.CompanyID); s != nil && s.AutoPostGL {
		if req.AccountID == "" {
			Error(w, http.StatusBadRequest, "choose a cash/bank account to refund into")
			return
		}
		if memo.BillID == "" {
			Error(w, http.StatusBadRequest, "this memo has no GL-posted bill — cannot post a cash refund")
			return
		}
		apAcct, _ := h.returnsRepo.APControl(memo.BillID, session.CompanyID)
		if apAcct == "" {
			Error(w, http.StatusBadRequest, "the bill was never GL-posted — cannot post a cash refund")
			return
		}
		jid = h.postCashJournal(session, req.AccountID, apAcct, fmt.Sprintf("Debit memo refund DM-%06d", memo.MemoNumber), "ap_debit_refund", memo.ID, memo.BalanceDebit)
		if jid == "" {
			Error(w, http.StatusBadRequest, "refund could not be posted — check the cash/bank account mapping")
			return
		}
	}
	amt, err := h.returnsRepo.RefundDebitMemo(req.ID, session.CompanyID, jid)
	if err != nil {
		if jid != "" {
			h.acctRepo.VoidJournalEntry(jid, session.CompanyID, session.UserID, "refund reversed")
		}
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	JSON(w, http.StatusOK, map[string]interface{}{"refunded": amt, "gl_posted": jid != ""})
}

func (h *Handler) voidDebitMemo(w http.ResponseWriter, r *http.Request, session *models.UserSession) {
	var req struct {
		ID string `json:"id"`
	}
	Decode(r, &req)
	lines, err := h.returnsRepo.VoidDebitMemo(req.ID, session.CompanyID, session.UserID)
	if err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}
	h.acctRepo.VoidJournalBySource(session.CompanyID, "ap_debit_memo", req.ID, session.UserID, "Debit memo voided")
	for _, l := range lines {
		if l.LineJournalID != "" {
			h.acctRepo.VoidJournalEntry(l.LineJournalID, session.CompanyID, session.UserID, "Debit memo voided")
		}
	}
	JSON(w, http.StatusOK, map[string]interface{}{"ok": true, "reversed_lines": len(lines)})
}
