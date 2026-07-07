package repository

import (
	"database/sql"

	"lettersheets/internal/models"
)

type LoanRepo struct {
	db *sql.DB
}

func NewLoanRepo(db *sql.DB) *LoanRepo {
	return &LoanRepo{db: db}
}

// ========== LOAN TYPES ==========

func (r *LoanRepo) GetLoanTypes(companyID string) ([]models.LoanType, error) {
	rows, err := r.db.Query("CALL sp_get_loan_types(?)", companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var types []models.LoanType
	for rows.Next() {
		var t models.LoanType
		var desc sql.NullString
		err := rows.Scan(&t.ID, &t.CompanyID, &t.Name, &desc, &t.MaxAmount, &t.InterestRate,
			&t.MaxTermMonths, &t.RequiresApproval, &t.IsDeleted, &t.CreatedAt, &t.UpdatedAt, &t.ActiveLoans)
		if err != nil {
			return nil, err
		}
		t.Description = desc.String
		types = append(types, t)
	}
	return types, nil
}

func (r *LoanRepo) CreateLoanType(companyID, name, description string, maxAmount, interestRate float64, maxTermMonths int, requiresApproval bool) (*models.LoanType, error) {
	rows, err := r.db.Query("CALL sp_create_loan_type(?,?,?,?,?,?,?)",
		companyID, name, description, maxAmount, interestRate, maxTermMonths, requiresApproval)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if rows.Next() {
		var t models.LoanType
		var desc sql.NullString
		err := rows.Scan(&t.ID, &t.CompanyID, &t.Name, &desc, &t.MaxAmount, &t.InterestRate,
			&t.MaxTermMonths, &t.RequiresApproval, &t.IsDeleted, &t.CreatedAt, &t.UpdatedAt)
		if err != nil {
			return nil, err
		}
		t.Description = desc.String
		return &t, nil
	}
	return nil, sql.ErrNoRows
}

func (r *LoanRepo) UpdateLoanType(id, name, description string, maxAmount, interestRate float64, maxTermMonths int, requiresApproval bool) (*models.LoanType, error) {
	rows, err := r.db.Query("CALL sp_update_loan_type(?,?,?,?,?,?,?)",
		id, name, description, maxAmount, interestRate, maxTermMonths, requiresApproval)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if rows.Next() {
		var t models.LoanType
		var desc sql.NullString
		err := rows.Scan(&t.ID, &t.CompanyID, &t.Name, &desc, &t.MaxAmount, &t.InterestRate,
			&t.MaxTermMonths, &t.RequiresApproval, &t.IsDeleted, &t.CreatedAt, &t.UpdatedAt)
		if err != nil {
			return nil, err
		}
		t.Description = desc.String
		return &t, nil
	}
	return nil, sql.ErrNoRows
}

func (r *LoanRepo) DeleteLoanType(id string) error {
	_, err := r.db.Exec("CALL sp_delete_loan_type(?)", id)
	return err
}

// ========== LOANS ==========

func scanLoan(rows *sql.Rows) (*models.Loan, error) {
	var l models.Loan
	var loanTypeID, loanTypeName, approvedDate, approvedBy, startDate, endDate, rejectionNote, notes sql.NullString
	err := rows.Scan(&l.ID, &l.CompanyID, &l.EmployeeID, &loanTypeID, &loanTypeName,
		&l.Amount, &l.InterestRate, &l.TermMonths, &l.MonthlyPayment,
		&l.TotalPayable, &l.TotalPaid, &l.Balance, &l.Status,
		&l.AppliedDate, &approvedDate, &approvedBy, &startDate, &endDate,
		&rejectionNote, &notes, &l.IsDeleted, &l.CreatedAt, &l.UpdatedAt,
		&l.FirstName, &l.LastName, &l.Department, &l.Position)
	if err != nil {
		return nil, err
	}
	l.LoanTypeID = loanTypeID.String
	l.LoanTypeName = loanTypeName.String
	l.ApprovedDate = approvedDate.String
	l.ApprovedBy = approvedBy.String
	l.StartDate = startDate.String
	l.EndDate = endDate.String
	l.RejectionNote = rejectionNote.String
	l.Notes = notes.String
	return &l, nil
}

func (r *LoanRepo) GetLoans(companyID, status string) ([]models.Loan, error) {
	rows, err := r.db.Query("CALL sp_get_loans(?,?)", companyID, status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var loans []models.Loan
	for rows.Next() {
		l, err := scanLoan(rows)
		if err != nil {
			return nil, err
		}
		loans = append(loans, *l)
	}
	return loans, nil
}

func (r *LoanRepo) GetLoan(companyID, id string) (*models.Loan, error) {
	rows, err := r.db.Query("CALL sp_get_loan(?,?)", companyID, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if rows.Next() {
		return scanLoan(rows)
	}
	return nil, sql.ErrNoRows
}

func (r *LoanRepo) CreateLoan(companyID, employeeID, loanTypeID, loanTypeName string,
	amount, interestRate float64, termMonths int, monthlyPayment, totalPayable float64,
	appliedDate, notes string) (*models.Loan, error) {
	rows, err := r.db.Query("CALL sp_create_loan(?,?,?,?,?,?,?,?,?,?,?)",
		companyID, employeeID, loanTypeID, loanTypeName, amount, interestRate,
		termMonths, monthlyPayment, totalPayable, appliedDate, notes)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if rows.Next() {
		return scanLoan(rows)
	}
	return nil, sql.ErrNoRows
}

func (r *LoanRepo) ApproveLoan(companyID, id, approvedBy, startDate, endDate string) (*models.Loan, error) {
	_, err := r.db.Exec("CALL sp_approve_loan(?,?,?,?,?)", companyID, id, approvedBy, startDate, endDate)
	return nil, err
}

func (r *LoanRepo) RejectLoan(companyID, id, rejectionNote string) error {
	_, err := r.db.Exec("CALL sp_reject_loan(?,?,?)", companyID, id, rejectionNote)
	return err
}

func (r *LoanRepo) CancelLoan(companyID, id string) error {
	_, err := r.db.Exec("CALL sp_cancel_loan(?,?)", companyID, id)
	return err
}

func (r *LoanRepo) DeleteLoan(companyID, id string) error {
	_, err := r.db.Exec("CALL sp_delete_loan(?,?)", companyID, id)
	return err
}

// ========== PAYMENTS ==========

func (r *LoanRepo) GetPayments(companyID, loanID string) ([]models.LoanPayment, error) {
	rows, err := r.db.Query("CALL sp_get_loan_payments(?,?)", companyID, loanID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var payments []models.LoanPayment
	for rows.Next() {
		var p models.LoanPayment
		var notes sql.NullString
		err := rows.Scan(&p.ID, &p.CompanyID, &p.LoanID, &p.PaymentDate, &p.Amount,
			&p.Principal, &p.Interest, &p.BalanceAfter, &p.PaymentType, &notes,
			&p.IsDeleted, &p.CreatedAt)
		if err != nil {
			return nil, err
		}
		p.Notes = notes.String
		payments = append(payments, p)
	}
	return payments, nil
}

func (r *LoanRepo) RecordPayment(companyID, loanID, paymentDate string, amount, principal, interest float64, paymentType, notes string) (*models.LoanPayment, error) {
	rows, err := r.db.Query("CALL sp_record_loan_payment(?,?,?,?,?,?,?,?)",
		companyID, loanID, paymentDate, amount, principal, interest, paymentType, notes)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if rows.Next() {
		var p models.LoanPayment
		var n sql.NullString
		err := rows.Scan(&p.ID, &p.CompanyID, &p.LoanID, &p.PaymentDate, &p.Amount,
			&p.Principal, &p.Interest, &p.BalanceAfter, &p.PaymentType, &n,
			&p.IsDeleted, &p.CreatedAt)
		if err != nil {
			return nil, err
		}
		p.Notes = n.String
		return &p, nil
	}
	return nil, sql.ErrNoRows
}

func (r *LoanRepo) DeletePayment(companyID, id string) error {
	_, err := r.db.Exec("CALL sp_delete_loan_payment(?,?)", companyID, id)
	return err
}
