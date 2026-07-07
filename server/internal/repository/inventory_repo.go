package repository

import (
	"database/sql"
	"fmt"

	"lettersheets/internal/models"
)

type InventoryRepo struct{ db *sql.DB }

func NewInventoryRepo(db *sql.DB) *InventoryRepo { return &InventoryRepo{db: db} }

// ==================== CATEGORIES ====================

func (r *InventoryRepo) GetCategories(cid string) ([]models.InvCategory, error) {
	rows, err := r.db.Query("CALL sp_inv_get_categories(?)", cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.InvCategory
	for rows.Next() {
		var c models.InvCategory
		var desc sql.NullString
		if err := rows.Scan(&c.ID, &c.CompanyID, &c.Name, &desc, &c.IsActive, &c.IsDeleted, &c.CreatedAt, &c.ProductCount); err != nil {
			return nil, fmt.Errorf("scan category: %w", err)
		}
		if desc.Valid {
			c.Description = desc.String
		}
		out = append(out, c)
	}
	return out, nil
}

func (r *InventoryRepo) CreateCategory(c *models.InvCategory) error {
	rows, err := r.db.Query("CALL sp_inv_create_category(?,?,?,?)", c.ID, c.CompanyID, c.Name, c.Description)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *InventoryRepo) UpdateCategory(c *models.InvCategory) error {
	rows, err := r.db.Query("CALL sp_inv_update_category(?,?,?,?,?)", c.ID, c.CompanyID, c.Name, c.Description, c.IsActive)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *InventoryRepo) DeleteCategory(id, cid string) error {
	rows, err := r.db.Query("CALL sp_inv_delete_category(?,?)", id, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

// ==================== WAREHOUSES ====================

func (r *InventoryRepo) GetWarehouses(cid string) ([]models.InvWarehouse, error) {
	rows, err := r.db.Query("CALL sp_inv_get_warehouses(?)", cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.InvWarehouse
	for rows.Next() {
		var w models.InvWarehouse
		var code, loc sql.NullString
		if err := rows.Scan(&w.ID, &w.CompanyID, &w.Name, &code, &loc, &w.IsDefault, &w.IsActive, &w.IsDeleted, &w.CreatedAt, &w.TotalUnits, &w.StockValue); err != nil {
			return nil, fmt.Errorf("scan warehouse: %w", err)
		}
		if code.Valid {
			w.Code = code.String
		}
		if loc.Valid {
			w.Location = loc.String
		}
		out = append(out, w)
	}
	return out, nil
}

func (r *InventoryRepo) CreateWarehouse(w *models.InvWarehouse) error {
	rows, err := r.db.Query("CALL sp_inv_create_warehouse(?,?,?,?,?,?)", w.ID, w.CompanyID, w.Name, w.Code, w.Location, w.IsDefault)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *InventoryRepo) UpdateWarehouse(w *models.InvWarehouse) error {
	rows, err := r.db.Query("CALL sp_inv_update_warehouse(?,?,?,?,?,?,?)", w.ID, w.CompanyID, w.Name, w.Code, w.Location, w.IsDefault, w.IsActive)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *InventoryRepo) DeleteWarehouse(id, cid string) error {
	rows, err := r.db.Query("CALL sp_inv_delete_warehouse(?,?)", id, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

// ==================== SUPPLIERS ====================

func (r *InventoryRepo) GetSuppliers(cid string) ([]models.InvSupplier, error) {
	rows, err := r.db.Query("CALL sp_inv_get_suppliers(?)", cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.InvSupplier
	for rows.Next() {
		var s models.InvSupplier
		var contact, email, phone, addr, notes sql.NullString
		if err := rows.Scan(&s.ID, &s.CompanyID, &s.Name, &contact, &email, &phone, &addr, &notes, &s.IsActive, &s.IsDeleted, &s.CreatedAt, &s.ProductCount); err != nil {
			return nil, fmt.Errorf("scan supplier: %w", err)
		}
		s.ContactPerson = contact.String
		s.Email = email.String
		s.Phone = phone.String
		s.Address = addr.String
		s.Notes = notes.String
		out = append(out, s)
	}
	return out, nil
}

func (r *InventoryRepo) CreateSupplier(s *models.InvSupplier) error {
	rows, err := r.db.Query("CALL sp_inv_create_supplier(?,?,?,?,?,?,?,?)", s.ID, s.CompanyID, s.Name, s.ContactPerson, s.Email, s.Phone, s.Address, s.Notes)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *InventoryRepo) UpdateSupplier(s *models.InvSupplier) error {
	rows, err := r.db.Query("CALL sp_inv_update_supplier(?,?,?,?,?,?,?,?,?)", s.ID, s.CompanyID, s.Name, s.ContactPerson, s.Email, s.Phone, s.Address, s.Notes, s.IsActive)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *InventoryRepo) DeleteSupplier(id, cid string) error {
	rows, err := r.db.Query("CALL sp_inv_delete_supplier(?,?)", id, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

// ==================== PRODUCTS ====================

func scanProduct(rows *sql.Rows, p *models.InvProduct) error {
	var desc, catID, catName, supID, supName sql.NullString
	if err := rows.Scan(
		&p.ID, &p.CompanyID, &p.SKU, &p.Name, &desc,
		&catID, &catName, &supID, &supName,
		&p.Unit, &p.CostPrice, &p.SellingPrice, &p.ReorderPoint,
		&p.IsActive, &p.IsDeleted, &p.CreatedAt, &p.UpdatedAt,
		&p.TotalStock, &p.StockValue,
	); err != nil {
		return err
	}
	p.Description = desc.String
	p.CategoryID = catID.String
	p.CategoryName = catName.String
	p.SupplierID = supID.String
	p.SupplierName = supName.String
	return nil
}

func (r *InventoryRepo) GetProducts(cid string) ([]models.InvProduct, error) {
	rows, err := r.db.Query("CALL sp_inv_get_products(?)", cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.InvProduct
	for rows.Next() {
		var p models.InvProduct
		if err := scanProduct(rows, &p); err != nil {
			return nil, fmt.Errorf("scan product: %w", err)
		}
		out = append(out, p)
	}
	return out, nil
}

func (r *InventoryRepo) GetProduct(id, cid string) (*models.InvProduct, error) {
	rows, err := r.db.Query("CALL sp_inv_get_product(?,?)", id, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, fmt.Errorf("product not found")
	}
	var p models.InvProduct
	if err := scanProduct(rows, &p); err != nil {
		return nil, fmt.Errorf("scan product: %w", err)
	}
	return &p, nil
}

func (r *InventoryRepo) GetProductStock(pid, cid string) ([]models.InvStockLevel, error) {
	rows, err := r.db.Query("CALL sp_inv_get_product_stock(?,?)", pid, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.InvStockLevel
	for rows.Next() {
		var s models.InvStockLevel
		if err := rows.Scan(&s.ProductID, &s.WarehouseID, &s.WarehouseName, &s.Quantity); err != nil {
			return nil, fmt.Errorf("scan stock: %w", err)
		}
		out = append(out, s)
	}
	return out, nil
}

func (r *InventoryRepo) CreateProduct(p *models.InvProduct) error {
	rows, err := r.db.Query("CALL sp_inv_create_product(?,?,?,?,?,?,?,?,?,?,?)",
		p.ID, p.CompanyID, p.SKU, p.Name, p.Description, p.CategoryID, p.SupplierID, p.Unit, p.CostPrice, p.SellingPrice, p.ReorderPoint)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *InventoryRepo) UpdateProduct(p *models.InvProduct) error {
	rows, err := r.db.Query("CALL sp_inv_update_product(?,?,?,?,?,?,?,?,?,?,?)",
		p.ID, p.CompanyID, p.SKU, p.Name, p.Description, p.CategoryID, p.SupplierID, p.Unit, p.CostPrice, p.SellingPrice, p.ReorderPoint)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *InventoryRepo) ToggleProductActive(id, cid string, active bool) error {
	rows, err := r.db.Query("CALL sp_inv_toggle_product_active(?,?,?)", id, cid, active)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *InventoryRepo) DeleteProduct(id, cid string) error {
	rows, err := r.db.Query("CALL sp_inv_delete_product(?,?)", id, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

// ==================== MOVEMENTS ====================

// RecordMovement records a single stock movement and returns the resulting
// balance at that warehouse. The stored procedure is transactional and refuses
// to drive stock negative.
func (r *InventoryRepo) RecordMovement(m *models.InvMovement) (float64, error) {
	rows, err := r.db.Query("CALL sp_inv_record_movement(?,?,?,?,?,?,?,?,?,?)",
		m.ID, m.CompanyID, m.ProductID, m.WarehouseID, m.MovementType, m.Quantity, m.UnitCost, m.Reference, m.Notes, m.CreatedBy)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	var bal float64
	if rows.Next() {
		rows.Scan(&bal)
	}
	return bal, nil
}

// TransferStock moves quantity of a product between two warehouses atomically.
func (r *InventoryRepo) TransferStock(idOut, idIn, cid, pid, from, to string, qty float64, ref, notes, by string) error {
	rows, err := r.db.Query("CALL sp_inv_transfer_stock(?,?,?,?,?,?,?,?,?,?)",
		idOut, idIn, cid, pid, from, to, qty, ref, notes, by)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *InventoryRepo) GetMovements(cid, pid, wid, mtype string, limit int) ([]models.InvMovement, error) {
	rows, err := r.db.Query("CALL sp_inv_get_movements(?,?,?,?,?)", cid, pid, wid, mtype, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.InvMovement
	for rows.Next() {
		var m models.InvMovement
		var prodName, prodSKU, whName, ref, notes, relWID, relWName, jid, by sql.NullString
		if err := rows.Scan(
			&m.ID, &m.CompanyID, &m.ProductID, &prodName, &prodSKU,
			&m.WarehouseID, &whName, &m.MovementType, &m.Quantity, &m.UnitCost,
			&ref, &notes, &relWID, &relWName, &m.BalanceAfter, &jid, &by, &m.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan movement: %w", err)
		}
		m.ProductName = prodName.String
		m.ProductSKU = prodSKU.String
		m.WarehouseName = whName.String
		m.Reference = ref.String
		m.Notes = notes.String
		m.RelatedWarehouseID = relWID.String
		m.RelatedWarehouseName = relWName.String
		m.JournalEntryID = jid.String
		m.CreatedBy = by.String
		out = append(out, m)
	}
	return out, nil
}

func (r *InventoryRepo) SetMovementJournal(id, cid, jid string) error {
	rows, err := r.db.Query("CALL sp_inv_set_movement_journal(?,?,?)", id, cid, jid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

// ==================== STOCK LEVELS + DASHBOARD ====================

func (r *InventoryRepo) GetStockLevels(cid, wid string) ([]models.InvStockLevel, error) {
	rows, err := r.db.Query("CALL sp_inv_get_stock_levels(?,?)", cid, wid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.InvStockLevel
	for rows.Next() {
		var s models.InvStockLevel
		if err := rows.Scan(&s.ProductID, &s.ProductSKU, &s.ProductName, &s.Unit, &s.WarehouseID, &s.WarehouseName, &s.Quantity, &s.CostPrice, &s.Value); err != nil {
			return nil, fmt.Errorf("scan stock level: %w", err)
		}
		out = append(out, s)
	}
	return out, nil
}

func (r *InventoryRepo) LowStock(cid string) ([]models.InvLowStock, error) {
	rows, err := r.db.Query("CALL sp_inv_low_stock(?)", cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.InvLowStock
	for rows.Next() {
		var l models.InvLowStock
		var catName sql.NullString
		if err := rows.Scan(&l.ID, &l.SKU, &l.Name, &l.Unit, &catName, &l.ReorderPoint, &l.TotalStock); err != nil {
			return nil, fmt.Errorf("scan low stock: %w", err)
		}
		l.CategoryName = catName.String
		out = append(out, l)
	}
	return out, nil
}

func (r *InventoryRepo) Stats(cid string) (*models.InvStats, error) {
	rows, err := r.db.Query("CALL sp_inv_stats(?)", cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var s models.InvStats
	if rows.Next() {
		if err := rows.Scan(&s.TotalProducts, &s.ActiveProducts, &s.Warehouses, &s.StockValue, &s.TotalUnits, &s.LowStock, &s.OutOfStock, &s.OpenPOs); err != nil {
			return nil, fmt.Errorf("scan stats: %w", err)
		}
	}
	return &s, nil
}

// ==================== SETTINGS ====================

func (r *InventoryRepo) GetSettings(cid string) (*models.InvSettings, error) {
	rows, err := r.db.Query("CALL sp_inv_get_settings(?)", cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	s := &models.InvSettings{CompanyID: cid}
	if rows.Next() {
		var inv, cogs, adj, pay sql.NullString
		if err := rows.Scan(&s.CompanyID, &s.AutoPostGL, &inv, &cogs, &adj, &pay); err != nil {
			return nil, fmt.Errorf("scan settings: %w", err)
		}
		s.InventoryAccountID = inv.String
		s.COGSAccountID = cogs.String
		s.AdjustmentAccountID = adj.String
		s.PayableAccountID = pay.String
	}
	return s, nil
}

func (r *InventoryRepo) UpsertSettings(s *models.InvSettings) error {
	rows, err := r.db.Query("CALL sp_inv_upsert_settings(?,?,?,?,?,?)",
		s.CompanyID, s.AutoPostGL, s.InventoryAccountID, s.COGSAccountID, s.AdjustmentAccountID, s.PayableAccountID)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

// ==================== PURCHASE ORDERS ====================

func scanPO(rows *sql.Rows, po *models.InvPurchaseOrder) error {
	var supID, supName, wID, wName, orderDate, expDate, notes, jid, by sql.NullString
	if err := rows.Scan(
		&po.ID, &po.CompanyID, &po.PONumber,
		&supID, &supName, &wID, &wName,
		&po.Status, &orderDate, &expDate, &notes, &po.TotalAmount,
		&jid, &by, &po.CreatedAt, &po.UpdatedAt, &po.ItemCount,
	); err != nil {
		return err
	}
	po.SupplierID = supID.String
	po.SupplierName = supName.String
	po.WarehouseID = wID.String
	po.WarehouseName = wName.String
	po.OrderDate = orderDate.String
	po.ExpectedDate = expDate.String
	po.Notes = notes.String
	po.JournalEntryID = jid.String
	po.CreatedBy = by.String
	return nil
}

func (r *InventoryRepo) GetPurchaseOrders(cid, status string) ([]models.InvPurchaseOrder, error) {
	rows, err := r.db.Query("CALL sp_inv_get_purchase_orders(?,?)", cid, status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.InvPurchaseOrder
	for rows.Next() {
		var po models.InvPurchaseOrder
		if err := scanPO(rows, &po); err != nil {
			return nil, fmt.Errorf("scan PO: %w", err)
		}
		out = append(out, po)
	}
	return out, nil
}

func (r *InventoryRepo) GetPurchaseOrder(id, cid string) (*models.InvPurchaseOrder, error) {
	rows, err := r.db.Query("CALL sp_inv_get_purchase_order(?,?)", id, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, fmt.Errorf("purchase order not found")
	}
	var po models.InvPurchaseOrder
	if err := scanPO(rows, &po); err != nil {
		return nil, fmt.Errorf("scan PO: %w", err)
	}
	return &po, nil
}

func (r *InventoryRepo) GetPOItems(poID, cid string) ([]models.InvPOItem, error) {
	rows, err := r.db.Query("CALL sp_inv_get_po_items(?,?)", poID, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.InvPOItem
	for rows.Next() {
		var it models.InvPOItem
		var name, sku sql.NullString
		if err := rows.Scan(&it.ID, &it.CompanyID, &it.POID, &it.ProductID, &name, &sku, &it.Quantity, &it.ReceivedQty, &it.UnitCost, &it.LineTotal); err != nil {
			return nil, fmt.Errorf("scan PO item: %w", err)
		}
		it.ProductName = name.String
		it.ProductSKU = sku.String
		out = append(out, it)
	}
	return out, nil
}

// CreatePurchaseOrder inserts a draft PO and returns its assigned number.
func (r *InventoryRepo) CreatePurchaseOrder(po *models.InvPurchaseOrder) (int, error) {
	rows, err := r.db.Query("CALL sp_inv_create_purchase_order(?,?,?,?,?,?,?,?)",
		po.ID, po.CompanyID, po.SupplierID, po.WarehouseID, nullDate(po.OrderDate), nullDate(po.ExpectedDate), po.Notes, po.CreatedBy)
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

func (r *InventoryRepo) UpdatePurchaseOrder(po *models.InvPurchaseOrder) error {
	rows, err := r.db.Query("CALL sp_inv_update_purchase_order(?,?,?,?,?,?,?)",
		po.ID, po.CompanyID, po.SupplierID, po.WarehouseID, nullDate(po.OrderDate), nullDate(po.ExpectedDate), po.Notes)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *InventoryRepo) UpdatePOStatus(id, cid, status string) error {
	rows, err := r.db.Query("CALL sp_inv_update_po_status(?,?,?)", id, cid, status)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *InventoryRepo) DeletePurchaseOrder(id, cid string) error {
	rows, err := r.db.Query("CALL sp_inv_delete_purchase_order(?,?)", id, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *InventoryRepo) AddPOItem(it *models.InvPOItem) error {
	rows, err := r.db.Query("CALL sp_inv_add_po_item(?,?,?,?,?,?)", it.ID, it.CompanyID, it.POID, it.ProductID, it.Quantity, it.UnitCost)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *InventoryRepo) DeletePOItem(id, cid string) error {
	rows, err := r.db.Query("CALL sp_inv_delete_po_item(?,?)", id, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

// ReceivePO receives all outstanding quantities on a PO into its warehouse and
// returns the total value received (for the accounting posting).
func (r *InventoryRepo) ReceivePO(poID, cid, by string) (float64, error) {
	rows, err := r.db.Query("CALL sp_inv_receive_po(?,?,?)", poID, cid, by)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	var total float64
	if rows.Next() {
		rows.Scan(&total)
	}
	return total, nil
}

func (r *InventoryRepo) SetPOJournal(id, cid, jid string) error {
	rows, err := r.db.Query("CALL sp_inv_set_po_journal(?,?,?)", id, cid, jid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

// nullDate converts an empty date string to a nil arg so MySQL stores NULL
// rather than rejecting "" for a DATE column.
func nullDate(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}
