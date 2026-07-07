package repository

import (
	"database/sql"
	"encoding/json"
	"fmt"

	"lettersheets/internal/models"
)

type SalesRepo struct{ db *sql.DB }

func NewSalesRepo(db *sql.DB) *SalesRepo { return &SalesRepo{db: db} }

// SOFulfillLine is one requested shipment line (order item + quantity).
type SOFulfillLine struct {
	OrderItemID string  `json:"order_item_id"`
	ShipQty     float64 `json:"ship_qty"`
}

// SOUninvoicedLine is a billable line returned by sp_so_get_uninvoiced.
type SOUninvoicedLine struct {
	OrderItemID      string
	ProductID        string
	ProductName      string
	Description      string
	BillableQty      float64
	UnitPrice        float64
	DiscountPct      float64
	TaxRate          float64
	RevenueAccountID string
}

// SOCancelLine is a reversal movement returned by sp_so_cancel_shipment.
type SOCancelLine struct {
	MovementID string
	ProductID  string
	Quantity   float64
	UnitCost   float64
}

// ==================== SETTINGS ====================

func (r *SalesRepo) GetSettings(cid string) (*models.SOSettings, error) {
	rows, err := r.db.Query("CALL sp_so_get_settings(?)", cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	s := &models.SOSettings{CompanyID: cid, DefaultPaymentTerms: 30, QuoteValidDays: 30}
	if rows.Next() {
		var rev, ar, tax, wh, pl sql.NullString
		if err := rows.Scan(&s.CompanyID, &s.AutoPostGL, &s.AutoInvoiceOnFulfill, &rev, &ar, &tax, &wh, &pl, &s.DefaultPaymentTerms, &s.QuoteValidDays); err != nil {
			return nil, fmt.Errorf("scan so settings: %w", err)
		}
		s.DefaultRevenueAccountID = rev.String
		s.ARAccountID = ar.String
		s.TaxPayableAccountID = tax.String
		s.DefaultWarehouseID = wh.String
		s.DefaultPriceListID = pl.String
	}
	return s, nil
}

func (r *SalesRepo) UpsertSettings(s *models.SOSettings) error {
	rows, err := r.db.Query("CALL sp_so_upsert_settings(?,?,?,?,?,?,?,?,?,?)",
		s.CompanyID, s.AutoPostGL, s.AutoInvoiceOnFulfill, s.DefaultRevenueAccountID, s.ARAccountID, s.TaxPayableAccountID,
		s.DefaultWarehouseID, s.DefaultPriceListID, s.DefaultPaymentTerms, s.QuoteValidDays)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

// ==================== HELPERS ====================

func (r *SalesRepo) ResolvePrice(cid, customerID, productID string, qty float64, priceListID string) (float64, error) {
	rows, err := r.db.Query("CALL sp_so_resolve_price(?,?,?,?,?)", cid, customerID, productID, qty, priceListID)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	var price float64
	if rows.Next() {
		rows.Scan(&price)
	}
	return price, nil
}

func (r *SalesRepo) CheckAvailability(cid, productID, warehouseID string) (float64, float64, float64, error) {
	rows, err := r.db.Query("CALL sp_so_check_availability(?,?,?)", cid, productID, warehouseID)
	if err != nil {
		return 0, 0, 0, err
	}
	defer rows.Close()
	var avail, onHand, reserved float64
	if rows.Next() {
		rows.Scan(&avail, &onHand, &reserved)
	}
	return avail, onHand, reserved, nil
}

// ==================== PRICE LISTS ====================

func (r *SalesRepo) GetPriceLists(cid string) ([]models.SOPriceList, error) {
	rows, err := r.db.Query("CALL sp_so_get_price_lists(?)", cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.SOPriceList
	for rows.Next() {
		var pl models.SOPriceList
		var custID, custName, tier, vFrom, vTo sql.NullString
		if err := rows.Scan(&pl.ID, &pl.CompanyID, &pl.Name, &custID, &custName, &tier, &pl.IsDefault, &vFrom, &vTo, &pl.IsActive, &pl.CreatedAt, &pl.ItemCount); err != nil {
			return nil, fmt.Errorf("scan price list: %w", err)
		}
		pl.CustomerID = custID.String
		pl.CustomerName = custName.String
		pl.Tier = tier.String
		pl.ValidFrom = vFrom.String
		pl.ValidTo = vTo.String
		out = append(out, pl)
	}
	return out, nil
}

func (r *SalesRepo) GetPriceListItems(plid, cid string) ([]models.SOPriceListItem, error) {
	rows, err := r.db.Query("CALL sp_so_get_price_list_items(?,?)", plid, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.SOPriceListItem
	for rows.Next() {
		var it models.SOPriceListItem
		var name, sku sql.NullString
		if err := rows.Scan(&it.ID, &it.CompanyID, &it.PriceListID, &it.ProductID, &name, &sku, &it.MinQty, &it.UnitPrice, &it.DiscountPct); err != nil {
			return nil, fmt.Errorf("scan price list item: %w", err)
		}
		it.ProductName = name.String
		it.ProductSKU = sku.String
		out = append(out, it)
	}
	return out, nil
}

func (r *SalesRepo) CreatePriceList(pl *models.SOPriceList) error {
	rows, err := r.db.Query("CALL sp_so_create_price_list(?,?,?,?,?,?,?,?)",
		pl.ID, pl.CompanyID, pl.Name, pl.CustomerID, pl.Tier, pl.IsDefault, nullDate(pl.ValidFrom), nullDate(pl.ValidTo))
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *SalesRepo) UpdatePriceList(pl *models.SOPriceList) error {
	rows, err := r.db.Query("CALL sp_so_update_price_list(?,?,?,?,?,?,?,?,?)",
		pl.ID, pl.CompanyID, pl.Name, pl.CustomerID, pl.Tier, pl.IsDefault, nullDate(pl.ValidFrom), nullDate(pl.ValidTo), pl.IsActive)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *SalesRepo) DeletePriceList(id, cid string) error {
	rows, err := r.db.Query("CALL sp_so_delete_price_list(?,?)", id, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *SalesRepo) AddPriceListItem(it *models.SOPriceListItem) error {
	rows, err := r.db.Query("CALL sp_so_add_price_list_item(?,?,?,?,?,?,?)", it.ID, it.CompanyID, it.PriceListID, it.ProductID, it.MinQty, it.UnitPrice, it.DiscountPct)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *SalesRepo) DeletePriceListItem(id, cid string) error {
	rows, err := r.db.Query("CALL sp_so_delete_price_list_item(?,?)", id, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

// ==================== QUOTES ====================

func scanQuote(rows *sql.Rows, q *models.SOQuote) error {
	var custName, plID, quoteDate, validUntil, notes, convOID sql.NullString
	if err := rows.Scan(&q.ID, &q.CompanyID, &q.QuoteNumber, &q.CustomerID, &custName, &plID, &q.Status,
		&quoteDate, &validUntil, &q.Subtotal, &q.DiscountPct, &q.DiscountAmount, &q.TaxAmount, &q.TotalAmount,
		&notes, &convOID, &q.CreatedAt, &q.UpdatedAt, &q.ItemCount); err != nil {
		return err
	}
	q.CustomerName = custName.String
	q.PriceListID = plID.String
	q.QuoteDate = quoteDate.String
	q.ValidUntil = validUntil.String
	q.Notes = notes.String
	q.ConvertedOrderID = convOID.String
	return nil
}

func (r *SalesRepo) GetQuotes(cid, status string) ([]models.SOQuote, error) {
	rows, err := r.db.Query("CALL sp_so_get_quotes(?,?)", cid, status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.SOQuote
	for rows.Next() {
		var q models.SOQuote
		if err := scanQuote(rows, &q); err != nil {
			return nil, fmt.Errorf("scan quote: %w", err)
		}
		out = append(out, q)
	}
	return out, nil
}

func (r *SalesRepo) GetQuote(id, cid string) (*models.SOQuote, error) {
	rows, err := r.db.Query("CALL sp_so_get_quote(?,?)", id, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, fmt.Errorf("quote not found")
	}
	var q models.SOQuote
	if err := scanQuote(rows, &q); err != nil {
		return nil, fmt.Errorf("scan quote: %w", err)
	}
	return &q, nil
}

func (r *SalesRepo) GetQuoteItems(qid, cid string) ([]models.SOQuoteItem, error) {
	rows, err := r.db.Query("CALL sp_so_get_quote_items(?,?)", qid, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.SOQuoteItem
	for rows.Next() {
		var it models.SOQuoteItem
		var pid, name, sku, desc sql.NullString
		if err := rows.Scan(&it.ID, &it.CompanyID, &it.QuoteID, &pid, &name, &sku, &desc, &it.Quantity, &it.UnitPrice, &it.DiscountPct, &it.TaxRate, &it.LineTotal, &it.SortOrder); err != nil {
			return nil, fmt.Errorf("scan quote item: %w", err)
		}
		it.ProductID = pid.String
		it.ProductName = name.String
		it.ProductSKU = sku.String
		it.Description = desc.String
		out = append(out, it)
	}
	return out, nil
}

func (r *SalesRepo) CreateQuote(q *models.SOQuote, by string) (int, error) {
	rows, err := r.db.Query("CALL sp_so_create_quote(?,?,?,?,?,?,?,?,?)",
		q.ID, q.CompanyID, q.CustomerID, nullDate(q.QuoteDate), nullDate(q.ValidUntil), q.PriceListID, q.DiscountPct, q.Notes, by)
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

func (r *SalesRepo) AddQuoteItem(it *models.SOQuoteItem) error {
	rows, err := r.db.Query("CALL sp_so_add_quote_item(?,?,?,?,?,?,?,?,?,?)",
		it.ID, it.CompanyID, it.QuoteID, it.ProductID, it.Description, it.Quantity, it.UnitPrice, it.DiscountPct, it.TaxRate, it.SortOrder)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *SalesRepo) ClearQuoteItems(qid, cid string) error {
	rows, err := r.db.Query("CALL sp_so_clear_quote_items(?,?)", qid, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *SalesRepo) UpdateQuote(q *models.SOQuote) error {
	rows, err := r.db.Query("CALL sp_so_update_quote(?,?,?,?,?,?,?,?)",
		q.ID, q.CompanyID, q.CustomerID, nullDate(q.QuoteDate), nullDate(q.ValidUntil), q.PriceListID, q.DiscountPct, q.Notes)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *SalesRepo) UpdateQuoteTotals(qid, cid string) error {
	rows, err := r.db.Query("CALL sp_so_update_quote_totals(?,?)", qid, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *SalesRepo) UpdateQuoteStatus(id, cid, status string) error {
	rows, err := r.db.Query("CALL sp_so_update_quote_status(?,?,?)", id, cid, status)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *SalesRepo) DeleteQuote(id, cid string) error {
	rows, err := r.db.Query("CALL sp_so_delete_quote(?,?)", id, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *SalesRepo) ConvertQuote(newOrderID, cid, qid, by string) (int, error) {
	rows, err := r.db.Query("CALL sp_so_convert_quote(?,?,?,?)", newOrderID, cid, qid, by)
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

func scanOrder(rows *sql.Rows, o *models.SOOrder) error {
	var custName, quoteID, plID, whID, whName, orderDate, expDate, notes, invID, revJID sql.NullString
	if err := rows.Scan(&o.ID, &o.CompanyID, &o.OrderNumber, &o.CustomerID, &custName, &quoteID, &plID,
		&whID, &whName, &o.Status, &orderDate, &expDate, &o.Subtotal, &o.DiscountPct, &o.DiscountAmount,
		&o.TaxAmount, &o.TotalAmount, &notes, &invID, &revJID, &o.CreatedAt, &o.UpdatedAt, &o.ItemCount, &o.InvoiceSeq); err != nil {
		return err
	}
	o.CustomerName = custName.String
	o.QuoteID = quoteID.String
	o.PriceListID = plID.String
	o.WarehouseID = whID.String
	o.WarehouseName = whName.String
	o.OrderDate = orderDate.String
	o.ExpectedShipDate = expDate.String
	o.Notes = notes.String
	o.InvoiceID = invID.String
	o.RevenueJournalID = revJID.String
	return nil
}

func (r *SalesRepo) GetOrders(cid, status, custID string) ([]models.SOOrder, error) {
	rows, err := r.db.Query("CALL sp_so_get_orders(?,?,?)", cid, status, custID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.SOOrder
	for rows.Next() {
		var o models.SOOrder
		if err := scanOrder(rows, &o); err != nil {
			return nil, fmt.Errorf("scan order: %w", err)
		}
		out = append(out, o)
	}
	return out, nil
}

func (r *SalesRepo) GetOrder(id, cid string) (*models.SOOrder, error) {
	rows, err := r.db.Query("CALL sp_so_get_order(?,?)", id, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, fmt.Errorf("order not found")
	}
	var o models.SOOrder
	if err := scanOrder(rows, &o); err != nil {
		return nil, fmt.Errorf("scan order: %w", err)
	}
	return &o, nil
}

func (r *SalesRepo) GetOrderItems(oid, cid string) ([]models.SOOrderItem, error) {
	rows, err := r.db.Query("CALL sp_so_get_order_items(?,?)", oid, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.SOOrderItem
	for rows.Next() {
		var it models.SOOrderItem
		var pid, name, sku, desc, whID, whName, revAcct sql.NullString
		if err := rows.Scan(&it.ID, &it.CompanyID, &it.OrderID, &pid, &name, &sku, &desc, &it.Quantity, &it.UnitPrice,
			&it.DiscountPct, &it.TaxRate, &it.QtyReserved, &it.QtyFulfilled, &it.QtyInvoiced, &it.QtyBackordered,
			&it.LineTotal, &whID, &whName, &revAcct, &it.SortOrder, &it.AvailableQty); err != nil {
			return nil, fmt.Errorf("scan order item: %w", err)
		}
		it.ProductID = pid.String
		it.ProductName = name.String
		it.ProductSKU = sku.String
		it.Description = desc.String
		it.WarehouseID = whID.String
		it.WarehouseName = whName.String
		it.RevenueAccountID = revAcct.String
		out = append(out, it)
	}
	return out, nil
}

func (r *SalesRepo) CreateOrder(o *models.SOOrder, by string) (int, error) {
	rows, err := r.db.Query("CALL sp_so_create_order(?,?,?,?,?,?,?,?,?,?)",
		o.ID, o.CompanyID, o.CustomerID, nullDate(o.OrderDate), nullDate(o.ExpectedShipDate), o.PriceListID, o.WarehouseID, o.DiscountPct, o.Notes, by)
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

func (r *SalesRepo) AddOrderItem(it *models.SOOrderItem) error {
	rows, err := r.db.Query("CALL sp_so_add_order_item(?,?,?,?,?,?,?,?,?,?,?,?)",
		it.ID, it.CompanyID, it.OrderID, it.ProductID, it.Description, it.Quantity, it.UnitPrice, it.DiscountPct, it.TaxRate, it.WarehouseID, it.RevenueAccountID, it.SortOrder)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *SalesRepo) ClearOrderItems(oid, cid string) error {
	rows, err := r.db.Query("CALL sp_so_clear_order_items(?,?)", oid, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *SalesRepo) UpdateOrder(o *models.SOOrder) error {
	rows, err := r.db.Query("CALL sp_so_update_order(?,?,?,?,?,?,?,?,?)",
		o.ID, o.CompanyID, o.CustomerID, nullDate(o.OrderDate), nullDate(o.ExpectedShipDate), o.PriceListID, o.WarehouseID, o.DiscountPct, o.Notes)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *SalesRepo) UpdateOrderTotals(oid, cid string) error {
	rows, err := r.db.Query("CALL sp_so_update_order_totals(?,?)", oid, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *SalesRepo) ConfirmOrder(oid, cid, by string) error {
	rows, err := r.db.Query("CALL sp_so_confirm_order(?,?,?)", oid, cid, by)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *SalesRepo) CancelOrder(oid, cid string) error {
	rows, err := r.db.Query("CALL sp_so_cancel_order(?,?)", oid, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *SalesRepo) CloseOrder(oid, cid string) error {
	rows, err := r.db.Query("CALL sp_so_close_order(?,?)", oid, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *SalesRepo) DeleteOrder(oid, cid string) error {
	rows, err := r.db.Query("CALL sp_so_delete_order(?,?)", oid, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *SalesRepo) GetReservations(cid, oid string) ([]models.SOReservation, error) {
	rows, err := r.db.Query("CALL sp_so_get_reservations(?,?)", cid, oid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.SOReservation
	for rows.Next() {
		var rv models.SOReservation
		var name, whName sql.NullString
		if err := rows.Scan(&rv.ID, &rv.CompanyID, &rv.OrderID, &rv.OrderItemID, &rv.ProductID, &name, &rv.WarehouseID, &whName, &rv.QtyReserved, &rv.Status); err != nil {
			return nil, fmt.Errorf("scan reservation: %w", err)
		}
		rv.ProductName = name.String
		rv.WarehouseName = whName.String
		out = append(out, rv)
	}
	return out, nil
}

func (r *SalesRepo) GetBackorders(cid string) ([]models.SOBackorder, error) {
	rows, err := r.db.Query("CALL sp_so_get_backorders(?)", cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.SOBackorder
	for rows.Next() {
		var b models.SOBackorder
		var custID, custName, pid, name, sku sql.NullString
		if err := rows.Scan(&b.OrderID, &b.OrderNumber, &custID, &custName, &b.Status, &b.OrderItemID, &pid, &name, &sku, &b.Quantity, &b.QtyFulfilled, &b.QtyBackordered); err != nil {
			return nil, fmt.Errorf("scan backorder: %w", err)
		}
		b.CustomerID = custID.String
		b.CustomerName = custName.String
		b.ProductID = pid.String
		b.ProductName = name.String
		b.ProductSKU = sku.String
		out = append(out, b)
	}
	return out, nil
}

// ==================== SHIPMENTS ====================

func (r *SalesRepo) GetShipments(cid, oid string) ([]models.SOShipment, error) {
	rows, err := r.db.Query("CALL sp_so_get_shipments(?,?)", cid, oid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.SOShipment
	for rows.Next() {
		var s models.SOShipment
		var onum sql.NullInt64
		var whID, whName, carrier, tracking, shipDate, delivered, notes sql.NullString
		if err := rows.Scan(&s.ID, &s.CompanyID, &s.ShipmentNumber, &s.OrderID, &onum, &whID, &whName, &s.Status,
			&carrier, &tracking, &shipDate, &delivered, &notes, &s.CreatedAt, &s.ItemCount); err != nil {
			return nil, fmt.Errorf("scan shipment: %w", err)
		}
		s.OrderNumber = int(onum.Int64)
		s.WarehouseID = whID.String
		s.WarehouseName = whName.String
		s.Carrier = carrier.String
		s.TrackingNumber = tracking.String
		s.ShipDate = shipDate.String
		s.DeliveredDate = delivered.String
		s.Notes = notes.String
		out = append(out, s)
	}
	return out, nil
}

func (r *SalesRepo) GetShipmentItems(sid, cid string) ([]models.SOShipmentItem, error) {
	rows, err := r.db.Query("CALL sp_so_get_shipment_items(?,?)", sid, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.SOShipmentItem
	for rows.Next() {
		var it models.SOShipmentItem
		var pid, name, sku, mid, jid sql.NullString
		if err := rows.Scan(&it.ID, &it.CompanyID, &it.ShipmentID, &it.OrderItemID, &pid, &name, &sku, &it.Quantity, &mid, &jid); err != nil {
			return nil, fmt.Errorf("scan shipment item: %w", err)
		}
		it.ProductID = pid.String
		it.ProductName = name.String
		it.ProductSKU = sku.String
		it.MovementID = mid.String
		it.JournalEntryID = jid.String
		out = append(out, it)
	}
	return out, nil
}

// Fulfill records a shipment atomically (stock + movement + counters, shipment
// number generated inside the SP). lines is the requested per-item ship qty.
func (r *SalesRepo) Fulfill(shipID, cid, oid, by, wid, carrier, tracking, shipDate, notes string, lines []SOFulfillLine) error {
	linesJSON, _ := json.Marshal(lines)
	rows, err := r.db.Query("CALL sp_so_fulfill(?,?,?,?,?,?,?,?,?,?)",
		shipID, cid, oid, by, wid, carrier, tracking, nullDate(shipDate), notes, string(linesJSON))
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *SalesRepo) SetShipmentItemJournal(movementID, cid, jid string) error {
	rows, err := r.db.Query("CALL sp_so_set_shipment_item_journal(?,?,?)", movementID, cid, jid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *SalesRepo) MarkShipmentDelivered(sid, cid, date string) error {
	rows, err := r.db.Query("CALL sp_so_mark_shipment_delivered(?,?,?)", sid, cid, nullDate(date))
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

// CancelShipment reverses a shipment and returns the reversal movements so the
// caller can post the COGS reversal.
func (r *SalesRepo) CancelShipment(sid, cid, by string) ([]SOCancelLine, error) {
	rows, err := r.db.Query("CALL sp_so_cancel_shipment(?,?,?)", sid, cid, by)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SOCancelLine
	for rows.Next() {
		var l SOCancelLine
		if err := rows.Scan(&l.MovementID, &l.ProductID, &l.Quantity, &l.UnitCost); err != nil {
			return nil, fmt.Errorf("scan cancel line: %w", err)
		}
		out = append(out, l)
	}
	return out, nil
}

// ==================== INVOICING ====================

func (r *SalesRepo) GetUninvoiced(oid, cid string) ([]SOUninvoicedLine, error) {
	rows, err := r.db.Query("CALL sp_so_get_uninvoiced(?,?)", oid, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SOUninvoicedLine
	for rows.Next() {
		var l SOUninvoicedLine
		var pid, name, desc, revAcct sql.NullString
		if err := rows.Scan(&l.OrderItemID, &pid, &name, &desc, &l.BillableQty, &l.UnitPrice, &l.DiscountPct, &l.TaxRate, &revAcct); err != nil {
			return nil, fmt.Errorf("scan uninvoiced: %w", err)
		}
		l.ProductID = pid.String
		l.ProductName = name.String
		l.Description = desc.String
		l.RevenueAccountID = revAcct.String
		out = append(out, l)
	}
	return out, nil
}

// MarkInvoiced advances qty_invoiced under the order lock; returns the count of
// lines that were invoiced (0 if a concurrent invoice already billed them).
func (r *SalesRepo) MarkInvoiced(oid, cid, invoiceID, journalID string) (int, error) {
	rows, err := r.db.Query("CALL sp_so_mark_invoiced(?,?,?,?)", oid, cid, invoiceID, journalID)
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

// ==================== DASHBOARD ====================

func (r *SalesRepo) Stats(cid string) (*models.SOStats, error) {
	rows, err := r.db.Query("CALL sp_so_stats(?)", cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var s models.SOStats
	if rows.Next() {
		if err := rows.Scan(&s.TotalOrders, &s.OpenOrders, &s.DraftQuotes, &s.BackordersPending, &s.TotalCustomers, &s.OpenOrderValue, &s.RevenueThisMonth); err != nil {
			return nil, fmt.Errorf("scan so stats: %w", err)
		}
	}
	return &s, nil
}
