package repository

import (
	"database/sql"
	"fmt"

	"lettersheets/internal/models"
)

type APRepo struct {
	db *sql.DB
}

func NewAPRepo(db *sql.DB) *APRepo {
	return &APRepo{db: db}
}

// ==================== VENDORS ====================

func (r *APRepo) GetVendors(companyID string, activeOnly bool) ([]models.Vendor, error) {
	ao := 0
	if activeOnly {
		ao = 1
	}
	rows, err := r.db.Query("CALL sp_get_vendors(?,?)", companyID, ao)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []models.Vendor
	for rows.Next() {
		var v models.Vendor
		var cp, email, phone, addr, city, prov, zip, tin, notes sql.NullString
		err := rows.Scan(&v.ID, &v.CompanyID, &v.Name, &cp, &email, &phone, &addr,
			&city, &prov, &zip, &tin, &v.PaymentTerms, &notes,
			&v.IsActive, &v.IsDeleted, &v.CreatedAt, &v.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("scan vendor: %w", err)
		}
		if cp.Valid {
			v.ContactPerson = cp.String
		}
		if email.Valid {
			v.Email = email.String
		}
		if phone.Valid {
			v.Phone = phone.String
		}
		if addr.Valid {
			v.Address = addr.String
		}
		if city.Valid {
			v.City = city.String
		}
		if prov.Valid {
			v.Province = prov.String
		}
		if zip.Valid {
			v.ZipCode = zip.String
		}
		if tin.Valid {
			v.TIN = tin.String
		}
		if notes.Valid {
			v.Notes = notes.String
		}
		result = append(result, v)
	}
	return result, nil
}

