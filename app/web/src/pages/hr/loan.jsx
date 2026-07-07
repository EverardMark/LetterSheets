import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";
import Modal from "../components/Modal";

const API_URL = (import.meta.env.VITE_API_BASE||"")+"/api/execute";
async function api(action, body = {}) {
    const session = localStorage.getItem("ls_session");
    const res = await fetch(`${API_URL}?action=${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session}` } : {}) },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`API ${action} failed`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "failed");
    return json.data;
}

function fmtDate(d) {
    if (!d) return "—";
    const dt = new Date((d || "").substring(0, 10) + "T00:00:00");
    return isNaN(dt) ? d : dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtMoney(n) {
    return "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_COLORS = {
    Pending: "#f59e0b", Approved: "#6366f1", Active: "#0ea5e9",
    Paid: "#22c55e", Rejected: "#ef4444", Cancelled: "#9ca3af",
};
const STATUS_ICONS = {
    Pending: "clock", Approved: "thumbs-up", Active: "trending-up",
    Paid: "check-circle", Rejected: "x-circle", Cancelled: "slash",
};
const TABS = ["All", "Pending", "Active", "Paid", "Rejected"];

export default function LoanTab({ employees = [] }) {
    const company = JSON.parse(localStorage.getItem("ls_company") || "{}");
    const currentUser = JSON.parse(localStorage.getItem("ls_user") || "{}");
    const isEmployee = company.role === "employee";
    const myEmployee = isEmployee ? employees.find(e => e.user_id === currentUser.id) : null;

    const [view, setView] = useState("list");
    const [loans, setLoans] = useState([]);
    const [loanTypes, setLoanTypes] = useState([]);
    const [tab, setTab] = useState("All");
    const [search, setSearch] = useState("");
    const [selectedLoan, setSelectedLoan] = useState(null);
    const [payments, setPayments] = useState([]);
    const [showApplyModal, setShowApplyModal] = useState(false);
    const [showRejectModal, setShowRejectModal] = useState(null);

    const loadLoans = useCallback(async () => {
        try { const d = await api("get_loans", { status: tab === "All" ? "" : tab }); setLoans(d.loans || []); } catch { setLoans([]); }
    }, [tab]);
    const loadTypes = useCallback(async () => {
        try { const d = await api("get_loan_types"); setLoanTypes(d.loan_types || []); } catch { setLoanTypes([]); }
    }, []);
    useEffect(() => { loadLoans(); loadTypes(); }, [loadLoans, loadTypes]);

    const openLoan = async (loan) => {
        setSelectedLoan(loan);
        try { const d = await api("get_loan_payments", { loan_id: loan.id }); setPayments(d.payments || []); } catch { setPayments([]); }
    };

    const approveLoan = async (id) => {
        const startDate = new Date().toISOString().slice(0, 10);
        const loan = loans.find(l => l.id === id);
        const months = loan?.term_months || 12;
        const end = new Date();
        end.setMonth(end.getMonth() + months);
        try {
            await api("approve_loan", { id, approved_by: "", start_date: startDate, end_date: end.toISOString().slice(0, 10) });
            loadLoans();
            if (selectedLoan?.id === id) setSelectedLoan(prev => ({ ...prev, status: "Active", start_date: startDate }));
        } catch (e) { alert(e.message); }
    };

    const rejectLoan = async (id, note) => {
        setShowRejectModal(null);
        try { await api("reject_loan", { id, rejection_note: note }); loadLoans();
            if (selectedLoan?.id === id) setSelectedLoan(prev => ({ ...prev, status: "Rejected", rejection_note: note }));
        } catch (e) { alert(e.message); }
    };

    const cancelLoan = async (id) => {
        if (!confirm("Cancel this loan?")) return;
        try { await api("cancel_loan", { id }); loadLoans();
            if (selectedLoan?.id === id) setSelectedLoan(prev => ({ ...prev, status: "Cancelled" }));
        } catch (e) { alert(e.message); }
    };

    const deleteLoan = async (id) => {
        if (!confirm("Delete this loan permanently?")) return;
        try { await api("delete_loan", { id }); setSelectedLoan(null); loadLoans(); } catch (e) { alert(e.message); }
    };

    const recordPayment = async (loanId, amount, paymentType, notes) => {
        try {
            await api("record_loan_payment", {
                loan_id: loanId, payment_date: new Date().toISOString().slice(0, 10),
                amount: parseFloat(amount), principal: parseFloat(amount), interest: 0,
                payment_type: paymentType, notes,
            });
            const d = await api("get_loan_payments", { loan_id: loanId });
            setPayments(d.payments || []);
            loadLoans();
            // Refresh selected loan
            try { const ld = await api("get_loans", { status: "" }); const updated = (ld.loans || []).find(l => l.id === loanId);
                if (updated) setSelectedLoan(updated);
            } catch {}
        } catch (e) { alert(e.message); }
    };

    const deletePayment = async (id) => {
        if (!confirm("Delete this payment?")) return;
        try { await api("delete_loan_payment", { id });
            if (selectedLoan) { const d = await api("get_loan_payments", { loan_id: selectedLoan.id }); setPayments(d.payments || []); }
            loadLoans();
        } catch (e) { alert(e.message); }
    };

    const submitLoan = async (data) => {
        setShowApplyModal(false);
        try { await api("create_loan", data); loadLoans(); } catch (e) { alert(e.message); }
    };

    const myLoans = isEmployee && myEmployee
        ? loans.filter(l => l.employee_id === myEmployee.id)
        : loans;

    const filtered = myLoans.filter(l => {
        if (search) {
            const s = search.toLowerCase();
            return (l.first_name + " " + l.last_name).toLowerCase().includes(s) || (l.loan_type_name || "").toLowerCase().includes(s);
        }
        return true;
    });

    // Stats
    if (view === "types") return <LoanTypesView types={loanTypes} onBack={() => { setView("list"); loadTypes(); }} onReload={loadTypes} />;

    return (<>
        {/* Toolbar */}
        <div className="ln-toolbar">
            <div className="ln-tabs">
                {TABS.map(t => (
                    <button key={t} className={`ln-tab ${tab === t ? "ln-tab-active" : ""}`} onClick={() => setTab(t)}>
                        {t}{t !== "All" && <span className="ln-tab-count">{myLoans.filter(l => l.status === t).length}</span>}
                    </button>
                ))}
            </div>
            <div className="ln-toolbar-right">
                {!isEmployee && (
                    <div className="ln-search-wrap">
                        <I name="search" size={14} />
                        <input className="ln-search" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                )}
                {!isEmployee && <button className="ln-btn-ghost" onClick={() => setView("types")}><I name="settings" size={14} /> Loan Types</button>}
                {!isEmployee && <button className="ln-btn-primary" onClick={() => setShowApplyModal(true)}><I name="plus" size={14} /> New Loan</button>}
            </div>
        </div>

        {/* Table */}
        <div className="ln-table-wrap">
            <table className="ln-table">
                <thead>
                <tr>
                    <th>Employee</th>
                    <th>Loan Type</th>
                    <th>Amount</th>
                    <th>Balance</th>
                    <th>Term</th>
                    <th>Status</th>
                    <th>Applied</th>
                    <th></th>
                </tr>
                </thead>
                <tbody>
                {filtered.length === 0 ? (
                    <tr><td colSpan={8} className="ln-table-empty">No loans found</td></tr>
                ) : filtered.map(loan => {
                    const sc = STATUS_COLORS[loan.status] || "#999";
                    const paidPct = loan.total_payable > 0 ? Math.round((loan.total_paid / loan.total_payable) * 100) : 0;
                    return (
                        <tr key={loan.id} className={`ln-row ${selectedLoan?.id === loan.id ? "ln-row-selected" : ""}`} onClick={() => openLoan(loan)}>
                            <td>
                                <div className="ln-emp">
                                    <div className="ln-emp-av" style={{ background: sc + "14", color: sc }}>
                                        {(loan.first_name?.[0] || "") + (loan.last_name?.[0] || "")}
                                    </div>
                                    <div>
                                        <div className="ln-emp-name">{loan.first_name} {loan.last_name}</div>
                                        <div className="ln-emp-pos">{loan.position || loan.department || ""}</div>
                                    </div>
                                </div>
                            </td>
                            <td><span className="ln-type-chip">{loan.loan_type_name || "—"}</span></td>
                            <td className="ln-money">{fmtMoney(loan.amount)}</td>
                            <td>
                                <div className="ln-bal">
                                    <span className="ln-money">{fmtMoney(loan.balance)}</span>
                                    {loan.status === "Active" && (
                                        <div className="ln-bal-bar"><div className="ln-bal-fill" style={{ width: paidPct + "%", background: "#22c55e" }} /></div>
                                    )}
                                </div>
                            </td>
                            <td><span className="ln-term">{loan.term_months}mo</span></td>
                            <td>
                  <span className="ln-status" style={{ background: sc + "14", color: sc }}>
                    <I name={STATUS_ICONS[loan.status]} size={11} /> {loan.status}
                  </span>
                            </td>
                            <td className="ln-date">{fmtDate(loan.applied_date)}</td>
                            <td>
                                {!isEmployee && loan.status === "Pending" && (
                                    <div className="ln-actions" onClick={e => e.stopPropagation()}>
                                        <button className="ln-act-btn ln-act-approve" title="Approve" onClick={() => approveLoan(loan.id)}><I name="check" size={13} /></button>
                                        <button className="ln-act-btn ln-act-reject" title="Reject" onClick={() => setShowRejectModal(loan.id)}><I name="x" size={13} /></button>
                                    </div>
                                )}
                            </td>
                        </tr>
                    );
                })}
                </tbody>
            </table>
        </div>

        {/* Side panel */}
        {selectedLoan && (
            <LoanPanel loan={selectedLoan} payments={payments}
                       onApprove={() => approveLoan(selectedLoan.id)}
                       onReject={() => setShowRejectModal(selectedLoan.id)}
                       onCancel={() => cancelLoan(selectedLoan.id)}
                       onDelete={() => deleteLoan(selectedLoan.id)}
                       onRecordPayment={(amt, type, notes) => recordPayment(selectedLoan.id, amt, type, notes)}
                       onDeletePayment={deletePayment}
                       onClose={() => setSelectedLoan(null)}
            />
        )}

        {showApplyModal && <ApplyModal employees={employees} loanTypes={loanTypes} onSubmit={submitLoan} onClose={() => setShowApplyModal(false)} />}
        {showRejectModal && <RejectModal onReject={(note) => rejectLoan(showRejectModal, note)} onClose={() => setShowRejectModal(null)} />}
        <style>{CSS}</style>
    </>);
}

/* ================================================================
   LOAN DETAIL PANEL
================================================================ */
function LoanPanel({ loan, payments, onApprove, onReject, onCancel, onDelete, onRecordPayment, onDeletePayment, onClose }) {
    const [showPayForm, setShowPayForm] = useState(false);
    const [payAmt, setPayAmt] = useState(loan.monthly_payment?.toString() || "");
    const [payType, setPayType] = useState("Manual Payment");
    const [payNotes, setPayNotes] = useState("");

    const sc = STATUS_COLORS[loan.status] || "#999";
    const paidPct = loan.total_payable > 0 ? Math.round((loan.total_paid / loan.total_payable) * 100) : 0;

    const submitPayment = () => {
        if (!payAmt || parseFloat(payAmt) <= 0) return;
        onRecordPayment(payAmt, payType, payNotes);
        setShowPayForm(false); setPayAmt(loan.monthly_payment?.toString() || ""); setPayNotes("");
    };

    return (
        <Modal
            title={`${loan.first_name} ${loan.last_name}`}
            subtitle={`${loan.loan_type_name || "Loan"} · ${loan.position || ""}${loan.department ? ` · ${loan.department}` : ""}`}
            onClose={onClose}
        >
            <div className="ap-modal-layout">
                <div className="ap-modal-scroll">
                    {/* Status & Type */}
                    <div className="ln-panel-type" style={{marginBottom:14}}>
                        <span className="ln-type-chip">{loan.loan_type_name || "Loan"}</span>
                        <span className="ln-status" style={{ background: sc + "14", color: sc }}>
                            <I name={STATUS_ICONS[loan.status]} size={11} /> {loan.status}
                        </span>
                    </div>

                    {/* Amount summary */}
                    <div className="ap-section">
                        <h4 className="ap-sec-title">Loan Details</h4>
                        <div className="ap-fields">
                            <div className="ap-field">
                                <label className="ap-label">Loan Amount</label>
                                <input className="ap-input" value={fmtMoney(loan.amount)} disabled />
                            </div>
                            <div className="ap-field">
                                <label className="ap-label">Interest Rate</label>
                                <input className="ap-input" value={`${loan.interest_rate}%`} disabled />
                            </div>
                            <div className="ap-field">
                                <label className="ap-label">Term</label>
                                <input className="ap-input" value={`${loan.term_months} months`} disabled />
                            </div>
                            <div className="ap-field">
                                <label className="ap-label">Monthly Payment</label>
                                <input className="ap-input" value={fmtMoney(loan.monthly_payment)} disabled />
                            </div>
                            <div className="ap-field">
                                <label className="ap-label">Total Payable</label>
                                <input className="ap-input" value={fmtMoney(loan.total_payable)} disabled />
                            </div>
                            <div className="ap-field">
                                <label className="ap-label">Total Paid</label>
                                <input className="ap-input" value={fmtMoney(loan.total_paid)} disabled style={{color:"#22c55e",fontWeight:600}} />
                            </div>
                            <div className="ap-field">
                                <label className="ap-label">Balance</label>
                                <input className="ap-input" value={fmtMoney(loan.balance)} disabled style={{color:loan.balance > 0 ? "#ef4444" : "#22c55e", fontWeight:600}} />
                            </div>
                            <div className="ap-field">
                                <label className="ap-label">Applied</label>
                                <input className="ap-input" value={fmtDate(loan.applied_date)} disabled />
                            </div>
                            {loan.start_date && <div className="ap-field">
                                <label className="ap-label">Started</label>
                                <input className="ap-input" value={fmtDate(loan.start_date)} disabled />
                            </div>}
                            {loan.end_date && <div className="ap-field">
                                <label className="ap-label">Due</label>
                                <input className="ap-input" value={fmtDate(loan.end_date)} disabled />
                            </div>}
                        </div>

                        {loan.status === "Active" && (
                            <div className="ln-panel-pbar" style={{marginTop:12}}>
                                <div className="ln-panel-pbar-fill" style={{ width: paidPct + "%" }} />
                                <span className="ln-panel-pbar-txt">{paidPct}% paid</span>
                            </div>
                        )}
                    </div>

                    {loan.rejection_note && <div className="ln-rejection"><I name="alert-circle" size={12} /> {loan.rejection_note}</div>}
                    {loan.notes && <div className="ln-notes"><I name="message-square" size={12} /> {loan.notes}</div>}

                    {/* Actions */}
                    {loan.status === "Pending" && (
                        <div className="ln-panel-actions">
                            <button className="ln-btn-approve" onClick={onApprove}><I name="check" size={14} /> Approve</button>
                            <button className="ln-btn-reject" onClick={onReject}><I name="x" size={14} /> Reject</button>
                        </div>
                    )}

                    {/* Payments */}
                    <div style={{marginTop:16}}>
                        <div className="ln-pay-header">
                            <h4 className="ap-sec-title" style={{margin:0}}>Payments ({payments.length})</h4>
                            {loan.status === "Active" && (
                                <button className="ln-btn-sm" onClick={() => setShowPayForm(!showPayForm)}>
                                    <I name={showPayForm ? "chevron-up" : "plus"} size={12} /> {showPayForm ? "Cancel" : "Record Payment"}
                                </button>
                            )}
                        </div>

                        {showPayForm && (
                            <div className="ln-pay-form">
                                <div className="ln-pay-form-row">
                                    <div style={{ flex: 1 }}>
                                        <label className="ap-label">Amount</label>
                                        <input className="ap-input" type="number" step="0.01" value={payAmt} onChange={e => setPayAmt(e.target.value)} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label className="ap-label">Type</label>
                                        <select className="ap-input" value={payType} onChange={e => setPayType(e.target.value)}>
                                            <option>Manual Payment</option>
                                            <option>Payroll Deduction</option>
                                            <option>Lump Sum</option>
                                        </select>
                                    </div>
                                </div>
                                <input className="ap-input" placeholder="Notes (optional)" value={payNotes} onChange={e => setPayNotes(e.target.value)} />
                                <button className="ap-btn-primary" style={{ marginTop: 6 }} onClick={submitPayment} disabled={!payAmt || parseFloat(payAmt) <= 0}>Record Payment</button>
                            </div>
                        )}

                        {payments.length === 0 ? (
                            <div style={{textAlign:"center",padding:"20px 0",color:"#ccc",fontSize:13}}>No payments recorded yet.</div>
                        ) : (
                            <div className="ln-payments">
                                {payments.map(p => (
                                    <div key={p.id} className="ln-payment">
                                        <div className="ln-pay-left">
                                            <div className="ln-pay-icon"><I name="arrow-down-circle" size={14} /></div>
                                            <div>
                                                <div className="ln-pay-amount">{fmtMoney(p.amount)}</div>
                                                <div className="ln-pay-meta">{p.payment_type} · {fmtDate(p.payment_date)}</div>
                                            </div>
                                        </div>
                                        <div className="ln-pay-right">
                                            <span className="ln-pay-bal">Bal: {fmtMoney(p.balance_after)}</span>
                                            <button className="ln-pay-del" onClick={() => onDeletePayment(p.id)}><I name="trash-2" size={11} /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="ap-modal-foot">
                    <div className="ap-foot-btns">
                        {["Pending", "Approved"].includes(loan.status) && (
                            <button className="ap-btn-danger" onClick={onCancel}><I name="slash" size={12} /> Cancel Loan</button>
                        )}
                        <button className="ap-btn-danger" onClick={onDelete}><I name="trash-2" size={13} /> Delete</button>
                        <button className="ap-btn-cancel" onClick={onClose}>Close</button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}

/* ================================================================
   APPLY LOAN MODAL
================================================================ */
function ApplyModal({ employees, loanTypes, onSubmit, onClose }) {
    const [empId, setEmpId] = useState("");
    const [typeId, setTypeId] = useState("");
    const [amount, setAmount] = useState("");
    const [termMonths, setTermMonths] = useState("12");
    const [notes, setNotes] = useState("");

    const selectedType = loanTypes.find(t => t.id === typeId);
    const rate = selectedType?.interest_rate || 0;
    const amt = parseFloat(amount) || 0;
    const term = parseInt(termMonths) || 1;
    const totalInterest = amt * (rate / 100) * (term / 12);
    const totalPayable = amt + totalInterest;
    const monthlyPayment = term > 0 ? totalPayable / term : 0;

    const submit = () => {
        onSubmit({
            employee_id: empId, loan_type_id: typeId,
            loan_type_name: selectedType?.name || "General",
            amount: amt, interest_rate: rate, term_months: term,
            monthly_payment: Math.round(monthlyPayment * 100) / 100,
            total_payable: Math.round(totalPayable * 100) / 100,
            applied_date: new Date().toISOString().slice(0, 10), notes,
        });
    };

    return (
        <Modal title="New Loan Application" subtitle="Submit a loan request" onClose={onClose}>
            <div className="ap-modal-layout">
                <div className="ap-modal-scroll">
                    <div className="ap-section">
                        <h4 className="ap-sec-title">Loan Details</h4>
                        <div className="ap-fields">
                            <div className="ap-field ap-field-full">
                                <label className="ap-label">Employee <span className="ap-req"/></label>
                                <select className="ap-input" value={empId} onChange={e => setEmpId(e.target.value)}>
                                    <option value="">Select employee...</option>
                                    {employees.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
                                </select>
                            </div>
                            <div className="ap-field ap-field-full">
                                <label className="ap-label">Loan Type <span className="ap-req"/></label>
                                <select className="ap-input" value={typeId} onChange={e => setTypeId(e.target.value)}>
                                    <option value="">Select loan type...</option>
                                    {loanTypes.map(t => <option key={t.id} value={t.id}>{t.name} ({t.interest_rate}% · max {fmtMoney(t.max_amount)})</option>)}
                                </select>
                            </div>
                            <div className="ap-field">
                                <label className="ap-label">Amount <span className="ap-req"/></label>
                                <input className="ap-input" type="number" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} max={selectedType?.max_amount || undefined} />
                            </div>
                            <div className="ap-field">
                                <label className="ap-label">Term (months)</label>
                                <input className="ap-input" type="number" min="1" max={selectedType?.max_term_months || 60} value={termMonths} onChange={e => setTermMonths(e.target.value)} />
                            </div>
                        </div>

                        {amt > 0 && (
                            <div className="ln-calc-box" style={{marginTop:12}}>
                                <div className="ln-calc-row"><span>Interest ({rate}%)</span><strong>{fmtMoney(totalInterest)}</strong></div>
                                <div className="ln-calc-row"><span>Total Payable</span><strong>{fmtMoney(totalPayable)}</strong></div>
                                <div className="ln-calc-row ln-calc-highlight"><span>Monthly Payment</span><strong>{fmtMoney(monthlyPayment)}</strong></div>
                            </div>
                        )}

                        <div className="ap-fields" style={{marginTop:12}}>
                            <div className="ap-field ap-field-full">
                                <label className="ap-label">Notes</label>
                                <input className="ap-input" placeholder="Reason for loan..." value={notes} onChange={e => setNotes(e.target.value)} />
                            </div>
                        </div>
                    </div>
                </div>
                <div className="ap-modal-foot">
                    <div className="ap-foot-btns">
                        <button className="ap-btn-cancel" onClick={onClose}>Cancel</button>
                        <button className="ap-btn-primary" disabled={!empId || !typeId || amt <= 0} onClick={submit}>Submit Application</button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}

/* ================================================================
   REJECT MODAL
================================================================ */
function RejectModal({ onReject, onClose }) {
    const [note, setNote] = useState("");
    return (
        <Modal title="Reject Loan" subtitle="Provide a reason for rejection" onClose={onClose}>
            <div className="ap-modal-layout" style={{minHeight:"auto"}}>
                <div className="ap-modal-scroll">
                    <div className="ap-fields">
                        <div className="ap-field ap-field-full">
                            <label className="ap-label">Reason</label>
                            <textarea className="ap-input ap-textarea" rows={3} placeholder="Rejection reason..." value={note} onChange={e => setNote(e.target.value)} />
                        </div>
                    </div>
                </div>
                <div className="ap-modal-foot">
                    <div className="ap-foot-btns">
                        <button className="ap-btn-cancel" onClick={onClose}>Cancel</button>
                        <button className="ap-btn-danger" onClick={() => onReject(note)}>Reject</button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}

/* ================================================================
   LOAN TYPES VIEW
================================================================ */
function LoanTypesView({ types, onBack, onReload }) {
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ name: "", description: "", max_amount: "", interest_rate: "", max_term_months: "12", requires_approval: true });

    const openType = (t) => {
        setEditing(t);
        setForm({ name: t.name, description: t.description || "", max_amount: t.max_amount?.toString() || "", interest_rate: t.interest_rate?.toString() || "", max_term_months: t.max_term_months?.toString() || "12", requires_approval: !!t.requires_approval });
    };
    const createType = async () => {
        try {
            await api("create_loan_type", { name: "New Loan Type", description: "", max_amount: 50000, interest_rate: 6, max_term_months: 12, requires_approval: true });
            onReload();
        } catch (e) { alert(e.message); }
    };
    const saveType = async () => {
        if (!editing) return;
        try {
            await api("update_loan_type", { id: editing.id, name: form.name, description: form.description, max_amount: parseFloat(form.max_amount) || 0, interest_rate: parseFloat(form.interest_rate) || 0, max_term_months: parseInt(form.max_term_months) || 12, requires_approval: form.requires_approval });
            onReload();
        } catch (e) { alert(e.message); }
    };
    const deleteType = async (id) => {
        if (!confirm("Delete this loan type?")) return;
        try { await api("delete_loan_type", { id }); setEditing(null); onReload(); } catch (e) { alert(e.message); }
    };

    return (<>
        <div className="tpl-head">
            <button className="ln-btn-ghost" onClick={onBack}><I name="arrow-left" size={16} /> Back</button>
            <h2 className="tpl-title">Loan Types</h2>
            <button className="ln-btn-primary" onClick={createType}><I name="plus" size={14} /> New Type</button>
        </div>
        <p className="tpl-desc">Configure the types of loans your company offers. Set interest rates, max amounts, and terms.</p>

        <div className="tpl-layout">
            <div className="tpl-list">
                {types.length === 0 ? (
                    <div className="tpl-empty"><I name="credit-card" size={24} /><p>No loan types</p><span>Create your first loan type.</span></div>
                ) : types.map(t => (
                    <div key={t.id} className={`tpl-card ${editing?.id === t.id ? "tpl-card-active" : ""}`} onClick={() => openType(t)}>
                        <div className="tpl-card-top">
                            <I name="credit-card" size={14} style={{ color: "#6366f1" }} />
                            <span className="tpl-card-name">{t.name}</span>
                        </div>
                        <span className="tpl-card-meta">{t.interest_rate}% · max {fmtMoney(t.max_amount)} · {t.max_term_months}mo</span>
                    </div>
                ))}
            </div>

            {editing ? (
                <div className="tpl-editor">
                    <div className="tpl-editor-top">
                        <h3 className="tpl-editor-title">{form.name}</h3>
                        <button className="ob-btn-danger-sm" onClick={() => deleteType(editing.id)}><I name="trash-2" size={12} /> Delete</button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                        <div style={{ gridColumn: "1/-1" }}><label className="ln-lbl">Name</label><input className="ln-inp" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
                        <div style={{ gridColumn: "1/-1" }}><label className="ln-lbl">Description</label><input className="ln-inp" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
                        <div><label className="ln-lbl">Max Amount</label><input className="ln-inp" type="number" value={form.max_amount} onChange={e => setForm(p => ({ ...p, max_amount: e.target.value }))} /></div>
                        <div><label className="ln-lbl">Interest Rate (%)</label><input className="ln-inp" type="number" step="0.01" value={form.interest_rate} onChange={e => setForm(p => ({ ...p, interest_rate: e.target.value }))} /></div>
                        <div><label className="ln-lbl">Max Term (months)</label><input className="ln-inp" type="number" value={form.max_term_months} onChange={e => setForm(p => ({ ...p, max_term_months: e.target.value }))} /></div>
                        <div><label className="ln-lbl">Requires Approval</label>
                            <button className={`ob-toggle ${form.requires_approval ? "ob-toggle-on" : ""}`} onClick={() => setForm(p => ({ ...p, requires_approval: !p.requires_approval }))} style={{ marginTop: 4 }}><div className="ob-toggle-dot" /></button>
                        </div>
                    </div>
                    <button className="ln-btn-primary" onClick={saveType}>Save Loan Type</button>
                </div>
            ) : (
                <div className="tpl-editor tpl-editor-empty"><I name="arrow-left" size={20} /><p>Select a loan type</p></div>
            )}
        </div>
        <style>{CSS}</style>
    </>);
}

/* ================================================================ */
const CSS = `
  /* Toolbar */
  .ln-toolbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px}
  .ln-tabs{display:flex;gap:4px;background:#f5f5f5;padding:3px;border-radius:10px}
  .ln-tab{padding:7px 14px;border:none;border-radius:8px;background:transparent;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:600;color:#888;cursor:pointer;display:flex;align-items:center;gap:5px}
  .ln-tab:hover{color:#555}
  .ln-tab-active{background:#fff;color:#222;box-shadow:0 1px 3px rgba(0,0,0,.06)}
  .ln-tab-count{font-size:10px;background:#f0f0f0;padding:1px 6px;border-radius:8px;color:#999}
  .ln-tab-active .ln-tab-count{background:#f59e0b;color:#fff}

  .ln-toolbar-right{display:flex;gap:8px;align-items:center}
  .ln-search-wrap{display:flex;align-items:center;gap:6px;padding:7px 12px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;color:#aaa}
  .ln-search{border:none;outline:none;font-family:'DM Sans',sans-serif;font-size:13px;color:#333;width:140px;background:transparent}

  .ln-btn-primary{display:flex;align-items:center;gap:5px;padding:9px 18px;border:none;border-radius:8px;background:#6366f1;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;color:#fff;cursor:pointer}
  .ln-btn-primary:hover{background:#4f46e5}
  .ln-btn-primary:disabled{opacity:.5;cursor:not-allowed}
  .ln-btn-ghost{display:flex;align-items:center;gap:5px;padding:9px 16px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;color:#666;cursor:pointer}
  .ln-btn-ghost:hover{background:#f5f5f5}
  .ln-btn-ghost-sm{display:flex;align-items:center;gap:4px;padding:7px 12px;border:1px solid #e0e0e0;border-radius:7px;background:#fff;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:500;color:#666;cursor:pointer}
  .ln-btn-sm{display:flex;align-items:center;gap:4px;padding:5px 10px;border:1px solid #e0e0e0;border-radius:6px;background:#fff;font-family:'DM Sans',sans-serif;font-size:11px;font-weight:600;color:#666;cursor:pointer}
  .ln-btn-sm:hover{background:#f5f5f5}
  .ln-btn-approve{display:flex;align-items:center;gap:4px;padding:8px 16px;border:none;border-radius:8px;background:#22c55e;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;color:#fff;cursor:pointer;flex:1;justify-content:center}
  .ln-btn-approve:hover{background:#16a34a}
  .ln-btn-reject{display:flex;align-items:center;gap:4px;padding:8px 16px;border:none;border-radius:8px;background:#ef4444;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;color:#fff;cursor:pointer;flex:1;justify-content:center}
  .ln-btn-reject:hover{background:#dc2626}
  .ob-btn-danger-sm{display:flex;align-items:center;gap:4px;padding:7px 12px;border:1px solid #fecaca;border-radius:7px;background:#fef2f2;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:500;color:#ef4444;cursor:pointer}
  .ob-btn-danger-sm:hover{background:#ef4444;color:#fff}

  /* Table */
  .ln-table-wrap{overflow-x:auto;background:#fff;border:1px solid #eee;border-radius:12px}
  .ln-table{width:100%;border-collapse:collapse;font-size:13px}
  .ln-table th{text-align:left;padding:12px 14px;color:#888;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #eee;white-space:nowrap}
  .ln-table td{padding:10px 14px;vertical-align:middle}
  .ln-table-empty{text-align:center;padding:40px !important;color:#ccc}
  .ln-table tbody tr{border-bottom:1px solid #f5f5f5;transition:background .1s;cursor:pointer}
  .ln-table tbody tr:hover{background:#fffbeb}
  .ln-table tbody tr:last-child{border-bottom:none}
  .ln-row-selected{background:#fffbeb !important}

  .ln-emp{display:flex;align-items:center;gap:10px}
  .ln-emp-av{width:34px;height:34px;border-radius:8px;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .ln-emp-name{font-weight:600;color:#222}
  .ln-emp-pos{font-size:11px;color:#aaa;margin-top:1px}

  .ln-type-chip{padding:3px 8px;border-radius:6px;background:#f3f4f6;font-size:11px;font-weight:600;color:#555}
  .ln-money{font-weight:600;color:#333;font-variant-numeric:tabular-nums}
  .ln-term{font-size:12px;color:#888}
  .ln-date{font-size:12px;color:#aaa;white-space:nowrap}

  .ln-bal{display:flex;flex-direction:column;gap:4px}
  .ln-bal-bar{width:60px;height:3px;background:#f0f0f0;border-radius:2px;overflow:hidden}
  .ln-bal-fill{height:100%;border-radius:2px;transition:width .3s}

  .ln-status{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap}

  .ln-actions{display:flex;gap:4px}
  .ln-act-btn{width:28px;height:28px;border:none;border-radius:6px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .12s}
  .ln-act-approve{background:#dcfce7;color:#22c55e}
  .ln-act-approve:hover{background:#22c55e;color:#fff}
  .ln-act-reject{background:#fef2f2;color:#ef4444}
  .ln-act-reject:hover{background:#ef4444;color:#fff}

  /* Panel form styles */
  .ap-section{margin-bottom:20px}
  .ap-sec-title{font-size:13px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px}
  .ap-req{width:6px;height:6px;border-radius:50%;background:#ef4444;flex-shrink:0;display:inline-block}
  .ap-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .ap-field{display:flex;flex-direction:column}
  .ap-field-full{grid-column:1/-1}
  .ap-label{display:flex;align-items:center;gap:4px;font-size:12px;font-weight:600;color:#666;margin-bottom:5px}
  .ap-input{width:100%;padding:9px 12px;border:1px solid #e0e0e0;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:13px;color:#333;outline:none;transition:border-color .15s;background:#fff;box-sizing:border-box}
  .ap-input:focus{border-color:#2d9e8b;box-shadow:0 0 0 2px rgba(45,158,139,.1)}
  .ap-input:disabled{background:#fafbfa;color:#555;cursor:default}
  .ap-textarea{resize:vertical;min-height:56px}
  select.ap-input{appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;padding-right:28px;cursor:pointer}
  select.ap-input:disabled{cursor:default}
  .ap-foot-btns{display:flex;justify-content:flex-end;gap:8px}
  .ap-btn-cancel{padding:9px 18px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;color:#666;cursor:pointer}
  .ap-btn-cancel:hover{background:#f5f5f5}
  .ap-btn-primary{display:flex;align-items:center;gap:5px;padding:9px 22px;border:none;border-radius:8px;background:#2d9e8b;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;color:#fff;cursor:pointer;transition:all .15s}
  .ap-btn-primary:hover{background:#268a79}
  .ap-btn-primary:disabled{opacity:.5;cursor:not-allowed}
  .ap-btn-danger{padding:9px 16px;border:1px solid #fecaca;border-radius:8px;background:#fef2f2;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;color:#ef4444;cursor:pointer}
  .ap-btn-danger:hover{background:#ef4444;color:#fff}
  .ap-modal-layout{display:flex;flex-direction:column;min-height:200px;max-height:60vh}
  .ap-modal-scroll{flex:1;overflow-y:auto;padding:16px 0 0}
  .ap-modal-foot{flex-shrink:0;padding:16px 0 0;margin-top:auto}

  .ln-panel-type{display:flex;align-items:center;gap:8px;margin-bottom:12px}
  .ln-panel-pbar{height:6px;background:#f0f0f0;border-radius:3px;overflow:hidden;position:relative}
  .ln-panel-pbar-fill{height:100%;background:#22c55e;border-radius:3px;transition:width .3s}
  .ln-panel-pbar-txt{position:absolute;right:0;top:-16px;font-size:10px;color:#999;font-weight:600}

  .ln-panel-actions{display:flex;gap:8px;padding:12px 0;border-bottom:1px solid #f0f0f0}

  .ln-rejection{margin-top:10px;padding:10px 12px;border-radius:8px;background:#fef2f2;color:#ef4444;font-size:12px;display:flex;align-items:center;gap:6px}
  .ln-notes{margin-top:8px;padding:10px 12px;border-radius:8px;background:#f8fafc;color:#666;font-size:12px;display:flex;align-items:center;gap:6px}

  .ln-pay-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
  .ln-pay-form{background:#f9fafb;border:1px solid #f0f0f0;border-radius:10px;padding:12px;margin-bottom:12px;display:flex;flex-direction:column;gap:8px}
  .ln-pay-form-row{display:flex;gap:8px}

  .ln-payments{display:flex;flex-direction:column;gap:4px}
  .ln-payment{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#fafafa;border:1px solid #f0f0f0;border-radius:9px}
  .ln-pay-left{display:flex;align-items:center;gap:10px}
  .ln-pay-icon{width:28px;height:28px;border-radius:7px;background:#dcfce7;color:#22c55e;display:flex;align-items:center;justify-content:center}
  .ln-pay-amount{font-size:13px;font-weight:600;color:#222}
  .ln-pay-meta{font-size:10px;color:#aaa;margin-top:1px}
  .ln-pay-right{display:flex;align-items:center;gap:8px}
  .ln-pay-bal{font-size:11px;color:#999}
  .ln-pay-del{width:22px;height:22px;border:none;border-radius:4px;background:transparent;color:#ccc;cursor:pointer;display:flex;align-items:center;justify-content:center}
  .ln-pay-del:hover{color:#ef4444;background:#fef2f2}

  /* Calc box */
  .ln-calc-box{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px 14px}
  .ln-calc-row{display:flex;justify-content:space-between;padding:3px 0;font-size:12px;color:#666}
  .ln-calc-row strong{color:#222}
  .ln-calc-highlight{border-top:1px solid #86efac;padding-top:8px;margin-top:4px;font-size:14px}
  .ln-calc-highlight strong{color:#16a34a;font-size:16px}

  /* Form inputs (loan types view) */
  .ln-lbl{font-size:12px;font-weight:600;color:#666;margin-bottom:5px;display:block}
  .ln-inp{width:100%;padding:9px 12px;border:1px solid #e0e0e0;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:13px;color:#333;outline:none;background:#fff;box-sizing:border-box}
  .ln-inp:focus{border-color:#6366f1;box-shadow:0 0 0 2px rgba(99,102,241,.1)}

  /* Templates (reuse) */
  .tpl-head{display:flex;align-items:center;gap:14px;margin-bottom:6px;flex-wrap:wrap}
  .tpl-title{font-size:20px;font-weight:700;color:#222;flex:1;margin:0}
  .tpl-desc{font-size:12px;color:#aaa;margin-bottom:18px}
  .tpl-layout{display:grid;grid-template-columns:300px 1fr;gap:16px;min-height:400px}
  .tpl-list{display:flex;flex-direction:column;gap:6px}
  .tpl-empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:40px 16px;text-align:center;color:#ccc}
  .tpl-empty p{font-weight:600;color:#aaa;margin:4px 0 0}
  .tpl-empty span{font-size:12px;color:#ccc;max-width:220px}
  .tpl-card{padding:14px;border:1px solid #eee;border-radius:10px;cursor:pointer;transition:all .12s}
  .tpl-card:hover{border-color:#c7d2fe}
  .tpl-card-active{border-color:#6366f1;background:#eef2ff}
  .tpl-card-top{display:flex;align-items:center;gap:8px;margin-bottom:2px}
  .tpl-card-name{font-size:13px;font-weight:600;color:#222;flex:1}
  .tpl-card-meta{font-size:11px;color:#aaa}
  .tpl-editor{background:#fff;border:1px solid #eee;border-radius:12px;padding:22px}
  .tpl-editor-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#ddd;font-size:13px}
  .tpl-editor-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
  .tpl-editor-title{font-size:18px;font-weight:700;color:#222;margin:0}

  .ob-toggle{width:44px;height:24px;border-radius:12px;border:none;background:#e5e7eb;cursor:pointer;position:relative;transition:background .2s;flex-shrink:0}
  .ob-toggle-on{background:#6366f1}
  .ob-toggle-dot{width:18px;height:18px;border-radius:50%;background:#fff;position:absolute;top:3px;left:3px;transition:transform .2s;box-shadow:0 1px 3px rgba(0,0,0,.12)}
  .ob-toggle-on .ob-toggle-dot{transform:translateX(20px)}

  @media(max-width:900px){
    .ln-toolbar{flex-direction:column;align-items:stretch}
    .ln-tabs{overflow-x:auto}
    .tpl-layout{grid-template-columns:1fr}
  }
  @media(max-width:600px){
    .ap-modal-layout{max-height:65vh}
    .ap-fields{grid-template-columns:1fr}
  }
`;
