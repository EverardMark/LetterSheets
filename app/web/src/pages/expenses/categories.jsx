import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";
import { api, asList, loadAccounts, Empty } from "./shared";
import { AdvancedOnly, Term, SimpleHint } from "../components/simplemode";
import { useIsSimple } from "../../utils/uimode";

/* ================================================================
   EXPENSES — Categories

   A category is the translation layer between what an employee
   understands ("Meals") and what the ledger needs (account 6120).
   Without at least one mapped category, no claim can be filed —
   which is why this page nags when the list is empty.
================================================================ */

export default function CategoriesView() {
    const simple = useIsSimple();
    const [cats, setCats] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");
    const [editing, setEditing] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [c, a] = await Promise.all([
                api("get_exp_categories"),
                loadAccounts("Expense"),
            ]);
            setCats(asList(c, "categories"));
            setAccounts(a);
            setErr("");
        } catch (e) { setErr(e.message); }
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const remove = async (c) => {
        if (!window.confirm(`Remove "${c.name}"? Claims already using it keep their accounts.`)) return;
        try { await api("delete_exp_category", { id: c.id }); load(); }
        catch (e) { setErr(e.message); }
    };

    const seed = async () => {
        // A starter set covering what most Philippine SMEs actually reimburse.
        // Accounts are left unmapped on purpose — guessing which account a
        // company means would silently post to the wrong place.
        const starter = ["Transportation", "Meals & Entertainment", "Accommodation",
            "Office Supplies", "Communication", "Professional Fees", "Fuel", "Parking & Tolls"];
        try {
            for (const name of starter) await api("create_exp_category", { name });
            load();
        } catch (e) { setErr(e.message); }
    };

    return (
        <div>
            <div className="ex-head">
                <div>
                    <h1 className="ex-title"><Term simple="Spending types" advanced="Expense categories" /></h1>
                    <p className="ex-sub">
                        <Term
                            simple="The list of things staff can claim — like Transport, Meals or Supplies."
                            advanced="What employees pick when filing, and the GL account each one posts to."
                        />
                    </p>
                </div>
                <button className="ex-btn-p" onClick={() => setEditing({})}><I name="plus" size={13}/> <Term simple="Add type" advanced="New category" /></button>
            </div>

            {err && <div className="ex-err"><I name="alert-triangle" size={14}/> {err}</div>}

            <SimpleHint icon="bulb">
                These are the buttons staff see when filing a claim. Add the ones you reimburse, and pick a
                bookkeeping account for each so it lands in the right place. Not sure which account? The
                starter list below is a safe start.
            </SimpleHint>

            <div className="ex-card">
                {loading ? <div className="ex-m" style={{ padding: 12 }}>Loading…</div> : cats.length === 0 ? (
                    <Empty icon="tags" title={simple ? "No spending types yet" : "No categories yet"}
                           desc={simple
                               ? "Staff can't file a claim until at least one type exists. Add the common ones to get going."
                               : "Claims can't be filed until at least one category exists. Start with the common ones and map each to an expense account."}
                           action={simple ? "Add the usual ones" : "Add the usual categories"} onAction={seed}/>
                ) : (
                    <table className="ex-tbl">
                        <thead>
                        <tr>
                            <th>{simple ? "Type" : "Category"}</th>
                            <th><Term simple="Bookkeeping account" advanced="Posts to" /></th>
                            <th className="ex-r">Used on</th><th>Status</th><th/>
                        </tr>
                        </thead>
                        <tbody>
                        {cats.map(c => (
                            <tr key={c.id}>
                                <td>
                                    <div className="ex-b">{c.name}</div>
                                    {c.description && <div className="ex-m" style={{ fontSize: 11 }}>{c.description}</div>}
                                </td>
                                <td className={c.account_id ? "ex-m" : ""}>
                                    {c.account_id
                                        ? (simple ? c.account_name : `${c.account_code} — ${c.account_name}`)
                                        : <span style={{ color: "#dc2626", fontWeight: 600 }}>{simple ? "Needs an account" : "Not mapped"}</span>}
                                </td>
                                <td className="ex-r ex-m">{c.claim_count || "—"}</td>
                                <td>
                                    <span className="ex-pill" style={c.is_active
                                        ? { background: "#22c55e1a", color: "#22c55e" }
                                        : { background: "#94a3b81a", color: "#94a3b8" }}>
                                        {c.is_active ? "Active" : "Inactive"}
                                    </span>
                                </td>
                                <td className="ex-r">
                                    <button className="ex-btn ex-btn-sm" onClick={() => setEditing(c)}><I name="edit-2" size={11}/></button>{" "}
                                    <button className="ex-btn-d ex-btn-sm" onClick={() => remove(c)}><I name="trash-2" size={11}/></button>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                )}
            </div>

            {cats.some(c => !c.account_id) && (
                <div className="ex-info">
                    <Term
                        simple="The types marked “Needs an account” can't be used yet — open each one and pick a bookkeeping account first."
                        advanced="Categories without an account can't be used on a claim — the server refuses a line it can't route to the ledger. Map them before asking anyone to file."
                    />
                </div>
            )}

            {editing && <CategoryModal cat={editing} accounts={accounts}
                                       onClose={() => setEditing(null)}
                                       onSaved={() => { setEditing(null); load(); }}/>}
        </div>
    );
}

function CategoryModal({ cat, accounts, onClose, onSaved }) {
    const simple = useIsSimple();
    const isNew = !cat.id;
    const [name, setName] = useState(cat.name || "");
    const [desc, setDesc] = useState(cat.description || "");
    const [account, setAccount] = useState(cat.account_id || "");
    const [cap, setCap] = useState(cat.daily_cap ?? "");
    const [active, setActive] = useState(cat.is_active !== false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    const save = async () => {
        if (!name.trim()) { setErr("Name is required."); return; }
        setBusy(true);
        try {
            await api(isNew ? "create_exp_category" : "update_exp_category", {
                id: cat.id, name, description: desc, account_id: account,
                daily_cap: cap === "" ? null : Number(cap), is_active: active,
            });
            onSaved();
        } catch (e) { setErr(e.message); setBusy(false); }
    };

    return (
        <div className="ex-ov" onClick={onClose}>
            <div className="ex-mod ex-mod-sm" onClick={e => e.stopPropagation()}>
                <div className="ex-mod-t">{isNew ? (simple ? "Add spending type" : "New category") : (simple ? "Edit spending type" : "Edit category")}</div>
                <div className="ex-mod-s">
                    <Term
                        simple="Give it a name staff will recognise, and pick the bookkeeping account it belongs to."
                        advanced="The account you pick is what a claim line using this category will debit."
                    />
                </div>
                {err && <div className="ex-err">{err}</div>}
                <div className="ex-fld">
                    <label className="ex-lbl">Name</label>
                    <input className="ex-in" value={name} onChange={e => setName(e.target.value)} placeholder="Transportation"/>
                </div>
                <div className="ex-fld">
                    <label className="ex-lbl"><Term simple="Bookkeeping account" advanced="Posts to expense account" /></label>
                    <select className="ex-in" value={account} onChange={e => setAccount(e.target.value)}>
                        <option value="">{simple ? "Choose an account…" : "Not mapped yet"}</option>
                        {accounts.map(a => <option key={a.id} value={a.id}>{simple ? a.name : `${a.code} — ${a.name}`}</option>)}
                    </select>
                </div>
                <div className="ex-fld">
                    <label className="ex-lbl">Description <span style={{ color: "#bbb", fontWeight: 400 }}>(optional)</span></label>
                    <input className="ex-in" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Fares, taxi, ride-hailing"/>
                </div>
                <AdvancedOnly>
                    <div className="ex-fld">
                        <label className="ex-lbl">Daily cap <span style={{ color: "#bbb", fontWeight: 400 }}>(optional, advisory)</span></label>
                        <input className="ex-in" type="number" step="0.01" min="0" value={cap} onChange={e => setCap(e.target.value)}/>
                    </div>
                </AdvancedOnly>
                {!isNew && (
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#666" }}>
                        <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)}/>
                        Available for new claims
                    </label>
                )}
                <div className="ex-acts">
                    <button className="ex-btn" onClick={onClose}>Cancel</button>
                    <button className="ex-btn-p" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
                </div>
            </div>
        </div>
    );
}
