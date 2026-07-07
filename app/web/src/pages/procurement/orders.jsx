import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";
import Modal from "../components/Modal";
import { api, Empty, peso, num, d10, today, PO_BADGE, vendorName } from "./shared";
import LineGrid from "./LineGrid";

export default function Orders() {
    const [rows, setRows] = useState([]);
    const [vendors, setVendors] = useState([]);
    const [products, setProducts] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [status, setStatus] = useState("");
    const [modal, setModal] = useState(null);
    const [msg, setMsg] = useState(null);

    const flash = (text, err = false) => { setMsg({ text, err }); setTimeout(() => setMsg(null), 4500); };
    const load = useCallback(async () => {
        try { const d = await api("get_pur_orders", { status }); setRows(Array.isArray(d) ? d : []); } catch { setRows([]); }
    }, [status]);
    const loadRefs = useCallback(async () => {
        try { const d = await api("get_vendors"); setVendors(Array.isArray(d) ? d : []); } catch {}
        try { const d = await api("get_inv_products"); setProducts(Array.isArray(d) ? d : []); } catch {}
        try { const d = await api("get_inv_warehouses"); setWarehouses(Array.isArray(d) ? d : []); } catch {}
        try { const d = await api("get_accounts"); setAccounts(d?.accounts || []); } catch {}
    }, []);
    useEffect(() => { load(); }, [load]);
    useEffect(() => { loadRefs(); }, [loadRefs]);

    return (<>
        {msg && <div className={`pr-flash ${msg.err ? "pr-flash-err" : ""}`}>{msg.text}</div>}
        <div className="pr-bar">
            <div className="pr-bar-l">
                <select className="pr-sel" value={status} onChange={e => setStatus(e.target.value)}>
                    <option value="">All statuses</option>
                    {["Draft", "Approved", "PartiallyReceived", "Received", "Billed", "Closed", "Cancelled"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>
            <button className="pr-btn-p" disabled={vendors.length === 0} onClick={() => setModal({ id: null })}><I name="cart" size={13} /> New PO</button>
        </div>
        {vendors.length === 0 && <div className="pr-flash pr-flash-err">Add a vendor first (Accounting → Payables → Vendors).</div>}

        {rows.length === 0 ? (
            <Empty icon="cart" title={status ? "No matching POs" : "No purchase orders"} desc={status ? "Try a different status." : "Create a PO, approve it to issue to the vendor, receive goods, then bill."} action={status || vendors.length === 0 ? null : "New PO"} onAction={() => setModal({ id: null })} />
        ) : (
            <div className="pr-tblwrap pr-tbl-click">
                <table className="pr-tbl">
                    <thead><tr><th>PO</th><th>Vendor</th><th>Date</th><th className="pr-tbl-r">Total</th><th>Status</th></tr></thead>
                    <tbody>
                        {rows.map(o => (
                            <tr key={o.id} onClick={() => setModal({ id: o.id })}>
                                <td className="pr-tbl-nm">PO-{String(o.po_number).padStart(4, "0")}</td>
                                <td>{o.vendor_name || "—"}</td>
                                <td className="pr-sku">{d10(o.order_date)}</td>
                                <td className="pr-tbl-r pr-tbl-mono">{peso(o.total_amount)}</td>
                                <td><span className={`pr-badge ${PO_BADGE[o.status] || "pr-b-gray"}`}>{o.status}</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
        {modal && <OrderModal id={modal.id} vendors={vendors} products={products} warehouses={warehouses} accounts={accounts} onClose={() => { setModal(null); load(); }} flash={flash} />}
    </>);
}

function OrderModal({ id, vendors, products, warehouses, accounts, onClose, flash }) {
    const [o, setO] = useState(null);
    const [f, setF] = useState({ vendor_id: "", order_date: today(), notes: "" });
    const [lines, setLines] = useState([]);
    const [recv, setRecv] = useState(false);
    const isNew = !id;

    const load = useCallback(async () => {
        if (isNew) { setO({ status: "Draft" }); return; }
        try {
            const d = await api("get_pur_order", { id });
            setO(d);
            setF({ vendor_id: d.vendor_id, order_date: d.order_date, expected_date: d.expected_date, warehouse_id: d.warehouse_id, notes: d.notes });
            setLines((d.items || []).map(it => ({ product_id: it.product_id, description: it.description, quantity: it.quantity, unit_price: it.unit_price, discount_pct: it.discount_pct, tax_rate: it.tax_rate, expense_account_id: it.expense_account_id })));
        } catch (e) { flash(e.message, true); }
    }, [id, isNew, flash]);
    useEffect(() => { load(); }, [load]);

    if (!o) return <Modal title="Purchase Order" onClose={onClose}><div style={{ padding: 20, color: "#999" }}>Loading…</div></Modal>;

    const editable = isNew || o.status === "Draft";
    const set = (k, v) => setF(p => ({ ...p, [k]: v }));
    const body = () => ({ ...f, items: lines.map(l => ({ ...l, quantity: Number(l.quantity) || 0, unit_price: Number(l.unit_price) || 0, discount_pct: Number(l.discount_pct) || 0, tax_rate: Number(l.tax_rate) || 0 })) });

    const save = async () => {
        if (!f.vendor_id) { flash("Select a vendor", true); return; }
        try {
            if (isNew) { const r = await api("create_pur_order", body()); flash(`PO-${String(r.po_number).padStart(4, "0")} created`); }
            else { await api("update_pur_order", { id, ...body() }); flash("PO saved"); }
            onClose();
        } catch (e) { flash(e.message, true); }
    };
    const act = async (action, extra, okMsg) => { try { await api(action, { id, ...extra }); flash(okMsg); load(); } catch (e) { flash(e.message, true); } };
    const bill = async () => {
        try {
            const r = await api("generate_pur_bill", { order_id: id });
            const m = !r?.bill ? "Received goods billed (zero-value — no payable raised)"
                : r?.gl_posted ? "Vendor bill created + payable posted"
                    : "Vendor bill created (GL not auto-posted — check Procurement settings)";
            flash(m); load();
        }
        catch (e) { flash(e.message, true); }
    };
    const del = async () => { try { await api("delete_pur_order", { id }); flash("PO deleted"); onClose(); } catch (e) { flash(e.message, true); } };

    const hasBillable = (o.items || []).some(it => (Number(it.qty_received) || 0) > (Number(it.qty_billed) || 0));

    return (
        <Modal title={isNew ? "New Purchase Order" : `PO-${String(o.po_number).padStart(4, "0")}`} subtitle={isNew ? "Draft PO" : `${o.vendor_name || ""} · ${o.status}`} onClose={onClose}>
            <div className="pr-modal-scroll">
                <div className="pr-f" style={{ marginBottom: 14 }}>
                    <div className="pr-field"><label className="pr-label">Vendor <span className="pr-req" /></label>
                        <select className="pr-fsel" value={f.vendor_id || ""} disabled={!editable} onChange={e => set("vendor_id", e.target.value)}>
                            <option value="">— Select —</option>
                            {vendors.map(v => <option key={v.id} value={v.id}>{vendorName(v)}</option>)}
                        </select>
                    </div>
                    <div className="pr-field"><label className="pr-label">Deliver To (Warehouse)</label>
                        <select className="pr-fsel" value={f.warehouse_id || ""} disabled={!editable} onChange={e => set("warehouse_id", e.target.value)}>
                            <option value="">— Default —</option>
                            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                    </div>
                    <div className="pr-field"><label className="pr-label">Order Date</label><input className="pr-input" type="date" disabled={!editable} value={d10(f.order_date)} onChange={e => set("order_date", e.target.value)} /></div>
                    <div className="pr-field"><label className="pr-label">Expected Date</label><input className="pr-input" type="date" disabled={!editable} value={d10(f.expected_date)} onChange={e => set("expected_date", e.target.value)} /></div>
                    <div className="pr-field pr-f-full"><label className="pr-label">Notes</label><input className="pr-input" disabled={!editable} value={f.notes || ""} onChange={e => set("notes", e.target.value)} /></div>
                </div>

                {editable ? <LineGrid products={products} accounts={accounts} lines={lines} setLines={setLines} /> : (
                    <div className="pr-tblwrap" style={{ marginBottom: 12 }}>
                        <table className="pr-tbl">
                            <thead><tr><th>Item</th><th className="pr-tbl-r">Ord</th><th className="pr-tbl-r">Recv</th><th className="pr-tbl-r">Billed</th><th className="pr-tbl-r">Total</th></tr></thead>
                            <tbody>{(o.items || []).map(it => (
                                <tr key={it.id}>
                                    <td>{it.product_name || it.description}<div className="pr-sku">{it.product_sku}</div></td>
                                    <td className="pr-tbl-r pr-tbl-mono">{num(it.quantity)}</td>
                                    <td className="pr-tbl-r pr-tbl-mono" style={{ color: it.qty_received >= it.quantity ? "#0d9488" : "#d97706" }}>{num(it.qty_received)}</td>
                                    <td className="pr-tbl-r pr-tbl-mono">{num(it.qty_billed)}</td>
                                    <td className="pr-tbl-r pr-tbl-mono">{peso(it.line_total)}</td>
                                </tr>
                            ))}</tbody>
                        </table>
                    </div>
                )}

                {!editable && o.receipts && o.receipts.length > 0 && (
                    <div className="pr-hint" style={{ marginTop: 8 }}>{o.receipts.length} goods receipt(s) recorded</div>
                )}
            </div>

            <div className="pr-modal-foot" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {!isNew && (o.status === "Draft" || o.status === "Cancelled") && <button className="pr-btn-danger" onClick={del}>Delete</button>}
                    {o.status === "Draft" && !isNew && <button className="pr-btn-p" onClick={() => act("approve_pur_order", {}, "Approved — PO issued")}>Approve</button>}
                    {o.status === "Draft" && !isNew && <button className="pr-btn-s" onClick={() => act("cancel_pur_order", {}, "Cancelled")}>Cancel</button>}
                    {["Approved", "PartiallyReceived"].includes(o.status) && <button className="pr-btn-s" onClick={() => setRecv(true)}><I name="truck" size={12} /> Receive Goods</button>}
                    {hasBillable && ["PartiallyReceived", "Received"].includes(o.status) && <button className="pr-btn-p" onClick={bill}><I name="peso" size={12} /> Generate Bill</button>}
                    {["Received", "Billed", "PartiallyReceived"].includes(o.status) && <button className="pr-btn-s" onClick={() => act("close_pur_order", {}, "Closed")}>Close</button>}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button className="pr-btn-s" onClick={onClose}>Close</button>
                    {editable && <button className="pr-btn-p" onClick={save}>{isNew ? "Create PO" : "Save"}</button>}
                </div>
            </div>

            {recv && <ReceiveForm order={o} onClose={() => setRecv(false)} onDone={() => { setRecv(false); load(); }} flash={flash} />}
        </Modal>
    );
}

function ReceiveForm({ order, onClose, onDone, flash }) {
    const outstanding = (it) => (Number(it.quantity) || 0) - (Number(it.qty_received) || 0);
    const [qty, setQty] = useState(() => Object.fromEntries((order.items || []).map(it => [it.id, outstanding(it)])));
    const [hdr, setHdr] = useState({ receipt_date: today() });
    const submit = async () => {
        const lines = (order.items || []).filter(it => Number(qty[it.id]) > 0).map(it => ({ order_item_id: it.id, recv_qty: Number(qty[it.id]) }));
        if (lines.length === 0) { flash("Enter a quantity to receive", true); return; }
        try {
            const r = await api("create_pur_receipt", { order_id: order.id, warehouse_id: hdr.warehouse_id || order.warehouse_id || "", receipt_date: hdr.receipt_date, notes: hdr.notes || "", lines });
            flash(r?.gl_posted ? "Received — inventory posted (Dr Inventory / Cr GR-IR)" : "Goods receipt recorded"); onDone();
        } catch (e) { flash(e.message, true); }
    };
    return (
        <Modal title={`Receive PO-${String(order.po_number).padStart(4, "0")}`} subtitle="Record goods receipt (partial allowed)" onClose={onClose}>
            <div className="pr-modal-scroll">
                <div className="pr-f" style={{ marginBottom: 12 }}>
                    <div className="pr-field"><label className="pr-label">Receipt Date</label><input className="pr-input" type="date" value={hdr.receipt_date} onChange={e => setHdr(h => ({ ...h, receipt_date: e.target.value }))} /></div>
                    <div className="pr-field pr-f-full"><label className="pr-label">Notes</label><input className="pr-input" value={hdr.notes || ""} onChange={e => setHdr(h => ({ ...h, notes: e.target.value }))} /></div>
                </div>
                <div className="pr-tblwrap">
                    <table className="pr-tbl">
                        <thead><tr><th>Item</th><th className="pr-tbl-r">Ordered</th><th className="pr-tbl-r">Received</th><th className="pr-tbl-r">Outstanding</th><th style={{ width: 90 }}>Receive</th></tr></thead>
                        <tbody>{(order.items || []).map(it => (
                            <tr key={it.id}>
                                <td>{it.product_name || it.description}<div className="pr-sku">{it.product_sku}</div></td>
                                <td className="pr-tbl-r pr-tbl-mono">{num(it.quantity)}</td>
                                <td className="pr-tbl-r pr-tbl-mono">{num(it.qty_received)}</td>
                                <td className="pr-tbl-r pr-tbl-mono">{num(outstanding(it))}</td>
                                <td><input className="pr-input" type="number" min="0" max={outstanding(it)} value={qty[it.id] ?? 0} onChange={e => setQty(q => ({ ...q, [it.id]: e.target.value }))} /></td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
            </div>
            <div className="pr-modal-foot"><button className="pr-btn-s" onClick={onClose}>Cancel</button><button className="pr-btn-p" onClick={submit}>Receive</button></div>
        </Modal>
    );
}
