import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";
import Modal from "../components/Modal";
import { api, Empty, peso, num, d10, today, ORDER_BADGE } from "./shared";
import LineGrid from "./LineGrid";

const custName = (c) => c.name || `${c.first_name || ""} ${c.last_name || ""}`.trim();

export default function Orders() {
    const [rows, setRows] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [products, setProducts] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [status, setStatus] = useState("");
    const [modal, setModal] = useState(null);
    const [msg, setMsg] = useState(null);

    const flash = (text, err = false) => { setMsg({ text, err }); setTimeout(() => setMsg(null), 4500); };
    const load = useCallback(async () => {
        try { const d = await api("get_so_orders", { status }); setRows(Array.isArray(d) ? d : []); } catch { setRows([]); }
    }, [status]);
    const loadRefs = useCallback(async () => {
        try { const d = await api("get_customers"); setCustomers(d?.customers || d || []); } catch {}
        try { const d = await api("get_inv_products"); setProducts(Array.isArray(d) ? d : []); } catch {}
        try { const d = await api("get_inv_warehouses"); setWarehouses(Array.isArray(d) ? d : []); } catch {}
    }, []);
    useEffect(() => { load(); }, [load]);
    useEffect(() => { loadRefs(); }, [loadRefs]);

    return (<>
        {msg && <div className={`so-flash ${msg.err ? "so-flash-err" : ""}`}>{msg.text}</div>}
        <div className="so-bar">
            <div className="so-bar-l">
                <select className="so-sel" value={status} onChange={e => setStatus(e.target.value)}>
                    <option value="">All statuses</option>
                    {["Draft", "Confirmed", "PartiallyFulfilled", "Fulfilled", "Invoiced", "Closed", "Cancelled"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>
            <button className="so-btn-p" disabled={customers.length === 0} onClick={() => setModal({ id: null })}><I name="cart" size={13} /> New Order</button>
        </div>
        {customers.length === 0 && <div className="so-flash so-flash-err">Add a customer first (Accounting → Receivables).</div>}

        {rows.length === 0 ? (
            <Empty icon="cart" title={status ? "No matching orders" : "No orders"} desc={status ? "Try a different status." : "Create a sales order, confirm it to reserve stock, then ship and invoice."} action={status || customers.length === 0 ? null : "New order"} onAction={() => setModal({ id: null })} />
        ) : (
            <div className="so-tblwrap so-tbl-click">
                <table className="so-tbl">
                    <thead><tr><th>Order</th><th>Customer</th><th>Date</th><th className="so-tbl-r">Total</th><th>Status</th></tr></thead>
                    <tbody>
                        {rows.map(o => (
                            <tr key={o.id} onClick={() => setModal({ id: o.id })}>
                                <td className="so-tbl-nm">SO-{String(o.order_number).padStart(4, "0")}</td>
                                <td>{o.customer_name || "—"}</td>
                                <td className="so-sku">{d10(o.order_date)}</td>
                                <td className="so-tbl-r so-tbl-mono">{peso(o.total_amount)}</td>
                                <td><span className={`so-badge ${ORDER_BADGE[o.status] || "so-b-gray"}`}>{o.status}</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
        {modal && <OrderModal id={modal.id} customers={customers} products={products} warehouses={warehouses} onClose={() => { setModal(null); load(); }} flash={flash} />}
    </>);
}

function OrderModal({ id, customers, products, warehouses, onClose, flash }) {
    const [o, setO] = useState(null);
    const [f, setF] = useState({ customer_id: "", order_date: today(), discount_pct: 0, notes: "" });
    const [lines, setLines] = useState([]);
    const [ship, setShip] = useState(false);
    const isNew = !id;

    const load = useCallback(async () => {
        if (isNew) { setO({ status: "Draft" }); return; }
        try {
            const d = await api("get_so_order", { id });
            setO(d);
            setF({ customer_id: d.customer_id, order_date: d.order_date, expected_ship_date: d.expected_ship_date, warehouse_id: d.warehouse_id, discount_pct: d.discount_pct, notes: d.notes });
            setLines((d.items || []).map(it => ({ product_id: it.product_id, description: it.description, quantity: it.quantity, unit_price: it.unit_price, discount_pct: it.discount_pct, tax_rate: it.tax_rate })));
        } catch (e) { flash(e.message, true); }
    }, [id, isNew, flash]);
    useEffect(() => { load(); }, [load]);

    if (!o) return <Modal title="Order" onClose={onClose}><div style={{ padding: 20, color: "#999" }}>Loading…</div></Modal>;

    const editable = isNew || o.status === "Draft";
    const set = (k, v) => setF(p => ({ ...p, [k]: v }));
    const body = () => ({ ...f, discount_pct: Number(f.discount_pct) || 0, items: lines.map(l => ({ ...l, quantity: Number(l.quantity) || 0, unit_price: Number(l.unit_price) || 0, discount_pct: Number(l.discount_pct) || 0, tax_rate: Number(l.tax_rate) || 0 })) });

    const save = async () => {
        if (!f.customer_id) { flash("Select a customer", true); return; }
        try {
            if (isNew) { const r = await api("create_so_order", body()); flash(`Order #${r.order_number} created`); }
            else { await api("update_so_order", { id, ...body() }); flash("Order saved"); }
            onClose();
        } catch (e) { flash(e.message, true); }
    };
    const act = async (action, extra = {}, okMsg) => {
        try { const r = await api(action, { id, ...extra }); flash(okMsg || "Done"); if (action === "generate_so_invoice" && r?.revenue_posted === false) flash("Invoiced (revenue not auto-posted — check Sales settings)", true); load(); }
        catch (e) { flash(e.message, true); }
    };
    const invoice = async () => {
        try { const r = await api("generate_so_invoice", { order_id: id }); flash(r?.revenue_posted ? "Invoice created + revenue posted" : "Invoice created"); load(); }
        catch (e) { flash(e.message, true); }
    };
    const del = async () => { try { await api("delete_so_order", { id }); flash("Order deleted"); onClose(); } catch (e) { flash(e.message, true); } };

    return (
        <Modal title={isNew ? "New Order" : `SO-${String(o.order_number).padStart(4, "0")}`} subtitle={isNew ? "Draft order" : `${o.customer_name || ""} · ${o.status}`} onClose={onClose}>
            <div className="so-modal-scroll">
                <div className="so-f" style={{ marginBottom: 14 }}>
                    <div className="so-field"><label className="so-label">Customer <span className="so-req" /></label>
                        <select className="so-fsel" value={f.customer_id || ""} disabled={!editable} onChange={e => set("customer_id", e.target.value)}>
                            <option value="">— Select —</option>
                            {customers.map(c => <option key={c.id} value={c.id}>{custName(c)}</option>)}
                        </select>
                    </div>
                    <div className="so-field"><label className="so-label">Warehouse</label>
                        <select className="so-fsel" value={f.warehouse_id || ""} disabled={!editable} onChange={e => set("warehouse_id", e.target.value)}>
                            <option value="">— Default —</option>
                            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                    </div>
                    <div className="so-field"><label className="so-label">Order Date</label><input className="so-input" type="date" disabled={!editable} value={d10(f.order_date)} onChange={e => set("order_date", e.target.value)} /></div>
                    <div className="so-field"><label className="so-label">Order Discount %</label><input className="so-input" type="number" min="0" max="100" disabled={!editable} value={f.discount_pct ?? 0} onChange={e => set("discount_pct", e.target.value)} /></div>
                    <div className="so-field so-f-full"><label className="so-label">Notes</label><input className="so-input" disabled={!editable} value={f.notes || ""} onChange={e => set("notes", e.target.value)} /></div>
                </div>

                {editable ? <LineGrid products={products} lines={lines} setLines={setLines} /> : (
                    <div className="so-tblwrap" style={{ marginBottom: 12 }}>
                        <table className="so-tbl">
                            <thead><tr><th>Product</th><th className="so-tbl-r">Ord</th><th className="so-tbl-r">Resv</th><th className="so-tbl-r">Ship</th><th className="so-tbl-r">Inv</th><th className="so-tbl-r">Avail</th><th className="so-tbl-r">Total</th></tr></thead>
                            <tbody>{(o.items || []).map(it => (
                                <tr key={it.id}>
                                    <td>{it.product_name || it.description}<div className="so-sku">{it.product_sku}</div></td>
                                    <td className="so-tbl-r so-tbl-mono">{num(it.quantity)}</td>
                                    <td className="so-tbl-r so-tbl-mono">{num(it.qty_reserved)}</td>
                                    <td className="so-tbl-r so-tbl-mono" style={{ color: it.qty_fulfilled >= it.quantity ? "#0d9488" : "#d97706" }}>{num(it.qty_fulfilled)}</td>
                                    <td className="so-tbl-r so-tbl-mono">{num(it.qty_invoiced)}</td>
                                    <td className="so-tbl-r so-tbl-mono">{num(it.available_qty)}</td>
                                    <td className="so-tbl-r so-tbl-mono">{peso(it.line_total)}</td>
                                </tr>
                            ))}</tbody>
                        </table>
                    </div>
                )}

                {!editable && o.shipments && o.shipments.length > 0 && (
                    <div className="so-hint" style={{ marginTop: 8 }}>{o.shipments.length} shipment(s) · {o.invoice_id ? "invoiced" : "not fully invoiced"}</div>
                )}
            </div>

            <div className="so-modal-foot" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {!isNew && (o.status === "Draft" || o.status === "Cancelled") && <button className="so-btn-danger" onClick={del}>Delete</button>}
                    {o.status === "Draft" && !isNew && <button className="so-btn-p" onClick={() => act("confirm_so_order", {}, "Confirmed — stock reserved")}>Confirm</button>}
                    {["Confirmed", "PartiallyFulfilled"].includes(o.status) && <><button className="so-btn-s" onClick={() => setShip(true)}><I name="truck" size={12} /> Create Shipment</button><button className="so-btn-s" onClick={() => act("cancel_so_order", {}, "Cancelled")}>Cancel</button></>}
                    {["PartiallyFulfilled", "Fulfilled"].includes(o.status) && <button className="so-btn-p" onClick={invoice}><I name="peso" size={12} /> Generate Invoice</button>}
                    {o.status === "Invoiced" && <button className="so-btn-s" onClick={() => act("close_so_order", {}, "Closed")}>Close</button>}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button className="so-btn-s" onClick={onClose}>Close</button>
                    {editable && <button className="so-btn-p" onClick={save}>{isNew ? "Create Order" : "Save"}</button>}
                </div>
            </div>

            {ship && <ShipForm order={o} onClose={() => setShip(false)} onDone={() => { setShip(false); load(); }} flash={flash} />}
        </Modal>
    );
}

function ShipForm({ order, onClose, onDone, flash }) {
    const remaining = (it) => (Number(it.quantity) || 0) - (Number(it.qty_fulfilled) || 0);
    const [qty, setQty] = useState(() => Object.fromEntries((order.items || []).filter(it => it.product_id).map(it => [it.id, remaining(it)])));
    const [hdr, setHdr] = useState({ ship_date: today() });
    const submit = async () => {
        const lines = (order.items || []).filter(it => it.product_id && Number(qty[it.id]) > 0).map(it => ({ order_item_id: it.id, ship_qty: Number(qty[it.id]) }));
        if (lines.length === 0) { flash("Enter a quantity to ship", true); return; }
        try {
            const r = await api("create_so_shipment", { order_id: order.id, warehouse_id: hdr.warehouse_id || order.warehouse_id || "", carrier: hdr.carrier || "", tracking_number: hdr.tracking || "", ship_date: hdr.ship_date, notes: hdr.notes || "", lines });
            flash(r?.cogs_posted ? "Shipped — COGS posted" : "Shipment created"); onDone();
        } catch (e) { flash(e.message, true); }
    };
    return (
        <Modal title={`Ship SO-${String(order.order_number).padStart(4, "0")}`} subtitle="Fulfill order lines (partial allowed)" onClose={onClose}>
            <div className="so-modal-scroll">
                <div className="so-f" style={{ marginBottom: 12 }}>
                    <div className="so-field"><label className="so-label">Ship Date</label><input className="so-input" type="date" value={hdr.ship_date} onChange={e => setHdr(h => ({ ...h, ship_date: e.target.value }))} /></div>
                    <div className="so-field"><label className="so-label">Carrier</label><input className="so-input" value={hdr.carrier || ""} onChange={e => setHdr(h => ({ ...h, carrier: e.target.value }))} /></div>
                    <div className="so-field"><label className="so-label">Tracking #</label><input className="so-input" value={hdr.tracking || ""} onChange={e => setHdr(h => ({ ...h, tracking: e.target.value }))} /></div>
                </div>
                <div className="so-tblwrap">
                    <table className="so-tbl">
                        <thead><tr><th>Product</th><th className="so-tbl-r">Ordered</th><th className="so-tbl-r">Fulfilled</th><th className="so-tbl-r">Available</th><th style={{ width: 90 }}>Ship</th></tr></thead>
                        <tbody>{(order.items || []).filter(it => it.product_id).map(it => (
                            <tr key={it.id}>
                                <td>{it.product_name}<div className="so-sku">{it.product_sku}</div></td>
                                <td className="so-tbl-r so-tbl-mono">{num(it.quantity)}</td>
                                <td className="so-tbl-r so-tbl-mono">{num(it.qty_fulfilled)}</td>
                                <td className="so-tbl-r so-tbl-mono">{num(it.available_qty)}</td>
                                <td><input className="so-input" type="number" min="0" max={remaining(it)} value={qty[it.id] ?? 0} onChange={e => setQty(q => ({ ...q, [it.id]: e.target.value }))} /></td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
            </div>
            <div className="so-modal-foot"><button className="so-btn-s" onClick={onClose}>Cancel</button><button className="so-btn-p" onClick={submit}>Ship</button></div>
        </Modal>
    );
}
