import { useState, useEffect, useCallback } from "react";
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

export default function BankReconciliation() {
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

    return (<div style={{ padding: "0 0 20px" }}>
        {msg && <div style={S.flash}>{msg}</div>}

        {/* Account selector */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e" }}>Bank Account:</label>
            <select style={S.sel} value={selAcct} onChange={e => selectAcct(e.target.value)}>
                <option value="">Select account...</option>
                {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.code} {a.name} ({peso(a.current_balance)})</option>)}
            </select>
            {selAcct && <>
                <select style={S.sel} value={filterRecon} onChange={e => setFilterRecon(Number(e.target.value))}>
                    <option value={-1}>All Transactions</option><option value={0}>Unreconciled</option><option value={1}>Reconciled</option>
                </select>
                <button style={S.btnP} onClick={() => { setShowAdd(true); setAddForm({ txn_date: new Date().toISOString().split("T")[0], description: "", reference: "", amount: 0, statement_date: "" }); }}><I name="plus" size={14}/> Add Statement Entry</button>
            </>}
        </div>

        {!selAcct ? (
            <div style={S.empty}><I name="credit-card" size={32} style={{ opacity: .3, marginBottom: 8 }}/><div>Select a bank account to begin reconciliation</div></div>
        ) : (
            <>
                {/* Summary cards */}
                {reconSum && (
                    <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                        <div style={{ ...S.stat, flex: 1, borderLeft: "4px solid #3b82f6" }}>
                            <div style={S.statL}>Book Balance</div><div style={S.statV}>{peso(reconSum.book_balance)}</div>
                        </div>
                        <div style={{ ...S.stat, flex: 1, borderLeft: "4px solid #22c55e" }}>
                            <div style={S.statL}>Reconciled</div><div style={S.statV}>{peso(reconSum.reconciled_total)}</div>
                        </div>
                        <div style={{ ...S.stat, flex: 1, borderLeft: "4px solid #f59e0b" }}>
                            <div style={S.statL}>Unreconciled ({reconSum.unreconciled_count})</div><div style={S.statV}>{peso(reconSum.unreconciled_total)}</div>
                        </div>
                        <div style={{ ...S.stat, flex: 1, borderLeft: `4px solid ${Math.abs(reconSum.book_balance - reconSum.reconciled_total) < 0.01 ? "#22c55e" : "#ef4444"}` }}>
                            <div style={S.statL}>Difference</div><div style={{ ...S.statV, color: Math.abs(reconSum.book_balance - reconSum.reconciled_total) < 0.01 ? "#22c55e" : "#ef4444" }}>{peso(reconSum.book_balance - reconSum.reconciled_total)}</div>
                        </div>
                    </div>
                )}

                {/* Add statement entry form */}
                {showAdd && (
                    <div style={{ ...S.card, marginBottom: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Add Bank Statement Entry</div>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                            <div style={{ flex: 1 }}><label style={S.lbl}>Date *</label><input type="date" style={S.inp} value={addForm.txn_date} onChange={e => setAddForm(p => ({ ...p, txn_date: e.target.value }))}/></div>
                            <div style={{ flex: 2 }}><label style={S.lbl}>Description</label><input style={S.inp} value={addForm.description} onChange={e => setAddForm(p => ({ ...p, description: e.target.value }))}/></div>
                            <div style={{ flex: 1 }}><label style={S.lbl}>Reference</label><input style={S.inp} value={addForm.reference} onChange={e => setAddForm(p => ({ ...p, reference: e.target.value }))}/></div>
                            <div style={{ flex: 1 }}><label style={S.lbl}>Amount (+ deposit, - withdrawal)</label><input type="number" step="0.01" style={S.inp} value={addForm.amount} onChange={e => setAddForm(p => ({ ...p, amount: Number(e.target.value) }))}/></div>
                        </div>
                        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                            <button style={S.btnP} onClick={addTxn}><I name="save" size={14}/> Add</button>
                            <button style={S.btnO} onClick={() => setShowAdd(false)}>Cancel</button>
                        </div>
                    </div>
                )}

                {/* Transactions table */}
                <div style={S.card}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Bank Statement Entries ({txns.length})</div>
                    {loading ? <div style={S.empty}>Loading...</div> : txns.length === 0 ? <div style={S.empty}>No transactions</div> : (
                        <table style={S.tbl}><thead><tr>
                            <th style={S.th}>Date</th><th style={S.th}>Description</th><th style={S.th}>Reference</th>
                            <th style={{ ...S.th, textAlign: "right" }}>Amount</th><th style={S.th}>Status</th><th style={S.th}></th>
                        </tr></thead><tbody>
                        {txns.map(t => (
                            <tr key={t.id} style={{ background: matchMode === t.id ? "#eff6ff" : "transparent" }}>
                                <td style={{ ...S.td, fontSize: 12 }}>{t.txn_date?.split("T")[0]}</td>
                                <td style={S.td}>{t.description}</td>
                                <td style={{ ...S.td, fontSize: 12, color: "#888" }}>{t.reference}</td>
                                <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: t.amount >= 0 ? "#22c55e" : "#ef4444" }}>
                                    {t.amount >= 0 ? "+" : ""}{peso(t.amount)}
                                </td>
                                <td style={S.td}>
                                    {t.is_reconciled ? (
                                        <span style={{ ...S.badge, background: "#dcfce7", color: "#16a34a" }}>✓ Reconciled</span>
                                    ) : (
                                        <span style={{ ...S.badge, background: "#fef3c7", color: "#92400e" }}>Pending</span>
                                    )}
                                </td>
                                <td style={{ ...S.td, display: "flex", gap: 4 }}>
                                    {t.is_reconciled ? (
                                        <button style={S.iBtn} onClick={() => unreconcile(t.id)} title="Unreconcile"><I name="x" size={13}/></button>
                                    ) : (
                                        <button style={{ ...S.iBtn, color: "#10b981" }} onClick={() => setMatchMode(matchMode === t.id ? null : t.id)} title="Match">
                                            <I name="link" size={13}/>
                                        </button>
                                    )}
                                    {!t.is_reconciled && <button style={{ ...S.iBtn, color: "#ef4444" }} onClick={() => deleteTxn(t.id)}><I name="trash-2" size={13}/></button>}
                                </td>
                            </tr>
                        ))}
                        </tbody></table>
                    )}
                </div>

                {/* Match panel */}
                {matchMode && (
                    <div style={{ ...S.card, marginTop: 12, borderColor: "#93c5fd" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "#1d4ed8" }}>
                            <I name="link" size={14}/> Match with Journal Entry
                            <span style={{ fontWeight: 400, color: "#888", marginLeft: 8 }}>Select a journal entry to match with the selected bank transaction</span>
                        </div>
                        {unmatched.length === 0 ? <div style={{ color: "#aaa", fontSize: 13, padding: 10 }}>No unmatched journal entries for this account</div> : (
                            <table style={S.tbl}><thead><tr>
                                <th style={S.th}>JE #</th><th style={S.th}>Date</th><th style={S.th}>Memo</th><th style={S.th}>Description</th>
                                <th style={{ ...S.th, textAlign: "right" }}>Debit</th><th style={{ ...S.th, textAlign: "right" }}>Credit</th>
                                <th style={{ ...S.th, textAlign: "right" }}>Net</th><th style={S.th}></th>
                            </tr></thead><tbody>
                            {unmatched.map(u => (
                                <tr key={u.line_id}>
                                    <td style={{ ...S.td, fontWeight: 600 }}>JE-{String(u.entry_number).padStart(4, "0")}</td>
                                    <td style={{ ...S.td, fontSize: 12 }}>{u.entry_date?.split("T")[0]}</td>
                                    <td style={S.td}>{u.memo}</td>
                                    <td style={S.td}>{u.description}</td>
                                    <td style={{ ...S.td, textAlign: "right" }}>{u.debit > 0 ? peso(u.debit) : ""}</td>
                                    <td style={{ ...S.td, textAlign: "right" }}>{u.credit > 0 ? peso(u.credit) : ""}</td>
                                    <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: u.net_amount >= 0 ? "#22c55e" : "#ef4444" }}>{peso(u.net_amount)}</td>
                                    <td style={S.td}><button style={S.btnP} onClick={() => reconcile(matchMode, u.entry_id)}><I name="check" size={12}/> Match</button></td>
                                </tr>
                            ))}
                            </tbody></table>
                        )}
                        <button style={{ ...S.btnO, marginTop: 8 }} onClick={() => setMatchMode(null)}>Cancel</button>
                    </div>
                )}
            </>
        )}
    </div>);
}

