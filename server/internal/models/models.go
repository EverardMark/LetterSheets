package models

import "time"

// Roles
const (
	RoleSuperAdmin = "superadmin"
	RoleAdmin      = "admin"
	RoleHR         = "hr"
	RolePayroll    = "payroll"
	RoleManager    = "manager"
	RoleEmployee   = "employee"
)

// Company represents a company record
type Company struct {
	ID           string    `json:"id" db:"id"`
	Name         string    `json:"name" db:"name"`
	Industry     *string   `json:"industry,omitempty" db:"industry"`
	Address      *string   `json:"address,omitempty" db:"address"`
	Country      *string   `json:"country,omitempty" db:"country"`
	City         *string   `json:"city,omitempty" db:"city"`
	State        *string   `json:"state,omitempty" db:"state"`
	Province     *string   `json:"province,omitempty" db:"province"`
	Zip          *string   `json:"zip,omitempty" db:"zip"`
	KeyAlgorithm string    `json:"key_algorithm" db:"key_algorithm"`
	KeyVersion   int       `json:"key_version" db:"key_version"`
	MaxEmployees int       `json:"max_employees" db:"max_employees"`
	Plan         string    `json:"plan" db:"plan"`
	IsActive     bool      `json:"is_active" db:"is_active"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time `json:"updated_at" db:"updated_at"`

	// Joined from company_settings
	Timezone                 *string  `json:"timezone,omitempty"`
	DateFormat               *string  `json:"date_format,omitempty"`
	Currency                 *string  `json:"currency,omitempty"`
	FiscalYearStart          *int     `json:"fiscal_year_start,omitempty"`
	PayFrequency             *string  `json:"pay_frequency,omitempty"`
	PayDay1                  *int     `json:"pay_day_1,omitempty"`
	PayDay2                  *int     `json:"pay_day_2,omitempty"`
	OvertimeRequiredApproval *bool    `json:"overtime_required_approval,omitempty"`
	DefaultVacationDays      *float64 `json:"default_vacation_days,omitempty"`
	DefaultSickDays          *float64 `json:"default_sick_days,omitempty"`
	LeaveAccrualType         *string  `json:"leave_accrual_type,omitempty"`
	EmployeeNumberPrefix     *string  `json:"employee_number_prefix,omitempty"`
	EmployeeNumberAuto       *bool    `json:"employee_number_auto,omitempty"`
}

// User represents a user record
type User struct {
	ID                  string     `json:"id" db:"id"`
	Email               string     `json:"email" db:"email"`
	Username            string     `json:"username" db:"username"`
	PasswordHash        string     `json:"-" db:"password_hash"`
	Salt                string     `json:"-" db:"salt"`
	TOTPSecretEnc       []byte     `json:"-" db:"totp_secret_enc"`
	IsActive            bool       `json:"is_active" db:"is_active"`
	LastLoginAt         *time.Time `json:"last_login_at,omitempty" db:"last_login_at"`
	FailedLoginAttempts int        `json:"-" db:"failed_login_attempts"`
	LockedUntil         *time.Time `json:"-" db:"locked_until"`
	PasswordChangedAt   *time.Time `json:"password_changed_at,omitempty" db:"password_changed_at"`
	CreatedAt           time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at" db:"updated_at"`
}

// UserCompanyAccess maps a user to a company with keys and role
type UserCompanyAccess struct {
	ID                   string    `json:"id" db:"id"`
	UserID               string    `json:"user_id" db:"user_id"`
	CompanyID            string    `json:"company_id" db:"company_id"`
	WrappedCompanyKey    []byte    `json:"wrapped_company_key" db:"wrapped_company_key"`
	KeyWrapAlgorithm     string    `json:"key_wrap_algorithm" db:"key_wrap_algorithm"`
	KeyExchangeAlgorithm string    `json:"key_exchange_algorithm" db:"key_exchange_algorithm"`
	KeyVersion           int       `json:"key_version" db:"key_version"`
	PublicKey            []byte    `json:"public_key" db:"public_key"`
	SigningPublicKey     []byte    `json:"signing_public_key,omitempty" db:"signing_public_key"`
	Role                 string    `json:"role" db:"role"`
	Permissions          *string   `json:"permissions,omitempty" db:"permissions"`
	IsActive             bool      `json:"is_active" db:"is_active"`
	JoinedAt             time.Time `json:"joined_at" db:"joined_at"`
	UpdatedAt            time.Time `json:"updated_at" db:"updated_at"`

	// Joined fields
	CompanyName *string `json:"company_name,omitempty"`
	CompanyPlan *string `json:"company_plan,omitempty"`
}

// UserSession represents an active session
type UserSession struct {
	ID                string    `json:"id" db:"id"`
	UserID            string    `json:"user_id" db:"user_id"`
	CompanyID         string    `json:"company_id" db:"company_id"`
	ExpiresAt         time.Time `json:"expires_at" db:"expires_at"`
	Email             string    `json:"email"`
	Username          string    `json:"username"`
	UserActive        bool      `json:"user_active"`
	Role              string    `json:"role"`
	Permissions       *string   `json:"permissions,omitempty"`
	WrappedCompanyKey []byte    `json:"wrapped_company_key"`
	KeyWrapAlgorithm  string    `json:"key_wrap_algorithm"`
	KeyVersion        int       `json:"key_version"`
	PublicKey         []byte    `json:"public_key"`
}

