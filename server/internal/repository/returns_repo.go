package repository

import (
	"database/sql"
	"fmt"

	"lettersheets/internal/models"
)

type ReturnsRepo struct{ db *sql.DB }

func NewReturnsRepo(db *sql.DB) *ReturnsRepo { return &ReturnsRepo{db: db} }

// ReturnPostLine is a goods line returned by sp_*_post — the caller posts the
// COGS/scrap (AR) or GR-IR (AP) reversal from it.
type ReturnPostLine struct {
	ItemID           string
	ProductID        string
	Quantity         float64
	UnitCost         float64
	Restock          bool   // AR only
	ExpenseAccountID string // AP only
	MovementID       string
}

// ReturnVoidLine is a reversal movement returned by sp_*_void.
type ReturnVoidLine struct {
	MovementID    string
	ProductID     string
	Quantity      float64
	UnitCost      float64
	LineJournalID string
}

func scanCreditableLine(rows *sql.Rows, isAR bool) (models.ReturnCreditableLine, error) {
	var l models.ReturnCreditableLine
	var pid, name, desc, acct, wh sql.NullString
	var qtyBilled, qtyRet sql.NullFloat64
	if isAR {
		// order_item_id, product_id, product_name, description, qty_invoiced, qty_returned, creditable_qty, unit_price, tax_rate, revenue_account_id, warehouse_id, unit_cost
		if err := rows.Scan(&l.OrderItemID, &pid, &name, &desc, &qtyBilled, &qtyRet, &l.CreditableQty, &l.UnitPrice, &l.TaxRate, &acct, &wh, &l.UnitCost); err != nil {
			return l, err
		}
		l.RevenueAccountID = acct.String
	} else {
		// order_item_id, product_id, product_name, description, qty_billed, qty_returned, returnable_qty, tax_rate, expense_account_id, warehouse_id, unit_cost
		if err := rows.Scan(&l.OrderItemID, &pid, &name, &desc, &qtyBilled, &qtyRet, &l.CreditableQty, &l.TaxRate, &acct, &wh, &l.UnitCost); err != nil {
			return l, err
		}
		l.ExpenseAccountID = acct.String
	}
	l.ProductID = pid.String
	l.ProductName = name.String
	l.Description = desc.String
	l.WarehouseID = wh.String
	return l, nil
}

// ==================== AR CREDIT MEMOS ====================