const S = {
    flash: { background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46", padding: "8px 14px", borderRadius: 8, fontSize: 13, marginBottom: 12 },
    stat: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 16px" },
    statV: { fontSize: 18, fontWeight: 700, color: "#1a1a2e" },
    statL: { fontSize: 11, color: "#888", marginBottom: 2 },
    card: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 },
    tbl: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
    th: { textAlign: "left", padding: "8px 10px", fontSize: 11, fontWeight: 600, color: "#888", borderBottom: "1px solid #e5e7eb" },
    td: { padding: "7px 10px", borderBottom: "1px solid #f3f4f6" },
    badge: { display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 },
    hdr: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16 },
    back: { background: "none", border: "1px solid #d1d5db", borderRadius: 8, padding: "6px 8px", cursor: "pointer", display: "flex", alignItems: "center" },
    sel: { padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, background: "#fff", cursor: "pointer", minWidth: 250 },
    btnP: { display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: "#10b981", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" },
    btnO: { display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: "#fff", color: "#374151", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer" },
    lbl: { display: "block", fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 4 },
    inp: { width: "100%", padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" },
    iBtn: { background: "none", border: "none", cursor: "pointer", color: "#6366f1", padding: 4, display: "flex", alignItems: "center" },
    empty: { textAlign: "center", padding: 40, color: "#aaa", fontSize: 13 },
};