// OnboardingTemplate represents a reusable checklist template
type OnboardingTemplate struct {
	ID          string  `json:"id"`
	CompanyID   string  `json:"company_id"`
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
	Category    string  `json:"category"`
	IsDefault   bool    `json:"is_default"`
	SortOrder   int     `json:"sort_order"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
	ItemCount   int     `json:"item_count"`
}

// OnboardingTemplateItem represents an item in a template
type OnboardingTemplateItem struct {
	ID         string `json:"id"`
	TemplateID string `json:"template_id"`
	CompanyID  string `json:"company_id"`
	Title      string `json:"title"`
	Category   string `json:"category"`
	Required   bool   `json:"required"`
	SortOrder  int    `json:"sort_order"`
}

// OnboardingChecklist represents a per-employee onboarding instance
type OnboardingChecklist struct {
	ID            string  `json:"id"`
	CompanyID     string  `json:"company_id"`
	EmployeeID    string  `json:"employee_id"`
	TemplateID    *string `json:"template_id,omitempty"`
	Status        string  `json:"status"`
	StartDate     string  `json:"start_date"`
	TargetDate    *string `json:"target_date,omitempty"`
	CompletedDate *string `json:"completed_date,omitempty"`
	Progress      int     `json:"progress"`
	Notes         *string `json:"notes,omitempty"`
	CreatedAt     string  `json:"created_at"`
	UpdatedAt     string  `json:"updated_at"`
	// Joined
	FirstName      string `json:"first_name,omitempty"`
	LastName       string `json:"last_name,omitempty"`
	Department     string `json:"department,omitempty"`
	Position       string `json:"position,omitempty"`
	TotalItems     int    `json:"total_items"`
	CompletedItems int    `json:"completed_items"`
}

// OnboardingItem represents a single checklist item
type OnboardingItem struct {
	ID          string  `json:"id"`
	ChecklistID string  `json:"checklist_id"`
	CompanyID   string  `json:"company_id"`
	Title       string  `json:"title"`
	Category    string  `json:"category"`
	Required    bool    `json:"required"`
	Completed   bool    `json:"completed"`
	CompletedAt *string `json:"completed_at,omitempty"`
	SortOrder   int     `json:"sort_order"`
	Notes       *string `json:"notes,omitempty"`
}

// PayrollSettings represents company payroll configuration
type PayrollSettings struct {
	ID           string  `json:"id" db:"id"`
	CompanyID    string  `json:"company_id" db:"company_id"`
	PaySchedule  string  `json:"pay_schedule" db:"pay_schedule"`
	OTMultiplier float64 `json:"ot_multiplier" db:"ot_multiplier"`
	CreatedAt    string  `json:"created_at" db:"created_at"`
	UpdatedAt    string  `json:"updated_at" db:"updated_at"`
}

// PayrollRun represents a pay period run
type PayrollRun struct {
	ID              string  `json:"id" db:"id"`
	CompanyID       string  `json:"company_id" db:"company_id"`
	PeriodStart     string  `json:"period_start" db:"period_start"`
	PeriodEnd       string  `json:"period_end" db:"period_end"`
	PayDate         *string `json:"pay_date,omitempty" db:"pay_date"`
	Status          string  `json:"status" db:"status"`
	TotalGross      float64 `json:"total_gross" db:"total_gross"`
	TotalDeductions float64 `json:"total_deductions" db:"total_deductions"`
	TotalNet        float64 `json:"total_net" db:"total_net"`
	EmployeeCount   int     `json:"employee_count" db:"employee_count"`
	Notes           *string `json:"notes,omitempty" db:"notes"`
	ApprovedBy      *string `json:"approved_by,omitempty" db:"approved_by"`
	ApprovedAt      *string `json:"approved_at,omitempty" db:"approved_at"`
	CreatedAt       string  `json:"created_at" db:"created_at"`
	UpdatedAt       string  `json:"updated_at" db:"updated_at"`
}

// PayrollItem represents per-employee payroll line
type PayrollItem struct {
	ID                string  `json:"id" db:"id"`
	RunID             string  `json:"run_id" db:"run_id"`
	CompanyID         string  `json:"company_id" db:"company_id"`
	EmployeeID        string  `json:"employee_id" db:"employee_id"`
	BasicPay          float64 `json:"basic_pay" db:"basic_pay"`
	DaysWorked        float64 `json:"days_worked" db:"days_worked"`
	HoursWorked       float64 `json:"hours_worked" db:"hours_worked"`
	OTHours           float64 `json:"ot_hours" db:"ot_hours"`
	OTPay             float64 `json:"ot_pay" db:"ot_pay"`
	HolidayPay        float64 `json:"holiday_pay" db:"holiday_pay"`
	NightDiff         float64 `json:"night_diff" db:"night_diff"`
	Allowances        float64 `json:"allowances" db:"allowances"`
	OtherEarnings     float64 `json:"other_earnings" db:"other_earnings"`
	GrossPay          float64 `json:"gross_pay" db:"gross_pay"`
	SSSEE             float64 `json:"sss_ee" db:"sss_ee"`
	SSSER             float64 `json:"sss_er" db:"sss_er"`
	PhilHealthEE      float64 `json:"philhealth_ee" db:"philhealth_ee"`
	PhilHealthER      float64 `json:"philhealth_er" db:"philhealth_er"`
	PagibigEE         float64 `json:"pagibig_ee" db:"pagibig_ee"`
	PagibigER         float64 `json:"pagibig_er" db:"pagibig_er"`
	WithholdingTax    float64 `json:"withholding_tax" db:"withholding_tax"`
	BenefitDeductions float64 `json:"benefit_deductions" db:"benefit_deductions"`
	LoanDeductions    float64 `json:"loan_deductions" db:"loan_deductions"`
	OtherDeductions   float64 `json:"other_deductions" db:"other_deductions"`
	TotalDeductions   float64 `json:"total_deductions" db:"total_deductions"`
	NetPay            float64 `json:"net_pay" db:"net_pay"`
	CreatedAt         string  `json:"created_at" db:"created_at"`
	UpdatedAt         string  `json:"updated_at" db:"updated_at"`
	// Joined
	FirstName           string  `json:"first_name,omitempty"`
	LastName            string  `json:"last_name,omitempty"`
	Department          string  `json:"department,omitempty"`
	Position            string  `json:"position,omitempty"`
	WorkScheduleName    *string `json:"work_schedule_name,omitempty"`
	HoursPerDay         float64 `json:"hours_per_day,omitempty"`
	WorkingDaysPerMonth int     `json:"working_days_per_month,omitempty"`
	OTMultiplierUsed    float64 `json:"ot_multiplier_used,omitempty"` // actual rate applied, for audit/display
}

// Leave represents a leave request
type Leave struct {
	ID            string  `json:"id" db:"id"`
	CompanyID     string  `json:"company_id" db:"company_id"`
	EmployeeID    string  `json:"employee_id" db:"employee_id"`
	LeaveType     string  `json:"leave_type" db:"leave_type"`
	StartDate     string  `json:"start_date" db:"start_date"`
	EndDate       string  `json:"end_date" db:"end_date"`
	Days          float64 `json:"days" db:"days"`
	Reason        *string `json:"reason,omitempty" db:"reason"`
	Status        string  `json:"status" db:"status"`
	ApprovedBy    *string `json:"approved_by,omitempty" db:"approved_by"`
	ApprovedAt    *string `json:"approved_at,omitempty" db:"approved_at"`
	RejectionNote *string `json:"rejection_note,omitempty" db:"rejection_note"`
	CreatedAt     string  `json:"created_at" db:"created_at"`
	UpdatedAt     string  `json:"updated_at" db:"updated_at"`
	// Joined fields
	FirstName  string `json:"first_name,omitempty" db:"first_name"`
	LastName   string `json:"last_name,omitempty" db:"last_name"`
	Department string `json:"department,omitempty" db:"department"`
	Position   string `json:"position,omitempty" db:"position"`
}

// Attendance represents a daily attendance record
type Attendance struct {
	ID            string   `json:"id" db:"id"`
	CompanyID     string   `json:"company_id" db:"company_id"`
	EmployeeID    string   `json:"employee_id" db:"employee_id"`
	Date          string   `json:"date" db:"date"`
	ClockIn       *string  `json:"clock_in,omitempty" db:"clock_in"`
	ClockOut      *string  `json:"clock_out,omitempty" db:"clock_out"`
	HoursWorked   *float64 `json:"hours_worked,omitempty" db:"hours_worked"`
	OvertimeHours float64  `json:"overtime_hours" db:"overtime_hours"`
	Status        string   `json:"status" db:"status"`
	Remarks       *string  `json:"remarks,omitempty" db:"remarks"`
	CreatedAt     string   `json:"created_at" db:"created_at"`
	UpdatedAt     string   `json:"updated_at" db:"updated_at"`
	// Joined fields
	FirstName  string `json:"first_name,omitempty" db:"first_name"`
	LastName   string `json:"last_name,omitempty" db:"last_name"`
	Department string `json:"department,omitempty" db:"department"`
	Position   string `json:"position,omitempty" db:"position"`
}

// Position represents a company position/role
type Position struct {
	ID            string  `json:"id" db:"id"`
	CompanyID     string  `json:"company_id" db:"company_id"`
	Name          string  `json:"name" db:"name"`
	Department    string  `json:"department" db:"department"`
	Level         string  `json:"level" db:"level"`
	Description   *string `json:"description,omitempty" db:"description"`
	OTMultiplier  float64 `json:"ot_multiplier" db:"ot_multiplier"` // 0 = use company default
	SortOrder     int     `json:"sort_order" db:"sort_order"`
	EmployeeCount int     `json:"employee_count" db:"employee_count"`
	CreatedAt     string  `json:"created_at" db:"created_at"`
	UpdatedAt     string  `json:"updated_at" db:"updated_at"`
}

// Department represents a company department
type Department struct {
	ID            string  `json:"id" db:"id"`
	CompanyID     string  `json:"company_id" db:"company_id"`
	Name          string  `json:"name" db:"name"`
	Color         string  `json:"color" db:"color"`
	Description   *string `json:"description,omitempty" db:"description"`
	SortOrder     int     `json:"sort_order" db:"sort_order"`
	EmployeeCount int     `json:"employee_count" db:"employee_count"`
	CreatedAt     string  `json:"created_at" db:"created_at"`
	UpdatedAt     string  `json:"updated_at" db:"updated_at"`
}

// Employee represents an employee record
type Employee struct {
	ID             string  `json:"id" db:"id"`
	CompanyID      string  `json:"company_id" db:"company_id"`
	UserID         *string `json:"user_id,omitempty" db:"user_id"`
	FirstName      string  `json:"first_name" db:"first_name"`
	LastName       string  `json:"last_name" db:"last_name"`
	MiddleName     string  `json:"middle_name" db:"middle_name"`
	Department     string  `json:"department" db:"department"`
	Position       string  `json:"position" db:"position"`
	JoinedDate     *string `json:"joined_date,omitempty" db:"joined_date"`
	EmploymentType string  `json:"employment_type" db:"employment_type"`
	Status         string  `json:"status" db:"status"`
	CreatedAt      string  `json:"created_at" db:"created_at"`
	UpdatedAt      string  `json:"updated_at" db:"updated_at"`

	// Encrypted fields (JSON: {"iv":"...","data":"..."})
	Encrypted map[string]interface{} `json:"encrypted,omitempty"`

	// Benefits enrollment
	EnrolledBenefits interface{} `json:"enrolled_benefits,omitempty"`

	// Work schedule (direct assignment)
	WorkScheduleID *string `json:"work_schedule_id,omitempty" db:"work_schedule_id"`

	// Joined from work_schedules (read-only)
	ScheduleName  *string `json:"schedule_name,omitempty"`
	ScheduleType  *string `json:"schedule_type,omitempty"`
	ScheduleColor *string `json:"schedule_color,omitempty"`

	// Joined from users (read-only)
	AccountEmail       *string `json:"account_email,omitempty"`
	AccountUsername    *string `json:"account_username,omitempty"`
	AccountActive      *bool   `json:"account_active,omitempty"`
	AccountLastLoginAt *string `json:"account_last_login_at,omitempty"`
}

// EmployeeFull includes encrypted columns for single-employee fetch
type EmployeeFull struct {
	Employee
	EmailEnc       *string `json:"-" db:"email_enc"`
	PhoneEnc       *string `json:"-" db:"phone_enc"`
	BirthdayEnc    *string `json:"-" db:"birthday_enc"`
	AddressEnc     *string `json:"-" db:"address_enc"`
	BasicSalaryEnc *string `json:"-" db:"basic_salary_enc"`
	SssNoEnc       *string `json:"-" db:"sss_no_enc"`
	PhilhealthEnc  *string `json:"-" db:"philhealth_no_enc"`
	PagibigEnc     *string `json:"-" db:"pagibig_no_enc"`
	TinEnc         *string `json:"-" db:"tin_enc"`
	BankNameEnc    *string `json:"-" db:"bank_name_enc"`
	BankAccountEnc *string `json:"-" db:"bank_account_enc"`
}

// Benefit represents a company benefit plan
type Benefit struct {
	ID          string  `json:"id" db:"id"`
	CompanyID   string  `json:"company_id" db:"company_id"`
	Type        string  `json:"type" db:"type"`
	Name        string  `json:"name" db:"name"`
	Provider    string  `json:"provider" db:"provider"`
	Status      string  `json:"status" db:"status"`
	Coverage    string  `json:"coverage" db:"coverage"`
	Frequency   string  `json:"frequency" db:"frequency"`
	Enrolled    int     `json:"enrolled" db:"enrolled"`
	Eligibility *string `json:"eligibility,omitempty" db:"eligibility"`
	Description *string `json:"description,omitempty" db:"description"`
	SortOrder   int     `json:"sort_order" db:"sort_order"`
	CreatedAt   string  `json:"created_at" db:"created_at"`
	UpdatedAt   string  `json:"updated_at" db:"updated_at"`

	// Joined from benefit_tiers
	Tiers []BenefitTier `json:"tiers,omitempty"`
}

// BenefitTier represents a cost tier within a benefit
type BenefitTier struct {
	ID           string  `json:"id,omitempty" db:"id"`
	BenefitID    string  `json:"benefit_id,omitempty" db:"benefit_id"`
	Name         string  `json:"name" db:"name"`
	EmployerCost float64 `json:"employer_cost" db:"employer_cost"`
	EmployeeCost float64 `json:"employee_cost" db:"employee_cost"`
	SortOrder    int     `json:"sort_order" db:"sort_order"`
}

// ChangeHistory represents a single field change record
type ChangeHistory struct {
	ID          string    `json:"id" db:"id"`
	CompanyID   string    `json:"company_id" db:"company_id"`
	ChangedBy   string    `json:"changed_by" db:"changed_by"`
	SessionID   *string   `json:"session_id,omitempty" db:"session_id"`
	TableName   string    `json:"table_name" db:"table_name"`
	RecordID    string    `json:"record_id" db:"record_id"`
	ChangeType  string    `json:"change_type" db:"change_type"`
	FieldName   string    `json:"field_name" db:"field_name"`
	OldValue    *string   `json:"old_value,omitempty" db:"old_value"`
	NewValue    *string   `json:"new_value,omitempty" db:"new_value"`
	IsEncrypted bool      `json:"is_encrypted" db:"is_encrypted"`
	IPAddress   *string   `json:"ip_address,omitempty" db:"ip_address"`
	UserAgent   *string   `json:"user_agent,omitempty" db:"user_agent"`
	ChangedAt   time.Time `json:"changed_at" db:"changed_at"`

	// Joined fields
	ChangedByEmail    *string `json:"changed_by_email,omitempty"`
	ChangedByUsername *string `json:"changed_by_username,omitempty"`
}

// Request/Response types

type RegisterRequest struct {
	CompanyName     string `json:"company_name"`
	CompanyIndustry string `json:"company_industry,omitempty"`
	CompanyAddress  string `json:"company_address,omitempty"`
	CompanyCountry  string `json:"company_country,omitempty"`
	CompanyCity     string `json:"company_city,omitempty"`
	CompanyState    string `json:"company_state,omitempty"`
	CompanyProvince string `json:"company_province,omitempty"`
	CompanyZip      string `json:"company_zip,omitempty"`
	KeyAlgorithm    string `json:"key_algorithm,omitempty"`

	Email    string `json:"email"`
	Username string `json:"username"`
	Password string `json:"password"`
	Salt     string `json:"salt"`

	WrappedCompanyKey    []byte `json:"wrapped_company_key"`
	KeyWrapAlgorithm     string `json:"key_wrap_algorithm,omitempty"`
	KeyExchangeAlgorithm string `json:"key_exchange_algorithm,omitempty"`
	PublicKey            []byte `json:"public_key"`
	SigningPublicKey     []byte `json:"signing_public_key,omitempty"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	TOTPCode string `json:"totp_code,omitempty"`
}

