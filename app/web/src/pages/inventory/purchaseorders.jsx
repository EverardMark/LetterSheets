import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";
import Modal from "../components/Modal";
import { Term, SimpleHint, AdvancedOnly } from "../components/simplemode";
import { api, Empty, peso, num, d10, PO_BADGE } from "./shared";

export default function PurchaseOrders() {
    const [rows, setRows] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [products, setProducts] = useState([]);
    const [status, setStatus] = useState("");
    const [createOpen, setCreateOpen] = useState(false);
    const [detailId, setDetailId] = useState(null);
    const [msg, setMsg] = useState(null);

    const flash = (text, err = false) => { setMsg({ text, err }); setTimeout(() => setMsg(null), 3500); };

    const loadRefs = useCallback(async () => {
        try { const d = await api("get_inv_suppliers"); setSuppliers(Array.isArray(d) ? d : []); } catch {}
        try { const d = await api("get_inv_warehouses"); setWarehouses(Array.isArray(d) ? d : []); } catch {}
        try { const d = await api("get_inv_products"); setProducts(Array.isArray(d) ? d : []); } catch {}
    }, []);
    const loadPOs = useCallback(async () => {
        try { const d = await api("get_purchase_orders", { status }); setRows(Array.isArray(d) ? d : []); } catch { setRows([]); }
    }, [status]);

    useEffect(() => { loadRefs(); }, [loadRefs]);
    useEffect(() => { loadPOs(); }, [loadPOs]);

    async function create(form) {
        try {
            const po = await api("create_purchase_order", form);
            setCreateOpen(false); flash(`PO #${po.po_number} created`); loadPOs();
            if (po?.id) setDetailId(po.id);
        } catch (e) { flash(e.message, true); }
    }

    return (<>
        {msg && <div className={`iv-flash ${msg.err ? "iv-flash-err" : ""}`}>{msg.text}</div>}
        <SimpleHint icon="bulb">Orders you send to suppliers to restock — record the goods when they arrive.</SimpleHint>
        <div className="iv-bar">
            <div className="iv-bar-l">
                <select className="iv-sel" value={status} onChange={e => setStatus(e.target.value)}>
                    <option value="">All statuses</option>
                    {["Draft", "Ordered", "Partial", "Received", "Cancelled"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>
            <button className="iv-btn-p" disabled={warehouses.length === 0} onClick={() => setCreateOpen(true)}><I name="cart" size={13} /> New Purchase Order</button>
        </div>

        {warehouses.length === 0 && <div className="iv-flash iv-flash-err"><Term simple="Add a storage location first — orders are received into one." advanced="Add a warehouse first — a PO receives goods into a warehouse."/></div>}

        {rows.length === 0 ? (
            <Empty icon="cart" title={status ? "No matching orders" : "No purchase orders"} desc={status ? "Try a different status filter." : "Create a purchase order to restock from a supplier."} action={status || warehouses.length === 0 ? null : "New purchase order"} onAction={() => setCreateOpen(true)} />
        ) : (
            <div className="iv-tblwrap iv-tbl-click">
                <table className="iv-tbl">
                    <thead><tr><th>PO #</th><th>Supplier</th><th><Term simple="Storage Location" advanced="Warehouse"/></th><th className="iv-tbl-r">Items</th><th className="iv-tbl-r">Total</th><th>Ordered</th><th>Status</th></tr></thead>
                    <tbody>
                        {rows.map(po => (
                            <tr key={po.id} onClick={() => setDetailId(po.id)}>
                                <td><span className="iv-tbl-nm">#{po.po_number}</span></td>
                                <td>{po.supplier_name || "—"}</td>
                                <td>{po.warehouse_name || "—"}</td>
                                <td className="iv-tbl-r">{po.item_count || 0}</td>
                                <td className="iv-tbl-r iv-tbl-mono" style={{ fontWeight: 600, color: "#222" }}>{peso(po.total_amount)}</td>
                                <td className="iv-sku">{d10(po.order_date) || "—"}</td>
                                <td><span className={`iv-badge ${PO_BADGE[po.status] || "iv-b-gray"}`}>{po.status}</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}

        {createOpen && <CreatePOModal suppliers={suppliers} warehouses={warehouses} onClose={() => setCreateOpen(false)} onSave={create} />}
        {detailId && <PODetailModal poId={detailId} products={products} onClose={() => { setDetailId(null); loadPOs(); }} flash={flash} />}
    </>);
}

function CreatePOModal({ suppliers, warehouses, onClose, onSave }) {
    const defWh = warehouses.find(w => w.is_default) || warehouses[0];
    const today = new Date().toISOString().slice(0, 10);
    const [form, setForm] = useState({ warehouse_id: defWh?.id || "", order_date: today });
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    return (
        <Modal title="New Purchase Order" subtitle="Order stock from a supplier" onClose={onClose}>
            <div className="iv-modal-scroll">
                <div className="iv-f">
                    <div className="iv-field">
                        <label className="iv-label">Supplier</label>
                        <select className="iv-fsel" value={form.supplier_id || ""} onChange={e => set("supplier_id", e.target.value)}>
                            <option value="">— None —</option>
                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    <div className="iv-field">
                        <label className="iv-label"><Term simple="Deliver to location" advanced="Deliver to warehouse"/> <span className="iv-req" /></label>
                        <select className="iv-fsel" value={form.warehouse_id || ""} onChange={e => set("warehouse_id", e.target.value)}>
                            <option value="">— Select —</option>
                            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                    </div>
                    <div className="iv-field">
                        <label className="iv-label">Order Date</label>
                        <input className="iv-input" type="date" value={form.order_date || ""} onChange={e => set("order_date", e.target.value)} />
                    </div>
                    <div className="iv-field">
                        <label className="iv-label">Expected Date</label>
                        <input className="iv-input" type="date" value={form.expected_date || ""} onChange={e => set("expected_date", e.target.value)} />
                    </div>
                    <div className="iv-field iv-f-full">
                        <label className="iv-label">Notes</label>
                        <textarea className="iv-textarea" value={form.notes || ""} onChange={e => set("notes", e.target.value)} />
                    </div>
                </div>
            </div>
            <div className="iv-modal-foot">
                <button className="iv-btn-s" onClick={onClose}>Cancel</button>
                <button className="iv-btn-p" disabled={!form.warehouse_id} onClick={() => form.warehouse_id && onSave(form)}>Create PO</button>
            </div>
        </Modal>
    );
}

function PODetailModal({ poId, products, onClose, flash }) {
    const [po, setPo] = useState(null);
    const [adding, setAdding] = useState({ product_id: "", quantity: "", unit_cost: "" });
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try { const d = await api("get_purchase_order", { id: poId }); setPo(d); } catch (e) { flash(e.message, true); }
    }, [poId, flash]);
    useEffect(() => { load(); }, [load]);

    if (!po) return <Modal title="Purchase Order" onClose={onClose}><div style={{ padding: 20, color: "#999" }}>Loading…</div></Modal>;

    const editable = po.status === "Draft" || po.status === "Ordered" || po.status === "Partial";
    const items = po.items || [];

    const addItem = async () => {
        if (!adding.product_id || !(Number(adding.quantity) > 0)) return;
        setBusy(true);
        try {
            await api("add_po_item", { po_id: po.id, product_id: adding.product_id, quantity: Number(adding.quantity), unit_cost: Number(adding.unit_cost) || 0 });
            setAdding({ product_id: "", quantity: "", unit_cost: "" }); load();
        } catch (e) { flash(e.message, true); }
        setBusy(false);
    };
    const removeItem = async (id) => { try { await api("delete_po_item", { id }); load(); } catch (e) { flash(e.message, true); } };
    const setStatus = async (s) => { try { await api("update_po_status", { id: po.id, status: s }); load(); flash(`Marked ${s}`); } catch (e) { flash(e.message, true); } };
    const receive = async () => {
        if (items.length === 0) { flash("Add line items first", true); return; }
        setBusy(true);
        try { const r = await api("receive_purchase_order", { id: po.id }); flash(`Received ${peso(r.total_received)} of stock`); load(); }
        catch (e) { flash(e.message, true); }
        setBusy(false);
    };
    const del = async () => { try { await api("delete_purchase_order", { id: po.id }); onClose(); } catch (e) { flash(e.message, true); } };

    // Pre-fill unit cost from the product when picking one.
    const pickProduct = (pid) => {
        const p = products.find(x => x.id === pid);
        setAdding(a => ({ ...a, product_id: pid, unit_cost: a.unit_cost || (p ? p.cost_price : "") }));
    };

    return (
        <Modal title={`Purchase Order #${po.po_number}`} subtitle={`${po.supplier_name || "No supplier"} · ${po.warehouse_name || "—"}`} onClose={onClose}>
            <div className="iv-modal-scroll">
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
                    <span className={`iv-badge ${PO_BADGE[po.status] || "iv-b-gray"}`}>{po.status}</span>
                    {po.order_date && <span className="iv-sku">Ordered {d10(po.order_date)}</span>}
                    {po.expected_date && <span className="iv-sku">· Expected {d10(po.expected_date)}</span>}
                    {po.journal_entry_id && <AdvancedOnly><span className="iv-badge iv-b-blue">Posted to GL</span></AdvancedOnly>}
                </div>

                <div className="iv-tblwrap" style={{ marginBottom: 12 }}>
                    <table className="iv-tbl">
                        <thead><tr><th>Product</th><th className="iv-tbl-r">Qty</th><th className="iv-tbl-r">Received</th><th className="iv-tbl-r">Unit Cost</th><th className="iv-tbl-r">Total</th>{editable && <th></th>}</tr></thead>
                        <tbody>
                            {items.length === 0 ? (
                                <tr><td colSpan={editable ? 6 : 5} style={{ textAlign: "center", color: "#aaa", padding: 20 }}>No line items yet</td></tr>
                            ) : items.map(it => (
                                <tr key={it.id}>
                                    <td><div className="iv-tbl-nm">{it.product_name}</div><div className="iv-sku">{it.product_sku}</div></td>
                                    <td className="iv-tbl-r iv-tbl-mono">{num(it.quantity)}</td>
                                    <td className="iv-tbl-r iv-tbl-mono">{num(it.received_qty)}</td>
                                    <td className="iv-tbl-r iv-tbl-mono">{peso(it.unit_cost)}</td>
                                    <td className="iv-tbl-r iv-tbl-mono" style={{ fontWeight: 600, color: "#222" }}>{peso(it.line_total)}</td>
                                    {editable && <td className="iv-tbl-r"><button className="iv-btn-ghost" onClick={() => removeItem(it.id)}>✕</button></td>}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div style={{ textAlign: "right", fontSize: 14, fontWeight: 700, color: "#222", marginBottom: 16 }}>
                    Total: {peso(po.total_amount)}
                </div>

                {editable && (
                    <div style={{ background: "#fafbfa", border: "1px solid #eee", borderRadius: 10, padding: 14 }}>
                        <div className="iv-label" style={{ marginBottom: 8 }}>Add line item</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 110px auto", gap: 8, alignItems: "end" }}>
                            <select className="iv-fsel" value={adding.product_id} onChange={e => pickProduct(e.target.value)}>
                                <option value="">— Product —</option>
                                {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                            </select>
                            <input className="iv-input" type="number" min="0" step="0.01" placeholder="Qty" value={adding.quantity} onChange={e => setAdding(a => ({ ...a, quantity: e.target.value }))} />
                            <input className="iv-input" type="number" min="0" step="0.01" placeholder="Cost" value={adding.unit_cost} onChange={e => setAdding(a => ({ ...a, unit_cost: e.target.value }))} />
                            <button className="iv-btn-s" disabled={busy || !adding.product_id} onClick={addItem}>Add</button>
                        </div>
                    </div>
                )}
            </div>

            <div className="iv-modal-foot" style={{ justifyContent: "space-between" }}>
                <div style={{ display: "flex", gap: 8 }}>
                    {po.status !== "Received" && <button className="iv-btn-danger" onClick={del}>Delete</button>}
                    {po.status === "Draft" && <button className="iv-btn-s" onClick={() => setStatus("Ordered")}>Mark Ordered</button>}
                    {editable && <button className="iv-btn-s" onClick={() => setStatus("Cancelled")}>Cancel PO</button>}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button className="iv-btn-s" onClick={onClose}>Close</button>
                    {editable && <button className="iv-btn-p" disabled={busy || items.length === 0} onClick={receive}><I name="check" size={13} /> Receive Goods</button>}
                </div>
            </div>
        </Modal>
    );
}
