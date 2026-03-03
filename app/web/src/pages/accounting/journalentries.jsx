import { useState, useEffect, useCallback, useMemo } from "react";
import { I } from "../../layouts/ERPLayout";

const API = "http://localhost:8080/api/execute";
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
        <div style={{ padding: "0 0 20px" }}>
            {msg && <div style={styles.flash}>{msg}</div>}

            {/* Stats Bar */}
            <div style={styles.statsBar}>
                {[
                    { label: "Total Entries", val: stats.total, icon: "file-text", clr: "#10b981" },
                    { label: "Draft", val: stats.draft, icon: "edit-3", clr: "#f59e0b" },
                    { label: "Posted", val: stats.posted, icon: "check-circle", clr: "#22c55e" },
                    { label: "Total Posted", val: fmtMoney(stats.totalPosted), icon: "trending-up", clr: "#6366f1" },
                ].map(s => (
                    <div key={s.label} style={styles.statCard}>
                        <div style={{ ...styles.statIcon, background: s.clr + "18", color: s.clr }}><I name={s.icon} size={18}/></div>
                        <div><div style={styles.statVal}>{s.val}</div><div style={styles.statLbl}>{s.label}</div></div>
                    </div>
                ))}
            </div>

            {/* Toolbar */}
            <div style={styles.toolbar}>
                <div style={styles.toolLeft}>
                    <div style={styles.searchWrap}>
                        <I name="search" size={14} style={{ color: "#999", position: "absolute", left: 10, top: 9 }}/>
                        <input style={styles.searchInput} placeholder="Search entries..." value={search} onChange={e => setSearch(e.target.value)}/>
                    </div>
                    <select style={styles.filterSel} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                        <option value="">All Status</option>
                        <option value="Draft">Draft</option>
                        <option value="Posted">Posted</option>
                        <option value="Voided">Voided</option>
                    </select>
                    <select style={styles.filterSel} value={filterSource} onChange={e => setFilterSource(e.target.value)}>
                        <option value="">All Sources</option>
                        <option value="manual">Manual</option>
                        <option value="payroll">Payroll</option>
                        <option value="loan">Loan</option>
                    </select>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button style={styles.btnOutline} onClick={() => { setView("mapping"); loadMappings(); }}>
                        <I name="link" size={14}/> Mappings
                    </button>
                    <button style={styles.btnOutline} onClick={() => { setView("payroll"); loadPayrollRuns(); }}>
                        <I name="users" size={14}/> From Payroll
                    </button>
                    <button style={styles.btnPrimary} onClick={openCreate}>
                        <I name="plus" size={14}/> New Entry
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div style={styles.mainGrid}>
                {/* Entry List */}
                <div style={styles.listPane}>
                    {loading ? (
                        <div style={{ textAlign: "center", padding: 40, color: "#999" }}>Loading...</div>
                    ) : filtered.length === 0 ? (
                        <div style={{ textAlign: "center", padding: 40, color: "#aaa" }}>
                            <I name="inbox" size={32} style={{ marginBottom: 8, opacity: 0.4 }}/>
                            <div>No journal entries yet</div>
                            <div style={{ fontSize: 12, marginTop: 4 }}>Create a manual entry or generate from payroll</div>
                        </div>
                    ) : filtered.map(e => (
                        <div key={e.id} style={{ ...styles.entryRow, ...(selected?.id === e.id ? styles.entryRowSel : {}) }}
                             onClick={() => selectEntry(e)}>
                            <div style={styles.entryLeft}>
                                <div style={{ ...styles.srcBadge, background: (e.source_type === "payroll" ? "#6366f1" : "#10b981") + "18", color: e.source_type === "payroll" ? "#6366f1" : "#10b981" }}>
                                    <I name={SRC_ICON[e.source_type] || "file-text"} size={14}/>
                                </div>
                                <div>
                                    <div style={styles.entryNum}>JE-{e.entry_number}</div>
                                    <div style={styles.entryMemo}>{e.memo || "No description"}</div>
                                </div>
                            </div>
                            <div style={styles.entryRight}>
                                <div style={styles.entryAmt}>{fmtMoney(e.total_debit)}</div>
                                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                    <span style={{ ...styles.statusDot, background: STATUS_CLR[e.status] || "#999" }}/>
                                    <span style={{ fontSize: 11, color: STATUS_CLR[e.status] || "#999" }}>{e.status}</span>
                                </div>
                                <div style={styles.entryDate}>{e.entry_date?.split("T")[0]}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Detail Panel */}
                <div style={styles.detailPane}>
                    {!selected ? (
                        <div style={{ textAlign: "center", padding: 60, color: "#bbb" }}>
                            <I name="book-open" size={36} style={{ opacity: 0.3, marginBottom: 8 }}/>
                            <div style={{ fontSize: 13 }}>Select an entry to view details</div>
                        </div>
                    ) : (
                        <div>
                            <div style={styles.detailHeader}>
                                <div>
                                    <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a2e" }}>JE-{selected.entry_number}</div>
                                    <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{selected.entry_date?.split("T")[0]} &middot; {SRC_LABEL[selected.source_type] || selected.source_type}</div>
                                </div>
                                <div style={{ ...styles.statusBadge, background: STATUS_CLR[selected.status] + "18", color: STATUS_CLR[selected.status] }}>
                                    {selected.status}
                                </div>
                            </div>

                            {selected.memo && <div style={styles.detailMemo}>{selected.memo}</div>}

                            {/* Lines Table */}
                            <table style={styles.linesTable}>
                                <thead>
                                <tr>
                                    <th style={styles.th}>Account</th>
                                    <th style={styles.th}>Description</th>
                                    <th style={{ ...styles.th, textAlign: "right" }}>Debit</th>
                                    <th style={{ ...styles.th, textAlign: "right" }}>Credit</th>
                                </tr>
                                </thead>
                                <tbody>
                                {lines.map(l => (
                                    <tr key={l.id}>
                                        <td style={styles.td}>
                                            <span style={{ fontWeight: 600, fontSize: 12 }}>{l.account_code}</span>
                                            <span style={{ color: "#666", marginLeft: 6, fontSize: 12 }}>{l.account_name}</span>
                                        </td>
                                        <td style={{ ...styles.td, color: "#888", fontSize: 12 }}>{l.description || ""}</td>
                                        <td style={{ ...styles.td, textAlign: "right", fontWeight: l.debit > 0 ? 600 : 400, color: l.debit > 0 ? "#1a1a2e" : "#ccc" }}>
                                            {l.debit > 0 ? fmtMoney(l.debit) : ""}
                                        </td>
                                        <td style={{ ...styles.td, textAlign: "right", fontWeight: l.credit > 0 ? 600 : 400, color: l.credit > 0 ? "#1a1a2e" : "#ccc" }}>
                                            {l.credit > 0 ? fmtMoney(l.credit) : ""}
                                        </td>
                                    </tr>
                                ))}
                                <tr style={{ borderTop: "2px solid #e0e0e0" }}>
                                    <td colSpan={2} style={{ ...styles.td, fontWeight: 700 }}>TOTALS</td>
                                    <td style={{ ...styles.td, textAlign: "right", fontWeight: 700 }}>{fmtMoney(selected.total_debit)}</td>
                                    <td style={{ ...styles.td, textAlign: "right", fontWeight: 700 }}>{fmtMoney(selected.total_credit)}</td>
                                </tr>
                                </tbody>
                            </table>

                            {/* Actions */}
                            <div style={styles.detailActions}>
                                {selected.status === "Draft" && (
                                    <>
                                        <button style={styles.btnPrimary} onClick={() => postEntry(selected.id)}><I name="check" size={14}/> Post</button>
                                        <button style={styles.btnOutline} onClick={() => openEdit(selected)}><I name="edit-2" size={14}/> Edit</button>
                                        <button style={{ ...styles.btnOutline, color: "#ef4444", borderColor: "#fca5a5" }} onClick={() => deleteEntry(selected.id)}><I name="trash-2" size={14}/> Delete</button>
                                    </>
                                )}
                                {selected.status === "Posted" && (
                                    <button style={{ ...styles.btnOutline, color: "#ef4444", borderColor: "#fca5a5" }} onClick={() => voidEntry(selected.id)}><I name="x-circle" size={14}/> Void</button>
                                )}
                                {selected.status === "Voided" && selected.void_reason && (
                                    <div style={{ fontSize: 12, color: "#ef4444", fontStyle: "italic" }}>Voided: {selected.void_reason}</div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    /* ===== CREATE / EDIT VIEW ===== */
    function renderCreateView() {
        return (
            <div style={{ padding: "0 0 20px" }}>
                {msg && <div style={styles.flash}>{msg}</div>}
                <div style={styles.viewHeader}>
                    <button style={styles.backBtn} onClick={() => setView("list")}><I name="arrow-left" size={16}/></button>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1a1a2e" }}>{editingId ? "Edit" : "New"} Journal Entry</h3>
                </div>

                <div style={styles.formCard}>
                    <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
                        <div style={{ flex: 1 }}>
                            <label style={styles.label}>Date</label>
                            <input type="date" style={styles.input} value={formDate} onChange={e => setFormDate(e.target.value)}/>
                        </div>
                        <div style={{ flex: 3 }}>
                            <label style={styles.label}>Memo / Description</label>
                            <input style={styles.input} placeholder="e.g. Payroll for January 2026" value={formMemo} onChange={e => setFormMemo(e.target.value)}/>
                        </div>
                    </div>

                    {/* Lines */}
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                        <tr>
                            <th style={{ ...styles.th, width: "35%" }}>Account</th>
                            <th style={{ ...styles.th, width: "25%" }}>Description</th>
                            <th style={{ ...styles.th, width: "15%", textAlign: "right" }}>Debit</th>
                            <th style={{ ...styles.th, width: "15%", textAlign: "right" }}>Credit</th>
                            <th style={{ ...styles.th, width: "10%" }}></th>
                        </tr>
                        </thead>
                        <tbody>
                        {formLines.map((l, i) => (
                            <tr key={i}>
                                <td style={styles.td}>
                                    <select style={{ ...styles.input, margin: 0 }} value={l.account_id} onChange={e => updateLine(i, "account_id", e.target.value)}>
                                        <option value="">Select account...</option>
                                        {accounts.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                                    </select>
                                </td>
                                <td style={styles.td}>
                                    <input style={{ ...styles.input, margin: 0 }} placeholder="Line desc" value={l.description} onChange={e => updateLine(i, "description", e.target.value)}/>
                                </td>
                                <td style={styles.td}>
                                    <input type="number" min="0" step="0.01" style={{ ...styles.input, margin: 0, textAlign: "right" }}
                                           value={l.debit || ""} onChange={e => { updateLine(i, "debit", Number(e.target.value)); if (Number(e.target.value) > 0) updateLine(i, "credit", 0); }}/>
                                </td>
                                <td style={styles.td}>
                                    <input type="number" min="0" step="0.01" style={{ ...styles.input, margin: 0, textAlign: "right" }}
                                           value={l.credit || ""} onChange={e => { updateLine(i, "credit", Number(e.target.value)); if (Number(e.target.value) > 0) updateLine(i, "debit", 0); }}/>
                                </td>
                                <td style={styles.td}>
                                    {formLines.length > 2 && (
                                        <button style={styles.iconBtn} onClick={() => removeLine(i)}><I name="x" size={14}/></button>
                                    )}
                                </td>
                            </tr>
                        ))}
                        <tr style={{ borderTop: "2px solid #e0e0e0" }}>
                            <td colSpan={2} style={{ ...styles.td, fontWeight: 700 }}>
                                <button style={styles.addLineBtn} onClick={addLine}><I name="plus" size={12}/> Add Line</button>
                            </td>
                            <td style={{ ...styles.td, textAlign: "right", fontWeight: 700, color: !balanced && totalDr > 0 ? "#ef4444" : "#1a1a2e" }}>{fmtMoney(totalDr)}</td>
                            <td style={{ ...styles.td, textAlign: "right", fontWeight: 700, color: !balanced && totalCr > 0 ? "#ef4444" : "#1a1a2e" }}>{fmtMoney(totalCr)}</td>
                            <td style={styles.td}></td>
                        </tr>
                        </tbody>
                    </table>

                    {!balanced && totalDr > 0 && (
                        <div style={{ fontSize: 12, color: "#ef4444", marginTop: 8 }}>
                            ⚠ Difference: {fmtMoney(Math.abs(totalDr - totalCr))} (must be zero)
                        </div>
                    )}

                    <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                        <button style={styles.btnPrimary} onClick={saveEntry} disabled={!balanced}>
                            <I name="save" size={14}/> {editingId ? "Update" : "Save"} Entry
                        </button>
                        <button style={styles.btnOutline} onClick={() => setView("list")}>Cancel</button>
                    </div>
                </div>
            </div>
        );
    }

    /* ===== MAPPING VIEW ===== */
    function renderMappingView() {
        const mappingMap = {};
        mappings.forEach(m => { mappingMap[m.mapping_key] = m; });
        const groups = [...new Set(MAPPING_DEFS.map(d => d.group))];

        return (
            <div style={{ padding: "0 0 20px" }}>
                {msg && <div style={styles.flash}>{msg}</div>}
                <div style={styles.viewHeader}>
                    <button style={styles.backBtn} onClick={() => setView("list")}><I name="arrow-left" size={16}/></button>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1a1a2e" }}>Account Mappings</h3>
                    <div style={{ marginLeft: "auto" }}>
                        <button style={styles.btnPrimary} onClick={autoMap} disabled={mappingLoading}>
                            <I name="zap" size={14}/> Auto-Map (BIR)
                        </button>
                    </div>
                </div>

                <div style={{ fontSize: 12, color: "#888", margin: "8px 0 16px", lineHeight: 1.5 }}>
                    Link your payroll categories to COA accounts. Click "Auto-Map" to automatically match using BIR template account codes, then adjust as needed.
                </div>

                {groups.map(group => (
                    <div key={group} style={styles.formCard}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e", marginBottom: 12 }}>{group}</div>
                        {MAPPING_DEFS.filter(d => d.group === group).map(def => {
                            const current = mappingMap[def.key];
                            return (
                                <div key={def.key} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                                    <div style={{ width: 220, fontSize: 12, color: "#555" }}>
                                        <span style={{ ...styles.sideBadge, background: def.side === "Dr" ? "#dbeafe" : "#fce7f3", color: def.side === "Dr" ? "#2563eb" : "#db2777" }}>{def.side}</span>
                                        {def.label}
                                    </div>
                                    <select style={{ ...styles.input, flex: 1, margin: 0, fontSize: 12 }}
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
            </div>
        );
    }

    /* ===== PAYROLL VIEW ===== */
    function renderPayrollView() {
        return (
            <div style={{ padding: "0 0 20px" }}>
                {msg && <div style={styles.flash}>{msg}</div>}
                <div style={styles.viewHeader}>
                    <button style={styles.backBtn} onClick={() => setView("list")}><I name="arrow-left" size={16}/></button>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1a1a2e" }}>Generate Journal from Payroll</h3>
                </div>

                <div style={{ fontSize: 12, color: "#888", margin: "8px 0 16px", lineHeight: 1.5 }}>
                    Select an approved payroll run to automatically generate the journal entry with all debits and credits.
                    Make sure account mappings are configured first.
                </div>

                <div style={styles.formCard}>
                    <label style={styles.label}>Select Payroll Run</label>
                    {payrollRuns.length === 0 ? (
                        <div style={{ color: "#aaa", fontSize: 13, padding: 20, textAlign: "center" }}>No payroll runs found. Create and compute a payroll run in the HR &gt; Payroll module first.</div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {payrollRuns.map(run => {
                                const ready = run.status === "Approved" || run.status === "Paid";
                                return (
                                    <div key={run.id} style={{
                                        ...styles.payrollCard,
                                        ...(selectedRun?.id === run.id ? { border: "2px solid #10b981", background: "#f0fdf4" } : {}),
                                        ...(!ready ? { opacity: 0.6 } : {}),
                                    }} onClick={() => { if (ready) { setSelectedRun(run); loadPayrollTotals(run.id); } else { flash("Approve this payroll run first before generating a journal entry"); } }}>
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
                            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "#1a1a2e" }}>Preview Journal Lines</div>
                            <table style={styles.linesTable}>
                                <thead>
                                <tr>
                                    <th style={styles.th}>Description</th>
                                    <th style={{ ...styles.th, textAlign: "right" }}>Debit</th>
                                    <th style={{ ...styles.th, textAlign: "right" }}>Credit</th>
                                </tr>
                                </thead>
                                <tbody>
                                {payrollTotals.total_gross > 0 && <tr><td style={styles.td}>Salaries and Wages</td><td style={{ ...styles.td, textAlign: "right" }}>{fmtMoney(payrollTotals.total_gross)}</td><td style={styles.td}></td></tr>}
                                {payrollTotals.total_sss_er > 0 && <tr><td style={styles.td}>SSS Expense (ER)</td><td style={{ ...styles.td, textAlign: "right" }}>{fmtMoney(payrollTotals.total_sss_er)}</td><td style={styles.td}></td></tr>}
                                {payrollTotals.total_philhealth_er > 0 && <tr><td style={styles.td}>PhilHealth Expense (ER)</td><td style={{ ...styles.td, textAlign: "right" }}>{fmtMoney(payrollTotals.total_philhealth_er)}</td><td style={styles.td}></td></tr>}
                                {payrollTotals.total_pagibig_er > 0 && <tr><td style={styles.td}>Pag-IBIG Expense (ER)</td><td style={{ ...styles.td, textAlign: "right" }}>{fmtMoney(payrollTotals.total_pagibig_er)}</td><td style={styles.td}></td></tr>}

                                {(payrollTotals.total_sss_ee + payrollTotals.total_sss_er) > 0 && <tr><td style={styles.td}>SSS Payable (EE+ER)</td><td style={styles.td}></td><td style={{ ...styles.td, textAlign: "right" }}>{fmtMoney(payrollTotals.total_sss_ee + payrollTotals.total_sss_er)}</td></tr>}
                                {(payrollTotals.total_philhealth_ee + payrollTotals.total_philhealth_er) > 0 && <tr><td style={styles.td}>PhilHealth Payable (EE+ER)</td><td style={styles.td}></td><td style={{ ...styles.td, textAlign: "right" }}>{fmtMoney(payrollTotals.total_philhealth_ee + payrollTotals.total_philhealth_er)}</td></tr>}
                                {(payrollTotals.total_pagibig_ee + payrollTotals.total_pagibig_er) > 0 && <tr><td style={styles.td}>Pag-IBIG Payable (EE+ER)</td><td style={styles.td}></td><td style={{ ...styles.td, textAlign: "right" }}>{fmtMoney(payrollTotals.total_pagibig_ee + payrollTotals.total_pagibig_er)}</td></tr>}
                                {payrollTotals.total_tax > 0 && <tr><td style={styles.td}>Withholding Tax Payable</td><td style={styles.td}></td><td style={{ ...styles.td, textAlign: "right" }}>{fmtMoney(payrollTotals.total_tax)}</td></tr>}
                                {payrollTotals.total_loan_deductions > 0 && <tr><td style={styles.td}>Loan Deductions</td><td style={styles.td}></td><td style={{ ...styles.td, textAlign: "right" }}>{fmtMoney(payrollTotals.total_loan_deductions)}</td></tr>}
                                {payrollTotals.total_net_pay > 0 && <tr><td style={styles.td}>Net Pay (Cash)</td><td style={styles.td}></td><td style={{ ...styles.td, textAlign: "right" }}>{fmtMoney(payrollTotals.total_net_pay)}</td></tr>}
                                </tbody>
                            </table>

                            <button style={{ ...styles.btnPrimary, marginTop: 12 }} onClick={generatePayrollJournal} disabled={generating}>
                                <I name={generating ? "loader" : "file-plus"} size={14}/> {generating ? "Generating..." : "Generate Journal Entry"}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }
}

/* ===== STYLES ===== */
const styles = {
    flash: { background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46", padding: "8px 14px", borderRadius: 8, fontSize: 13, marginBottom: 12 },
    statsBar: { display: "flex", gap: 12, marginBottom: 16 },
    statCard: { flex: 1, display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "12px 14px" },
    statIcon: { width: 36, height: 36, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" },
    statVal: { fontSize: 16, fontWeight: 700, color: "#1a1a2e" },
    statLbl: { fontSize: 11, color: "#888" },
    toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
    toolLeft: { display: "flex", gap: 8, alignItems: "center" },
    searchWrap: { position: "relative" },
    searchInput: { padding: "7px 10px 7px 30px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, width: 200, outline: "none" },
    filterSel: { padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 12, background: "#fff", cursor: "pointer" },
    btnPrimary: { display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#10b981", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" },
    btnOutline: { display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#fff", color: "#374151", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer" },
    mainGrid: { display: "grid", gridTemplateColumns: "1fr 380px", gap: 12 },
    listPane: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" },
    detailPane: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, minHeight: 300 },
    entryRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #f3f4f6", cursor: "pointer", transition: "background 0.15s" },
    entryRowSel: { background: "#f0fdf4" },
    entryLeft: { display: "flex", alignItems: "center", gap: 10 },
    srcBadge: { width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" },
    entryNum: { fontSize: 13, fontWeight: 700, color: "#1a1a2e" },
    entryMemo: { fontSize: 11, color: "#888", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    entryRight: { textAlign: "right" },
    entryAmt: { fontSize: 13, fontWeight: 700, color: "#1a1a2e" },
    entryDate: { fontSize: 11, color: "#aaa" },
    statusDot: { width: 7, height: 7, borderRadius: "50%", display: "inline-block" },
    detailHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
    statusBadge: { padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700 },
    detailMemo: { fontSize: 12, color: "#666", background: "#f9fafb", borderRadius: 6, padding: "8px 10px", marginBottom: 12 },
    linesTable: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
    th: { textAlign: "left", padding: "6px 8px", fontSize: 11, fontWeight: 600, color: "#888", borderBottom: "1px solid #e5e7eb" },
    td: { padding: "6px 8px", borderBottom: "1px solid #f3f4f6" },
    detailActions: { display: "flex", gap: 8, marginTop: 16 },
    viewHeader: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16 },
    backBtn: { background: "none", border: "1px solid #d1d5db", borderRadius: 8, padding: "6px 8px", cursor: "pointer", display: "flex", alignItems: "center" },
    formCard: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, marginBottom: 12 },
    label: { display: "block", fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 4 },
    input: { width: "100%", padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" },
    iconBtn: { background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 4 },
    addLineBtn: { display: "flex", alignItems: "center", gap: 4, background: "none", border: "1px dashed #d1d5db", borderRadius: 6, padding: "6px 12px", fontSize: 12, color: "#10b981", cursor: "pointer", fontWeight: 600 },
    sideBadge: { display: "inline-block", padding: "1px 5px", borderRadius: 4, fontSize: 10, fontWeight: 700, marginRight: 6 },
    payrollCard: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", border: "1px solid #e5e7eb", borderRadius: 8, cursor: "pointer", transition: "all 0.15s" },
};
