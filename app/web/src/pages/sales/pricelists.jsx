import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";
import Modal from "../components/Modal";
import { api, Empty, peso, d10 } from "./shared";

export default function PriceLists() {
    const [rows, setRows] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [products, setProducts] = useState([]);
    const [modal, setModal] = useState(null);
    const [msg, setMsg] = useState(null);

    const flash = (text, err = false) => { setMsg({ text, err }); setTimeout(() => setMsg(null), 3500); };
    const load = useCallback(async () => {
        try { const d = await api("get_so_price_lists"); setRows(Array.isArray(d) ? d : []); } catch { setRows([]); }
    }, []);
    const loadRefs = useCallback(async () => {
        try { const d = await api("get_customers"); setCustomers(d?.customers || d || []); } catch {}
        try { const d = await api("get_inv_products"); setProducts(Array.isArray(d) ? d : []); } catch {}
    }, []);
    useEffect(() => { load(); loadRefs(); }, [load, loadRefs]);

    async function save(f) {
        try {
            if (f.id) await api("update_so_price_list", { ...f, is_active: f.is_active !== false });
            else await api("create_so_price_list", f);
            flash("Price list saved"); setModal(null); load();
        } catch (e) { flash(e.message, true); }
    }
    async function remove(id) {
        try { await api("delete_so_price_list", { id }); flash("Deleted"); setModal(null); load(); }
        catch (e) { flash(e.message, true); }
    }

    return (<>
        {msg && <div className={`so-flash ${msg.err ? "so-flash-err" : ""}`}>{msg.text}</div>}
        <div className="so-bar">
            <div className="so-bar-l"><span style={{ fontSize: 13, color: "#888" }}>{rows.length} price list(s)</span></div>
            <button className="so-btn-p" onClick={() => setModal({ pl: { is_active: true } })}><I name="tags" size={13} /> Add Price List</button>
        </div>
        {rows.length === 0 ? (
            <Empty icon="tags" title="No price lists" desc="Create per-customer or tiered price lists to override the default selling price." action="Add price list" onAction={() => setModal({ pl: { is_active: true } })} />
        ) : (
            <div className="so-tblwrap so-tbl-click">
                <table className="so-tbl">
                    <thead><tr><th>Name</th><th>Customer</th><th>Tier</th><th>Valid</th><th className="so-tbl-r">Items</th><th>Status</th></tr></thead>
                    <tbody>
                        {rows.map(pl => (
                            <tr key={pl.id} onClick={() => setModal({ pl })}>
                                <td><span className="so-tbl-nm">{pl.name}</span>{pl.is_default ? <span className="so-badge so-b-green" style={{ marginLeft: 6 }}>Default</span> : null}</td>
                                <td>{pl.customer_name || "All customers"}</td>
                                <td>{pl.tier || "—"}</td>
                                <td className="so-sku">{pl.valid_from || pl.valid_to ? `${d10(pl.valid_from) || "…"} → ${d10(pl.valid_to) || "…"}` : "Always"}</td>
                                <td className="so-tbl-r"><span className="so-badge so-b-gray">{pl.item_count || 0}</span></td>
                                <td><span className={`so-badge ${pl.is_active ? "so-b-green" : "so-b-gray"}`}>{pl.is_active ? "Active" : "Inactive"}</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
        {modal && <PLModal data={modal} customers={customers} products={products} onClose={() => setModal(null)} onSave={save} onDelete={remove} flash={flash} />}
    </>);
}

function PLModal({ data, customers, products, onClose, onSave, onDelete, flash }) {
    const [f, setF] = useState({ is_active: true, ...data.pl });
    const [items, setItems] = useState([]);
    const [adding, setAdding] = useState({ product_id: "", min_qty: "0", unit_price: "", discount_pct: "0" });
    const set = (k, v) => setF(p => ({ ...p, [k]: v }));
    const isEdit = !!f.id;
    const custName = (c) => c.name || c.customer_name || `${c.first_name || ""} ${c.last_name || ""}`.trim();

    const loadItems = useCallback(async () => {
        if (!f.id) return;
        try { const d = await api("get_so_price_list", { id: f.id }); setItems(d?.items || []); } catch {}
    }, [f.id]);
    useEffect(() => { loadItems(); }, [loadItems]);

    const addItem = async () => {
        if (!adding.product_id) return;
        try { await api("add_so_price_list_item", { price_list_id: f.id, product_id: adding.product_id, min_qty: Number(adding.min_qty) || 0, unit_price: Number(adding.unit_price) || 0, discount_pct: Number(adding.discount_pct) || 0 });
            setAdding({ product_id: "", min_qty: "0", unit_price: "", discount_pct: "0" }); loadItems(); }
        catch (e) { flash(e.message, true); }
    };
    const delItem = async (id) => { try { await api("delete_so_price_list_item", { id }); loadItems(); } catch (e) { flash(e.message, true); } };

    return (
        <Modal title={isEdit ? f.name || "Price List" : "Add Price List"} subtitle="Per-customer or tiered pricing" onClose={onClose}>
            <div className="so-modal-scroll">
                <div className="so-f">
                    <div className="so-field so-f-full"><label className="so-label">Name <span className="so-req" /></label><input className="so-input" value={f.name || ""} onChange={e => set("name", e.target.value)} placeholder="e.g. Wholesale, VIP tier" /></div>
                    <div className="so-field"><label className="so-label">Customer (optional)</label>
                        <select className="so-fsel" value={f.customer_id || ""} onChange={e => set("customer_id", e.target.value)}>
                            <option value="">All customers</option>
                            {customers.map(c => <option key={c.id} value={c.id}>{custName(c)}</option>)}
                        </select>
                    </div>
                    <div className="so-field"><label className="so-label">Tier label</label><input className="so-input" value={f.tier || ""} onChange={e => set("tier", e.target.value)} /></div>
                    <div className="so-field"><label className="so-label">Valid From</label><input className="so-input" type="date" value={d10(f.valid_from)} onChange={e => set("valid_from", e.target.value)} /></div>
                    <div className="so-field"><label className="so-label">Valid To</label><input className="so-input" type="date" value={d10(f.valid_to)} onChange={e => set("valid_to", e.target.value)} /></div>
                    <div className="so-field so-f-full">
                        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                            <span className="so-switch"><input type="checkbox" checked={!!f.is_default} onChange={e => set("is_default", e.target.checked)} /><span className="so-slider" /></span>
                            <span style={{ fontSize: 13, color: "#555" }}>Default price list</span>
                        </label>
                    </div>
                </div>

                {isEdit && (<div style={{ marginTop: 16 }}>
                    <div className="so-label" style={{ marginBottom: 6 }}>Product prices</div>
                    {items.length > 0 && (
                        <div className="so-tblwrap" style={{ marginBottom: 10 }}>
                            <table className="so-tbl">
                                <thead><tr><th>Product</th><th className="so-tbl-r">Min Qty</th><th className="so-tbl-r">Price</th><th className="so-tbl-r">Disc %</th><th></th></tr></thead>
                                <tbody>
                                    {items.map(it => (
                                        <tr key={it.id}><td>{it.product_name}<div className="so-sku">{it.product_sku}</div></td>
                                            <td className="so-tbl-r so-tbl-mono">{it.min_qty}</td><td className="so-tbl-r so-tbl-mono">{peso(it.unit_price)}</td>
                                            <td className="so-tbl-r so-tbl-mono">{it.discount_pct}%</td>
                                            <td className="so-tbl-r"><button className="so-btn-ghost" onClick={() => delItem(it.id)}>✕</button></td></tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 90px 70px auto", gap: 6, alignItems: "end", background: "#fafbfa", padding: 12, borderRadius: 10, border: "1px solid #eee" }}>
                        <select className="so-fsel" value={adding.product_id} onChange={e => { const p = products.find(x => x.id === e.target.value); setAdding(a => ({ ...a, product_id: e.target.value, unit_price: a.unit_price || (p ? p.selling_price : "") })); }}>
                            <option value="">— Product —</option>
                            {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                        </select>
                        <input className="so-input" type="number" placeholder="Min" value={adding.min_qty} onChange={e => setAdding(a => ({ ...a, min_qty: e.target.value }))} />
                        <input className="so-input" type="number" placeholder="Price" value={adding.unit_price} onChange={e => setAdding(a => ({ ...a, unit_price: e.target.value }))} />
                        <input className="so-input" type="number" placeholder="Disc%" value={adding.discount_pct} onChange={e => setAdding(a => ({ ...a, discount_pct: e.target.value }))} />
                        <button className="so-btn-s" disabled={!adding.product_id} onClick={addItem}>Add</button>
                    </div>
                </div>)}
                {!isEdit && <div className="so-hint" style={{ marginTop: 10 }}>Save the list first, then add product prices.</div>}
            </div>
            <div className="so-modal-foot">
                {isEdit && <button className="so-btn-danger" onClick={() => onDelete(f.id)}>Delete</button>}
                <button className="so-btn-s" onClick={onClose}>Close</button>
                <button className="so-btn-p" onClick={() => f.name?.trim() && onSave(f)}>{isEdit ? "Save" : "Create"}</button>
            </div>
        </Modal>
    );
}