type LoginResponse struct {
	SessionID string              `json:"session_id"`
	Token     string              `json:"token"`
	User      *User               `json:"user"`
	Companies []UserCompanyAccess `json:"companies"`
}

type ResetPasswordRequest struct {
	Email                string `json:"email"`
	Password             string `json:"password"`
	Salt                 string `json:"salt"`
	WrappedCompanyKey    string `json:"wrapped_company_key"`
	KeyWrapAlgorithm     string `json:"key_wrap_algorithm"`
	KeyExchangeAlgorithm string `json:"key_exchange_algorithm"`
	PublicKey            string `json:"public_key"`
	SigningPublicKey     string `json:"signing_public_key"`
}

type SelectCompanyRequest struct {
	CompanyID string `json:"company_id"`
}

type SelectCompanyResponse struct {
	SessionID         string  `json:"session_id"`
	WrappedCompanyKey []byte  `json:"wrapped_company_key"`
	KeyWrapAlgorithm  string  `json:"key_wrap_algorithm"`
	KeyVersion        int     `json:"key_version"`
	Salt              string  `json:"salt"`
	Role              string  `json:"role"`
	Permissions       *string `json:"permissions,omitempty"`
}

// RequestMeta holds common request metadata for audit logging
type RequestMeta struct {
	UserID    string
	SessionID string
	CompanyID string
	IPAddress string
	UserAgent string
}

