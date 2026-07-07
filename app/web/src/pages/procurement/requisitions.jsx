import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { I } from "../../layouts/ERPLayout";
import Modal from "../components/Modal";
import { api, Empty, peso, num, d10, today, REQ_BADGE, vendorName } from "./shared";

export default function Requisitions() {
    const nav = useNavigate();
    const [rows, setRows] = useState([]);
    const [products, setProducts] = useState([]);
    const [vendors, setVendors] = useState([]);
    const [status, setStatus] = useState("");
    const [modal, setModal] = useState(null);
    const [msg, setMsg] = useState(null);

    const flash = (text, err = false) => { setMsg({ text, err }); setTimeout(() => setMsg(null), 4000); };
    const load = useCallback(async () => {
        try { const d = await api("get_pur_requisitions", { status }); setRows(Array.isArray(d) ? d : []); } catch { setRows([]); }
    }, [status]);
    const loadRefs = useCallback(async () => {
        try { const d = await api("get_inv_products"); setProducts(Array.isArray(d) ? d : []); } catch {}
        try { const d = await api("get_vendors"); setVendors(Array.isArray(d) ? d : []); } catch {}
    }, []);
    useEffect(() => { load(); }, [load]);
    useEffect(() => { loadRefs(); }, [loadRefs]);

    return (<>
        {msg && <div className={`pr-flash ${msg.err ? "pr-flash-err" : ""}`}>{msg.text}</div>}
        <div className="pr-bar">
            <div className="pr-bar-l">
                <select className="pr-sel" value={status} onChange={e => setStatus(e.target.value)}>
                    <option value="">All statuses</option>
                    {["Draft", "Submitted", "Approved", "Converted", "Rejected"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>
            <button className="pr-btn-p" onClick={() => setModal({ id: null })}><I name="file" size={13} /> New Requisition</button>
        </div>

        {rows.length === 0 ? (
            <Empty icon="file" title={status ? "No matching requisitions" : "No requisitions"} desc={status ? "Try a different status." : "Raise an internal purchase request, get it approved, then convert to a PO."} action={status ? null : "New requisition"} onAction={() => setModal({ id: null })} />
        ) : (
            <div className="pr-tblwrap pr-tbl-click">
                <table className="pr-tbl">
                    <thead><tr><th>Requisition</th><th>Title</th><th>Needed By</th><th className="pr-tbl-r">Est. Total</th><th>Status</th></tr></thead>
                    <tbody>
                        {rows.map(q => (
                            <tr key={q.id} onClick={() => setModal({ id: q.id })}>
                                <td className="pr-tbl-nm">PR-{String(q.requisition_number).padStart(4, "0")}</td>
                                <td>{q.title || "—"}<div className="pr-sku">{q.department}</div></td>
                                <td className="pr-sku">{q.needed_by ? d10(q.needed_by) : "—"}</td>
                                <td className="pr-tbl-r pr-tbl-mono">{peso(q.estimated_total)}</td>
                                <td><span className={`pr-badge ${REQ_BADGE[q.status] || "pr-b-gray"}`}>{q.status}</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
        {modal && <ReqModal id={modal.id} products={products} vendors={vendors} nav={nav} onClose={() => { setModal(null); load(); }} flash={flash} />}
    </>);
}

function ReqModal({ id, products, vendors, nav, onClose, flash }) {
    const [q, setQ] = useState(null);
    const [f, setF] = useState({ title: "", department: "", needed_by: "", notes: "" });
    const [lines, setLines] = useState([]);
    const [vendorId, setVendorId] = useState("");
    const isNew = !id;

    const load = useCallback(async () => {
        if (isNew) { setQ({ status: "Draft" }); return; }
        try {
            const d = await api("get_pur_requisition", { id });
            setQ(d);
            setF({ title: d.title, department: d.department, needed_by: d.needed_by, notes: d.notes });
            setLines((d.items || []).map(it => ({ product_id: it.product_id, description: it.description, quantity: it.quantity, estimated_price: it.estimated_price })));
        } catch (e) { flash(e.message, true); }
    }, [id, isNew, flash]);
    useEffect(() => { load(); }, [load]);

    if (!q) return <Modal title="Requisition" onClose={onClose}><div style={{ padding: 20, color: "#999" }}>Loading…</div></Modal>;

    const editable = isNew || q.status === "Draft";
    const set = (k, v) => setF(p => ({ ...p, [k]: v }));
    const upd = (i, k, v) => setLines(ls => ls.map((l, j) => j === i ? { ...l, [k]: v } : l));
    const pick = (i, pid) => { const p = products.find(x => x.id === pid); setLines(ls => ls.map((l, j) => j === i ? { ...l, product_id: pid, description: l.description || (p ? p.name : ""), estimated_price: l.estimated_price || (p ? p.cost_price : 0) } : l)); };
    const addLine = () => setLines(ls => [...ls, { product_id: "", description: "", quantity: 1, estimated_price: 0 }]);
    const delLine = (i) => setLines(ls => ls.filter((_, j) => j !== i));
    const estTotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.estimated_price) || 0), 0);
    const body = () => ({ ...f, items: lines.map(l => ({ ...l, quantity: Number(l.quantity) || 0, estimated_price: Number(l.estimated_price) || 0 })) });

    const save = async () => {
        if (lines.length === 0) { flash("Add at least one line", true); return; }
        try {
            if (isNew) await api("create_pur_requisition", body());
            else await api("update_pur_requisition", { id, ...body() });
            flash("Requisition saved"); onClose();
        } catch (e) { flash(e.message, true); }
    };
    const act = async (action, extra, okMsg) => { try { await api(action, { id, ...extra }); flash(okMsg); load(); } catch (e) { flash(e.message, true); } };
    const del = async () => { try { await api("delete_pur_requisition", { id }); onClose(); } catch (e) { flash(e.message, true); } };
    const convert = async () => {
        if (!vendorId) { flash("Choose a vendor to convert", true); return; }
        try { const r = await api("convert_pur_requisition", { id, vendor_id: vendorId }); flash(`Converted to PO-${String(r.po_number).padStart(4, "0")}`); onClose(); nav("/procurement/orders"); }
        catch (e) { flash(e.message, true); }
    };

    return (
        <Modal title={isNew ? "New Requisition" : `PR-${String(q.requisition_number).padStart(4, "0")}`} subtitle={isNew ? "Purchase request" : q.status} onClose={onClose}>
            <div className="pr-modal-scroll">
                <div className="pr-f" style={{ marginBottom: 14 }}>
                    <div className="pr-field"><label className="pr-label">Title</label><input className="pr-input" disabled={!editable} value={f.title || ""} onChange={e => set("title", e.target.value)} /></div>
                    <div className="pr-field"><label className="pr-label">Department</label><input className="pr-input" disabled={!editable} value={f.department || ""} onChange={e => set("department", e.target.value)} /></div>
                    <div className="pr-field"><label className="pr-label">Needed By</label><input className="pr-input" type="date" disabled={!editable} value={d10(f.needed_by)} onChange={e => set("needed_by", e.target.value)} /></div>
                    <div className="pr-field pr-f-full"><label className="pr-label">Notes</label><input className="pr-input" disabled={!editable} value={f.notes || ""} onChange={e => set("notes", e.target.value)} /></div>
                </div>

                {editable ? (
                    <div>
                        <div className="pr-tblwrap">
                            <table className="pr-tbl">
                                <thead><tr><th style={{ minWidth: 180 }}>Item</th><th style={{ width: 80 }}>Qty</th><th style={{ width: 110 }}>Est. Price</th><th className="pr-tbl-r">Total</th><th style={{ width: 30 }}></th></tr></thead>
                                <tbody>
                                    {lines.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", color: "#aaa", padding: 16 }}>No lines yet</td></tr>}
                                    {lines.map((l, i) => (
                                        <tr key={i}>
                                            <td>
                                                <select className="pr-fsel" style={{ width: "100%" }} value={l.product_id || ""} onChange={e => pick(i, e.target.value)}>
                                                    <option value="">— Product / free text —</option>
                                                    {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                                                </select>
                                                {!l.product_id && <input className="pr-input" style={{ marginTop: 4 }} placeholder="Description" value={l.description || ""} onChange={e => upd(i, "description", e.target.value)} />}
                                            </td>
                                            <td><input className="pr-input" type="number" min="0" step="0.01" value={l.quantity} onChange={e => upd(i, "quantity", e.target.value)} /></td>
                                            <td><input className="pr-input" type="number" min="0" step="0.01" value={l.estimated_price} onChange={e => upd(i, "estimated_price", e.target.value)} /></td>
                                            <td className="pr-tbl-r pr-tbl-mono">{peso((Number(l.quantity) || 0) * (Number(l.estimated_price) || 0))}</td>
                                            <td className="pr-tbl-r"><button className="pr-btn-ghost" onClick={() => delLine(i)}>✕</button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                            <button className="pr-btn-s" onClick={addLine}>+ Add line</button>
                            <div style={{ fontSize: 15, fontWeight: 700, color: "#222" }}>Est. Total: {peso(estTotal)}</div>
                        </div>
                    </div>
                ) : (
                    <div className="pr-tblwrap">
                        <table className="pr-tbl"><thead><tr><th>Item</th><th className="pr-tbl-r">Qty</th><th className="pr-tbl-r">Est. Price</th><th className="pr-tbl-r">Total</th></tr></thead>
                            <tbody>{(q.items || []).map(it => <tr key={it.id}><td>{it.product_name || it.description}</td><td className="pr-tbl-r pr-tbl-mono">{num(it.quantity)}</td><td className="pr-tbl-r pr-tbl-mono">{peso(it.estimated_price)}</td><td className="pr-tbl-r pr-tbl-mono">{peso(it.line_total)}</td></tr>)}</tbody>
                        </table>
                    </div>
                )}

                {q.status === "Rejected" && q.reject_reason && <div className="pr-flash pr-flash-err" style={{ marginTop: 10 }}>Rejected: {q.reject_reason}</div>}

                {q.status === "Approved" && (
                    <div className="pr-f" style={{ marginTop: 14 }}>
                        <div className="pr-field pr-f-full"><label className="pr-label">Convert to PO — Vendor <span className="pr-req" /></label>
                            <select className="pr-fsel" value={vendorId} onChange={e => setVendorId(e.target.value)}>
                                <option value="">— Select vendor —</option>
                                {vendors.map(v => <option key={v.id} value={v.id}>{vendorName(v)}</option>)}
                            </select>
                        </div>
                    </div>
                )}
            </div>
            <div className="pr-modal-foot" style={{ justifyContent: "space-between" }}>
                <div style={{ display: "flex", gap: 8 }}>
                    {!isNew && ["Draft", "Submitted", "Rejected"].includes(q.status) && <button className="pr-btn-danger" onClick={del}>Delete</button>}
                    {q.status === "Draft" && !isNew && <button className="pr-btn-s" onClick={() => act("submit_pur_requisition", {}, "Submitted for approval")}>Submit</button>}
                    {q.status === "Submitted" && <><button className="pr-btn-s" onClick={() => act("approve_pur_requisition", {}, "Approved")}>Approve</button><button className="pr-btn-s" onClick={() => act("reject_pur_requisition", { reason: "Rejected" }, "Rejected")}>Reject</button></>}
                    {q.status === "Approved" && <button className="pr-btn-p" onClick={convert}><I name="cart" size={12} /> Convert to PO</button>}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button className="pr-btn-s" onClick={onClose}>Close</button>
                    {editable && <button className="pr-btn-p" onClick={save}>{isNew ? "Create" : "Save"}</button>}
                </div>
            </div>
        </Modal>
    );
}
