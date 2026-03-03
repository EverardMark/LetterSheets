package repository

import (
	"database/sql"
	"fmt"

	"lettersheets/internal/models"
)

type AccountingRepo struct {
	db *sql.DB
}

func NewAccountingRepo(db *sql.DB) *AccountingRepo {
	return &AccountingRepo{db: db}
}

// ==================== CHART OF ACCOUNTS ====================

func (r *AccountingRepo) GetAccounts(companyID, accountType string, activeOnly bool) ([]models.Account, error) {
	active := 0
	if activeOnly {
		active = 1
	}
	rows, err := r.db.Query("CALL sp_get_accounts(?, ?, ?)", companyID, accountType, active)
	if err != nil {
		return nil, fmt.Errorf("get accounts: %w", err)
	}
	defer rows.Close()

	var accounts []models.Account
	for rows.Next() {
		a, err := scanAccount(rows)
		if err != nil {
			return nil, err
		}
		accounts = append(accounts, *a)
	}
	return accounts, nil
}

func (r *AccountingRepo) GetAccount(id string) (*models.Account, error) {
	rows, err := r.db.Query("CALL sp_get_account(?)", id)
	if err != nil {
		return nil, fmt.Errorf("get account: %w", err)
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, fmt.Errorf("account not found")
	}
	return scanAccount(rows)
}

func (r *AccountingRepo) CreateAccount(companyID, code, name, accountType, accountSubtype, normalBalance, parentID, description, currency string) (*models.Account, error) {
	rows, err := r.db.Query("CALL sp_create_account(?, ?, ?, ?, ?, ?, ?, ?, ?)",
		companyID, code, name, accountType, accountSubtype, normalBalance, parentID, description, currency)
	if err != nil {
		return nil, fmt.Errorf("create account: %w", err)
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, fmt.Errorf("failed to create account")
	}
	return scanAccount(rows)
}

