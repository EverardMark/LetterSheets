import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { I } from "../../layouts/ERPLayout";
import Modal from "../components/Modal";
import { api, Empty, peso, d10, today, QUOTE_BADGE } from "./shared";
import LineGrid from "./LineGrid";

const custName = (c) => c.name || `${c.first_name || ""} ${c.last_name || ""}`.trim();

export default function Quotes() {
    const nav = useNavigate();
    const [rows, setRows] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [products, setProducts] = useState([]);
    const [status, setStatus] = useState("");
    const [modal, setModal] = useState(null);
    const [msg, setMsg] = useState(null);

    const flash = (text, err = false) => { setMsg({ text, err }); setTimeout(() => setMsg(null), 4000); };
    const load = useCallback(async () => {
        try { const d = await api("get_so_quotes", { status }); setRows(Array.isArray(d) ? d : []); } catch { setRows([]); }
    }, [status]);
    const loadRefs = useCallback(async () => {
        try { const d = await api("get_customers"); setCustomers(d?.customers || d || []); } catch {}
        try { const d = await api("get_inv_products"); setProducts(Array.isArray(d) ? d : []); } catch {}
    }, []);
    useEffect(() => { load(); }, [load]);
    useEffect(() => { loadRefs(); }, [loadRefs]);

    return (<>
        {msg && <div className={`so-flash ${msg.err ? "so-flash-err" : ""}`}>{msg.text}</div>}
        <div className="so-bar">
            <div className="so-bar-l">
                <select className="so-sel" value={status} onChange={e => setStatus(e.target.value)}>
                    <option value="">All statuses</option>
                    {["Draft", "Sent", "Accepted", "Converted", "Rejected", "Expired"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>
            <button className="so-btn-p" disabled={customers.length === 0} onClick={() => setModal({ id: null })}><I name="file" size={13} /> New Quote</button>
        </div>
        {customers.length === 0 && <div className="so-flash so-flash-err">Add a customer first (Accounting → Receivables).</div>}

        {rows.length === 0 ? (
            <Empty icon="file" title={status ? "No matching quotes" : "No quotes"} desc={status ? "Try a different status." : "Create a quote and convert it to an order when accepted."} action={status || customers.length === 0 ? null : "New quote"} onAction={() => setModal({ id: null })} />
        ) : (
            <div className="so-tblwrap so-tbl-click">
                <table className="so-tbl">
                    <thead><tr><th>Quote</th><th>Customer</th><th>Date</th><th className="so-tbl-r">Total</th><th>Status</th></tr></thead>
                    <tbody>
                        {rows.map(q => (
                            <tr key={q.id} onClick={() => setModal({ id: q.id })}>
                                <td className="so-tbl-nm">QUO-{String(q.quote_number).padStart(4, "0")}</td>
                                <td>{q.customer_name || "—"}</td>
                                <td className="so-sku">{d10(q.quote_date)}</td>
                                <td className="so-tbl-r so-tbl-mono">{peso(q.total_amount)}</td>
                                <td><span className={`so-badge ${QUOTE_BADGE[q.status] || "so-b-gray"}`}>{q.status}</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
        {modal && <QuoteModal id={modal.id} customers={customers} products={products} nav={nav} onClose={() => { setModal(null); load(); }} flash={flash} />}
    </>);
}

function QuoteModal({ id, customers, products, nav, onClose, flash }) {
    const [q, setQ] = useState(null);
    const [f, setF] = useState({ customer_id: "", quote_date: today(), discount_pct: 0, notes: "" });
    const [lines, setLines] = useState([]);
    const isNew = !id;

    const load = useCallback(async () => {
        if (isNew) { setQ({ status: "Draft" }); return; }
        try {
            const d = await api("get_so_quote", { id });
            setQ(d);
            setF({ customer_id: d.customer_id, quote_date: d.quote_date, valid_until: d.valid_until, price_list_id: d.price_list_id, discount_pct: d.discount_pct, notes: d.notes });
            setLines((d.items || []).map(it => ({ product_id: it.product_id, description: it.description, quantity: it.quantity, unit_price: it.unit_price, discount_pct: it.discount_pct, tax_rate: it.tax_rate })));
        } catch (e) { flash(e.message, true); }
    }, [id, isNew, flash]);
    useEffect(() => { load(); }, [load]);

    if (!q) return <Modal title="Quote" onClose={onClose}><div style={{ padding: 20, color: "#999" }}>Loading…</div></Modal>;

    const editable = isNew || q.status === "Draft" || q.status === "Sent";
    const set = (k, v) => setF(p => ({ ...p, [k]: v }));
    const body = () => ({ ...f, discount_pct: Number(f.discount_pct) || 0, items: lines.map(l => ({ ...l, quantity: Number(l.quantity) || 0, unit_price: Number(l.unit_price) || 0, discount_pct: Number(l.discount_pct) || 0, tax_rate: Number(l.tax_rate) || 0 })) });

    const save = async () => {
        if (!f.customer_id) { flash("Select a customer", true); return; }
        try {
            if (isNew) await api("create_so_quote", body());
            else await api("update_so_quote", { id, ...body() });
            flash("Quote saved"); onClose();
        } catch (e) { flash(e.message, true); }
    };
    const setStatus = async (s) => { try { await api("update_so_quote_status", { id, status: s }); flash(`Marked ${s}`); load(); } catch (e) { flash(e.message, true); } };
    const del = async () => { try { await api("delete_so_quote", { id }); onClose(); } catch (e) { flash(e.message, true); } };
    const convert = async () => {
        try { const r = await api("convert_so_quote", { id }); flash(`Converted to order #${r.order_number}`); onClose(); nav("/sales/orders"); }
        catch (e) { flash(e.message, true); }
    };

    return (
        <Modal title={isNew ? "New Quote" : `QUO-${String(q.quote_number).padStart(4, "0")}`} subtitle={isNew ? "Draft quotation" : q.status} onClose={onClose}>
            <div className="so-modal-scroll">
                <div className="so-f" style={{ marginBottom: 14 }}>
                    <div className="so-field"><label className="so-label">Customer <span className="so-req" /></label>
                        <select className="so-fsel" value={f.customer_id || ""} disabled={!editable} onChange={e => set("customer_id", e.target.value)}>
                            <option value="">— Select —</option>
                            {customers.map(c => <option key={c.id} value={c.id}>{custName(c)}</option>)}
                        </select>
                    </div>
                    <div className="so-field"><label className="so-label">Quote Date</label><input className="so-input" type="date" disabled={!editable} value={d10(f.quote_date)} onChange={e => set("quote_date", e.target.value)} /></div>
                    <div className="so-field"><label className="so-label">Valid Until</label><input className="so-input" type="date" disabled={!editable} value={d10(f.valid_until)} onChange={e => set("valid_until", e.target.value)} /></div>
                    <div className="so-field"><label className="so-label">Order Discount %</label><input className="so-input" type="number" min="0" max="100" disabled={!editable} value={f.discount_pct ?? 0} onChange={e => set("discount_pct", e.target.value)} /></div>
                    <div className="so-field so-f-full"><label className="so-label">Notes</label><input className="so-input" disabled={!editable} value={f.notes || ""} onChange={e => set("notes", e.target.value)} /></div>
                </div>
                {editable ? <LineGrid products={products} lines={lines} setLines={setLines} /> : (
                    <div className="so-tblwrap">
                        <table className="so-tbl"><thead><tr><th>Product</th><th className="so-tbl-r">Qty</th><th className="so-tbl-r">Price</th><th className="so-tbl-r">Total</th></tr></thead>
                            <tbody>{(q.items || []).map(it => <tr key={it.id}><td>{it.product_name || it.description}</td><td className="so-tbl-r so-tbl-mono">{it.quantity}</td><td className="so-tbl-r so-tbl-mono">{peso(it.unit_price)}</td><td className="so-tbl-r so-tbl-mono">{peso(it.line_total)}</td></tr>)}</tbody>
                        </table>
                    </div>
                )}
            </div>
            <div className="so-modal-foot" style={{ justifyContent: "space-between" }}>
                <div style={{ display: "flex", gap: 8 }}>
                    {!isNew && q.status !== "Converted" && <button className="so-btn-danger" onClick={del}>Delete</button>}
                    {q.status === "Draft" && !isNew && <button className="so-btn-s" onClick={() => setStatus("Sent")}>Send</button>}
                    {q.status === "Sent" && <><button className="so-btn-s" onClick={() => setStatus("Accepted")}>Accept</button><button className="so-btn-s" onClick={() => setStatus("Rejected")}>Reject</button></>}
                    {q.status === "Accepted" && <button className="so-btn-p" onClick={convert}><I name="cart" size={12} /> Convert to Order</button>}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button className="so-btn-s" onClick={onClose}>Close</button>
                    {editable && <button className="so-btn-p" onClick={save}>{isNew ? "Create Quote" : "Save"}</button>}
                </div>
            </div>
        </Modal>
    );
}
