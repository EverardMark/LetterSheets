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
	City         *string   `json:"city,omitempty" db:"city"`
	State        *string   `json:"state,omitempty" db:"state"`
	Province     *string   `json:"province,omitempty" db:"province"`
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
	ID                string    `json:"id" db:"id"`
	UserID            string    `json:"user_id" db:"user_id"`
	CompanyID         string    `json:"company_id" db:"company_id"`
	WrappedCompanyKey []byte    `json:"wrapped_company_key" db:"wrapped_company_key"`
	KeyWrapAlgorithm  string    `json:"key_wrap_algorithm" db:"key_wrap_algorithm"`
	KeyVersion        int       `json:"key_version" db:"key_version"`
	PublicKey         []byte    `json:"public_key" db:"public_key"`
	Role              string    `json:"role" db:"role"`
	Permissions       *string   `json:"permissions,omitempty" db:"permissions"`
	IsActive          bool      `json:"is_active" db:"is_active"`
	JoinedAt          time.Time `json:"joined_at" db:"joined_at"`
	UpdatedAt         time.Time `json:"updated_at" db:"updated_at"`

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
	CompanyCity     string `json:"company_city,omitempty"`
	CompanyState    string `json:"company_state,omitempty"`
	CompanyProvince string `json:"company_province,omitempty"`
	KeyAlgorithm    string `json:"key_algorithm,omitempty"`

	Email    string `json:"email"`
	Username string `json:"username"`
	Password string `json:"password"`

	WrappedCompanyKey []byte `json:"wrapped_company_key"`
	KeyWrapAlgorithm  string `json:"key_wrap_algorithm,omitempty"`
	PublicKey         []byte `json:"public_key"`
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
	Email             string `json:"email"`
	Password          string `json:"password"`
	Salt              string `json:"salt"`
	WrappedCompanyKey string `json:"wrapped_company_key"`
	KeyWrapAlgorithm  string `json:"key_wrap_algorithm"`
	PublicKey         string `json:"public_key"`
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
