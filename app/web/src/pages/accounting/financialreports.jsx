import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";
import { Term, SimpleHint } from "../components/simplemode";
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

export default function FinancialReports() {
    const [report, setReport] = useState("income"); // income | balance | cashflow
    const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); return `${d.getFullYear()}-01-01`; });
    const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);
    const [asOf, setAsOf] = useState(() => new Date().toISOString().split("T")[0]);
    const [rows, setRows] = useState([]);
    const [cashRows, setCashRows] = useState([]);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            if (report === "income") {
                const d = await api("get_income_statement", { date_from: dateFrom, date_to: dateTo });
                setRows(Array.isArray(d) ? d : []);
            } else if (report === "balance") {
                const d = await api("get_balance_sheet", { as_of: asOf });
                setRows(Array.isArray(d) ? d : []);
            } else {
                const d = await api("get_cash_flow", { date_from: dateFrom, date_to: dateTo });
                setCashRows(Array.isArray(d) ? d : []);
            }
        } catch { setRows([]); setCashRows([]); }
        setLoading(false);
    }, [report, dateFrom, dateTo, asOf]);
    useEffect(() => { load(); }, [load]);

    /* Date presets */
    const setMonth = () => { const d = new Date(); setDateFrom(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`); setDateTo(d.toISOString().split("T")[0]); setAsOf(d.toISOString().split("T")[0]); };
    const setQuarter = () => { const d = new Date(), q = Math.floor(d.getMonth()/3), qs = new Date(d.getFullYear(), q*3, 1); setDateFrom(qs.toISOString().split("T")[0]); setDateTo(new Date(d.getFullYear(), q*3+3, 0).toISOString().split("T")[0]); setAsOf(new Date(d.getFullYear(), q*3+3, 0).toISOString().split("T")[0]); };
    const setYear = () => { const y = new Date().getFullYear(); setDateFrom(`${y}-01-01`); setDateTo(`${y}-12-31`); setAsOf(`${y}-12-31`); };

    return (<div className="acc-wrap">
        {/* Report type tabs */}
        <div className="acc-tabs fr-tabs">
            {[["income", <Term simple="Profit & Loss" advanced="Income Statement" />, "trending-up"], ["balance", <Term simple="What You Own & Owe" advanced="Balance Sheet" />, "layers"], ["cashflow", <Term simple="Cash In & Out" advanced="Cash Flow" />, "dollar-sign"]].map(([key, label, icon]) => (
                <button key={key} onClick={() => setReport(key)} className={`acc-tab ${report === key ? "acc-tab-on" : ""}`}>
                    <I name={icon} size={14}/> {label}
                </button>
            ))}
        </div>

        <SimpleHint icon="bulb">
            Pick a report to see how your business is doing. Profit &amp; Loss shows if you made money;
            What You Own &amp; Owe is a snapshot of your finances.
        </SimpleHint>

        {/* Date controls */}
        <div className="acc-bar fr-controls">
            <div className="acc-bar-left">
                {report === "balance" ? (
                    <><label className="acc-label fr-lbl">As of</label><input type="date" className="acc-input fr-date" value={asOf} onChange={e => setAsOf(e.target.value)}/></>
                ) : (
                    <><label className="acc-label fr-lbl">From</label><input type="date" className="acc-input fr-date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}/>
                        <label className="acc-label fr-lbl">To</label><input type="date" className="acc-input fr-date" value={dateTo} onChange={e => setDateTo(e.target.value)}/></>
                )}
                <button className="acc-btn-s" onClick={setMonth}>Month</button>
                <button className="acc-btn-s" onClick={setQuarter}>Quarter</button>
                <button className="acc-btn-s" onClick={setYear}>Year</button>
                <button className="acc-btn-p" onClick={load}><I name="refresh-cw" size={12}/> Refresh</button>
            </div>
        </div>

        {loading ? (
            <div className="acc-empty"><div className="acc-loading"/><div className="acc-empty-d">Loading...</div></div>
        ) : (
            report === "cashflow" ? <CashFlowView rows={cashRows} dateFrom={dateFrom} dateTo={dateTo}/> :
                report === "income" ? <IncomeStatementView rows={rows} dateFrom={dateFrom} dateTo={dateTo}/> :
                    <BalanceSheetView rows={rows} asOf={asOf}/>
        )}
        <style>{frCSS}</style>
    </div>);
}

/* =============== INCOME STATEMENT =============== */
function IncomeStatementView({ rows, dateFrom, dateTo }) {
    const revenue = rows.filter(r => r.account_type === "Revenue");
    const expenses = rows.filter(r => r.account_type === "Expense");
    const totalRevenue = revenue.reduce((s, r) => s + r.net_balance, 0);
    const totalExpense = expenses.reduce((s, r) => s + r.net_balance, 0);
    const netIncome = totalRevenue - totalExpense;

    return (<div className="acc-card fr-report acc-fill">
        <div className="fr-report-title"><Term simple="Profit & Loss" advanced="Income Statement" /></div>
        <div className="fr-report-sub">For the period {dateFrom} to {dateTo}</div>

        {rows.length === 0 ? <div className="acc-empty"><div className="acc-empty-ic"><I name="inbox" size={28}/></div><div className="acc-empty-t">No data</div><div className="acc-empty-d">No posted journal entries for this period</div></div> : (<>
            <div className="acc-section fr-section">
                <div className="fr-section-head">Revenue</div>
                <table className="fr-tbl"><tbody>
                {revenue.map(r => (<tr key={r.id}><td className="fr-acct-code">{r.code}</td><td className="fr-acct-name">{r.name}</td><td className="fr-amt acc-cell-mono">{peso(r.net_balance)}</td></tr>))}
                <tr className="fr-total-row"><td colSpan={2} className="fr-total-label"><Term simple="Total Income" advanced="Total Revenue" /></td><td className="fr-total-amt acc-cell-mono">{peso(totalRevenue)}</td></tr>
                </tbody></table>
            </div>

            <div className="acc-section fr-section">
                <div className="fr-section-head">Expenses</div>
                <table className="fr-tbl"><tbody>
                {expenses.map(r => (<tr key={r.id}><td className="fr-acct-code">{r.code}</td><td className="fr-acct-name">{r.name}</td><td className="fr-amt acc-cell-mono">{peso(r.net_balance)}</td></tr>))}
                <tr className="fr-total-row"><td colSpan={2} className="fr-total-label"><Term simple="Total Costs" advanced="Total Expenses" /></td><td className="fr-total-amt acc-cell-mono">{peso(totalExpense)}</td></tr>
                </tbody></table>
            </div>

            <div className="fr-grand-row">
                <div className="fr-grand-label"><Term simple="Net Profit" advanced="Net Income" /></div>
                <div className="fr-grand-amt acc-cell-mono" style={{ color: netIncome >= 0 ? "#22c55e" : "#ef4444" }}>{peso(netIncome)}</div>
            </div>
        </>)}
    </div>);
}

/* =============== BALANCE SHEET =============== */
function BalanceSheetView({ rows, asOf }) {
    const assets = rows.filter(r => r.account_type === "Asset");
    const liabilities = rows.filter(r => r.account_type === "Liability");
    const equity = rows.filter(r => r.account_type === "Equity");
    const totalAssets = assets.reduce((s, r) => s + r.net_balance, 0);
    const totalLiabilities = liabilities.reduce((s, r) => s + r.net_balance, 0);
    const totalEquity = equity.reduce((s, r) => s + r.net_balance, 0);
    const leTotal = totalLiabilities + totalEquity;
    const balanced = Math.abs(totalAssets - leTotal) < 0.01;

    return (<div className="acc-card fr-report acc-fill">
        <div className="fr-report-title"><Term simple="What You Own & Owe" advanced="Balance Sheet" /></div>
        <div className="fr-report-sub">As of {asOf}</div>

        {rows.length === 0 ? <div className="acc-empty"><div className="acc-empty-ic"><I name="inbox" size={28}/></div><div className="acc-empty-t">No data</div><div className="acc-empty-d">No account balances</div></div> : (<>
            {/* Assets */}
            <div className="acc-section fr-section">
                <div className="fr-section-head">Assets</div>
                <table className="fr-tbl"><tbody>
                {assets.map(r => (<tr key={r.id}><td className="fr-acct-code">{r.code}</td><td className="fr-acct-name">{r.name}</td><td className="fr-amt acc-cell-mono">{peso(r.net_balance)}</td></tr>))}
                <tr className="fr-total-row"><td colSpan={2} className="fr-total-label">Total Assets</td><td className="fr-total-amt acc-cell-mono">{peso(totalAssets)}</td></tr>
                </tbody></table>
            </div>

            {/* Liabilities */}
            <div className="acc-section fr-section">
                <div className="fr-section-head">Liabilities</div>
                <table className="fr-tbl"><tbody>
                {liabilities.map(r => (<tr key={r.id}><td className="fr-acct-code">{r.code}</td><td className="fr-acct-name">{r.name}</td><td className="fr-amt acc-cell-mono">{peso(r.net_balance)}</td></tr>))}
                <tr className="fr-total-row"><td colSpan={2} className="fr-total-label">Total Liabilities</td><td className="fr-total-amt acc-cell-mono">{peso(totalLiabilities)}</td></tr>
                </tbody></table>
            </div>

            {/* Equity */}
            <div className="acc-section fr-section">
                <div className="fr-section-head">Equity</div>
                <table className="fr-tbl"><tbody>
                {equity.map(r => (<tr key={r.id}><td className="fr-acct-code">{r.code}</td><td className="fr-acct-name">{r.name}</td><td className="fr-amt acc-cell-mono">{peso(r.net_balance)}</td></tr>))}
                <tr className="fr-total-row"><td colSpan={2} className="fr-total-label">Total Equity</td><td className="fr-total-amt acc-cell-mono">{peso(totalEquity)}</td></tr>
                </tbody></table>
            </div>

            <div className="fr-le-row">
                <div className="fr-le-line">
                    <span className="fr-le-label"><Term simple="Total We Owe + Owner's Funds" advanced="Total Liabilities + Equity" /></span>
                    <span className="fr-le-amt acc-cell-mono">{peso(leTotal)}</span>
                </div>
            </div>

            <div className="fr-balance-row">
                {balanced ? (
                    <span className="fr-balanced">✓ Balanced (Assets = Liabilities + Equity)</span>
                ) : (
                    <span className="fr-unbalanced">✗ Out of balance by {peso(Math.abs(totalAssets - leTotal))}</span>
                )}
            </div>
        </>)}
    </div>);
}

/* =============== CASH FLOW =============== */
function CashFlowView({ rows, dateFrom, dateTo }) {
    const totalIn = rows.reduce((s, r) => s + r.cash_in, 0);
    const totalOut = rows.reduce((s, r) => s + r.cash_out, 0);
    const netCash = totalIn - totalOut;

    const sourceLabel = (s) => {
        const map = { manual: "Operating Activities", payroll: "Payroll", loan: "Employee Loans", adjustment: "Adjustments" };
        return map[s] || s || "Other";
    };

    return (<div className="acc-card fr-report acc-fill">
        <div className="fr-report-title"><Term simple="Cash In & Out" advanced="Cash Flow Statement" /></div>
        <div className="fr-report-sub">For the period {dateFrom} to {dateTo}</div>

        {/* Summary cards */}
        <div className="fr-mini-row">
            <div className="fr-mini-card" style={{ borderLeft: "4px solid #22c55e" }}><div className="fr-mini-l">Cash In</div><div className="fr-mini-v acc-cell-mono" style={{ color: "#22c55e" }}>{peso(totalIn)}</div></div>
            <div className="fr-mini-card" style={{ borderLeft: "4px solid #ef4444" }}><div className="fr-mini-l">Cash Out</div><div className="fr-mini-v acc-cell-mono" style={{ color: "#ef4444" }}>{peso(totalOut)}</div></div>
            <div className="fr-mini-card" style={{ borderLeft: `4px solid ${netCash >= 0 ? "#22c55e" : "#ef4444"}` }}><div className="fr-mini-l">Net Cash</div><div className="fr-mini-v acc-cell-mono" style={{ color: netCash >= 0 ? "#22c55e" : "#ef4444" }}>{peso(netCash)}</div></div>
        </div>

        {rows.length === 0 ? <div className="acc-empty"><div className="acc-empty-ic"><I name="inbox" size={28}/></div><div className="acc-empty-t">No data</div><div className="acc-empty-d">No cash movements for this period</div></div> : (
            <table className="fr-tbl"><thead><tr>
                <th className="fr-th">Category</th><th className="fr-th fr-th-right">Cash In</th><th className="fr-th fr-th-right">Cash Out</th><th className="fr-th fr-th-right">Net</th>
            </tr></thead><tbody>
            {rows.map((r, i) => (
                <tr key={i}>
                    <td className="fr-td fr-td-strong">{sourceLabel(r.source_type)}</td>
                    <td className="fr-td fr-td-right acc-cell-mono" style={{ color: r.cash_in > 0 ? "#22c55e" : "" }}>{r.cash_in > 0 ? peso(r.cash_in) : ""}</td>
                    <td className="fr-td fr-td-right acc-cell-mono" style={{ color: r.cash_out > 0 ? "#ef4444" : "" }}>{r.cash_out > 0 ? peso(r.cash_out) : ""}</td>
                    <td className="fr-td fr-td-right fr-td-strong acc-cell-mono" style={{ color: r.net_cash >= 0 ? "#22c55e" : "#ef4444" }}>{peso(r.net_cash)}</td>
                </tr>
            ))}
            <tr className="fr-cash-total">
                <td className="fr-td fr-td-strong">TOTAL</td>
                <td className="fr-td fr-td-right fr-td-strong acc-cell-mono" style={{ color: "#22c55e" }}>{peso(totalIn)}</td>
                <td className="fr-td fr-td-right fr-td-strong acc-cell-mono" style={{ color: "#ef4444" }}>{peso(totalOut)}</td>
                <td className="fr-td fr-td-right fr-cash-net acc-cell-mono" style={{ color: netCash >= 0 ? "#22c55e" : "#ef4444" }}>{peso(netCash)}</td>
            </tr>
            </tbody></table>
        )}
    </div>);
}

const frCSS = `
  .fr-tabs{width:fit-content;background:#f3f4f6;border-radius:10px;padding:4px;gap:4px;margin-bottom:16px}
  .fr-tabs .acc-tab{border-radius:8px;font-size:13px;font-weight:600;padding:8px 16px}
  .fr-tabs .acc-tab-on{background:#fff;color:#1a1a2e;border-bottom:none;box-shadow:0 1px 3px rgba(0,0,0,.1)}

  .fr-controls{margin-bottom:16px}
  .fr-controls .acc-bar-left{gap:8px}
  .fr-lbl{margin-bottom:0;color:#888;font-weight:500}
  .fr-date{width:auto;padding:6px 10px;font-size:13px}

  .fr-report{max-width:800px;padding:24px 28px}
  .fr-report-title{font-size:20px;font-weight:800;color:#1a1a2e;margin-bottom:2px}
  .fr-report-sub{font-size:12px;color:#888;margin-bottom:20px}

  .fr-section{margin-bottom:16px}
  .fr-section-head{font-size:14px;font-weight:700;color:#374151;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #e5e7eb}
  .fr-tbl{width:100%;border-collapse:collapse;font-size:13px}
  .fr-th{text-align:left;padding:8px 10px;font-size:11px;font-weight:600;color:#888;border-bottom:1px solid #e5e7eb}
  .fr-th-right{text-align:right}
  .fr-td{padding:6px 10px;border-bottom:1px solid #f3f4f6}
  .fr-td-right{text-align:right}
  .fr-td-strong{font-weight:600}
  .fr-acct-code{padding:5px 10px;font-size:12px;color:#888;width:70px}
  .fr-acct-name{padding:5px 10px;font-size:13px}
  .fr-amt{padding:5px 10px;text-align:right;font-size:13px;font-weight:500;width:140px}
  .fr-total-row{border-top:1px solid #d1d5db;background:#f9fafb}
  .fr-total-label{padding:8px 10px;font-weight:700;font-size:13px}
  .fr-total-amt{padding:8px 10px;text-align:right;font-weight:700;font-size:14px}

  .fr-grand-row{border-top:3px double #1a1a2e;margin-top:16px;padding-top:12px;display:flex;justify-content:space-between;align-items:center}
  .fr-grand-label{font-size:16px;font-weight:800;color:#1a1a2e}
  .fr-grand-amt{font-size:20px;font-weight:800}

  .fr-le-row{border-top:2px solid #e5e7eb;margin-top:8px;padding-top:8px}
  .fr-le-line{display:flex;justify-content:space-between;margin-bottom:4px}
  .fr-le-label{font-size:13px;font-weight:700}
  .fr-le-amt{font-size:15px;font-weight:700}
  .fr-balance-row{border-top:3px double #1a1a2e;margin-top:12px;padding-top:12px;display:flex;justify-content:center}
  .fr-balanced{color:#22c55e;font-weight:700;font-size:14px}
  .fr-unbalanced{color:#ef4444;font-weight:700;font-size:14px}

  .fr-mini-row{display:flex;gap:12px;margin-bottom:20px}
  .fr-mini-card{flex:1;background:#f9fafb;border-radius:8px;padding:10px 14px;border:1px solid #e5e7eb}
  .fr-mini-l{font-size:11px;color:#888;margin-bottom:2px}
  .fr-mini-v{font-size:18px;font-weight:700}

  .fr-cash-total{border-top:2px solid #d1d5db;background:#f9fafb}
  .fr-cash-net{font-weight:800;font-size:14px}

  @media (max-width:600px){.fr-mini-row{flex-direction:column}}
`;