type LoanType struct {
	ID               string  `json:"id"`
	CompanyID        string  `json:"company_id"`
	Name             string  `json:"name"`
	Description      string  `json:"description"`
	MaxAmount        float64 `json:"max_amount"`
	InterestRate     float64 `json:"interest_rate"`
	MaxTermMonths    int     `json:"max_term_months"`
	RequiresApproval bool    `json:"requires_approval"`
	IsDeleted        bool    `json:"is_deleted"`
	CreatedAt        string  `json:"created_at"`
	UpdatedAt        string  `json:"updated_at"`
	ActiveLoans      int     `json:"active_loans,omitempty"`
}

type Loan struct {
	ID             string  `json:"id"`
	CompanyID      string  `json:"company_id"`
	EmployeeID     string  `json:"employee_id"`
	LoanTypeID     string  `json:"loan_type_id"`
	LoanTypeName   string  `json:"loan_type_name"`
	Amount         float64 `json:"amount"`
	InterestRate   float64 `json:"interest_rate"`
	TermMonths     int     `json:"term_months"`
	MonthlyPayment float64 `json:"monthly_payment"`
	TotalPayable   float64 `json:"total_payable"`
	TotalPaid      float64 `json:"total_paid"`
	Balance        float64 `json:"balance"`
	Status         string  `json:"status"`
	AppliedDate    string  `json:"applied_date"`
	ApprovedDate   string  `json:"approved_date"`
	ApprovedBy     string  `json:"approved_by"`
	StartDate      string  `json:"start_date"`
	EndDate        string  `json:"end_date"`
	RejectionNote  string  `json:"rejection_note"`
	Notes          string  `json:"notes"`
	IsDeleted      bool    `json:"is_deleted"`
	CreatedAt      string  `json:"created_at"`
	UpdatedAt      string  `json:"updated_at"`
	// joined fields
	FirstName  string `json:"first_name"`
	LastName   string `json:"last_name"`
	Department string `json:"department"`
	Position   string `json:"position"`
}

type LoanPayment struct {
	ID           string  `json:"id"`
	CompanyID    string  `json:"company_id"`
	LoanID       string  `json:"loan_id"`
	PaymentDate  string  `json:"payment_date"`
	Amount       float64 `json:"amount"`
	Principal    float64 `json:"principal"`
	Interest     float64 `json:"interest"`
	BalanceAfter float64 `json:"balance_after"`
	PaymentType  string  `json:"payment_type"`
	Notes        string  `json:"notes"`
	IsDeleted    bool    `json:"is_deleted"`
	CreatedAt    string  `json:"created_at"`
}

// Account represents a chart of accounts entry
type Account struct {
	ID             string  `json:"id"`
	CompanyID      string  `json:"company_id"`
	Code           string  `json:"code"`
	Name           string  `json:"name"`
	AccountType    string  `json:"account_type"`
	AccountSubtype string  `json:"account_subtype,omitempty"`
	NormalBalance  string  `json:"normal_balance"`
	ParentID       string  `json:"parent_id,omitempty"`
	ParentName     string  `json:"parent_name,omitempty"`
	ParentCode     string  `json:"parent_code,omitempty"`
	Description    string  `json:"description,omitempty"`
	IsActive       bool    `json:"is_active"`
	IsSystem       bool    `json:"is_system"`
	Currency       string  `json:"currency"`
	CurrentBalance float64 `json:"current_balance"`
	ChildCount     int     `json:"child_count,omitempty"`
	CreatedAt      string  `json:"created_at,omitempty"`
	UpdatedAt      string  `json:"updated_at,omitempty"`
}

// COATemplate represents a chart of accounts template
type COATemplate struct {
	ID          string `json:"id"`
	CompanyID   string `json:"company_id,omitempty"`
	Name        string `json:"name"`
	Country     string `json:"country"`
	Currency    string `json:"currency"`
	Flag        string `json:"flag"`
	Description string `json:"description,omitempty"`
	IsGlobal    bool   `json:"is_global"`
	ItemCount   int    `json:"item_count,omitempty"`
	CreatedAt   string `json:"created_at,omitempty"`
	UpdatedAt   string `json:"updated_at,omitempty"`
}

// COATemplateItem represents a single account in a template
type COATemplateItem struct {
	ID             string `json:"id"`
	TemplateID     string `json:"template_id"`
	Code           string `json:"code"`
	Name           string `json:"name"`
	AccountType    string `json:"account_type"`
	AccountSubtype string `json:"account_subtype,omitempty"`
	NormalBalance  string `json:"normal_balance"`
	IsSystem       bool   `json:"is_system"`
	SortOrder      int    `json:"sort_order"`
}

