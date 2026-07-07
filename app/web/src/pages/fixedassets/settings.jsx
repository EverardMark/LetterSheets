import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";
import { api } from "./shared";

const SLOTS = [
    { key: "asset_account_id",               label: "Asset Cost",           types: ["Asset"],              hint: "Debited on acquisition; credited on disposal" },
    { key: "accum_dep_account_id",           label: "Accumulated Depreciation", types: ["Asset"],          hint: "Credited by depreciation; debited on disposal" },
    { key: "dep_expense_account_id",         label: "Depreciation Expense", types: ["Expense"],            hint: "Debited each depreciation run" },
    { key: "payable_account_id",             label: "Acquisition Payable",  types: ["Liability", "Asset"], hint: "Credited when an asset is capitalised" },
    { key: "cash_account_id",                label: "Disposal Cash / Receivable", types: ["Asset"],        hint: "Debited for disposal proceeds" },
    { key: "disposal_gain_account_id",       label: "Gain on Disposal",     types: ["Revenue"],            hint: "Credited when proceeds exceed book value" },
    { key: "disposal_loss_account_id",       label: "Loss on Disposal",     types: ["Expense"],            hint: "Debited when book value exceeds proceeds" },
    { key: "revaluation_surplus_account_id", label: "Revaluation Surplus",  types: ["Equity"],             hint: "Credited on an upward revaluation" },
    { key: "impairment_loss_account_id",     label: "Impairment Loss",      types: ["Expense"],            hint: "Debited on impairment / downward revaluation" },
];

export default function Settings() {
    const [settings, setSettings] = useState({ auto_post_gl: false });
    const [accounts, setAccounts] = useState([]);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState(null);

    const flash = (text, err = false) => { setMsg({ text, err }); setTimeout(() => setMsg(null), 3500); };
    const load = useCallback(async () => {
        try { const d = await api("get_fa_settings"); setSettings(d || { auto_post_gl: false }); } catch {}
        try { const d = await api("get_accounts"); setAccounts(d?.accounts || []); } catch {}
    }, []);
    useEffect(() => { load(); }, [load]);

    const set = (k, v) => setSettings(s => ({ ...s, [k]: v }));

    async function save() {
        setSaving(true);
        try {
            const body = { auto_post_gl: !!settings.auto_post_gl };
            SLOTS.forEach(s => { body[s.key] = settings[s.key] || ""; });
            await api("save_fa_settings", body);
            flash("Settings saved");
        } catch (e) { flash(e.message, true); }
        setSaving(false);
    }

    const noAccounts = accounts.length === 0;

    return (<>
        {msg && <div className={`fa-flash ${msg.err ? "fa-flash-err" : ""}`}>{msg.text}</div>}
        <div className="fa-card" style={{ maxWidth: 720 }}>
            <div className="fa-card-h"><h3 className="fa-card-t">Accounting Integration</h3></div>
            <p style={{ fontSize: 13, color: "#888", marginBottom: 18, lineHeight: 1.6 }}>
                When enabled, fixed-asset events auto-post balanced journal entries: acquisition capitalises the asset,
                the monthly run posts depreciation, and disposals/revaluations/impairments post gains, losses and surplus.
                Per-asset or per-category account overrides take precedence over these company defaults.
            </p>

            <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", marginBottom: 20 }}>
                <span className="fa-switch"><input type="checkbox" checked={!!settings.auto_post_gl} onChange={e => set("auto_post_gl", e.target.checked)} /><span className="fa-slider" /></span>
                <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "#333" }}>Auto-post to General Ledger</div>
                    <div style={{ fontSize: 12, color: "#aaa" }}>Requires the account mappings below</div>
                </div>
            </label>

            {noAccounts ? (
                <div className="fa-flash fa-flash-err">No chart of accounts found. Set up accounting first (Accounting → Chart of Accounts).</div>
            ) : (
                <div className="fa-f">
                    {SLOTS.map(slot => {
                        const opts = accounts.filter(a => slot.types.includes(a.account_type));
                        return (
                            <div className="fa-field" key={slot.key}>
                                <label className="fa-label">{slot.label}</label>
                                <select className="fa-fsel" value={settings[slot.key] || ""} onChange={e => set(slot.key, e.target.value)}>
                                    <option value="">— Not mapped —</option>
                                    {opts.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                                </select>
                                <span className="fa-hint">{slot.hint}</span>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="fa-modal-foot" style={{ marginTop: 20 }}>
                <button className="fa-btn-p" disabled={saving} onClick={save}><I name="check" size={13} /> {saving ? "Saving…" : "Save Settings"}</button>
            </div>
        </div>
    </>);
}
