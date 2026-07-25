import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";
import { api } from "./shared";
import { Term, AdvancedOnly, SimpleHint } from "../components/simplemode";

export default function Settings() {
    const [s, setS] = useState({ auto_post_gl: false, requisition_approval: true, po_approval: true, default_payment_terms: 30 });
    const [accounts, setAccounts] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState(null);

    const flash = (text, err = false) => { setMsg({ text, err }); setTimeout(() => setMsg(null), 4000); };
    const load = useCallback(async () => {
        try { const d = await api("get_pur_settings"); if (d) setS(x => ({ ...x, ...d })); } catch {}
        try { const d = await api("get_accounts"); setAccounts(d?.accounts || []); } catch {}
        try { const d = await api("get_inv_warehouses"); setWarehouses(Array.isArray(d) ? d : []); } catch {}
    }, []);
    useEffect(() => { load(); }, [load]);

    const set = (k, v) => setS(x => ({ ...x, [k]: v }));
    const acctsBy = (types) => accounts.filter(a => types.includes(a.account_type));

    async function save() {
        setSaving(true);
        try {
            await api("save_pur_settings", {
                auto_post_gl: !!s.auto_post_gl,
                inventory_account_id: s.inventory_account_id || "", expense_account_id: s.expense_account_id || "",
                gr_ir_account_id: s.gr_ir_account_id || "", ap_account_id: s.ap_account_id || "",
                tax_input_account_id: s.tax_input_account_id || "", default_warehouse_id: s.default_warehouse_id || "",
                default_payment_terms: Number(s.default_payment_terms) || 30,
                requisition_approval: !!s.requisition_approval, po_approval: !!s.po_approval,
            });
            flash("Settings saved");
        } catch (e) { flash(e.message, true); }
        setSaving(false);
    }

    const Sel = ({ k, label, types, hint }) => (
        <div className="pr-field">
            <label className="pr-label">{label}</label>
            <select className="pr-fsel" value={s[k] || ""} onChange={e => set(k, e.target.value)}>
                <option value="">— Not mapped —</option>
                {acctsBy(types).map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
            </select>
            {hint && <span className="pr-hint">{hint}</span>}
        </div>
    );

    return (<>
        {msg && <div className={`pr-flash ${msg.err ? "pr-flash-err" : ""}`}>{msg.text}</div>}
        <div className="pr-card" style={{ maxWidth: 760 }}>
            <div className="pr-card-h"><h3 className="pr-card-t"><Term simple="Purchasing settings" advanced="Procurement & GL" /></h3></div>
            <SimpleHint icon="bulb">Set your buying defaults here. Switch to Advanced (top right) if your bookkeeper needs to map the bookkeeping accounts.</SimpleHint>
            <AdvancedOnly>
            <p style={{ fontSize: 13, color: "#888", marginBottom: 18, lineHeight: 1.6 }}>
                Goods receipt posts <b>Dr Inventory / Cr GR-IR clearing</b> (valued at PO net cost). The vendor bill
                posts <b>Dr GR-IR / Dr Input Tax / Cr Accounts Payable</b> and opens a payable in AP — so GR-IR nets to
                zero once received goods are fully billed (three-way match).
            </p>
            </AdvancedOnly>

            <AdvancedOnly>
            <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", marginBottom: 14 }}>
                <span className="pr-switch"><input type="checkbox" checked={!!s.auto_post_gl} onChange={e => set("auto_post_gl", e.target.checked)} /><span className="pr-slider" /></span>
                <div><div style={{ fontSize: 13.5, fontWeight: 600, color: "#333" }}>Auto-post to the General Ledger</div><div style={{ fontSize: 12, color: "#aaa" }}>Requires Inventory, GR/IR clearing and Accounts Payable accounts below</div></div>
            </label>
            </AdvancedOnly>
            <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", marginBottom: 14 }}>
                <span className="pr-switch"><input type="checkbox" checked={!!s.requisition_approval} onChange={e => set("requisition_approval", e.target.checked)} /><span className="pr-slider" /></span>
                <div><div style={{ fontSize: 13.5, fontWeight: 600, color: "#333" }}><Term simple="Require approval for purchase requests" advanced="Require requisition approval" /></div><div style={{ fontSize: 12, color: "#aaa" }}><Term simple="Purchase requests must be approved before they become a purchase order" advanced="Requisitions must be submitted and approved before converting to a PO" /></div></div>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", marginBottom: 20 }}>
                <span className="pr-switch"><input type="checkbox" checked={!!s.po_approval} onChange={e => set("po_approval", e.target.checked)} /><span className="pr-slider" /></span>
                <div><div style={{ fontSize: 13.5, fontWeight: 600, color: "#333" }}><Term simple="Require approval for purchase orders" advanced="Require PO approval" /></div><div style={{ fontSize: 12, color: "#aaa" }}>Purchase orders must be approved before goods can be received</div></div>
            </label>

            <div className="pr-f">
                <AdvancedOnly>
                <Sel k="inventory_account_id" label="Inventory" types={["Asset"]} hint="Debited when stock is received" />
                <Sel k="gr_ir_account_id" label="GR/IR Clearing" types={["Liability", "Asset"]} hint="Accrued on receipt, cleared by the bill" />
                <Sel k="ap_account_id" label="Accounts Payable" types={["Liability"]} hint="Credited by the vendor bill" />
                <Sel k="expense_account_id" label="Default Expense" types={["Expense", "Cost of Goods Sold", "Asset"]} hint="For non-stock / service lines" />
                <Sel k="tax_input_account_id" label="Input Tax" types={["Asset", "Liability"]} hint="Debited for recoverable VAT/tax" />
                </AdvancedOnly>
                <div className="pr-field">
                    <label className="pr-label"><Term simple="Default delivery location" advanced="Default Warehouse" /></label>
                    <select className="pr-fsel" value={s.default_warehouse_id || ""} onChange={e => set("default_warehouse_id", e.target.value)}>
                        <option value="">— None —</option>
                        {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                </div>
                <div className="pr-field">
                    <label className="pr-label"><Term simple="Days to pay a supplier" advanced="Payment Terms (days)" /></label>
                    <input className="pr-input" type="number" min="0" value={s.default_payment_terms ?? 30} onChange={e => set("default_payment_terms", e.target.value)} />
                </div>
            </div>

            <div className="pr-modal-foot" style={{ marginTop: 20 }}>
                <button className="pr-btn-p" disabled={saving} onClick={save}><I name="check" size={13} /> {saving ? "Saving…" : "Save Settings"}</button>
            </div>
        </div>
    </>);
}
