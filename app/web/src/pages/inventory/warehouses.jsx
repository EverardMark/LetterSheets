import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";
import Modal from "../components/Modal";
import { Term, SimpleHint } from "../components/simplemode";
import { api, Empty, peso, num } from "./shared";

export default function Warehouses() {
    const [rows, setRows] = useState([]);
    const [modal, setModal] = useState(null);
    const [msg, setMsg] = useState(null);

    const flash = (text, err = false) => { setMsg({ text, err }); setTimeout(() => setMsg(null), 3000); };
    const load = useCallback(async () => {
        try { const d = await api("get_inv_warehouses"); setRows(Array.isArray(d) ? d : []); } catch { setRows([]); }
    }, []);
    useEffect(() => { load(); }, [load]);

    async function save(form) {
        try {
            if (form.id) await api("update_inv_warehouse", { ...form, is_default: !!form.is_default, is_active: form.is_active !== false });
            else await api("create_inv_warehouse", { name: form.name, code: form.code, location: form.location, is_default: !!form.is_default });
            setModal(null); flash("Warehouse saved"); load();
        } catch (e) { flash(e.message, true); }
    }
    async function remove(id) {
        try { await api("delete_inv_warehouse", { id }); setModal(null); flash("Warehouse deleted"); load(); }
        catch (e) { flash(e.message, true); }
    }

    return (<>
        {msg && <div className={`iv-flash ${msg.err ? "iv-flash-err" : ""}`}>{msg.text}</div>}
        <SimpleHint icon="bulb">The places you keep stock — a shop, stockroom or shelf. Every item lives in one.</SimpleHint>
        <div className="iv-bar">
            <div className="iv-bar-l"><span style={{ fontSize: 13, color: "#888" }}>{rows.length} <Term simple={`storage location${rows.length !== 1 ? "s" : ""}`} advanced={`warehouse${rows.length !== 1 ? "s" : ""}`} /></span></div>
            <button className="iv-btn-p" onClick={() => setModal({ cat: { is_active: true } })}><I name="building" size={13} /> <Term simple="Add Storage Location" advanced="Add Warehouse"/></button>
        </div>

        {rows.length === 0 ? (
            <Empty icon="building" title={<Term simple="No storage locations" advanced="No warehouses"/>} desc={<Term simple="Add at least one place to keep stock — every item lives in a location." advanced="Add at least one warehouse — stock is always tracked per location."/>} action={<Term simple="Add storage location" advanced="Add warehouse"/>} onAction={() => setModal({ cat: { is_active: true } })} />
        ) : (
            <div className="iv-tblwrap iv-tbl-click">
                <table className="iv-tbl">
                    <thead><tr><th><Term simple="Storage Location" advanced="Warehouse"/></th><th>Code</th><th>Location</th><th className="iv-tbl-r">Units</th><th className="iv-tbl-r">Value</th><th>Status</th></tr></thead>
                    <tbody>
                        {rows.map(w => (
                            <tr key={w.id} onClick={() => setModal({ cat: w })}>
                                <td><span className="iv-tbl-nm">{w.name}</span>{w.is_default ? <span className="iv-badge iv-b-green" style={{ marginLeft: 8 }}>Default</span> : null}</td>
                                <td className="iv-sku">{w.code || "—"}</td>
                                <td>{w.location || "—"}</td>
                                <td className="iv-tbl-r iv-tbl-mono">{num(w.total_units)}</td>
                                <td className="iv-tbl-r iv-tbl-mono" style={{ fontWeight: 600, color: "#222" }}>{peso(w.stock_value)}</td>
                                <td><span className={`iv-badge ${w.is_active ? "iv-b-green" : "iv-b-gray"}`}>{w.is_active ? "Active" : "Inactive"}</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}

        {modal && <WhModal data={modal} onClose={() => setModal(null)} onSave={save} onDelete={remove} />}
    </>);
}

function WhModal({ data, onClose, onSave, onDelete }) {
    const [form, setForm] = useState({ is_active: true, ...data.cat });
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const isEdit = !!form.id;
    return (
        <Modal title={isEdit ? <Term simple="Edit Storage Location" advanced="Edit Warehouse"/> : <Term simple="Add Storage Location" advanced="Add Warehouse"/>} subtitle="A storage location for stock" onClose={onClose}>
            <div className="iv-modal-scroll">
                <div className="iv-f">
                    <div className="iv-field">
                        <label className="iv-label">Name <span className="iv-req" /></label>
                        <input className="iv-input" value={form.name || ""} onChange={e => set("name", e.target.value)} placeholder="Main Warehouse" />
                    </div>
                    <div className="iv-field">
                        <label className="iv-label">Code</label>
                        <input className="iv-input" value={form.code || ""} onChange={e => set("code", e.target.value)} placeholder="WH-01" />
                    </div>
                    <div className="iv-field iv-f-full">
                        <label className="iv-label">Location / Address</label>
                        <input className="iv-input" value={form.location || ""} onChange={e => set("location", e.target.value)} />
                    </div>
                    <div className="iv-field iv-f-full">
                        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                            <span className="iv-switch"><input type="checkbox" checked={!!form.is_default} onChange={e => set("is_default", e.target.checked)} /><span className="iv-slider" /></span>
                            <span style={{ fontSize: 13, color: "#555" }}><Term simple="Use this location by default for new stock" advanced="Default warehouse for new stock"/></span>
                        </label>
                    </div>
                    {isEdit && (
                        <div className="iv-field iv-f-full">
                            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                                <span className="iv-switch"><input type="checkbox" checked={form.is_active !== false} onChange={e => set("is_active", e.target.checked)} /><span className="iv-slider" /></span>
                                <span style={{ fontSize: 13, color: "#555" }}>Active</span>
                            </label>
                        </div>
                    )}
                </div>
            </div>
            <div className="iv-modal-foot">
                {isEdit && <button className="iv-btn-danger" onClick={() => onDelete(form.id)}>Delete</button>}
                <button className="iv-btn-s" onClick={onClose}>Cancel</button>
                <button className="iv-btn-p" onClick={() => form.name?.trim() && onSave(form)}>{isEdit ? "Save Changes" : "Add Warehouse"}</button>
            </div>
        </Modal>
    );
}
