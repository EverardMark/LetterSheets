package repository

import (
	"database/sql"
	"encoding/json"
	"fmt"

	"lettersheets/internal/models"
)

type ProcurementRepo struct{ db *sql.DB }

func NewProcurementRepo(db *sql.DB) *ProcurementRepo { return &ProcurementRepo{db: db} }

// ProcReceiveLine is one requested goods-receipt line (order item + quantity).
type ProcReceiveLine struct {
	OrderItemID string  `json:"order_item_id"`
	RecvQty     float64 `json:"recv_qty"`
}

// ProcCancelLine is a reversal line returned by sp_pur_cancel_receipt. Product
// lines carry MovementID/ProductID (stock was reversed); non-product (expense)
// lines carry ExpenseAccountID instead so Go credits the right account.
type ProcCancelLine struct {
	MovementID       string
	ProductID        string
	Quantity         float64
	UnitCost         float64
	ExpenseAccountID string
}

// ProcBilledLine is one line of the billing snapshot passed to sp_pur_mark_billed
// so qty_billed advances by the exact quantity the bill covered.
type ProcBilledLine struct {
	OrderItemID string  `json:"order_item_id"`
	BilledQty   float64 `json:"billed_qty"`
}

// ==================== SETTINGS ====================

func (r *ProcurementRepo) GetSettings(cid string) (*models.PurSettings, error) {
	rows, err := r.db.Query("CALL sp_pur_get_settings(?)", cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	s := &models.PurSettings{CompanyID: cid, DefaultPaymentTerms: 30, RequisitionApproval: true, POApproval: true}
	if rows.Next() {
		var inv, exp, grir, ap, tax, wh sql.NullString
		if err := rows.Scan(&s.CompanyID, &s.AutoPostGL, &inv, &exp, &grir, &ap, &tax, &wh, &s.DefaultPaymentTerms, &s.RequisitionApproval, &s.POApproval); err != nil {
			return nil, fmt.Errorf("scan pur settings: %w", err)
		}
		s.InventoryAccountID = inv.String
		s.ExpenseAccountID = exp.String
		s.GRIRAccountID = grir.String
		s.APAccountID = ap.String
		s.TaxInputAccountID = tax.String
		s.DefaultWarehouseID = wh.String
	}
	return s, nil
}

func (r *ProcurementRepo) UpsertSettings(s *models.PurSettings) error {
	rows, err := r.db.Query("CALL sp_pur_upsert_settings(?,?,?,?,?,?,?,?,?,?,?)",
		s.CompanyID, s.AutoPostGL, s.InventoryAccountID, s.ExpenseAccountID, s.GRIRAccountID, s.APAccountID,
		s.TaxInputAccountID, s.DefaultWarehouseID, s.DefaultPaymentTerms, s.RequisitionApproval, s.POApproval)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

// ==================== REQUISITIONS ====================

func scanRequisition(rows *sql.Rows, q *models.PurRequisition) error {
	var title, dept, needed, notes, convPO, reject, by sql.NullString
	if err := rows.Scan(&q.ID, &q.CompanyID, &q.RequisitionNumber, &title, &dept, &q.Status, &needed,
		&q.EstimatedTotal, &notes, &convPO, &reject, &by, &q.CreatedAt, &q.UpdatedAt, &q.ItemCount); err != nil {
		return err
	}
	q.Title = title.String
	q.Department = dept.String
	q.NeededBy = needed.String
	q.Notes = notes.String
	q.ConvertedPOID = convPO.String
	q.RejectReason = reject.String
	q.CreatedBy = by.String
	return nil
}

func (r *ProcurementRepo) GetRequisitions(cid, status string) ([]models.PurRequisition, error) {
	rows, err := r.db.Query("CALL sp_pur_get_requisitions(?,?)", cid, status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.PurRequisition
	for rows.Next() {
		var q models.PurRequisition
		if err := scanRequisition(rows, &q); err != nil {
			return nil, fmt.Errorf("scan requisition: %w", err)
		}
		out = append(out, q)
	}
	return out, nil
}

func (r *ProcurementRepo) GetRequisition(id, cid string) (*models.PurRequisition, error) {
	rows, err := r.db.Query("CALL sp_pur_get_requisition(?,?)", id, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, fmt.Errorf("requisition not found")
	}
	var q models.PurRequisition
	if err := scanRequisition(rows, &q); err != nil {
		return nil, fmt.Errorf("scan requisition: %w", err)
	}
	return &q, nil
}

func (r *ProcurementRepo) GetRequisitionItems(rid, cid string) ([]models.PurRequisitionItem, error) {
	rows, err := r.db.Query("CALL sp_pur_get_requisition_items(?,?)", rid, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.PurRequisitionItem
	for rows.Next() {
		var it models.PurRequisitionItem
		var pid, name, sku, desc sql.NullString
		if err := rows.Scan(&it.ID, &it.CompanyID, &it.RequisitionID, &pid, &name, &sku, &desc, &it.Quantity, &it.EstimatedPrice, &it.LineTotal, &it.SortOrder); err != nil {
			return nil, fmt.Errorf("scan requisition item: %w", err)
		}
		it.ProductID = pid.String
		it.ProductName = name.String
		it.ProductSKU = sku.String
		it.Description = desc.String
		out = append(out, it)
	}
	return out, nil
}

func (r *ProcurementRepo) CreateRequisition(q *models.PurRequisition, by string) (int, error) {
	rows, err := r.db.Query("CALL sp_pur_create_requisition(?,?,?,?,?,?,?)",
		q.ID, q.CompanyID, q.Title, q.Department, nullDate(q.NeededBy), q.Notes, by)
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

func (r *ProcurementRepo) AddRequisitionItem(it *models.PurRequisitionItem) error {
	rows, err := r.db.Query("CALL sp_pur_add_requisition_item(?,?,?,?,?,?,?,?)",
		it.ID, it.CompanyID, it.RequisitionID, it.ProductID, it.Description, it.Quantity, it.EstimatedPrice, it.SortOrder)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *ProcurementRepo) ClearRequisitionItems(rid, cid string) error {
	rows, err := r.db.Query("CALL sp_pur_clear_requisition_items(?,?)", rid, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *ProcurementRepo) UpdateRequisition(q *models.PurRequisition) error {
	rows, err := r.db.Query("CALL sp_pur_update_requisition(?,?,?,?,?,?)",
		q.ID, q.CompanyID, q.Title, q.Department, nullDate(q.NeededBy), q.Notes)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *ProcurementRepo) UpdateRequisitionTotals(rid, cid string) error {
	rows, err := r.db.Query("CALL sp_pur_update_requisition_totals(?,?)", rid, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *ProcurementRepo) SubmitRequisition(id, cid string) error {
	rows, err := r.db.Query("CALL sp_pur_submit_requisition(?,?)", id, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *ProcurementRepo) ApproveRequisition(id, cid, by string) error {
	rows, err := r.db.Query("CALL sp_pur_approve_requisition(?,?,?)", id, cid, by)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *ProcurementRepo) RejectRequisition(id, cid, by, reason string) error {
	rows, err := r.db.Query("CALL sp_pur_reject_requisition(?,?,?,?)", id, cid, by, reason)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *ProcurementRepo) DeleteRequisition(id, cid string) error {
	rows, err := r.db.Query("CALL sp_pur_delete_requisition(?,?)", id, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *ProcurementRepo) ConvertRequisition(newOrderID, cid, rid, vendorID, by string) (int, error) {
	rows, err := r.db.Query("CALL sp_pur_convert_requisition(?,?,?,?,?)", newOrderID, cid, rid, vendorID, by)
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

// ==================== ORDERS ====================

func scanPurOrder(rows *sql.Rows, o *models.PurOrder) error {
	var vName, reqID, whID, whName, orderDate, expDate, notes sql.NullString
	if err := rows.Scan(&o.ID, &o.CompanyID, &o.PONumber, &o.VendorID, &vName, &reqID, &whID, &whName,
		&o.Status, &orderDate, &expDate, &o.Subtotal, &o.TaxAmount, &o.TotalAmount, &notes, &o.BillSeq,
		&o.CreatedAt, &o.UpdatedAt, &o.ItemCount); err != nil {
		return err
	}
	o.VendorName = vName.String
	o.RequisitionID = reqID.String
	o.WarehouseID = whID.String
	o.WarehouseName = whName.String
	o.OrderDate = orderDate.String
	o.ExpectedDate = expDate.String
	o.Notes = notes.String
	return nil
}

func (r *ProcurementRepo) GetOrders(cid, status, vendorID string) ([]models.PurOrder, error) {
	rows, err := r.db.Query("CALL sp_pur_get_orders(?,?,?)", cid, status, vendorID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.PurOrder
	for rows.Next() {
		var o models.PurOrder
		if err := scanPurOrder(rows, &o); err != nil {
			return nil, fmt.Errorf("scan pur order: %w", err)
		}
		out = append(out, o)
	}
	return out, nil
}

func (r *ProcurementRepo) GetOrder(id, cid string) (*models.PurOrder, error) {
	rows, err := r.db.Query("CALL sp_pur_get_order(?,?)", id, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, fmt.Errorf("order not found")
	}
	var o models.PurOrder
	if err := scanPurOrder(rows, &o); err != nil {
		return nil, fmt.Errorf("scan pur order: %w", err)
	}
	return &o, nil
}

func (r *ProcurementRepo) GetOrderItems(oid, cid string) ([]models.PurOrderItem, error) {
	rows, err := r.db.Query("CALL sp_pur_get_order_items(?,?)", oid, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.PurOrderItem
	for rows.Next() {
		var it models.PurOrderItem
		var pid, name, sku, desc, whID, whName, expAcct sql.NullString
		if err := rows.Scan(&it.ID, &it.CompanyID, &it.OrderID, &pid, &name, &sku, &desc, &it.Quantity, &it.UnitPrice,
			&it.DiscountPct, &it.TaxRate, &it.QtyReceived, &it.QtyBilled, &it.QtyOutstanding, &it.QtyBillable,
			&it.LineTotal, &whID, &whName, &expAcct, &it.SortOrder); err != nil {
			return nil, fmt.Errorf("scan pur order item: %w", err)
		}
		it.ProductID = pid.String
		it.ProductName = name.String
		it.ProductSKU = sku.String
		it.Description = desc.String
		it.WarehouseID = whID.String
		it.WarehouseName = whName.String
		it.ExpenseAccountID = expAcct.String
		out = append(out, it)
	}
	return out, nil
}

func (r *ProcurementRepo) CreateOrder(o *models.PurOrder, by string) (int, error) {
	rows, err := r.db.Query("CALL sp_pur_create_order(?,?,?,?,?,?,?,?)",
		o.ID, o.CompanyID, o.VendorID, nullDate(o.OrderDate), nullDate(o.ExpectedDate), o.WarehouseID, o.Notes, by)
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

func (r *ProcurementRepo) AddOrderItem(it *models.PurOrderItem) error {
	rows, err := r.db.Query("CALL sp_pur_add_order_item(?,?,?,?,?,?,?,?,?,?,?,?)",
		it.ID, it.CompanyID, it.OrderID, it.ProductID, it.Description, it.Quantity, it.UnitPrice, it.DiscountPct, it.TaxRate, it.WarehouseID, it.ExpenseAccountID, it.SortOrder)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *ProcurementRepo) ClearOrderItems(oid, cid string) error {
	rows, err := r.db.Query("CALL sp_pur_clear_order_items(?,?)", oid, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *ProcurementRepo) UpdateOrder(o *models.PurOrder) error {
	rows, err := r.db.Query("CALL sp_pur_update_order(?,?,?,?,?,?,?)",
		o.ID, o.CompanyID, o.VendorID, nullDate(o.OrderDate), nullDate(o.ExpectedDate), o.WarehouseID, o.Notes)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *ProcurementRepo) UpdateOrderTotals(oid, cid string) error {
	rows, err := r.db.Query("CALL sp_pur_update_order_totals(?,?)", oid, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *ProcurementRepo) ApproveOrder(oid, cid, by string) error {
	rows, err := r.db.Query("CALL sp_pur_approve_order(?,?,?)", oid, cid, by)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *ProcurementRepo) CancelOrder(oid, cid string) error {
	rows, err := r.db.Query("CALL sp_pur_cancel_order(?,?)", oid, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *ProcurementRepo) CloseOrder(oid, cid string) error {
	rows, err := r.db.Query("CALL sp_pur_close_order(?,?)", oid, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *ProcurementRepo) DeleteOrder(oid, cid string) error {
	rows, err := r.db.Query("CALL sp_pur_delete_order(?,?)", oid, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

// ==================== RECEIPTS ====================

func (r *ProcurementRepo) GetReceipts(cid, oid string) ([]models.PurReceipt, error) {
	rows, err := r.db.Query("CALL sp_pur_get_receipts(?,?)", cid, oid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.PurReceipt
	for rows.Next() {
		var rc models.PurReceipt
		var ponum sql.NullInt64
		var whID, whName, rDate, notes, jid sql.NullString
		if err := rows.Scan(&rc.ID, &rc.CompanyID, &rc.ReceiptNumber, &rc.OrderID, &ponum, &whID, &whName,
			&rc.Status, &rDate, &notes, &jid, &rc.CreatedAt, &rc.ItemCount); err != nil {
			return nil, fmt.Errorf("scan receipt: %w", err)
		}
		rc.PONumber = int(ponum.Int64)
		rc.WarehouseID = whID.String
		rc.WarehouseName = whName.String
		rc.ReceiptDate = rDate.String
		rc.Notes = notes.String
		rc.JournalEntryID = jid.String
		out = append(out, rc)
	}
	return out, nil
}

func (r *ProcurementRepo) GetReceiptItems(sid, cid string) ([]models.PurReceiptItem, error) {
	rows, err := r.db.Query("CALL sp_pur_get_receipt_items(?,?)", sid, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.PurReceiptItem
	for rows.Next() {
		var it models.PurReceiptItem
		var pid, name, sku, mid, expAcct sql.NullString
		if err := rows.Scan(&it.ID, &it.CompanyID, &it.ReceiptID, &it.OrderItemID, &pid, &name, &sku, &it.Quantity, &it.UnitCost, &mid, &expAcct); err != nil {
			return nil, fmt.Errorf("scan receipt item: %w", err)
		}
		it.ProductID = pid.String
		it.ProductName = name.String
		it.ProductSKU = sku.String
		it.MovementID = mid.String
		it.ExpenseAccountID = expAcct.String
		out = append(out, it)
	}
	return out, nil
}

func (r *ProcurementRepo) GetReceivable(oid, cid string) ([]models.PurReceivable, error) {
	rows, err := r.db.Query("CALL sp_pur_get_receivable(?,?)", oid, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.PurReceivable
	for rows.Next() {
		var l models.PurReceivable
		var pid, name, desc, whID sql.NullString
		if err := rows.Scan(&l.OrderItemID, &pid, &name, &desc, &l.OutstandingQty, &l.UnitPrice, &l.DiscountPct, &whID); err != nil {
			return nil, fmt.Errorf("scan receivable: %w", err)
		}
		l.ProductID = pid.String
		l.ProductName = name.String
		l.Description = desc.String
		l.WarehouseID = whID.String
		out = append(out, l)
	}
	return out, nil
}

// Receive records a goods receipt atomically (stock + movement + counters, receipt
// number generated inside the SP). lines is the requested per-item receive qty.
func (r *ProcurementRepo) Receive(receiptID, cid, oid, by, wid, receiptDate, notes string, lines []ProcReceiveLine) error {
	linesJSON, _ := json.Marshal(lines)
	rows, err := r.db.Query("CALL sp_pur_receive(?,?,?,?,?,?,?,?)",
		receiptID, cid, oid, by, wid, nullDate(receiptDate), notes, string(linesJSON))
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *ProcurementRepo) SetReceiptJournal(receiptID, cid, jid string) error {
	rows, err := r.db.Query("CALL sp_pur_set_receipt_journal(?,?,?)", receiptID, cid, jid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

// CancelReceipt reverses a receipt and returns the reversal movements so the caller
// can post the GR/IR reversal (Dr GR-IR / Cr Inventory).
func (r *ProcurementRepo) CancelReceipt(sid, cid, by string) ([]ProcCancelLine, error) {
	rows, err := r.db.Query("CALL sp_pur_cancel_receipt(?,?,?)", sid, cid, by)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ProcCancelLine
	for rows.Next() {
		var l ProcCancelLine
		var mid, pid, exp sql.NullString
		if err := rows.Scan(&mid, &pid, &l.Quantity, &l.UnitCost, &exp); err != nil {
			return nil, fmt.Errorf("scan cancel line: %w", err)
		}
		l.MovementID = mid.String
		l.ProductID = pid.String
		l.ExpenseAccountID = exp.String
		out = append(out, l)
	}
	return out, nil
}

// ==================== BILLING (3-way match) ====================

func (r *ProcurementRepo) GetBillable(oid, cid string) ([]models.PurBillable, error) {
	rows, err := r.db.Query("CALL sp_pur_get_billable(?,?)", oid, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.PurBillable
	for rows.Next() {
		var l models.PurBillable
		var pid, name, desc, expAcct sql.NullString
		if err := rows.Scan(&l.OrderItemID, &pid, &name, &desc, &l.BillableQty, &l.UnitPrice, &l.DiscountPct, &l.TaxRate, &expAcct); err != nil {
			return nil, fmt.Errorf("scan billable: %w", err)
		}
		l.ProductID = pid.String
		l.ProductName = name.String
		l.Description = desc.String
		l.ExpenseAccountID = expAcct.String
		out = append(out, l)
	}
	return out, nil
}

// MarkBilled advances qty_billed under the order lock by the exact per-line
// quantities the bill covered; returns the count of lines that were billed (0 if a
// concurrent bill already billed them).
func (r *ProcurementRepo) MarkBilled(oid, cid, billID, journalID string, lines []ProcBilledLine) (int, error) {
	linesJSON, _ := json.Marshal(lines)
	rows, err := r.db.Query("CALL sp_pur_mark_billed(?,?,?,?,?)", oid, cid, billID, journalID, string(linesJSON))
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	var count, seq int
	if rows.Next() {
		rows.Scan(&count, &seq)
	}
	return count, nil
}

func (r *ProcurementRepo) SetBillJournal(billID, cid, jid string) error {
	rows, err := r.db.Query("CALL sp_pur_set_bill_journal(?,?,?)", billID, cid, jid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

// ==================== DASHBOARD ====================

func (r *ProcurementRepo) Stats(cid string) (*models.PurStats, error) {
	rows, err := r.db.Query("CALL sp_pur_stats(?)", cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var s models.PurStats
	if rows.Next() {
		if err := rows.Scan(&s.TotalOrders, &s.OpenOrders, &s.PendingRequisitions, &s.AwaitingReqApproval,
			&s.AwaitingReceipt, &s.AwaitingBill, &s.TotalVendors, &s.OpenPOValue, &s.ReceivedThisMonth); err != nil {
			return nil, fmt.Errorf("scan pur stats: %w", err)
		}
	}
	return &s, nil
}