// JournalEntry represents a double-entry journal entry header
type JournalEntry struct {
	ID          string  `json:"id"`
	CompanyID   string  `json:"company_id"`
	EntryNumber int     `json:"entry_number"`
	EntryDate   string  `json:"entry_date"`
	Memo        string  `json:"memo,omitempty"`
	SourceType  string  `json:"source_type"`
	SourceID    string  `json:"source_id,omitempty"`
	Status      string  `json:"status"`
	TotalDebit  float64 `json:"total_debit"`
	TotalCredit float64 `json:"total_credit"`
	PostedAt    string  `json:"posted_at,omitempty"`
	PostedBy    string  `json:"posted_by,omitempty"`
	VoidedAt    string  `json:"voided_at,omitempty"`
	VoidedBy    string  `json:"voided_by,omitempty"`
	VoidReason  string  `json:"void_reason,omitempty"`
	IsDeleted   int     `json:"-"`
	LineCount   int     `json:"line_count,omitempty"`
	CreatedAt   string  `json:"created_at,omitempty"`
	UpdatedAt   string  `json:"updated_at,omitempty"`
}

// JournalLine represents a single debit or credit line
type JournalLine struct {
	ID          string  `json:"id"`
	EntryID     string  `json:"entry_id"`
	AccountID   string  `json:"account_id"`
	AccountCode string  `json:"account_code,omitempty"`
	AccountName string  `json:"account_name,omitempty"`
	AccountType string  `json:"account_type,omitempty"`
	Description string  `json:"description,omitempty"`
	Debit       float64 `json:"debit"`
	Credit      float64 `json:"credit"`
	SortOrder   int     `json:"sort_order"`
}

// AccountMapping links an HR/Payroll category to a COA account
type AccountMapping struct {
	ID          string `json:"id"`
	CompanyID   string `json:"company_id"`
	MappingKey  string `json:"mapping_key"`
	AccountID   string `json:"account_id"`
	AccountCode string `json:"account_code,omitempty"`
	AccountName string `json:"account_name,omitempty"`
	AccountType string `json:"account_type,omitempty"`
	Description string `json:"description,omitempty"`
	IsDeleted   int    `json:"-"`
	CreatedAt   string `json:"created_at,omitempty"`
	UpdatedAt   string `json:"updated_at,omitempty"`
}

// PayrollTotals holds aggregated payroll run amounts for journal generation
type PayrollTotals struct {
	TotalGross         float64 `json:"total_gross"`
	TotalBasic         float64 `json:"total_basic"`
	TotalOT            float64 `json:"total_ot"`
	TotalHoliday       float64 `json:"total_holiday"`
	TotalNightDiff     float64 `json:"total_night_diff"`
	TotalAllowances    float64 `json:"total_allowances"`
	TotalOtherEarnings float64 `json:"total_other_earnings"`
	TotalSSSEE         float64 `json:"total_sss_ee"`
	TotalSSSER         float64 `json:"total_sss_er"`
	TotalPhilHealthEE  float64 `json:"total_philhealth_ee"`
	TotalPhilHealthER  float64 `json:"total_philhealth_er"`
	TotalPagIBIGEE     float64 `json:"total_pagibig_ee"`
	TotalPagIBIGER     float64 `json:"total_pagibig_er"`
	TotalTax           float64 `json:"total_tax"`
	TotalBenefitDeduct float64 `json:"total_benefit_deductions"`
	TotalLoanDeduct    float64 `json:"total_loan_deductions"`
	TotalOtherDeduct   float64 `json:"total_other_deductions"`
	TotalNetPay        float64 `json:"total_net_pay"`
	EmployeeCount      int     `json:"employee_count"`
}

// TrialBalanceRow represents one account in the trial balance
type TrialBalanceRow struct {
	ID             string  `json:"id"`
	Code           string  `json:"code"`
	Name           string  `json:"name"`
	AccountType    string  `json:"account_type"`
	AccountSubtype string  `json:"account_subtype"`
	NormalBalance  string  `json:"normal_balance"`
	IsActive       bool    `json:"is_active"`
	TotalDebit     float64 `json:"total_debit"`
	TotalCredit    float64 `json:"total_credit"`
	NetMovement    float64 `json:"net_movement"`
	CurrentBalance float64 `json:"current_balance"`
}

// LedgerTransaction is one line in the account ledger
type LedgerTransaction struct {
	EntryID         string  `json:"entry_id"`
	EntryNumber     int     `json:"entry_number"`
	EntryDate       string  `json:"entry_date"`
	Memo            string  `json:"memo,omitempty"`
	SourceType      string  `json:"source_type"`
	SourceID        string  `json:"source_id,omitempty"`
	LineID          string  `json:"line_id"`
	LineDescription string  `json:"line_description,omitempty"`
	Debit           float64 `json:"debit"`
	Credit          float64 `json:"credit"`
}

// LedgerPeriodSummary holds aggregate stats for a period
type LedgerPeriodSummary struct {
	EntryCount       int     `json:"entry_count"`
	TotalDebits      float64 `json:"total_debits"`
	TotalCredits     float64 `json:"total_credits"`
	AccountsAffected int     `json:"accounts_affected"`
	TotalAccounts    int     `json:"total_accounts"`
	TotalPosted      int     `json:"total_posted"`
}

// LedgerTypeSummary holds per-type aggregate
type LedgerTypeSummary struct {
	AccountType  string  `json:"account_type"`
	AccountCount int     `json:"account_count"`
	TotalDebit   float64 `json:"total_debit"`
	TotalCredit  float64 `json:"total_credit"`
	TotalBalance float64 `json:"total_balance"`
}

// Vendor represents a supplier/vendor
type Vendor struct {
	ID            string `json:"id"`
	CompanyID     string `json:"company_id"`
	Name          string `json:"name"`
	ContactPerson string `json:"contact_person,omitempty"`
	Email         string `json:"email,omitempty"`
	Phone         string `json:"phone,omitempty"`
	Address       string `json:"address,omitempty"`
	City          string `json:"city,omitempty"`
	Province      string `json:"province,omitempty"`
	ZipCode       string `json:"zip_code,omitempty"`
	TIN           string `json:"tin,omitempty"`
	PaymentTerms  int    `json:"payment_terms"`
	Notes         string `json:"notes,omitempty"`
	IsActive      bool   `json:"is_active"`
	IsDeleted     int    `json:"-"`
	CreatedAt     string `json:"created_at,omitempty"`
	UpdatedAt     string `json:"updated_at,omitempty"`
}

// Bill represents an accounts payable bill
type Bill struct {
	ID           string  `json:"id"`
	CompanyID    string  `json:"company_id"`
	VendorID     string  `json:"vendor_id"`
	VendorName   string  `json:"vendor_name,omitempty"`
	VendorTIN    string  `json:"vendor_tin,omitempty"`
	BillNumber   string  `json:"bill_number"`
	BillDate     string  `json:"bill_date"`
	DueDate      string  `json:"due_date"`
	Status       string  `json:"status"`
	Subtotal     float64 `json:"subtotal"`
	TaxAmount    float64 `json:"tax_amount"`
	TotalAmount  float64 `json:"total_amount"`
	AmountPaid   float64 `json:"amount_paid"`
	BalanceDue   float64 `json:"balance_due"`
	Memo         string  `json:"memo,omitempty"`
	Reference    string  `json:"reference,omitempty"`
	JournalID    string  `json:"journal_id,omitempty"`
	ItemCount    int     `json:"item_count,omitempty"`
	PaymentCount int     `json:"payment_count,omitempty"`
	IsDeleted    int     `json:"-"`
	CreatedAt    string  `json:"created_at,omitempty"`
	UpdatedAt    string  `json:"updated_at,omitempty"`
}

