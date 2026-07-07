import { peso } from "./shared";

/* Editable line-item grid used by quotes and orders. Each line:
   {product_id, description, quantity, unit_price, discount_pct, tax_rate} */
export default function LineGrid({ products, lines, setLines }) {
    const upd = (i, k, v) => setLines(ls => ls.map((l, j) => j === i ? { ...l, [k]: v } : l));
    const pick = (i, pid) => {
        const p = products.find(x => x.id === pid);
        setLines(ls => ls.map((l, j) => j === i ? { ...l, product_id: pid, description: l.description || (p ? p.name : ""), unit_price: l.unit_price || (p ? p.selling_price : 0) } : l));
    };
    const add = () => setLines(ls => [...ls, { product_id: "", description: "", quantity: 1, unit_price: 0, discount_pct: 0, tax_rate: 0 }]);
    const del = (i) => setLines(ls => ls.filter((_, j) => j !== i));

    const lineNet = (l) => (Number(l.quantity) || 0) * (Number(l.unit_price) || 0) * (1 - (Number(l.discount_pct) || 0) / 100);
    const lineTotal = (l) => lineNet(l) * (1 + (Number(l.tax_rate) || 0) / 100);
    const subtotal = lines.reduce((s, l) => s + lineNet(l), 0);
    const tax = lines.reduce((s, l) => s + lineNet(l) * (Number(l.tax_rate) || 0) / 100, 0);

    return (
        <div>
            <div className="so-tblwrap">
                <table className="so-tbl">
                    <thead><tr><th style={{ minWidth: 160 }}>Product</th><th style={{ width: 70 }}>Qty</th><th style={{ width: 100 }}>Unit Price</th><th style={{ width: 70 }}>Disc%</th><th style={{ width: 70 }}>Tax%</th><th className="so-tbl-r">Total</th><th style={{ width: 30 }}></th></tr></thead>
                    <tbody>
                        {lines.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", color: "#aaa", padding: 16 }}>No lines yet</td></tr>}
                        {lines.map((l, i) => (
                            <tr key={i}>
                                <td>
                                    <select className="so-fsel" style={{ width: "100%" }} value={l.product_id || ""} onChange={e => pick(i, e.target.value)}>
                                        <option value="">— Product / free text —</option>
                                        {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                                    </select>
                                    {!l.product_id && <input className="so-input" style={{ marginTop: 4 }} placeholder="Description" value={l.description || ""} onChange={e => upd(i, "description", e.target.value)} />}
                                </td>
                                <td><input className="so-input" type="number" min="0" step="0.01" value={l.quantity} onChange={e => upd(i, "quantity", e.target.value)} /></td>
                                <td><input className="so-input" type="number" min="0" step="0.01" value={l.unit_price} onChange={e => upd(i, "unit_price", e.target.value)} /></td>
                                <td><input className="so-input" type="number" min="0" max="100" step="0.01" value={l.discount_pct} onChange={e => upd(i, "discount_pct", e.target.value)} /></td>
                                <td><input className="so-input" type="number" min="0" max="100" step="0.01" value={l.tax_rate} onChange={e => upd(i, "tax_rate", e.target.value)} /></td>
                                <td className="so-tbl-r so-tbl-mono">{peso(lineTotal(l))}</td>
                                <td className="so-tbl-r"><button className="so-btn-ghost" onClick={() => del(i)}>✕</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                <button className="so-btn-s" onClick={add}>+ Add line</button>
                <div style={{ textAlign: "right", fontSize: 13 }}>
                    <div style={{ color: "#888" }}>Subtotal: <b style={{ color: "#333" }}>{peso(subtotal)}</b></div>
                    <div style={{ color: "#888" }}>Tax: <b style={{ color: "#333" }}>{peso(tax)}</b></div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#222", marginTop: 2 }}>Total: {peso(subtotal + tax)}</div>
                </div>
            </div>
        </div>
    );
}
