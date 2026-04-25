import { useState, useEffect, useCallback, useMemo } from "react";
import { I } from "../../layouts/ERPLayout";

const API = "/api/execute";
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
        return (<div style={{ padding: "0 0 20px" }}>
            {msg && <div style={S.flash}>{msg}</div>}
            {/* Stats */}
            <div style={S.statsRow}>
                {[
                    { l: "Active Vendors", v: summary?.active_vendors || 0, i: "users", c: "#6366f1" },
                    { l: "Open Bills", v: summary?.open_bills || 0, i: "file-text", c: "#3b82f6" },
                    { l: "Outstanding", v: peso(summary?.total_outstanding || 0), i: "alert-circle", c: "#f59e0b" },
                    { l: "Overdue", v: peso(summary?.total_overdue || 0), i: "alert-triangle", c: "#ef4444" },
                    { l: "Paid This Month", v: peso(summary?.paid_this_month || 0), i: "check-circle", c: "#22c55e" },
                ].map(s => (
                    <div key={s.l} style={S.stat}><div style={{ ...S.statIco, background: s.c + "18", color: s.c }}><I name={s.i} size={16}/></div>
                        <div><div style={S.statV}>{s.v}</div><div style={S.statL}>{s.l}</div></div></div>
                ))}
            </div>
            {/* Toolbar */}
            <div style={S.toolbar}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ position: "relative" }}><I name="search" size={14} style={{ color: "#999", position: "absolute", left: 10, top: 9 }}/><input style={S.searchIn} placeholder="Search bills..." value={search} onChange={e => setSearch(e.target.value)}/></div>
                    <select style={S.sel} value={fStatus} onChange={e => setFStatus(e.target.value)}><option value="">All Status</option>{["Draft","Open","Partial","Paid","Voided"].map(s => <option key={s} value={s}>{s}</option>)}</select>
                    <select style={S.sel} value={fVendor} onChange={e => setFVendor(e.target.value)}><option value="">All Vendors</option>{vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button style={S.btnO} onClick={() => setView("vendors")}><I name="users" size={14}/> Vendors</button>
                    <button style={S.btnO} onClick={loadAging}><I name="clock" size={14}/> Aging</button>
                    <button style={S.btnP} onClick={() => openBillForm(null)}><I name="plus" size={14}/> New Bill</button>
                </div>
            </div>
            {/* Table */}
            <div style={S.card}>
                {loading ? <div style={S.empty}>Loading...</div> : filtered.length === 0 ? (
                    <div style={S.empty}><I name="inbox" size={28} style={{ opacity: 0.3, marginBottom: 6 }}/><div>No bills found</div></div>
                ) : (
                    <table style={S.tbl}><thead><tr>
                        <th style={S.th}>Bill #</th><th style={S.th}>Vendor</th><th style={S.th}>Date</th><th style={S.th}>Due</th><th style={S.th}>Status</th><th style={{ ...S.th, textAlign: "right" }}>Total</th><th style={{ ...S.th, textAlign: "right" }}>Balance</th>
                    </tr></thead><tbody>
                    {filtered.map(b => {
                        const overdue = b.status !== "Paid" && b.status !== "Voided" && new Date(b.due_date) < new Date();
                        return (<tr key={b.id} style={S.row} onClick={() => openBillDetail(b)}>
                            <td style={{ ...S.td, fontWeight: 600, color: "#1a1a2e" }}>{b.bill_number || "BILL"}</td>
                            <td style={S.td}>{b.vendor_name}</td>
                            <td style={{ ...S.td, fontSize: 12 }}>{b.bill_date?.split("T")[0]}</td>
                            <td style={{ ...S.td, fontSize: 12, color: overdue ? "#ef4444" : "#888", fontWeight: overdue ? 600 : 400 }}>{b.due_date?.split("T")[0]} {overdue && "⚠"}</td>
                            <td style={S.td}><span style={{ ...S.badge, background: (STATUS_CLR[b.status] || "#999") + "18", color: STATUS_CLR[b.status] }}>{b.status}</span></td>
                            <td style={{ ...S.td, textAlign: "right", fontWeight: 600 }}>{peso(b.total_amount)}</td>
                            <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: b.balance_due > 0 ? "#ef4444" : "#22c55e" }}>{peso(b.balance_due)}</td>
                        </tr>);
                    })}
                    </tbody></table>
                )}
            </div>
        </div>);
    }

    /* =========================================== */
    /* ====          VENDORS LIST             ==== */
    /* =========================================== */
    function renderVendors() {
        return (<div style={{ padding: "0 0 20px" }}>
            {msg && <div style={S.flash}>{msg}</div>}
            <div style={S.hdr}><button style={S.back} onClick={() => setView("bills")}><I name="arrow-left" size={16}/></button><h3 style={S.title}>Vendors / Suppliers</h3>
                <div style={{ marginLeft: "auto" }}><button style={S.btnP} onClick={() => openVendorForm(null)}><I name="plus" size={14}/> New Vendor</button></div></div>
            <div style={S.card}>
                {vendors.length === 0 ? <div style={S.empty}>No vendors yet</div> : (
                    <table style={S.tbl}><thead><tr><th style={S.th}>Name</th><th style={S.th}>Contact</th><th style={S.th}>Email</th><th style={S.th}>Phone</th><th style={S.th}>TIN</th><th style={S.th}>Terms</th><th style={S.th}>Status</th><th style={S.th}></th></tr></thead>
                        <tbody>{vendors.map(v => (<tr key={v.id}>
                            <td style={{ ...S.td, fontWeight: 600 }}>{v.name}</td>
                            <td style={S.td}>{v.contact_person}</td><td style={S.td}>{v.email}</td><td style={S.td}>{v.phone}</td><td style={S.td}>{v.tin}</td>
                            <td style={S.td}>Net {v.payment_terms}</td>
                            <td style={S.td}><span style={{ ...S.badge, background: v.is_active ? "#dcfce7" : "#fee2e2", color: v.is_active ? "#16a34a" : "#dc2626" }}>{v.is_active ? "Active" : "Inactive"}</span></td>
                            <td style={{ ...S.td, display: "flex", gap: 4 }}>
                                <button style={S.iBtn} onClick={() => openVendorForm(v)} title="Edit"><I name="edit-2" size={13}/></button>
                                <button style={S.iBtn} onClick={() => toggleVendor(v.id)} title="Toggle"><I name={v.is_active ? "eye-off" : "eye"} size={13}/></button>
                                <button style={{ ...S.iBtn, color: "#ef4444" }} onClick={() => deleteVendor(v.id)} title="Delete"><I name="trash-2" size={13}/></button>
                            </td>
                        </tr>))}</tbody></table>
                )}
            </div>
        </div>);
    }

    /* =========================================== */
    /* ====          VENDOR FORM              ==== */
    /* =========================================== */
    function renderVendorForm() {
        const f = vendorForm;
        const set = (k, v) => setVendorForm(p => ({ ...p, [k]: v }));
        return (<div style={{ padding: "0 0 20px" }}>
            {msg && <div style={S.flash}>{msg}</div>}
            <div style={S.hdr}><button style={S.back} onClick={() => setView("vendors")}><I name="arrow-left" size={16}/></button><h3 style={S.title}>{f.id ? "Edit" : "New"} Vendor</h3></div>
            <div style={S.card}>
                <div style={S.grid2}>
                    <div><label style={S.lbl}>Vendor Name *</label><input style={S.inp} value={f.name} onChange={e => set("name", e.target.value)}/></div>
                    <div><label style={S.lbl}>Contact Person</label><input style={S.inp} value={f.contact_person} onChange={e => set("contact_person", e.target.value)}/></div>
                    <div><label style={S.lbl}>Email</label><input style={S.inp} type="email" value={f.email} onChange={e => set("email", e.target.value)}/></div>
                    <div><label style={S.lbl}>Phone</label><input style={S.inp} value={f.phone} onChange={e => set("phone", e.target.value)}/></div>
                    <div style={{ gridColumn: "1/3" }}><label style={S.lbl}>Address</label><input style={S.inp} value={f.address} onChange={e => set("address", e.target.value)}/></div>
                    <div><label style={S.lbl}>City</label><input style={S.inp} value={f.city} onChange={e => set("city", e.target.value)}/></div>
                    <div><label style={S.lbl}>Province</label><input style={S.inp} value={f.province} onChange={e => set("province", e.target.value)}/></div>
                    <div><label style={S.lbl}>ZIP Code</label><input style={S.inp} value={f.zip_code} onChange={e => set("zip_code", e.target.value)}/></div>
                    <div><label style={S.lbl}>TIN</label><input style={S.inp} value={f.tin} onChange={e => set("tin", e.target.value)} placeholder="000-000-000-000"/></div>
                    <div><label style={S.lbl}>Payment Terms (days)</label><input style={S.inp} type="number" value={f.payment_terms} onChange={e => set("payment_terms", Number(e.target.value))}/></div>
                    <div><label style={S.lbl}>Notes</label><input style={S.inp} value={f.notes} onChange={e => set("notes", e.target.value)}/></div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                    <button style={S.btnP} onClick={saveVendor}><I name="save" size={14}/> Save</button>
                    <button style={S.btnO} onClick={() => setView("vendors")}>Cancel</button>
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

        return (<div style={{ padding: "0 0 20px" }}>
            {msg && <div style={S.flash}>{msg}</div>}
            <div style={S.hdr}><button style={S.back} onClick={() => setView("bills")}><I name="arrow-left" size={16}/></button><h3 style={S.title}>{f.id ? "Edit" : "New"} Bill</h3></div>
            <div style={S.card}>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
                    <div style={{ flex: 2, minWidth: 200 }}><label style={S.lbl}>Vendor *</label><select style={S.inp} value={f.vendor_id} onChange={e => onVendorChange(e.target.value)}><option value="">Select vendor...</option>{vendors.filter(v => v.is_active).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
                    <div style={{ flex: 1 }}><label style={S.lbl}>Bill #</label><input style={S.inp} value={f.bill_number} onChange={e => set("bill_number", e.target.value)} placeholder="BILL-001"/></div>
                    <div style={{ flex: 1 }}><label style={S.lbl}>Vendor Invoice #</label><input style={S.inp} value={f.reference} onChange={e => set("reference", e.target.value)}/></div>
                    <div style={{ flex: 1 }}><label style={S.lbl}>Bill Date *</label><input style={S.inp} type="date" value={f.bill_date} onChange={e => set("bill_date", e.target.value)}/></div>
                    <div style={{ flex: 1 }}><label style={S.lbl}>Due Date</label><input style={S.inp} type="date" value={f.due_date} onChange={e => set("due_date", e.target.value)}/></div>
                </div>
                <label style={S.lbl}>Memo</label><input style={{ ...S.inp, marginBottom: 16 }} value={f.memo} onChange={e => set("memo", e.target.value)} placeholder="Description of purchase"/>

                {/* Line Items */}
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "#1a1a2e" }}>Line Items</div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr>
                    <th style={{ ...S.th, width: "30%" }}>Expense Account</th><th style={{ ...S.th, width: "20%" }}>Description</th><th style={{ ...S.th, width: "10%", textAlign: "right" }}>Qty</th><th style={{ ...S.th, width: "15%", textAlign: "right" }}>Price</th><th style={{ ...S.th, width: "8%", textAlign: "right" }}>Tax %</th><th style={{ ...S.th, width: "12%", textAlign: "right" }}>Total</th><th style={{ ...S.th, width: "5%" }}></th>
                </tr></thead><tbody>
                {billItems.map((item, i) => (<tr key={i}>
                    <td style={S.td}><select style={{ ...S.inp, margin: 0, fontSize: 12 }} value={item.account_id} onChange={e => updateItem(i, "account_id", e.target.value)}><option value="">Select...</option>{accounts.filter(a => a.account_type === "Expense" || a.account_type === "Asset").map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select></td>
                    <td style={S.td}><input style={{ ...S.inp, margin: 0, fontSize: 12 }} value={item.description} onChange={e => updateItem(i, "description", e.target.value)}/></td>
                    <td style={S.td}><input type="number" min="0" step="0.01" style={{ ...S.inp, margin: 0, textAlign: "right", fontSize: 12 }} value={item.quantity} onChange={e => updateItem(i, "quantity", Number(e.target.value))}/></td>
                    <td style={S.td}><input type="number" min="0" step="0.01" style={{ ...S.inp, margin: 0, textAlign: "right", fontSize: 12 }} value={item.unit_price} onChange={e => updateItem(i, "unit_price", Number(e.target.value))}/></td>
                    <td style={S.td}><input type="number" min="0" max="100" step="0.5" style={{ ...S.inp, margin: 0, textAlign: "right", fontSize: 12 }} value={item.tax_rate} onChange={e => updateItem(i, "tax_rate", Number(e.target.value))}/></td>
                    <td style={{ ...S.td, textAlign: "right", fontWeight: 600, fontSize: 12 }}>{peso(itemTotal(item))}</td>
                    <td style={S.td}>{billItems.length > 1 && <button style={{ ...S.iBtn, color: "#ef4444" }} onClick={() => removeItem(i)}><I name="x" size={13}/></button>}</td>
                </tr>))}
                <tr><td colSpan={7} style={S.td}><button style={S.addBtn} onClick={addItem}><I name="plus" size={12}/> Add Line</button></td></tr>
                <tr style={{ borderTop: "2px solid #e0e0e0" }}>
                    <td colSpan={5} style={{ ...S.td, textAlign: "right", fontSize: 12, color: "#888" }}>Subtotal</td><td style={{ ...S.td, textAlign: "right", fontWeight: 600 }}>{peso(billSubtotal)}</td><td></td>
                </tr>
                <tr><td colSpan={5} style={{ ...S.td, textAlign: "right", fontSize: 12, color: "#888" }}>Tax</td><td style={{ ...S.td, textAlign: "right", fontWeight: 600 }}>{peso(billTax)}</td><td></td></tr>
                <tr><td colSpan={5} style={{ ...S.td, textAlign: "right", fontWeight: 700, fontSize: 14 }}>Total</td><td style={{ ...S.td, textAlign: "right", fontWeight: 700, fontSize: 14 }}>{peso(billTotal)}</td><td></td></tr>
                </tbody></table>

                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                    <button style={S.btnP} onClick={saveBill}><I name="save" size={14}/> Save Bill</button>
                    <button style={S.btnO} onClick={() => setView("bills")}>Cancel</button>
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

        return (<div style={{ padding: "0 0 20px" }}>
            {msg && <div style={S.flash}>{msg}</div>}
            <div style={S.hdr}><button style={S.back} onClick={() => setView("bills")}><I name="arrow-left" size={16}/></button>
                <div><div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a2e" }}>{b.bill_number || "BILL"}</div><div style={{ fontSize: 12, color: "#888" }}>{b.vendor_name} &middot; {b.bill_date?.split("T")[0]}</div></div>
                <span style={{ ...S.badge, background: (STATUS_CLR[b.status] || "#999") + "18", color: STATUS_CLR[b.status], marginLeft: 12, fontSize: 12, padding: "4px 12px" }}>{b.status}</span>
                {overdue && <span style={{ ...S.badge, background: "#fef2f2", color: "#ef4444", marginLeft: 6 }}>Overdue</span>}
            </div>

            {/* Summary cards */}
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                {[{ l: "Total", v: peso(b.total_amount), c: "#1a1a2e" }, { l: "Paid", v: peso(b.amount_paid), c: "#22c55e" }, { l: "Balance Due", v: peso(b.balance_due), c: b.balance_due > 0 ? "#ef4444" : "#22c55e" }, { l: "Due Date", v: b.due_date?.split("T")[0], c: overdue ? "#ef4444" : "#888" }].map(c => (
                    <div key={c.l} style={{ ...S.stat, flex: 1 }}><div style={{ fontSize: 16, fontWeight: 700, color: c.c }}>{c.v}</div><div style={S.statL}>{c.l}</div></div>
                ))}
            </div>

            {b.memo && <div style={{ fontSize: 12, color: "#666", background: "#f9fafb", borderRadius: 6, padding: "8px 10px", marginBottom: 12 }}>{b.memo}</div>}
            {b.reference && <div style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>Vendor Invoice: <strong>{b.reference}</strong></div>}

            {/* Line Items */}
            <div style={S.card}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Line Items</div>
                <table style={S.tbl}><thead><tr><th style={S.th}>Account</th><th style={S.th}>Description</th><th style={{ ...S.th, textAlign: "right" }}>Qty</th><th style={{ ...S.th, textAlign: "right" }}>Price</th><th style={{ ...S.th, textAlign: "right" }}>Tax</th><th style={{ ...S.th, textAlign: "right" }}>Total</th></tr></thead>
                    <tbody>
                    {detailItems.map(i => (<tr key={i.id}><td style={S.td}><span style={{ fontWeight: 600, fontSize: 12 }}>{i.account_code}</span> <span style={{ color: "#888", fontSize: 12 }}>{i.account_name}</span></td><td style={S.td}>{i.description}</td><td style={{ ...S.td, textAlign: "right" }}>{i.quantity}</td><td style={{ ...S.td, textAlign: "right" }}>{peso(i.unit_price)}</td><td style={{ ...S.td, textAlign: "right" }}>{peso(i.tax_amount)}</td><td style={{ ...S.td, textAlign: "right", fontWeight: 600 }}>{peso(i.amount + i.tax_amount)}</td></tr>))}
                    <tr style={{ borderTop: "2px solid #e0e0e0" }}><td colSpan={5} style={{ ...S.td, fontWeight: 700 }}>TOTAL</td><td style={{ ...S.td, textAlign: "right", fontWeight: 700 }}>{peso(b.total_amount)}</td></tr>
                    </tbody></table>
            </div>

            {/* Payments */}
            <div style={{ ...S.card, marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>Payments</div>
                    {(b.status === "Open" || b.status === "Partial") && !payForm && (
                        <button style={S.btnP} onClick={() => setPayForm({ date: new Date().toISOString().split("T")[0], amount: b.balance_due, method: "Bank Transfer", ref: "", account_id: "", memo: "" })}>
                            <I name="plus" size={14}/> Record Payment
                        </button>
                    )}
                </div>
                {detailPayments.length === 0 && !payForm && <div style={{ color: "#aaa", fontSize: 13, padding: 10 }}>No payments yet</div>}
                {detailPayments.map(p => (
                    <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}>
                        <div><div style={{ fontSize: 13, fontWeight: 600 }}>{peso(p.amount)}</div><div style={{ fontSize: 11, color: "#888" }}>{p.payment_date?.split("T")[0]} &middot; {p.payment_method} {p.reference_no && `(${p.reference_no})`}</div></div>
                        <button style={{ ...S.iBtn, color: "#ef4444" }} onClick={() => deletePayment(p.id)}><I name="trash-2" size={13}/></button>
                    </div>
                ))}

                {/* Payment form */}
                {payForm && (<div style={{ background: "#f9fafb", borderRadius: 8, padding: 12, marginTop: 8 }}>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ flex: 1 }}><label style={S.lbl}>Date</label><input type="date" style={S.inp} value={payForm.date} onChange={e => setPayForm(p => ({ ...p, date: e.target.value }))}/></div>
                        <div style={{ flex: 1 }}><label style={S.lbl}>Amount</label><input type="number" min="0" step="0.01" style={S.inp} value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: Number(e.target.value) }))}/></div>
                        <div style={{ flex: 1 }}><label style={S.lbl}>Method</label><select style={S.inp} value={payForm.method} onChange={e => setPayForm(p => ({ ...p, method: e.target.value }))}><option>Bank Transfer</option><option>Cash</option><option>Check</option><option>GCash</option><option>Maya</option></select></div>
                        <div style={{ flex: 1 }}><label style={S.lbl}>Reference #</label><input style={S.inp} value={payForm.ref} onChange={e => setPayForm(p => ({ ...p, ref: e.target.value }))}/></div>
                        <div style={{ flex: 2 }}><label style={S.lbl}>Cash/Bank Account</label><select style={S.inp} value={payForm.account_id} onChange={e => setPayForm(p => ({ ...p, account_id: e.target.value }))}><option value="">Select...</option>{accounts.filter(a => a.account_type === "Asset" && (a.account_subtype === "Current Asset")).map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select></div>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        <button style={S.btnP} onClick={submitPayment}><I name="check" size={14}/> Record</button>
                        <button style={S.btnO} onClick={() => setPayForm(null)}>Cancel</button>
                    </div>
                </div>)}
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                {b.status === "Draft" && <><button style={S.btnP} onClick={() => approveBill(b.id)}><I name="check" size={14}/> Approve</button><button style={S.btnO} onClick={() => openBillForm(b)}><I name="edit-2" size={14}/> Edit</button><button style={{ ...S.btnO, color: "#ef4444", borderColor: "#fca5a5" }} onClick={() => deleteBill(b.id)}><I name="trash-2" size={14}/> Delete</button></>}
                {(b.status === "Open" || b.status === "Draft") && <button style={{ ...S.btnO, color: "#ef4444", borderColor: "#fca5a5" }} onClick={() => voidBill(b.id)}><I name="x-circle" size={14}/> Void</button>}
            </div>
        </div>);
    }

    /* =========================================== */
    /* ====          AGING REPORT             ==== */
    /* =========================================== */
    function renderAging() {
        const totals = aging.reduce((a, r) => ({ total: a.total + r.total_due, current: a.current + r.current_due, d30: a.d30 + r.days_1_30, d60: a.d60 + r.days_31_60, d90: a.d90 + r.days_61_90, over: a.over + r.days_over_90 }), { total: 0, current: 0, d30: 0, d60: 0, d90: 0, over: 0 });
        return (<div style={{ padding: "0 0 20px" }}>
            <div style={S.hdr}><button style={S.back} onClick={() => setView("bills")}><I name="arrow-left" size={16}/></button><h3 style={S.title}>AP Aging Report</h3></div>
            <div style={S.card}>
                {aging.length === 0 ? <div style={S.empty}>No outstanding payables</div> : (
                    <table style={S.tbl}><thead><tr><th style={S.th}>Vendor</th><th style={S.th}>Bills</th><th style={{ ...S.th, textAlign: "right" }}>Current</th><th style={{ ...S.th, textAlign: "right" }}>1-30</th><th style={{ ...S.th, textAlign: "right" }}>31-60</th><th style={{ ...S.th, textAlign: "right" }}>61-90</th><th style={{ ...S.th, textAlign: "right", color: "#ef4444" }}>90+</th><th style={{ ...S.th, textAlign: "right" }}>Total</th></tr></thead>
                        <tbody>
                        {aging.map(a => (<tr key={a.vendor_id}><td style={{ ...S.td, fontWeight: 600 }}>{a.vendor_name}</td><td style={S.td}>{a.bill_count}</td><td style={{ ...S.td, textAlign: "right" }}>{peso(a.current_due)}</td><td style={{ ...S.td, textAlign: "right" }}>{a.days_1_30 > 0 ? peso(a.days_1_30) : ""}</td><td style={{ ...S.td, textAlign: "right", color: a.days_31_60 > 0 ? "#f59e0b" : "" }}>{a.days_31_60 > 0 ? peso(a.days_31_60) : ""}</td><td style={{ ...S.td, textAlign: "right", color: a.days_61_90 > 0 ? "#ef4444" : "" }}>{a.days_61_90 > 0 ? peso(a.days_61_90) : ""}</td><td style={{ ...S.td, textAlign: "right", fontWeight: a.days_over_90 > 0 ? 700 : 400, color: a.days_over_90 > 0 ? "#ef4444" : "" }}>{a.days_over_90 > 0 ? peso(a.days_over_90) : ""}</td><td style={{ ...S.td, textAlign: "right", fontWeight: 700 }}>{peso(a.total_due)}</td></tr>))}
                        <tr style={{ borderTop: "2px solid #d1d5db", background: "#f9fafb" }}><td colSpan={2} style={{ ...S.td, fontWeight: 700 }}>TOTALS</td><td style={{ ...S.td, textAlign: "right", fontWeight: 700 }}>{peso(totals.current)}</td><td style={{ ...S.td, textAlign: "right", fontWeight: 700 }}>{peso(totals.d30)}</td><td style={{ ...S.td, textAlign: "right", fontWeight: 700 }}>{peso(totals.d60)}</td><td style={{ ...S.td, textAlign: "right", fontWeight: 700 }}>{peso(totals.d90)}</td><td style={{ ...S.td, textAlign: "right", fontWeight: 700, color: "#ef4444" }}>{peso(totals.over)}</td><td style={{ ...S.td, textAlign: "right", fontWeight: 700 }}>{peso(totals.total)}</td></tr>
                        </tbody></table>
                )}
            </div>
        </div>);
    }
}