func (r *AccountingRepo) UpdateAccount(id, code, name, accountType, accountSubtype, normalBalance, parentID, description string, isActive bool, currency string) (*models.Account, error) {
	active := 0
	if isActive {
		active = 1
	}
	rows, err := r.db.Query("CALL sp_update_account(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		id, code, name, accountType, accountSubtype, normalBalance, parentID, description, active, currency)
	if err != nil {
		return nil, fmt.Errorf("update account: %w", err)
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, fmt.Errorf("account not found")
	}
	return scanAccount(rows)
}

func (r *AccountingRepo) DeleteAccount(id string) error {
	_, err := r.db.Exec("CALL sp_delete_account(?)", id)
	if err != nil {
		return fmt.Errorf("delete account: %w", err)
	}
	return nil
}

func (r *AccountingRepo) GetAccountTree(companyID string) ([]models.Account, error) {
	rows, err := r.db.Query("CALL sp_get_account_tree(?)", companyID)
	if err != nil {
		return nil, fmt.Errorf("get account tree: %w", err)
	}
	defer rows.Close()

	var accounts []models.Account
	for rows.Next() {
		var a models.Account
		var parentID sql.NullString
		err := rows.Scan(
			&a.ID, &a.Code, &a.Name, &a.AccountType,
			&a.AccountSubtype, &a.NormalBalance,
			&parentID, &a.IsActive, &a.IsSystem,
			&a.CurrentBalance, &a.ChildCount,
		)
		if err != nil {
			return nil, fmt.Errorf("scan account tree: %w", err)
		}
		if parentID.Valid {
			a.ParentID = parentID.String
		}
		accounts = append(accounts, a)
	}
	return accounts, nil
}

func (r *AccountingRepo) BulkCreateAccount(companyID, code, name, accountType, accountSubtype, normalBalance string, isSystem bool, currency string) error {
	sys := 0
	if isSystem {
		sys = 1
	}
	_, err := r.db.Exec("CALL sp_bulk_create_account(?, ?, ?, ?, ?, ?, ?, ?)",
		companyID, code, name, accountType, accountSubtype, normalBalance, sys, currency)
	if err != nil {
		return fmt.Errorf("bulk create account: %w", err)
	}
	return nil
}

func (r *AccountingRepo) LinkParentAccounts(companyID string) error {
	_, err := r.db.Exec("CALL sp_link_parent_accounts(?)", companyID)
	if err != nil {
		return fmt.Errorf("link parents: %w", err)
	}
	return nil
}

func (r *AccountingRepo) ClearAccounts(companyID string) error {
	_, err := r.db.Exec("CALL sp_clear_accounts(?)", companyID)
	if err != nil {
		return fmt.Errorf("clear accounts: %w", err)
	}
	return nil
}

// ==================== COA TEMPLATES ====================

func (r *AccountingRepo) GetCOATemplates(companyID string) ([]models.COATemplate, error) {
	rows, err := r.db.Query("CALL sp_get_coa_templates(?)", companyID)
	if err != nil {
		return nil, fmt.Errorf("get templates: %w", err)
	}
	defer rows.Close()

	var templates []models.COATemplate
	for rows.Next() {
		var t models.COATemplate
		var companyID, description sql.NullString
		err := rows.Scan(&t.ID, &companyID, &t.Name, &t.Country, &t.Currency, &t.Flag,
			&description, &t.IsGlobal, &t.CreatedAt, &t.UpdatedAt, &t.ItemCount)
		if err != nil {
			return nil, fmt.Errorf("scan template: %w", err)
		}
		if companyID.Valid {
			t.CompanyID = companyID.String
		}
		if description.Valid {
			t.Description = description.String
		}
		templates = append(templates, t)
	}
	return templates, nil
}

func (r *AccountingRepo) GetCOATemplate(id string) (*models.COATemplate, error) {
	rows, err := r.db.Query("CALL sp_get_coa_template(?)", id)
	if err != nil {
		return nil, fmt.Errorf("get template: %w", err)
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, fmt.Errorf("template not found")
	}
	var t models.COATemplate
	var companyID, description sql.NullString
	err = rows.Scan(&t.ID, &companyID, &t.Name, &t.Country, &t.Currency, &t.Flag,
		&description, &t.IsGlobal, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("scan template: %w", err)
	}
	if companyID.Valid {
		t.CompanyID = companyID.String
	}
	if description.Valid {
		t.Description = description.String
	}
	return &t, nil
}

func (r *AccountingRepo) GetCOATemplateItems(templateID string) ([]models.COATemplateItem, error) {
	rows, err := r.db.Query("CALL sp_get_coa_template_items(?)", templateID)
	if err != nil {
		return nil, fmt.Errorf("get template items: %w", err)
	}
	defer rows.Close()

	var items []models.COATemplateItem
	for rows.Next() {
		var item models.COATemplateItem
		var subtype sql.NullString
		err := rows.Scan(&item.ID, &item.TemplateID, &item.Code, &item.Name,
			&item.AccountType, &subtype, &item.NormalBalance, &item.IsSystem, &item.SortOrder)
		if err != nil {
			return nil, fmt.Errorf("scan item: %w", err)
		}
		if subtype.Valid {
			item.AccountSubtype = subtype.String
		}
		items = append(items, item)
	}
	return items, nil
}

func (r *AccountingRepo) CreateCOATemplate(companyID, name, country, currency, flag, description string, isGlobal bool) (*models.COATemplate, error) {
	g := 0
	if isGlobal {
		g = 1
	}
	rows, err := r.db.Query("CALL sp_create_coa_template(?, ?, ?, ?, ?, ?, ?)",
		companyID, name, country, currency, flag, description, g)
	if err != nil {
		return nil, fmt.Errorf("create template: %w", err)
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, fmt.Errorf("failed to create template")
	}
	var t models.COATemplate
	var cid, desc sql.NullString
	err = rows.Scan(&t.ID, &cid, &t.Name, &t.Country, &t.Currency, &t.Flag,
		&desc, &t.IsGlobal, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("scan template: %w", err)
	}
	if cid.Valid {
		t.CompanyID = cid.String
	}
	if desc.Valid {
		t.Description = desc.String
	}
	return &t, nil
}

func (r *AccountingRepo) UpdateCOATemplate(id, name, country, currency, flag, description string) (*models.COATemplate, error) {
	rows, err := r.db.Query("CALL sp_update_coa_template(?, ?, ?, ?, ?, ?)",
		id, name, country, currency, flag, description)
	if err != nil {
		return nil, fmt.Errorf("update template: %w", err)
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, fmt.Errorf("template not found")
	}
	var t models.COATemplate
	var cid, desc sql.NullString
	err = rows.Scan(&t.ID, &cid, &t.Name, &t.Country, &t.Currency, &t.Flag,
		&desc, &t.IsGlobal, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("scan: %w", err)
	}
	if cid.Valid {
		t.CompanyID = cid.String
	}
	if desc.Valid {
		t.Description = desc.String
	}
	return &t, nil
}

func (r *AccountingRepo) DeleteCOATemplate(id, companyID string) error {
	_, err := r.db.Exec("CALL sp_delete_coa_template(?, ?)", id, companyID)
	return err
}

func (r *AccountingRepo) CreateCOATemplateItem(templateID, code, name, accountType, accountSubtype, normalBalance string, isSystem bool, sortOrder int) error {
	sys := 0
	if isSystem {
		sys = 1
	}
	_, err := r.db.Exec("CALL sp_create_coa_template_item(?, ?, ?, ?, ?, ?, ?, ?)",
		templateID, code, name, accountType, accountSubtype, normalBalance, sys, sortOrder)
	return err
}

func (r *AccountingRepo) UpdateCOATemplateItem(id, code, name, accountType, accountSubtype, normalBalance string, isSystem bool, sortOrder int) error {
	sys := 0
	if isSystem {
		sys = 1
	}
	_, err := r.db.Exec("CALL sp_update_coa_template_item(?, ?, ?, ?, ?, ?, ?, ?)",
		id, code, name, accountType, accountSubtype, normalBalance, sys, sortOrder)
	return err
}

func (r *AccountingRepo) DeleteCOATemplateItem(id string) error {
	_, err := r.db.Exec("CALL sp_delete_coa_template_item(?)", id)
	return err
}

func (r *AccountingRepo) DuplicateCOATemplate(sourceID, companyID, newName string) (*models.COATemplate, error) {
	rows, err := r.db.Query("CALL sp_duplicate_coa_template(?, ?, ?)", sourceID, companyID, newName)
	if err != nil {
		return nil, fmt.Errorf("duplicate template: %w", err)
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, fmt.Errorf("failed to duplicate")
	}
	var t models.COATemplate
	var cid, desc sql.NullString
	err = rows.Scan(&t.ID, &cid, &t.Name, &t.Country, &t.Currency, &t.Flag,
		&desc, &t.IsGlobal, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("scan: %w", err)
	}
	if cid.Valid {
		t.CompanyID = cid.String
	}
	if desc.Valid {
		t.Description = desc.String
	}
	return &t, nil
}

func (r *AccountingRepo) ToggleAccountActive(id string) (*models.Account, error) {
	rows, err := r.db.Query("CALL sp_toggle_account_active(?)", id)
	if err != nil {
		return nil, fmt.Errorf("toggle account: %w", err)
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, fmt.Errorf("account not found")
	}
	var a models.Account
	err = rows.Scan(&a.ID, &a.IsActive)
	if err != nil {
		return nil, fmt.Errorf("scan toggle: %w", err)
	}
	return &a, nil
}

func (r *AccountingRepo) CheckAccountCode(companyID, code, excludeID string) (bool, error) {
	rows, err := r.db.Query("CALL sp_check_account_code(?, ?, ?)", companyID, code, excludeID)
	if err != nil {
		return false, fmt.Errorf("check code: %w", err)
	}
	defer rows.Close()

	if !rows.Next() {
		return false, nil
	}
	var exists int
	if err := rows.Scan(&exists); err != nil {
		return false, err
	}
	return exists > 0, nil
}

// ==================== SCANNER ====================

func scanAccount(rows *sql.Rows) (*models.Account, error) {
	var a models.Account
	var accountSubtype, parentID, parentName, parentCode, description, createdAt, updatedAt sql.NullString

	err := rows.Scan(
		&a.ID, &a.CompanyID, &a.Code, &a.Name,
		&a.AccountType, &accountSubtype,
		&a.NormalBalance, &parentID,
		&parentName, &parentCode,
		&description, &a.IsActive, &a.IsSystem,
		&a.Currency, &a.CurrentBalance,
		&createdAt, &updatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("scan account: %w", err)
	}

	if accountSubtype.Valid {
		a.AccountSubtype = accountSubtype.String
	}
	if parentID.Valid {
		a.ParentID = parentID.String
	}
	if parentName.Valid {
		a.ParentName = parentName.String
	}
	if parentCode.Valid {
		a.ParentCode = parentCode.String
	}
	if description.Valid {
		a.Description = description.String
	}
	if createdAt.Valid {
		a.CreatedAt = createdAt.String
	}
	if updatedAt.Valid {
		a.UpdatedAt = updatedAt.String
	}
	return &a, nil
}

// ==================== JOURNAL ENTRIES ====================

func (r *AccountingRepo) NextEntryNumber(companyID string) (int, error) {
	rows, err := r.db.Query("CALL sp_next_entry_number(?)", companyID)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	var n int
	if rows.Next() {
		rows.Scan(&n)
	}
	return n, nil
}

func (r *AccountingRepo) CreateJournalEntry(id, companyID string, entryNumber int, entryDate, memo, sourceType, sourceID, status string) error {
	rows, err := r.db.Query("CALL sp_create_journal_entry(?,?,?,?,?,?,?,?)", id, companyID, entryNumber, entryDate, memo, sourceType, sourceID, status)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *AccountingRepo) AddJournalLine(entryID, accountID, description string, debit, credit float64, sortOrder int) error {
	rows, err := r.db.Query("CALL sp_add_journal_line(?,?,?,?,?,?)", entryID, accountID, description, debit, credit, sortOrder)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *AccountingRepo) UpdateJournalTotals(entryID string) error {
	rows, err := r.db.Query("CALL sp_update_journal_totals(?)", entryID)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *AccountingRepo) PostJournalEntry(entryID, companyID, userID string) error {
	rows, err := r.db.Query("CALL sp_post_journal_entry(?,?,?)", entryID, companyID, userID)
	if err != nil {
		return fmt.Errorf("post journal: %w", err)
	}
	defer rows.Close()
	return nil
}

func (r *AccountingRepo) VoidJournalEntry(entryID, companyID, userID, reason string) error {
	rows, err := r.db.Query("CALL sp_void_journal_entry(?,?,?,?)", entryID, companyID, userID, reason)
	if err != nil {
		return fmt.Errorf("void journal: %w", err)
	}
	defer rows.Close()
	return nil
}

func (r *AccountingRepo) GetJournalEntries(companyID, status, sourceType string, dateFrom, dateTo string, limit, offset int) ([]models.JournalEntry, error) {
	var dfp, dtp interface{}
	if dateFrom != "" {
		dfp = dateFrom
	}
	if dateTo != "" {
		dtp = dateTo
	}
	rows, err := r.db.Query("CALL sp_get_journal_entries(?,?,?,?,?,?,?)", companyID, status, sourceType, dfp, dtp, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []models.JournalEntry
	for rows.Next() {
		var je models.JournalEntry
		var memo, sourceID, postedAt, postedBy, voidedAt, voidedBy, voidReason sql.NullString
		err := rows.Scan(&je.ID, &je.CompanyID, &je.EntryNumber, &je.EntryDate, &memo,
			&je.SourceType, &sourceID, &je.Status, &je.TotalDebit, &je.TotalCredit,
			&postedAt, &postedBy, &voidedAt, &voidedBy, &voidReason,
			&je.IsDeleted, &je.CreatedAt, &je.UpdatedAt, &je.LineCount)
		if err != nil {
			return nil, fmt.Errorf("scan je: %w", err)
		}
		if memo.Valid {
			je.Memo = memo.String
		}
		if sourceID.Valid {
			je.SourceID = sourceID.String
		}
		if postedAt.Valid {
			je.PostedAt = postedAt.String
		}
		if postedBy.Valid {
			je.PostedBy = postedBy.String
		}
		if voidedAt.Valid {
			je.VoidedAt = voidedAt.String
		}
		if voidedBy.Valid {
			je.VoidedBy = voidedBy.String
		}
		if voidReason.Valid {
			je.VoidReason = voidReason.String
		}
		entries = append(entries, je)
	}
	return entries, nil
}

func (r *AccountingRepo) GetJournalEntry(id, companyID string) (*models.JournalEntry, error) {
	rows, err := r.db.Query("CALL sp_get_journal_entry(?,?)", id, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, fmt.Errorf("entry not found")
	}
	var je models.JournalEntry
	var memo, sourceID, postedAt, postedBy, voidedAt, voidedBy, voidReason sql.NullString
	err = rows.Scan(&je.ID, &je.CompanyID, &je.EntryNumber, &je.EntryDate, &memo,
		&je.SourceType, &sourceID, &je.Status, &je.TotalDebit, &je.TotalCredit,
		&postedAt, &postedBy, &voidedAt, &voidedBy, &voidReason,
		&je.IsDeleted, &je.CreatedAt, &je.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if memo.Valid {
		je.Memo = memo.String
	}
	if sourceID.Valid {
		je.SourceID = sourceID.String
	}
	if postedAt.Valid {
		je.PostedAt = postedAt.String
	}
	if postedBy.Valid {
		je.PostedBy = postedBy.String
	}
	if voidedAt.Valid {
		je.VoidedAt = voidedAt.String
	}
	if voidedBy.Valid {
		je.VoidedBy = voidedBy.String
	}
	if voidReason.Valid {
		je.VoidReason = voidReason.String
	}
	return &je, nil
}

func (r *AccountingRepo) GetJournalLines(entryID string) ([]models.JournalLine, error) {
	rows, err := r.db.Query("CALL sp_get_journal_lines(?)", entryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var lines []models.JournalLine
	for rows.Next() {
		var jl models.JournalLine
		var desc sql.NullString
		err := rows.Scan(&jl.ID, &jl.EntryID, &jl.AccountID, &desc, &jl.Debit, &jl.Credit,
			&jl.SortOrder, &jl.AccountCode, &jl.AccountName, &jl.AccountType)
		if err != nil {
			return nil, fmt.Errorf("scan line: %w", err)
		}
		if desc.Valid {
			jl.Description = desc.String
		}
		lines = append(lines, jl)
	}
	return lines, nil
}

func (r *AccountingRepo) DeleteJournalEntry(id, companyID string) error {
	rows, err := r.db.Query("CALL sp_delete_journal_entry(?,?)", id, companyID)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *AccountingRepo) UpdateJournalEntry(id, companyID, entryDate, memo string) error {
	rows, err := r.db.Query("CALL sp_update_journal_entry(?,?,?,?)", id, companyID, entryDate, memo)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *AccountingRepo) ClearJournalLines(entryID string) error {
	rows, err := r.db.Query("CALL sp_clear_journal_lines(?)", entryID)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

// ==================== ACCOUNT MAPPINGS ====================

func (r *AccountingRepo) GetAccountMappings(companyID string) ([]models.AccountMapping, error) {
	rows, err := r.db.Query("CALL sp_get_account_mappings(?)", companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var mappings []models.AccountMapping
	for rows.Next() {
		var m models.AccountMapping
		var desc sql.NullString
		err := rows.Scan(&m.ID, &m.CompanyID, &m.MappingKey, &m.AccountID, &desc,
			&m.IsDeleted, &m.CreatedAt, &m.UpdatedAt, &m.AccountCode, &m.AccountName, &m.AccountType)
		if err != nil {
			return nil, fmt.Errorf("scan mapping: %w", err)
		}
		if desc.Valid {
			m.Description = desc.String
		}
		mappings = append(mappings, m)
	}
	return mappings, nil
}

func (r *AccountingRepo) UpsertAccountMapping(companyID, mappingKey, accountID, description string) (*models.AccountMapping, error) {
	rows, err := r.db.Query("CALL sp_upsert_account_mapping(?,?,?,?)", companyID, mappingKey, accountID, description)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, fmt.Errorf("upsert failed")
	}
	var m models.AccountMapping
	var desc sql.NullString
	err = rows.Scan(&m.ID, &m.CompanyID, &m.MappingKey, &m.AccountID, &desc, &m.IsDeleted, &m.CreatedAt, &m.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if desc.Valid {
		m.Description = desc.String
	}
	return &m, nil
}

func (r *AccountingRepo) DeleteAccountMapping(companyID, mappingKey string) error {
	rows, err := r.db.Query("CALL sp_delete_account_mapping(?,?)", companyID, mappingKey)
	if err != nil {
		return err
	}
	defer rows.Close()
	return nil
}

func (r *AccountingRepo) AutoMapPayrollAccounts(companyID string) ([]models.AccountMapping, error) {
	rows, err := r.db.Query("CALL sp_auto_map_payroll_accounts(?)", companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var mappings []models.AccountMapping
	for rows.Next() {
		var m models.AccountMapping
		var desc sql.NullString
		err := rows.Scan(&m.ID, &m.CompanyID, &m.MappingKey, &m.AccountID, &desc,
			&m.IsDeleted, &m.CreatedAt, &m.UpdatedAt, &m.AccountCode, &m.AccountName, &m.AccountType)
		if err != nil {
			return nil, fmt.Errorf("scan mapping: %w", err)
		}
		if desc.Valid {
			m.Description = desc.String
		}
		mappings = append(mappings, m)
	}
	return mappings, nil
}

// ==================== PAYROLL TOTALS ====================

func (r *AccountingRepo) GetPayrollRunTotals(runID, companyID string) (*models.PayrollTotals, error) {
	rows, err := r.db.Query("CALL sp_get_payroll_run_totals(?,?)", runID, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, fmt.Errorf("no payroll data")
	}
	var pt models.PayrollTotals
	err = rows.Scan(&pt.TotalGross, &pt.TotalBasic, &pt.TotalOT, &pt.TotalHoliday,
		&pt.TotalNightDiff, &pt.TotalAllowances, &pt.TotalOtherEarnings,
		&pt.TotalSSSEE, &pt.TotalSSSER, &pt.TotalPhilHealthEE, &pt.TotalPhilHealthER,
		&pt.TotalPagIBIGEE, &pt.TotalPagIBIGER, &pt.TotalTax,
		&pt.TotalBenefitDeduct, &pt.TotalLoanDeduct, &pt.TotalOtherDeduct,
		&pt.TotalNetPay, &pt.EmployeeCount)
	if err != nil {
		return nil, err
	}
	return &pt, nil
}

// ==================== GENERAL LEDGER ====================

func (r *AccountingRepo) TrialBalance(companyID, dateFrom, dateTo string) ([]models.TrialBalanceRow, error) {
	var dfp, dtp interface{}
	if dateFrom != "" {
		dfp = dateFrom
	}
	if dateTo != "" {
		dtp = dateTo
	}
	rows, err := r.db.Query("CALL sp_trial_balance(?,?,?)", companyID, dfp, dtp)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []models.TrialBalanceRow
	for rows.Next() {
		var row models.TrialBalanceRow
		var subtype sql.NullString
		err := rows.Scan(&row.ID, &row.Code, &row.Name, &row.AccountType, &subtype,
			&row.NormalBalance, &row.IsActive, &row.TotalDebit, &row.TotalCredit,
			&row.NetMovement, &row.CurrentBalance)
		if err != nil {
			return nil, fmt.Errorf("scan trial balance: %w", err)
		}
		if subtype.Valid {
			row.AccountSubtype = subtype.String
		}
		result = append(result, row)
	}
	return result, nil
}

func (r *AccountingRepo) AccountLedger(companyID, accountID, dateFrom, dateTo string) ([]models.LedgerTransaction, error) {
	var dfp, dtp interface{}
	if dateFrom != "" {
		dfp = dateFrom
	}
	if dateTo != "" {
		dtp = dateTo
	}
	rows, err := r.db.Query("CALL sp_account_ledger(?,?,?,?)", companyID, accountID, dfp, dtp)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []models.LedgerTransaction
	for rows.Next() {
		var t models.LedgerTransaction
		var memo, sourceID, lineDesc sql.NullString
		err := rows.Scan(&t.EntryID, &t.EntryNumber, &t.EntryDate, &memo,
			&t.SourceType, &sourceID, &t.LineID, &lineDesc, &t.Debit, &t.Credit)
		if err != nil {
			return nil, fmt.Errorf("scan ledger: %w", err)
		}
		if memo.Valid {
			t.Memo = memo.String
		}
		if sourceID.Valid {
			t.SourceID = sourceID.String
		}
		if lineDesc.Valid {
			t.LineDescription = lineDesc.String
		}
		result = append(result, t)
	}
	return result, nil
}

func (r *AccountingRepo) AccountOpeningBalance(companyID, accountID, dateFrom string) (float64, error) {
	if dateFrom == "" {
		return 0, nil
	}
	rows, err := r.db.Query("CALL sp_account_opening_balance(?,?,?)", companyID, accountID, dateFrom)
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

func (r *AccountingRepo) LedgerPeriodSummary(companyID, dateFrom, dateTo string) (*models.LedgerPeriodSummary, error) {
	var dfp, dtp interface{}
	if dateFrom != "" {
		dfp = dateFrom
	}
	if dateTo != "" {
		dtp = dateTo
	}
	rows, err := r.db.Query("CALL sp_ledger_period_summary(?,?,?)", companyID, dfp, dtp)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var s models.LedgerPeriodSummary
	if rows.Next() {
		rows.Scan(&s.EntryCount, &s.TotalDebits, &s.TotalCredits, &s.AccountsAffected, &s.TotalAccounts, &s.TotalPosted)
	}
	return &s, nil
}

func (r *AccountingRepo) LedgerTypeSummary(companyID, dateFrom, dateTo string) ([]models.LedgerTypeSummary, error) {
	var dfp, dtp interface{}
	if dateFrom != "" {
		dfp = dateFrom
	}
	if dateTo != "" {
		dtp = dateTo
	}
	rows, err := r.db.Query("CALL sp_ledger_type_summary(?,?,?)", companyID, dfp, dtp)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []models.LedgerTypeSummary
	for rows.Next() {
		var t models.LedgerTypeSummary
		err := rows.Scan(&t.AccountType, &t.AccountCount, &t.TotalDebit, &t.TotalCredit, &t.TotalBalance)
		if err != nil {
			return nil, fmt.Errorf("scan type summary: %w", err)
		}
		result = append(result, t)
	}
	return result, nil
}
