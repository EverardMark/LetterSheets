import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";
import { getPermissions } from "../../utils/permissions";
import { Term, SimpleHint } from "../components/simplemode";
import { useIsSimple } from "../../utils/uimode";

/* ================================================================
   ACCOUNTING — Periods & Year-End Close

   Two things live on this page:

     1. The fiscal calendar. Generating a year creates its periods; each
        period can be Open, Closed or Locked. Anything other than Open
        makes the server refuse a journal posting dated inside it.

     2. The year-end close. It posts a real journal entry that zeroes every
        Revenue and Expense account into equity, then closes every period in
        the year. The preview shows exactly what will be posted first —
        nothing here happens without the user seeing the numbers.

   Until a company generates its first year, the ledger behaves exactly as it
   did before: no period rows means no date is restricted.
================================================================ */

const API_URL = (import.meta.env.VITE_API_BASE || "") + "/api/execute";

async function api(action, body = {}) {
    const session = localStorage.getItem("ls_session");
    const res = await fetch(`${API_URL}?action=${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session}` } : {}) },
        body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || (json && json.success === false)) {
        throw new Error(json?.error || json?.message || `API ${action} failed (${res.status})`);
    }
    return json?.data ?? json;
}

const peso = (n) => "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s) => {
    if (!s) return "—";
    const d = new Date(String(s).slice(0, 10) + "T00:00:00");
    return isNaN(d) ? s : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const STATUS_COLOR = { Open: "#22c55e", Closed: "#f59e0b", Locked: "#ef4444" };

