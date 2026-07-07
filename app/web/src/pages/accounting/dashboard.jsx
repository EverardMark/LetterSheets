import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { I } from "../../layouts/ERPLayout";
import AccountingCOA from "./Accounting";
import JournalEntries from "./JournalEntries";
import GeneralLedger from "./GeneralLedger";
import AccountsPayable from "./AccountsPayable";
import AccountsReceivable from "./AccountsReceivable";
import TaxManagement from "./TaxManagement";
import BankReconciliation from "./BankReconciliation";
import FinancialReports from "./FinancialReports";

/* ================================================================
   HELPERS
================================================================ */
const fmt = (n) => "₱" + (n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const d10 = (s) => (s || "").slice(0, 10);

async function accApi(action, body = {}) {
    const url = (import.meta.env.VITE_API_BASE || "") + "/api/execute";
    const session = localStorage.getItem("ls_session");
    const res = await fetch(`${url}?action=${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session}` } : {}) },
        body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error || "API failed");
    return json.data;
}

function Empty({ icon, title, desc, action, onAction }) {
    return (
        <div className="a-empty">
            <div className="a-empty-ic"><I name={icon || "inbox"} size={28} /></div>
            <div className="a-empty-t">{title || "No data yet"}</div>
            <div className="a-empty-d">{desc || "Data will appear here once added."}</div>
            {action && <button className="a-btn-p" style={{ marginTop: 12 }} onClick={onAction}>{action}</button>}
        </div>
    );
}

const TYPE_COLORS = { Asset: "#2d9e8b", Liability: "#f59e0b", Equity: "#8b5cf6", Revenue: "#0ea5e9", Expense: "#ef4444" };

function getTab(pathname) {
    const map = {
        "/accounting":              "overview",
        "/accounting/coa":          "coa",
        "/accounting/journal":      "journal",
        "/accounting/ledger":       "ledger",
        "/accounting/payables":     "payables",
        "/accounting/receivables":  "receivables",
        "/accounting/tax":          "tax",
        "/accounting/bank":         "bank",
        "/accounting/reports":      "reports",
    };
    return map[pathname] || "overview";
}

