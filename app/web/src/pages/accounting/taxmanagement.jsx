import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";
import { SimpleHint } from "../components/simplemode";
import "./acc-layout.css";

const API = (import.meta.env.VITE_API_BASE||"")+"/api/execute";
async function api(action, body = {}) {
    const s = localStorage.getItem("ls_session");
    const res = await fetch(`${API}?action=${action}`, { method: "POST", headers: { "Content-Type": "application/json", ...(s ? { Authorization: `Bearer ${s}` } : {}) }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error || json?.message || `API ${action} failed`);
    return json?.data ?? json;
}
const peso = (n) => "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function TaxManagement() {
    const [view, setView] = useState("summary"); // summary | detail
    const [taxRows, setTaxRows] = useState([]);
    const [vat, setVat] = useState(null);
    const [detail, setDetail] = useState([]);
    const [selAccount, setSelAccount] = useState(null);
    const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; });
    const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try { const d = await api("get_tax_summary", { date_from: dateFrom, date_to: dateTo }); setTaxRows(Array.isArray(d) ? d : []); } catch { setTaxRows([]); }
        try { const v = await api("get_vat_computation", { date_from: dateFrom, date_to: dateTo }); setVat(v); } catch { setVat(null); }
        setLoading(false);
    }, [dateFrom, dateTo]);
    useEffect(() => { load(); }, [load]);

    const openDetail = async (acct) => {
        setSelAccount(acct);
        try { const d = await api("get_tax_detail", { account_id: acct.account_id, date_from: dateFrom, date_to: dateTo }); setDetail(Array.isArray(d) ? d : []); } catch { setDetail([]); }
        setView("detail");
    };

    /* Quick presets */
    const setQuarter = () => {
        const d = new Date(), q = Math.floor(d.getMonth() / 3), qs = new Date(d.getFullYear(), q * 3, 1);
        setDateFrom(qs.toISOString().split("T")[0]);
        setDateTo(new Date(d.getFullYear(), q * 3 + 3, 0).toISOString().split("T")[0]);
    };
    const setYear = () => {
        const y = new Date().getFullYear();
        setDateFrom(`${y}-01-01`); setDateTo(`${y}-12-31`);
    };
    const setMonth = () => {
        const d = new Date();
        setDateFrom(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
        setDateTo(d.toISOString().split("T")[0]);
    };

    const vatPayable = vat ? vat.output_vat - vat.input_vat : 0;

    const inputAccounts = taxRows.filter(r => r.account_type === "Asset");
    const outputAccounts = taxRows.filter(r => r.name.toLowerCase().includes("output") || r.code === "2110");
    const whAccounts = taxRows.filter(r => (r.name.toLowerCase().includes("withholding") || r.name.toLowerCase().includes("income tax")) && r.account_type === "Liability");
    const otherTax = taxRows.filter(r => !inputAccounts.includes(r) && !outputAccounts.includes(r) && !whAccounts.includes(r));

    if (view === "detail") return renderDetail();
    return renderSummary();

    function renderSummary() {
        return (<div className="acc-wrap">
            <SimpleHint icon="bulb">Your tax accounts and what's moved through them — handy at filing time.</SimpleHint>

            {/* Date filters */}
            <div className="acc-bar">
                <div className="acc-bar-left">
                    <label className="acc-label tx-inline-label">From</label>
                    <input type="date" className="acc-input tx-date-in" value={dateFrom} onChange={e => setDateFrom(e.target.value)}/>
                    <label className="acc-label tx-inline-label">To</label>
                    <input type="date" className="acc-input tx-date-in" value={dateTo} onChange={e => setDateTo(e.target.value)}/>
                </div>
                <div className="acc-bar-right">
                    <button className="acc-btn-s" onClick={setMonth}>Month</button>
                    <button className="acc-btn-s" onClick={setQuarter}>Quarter</button>
                    <button className="acc-btn-s" onClick={setYear}>Year</button>
                    <button className="acc-btn-p" onClick={load}><I name="refresh-cw" size={14}/> Refresh</button>
                </div>
            </div>

            {loading ? <div className="acc-empty"><div className="acc-loading"/><div className="acc-empty-d">Loading...</div></div> : (
                <>
                    {/* Tax groups */}
                    {[[outputAccounts, "Output VAT / Sales Tax", "#ef4444"],
                        [inputAccounts, "Input VAT / Purchase Tax", "#10b981"],
                        [whAccounts, "Withholding Taxes", "#f59e0b"],
                        [otherTax, "Other Tax Accounts", "#6366f1"]
                    ].filter(([rows]) => rows.length > 0).map(([rows, title, color]) => (
                        <div key={title} className="acc-card acc-section">
                            <div className="tx-group-title" style={{ color }}>
                                <div className="tx-group-dot" style={{ background: color }}></div>{title}
                            </div>
                            <div className="acc-tbl-wrap">
                            <table className="acc-tbl"><thead><tr>
                                <th>Code</th><th>Account Name</th><th>Type</th>
                                <th className="acc-right">Period Debits</th><th className="acc-right">Period Credits</th>
                                <th className="acc-right">Current Balance</th>
                            </tr></thead><tbody>
                            {rows.map(r => (
                                <tr key={r.account_id} className="acc-row" onClick={() => openDetail(r)}>
                                    <td className="acc-cell-name">{r.code}</td>
                                    <td>{r.name}</td>
                                    <td><span className="acc-badge" style={{ background: r.account_type === "Asset" ? "#dbeafe" : "#fef3c7", color: r.account_type === "Asset" ? "#1d4ed8" : "#92400e" }}>{r.account_type}</span></td>
                                    <td className="acc-right acc-cell-mono">{r.total_debit > 0 ? peso(r.total_debit) : ""}</td>
                                    <td className="acc-right acc-cell-mono">{r.total_credit > 0 ? peso(r.total_credit) : ""}</td>
                                    <td className="acc-right acc-cell-mono" style={{ fontWeight: 700, color: r.current_balance > 0 ? "#1a1a2e" : "#22c55e" }}>{peso(r.current_balance)}</td>
                                </tr>
                            ))}
                            </tbody></table>
                            </div>
                        </div>
                    ))}

                    {taxRows.length === 0 && <div className="acc-empty"><div className="acc-empty-ic"><I name="inbox" size={28}/></div><div className="acc-empty-t">No tax accounts found</div><div className="acc-empty-d">Apply a COA template with VAT/Tax accounts first.</div></div>}

                    {/* BIR Filing Reminders */}
                    <div className="acc-card acc-section">
                        <div className="acc-card-t tx-reminders-title">PH Tax Filing Reminders</div>
                        <div className="tx-reminders-grid">
                            {[{ form: "BIR 2550M", desc: "Monthly VAT Return", due: "20th of following month" },
                                { form: "BIR 2550Q", desc: "Quarterly VAT Return", due: "25th after quarter end" },
                                { form: "BIR 1601C", desc: "Monthly Withholding Tax (Compensation)", due: "10th of following month" },
                                { form: "BIR 1601E", desc: "Monthly Expanded Withholding Tax", due: "10th of following month" },
                                { form: "BIR 1604CF", desc: "Annual Withholding Tax (Compensation)", due: "January 31" },
                                { form: "BIR 2316", desc: "Annual Employee Certificate", due: "January 31" }
                            ].map(f => (
                                <div key={f.form} className="tx-reminder">
                                    <span className="tx-reminder-form">{f.form}</span>{" "}<span className="tx-reminder-desc">{f.desc}</span>
                                    <div className="tx-reminder-due">Due: {f.due}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <style>{txCSS}</style>
                </>
            )}
        </div>);
    }

    function renderDetail() {
        if (!selAccount) return null;
        return (<div className="acc-wrap">
            <div className="acc-bar tx-detail-hdr">
                <button className="acc-btn-s tx-back" onClick={() => setView("summary")}><I name="arrow-left" size={16}/></button>
                <div>
                    <div className="acc-title">{selAccount.code} {selAccount.name}</div>
                    <div className="acc-subtitle">{dateFrom} to {dateTo} &middot; Balance: {peso(selAccount.current_balance)}</div>
                </div>
            </div>
            <div className="acc-card">
                {detail.length === 0 ? <div className="acc-empty"><div className="acc-empty-ic"><I name="inbox" size={28}/></div><div className="acc-empty-d">No transactions for this period</div></div> : (
                    <div className="acc-tbl-wrap">
                    <table className="acc-tbl"><thead><tr><th>JE #</th><th>Date</th><th>Memo</th><th>Source</th><th>Description</th><th className="acc-right">Debit</th><th className="acc-right">Credit</th></tr></thead>
                        <tbody>{detail.map((d, i) => (
                            <tr key={i}><td className="acc-cell-name">JE-{String(d.entry_number).padStart(4, "0")}</td><td>{d.entry_date?.split("T")[0]}</td><td>{d.memo}</td>
                                <td><span className="acc-badge" style={{ background: d.source_type === "payroll" ? "#dbeafe" : "#f3f4f6", color: d.source_type === "payroll" ? "#1d4ed8" : "#555" }}>{d.source_type}</span></td>
                                <td>{d.line_desc}</td>
                                <td className="acc-right acc-cell-mono">{d.debit > 0 ? peso(d.debit) : ""}</td>
                                <td className="acc-right acc-cell-mono">{d.credit > 0 ? peso(d.credit) : ""}</td></tr>
                        ))}</tbody></table>
                    </div>
                )}
            </div>
            <style>{txCSS}</style>
        </div>);
    }
}

/* Page-specific rules not covered by acc-layout.css (unique tx- prefix) */
const txCSS = `
  .tx-vat-stats{grid-template-columns:repeat(3,1fr)}
  .tx-inline-label{margin-bottom:0}
  .tx-date-in{width:auto;padding:8px 10px}
  .tx-group-title{font-size:13px;font-weight:700;margin-bottom:8px;display:flex;align-items:center;gap:6px}
  .tx-group-dot{width:10px;height:10px;border-radius:3px;flex-shrink:0}
  .tx-reminders-title{margin-bottom:10px}
  .tx-reminders-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .tx-reminder{background:#f9fafb;border-radius:6px;padding:8px 10px;font-size:12px}
  .tx-reminder-form{font-weight:700;color:#1a1a2e}
  .tx-reminder-desc{color:#888}
  .tx-reminder-due{color:#f59e0b;font-size:11px;margin-top:2px}
  .tx-detail-hdr{align-items:center;gap:10px;justify-content:flex-start}
  .tx-back{padding:6px 8px}
  @media(max-width:900px){.tx-vat-stats{grid-template-columns:1fr}.tx-reminders-grid{grid-template-columns:1fr}}
`;
