import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";
import { api } from "./shared";

// Which account types make sense for each mapping slot.
const SLOTS = [
    { key: "inventory_account_id",  label: "Inventory Asset",     types: ["Asset"],             hint: "Debited on stock-in, credited on stock-out" },
    { key: "cogs_account_id",       label: "Cost of Goods Sold",  types: ["Expense"],           hint: "Debited when stock leaves (sales/issues)" },
    { key: "adjustment_account_id", label: "Inventory Adjustment",types: ["Expense"],           hint: "Gains/losses from stock adjustments" },
    { key: "payable_account_id",    label: "Payable / Clearing",  types: ["Liability", "Asset"],hint: "Credited on stock-in and goods receipts" },
];

export default function Settings() {
    const [settings, setSettings] = useState({ auto_post_gl: false });
    const [accounts, setAccounts] = useState([]);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState(null);

    const flash = (text, err = false) => { setMsg({ text, err }); setTimeout(() => setMsg(null), 3500); };

    const load = useCallback(async () => {
        try { const d = await api("get_inv_settings"); setSettings(d || { auto_post_gl: false }); } catch {}
        try { const d = await api("get_accounts"); setAccounts(d?.accounts || []); } catch {}
    }, []);
    useEffect(() => { load(); }, [load]);

    const set = (k, v) => setSettings(s => ({ ...s, [k]: v }));

    async function save() {
        setSaving(true);
        try {
            await api("save_inv_settings", {
                auto_post_gl: !!settings.auto_post_gl,
                inventory_account_id: settings.inventory_account_id || "",
                cogs_account_id: settings.cogs_account_id || "",
                adjustment_account_id: settings.adjustment_account_id || "",
                payable_account_id: settings.payable_account_id || "",
            });
            flash("Settings saved");
        } catch (e) { flash(e.message, true); }
        setSaving(false);
    }

    const noAccounts = accounts.length === 0;

    return (<>
        {msg && <div className={`iv-flash ${msg.err ? "iv-flash-err" : ""}`}>{msg.text}</div>}

        <div className="iv-card" style={{ maxWidth: 680 }}>
            <div className="iv-card-h"><h3 className="iv-card-t">Accounting Integration</h3></div>
            <p style={{ fontSize: 13, color: "#888", marginBottom: 18, lineHeight: 1.6 }}>
                When enabled, stock movements automatically post balanced journal entries to the General Ledger:
                stock-in debits Inventory, stock-out debits COGS, and goods receipts credit your payable account.
            </p>

            <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", marginBottom: 20 }}>
                <span className="iv-switch"><input type="checkbox" checked={!!settings.auto_post_gl} onChange={e => set("auto_post_gl", e.target.checked)} /><span className="iv-slider" /></span>
                <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "#333" }}>Auto-post to General Ledger</div>
                    <div style={{ fontSize: 12, color: "#aaa" }}>Requires the account mappings below</div>
                </div>
            </label>

            {noAccounts ? (
                <div className="iv-flash iv-flash-err">No chart of accounts found. Set up accounting first (Accounting → Chart of Accounts).</div>
            ) : (
                <div className="iv-f">
                    {SLOTS.map(slot => {
                        const opts = accounts.filter(a => slot.types.includes(a.account_type));
                        return (
                            <div className="iv-field iv-f-full" key={slot.key}>
                                <label className="iv-label">{slot.label}</label>
                                <select className="iv-fsel" value={settings[slot.key] || ""} onChange={e => set(slot.key, e.target.value)}>
                                    <option value="">— Not mapped —</option>
                                    {opts.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                                </select>
                                <span className="iv-hint">{slot.hint}</span>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="iv-modal-foot" style={{ marginTop: 20 }}>
                <button className="iv-btn-p" disabled={saving} onClick={save}><I name="check" size={13} /> {saving ? "Saving…" : "Save Settings"}</button>
            </div>
        </div>
    </>);
}
