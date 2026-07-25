import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";
import Modal from "../components/Modal";
import { Term, SimpleHint } from "../components/simplemode";
import { useIsSimple } from "../../utils/uimode";
import { api, Empty, num, peso, d10, MOVE_META } from "./shared";

export default function Movements() {
    const simple = useIsSimple();
    const [rows, setRows] = useState([]);
    const [products, setProducts] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [fType, setFType] = useState("");
    const [fWh, setFWh] = useState("");
    const [modal, setModal] = useState(null); // "record" | "transfer"
    const [msg, setMsg] = useState(null);

    const flash = (text, err = false) => { setMsg({ text, err }); setTimeout(() => setMsg(null), 3500); };

    const loadRefs = useCallback(async () => {
        try { const d = await api("get_inv_products"); setProducts(Array.isArray(d) ? d : []); } catch {}
        try { const d = await api("get_inv_warehouses"); setWarehouses(Array.isArray(d) ? d : []); } catch {}
    }, []);
    const loadMoves = useCallback(async () => {
        try { const d = await api("get_inv_movements", { movement_type: fType, warehouse_id: fWh, limit: 200 }); setRows(Array.isArray(d) ? d : []); }
        catch { setRows([]); }
    }, [fType, fWh]);

    useEffect(() => { loadRefs(); }, [loadRefs]);
    useEffect(() => { loadMoves(); }, [loadMoves]);

    async function recordMove(form) {
        try {
            await api("record_inv_movement", {
                product_id: form.product_id, warehouse_id: form.warehouse_id,
                movement_type: form.movement_type, quantity: Number(form.quantity),
                unit_cost: Number(form.unit_cost) || 0, reference: form.reference, notes: form.notes,
            });
            setModal(null); flash("Movement recorded"); loadMoves(); loadRefs();
        } catch (e) { flash(e.message, true); }
    }
    async function transfer(form) {
        try {
            await api("transfer_inv_stock", {
                product_id: form.product_id, from_warehouse_id: form.from_warehouse_id,
                to_warehouse_id: form.to_warehouse_id, quantity: Number(form.quantity),
                reference: form.reference, notes: form.notes,
            });
            setModal(null); flash("Stock transferred"); loadMoves(); loadRefs();
        } catch (e) { flash(e.message, true); }
    }

    const noWh = warehouses.length === 0;

    return (<>
        {msg && <div className={`iv-flash ${msg.err ? "iv-flash-err" : ""}`}>{msg.text}</div>}
        <SimpleHint icon="bulb">Every time stock comes in or goes out.</SimpleHint>
        <div className="iv-bar">
            <div className="iv-bar-l">
                <select className="iv-sel" value={fType} onChange={e => setFType(e.target.value)}>
                    <option value="">All types</option>
                    <option value="in">Stock In</option>
                    <option value="out">Stock Out</option>
                    <option value="adjust">Adjustment</option>
                    <option value="transfer_in">Transfer In</option>
                    <option value="transfer_out">Transfer Out</option>
                </select>
                <select className="iv-sel" value={fWh} onChange={e => setFWh(e.target.value)}>
                    <option value="">{simple ? "All storage locations" : "All warehouses"}</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
                <button className="iv-btn-s" disabled={noWh} onClick={() => setModal("transfer")}><I name="truck" size={13} /> Transfer</button>
                <button className="iv-btn-p" disabled={noWh} onClick={() => setModal("record")}><I name="scroll" size={13} /> <Term simple="Record Stock In/Out" advanced="Record Movement"/></button>
            </div>
        </div>

        {noWh && <div className="iv-flash iv-flash-err"><Term simple="Add a storage location first — stock always lives somewhere." advanced="Add a warehouse first — stock movements need a location."/></div>}

        {rows.length === 0 ? (
            <Empty icon="scroll" title={<Term simple="No stock in or out yet" advanced="No movements yet"/>} desc={<Term simple="Record stock coming in or going out and it'll show up here." advanced="Record stock-ins, stock-outs and adjustments to build the ledger."/>} />
        ) : (
            <div className="iv-tblwrap">
                <table className="iv-tbl">
                    <thead><tr><th>Date</th><th>Product</th><th>Type</th><th><Term simple="Storage Location" advanced="Warehouse"/></th><th className="iv-tbl-r">Qty</th><th className="iv-tbl-r">Balance</th><th>Reference</th></tr></thead>
                    <tbody>
                        {rows.map(m => {
                            const meta = MOVE_META[m.movement_type] || { label: m.movement_type, badge: "iv-b-gray", color: "#999" };
                            const signed = m.movement_type === "out" || m.movement_type === "transfer_out"
                                ? `-${num(Math.abs(m.quantity))}` : (m.movement_type === "adjust" ? num(m.quantity) : `+${num(Math.abs(m.quantity))}`);
                            return (
                                <tr key={m.id}>
                                    <td className="iv-sku">{d10(m.created_at)}</td>
                                    <td><div className="iv-tbl-nm">{m.product_name || "—"}</div><div className="iv-sku">{m.product_sku}</div></td>
                                    <td><span className={`iv-badge ${meta.badge}`}>{meta.label}</span></td>
                                    <td>{m.warehouse_name || "—"}{m.related_warehouse_name ? <span className="iv-sku"> → {m.related_warehouse_name}</span> : null}</td>
                                    <td className="iv-tbl-r iv-tbl-mono" style={{ fontWeight: 700, color: meta.color }}>{signed}</td>
                                    <td className="iv-tbl-r iv-tbl-mono">{num(m.balance_after)}</td>
                                    <td>{m.reference || (m.notes ? <span className="iv-sku">{m.notes}</span> : "—")}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        )}

        {modal === "record" && <RecordModal products={products} warehouses={warehouses} onClose={() => setModal(null)} onSave={recordMove} />}
        {modal === "transfer" && <TransferModal products={products} warehouses={warehouses} onClose={() => setModal(null)} onSave={transfer} />}
    </>);
}

function RecordModal({ products, warehouses, onClose, onSave }) {
    const defWh = warehouses.find(w => w.is_default) || warehouses[0];
    const [form, setForm] = useState({ movement_type: "in", warehouse_id: defWh?.id || "" });
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const prod = products.find(p => p.id === form.product_id);
    const valid = form.product_id && form.warehouse_id && Number(form.quantity) !== 0;

    return (
        <Modal title={<Term simple="Record Stock In/Out" advanced="Record Stock Movement"/>} subtitle="Add, remove or adjust stock" onClose={onClose}>
            <div className="iv-modal-scroll">
                <div className="iv-seg" style={{ marginBottom: 16 }}>
                    {[["in", "Stock In"], ["out", "Stock Out"], ["adjust", "Adjustment"]].map(([v, l]) => (
                        <button key={v} className={`iv-seg-btn ${form.movement_type === v ? "on" : ""}`} onClick={() => set("movement_type", v)}>{l}</button>
                    ))}
                </div>
                <div className="iv-f">
                    <div className="iv-field iv-f-full">
                        <label className="iv-label">Product <span className="iv-req" /></label>
                        <select className="iv-fsel" value={form.product_id || ""} onChange={e => set("product_id", e.target.value)}>
                            <option value="">— Select product —</option>
                            {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                        </select>
                    </div>
                    <div className="iv-field">
                        <label className="iv-label"><Term simple="Storage Location" advanced="Warehouse"/> <span className="iv-req" /></label>
                        <select className="iv-fsel" value={form.warehouse_id || ""} onChange={e => set("warehouse_id", e.target.value)}>
                            <option value="">— Select —</option>
                            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                    </div>
                    <div className="iv-field">
                        <label className="iv-label">Quantity <span className="iv-req" /></label>
                        <input className="iv-input" type="number" step="0.01" value={form.quantity ?? ""} onChange={e => set("quantity", e.target.value)} placeholder={form.movement_type === "adjust" ? "+ / −" : "0"} />
                        {form.movement_type === "adjust" && <span className="iv-hint">Use a negative value to reduce stock</span>}
                    </div>
                    {form.movement_type === "in" && (
                        <div className="iv-field iv-f-full">
                            <label className="iv-label"><Term simple="Cost (₱)" advanced="Unit Cost (₱)"/></label>
                            <input className="iv-input" type="number" step="0.01" min="0" value={form.unit_cost ?? (prod?.cost_price ?? "")} onChange={e => set("unit_cost", e.target.value)} placeholder="0.00" />
                            <span className="iv-hint"><Term simple="Defaults to the product's cost." advanced="Used for accounting postings; defaults to the product cost."/></span>
                        </div>
                    )}
                    <div className="iv-field iv-f-full">
                        <label className="iv-label">Reference</label>
                        <input className="iv-input" value={form.reference || ""} onChange={e => set("reference", e.target.value)} placeholder="e.g. GRN-2026-014, invoice #, count sheet" />
                    </div>
                    <div className="iv-field iv-f-full">
                        <label className="iv-label">Notes</label>
                        <textarea className="iv-textarea" value={form.notes || ""} onChange={e => set("notes", e.target.value)} />
                    </div>
                </div>
            </div>
            <div className="iv-modal-foot">
                <button className="iv-btn-s" onClick={onClose}>Cancel</button>
                <button className="iv-btn-p" disabled={!valid} onClick={() => valid && onSave(form)}>Record</button>
            </div>
        </Modal>
    );
}

function TransferModal({ products, warehouses, onClose, onSave }) {
    const [form, setForm] = useState({});
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const valid = form.product_id && form.from_warehouse_id && form.to_warehouse_id
        && form.from_warehouse_id !== form.to_warehouse_id && Number(form.quantity) > 0;

    return (
        <Modal title="Transfer Stock" subtitle={<Term simple="Move stock between locations" advanced="Move stock between warehouses"/>} onClose={onClose}>
            <div className="iv-modal-scroll">
                <div className="iv-f">
                    <div className="iv-field iv-f-full">
                        <label className="iv-label">Product <span className="iv-req" /></label>
                        <select className="iv-fsel" value={form.product_id || ""} onChange={e => set("product_id", e.target.value)}>
                            <option value="">— Select product —</option>
                            {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                        </select>
                    </div>
                    <div className="iv-field">
                        <label className="iv-label">From <span className="iv-req" /></label>
                        <select className="iv-fsel" value={form.from_warehouse_id || ""} onChange={e => set("from_warehouse_id", e.target.value)}>
                            <option value="">— Source —</option>
                            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                    </div>
                    <div className="iv-field">
                        <label className="iv-label">To <span className="iv-req" /></label>
                        <select className="iv-fsel" value={form.to_warehouse_id || ""} onChange={e => set("to_warehouse_id", e.target.value)}>
                            <option value="">— Destination —</option>
                            {warehouses.filter(w => w.id !== form.from_warehouse_id).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                    </div>
                    <div className="iv-field">
                        <label className="iv-label">Quantity <span className="iv-req" /></label>
                        <input className="iv-input" type="number" step="0.01" min="0" value={form.quantity ?? ""} onChange={e => set("quantity", e.target.value)} placeholder="0" />
                    </div>
                    <div className="iv-field">
                        <label className="iv-label">Reference</label>
                        <input className="iv-input" value={form.reference || ""} onChange={e => set("reference", e.target.value)} />
                    </div>
                </div>
            </div>
            <div className="iv-modal-foot">
                <button className="iv-btn-s" onClick={onClose}>Cancel</button>
                <button className="iv-btn-p" disabled={!valid} onClick={() => valid && onSave(form)}>Transfer</button>
            </div>
        </Modal>
    );
}