// BillItem represents a line item on a bill
type BillItem struct {
	ID          string  `json:"id"`
	BillID      string  `json:"bill_id"`
	AccountID   string  `json:"account_id"`
	AccountCode string  `json:"account_code,omitempty"`
	AccountName string  `json:"account_name,omitempty"`
	Description string  `json:"description,omitempty"`
	Quantity    float64 `json:"quantity"`
	UnitPrice   float64 `json:"unit_price"`
	Amount      float64 `json:"amount"`
	TaxRate     float64 `json:"tax_rate"`
	TaxAmount   float64 `json:"tax_amount"`
	SortOrder   int     `json:"sort_order"`
}

// BillPayment represents a payment against a bill
type BillPayment struct {
	ID            string  `json:"id"`
	CompanyID     string  `json:"company_id"`
	BillID        string  `json:"bill_id"`
	PaymentDate   string  `json:"payment_date"`
	Amount        float64 `json:"amount"`
	PaymentMethod string  `json:"payment_method"`
	ReferenceNo   string  `json:"reference_no,omitempty"`
	AccountID     string  `json:"account_id,omitempty"`
	AccountCode   string  `json:"account_code,omitempty"`
	AccountName   string  `json:"account_name,omitempty"`
	JournalID     string  `json:"journal_id,omitempty"`
	Memo          string  `json:"memo,omitempty"`
	IsDeleted     int     `json:"-"`
	CreatedAt     string  `json:"created_at,omitempty"`
}

// APAging represents aging for a single vendor
type APAging struct {
	VendorID   string  `json:"vendor_id"`
	VendorName string  `json:"vendor_name"`
	BillCount  int     `json:"bill_count"`
	TotalDue   float64 `json:"total_due"`
	CurrentDue float64 `json:"current_due"`
	Days1_30   float64 `json:"days_1_30"`
	Days31_60  float64 `json:"days_31_60"`
	Days61_90  float64 `json:"days_61_90"`
	DaysOver90 float64 `json:"days_over_90"`
}

// APSummary represents dashboard summary
type APSummary struct {
	ActiveVendors    int     `json:"active_vendors"`
	OpenBills        int     `json:"open_bills"`
	TotalOutstanding float64 `json:"total_outstanding"`
	TotalOverdue     float64 `json:"total_overdue"`
	OverdueCount     int     `json:"overdue_count"`
	PaidThisMonth    float64 `json:"paid_this_month"`
}

// ==================== AR ====================

type Customer struct {
	ID            string `json:"id"`
	CompanyID     string `json:"company_id"`
	Name          string `json:"name"`
	ContactPerson string `json:"contact_person,omitempty"`
	Email         string `json:"email,omitempty"`
	Phone         string `json:"phone,omitempty"`
	Address       string `json:"address,omitempty"`
	City          string `json:"city,omitempty"`
	Province      string `json:"province,omitempty"`
	ZipCode       string `json:"zip_code,omitempty"`
	TIN           string `json:"tin,omitempty"`
	PaymentTerms  int    `json:"payment_terms"`
	Notes         string `json:"notes,omitempty"`
	IsActive      bool   `json:"is_active"`
	IsDeleted     int    `json:"-"`
	CreatedAt     string `json:"created_at,omitempty"`
	UpdatedAt     string `json:"updated_at,omitempty"`
}

type Invoice struct {
	ID            string  `json:"id"`
	CompanyID     string  `json:"company_id"`
	CustomerID    string  `json:"customer_id"`
	CustomerName  string  `json:"customer_name,omitempty"`
	CustomerTIN   string  `json:"customer_tin,omitempty"`
	InvoiceNumber string  `json:"invoice_number"`
	InvoiceDate   string  `json:"invoice_date"`
	DueDate       string  `json:"due_date"`
	Status        string  `json:"status"`
	Subtotal      float64 `json:"subtotal"`
	TaxAmount     float64 `json:"tax_amount"`
	TotalAmount   float64 `json:"total_amount"`
	AmountPaid    float64 `json:"amount_paid"`
	BalanceDue    float64 `json:"balance_due"`
	Memo          string  `json:"memo,omitempty"`
	Reference     string  `json:"reference,omitempty"`
	JournalID     string  `json:"journal_id,omitempty"`
	ItemCount     int     `json:"item_count,omitempty"`
	PaymentCount  int     `json:"payment_count,omitempty"`
	IsDeleted     int     `json:"-"`
	CreatedAt     string  `json:"created_at,omitempty"`
	UpdatedAt     string  `json:"updated_at,omitempty"`
}

type InvoiceItem struct {
	ID          string  `json:"id"`
	InvoiceID   string  `json:"invoice_id"`
	AccountID   string  `json:"account_id"`
	AccountCode string  `json:"account_code,omitempty"`
	AccountName string  `json:"account_name,omitempty"`
	Description string  `json:"description,omitempty"`
	Quantity    float64 `json:"quantity"`
	UnitPrice   float64 `json:"unit_price"`
	Amount      float64 `json:"amount"`
	TaxRate     float64 `json:"tax_rate"`
	TaxAmount   float64 `json:"tax_amount"`
	SortOrder   int     `json:"sort_order"`
}

type InvoicePayment struct {
	ID            string  `json:"id"`
	CompanyID     string  `json:"company_id"`
	InvoiceID     string  `json:"invoice_id"`
	PaymentDate   string  `json:"payment_date"`
	Amount        float64 `json:"amount"`
	PaymentMethod string  `json:"payment_method"`
	ReferenceNo   string  `json:"reference_no,omitempty"`
	AccountID     string  `json:"account_id,omitempty"`
	AccountCode   string  `json:"account_code,omitempty"`
	AccountName   string  `json:"account_name,omitempty"`
	JournalID     string  `json:"journal_id,omitempty"`
	Memo          string  `json:"memo,omitempty"`
	IsDeleted     int     `json:"-"`
	CreatedAt     string  `json:"created_at,omitempty"`
}

type ARAging struct {
	CustomerID   string  `json:"customer_id"`
	CustomerName string  `json:"customer_name"`
	InvoiceCount int     `json:"invoice_count"`
	TotalDue     float64 `json:"total_due"`
	CurrentDue   float64 `json:"current_due"`
	Days1_30     float64 `json:"days_1_30"`
	Days31_60    float64 `json:"days_31_60"`
	Days61_90    float64 `json:"days_61_90"`
	DaysOver90   float64 `json:"days_over_90"`
}

type ARSummary struct {
	ActiveCustomers    int     `json:"active_customers"`
	OpenInvoices       int     `json:"open_invoices"`
	TotalReceivable    float64 `json:"total_receivable"`
	TotalOverdue       float64 `json:"total_overdue"`
	OverdueCount       int     `json:"overdue_count"`
	CollectedThisMonth float64 `json:"collected_this_month"`
}

// ==================== TAX ====================

type TaxAccountRow struct {
	AccountID      string  `json:"account_id"`
	Code           string  `json:"code"`
	Name           string  `json:"name"`
	AccountType    string  `json:"account_type"`
	AccountSubtype string  `json:"account_subtype"`
	TotalDebit     float64 `json:"total_debit"`
	TotalCredit    float64 `json:"total_credit"`
	CurrentBalance float64 `json:"current_balance"`
}

