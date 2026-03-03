import { useState, useEffect, useCallback, useMemo } from "react";
import { I } from "../../layouts/ERPLayout";

const API = "http://localhost:8080/api/execute";
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

    return (<div style={{ padding: "0 0 20px" }}>
        {/* Report type tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "#f3f4f6", borderRadius: 10, padding: 4, width: "fit-content" }}>
            {[["income", "Income Statement", "trending-up"], ["balance", "Balance Sheet", "layers"], ["cashflow", "Cash Flow", "dollar-sign"]].map(([key, label, icon]) => (
                <button key={key} onClick={() => setReport(key)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", background: report === key ? "#fff" : "transparent", color: report === key ? "#1a1a2e" : "#888", boxShadow: report === key ? "0 1px 3px rgba(0,0,0,.1)" : "none" }}>
                    <I name={icon} size={14}/> {label}
                </button>
            ))}
        </div>

        {/* Date controls */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
            {report === "balance" ? (
                <><label style={S.lbl2}>As of</label><input type="date" style={S.dateIn} value={asOf} onChange={e => setAsOf(e.target.value)}/></>
            ) : (
                <><label style={S.lbl2}>From</label><input type="date" style={S.dateIn} value={dateFrom} onChange={e => setDateFrom(e.target.value)}/>
                    <label style={S.lbl2}>To</label><input type="date" style={S.dateIn} value={dateTo} onChange={e => setDateTo(e.target.value)}/></>
            )}
            <button style={S.chip} onClick={setMonth}>Month</button>
            <button style={S.chip} onClick={setQuarter}>Quarter</button>
            <button style={S.chip} onClick={setYear}>Year</button>
            <button style={{ ...S.chip, background: "#10b981", color: "#fff" }} onClick={load}><I name="refresh-cw" size={12}/> Refresh</button>
        </div>

        {loading ? <div style={S.empty}>Loading...</div> : (
            report === "cashflow" ? <CashFlowView rows={cashRows} dateFrom={dateFrom} dateTo={dateTo}/> :
                report === "income" ? <IncomeStatementView rows={rows} dateFrom={dateFrom} dateTo={dateTo}/> :
                    <BalanceSheetView rows={rows} asOf={asOf}/>
        )}
    </div>);
}

