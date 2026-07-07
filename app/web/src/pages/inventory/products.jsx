import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";
import Modal from "../components/Modal";
import { api, Empty, peso, num, stockStatus } from "./shared";

const UNITS = ["pcs", "box", "kg", "g", "L", "mL", "m", "pack", "set", "unit"];

export default function Products() {
    const [rows, setRows] = useState([]);
    const [categories, setCategories] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [search, setSearch] = useState("");
    const [catFilter, setCatFilter] = useState("");
    const [modal, setModal] = useState(null);
    const [msg, setMsg] = useState(null);

    const flash = (text, err = false) => { setMsg({ text, err }); setTimeout(() => setMsg(null), 3000); };

    const load = useCallback(async () => {
        try { const d = await api("get_inv_products"); setRows(Array.isArray(d) ? d : []); } catch { setRows([]); }
        try { const d = await api("get_inv_categories"); setCategories(Array.isArray(d) ? d : []); } catch {}
        try { const d = await api("get_inv_suppliers"); setSuppliers(Array.isArray(d) ? d : []); } catch {}
    }, []);
    useEffect(() => { load(); }, [load]);

    const filtered = rows.filter(p => {
        if (catFilter && p.category_id !== catFilter) return false;
        if (!search) return true;
        const q = search.toLowerCase();
        return (p.name || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q);
    });

    async function save(form) {
        const body = {
            sku: form.sku, name: form.name, description: form.description,
            category_id: form.category_id || "", supplier_id: form.supplier_id || "",
            unit: form.unit || "pcs",
            cost_price: Number(form.cost_price) || 0, selling_price: Number(form.selling_price) || 0,
            reorder_point: Number(form.reorder_point) || 0,
        };
        try {
            if (form.id) await api("update_inv_product", { id: form.id, ...body });
            else await api("create_inv_product", body);
            setModal(null); flash("Product saved"); load();
        } catch (e) { flash(e.message, true); }
    }
    async function remove(id) {
        try { await api("delete_inv_product", { id }); setModal(null); flash("Product deleted"); load(); }
        catch (e) { flash(e.message, true); }
    }
    async function toggle(p, e) {
        e.stopPropagation();
        try { await api("toggle_inv_product", { id: p.id, is_active: !p.is_active }); load(); }
        catch (err) { flash(err.message, true); }
    }

    return (<>
        {msg && <div className={`iv-flash ${msg.err ? "iv-flash-err" : ""}`}>{msg.text}</div>}
        <div className="iv-bar">
            <div className="iv-bar-l">
                <div className="iv-search"><I name="search" size={14} /><input placeholder="Search name or SKU..." value={search} onChange={e => setSearch(e.target.value)} /></div>
                <select className="iv-sel" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
                    <option value="">All categories</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
            </div>
            <button className="iv-btn-p" onClick={() => setModal({ p: { unit: "pcs" } })}><I name="box" size={13} /> Add Product</button>
        </div>

        {filtered.length === 0 ? (
            <Empty icon="box" title={search || catFilter ? "No matches" : "No products"} desc={search || catFilter ? "Try adjusting your filters." : "Add your first product to start tracking stock."} action={search || catFilter ? null : "Add product"} onAction={() => setModal({ p: { unit: "pcs" } })} />
        ) : (
            <div className="iv-tblwrap iv-tbl-click">
                <table className="iv-tbl">
                    <thead><tr><th>Product</th><th>Category</th><th className="iv-tbl-r">Cost</th><th className="iv-tbl-r">Price</th><th className="iv-tbl-r">In Stock</th><th>Status</th></tr></thead>
                    <tbody>
                        {filtered.map(p => {
                            const st = stockStatus(p.total_stock, p.reorder_point);
                            return (
                                <tr key={p.id} onClick={() => setModal({ p })}>
                                    <td>
                                        <div className="iv-tbl-nm" style={{ opacity: p.is_active ? 1 : 0.5 }}>{p.name}</div>
                                        <div className="iv-sku">{p.sku}</div>
                                    </td>
                                    <td>{p.category_name || "—"}</td>
                                    <td className="iv-tbl-r iv-tbl-mono">{peso(p.cost_price)}</td>
                                    <td className="iv-tbl-r iv-tbl-mono">{peso(p.selling_price)}</td>
                                    <td className="iv-tbl-r iv-tbl-mono" style={{ fontWeight: 700, color: "#222" }}>{num(p.total_stock)} <span style={{ fontWeight: 400, color: "#aaa", fontSize: 11 }}>{p.unit}</span></td>
                                    <td onClick={e => toggle(p, e)} title="Click to toggle active"><span className={`iv-badge ${p.is_active ? st.badge : "iv-b-gray"}`}>{p.is_active ? st.label : "Inactive"}</span></td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        )}

        {modal && <ProductModal data={modal} categories={categories} suppliers={suppliers} onClose={() => setModal(null)} onSave={save} onDelete={remove} />}
    </>);
}

function ProductModal({ data, categories, suppliers, onClose, onSave, onDelete }) {
    const [form, setForm] = useState({ unit: "pcs", ...data.p });
    const [stock, setStock] = useState([]);
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const isEdit = !!form.id;

    useEffect(() => {
        if (!isEdit) return;
        (async () => {
            try { const d = await api("get_inv_product", { id: form.id }); setStock(Array.isArray(d?.stock) ? d.stock : []); } catch {}
        })();
    }, [isEdit, form.id]);

    const margin = Number(form.selling_price) > 0 && Number(form.cost_price) >= 0
        ? (((Number(form.selling_price) - Number(form.cost_price)) / Number(form.selling_price)) * 100)
        : null;

    return (
        <Modal title={isEdit ? form.name || "Edit Product" : "Add Product"} subtitle={isEdit ? form.sku : "New inventory item"} onClose={onClose}>
            <div className="iv-modal-scroll">
                <div className="iv-f">
                    <div className="iv-field">
                        <label className="iv-label">SKU <span className="iv-req" /></label>
                        <input className="iv-input" value={form.sku || ""} onChange={e => set("sku", e.target.value)} placeholder="ITEM-001" />
                    </div>
                    <div className="iv-field">
                        <label className="iv-label">Unit</label>
                        <select className="iv-fsel" value={form.unit || "pcs"} onChange={e => set("unit", e.target.value)}>
                            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                    </div>
                    <div className="iv-field iv-f-full">
                        <label className="iv-label">Product Name <span className="iv-req" /></label>
                        <input className="iv-input" value={form.name || ""} onChange={e => set("name", e.target.value)} placeholder="e.g. USB-C Cable 1m" />
                    </div>
                    <div className="iv-field">
                        <label className="iv-label">Category</label>
                        <select className="iv-fsel" value={form.category_id || ""} onChange={e => set("category_id", e.target.value)}>
                            <option value="">— None —</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div className="iv-field">
                        <label className="iv-label">Supplier</label>
                        <select className="iv-fsel" value={form.supplier_id || ""} onChange={e => set("supplier_id", e.target.value)}>
                            <option value="">— None —</option>
                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    <div className="iv-field">
                        <label className="iv-label">Cost Price (₱)</label>
                        <input className="iv-input" type="number" min="0" step="0.01" value={form.cost_price ?? ""} onChange={e => set("cost_price", e.target.value)} placeholder="0.00" />
                    </div>
                    <div className="iv-field">
                        <label className="iv-label">Selling Price (₱)</label>
                        <input className="iv-input" type="number" min="0" step="0.01" value={form.selling_price ?? ""} onChange={e => set("selling_price", e.target.value)} placeholder="0.00" />
                        {margin != null && <span className="iv-hint">Margin: {margin.toFixed(1)}%</span>}
                    </div>
                    <div className="iv-field">
                        <label className="iv-label">Reorder Point</label>
                        <input className="iv-input" type="number" min="0" step="1" value={form.reorder_point ?? ""} onChange={e => set("reorder_point", e.target.value)} placeholder="0" />
                        <span className="iv-hint">Alert when total stock drops to this level</span>
                    </div>
                    <div className="iv-field iv-f-full">
                        <label className="iv-label">Description</label>
                        <textarea className="iv-textarea" value={form.description || ""} onChange={e => set("description", e.target.value)} />
                    </div>
                </div>

                {isEdit && (
                    <div style={{ marginTop: 18 }}>
                        <div className="iv-label" style={{ marginBottom: 8 }}>Stock by warehouse</div>
                        {stock.length > 0 ? (
                            <div className="iv-tblwrap">
                                <table className="iv-tbl">
                                    <thead><tr><th>Warehouse</th><th className="iv-tbl-r">Quantity</th></tr></thead>
                                    <tbody>
                                        {stock.map((s, i) => (
                                            <tr key={i}><td>{s.warehouse_name}</td><td className="iv-tbl-r iv-tbl-mono">{num(s.quantity)} {form.unit}</td></tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : <div className="iv-hint">No stock recorded yet. Use the Stock Movements tab to add stock.</div>}
                    </div>
                )}
            </div>
            <div className="iv-modal-foot">
                {isEdit && <button className="iv-btn-danger" onClick={() => onDelete(form.id)}>Delete</button>}
                <button className="iv-btn-s" onClick={onClose}>Cancel</button>
                <button className="iv-btn-p" onClick={() => form.sku?.trim() && form.name?.trim() && onSave(form)}>{isEdit ? "Save Changes" : "Add Product"}</button>
            </div>
        </Modal>
    );
}