/* ================================================================
   ACCOUNTING OVERVIEW  (mirrors the HR overview layout)
================================================================ */
function AccountingOverview({ nav }) {
    const [bank, setBank] = useState([]);
    const [ar, setAr] = useState({});
    const [ap, setAp] = useState({});
    const [income, setIncome] = useState([]);
    const [entries, setEntries] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [bills, setBills] = useState([]);

    useEffect(() => {
        const today = new Date().toISOString().slice(0, 10);
        const yearStart = `${new Date().getFullYear()}-01-01`;
        (async () => {
            try { const d = await accApi("get_bank_accounts");     setBank(Array.isArray(d) ? d : (d?.accounts || [])); } catch {}
            try { const d = await accApi("get_ar_summary");        setAr(d || {}); } catch {}
            try { const d = await accApi("get_ap_summary");        setAp(d || {}); } catch {}
            try { const d = await accApi("get_income_statement", { date_from: yearStart, date_to: today }); setIncome(Array.isArray(d) ? d : []); } catch {}
            try { const d = await accApi("get_journal_entries");   setEntries(Array.isArray(d) ? d : (d?.entries || [])); } catch {}
            try { const d = await accApi("get_accounts");          setAccounts(d?.accounts || []); } catch {}
            try { const d = await accApi("get_invoices");          setInvoices(Array.isArray(d) ? d : (d?.invoices || [])); } catch {}
            try { const d = await accApi("get_bills");             setBills(Array.isArray(d) ? d : (d?.bills || [])); } catch {}
        })();
    }, []);

    // --- Stats (all from real API data) ---
    const cashBalance = bank.reduce((s, a) => s + (a.current_balance || 0), 0);
    const totalRevenue = income.filter(r => r.account_type === "Revenue").reduce((s, r) => s + (r.net_balance || 0), 0);
    const totalExpense = income.filter(r => r.account_type === "Expense").reduce((s, r) => s + (r.net_balance || 0), 0);
    const netIncome = totalRevenue - totalExpense;

    const accountsByType = Object.keys(TYPE_COLORS).map(type => {
        const accs = accounts.filter(a => a.account_type === type);
        return { type, count: accs.length, total: accs.reduce((s, a) => s + (a.current_balance || 0), 0) };
    }).filter(t => t.count > 0);

    const openInvoices = invoices.filter(i => ["Sent", "Partial", "Overdue"].includes(i.status));
    const openBills = bills.filter(b => ["Open", "Partial", "Overdue"].includes(b.status));

    return (<>
        <div className="a-stats">
            {[
                { label: "Cash Balance",        value: fmt(cashBalance),               icon: "banknote", color: "#2d9e8b" },
                { label: "Accounts Receivable", value: fmt(ar.total_receivable),        icon: "peso",     color: "#0ea5e9" },
                { label: "Accounts Payable",    value: fmt(ap.total_outstanding),       icon: "peso",     color: "#f59e0b" },
                { label: "Net Income (YTD)",    value: fmt(netIncome),                  icon: "check",    color: netIncome >= 0 ? "#8b5cf6" : "#ef4444" },
            ].map((s, i) => (
                <div key={i} className="a-st">
                    <div className="a-st-ic" style={{ background: s.color + "14", color: s.color }}><I name={s.icon} /></div>
                    <div className="a-st-v">{s.value}</div>
                    <div className="a-st-l">{s.label}</div>
                </div>
            ))}
        </div>

        <div className="a-g-main">
            <div className="a-g-col">
                {/* Recent Journal Entries */}
                <div className="a-card">
                    <div className="a-card-h"><h3 className="a-card-t">Recent Journal Entries</h3><span className="a-card-lk" onClick={() => nav("/accounting/journal")}>View all →</span></div>
                    {entries.length > 0 ? (
                        <div style={{ overflowX: "auto" }}><table className="a-tbl"><thead><tr><th>Entry #</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>
                        {entries.slice(0, 5).map(e => (
                            <tr key={e.id}><td><span className="a-tbl-nm">{e.entry_number}</span></td><td>{d10(e.entry_date)}</td><td>{fmt(e.total_debit)}</td><td><span className={`a-badge ${e.status === "Posted" ? "a-b-done" : e.status === "Void" ? "a-b-due" : "a-b-pending"}`}>{e.status}</span></td></tr>
                        ))}
                        </tbody></table></div>
                    ) : <Empty icon="inbox" title="No journal entries" desc="Post your first journal entry to get started." />}
                </div>

                {/* Accounts by Type */}
                <div className="a-card">
                    <div className="a-card-h"><h3 className="a-card-t">Chart of Accounts</h3><span className="a-card-lk" onClick={() => nav("/accounting/coa")}>Manage →</span></div>
                    {accountsByType.length > 0 ? (
                        <div className="a-type-grid">{accountsByType.map((t, i) => (
                            <div key={i} className="a-type" style={{ borderLeftColor: TYPE_COLORS[t.type] }}><div className="a-type-nm">{t.type}</div><div className="a-type-hd">{fmt(t.total)}</div><div className="a-type-ct">{t.count}<span>accounts</span></div></div>
                        ))}</div>
                    ) : <Empty icon="grid" title="No accounts" desc="Set up your chart of accounts to get started." action="Configure" onAction={() => nav("/accounting/coa")} />}
                </div>

                {/* Cash & Bank */}
                <div className="a-card">
                    <div className="a-card-h"><h3 className="a-card-t">Cash & Bank</h3><span className="a-card-lk" onClick={() => nav("/accounting/bank")}>Reconcile →</span></div>
                    {bank.length > 0 ? (
                        <div style={{ overflowX: "auto" }}><table className="a-tbl"><thead><tr><th>Account</th><th>Code</th><th style={{ textAlign: "right" }}>Balance</th></tr></thead><tbody>
                        {bank.map((b, i) => (
                            <tr key={b.id || i}><td><span className="a-tbl-nm">{b.name}</span></td><td>{b.code}</td><td style={{ textAlign: "right", fontWeight: 600, color: "#222" }}>{fmt(b.current_balance)}</td></tr>
                        ))}
                        </tbody></table></div>
                    ) : <Empty icon="banknote" title="No cash accounts" desc="Cash and bank accounts will appear here." />}
                </div>
            </div>

            <div className="a-g-col">
                {/* Outstanding Invoices */}
                <div className="a-card">
                    <div className="a-card-h"><h3 className="a-card-t">Outstanding Invoices</h3><span className="a-card-lk" onClick={() => nav("/accounting/receivables")}>View all</span></div>
                    {openInvoices.length > 0
                        ? openInvoices.slice(0, 5).map((iv, i) => (<div key={iv.id || i} className="a-row"><div className="a-row-info"><div className="a-row-nm">{iv.customer_name || "—"}</div><div className="a-row-meta">{iv.invoice_number} · due {d10(iv.due_date)}</div></div><div className="a-row-amt">{fmt(iv.balance_due)}</div></div>))
                        : <Empty icon="peso" title="No outstanding invoices" desc="Unpaid invoices will appear here." />
                    }
                </div>

                {/* Outstanding Bills */}
                <div className="a-card">
                    <div className="a-card-h"><h3 className="a-card-t">Outstanding Bills</h3><span className="a-card-lk" onClick={() => nav("/accounting/payables")}>View all</span></div>
                    {openBills.length > 0
                        ? openBills.slice(0, 5).map((b, i) => (<div key={b.id || i} className="a-row"><div className="a-row-info"><div className="a-row-nm">{b.vendor_name || "—"}</div><div className="a-row-meta">{b.bill_number} · due {d10(b.due_date)}</div></div><div className="a-row-amt a-row-amt-due">{fmt(b.balance_due)}</div></div>))
                        : <Empty icon="peso" title="No outstanding bills" desc="Unpaid bills will appear here." />
                    }
                </div>

                {/* This Month */}
                <div className="a-card">
                    <div className="a-card-h"><h3 className="a-card-t">This Month</h3></div>
                    <div className="a-mini"><span className="a-mini-l">Collected</span><span className="a-mini-v" style={{ color: "#0d9488" }}>{fmt(ar.collected_this_month)}</span></div>
                    <div className="a-mini"><span className="a-mini-l">Paid</span><span className="a-mini-v" style={{ color: "#d97706" }}>{fmt(ap.paid_this_month)}</span></div>
                </div>

                {/* Overdue */}
                <div className="a-card">
                    <div className="a-card-h"><h3 className="a-card-t">Overdue</h3></div>
                    <div className="a-mini"><span className="a-mini-l">Receivable{ar.overdue_count ? ` · ${ar.overdue_count}` : ""}</span><span className="a-mini-v" style={{ color: (ar.total_overdue || 0) > 0 ? "#ef4444" : "#999" }}>{fmt(ar.total_overdue)}</span></div>
                    <div className="a-mini"><span className="a-mini-l">Payable{ap.overdue_count ? ` · ${ap.overdue_count}` : ""}</span><span className="a-mini-v" style={{ color: (ap.total_overdue || 0) > 0 ? "#ef4444" : "#999" }}>{fmt(ap.total_overdue)}</span></div>
                </div>
            </div>
        </div>

        <style>{`
      .a-btn-p{display:flex;align-items:center;gap:6px;padding:9px 18px;background:#2d9e8b;color:#fff;border:none;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;cursor:pointer;transition:background .15s}
      .a-btn-p:hover{background:#268a79}
      .a-card{background:#fff;border:1px solid #eee;border-radius:14px;padding:20px}
      .a-card-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px}
      .a-card-t{font-size:15px;font-weight:700;color:#222}
      .a-card-lk{font-size:12px;font-weight:600;color:#2d9e8b;cursor:pointer}
      .a-card-lk:hover{text-decoration:underline}
      .a-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px}
      .a-st{background:#fff;border:1px solid #eee;border-radius:12px;padding:16px;transition:border-color .15s}
      .a-st:hover{border-color:#d4e8e2}
      .a-st-ic{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;margin-bottom:10px}
      .a-st-v{font-size:24px;font-weight:700;color:#222}
      .a-st-l{font-size:12px;color:#999;margin-top:2px}
      .a-g-main{display:grid;grid-template-columns:1fr 310px;gap:16px}
      .a-g-col{display:flex;flex-direction:column;gap:16px}
      .a-tbl{width:100%;border-collapse:collapse;font-size:13px}
      .a-tbl th{text-align:left;padding:10px 12px;font-size:11px;font-weight:600;color:#aaa;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #f0f0f0}
      .a-tbl td{padding:10px 12px;border-bottom:1px solid #f8f8f8;color:#555}
      .a-tbl tr:last-child td{border-bottom:none}
      .a-tbl tr:hover td{background:#fafffe}
      .a-tbl-nm{font-weight:600;color:#333}
      .a-badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}
      .a-b-done{background:#e0faf1;color:#0d9488}
      .a-b-pending{background:#fef3c7;color:#d97706}
      .a-b-due{background:#fef2f2;color:#ef4444}
      .a-type-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
      .a-type{border:1px solid #eee;border-radius:12px;padding:16px;background:#fff;border-left:3px solid}
      .a-type-nm{font-size:14px;font-weight:700;color:#333;margin-bottom:4px}
      .a-type-hd{font-size:12px;color:#999}
      .a-type-ct{font-size:20px;font-weight:700;color:#222;margin-top:8px}
      .a-type-ct span{font-size:12px;font-weight:500;color:#aaa;margin-left:4px}
      .a-row{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #f8f8f8}
      .a-row:last-child{border-bottom:none}
      .a-row-info{flex:1;min-width:0}
      .a-row-nm{font-size:13px;font-weight:600;color:#444;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .a-row-meta{font-size:11px;color:#999}
      .a-row-amt{font-size:13px;font-weight:700;color:#0d9488;white-space:nowrap}
      .a-row-amt-due{color:#d97706}
      .a-mini{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f8f8f8}
      .a-mini:last-child{border-bottom:none}
      .a-mini-l{font-size:13px;color:#666}
      .a-mini-v{font-size:15px;font-weight:700}
      .a-empty{text-align:center;padding:40px 20px}
      .a-empty-ic{width:56px;height:56px;border-radius:50%;background:#f3f5f4;color:#ccc;display:flex;align-items:center;justify-content:center;margin:0 auto 12px}
      .a-empty-t{font-size:15px;font-weight:700;color:#444;margin-bottom:4px}
      .a-empty-d{font-size:13px;color:#999;max-width:300px;margin:0 auto}
      @media(max-width:900px){.a-stats{grid-template-columns:repeat(2,1fr)}.a-g-main{grid-template-columns:1fr}}
    `}</style>
    </>);
}

export default function AccountingDashboard() {
    const location = useLocation();
    const navigate = useNavigate();
    const tab = getTab(location.pathname);

    return (
        <div>
            {tab === "overview"     && <AccountingOverview nav={navigate}/>}
            {tab === "coa"          && <AccountingCOA/>}
            {tab === "journal"      && <JournalEntries/>}
            {tab === "ledger"       && <GeneralLedger/>}
            {tab === "payables"     && <AccountsPayable/>}
            {tab === "receivables"  && <AccountsReceivable/>}
            {tab === "tax"          && <TaxManagement/>}
            {tab === "bank"         && <BankReconciliation/>}
            {tab === "reports"      && <FinancialReports/>}
        </div>
    );
}