/* =============== INCOME STATEMENT =============== */
function IncomeStatementView({ rows, dateFrom, dateTo }) {
    const revenue = rows.filter(r => r.account_type === "Revenue");
    const expenses = rows.filter(r => r.account_type === "Expense");
    const totalRevenue = revenue.reduce((s, r) => s + r.net_balance, 0);
    const totalExpense = expenses.reduce((s, r) => s + r.net_balance, 0);
    const netIncome = totalRevenue - totalExpense;

    return (<div style={S.reportCard}>
        <div style={S.reportTitle}>Income Statement</div>
        <div style={S.reportSub}>For the period {dateFrom} to {dateTo}</div>

        {rows.length === 0 ? <div style={S.empty}>No posted journal entries for this period</div> : (<>
            <div style={S.section}>
                <div style={S.sectionHead}>Revenue</div>
                <table style={S.tbl}><tbody>
                {revenue.map(r => (<tr key={r.id}><td style={S.acctCode}>{r.code}</td><td style={S.acctName}>{r.name}</td><td style={S.amt}>{peso(r.net_balance)}</td></tr>))}
                <tr style={S.totalRow}><td colSpan={2} style={S.totalLabel}>Total Revenue</td><td style={S.totalAmt}>{peso(totalRevenue)}</td></tr>
                </tbody></table>
            </div>

            <div style={S.section}>
                <div style={S.sectionHead}>Expenses</div>
                <table style={S.tbl}><tbody>
                {expenses.map(r => (<tr key={r.id}><td style={S.acctCode}>{r.code}</td><td style={S.acctName}>{r.name}</td><td style={S.amt}>{peso(r.net_balance)}</td></tr>))}
                <tr style={S.totalRow}><td colSpan={2} style={S.totalLabel}>Total Expenses</td><td style={S.totalAmt}>{peso(totalExpense)}</td></tr>
                </tbody></table>
            </div>

            <div style={{ borderTop: "3px double #1a1a2e", marginTop: 16, paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#1a1a2e" }}>Net Income</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: netIncome >= 0 ? "#22c55e" : "#ef4444" }}>{peso(netIncome)}</div>
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

    return (<div style={S.reportCard}>
        <div style={S.reportTitle}>Balance Sheet</div>
        <div style={S.reportSub}>As of {asOf}</div>

        {rows.length === 0 ? <div style={S.empty}>No account balances</div> : (<>
            {/* Assets */}
            <div style={S.section}>
                <div style={S.sectionHead}>Assets</div>
                <table style={S.tbl}><tbody>
                {assets.map(r => (<tr key={r.id}><td style={S.acctCode}>{r.code}</td><td style={S.acctName}>{r.name}</td><td style={S.amt}>{peso(r.net_balance)}</td></tr>))}
                <tr style={S.totalRow}><td colSpan={2} style={S.totalLabel}>Total Assets</td><td style={S.totalAmt}>{peso(totalAssets)}</td></tr>
                </tbody></table>
            </div>

            {/* Liabilities */}
            <div style={S.section}>
                <div style={S.sectionHead}>Liabilities</div>
                <table style={S.tbl}><tbody>
                {liabilities.map(r => (<tr key={r.id}><td style={S.acctCode}>{r.code}</td><td style={S.acctName}>{r.name}</td><td style={S.amt}>{peso(r.net_balance)}</td></tr>))}
                <tr style={S.totalRow}><td colSpan={2} style={S.totalLabel}>Total Liabilities</td><td style={S.totalAmt}>{peso(totalLiabilities)}</td></tr>
                </tbody></table>
            </div>

            {/* Equity */}
            <div style={S.section}>
                <div style={S.sectionHead}>Equity</div>
                <table style={S.tbl}><tbody>
                {equity.map(r => (<tr key={r.id}><td style={S.acctCode}>{r.code}</td><td style={S.acctName}>{r.name}</td><td style={S.amt}>{peso(r.net_balance)}</td></tr>))}
                <tr style={S.totalRow}><td colSpan={2} style={S.totalLabel}>Total Equity</td><td style={S.totalAmt}>{peso(totalEquity)}</td></tr>
                </tbody></table>
            </div>

            <div style={{ borderTop: "2px solid #e5e7eb", marginTop: 8, paddingTop: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Total Liabilities + Equity</span>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{peso(leTotal)}</span>
                </div>
            </div>

            <div style={{ borderTop: "3px double #1a1a2e", marginTop: 12, paddingTop: 12, display: "flex", justifyContent: "center" }}>
                {balanced ? (
                    <span style={{ color: "#22c55e", fontWeight: 700, fontSize: 14 }}>✓ Balanced (Assets = Liabilities + Equity)</span>
                ) : (
                    <span style={{ color: "#ef4444", fontWeight: 700, fontSize: 14 }}>✗ Out of balance by {peso(Math.abs(totalAssets - leTotal))}</span>
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

    return (<div style={S.reportCard}>
        <div style={S.reportTitle}>Cash Flow Statement</div>
        <div style={S.reportSub}>For the period {dateFrom} to {dateTo}</div>

        {/* Summary cards */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
            <div style={{ ...S.miniCard, borderLeft: "4px solid #22c55e" }}><div style={S.miniL}>Cash In</div><div style={{ fontSize: 18, fontWeight: 700, color: "#22c55e" }}>{peso(totalIn)}</div></div>
            <div style={{ ...S.miniCard, borderLeft: "4px solid #ef4444" }}><div style={S.miniL}>Cash Out</div><div style={{ fontSize: 18, fontWeight: 700, color: "#ef4444" }}>{peso(totalOut)}</div></div>
            <div style={{ ...S.miniCard, borderLeft: `4px solid ${netCash >= 0 ? "#22c55e" : "#ef4444"}` }}><div style={S.miniL}>Net Cash</div><div style={{ fontSize: 18, fontWeight: 700, color: netCash >= 0 ? "#22c55e" : "#ef4444" }}>{peso(netCash)}</div></div>
        </div>

        {rows.length === 0 ? <div style={S.empty}>No cash movements for this period</div> : (
            <table style={S.tbl}><thead><tr>
                <th style={S.th}>Category</th><th style={{ ...S.th, textAlign: "right" }}>Cash In</th><th style={{ ...S.th, textAlign: "right" }}>Cash Out</th><th style={{ ...S.th, textAlign: "right" }}>Net</th>
            </tr></thead><tbody>
            {rows.map((r, i) => (
                <tr key={i}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{sourceLabel(r.source_type)}</td>
                    <td style={{ ...S.td, textAlign: "right", color: r.cash_in > 0 ? "#22c55e" : "" }}>{r.cash_in > 0 ? peso(r.cash_in) : ""}</td>
                    <td style={{ ...S.td, textAlign: "right", color: r.cash_out > 0 ? "#ef4444" : "" }}>{r.cash_out > 0 ? peso(r.cash_out) : ""}</td>
                    <td style={{ ...S.td, textAlign: "right", fontWeight: 700, color: r.net_cash >= 0 ? "#22c55e" : "#ef4444" }}>{peso(r.net_cash)}</td>
                </tr>
            ))}
            <tr style={{ borderTop: "2px solid #d1d5db", background: "#f9fafb" }}>
                <td style={{ ...S.td, fontWeight: 700 }}>TOTAL</td>
                <td style={{ ...S.td, textAlign: "right", fontWeight: 700, color: "#22c55e" }}>{peso(totalIn)}</td>
                <td style={{ ...S.td, textAlign: "right", fontWeight: 700, color: "#ef4444" }}>{peso(totalOut)}</td>
                <td style={{ ...S.td, textAlign: "right", fontWeight: 800, fontSize: 14, color: netCash >= 0 ? "#22c55e" : "#ef4444" }}>{peso(netCash)}</td>
            </tr>
            </tbody></table>
        )}
    </div>);
}

const S = {
    reportCard: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "24px 28px", maxWidth: 800 },
    reportTitle: { fontSize: 20, fontWeight: 800, color: "#1a1a2e", marginBottom: 2 },
    reportSub: { fontSize: 12, color: "#888", marginBottom: 20 },
    section: { marginBottom: 16 },
    sectionHead: { fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 6, paddingBottom: 4, borderBottom: "1px solid #e5e7eb" },
    tbl: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
    th: { textAlign: "left", padding: "8px 10px", fontSize: 11, fontWeight: 600, color: "#888", borderBottom: "1px solid #e5e7eb" },
    td: { padding: "6px 10px", borderBottom: "1px solid #f3f4f6" },
    acctCode: { padding: "5px 10px", fontSize: 12, color: "#888", width: 70 },
    acctName: { padding: "5px 10px", fontSize: 13 },
    amt: { padding: "5px 10px", textAlign: "right", fontSize: 13, fontWeight: 500, width: 140 },
    totalRow: { borderTop: "1px solid #d1d5db", background: "#f9fafb" },
    totalLabel: { padding: "8px 10px", fontWeight: 700, fontSize: 13 },
    totalAmt: { padding: "8px 10px", textAlign: "right", fontWeight: 700, fontSize: 14 },
    miniCard: { flex: 1, background: "#f9fafb", borderRadius: 8, padding: "10px 14px", border: "1px solid #e5e7eb" },
    miniL: { fontSize: 11, color: "#888", marginBottom: 2 },
    lbl2: { fontSize: 12, color: "#888", fontWeight: 500 },
    dateIn: { padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, outline: "none" },
    chip: { padding: "5px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 12, background: "#fff", cursor: "pointer", fontWeight: 500, display: "flex", alignItems: "center", gap: 4 },
    empty: { textAlign: "center", padding: 40, color: "#aaa", fontSize: 13 },
};
