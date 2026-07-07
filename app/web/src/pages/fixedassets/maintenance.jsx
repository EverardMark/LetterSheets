import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";
import Modal from "../components/Modal";
import { api, Empty, peso, d10 } from "./shared";

const today = () => new Date().toISOString().slice(0, 10);

export default function Maintenance() {
    const [rows, setRows] = useState([]);
    const [assets, setAssets] = useState([]);
    const [modal, setModal] = useState(null);
    const [msg, setMsg] = useState(null);

    const flash = (text, err = false) => { setMsg({ text, err }); setTimeout(() => setMsg(null), 3000); };
    const load = useCallback(async () => {
        try { const d = await api("get_fa_maintenance"); setRows(Array.isArray(d) ? d : []); } catch { setRows([]); }
    }, []);
    const loadAssets = useCallback(async () => {
        try { const d = await api("get_fa_assets"); setAssets(Array.isArray(d) ? d : []); } catch {}
    }, []);
    useEffect(() => { load(); loadAssets(); }, [load, loadAssets]);

    async function save(f) {
        try {
            if (f.id) await api("update_fa_maintenance", f);
            else await api("create_fa_maintenance", f);
            setModal(null); flash("Maintenance saved"); load();
        } catch (e) { flash(e.message, true); }
    }
    async function remove(id) {
        try { await api("delete_fa_maintenance", { id }); setModal(null); flash("Deleted"); load(); }
        catch (e) { flash(e.message, true); }
    }

    return (<>
        {msg && <div className={`fa-flash ${msg.err ? "fa-flash-err" : ""}`}>{msg.text}</div>}
        <div className="fa-bar">
            <div className="fa-bar-l"><span style={{ fontSize: 13, color: "#888" }}>{rows.length} record{rows.length !== 1 ? "s" : ""}</span></div>
            <button className="fa-btn-p" disabled={assets.length === 0} onClick={() => setModal({ m: { service_date: today(), maintenance_type: "service" } })}><I name="scroll" size={13} /> Log Maintenance</button>
        </div>
        {rows.length === 0 ? (
            <Empty icon="scroll" title="No maintenance records" desc="Log servicing and repairs against your assets." action={assets.length ? "Log maintenance" : null} onAction={() => setModal({ m: { service_date: today(), maintenance_type: "service" } })} />
        ) : (
            <div className="fa-tblwrap fa-tbl-click">
                <table className="fa-tbl">
                    <thead><tr><th>Asset</th><th>Date</th><th>Type</th><th className="fa-tbl-r">Cost</th><th>Vendor</th><th>Next Service</th></tr></thead>
                    <tbody>
                        {rows.map(m => (
                            <tr key={m.id} onClick={() => setModal({ m })}>
                                <td><div className="fa-tbl-nm">{m.asset_name || "—"}</div><div className="fa-sku">{m.asset_number}</div></td>
                                <td className="fa-sku">{d10(m.service_date)}</td>
                                <td>{m.maintenance_type}</td>
                                <td className="fa-tbl-r fa-tbl-mono">{peso(m.cost)}</td>
                                <td>{m.vendor || "—"}</td>
                                <td className="fa-sku">{m.next_service_date ? d10(m.next_service_date) : "—"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
        {modal && <MaintModal data={modal} assets={assets} onClose={() => setModal(null)} onSave={save} onDelete={remove} />}
    </>);
}

function MaintModal({ data, assets, onClose, onSave, onDelete }) {
    const [f, setF] = useState({ maintenance_type: "service", ...data.m });
    const set = (k, v) => setF(p => ({ ...p, [k]: v }));
    const isEdit = !!f.id;
    const submit = () => {
        if (!isEdit && !f.asset_id) return;
        onSave({
            id: f.id, asset_id: f.asset_id, service_date: f.service_date, maintenance_type: f.maintenance_type || "service",
            description: f.description || "", cost: Number(f.cost) || 0, vendor: f.vendor || "", performed_by: f.performed_by || "",
            next_service_date: f.next_service_date || "",
        });
    };
    return (
        <Modal title={isEdit ? "Edit Maintenance" : "Log Maintenance"} onClose={onClose}>
            <div className="fa-modal-scroll">
                <div className="fa-f">
                    {!isEdit && (
                        <div className="fa-field fa-f-full">
                            <label className="fa-label">Asset <span className="fa-req" /></label>
                            <select className="fa-fsel" value={f.asset_id || ""} onChange={e => set("asset_id", e.target.value)}>
                                <option value="">— Select asset —</option>
                                {assets.map(a => <option key={a.id} value={a.id}>{a.asset_number} · {a.name}</option>)}
                            </select>
                        </div>
                    )}
                    <div className="fa-field"><label className="fa-label">Service Date</label><input className="fa-input" type="date" value={d10(f.service_date)} onChange={e => set("service_date", e.target.value)} /></div>
                    <div className="fa-field"><label className="fa-label">Type</label><input className="fa-input" value={f.maintenance_type || ""} onChange={e => set("maintenance_type", e.target.value)} placeholder="service / repair / inspection" /></div>
                    <div className="fa-field"><label className="fa-label">Cost (₱)</label><input className="fa-input" type="number" min="0" step="0.01" value={f.cost ?? ""} onChange={e => set("cost", e.target.value)} /></div>
                    <div className="fa-field"><label className="fa-label">Vendor</label><input className="fa-input" value={f.vendor || ""} onChange={e => set("vendor", e.target.value)} /></div>
                    <div className="fa-field"><label className="fa-label">Performed By</label><input className="fa-input" value={f.performed_by || ""} onChange={e => set("performed_by", e.target.value)} /></div>
                    <div className="fa-field"><label className="fa-label">Next Service</label><input className="fa-input" type="date" value={d10(f.next_service_date)} onChange={e => set("next_service_date", e.target.value)} /></div>
                    <div className="fa-field fa-f-full"><label className="fa-label">Description</label><input className="fa-input" value={f.description || ""} onChange={e => set("description", e.target.value)} /></div>
                </div>
            </div>
            <div className="fa-modal-foot">
                {isEdit && <button className="fa-btn-danger" onClick={() => onDelete(f.id)}>Delete</button>}
                <button className="fa-btn-s" onClick={onClose}>Cancel</button>
                <button className="fa-btn-p" onClick={submit}>{isEdit ? "Save" : "Log"}</button>
            </div>
        </Modal>
    );
}