/* ===== STYLES ===== */
const S = {
    flash: { background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46", padding: "8px 14px", borderRadius: 8, fontSize: 13, marginBottom: 12 },
    statsRow: { display: "flex", gap: 10, marginBottom: 16 },
    stat: { display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "12px 14px" },
    statIco: { width: 34, height: 34, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" },
    statV: { fontSize: 15, fontWeight: 700, color: "#1a1a2e" },
    statL: { fontSize: 11, color: "#888" },
    toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
    searchIn: { padding: "7px 10px 7px 30px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, width: 200, outline: "none" },
    sel: { padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 12, background: "#fff", cursor: "pointer" },
    btnP: { display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#10b981", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" },
    btnO: { display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#fff", color: "#374151", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer" },
    card: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, overflow: "hidden" },
    tbl: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
    th: { textAlign: "left", padding: "8px 10px", fontSize: 11, fontWeight: 600, color: "#888", borderBottom: "1px solid #e5e7eb" },
    td: { padding: "7px 10px", borderBottom: "1px solid #f3f4f6" },
    row: { cursor: "pointer", transition: "background 0.15s" },
    badge: { display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 },
    hdr: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16 },
    back: { background: "none", border: "1px solid #d1d5db", borderRadius: 8, padding: "6px 8px", cursor: "pointer", display: "flex", alignItems: "center" },
    title: { margin: 0, fontSize: 16, fontWeight: 700, color: "#1a1a2e" },
    lbl: { display: "block", fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 4 },
    inp: { width: "100%", padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" },
    grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
    iBtn: { background: "none", border: "none", cursor: "pointer", color: "#6366f1", padding: 4, display: "flex", alignItems: "center" },
    addBtn: { display: "flex", alignItems: "center", gap: 4, background: "none", border: "1px dashed #d1d5db", borderRadius: 6, padding: "6px 12px", fontSize: 12, color: "#10b981", cursor: "pointer", fontWeight: 600 },
    empty: { textAlign: "center", padding: 40, color: "#aaa", fontSize: 13 },
};
