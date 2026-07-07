import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";
import Modal from "../components/Modal";
import { api, Empty, peso, num, d10, today } from "./shared";

const CM_BADGE = { Draft: "so-b-gray", Open: "so-b-blue", Applied: "so-b-green", Refunded: "so-b-purple", Voided: "so-b-red" };

export default function CreditMemos() {
    const [rows, setRows] = useState([]);
    const [orders, setOrders] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [status, setStatus] = useState("");
    const [modal, setModal] = useState(null);
    const [msg, setMsg] = useState(null);

    const flash = (text, err = false) => { setMsg({ text, err }); setTimeout(() => setMsg(null), 4500); };
    const load = useCallback(async () => {
        try { const d = await api("get_credit_memos", { status }); setRows(Array.isArray(d) ? d : []); } catch { setRows([]); }
    }, [status]);
    const loadRefs = useCallback(async () => {
        try { const d = await api("get_so_orders"); setOrders((Array.isArray(d) ? d : []).filter(o => ["Invoiced", "Fulfilled", "PartiallyFulfilled", "Closed"].includes(o.status))); } catch {}
        try { const d = await api("get_accounts"); setAccounts(d?.accounts || []); } catch {}
    }, []);
    useEffect(() => { load(); }, [load]);
    useEffect(() => { loadRefs(); }, [loadRefs]);

    return (<>
        {msg && <div className={`so-flash ${msg.err ? "so-flash-err" : ""}`}>{msg.text}</div>}
        <div className="so-bar">
            <div className="so-bar-l">
                <select className="so-sel" value={status} onChange={e => setStatus(e.target.value)}>
                    <option value="">All statuses</option>
                    {["Draft", "Open", "Applied", "Refunded", "Voided"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>
            <button className="so-btn-p" disabled={orders.length === 0} onClick={() => setModal({ id: null })}><I name="file" size={13} /> New Credit Memo</button>
        </div>
        {orders.length === 0 && <div className="so-flash so-flash-err">Credit memos are raised against an invoiced sales order — none available yet.</div>}

        {rows.length === 0 ? (
            <Empty icon="file" title={status ? "No matching credit memos" : "No credit memos"} desc="Credit a customer for returned goods; restock and reverse the revenue/COGS." action={status || orders.length === 0 ? null : "New credit memo"} onAction={() => setModal({ id: null })} />
        ) : (
            <div className="so-tblwrap so-tbl-click">
                <table className="so-tbl">
                    <thead><tr><th>Memo</th><th>Customer</th><th>Order</th><th className="so-tbl-r">Total</th><th className="so-tbl-r">Open Credit</th><th>Status</th></tr></thead>
                    <tbody>
                        {rows.map(m => (
                            <tr key={m.id} onClick={() => setModal({ id: m.id })}>
                                <td className="so-tbl-nm">CM-{String(m.memo_number).padStart(4, "0")}</td>
                                <td>{m.customer_name || "—"}</td>
                                <td className="so-sku">SO-{String(m.order_number).padStart(4, "0")}</td>
                                <td className="so-tbl-r so-tbl-mono">{peso(m.total_amount)}</td>
                                <td className="so-tbl-r so-tbl-mono">{m.balance_credit > 0 ? peso(m.balance_credit) : "—"}</td>
                                <td><span className={`so-badge ${CM_BADGE[m.status] || "so-b-gray"}`}>{m.status}</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
        {modal && <MemoModal id={modal.id} orders={orders} accounts={accounts} onClose={() => { setModal(null); load(); }} flash={flash} />}
    </>);
}

function MemoModal({ id, orders, accounts, onClose, flash }) {
    const [m, setM] = useState(null);
    const [orderId, setOrderId] = useState("");
    const [reason, setReason] = useState("");
    const [lines, setLines] = useState([]);
    const [refundOpen, setRefundOpen] = useState(false);
    const isNew = !id;

    const load = useCallback(async () => {
        if (isNew) { setM({ status: "Draft" }); return; }
        try { const d = await api("get_credit_memo", { id }); setM(d); } catch (e) { flash(e.message, true); }
    }, [id, isNew, flash]);
    useEffect(() => { load(); }, [load]);

    const pickOrder = async (oid) => {
        setOrderId(oid);
        if (!oid) { setLines([]); return; }
        try {
            const cl = await api("get_cm_creditable", { order_id: oid });
            setLines((Array.isArray(cl) ? cl : []).map(l => ({ ...l, quantity: l.creditable_qty, restock: true, take: true })));
        } catch (e) { flash(e.message, true); }
    };

    if (!m) return <Modal title="Credit Memo" onClose={onClose}><div style={{ padding: 20, color: "#999" }}>Loading…</div></Modal>;

    const order = orders.find(o => o.id === orderId);
    const upd = (i, k, v) => setLines(ls => ls.map((l, j) => j === i ? { ...l, [k]: v } : l));
    const chosen = lines.filter(l => l.take && Number(l.quantity) > 0);
    const subtotal = chosen.reduce((s, l) => s + Number(l.quantity) * Number(l.unit_price), 0);
    const tax = chosen.reduce((s, l) => s + Number(l.quantity) * Number(l.unit_price) * Number(l.tax_rate || 0) / 100, 0);

    const create = async () => {
        if (!orderId) { flash("Pick a sales order", true); return; }
        if (chosen.length === 0) { flash("Choose at least one line to credit", true); return; }
        try {
            await api("create_credit_memo", {
                order_id: orderId, invoice_id: order?.invoice_id || "", reason,
                items: chosen.map(l => ({ order_item_id: l.order_item_id, description: l.description || l.product_name, quantity: Number(l.quantity), unit_price: Number(l.unit_price), tax_rate: Number(l.tax_rate || 0), unit_cost: Number(l.unit_cost || 0), restock: !!l.restock })),
            });
            flash("Credit memo created (Draft)"); onClose();
        } catch (e) { flash(e.message, true); }
    };
    const act = async (action, extra, okMsg) => {
        try { const r = await api(action, { id, ...extra }); flash(okMsg || "Done"); if (r?.gl_posted === false) flash((okMsg || "Done") + " (GL not auto-posted)", true); load(); }
        catch (e) { flash(e.message, true); }
    };
    const post = async () => {
        try { const r = await api("post_credit_memo", { id }); flash(r?.gl_posted ? "Posted — revenue & COGS reversed" : "Posted (GL not auto-posted)"); load(); }
        catch (e) { flash(e.message, true); }
    };
    const applyToInvoice = async () => {
        if (!m.invoice_id) { flash("This memo has no linked invoice to apply to", true); return; }
        try { await api("apply_credit_memo", { id, invoice_id: m.invoice_id, amount: m.balance_credit }); flash("Applied to invoice"); load(); }
        catch (e) { flash(e.message, true); }
    };
    const cashAccts = accounts.filter(a => a.account_type === "Asset");

    // NEW draft form
    if (isNew) {
        return (
            <Modal title="New Credit Memo" subtitle="Return against an invoiced order" onClose={onClose}>
                <div className="so-modal-scroll">
                    <div className="so-f" style={{ marginBottom: 12 }}>
                        <div className="so-field"><label className="so-label">Sales Order <span className="so-req" /></label>
                            <select className="so-fsel" value={orderId} onChange={e => pickOrder(e.target.value)}>
                                <option value="">— Select —</option>
                                {orders.map(o => <option key={o.id} value={o.id}>SO-{String(o.order_number).padStart(4, "0")} · {o.customer_name}</option>)}
                            </select>
                        </div>
                        <div className="so-field so-f-full"><label className="so-label">Reason</label><input className="so-input" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Damaged on arrival" /></div>
                    </div>
                    {orderId && (lines.length === 0 ? <div className="so-hint">No creditable (invoiced, un-returned) lines on this order.</div> : (
                        <div className="so-tblwrap">
                            <table className="so-tbl">
                                <thead><tr><th style={{ width: 34 }}></th><th>Product</th><th className="so-tbl-r">Max</th><th style={{ width: 80 }}>Return</th><th style={{ width: 64 }}>Restock</th><th className="so-tbl-r">Credit</th></tr></thead>
                                <tbody>{lines.map((l, i) => (
                                    <tr key={l.order_item_id}>
                                        <td><input type="checkbox" checked={!!l.take} onChange={e => upd(i, "take", e.target.checked)} /></td>
                                        <td>{l.product_name || l.description}</td>
                                        <td className="so-tbl-r so-tbl-mono">{num(l.creditable_qty)}</td>
                                        <td><input className="so-input" type="number" min="0" max={l.creditable_qty} step="0.01" value={l.quantity} disabled={!l.take} onChange={e => upd(i, "quantity", e.target.value)} /></td>
                                        <td style={{ textAlign: "center" }}><input type="checkbox" checked={!!l.restock} disabled={!l.take || !l.product_id} onChange={e => upd(i, "restock", e.target.checked)} /></td>
                                        <td className="so-tbl-r so-tbl-mono">{peso(Number(l.quantity) * Number(l.unit_price) * (1 + Number(l.tax_rate || 0) / 100))}</td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                    ))}
                    {chosen.length > 0 && <div style={{ textAlign: "right", marginTop: 8, fontSize: 13 }}>
                        <div style={{ color: "#888" }}>Subtotal {peso(subtotal)} · Tax {peso(tax)}</div>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>Credit Total: {peso(subtotal + tax)}</div>
                    </div>}
                    <div className="so-hint" style={{ marginTop: 8 }}>Uncheck <b>Restock</b> for goods too damaged to resell (scrapped — cost hits Inventory Adjustment).</div>
                </div>
                <div className="so-modal-foot"><button className="so-btn-s" onClick={onClose}>Cancel</button><button className="so-btn-p" onClick={create}>Create Draft</button></div>
            </Modal>
        );
    }

    // EXISTING memo
    return (
        <Modal title={`CM-${String(m.memo_number).padStart(4, "0")}`} subtitle={`${m.customer_name || ""} · ${m.status}`} onClose={onClose}>
            <div className="so-modal-scroll">
                <div className="so-f" style={{ marginBottom: 10 }}>
                    <div className="so-field"><label className="so-label">Order</label><div className="so-ro">SO-{String(m.order_number).padStart(4, "0")}</div></div>
                    <div className="so-field"><label className="so-label">Date</label><div className="so-ro">{d10(m.memo_date)}</div></div>
                    <div className="so-field"><label className="so-label">Total</label><div className="so-ro">{peso(m.total_amount)}</div></div>
                    <div className="so-field"><label className="so-label">Open Credit</label><div className="so-ro">{peso(m.balance_credit)}</div></div>
                </div>
                {m.reason && <div className="so-hint" style={{ marginBottom: 8 }}>{m.reason}</div>}
                <div className="so-tblwrap">
                    <table className="so-tbl">
                        <thead><tr><th>Product</th><th className="so-tbl-r">Qty</th><th>Restock</th><th className="so-tbl-r">Amount</th><th className="so-tbl-r">Tax</th></tr></thead>
                        <tbody>{(m.items || []).map(it => (
                            <tr key={it.id}>
                                <td>{it.product_name || it.description}</td>
                                <td className="so-tbl-r so-tbl-mono">{num(it.quantity)}</td>
                                <td>{it.product_id ? (it.restock ? "Yes" : "Scrap") : "—"}</td>
                                <td className="so-tbl-r so-tbl-mono">{peso(it.amount)}</td>
                                <td className="so-tbl-r so-tbl-mono">{peso(it.tax_amount)}</td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
                {refundOpen && <div className="so-f" style={{ marginTop: 12 }}>
                    <div className="so-field so-f-full"><label className="so-label">Refund from Cash/Bank account</label>
                        <div style={{ display: "flex", gap: 8 }}>
                            <select className="so-fsel" id="cm-refund-acct" defaultValue="">
                                <option value="">— Select —</option>
                                {cashAccts.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                            </select>
                            <button className="so-btn-p" onClick={() => { const acct = document.getElementById("cm-refund-acct").value; if (!acct) { flash("Pick a cash account", true); return; } act("refund_credit_memo", { account_id: acct }, "Refunded"); }}>Refund {peso(m.balance_credit)}</button>
                        </div>
                    </div>
                </div>}
            </div>
            <div className="so-modal-foot" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {m.status === "Draft" && <button className="so-btn-danger" onClick={async () => { try { await api("delete_credit_memo", { id }); flash("Deleted"); onClose(); } catch (e) { flash(e.message, true); } }}>Delete</button>}
                    {m.status === "Draft" && <button className="so-btn-p" onClick={post}>Post</button>}
                    {m.status === "Open" && m.invoice_id && <button className="so-btn-p" onClick={applyToInvoice}>Apply to Invoice</button>}
                    {m.status === "Open" && m.balance_credit > 0 && <button className="so-btn-s" onClick={() => setRefundOpen(v => !v)}>Refund…</button>}
                    {["Open", "Applied"].includes(m.status) && <button className="so-btn-s" onClick={() => act("void_credit_memo", {}, "Voided")}>Void</button>}
                </div>
                <button className="so-btn-s" onClick={onClose}>Close</button>
            </div>
        </Modal>
    );
}
