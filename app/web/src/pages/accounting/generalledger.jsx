import { useState, useEffect, useCallback, useMemo } from "react";
import { I } from "../../layouts/ERPLayout";
import { Term, AdvancedOnly, SimpleHint } from "../components/simplemode";
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
            <div className="acc-wrap">
                {/* Header */}
                <div className="gl-view-header">
                    <button className="gl-back-btn" onClick={() => setView("trial")}><I name="arrow-left" size={16}/></button>
                    <div>
                        <div className="acc-title">
                            <span style={{ color: TYPE_CLR[acctDetail.account_type], marginRight: 6 }}>{acctDetail.code}</span>
                            {acctDetail.name}
                        </div>
                        <div className="acc-subtitle">
                            {acctDetail.account_type}
                            <AdvancedOnly> &middot; {acctDetail.account_subtype} &middot; Normal: {acctDetail.normal_balance}</AdvancedOnly>
                            {dateFrom && <span> &middot; {dateFrom} to {dateTo}</span>}
                        </div>
                    </div>
                </div>

                {/* Summary cards */}
                <div className="acc-stats">
                    {[
                        { label: "Opening Balance", val: fmtMoney(openingBal), clr: "#6366f1" },
                        { label: "Total Debits", val: fmtMoney(totalDr), clr: "#0ea5e9" },
                        { label: "Total Credits", val: fmtMoney(totalCr), clr: "#ef4444" },
                        { label: "Closing Balance", val: fmtMoney(closingBal), clr: "#10b981" },
                    ].map(c => (
                        <div key={c.label} className="acc-st">
                            <div className="acc-st-v acc-cell-mono" style={{ color: c.clr, fontSize: 18 }}>{c.val}</div>
                            <div className="acc-st-l">{c.label}</div>
                        </div>
                    ))}
                </div>

                {/* Transactions table */}
                <div className="acc-tbl-wrap">
                    {acctLoading ? (
                        <div className="acc-empty"><div className="acc-loading" /></div>
                    ) : ledgerWithBalance.length === 0 ? (
                        <div className="acc-empty">
                            <div className="acc-empty-ic"><I name="inbox" size={28}/></div>
                            <div className="acc-empty-t">No transactions</div>
                            <div className="acc-empty-d">No posted transactions for this period</div>
                        </div>
                    ) : (
                        <table className="acc-tbl">
                            <thead>
                            <tr>
                                <th>Date</th>
                                <th>JE #</th>
                                <th>Description</th>
                                <th>Source</th>
                                <th className="acc-right">Debit</th>
                                <th className="acc-right">Credit</th>
                                <th className="acc-right">Balance</th>
                            </tr>
                            </thead>
                            <tbody>
                            {/* Opening balance row */}
                            {openingBal !== 0 && (
                                <tr className="gl-subtle-row">
                                    <td colSpan={4}><em style={{ color: "#888" }}>Opening Balance</em></td>
                                    <td></td>
                                    <td></td>
                                    <td className="acc-right acc-cell-mono" style={{ fontWeight: 700 }}>{fmtMoney(openingBal)}</td>
                                </tr>
                            )}
                            {ledgerWithBalance.map((t, i) => (
                                <tr key={t.line_id || i}>
                                    <td>{t.entry_date?.split("T")[0]}</td>
                                    <td>
                                        <span style={{ fontWeight: 600, color: "#6366f1", fontSize: 12 }}>JE-{t.entry_number}</span>
                                    </td>
                                    <td style={{ maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis" }}>
                                        {t.line_description || t.memo || ""}
                                    </td>
                                    <td>
                                        <span className="gl-src-pill" style={{ background: (t.source_type === "payroll" ? "#6366f1" : "#10b981") + "15", color: t.source_type === "payroll" ? "#6366f1" : "#10b981" }}>
                                            {t.source_type}
                                        </span>
                                    </td>
                                    <td className="acc-right acc-cell-mono" style={{ color: t.debit > 0 ? "#1a1a2e" : "#ddd" }}>
                                        {t.debit > 0 ? fmtMoney(t.debit) : ""}
                                    </td>
                                    <td className="acc-right acc-cell-mono" style={{ color: t.credit > 0 ? "#1a1a2e" : "#ddd" }}>
                                        {t.credit > 0 ? fmtMoney(t.credit) : ""}
                                    </td>
                                    <td className="acc-right acc-cell-mono" style={{ fontWeight: 600 }}>{fmtMoney(t.running_balance)}</td>
                                </tr>
                            ))}
                            {/* Closing row */}
                            <tr className="gl-closing-row">
                                <td colSpan={4}><strong>Closing Balance</strong></td>
                                <td className="acc-right acc-cell-mono" style={{ fontWeight: 700 }}>{fmtMoney(totalDr)}</td>
                                <td className="acc-right acc-cell-mono" style={{ fontWeight: 700 }}>{fmtMoney(totalCr)}</td>
                                <td className="acc-right acc-cell-mono" style={{ fontWeight: 700, color: "#10b981" }}>{fmtMoney(closingBal)}</td>
                            </tr>
                            </tbody>
                        </table>
                    )}
                </div>

                <style>{glCSS}</style>
            </div>
        );
    }

    /* ===== TRIAL BALANCE VIEW (DEFAULT) ===== */
    return (
        <div className="acc-wrap">
            <SimpleHint icon="bulb">
                Every account and what's flowed through it. The balance check makes sure everything adds up.
            </SimpleHint>

            {/* Type breakdown bar */}
            {typeSummary.length > 0 && (
                <div className="gl-type-bar">
                    {typeSummary.map(t => (
                        <div key={t.account_type} className="gl-type-chip" style={{
                            borderColor: TYPE_CLR[t.account_type] + "44",
                            background: TYPE_CLR[t.account_type] + "08",
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
            <div className="acc-bar">
                <div className="acc-bar-left">
                    <div className="acc-search-wrap">
                        <I name="search" size={14}/>
                        <input className="acc-search" placeholder="Search accounts..." value={search} onChange={e => setSearch(e.target.value)}/>
                    </div>
                    <input type="date" className="gl-date-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)}/>
                    <span style={{ color: "#ccc" }}>to</span>
                    <input type="date" className="gl-date-input" value={dateTo} onChange={e => setDateTo(e.target.value)}/>
                    <button className="acc-btn-s" onClick={() => load()}><I name="refresh-cw" size={13}/></button>
                </div>
                <div className="acc-bar-right">
                    {["month", "quarter", "year", "all"].map(p => (
                        <button key={p} className="gl-period-btn" onClick={() => setPeriod(p)}>
                            {p === "all" ? "All Time" : p.charAt(0).toUpperCase() + p.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Trial Balance Table */}
            <div className="acc-title" style={{ marginBottom: 10 }}><Term simple="Balance Check" advanced="Trial Balance" /></div>
            <div className="acc-tbl-wrap">
                {loading ? (
                    <div className="acc-empty"><div className="acc-loading" /></div>
                ) : grouped.length === 0 ? (
                    <div className="acc-empty">
                        <div className="acc-empty-ic"><I name="inbox" size={28}/></div>
                        <div className="acc-empty-t"><Term simple="No account activity for this period" advanced="No ledger activity for this period" /></div>
                        <div className="acc-empty-d"><Term simple="Record some transactions to see data here" advanced="Post journal entries to see data here" /></div>
                    </div>
                ) : (
                    <table className="acc-tbl">
                        <thead>
                        <tr>
                            <th>Code</th>
                            <th>Account Name</th>
                            <th>Type</th>
                            <th className="acc-right">Debit</th>
                            <th className="acc-right">Credit</th>
                            <th className="acc-right">Balance</th>
                        </tr>
                        </thead>
                        <tbody>
                        {grouped.map(([type, rows]) => (
                            <>
                                <tr key={"h-" + type} className="gl-group-row" style={{ background: TYPE_CLR[type] + "0a" }}>
                                    <td colSpan={6} style={{ fontWeight: 700, fontSize: 12, color: TYPE_CLR[type] }}>
                                        <I name={TYPE_ICON[type]} size={13} style={{ marginRight: 6 }}/>{type}
                                        <span style={{ fontWeight: 400, color: "#999", marginLeft: 8 }}>{rows.length} accounts</span>
                                    </td>
                                </tr>
                                {rows.map(row => {
                                    const isDebit = row.normal_balance === "Debit";
                                    const balance = isDebit ? (row.total_debit - row.total_credit) : (row.total_credit - row.total_debit);
                                    return (
                                        <tr key={row.id} className="acc-row" onClick={() => openAccount(row)}>
                                            <td style={{ fontWeight: 600, color: TYPE_CLR[row.account_type], fontSize: 12 }}>{row.code}</td>
                                            <td className="acc-cell-name">{row.name}</td>
                                            <td>
                                                <span style={{ fontSize: 11, color: "#888" }}>{row.account_subtype}</span>
                                            </td>
                                            <td className="acc-right acc-cell-mono" style={{ fontSize: 12, color: row.total_debit > 0 ? "#1a1a2e" : "#ddd" }}>
                                                {row.total_debit > 0 ? fmtMoney(row.total_debit) : ""}
                                            </td>
                                            <td className="acc-right acc-cell-mono" style={{ fontSize: 12, color: row.total_credit > 0 ? "#1a1a2e" : "#ddd" }}>
                                                {row.total_credit > 0 ? fmtMoney(row.total_credit) : ""}
                                            </td>
                                            <td className="acc-right acc-cell-mono" style={{ fontWeight: 700, fontSize: 12, color: balance < 0 ? "#ef4444" : "#1a1a2e" }}>
                                                {fmtMoney(Math.abs(balance))}
                                                <span style={{ fontSize: 10, marginLeft: 3, color: "#999" }}>{isDebit ? "Dr" : "Cr"}</span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </>
                        ))}
                        {/* Totals row */}
                        <tr className="gl-totals-row">
                            <td colSpan={3} style={{ fontWeight: 700, fontSize: 13 }}>
                                TOTALS
                                {tbTotals.balanced
                                    ? <span style={{ marginLeft: 8, color: "#22c55e", fontSize: 11, fontWeight: 600 }}>✓ Balanced</span>
                                    : <span style={{ marginLeft: 8, color: "#ef4444", fontSize: 11, fontWeight: 600 }}>✗ Out of balance by {fmtMoney(Math.abs(tbTotals.drBalance - tbTotals.crBalance))}</span>
                                }
                            </td>
                            <td className="acc-right acc-cell-mono" style={{ fontWeight: 700, fontSize: 13 }}>{fmtMoney(tbTotals.totalDr)}</td>
                            <td className="acc-right acc-cell-mono" style={{ fontWeight: 700, fontSize: 13 }}>{fmtMoney(tbTotals.totalCr)}</td>
                            <td></td>
                        </tr>
                        </tbody>
                    </table>
                )}
            </div>

            <style>{glCSS}</style>
        </div>
    );
}

/* ===== PAGE-SPECIFIC STYLES (not covered by acc-layout.css) ===== */
const glCSS = `
  .gl-view-header{display:flex;align-items:center;gap:12px;margin-bottom:16px}
  .gl-back-btn{background:none;border:1px solid #e0e0e0;border-radius:8px;padding:6px 8px;cursor:pointer;display:flex;align-items:center}
  .gl-back-btn:hover{border-color:#2d9e8b;color:#2d9e8b}

  .gl-type-bar{display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap}
  .gl-type-chip{display:flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:12px;cursor:pointer}

  .gl-date-input{padding:8px 10px;border:1px solid #e0e0e0;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:12px;color:#555;outline:none;background:#fff}
  .gl-date-input:focus{border-color:#2d9e8b}
  .gl-period-btn{padding:6px 12px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;font-family:'DM Sans',sans-serif;font-size:11px;cursor:pointer;font-weight:600;color:#555}
  .gl-period-btn:hover{border-color:#2d9e8b;color:#2d9e8b}

  .gl-src-pill{padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;text-transform:capitalize;display:inline-block}
  .gl-group-row td{padding:8px 14px !important}
  .gl-subtle-row{background:#f9fafb}
  .gl-closing-row{border-top:2px solid #d1d5db;background:#f0fdf4}
  .gl-totals-row{border-top:2px solid #d1d5db;background:#f9fafb}
`;
