import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";
import Modal from "../components/Modal";
import { Term, SimpleHint } from "../components/simplemode";
import { api, Empty, initials, avColor } from "./shared";

export default function Suppliers() {
    const [rows, setRows] = useState([]);
    const [search, setSearch] = useState("");
    const [modal, setModal] = useState(null);
    const [msg, setMsg] = useState(null);

    const flash = (text, err = false) => { setMsg({ text, err }); setTimeout(() => setMsg(null), 3000); };
    const load = useCallback(async () => {
        try { const d = await api("get_inv_suppliers"); setRows(Array.isArray(d) ? d : []); } catch { setRows([]); }
    }, []);
    useEffect(() => { load(); }, [load]);

    const filtered = rows.filter(s => !search || (s.name || "").toLowerCase().includes(search.toLowerCase()) || (s.contact_person || "").toLowerCase().includes(search.toLowerCase()));

    async function save(form) {
        try {
            if (form.id) await api("update_inv_supplier", { ...form, is_active: form.is_active !== false });
            else await api("create_inv_supplier", form);
            setModal(null); flash("Supplier saved"); load();
        } catch (e) { flash(e.message, true); }
    }
    async function remove(id) {
        try { await api("delete_inv_supplier", { id }); setModal(null); flash("Supplier deleted"); load(); }
        catch (e) { flash(e.message, true); }
    }

    return (<>
        {msg && <div className={`iv-flash ${msg.err ? "iv-flash-err" : ""}`}>{msg.text}</div>}
        <SimpleHint icon="bulb">The businesses you buy stock from — keep their contact details here.</SimpleHint>
        <div className="iv-bar">
            <div className="iv-search"><I name="search" size={14} /><input placeholder="Search suppliers..." value={search} onChange={e => setSearch(e.target.value)} /></div>
            <button className="iv-btn-p" onClick={() => setModal({ cat: { is_active: true } })}><I name="truck" size={13} /> Add Supplier</button>
        </div>

        {filtered.length === 0 ? (
            <Empty icon="truck" title={search ? "No matches" : "No suppliers"} desc={search ? "Try a different search." : "Keep a directory of who you buy stock from."} action={search ? null : "Add supplier"} onAction={() => setModal({ cat: { is_active: true } })} />
        ) : (
            <div className="iv-tblwrap iv-tbl-click">
                <table className="iv-tbl">
                    <thead><tr><th>Supplier</th><th>Contact</th><th>Phone</th><th className="iv-tbl-r">Products</th><th>Status</th></tr></thead>
                    <tbody>
                        {filtered.map(s => (
                            <tr key={s.id} onClick={() => setModal({ cat: s })}>
                                <td><div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <div className="iv-avatar" style={{ background: avColor(s.name) + "20", color: avColor(s.name) }}>{initials(s.name)}</div>
                                    <div><div className="iv-tbl-nm">{s.name}</div>{s.email ? <div className="iv-sku">{s.email}</div> : null}</div>
                                </div></td>
                                <td>{s.contact_person || "—"}</td>
                                <td>{s.phone || "—"}</td>
                                <td className="iv-tbl-r"><span className="iv-badge iv-b-gray">{s.product_count || 0}</span></td>
                                <td><span className={`iv-badge ${s.is_active ? "iv-b-green" : "iv-b-gray"}`}>{s.is_active ? "Active" : "Inactive"}</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}

        {modal && <SupModal data={modal} onClose={() => setModal(null)} onSave={save} onDelete={remove} />}
    </>);
}

function SupModal({ data, onClose, onSave, onDelete }) {
    const [form, setForm] = useState({ is_active: true, ...data.cat });
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const isEdit = !!form.id;
    return (
        <Modal title={isEdit ? "Edit Supplier" : "Add Supplier"} subtitle={<Term simple="Who you buy stock from" advanced="Inventory supplier details"/>} onClose={onClose}>
            <div className="iv-modal-scroll">
                <div className="iv-f">
                    <div className="iv-field iv-f-full">
                        <label className="iv-label">Supplier Name <span className="iv-req" /></label>
                        <input className="iv-input" value={form.name || ""} onChange={e => set("name", e.target.value)} placeholder="e.g. Acme Trading Corp." />
                    </div>
                    <div className="iv-field">
                        <label className="iv-label">Contact Person</label>
                        <input className="iv-input" value={form.contact_person || ""} onChange={e => set("contact_person", e.target.value)} />
                    </div>
                    <div className="iv-field">
                        <label className="iv-label">Phone</label>
                        <input className="iv-input" value={form.phone || ""} onChange={e => set("phone", e.target.value)} />
                    </div>
                    <div className="iv-field iv-f-full">
                        <label className="iv-label">Email</label>
                        <input className="iv-input" value={form.email || ""} onChange={e => set("email", e.target.value)} placeholder="orders@supplier.com" />
                    </div>
                    <div className="iv-field iv-f-full">
                        <label className="iv-label">Address</label>
                        <input className="iv-input" value={form.address || ""} onChange={e => set("address", e.target.value)} />
                    </div>
                    <div className="iv-field iv-f-full">
                        <label className="iv-label">Notes</label>
                        <textarea className="iv-textarea" value={form.notes || ""} onChange={e => set("notes", e.target.value)} />
                    </div>
                    {isEdit && (
                        <div className="iv-field iv-f-full">
                            <label className="iv-label">Status</label>
                            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                                <span className="iv-switch"><input type="checkbox" checked={form.is_active !== false} onChange={e => set("is_active", e.target.checked)} /><span className="iv-slider" /></span>
                                <span style={{ fontSize: 13, color: "#555" }}>{form.is_active !== false ? "Active" : "Inactive"}</span>
                            </label>
                        </div>
                    )}
                </div>
            </div>
            <div className="iv-modal-foot">
                {isEdit && <button className="iv-btn-danger" onClick={() => onDelete(form.id)}>Delete</button>}
                <button className="iv-btn-s" onClick={onClose}>Cancel</button>
                <button className="iv-btn-p" onClick={() => form.name?.trim() && onSave(form)}>{isEdit ? "Save Changes" : "Add Supplier"}</button>
            </div>
        </Modal>
    );
}
