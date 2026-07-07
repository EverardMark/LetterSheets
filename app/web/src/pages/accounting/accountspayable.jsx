import { useState, useEffect, useCallback, useMemo } from "react";
import { I } from "../../layouts/ERPLayout";
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

const peso = (n) => "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STATUS_CLR = { Draft: "#f59e0b", Open: "#3b82f6", Partial: "#8b5cf6", Paid: "#22c55e", Voided: "#ef4444" };

export default function AccountsPayable() {
    const [view, setView] = useState("bills"); // bills | vendors | bill-form | vendor-form | bill-detail | aging
    const [bills, setBills] = useState([]);
    const [vendors, setVendors] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState("");

    // Filters
    const [fStatus, setFStatus] = useState("");
    const [fVendor, setFVendor] = useState("");
    const [search, setSearch] = useState("");

    // Bill form
    const [billForm, setBillForm] = useState(null);
    const [billItems, setBillItems] = useState([]);

    // Vendor form
    const [vendorForm, setVendorForm] = useState(null);

    // Bill detail
    const [detailBill, setDetailBill] = useState(null);
    const [detailItems, setDetailItems] = useState([]);
    const [detailPayments, setDetailPayments] = useState([]);
    const [payForm, setPayForm] = useState(null);

    // Aging
    const [aging, setAging] = useState([]);

    const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

    const loadAll = useCallback(async () => {
        setLoading(true);
        try { const d = await api("get_vendors", {}); setVendors(Array.isArray(d) ? d : []); } catch { setVendors([]); }
        try { const d = await api("get_bills", {}); setBills(Array.isArray(d) ? d : []); } catch { setBills([]); }
        try {
            const d = await api("get_accounts", {});
            const a = d?.accounts || d || [];
            setAccounts(Array.isArray(a) ? a.filter(x => x.account_subtype !== "Header" && x.is_active) : []);
        } catch { setAccounts([]); }
        try { const d = await api("get_ap_summary", {}); setSummary(d); } catch {}
        setLoading(false);
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    /* ==== FILTERED BILLS ==== */
    const filtered = useMemo(() => {
        let r = bills;
        if (fStatus) r = r.filter(b => b.status === fStatus);
        if (fVendor) r = r.filter(b => b.vendor_id === fVendor);
        if (search) { const s = search.toLowerCase(); r = r.filter(b => (b.bill_number || "").toLowerCase().includes(s) || (b.vendor_name || "").toLowerCase().includes(s) || (b.memo || "").toLowerCase().includes(s)); }
        return r;
    }, [bills, fStatus, fVendor, search]);

    /* ==== VENDOR CRUD ==== */
    const openVendorForm = (v) => { setVendorForm(v || { name: "", contact_person: "", email: "", phone: "", address: "", city: "", province: "", zip_code: "", tin: "", payment_terms: 30, notes: "" }); setView("vendor-form"); };
    const saveVendor = async () => {
        if (!vendorForm.name) { flash("Name required"); return; }
        try {
            if (vendorForm.id) { await api("update_vendor", vendorForm); } else { await api("create_vendor", vendorForm); }
            flash(vendorForm.id ? "Vendor updated" : "Vendor created");
            setView("vendors"); loadAll();
        } catch (e) { flash("Error: " + e.message); }
    };
    const deleteVendor = async (id) => {
        if (!confirm("Delete this vendor?")) return;
        try { await api("delete_vendor", { id }); flash("Deleted"); loadAll(); } catch (e) { flash("Error: " + e.message); }
    };
    const toggleVendor = async (id) => {
        try { await api("toggle_vendor_active", { id }); loadAll(); } catch (e) { flash("Error: " + e.message); }
    };

    /* ==== BILL CRUD ==== */
    const openBillForm = (b) => {
        if (b) {
            setBillForm({ id: b.id, vendor_id: b.vendor_id, bill_number: b.bill_number, bill_date: b.bill_date?.split("T")[0], due_date: b.due_date?.split("T")[0], memo: b.memo || "", reference: b.reference || "" });
            api("get_bill_items", { bill_id: b.id }).then(d => setBillItems((Array.isArray(d) ? d : []).map(i => ({ account_id: i.account_id, description: i.description, quantity: i.quantity, unit_price: i.unit_price, tax_rate: i.tax_rate }))));
        } else {
            const today = new Date().toISOString().split("T")[0];
            const due = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
            setBillForm({ vendor_id: "", bill_number: "", bill_date: today, due_date: due, memo: "", reference: "" });
            setBillItems([{ account_id: "", description: "", quantity: 1, unit_price: 0, tax_rate: 12 }]);
        }
        setView("bill-form");
    };

    const saveBill = async () => {
        if (!billForm.vendor_id || !billForm.bill_date) { flash("Vendor and date required"); return; }
        const validItems = billItems.filter(i => i.account_id && i.unit_price > 0);
        if (validItems.length === 0) { flash("At least one line item required"); return; }
        try {
            if (billForm.id) { await api("update_bill", { ...billForm, items: validItems }); } else { await api("create_bill", { ...billForm, items: validItems }); }
            flash(billForm.id ? "Bill updated" : "Bill created");
            setView("bills"); loadAll();
        } catch (e) { flash("Error: " + e.message); }
    };

    const openBillDetail = async (b) => {
        try {
            const d = await api("get_bill", { id: b.id });
            setDetailBill(d?.bill || d);
            setDetailItems(Array.isArray(d?.items) ? d.items : []);
            setDetailPayments(Array.isArray(d?.payments) ? d.payments : []);
            setPayForm(null);
            setView("bill-detail");
        } catch (e) { flash("Error: " + e.message); }
    };

    const approveBill = async (id) => {
        try { await api("approve_bill", { id }); flash("Bill approved"); openBillDetail({ id }); loadAll(); } catch (e) { flash("Error: " + e.message); }
    };
    const voidBill = async (id) => {
        if (!confirm("Void this bill?")) return;
        try { await api("void_bill", { id }); flash("Bill voided"); setView("bills"); loadAll(); } catch (e) { flash("Error: " + e.message); }
    };
    const deleteBill = async (id) => {
        if (!confirm("Delete this bill?")) return;
        try { await api("delete_bill", { id }); flash("Deleted"); setView("bills"); loadAll(); } catch (e) { flash("Error: " + e.message); }
    };

    /* ==== PAYMENTS ==== */
    const submitPayment = async () => {
        if (!payForm || payForm.amount <= 0) { flash("Enter a valid amount"); return; }
        try {
            await api("create_bill_payment", { bill_id: detailBill.id, payment_date: payForm.date, amount: payForm.amount, payment_method: payForm.method, reference_no: payForm.ref, account_id: payForm.account_id, memo: payForm.memo });
            flash("Payment recorded");
            openBillDetail({ id: detailBill.id }); loadAll();
        } catch (e) { flash("Error: " + e.message); }
    };
    const deletePayment = async (id) => {
        if (!confirm("Delete this payment?")) return;
        try { await api("delete_bill_payment", { id }); flash("Payment deleted"); openBillDetail({ id: detailBill.id }); loadAll(); } catch (e) { flash("Error: " + e.message); }
    };

    /* ==== AGING ==== */
    const loadAging = async () => {
        try { const d = await api("get_ap_aging", {}); setAging(Array.isArray(d) ? d : []); } catch { setAging([]); }
        setView("aging");
    };

    /* ============ BILL FORM HELPERS ============ */
    const addItem = () => setBillItems(p => [...p, { account_id: "", description: "", quantity: 1, unit_price: 0, tax_rate: 12 }]);
    const removeItem = (i) => setBillItems(p => p.filter((_, j) => j !== i));
    const updateItem = (i, f, v) => setBillItems(p => p.map((item, j) => j === i ? { ...item, [f]: v } : item));
    const itemTotal = (i) => { const amt = (i.quantity || 0) * (i.unit_price || 0); return amt + amt * (i.tax_rate || 0) / 100; };
    const billSubtotal = billItems.reduce((s, i) => s + (i.quantity || 0) * (i.unit_price || 0), 0);
    const billTax = billItems.reduce((s, i) => s + (i.quantity || 0) * (i.unit_price || 0) * (i.tax_rate || 0) / 100, 0);
    const billTotal = billSubtotal + billTax;

    /* ============ RENDER ROUTER ============ */
    if (view === "vendor-form") return renderVendorForm();
    if (view === "vendors") return renderVendors();
    if (view === "bill-form") return renderBillForm();
    if (view === "bill-detail") return renderBillDetail();
    if (view === "aging") return renderAging();
    return renderBillsList();

    /* =========================================== */
    /* ====          BILLS LIST               ==== */
    /* =========================================== */
    function renderBillsList() {
        return (<div className="acc-wrap">
            {msg && <div className="ap-flash">{msg}</div>}
            {/* Toolbar */}
            <div className="acc-bar">
                <div className="acc-bar-left">
                    <div className="acc-search-wrap"><I name="search" size={14}/><input className="acc-search" placeholder="Search bills..." value={search} onChange={e => setSearch(e.target.value)}/></div>
                    <select className="acc-filter" value={fStatus} onChange={e => setFStatus(e.target.value)}><option value="">All Status</option>{["Draft","Open","Partial","Paid","Voided"].map(s => <option key={s} value={s}>{s}</option>)}</select>
                    <select className="acc-filter" value={fVendor} onChange={e => setFVendor(e.target.value)}><option value="">All Vendors</option>{vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
                </div>
                <div className="acc-bar-right">
                    <button className="acc-btn-s" onClick={() => setView("vendors")}><I name="users" size={14}/> Vendors</button>
                    <button className="acc-btn-s" onClick={loadAging}><I name="clock" size={14}/> Aging</button>
                    <button className="acc-btn-p" onClick={() => openBillForm(null)}><I name="plus" size={14}/> New Bill</button>
                </div>
            </div>
            {/* Table */}
            {loading ? (
                <div className="acc-empty"><div className="acc-loading"/><div className="acc-empty-t">Loading...</div></div>
            ) : filtered.length === 0 ? (
                <div className="acc-empty"><div className="acc-empty-ic"><I name="inbox" size={28}/></div><div className="acc-empty-t">No bills found</div><div className="acc-empty-d">Create a bill to start tracking payables.</div></div>
            ) : (
                <div className="acc-tbl-wrap">
                    <table className="acc-tbl"><thead><tr>
                        <th>Bill #</th><th>Vendor</th><th>Date</th><th>Due</th><th>Status</th><th className="acc-right">Total</th><th className="acc-right">Balance</th>
                    </tr></thead><tbody>
                    {filtered.map(b => {
                        const overdue = b.status !== "Paid" && b.status !== "Voided" && new Date(b.due_date) < new Date();
                        return (<tr key={b.id} className="acc-row" onClick={() => openBillDetail(b)}>
                            <td className="acc-cell-name">{b.bill_number || "BILL"}</td>
                            <td>{b.vendor_name}</td>
                            <td>{b.bill_date?.split("T")[0]}</td>
                            <td style={{ color: overdue ? "#ef4444" : "#888", fontWeight: overdue ? 600 : 400 }}>{b.due_date?.split("T")[0]} {overdue && "⚠"}</td>
                            <td><span className="acc-badge" style={{ background: (STATUS_CLR[b.status] || "#999") + "18", color: STATUS_CLR[b.status] }}>{b.status}</span></td>
                            <td className="acc-right acc-cell-mono" style={{ fontWeight: 600 }}>{peso(b.total_amount)}</td>
                            <td className="acc-right acc-cell-mono" style={{ fontWeight: 600, color: b.balance_due > 0 ? "#ef4444" : "#22c55e" }}>{peso(b.balance_due)}</td>
                        </tr>);
                    })}
                    </tbody></table>
                </div>
            )}
        </div>);
    }

    /* =========================================== */
    /* ====          VENDORS LIST             ==== */
    /* =========================================== */
    function renderVendors() {
        return (<div className="acc-wrap">
            {msg && <div className="ap-flash">{msg}</div>}
            <div className="acc-bar">
                <div className="acc-bar-left">
                    <button className="acc-btn-s ap-back" onClick={() => setView("bills")}><I name="arrow-left" size={16}/></button>
                    <div className="acc-title">Vendors / Suppliers</div>
                </div>
                <div className="acc-bar-right"><button className="acc-btn-p" onClick={() => openVendorForm(null)}><I name="plus" size={14}/> New Vendor</button></div>
            </div>
            {vendors.length === 0 ? (
                <div className="acc-empty"><div className="acc-empty-ic"><I name="inbox" size={28}/></div><div className="acc-empty-t">No vendors yet</div><div className="acc-empty-d">Add a vendor to start recording bills.</div></div>
            ) : (
                <div className="acc-tbl-wrap">
                    <table className="acc-tbl"><thead><tr><th>Name</th><th>Contact</th><th>Email</th><th>Phone</th><th>TIN</th><th>Terms</th><th>Status</th><th></th></tr></thead>
                        <tbody>{vendors.map(v => (<tr key={v.id}>
                            <td className="acc-cell-name">{v.name}</td>
                            <td>{v.contact_person}</td><td>{v.email}</td><td>{v.phone}</td><td>{v.tin}</td>
                            <td>Net {v.payment_terms}</td>
                            <td><span className={`acc-badge ${v.is_active ? "acc-b-done" : "acc-b-due"}`}>{v.is_active ? "Active" : "Inactive"}</span></td>
                            <td>
                                <div className="ap-row-actions">
                                    <button className="ap-ibtn" onClick={() => openVendorForm(v)} title="Edit"><I name="edit-2" size={13}/></button>
                                    <button className="ap-ibtn" onClick={() => toggleVendor(v.id)} title="Toggle"><I name={v.is_active ? "eye-off" : "eye"} size={13}/></button>
                                    <button className="ap-ibtn ap-ibtn-danger" onClick={() => deleteVendor(v.id)} title="Delete"><I name="trash-2" size={13}/></button>
                                </div>
                            </td>
                        </tr>))}</tbody></table>
                </div>
            )}
        </div>);
    }

    /* =========================================== */
    /* ====          VENDOR FORM              ==== */
    /* =========================================== */
    function renderVendorForm() {
        const f = vendorForm;
        const set = (k, v) => setVendorForm(p => ({ ...p, [k]: v }));
        return (<div className="acc-wrap">
            {msg && <div className="ap-flash">{msg}</div>}
            <div className="acc-bar">
                <div className="acc-bar-left">
                    <button className="acc-btn-s ap-back" onClick={() => setView("vendors")}><I name="arrow-left" size={16}/></button>
                    <div className="acc-title">{f.id ? "Edit" : "New"} Vendor</div>
                </div>
            </div>
            <div className="acc-card">
                <div className="acc-fields">
                    <div className="acc-field"><label className="acc-label">Vendor Name <span className="acc-req"/></label><input className="acc-input" value={f.name} onChange={e => set("name", e.target.value)}/></div>
                    <div className="acc-field"><label className="acc-label">Contact Person</label><input className="acc-input" value={f.contact_person} onChange={e => set("contact_person", e.target.value)}/></div>
                    <div className="acc-field"><label className="acc-label">Email</label><input className="acc-input" type="email" value={f.email} onChange={e => set("email", e.target.value)}/></div>
                    <div className="acc-field"><label className="acc-label">Phone</label><input className="acc-input" value={f.phone} onChange={e => set("phone", e.target.value)}/></div>
                    <div className="acc-field acc-field-full"><label className="acc-label">Address</label><input className="acc-input" value={f.address} onChange={e => set("address", e.target.value)}/></div>
                    <div className="acc-field"><label className="acc-label">City</label><input className="acc-input" value={f.city} onChange={e => set("city", e.target.value)}/></div>
                    <div className="acc-field"><label className="acc-label">Province</label><input className="acc-input" value={f.province} onChange={e => set("province", e.target.value)}/></div>
                    <div className="acc-field"><label className="acc-label">ZIP Code</label><input className="acc-input" value={f.zip_code} onChange={e => set("zip_code", e.target.value)}/></div>
                    <div className="acc-field"><label className="acc-label">TIN</label><input className="acc-input" value={f.tin} onChange={e => set("tin", e.target.value)} placeholder="000-000-000-000"/></div>
                    <div className="acc-field"><label className="acc-label">Payment Terms (days)</label><input className="acc-input" type="number" value={f.payment_terms} onChange={e => set("payment_terms", Number(e.target.value))}/></div>
                    <div className="acc-field"><label className="acc-label">Notes</label><input className="acc-input" value={f.notes} onChange={e => set("notes", e.target.value)}/></div>
                </div>
                <div className="acc-foot-btns ap-foot-left">
                    <button className="acc-btn-cancel" onClick={() => setView("vendors")}>Cancel</button>
                    <button className="acc-btn-primary" onClick={saveVendor}><I name="save" size={14}/> Save</button>
                </div>
            </div>
        </div>);
    }

    /* =========================================== */
    /* ====          BILL FORM                ==== */
    /* =========================================== */
    function renderBillForm() {
        const f = billForm;
        const set = (k, v) => setBillForm(p => ({ ...p, [k]: v }));
        // Auto-set due date when vendor changes
        const onVendorChange = (vid) => {
            set("vendor_id", vid);
            const v = vendors.find(x => x.id === vid);
            if (v && f.bill_date) {
                const d = new Date(f.bill_date);
                d.setDate(d.getDate() + (v.payment_terms || 30));
                set("due_date", d.toISOString().split("T")[0]);
            }
        };

        return (<div className="acc-wrap">
            {msg && <div className="ap-flash">{msg}</div>}
            <div className="acc-bar">
                <div className="acc-bar-left">
                    <button className="acc-btn-s ap-back" onClick={() => setView("bills")}><I name="arrow-left" size={16}/></button>
                    <div className="acc-title">{f.id ? "Edit" : "New"} Bill</div>
                </div>
            </div>
            <div className="acc-card">
                <div className="ap-bill-head">
                    <div className="ap-bh-vendor"><label className="acc-label">Vendor <span className="acc-req"/></label><select className="acc-input" value={f.vendor_id} onChange={e => onVendorChange(e.target.value)}><option value="">Select vendor...</option>{vendors.filter(v => v.is_active).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
                    <div className="ap-bh-col"><label className="acc-label">Bill #</label><input className="acc-input" value={f.bill_number} onChange={e => set("bill_number", e.target.value)} placeholder="BILL-001"/></div>
                    <div className="ap-bh-col"><label className="acc-label">Vendor Invoice #</label><input className="acc-input" value={f.reference} onChange={e => set("reference", e.target.value)}/></div>
                    <div className="ap-bh-col"><label className="acc-label">Bill Date <span className="acc-req"/></label><input className="acc-input" type="date" value={f.bill_date} onChange={e => set("bill_date", e.target.value)}/></div>
                    <div className="ap-bh-col"><label className="acc-label">Due Date</label><input className="acc-input" type="date" value={f.due_date} onChange={e => set("due_date", e.target.value)}/></div>
                </div>
                <div className="acc-field acc-field-full ap-memo"><label className="acc-label">Memo</label><input className="acc-input" value={f.memo} onChange={e => set("memo", e.target.value)} placeholder="Description of purchase"/></div>

                {/* Line Items */}
                <div className="acc-sec-title">Line Items</div>
                <div className="acc-tbl-wrap">
                <table className="acc-tbl ap-items-tbl"><thead><tr>
                    <th className="ap-w-acct">Expense Account</th><th className="ap-w-desc">Description</th><th className="acc-right ap-w-qty">Qty</th><th className="acc-right ap-w-price">Price</th><th className="acc-right ap-w-tax">Tax %</th><th className="acc-right ap-w-total">Total</th><th className="ap-w-x"></th>
                </tr></thead><tbody>
                {billItems.map((item, i) => (<tr key={i}>
                    <td><select className="acc-input ap-cell-input" value={item.account_id} onChange={e => updateItem(i, "account_id", e.target.value)}><option value="">Select...</option>{accounts.filter(a => a.account_type === "Expense" || a.account_type === "Asset").map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select></td>
                    <td><input className="acc-input ap-cell-input" value={item.description} onChange={e => updateItem(i, "description", e.target.value)}/></td>
                    <td><input type="number" min="0" step="0.01" className="acc-input ap-cell-input ap-cell-right" value={item.quantity} onChange={e => updateItem(i, "quantity", Number(e.target.value))}/></td>
                    <td><input type="number" min="0" step="0.01" className="acc-input ap-cell-input ap-cell-right" value={item.unit_price} onChange={e => updateItem(i, "unit_price", Number(e.target.value))}/></td>
                    <td><input type="number" min="0" max="100" step="0.5" className="acc-input ap-cell-input ap-cell-right" value={item.tax_rate} onChange={e => updateItem(i, "tax_rate", Number(e.target.value))}/></td>
                    <td className="acc-right acc-cell-mono" style={{ fontWeight: 600 }}>{peso(itemTotal(item))}</td>
                    <td>{billItems.length > 1 && <button className="ap-ibtn ap-ibtn-danger" onClick={() => removeItem(i)}><I name="x" size={13}/></button>}</td>
                </tr>))}
                <tr><td colSpan={7}><button className="ap-add-btn" onClick={addItem}><I name="plus" size={12}/> Add Line</button></td></tr>
                <tr className="ap-total-row">
                    <td colSpan={5} className="acc-right ap-total-lbl">Subtotal</td><td className="acc-right acc-cell-mono" style={{ fontWeight: 600 }}>{peso(billSubtotal)}</td><td></td>
                </tr>
                <tr><td colSpan={5} className="acc-right ap-total-lbl">Tax</td><td className="acc-right acc-cell-mono" style={{ fontWeight: 600 }}>{peso(billTax)}</td><td></td></tr>
                <tr><td colSpan={5} className="acc-right ap-grand-lbl">Total</td><td className="acc-right acc-cell-mono ap-grand-val">{peso(billTotal)}</td><td></td></tr>
                </tbody></table>
                </div>

                <div className="acc-foot-btns ap-foot-left">
                    <button className="acc-btn-cancel" onClick={() => setView("bills")}>Cancel</button>
                    <button className="acc-btn-primary" onClick={saveBill}><I name="save" size={14}/> Save Bill</button>
                </div>
            </div>
        </div>);
    }

    /* =========================================== */
    /* ====          BILL DETAIL              ==== */
    /* =========================================== */
    function renderBillDetail() {
        if (!detailBill) return null;
        const b = detailBill;
        const overdue = b.status !== "Paid" && b.status !== "Voided" && new Date(b.due_date) < new Date();

        return (<div className="acc-wrap">
            {msg && <div className="ap-flash">{msg}</div>}
            <div className="acc-bar">
                <div className="acc-bar-left">
                    <button className="acc-btn-s ap-back" onClick={() => setView("bills")}><I name="arrow-left" size={16}/></button>
                    <div>
                        <div className="acc-title">{b.bill_number || "BILL"}</div>
                        <div className="acc-subtitle">{b.vendor_name} &middot; {b.bill_date?.split("T")[0]}</div>
                    </div>
                    <span className="acc-badge ap-status-badge" style={{ background: (STATUS_CLR[b.status] || "#999") + "18", color: STATUS_CLR[b.status] }}>{b.status}</span>
                    {overdue && <span className="acc-badge acc-b-due">Overdue</span>}
                </div>
            </div>

            {/* Summary cards */}
            <div className="ap-detail-stats">
                {[{ l: "Total", v: peso(b.total_amount), c: "#1a1a2e" }, { l: "Paid", v: peso(b.amount_paid), c: "#22c55e" }, { l: "Balance Due", v: peso(b.balance_due), c: b.balance_due > 0 ? "#ef4444" : "#22c55e" }, { l: "Due Date", v: b.due_date?.split("T")[0], c: overdue ? "#ef4444" : "#888" }].map(c => (
                    <div key={c.l} className="acc-st"><div className="acc-st-v" style={{ color: c.c, fontSize: 16 }}>{c.v}</div><div className="acc-st-l">{c.l}</div></div>
                ))}
            </div>

            {b.memo && <div className="ap-memo-box">{b.memo}</div>}
            {b.reference && <div className="ap-ref-line">Vendor Invoice: <strong>{b.reference}</strong></div>}

            {/* Line Items */}
            <div className="acc-card">
                <div className="acc-card-t ap-card-t">Line Items</div>
                <div className="acc-tbl-wrap">
                <table className="acc-tbl"><thead><tr><th>Account</th><th>Description</th><th className="acc-right">Qty</th><th className="acc-right">Price</th><th className="acc-right">Tax</th><th className="acc-right">Total</th></tr></thead>
                    <tbody>
                    {detailItems.map(i => (<tr key={i.id}><td><span className="acc-cell-name ap-acct-code">{i.account_code}</span> <span className="ap-acct-name">{i.account_name}</span></td><td>{i.description}</td><td className="acc-right acc-cell-mono">{i.quantity}</td><td className="acc-right acc-cell-mono">{peso(i.unit_price)}</td><td className="acc-right acc-cell-mono">{peso(i.tax_amount)}</td><td className="acc-right acc-cell-mono" style={{ fontWeight: 600 }}>{peso(i.amount + i.tax_amount)}</td></tr>))}
                    <tr className="ap-total-row"><td colSpan={5} className="ap-grand-lbl" style={{ textAlign: "left" }}>TOTAL</td><td className="acc-right acc-cell-mono ap-grand-val">{peso(b.total_amount)}</td></tr>
                    </tbody></table>
                </div>
            </div>

            {/* Payments */}
            <div className="acc-card ap-card-gap">
                <div className="acc-card-h">
                    <div className="acc-card-t ap-card-t">Payments</div>
                    {(b.status === "Open" || b.status === "Partial") && !payForm && (
                        <button className="acc-btn-p" onClick={() => setPayForm({ date: new Date().toISOString().split("T")[0], amount: b.balance_due, method: "Bank Transfer", ref: "", account_id: "", memo: "" })}>
                            <I name="plus" size={14}/> Record Payment
                        </button>
                    )}
                </div>
                {detailPayments.length === 0 && !payForm && <div className="ap-no-pay">No payments yet</div>}
                {detailPayments.map(p => (
                    <div key={p.id} className="ap-pay-item">
                        <div><div className="ap-pay-amt">{peso(p.amount)}</div><div className="ap-pay-meta">{p.payment_date?.split("T")[0]} &middot; {p.payment_method} {p.reference_no && `(${p.reference_no})`}</div></div>
                        <button className="ap-ibtn ap-ibtn-danger" onClick={() => deletePayment(p.id)}><I name="trash-2" size={13}/></button>
                    </div>
                ))}

                {/* Payment form */}
                {payForm && (<div className="ap-pay-form">
                    <div className="ap-pay-fields">
                        <div className="ap-pf-col"><label className="acc-label">Date</label><input type="date" className="acc-input" value={payForm.date} onChange={e => setPayForm(p => ({ ...p, date: e.target.value }))}/></div>
                        <div className="ap-pf-col"><label className="acc-label">Amount</label><input type="number" min="0" step="0.01" className="acc-input" value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: Number(e.target.value) }))}/></div>
                        <div className="ap-pf-col"><label className="acc-label">Method</label><select className="acc-input" value={payForm.method} onChange={e => setPayForm(p => ({ ...p, method: e.target.value }))}><option>Bank Transfer</option><option>Cash</option><option>Check</option><option>GCash</option><option>Maya</option></select></div>
                        <div className="ap-pf-col"><label className="acc-label">Reference #</label><input className="acc-input" value={payForm.ref} onChange={e => setPayForm(p => ({ ...p, ref: e.target.value }))}/></div>
                        <div className="ap-pf-col ap-pf-col2"><label className="acc-label">Cash/Bank Account</label><select className="acc-input" value={payForm.account_id} onChange={e => setPayForm(p => ({ ...p, account_id: e.target.value }))}><option value="">Select...</option>{accounts.filter(a => a.account_type === "Asset" && (a.account_subtype === "Current Asset")).map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select></div>
                    </div>
                    <div className="acc-foot-btns ap-foot-left ap-pay-foot">
                        <button className="acc-btn-cancel" onClick={() => setPayForm(null)}>Cancel</button>
                        <button className="acc-btn-primary" onClick={submitPayment}><I name="check" size={14}/> Record</button>
                    </div>
                </div>)}
            </div>

            {/* Actions */}
            <div className="acc-foot-btns ap-foot-left ap-actions">
                {b.status === "Draft" && <><button className="acc-btn-p" onClick={() => approveBill(b.id)}><I name="check" size={14}/> Approve</button><button className="acc-btn-s" onClick={() => openBillForm(b)}><I name="edit-2" size={14}/> Edit</button><button className="acc-btn-danger" onClick={() => deleteBill(b.id)}><I name="trash-2" size={14}/> Delete</button></>}
                {(b.status === "Open" || b.status === "Draft") && <button className="acc-btn-danger" onClick={() => voidBill(b.id)}><I name="x-circle" size={14}/> Void</button>}
            </div>
        </div>);
    }

    /* =========================================== */
    /* ====          AGING REPORT             ==== */
    /* =========================================== */
    function renderAging() {
        const totals = aging.reduce((a, r) => ({ total: a.total + r.total_due, current: a.current + r.current_due, d30: a.d30 + r.days_1_30, d60: a.d60 + r.days_31_60, d90: a.d90 + r.days_61_90, over: a.over + r.days_over_90 }), { total: 0, current: 0, d30: 0, d60: 0, d90: 0, over: 0 });
        return (<div className="acc-wrap">
            <div className="acc-bar">
                <div className="acc-bar-left">
                    <button className="acc-btn-s ap-back" onClick={() => setView("bills")}><I name="arrow-left" size={16}/></button>
                    <div className="acc-title">AP Aging Report</div>
                </div>
            </div>
            {aging.length === 0 ? (
                <div className="acc-empty"><div className="acc-empty-ic"><I name="inbox" size={28}/></div><div className="acc-empty-t">No outstanding payables</div><div className="acc-empty-d">There are no unpaid bills to age.</div></div>
            ) : (
                <div className="acc-tbl-wrap">
                    <table className="acc-tbl"><thead><tr><th>Vendor</th><th>Bills</th><th className="acc-right">Current</th><th className="acc-right">1-30</th><th className="acc-right">31-60</th><th className="acc-right">61-90</th><th className="acc-right ap-th-90">90+</th><th className="acc-right">Total</th></tr></thead>
                        <tbody>
                        {aging.map(a => (<tr key={a.vendor_id}><td className="acc-cell-name">{a.vendor_name}</td><td>{a.bill_count}</td><td className="acc-right acc-cell-mono">{peso(a.current_due)}</td><td className="acc-right acc-cell-mono">{a.days_1_30 > 0 ? peso(a.days_1_30) : ""}</td><td className="acc-right acc-cell-mono" style={{ color: a.days_31_60 > 0 ? "#f59e0b" : "" }}>{a.days_31_60 > 0 ? peso(a.days_31_60) : ""}</td><td className="acc-right acc-cell-mono" style={{ color: a.days_61_90 > 0 ? "#ef4444" : "" }}>{a.days_61_90 > 0 ? peso(a.days_61_90) : ""}</td><td className="acc-right acc-cell-mono" style={{ fontWeight: a.days_over_90 > 0 ? 700 : 400, color: a.days_over_90 > 0 ? "#ef4444" : "" }}>{a.days_over_90 > 0 ? peso(a.days_over_90) : ""}</td><td className="acc-right acc-cell-mono" style={{ fontWeight: 700 }}>{peso(a.total_due)}</td></tr>))}
                        <tr className="ap-total-row ap-aging-total"><td colSpan={2} className="ap-grand-lbl" style={{ textAlign: "left" }}>TOTALS</td><td className="acc-right acc-cell-mono" style={{ fontWeight: 700 }}>{peso(totals.current)}</td><td className="acc-right acc-cell-mono" style={{ fontWeight: 700 }}>{peso(totals.d30)}</td><td className="acc-right acc-cell-mono" style={{ fontWeight: 700 }}>{peso(totals.d60)}</td><td className="acc-right acc-cell-mono" style={{ fontWeight: 700 }}>{peso(totals.d90)}</td><td className="acc-right acc-cell-mono" style={{ fontWeight: 700, color: "#ef4444" }}>{peso(totals.over)}</td><td className="acc-right acc-cell-mono" style={{ fontWeight: 700 }}>{peso(totals.total)}</td></tr>
                        </tbody></table>
                </div>
            )}
        </div>);
    }
}

/* ===== Page-specific styles (only what acc-* doesn't cover) ===== */
const apCSS = `
  .ap-flash{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;padding:8px 14px;border-radius:8px;font-size:13px;margin-bottom:12px}
  .ap-stats5{grid-template-columns:repeat(5,1fr)}
  .ap-back{padding:9px 10px}
  .ap-row-actions{display:flex;gap:4px}
  .ap-ibtn{background:none;border:none;cursor:pointer;color:#2d9e8b;padding:4px;display:inline-flex;align-items:center}
  .ap-ibtn-danger{color:#ef4444}
  .ap-foot-left{margin-top:16px}
  .ap-bill-head{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px}
  .ap-bh-vendor{flex:2;min-width:200px;display:flex;flex-direction:column}
  .ap-bh-col{flex:1;min-width:120px;display:flex;flex-direction:column}
  .ap-memo{margin-bottom:16px}
  .ap-items-tbl .ap-cell-input{padding:6px 8px;font-size:12px}
  .ap-cell-right{text-align:right}
  .ap-w-acct{width:30%}.ap-w-desc{width:20%}.ap-w-qty{width:10%}.ap-w-price{width:15%}.ap-w-tax{width:8%}.ap-w-total{width:12%}.ap-w-x{width:5%}
  .ap-add-btn{display:inline-flex;align-items:center;gap:4px;background:none;border:1px dashed #d1d5db;border-radius:6px;padding:6px 12px;font-size:12px;color:#2d9e8b;cursor:pointer;font-weight:600}
  .ap-total-row td{border-top:2px solid #e0e0e0}
  .ap-total-lbl{font-size:12px;color:#888;font-variant-numeric:tabular-nums}
  .ap-grand-lbl{font-weight:700;font-size:14px}
  .ap-grand-val{font-weight:700;font-size:14px}
  .ap-detail-stats{display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap}
  .ap-detail-stats .acc-st{flex:1;min-width:120px}
  .ap-status-badge{margin-left:4px;font-size:12px;padding:4px 12px}
  .ap-memo-box{font-size:12px;color:#666;background:#f9fafb;border-radius:6px;padding:8px 10px;margin-bottom:12px}
  .ap-ref-line{font-size:12px;color:#888;margin-bottom:12px}
  .ap-card-t{margin-bottom:8px;font-size:13px}
  .ap-card-gap{margin-top:12px}
  .ap-acct-code{font-size:12px}
  .ap-acct-name{color:#888;font-size:12px}
  .ap-no-pay{color:#aaa;font-size:13px;padding:10px}
  .ap-pay-item{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f3f4f6}
  .ap-pay-amt{font-size:13px;font-weight:600}
  .ap-pay-meta{font-size:11px;color:#888}
  .ap-pay-form{background:#f9fafb;border-radius:8px;padding:12px;margin-top:8px}
  .ap-pay-fields{display:flex;gap:10px;flex-wrap:wrap}
  .ap-pf-col{flex:1;min-width:120px;display:flex;flex-direction:column}
  .ap-pf-col2{flex:2;min-width:180px}
  .ap-pay-foot{margin-top:10px}
  .ap-actions{margin-top:16px}
  .ap-th-90{color:#ef4444}
  .ap-aging-total td{background:#f9fafb}
`;

if (typeof document !== "undefined" && !document.getElementById("ap-page-css")) {
    const el = document.createElement("style");
    el.id = "ap-page-css";
    el.textContent = apCSS;
    document.head.appendChild(el);
}
