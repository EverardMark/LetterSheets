import { useState, useEffect, useCallback, useMemo } from "react";
import { I } from "../../layouts/ERPLayout";

const API = "http://localhost:8080/api/execute";
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
        return (<div style={{ padding: "0 0 20px" }}>
            {msg && <div style={S.flash}>{msg}</div>}
            <div style={S.statsRow}>
                {[{ l: "Customers", v: summary?.active_customers || 0, i: "users", c: "#6366f1" },
                    { l: "Open Invoices", v: summary?.open_invoices || 0, i: "file-text", c: "#3b82f6" },
                    { l: "Receivable", v: peso(summary?.total_receivable), i: "trending-up", c: "#10b981" },
                    { l: "Overdue", v: peso(summary?.total_overdue), i: "alert-triangle", c: "#ef4444" },
                    { l: "Collected This Month", v: peso(summary?.collected_this_month), i: "check-circle", c: "#22c55e" }
                ].map(s => (<div key={s.l} style={S.stat}><div style={{ ...S.statIco, background: s.c + "18", color: s.c }}><I name={s.i} size={16}/></div><div><div style={S.statV}>{s.v}</div><div style={S.statL}>{s.l}</div></div></div>))}
            </div>
            <div style={S.toolbar}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ position: "relative" }}><I name="search" size={14} style={{ color: "#999", position: "absolute", left: 10, top: 9 }}/><input style={S.searchIn} placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}/></div>
                    <select style={S.sel} value={fStatus} onChange={e => setFStatus(e.target.value)}><option value="">All Status</option>{["Draft","Sent","Partial","Paid","Voided"].map(s => <option key={s}>{s}</option>)}</select>
                    <select style={S.sel} value={fCust} onChange={e => setFCust(e.target.value)}><option value="">All Customers</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button style={S.btnO} onClick={() => setView("customers")}><I name="users" size={14}/> Customers</button>
                    <button style={S.btnO} onClick={loadAging}><I name="clock" size={14}/> Aging</button>
                    <button style={S.btnP} onClick={() => openInvForm(null)}><I name="plus" size={14}/> New Invoice</button>
                </div>
            </div>
            <div style={S.card}>
                {loading ? <div style={S.empty}>Loading...</div> : filtered.length === 0 ? <div style={S.empty}><I name="inbox" size={28} style={{ opacity: .3, marginBottom: 6 }}/><div>No invoices</div></div> : (
                    <table style={S.tbl}><thead><tr><th style={S.th}>Invoice #</th><th style={S.th}>Customer</th><th style={S.th}>Date</th><th style={S.th}>Due</th><th style={S.th}>Status</th><th style={{ ...S.th, textAlign: "right" }}>Total</th><th style={{ ...S.th, textAlign: "right" }}>Balance</th></tr></thead>
                        <tbody>{filtered.map(inv => {
                            const od = inv.status !== "Paid" && inv.status !== "Voided" && new Date(inv.due_date) < new Date();
                            return (<tr key={inv.id} style={S.row} onClick={() => openDetail(inv)}>
                                <td style={{ ...S.td, fontWeight: 600, color: "#1a1a2e" }}>{inv.invoice_number || "INV"}</td>
                                <td style={S.td}>{inv.customer_name}</td>
                                <td style={{ ...S.td, fontSize: 12 }}>{inv.invoice_date?.split("T")[0]}</td>
                                <td style={{ ...S.td, fontSize: 12, color: od ? "#ef4444" : "#888", fontWeight: od ? 600 : 400 }}>{inv.due_date?.split("T")[0]} {od && "⚠"}</td>
                                <td style={S.td}><span style={{ ...S.badge, background: (STATUS_CLR[inv.status] || "#999") + "18", color: STATUS_CLR[inv.status] }}>{inv.status}</span></td>
                                <td style={{ ...S.td, textAlign: "right", fontWeight: 600 }}>{peso(inv.total_amount)}</td>
                                <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: inv.balance_due > 0 ? "#ef4444" : "#22c55e" }}>{peso(inv.balance_due)}</td>
                            </tr>);
                        })}</tbody></table>
                )}
            </div>
        </div>);
    }

    /* =============== CUSTOMERS =============== */
    function renderCustomers() {
        return (<div style={{ padding: "0 0 20px" }}>
            {msg && <div style={S.flash}>{msg}</div>}
            <div style={S.hdr}><button style={S.back} onClick={() => setView("invoices")}><I name="arrow-left" size={16}/></button><h3 style={S.title}>Customers</h3><div style={{ marginLeft: "auto" }}><button style={S.btnP} onClick={() => openCustForm(null)}><I name="plus" size={14}/> New Customer</button></div></div>
            <div style={S.card}>
                {customers.length === 0 ? <div style={S.empty}>No customers yet</div> : (
                    <table style={S.tbl}><thead><tr><th style={S.th}>Name</th><th style={S.th}>Contact</th><th style={S.th}>Email</th><th style={S.th}>Phone</th><th style={S.th}>TIN</th><th style={S.th}>Terms</th><th style={S.th}>Status</th><th style={S.th}></th></tr></thead>
                        <tbody>{customers.map(c => (<tr key={c.id}>
                            <td style={{ ...S.td, fontWeight: 600 }}>{c.name}</td><td style={S.td}>{c.contact_person}</td><td style={S.td}>{c.email}</td><td style={S.td}>{c.phone}</td><td style={S.td}>{c.tin}</td><td style={S.td}>Net {c.payment_terms}</td>
                            <td style={S.td}><span style={{ ...S.badge, background: c.is_active ? "#dcfce7" : "#fee2e2", color: c.is_active ? "#16a34a" : "#dc2626" }}>{c.is_active ? "Active" : "Inactive"}</span></td>
                            <td style={{ ...S.td, display: "flex", gap: 4 }}>
                                <button style={S.iBtn} onClick={() => openCustForm(c)}><I name="edit-2" size={13}/></button>
                                <button style={S.iBtn} onClick={() => toggleCust(c.id)}><I name={c.is_active ? "eye-off" : "eye"} size={13}/></button>
                                <button style={{ ...S.iBtn, color: "#ef4444" }} onClick={() => deleteCust(c.id)}><I name="trash-2" size={13}/></button>
                            </td>
                        </tr>))}</tbody></table>
                )}
            </div>
        </div>);
    }

    /* =============== CUSTOMER FORM =============== */
    function renderCustForm() {
        const f = custForm, set = (k, v) => setCustForm(p => ({ ...p, [k]: v }));
        return (<div style={{ padding: "0 0 20px" }}>
            {msg && <div style={S.flash}>{msg}</div>}
            <div style={S.hdr}><button style={S.back} onClick={() => setView("customers")}><I name="arrow-left" size={16}/></button><h3 style={S.title}>{f.id ? "Edit" : "New"} Customer</h3></div>
            <div style={S.card}><div style={S.grid2}>
                <div><label style={S.lbl}>Name *</label><input style={S.inp} value={f.name} onChange={e => set("name", e.target.value)}/></div>
                <div><label style={S.lbl}>Contact Person</label><input style={S.inp} value={f.contact_person} onChange={e => set("contact_person", e.target.value)}/></div>
                <div><label style={S.lbl}>Email</label><input style={S.inp} type="email" value={f.email} onChange={e => set("email", e.target.value)}/></div>
                <div><label style={S.lbl}>Phone</label><input style={S.inp} value={f.phone} onChange={e => set("phone", e.target.value)}/></div>
                <div style={{ gridColumn: "1/3" }}><label style={S.lbl}>Address</label><input style={S.inp} value={f.address} onChange={e => set("address", e.target.value)}/></div>
                <div><label style={S.lbl}>City</label><input style={S.inp} value={f.city} onChange={e => set("city", e.target.value)}/></div>
                <div><label style={S.lbl}>Province</label><input style={S.inp} value={f.province} onChange={e => set("province", e.target.value)}/></div>
                <div><label style={S.lbl}>ZIP</label><input style={S.inp} value={f.zip_code} onChange={e => set("zip_code", e.target.value)}/></div>
                <div><label style={S.lbl}>TIN</label><input style={S.inp} value={f.tin} onChange={e => set("tin", e.target.value)} placeholder="000-000-000-000"/></div>
                <div><label style={S.lbl}>Terms (days)</label><input style={S.inp} type="number" value={f.payment_terms} onChange={e => set("payment_terms", Number(e.target.value))}/></div>
                <div><label style={S.lbl}>Notes</label><input style={S.inp} value={f.notes} onChange={e => set("notes", e.target.value)}/></div>
            </div>
                <div style={{ display: "flex", gap: 8, marginTop: 16 }}><button style={S.btnP} onClick={saveCust}><I name="save" size={14}/> Save</button><button style={S.btnO} onClick={() => setView("customers")}>Cancel</button></div></div>
        </div>);
    }

    /* =============== INVOICE FORM =============== */
    function renderInvForm() {
        const f = invForm, set = (k, v) => setInvForm(p => ({ ...p, [k]: v }));
        const onCustChange = (cid) => { set("customer_id", cid); const c = customers.find(x => x.id === cid); if (c && f.invoice_date) { const d = new Date(f.invoice_date); d.setDate(d.getDate() + (c.payment_terms || 30)); set("due_date", d.toISOString().split("T")[0]); } };
        return (<div style={{ padding: "0 0 20px" }}>
            {msg && <div style={S.flash}>{msg}</div>}
            <div style={S.hdr}><button style={S.back} onClick={() => setView("invoices")}><I name="arrow-left" size={16}/></button><h3 style={S.title}>{f.id ? "Edit" : "New"} Invoice</h3></div>
            <div style={S.card}>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
                    <div style={{ flex: 2, minWidth: 200 }}><label style={S.lbl}>Customer *</label><select style={S.inp} value={f.customer_id} onChange={e => onCustChange(e.target.value)}><option value="">Select...</option>{customers.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                    <div style={{ flex: 1 }}><label style={S.lbl}>Invoice #</label><input style={S.inp} value={f.invoice_number} onChange={e => set("invoice_number", e.target.value)} placeholder="INV-001"/></div>
                    <div style={{ flex: 1 }}><label style={S.lbl}>PO / Reference</label><input style={S.inp} value={f.reference} onChange={e => set("reference", e.target.value)}/></div>
                    <div style={{ flex: 1 }}><label style={S.lbl}>Date *</label><input style={S.inp} type="date" value={f.invoice_date} onChange={e => set("invoice_date", e.target.value)}/></div>
                    <div style={{ flex: 1 }}><label style={S.lbl}>Due Date</label><input style={S.inp} type="date" value={f.due_date} onChange={e => set("due_date", e.target.value)}/></div>
                </div>
                <label style={S.lbl}>Memo</label><input style={{ ...S.inp, marginBottom: 16 }} value={f.memo} onChange={e => set("memo", e.target.value)}/>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "#1a1a2e" }}>Line Items</div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr>
                    <th style={{ ...S.th, width: "30%" }}>Revenue Account</th><th style={{ ...S.th, width: "20%" }}>Description</th><th style={{ ...S.th, width: "10%", textAlign: "right" }}>Qty</th><th style={{ ...S.th, width: "15%", textAlign: "right" }}>Price</th><th style={{ ...S.th, width: "8%", textAlign: "right" }}>Tax %</th><th style={{ ...S.th, width: "12%", textAlign: "right" }}>Total</th><th style={{ ...S.th, width: "5%" }}></th>
                </tr></thead><tbody>
                {invItems.map((item, i) => (<tr key={i}>
                    <td style={S.td}><select style={{ ...S.inp, margin: 0, fontSize: 12 }} value={item.account_id} onChange={e => updateItem(i, "account_id", e.target.value)}><option value="">Select...</option>{accounts.filter(a => a.account_type === "Revenue" || a.account_type === "Asset").map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select></td>
                    <td style={S.td}><input style={{ ...S.inp, margin: 0, fontSize: 12 }} value={item.description} onChange={e => updateItem(i, "description", e.target.value)}/></td>
                    <td style={S.td}><input type="number" min="0" step="0.01" style={{ ...S.inp, margin: 0, textAlign: "right", fontSize: 12 }} value={item.quantity} onChange={e => updateItem(i, "quantity", Number(e.target.value))}/></td>
                    <td style={S.td}><input type="number" min="0" step="0.01" style={{ ...S.inp, margin: 0, textAlign: "right", fontSize: 12 }} value={item.unit_price} onChange={e => updateItem(i, "unit_price", Number(e.target.value))}/></td>
                    <td style={S.td}><input type="number" min="0" max="100" step="0.5" style={{ ...S.inp, margin: 0, textAlign: "right", fontSize: 12 }} value={item.tax_rate} onChange={e => updateItem(i, "tax_rate", Number(e.target.value))}/></td>
                    <td style={{ ...S.td, textAlign: "right", fontWeight: 600, fontSize: 12 }}>{peso(itemTotal(item))}</td>
                    <td style={S.td}>{invItems.length > 1 && <button style={{ ...S.iBtn, color: "#ef4444" }} onClick={() => removeItem(i)}><I name="x" size={13}/></button>}</td>
                </tr>))}
                <tr><td colSpan={7} style={S.td}><button style={S.addBtn} onClick={addItem}><I name="plus" size={12}/> Add Line</button></td></tr>
                <tr style={{ borderTop: "2px solid #e0e0e0" }}><td colSpan={5} style={{ ...S.td, textAlign: "right", fontSize: 12, color: "#888" }}>Subtotal</td><td style={{ ...S.td, textAlign: "right", fontWeight: 600 }}>{peso(sub)}</td><td></td></tr>
                <tr><td colSpan={5} style={{ ...S.td, textAlign: "right", fontSize: 12, color: "#888" }}>Tax</td><td style={{ ...S.td, textAlign: "right", fontWeight: 600 }}>{peso(tax)}</td><td></td></tr>
                <tr><td colSpan={5} style={{ ...S.td, textAlign: "right", fontWeight: 700, fontSize: 14 }}>Total</td><td style={{ ...S.td, textAlign: "right", fontWeight: 700, fontSize: 14 }}>{peso(sub + tax)}</td><td></td></tr>
                </tbody></table>
                <div style={{ display: "flex", gap: 8, marginTop: 16 }}><button style={S.btnP} onClick={saveInv}><I name="save" size={14}/> Save Invoice</button><button style={S.btnO} onClick={() => setView("invoices")}>Cancel</button></div>
            </div>
        </div>);
    }

    /* =============== INVOICE DETAIL =============== */
    function renderDetail() {
        if (!detail) return null;
        const d = detail, od = d.status !== "Paid" && d.status !== "Voided" && new Date(d.due_date) < new Date();
        return (<div style={{ padding: "0 0 20px" }}>
            {msg && <div style={S.flash}>{msg}</div>}
            <div style={S.hdr}><button style={S.back} onClick={() => setView("invoices")}><I name="arrow-left" size={16}/></button>
                <div><div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a2e" }}>{d.invoice_number || "INV"}</div><div style={{ fontSize: 12, color: "#888" }}>{d.customer_name} &middot; {d.invoice_date?.split("T")[0]}</div></div>
                <span style={{ ...S.badge, background: (STATUS_CLR[d.status] || "#999") + "18", color: STATUS_CLR[d.status], marginLeft: 12, fontSize: 12, padding: "4px 12px" }}>{d.status}</span>
                {od && <span style={{ ...S.badge, background: "#fef2f2", color: "#ef4444", marginLeft: 6 }}>Overdue</span>}
            </div>
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                {[{ l: "Total", v: peso(d.total_amount), c: "#1a1a2e" }, { l: "Received", v: peso(d.amount_paid), c: "#22c55e" }, { l: "Balance Due", v: peso(d.balance_due), c: d.balance_due > 0 ? "#ef4444" : "#22c55e" }, { l: "Due Date", v: d.due_date?.split("T")[0], c: od ? "#ef4444" : "#888" }].map(c => (
                    <div key={c.l} style={{ ...S.stat, flex: 1 }}><div style={{ fontSize: 16, fontWeight: 700, color: c.c }}>{c.v}</div><div style={S.statL}>{c.l}</div></div>
                ))}
            </div>
            {d.memo && <div style={{ fontSize: 12, color: "#666", background: "#f9fafb", borderRadius: 6, padding: "8px 10px", marginBottom: 12 }}>{d.memo}</div>}
            <div style={S.card}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Line Items</div>
                <table style={S.tbl}><thead><tr><th style={S.th}>Account</th><th style={S.th}>Description</th><th style={{ ...S.th, textAlign: "right" }}>Qty</th><th style={{ ...S.th, textAlign: "right" }}>Price</th><th style={{ ...S.th, textAlign: "right" }}>Tax</th><th style={{ ...S.th, textAlign: "right" }}>Total</th></tr></thead>
                    <tbody>
                    {detailItems.map(i => (<tr key={i.id}><td style={S.td}><span style={{ fontWeight: 600, fontSize: 12 }}>{i.account_code}</span> <span style={{ color: "#888", fontSize: 12 }}>{i.account_name}</span></td><td style={S.td}>{i.description}</td><td style={{ ...S.td, textAlign: "right" }}>{i.quantity}</td><td style={{ ...S.td, textAlign: "right" }}>{peso(i.unit_price)}</td><td style={{ ...S.td, textAlign: "right" }}>{peso(i.tax_amount)}</td><td style={{ ...S.td, textAlign: "right", fontWeight: 600 }}>{peso(i.amount + i.tax_amount)}</td></tr>))}
                    <tr style={{ borderTop: "2px solid #e0e0e0" }}><td colSpan={5} style={{ ...S.td, fontWeight: 700 }}>TOTAL</td><td style={{ ...S.td, textAlign: "right", fontWeight: 700 }}>{peso(d.total_amount)}</td></tr>
                    </tbody></table>
            </div>
            {/* Payments */}
            <div style={{ ...S.card, marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>Payments Received</div>
                    {(d.status === "Sent" || d.status === "Partial") && !payForm && (
                        <button style={S.btnP} onClick={() => setPayForm({ date: new Date().toISOString().split("T")[0], amount: d.balance_due, method: "Bank Transfer", ref: "", account_id: "", memo: "" })}><I name="plus" size={14}/> Record Payment</button>
                    )}
                </div>
                {detailPay.length === 0 && !payForm && <div style={{ color: "#aaa", fontSize: 13, padding: 10 }}>No payments yet</div>}
                {detailPay.map(p => (<div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}>
                    <div><div style={{ fontSize: 13, fontWeight: 600 }}>{peso(p.amount)}</div><div style={{ fontSize: 11, color: "#888" }}>{p.payment_date?.split("T")[0]} &middot; {p.payment_method} {p.reference_no && `(${p.reference_no})`}</div></div>
                    <button style={{ ...S.iBtn, color: "#ef4444" }} onClick={() => deletePay(p.id)}><I name="trash-2" size={13}/></button>
                </div>))}
                {payForm && (<div style={{ background: "#f9fafb", borderRadius: 8, padding: 12, marginTop: 8 }}>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ flex: 1 }}><label style={S.lbl}>Date</label><input type="date" style={S.inp} value={payForm.date} onChange={e => setPayForm(p => ({ ...p, date: e.target.value }))}/></div>
                        <div style={{ flex: 1 }}><label style={S.lbl}>Amount</label><input type="number" min="0" step="0.01" style={S.inp} value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: Number(e.target.value) }))}/></div>
                        <div style={{ flex: 1 }}><label style={S.lbl}>Method</label><select style={S.inp} value={payForm.method} onChange={e => setPayForm(p => ({ ...p, method: e.target.value }))}><option>Bank Transfer</option><option>Cash</option><option>Check</option><option>GCash</option><option>Maya</option></select></div>
                        <div style={{ flex: 1 }}><label style={S.lbl}>Reference #</label><input style={S.inp} value={payForm.ref} onChange={e => setPayForm(p => ({ ...p, ref: e.target.value }))}/></div>
                        <div style={{ flex: 2 }}><label style={S.lbl}>Cash/Bank Account</label><select style={S.inp} value={payForm.account_id} onChange={e => setPayForm(p => ({ ...p, account_id: e.target.value }))}><option value="">Select...</option>{accounts.filter(a => a.account_type === "Asset" && a.account_subtype === "Current Asset").map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select></div>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}><button style={S.btnP} onClick={submitPay}><I name="check" size={14}/> Record</button><button style={S.btnO} onClick={() => setPayForm(null)}>Cancel</button></div>
                </div>)}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                {d.status === "Draft" && <><button style={S.btnP} onClick={() => sendInv(d.id)}><I name="send" size={14}/> Send</button><button style={S.btnO} onClick={() => openInvForm(d)}><I name="edit-2" size={14}/> Edit</button><button style={{ ...S.btnO, color: "#ef4444", borderColor: "#fca5a5" }} onClick={() => deleteInv(d.id)}><I name="trash-2" size={14}/> Delete</button></>}
                {(d.status === "Sent" || d.status === "Draft") && <button style={{ ...S.btnO, color: "#ef4444", borderColor: "#fca5a5" }} onClick={() => voidInv(d.id)}><I name="x-circle" size={14}/> Void</button>}
            </div>
        </div>);
    }

    /* =============== AGING =============== */
    function renderAging() {
        const t = aging.reduce((a, r) => ({ total: a.total + r.total_due, cur: a.cur + r.current_due, d30: a.d30 + r.days_1_30, d60: a.d60 + r.days_31_60, d90: a.d90 + r.days_61_90, over: a.over + r.days_over_90 }), { total: 0, cur: 0, d30: 0, d60: 0, d90: 0, over: 0 });
        return (<div style={{ padding: "0 0 20px" }}>
            <div style={S.hdr}><button style={S.back} onClick={() => setView("invoices")}><I name="arrow-left" size={16}/></button><h3 style={S.title}>AR Aging Report</h3></div>
            <div style={S.card}>
                {aging.length === 0 ? <div style={S.empty}>No outstanding receivables</div> : (
                    <table style={S.tbl}><thead><tr><th style={S.th}>Customer</th><th style={S.th}>Invoices</th><th style={{ ...S.th, textAlign: "right" }}>Current</th><th style={{ ...S.th, textAlign: "right" }}>1-30</th><th style={{ ...S.th, textAlign: "right" }}>31-60</th><th style={{ ...S.th, textAlign: "right" }}>61-90</th><th style={{ ...S.th, textAlign: "right", color: "#ef4444" }}>90+</th><th style={{ ...S.th, textAlign: "right" }}>Total</th></tr></thead>
                        <tbody>
                        {aging.map(a => (<tr key={a.customer_id}><td style={{ ...S.td, fontWeight: 600 }}>{a.customer_name}</td><td style={S.td}>{a.invoice_count}</td><td style={{ ...S.td, textAlign: "right" }}>{peso(a.current_due)}</td><td style={{ ...S.td, textAlign: "right" }}>{a.days_1_30 > 0 ? peso(a.days_1_30) : ""}</td><td style={{ ...S.td, textAlign: "right", color: a.days_31_60 > 0 ? "#f59e0b" : "" }}>{a.days_31_60 > 0 ? peso(a.days_31_60) : ""}</td><td style={{ ...S.td, textAlign: "right", color: a.days_61_90 > 0 ? "#ef4444" : "" }}>{a.days_61_90 > 0 ? peso(a.days_61_90) : ""}</td><td style={{ ...S.td, textAlign: "right", fontWeight: a.days_over_90 > 0 ? 700 : 400, color: a.days_over_90 > 0 ? "#ef4444" : "" }}>{a.days_over_90 > 0 ? peso(a.days_over_90) : ""}</td><td style={{ ...S.td, textAlign: "right", fontWeight: 700 }}>{peso(a.total_due)}</td></tr>))}
                        <tr style={{ borderTop: "2px solid #d1d5db", background: "#f9fafb" }}><td colSpan={2} style={{ ...S.td, fontWeight: 700 }}>TOTALS</td><td style={{ ...S.td, textAlign: "right", fontWeight: 700 }}>{peso(t.cur)}</td><td style={{ ...S.td, textAlign: "right", fontWeight: 700 }}>{peso(t.d30)}</td><td style={{ ...S.td, textAlign: "right", fontWeight: 700 }}>{peso(t.d60)}</td><td style={{ ...S.td, textAlign: "right", fontWeight: 700 }}>{peso(t.d90)}</td><td style={{ ...S.td, textAlign: "right", fontWeight: 700, color: "#ef4444" }}>{peso(t.over)}</td><td style={{ ...S.td, textAlign: "right", fontWeight: 700 }}>{peso(t.total)}</td></tr>
                        </tbody></table>
                )}
            </div>
        </div>);
    }
}

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
