import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";
import { Term, SimpleHint } from "../components/simplemode";
import { useIsSimple } from "../../utils/uimode";
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

export default function BankReconciliation() {
    const simple = useIsSimple();
    const [bankAccounts, setBankAccounts] = useState([]);
    const [selAcct, setSelAcct] = useState("");
    const [txns, setTxns] = useState([]);
    const [unmatched, setUnmatched] = useState([]);
    const [reconSum, setReconSum] = useState(null);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState("");
    const [showAdd, setShowAdd] = useState(false);
    const [addForm, setAddForm] = useState({ txn_date: "", description: "", reference: "", amount: 0, statement_date: "" });
    const [filterRecon, setFilterRecon] = useState(-1); // -1=all, 0=unreconciled, 1=reconciled
    const [matchMode, setMatchMode] = useState(null); // txn id being matched

    const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

    const loadAccounts = useCallback(async () => {
        try { const d = await api("get_bank_accounts", {}); setBankAccounts(Array.isArray(d) ? d : []); } catch { setBankAccounts([]); }
    }, []);
    useEffect(() => { loadAccounts(); }, [loadAccounts]);

    const loadTxns = useCallback(async (aid) => {
        if (!aid) return;
        setLoading(true);
        try { const d = await api("get_bank_transactions", { account_id: aid, reconciled: filterRecon }); setTxns(Array.isArray(d) ? d : []); } catch { setTxns([]); }
        try { const s = await api("get_recon_summary", { account_id: aid }); setReconSum(s); } catch { setReconSum(null); }
        try { const u = await api("get_unmatched_journal_lines", { account_id: aid }); setUnmatched(Array.isArray(u) ? u : []); } catch { setUnmatched([]); }
        setLoading(false);
    }, [filterRecon]);

    useEffect(() => { if (selAcct) loadTxns(selAcct); }, [selAcct, loadTxns]);

    const selectAcct = (aid) => { setSelAcct(aid); setMatchMode(null); setShowAdd(false); };

    const addTxn = async () => {
        if (!addForm.txn_date || addForm.amount === 0) { flash("Date and amount required"); return; }
        try {
            await api("create_bank_transaction", { account_id: selAcct, txn_date: addForm.txn_date, description: addForm.description, reference: addForm.reference, amount: addForm.amount, statement_date: addForm.statement_date || addForm.txn_date });
            flash("Transaction added"); setShowAdd(false);
            setAddForm({ txn_date: "", description: "", reference: "", amount: 0, statement_date: "" });
            loadTxns(selAcct);
        } catch (e) { flash("Error: " + e.message); }
    };

    const deleteTxn = async (id) => {
        if (!confirm("Delete?")) return;
        try { await api("delete_bank_transaction", { id }); flash("Deleted"); loadTxns(selAcct); } catch (e) { flash("Error: " + e.message); }
    };

    const reconcile = async (txnId, entryId) => {
        try { await api("reconcile_transaction", { id: txnId, entry_id: entryId }); flash("Matched"); setMatchMode(null); loadTxns(selAcct); } catch (e) { flash("Error: " + e.message); }
    };

    const unreconcile = async (id) => {
        try { await api("unreconcile_transaction", { id }); flash("Unreconciled"); loadTxns(selAcct); } catch (e) { flash("Error: " + e.message); }
    };

    const selAcctName = bankAccounts.find(a => a.id === selAcct)?.name || "";

    return (<div className="acc-wrap">
        {msg && <div className="br-flash">{msg}</div>}

        <SimpleHint icon="bulb">Tick off each line as you find it on your real bank statement, so your records match the bank.</SimpleHint>

        {/* Account selector */}
        <div className="acc-bar">
            <div className="acc-bar-left">
                <label className="br-sel-label">Bank Account:</label>
                <select className="acc-filter br-acct-sel" value={selAcct} onChange={e => selectAcct(e.target.value)}>
                    <option value="">Select account...</option>
                    {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.code} {a.name} ({peso(a.current_balance)})</option>)}
                </select>
                {selAcct && (
                    <select className="acc-filter" value={filterRecon} onChange={e => setFilterRecon(Number(e.target.value))}>
                        <option value={-1}>All Transactions</option><option value={0}>{simple ? "Not matched yet" : "Unreconciled"}</option><option value={1}>{simple ? "Matched" : "Reconciled"}</option>
                    </select>
                )}
            </div>
            {selAcct && (
                <div className="acc-bar-right">
                    <button className="acc-btn-p" onClick={() => { setShowAdd(true); setAddForm({ txn_date: new Date().toISOString().split("T")[0], description: "", reference: "", amount: 0, statement_date: "" }); }}><I name="plus" size={14}/> <Term simple="Add Statement Line" advanced="Add Statement Entry"/></button>
                </div>
            )}
        </div>

        {!selAcct ? (
            <div className="acc-empty">
                <div className="acc-empty-ic"><I name="credit-card" size={28}/></div>
                <div className="acc-empty-t">No account selected</div>
                <div className="acc-empty-d"><Term simple="Select a bank account to begin matching" advanced="Select a bank account to begin reconciliation"/></div>
            </div>
        ) : (
            <>
                {/* Summary cards */}
                {reconSum && (
                    <div className="acc-stats">
                        <div className="acc-st" style={{ borderLeft: "4px solid #3b82f6" }}>
                            <div className="acc-st-l"><Term simple="Our Records" advanced="Book Balance"/></div><div className="acc-st-v">{peso(reconSum.book_balance)}</div>
                        </div>
                        <div className="acc-st" style={{ borderLeft: "4px solid #22c55e" }}>
                            <div className="acc-st-l"><Term simple="Matched" advanced="Reconciled"/></div><div className="acc-st-v">{peso(reconSum.reconciled_total)}</div>
                        </div>
                        <div className="acc-st" style={{ borderLeft: "4px solid #f59e0b" }}>
                            <div className="acc-st-l"><Term simple="Not matched yet" advanced="Unreconciled"/> ({reconSum.unreconciled_count})</div><div className="acc-st-v">{peso(reconSum.unreconciled_total)}</div>
                        </div>
                        <div className="acc-st" style={{ borderLeft: `4px solid ${Math.abs(reconSum.book_balance - reconSum.reconciled_total) < 0.01 ? "#22c55e" : "#ef4444"}` }}>
                            <div className="acc-st-l">Difference</div><div className="acc-st-v" style={{ color: Math.abs(reconSum.book_balance - reconSum.reconciled_total) < 0.01 ? "#22c55e" : "#ef4444" }}>{peso(reconSum.book_balance - reconSum.reconciled_total)}</div>
                        </div>
                    </div>
                )}

                {/* Add statement entry form */}
                {showAdd && (
                    <div className="acc-card br-mb12">
                        <div className="acc-sec-title"><Term simple="Add Bank Statement Line" advanced="Add Bank Statement Entry"/></div>
                        <div className="acc-fields">
                            <div className="acc-field"><label className="acc-label">Date <span className="acc-req"/></label><input type="date" className="acc-input" value={addForm.txn_date} onChange={e => setAddForm(p => ({ ...p, txn_date: e.target.value }))}/></div>
                            <div className="acc-field"><label className="acc-label">Reference</label><input className="acc-input" value={addForm.reference} onChange={e => setAddForm(p => ({ ...p, reference: e.target.value }))}/></div>
                            <div className="acc-field acc-field-full"><label className="acc-label">Description</label><input className="acc-input" value={addForm.description} onChange={e => setAddForm(p => ({ ...p, description: e.target.value }))}/></div>
                            <div className="acc-field acc-field-full"><label className="acc-label">Amount (+ deposit, - withdrawal)</label><input type="number" step="0.01" className="acc-input" value={addForm.amount} onChange={e => setAddForm(p => ({ ...p, amount: Number(e.target.value) }))}/></div>
                        </div>
                        <div className="acc-foot-btns br-mt10">
                            <button className="acc-btn-cancel" onClick={() => setShowAdd(false)}>Cancel</button>
                            <button className="acc-btn-primary" onClick={addTxn}><I name="save" size={14}/> Add</button>
                        </div>
                    </div>
                )}

                {/* Transactions table */}
                <div className="acc-card br-mb12">
                    <div className="acc-sec-title"><Term simple="Bank Statement Lines" advanced="Bank Statement Entries"/> ({txns.length})</div>
                    {loading ? <div className="acc-empty br-empty-inline">Loading...</div> : txns.length === 0 ? <div className="acc-empty br-empty-inline">No transactions</div> : (
                        <div className="acc-tbl-wrap">
                        <table className="acc-tbl"><thead><tr>
                            <th>Date</th><th>Description</th><th>Reference</th>
                            <th className="acc-right">Amount</th><th>Status</th><th></th>
                        </tr></thead><tbody>
                        {txns.map(t => (
                            <tr key={t.id} style={matchMode === t.id ? { background: "#edf8f5" } : undefined}>
                                <td className="acc-cell-mono br-sm">{t.txn_date?.split("T")[0]}</td>
                                <td>{t.description}</td>
                                <td className="br-sm br-muted">{t.reference}</td>
                                <td className="acc-right acc-cell-mono" style={{ fontWeight: 600, color: t.amount >= 0 ? "#22c55e" : "#ef4444" }}>
                                    {t.amount >= 0 ? "+" : ""}{peso(t.amount)}
                                </td>
                                <td>
                                    {t.is_reconciled ? (
                                        <span className="acc-badge acc-b-done">✓ <Term simple="Matched" advanced="Reconciled"/></span>
                                    ) : (
                                        <span className="acc-badge acc-b-pending"><Term simple="Not matched yet" advanced="Pending"/></span>
                                    )}
                                </td>
                                <td className="br-actions">
                                    {t.is_reconciled ? (
                                        <button className="br-ibtn" onClick={() => unreconcile(t.id)} title="Unreconcile"><I name="x" size={13}/></button>
                                    ) : (
                                        <button className="br-ibtn br-ibtn-match" onClick={() => setMatchMode(matchMode === t.id ? null : t.id)} title="Match">
                                            <I name="link" size={13}/>
                                        </button>
                                    )}
                                    {!t.is_reconciled && <button className="br-ibtn br-ibtn-del" onClick={() => deleteTxn(t.id)}><I name="trash-2" size={13}/></button>}
                                </td>
                            </tr>
                        ))}
                        </tbody></table>
                        </div>
                    )}
                </div>

                {/* Match panel */}
                {matchMode && (
                    <div className="acc-card br-match-card">
                        <div className="acc-sec-title br-match-title">
                            <I name="link" size={14}/> <Term simple="Match with a Transaction" advanced="Match with Journal Entry"/>
                            <span className="br-match-hint"><Term simple="Pick the recorded transaction that matches the selected bank line" advanced="Select a journal entry to match with the selected bank transaction"/></span>
                        </div>
                        {unmatched.length === 0 ? <div className="br-nomatch"><Term simple="No unmatched transactions for this account" advanced="No unmatched journal entries for this account"/></div> : (
                            <div className="acc-tbl-wrap">
                            <table className="acc-tbl"><thead><tr>
                                <th>JE #</th><th>Date</th><th>Memo</th><th>Description</th>
                                <th className="acc-right">Debit</th><th className="acc-right">Credit</th>
                                <th className="acc-right">Net</th><th></th>
                            </tr></thead><tbody>
                            {unmatched.map(u => (
                                <tr key={u.line_id}>
                                    <td className="acc-cell-name">JE-{String(u.entry_number).padStart(4, "0")}</td>
                                    <td className="acc-cell-mono br-sm">{u.entry_date?.split("T")[0]}</td>
                                    <td>{u.memo}</td>
                                    <td>{u.description}</td>
                                    <td className="acc-right acc-cell-mono">{u.debit > 0 ? peso(u.debit) : ""}</td>
                                    <td className="acc-right acc-cell-mono">{u.credit > 0 ? peso(u.credit) : ""}</td>
                                    <td className="acc-right acc-cell-mono" style={{ fontWeight: 600, color: u.net_amount >= 0 ? "#22c55e" : "#ef4444" }}>{peso(u.net_amount)}</td>
                                    <td><button className="acc-btn-p" onClick={() => reconcile(matchMode, u.entry_id)}><I name="check" size={12}/> Match</button></td>
                                </tr>
                            ))}
                            </tbody></table>
                            </div>
                        )}
                        <button className="acc-btn-s br-mt8" onClick={() => setMatchMode(null)}>Cancel</button>
                    </div>
                )}
            </>
        )}

        <style>{brCSS}</style>
    </div>);
}

const brCSS = `
  .br-flash{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;padding:8px 14px;border-radius:8px;font-size:13px;margin-bottom:12px}
  .br-sel-label{font-size:13px;font-weight:600;color:#1a1a2e}
  .br-acct-sel{min-width:250px}
  .br-mb12{margin-bottom:12px}
  .br-mt10{margin-top:10px}
  .br-mt8{margin-top:8px}
  .br-sm{font-size:12px}
  .br-muted{color:#888}
  .br-empty-inline{padding:30px;min-height:0}
  .br-actions{display:flex;gap:4px}
  .br-ibtn{background:none;border:none;cursor:pointer;color:#6366f1;padding:4px;display:flex;align-items:center}
  .br-ibtn-match{color:#2d9e8b}
  .br-ibtn-del{color:#ef4444}
  .br-match-card{margin-top:12px;border-color:#93c5fd}
  .br-match-title{display:flex;align-items:center;gap:6px;color:#1d4ed8;flex-wrap:wrap}
  .br-match-hint{font-weight:400;color:#888;margin-left:8px;text-transform:none;letter-spacing:normal;font-size:11px}
  .br-nomatch{color:#aaa;font-size:13px;padding:10px}
`;
