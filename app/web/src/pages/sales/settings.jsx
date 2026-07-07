import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";
import { api } from "./shared";

export default function Settings() {
    const [s, setS] = useState({ auto_post_gl: false, auto_invoice_on_fulfill: false, default_payment_terms: 30, quote_valid_days: 30 });
    const [accounts, setAccounts] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [priceLists, setPriceLists] = useState([]);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState(null);

    const flash = (text, err = false) => { setMsg({ text, err }); setTimeout(() => setMsg(null), 4000); };
    const load = useCallback(async () => {
        try { const d = await api("get_so_settings"); if (d) setS(x => ({ ...x, ...d })); } catch {}
        try { const d = await api("get_accounts"); setAccounts(d?.accounts || []); } catch {}
        try { const d = await api("get_inv_warehouses"); setWarehouses(Array.isArray(d) ? d : []); } catch {}
        try { const d = await api("get_so_price_lists"); setPriceLists(Array.isArray(d) ? d : []); } catch {}
    }, []);
    useEffect(() => { load(); }, [load]);

    const set = (k, v) => setS(x => ({ ...x, [k]: v }));
    const acctsBy = (types) => accounts.filter(a => types.includes(a.account_type));

    async function save() {
        setSaving(true);
        try {
            const d = await api("save_so_settings", {
                auto_post_gl: !!s.auto_post_gl, auto_invoice_on_fulfill: !!s.auto_invoice_on_fulfill,
                default_revenue_account_id: s.default_revenue_account_id || "", ar_account_id: s.ar_account_id || "",
                tax_payable_account_id: s.tax_payable_account_id || "", default_warehouse_id: s.default_warehouse_id || "",
                default_price_list_id: s.default_price_list_id || "",
                default_payment_terms: Number(s.default_payment_terms) || 30, quote_valid_days: Number(s.quote_valid_days) || 30,
            });
            if (d?.warning) flash(d.warning, true); else flash("Settings saved");
        } catch (e) { flash(e.message, true); }
        setSaving(false);
    }

    const Sel = ({ k, label, types, hint }) => (
        <div className="so-field">
            <label className="so-label">{label}</label>
            <select className="so-fsel" value={s[k] || ""} onChange={e => set(k, e.target.value)}>
                <option value="">— Not mapped —</option>
                {acctsBy(types).map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
            </select>
            {hint && <span className="so-hint">{hint}</span>}
        </div>
    );

    return (<>
        {msg && <div className={`so-flash ${msg.err ? "so-flash-err" : ""}`}>{msg.text}</div>}
        <div className="so-card" style={{ maxWidth: 720 }}>
            <div className="so-card-h"><h3 className="so-card-t">Sales & Invoicing</h3></div>
            <p style={{ fontSize: 13, color: "#888", marginBottom: 18, lineHeight: 1.6 }}>
                Invoicing an order posts <b>Dr Accounts Receivable / Cr Revenue / Cr Tax Payable</b> to the GL.
                COGS (Dr COGS / Cr Inventory) posts separately from the Inventory module at fulfillment.
            </p>

            <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", marginBottom: 14 }}>
                <span className="so-switch"><input type="checkbox" checked={!!s.auto_post_gl} onChange={e => set("auto_post_gl", e.target.checked)} /><span className="so-slider" /></span>
                <div><div style={{ fontSize: 13.5, fontWeight: 600, color: "#333" }}>Auto-post revenue to the General Ledger</div><div style={{ fontSize: 12, color: "#aaa" }}>Requires Receivable + Revenue accounts below</div></div>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", marginBottom: 20 }}>
                <span className="so-switch"><input type="checkbox" checked={!!s.auto_invoice_on_fulfill} onChange={e => set("auto_invoice_on_fulfill", e.target.checked)} /><span className="so-slider" /></span>
                <div><div style={{ fontSize: 13.5, fontWeight: 600, color: "#333" }}>Auto-invoice on fulfillment</div><div style={{ fontSize: 12, color: "#aaa" }}>Generate an AR invoice automatically after each shipment</div></div>
            </label>

            <div className="so-f">
                <Sel k="ar_account_id" label="Accounts Receivable" types={["Asset"]} hint="Debited by every invoice" />
                <Sel k="default_revenue_account_id" label="Default Revenue" types={["Revenue"]} hint="Credited (net of tax)" />
                <Sel k="tax_payable_account_id" label="Output Tax Payable" types={["Liability"]} hint="Credited for VAT/tax" />
                <div className="so-field">
                    <label className="so-label">Default Warehouse</label>
                    <select className="so-fsel" value={s.default_warehouse_id || ""} onChange={e => set("default_warehouse_id", e.target.value)}>
                        <option value="">— None —</option>
                        {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                </div>
                <div className="so-field">
                    <label className="so-label">Default Price List</label>
                    <select className="so-fsel" value={s.default_price_list_id || ""} onChange={e => set("default_price_list_id", e.target.value)}>
                        <option value="">— None —</option>
                        {priceLists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </div>
                <div className="so-field">
                    <label className="so-label">Payment Terms (days)</label>
                    <input className="so-input" type="number" min="0" value={s.default_payment_terms ?? 30} onChange={e => set("default_payment_terms", e.target.value)} />
                </div>
                <div className="so-field">
                    <label className="so-label">Quote Validity (days)</label>
                    <input className="so-input" type="number" min="0" value={s.quote_valid_days ?? 30} onChange={e => set("quote_valid_days", e.target.value)} />
                </div>
            </div>

            <div className="so-modal-foot" style={{ marginTop: 20 }}>
                <button className="so-btn-p" disabled={saving} onClick={save}><I name="check" size={13} /> {saving ? "Saving…" : "Save Settings"}</button>
            </div>
        </div>
    </>);
}
