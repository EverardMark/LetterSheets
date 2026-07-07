import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";
import Modal from "../components/Modal";
import { api, Empty } from "./shared";

export default function Categories() {
    const [rows, setRows] = useState([]);
    const [search, setSearch] = useState("");
    const [modal, setModal] = useState(null); // {mode, cat}
    const [msg, setMsg] = useState(null);      // {text, err}

    const flash = (text, err = false) => { setMsg({ text, err }); setTimeout(() => setMsg(null), 3000); };

    const load = useCallback(async () => {
        try { const d = await api("get_inv_categories"); setRows(Array.isArray(d) ? d : []); } catch { setRows([]); }
    }, []);
    useEffect(() => { load(); }, [load]);

    const filtered = rows.filter(c => !search || (c.name || "").toLowerCase().includes(search.toLowerCase()));

    async function save(form) {
        try {
            if (form.id) await api("update_inv_category", { id: form.id, name: form.name, description: form.description, is_active: form.is_active !== false });
            else await api("create_inv_category", { name: form.name, description: form.description });
            setModal(null); flash("Category saved"); load();
        } catch (e) { flash(e.message, true); }
    }
    async function remove(id) {
        try { await api("delete_inv_category", { id }); setModal(null); flash("Category deleted"); load(); }
        catch (e) { flash(e.message, true); }
    }

    return (<>
        {msg && <div className={`iv-flash ${msg.err ? "iv-flash-err" : ""}`}>{msg.text}</div>}
        <div className="iv-bar">
            <div className="iv-search"><I name="search" size={14} /><input placeholder="Search categories..." value={search} onChange={e => setSearch(e.target.value)} /></div>
            <button className="iv-btn-p" onClick={() => setModal({ mode: "add", cat: { is_active: true } })}><I name="user" size={13} /> Add Category</button>
        </div>

        {filtered.length === 0 ? (
            <Empty icon="tags" title={search ? "No matches" : "No categories"} desc={search ? "Try a different search." : "Group products into categories for easier management."} action={search ? null : "Add category"} onAction={() => setModal({ mode: "add", cat: { is_active: true } })} />
        ) : (
            <div className="iv-tblwrap iv-tbl-click">
                <table className="iv-tbl">
                    <thead><tr><th>Category</th><th>Description</th><th className="iv-tbl-r">Products</th><th>Status</th></tr></thead>
                    <tbody>
                        {filtered.map(c => (
                            <tr key={c.id} onClick={() => setModal({ mode: "edit", cat: c })}>
                                <td><span className="iv-tbl-nm">{c.name}</span></td>
                                <td style={{ maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.description || "—"}</td>
                                <td className="iv-tbl-r"><span className="iv-badge iv-b-gray">{c.product_count || 0}</span></td>
                                <td><span className={`iv-badge ${c.is_active ? "iv-b-green" : "iv-b-gray"}`}>{c.is_active ? "Active" : "Inactive"}</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}

        {modal && <CatModal data={modal} onClose={() => setModal(null)} onSave={save} onDelete={remove} />}
    </>);
}

function CatModal({ data, onClose, onSave, onDelete }) {
    const [form, setForm] = useState({ is_active: true, ...data.cat });
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const isEdit = !!form.id;
    return (
        <Modal title={isEdit ? "Edit Category" : "Add Category"} subtitle="Organize products into groups" onClose={onClose}>
            <div className="iv-modal-scroll">
                <div className="iv-f">
                    <div className="iv-field iv-f-full">
                        <label className="iv-label">Name <span className="iv-req" /></label>
                        <input className="iv-input" value={form.name || ""} onChange={e => set("name", e.target.value)} placeholder="e.g. Electronics, Raw Materials" />
                    </div>
                    <div className="iv-field iv-f-full">
                        <label className="iv-label">Description</label>
                        <textarea className="iv-textarea" value={form.description || ""} onChange={e => set("description", e.target.value)} placeholder="What belongs in this category?" />
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
                <button className="iv-btn-p" onClick={() => form.name?.trim() && onSave(form)}>{isEdit ? "Save Changes" : "Add Category"}</button>
            </div>
        </Modal>
    );
}