func (r *ReturnsRepo) CMCreditable(orderID, cid string) ([]models.ReturnCreditableLine, error) {
	rows, err := r.db.Query("CALL sp_ar_cm_creditable(?,?)", orderID, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.ReturnCreditableLine
	for rows.Next() {
		l, err := scanCreditableLine(rows, true)
		if err != nil {
			return nil, fmt.Errorf("scan creditable: %w", err)
		}
		out = append(out, l)
	}
	return out, nil
}

func (r *ReturnsRepo) CreateCreditMemo(id, cid, orderID, invoiceID, memoDate, reason, warehouseID, by string) (int, error) {
	rows, err := r.db.Query("CALL sp_ar_cm_create(?,?,?,?,?,?,?,?)", id, cid, orderID, invoiceID, nullDate(memoDate), reason, warehouseID, by)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	var num int
	if rows.Next() {
		rows.Scan(&num)
	}
	return num, nil
}

func (r *ReturnsRepo) AddCreditMemoItem(id, cid, memoID, orderItemID, desc string, qty, unitPrice, taxRate, unitCost float64, restock bool, sort int) error {
	rows, err := r.db.Query("CALL sp_ar_cm_add_item(?,?,?,?,?,?,?,?,?,?,?)", id, cid, memoID, orderItemID, desc, qty, unitPrice, taxRate, unitCost, restock, sort)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *ReturnsRepo) ClearCreditMemoItems(memoID, cid string) error {
	return r.exec("CALL sp_ar_cm_clear_items(?,?)", memoID, cid)
}

func (r *ReturnsRepo) UpdateCreditMemoTotals(memoID, cid string) error {
	return r.exec("CALL sp_ar_cm_update_totals(?,?)", memoID, cid)
}

func (r *ReturnsRepo) DeleteCreditMemo(id, cid string) error {
	return r.exec("CALL sp_ar_cm_delete(?,?)", id, cid)
}

func (r *ReturnsRepo) ARControl(orderID, cid string) (string, error) {
	rows, err := r.db.Query("CALL sp_ar_cm_ar_control(?,?)", orderID, cid)
	if err != nil {
		return "", err
	}
	defer rows.Close()
	var a sql.NullString
	if rows.Next() {
		rows.Scan(&a)
	}
	return a.String, nil
}

func (r *ReturnsRepo) PostCreditMemo(id, cid, by string) ([]ReturnPostLine, error) {
	rows, err := r.db.Query("CALL sp_ar_cm_post(?,?,?)", id, cid, by)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ReturnPostLine
	for rows.Next() {
		var l ReturnPostLine
		var pid, mid sql.NullString
		if err := rows.Scan(&l.ItemID, &pid, &l.Quantity, &l.UnitCost, &l.Restock, &mid); err != nil {
			return nil, fmt.Errorf("scan post line: %w", err)
		}
		l.ProductID = pid.String
		l.MovementID = mid.String
		out = append(out, l)
	}
	return out, nil
}

func (r *ReturnsRepo) SetCMRevenueJournal(id, cid, jid string) error {
	return r.exec("CALL sp_ar_cm_set_revenue_journal(?,?,?)", id, cid, jid)
}
func (r *ReturnsRepo) SetCMLineJournal(itemID, cid, jid string) error {
	return r.exec("CALL sp_ar_cm_set_line_journal(?,?,?)", itemID, cid, jid)
}
func (r *ReturnsRepo) ApplyCreditMemo(id, cid, invoiceID string, amount float64) error {
	return r.exec("CALL sp_ar_cm_apply(?,?,?,?)", id, cid, invoiceID, amount)
}

func (r *ReturnsRepo) RefundCreditMemo(id, cid, jid string) (float64, error) {
	rows, err := r.db.Query("CALL sp_ar_cm_refund(?,?,?)", id, cid, jid)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	var amt float64
	if rows.Next() {
		rows.Scan(&amt)
	}
	return amt, nil
}

func (r *ReturnsRepo) VoidCreditMemo(id, cid, by string) ([]ReturnVoidLine, error) {
	return r.scanVoid("CALL sp_ar_cm_void(?,?,?)", id, cid, by)
}

func scanCreditMemo(rows *sql.Rows) (models.CreditMemo, error) {
	var m models.CreditMemo
	var custName, invID, memoDate, reason, wh sql.NullString
	var onum sql.NullInt64
	if err := rows.Scan(&m.ID, &m.CompanyID, &m.MemoNumber, &m.CustomerID, &custName, &m.OrderID, &onum,
		&invID, &m.Status, &memoDate, &reason, &m.Subtotal, &m.TaxAmount, &m.TotalAmount,
		&m.AmountApplied, &m.AmountRefunded, &m.BalanceCredit, &wh, &m.CreatedAt, &m.UpdatedAt, &m.ItemCount); err != nil {
		return m, err
	}
	m.CustomerName = custName.String
	m.OrderNumber = int(onum.Int64)
	m.InvoiceID = invID.String
	m.MemoDate = memoDate.String
	m.Reason = reason.String
	m.WarehouseID = wh.String
	return m, nil
}

func (r *ReturnsRepo) ListCreditMemos(cid, status string) ([]models.CreditMemo, error) {
	rows, err := r.db.Query("CALL sp_ar_cm_list(?,?)", cid, status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.CreditMemo
	for rows.Next() {
		m, err := scanCreditMemo(rows)
		if err != nil {
			return nil, fmt.Errorf("scan credit memo: %w", err)
		}
		out = append(out, m)
	}
	return out, nil
}

func (r *ReturnsRepo) GetCreditMemo(id, cid string) (*models.CreditMemo, error) {
	rows, err := r.db.Query("CALL sp_ar_cm_get(?,?)", id, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, fmt.Errorf("credit memo not found")
	}
	m, err := scanCreditMemo(rows)
	if err != nil {
		return nil, fmt.Errorf("scan credit memo: %w", err)
	}
	return &m, nil
}

func (r *ReturnsRepo) GetCreditMemoItems(memoID, cid string) ([]models.CreditMemoItem, error) {
	rows, err := r.db.Query("CALL sp_ar_cm_get_items(?,?)", memoID, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.CreditMemoItem
	for rows.Next() {
		var it models.CreditMemoItem
		var oi, pid, name, desc, wh, mid, jid sql.NullString
		if err := rows.Scan(&it.ID, &it.CompanyID, &it.CreditMemoID, &oi, &pid, &name, &desc, &it.Quantity,
			&it.UnitPrice, &it.Amount, &it.TaxRate, &it.TaxAmount, &it.Restock, &it.UnitCost, &wh, &mid, &jid, &it.SortOrder); err != nil {
			return nil, fmt.Errorf("scan credit memo item: %w", err)
		}
		it.OrderItemID = oi.String
		it.ProductID = pid.String
		it.ProductName = name.String
		it.Description = desc.String
		it.WarehouseID = wh.String
		it.MovementID = mid.String
		it.JournalEntryID = jid.String
		out = append(out, it)
	}
	return out, nil
}

func (r *ReturnsRepo) CMOpenCredits(cid string) ([]models.ReturnOpenCredit, error) {
	return r.scanOpenCredits("CALL sp_ar_cm_open_credits(?)", cid)
}
func (r *ReturnsRepo) CMStats(cid string) (*models.ReturnStats, error) {
	return r.scanStats("CALL sp_ar_cm_stats(?)", cid)
}

// ==================== AP DEBIT MEMOS ====================

func (r *ReturnsRepo) DMCreditable(orderID, cid string) ([]models.ReturnCreditableLine, error) {
	rows, err := r.db.Query("CALL sp_ap_dm_creditable(?,?)", orderID, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.ReturnCreditableLine
	for rows.Next() {
		l, err := scanCreditableLine(rows, false)
		if err != nil {
			return nil, fmt.Errorf("scan returnable: %w", err)
		}
		out = append(out, l)
	}
	return out, nil
}

func (r *ReturnsRepo) CreateDebitMemo(id, cid, orderID, billID, memoDate, reason, warehouseID, by string) (int, error) {
	rows, err := r.db.Query("CALL sp_ap_dm_create(?,?,?,?,?,?,?,?)", id, cid, orderID, billID, nullDate(memoDate), reason, warehouseID, by)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	var num int
	if rows.Next() {
		rows.Scan(&num)
	}
	return num, nil
}

func (r *ReturnsRepo) AddDebitMemoItem(id, cid, memoID, orderItemID, desc string, qty, unitCost, taxRate float64, sort int) error {
	return r.exec("CALL sp_ap_dm_add_item(?,?,?,?,?,?,?,?,?)", id, cid, memoID, orderItemID, desc, qty, unitCost, taxRate, sort)
}
func (r *ReturnsRepo) ClearDebitMemoItems(memoID, cid string) error {
	return r.exec("CALL sp_ap_dm_clear_items(?,?)", memoID, cid)
}
func (r *ReturnsRepo) UpdateDebitMemoTotals(memoID, cid string) error {
	return r.exec("CALL sp_ap_dm_update_totals(?,?)", memoID, cid)
}
func (r *ReturnsRepo) DeleteDebitMemo(id, cid string) error {
	return r.exec("CALL sp_ap_dm_delete(?,?)", id, cid)
}

func (r *ReturnsRepo) APControl(billID, cid string) (string, error) {
	rows, err := r.db.Query("CALL sp_ap_dm_ap_control(?,?)", billID, cid)
	if err != nil {
		return "", err
	}
	defer rows.Close()
	var a sql.NullString
	if rows.Next() {
		rows.Scan(&a)
	}
	return a.String, nil
}

func (r *ReturnsRepo) PostDebitMemo(id, cid, by string) ([]ReturnPostLine, error) {
	rows, err := r.db.Query("CALL sp_ap_dm_post(?,?,?)", id, cid, by)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ReturnPostLine
	for rows.Next() {
		var l ReturnPostLine
		var pid, exp, mid sql.NullString
		if err := rows.Scan(&l.ItemID, &pid, &l.Quantity, &l.UnitCost, &exp, &mid); err != nil {
			return nil, fmt.Errorf("scan post line: %w", err)
		}
		l.ProductID = pid.String
		l.ExpenseAccountID = exp.String
		l.MovementID = mid.String
		out = append(out, l)
	}
	return out, nil
}

func (r *ReturnsRepo) SetDMPayableJournal(id, cid, jid string) error {
	return r.exec("CALL sp_ap_dm_set_payable_journal(?,?,?)", id, cid, jid)
}
func (r *ReturnsRepo) SetDMLineJournal(itemID, cid, jid string) error {
	return r.exec("CALL sp_ap_dm_set_line_journal(?,?,?)", itemID, cid, jid)
}
func (r *ReturnsRepo) ApplyDebitMemo(id, cid, billID string, amount float64) error {
	return r.exec("CALL sp_ap_dm_apply(?,?,?,?)", id, cid, billID, amount)
}

func (r *ReturnsRepo) RefundDebitMemo(id, cid, jid string) (float64, error) {
	rows, err := r.db.Query("CALL sp_ap_dm_refund(?,?,?)", id, cid, jid)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	var amt float64
	if rows.Next() {
		rows.Scan(&amt)
	}
	return amt, nil
}

func (r *ReturnsRepo) VoidDebitMemo(id, cid, by string) ([]ReturnVoidLine, error) {
	return r.scanVoid("CALL sp_ap_dm_void(?,?,?)", id, cid, by)
}

func scanDebitMemo(rows *sql.Rows) (models.DebitMemo, error) {
	var m models.DebitMemo
	var vName, billID, memoDate, reason, wh sql.NullString
	var ponum sql.NullInt64
	if err := rows.Scan(&m.ID, &m.CompanyID, &m.MemoNumber, &m.VendorID, &vName, &m.OrderID, &ponum,
		&billID, &m.Status, &memoDate, &reason, &m.Subtotal, &m.TaxAmount, &m.TotalAmount,
		&m.AmountApplied, &m.AmountRefunded, &m.BalanceDebit, &wh, &m.CreatedAt, &m.UpdatedAt, &m.ItemCount); err != nil {
		return m, err
	}
	m.VendorName = vName.String
	m.PONumber = int(ponum.Int64)
	m.BillID = billID.String
	m.MemoDate = memoDate.String
	m.Reason = reason.String
	m.WarehouseID = wh.String
	return m, nil
}

func (r *ReturnsRepo) ListDebitMemos(cid, status string) ([]models.DebitMemo, error) {
	rows, err := r.db.Query("CALL sp_ap_dm_list(?,?)", cid, status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.DebitMemo
	for rows.Next() {
		m, err := scanDebitMemo(rows)
		if err != nil {
			return nil, fmt.Errorf("scan debit memo: %w", err)
		}
		out = append(out, m)
	}
	return out, nil
}

func (r *ReturnsRepo) GetDebitMemo(id, cid string) (*models.DebitMemo, error) {
	rows, err := r.db.Query("CALL sp_ap_dm_get(?,?)", id, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, fmt.Errorf("debit memo not found")
	}
	m, err := scanDebitMemo(rows)
	if err != nil {
		return nil, fmt.Errorf("scan debit memo: %w", err)
	}
	return &m, nil
}

func (r *ReturnsRepo) GetDebitMemoItems(memoID, cid string) ([]models.DebitMemoItem, error) {
	rows, err := r.db.Query("CALL sp_ap_dm_get_items(?,?)", memoID, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.DebitMemoItem
	for rows.Next() {
		var it models.DebitMemoItem
		var oi, pid, name, desc, exp, wh, mid, jid sql.NullString
		if err := rows.Scan(&it.ID, &it.CompanyID, &it.DebitMemoID, &oi, &pid, &name, &desc, &it.Quantity,
			&it.UnitCost, &it.Amount, &it.TaxRate, &it.TaxAmount, &exp, &wh, &mid, &jid, &it.SortOrder); err != nil {
			return nil, fmt.Errorf("scan debit memo item: %w", err)
		}
		it.OrderItemID = oi.String
		it.ProductID = pid.String
		it.ProductName = name.String
		it.Description = desc.String
		it.ExpenseAccountID = exp.String
		it.WarehouseID = wh.String
		it.MovementID = mid.String
		it.JournalEntryID = jid.String
		out = append(out, it)
	}
	return out, nil
}

func (r *ReturnsRepo) DMOpenCredits(cid string) ([]models.ReturnOpenCredit, error) {
	return r.scanOpenCredits("CALL sp_ap_dm_open_credits(?)", cid)
}
func (r *ReturnsRepo) DMStats(cid string) (*models.ReturnStats, error) {
	return r.scanStats("CALL sp_ap_dm_stats(?)", cid)
}

// ==================== shared helpers ====================

func (r *ReturnsRepo) exec(q string, args ...interface{}) error {
	rows, err := r.db.Query(q, args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *ReturnsRepo) scanVoid(q, id, cid, by string) ([]ReturnVoidLine, error) {
	rows, err := r.db.Query(q, id, cid, by)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ReturnVoidLine
	for rows.Next() {
		var l ReturnVoidLine
		var mid, pid, jid sql.NullString
		if err := rows.Scan(&mid, &pid, &l.Quantity, &l.UnitCost, &jid); err != nil {
			return nil, fmt.Errorf("scan void line: %w", err)
		}
		l.MovementID = mid.String
		l.ProductID = pid.String
		l.LineJournalID = jid.String
		out = append(out, l)
	}
	return out, nil
}

func (r *ReturnsRepo) scanOpenCredits(q, cid string) ([]models.ReturnOpenCredit, error) {
	rows, err := r.db.Query(q, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.ReturnOpenCredit
	for rows.Next() {
		var o models.ReturnOpenCredit
		var name sql.NullString
		if err := rows.Scan(&o.PartyID, &name, &o.MemoCount, &o.OpenAmount); err != nil {
			return nil, fmt.Errorf("scan open credit: %w", err)
		}
		o.PartyName = name.String
		out = append(out, o)
	}
	return out, nil
}

func (r *ReturnsRepo) scanStats(q, cid string) (*models.ReturnStats, error) {
	rows, err := r.db.Query(q, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var s models.ReturnStats
	if rows.Next() {
		if err := rows.Scan(&s.TotalMemos, &s.DraftMemos, &s.OpenBalance, &s.AmountThisMonth); err != nil {
			return nil, err
		}
	}
	return &s, nil
}
