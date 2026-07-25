import { useState, useEffect, useCallback, useMemo } from "react";
import { I } from "../../layouts/ERPLayout";
import { Term, SimpleHint } from "../components/simplemode";
import "./acc-layout.css";

const API = (import.meta.env.VITE_API_BASE||"")+"/api/execute";
async function api(action, body = {}) {
    const s = localStorage.getItem("ls_session");
    const res = await fetch(`${API}?action=${action}`, {
        method: "POST", headers: { "Content-Type": "application/json", ...(s ? { Authorization: `Bearer ${s}` } : {}) },
        body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error || json?.message || `API ${action} failed`);
    return json?.data ?? json;
}
const peso = (n) => "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STATUS_CLR = { Draft: "#f59e0b", Sent: "#3b82f6", Partial: "#8b5cf6", Paid: "#22c55e", Voided: "#ef4444" };

export default function AccountsReceivable() {
    const [view, setView] = useState("invoices");
    const [invoices, setInvoices] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState("");
    const [fStatus, setFStatus] = useState("");
    const [fCust, setFCust] = useState("");
    const [search, setSearch] = useState("");
    const [invForm, setInvForm] = useState(null);
    const [invItems, setInvItems] = useState([]);
    const [custForm, setCustForm] = useState(null);
    const [detail, setDetail] = useState(null);
    const [detailItems, setDetailItems] = useState([]);
    const [detailPay, setDetailPay] = useState([]);
    const [payForm, setPayForm] = useState(null);
    const [aging, setAging] = useState([]);

    const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

    const loadAll = useCallback(async () => {
        setLoading(true);
        try { const d = await api("get_customers", {}); setCustomers(Array.isArray(d) ? d : []); } catch { setCustomers([]); }
        try { const d = await api("get_invoices", {}); setInvoices(Array.isArray(d) ? d : []); } catch { setInvoices([]); }
        try { const d = await api("get_accounts", {}); const a = d?.accounts || d || []; setAccounts(Array.isArray(a) ? a.filter(x => x.account_subtype !== "Header" && x.is_active) : []); } catch { setAccounts([]); }
        try { const d = await api("get_ar_summary", {}); setSummary(d); } catch {}
        setLoading(false);
    }, []);
    useEffect(() => { loadAll(); }, [loadAll]);

    const filtered = useMemo(() => {
        let r = invoices;
        if (fStatus) r = r.filter(i => i.status === fStatus);
        if (fCust) r = r.filter(i => i.customer_id === fCust);
        if (search) { const s = search.toLowerCase(); r = r.filter(i => (i.invoice_number || "").toLowerCase().includes(s) || (i.customer_name || "").toLowerCase().includes(s)); }
        return r;
    }, [invoices, fStatus, fCust, search]);

    /* Customer CRUD */
    const openCustForm = (c) => { setCustForm(c || { name: "", contact_person: "", email: "", phone: "", address: "", city: "", province: "", zip_code: "", tin: "", payment_terms: 30, notes: "" }); setView("cust-form"); };
    const saveCust = async () => {
        if (!custForm.name) { flash("Name required"); return; }
        try { if (custForm.id) await api("update_customer", custForm); else await api("create_customer", custForm); flash(custForm.id ? "Updated" : "Created"); setView("customers"); loadAll(); } catch (e) { flash("Error: " + e.message); }
    };
    const deleteCust = async (id) => { if (!confirm("Delete?")) return; try { await api("delete_customer", { id }); flash("Deleted"); loadAll(); } catch (e) { flash("Error: " + e.message); } };
    const toggleCust = async (id) => { try { await api("toggle_customer_active", { id }); loadAll(); } catch (e) { flash("Error: " + e.message); } };

    /* Invoice CRUD */
    const openInvForm = (inv) => {
        if (inv) {
            setInvForm({ id: inv.id, customer_id: inv.customer_id, invoice_number: inv.invoice_number, invoice_date: inv.invoice_date?.split("T")[0], due_date: inv.due_date?.split("T")[0], memo: inv.memo || "", reference: inv.reference || "" });
            api("get_invoice_items", { invoice_id: inv.id }).then(d => { const a = d?.items || d || []; setInvItems((Array.isArray(a) ? a : []).map(i => ({ account_id: i.account_id, description: i.description, quantity: i.quantity, unit_price: i.unit_price, tax_rate: i.tax_rate }))); }).catch(() => setInvItems([]));
        } else {
            const today = new Date().toISOString().split("T")[0];
            const due = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
            setInvForm({ customer_id: "", invoice_number: "", invoice_date: today, due_date: due, memo: "", reference: "" });
            setInvItems([{ account_id: "", description: "", quantity: 1, unit_price: 0, tax_rate: 12 }]);
        }
        setView("inv-form");
    };
    const saveInv = async () => {
        if (!invForm.customer_id || !invForm.invoice_date) { flash("Customer and date required"); return; }
        const valid = invItems.filter(i => i.account_id && i.unit_price > 0);
        if (!valid.length) { flash("At least one line item required"); return; }
        try { if (invForm.id) await api("update_invoice", { ...invForm, items: valid }); else await api("create_invoice", { ...invForm, items: valid }); flash(invForm.id ? "Updated" : "Created"); setView("invoices"); loadAll(); } catch (e) { flash("Error: " + e.message); }
    };
    const openDetail = async (inv) => {
        try { const d = await api("get_invoice", { id: inv.id }); setDetail(d?.invoice || d); setDetailItems(Array.isArray(d?.items) ? d.items : []); setDetailPay(Array.isArray(d?.payments) ? d.payments : []); setPayForm(null); setView("detail"); } catch (e) { flash("Error: " + e.message); }
    };
    const sendInv = async (id) => { try { await api("send_invoice", { id }); flash("Invoice sent"); openDetail({ id }); loadAll(); } catch (e) { flash("Error: " + e.message); } };
    const voidInv = async (id) => { if (!confirm("Void?")) return; try { await api("void_invoice", { id }); flash("Voided"); setView("invoices"); loadAll(); } catch (e) { flash("Error: " + e.message); } };
    const deleteInv = async (id) => { if (!confirm("Delete?")) return; try { await api("delete_invoice", { id }); flash("Deleted"); setView("invoices"); loadAll(); } catch (e) { flash("Error: " + e.message); } };

    /* Payments */
    const submitPay = async () => {
        if (!payForm || payForm.amount <= 0) { flash("Enter valid amount"); return; }
        try { await api("create_invoice_payment", { invoice_id: detail.id, payment_date: payForm.date, amount: payForm.amount, payment_method: payForm.method, reference_no: payForm.ref, account_id: payForm.account_id, memo: payForm.memo }); flash("Payment recorded"); openDetail({ id: detail.id }); loadAll(); } catch (e) { flash("Error: " + e.message); }
    };
    const deletePay = async (id) => { if (!confirm("Delete payment?")) return; try { await api("delete_invoice_payment", { id }); flash("Deleted"); openDetail({ id: detail.id }); loadAll(); } catch (e) { flash("Error: " + e.message); } };
    const loadAging = async () => { try { const d = await api("get_ar_aging", {}); setAging(Array.isArray(d) ? d : []); } catch { setAging([]); } setView("aging"); };

    /* Line item helpers */
    const addItem = () => setInvItems(p => [...p, { account_id: "", description: "", quantity: 1, unit_price: 0, tax_rate: 12 }]);
    const removeItem = (i) => setInvItems(p => p.filter((_, j) => j !== i));
    const updateItem = (i, f, v) => setInvItems(p => p.map((item, j) => j === i ? { ...item, [f]: v } : item));
    const itemTotal = (i) => { const a = (i.quantity || 0) * (i.unit_price || 0); return a + a * (i.tax_rate || 0) / 100; };
    const sub = invItems.reduce((s, i) => s + (i.quantity || 0) * (i.unit_price || 0), 0);
    const tax = invItems.reduce((s, i) => s + (i.quantity || 0) * (i.unit_price || 0) * (i.tax_rate || 0) / 100, 0);

    if (view === "cust-form") return renderCustForm();
    if (view === "customers") return renderCustomers();
    if (view === "inv-form") return renderInvForm();
    if (view === "detail") return renderDetail();
    if (view === "aging") return renderAging();
    return renderList();

    /* =============== INVOICE LIST =============== */
    function renderList() {
        return (<div className="acc-wrap ar-page">
            {msg && <div className="ar-flash">{msg}</div>}
            <div className="acc-bar">
                <div className="acc-bar-left">
                    <div className="acc-search-wrap"><I name="search" size={14}/><input className="acc-search" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}/></div>
                    <select className="acc-filter" value={fStatus} onChange={e => setFStatus(e.target.value)}><option value="">All Status</option>{["Draft","Sent","Partial","Paid","Voided"].map(s => <option key={s}>{s}</option>)}</select>
                    <select className="acc-filter" value={fCust} onChange={e => setFCust(e.target.value)}><option value="">All Customers</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                </div>
                <div className="acc-bar-right">
                    <button className="acc-btn-s" onClick={() => setView("customers")}><I name="users" size={14}/> Customers</button>
                    <button className="acc-btn-s" onClick={loadAging}><I name="clock" size={14}/> <Term simple="Overdue" advanced="Aging" /></button>
                    <button className="acc-btn-p" onClick={() => openInvForm(null)}><I name="plus" size={14}/> New Invoice</button>
                </div>
            </div>
            <SimpleHint icon="bulb">Invoices you've sent customers. Track who still owes you and mark them paid when the money comes in.</SimpleHint>
            {loading ? <div className="acc-empty"><div className="acc-loading"/><div className="acc-empty-t">Loading...</div></div> : filtered.length === 0 ? (
                <div className="acc-empty"><div className="acc-empty-ic"><I name="inbox" size={28}/></div><div className="acc-empty-t">No invoices</div><div className="acc-empty-d"><Term simple="Create an invoice to start tracking who owes you." advanced="Create an invoice to start tracking receivables." /></div></div>
            ) : (
                <div className="acc-tbl-wrap">
                    <table className="acc-tbl"><thead><tr><th>Invoice #</th><th>Customer</th><th>Date</th><th>Due</th><th>Status</th><th className="acc-right">Total</th><th className="acc-right">Balance</th></tr></thead>
                        <tbody>{filtered.map(inv => {
                            const od = inv.status !== "Paid" && inv.status !== "Voided" && new Date(inv.due_date) < new Date();
                            return (<tr key={inv.id} className="acc-row" onClick={() => openDetail(inv)}>
                                <td className="acc-cell-name">{inv.invoice_number || "INV"}</td>
                                <td>{inv.customer_name}</td>
                                <td className="ar-cell-sm">{inv.invoice_date?.split("T")[0]}</td>
                                <td className="ar-cell-sm" style={{ color: od ? "#ef4444" : "#888", fontWeight: od ? 600 : 400 }}>{inv.due_date?.split("T")[0]} {od && "⚠"}</td>
                                <td><span className="acc-badge" style={{ background: (STATUS_CLR[inv.status] || "#999") + "18", color: STATUS_CLR[inv.status] }}>{inv.status}</span></td>
                                <td className="acc-right acc-cell-mono ar-strong">{peso(inv.total_amount)}</td>
                                <td className="acc-right acc-cell-mono ar-strong" style={{ color: inv.balance_due > 0 ? "#ef4444" : "#22c55e" }}>{peso(inv.balance_due)}</td>
                            </tr>);
                        })}</tbody></table>
                </div>
            )}
        </div>);
    }

    /* =============== CUSTOMERS =============== */
    function renderCustomers() {
        return (<div className="acc-wrap ar-page">
            {msg && <div className="ar-flash">{msg}</div>}
            <div className="acc-bar">
                <div className="acc-bar-left">
                    <button className="ar-back" onClick={() => setView("invoices")}><I name="arrow-left" size={16}/></button>
                    <div className="acc-title">Customers</div>
                </div>
                <div className="acc-bar-right"><button className="acc-btn-p" onClick={() => openCustForm(null)}><I name="plus" size={14}/> New Customer</button></div>
            </div>
            {customers.length === 0 ? (
                <div className="acc-empty"><div className="acc-empty-ic"><I name="users" size={28}/></div><div className="acc-empty-t">No customers yet</div><div className="acc-empty-d">Add customers to bill them on invoices.</div></div>
            ) : (
                <div className="acc-tbl-wrap">
                    <table className="acc-tbl"><thead><tr><th>Name</th><th>Contact</th><th>Email</th><th>Phone</th><th>TIN</th><th>Terms</th><th>Status</th><th></th></tr></thead>
                        <tbody>{customers.map(c => (<tr key={c.id}>
                            <td className="acc-cell-name">{c.name}</td><td>{c.contact_person}</td><td>{c.email}</td><td>{c.phone}</td><td>{c.tin}</td><td>Net {c.payment_terms}</td>
                            <td><span className={"acc-badge " + (c.is_active ? "acc-b-done" : "acc-b-due")}>{c.is_active ? "Active" : "Inactive"}</span></td>
                            <td className="ar-actions">
                                <button className="ar-ibtn" onClick={() => openCustForm(c)}><I name="edit-2" size={13}/></button>
                                <button className="ar-ibtn" onClick={() => toggleCust(c.id)}><I name={c.is_active ? "eye-off" : "eye"} size={13}/></button>
                                <button className="ar-ibtn ar-ibtn-del" onClick={() => deleteCust(c.id)}><I name="trash-2" size={13}/></button>
                            </td>
                        </tr>))}</tbody></table>
                </div>
            )}
        </div>);
    }

    /* =============== CUSTOMER FORM =============== */
    function renderCustForm() {
        const f = custForm, set = (k, v) => setCustForm(p => ({ ...p, [k]: v }));
        return (<div className="acc-wrap ar-page">
            {msg && <div className="ar-flash">{msg}</div>}
            <div className="acc-bar">
                <div className="acc-bar-left">
                    <button className="ar-back" onClick={() => setView("customers")}><I name="arrow-left" size={16}/></button>
                    <div className="acc-title">{f.id ? "Edit" : "New"} Customer</div>
                </div>
            </div>
            <div className="acc-card">
                <div className="acc-fields">
                    <div className="acc-field"><label className="acc-label">Name <span className="acc-req"/></label><input className="acc-input" value={f.name} onChange={e => set("name", e.target.value)}/></div>
                    <div className="acc-field"><label className="acc-label">Contact Person</label><input className="acc-input" value={f.contact_person} onChange={e => set("contact_person", e.target.value)}/></div>
                    <div className="acc-field"><label className="acc-label">Email</label><input className="acc-input" type="email" value={f.email} onChange={e => set("email", e.target.value)}/></div>
                    <div className="acc-field"><label className="acc-label">Phone</label><input className="acc-input" value={f.phone} onChange={e => set("phone", e.target.value)}/></div>
                    <div className="acc-field acc-field-full"><label className="acc-label">Address</label><input className="acc-input" value={f.address} onChange={e => set("address", e.target.value)}/></div>
                    <div className="acc-field"><label className="acc-label">City</label><input className="acc-input" value={f.city} onChange={e => set("city", e.target.value)}/></div>
                    <div className="acc-field"><label className="acc-label">Province</label><input className="acc-input" value={f.province} onChange={e => set("province", e.target.value)}/></div>
                    <div className="acc-field"><label className="acc-label">ZIP</label><input className="acc-input" value={f.zip_code} onChange={e => set("zip_code", e.target.value)}/></div>
                    <div className="acc-field"><label className="acc-label">TIN</label><input className="acc-input" value={f.tin} onChange={e => set("tin", e.target.value)} placeholder="000-000-000-000"/></div>
                    <div className="acc-field"><label className="acc-label">Terms (days)</label><input className="acc-input" type="number" value={f.payment_terms} onChange={e => set("payment_terms", Number(e.target.value))}/></div>
                    <div className="acc-field"><label className="acc-label">Notes</label><input className="acc-input" value={f.notes} onChange={e => set("notes", e.target.value)}/></div>
                </div>
                <div className="ar-form-foot"><button className="acc-btn-p" onClick={saveCust}><I name="save" size={14}/> Save</button><button className="acc-btn-s" onClick={() => setView("customers")}>Cancel</button></div>
            </div>
        </div>);
    }

    /* =============== INVOICE FORM =============== */
    function renderInvForm() {
        const f = invForm, set = (k, v) => setInvForm(p => ({ ...p, [k]: v }));
        const onCustChange = (cid) => { set("customer_id", cid); const c = customers.find(x => x.id === cid); if (c && f.invoice_date) { const d = new Date(f.invoice_date); d.setDate(d.getDate() + (c.payment_terms || 30)); set("due_date", d.toISOString().split("T")[0]); } };
        return (<div className="acc-wrap ar-page">
            {msg && <div className="ar-flash">{msg}</div>}
            <div className="acc-bar">
                <div className="acc-bar-left">
                    <button className="ar-back" onClick={() => setView("invoices")}><I name="arrow-left" size={16}/></button>
                    <div className="acc-title">{f.id ? "Edit" : "New"} Invoice</div>
                </div>
            </div>
            <div className="acc-card">
                <div className="ar-inv-head">
                    <div className="ar-inv-cust"><label className="acc-label">Customer <span className="acc-req"/></label><select className="acc-input" value={f.customer_id} onChange={e => onCustChange(e.target.value)}><option value="">Select...</option>{customers.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                    <div className="ar-inv-fld"><label className="acc-label">Invoice #</label><input className="acc-input" value={f.invoice_number} onChange={e => set("invoice_number", e.target.value)} placeholder="INV-001"/></div>
                    <div className="ar-inv-fld"><label className="acc-label">PO / Reference</label><input className="acc-input" value={f.reference} onChange={e => set("reference", e.target.value)}/></div>
                    <div className="ar-inv-fld"><label className="acc-label">Date <span className="acc-req"/></label><input className="acc-input" type="date" value={f.invoice_date} onChange={e => set("invoice_date", e.target.value)}/></div>
                    <div className="ar-inv-fld"><label className="acc-label">Due Date</label><input className="acc-input" type="date" value={f.due_date} onChange={e => set("due_date", e.target.value)}/></div>
                </div>
                <div className="acc-field ar-memo"><label className="acc-label">Memo</label><input className="acc-input" value={f.memo} onChange={e => set("memo", e.target.value)}/></div>
                <div className="acc-sec-title"><Term simple="Items" advanced="Line Items" /></div>
                <div className="acc-tbl-wrap">
                    <table className="acc-tbl ar-items-tbl"><thead><tr>
                        <th className="ar-w-acct"><Term simple="Income account" advanced="Revenue Account"/></th><th className="ar-w-desc">Description</th><th className="acc-right ar-w-qty">Qty</th><th className="acc-right ar-w-price">Price</th><th className="acc-right ar-w-tax">Tax %</th><th className="acc-right ar-w-total">Total</th><th className="ar-w-x"></th>
                    </tr></thead><tbody>
                    {invItems.map((item, i) => (<tr key={i}>
                        <td><select className="acc-input ar-item-inp" value={item.account_id} onChange={e => updateItem(i, "account_id", e.target.value)}><option value="">Select...</option>{accounts.filter(a => a.account_type === "Revenue" || a.account_type === "Asset").map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select></td>
                        <td><input className="acc-input ar-item-inp" value={item.description} onChange={e => updateItem(i, "description", e.target.value)}/></td>
                        <td><input type="number" min="0" step="0.01" className="acc-input ar-item-inp ar-item-num" value={item.quantity} onChange={e => updateItem(i, "quantity", Number(e.target.value))}/></td>
                        <td><input type="number" min="0" step="0.01" className="acc-input ar-item-inp ar-item-num" value={item.unit_price} onChange={e => updateItem(i, "unit_price", Number(e.target.value))}/></td>
                        <td><input type="number" min="0" max="100" step="0.5" className="acc-input ar-item-inp ar-item-num" value={item.tax_rate} onChange={e => updateItem(i, "tax_rate", Number(e.target.value))}/></td>
                        <td className="acc-right acc-cell-mono ar-strong">{peso(itemTotal(item))}</td>
                        <td>{invItems.length > 1 && <button className="ar-ibtn ar-ibtn-del" onClick={() => removeItem(i)}><I name="x" size={13}/></button>}</td>
                    </tr>))}
                    <tr><td colSpan={7}><button className="ar-add-btn" onClick={addItem}><I name="plus" size={12}/> Add Line</button></td></tr>
                    <tr className="ar-sum-row"><td colSpan={5} className="acc-right ar-sum-lbl">Subtotal</td><td className="acc-right acc-cell-mono ar-strong">{peso(sub)}</td><td></td></tr>
                    <tr><td colSpan={5} className="acc-right ar-sum-lbl">Tax</td><td className="acc-right acc-cell-mono ar-strong">{peso(tax)}</td><td></td></tr>
                    <tr><td colSpan={5} className="acc-right ar-total-lbl">Total</td><td className="acc-right acc-cell-mono ar-total-lbl">{peso(sub + tax)}</td><td></td></tr>
                    </tbody></table>
                </div>
                <div className="ar-form-foot"><button className="acc-btn-p" onClick={saveInv}><I name="save" size={14}/> Save Invoice</button><button className="acc-btn-s" onClick={() => setView("invoices")}>Cancel</button></div>
            </div>
        </div>);
    }

    /* =============== INVOICE DETAIL =============== */
    function renderDetail() {
        if (!detail) return null;
        const d = detail, od = d.status !== "Paid" && d.status !== "Voided" && new Date(d.due_date) < new Date();
        return (<div className="acc-wrap ar-page">
            {msg && <div className="ar-flash">{msg}</div>}
            <div className="acc-bar">
                <div className="acc-bar-left">
                    <button className="ar-back" onClick={() => setView("invoices")}><I name="arrow-left" size={16}/></button>
                    <div>
                        <div className="ar-detail-num">{d.invoice_number || "INV"}</div>
                        <div className="acc-subtitle">{d.customer_name} &middot; {d.invoice_date?.split("T")[0]}</div>
                    </div>
                    <span className="acc-badge ar-detail-badge" style={{ background: (STATUS_CLR[d.status] || "#999") + "18", color: STATUS_CLR[d.status] }}>{d.status}</span>
                    {od && <span className="acc-badge acc-b-due">Overdue</span>}
                </div>
            </div>
            <div className="ar-detail-stats">
                {[{ l: "Total", v: peso(d.total_amount), c: "#222" }, { l: "Received", v: peso(d.amount_paid), c: "#22c55e" }, { l: "Balance Due", v: peso(d.balance_due), c: d.balance_due > 0 ? "#ef4444" : "#22c55e" }, { l: "Due Date", v: d.due_date?.split("T")[0], c: od ? "#ef4444" : "#888" }].map(c => (
                    <div key={c.l} className="acc-st ar-detail-st"><div className="ar-detail-st-v" style={{ color: c.c }}>{c.v}</div><div className="acc-st-l">{c.l}</div></div>
                ))}
            </div>
            {d.memo && <div className="ar-memo-box">{d.memo}</div>}
            <div className="acc-card">
                <div className="acc-sec-title"><Term simple="Items" advanced="Line Items" /></div>
                <div className="acc-tbl-wrap">
                    <table className="acc-tbl"><thead><tr><th>Account</th><th>Description</th><th className="acc-right">Qty</th><th className="acc-right">Price</th><th className="acc-right">Tax</th><th className="acc-right">Total</th></tr></thead>
                        <tbody>
                        {detailItems.map(i => (<tr key={i.id}><td><span className="ar-acct-code">{i.account_code}</span> <span className="ar-acct-name">{i.account_name}</span></td><td>{i.description}</td><td className="acc-right acc-cell-mono">{i.quantity}</td><td className="acc-right acc-cell-mono">{peso(i.unit_price)}</td><td className="acc-right acc-cell-mono">{peso(i.tax_amount)}</td><td className="acc-right acc-cell-mono ar-strong">{peso(i.amount + i.tax_amount)}</td></tr>))}
                        <tr className="ar-sum-row"><td colSpan={5} className="ar-total-lbl">TOTAL</td><td className="acc-right acc-cell-mono ar-total-lbl">{peso(d.total_amount)}</td></tr>
                        </tbody></table>
                </div>
            </div>
            {/* Payments */}
            <div className="acc-card ar-card-gap">
                <div className="acc-card-h">
                    <div className="acc-sec-title ar-sec-inline">Payments Received</div>
                    {(d.status === "Sent" || d.status === "Partial") && !payForm && (
                        <button className="acc-btn-p" onClick={() => setPayForm({ date: new Date().toISOString().split("T")[0], amount: d.balance_due, method: "Bank Transfer", ref: "", account_id: "", memo: "" })}><I name="plus" size={14}/> Record Payment</button>
                    )}
                </div>
                {detailPay.length === 0 && !payForm && <div className="ar-pay-empty">No payments yet</div>}
                {detailPay.map(p => (<div key={p.id} className="ar-pay-row">
                    <div><div className="ar-pay-amt">{peso(p.amount)}</div><div className="ar-pay-meta">{p.payment_date?.split("T")[0]} &middot; {p.payment_method} {p.reference_no && `(${p.reference_no})`}</div></div>
                    <button className="ar-ibtn ar-ibtn-del" onClick={() => deletePay(p.id)}><I name="trash-2" size={13}/></button>
                </div>))}
                {payForm && (<div className="ar-pay-form">
                    <div className="ar-pay-fields">
                        <div className="ar-pay-fld"><label className="acc-label">Date</label><input type="date" className="acc-input" value={payForm.date} onChange={e => setPayForm(p => ({ ...p, date: e.target.value }))}/></div>
                        <div className="ar-pay-fld"><label className="acc-label">Amount</label><input type="number" min="0" step="0.01" className="acc-input" value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: Number(e.target.value) }))}/></div>
                        <div className="ar-pay-fld"><label className="acc-label">Method</label><select className="acc-input" value={payForm.method} onChange={e => setPayForm(p => ({ ...p, method: e.target.value }))}><option>Bank Transfer</option><option>Cash</option><option>Check</option><option>GCash</option><option>Maya</option></select></div>
                        <div className="ar-pay-fld"><label className="acc-label">Reference #</label><input className="acc-input" value={payForm.ref} onChange={e => setPayForm(p => ({ ...p, ref: e.target.value }))}/></div>
                        <div className="ar-pay-fld ar-pay-fld-wide"><label className="acc-label">Cash/Bank Account</label><select className="acc-input" value={payForm.account_id} onChange={e => setPayForm(p => ({ ...p, account_id: e.target.value }))}><option value="">Select...</option>{accounts.filter(a => a.account_type === "Asset" && a.account_subtype === "Current Asset").map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select></div>
                    </div>
                    <div className="ar-form-foot ar-pay-foot"><button className="acc-btn-p" onClick={submitPay}><I name="check" size={14}/> Record</button><button className="acc-btn-s" onClick={() => setPayForm(null)}>Cancel</button></div>
                </div>)}
            </div>
            <div className="ar-form-foot">
                {d.status === "Draft" && <><button className="acc-btn-p" onClick={() => sendInv(d.id)}><I name="send" size={14}/> Send</button><button className="acc-btn-s" onClick={() => openInvForm(d)}><I name="edit-2" size={14}/> Edit</button><button className="acc-btn-danger" onClick={() => deleteInv(d.id)}><I name="trash-2" size={14}/> Delete</button></>}
                {(d.status === "Sent" || d.status === "Draft") && <button className="acc-btn-danger" onClick={() => voidInv(d.id)}><I name="x-circle" size={14}/> Void</button>}
            </div>
        </div>);
    }

    /* =============== AGING =============== */
    function renderAging() {
        const t = aging.reduce((a, r) => ({ total: a.total + r.total_due, cur: a.cur + r.current_due, d30: a.d30 + r.days_1_30, d60: a.d60 + r.days_31_60, d90: a.d90 + r.days_61_90, over: a.over + r.days_over_90 }), { total: 0, cur: 0, d30: 0, d60: 0, d90: 0, over: 0 });
        return (<div className="acc-wrap ar-page">
            <div className="acc-bar">
                <div className="acc-bar-left">
                    <button className="ar-back" onClick={() => setView("invoices")}><I name="arrow-left" size={16}/></button>
                    <div className="acc-title"><Term simple="Overdue" advanced="AR Aging Report" /></div>
                </div>
            </div>
            {aging.length === 0 ? (
                <div className="acc-empty"><div className="acc-empty-ic"><I name="inbox" size={28}/></div><div className="acc-empty-t"><Term simple="Nobody owes you" advanced="No outstanding receivables" /></div><div className="acc-empty-d"><Term simple="Every invoice has been paid." advanced="All invoices are settled." /></div></div>
            ) : (
                <div className="acc-tbl-wrap">
                    <table className="acc-tbl"><thead><tr><th>Customer</th><th>Invoices</th><th className="acc-right">Current</th><th className="acc-right">1-30</th><th className="acc-right">31-60</th><th className="acc-right">61-90</th><th className="acc-right ar-th-over">90+</th><th className="acc-right">Total</th></tr></thead>
                        <tbody>
                        {aging.map(a => (<tr key={a.customer_id}><td className="acc-cell-name">{a.customer_name}</td><td>{a.invoice_count}</td><td className="acc-right acc-cell-mono">{peso(a.current_due)}</td><td className="acc-right acc-cell-mono">{a.days_1_30 > 0 ? peso(a.days_1_30) : ""}</td><td className="acc-right acc-cell-mono" style={{ color: a.days_31_60 > 0 ? "#f59e0b" : "" }}>{a.days_31_60 > 0 ? peso(a.days_31_60) : ""}</td><td className="acc-right acc-cell-mono" style={{ color: a.days_61_90 > 0 ? "#ef4444" : "" }}>{a.days_61_90 > 0 ? peso(a.days_61_90) : ""}</td><td className="acc-right acc-cell-mono" style={{ fontWeight: a.days_over_90 > 0 ? 700 : 400, color: a.days_over_90 > 0 ? "#ef4444" : "" }}>{a.days_over_90 > 0 ? peso(a.days_over_90) : ""}</td><td className="acc-right acc-cell-mono ar-strong">{peso(a.total_due)}</td></tr>))}
                        <tr className="ar-total-row"><td colSpan={2} className="ar-total-lbl">TOTALS</td><td className="acc-right acc-cell-mono ar-total-lbl">{peso(t.cur)}</td><td className="acc-right acc-cell-mono ar-total-lbl">{peso(t.d30)}</td><td className="acc-right acc-cell-mono ar-total-lbl">{peso(t.d60)}</td><td className="acc-right acc-cell-mono ar-total-lbl">{peso(t.d90)}</td><td className="acc-right acc-cell-mono ar-total-lbl" style={{ color: "#ef4444" }}>{peso(t.over)}</td><td className="acc-right acc-cell-mono ar-total-lbl">{peso(t.total)}</td></tr>
                        </tbody></table>
                </div>
            )}
        </div>);
    }
}