type TaxDetail struct {
	EntryNumber int     `json:"entry_number"`
	EntryDate   string  `json:"entry_date"`
	Memo        string  `json:"memo,omitempty"`
	SourceType  string  `json:"source_type"`
	LineDesc    string  `json:"line_desc,omitempty"`
	Debit       float64 `json:"debit"`
	Credit      float64 `json:"credit"`
}

type VATComputation struct {
	OutputVAT float64 `json:"output_vat"`
	InputVAT  float64 `json:"input_vat"`
}

// ==================== BANK RECON ====================

type BankAccount struct {
	ID             string  `json:"id"`
	Code           string  `json:"code"`
	Name           string  `json:"name"`
	CurrentBalance float64 `json:"current_balance"`
}

type BankTransaction struct {
	ID             string  `json:"id"`
	CompanyID      string  `json:"company_id"`
	AccountID      string  `json:"account_id"`
	TxnDate        string  `json:"txn_date"`
	Description    string  `json:"description,omitempty"`
	Reference      string  `json:"reference,omitempty"`
	Amount         float64 `json:"amount"`
	IsReconciled   bool    `json:"is_reconciled"`
	MatchedEntryID string  `json:"matched_entry_id,omitempty"`
	StatementDate  string  `json:"statement_date,omitempty"`
	IsDeleted      int     `json:"-"`
	CreatedAt      string  `json:"created_at,omitempty"`
}

type BankReconSummary struct {
	BookBalance       float64 `json:"book_balance"`
	ReconciledTotal   float64 `json:"reconciled_total"`
	UnreconciledTotal float64 `json:"unreconciled_total"`
	UnreconciledCount int     `json:"unreconciled_count"`
	TotalCount        int     `json:"total_count"`
}

type UnmatchedJournalLine struct {
	LineID      string  `json:"line_id"`
	EntryID     string  `json:"entry_id"`
	EntryNumber int     `json:"entry_number"`
	EntryDate   string  `json:"entry_date"`
	Memo        string  `json:"memo,omitempty"`
	Description string  `json:"description,omitempty"`
	Debit       float64 `json:"debit"`
	Credit      float64 `json:"credit"`
	NetAmount   float64 `json:"net_amount"`
}

// ==================== REPORTS ====================

type ReportRow struct {
	ID             string  `json:"id"`
	Code           string  `json:"code"`
	Name           string  `json:"name"`
	AccountType    string  `json:"account_type"`
	AccountSubtype string  `json:"account_subtype"`
	NormalBalance  string  `json:"normal_balance"`
	TotalDebit     float64 `json:"total_debit"`
	TotalCredit    float64 `json:"total_credit"`
	NetBalance     float64 `json:"net_balance"`
}

type CashFlowRow struct {
	SourceType string  `json:"source_type"`
	CashIn     float64 `json:"cash_in"`
	CashOut    float64 `json:"cash_out"`
	NetCash    float64 `json:"net_cash"`
}

