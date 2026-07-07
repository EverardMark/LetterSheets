package repository

import (
	"database/sql"
	"fmt"

	"lettersheets/internal/models"
)

type FixedAssetsRepo struct{ db *sql.DB }

func NewFixedAssetsRepo(db *sql.DB) *FixedAssetsRepo { return &FixedAssetsRepo{db: db} }

// FARunLine is one depreciation entry joined with its resolved GL accounts,
// used by the handler to group and post consolidated journal entries.
type FARunLine struct {
	ID        string
	AssetID   string
	Amount    float64
	ExpAcct   string
	AccumAcct string
}

// ==================== CATEGORIES ====================

func (r *FixedAssetsRepo) GetCategories(cid string) ([]models.FACategory, error) {
	rows, err := r.db.Query("CALL sp_fa_get_categories(?)", cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.FACategory
	for rows.Next() {
		var c models.FACategory
		var desc, assetAcct, accumAcct, expAcct sql.NullString
		var life sql.NullInt64
		if err := rows.Scan(&c.ID, &c.CompanyID, &c.Name, &desc, &assetAcct, &accumAcct, &expAcct, &life, &c.DefaultMethod, &c.DefaultSalvagePct, &c.IsActive, &c.IsDeleted, &c.CreatedAt, &c.AssetCount); err != nil {
			return nil, fmt.Errorf("scan fa category: %w", err)
		}
		c.Description = desc.String
		c.AssetAccountID = assetAcct.String
		c.AccumDepAccountID = accumAcct.String
		c.DepExpenseAccountID = expAcct.String
		c.DefaultLifeMonths = int(life.Int64)
		out = append(out, c)
	}
	return out, nil
}

func (r *FixedAssetsRepo) CreateCategory(c *models.FACategory) error {
	rows, err := r.db.Query("CALL sp_fa_create_category(?,?,?,?,?,?,?,?,?,?)",
		c.ID, c.CompanyID, c.Name, c.Description, c.AssetAccountID, c.AccumDepAccountID, c.DepExpenseAccountID, c.DefaultLifeMonths, c.DefaultMethod, c.DefaultSalvagePct)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *FixedAssetsRepo) UpdateCategory(c *models.FACategory) error {
	rows, err := r.db.Query("CALL sp_fa_update_category(?,?,?,?,?,?,?,?,?,?,?)",
		c.ID, c.CompanyID, c.Name, c.Description, c.AssetAccountID, c.AccumDepAccountID, c.DepExpenseAccountID, c.DefaultLifeMonths, c.DefaultMethod, c.DefaultSalvagePct, c.IsActive)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *FixedAssetsRepo) DeleteCategory(id, cid string) error {
	rows, err := r.db.Query("CALL sp_fa_delete_category(?,?)", id, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

// ==================== ASSETS ====================

func scanAsset(rows *sql.Rows, a *models.FAAsset) error {
	var desc, catID, catName, inService, lastDep, dept, loc, custID, custName, serial, assetAcct, accumAcct, expAcct, acqJID, disposed, notes sql.NullString
	if err := rows.Scan(
		&a.ID, &a.CompanyID, &a.AssetNumber, &a.Name, &desc,
		&catID, &catName, &a.AcquisitionCost, &a.AcquisitionDate, &inService, &a.UsefulLifeMonths,
		&a.SalvageValue, &a.DepreciationMethod, &a.Status,
		&a.AccumulatedDepreciation, &a.NetBookValue, &a.PeriodsDepreciated, &lastDep,
		&dept, &loc, &custID, &custName, &serial, &assetAcct, &accumAcct, &expAcct,
		&acqJID, &disposed, &notes, &a.CreatedAt, &a.UpdatedAt,
	); err != nil {
		return err
	}
	a.Description = desc.String
	a.CategoryID = catID.String
	a.CategoryName = catName.String
	a.InServiceDate = inService.String
	a.LastDepreciationDate = lastDep.String
	a.Department = dept.String
	a.Location = loc.String
	a.CustodianID = custID.String
	a.CustodianName = custName.String
	a.SerialNumber = serial.String
	a.AssetAccountID = assetAcct.String
	a.AccumDepAccountID = accumAcct.String
	a.DepExpenseAccountID = expAcct.String
	a.AcquisitionJournalID = acqJID.String
	a.DisposedDate = disposed.String
	a.Notes = notes.String
	return nil
}

func (r *FixedAssetsRepo) GetAssets(cid, status, cat string) ([]models.FAAsset, error) {
	rows, err := r.db.Query("CALL sp_fa_get_assets(?,?,?)", cid, status, cat)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.FAAsset
	for rows.Next() {
		var a models.FAAsset
		if err := scanAsset(rows, &a); err != nil {
			return nil, fmt.Errorf("scan fa asset: %w", err)
		}
		out = append(out, a)
	}
	return out, nil
}

func (r *FixedAssetsRepo) GetAsset(id, cid string) (*models.FAAsset, error) {
	rows, err := r.db.Query("CALL sp_fa_get_asset(?,?)", id, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, fmt.Errorf("asset not found")
	}
	var a models.FAAsset
	if err := scanAsset(rows, &a); err != nil {
		return nil, fmt.Errorf("scan fa asset: %w", err)
	}
	return &a, nil
}

// CreateAsset inserts an asset and returns its assigned formatted asset number.
func (r *FixedAssetsRepo) CreateAsset(a *models.FAAsset, by string) (string, error) {
	rows, err := r.db.Query("CALL sp_fa_create_asset(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
		a.ID, a.CompanyID, a.Name, a.Description, a.CategoryID, a.AcquisitionCost, nullDate(a.AcquisitionDate), nullDate(a.InServiceDate),
		a.UsefulLifeMonths, a.SalvageValue, a.DepreciationMethod, a.Department, a.Location, a.CustodianID, a.SerialNumber,
		a.AssetAccountID, a.AccumDepAccountID, a.DepExpenseAccountID, by)
	if err != nil {
		return "", err
	}
	defer rows.Close()
	var numInt int
	var numStr string
	if rows.Next() {
		rows.Scan(&numInt, &numStr)
	}
	return numStr, nil
}

func (r *FixedAssetsRepo) UpdateAsset(a *models.FAAsset) error {
	rows, err := r.db.Query("CALL sp_fa_update_asset(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
		a.ID, a.CompanyID, a.Name, a.Description, a.CategoryID, a.AcquisitionCost, nullDate(a.AcquisitionDate), nullDate(a.InServiceDate),
		a.UsefulLifeMonths, a.SalvageValue, a.DepreciationMethod, a.Department, a.Location, a.CustodianID, a.SerialNumber,
		a.AssetAccountID, a.AccumDepAccountID, a.DepExpenseAccountID)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *FixedAssetsRepo) DeleteAsset(id, cid string) error {
	rows, err := r.db.Query("CALL sp_fa_delete_asset(?,?)", id, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *FixedAssetsRepo) SetAssetJournal(id, cid, jid string) error {
	rows, err := r.db.Query("CALL sp_fa_set_asset_journal(?,?,?)", id, cid, jid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

// ==================== DEPRECIATION ====================

func scanDepEntry(rows *sql.Rows, e *models.FADepreciationEntry) error {
	var runID, jid sql.NullString
	if err := rows.Scan(&e.ID, &e.CompanyID, &e.AssetID, &e.Period, &e.PeriodIndex, &e.Method,
		&e.OpeningNBV, &e.Amount, &e.AccumulatedAfter, &e.ClosingNBV, &runID, &jid, &e.IsPosted, &e.IsVoided, &e.CreatedAt); err != nil {
		return err
	}
	e.RunID = runID.String
	e.JournalEntryID = jid.String
	return nil
}

func (r *FixedAssetsRepo) GetDepreciationSchedule(aid, cid string) ([]models.FADepreciationEntry, error) {
	rows, err := r.db.Query("CALL sp_fa_get_depreciation_schedule(?,?)", aid, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.FADepreciationEntry
	for rows.Next() {
		var e models.FADepreciationEntry
		if err := scanDepEntry(rows, &e); err != nil {
			return nil, fmt.Errorf("scan fa dep entry: %w", err)
		}
		out = append(out, e)
	}
	return out, nil
}

func (r *FixedAssetsRepo) GetRuns(cid string) ([]models.FADepreciationRun, error) {
	rows, err := r.db.Query("CALL sp_fa_get_runs(?)", cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.FADepreciationRun
	for rows.Next() {
		var run models.FADepreciationRun
		var jid, by sql.NullString
		if err := rows.Scan(&run.ID, &run.CompanyID, &run.Period, &run.AssetCount, &run.TotalAmount, &jid, &run.IsVoided, &by, &run.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan fa run: %w", err)
		}
		run.JournalEntryID = jid.String
		run.RunBy = by.String
		out = append(out, run)
	}
	return out, nil
}

// RunDepreciation executes the monthly run and returns the canonical run id,
// the number of assets depreciated, and the batch total.
func (r *FixedAssetsRepo) RunDepreciation(runID, cid, period, by string) (string, int, float64, error) {
	rows, err := r.db.Query("CALL sp_fa_run_depreciation(?,?,?,?)", runID, cid, period, by)
	if err != nil {
		return "", 0, 0, err
	}
	defer rows.Close()
	var canonical string
	var count int
	var total float64
	if rows.Next() {
		rows.Scan(&canonical, &count, &total)
	}
	return canonical, count, total, nil
}

func (r *FixedAssetsRepo) GetRunEntries(runID, cid string) ([]FARunLine, error) {
	rows, err := r.db.Query("CALL sp_fa_get_run_entries(?,?)", runID, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []FARunLine
	for rows.Next() {
		var l FARunLine
		var exp, accum sql.NullString
		if err := rows.Scan(&l.ID, &l.AssetID, &l.Amount, &exp, &accum); err != nil {
			return nil, fmt.Errorf("scan fa run line: %w", err)
		}
		l.ExpAcct = exp.String
		l.AccumAcct = accum.String
		out = append(out, l)
	}
	return out, nil
}

func (r *FixedAssetsRepo) SetRunJournal(runID, cid, jid string) error {
	rows, err := r.db.Query("CALL sp_fa_set_run_journal(?,?,?)", runID, cid, jid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

// VoidRun reverses a run's entries and returns the total amount reversed.
func (r *FixedAssetsRepo) VoidRun(runID, cid string) (float64, error) {
	rows, err := r.db.Query("CALL sp_fa_void_run(?,?)", runID, cid)
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

// ==================== DISPOSALS ====================

// CreateDisposal disposes the asset and returns (cost, accumulatedDep, bookValue, gainLoss).
func (r *FixedAssetsRepo) CreateDisposal(d *models.FADisposal, by string) (float64, float64, float64, float64, error) {
	rows, err := r.db.Query("CALL sp_fa_create_disposal(?,?,?,?,?,?,?,?,?,?)",
		d.ID, d.CompanyID, d.AssetID, nullDate(d.DisposalDate), d.DisposalType, d.Proceeds, d.Buyer, d.Reference, d.Notes, by)
	if err != nil {
		return 0, 0, 0, 0, err
	}
	defer rows.Close()
	var cost, accum, book, gain float64
	if rows.Next() {
		rows.Scan(&cost, &accum, &book, &gain)
	}
	return cost, accum, book, gain, nil
}

func (r *FixedAssetsRepo) GetDisposals(cid string) ([]models.FADisposal, error) {
	rows, err := r.db.Query("CALL sp_fa_get_disposals(?)", cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.FADisposal
	for rows.Next() {
		var d models.FADisposal
		var num, name, buyer, ref, notes, jid sql.NullString
		if err := rows.Scan(&d.ID, &d.CompanyID, &d.AssetID, &num, &name, &d.DisposalDate, &d.DisposalType,
			&d.Proceeds, &d.BookValue, &d.AccumulatedDepreciation, &d.GainLoss, &buyer, &ref, &notes, &jid, &d.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan fa disposal: %w", err)
		}
		d.AssetNumber = num.String
		d.AssetName = name.String
		d.Buyer = buyer.String
		d.Reference = ref.String
		d.Notes = notes.String
		d.JournalEntryID = jid.String
		out = append(out, d)
	}
	return out, nil
}

func (r *FixedAssetsRepo) SetDisposalJournal(id, cid, jid string) error {
	rows, err := r.db.Query("CALL sp_fa_set_disposal_journal(?,?,?)", id, cid, jid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

// ==================== MAINTENANCE ====================

func (r *FixedAssetsRepo) GetMaintenance(cid, aid string) ([]models.FAMaintenance, error) {
	rows, err := r.db.Query("CALL sp_fa_get_maintenance(?,?)", cid, aid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.FAMaintenance
	for rows.Next() {
		var m models.FAMaintenance
		var num, name, desc, vendor, performedBy, next sql.NullString
		if err := rows.Scan(&m.ID, &m.CompanyID, &m.AssetID, &num, &name, &m.ServiceDate, &m.MaintenanceType,
			&desc, &m.Cost, &vendor, &performedBy, &next, &m.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan fa maintenance: %w", err)
		}
		m.AssetNumber = num.String
		m.AssetName = name.String
		m.Description = desc.String
		m.Vendor = vendor.String
		m.PerformedBy = performedBy.String
		m.NextServiceDate = next.String
		out = append(out, m)
	}
	return out, nil
}

func (r *FixedAssetsRepo) CreateMaintenance(m *models.FAMaintenance, by string) error {
	rows, err := r.db.Query("CALL sp_fa_create_maintenance(?,?,?,?,?,?,?,?,?,?,?)",
		m.ID, m.CompanyID, m.AssetID, nullDate(m.ServiceDate), m.MaintenanceType, m.Description, m.Cost, m.Vendor, m.PerformedBy, nullDate(m.NextServiceDate), by)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *FixedAssetsRepo) UpdateMaintenance(m *models.FAMaintenance) error {
	rows, err := r.db.Query("CALL sp_fa_update_maintenance(?,?,?,?,?,?,?,?,?)",
		m.ID, m.CompanyID, nullDate(m.ServiceDate), m.MaintenanceType, m.Description, m.Cost, m.Vendor, m.PerformedBy, nullDate(m.NextServiceDate))
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *FixedAssetsRepo) DeleteMaintenance(id, cid string) error {
	rows, err := r.db.Query("CALL sp_fa_delete_maintenance(?,?)", id, cid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

// ==================== TRANSFERS ====================

func (r *FixedAssetsRepo) CreateTransfer(t *models.FATransfer, by string) error {
	rows, err := r.db.Query("CALL sp_fa_create_transfer(?,?,?,?,?,?,?,?,?)",
		t.ID, t.CompanyID, t.AssetID, nullDate(t.TransferDate), t.ToDepartment, t.ToLocation, t.ToCustodianID, t.Notes, by)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *FixedAssetsRepo) GetTransfers(cid, aid string) ([]models.FATransfer, error) {
	rows, err := r.db.Query("CALL sp_fa_get_transfers(?,?)", cid, aid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.FATransfer
	for rows.Next() {
		var t models.FATransfer
		var num, name, fromDept, toDept, fromLoc, toLoc, fromCID, fromCName, toCID, toCName, notes sql.NullString
		if err := rows.Scan(&t.ID, &t.CompanyID, &t.AssetID, &num, &name, &t.TransferDate,
			&fromDept, &toDept, &fromLoc, &toLoc, &fromCID, &fromCName, &toCID, &toCName, &notes, &t.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan fa transfer: %w", err)
		}
		t.AssetNumber = num.String
		t.AssetName = name.String
		t.FromDepartment = fromDept.String
		t.ToDepartment = toDept.String
		t.FromLocation = fromLoc.String
		t.ToLocation = toLoc.String
		t.FromCustodianID = fromCID.String
		t.FromCustodianName = fromCName.String
		t.ToCustodianID = toCID.String
		t.ToCustodianName = toCName.String
		t.Notes = notes.String
		out = append(out, t)
	}
	return out, nil
}

// ==================== REVALUATIONS ====================

// CreateRevaluation applies the revaluation/impairment and returns (oldValue, delta).
func (r *FixedAssetsRepo) CreateRevaluation(v *models.FARevaluation, by string) (float64, float64, error) {
	rows, err := r.db.Query("CALL sp_fa_create_revaluation(?,?,?,?,?,?,?,?)",
		v.ID, v.CompanyID, v.AssetID, nullDate(v.RevaluationDate), v.RevaluationType, v.NewValue, v.Reason, by)
	if err != nil {
		return 0, 0, err
	}
	defer rows.Close()
	var old, delta float64
	if rows.Next() {
		rows.Scan(&old, &delta)
	}
	return old, delta, nil
}

func (r *FixedAssetsRepo) GetRevaluations(cid string) ([]models.FARevaluation, error) {
	rows, err := r.db.Query("CALL sp_fa_get_revaluations(?)", cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.FARevaluation
	for rows.Next() {
		var v models.FARevaluation
		var num, name, reason, jid sql.NullString
		if err := rows.Scan(&v.ID, &v.CompanyID, &v.AssetID, &num, &name, &v.RevaluationDate, &v.RevaluationType,
			&v.OldValue, &v.NewValue, &v.Delta, &reason, &jid, &v.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan fa revaluation: %w", err)
		}
		v.AssetNumber = num.String
		v.AssetName = name.String
		v.Reason = reason.String
		v.JournalEntryID = jid.String
		out = append(out, v)
	}
	return out, nil
}

func (r *FixedAssetsRepo) SetRevaluationJournal(id, cid, jid string) error {
	rows, err := r.db.Query("CALL sp_fa_set_revaluation_journal(?,?,?)", id, cid, jid)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

// ==================== DASHBOARD + SETTINGS ====================

func (r *FixedAssetsRepo) Stats(cid string) (*models.FAStats, error) {
	rows, err := r.db.Query("CALL sp_fa_stats(?)", cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var s models.FAStats
	if rows.Next() {
		if err := rows.Scan(&s.TotalAssets, &s.ActiveAssets, &s.DisposedAssets, &s.FullyDepreciated,
			&s.TotalCost, &s.TotalAccumulatedDepreciation, &s.NetBookValue, &s.YTDDepreciation, &s.MaintenanceDue); err != nil {
			return nil, fmt.Errorf("scan fa stats: %w", err)
		}
	}
	return &s, nil
}

func (r *FixedAssetsRepo) GetSettings(cid string) (*models.FASettings, error) {
	rows, err := r.db.Query("CALL sp_fa_get_settings(?)", cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	s := &models.FASettings{CompanyID: cid}
	if rows.Next() {
		var asset, accum, exp, gain, loss, cash, reval, impair, payable sql.NullString
		if err := rows.Scan(&s.CompanyID, &s.AutoPostGL, &asset, &accum, &exp, &gain, &loss, &cash, &reval, &impair, &payable); err != nil {
			return nil, fmt.Errorf("scan fa settings: %w", err)
		}
		s.AssetAccountID = asset.String
		s.AccumDepAccountID = accum.String
		s.DepExpenseAccountID = exp.String
		s.DisposalGainAccountID = gain.String
		s.DisposalLossAccountID = loss.String
		s.CashAccountID = cash.String
		s.RevaluationSurplusAccountID = reval.String
		s.ImpairmentLossAccountID = impair.String
		s.PayableAccountID = payable.String
	}
	return s, nil
}

func (r *FixedAssetsRepo) UpsertSettings(s *models.FASettings) error {
	rows, err := r.db.Query("CALL sp_fa_upsert_settings(?,?,?,?,?,?,?,?,?,?,?)",
		s.CompanyID, s.AutoPostGL, s.AssetAccountID, s.AccumDepAccountID, s.DepExpenseAccountID,
		s.DisposalGainAccountID, s.DisposalLossAccountID, s.CashAccountID, s.RevaluationSurplusAccountID, s.ImpairmentLossAccountID, s.PayableAccountID)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}
