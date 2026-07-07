import { useState, useEffect, useCallback, useMemo } from "react";
import { I } from "../../layouts/ERPLayout";
import "./acc-layout.css";

const API = (import.meta.env.VITE_API_BASE||"")+"/api/execute";
async function api(action, body = {}) {
    const s = localStorage.getItem("ls_session");
    const res = await fetch(`${API}?action=${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(s ? { Authorization: `Bearer ${s}` } : {}) },
        body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error || json?.message || `API ${action} failed`);
    return json?.data ?? json;
}

function fmtMoney(n) {
    return "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_CLR = { Draft: "#f59e0b", Posted: "#22c55e", Voided: "#ef4444" };
const SRC_LABEL = { manual: "Manual", payroll: "Payroll", loan: "Loan", adjustment: "Adjustment" };
const SRC_ICON = { manual: "edit-3", payroll: "users", loan: "dollar-sign", adjustment: "sliders" };

/* ===== MAPPING KEY DEFINITIONS ===== */
const MAPPING_DEFS = [
    { key: "PAYROLL_SALARIES_DR", label: "Salaries & Wages", side: "Dr", group: "Payroll Expenses" },
    { key: "PAYROLL_SSS_EXPENSE_DR", label: "SSS Expense (Employer)", side: "Dr", group: "Payroll Expenses" },
    { key: "PAYROLL_SSSEC_EXPENSE_DR", label: "SSS EC Expense", side: "Dr", group: "Payroll Expenses" },
    { key: "PAYROLL_PHILHEALTH_EXPENSE_DR", label: "PhilHealth Expense (ER)", side: "Dr", group: "Payroll Expenses" },
    { key: "PAYROLL_PAGIBIG_EXPENSE_DR", label: "Pag-IBIG Expense (ER)", side: "Dr", group: "Payroll Expenses" },
    { key: "PAYROLL_BENEFITS_EXPENSE_DR", label: "Benefits Expense", side: "Dr", group: "Payroll Expenses" },
    { key: "PAYROLL_SSS_PAYABLE_CR", label: "SSS Payable (EE+ER)", side: "Cr", group: "Payroll Payables" },
    { key: "PAYROLL_SSSEC_PAYABLE_CR", label: "SSS EC Payable", side: "Cr", group: "Payroll Payables" },
    { key: "PAYROLL_PHILHEALTH_PAYABLE_CR", label: "PhilHealth Payable (EE+ER)", side: "Cr", group: "Payroll Payables" },
    { key: "PAYROLL_PAGIBIG_PAYABLE_CR", label: "Pag-IBIG Payable (EE+ER)", side: "Cr", group: "Payroll Payables" },
    { key: "PAYROLL_TAX_PAYABLE_CR", label: "Withholding Tax Payable", side: "Cr", group: "Payroll Payables" },
    { key: "PAYROLL_LOANS_PAYABLE_CR", label: "Loan Deductions Payable", side: "Cr", group: "Payroll Payables" },
    { key: "PAYROLL_OTHER_DEDUCTIONS_CR", label: "Other Deductions (Accrued)", side: "Cr", group: "Payroll Payables" },
    { key: "PAYROLL_CASH_CR", label: "Cash Disbursement (Net Pay)", side: "Cr", group: "Cash" },
    { key: "LOAN_DISBURSEMENT_DR", label: "Advances to Employees", side: "Dr", group: "Loan" },
    { key: "LOAN_DISBURSEMENT_CR", label: "Cash (Loan Disbursement)", side: "Cr", group: "Loan" },
];

export default function JournalEntries() {
    const [entries, setEntries] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [selected, setSelected] = useState(null);
    const [lines, setLines] = useState([]);
    const [loading, setLoading] = useState(false);
    const [view, setView] = useState("list"); // list | create | mapping | payroll
    const [filterStatus, setFilterStatus] = useState("");
    const [filterSource, setFilterSource] = useState("");
    const [search, setSearch] = useState("");
    const [msg, setMsg] = useState("");

    // Create/Edit form
    const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
    const [formMemo, setFormMemo] = useState("");
    const [formLines, setFormLines] = useState([{ account_id: "", description: "", debit: 0, credit: 0 }]);
    const [editingId, setEditingId] = useState(null);

    // Mapping
    const [mappings, setMappings] = useState([]);
    const [mappingLoading, setMappingLoading] = useState(false);

    // Payroll
    const [payrollRuns, setPayrollRuns] = useState([]);
    const [selectedRun, setSelectedRun] = useState(null);
    const [payrollTotals, setPayrollTotals] = useState(null);
    const [generating, setGenerating] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const acctData = await api("get_accounts", {});
            const accts = acctData?.accounts || acctData || [];
            setAccounts(Array.isArray(accts) ? accts.filter(a => a.account_subtype !== "Header") : []);
        } catch (e) { console.error("load accounts:", e); }
        try {
            const je = await api("get_journal_entries", {});
            setEntries(Array.isArray(je) ? je : []);
        } catch (e) { console.error("load entries:", e); setEntries([]); }
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

    /* ------- LIST FILTERING ------- */
    const filtered = useMemo(() => {
        let r = entries;
        if (filterStatus) r = r.filter(e => e.status === filterStatus);
        if (filterSource) r = r.filter(e => e.source_type === filterSource);
        if (search) {
            const s = search.toLowerCase();
            r = r.filter(e => (e.memo || "").toLowerCase().includes(s) || String(e.entry_number).includes(s));
        }
        return r;
    }, [entries, filterStatus, filterSource, search]);

    /* ------- SELECT ENTRY ------- */
    const selectEntry = async (e) => {
        setSelected(e);
        try {
            const ls = await api("get_journal_lines", { entry_id: e.id });
            setLines(Array.isArray(ls) ? ls : []);
        } catch (err) { setLines([]); }
    };

    /* ------- CREATE / EDIT ------- */
    const openCreate = () => {
        setEditingId(null);
        setFormDate(new Date().toISOString().split("T")[0]);
        setFormMemo("");
        setFormLines([{ account_id: "", description: "", debit: 0, credit: 0 }, { account_id: "", description: "", debit: 0, credit: 0 }]);
        setView("create");
    };

    const openEdit = async (e) => {
        if (e.status !== "Draft") return;
        setEditingId(e.id);
        setFormDate(e.entry_date?.split("T")[0] || "");
        setFormMemo(e.memo || "");
        try {
            const ls = await api("get_journal_lines", { entry_id: e.id });
            setFormLines((ls || []).map(l => ({ account_id: l.account_id, description: l.description, debit: l.debit, credit: l.credit })));
        } catch { setFormLines([{ account_id: "", description: "", debit: 0, credit: 0 }]); }
        setView("create");
    };

    const addLine = () => setFormLines(p => [...p, { account_id: "", description: "", debit: 0, credit: 0 }]);
    const removeLine = (i) => setFormLines(p => p.filter((_, j) => j !== i));
    const updateLine = (i, field, val) => setFormLines(p => p.map((l, j) => j === i ? { ...l, [field]: val } : l));

    const totalDr = formLines.reduce((s, l) => s + Number(l.debit || 0), 0);
    const totalCr = formLines.reduce((s, l) => s + Number(l.credit || 0), 0);
    const balanced = Math.abs(totalDr - totalCr) < 0.005 && totalDr > 0;

    const saveEntry = async () => {
        const validLines = formLines.filter(l => l.account_id && (l.debit > 0 || l.credit > 0));
        if (!formDate || validLines.length < 2) { flash("Need date and at least 2 lines"); return; }
        if (!balanced) { flash("Debits must equal credits"); return; }
        try {
            if (editingId) {
                await api("update_journal_entry", { id: editingId, entry_date: formDate, memo: formMemo, lines: validLines });
            } else {
                await api("create_journal_entry", { entry_date: formDate, memo: formMemo, lines: validLines });
            }
            flash(editingId ? "Entry updated" : "Entry created");
            setView("list");
            load();
        } catch (e) { flash("Error: " + e.message); }
    };

    /* ------- POST / VOID / DELETE ------- */
    const postEntry = async (id) => {
        if (!confirm("Post this journal entry? This will update account balances.")) return;
        try {
            await api("post_journal_entry", { id });
            flash("Entry posted");
            load();
            setSelected(null);
        } catch (e) { flash("Error: " + e.message); }
    };

    const voidEntry = async (id) => {
        const reason = prompt("Reason for voiding:");
        if (!reason) return;
        try {
            await api("void_journal_entry", { id, reason });
            flash("Entry voided");
            load();
            setSelected(null);
        } catch (e) { flash("Error: " + e.message); }
    };

    const deleteEntry = async (id) => {
        if (!confirm("Delete this draft entry?")) return;
        try {
            await api("delete_journal_entry", { id });
            flash("Entry deleted");
            load();
            setSelected(null);
        } catch (e) { flash("Error: " + e.message); }
    };

    /* ------- MAPPINGS ------- */
    const loadMappings = async () => {
        setMappingLoading(true);
        try {
            const m = await api("get_account_mappings", {});
            setMappings(Array.isArray(m) ? m : []);
        } catch (e) { console.error(e); }
        setMappingLoading(false);
    };

    const autoMap = async () => {
        setMappingLoading(true);
        try {
            const m = await api("auto_map_payroll_accounts", {});
            setMappings(Array.isArray(m) ? m : []);
            flash("Auto-mapped " + (m?.length || 0) + " accounts");
        } catch (e) { flash("Error: " + e.message); }
        setMappingLoading(false);
    };

    const updateMapping = async (key, accountId, desc) => {
        try {
            await api("upsert_account_mapping", { mapping_key: key, account_id: accountId, description: desc });
            loadMappings();
        } catch (e) { flash("Error: " + e.message); }
    };

    /* ------- PAYROLL JOURNAL ------- */
    const loadPayrollRuns = async () => {
        try {
            const data = await api("get_payroll_runs", {});
            const runs = data?.runs || data || [];
            setPayrollRuns(Array.isArray(runs) ? runs : []);
        } catch (e) { console.error("load payroll runs:", e); setPayrollRuns([]); }
    };

    const loadPayrollTotals = async (runId) => {
        try {
            const t = await api("get_payroll_run_totals", { run_id: runId });
            setPayrollTotals(t);
        } catch (e) { setPayrollTotals(null); flash("Error: " + e.message); }
    };

    const generatePayrollJournal = async () => {
        if (!selectedRun) return;
        setGenerating(true);
        try {
            const result = await api("generate_payroll_journal", { run_id: selectedRun.id, auto_post: false });
            flash("Payroll journal created (JE-" + result.entry?.entry_number + ")");
            setView("list");
            load();
        } catch (e) { flash("Error: " + e.message); }
        setGenerating(false);
    };

    /* ------- ACCOUNT PICKER ------- */
    const acctMap = useMemo(() => {
        const m = {};
        accounts.forEach(a => { m[a.id] = a; });
        return m;
    }, [accounts]);

    const acctLabel = (id) => {
        const a = acctMap[id];
        return a ? `${a.code} ${a.name}` : "Select account...";
    };

    /* ===== STATS ===== */
    const stats = useMemo(() => {
        const draft = entries.filter(e => e.status === "Draft").length;
        const posted = entries.filter(e => e.status === "Posted").length;
        const voided = entries.filter(e => e.status === "Voided").length;
        const totalPosted = entries.filter(e => e.status === "Posted").reduce((s, e) => s + (e.total_debit || 0), 0);
        return { total: entries.length, draft, posted, voided, totalPosted };
    }, [entries]);

    /* ===== RENDER ===== */
    if (view === "create") return renderCreateView();
    if (view === "mapping") return renderMappingView();
    if (view === "payroll") return renderPayrollView();

    return (
        <div className="acc-wrap">
            {msg && <div className="je-flash">{msg}</div>}

            {/* Toolbar */}
            <div className="acc-bar">
                <div className="acc-bar-left">
                    <div className="acc-search-wrap">
                        <I name="search" size={14}/>
                        <input className="acc-search" placeholder="Search entries..." value={search} onChange={e => setSearch(e.target.value)}/>
                    </div>
                    <select className="acc-filter" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                        <option value="">All Status</option>
                        <option value="Draft">Draft</option>
                        <option value="Posted">Posted</option>
                        <option value="Voided">Voided</option>
                    </select>
                    <select className="acc-filter" value={filterSource} onChange={e => setFilterSource(e.target.value)}>
                        <option value="">All Sources</option>
                        <option value="manual">Manual</option>
                        <option value="payroll">Payroll</option>
                        <option value="loan">Loan</option>
                    </select>
                </div>
                <div className="acc-bar-right">
                    <button className="acc-btn-s" onClick={() => { setView("mapping"); loadMappings(); }}>
                        <I name="link" size={14}/> Mappings
                    </button>
                    <button className="acc-btn-s" onClick={() => { setView("payroll"); loadPayrollRuns(); }}>
                        <I name="users" size={14}/> From Payroll
                    </button>
                    <button className="acc-btn-p" onClick={openCreate}>
                        <I name="plus" size={14}/> New Entry
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="je-grid acc-fill">
                {/* Entry List */}
                <div className="je-list-pane">
                    {loading ? (
                        <div className="je-list-msg">Loading...</div>
                    ) : filtered.length === 0 ? (
                        <div className="acc-empty">
                            <div className="acc-empty-ic"><I name="inbox" size={28}/></div>
                            <div className="acc-empty-t">No journal entries yet</div>
                            <div className="acc-empty-d">Create a manual entry or generate from payroll</div>
                        </div>
                    ) : filtered.map(e => (
                        <div key={e.id} className={`je-entry-row${selected?.id === e.id ? " je-entry-row-sel" : ""}`}
                             onClick={() => selectEntry(e)}>
                            <div className="je-entry-left">
                                <div className="je-src-badge" style={{ background: (e.source_type === "payroll" ? "#6366f1" : "#10b981") + "18", color: e.source_type === "payroll" ? "#6366f1" : "#10b981" }}>
                                    <I name={SRC_ICON[e.source_type] || "file-text"} size={14}/>
                                </div>
                                <div>
                                    <div className="je-entry-num">JE-{e.entry_number}</div>
                                    <div className="je-entry-memo">{e.memo || "No description"}</div>
                                </div>
                            </div>
                            <div className="je-entry-right">
                                <div className="je-entry-amt acc-cell-mono">{fmtMoney(e.total_debit)}</div>
                                <div className="je-entry-status">
                                    <span className="je-status-dot" style={{ background: STATUS_CLR[e.status] || "#999" }}/>
                                    <span style={{ fontSize: 11, color: STATUS_CLR[e.status] || "#999" }}>{e.status}</span>
                                </div>
                                <div className="je-entry-date">{e.entry_date?.split("T")[0]}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Detail Panel */}
                <div className="je-detail-pane">
                    {!selected ? (
                        <div className="je-detail-empty">
                            <I name="book-open" size={36} style={{ opacity: 0.3, marginBottom: 8 }}/>
                            <div style={{ fontSize: 13 }}>Select an entry to view details</div>
                        </div>
                    ) : (
                        <div>
                            <div className="je-detail-header">
                                <div>
                                    <div className="je-detail-title">JE-{selected.entry_number}</div>
                                    <div className="je-detail-sub">{selected.entry_date?.split("T")[0]} &middot; {SRC_LABEL[selected.source_type] || selected.source_type}</div>
                                </div>
                                <div className="acc-badge" style={{ background: STATUS_CLR[selected.status] + "18", color: STATUS_CLR[selected.status] }}>
                                    {selected.status}
                                </div>
                            </div>

                            {selected.memo && <div className="je-detail-memo">{selected.memo}</div>}

                            {/* Lines Table */}
                            <table className="acc-tbl je-lines-tbl">
                                <thead>
                                <tr>
                                    <th>Account</th>
                                    <th>Description</th>
                                    <th className="acc-right">Debit</th>
                                    <th className="acc-right">Credit</th>
                                </tr>
                                </thead>
                                <tbody>
                                {lines.map(l => (
                                    <tr key={l.id}>
                                        <td>
                                            <span style={{ fontWeight: 600, fontSize: 12 }}>{l.account_code}</span>
                                            <span style={{ color: "#666", marginLeft: 6, fontSize: 12 }}>{l.account_name}</span>
                                        </td>
                                        <td style={{ color: "#888", fontSize: 12 }}>{l.description || ""}</td>
                                        <td className="acc-right acc-cell-mono" style={{ fontWeight: l.debit > 0 ? 600 : 400, color: l.debit > 0 ? "#1a1a2e" : "#ccc" }}>
                                            {l.debit > 0 ? fmtMoney(l.debit) : ""}
                                        </td>
                                        <td className="acc-right acc-cell-mono" style={{ fontWeight: l.credit > 0 ? 600 : 400, color: l.credit > 0 ? "#1a1a2e" : "#ccc" }}>
                                            {l.credit > 0 ? fmtMoney(l.credit) : ""}
                                        </td>
                                    </tr>
                                ))}
                                <tr className="je-totals-row">
                                    <td colSpan={2} style={{ fontWeight: 700 }}>TOTALS</td>
                                    <td className="acc-right acc-cell-mono" style={{ fontWeight: 700 }}>{fmtMoney(selected.total_debit)}</td>
                                    <td className="acc-right acc-cell-mono" style={{ fontWeight: 700 }}>{fmtMoney(selected.total_credit)}</td>
                                </tr>
                                </tbody>
                            </table>

                            {/* Actions */}
                            <div className="je-detail-actions">
                                {selected.status === "Draft" && (
                                    <>
                                        <button className="acc-btn-p" onClick={() => postEntry(selected.id)}><I name="check" size={14}/> Post</button>
                                        <button className="acc-btn-s" onClick={() => openEdit(selected)}><I name="edit-2" size={14}/> Edit</button>
                                        <button className="acc-btn-danger" onClick={() => deleteEntry(selected.id)}><I name="trash-2" size={14}/> Delete</button>
                                    </>
                                )}
                                {selected.status === "Posted" && (
                                    <button className="acc-btn-danger" onClick={() => voidEntry(selected.id)}><I name="x-circle" size={14}/> Void</button>
                                )}
                                {selected.status === "Voided" && selected.void_reason && (
                                    <div style={{ fontSize: 12, color: "#ef4444", fontStyle: "italic" }}>Voided: {selected.void_reason}</div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <style>{jeCSS}</style>
        </div>
    );

    /* ===== CREATE / EDIT VIEW ===== */
    function renderCreateView() {
        return (
            <div className="acc-wrap">
                {msg && <div className="je-flash">{msg}</div>}
                <div className="je-view-header">
                    <button className="je-back-btn" onClick={() => setView("list")}><I name="arrow-left" size={16}/></button>
                    <h3 className="acc-title" style={{ margin: 0 }}>{editingId ? "Edit" : "New"} Journal Entry</h3>
                </div>

                <div className="acc-card je-form-card">
                    <div className="je-form-head">
                        <div style={{ flex: 1 }}>
                            <label className="acc-label">Date</label>
                            <input type="date" className="acc-input" value={formDate} onChange={e => setFormDate(e.target.value)}/>
                        </div>
                        <div style={{ flex: 3 }}>
                            <label className="acc-label">Memo / Description</label>
                            <input className="acc-input" placeholder="e.g. Payroll for January 2026" value={formMemo} onChange={e => setFormMemo(e.target.value)}/>
                        </div>
                    </div>

                    {/* Lines */}
                    <table className="acc-tbl je-lines-tbl">
                        <thead>
                        <tr>
                            <th style={{ width: "35%" }}>Account</th>
                            <th style={{ width: "25%" }}>Description</th>
                            <th className="acc-right" style={{ width: "15%" }}>Debit</th>
                            <th className="acc-right" style={{ width: "15%" }}>Credit</th>
                            <th style={{ width: "10%" }}></th>
                        </tr>
                        </thead>
                        <tbody>
                        {formLines.map((l, i) => (
                            <tr key={i}>
                                <td>
                                    <select className="acc-input" style={{ margin: 0 }} value={l.account_id} onChange={e => updateLine(i, "account_id", e.target.value)}>
                                        <option value="">Select account...</option>
                                        {accounts.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                                    </select>
                                </td>
                                <td>
                                    <input className="acc-input" style={{ margin: 0 }} placeholder="Line desc" value={l.description} onChange={e => updateLine(i, "description", e.target.value)}/>
                                </td>
                                <td>
                                    <input type="number" min="0" step="0.01" className="acc-input" style={{ margin: 0, textAlign: "right" }}
                                           value={l.debit || ""} onChange={e => { updateLine(i, "debit", Number(e.target.value)); if (Number(e.target.value) > 0) updateLine(i, "credit", 0); }}/>
                                </td>
                                <td>
                                    <input type="number" min="0" step="0.01" className="acc-input" style={{ margin: 0, textAlign: "right" }}
                                           value={l.credit || ""} onChange={e => { updateLine(i, "credit", Number(e.target.value)); if (Number(e.target.value) > 0) updateLine(i, "debit", 0); }}/>
                                </td>
                                <td>
                                    {formLines.length > 2 && (
                                        <button className="je-icon-btn" onClick={() => removeLine(i)}><I name="x" size={14}/></button>
                                    )}
                                </td>
                            </tr>
                        ))}
                        <tr className="je-totals-row">
                            <td colSpan={2} style={{ fontWeight: 700 }}>
                                <button className="je-addline-btn" onClick={addLine}><I name="plus" size={12}/> Add Line</button>
                            </td>
                            <td className="acc-right acc-cell-mono" style={{ fontWeight: 700, color: !balanced && totalDr > 0 ? "#ef4444" : "#1a1a2e" }}>{fmtMoney(totalDr)}</td>
                            <td className="acc-right acc-cell-mono" style={{ fontWeight: 700, color: !balanced && totalCr > 0 ? "#ef4444" : "#1a1a2e" }}>{fmtMoney(totalCr)}</td>
                            <td></td>
                        </tr>
                        </tbody>
                    </table>

                    {!balanced && totalDr > 0 && (
                        <div style={{ fontSize: 12, color: "#ef4444", marginTop: 8 }}>
                            ⚠ Difference: {fmtMoney(Math.abs(totalDr - totalCr))} (must be zero)
                        </div>
                    )}

                    <div className="acc-foot-btns" style={{ justifyContent: "flex-start", marginTop: 16 }}>
                        <button className="acc-btn-primary" onClick={saveEntry} disabled={!balanced}>
                            <I name="save" size={14}/> {editingId ? "Update" : "Save"} Entry
                        </button>
                        <button className="acc-btn-cancel" onClick={() => setView("list")}>Cancel</button>
                    </div>
                </div>

                <style>{jeCSS}</style>
            </div>
        );
    }

    /* ===== MAPPING VIEW ===== */
    function renderMappingView() {
        const mappingMap = {};
        mappings.forEach(m => { mappingMap[m.mapping_key] = m; });
        const groups = [...new Set(MAPPING_DEFS.map(d => d.group))];

        return (
            <div className="acc-wrap">
                {msg && <div className="je-flash">{msg}</div>}
                <div className="je-view-header">
                    <button className="je-back-btn" onClick={() => setView("list")}><I name="arrow-left" size={16}/></button>
                    <h3 className="acc-title" style={{ margin: 0 }}>Account Mappings</h3>
                    <div style={{ marginLeft: "auto" }}>
                        <button className="acc-btn-p" onClick={autoMap} disabled={mappingLoading}>
                            <I name="zap" size={14}/> Auto-Map (BIR)
                        </button>
                    </div>
                </div>

                <div className="je-view-desc">
                    Link your payroll categories to COA accounts. Click "Auto-Map" to automatically match using BIR template account codes, then adjust as needed.
                </div>

                {groups.map(group => (
                    <div key={group} className="acc-card je-form-card">
                        <div className="je-group-title">{group}</div>
                        {MAPPING_DEFS.filter(d => d.group === group).map(def => {
                            const current = mappingMap[def.key];
                            return (
                                <div key={def.key} className="je-map-row">
                                    <div className="je-map-label">
                                        <span className="je-side-badge" style={{ background: def.side === "Dr" ? "#dbeafe" : "#fce7f3", color: def.side === "Dr" ? "#2563eb" : "#db2777" }}>{def.side}</span>
                                        {def.label}
                                    </div>
                                    <select className="acc-input" style={{ flex: 1, margin: 0, fontSize: 12 }}
                                            value={current?.account_id || ""}
                                            onChange={e => { if (e.target.value) updateMapping(def.key, e.target.value, def.label); }}>
                                        <option value="">Not mapped</option>
                                        {accounts.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                                    </select>
                                    {current && (
                                        <span style={{ fontSize: 11, color: "#22c55e" }}><I name="check" size={12}/></span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}

                <style>{jeCSS}</style>
            </div>
        );
    }

    /* ===== PAYROLL VIEW ===== */
    function renderPayrollView() {
        return (
            <div className="acc-wrap">
                {msg && <div className="je-flash">{msg}</div>}
                <div className="je-view-header">
                    <button className="je-back-btn" onClick={() => setView("list")}><I name="arrow-left" size={16}/></button>
                    <h3 className="acc-title" style={{ margin: 0 }}>Generate Journal from Payroll</h3>
                </div>

                <div className="je-view-desc">
                    Select an approved payroll run to automatically generate the journal entry with all debits and credits.
                    Make sure account mappings are configured first.
                </div>

                <div className="acc-card je-form-card">
                    <label className="acc-label">Select Payroll Run</label>
                    {payrollRuns.length === 0 ? (
                        <div className="je-list-msg">No payroll runs found. Create and compute a payroll run in the HR &gt; Payroll module first.</div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {payrollRuns.map(run => {
                                const ready = run.status === "Approved" || run.status === "Paid";
                                return (
                                    <div key={run.id} className={`je-payroll-card${selectedRun?.id === run.id ? " je-payroll-card-sel" : ""}`}
                                        style={!ready ? { opacity: 0.6 } : undefined}
                                        onClick={() => { if (ready) { setSelectedRun(run); loadPayrollTotals(run.id); } else { flash("Approve this payroll run first before generating a journal entry"); } }}>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: 13 }}>{run.period_start?.split("T")[0]} to {run.period_end?.split("T")[0]}</div>
                                            <div style={{ fontSize: 11, color: "#888" }}>
                                                {run.employee_count} employees &middot;
                                                <span style={{ color: run.status === "Approved" ? "#22c55e" : run.status === "Paid" ? "#0ea5e9" : "#f59e0b", fontWeight: 600, marginLeft: 4 }}>{run.status}</span>
                                            </div>
                                        </div>
                                        <div style={{ textAlign: "right" }}>
                                            <div style={{ fontWeight: 700, fontSize: 14 }}>{fmtMoney(run.total_gross)}</div>
                                            <div style={{ fontSize: 11, color: "#888" }}>Gross</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {payrollTotals && selectedRun && (
                        <div style={{ marginTop: 16 }}>
                            <div className="je-group-title">Preview Journal Lines</div>
                            <table className="acc-tbl je-lines-tbl">
                                <thead>
                                <tr>
                                    <th>Description</th>
                                    <th className="acc-right">Debit</th>
                                    <th className="acc-right">Credit</th>
                                </tr>
                                </thead>
                                <tbody>
                                {payrollTotals.total_gross > 0 && <tr><td>Salaries and Wages</td><td className="acc-right acc-cell-mono">{fmtMoney(payrollTotals.total_gross)}</td><td></td></tr>}
                                {payrollTotals.total_sss_er > 0 && <tr><td>SSS Expense (ER)</td><td className="acc-right acc-cell-mono">{fmtMoney(payrollTotals.total_sss_er)}</td><td></td></tr>}
                                {payrollTotals.total_philhealth_er > 0 && <tr><td>PhilHealth Expense (ER)</td><td className="acc-right acc-cell-mono">{fmtMoney(payrollTotals.total_philhealth_er)}</td><td></td></tr>}
                                {payrollTotals.total_pagibig_er > 0 && <tr><td>Pag-IBIG Expense (ER)</td><td className="acc-right acc-cell-mono">{fmtMoney(payrollTotals.total_pagibig_er)}</td><td></td></tr>}

                                {(payrollTotals.total_sss_ee + payrollTotals.total_sss_er) > 0 && <tr><td>SSS Payable (EE+ER)</td><td></td><td className="acc-right acc-cell-mono">{fmtMoney(payrollTotals.total_sss_ee + payrollTotals.total_sss_er)}</td></tr>}
                                {(payrollTotals.total_philhealth_ee + payrollTotals.total_philhealth_er) > 0 && <tr><td>PhilHealth Payable (EE+ER)</td><td></td><td className="acc-right acc-cell-mono">{fmtMoney(payrollTotals.total_philhealth_ee + payrollTotals.total_philhealth_er)}</td></tr>}
                                {(payrollTotals.total_pagibig_ee + payrollTotals.total_pagibig_er) > 0 && <tr><td>Pag-IBIG Payable (EE+ER)</td><td></td><td className="acc-right acc-cell-mono">{fmtMoney(payrollTotals.total_pagibig_ee + payrollTotals.total_pagibig_er)}</td></tr>}
                                {payrollTotals.total_tax > 0 && <tr><td>Withholding Tax Payable</td><td></td><td className="acc-right acc-cell-mono">{fmtMoney(payrollTotals.total_tax)}</td></tr>}
                                {payrollTotals.total_loan_deductions > 0 && <tr><td>Loan Deductions</td><td></td><td className="acc-right acc-cell-mono">{fmtMoney(payrollTotals.total_loan_deductions)}</td></tr>}
                                {payrollTotals.total_net_pay > 0 && <tr><td>Net Pay (Cash)</td><td></td><td className="acc-right acc-cell-mono">{fmtMoney(payrollTotals.total_net_pay)}</td></tr>}
                                </tbody>
                            </table>

                            <button className="acc-btn-primary" style={{ marginTop: 12 }} onClick={generatePayrollJournal} disabled={generating}>
                                <I name={generating ? "loader" : "file-plus"} size={14}/> {generating ? "Generating..." : "Generate Journal Entry"}
                            </button>
                        </div>
                    )}
                </div>

                <style>{jeCSS}</style>
            </div>
        );
    }
}

/* ===== PAGE-SPECIFIC STYLES (not covered by acc-layout.css) ===== */
const jeCSS = `
  .je-flash{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;padding:8px 14px;border-radius:8px;font-size:13px;margin-bottom:12px}

  /* stat cards: icon + value + label stacked, matching this page's original horizontal card */
  .acc-st{display:flex;align-items:center;gap:10px}
  .acc-st .acc-st-ic{margin-bottom:0}

  /* two-pane list + detail layout */
  .je-grid{display:grid;grid-template-columns:1fr 380px;grid-template-rows:minmax(0,1fr);gap:12px;min-height:0}
  .je-list-pane{background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden}
  .je-list-msg{text-align:center;padding:20px;color:#999;font-size:13px}
  .je-detail-pane{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;min-height:300px}
  .je-detail-empty{text-align:center;padding:60px;color:#bbb}

  .je-entry-row{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid #f3f4f6;cursor:pointer;transition:background .15s}
  .je-entry-row:hover{background:#fafffe}
  .je-entry-row-sel{background:#edf8f5}
  .je-entry-left{display:flex;align-items:center;gap:10px}
  .je-src-badge{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center}
  .je-entry-num{font-size:13px;font-weight:700;color:#1a1a2e}
  .je-entry-memo{font-size:11px;color:#888;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .je-entry-right{text-align:right}
  .je-entry-amt{font-size:13px;font-weight:700;color:#1a1a2e}
  .je-entry-status{display:flex;gap:6px;align-items:center;justify-content:flex-end}
  .je-status-dot{width:7px;height:7px;border-radius:50%;display:inline-block}
  .je-entry-date{font-size:11px;color:#aaa}

  .je-detail-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px}
  .je-detail-title{font-size:18px;font-weight:700;color:#1a1a2e}
  .je-detail-sub{font-size:12px;color:#888;margin-top:2px}
  .je-detail-memo{font-size:12px;color:#666;background:#f9fafb;border-radius:6px;padding:8px 10px;margin-bottom:12px}
  .je-detail-actions{display:flex;gap:8px;margin-top:16px}

  /* line tables: tighter than default acc-tbl for dense JE data */
  .je-lines-tbl thead th{padding:6px 8px}
  .je-lines-tbl tbody td{padding:6px 8px;border-bottom:1px solid #f3f4f6}
  .je-totals-row td{border-top:2px solid #e0e0e0}

  .je-view-header{display:flex;align-items:center;gap:10px;margin-bottom:16px}
  .je-back-btn{background:none;border:1px solid #d1d5db;border-radius:8px;padding:6px 8px;cursor:pointer;display:flex;align-items:center}
  .je-view-desc{font-size:12px;color:#888;margin:8px 0 16px;line-height:1.5}
  .je-form-card{margin-bottom:12px}
  .je-form-head{display:flex;gap:16px;margin-bottom:16px}
  .je-group-title{font-size:13px;font-weight:700;color:#1a1a2e;margin-bottom:12px}

  .je-icon-btn{background:none;border:none;cursor:pointer;color:#ef4444;padding:4px}
  .je-addline-btn{display:flex;align-items:center;gap:4px;background:none;border:1px dashed #d1d5db;border-radius:6px;padding:6px 12px;font-size:12px;color:#2d9e8b;cursor:pointer;font-weight:600}

  .je-map-row{display:flex;align-items:center;gap:12px;margin-bottom:8px}
  .je-map-label{width:220px;font-size:12px;color:#555}
  .je-side-badge{display:inline-block;padding:1px 5px;border-radius:4px;font-size:10px;font-weight:700;margin-right:6px}

  .je-payroll-card{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer;transition:all .15s}
  .je-payroll-card-sel{border:2px solid #2d9e8b;background:#edf8f5}

  @media(max-width:900px){.je-grid{grid-template-columns:1fr}}
`;