/* Page-specific styles not covered by acc-layout.css (unique ar- prefix) */
const arPageCSS = `
  .ar-stats-5{grid-template-columns:repeat(5,1fr)}
  @media(max-width:1100px){.ar-stats-5{grid-template-columns:repeat(3,1fr)}}
  @media(max-width:700px){.ar-stats-5{grid-template-columns:repeat(2,1fr)}}
  .ar-flash{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;padding:8px 14px;border-radius:8px;font-size:13px;margin-bottom:12px}
  .ar-back{background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:6px 8px;cursor:pointer;display:flex;align-items:center;color:#555}
  .ar-back:hover{border-color:#2d9e8b;color:#2d9e8b}
  .ar-cell-sm{font-size:12px;color:#888}
  .ar-strong{font-weight:600;color:#222}
  .ar-actions{display:flex;gap:4px}
  .ar-ibtn{background:none;border:none;cursor:pointer;color:#2d9e8b;padding:4px;display:flex;align-items:center;border-radius:6px}
  .ar-ibtn:hover{background:#edf8f5}
  .ar-ibtn-del{color:#ef4444}
  .ar-ibtn-del:hover{background:#fef2f2}
  .ar-form-foot{display:flex;gap:8px;margin-top:16px}
  .ar-inv-head{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px}
  .ar-inv-cust{flex:2;min-width:200px;display:flex;flex-direction:column}
  .ar-inv-fld{flex:1;min-width:120px;display:flex;flex-direction:column}
  .ar-memo{margin-bottom:16px}
  .ar-items-tbl input.ar-item-inp,.ar-items-tbl select.ar-item-inp{padding:6px 8px;font-size:12px}
  .ar-item-num{text-align:right}
  .ar-w-acct{width:30%}.ar-w-desc{width:20%}.ar-w-qty{width:10%}.ar-w-price{width:15%}.ar-w-tax{width:8%}.ar-w-total{width:12%}.ar-w-x{width:5%}
  .ar-add-btn{display:flex;align-items:center;gap:4px;background:none;border:1px dashed #e0e0e0;border-radius:8px;padding:6px 12px;font-size:12px;color:#2d9e8b;cursor:pointer;font-weight:600}
  .ar-add-btn:hover{border-color:#2d9e8b;background:#edf8f5}
  .ar-sum-row td{border-top:1px solid #eee}
  .ar-sum-lbl{font-size:12px;color:#888}
  .ar-total-lbl{font-weight:700;color:#222}
  .ar-detail-num{font-size:16px;font-weight:700;color:#222}
  .ar-detail-badge{margin-left:4px;padding:4px 12px;font-size:12px}
  .ar-detail-stats{display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap}
  .ar-detail-st{flex:1;min-width:120px}
  .ar-detail-st-v{font-size:16px;font-weight:700}
  .ar-memo-box{font-size:12px;color:#666;background:#f9fafb;border-radius:8px;padding:8px 10px;margin-bottom:12px}
  .ar-card-gap{margin-top:12px}
  .ar-sec-inline{margin-bottom:0}
  .ar-acct-code{font-weight:600;font-size:12px;color:#222}
  .ar-acct-name{color:#888;font-size:12px}
  .ar-pay-empty{color:#aaa;font-size:13px;padding:10px}
  .ar-pay-row{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f3f4f6}
  .ar-pay-amt{font-size:13px;font-weight:600;color:#222}
  .ar-pay-meta{font-size:11px;color:#888}
  .ar-pay-form{background:#f9fafb;border-radius:8px;padding:12px;margin-top:8px}
  .ar-pay-fields{display:flex;gap:10px;flex-wrap:wrap}
  .ar-pay-fld{flex:1;min-width:120px;display:flex;flex-direction:column}
  .ar-pay-fld-wide{flex:2;min-width:180px}
  .ar-pay-foot{margin-top:10px}
  .ar-total-row td{border-top:2px solid #d1d5db;background:#f9fafb}
`;

if (typeof document !== "undefined" && !document.getElementById("ar-page-css")) {
    const el = document.createElement("style");
    el.id = "ar-page-css";
    el.textContent = arPageCSS;
    document.head.appendChild(el);
}
