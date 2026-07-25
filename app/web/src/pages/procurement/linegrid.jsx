import { peso } from "./shared";
import { useIsSimple } from "../../utils/uimode";

/* Editable PO line-item grid. Each line:
   {product_id, description, quantity, unit_price, discount_pct, tax_rate, expense_account_id}
   Stock lines pick a product; non-stock/service lines use free text + an expense account. */
export default function LineGrid({ products, accounts, lines, setLines }) {
    const simple = useIsSimple();
    const expenseAccts = (accounts || []).filter(a => ["Expense", "Asset", "Cost of Goods Sold"].includes(a.account_type));
    const upd = (i, k, v) => setLines(ls => ls.map((l, j) => j === i ? { ...l, [k]: v } : l));
    const pick = (i, pid) => {
        const p = products.find(x => x.id === pid);
        setLines(ls => ls.map((l, j) => j === i ? { ...l, product_id: pid, description: l.description || (p ? p.name : ""), unit_price: l.unit_price || (p ? p.cost_price : 0) } : l));
    };
    const add = () => setLines(ls => [...ls, { product_id: "", description: "", quantity: 1, unit_price: 0, discount_pct: 0, tax_rate: 0, expense_account_id: "" }]);
    const del = (i) => setLines(ls => ls.filter((_, j) => j !== i));

    const lineNet = (l) => (Number(l.quantity) || 0) * (Number(l.unit_price) || 0) * (1 - (Number(l.discount_pct) || 0) / 100);
    const lineTotal = (l) => lineNet(l) * (1 + (Number(l.tax_rate) || 0) / 100);
    const subtotal = lines.reduce((s, l) => s + lineNet(l), 0);
    const tax = lines.reduce((s, l) => s + lineNet(l) * (Number(l.tax_rate) || 0) / 100, 0);

    return (
        <div>
            <div className="pr-tblwrap">
                <table className="pr-tbl">
                    <thead><tr><th style={{ minWidth: 180 }}>Item</th><th style={{ width: 70 }}>Qty</th><th style={{ width: 100 }}>Unit Cost</th><th style={{ width: 66 }}>Disc%</th><th style={{ width: 66 }}>Tax%</th><th className="pr-tbl-r">Total</th><th style={{ width: 30 }}></th></tr></thead>
                    <tbody>
                        {lines.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", color: "#aaa", padding: 16 }}>No lines yet</td></tr>}
                        {lines.map((l, i) => (
                            <tr key={i}>
                                <td>
                                    <select className="pr-fsel" style={{ width: "100%" }} value={l.product_id || ""} onChange={e => pick(i, e.target.value)}>
                                        <option value="">— Product / service (free text) —</option>
                                        {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                                    </select>
                                    {!l.product_id && <>
                                        <input className="pr-input" style={{ marginTop: 4 }} placeholder="Description" value={l.description || ""} onChange={e => upd(i, "description", e.target.value)} />
                                        <select className="pr-fsel" style={{ marginTop: 4, width: "100%" }} value={l.expense_account_id || ""} onChange={e => upd(i, "expense_account_id", e.target.value)}>
                                            <option value="">{simple ? "— Spending category (uses default) —" : "— Expense account (uses default) —"}</option>
                                            {expenseAccts.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                                        </select>
                                    </>}
                                </td>
                                <td><input className="pr-input" type="number" min="0" step="0.01" value={l.quantity} onChange={e => upd(i, "quantity", e.target.value)} /></td>
                                <td><input className="pr-input" type="number" min="0" step="0.01" value={l.unit_price} onChange={e => upd(i, "unit_price", e.target.value)} /></td>
                                <td><input className="pr-input" type="number" min="0" max="100" step="0.01" value={l.discount_pct} onChange={e => upd(i, "discount_pct", e.target.value)} /></td>
                                <td><input className="pr-input" type="number" min="0" max="100" step="0.01" value={l.tax_rate} onChange={e => upd(i, "tax_rate", e.target.value)} /></td>
                                <td className="pr-tbl-r pr-tbl-mono">{peso(lineTotal(l))}</td>
                                <td className="pr-tbl-r"><button className="pr-btn-ghost" onClick={() => del(i)}>✕</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                <button className="pr-btn-s" onClick={add}>+ Add line</button>
                <div style={{ textAlign: "right", fontSize: 13 }}>
                    <div style={{ color: "#888" }}>Subtotal: <b style={{ color: "#333" }}>{peso(subtotal)}</b></div>
                    <div style={{ color: "#888" }}>Tax: <b style={{ color: "#333" }}>{peso(tax)}</b></div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#222", marginTop: 2 }}>Total: {peso(subtotal + tax)}</div>
                </div>
            </div>
        </div>
    );
}
