import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";
import Modal from "../components/Modal";
import { api, Empty, METHODS } from "./shared";
import { Term, AdvancedOnly, SimpleHint } from "../components/simplemode";

export default function Categories() {
    const [rows, setRows] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [modal, setModal] = useState(null);
    const [msg, setMsg] = useState(null);

    const flash = (text, err = false) => { setMsg({ text, err }); setTimeout(() => setMsg(null), 3000); };
    const load = useCallback(async () => {
        try { const d = await api("get_fa_categories"); setRows(Array.isArray(d) ? d : []); } catch { setRows([]); }
        try { const d = await api("get_accounts"); setAccounts(d?.accounts || []); } catch {}
    }, []);
    useEffect(() => { load(); }, [load]);

    async function save(form) {
        const body = {
            name: form.name, description: form.description,
            asset_account_id: form.asset_account_id || "", accum_dep_account_id: form.accum_dep_account_id || "",
            dep_expense_account_id: form.dep_expense_account_id || "",
            default_life_months: Number(form.default_life_months) || 0,
            default_method: form.default_method || "straight_line",
            default_salvage_pct: Number(form.default_salvage_pct) || 0,
        };
        try {
            if (form.id) await api("update_fa_category", { id: form.id, ...body, is_active: form.is_active !== false });
            else await api("create_fa_category", body);
            setModal(null); flash("Category saved"); load();
        } catch (e) { flash(e.message, true); }
    }
    async function remove(id) {
        try { await api("delete_fa_category", { id }); setModal(null); flash("Category deleted"); load(); }
        catch (e) { flash(e.message, true); }
    }

    return (<>
        {msg && <div className={`fa-flash ${msg.err ? "fa-flash-err" : ""}`}>{msg.text}</div>}
        <SimpleHint icon="bulb">Group similar assets together — like Vehicles or Computers — so they share the same value-loss settings.</SimpleHint>
        <div className="fa-bar">
            <div className="fa-bar-l"><span style={{ fontSize: 13, color: "#888" }}>{rows.length} categor{rows.length !== 1 ? "ies" : "y"}</span></div>
            <button className="fa-btn-p" onClick={() => setModal({ cat: { default_method: "straight_line", is_active: true } })}><I name="tags" size={13} /> Add Category</button>
        </div>

        {rows.length === 0 ? (
            <Empty icon="tags" title="No categories" desc={<Term simple="Groups let similar assets share the same value-loss settings." advanced="Categories carry default depreciation settings and GL accounts for their assets." />} action="Add category" onAction={() => setModal({ cat: { default_method: "straight_line", is_active: true } })} />
        ) : (
            <div className="fa-tblwrap fa-tbl-click">
                <table className="fa-tbl">
                    <thead><tr><th>Category</th><th><Term simple="Value-loss method" advanced="Default Method" /></th><th className="fa-tbl-r"><Term simple="Lasts (mo)" advanced="Life (mo)" /></th><th className="fa-tbl-r"><Term simple="Leftover %" advanced="Salvage %" /></th><th className="fa-tbl-r">Assets</th></tr></thead>
                    <tbody>
                        {rows.map(c => (
                            <tr key={c.id} onClick={() => setModal({ cat: c })}>
                                <td><span className="fa-tbl-nm">{c.name}</span>{c.description ? <div className="fa-sku">{c.description}</div> : null}</td>
                                <td>{METHODS.find(m => m.value === c.default_method)?.label || c.default_method}</td>
                                <td className="fa-tbl-r fa-tbl-mono">{c.default_life_months || "—"}</td>
                                <td className="fa-tbl-r fa-tbl-mono">{c.default_salvage_pct ? c.default_salvage_pct + "%" : "—"}</td>
                                <td className="fa-tbl-r"><span className="fa-badge fa-b-gray">{c.asset_count || 0}</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}

        {modal && <CatModal data={modal} accounts={accounts} onClose={() => setModal(null)} onSave={save} onDelete={remove} />}
    </>);
}

function CatModal({ data, accounts, onClose, onSave, onDelete }) {
    const [form, setForm] = useState({ default_method: "straight_line", is_active: true, ...data.cat });
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const isEdit = !!form.id;
    const assetAccts = accounts.filter(a => a.account_type === "Asset");
    const expenseAccts = accounts.filter(a => a.account_type === "Expense");

    const AcctSelect = ({ k, label, opts }) => (
        <div className="fa-field">
            <label className="fa-label">{label}</label>
            <select className="fa-fsel" value={form[k] || ""} onChange={e => set(k, e.target.value)}>
                <option value="">— None —</option>
                {opts.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
            </select>
        </div>
    );

    return (
        <Modal title={isEdit ? "Edit Category" : "Add Category"} subtitle={<Term simple="Default value-loss settings for this group" advanced="Default depreciation profile + GL mapping" />} onClose={onClose}>
            <div className="fa-modal-scroll">
                <div className="fa-f">
                    <div className="fa-field fa-f-full">
                        <label className="fa-label">Name <span className="fa-req" /></label>
                        <input className="fa-input" value={form.name || ""} onChange={e => set("name", e.target.value)} placeholder="e.g. Machinery, Vehicles, IT Equipment" />
                    </div>
                    <div className="fa-field fa-f-full">
                        <label className="fa-label">Description</label>
                        <input className="fa-input" value={form.description || ""} onChange={e => set("description", e.target.value)} />
                    </div>
                    <div className="fa-field">
                        <label className="fa-label"><Term simple="Value-loss method" advanced="Default Method" /></label>
                        <select className="fa-fsel" value={form.default_method || "straight_line"} onChange={e => set("default_method", e.target.value)}>
                            {METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                    </div>
                    <div className="fa-field">
                        <label className="fa-label"><Term simple="How long it lasts (months)" advanced="Default Life (months)" /></label>
                        <input className="fa-input" type="number" min="0" value={form.default_life_months ?? ""} onChange={e => set("default_life_months", e.target.value)} placeholder="e.g. 60" />
                    </div>
                    <div className="fa-field">
                        <label className="fa-label"><Term simple="Leftover value %" advanced="Default Salvage %" /></label>
                        <input className="fa-input" type="number" min="0" max="100" step="0.01" value={form.default_salvage_pct ?? ""} onChange={e => set("default_salvage_pct", e.target.value)} placeholder="e.g. 10" />
                    </div>
                    <AdvancedOnly>
                        <div className="fa-field" />
                        <AcctSelect k="asset_account_id" label="Asset Account" opts={assetAccts} />
                        <AcctSelect k="accum_dep_account_id" label="Accum. Depreciation" opts={assetAccts} />
                        <AcctSelect k="dep_expense_account_id" label="Depreciation Expense" opts={expenseAccts} />
                    </AdvancedOnly>
                    {isEdit && (
                        <div className="fa-field">
                            <label className="fa-label">Status</label>
                            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                                <span className="fa-switch"><input type="checkbox" checked={form.is_active !== false} onChange={e => set("is_active", e.target.checked)} /><span className="fa-slider" /></span>
                                <span style={{ fontSize: 13, color: "#555" }}>{form.is_active !== false ? "Active" : "Inactive"}</span>
                            </label>
                        </div>
                    )}
                </div>
                <AdvancedOnly>
                    <div className="fa-hint" style={{ marginTop: 10 }}>Assets inherit these accounts unless overridden per-asset; company Settings provide the final fallback.</div>
                </AdvancedOnly>
            </div>
            <div className="fa-modal-foot">
                {isEdit && <button className="fa-btn-danger" onClick={() => onDelete(form.id)}>Delete</button>}
                <button className="fa-btn-s" onClick={onClose}>Cancel</button>
                <button className="fa-btn-p" onClick={() => form.name?.trim() && onSave(form)}>{isEdit ? "Save Changes" : "Add Category"}</button>
            </div>
        </Modal>
    );
}