export default function PeriodsView() {
    const simple = useIsSimple();
    // In Simple mode the raw statuses ("Closed", "Locked") are confusing, so they
    // read as a plain lock state. Colours are unchanged.
    const statusText = (s) => !simple ? s : (s === "Closed" ? "Locked" : s === "Locked" ? "Final" : "Open");
    const perms = getPermissions();
    const canClose = perms.can("accounting", "close");
    const canCreate = perms.can("accounting", "create");
    const canDelete = perms.can("accounting", "delete");

    const [years, setYears] = useState([]);
    const [selected, setSelected] = useState(null);
    const [periods, setPeriods] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState("");
    const [err, setErr] = useState("");
    const [showGen, setShowGen] = useState(false);
    const [preview, setPreview] = useState(null);

    const loadYears = useCallback(async (keepId) => {
        setLoading(true);
        try {
            const list = await api("get_fiscal_years");
            setYears(list || []);
            const pick = (list || []).find(y => y.id === keepId) || (list || [])[0] || null;
            setSelected(pick);
            setPeriods(pick ? await api("get_fiscal_periods", { fiscal_year_id: pick.id }) : []);
            setErr("");
        } catch (e) { setErr(e.message); }
        setLoading(false);
    }, []);

    useEffect(() => { loadYears(); }, [loadYears]);

    const selectYear = async (y) => {
        setSelected(y);
        setPreview(null);
        try { setPeriods(await api("get_fiscal_periods", { fiscal_year_id: y.id })); }
        catch (e) { setErr(e.message); }
    };

    const refresh = () => loadYears(selected?.id);

    const setStatus = async (period, status) => {
        setBusy(period.id);
        try {
            await api("set_period_status", { id: period.id, status });
            setPeriods(await api("get_fiscal_periods", { fiscal_year_id: selected.id }));
            setErr("");
        } catch (e) { setErr(e.message); }
        setBusy("");
    };

    const bulkStatus = async (status) => {
        if (!window.confirm(`Set every period in ${selected.name} to ${status}?`)) return;
        setBusy("bulk");
        try {
            await api("set_all_period_status", { fiscal_year_id: selected.id, status });
            await refresh();
            setErr("");
        } catch (e) { setErr(e.message); }
        setBusy("");
    };

    const openPreview = async () => {
        setBusy("preview");
        try {
            setPreview(await api("get_close_preview", { fiscal_year_id: selected.id }));
            setErr("");
        } catch (e) { setErr(e.message); }
        setBusy("");
    };

    const reopen = async () => {
        if (!window.confirm(
            `Reopen ${selected.name}?\n\nThis voids the closing journal entry and allows postings into the year again. Locked periods stay locked.`
        )) return;
        setBusy("reopen");
        try {
            await api("reopen_fiscal_year", { fiscal_year_id: selected.id });
            await refresh();
            setErr("");
        } catch (e) { setErr(e.message); }
        setBusy("");
    };

    const removeYear = async () => {
        if (!window.confirm(`Delete ${selected.name} and its periods? Postings already made are not affected.`)) return;
        setBusy("delete");
        try {
            await api("delete_fiscal_year", { id: selected.id });
            await loadYears();
            setErr("");
        } catch (e) { setErr(e.message); }
        setBusy("");
    };

    return (
        <div className="fp">
            <div className="fp-head">
                <div>
                    <h1 className="fp-title"><Term simple="Year Setup" advanced="Periods & Close" /></h1>
                    <p className="fp-sub">
                        <Term
                            simple="Lock finished months so nobody can change them by mistake."
                            advanced="Control which dates the ledger will still accept postings for."
                        />
                    </p>
                </div>
                {canCreate && <button className="fp-btn-p" onClick={() => setShowGen(true)}><I name="plus" size={13}/> <Term simple="Set up a year" advanced="New fiscal year" /></button>}
            </div>

            {err && <div className="fp-err"><I name="alert-triangle" size={14}/> {err}</div>}

            <SimpleHint icon="bulb">
                Once you've finished a month — reports sent, taxes filed — lock it here so no one accidentally
                edits it later. You can always unlock it again if you have permission.
            </SimpleHint>

            {loading ? <div className="fp-card fp-muted">Loading…</div> : years.length === 0 ? (
                <div className="fp-card fp-empty">
                    <div className="fp-empty-ic"><I name="lock" size={26}/></div>
                    <div className="fp-empty-t">{simple ? "No year set up yet" : "No fiscal calendar yet"}</div>
                    <div className="fp-empty-d">
                        <Term
                            simple="Set up your business year to start locking finished months. Until you do, any date stays editable."
                            advanced="Without one, any date can be posted to — including prior years you have already reported on. Generate a year to start controlling that."
                        />
                    </div>
                    {canCreate && <button className="fp-btn-p" style={{ marginTop: 16 }} onClick={() => setShowGen(true)}>{simple ? "Set up a year" : "Generate a fiscal year"}</button>}
                </div>
            ) : (
                <div className="fp-grid">
                    <div className="fp-side">
                        {years.map(y => (
                            <button key={y.id}
                                    className={`fp-year${selected?.id === y.id ? " fp-year-on" : ""}`}
                                    onClick={() => selectYear(y)}>
                                <div className="fp-year-n">{y.name}</div>
                                <div className="fp-year-d">{fmtDate(y.start_date)} – {fmtDate(y.end_date)}</div>
                                <span className="fp-pill" style={{ background: STATUS_COLOR[y.status] + "1a", color: STATUS_COLOR[y.status] }}>
                                    {statusText(y.status)}
                                </span>
                            </button>
                        ))}
                    </div>

                    <div className="fp-main">
                        {selected && (<>
                            <div className="fp-card">
                                <div className="fp-bar">
                                    <div>
                                        <div className="fp-bar-t">{selected.name}</div>
                                        <div className="fp-bar-s">
                                            {selected.open_period_count} of {selected.period_count} {simple ? "months open" : "periods open"}
                                            {selected.status === "Closed" && selected.net_income != null &&
                                                <> · <Term simple={`${peso(selected.net_income)} profit moved to owner's funds`}
                                                          advanced={`net result ${peso(selected.net_income)} rolled to equity`} /></>}
                                        </div>
                                    </div>
                                    <div className="fp-bar-a">
                                        {canClose && selected.status === "Open" && (
                                            <>
                                                <button className="fp-btn" disabled={busy==="bulk"} onClick={() => bulkStatus("Closed")}>{simple ? "Lock all months" : "Close all periods"}</button>
                                                <button className="fp-btn-p" disabled={busy==="preview"} onClick={openPreview}>
                                                    {busy==="preview" ? "Checking…" : (simple ? "Finish the year…" : "Close year…")}
                                                </button>
                                            </>
                                        )}
                                        {canClose && selected.status === "Closed" && (
                                            <button className="fp-btn-w" disabled={busy==="reopen"} onClick={reopen}>
                                                {busy==="reopen" ? "Reopening…" : (simple ? "Unlock the year" : "Reopen year")}
                                            </button>
                                        )}
                                        {canDelete && selected.status === "Open" && (
                                            <button className="fp-btn-d" disabled={busy==="delete"} onClick={removeYear}>Delete</button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="fp-card">
                                <table className="fp-tbl">
                                    <thead>
                                    <tr>
                                        <th>{simple ? "Month" : "Period"}</th><th>Dates</th>
                                        <th className="fp-r">{simple ? "Entries" : "Posted"}</th><th className="fp-r">Drafts</th>
                                        <th className="fp-r">{simple ? "Total" : "Debits"}</th>
                                        <th>Status</th><th/>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {periods.map(p => (
                                        <tr key={p.id}>
                                            <td className="fp-b">{p.name}</td>
                                            <td className="fp-m">{fmtDate(p.start_date)} – {fmtDate(p.end_date)}</td>
                                            <td className="fp-r">{p.entry_count}</td>
                                            <td className={`fp-r${p.draft_count ? " fp-warn" : ""}`}>{p.draft_count || "—"}</td>
                                            <td className="fp-r fp-m">{peso(p.posted_debit)}</td>
                                            <td>
                                                <span className="fp-pill" style={{ background: STATUS_COLOR[p.status] + "1a", color: STATUS_COLOR[p.status] }}>
                                                    {statusText(p.status)}
                                                </span>
                                            </td>
                                            <td className="fp-r">
                                                {canClose && p.status !== "Locked" && (
                                                    <select className="fp-sel"
                                                            value={p.status}
                                                            disabled={busy === p.id}
                                                            onChange={e => setStatus(p, e.target.value)}>
                                                        <option value="Open">{simple ? "Open (editable)" : "Open"}</option>
                                                        <option value="Closed">{simple ? "Locked" : "Closed"}</option>
                                                        <option value="Locked">{simple ? "Locked for good" : "Locked (final)"}</option>
                                                    </select>
                                                )}
                                                {p.status === "Locked" && <span className="fp-m">final</span>}
                                            </td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                                <div className="fp-note">
                                    <Term
                                        simple={<><b>Locked for good</b> can't be undone — use it once you've filed your taxes for that month. <b>Locked</b> can be unlocked again if you need to fix something.</>}
                                        advanced={<><b>Locked</b> is permanent from here — use it for periods already filed with the BIR. <b>Closed</b> can be reopened by anyone with the Close Periods right.</>}
                                    />
                                </div>
                            </div>
                        </>)}
                    </div>
                </div>
            )}

            {showGen && <GenerateModal onClose={() => setShowGen(false)} onDone={(id) => { setShowGen(false); loadYears(id); }} />}
            {preview && <CloseModal preview={preview} onClose={() => setPreview(null)}
                                    onDone={() => { setPreview(null); refresh(); }} />}

            <style>{`
        .fp{max-width:1200px}
        .fp-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;gap:14px}
        .fp-title{font-size:20px;font-weight:700;color:#222}
        .fp-sub{font-size:12px;color:#999;margin-top:3px}
        .fp-card{background:#fff;border:1px solid #eee;border-radius:12px;padding:16px;margin-bottom:14px}
        .fp-muted{color:#999;font-size:13px}
        .fp-err{background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;font-size:12px;padding:9px 12px;border-radius:9px;margin-bottom:14px;display:flex;align-items:center;gap:7px}
        .fp-grid{display:grid;grid-template-columns:210px 1fr;gap:14px}
        @media(max-width:820px){.fp-grid{grid-template-columns:1fr}}
        .fp-side{display:flex;flex-direction:column;gap:8px}
        .fp-year{text-align:left;background:#fff;border:1px solid #eee;border-radius:10px;padding:11px 12px;cursor:pointer;font-family:inherit;transition:all .15s}
        .fp-year:hover{border-color:#cfe9e2}
        .fp-year-on{border-color:#2d9e8b;background:#f6fbfa}
        .fp-year-n{font-size:13px;font-weight:700;color:#333}
        .fp-year-d{font-size:11px;color:#999;margin:2px 0 6px}
        .fp-bar{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap}
        .fp-bar-t{font-size:15px;font-weight:700;color:#333}
        .fp-bar-s{font-size:11px;color:#999;margin-top:2px}
        .fp-bar-a{display:flex;gap:8px;flex-wrap:wrap}
        .fp-pill{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.03em}
        .fp-tbl{width:100%;border-collapse:collapse;font-size:12px}
        .fp-tbl th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#aaa;font-weight:600;padding:0 8px 8px;border-bottom:1px solid #f0f0f0}
        .fp-tbl td{padding:9px 8px;border-bottom:1px solid #f7f7f7;color:#555}
        .fp-r{text-align:right}
        .fp-b{font-weight:600;color:#333}
        .fp-m{color:#999}
        .fp-warn{color:#f59e0b;font-weight:700}
        .fp-sel{font-family:inherit;font-size:11px;padding:3px 6px;border:1px solid #eee;border-radius:6px;background:#fff;color:#555;cursor:pointer}
        .fp-note{font-size:11px;color:#999;margin-top:12px;line-height:1.6}
        .fp-note b{color:#666}
        .fp-empty{text-align:center;padding:34px 20px}
        .fp-empty-ic{width:58px;height:58px;border-radius:50%;background:#f3f5f4;color:#ccc;display:flex;align-items:center;justify-content:center;margin:0 auto 12px}
        .fp-empty-t{font-size:15px;font-weight:700;color:#444}
        .fp-empty-d{font-size:12px;color:#999;max-width:420px;margin:6px auto 0;line-height:1.6}
        .fp-btn,.fp-btn-p,.fp-btn-w,.fp-btn-d{font-family:inherit;font-size:12px;font-weight:600;padding:7px 13px;border-radius:8px;cursor:pointer;border:1px solid #eee;background:#fff;color:#666;display:inline-flex;align-items:center;gap:6px}
        .fp-btn:hover{border-color:#ddd}
        .fp-btn-p{background:#2d9e8b;border-color:#2d9e8b;color:#fff}
        .fp-btn-p:hover{background:#268a79}
        .fp-btn-w{background:#fff7ed;border-color:#fed7aa;color:#c2410c}
        .fp-btn-d{background:#fff;border-color:#fecaca;color:#dc2626}
        .fp-btn-p:disabled,.fp-btn:disabled,.fp-btn-w:disabled,.fp-btn-d:disabled{opacity:.55;cursor:default}
        .fp-ov{position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;z-index:900;padding:20px}
        .fp-mod{background:#fff;border-radius:14px;width:100%;max-width:640px;max-height:86vh;overflow:auto;padding:20px}
        .fp-mod-t{font-size:16px;font-weight:700;color:#222;margin-bottom:4px}
        .fp-mod-s{font-size:12px;color:#999;margin-bottom:16px;line-height:1.6}
        .fp-fld{margin-bottom:12px}
        .fp-lbl{display:block;font-size:11px;font-weight:600;color:#777;margin-bottom:5px}
        .fp-in{width:100%;font-family:inherit;font-size:13px;padding:8px 10px;border:1px solid #eee;border-radius:8px;color:#333}
        .fp-acts{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}
        .fp-warnbox{background:#fffbeb;border:1px solid #fde68a;color:#92400e;font-size:11.5px;padding:9px 11px;border-radius:8px;margin-bottom:12px;line-height:1.6}
        .fp-sum{display:grid;grid-template-columns:1fr auto;gap:5px 14px;font-size:12.5px;padding:12px;background:#fafafa;border-radius:9px;margin-bottom:14px}
        .fp-sum b{font-weight:700;color:#333}
        .fp-lines{max-height:210px;overflow:auto;border:1px solid #f0f0f0;border-radius:9px;margin-bottom:12px}
      `}</style>
        </div>
    );
}

/* ---------------------------------------------------------------- */

function GenerateModal({ onClose, onDone }) {
    const simple = useIsSimple();
    const thisYear = new Date().getFullYear();
    const [start, setStart] = useState(`${thisYear}-01-01`);
    const [name, setName] = useState("");
    const [count, setCount] = useState(12);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    const submit = async () => {
        setBusy(true);
        try {
            const y = await api("generate_fiscal_year", { name, start_date: start, period_count: Number(count) });
            onDone(y.id);
        } catch (e) { setErr(e.message); setBusy(false); }
    };

    return (
        <div className="fp-ov" onClick={onClose}>
            <div className="fp-mod" onClick={e => e.stopPropagation()}>
                <div className="fp-mod-t">{simple ? "Set up a year" : "New fiscal year"}</div>
                <div className="fp-mod-s">
                    <Term
                        simple="Your business year runs 12 months from the start date. Nothing is locked until you choose to lock a month later."
                        advanced="The year runs twelve months from its start date. Its periods start Open — nothing is restricted until you close one."
                    />
                </div>
                {err && <div className="fp-err">{err}</div>}
                <div className="fp-fld">
                    <label className="fp-lbl">Starts on</label>
                    <input className="fp-in" type="date" value={start} onChange={e => setStart(e.target.value)}/>
                </div>
                <div className="fp-fld">
                    <label className="fp-lbl"><Term simple="Split into" advanced="Divided into" /></label>
                    <select className="fp-in" value={count} onChange={e => setCount(e.target.value)}>
                        <option value={12}>{simple ? "12 months" : "12 monthly periods"}</option>
                        <option value={4}>{simple ? "4 quarters" : "4 quarterly periods"}</option>
                        <option value={13}>{simple ? "13 four-week blocks" : "13 four-week periods"}</option>
                    </select>
                </div>
                <div className="fp-fld">
                    <label className="fp-lbl">Name <span style={{ color: "#bbb", fontWeight: 400 }}>(optional)</span></label>
                    <input className="fp-in" placeholder={`FY${thisYear}`} value={name} onChange={e => setName(e.target.value)}/>
                </div>
                <div className="fp-acts">
                    <button className="fp-btn" onClick={onClose}>Cancel</button>
                    <button className="fp-btn-p" disabled={busy} onClick={submit}>{busy ? (simple ? "Setting up…" : "Generating…") : (simple ? "Set up" : "Generate")}</button>
                </div>
            </div>
        </div>
    );
}

/* ---------------------------------------------------------------- */

// CloseModal is the last stop before the ledger is written to, so it shows the
// full arithmetic — every account that will be zeroed, the net result, and where
// that result lands — rather than a bare "are you sure?".
function CloseModal({ preview, onClose, onDone }) {
    const simple = useIsSimple();
    const y = preview.fiscal_year;
    const [equity, setEquity] = useState(preview.suggested_equity_account?.id || "");
    const [accounts, setAccounts] = useState([]);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    useEffect(() => {
        // get_accounts answers {accounts:[...]}, not a bare array.
        api("get_accounts", { account_type: "Equity", active_only: true })
            .then(d => setAccounts(Array.isArray(d?.accounts ?? d) ? (d?.accounts ?? d) : []))
            .catch(() => setAccounts([]));
    }, []);

    const submit = async () => {
        if (!equity) { setErr("Choose the equity account to close into."); return; }
        setBusy(true);
        try {
            await api("close_fiscal_year", { fiscal_year_id: y.id, equity_account_id: equity });
            onDone();
        } catch (e) { setErr(e.message); setBusy(false); }
    };

    const rows = [...(preview.revenue || []), ...(preview.expenses || [])];

    return (
        <div className="fp-ov" onClick={onClose}>
            <div className="fp-mod" onClick={e => e.stopPropagation()}>
                <div className="fp-mod-t">{simple ? `Finish ${y.name}` : `Close ${y.name}`}</div>
                <div className="fp-mod-s">
                    <Term
                        simple={`This wraps up the year: it tallies your income and costs into profit, records that profit as the owner's, and locks the year. You can undo it by unlocking the year.`}
                        advanced={`This posts a journal entry dated ${fmtDate(y.end_date)} that zeroes every revenue and expense account, then closes all periods in the year. It can be undone by reopening the year.`}
                    />
                </div>

                {err && <div className="fp-err">{err}</div>}
                {(preview.warnings || []).map((wn, i) => <div key={i} className="fp-warnbox">{wn}</div>)}

                <div className="fp-sum">
                    <span><Term simple="Total income" advanced="Total revenue" /></span><b>{peso(preview.total_revenue)}</b>
                    <span><Term simple="Total costs" advanced="Total expenses" /></span><b>{peso(preview.total_expenses)}</b>
                    <span>{simple
                        ? (preview.net_income >= 0 ? "Profit for the year" : "Loss for the year")
                        : (preview.net_income >= 0 ? "Net income to equity" : "Net loss against equity")}</span>
                    <b style={{ color: preview.net_income >= 0 ? "#16a34a" : "#dc2626" }}>{peso(preview.net_income)}</b>
                </div>

                {rows.length > 0 && (
                    <div className="fp-lines">
                        <table className="fp-tbl" style={{ fontSize: 11.5 }}>
                            <tbody>
                            {rows.map(a => (
                                <tr key={a.account_id}>
                                    <td className="fp-m" style={{ width: 62 }}>{a.code}</td>
                                    <td>{a.name}</td>
                                    <td className="fp-r">{peso(a.balance)}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="fp-fld">
                    <label className="fp-lbl"><Term simple="Record the profit under" advanced="Close the net result into" /></label>
                    <select className="fp-in" value={equity} onChange={e => setEquity(e.target.value)}>
                        <option value="">{simple ? "Choose an owner's-funds account…" : "Select an equity account…"}</option>
                        {accounts.map(a => <option key={a.id} value={a.id}>{simple ? a.name : `${a.code} — ${a.name}`}</option>)}
                    </select>
                </div>

                <div className="fp-acts">
                    <button className="fp-btn" onClick={onClose}>Cancel</button>
                    <button className="fp-btn-p" disabled={busy || y.status !== "Open"} onClick={submit}>
                        {busy ? (simple ? "Finishing…" : "Closing…") : (simple ? "Finish the year" : "Post closing entry & close year")}
                    </button>
                </div>
            </div>
        </div>
    );
}
