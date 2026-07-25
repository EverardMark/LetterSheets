import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";
import { api, loadAccounts } from "./shared";
import { AdvancedOnly, Term, SimpleHint } from "../components/simplemode";
import { useIsSimple } from "../../utils/uimode";

/* ================================================================
   EXPENSES — Settings

   The GL wiring a claim needs before it can be approved:

     Approval posts   Dr expense accounts (from the line's category)
                      Dr input VAT account (when a line splits tax out)
                          Cr employee reimbursements payable
     Payment posts    Dr employee reimbursements payable
                          Cr the cash/bank account chosen at payment

   Approval is refused with a plain-English error until the payable
   account is set, rather than guessing an account and quietly
   misstating the books.
================================================================ */

export default function ExpenseSettingsView() {
    const simple = useIsSimple();
    const [s, setS] = useState(null);
    const [accounts, setAccounts] = useState({ liability: [], asset: [] });
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [ok, setOk] = useState("");

    const load = useCallback(async () => {
        try {
            const [settings, liab, asset] = await Promise.all([
                api("get_exp_settings"),
                loadAccounts("Liability"),
                loadAccounts("Asset"),
            ]);
            setS(settings);
            setAccounts({ liability: liab, asset: asset });
            setErr("");
        } catch (e) { setErr(e.message); }
    }, []);
    useEffect(() => { load(); }, [load]);

    const set = (patch) => setS(prev => ({ ...prev, ...patch }));

    const save = async () => {
        setBusy(true);
        setOk("");
        try {
            const saved = await api("save_exp_settings", {
                ...s,
                approval_threshold: s.approval_threshold === "" || s.approval_threshold == null
                    ? null : Number(s.approval_threshold),
            });
            setS(saved);
            setOk("Settings saved.");
            setErr("");
        } catch (e) { setErr(e.message); }
        setBusy(false);
    };

    if (!s) return <div className="ex-card ex-m">Loading…</div>;

    return (
        <div style={{ maxWidth: 720 }}>
            <div className="ex-head">
                <div>
                    <h1 className="ex-title"><Term simple="Reimbursement setup" advanced="Expense settings" /></h1>
                    <p className="ex-sub">
                        <Term
                            simple="Tell us where to track what you owe staff, and where you pay them back from."
                            advanced="Where approved claims and their payments land in the ledger."
                        />
                    </p>
                </div>
            </div>

            {err && <div className="ex-err"><I name="alert-triangle" size={14}/> {err}</div>}
            {ok && <div className="ex-ok">{ok}</div>}

            <SimpleHint icon="bulb">
                Pick an account for each box below. If you're not sure, ask whoever handles your bookkeeping —
                you only set this once. Switch to <b>Advanced</b> (top right) to see the exact accounting terms.
            </SimpleHint>

            <div className="ex-card">
                <div className="ex-card-t" style={{ marginBottom: 12 }}>
                    <Term simple="Which accounts to use" advanced="Ledger accounts" />
                </div>

                <div className="ex-fld">
                    <label className="ex-lbl">
                        <Term simple="Where to track money you owe staff" advanced="Employee reimbursements payable" />
                        {" "}<span style={{ color: "#dc2626" }}>· required</span>
                    </label>
                    <select className="ex-in" value={s.employee_payable_account_id || ""}
                            onChange={e => set({ employee_payable_account_id: e.target.value })}>
                        <option value="">{simple ? "Choose an account…" : "Choose a liability account…"}</option>
                        {accounts.liability.map(a => <option key={a.id} value={a.id}>{simple ? a.name : `${a.code} — ${a.name}`}</option>)}
                    </select>
                    <AdvancedOnly>
                        <div className="ex-info" style={{ marginTop: 6 }}>
                            Credited when a claim is approved — this is what the company owes the employee — and debited
                            again when it is paid.
                        </div>
                    </AdvancedOnly>
                </div>

                <div className="ex-fld">
                    <label className="ex-lbl">
                        <Term simple="Which account do you pay staff back from?" advanced="Default cash / bank account for payouts" />
                    </label>
                    <select className="ex-in" value={s.default_cash_account_id || ""}
                            onChange={e => set({ default_cash_account_id: e.target.value })}>
                        <option value="">{simple ? "Choose an account…" : "None — pick one at payment time"}</option>
                        {accounts.asset.map(a => <option key={a.id} value={a.id}>{simple ? a.name : `${a.code} — ${a.name}`}</option>)}
                    </select>
                </div>

                {/* Input-VAT routing is a genuinely accountant-only concern; a beginner
                    should never have to reason about it, so it is Advanced-only. */}
                <AdvancedOnly>
                    <div className="ex-fld">
                        <label className="ex-lbl">Creditable input VAT account</label>
                        <select className="ex-in" value={s.tax_input_account_id || ""}
                                onChange={e => set({ tax_input_account_id: e.target.value })}>
                            <option value="">None — claims may not split out VAT</option>
                            {accounts.asset.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                        </select>
                        <div className="ex-info" style={{ marginTop: 6 }}>
                            Needed only if employees enter input VAT separately on a claim line. Without it, a claim
                            carrying VAT is refused at approval rather than folded into expense.
                        </div>
                    </div>
                </AdvancedOnly>
            </div>

            <div className="ex-card">
                <div className="ex-card-t" style={{ marginBottom: 12 }}>
                    <Term simple="Rules" advanced="Policy" />
                </div>

                {/* "Post to the ledger automatically" is an accounting review preference.
                    In Simple mode it stays ON (the default) and is hidden — a beginner
                    isn't reviewing draft journal entries. */}
                <AdvancedOnly>
                    <label className="ex-chk">
                        <input type="checkbox" checked={!!s.auto_post_gl} onChange={e => set({ auto_post_gl: e.target.checked })}/>
                        <span>
                            <b>Post to the ledger automatically</b>
                            <small>Off: approval and payment create draft journal entries for an accountant to review and post.</small>
                        </span>
                    </label>
                </AdvancedOnly>

                <label className="ex-chk">
                    <input type="checkbox" checked={!!s.require_receipt} onChange={e => set({ require_receipt: e.target.checked })}/>
                    <span>
                        <b><Term simple="Always require a receipt photo" advanced="Require a receipt attachment" /></b>
                        <small>Staff can't submit a claim without attaching at least one receipt.</small>
                    </span>
                </label>

                <div className="ex-fld" style={{ marginTop: 12 }}>
                    <label className="ex-lbl">
                        <Term simple="Warn me about claims bigger than" advanced="Flag claims above" />
                        {" "}<span style={{ color: "#bbb", fontWeight: 400 }}>(optional)</span>
                    </label>
                    <input className="ex-in" type="number" step="0.01" min="0"
                           value={s.approval_threshold ?? ""}
                           placeholder={simple ? "Leave blank for no warning" : "No threshold"}
                           onChange={e => set({ approval_threshold: e.target.value })}/>
                </div>
            </div>

            <button className="ex-btn-p" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save settings"}</button>

            <style>{`
        .ex-chk{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid #f7f7f7;cursor:pointer}
        .ex-chk:last-of-type{border-bottom:none}
        .ex-chk input{margin-top:2px}
        .ex-chk b{display:block;font-size:12.5px;font-weight:600;color:#444}
        .ex-chk small{display:block;font-size:11px;color:#999;margin-top:2px;line-height:1.5}
      `}</style>
        </div>
    );
}
