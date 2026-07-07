package repository

import (
	"database/sql"
	"fmt"
	"lettersheets/internal/models"
)

type ARRepo struct{ db *sql.DB }

func NewARRepo(db *sql.DB) *ARRepo { return &ARRepo{db: db} }

// ==================== CUSTOMERS ====================

func (r *ARRepo) GetCustomers(cid string, activeOnly bool) ([]models.Customer, error) {
	ao := 0
	if activeOnly {
		ao = 1
	}
	rows, err := r.db.Query("CALL sp_get_customers(?,?)", cid, ao)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.Customer
	for rows.Next() {
		var c models.Customer
		var cp, em, ph, ad, ci, pr, zp, tn, no sql.NullString
		if err := rows.Scan(&c.ID, &c.CompanyID, &c.Name, &cp, &em, &ph, &ad, &ci, &pr, &zp, &tn, &c.PaymentTerms, &no, &c.IsActive, &c.IsDeleted, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		if cp.Valid {
			c.ContactPerson = cp.String
		}
		if em.Valid {
			c.Email = em.String
		}
		if ph.Valid {
			c.Phone = ph.String
		}
		if ad.Valid {
			c.Address = ad.String
		}
		if ci.Valid {
			c.City = ci.String
		}
		if pr.Valid {
			c.Province = pr.String
		}
		if zp.Valid {
			c.ZipCode = zp.String
		}
		if tn.Valid {
			c.TIN = tn.String
		}
		if no.Valid {
			c.Notes = no.String
		}
		out = append(out, c)
	}
	return out, nil
}

func (r *ARRepo) GetCustomer(cid, id string) (*models.Customer, error) {
	rows, err := r.db.Query("CALL sp_get_customer(?,?)", id, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, fmt.Errorf("customer not found")
	}
	var c models.Customer
	var cp, email, phone, addr, city, prov, zip, tin, notes sql.NullString
	err = rows.Scan(&c.ID, &c.CompanyID, &c.Name, &cp, &email, &phone, &addr,
		&city, &prov, &zip, &tin, &c.PaymentTerms, &notes,
		&c.IsActive, &c.IsDeleted, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if cp.Valid {
		c.ContactPerson = cp.String
	}
	if email.Valid {
		c.Email = email.String
	}
	if phone.Valid {
		c.Phone = phone.String
	}
	if addr.Valid {
		c.Address = addr.String
	}
	if city.Valid {
		c.City = city.String
	}
	if prov.Valid {
		c.Province = prov.String
	}
	if zip.Valid {
		c.ZipCode = zip.String
	}
	if tin.Valid {
		c.TIN = tin.String
	}
	if notes.Valid {
		c.Notes = notes.String
	}
	return &c, nil
}

func (r *ARRepo) CreateCustomer(c *models.Customer) error {
	rows, err := r.db.Query("CALL sp_create_customer(?,?,?,?,?,?,?,?,?,?,?,?,?)", c.ID, c.CompanyID, c.Name, c.ContactPerson, c.Email, c.Phone, c.Address, c.City, c.Province, c.ZipCode, c.TIN, c.PaymentTerms, c.Notes)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}
func (r *ARRepo) UpdateCustomer(c *models.Customer) error {
	rows, err := r.db.Query("CALL sp_update_customer(?,?,?,?,?,?,?,?,?,?,?,?,?)", c.ID, c.CompanyID, c.Name, c.ContactPerson, c.Email, c.Phone, c.Address, c.City, c.Province, c.ZipCode, c.TIN, c.PaymentTerms, c.Notes)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}
func (r *ARRepo) DeleteCustomer(id, cid string) error {
	rows, err := r.db.Query("CALL sp_delete_customer(?,?)", id, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}
func (r *ARRepo) ToggleCustomerActive(id, cid string) error {
	rows, err := r.db.Query("CALL sp_toggle_customer_active(?,?)", id, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

// ==================== INVOICES ====================

func (r *ARRepo) GetInvoices(cid, status, custID, dateFrom, dateTo string) ([]models.Invoice, error) {
	var dfp, dtp interface{}
	if dateFrom != "" {
		dfp = dateFrom
	}
	if dateTo != "" {
		dtp = dateTo
	}
	rows, err := r.db.Query("CALL sp_get_invoices(?,?,?,?,?)", cid, status, custID, dfp, dtp)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.Invoice
	for rows.Next() {
		var inv models.Invoice
		var memo, ref, jid, ctn sql.NullString
		if err := rows.Scan(&inv.ID, &inv.CompanyID, &inv.CustomerID, &inv.InvoiceNumber, &inv.InvoiceDate, &inv.DueDate, &inv.Status, &inv.Subtotal, &inv.TaxAmount, &inv.TotalAmount, &inv.AmountPaid, &inv.BalanceDue, &memo, &ref, &jid, &inv.IsDeleted, &inv.CreatedAt, &inv.UpdatedAt, &inv.CustomerName, &ctn, &inv.ItemCount, &inv.PaymentCount); err != nil {
			return nil, fmt.Errorf("scan inv: %w", err)
		}
		if memo.Valid {
			inv.Memo = memo.String
		}
		if ref.Valid {
			inv.Reference = ref.String
		}
		if jid.Valid {
			inv.JournalID = jid.String
		}
		if ctn.Valid {
			inv.CustomerTIN = ctn.String
		}
		out = append(out, inv)
	}
	return out, nil
}

func (r *ARRepo) GetInvoice(id, cid string) (*models.Invoice, error) {
	rows, err := r.db.Query("CALL sp_get_invoice(?,?)", id, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, fmt.Errorf("not found")
	}
	var inv models.Invoice
	var memo, ref, jid, ctn sql.NullString
	if err := rows.Scan(&inv.ID, &inv.CompanyID, &inv.CustomerID, &inv.InvoiceNumber, &inv.InvoiceDate, &inv.DueDate, &inv.Status, &inv.Subtotal, &inv.TaxAmount, &inv.TotalAmount, &inv.AmountPaid, &inv.BalanceDue, &memo, &ref, &jid, &inv.IsDeleted, &inv.CreatedAt, &inv.UpdatedAt, &inv.CustomerName, &ctn); err != nil {
		return nil, err
	}
	if memo.Valid {
		inv.Memo = memo.String
	}
	if ref.Valid {
		inv.Reference = ref.String
	}
	if jid.Valid {
		inv.JournalID = jid.String
	}
	if ctn.Valid {
		inv.CustomerTIN = ctn.String
	}
	return &inv, nil
}

func (r *ARRepo) CreateInvoice(i *models.Invoice) error {
	rows, err := r.db.Query("CALL sp_create_invoice(?,?,?,?,?,?,?,?)", i.ID, i.CompanyID, i.CustomerID, i.InvoiceNumber, i.InvoiceDate, i.DueDate, i.Memo, i.Reference)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}
func (r *ARRepo) UpdateInvoice(i *models.Invoice) error {
	rows, err := r.db.Query("CALL sp_update_invoice(?,?,?,?,?,?,?,?)", i.ID, i.CompanyID, i.CustomerID, i.InvoiceNumber, i.InvoiceDate, i.DueDate, i.Memo, i.Reference)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}
func (r *ARRepo) DeleteInvoice(id, cid string) error {
	rows, err := r.db.Query("CALL sp_delete_invoice(?,?)", id, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}
func (r *ARRepo) SendInvoice(id, cid string) error {
	rows, err := r.db.Query("CALL sp_send_invoice(?,?)", id, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}
func (r *ARRepo) VoidInvoice(id, cid string) error {
	rows, err := r.db.Query("CALL sp_void_invoice(?,?)", id, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *ARRepo) GetInvoiceItems(iid, cid string) ([]models.InvoiceItem, error) {
	rows, err := r.db.Query("CALL sp_get_invoice_items(?,?)", iid, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.InvoiceItem
	for rows.Next() {
		var ii models.InvoiceItem
		var desc sql.NullString
		if err := rows.Scan(&ii.ID, &ii.InvoiceID, &ii.AccountID, &desc, &ii.Quantity, &ii.UnitPrice, &ii.Amount, &ii.TaxRate, &ii.TaxAmount, &ii.SortOrder, &ii.AccountCode, &ii.AccountName); err != nil {
			return nil, err
		}
		if desc.Valid {
			ii.Description = desc.String
		}
		out = append(out, ii)
	}
	return out, nil
}
func (r *ARRepo) AddInvoiceItem(iid, cid, aid, desc string, qty, up, amt, tr, ta float64, so int) error {
	rows, err := r.db.Query("CALL sp_add_invoice_item(?,?,?,?,?,?,?,?,?,?)", iid, cid, aid, desc, qty, up, amt, tr, ta, so)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}
func (r *ARRepo) ClearInvoiceItems(iid, cid string) error {
	rows, err := r.db.Query("CALL sp_clear_invoice_items(?,?)", iid, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}
func (r *ARRepo) UpdateInvoiceTotals(iid, cid string) error {
	rows, err := r.db.Query("CALL sp_update_invoice_totals(?,?)", iid, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *ARRepo) CreateInvoicePayment(p *models.InvoicePayment) error {
	rows, err := r.db.Query("CALL sp_create_invoice_payment(?,?,?,?,?,?,?,?,?)", p.ID, p.CompanyID, p.InvoiceID, p.PaymentDate, p.Amount, p.PaymentMethod, p.ReferenceNo, p.AccountID, p.Memo)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}
func (r *ARRepo) GetInvoicePayments(iid, cid string) ([]models.InvoicePayment, error) {
	rows, err := r.db.Query("CALL sp_get_invoice_payments(?,?)", iid, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.InvoicePayment
	for rows.Next() {
		var p models.InvoicePayment
		var rn, aid, jid, ac, an, memo sql.NullString
		if err := rows.Scan(&p.ID, &p.CompanyID, &p.InvoiceID, &p.PaymentDate, &p.Amount, &p.PaymentMethod, &rn, &aid, &jid, &memo, &p.IsDeleted, &p.CreatedAt, &ac, &an); err != nil {
			return nil, err
		}
		if rn.Valid {
			p.ReferenceNo = rn.String
		}
		if aid.Valid {
			p.AccountID = aid.String
		}
		if jid.Valid {
			p.JournalID = jid.String
		}
		if ac.Valid {
			p.AccountCode = ac.String
		}
		if an.Valid {
			p.AccountName = an.String
		}
		if memo.Valid {
			p.Memo = memo.String
		}
		out = append(out, p)
	}
	return out, nil
}
func (r *ARRepo) DeleteInvoicePayment(id, cid string) error {
	rows, err := r.db.Query("CALL sp_delete_invoice_payment(?,?)", id, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

// PayARControl returns the Accounts Receivable control account debited by an
// invoice's revenue journal, or "" if the invoice was never GL-posted.
func (r *ARRepo) PayARControl(invoiceID, cid string) (string, error) {
	rows, err := r.db.Query("CALL sp_pay_ar_control(?,?)", invoiceID, cid)
	if err != nil {
		return "", err
	}
	defer rows.Close()
	var acct sql.NullString
	if rows.Next() {
		rows.Scan(&acct)
	}
	return acct.String, nil
}

func (r *ARRepo) SetInvoicePaymentJournal(paymentID, cid, journalID string) error {
	rows, err := r.db.Query("CALL sp_set_invoice_payment_journal(?,?,?)", paymentID, cid, journalID)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}
func (r *ARRepo) GetARAging(cid string) ([]models.ARAging, error) {
	rows, err := r.db.Query("CALL sp_ar_aging(?)", cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.ARAging
	for rows.Next() {
		var a models.ARAging
		if err := rows.Scan(&a.CustomerID, &a.CustomerName, &a.InvoiceCount, &a.TotalDue, &a.CurrentDue, &a.Days1_30, &a.Days31_60, &a.Days61_90, &a.DaysOver90); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, nil
}
func (r *ARRepo) GetARSummary(cid string) (*models.ARSummary, error) {
	rows, err := r.db.Query("CALL sp_ar_summary(?)", cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var s models.ARSummary
	if rows.Next() {
		if err := rows.Scan(&s.ActiveCustomers, &s.OpenInvoices, &s.TotalReceivable, &s.TotalOverdue, &s.OverdueCount, &s.CollectedThisMonth); err != nil {
			return nil, err
		}
	}
	return &s, nil
}

// ==================== TAX ====================

type TaxRepo struct{ db *sql.DB }

func NewTaxRepo(db *sql.DB) *TaxRepo { return &TaxRepo{db: db} }

func (r *TaxRepo) TaxSummary(cid, from, to string) ([]models.TaxAccountRow, error) {
	var dfp, dtp interface{}
	if from != "" {
		dfp = from
	}
	if to != "" {
		dtp = to
	}
	rows, err := r.db.Query("CALL sp_tax_summary(?,?,?)", cid, dfp, dtp)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.TaxAccountRow
	for rows.Next() {
		var t models.TaxAccountRow
		var sub sql.NullString
		if err := rows.Scan(&t.AccountID, &t.Code, &t.Name, &t.AccountType, &sub, &t.TotalDebit, &t.TotalCredit, &t.CurrentBalance); err != nil {
			return nil, err
		}
		if sub.Valid {
			t.AccountSubtype = sub.String
		}
		out = append(out, t)
	}
	return out, nil
}
func (r *TaxRepo) TaxDetail(cid, aid, from, to string) ([]models.TaxDetail, error) {
	var dfp, dtp interface{}
	if from != "" {
		dfp = from
	}
	if to != "" {
		dtp = to
	}
	rows, err := r.db.Query("CALL sp_tax_payable_detail(?,?,?,?)", cid, aid, dfp, dtp)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.TaxDetail
	for rows.Next() {
		var t models.TaxDetail
		var memo, ld sql.NullString
		if err := rows.Scan(&t.EntryNumber, &t.EntryDate, &memo, &t.SourceType, &ld, &t.Debit, &t.Credit); err != nil {
			return nil, err
		}
		if memo.Valid {
			t.Memo = memo.String
		}
		if ld.Valid {
			t.LineDesc = ld.String
		}
		out = append(out, t)
	}
	return out, nil
}
func (r *TaxRepo) VATComputation(cid, from, to string) (*models.VATComputation, error) {
	var dfp, dtp interface{}
	if from != "" {
		dfp = from
	}
	if to != "" {
		dtp = to
	}
	rows, err := r.db.Query("CALL sp_vat_computation(?,?,?)", cid, dfp, dtp)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var v models.VATComputation
	if rows.Next() {
		if err := rows.Scan(&v.OutputVAT, &v.InputVAT); err != nil {
			return nil, err
		}
	}
	return &v, nil
}

// ==================== BANK RECON ====================

type BankRepo struct{ db *sql.DB }

func NewBankRepo(db *sql.DB) *BankRepo { return &BankRepo{db: db} }

func (r *BankRepo) GetBankAccounts(cid string) ([]models.BankAccount, error) {
	rows, err := r.db.Query("CALL sp_get_bank_accounts(?)", cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.BankAccount
	for rows.Next() {
		var a models.BankAccount
		if err := rows.Scan(&a.ID, &a.Code, &a.Name, &a.CurrentBalance); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, nil
}
func (r *BankRepo) GetBankTransactions(cid, aid string, reconciled int) ([]models.BankTransaction, error) {
	rows, err := r.db.Query("CALL sp_get_bank_transactions(?,?,?)", cid, aid, reconciled)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.BankTransaction
	for rows.Next() {
		var t models.BankTransaction
		var desc, ref, mid, sd sql.NullString
		if err := rows.Scan(&t.ID, &t.CompanyID, &t.AccountID, &t.TxnDate, &desc, &ref, &t.Amount, &t.IsReconciled, &mid, &sd, &t.IsDeleted, &t.CreatedAt); err != nil {
			return nil, err
		}
		if desc.Valid {
			t.Description = desc.String
		}
		if ref.Valid {
			t.Reference = ref.String
		}
		if mid.Valid {
			t.MatchedEntryID = mid.String
		}
		if sd.Valid {
			t.StatementDate = sd.String
		}
		out = append(out, t)
	}
	return out, nil
}
func (r *BankRepo) CreateBankTransaction(t *models.BankTransaction) error {
	rows, err := r.db.Query("CALL sp_create_bank_transaction(?,?,?,?,?,?,?,?)", t.ID, t.CompanyID, t.AccountID, t.TxnDate, t.Description, t.Reference, t.Amount, t.StatementDate)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}
func (r *BankRepo) ReconcileTransaction(id, cid, entryID string) error {
	rows, err := r.db.Query("CALL sp_reconcile_transaction(?,?,?)", id, cid, entryID)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}
func (r *BankRepo) UnreconcileTransaction(id, cid string) error {
	rows, err := r.db.Query("CALL sp_unreconcile_transaction(?,?)", id, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}
func (r *BankRepo) DeleteBankTransaction(id, cid string) error {
	rows, err := r.db.Query("CALL sp_delete_bank_transaction(?,?)", id, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}
func (r *BankRepo) GetReconSummary(cid, aid string) (*models.BankReconSummary, error) {
	rows, err := r.db.Query("CALL sp_bank_recon_summary(?,?)", cid, aid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var s models.BankReconSummary
	if rows.Next() {
		if err := rows.Scan(&s.BookBalance, &s.ReconciledTotal, &s.UnreconciledTotal, &s.UnreconciledCount, &s.TotalCount); err != nil {
			return nil, err
		}
	}
	return &s, nil
}
func (r *BankRepo) GetUnmatchedJournalLines(cid, aid string) ([]models.UnmatchedJournalLine, error) {
	rows, err := r.db.Query("CALL sp_unmatched_journal_lines(?,?)", cid, aid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.UnmatchedJournalLine
	for rows.Next() {
		var u models.UnmatchedJournalLine
		var memo, desc sql.NullString
		if err := rows.Scan(&u.LineID, &u.EntryID, &u.EntryNumber, &u.EntryDate, &memo, &desc, &u.Debit, &u.Credit, &u.NetAmount); err != nil {
			return nil, err
		}
		if memo.Valid {
			u.Memo = memo.String
		}
		if desc.Valid {
			u.Description = desc.String
		}
		out = append(out, u)
	}
	return out, nil
}

// ==================== REPORTS ====================

type ReportsRepo struct{ db *sql.DB }

func NewReportsRepo(db *sql.DB) *ReportsRepo { return &ReportsRepo{db: db} }

func (r *ReportsRepo) IncomeStatement(cid, from, to string) ([]models.ReportRow, error) {
	var dfp, dtp interface{}
	if from != "" {
		dfp = from
	}
	if to != "" {
		dtp = to
	}
	rows, err := r.db.Query("CALL sp_income_statement(?,?,?)", cid, dfp, dtp)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.ReportRow
	for rows.Next() {
		var rr models.ReportRow
		var sub sql.NullString
		if err := rows.Scan(&rr.ID, &rr.Code, &rr.Name, &rr.AccountType, &sub, &rr.NormalBalance, &rr.TotalDebit, &rr.TotalCredit, &rr.NetBalance); err != nil {
			return nil, err
		}
		if sub.Valid {
			rr.AccountSubtype = sub.String
		}
		out = append(out, rr)
	}
	return out, nil
}
func (r *ReportsRepo) BalanceSheet(cid, asOf string) ([]models.ReportRow, error) {
	var ap interface{}
	if asOf != "" {
		ap = asOf
	}
	rows, err := r.db.Query("CALL sp_balance_sheet(?,?)", cid, ap)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.ReportRow
	for rows.Next() {
		var rr models.ReportRow
		var id, sub sql.NullString
		// The synthetic "Current Year Earnings" equity line has a NULL id.
		if err := rows.Scan(&id, &rr.Code, &rr.Name, &rr.AccountType, &sub, &rr.NormalBalance, &rr.TotalDebit, &rr.TotalCredit, &rr.NetBalance); err != nil {
			return nil, err
		}
		if id.Valid {
			rr.ID = id.String
		}
		if sub.Valid {
			rr.AccountSubtype = sub.String
		}
		out = append(out, rr)
	}
	return out, nil
}
func (r *ReportsRepo) CashFlow(cid, from, to string) ([]models.CashFlowRow, error) {
	var dfp, dtp interface{}
	if from != "" {
		dfp = from
	}
	if to != "" {
		dtp = to
	}
	rows, err := r.db.Query("CALL sp_cash_flow_summary(?,?,?)", cid, dfp, dtp)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.CashFlowRow
	for rows.Next() {
		var c models.CashFlowRow
		if err := rows.Scan(&c.SourceType, &c.CashIn, &c.CashOut, &c.NetCash); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, nil
}