func (r *APRepo) GetVendor(id, companyID string) (*models.Vendor, error) {
	rows, err := r.db.Query("CALL sp_get_vendor(?,?)", id, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, fmt.Errorf("vendor not found")
	}
	var v models.Vendor
	var cp, email, phone, addr, city, prov, zip, tin, notes sql.NullString
	err = rows.Scan(&v.ID, &v.CompanyID, &v.Name, &cp, &email, &phone, &addr,
		&city, &prov, &zip, &tin, &v.PaymentTerms, &notes,
		&v.IsActive, &v.IsDeleted, &v.CreatedAt, &v.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if cp.Valid {
		v.ContactPerson = cp.String
	}
	if email.Valid {
		v.Email = email.String
	}
	if phone.Valid {
		v.Phone = phone.String
	}
	if addr.Valid {
		v.Address = addr.String
	}
	if city.Valid {
		v.City = city.String
	}
	if prov.Valid {
		v.Province = prov.String
	}
	if zip.Valid {
		v.ZipCode = zip.String
	}
	if tin.Valid {
		v.TIN = tin.String
	}
	if notes.Valid {
		v.Notes = notes.String
	}
	return &v, nil
}

func (r *APRepo) CreateVendor(v *models.Vendor) error {
	rows, err := r.db.Query("CALL sp_create_vendor(?,?,?,?,?,?,?,?,?,?,?,?,?)",
		v.ID, v.CompanyID, v.Name, v.ContactPerson, v.Email, v.Phone,
		v.Address, v.City, v.Province, v.ZipCode, v.TIN, v.PaymentTerms, v.Notes)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *APRepo) UpdateVendor(v *models.Vendor) error {
	rows, err := r.db.Query("CALL sp_update_vendor(?,?,?,?,?,?,?,?,?,?,?,?,?)",
		v.ID, v.CompanyID, v.Name, v.ContactPerson, v.Email, v.Phone,
		v.Address, v.City, v.Province, v.ZipCode, v.TIN, v.PaymentTerms, v.Notes)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *APRepo) DeleteVendor(id, companyID string) error {
	rows, err := r.db.Query("CALL sp_delete_vendor(?,?)", id, companyID)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *APRepo) ToggleVendorActive(id, companyID string) error {
	rows, err := r.db.Query("CALL sp_toggle_vendor_active(?,?)", id, companyID)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

// ==================== BILLS ====================

func (r *APRepo) GetBills(companyID, status, vendorID, dateFrom, dateTo string) ([]models.Bill, error) {
	var dfp, dtp interface{}
	if dateFrom != "" {
		dfp = dateFrom
	}
	if dateTo != "" {
		dtp = dateTo
	}
	rows, err := r.db.Query("CALL sp_get_bills(?,?,?,?,?)", companyID, status, vendorID, dfp, dtp)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []models.Bill
	for rows.Next() {
		var b models.Bill
		var memo, ref, jid, vtin sql.NullString
		err := rows.Scan(&b.ID, &b.CompanyID, &b.VendorID, &b.BillNumber, &b.BillDate, &b.DueDate,
			&b.Status, &b.Subtotal, &b.TaxAmount, &b.TotalAmount, &b.AmountPaid, &b.BalanceDue,
			&memo, &ref, &jid, &b.IsDeleted, &b.CreatedAt, &b.UpdatedAt,
			&b.VendorName, &vtin, &b.ItemCount, &b.PaymentCount)
		if err != nil {
			return nil, fmt.Errorf("scan bill: %w", err)
		}
		if memo.Valid {
			b.Memo = memo.String
		}
		if ref.Valid {
			b.Reference = ref.String
		}
		if jid.Valid {
			b.JournalID = jid.String
		}
		if vtin.Valid {
			b.VendorTIN = vtin.String
		}
		result = append(result, b)
	}
	return result, nil
}

func (r *APRepo) GetBill(id, companyID string) (*models.Bill, error) {
	rows, err := r.db.Query("CALL sp_get_bill(?,?)", id, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, fmt.Errorf("bill not found")
	}
	var b models.Bill
	var memo, ref, jid, vtin sql.NullString
	err = rows.Scan(&b.ID, &b.CompanyID, &b.VendorID, &b.BillNumber, &b.BillDate, &b.DueDate,
		&b.Status, &b.Subtotal, &b.TaxAmount, &b.TotalAmount, &b.AmountPaid, &b.BalanceDue,
		&memo, &ref, &jid, &b.IsDeleted, &b.CreatedAt, &b.UpdatedAt,
		&b.VendorName, &vtin)
	if err != nil {
		return nil, err
	}
	if memo.Valid {
		b.Memo = memo.String
	}
	if ref.Valid {
		b.Reference = ref.String
	}
	if jid.Valid {
		b.JournalID = jid.String
	}
	if vtin.Valid {
		b.VendorTIN = vtin.String
	}
	return &b, nil
}

func (r *APRepo) CreateBill(b *models.Bill) error {
	rows, err := r.db.Query("CALL sp_create_bill(?,?,?,?,?,?,?,?)",
		b.ID, b.CompanyID, b.VendorID, b.BillNumber, b.BillDate, b.DueDate, b.Memo, b.Reference)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *APRepo) UpdateBill(b *models.Bill) error {
	rows, err := r.db.Query("CALL sp_update_bill(?,?,?,?,?,?,?,?)",
		b.ID, b.CompanyID, b.VendorID, b.BillNumber, b.BillDate, b.DueDate, b.Memo, b.Reference)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *APRepo) DeleteBill(id, companyID string) error {
	rows, err := r.db.Query("CALL sp_delete_bill(?,?)", id, companyID)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *APRepo) ApproveBill(id, companyID string) error {
	rows, err := r.db.Query("CALL sp_approve_bill(?,?)", id, companyID)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *APRepo) VoidBill(id, companyID string) error {
	rows, err := r.db.Query("CALL sp_void_bill(?,?)", id, companyID)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

// ==================== BILL ITEMS ====================

func (r *APRepo) GetBillItems(billID string) ([]models.BillItem, error) {
	rows, err := r.db.Query("CALL sp_get_bill_items(?)", billID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []models.BillItem
	for rows.Next() {
		var bi models.BillItem
		var desc sql.NullString
		err := rows.Scan(&bi.ID, &bi.BillID, &bi.AccountID, &desc,
			&bi.Quantity, &bi.UnitPrice, &bi.Amount, &bi.TaxRate, &bi.TaxAmount,
			&bi.SortOrder, &bi.AccountCode, &bi.AccountName)
		if err != nil {
			return nil, fmt.Errorf("scan bill item: %w", err)
		}
		if desc.Valid {
			bi.Description = desc.String
		}
		result = append(result, bi)
	}
	return result, nil
}

func (r *APRepo) AddBillItem(billID, accountID, description string, qty, unitPrice, amount, taxRate, taxAmount float64, sortOrder int) error {
	rows, err := r.db.Query("CALL sp_add_bill_item(?,?,?,?,?,?,?,?,?)",
		billID, accountID, description, qty, unitPrice, amount, taxRate, taxAmount, sortOrder)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *APRepo) ClearBillItems(billID string) error {
	rows, err := r.db.Query("CALL sp_clear_bill_items(?)", billID)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *APRepo) UpdateBillTotals(billID string) error {
	rows, err := r.db.Query("CALL sp_update_bill_totals(?)", billID)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

// ==================== PAYMENTS ====================

func (r *APRepo) CreateBillPayment(p *models.BillPayment) error {
	rows, err := r.db.Query("CALL sp_create_bill_payment(?,?,?,?,?,?,?,?,?)",
		p.ID, p.CompanyID, p.BillID, p.PaymentDate, p.Amount, p.PaymentMethod,
		p.ReferenceNo, p.AccountID, p.Memo)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *APRepo) GetBillPayments(billID string) ([]models.BillPayment, error) {
	rows, err := r.db.Query("CALL sp_get_bill_payments(?)", billID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []models.BillPayment
	for rows.Next() {
		var p models.BillPayment
		var refNo, acctID, acctCode, acctName, jid, memo sql.NullString
		err := rows.Scan(&p.ID, &p.CompanyID, &p.BillID, &p.PaymentDate, &p.Amount,
			&p.PaymentMethod, &refNo, &acctID, &jid, &memo,
			&p.IsDeleted, &p.CreatedAt, &acctCode, &acctName)
		if err != nil {
			return nil, fmt.Errorf("scan payment: %w", err)
		}
		if refNo.Valid {
			p.ReferenceNo = refNo.String
		}
		if acctID.Valid {
			p.AccountID = acctID.String
		}
		if acctCode.Valid {
			p.AccountCode = acctCode.String
		}
		if acctName.Valid {
			p.AccountName = acctName.String
		}
		if jid.Valid {
			p.JournalID = jid.String
		}
		if memo.Valid {
			p.Memo = memo.String
		}
		result = append(result, p)
	}
	return result, nil
}

func (r *APRepo) DeleteBillPayment(id, companyID string) error {
	rows, err := r.db.Query("CALL sp_delete_bill_payment(?,?)", id, companyID)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

// ==================== REPORTS ====================

func (r *APRepo) GetAPAging(companyID string) ([]models.APAging, error) {
	rows, err := r.db.Query("CALL sp_ap_aging(?)", companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []models.APAging
	for rows.Next() {
		var a models.APAging
		err := rows.Scan(&a.VendorID, &a.VendorName, &a.BillCount, &a.TotalDue,
			&a.CurrentDue, &a.Days1_30, &a.Days31_60, &a.Days61_90, &a.DaysOver90)
		if err != nil {
			return nil, fmt.Errorf("scan aging: %w", err)
		}
		result = append(result, a)
	}
	return result, nil
}

func (r *APRepo) GetAPSummary(companyID string) (*models.APSummary, error) {
	rows, err := r.db.Query("CALL sp_ap_summary(?)", companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var s models.APSummary
	if rows.Next() {
		rows.Scan(&s.ActiveVendors, &s.OpenBills, &s.TotalOutstanding, &s.TotalOverdue, &s.OverdueCount, &s.PaidThisMonth)
	}
	return &s, nil
}
