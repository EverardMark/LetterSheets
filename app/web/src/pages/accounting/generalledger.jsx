import { useState, useEffect, useCallback, useMemo } from "react";
import { I } from "../../layouts/ERPLayout";

const API = "/api/execute";
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

const TYPE_CLR = {
    Asset: "#0ea5e9", Liability: "#ef4444", Equity: "#8b5cf6",
    Revenue: "#22c55e", Expense: "#f59e0b",
};
const TYPE_ICON = {
    Asset: "trending-up", Liability: "alert-circle", Equity: "shield",
    Revenue: "dollar-sign", Expense: "credit-card",
};

export default function GeneralLedger() {
    const [view, setView] = useState("trial"); // trial | account
    const [trialData, setTrialData] = useState([]);
    const [summary, setSummary] = useState(null);
    const [typeSummary, setTypeSummary] = useState([]);
    const [loading, setLoading] = useState(false);
    const [typeFilter, setTypeFilter] = useState("All");
    const [search, setSearch] = useState("");

    // Date range
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const [dateFrom, setDateFrom] = useState(`${y}-${m}-01`);
    const [dateTo, setDateTo] = useState(now.toISOString().split("T")[0]);

    // Account drill-down
    const [acctDetail, setAcctDetail] = useState(null); // selected account info
    const [ledgerTxns, setLedgerTxns] = useState([]);
    const [openingBal, setOpeningBal] = useState(0);
    const [acctLoading, setAcctLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        const params = { date_from: dateFrom, date_to: dateTo };
        try {
            const tb = await api("get_trial_balance", params);
            setTrialData(Array.isArray(tb) ? tb : []);
        } catch (e) { console.error("trial balance:", e); setTrialData([]); }
        try {
            const s = await api("get_ledger_summary", params);
            setSummary(s?.period || null);
            setTypeSummary(Array.isArray(s?.types) ? s.types : []);
        } catch (e) { console.error("summary:", e); }
        setLoading(false);
    }, [dateFrom, dateTo]);

    useEffect(() => { load(); }, [load]);

    /* Quick period presets */
    const setPeriod = (preset) => {
        const d = new Date();
        const yr = d.getFullYear();
        const mo = d.getMonth();
        if (preset === "month") {
            setDateFrom(`${yr}-${String(mo + 1).padStart(2, "0")}-01`);
            setDateTo(d.toISOString().split("T")[0]);
        } else if (preset === "quarter") {
            const qStart = Math.floor(mo / 3) * 3;
            setDateFrom(`${yr}-${String(qStart + 1).padStart(2, "0")}-01`);
            setDateTo(d.toISOString().split("T")[0]);
        } else if (preset === "year") {
            setDateFrom(`${yr}-01-01`);
            setDateTo(d.toISOString().split("T")[0]);
        } else if (preset === "all") {
            setDateFrom("");
            setDateTo("");
        }
    };

    /* Filter trial balance */
    const filtered = useMemo(() => {
        let r = trialData;
        if (typeFilter !== "All") r = r.filter(t => t.account_type === typeFilter);
        if (search) {
            const s = search.toLowerCase();
            r = r.filter(t => t.code.toLowerCase().includes(s) || t.name.toLowerCase().includes(s));
        }
        return r;
    }, [trialData, typeFilter, search]);

    /* Group by type */
    const grouped = useMemo(() => {
        const g = {};
        const order = ["Asset", "Liability", "Equity", "Revenue", "Expense"];
        order.forEach(t => { g[t] = []; });
        filtered.forEach(row => {
            if (g[row.account_type]) g[row.account_type].push(row);
        });
        return Object.entries(g).filter(([, rows]) => rows.length > 0);
    }, [filtered]);

    /* Trial balance totals */
    const tbTotals = useMemo(() => {
        const drAccts = filtered.filter(r => r.normal_balance === "Debit");
        const crAccts = filtered.filter(r => r.normal_balance === "Credit");
        const drBal = drAccts.reduce((s, r) => s + r.total_debit - r.total_credit, 0);
        const crBal = crAccts.reduce((s, r) => s + r.total_credit - r.total_debit, 0);
        return {
            totalDr: filtered.reduce((s, r) => s + r.total_debit, 0),
            totalCr: filtered.reduce((s, r) => s + r.total_credit, 0),
            drBalance: drBal,
            crBalance: crBal,
            balanced: Math.abs(drBal - crBal) < 0.01,
        };
    }, [filtered]);

    /* Drill into account */
    const openAccount = async (row) => {
        setAcctDetail(row);
        setView("account");
        setAcctLoading(true);
        try {
            const data = await api("get_account_ledger", { account_id: row.id, date_from: dateFrom, date_to: dateTo });
            setLedgerTxns(Array.isArray(data?.transactions) ? data.transactions : []);
            setOpeningBal(data?.opening_balance || 0);
        } catch (e) { console.error(e); setLedgerTxns([]); setOpeningBal(0); }
        setAcctLoading(false);
    };

    /* Running balance for account ledger */
    const ledgerWithBalance = useMemo(() => {
        if (!acctDetail) return [];
        const isDebit = acctDetail.normal_balance === "Debit";
        let bal = openingBal;
        return ledgerTxns.map(t => {
            bal += isDebit ? (t.debit - t.credit) : (t.credit - t.debit);
            return { ...t, running_balance: bal };
        });
    }, [ledgerTxns, openingBal, acctDetail]);

    /* ===== ACCOUNT LEDGER VIEW ===== */
    if (view === "account" && acctDetail) {
        const closingBal = ledgerWithBalance.length > 0
            ? ledgerWithBalance[ledgerWithBalance.length - 1].running_balance
            : openingBal;
        const totalDr = ledgerTxns.reduce((s, t) => s + t.debit, 0);
        const totalCr = ledgerTxns.reduce((s, t) => s + t.credit, 0);

        return (
            <div style={{ padding: "0 0 20px" }}>
                {/* Header */}
                <div style={S.viewHeader}>
                    <button style={S.backBtn} onClick={() => setView("trial")}><I name="arrow-left" size={16}/></button>
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a2e" }}>
                            <span style={{ color: TYPE_CLR[acctDetail.account_type], marginRight: 6 }}>{acctDetail.code}</span>
                            {acctDetail.name}
                        </div>
                        <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                            {acctDetail.account_type} &middot; {acctDetail.account_subtype} &middot; Normal: {acctDetail.normal_balance}
                            {dateFrom && <span> &middot; {dateFrom} to {dateTo}</span>}
                        </div>
                    </div>
                </div>

                {/* Summary cards */}
                <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                    {[
                        { label: "Opening Balance", val: fmtMoney(openingBal), clr: "#6366f1" },
                        { label: "Total Debits", val: fmtMoney(totalDr), clr: "#0ea5e9" },
                        { label: "Total Credits", val: fmtMoney(totalCr), clr: "#ef4444" },
                        { label: "Closing Balance", val: fmtMoney(closingBal), clr: "#10b981" },
                    ].map(c => (
                        <div key={c.label} style={S.statCard}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: c.clr }}>{c.val}</div>
                            <div style={{ fontSize: 11, color: "#888" }}>{c.label}</div>
                        </div>
                    ))}
                </div>

                {/* Transactions table */}
                <div style={S.tableWrap}>
                    {acctLoading ? (
                        <div style={{ textAlign: "center", padding: 40, color: "#999" }}>Loading...</div>
                    ) : ledgerWithBalance.length === 0 ? (
                        <div style={{ textAlign: "center", padding: 40, color: "#aaa" }}>
                            <I name="inbox" size={28} style={{ opacity: 0.3, marginBottom: 6 }}/>
                            <div>No posted transactions for this period</div>
                        </div>
                    ) : (
                        <table style={S.table}>
                            <thead>
                            <tr>
                                <th style={S.th}>Date</th>
                                <th style={S.th}>JE #</th>
                                <th style={S.th}>Description</th>
                                <th style={S.th}>Source</th>
                                <th style={{ ...S.th, textAlign: "right" }}>Debit</th>
                                <th style={{ ...S.th, textAlign: "right" }}>Credit</th>
                                <th style={{ ...S.th, textAlign: "right" }}>Balance</th>
                            </tr>
                            </thead>
                            <tbody>
                            {/* Opening balance row */}
                            {openingBal !== 0 && (
                                <tr style={{ background: "#f9fafb" }}>
                                    <td style={S.td} colSpan={4}><em style={{ color: "#888" }}>Opening Balance</em></td>
                                    <td style={S.td}></td>
                                    <td style={S.td}></td>
                                    <td style={{ ...S.td, textAlign: "right", fontWeight: 700 }}>{fmtMoney(openingBal)}</td>
                                </tr>
                            )}
                            {ledgerWithBalance.map((t, i) => (
                                <tr key={t.line_id || i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                                    <td style={S.td}>{t.entry_date?.split("T")[0]}</td>
                                    <td style={S.td}>
                                        <span style={{ fontWeight: 600, color: "#6366f1", fontSize: 12 }}>JE-{t.entry_number}</span>
                                    </td>
                                    <td style={{ ...S.td, maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis" }}>
                                        {t.line_description || t.memo || ""}
                                    </td>
                                    <td style={S.td}>
                      <span style={{ ...S.srcPill, background: (t.source_type === "payroll" ? "#6366f1" : "#10b981") + "15", color: t.source_type === "payroll" ? "#6366f1" : "#10b981" }}>
                        {t.source_type}
                      </span>
                                    </td>
                                    <td style={{ ...S.td, textAlign: "right", color: t.debit > 0 ? "#1a1a2e" : "#ddd" }}>
                                        {t.debit > 0 ? fmtMoney(t.debit) : ""}
                                    </td>
                                    <td style={{ ...S.td, textAlign: "right", color: t.credit > 0 ? "#1a1a2e" : "#ddd" }}>
                                        {t.credit > 0 ? fmtMoney(t.credit) : ""}
                                    </td>
                                    <td style={{ ...S.td, textAlign: "right", fontWeight: 600 }}>{fmtMoney(t.running_balance)}</td>
                                </tr>
                            ))}
                            {/* Closing row */}
                            <tr style={{ borderTop: "2px solid #d1d5db", background: "#f0fdf4" }}>
                                <td style={S.td} colSpan={4}><strong>Closing Balance</strong></td>
                                <td style={{ ...S.td, textAlign: "right", fontWeight: 700 }}>{fmtMoney(totalDr)}</td>
                                <td style={{ ...S.td, textAlign: "right", fontWeight: 700 }}>{fmtMoney(totalCr)}</td>
                                <td style={{ ...S.td, textAlign: "right", fontWeight: 700, color: "#10b981" }}>{fmtMoney(closingBal)}</td>
                            </tr>
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        );
    }

    /* ===== TRIAL BALANCE VIEW (DEFAULT) ===== */
    return (
        <div style={{ padding: "0 0 20px" }}>
            {/* Stats */}
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                {[
                    { label: "Posted Entries", val: summary?.total_posted || 0, icon: "file-text", clr: "#10b981" },
                    { label: "Period Entries", val: summary?.entry_count || 0, icon: "calendar", clr: "#6366f1" },
                    { label: "Total Debits", val: fmtMoney(summary?.total_debits || 0), icon: "arrow-up-right", clr: "#0ea5e9" },
                    { label: "Total Credits", val: fmtMoney(summary?.total_credits || 0), icon: "arrow-down-left", clr: "#ef4444" },
                ].map(s => (
                    <div key={s.label} style={S.statCard}>
                        <div style={{ ...S.statIcon, background: s.clr + "18", color: s.clr }}><I name={s.icon} size={16}/></div>
                        <div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a2e" }}>{s.val}</div>
                            <div style={{ fontSize: 11, color: "#888" }}>{s.label}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Type breakdown bar */}
            {typeSummary.length > 0 && (
                <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
                    {typeSummary.map(t => (
                        <div key={t.account_type} style={{
                            ...S.typeChip,
                            borderColor: TYPE_CLR[t.account_type] + "44",
                            background: TYPE_CLR[t.account_type] + "08",
                            cursor: "pointer",
                            ...(typeFilter === t.account_type ? { borderColor: TYPE_CLR[t.account_type], background: TYPE_CLR[t.account_type] + "18" } : {}),
                        }} onClick={() => setTypeFilter(typeFilter === t.account_type ? "All" : t.account_type)}>
                            <I name={TYPE_ICON[t.account_type]} size={13} style={{ color: TYPE_CLR[t.account_type] }}/>
                            <span style={{ fontWeight: 600, color: "#1a1a2e" }}>{t.account_type}</span>
                            <span style={{ color: "#888" }}>{t.account_count} accts</span>
                            <span style={{ fontWeight: 600, color: TYPE_CLR[t.account_type] }}>{fmtMoney(t.total_balance)}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Toolbar */}
            <div style={S.toolbar}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ position: "relative" }}>
                        <I name="search" size={14} style={{ color: "#999", position: "absolute", left: 10, top: 9 }}/>
                        <input style={S.searchInput} placeholder="Search accounts..." value={search} onChange={e => setSearch(e.target.value)}/>
                    </div>
                    <input type="date" style={S.dateInput} value={dateFrom} onChange={e => setDateFrom(e.target.value)}/>
                    <span style={{ color: "#ccc" }}>to</span>
                    <input type="date" style={S.dateInput} value={dateTo} onChange={e => setDateTo(e.target.value)}/>
                    <button style={S.btnSmall} onClick={() => load()}><I name="refresh-cw" size={13}/></button>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                    {["month", "quarter", "year", "all"].map(p => (
                        <button key={p} style={S.periodBtn} onClick={() => setPeriod(p)}>
                            {p === "all" ? "All Time" : p.charAt(0).toUpperCase() + p.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Trial Balance Table */}
            <div style={S.tableWrap}>
                {loading ? (
                    <div style={{ textAlign: "center", padding: 40, color: "#999" }}>Loading...</div>
                ) : grouped.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 50, color: "#aaa" }}>
                        <I name="book-open" size={32} style={{ opacity: 0.3, marginBottom: 8 }}/>
                        <div>No ledger activity for this period</div>
                        <div style={{ fontSize: 12, marginTop: 4 }}>Post journal entries to see data here</div>
                    </div>
                ) : (
                    <table style={S.table}>
                        <thead>
                        <tr>
                            <th style={S.th}>Code</th>
                            <th style={S.th}>Account Name</th>
                            <th style={S.th}>Type</th>
                            <th style={{ ...S.th, textAlign: "right" }}>Debit</th>
                            <th style={{ ...S.th, textAlign: "right" }}>Credit</th>
                            <th style={{ ...S.th, textAlign: "right" }}>Balance</th>
                        </tr>
                        </thead>
                        <tbody>
                        {grouped.map(([type, rows]) => (
                            <>
                                <tr key={"h-" + type} style={{ background: TYPE_CLR[type] + "0a" }}>
                                    <td colSpan={6} style={{ ...S.td, fontWeight: 700, fontSize: 12, color: TYPE_CLR[type], padding: "8px 10px" }}>
                                        <I name={TYPE_ICON[type]} size={13} style={{ marginRight: 6 }}/>{type}
                                        <span style={{ fontWeight: 400, color: "#999", marginLeft: 8 }}>{rows.length} accounts</span>
                                    </td>
                                </tr>
                                {rows.map(row => {
                                    const isDebit = row.normal_balance === "Debit";
                                    const balance = isDebit ? (row.total_debit - row.total_credit) : (row.total_credit - row.total_debit);
                                    return (
                                        <tr key={row.id} style={S.tbRow} onClick={() => openAccount(row)}>
                                            <td style={{ ...S.td, fontWeight: 600, color: TYPE_CLR[row.account_type], fontSize: 12 }}>{row.code}</td>
                                            <td style={{ ...S.td, fontSize: 13 }}>{row.name}</td>
                                            <td style={S.td}>
                                                <span style={{ fontSize: 11, color: "#888" }}>{row.account_subtype}</span>
                                            </td>
                                            <td style={{ ...S.td, textAlign: "right", fontFamily: "'DM Mono', monospace", fontSize: 12, color: row.total_debit > 0 ? "#1a1a2e" : "#ddd" }}>
                                                {row.total_debit > 0 ? fmtMoney(row.total_debit) : ""}
                                            </td>
                                            <td style={{ ...S.td, textAlign: "right", fontFamily: "'DM Mono', monospace", fontSize: 12, color: row.total_credit > 0 ? "#1a1a2e" : "#ddd" }}>
                                                {row.total_credit > 0 ? fmtMoney(row.total_credit) : ""}
                                            </td>
                                            <td style={{ ...S.td, textAlign: "right", fontWeight: 700, fontFamily: "'DM Mono', monospace", fontSize: 12, color: balance < 0 ? "#ef4444" : "#1a1a2e" }}>
                                                {fmtMoney(Math.abs(balance))}
                                                <span style={{ fontSize: 10, marginLeft: 3, color: "#999" }}>{isDebit ? "Dr" : "Cr"}</span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </>
                        ))}
                        {/* Totals row */}
                        <tr style={{ borderTop: "2px solid #d1d5db", background: "#f9fafb" }}>
                            <td colSpan={3} style={{ ...S.td, fontWeight: 700, fontSize: 13 }}>
                                TOTALS
                                {tbTotals.balanced
                                    ? <span style={{ marginLeft: 8, color: "#22c55e", fontSize: 11, fontWeight: 600 }}>✓ Balanced</span>
                                    : <span style={{ marginLeft: 8, color: "#ef4444", fontSize: 11, fontWeight: 600 }}>✗ Out of balance by {fmtMoney(Math.abs(tbTotals.drBalance - tbTotals.crBalance))}</span>
                                }
                            </td>
                            <td style={{ ...S.td, textAlign: "right", fontWeight: 700, fontSize: 13 }}>{fmtMoney(tbTotals.totalDr)}</td>
                            <td style={{ ...S.td, textAlign: "right", fontWeight: 700, fontSize: 13 }}>{fmtMoney(tbTotals.totalCr)}</td>
                            <td style={S.td}></td>
                        </tr>
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

/* ===== STYLES ===== */
const S = {
    statCard: { flex: 1, display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "12px 14px" },
    statIcon: { width: 34, height: 34, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" },
    typeChip: { display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12 },
    toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
    searchInput: { padding: "7px 10px 7px 30px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, width: 180, outline: "none" },
    dateInput: { padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 12, outline: "none" },
    btnSmall: { padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center" },
    periodBtn: { padding: "5px 10px", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", fontSize: 11, cursor: "pointer", fontWeight: 500, color: "#555" },
    tableWrap: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" },
    table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
    th: { textAlign: "left", padding: "8px 10px", fontSize: 11, fontWeight: 600, color: "#888", borderBottom: "1px solid #e5e7eb", background: "#fafafa", position: "sticky", top: 0 },
    td: { padding: "7px 10px", borderBottom: "1px solid #f3f4f6" },
    tbRow: { cursor: "pointer", transition: "background 0.15s" },
    srcPill: { padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, textTransform: "capitalize" },
    viewHeader: { display: "flex", alignItems: "center", gap: 12, marginBottom: 16 },
    backBtn: { background: "none", border: "1px solid #d1d5db", borderRadius: 8, padding: "6px 8px", cursor: "pointer", display: "flex", alignItems: "center" },
};  
