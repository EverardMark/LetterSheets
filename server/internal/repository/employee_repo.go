package repository

import (
	"context"
	"database/sql"
	"encoding/json"

	"lettersheets/internal/models"
)

type EmployeeRepo struct {
	db *sql.DB
}

func NewEmployeeRepo(db *sql.DB) *EmployeeRepo {
	return &EmployeeRepo{db: db}
}

// GetByCompany returns summary list (no encrypted fields)
// sp_get_employees now returns: ..., work_schedule_id, ..., schedule_name, schedule_type, schedule_color
func (r *EmployeeRepo) GetByCompany(ctx context.Context, companyID string) ([]models.Employee, error) {
	rows, err := r.db.QueryContext(ctx, "CALL sp_get_employees(?)", companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var employees []models.Employee
	for rows.Next() {
		var e models.Employee
		var enrolledJSON sql.NullString
		var joinedDate, createdAt, updatedAt sql.NullString
		var workScheduleID, scheduleName, scheduleType, scheduleColor sql.NullString
		var userID, accountUsername sql.NullString
		var accountActive sql.NullInt64
		err := rows.Scan(
			&e.ID, &e.CompanyID, &e.FirstName, &e.LastName, &e.MiddleName,
			&e.Department, &e.Position, &joinedDate, &e.EmploymentType, &e.Status,
			&enrolledJSON, &workScheduleID,
			&createdAt, &updatedAt,
			&userID, &accountUsername, &accountActive,
			&scheduleName, &scheduleType, &scheduleColor,
		)
		if err != nil {
			return nil, err
		}
		if joinedDate.Valid {
			e.JoinedDate = &joinedDate.String
		}
		if createdAt.Valid {
			e.CreatedAt = createdAt.String
		}
		if updatedAt.Valid {
			e.UpdatedAt = updatedAt.String
		}
		if enrolledJSON.Valid {
			var enrolled interface{}
			json.Unmarshal([]byte(enrolledJSON.String), &enrolled)
			e.EnrolledBenefits = enrolled
		}
		if workScheduleID.Valid {
			e.WorkScheduleID = &workScheduleID.String
		}
		if scheduleName.Valid {
			e.ScheduleName = &scheduleName.String
		}
		if scheduleType.Valid {
			e.ScheduleType = &scheduleType.String
		}
		if scheduleColor.Valid {
			e.ScheduleColor = &scheduleColor.String
		}
		if userID.Valid {
			e.UserID = &userID.String
		}
		if accountUsername.Valid {
			e.AccountUsername = &accountUsername.String
		}
		if accountActive.Valid {
			b := accountActive.Int64 != 0
			e.AccountActive = &b
		}
		employees = append(employees, e)
	}
	return employees, nil
}

// GetByID returns single employee with all encrypted fields
// sp_get_employee now returns: ..., work_schedule_id, ..., schedule_name, schedule_type, schedule_color
func (r *EmployeeRepo) GetByID(ctx context.Context, id, companyID string) (*models.Employee, error) {
	rows, err := r.db.QueryContext(ctx, "CALL sp_get_employee(?, ?)", id, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, nil
	}

	var ef models.EmployeeFull
	var enrolledJSON sql.NullString
	var joinedDate, createdAt, updatedAt sql.NullString
	var workScheduleID, scheduleName, scheduleType, scheduleColor sql.NullString
	var userID, accountEmail, accountUsername, accountLastLoginAt sql.NullString
	var accountActive sql.NullInt64
	err = rows.Scan(
		&ef.ID, &ef.CompanyID, &ef.FirstName, &ef.LastName, &ef.MiddleName,
		&ef.Department, &ef.Position, &joinedDate, &ef.EmploymentType, &ef.Status,
		&ef.EmailEnc, &ef.PhoneEnc, &ef.BirthdayEnc, &ef.AddressEnc,
		&ef.BasicSalaryEnc, &ef.SssNoEnc, &ef.PhilhealthEnc,
		&ef.PagibigEnc, &ef.TinEnc, &ef.BankNameEnc, &ef.BankAccountEnc,
		&enrolledJSON, &workScheduleID,
		&createdAt, &updatedAt,
		&userID, &accountEmail, &accountUsername, &accountActive, &accountLastLoginAt,
		&scheduleName, &scheduleType, &scheduleColor,
	)
	if err != nil {
		return nil, err
	}
	if joinedDate.Valid {
		ef.JoinedDate = &joinedDate.String
	}
	if createdAt.Valid {
		ef.CreatedAt = createdAt.String
	}
	if updatedAt.Valid {
		ef.UpdatedAt = updatedAt.String
	}
	if enrolledJSON.Valid {
		var enrolled interface{}
		json.Unmarshal([]byte(enrolledJSON.String), &enrolled)
		ef.EnrolledBenefits = enrolled
	}
	if workScheduleID.Valid {
		ef.WorkScheduleID = &workScheduleID.String
	}
	if scheduleName.Valid {
		ef.ScheduleName = &scheduleName.String
	}
	if scheduleType.Valid {
		ef.ScheduleType = &scheduleType.String
	}
	if scheduleColor.Valid {
		ef.ScheduleColor = &scheduleColor.String
	}
	if userID.Valid {
		ef.UserID = &userID.String
	}
	if accountEmail.Valid {
		ef.AccountEmail = &accountEmail.String
	}
	if accountUsername.Valid {
		ef.AccountUsername = &accountUsername.String
	}
	if accountActive.Valid {
		b := accountActive.Int64 != 0
		ef.AccountActive = &b
	}
	if accountLastLoginAt.Valid {
		ef.AccountLastLoginAt = &accountLastLoginAt.String
	}

	// Build encrypted map for frontend
	enc := make(map[string]interface{})
	encFields := map[string]*string{
		"email":         ef.EmailEnc,
		"phone":         ef.PhoneEnc,
		"birthday":      ef.BirthdayEnc,
		"address":       ef.AddressEnc,
		"basic_salary":  ef.BasicSalaryEnc,
		"sss_no":        ef.SssNoEnc,
		"philhealth_no": ef.PhilhealthEnc,
		"pagibig_no":    ef.PagibigEnc,
		"tin":           ef.TinEnc,
		"bank_name":     ef.BankNameEnc,
		"bank_account":  ef.BankAccountEnc,
	}
	for key, ptr := range encFields {
		if ptr != nil && *ptr != "" {
			var parsed interface{}
			if json.Unmarshal([]byte(*ptr), &parsed) == nil {
				enc[key] = parsed
			}
		}
	}
	ef.Encrypted = enc

	e := ef.Employee
	return &e, nil
}

// encJSON marshals encrypted field value, returns nil for empty
func encJSON(m map[string]interface{}, key string) *string {
	v, ok := m[key]
	if !ok || v == nil {
		return nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		return nil
	}
	s := string(b)
	return &s
}

func (r *EmployeeRepo) Create(ctx context.Context, e *models.Employee, meta *models.RequestMeta) error {
	enc := e.Encrypted
	if enc == nil {
		enc = map[string]interface{}{}
	}

	enrolledJSON := "[]"
	if e.EnrolledBenefits != nil {
		if b, err := json.Marshal(e.EnrolledBenefits); err == nil {
			enrolledJSON = string(b)
		}
	}

	joinedDate := ""
	if e.JoinedDate != nil {
		joinedDate = *e.JoinedDate
	}

	workScheduleID := ""
	if e.WorkScheduleID != nil {
		workScheduleID = *e.WorkScheduleID
	}

	_, err := r.db.ExecContext(ctx,
		"CALL sp_create_employee(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		e.ID, meta.CompanyID,
		e.FirstName, e.LastName, e.MiddleName,
		e.Department, e.Position, joinedDate, e.EmploymentType, e.Status,
		encJSON(enc, "email"), encJSON(enc, "phone"), encJSON(enc, "birthday"), encJSON(enc, "address"),
		encJSON(enc, "basic_salary"), encJSON(enc, "sss_no"), encJSON(enc, "philhealth_no"),
		encJSON(enc, "pagibig_no"), encJSON(enc, "tin"), encJSON(enc, "bank_name"), encJSON(enc, "bank_account"),
		enrolledJSON,
		workScheduleID,
		meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent,
	)
	return err
}

func (r *EmployeeRepo) Update(ctx context.Context, e *models.Employee, meta *models.RequestMeta) error {
	enc := e.Encrypted
	if enc == nil {
		enc = map[string]interface{}{}
	}

	enrolledJSON := "[]"
	if e.EnrolledBenefits != nil {
		if b, err := json.Marshal(e.EnrolledBenefits); err == nil {
			enrolledJSON = string(b)
		}
	}

	joinedDate := ""
	if e.JoinedDate != nil {
		joinedDate = *e.JoinedDate
	}

	workScheduleID := ""
	if e.WorkScheduleID != nil {
		workScheduleID = *e.WorkScheduleID
	}

	_, err := r.db.ExecContext(ctx,
		"CALL sp_update_employee(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		e.ID, meta.CompanyID,
		e.FirstName, e.LastName, e.MiddleName,
		e.Department, e.Position, joinedDate, e.EmploymentType, e.Status,
		encJSON(enc, "email"), encJSON(enc, "phone"), encJSON(enc, "birthday"), encJSON(enc, "address"),
		encJSON(enc, "basic_salary"), encJSON(enc, "sss_no"), encJSON(enc, "philhealth_no"),
		encJSON(enc, "pagibig_no"), encJSON(enc, "tin"), encJSON(enc, "bank_name"), encJSON(enc, "bank_account"),
		enrolledJSON,
		workScheduleID,
		meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent,
	)
	return err
}

func (r *EmployeeRepo) Delete(ctx context.Context, id string, meta *models.RequestMeta) error {
	_, err := r.db.ExecContext(ctx,
		"CALL sp_delete_employee(?, ?, ?, ?, ?, ?)",
		id, meta.CompanyID, meta.SessionID, meta.UserID, meta.IPAddress, meta.UserAgent,
	)
	return err
}

func (r *EmployeeRepo) LinkUser(ctx context.Context, employeeID, userID string, meta *models.RequestMeta) error {
	_, err := r.db.ExecContext(ctx,
		"UPDATE employees SET user_id = ? WHERE id = ? AND company_id = ?",
		userID, employeeID, meta.CompanyID,
	)
	return err
}

// FindByUserID returns the ID of the employee linked to the given user in
// this company, or an empty string if no such employee exists. Used by the
// account creation handler to detect whether an existing user is already
// attached to another employee.
func (r *EmployeeRepo) FindByUserID(ctx context.Context, userID, companyID string) (string, error) {
	var id string
	err := r.db.QueryRowContext(ctx,
		"SELECT id FROM employees WHERE user_id = ? AND company_id = ? AND is_deleted = 0 LIMIT 1",
		userID, companyID,
	).Scan(&id)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return id, nil
}
