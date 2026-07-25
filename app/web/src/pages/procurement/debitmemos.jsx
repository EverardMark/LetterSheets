import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";
import Modal from "../components/Modal";
import { api, Empty, peso, num, d10 } from "./shared";
import { Term, SimpleHint } from "../components/simplemode";
import { useIsSimple } from "../../utils/uimode";

const DM_BADGE = { Draft: "pr-b-gray", Open: "pr-b-blue", Applied: "pr-b-green", Refunded: "pr-b-purple", Voided: "pr-b-red" };

export default function DebitMemos() {
    const [rows, setRows] = useState([]);
    const [orders, setOrders] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [status, setStatus] = useState("");
    const [modal, setModal] = useState(null);
    const [msg, setMsg] = useState(null);

    const flash = (text, err = false) => { setMsg({ text, err }); setTimeout(() => setMsg(null), 4500); };
    const load = useCallback(async () => {
        try { const d = await api("get_debit_memos", { status }); setRows(Array.isArray(d) ? d : []); } catch { setRows([]); }
    }, [status]);
    const loadRefs = useCallback(async () => {
        try { const d = await api("get_pur_orders"); setOrders((Array.isArray(d) ? d : []).filter(o => ["Billed", "Received", "PartiallyReceived", "Closed"].includes(o.status))); } catch {}
        try { const d = await api("get_accounts"); setAccounts(d?.accounts || []); } catch {}
    }, []);
    useEffect(() => { load(); }, [load]);
    useEffect(() => { loadRefs(); }, [loadRefs]);

    return (<>
        {msg && <div className={`pr-flash ${msg.err ? "pr-flash-err" : ""}`}>{msg.text}</div>}
        <SimpleHint icon="bulb">When you send goods back to a supplier, record the credit they owe you here.</SimpleHint>
        <div className="pr-bar">
            <div className="pr-bar-l">
                <select className="pr-sel" value={status} onChange={e => setStatus(e.target.value)}>
                    <option value="">All statuses</option>
                    {["Draft", "Open", "Applied", "Refunded", "Voided"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>
            <button className="pr-btn-p" disabled={orders.length === 0} onClick={() => setModal({ id: null })}><I name="file" size={13} /> <Term simple="New Supplier Credit" advanced="New Debit Memo" /></button>
        </div>
        {orders.length === 0 && <div className="pr-flash pr-flash-err"><Term simple="Supplier credits are raised against a billed purchase order — none available yet." advanced="Debit memos are raised against a billed purchase order — none available yet." /></div>}

        {rows.length === 0 ? (
            <Empty icon="file" title={status ? <Term simple="No matching supplier credits" advanced="No matching debit memos" /> : <Term simple="No supplier credits" advanced="No debit memos" />} desc={<Term simple="Send goods back to a supplier and record the credit they owe you." advanced="Return goods to a vendor; ship stock back and reverse the payable & GR/IR." />} action={status || orders.length === 0 ? null : <Term simple="New supplier credit" advanced="New debit memo" />} onAction={() => setModal({ id: null })} />
        ) : (
            <div className="pr-tblwrap pr-tbl-click">
                <table className="pr-tbl">
                    <thead><tr><th><Term simple="Credit" advanced="Memo" /></th><th><Term simple="Supplier" advanced="Vendor" /></th><th>PO</th><th className="pr-tbl-r">Total</th><th className="pr-tbl-r">Open Debit</th><th>Status</th></tr></thead>
                    <tbody>
                        {rows.map(m => (
                            <tr key={m.id} onClick={() => setModal({ id: m.id })}>
                                <td className="pr-tbl-nm">DM-{String(m.memo_number).padStart(4, "0")}</td>
                                <td>{m.vendor_name || "—"}</td>
                                <td className="pr-sku">PO-{String(m.po_number).padStart(4, "0")}</td>
                                <td className="pr-tbl-r pr-tbl-mono">{peso(m.total_amount)}</td>
                                <td className="pr-tbl-r pr-tbl-mono">{m.balance_debit > 0 ? peso(m.balance_debit) : "—"}</td>
                                <td><span className={`pr-badge ${DM_BADGE[m.status] || "pr-b-gray"}`}>{m.status}</span></td>
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
    const [billId, setBillId] = useState("");
    const [bills, setBills] = useState([]);
    const [reason, setReason] = useState("");
    const [lines, setLines] = useState([]);
    const [refundOpen, setRefundOpen] = useState(false);
    const isNew = !id;

    const load = useCallback(async () => {
        if (isNew) { setM({ status: "Draft" }); return; }
        try { const d = await api("get_debit_memo", { id }); setM(d); } catch (e) { flash(e.message, true); }
    }, [id, isNew, flash]);
    useEffect(() => { load(); }, [load]);
    const simple = useIsSimple();

    const pickOrder = async (oid) => {
        setOrderId(oid); setBillId(""); setBills([]);
        if (!oid) { setLines([]); return; }
        const order = orders.find(o => o.id === oid);
        try {
            const cl = await api("get_dm_creditable", { order_id: oid });
            setLines((Array.isArray(cl) ? cl : []).map(l => ({ ...l, quantity: l.creditable_qty, take: true })));
        } catch (e) { flash(e.message, true); }
        try { const b = await api("get_bills", { vendor_id: order?.vendor_id || "" }); setBills((Array.isArray(b) ? b : []).filter(x => ["Open", "Partial"].includes(x.status))); } catch {}
    };

    if (!m) return <Modal title="Debit Memo" onClose={onClose}><div style={{ padding: 20, color: "#999" }}>Loading…</div></Modal>;

    const upd = (i, k, v) => setLines(ls => ls.map((l, j) => j === i ? { ...l, [k]: v } : l));
    const chosen = lines.filter(l => l.take && Number(l.quantity) > 0);
    const subtotal = chosen.reduce((s, l) => s + Number(l.quantity) * Number(l.unit_cost), 0);
    const tax = chosen.reduce((s, l) => s + Number(l.quantity) * Number(l.unit_cost) * Number(l.tax_rate || 0) / 100, 0);

    const create = async () => {
        if (!orderId) { flash("Pick a purchase order", true); return; }
        if (chosen.length === 0) { flash("Choose at least one line to return", true); return; }
        try {
            await api("create_debit_memo", {
                order_id: orderId, bill_id: billId, reason,
                items: chosen.map(l => ({ order_item_id: l.order_item_id, description: l.description || l.product_name, quantity: Number(l.quantity), unit_cost: Number(l.unit_cost || 0), tax_rate: Number(l.tax_rate || 0) })),
            });
            flash("Debit memo created (Draft)"); onClose();
        } catch (e) { flash(e.message, true); }
    };
    const act = async (action, extra, okMsg) => {
        try { const r = await api(action, { id, ...extra }); flash(okMsg || "Done"); if (r?.gl_posted === false) flash((okMsg || "Done") + " (GL not auto-posted)", true); load(); }
        catch (e) { flash(e.message, true); }
    };
    const post = async () => {
        try { const r = await api("post_debit_memo", { id }); flash(r?.gl_posted ? "Posted — payable & GR/IR reversed" : "Posted (GL not auto-posted)"); load(); }
        catch (e) { flash(e.message, true); }
    };
    const applyToBill = async () => {
        if (!m.bill_id) { flash("This memo has no linked bill to apply to", true); return; }
        try { await api("apply_debit_memo", { id, bill_id: m.bill_id, amount: m.balance_debit }); flash("Applied to bill"); load(); }
        catch (e) { flash(e.message, true); }
    };
    const cashAccts = accounts.filter(a => a.account_type === "Asset");

    if (isNew) {
        return (
            <Modal title={<Term simple="New Supplier Credit" advanced="New Debit Memo" />} subtitle={<Term simple="Send goods back to a supplier and get credit" advanced="Return goods against a billed PO" />} onClose={onClose}>
                <div className="pr-modal-scroll">
                    <div className="pr-f" style={{ marginBottom: 12 }}>
                        <div className="pr-field"><label className="pr-label">Purchase Order <span className="pr-req" /></label>
                            <select className="pr-fsel" value={orderId} onChange={e => pickOrder(e.target.value)}>
                                <option value="">— Select —</option>
                                {orders.map(o => <option key={o.id} value={o.id}>PO-{String(o.po_number).padStart(4, "0")} · {o.vendor_name}</option>)}
                            </select>
                        </div>
                        <div className="pr-field"><label className="pr-label">Credit against Bill</label>
                            <select className="pr-fsel" value={billId} onChange={e => setBillId(e.target.value)} disabled={bills.length === 0}>
                                <option value="">{simple ? "— None (open supplier credit) —" : "— None (open vendor credit) —"}</option>
                                {bills.map(b => <option key={b.id} value={b.id}>{b.bill_number} · bal {peso(b.balance_due)}</option>)}
                            </select>
                        </div>
                        <div className="pr-field pr-f-full"><label className="pr-label">Reason</label><input className="pr-input" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Defective units returned" /></div>
                    </div>
                    {orderId && (lines.length === 0 ? <div className="pr-hint">No returnable (billed, un-returned) lines on this order.</div> : (
                        <div className="pr-tblwrap">
                            <table className="pr-tbl">
                                <thead><tr><th style={{ width: 34 }}></th><th>Product</th><th className="pr-tbl-r">Max</th><th style={{ width: 80 }}>Return</th><th className="pr-tbl-r">Unit Cost</th><th className="pr-tbl-r">Debit</th></tr></thead>
                                <tbody>{lines.map((l, i) => (
                                    <tr key={l.order_item_id}>
                                        <td><input type="checkbox" checked={!!l.take} onChange={e => upd(i, "take", e.target.checked)} /></td>
                                        <td>{l.product_name || l.description}</td>
                                        <td className="pr-tbl-r pr-tbl-mono">{num(l.creditable_qty)}</td>
                                        <td><input className="pr-input" type="number" min="0" max={l.creditable_qty} step="0.01" value={l.quantity} disabled={!l.take} onChange={e => upd(i, "quantity", e.target.value)} /></td>
                                        <td className="pr-tbl-r pr-tbl-mono">{peso(l.unit_cost)}</td>
                                        <td className="pr-tbl-r pr-tbl-mono">{peso(Number(l.quantity) * Number(l.unit_cost) * (1 + Number(l.tax_rate || 0) / 100))}</td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                    ))}
                    {chosen.length > 0 && <div style={{ textAlign: "right", marginTop: 8, fontSize: 13 }}>
                        <div style={{ color: "#888" }}>Subtotal {peso(subtotal)} · Tax {peso(tax)}</div>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>Debit Total: {peso(subtotal + tax)}</div>
                    </div>}
                </div>
                <div className="pr-modal-foot"><button className="pr-btn-s" onClick={onClose}>Cancel</button><button className="pr-btn-p" onClick={create}>Create Draft</button></div>
            </Modal>
        );
    }

    return (
        <Modal title={`DM-${String(m.memo_number).padStart(4, "0")}`} subtitle={`${m.vendor_name || ""} · ${m.status}`} onClose={onClose}>
            <div className="pr-modal-scroll">
                <div className="pr-f" style={{ marginBottom: 10 }}>
                    <div className="pr-field"><label className="pr-label">PO</label><div className="pr-ro">PO-{String(m.po_number).padStart(4, "0")}</div></div>
                    <div className="pr-field"><label className="pr-label">Date</label><div className="pr-ro">{d10(m.memo_date)}</div></div>
                    <div className="pr-field"><label className="pr-label">Total</label><div className="pr-ro">{peso(m.total_amount)}</div></div>
                    <div className="pr-field"><label className="pr-label"><Term simple="Credit left" advanced="Open Debit" /></label><div className="pr-ro">{peso(m.balance_debit)}</div></div>
                </div>
                {m.reason && <div className="pr-hint" style={{ marginBottom: 8 }}>{m.reason}</div>}
                <div className="pr-tblwrap">
                    <table className="pr-tbl">
                        <thead><tr><th>Product</th><th className="pr-tbl-r">Qty</th><th className="pr-tbl-r">Unit Cost</th><th className="pr-tbl-r">Amount</th><th className="pr-tbl-r">Tax</th></tr></thead>
                        <tbody>{(m.items || []).map(it => (
                            <tr key={it.id}>
                                <td>{it.product_name || it.description}</td>
                                <td className="pr-tbl-r pr-tbl-mono">{num(it.quantity)}</td>
                                <td className="pr-tbl-r pr-tbl-mono">{peso(it.unit_cost)}</td>
                                <td className="pr-tbl-r pr-tbl-mono">{peso(it.amount)}</td>
                                <td className="pr-tbl-r pr-tbl-mono">{peso(it.tax_amount)}</td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
                {refundOpen && <div className="pr-f" style={{ marginTop: 12 }}>
                    <div className="pr-field pr-f-full"><label className="pr-label">Refund into Cash/Bank account</label>
                        <div style={{ display: "flex", gap: 8 }}>
                            <select className="pr-fsel" id="dm-refund-acct" defaultValue="">
                                <option value="">— Select —</option>
                                {cashAccts.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                            </select>
                            <button className="pr-btn-p" onClick={() => { const acct = document.getElementById("dm-refund-acct").value; if (!acct) { flash("Pick a cash account", true); return; } act("refund_debit_memo", { account_id: acct }, "Refunded"); }}>Refund {peso(m.balance_debit)}</button>
                        </div>
                    </div>
                </div>}
            </div>
            <div className="pr-modal-foot" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {m.status === "Draft" && <button className="pr-btn-danger" onClick={async () => { try { await api("delete_debit_memo", { id }); flash("Deleted"); onClose(); } catch (e) { flash(e.message, true); } }}>Delete</button>}
                    {m.status === "Draft" && <button className="pr-btn-p" onClick={post}><Term simple="Record" advanced="Post" /></button>}
                    {m.status === "Open" && m.bill_id && <button className="pr-btn-p" onClick={applyToBill}>Apply to Bill</button>}
                    {m.status === "Open" && m.balance_debit > 0 && <button className="pr-btn-s" onClick={() => setRefundOpen(v => !v)}>Refund…</button>}
                    {["Open", "Applied"].includes(m.status) && <button className="pr-btn-s" onClick={() => act("void_debit_memo", {}, "Voided")}>Void</button>}
                </div>
                <button className="pr-btn-s" onClick={onClose}>Close</button>
            </div>
        </Modal>
    );
}