type TicketCategory struct {
	ID          string `json:"id"`
	CompanyID   string `json:"company_id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Color       string `json:"color"`
	Icon        string `json:"icon"`
	SLAHours    int    `json:"sla_hours"`
	IsActive    bool   `json:"is_active"`
	IsDeleted   int    `json:"-"`
	SortOrder   int    `json:"sort_order"`
	CreatedAt   string `json:"created_at,omitempty"`
}

type Ticket struct {
	ID             string `json:"id"`
	CompanyID      string `json:"company_id"`
	TicketNumber   int    `json:"ticket_number"`
	Subject        string `json:"subject"`
	Description    string `json:"description,omitempty"`
	CategoryID     string `json:"category_id,omitempty"`
	CategoryName   string `json:"category_name,omitempty"`
	CategoryColor  string `json:"category_color,omitempty"`
	CategoryIcon   string `json:"category_icon,omitempty"`
	Priority       string `json:"priority"`
	Status         string `json:"status"`
	CreatedBy      string `json:"created_by"`
	CreatedByName  string `json:"created_by_name,omitempty"`
	AssignedTo     string `json:"assigned_to,omitempty"`
	AssignedToName string `json:"assigned_to_name,omitempty"`
	DueDate        string `json:"due_date,omitempty"`
	ResolvedAt     string `json:"resolved_at,omitempty"`
	ClosedAt       string `json:"closed_at,omitempty"`
	SLAHours       int    `json:"sla_hours,omitempty"`
	CommentCount   int    `json:"comment_count,omitempty"`
	IsOverdue      bool   `json:"is_overdue"`
	IsDeleted      int    `json:"-"`
	CreatedAt      string `json:"created_at,omitempty"`
	UpdatedAt      string `json:"updated_at,omitempty"`
}

type TicketComment struct {
	ID         string `json:"id"`
	TicketID   string `json:"ticket_id"`
	AuthorID   string `json:"author_id"`
	AuthorName string `json:"author_name,omitempty"`
	Content    string `json:"content"`
	IsInternal bool   `json:"is_internal"`
	IsDeleted  int    `json:"-"`
	CreatedAt  string `json:"created_at,omitempty"`
}

type TicketStats struct {
	Total              int     `json:"total"`
	OpenCount          int     `json:"open_count"`
	InProgress         int     `json:"in_progress"`
	OnHold             int     `json:"on_hold"`
	Resolved           int     `json:"resolved"`
	ClosedCount        int     `json:"closed_count"`
	Overdue            int     `json:"overdue"`
	UrgentOpen         int     `json:"urgent_open"`
	HighOpen           int     `json:"high_open"`
	CreatedToday       int     `json:"created_today"`
	ResolvedToday      int     `json:"resolved_today"`
	AvgResolutionHours float64 `json:"avg_resolution_hours"`
}

type TicketCategoryStats struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Color   string `json:"color"`
	Icon    string `json:"icon"`
	Total   int    `json:"total"`
	Active  int    `json:"active"`
	Overdue int    `json:"overdue"`
}

// ==================== WORK SCHEDULES ====================

type WorkSchedule struct {
	ID                  string  `json:"id"`
	CompanyID           string  `json:"company_id"`
	Name                string  `json:"name"`
	Type                string  `json:"type"`
	Description         *string `json:"description,omitempty"`
	Color               string  `json:"color"`
	IsDefault           bool    `json:"is_default"`
	HoursPerDay         float64 `json:"hours_per_day"`          // e.g. 8, 9, 10 — used for hourly rate calculation
	WorkingDaysPerMonth int     `json:"working_days_per_month"` // e.g. 22 (5-day week), 26 (6-day week)
	NightDiffPct        float64 `json:"night_diff_pct"`         // 0.10 = 10%; 0 means no night diff for this schedule
	CreatedAt           string  `json:"created_at"`
	UpdatedAt           string  `json:"updated_at"`
	// Joined counts
	EmployeeCount   int `json:"employee_count"`
	DepartmentCount int `json:"department_count"`
	PositionCount   int `json:"position_count"`
	// Nested days (optional, for detail view)
	Days []WorkScheduleDay `json:"days,omitempty"`
}

type WorkScheduleDay struct {
	ID           string  `json:"id"`
	ScheduleID   string  `json:"schedule_id"`
	DayOfWeek    int     `json:"day_of_week"`
	StartTime    *string `json:"start_time,omitempty"`
	EndTime      *string `json:"end_time,omitempty"`
	BreakMinutes int     `json:"break_minutes"`
	IsRestDay    bool    `json:"is_rest_day"`
	CreatedAt    string  `json:"created_at,omitempty"`
	UpdatedAt    string  `json:"updated_at,omitempty"`
}

type WorkScheduleDefault struct {
	ID         string `json:"id"`
	CompanyID  string `json:"company_id"`
	ScheduleID string `json:"schedule_id"`
	Scope      string `json:"scope"`       // "department" or "position"
	ScopeValue string `json:"scope_value"` // matches employees.department or employees.position
	CreatedAt  string `json:"created_at"`
	UpdatedAt  string `json:"updated_at"`
	// Joined
	ScheduleName  string `json:"schedule_name,omitempty"`
	ScheduleType  string `json:"schedule_type,omitempty"`
	ScheduleColor string `json:"schedule_color,omitempty"`
}

type ResolvedSchedule struct {
	ID           string            `json:"id"`
	Name         string            `json:"name"`
	Type         string            `json:"type"`
	Color        string            `json:"color"`
	Description  *string           `json:"description,omitempty"`
	ResolvedFrom string            `json:"resolved_from"` // "employee", "position", "department", "company_default"
	Days         []WorkScheduleDay `json:"days,omitempty"`
}

type RosterEntry struct {
	EmployeeID     string  `json:"employee_id"`
	FirstName      string  `json:"first_name"`
	LastName       string  `json:"last_name"`
	Department     string  `json:"department"`
	Position       string  `json:"position"`
	EmploymentType string  `json:"employment_type"`
	ScheduleID     *string `json:"schedule_id,omitempty"`
	ResolvedFrom   string  `json:"resolved_from"`
	ScheduleName   *string `json:"schedule_name,omitempty"`
	ScheduleColor  *string `json:"schedule_color,omitempty"`
	StartTime      *string `json:"start_time,omitempty"`
	EndTime        *string `json:"end_time,omitempty"`
	BreakMinutes   *int    `json:"break_minutes,omitempty"`
	IsRestDay      bool    `json:"is_rest_day"`
}

// ==================== COMPLIANCE ====================

// ComplianceTemplate represents a country/region compliance template
type ComplianceTemplate struct {
	ID             string                     `json:"id"`
	CompanyID      *string                    `json:"company_id,omitempty"`
	Code           string                     `json:"code"`
	Name           string                     `json:"name"`
	CurrencySymbol string                     `json:"currency_symbol,omitempty"`
	IsGlobal       bool                       `json:"is_global"`
	Agencies       []ComplianceTemplateAgency `json:"agencies,omitempty"`
	CreatedAt      string                     `json:"created_at,omitempty"`
	UpdatedAt      string                     `json:"updated_at,omitempty"`
}

// ComplianceTemplateAgency is one agency entry inside a template
type ComplianceTemplateAgency struct {
	ID         string                    `json:"id"`
	TemplateID string                    `json:"template_id"`
	Name       string                    `json:"name"`
	FullName   string                    `json:"full_name,omitempty"`
	Color      string                    `json:"color"`
	Frequency  string                    `json:"frequency"`
	Website    string                    `json:"website,omitempty"`
	SortOrder  int                       `json:"sort_order"`
	Fields     []ComplianceTemplateField `json:"fields,omitempty"`
}

// ComplianceTemplateField is one field definition inside a template agency
type ComplianceTemplateField struct {
	ID        string `json:"id"`
	AgencyID  string `json:"agency_id"`
	FieldKey  string `json:"field_key"`
	Label     string `json:"label"`
	FieldType string `json:"field_type"`
	SortOrder int    `json:"sort_order"`
}

// ComplianceAgency represents a company's configured compliance obligation
type ComplianceAgency struct {
	ID        string            `json:"id" db:"id"`
	CompanyID string            `json:"company_id" db:"company_id"`
	Name      string            `json:"name" db:"name"`
	FullName  string            `json:"full_name,omitempty" db:"full_name"`
	Color     string            `json:"color" db:"color"`
	Frequency string            `json:"frequency" db:"frequency"`
	Website   string            `json:"website,omitempty" db:"website"`
	Status    string            `json:"status" db:"status"`
	DueDate   *string           `json:"due_date,omitempty" db:"due_date"`
	LastFiled *string           `json:"last_filed,omitempty" db:"last_filed"`
	SortOrder int               `json:"sort_order" db:"sort_order"`
	Fields    []ComplianceField `json:"fields,omitempty"`
	Values    []ComplianceValue `json:"values,omitempty"`
	CreatedAt string            `json:"created_at,omitempty" db:"created_at"`
	UpdatedAt string            `json:"updated_at,omitempty" db:"updated_at"`
}

// ComplianceField is a named value slot on a company compliance agency
type ComplianceField struct {
	ID        string `json:"id" db:"id"`
	AgencyID  string `json:"agency_id" db:"agency_id"`
	CompanyID string `json:"company_id" db:"company_id"`
	FieldKey  string `json:"field_key" db:"field_key"`
	Label     string `json:"label" db:"label"`
	FieldType string `json:"field_type" db:"field_type"`
	SortOrder int    `json:"sort_order" db:"sort_order"`
}

// ComplianceValue holds the (optionally encrypted) current value for a field
type ComplianceValue struct {
	ID             string `json:"id" db:"id"`
	FieldID        string `json:"field_id" db:"field_id"`
	CompanyID      string `json:"company_id" db:"company_id"`
	ValueEncrypted string `json:"value_encrypted,omitempty" db:"value_encrypted"`
	UpdatedAt      string `json:"updated_at,omitempty" db:"updated_at"`
}

// ComplianceAgenciesResponse is the envelope returned by get_compliance_agencies
type ComplianceAgenciesResponse struct {
	Agencies []ComplianceAgency `json:"agencies"`
	Fields   []ComplianceField  `json:"fields"`
	Values   []ComplianceValue  `json:"values"`
}

// ComplianceTemplatesResponse is the envelope returned by get_compliance_templates
type ComplianceTemplatesResponse struct {
	Templates []ComplianceTemplate       `json:"templates"`
	Agencies  []ComplianceTemplateAgency `json:"agencies"`
	Fields    []ComplianceTemplateField  `json:"fields"`
}

// UpsertComplianceAgencyRequest is the body for create/update_compliance_agency
type UpsertComplianceAgencyRequest struct {
	AgencyID  string                 `json:"agency_id,omitempty"`
	Name      string                 `json:"name"`
	FullName  string                 `json:"full_name,omitempty"`
	Color     string                 `json:"color,omitempty"`
	Frequency string                 `json:"frequency,omitempty"`
	Website   string                 `json:"website,omitempty"`
	Status    string                 `json:"status,omitempty"`
	DueDate   *string                `json:"due_date,omitempty"`
	LastFiled *string                `json:"last_filed,omitempty"`
	Fields    []ComplianceFieldInput `json:"fields,omitempty"`
}

// ComplianceFieldInput is a field definition inside UpsertComplianceAgencyRequest
type ComplianceFieldInput struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Type  string `json:"type"`
}
