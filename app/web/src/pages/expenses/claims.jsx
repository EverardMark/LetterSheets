import { useState, useEffect, useCallback, useMemo } from "react";
import { I } from "../../layouts/ERPLayout";
import { getPermissions } from "../../utils/permissions";
import { api, asList, loadAccounts, loadEmployees, peso, fmtDate, today, Empty, StatusPill, STATUS_HINT, CLAIM_STATUSES, fileToBase64 } from "./shared";

/* ================================================================
   EXPENSES — Claims

   Everyone can file their own claim; the server scopes the list to the
   caller's own employee record unless they hold expenses/view. So this one
   view serves both "my reimbursements" and "everyone's claims" without a
   separate self-service page — what changes is the columns and the buttons.
================================================================ */

export default function ClaimsView() {
    const perms = getPermissions();
    const canSeeAll = perms.can("expenses", "view");
    const canApprove = perms.can("expenses", "approve");
    const canPay = perms.can("expenses", "pay");

    const [claims, setClaims] = useState([]);
    const [status, setStatus] = useState("all");
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");
    const [editing, setEditing] = useState(null);   // claim object or {} for new
    const [viewing, setViewing] = useState(null);   // claim id

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setClaims(asList(await api("get_exp_claims", { status: status === "all" ? "" : status }), "claims"));
            setErr("");
        } catch (e) { setErr(e.message); }
        setLoading(false);
    }, [status]);

    useEffect(() => { load(); }, [load]);

    return (
        <div>
            <div className="ex-head">
                <div>
                    <h1 className="ex-title">{canSeeAll ? "Expense claims" : "My expense claims"}</h1>
                    <p className="ex-sub">Money you spent on the company's behalf, and what it owes you back.</p>
                </div>
                <button className="ex-btn-p" onClick={() => setEditing({})}><I name="plus" size={13}/> New claim</button>
            </div>

            {err && <div className="ex-err"><I name="alert-triangle" size={14}/> {err}</div>}

            <div className="ex-bar">
                <span className="ex-bar-count">{claims.length} claim{claims.length === 1 ? "" : "s"}</span>
                {["all", ...CLAIM_STATUSES].map(s => (
                    <button key={s} className={`ex-tab${status === s ? " ex-tab-on" : ""}`} onClick={() => setStatus(s)}>
                        {s === "all" ? "All" : s}
                    </button>
                ))}
            </div>

            <div className="ex-card">
                {loading ? <div className="ex-m" style={{ padding: 12 }}>Loading…</div> : claims.length === 0 ? (
                    <Empty icon="receipt" title="No claims here"
                           desc="File a claim for anything you paid for out of pocket — fare, meals, supplies — and attach the receipt."
                           action="New claim" onAction={() => setEditing({})}/>
                ) : (
                    <table className="ex-tbl">
                        <thead>
                        <tr>
                            <th>#</th>
                            {canSeeAll && <th>Employee</th>}
                            <th>Title</th><th>Date</th>
                            <th className="ex-r">Lines</th><th className="ex-r">Amount</th>
                            <th>Status</th>
                        </tr>
                        </thead>
                        <tbody>
                        {claims.map(c => (
                            <tr key={c.id} className="ex-click" onClick={() => setViewing(c.id)}>
                                <td className="ex-m ex-num">{c.claim_number}</td>
                                {canSeeAll && <td>{c.employee_name?.trim() || "—"}</td>}
                                <td className="ex-b">{c.title}</td>
                                <td className="ex-m">{fmtDate(c.claim_date)}</td>
                                <td className="ex-r ex-m">{c.line_count}{c.receipt_count > 0 && <> · <I name="paperclip" size={10}/></>}</td>
                                <td className="ex-r ex-b ex-num">{peso(c.total_amount)}</td>
                                <td><StatusPill status={c.status}/></td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                )}
            </div>

            {editing && <ClaimEditor claim={editing} canFileForOthers={perms.can("expenses", "create")}
                                     onClose={() => setEditing(null)}
                                     onSaved={(id) => { setEditing(null); load(); setViewing(id); }}/>}

            {viewing && <ClaimDetail id={viewing} canApprove={canApprove} canPay={canPay}
                                     onClose={() => setViewing(null)}
                                     onEdit={(c) => { setViewing(null); setEditing(c); }}
                                     onChanged={load}/>}
        </div>
    );
}

/* ================================================================
   EDITOR — header + line grid + receipts
================================================================ */

const blankLine = () => ({ expense_date: today(), category_id: "", description: "", merchant: "", receipt_no: "", amount: "", tax_amount: "" });

function ClaimEditor({ claim, canFileForOthers, onClose, onSaved }) {
    const isNew = !claim.id;
    const [title, setTitle] = useState(claim.title || "");
    const [purpose, setPurpose] = useState(claim.purpose || "");
    const [claimDate, setClaimDate] = useState(claim.claim_date || today());
    const [method, setMethod] = useState(claim.payment_method || "Cash");
    const [employeeID, setEmployeeID] = useState(claim.employee_id || "");
    const [lines, setLines] = useState(
        claim.lines?.length
            ? claim.lines.map(l => ({ ...l, amount: String(l.amount), tax_amount: String(l.tax_amount || "") }))
            : [blankLine()]
    );
    const [cats, setCats] = useState([]);
    const [emps, setEmps] = useState([]);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    useEffect(() => {
        api("get_exp_categories", { active_only: true }).then(c => setCats(asList(c, "categories"))).catch(() => setCats([]));
        if (canFileForOthers) loadEmployees().then(setEmps).catch(() => setEmps([]));
    }, [canFileForOthers]);

    const totals = useMemo(() => {
        let sub = 0, tax = 0;
        for (const l of lines) { sub += Number(l.amount) || 0; tax += Number(l.tax_amount) || 0; }
        return { sub, tax, total: sub + tax };
    }, [lines]);

    const setLine = (i, patch) => setLines(prev => prev.map((l, j) => j === i ? { ...l, ...patch } : l));
    const addLine = () => setLines(prev => [...prev, blankLine()]);
    const dropLine = (i) => setLines(prev => prev.length === 1 ? prev : prev.filter((_, j) => j !== i));

    const save = async () => {
        if (!title.trim()) { setErr("Give the claim a title."); return; }
        const payload = {
            id: claim.id, title, purpose, claim_date: claimDate, payment_method: method,
            employee_id: employeeID || undefined,
            lines: lines.map(l => ({
                expense_date: l.expense_date, category_id: l.category_id || "",
                account_id: l.account_id || "", description: l.description,
                merchant: l.merchant, receipt_no: l.receipt_no,
                amount: Number(l.amount) || 0, tax_amount: Number(l.tax_amount) || 0,
            })),
        };
        setBusy(true);
        try {
            const saved = await api(isNew ? "create_exp_claim" : "update_exp_claim", payload);
            onSaved(saved.id);
        } catch (e) { setErr(e.message); setBusy(false); }
    };

    const noCats = cats.length === 0;

    return (
        <div className="ex-ov" onClick={onClose}>
            <div className="ex-mod" onClick={e => e.stopPropagation()}>
                <div className="ex-mod-t">{isNew ? "New expense claim" : `Edit claim #${claim.claim_number}`}</div>
                <div className="ex-mod-s">
                    Each line is one receipt. Pick the category that matches what you bought — that is what tells
                    accounting which expense account it belongs to.
                </div>

                {err && <div className="ex-err"><I name="alert-triangle" size={14}/> {err}</div>}
                {noCats && (
                    <div className="ex-err">
                        No expense categories are set up yet. Someone with expense settings access needs to create
                        them (and map each to a GL account) before a claim can be filed.
                    </div>
                )}

                <div className="ex-row2">
                    <div className="ex-fld">
                        <label className="ex-lbl">Title</label>
                        <input className="ex-in" placeholder="Client visit — Cebu" value={title} onChange={e => setTitle(e.target.value)}/>
                    </div>
                    <div className="ex-fld">
                        <label className="ex-lbl">Claim date</label>
                        <input className="ex-in" type="date" value={claimDate} onChange={e => setClaimDate(e.target.value)}/>
                    </div>
                </div>

                <div className="ex-row2">
                    <div className="ex-fld">
                        <label className="ex-lbl">Reimburse via</label>
                        <select className="ex-in" value={method} onChange={e => setMethod(e.target.value)}>
                            <option value="Cash">Cash / bank transfer</option>
                            <option value="Payroll">Next payroll run</option>
                        </select>
                    </div>
                    {canFileForOthers && isNew && (
                        <div className="ex-fld">
                            <label className="ex-lbl">Filing for</label>
                            <select className="ex-in" value={employeeID} onChange={e => setEmployeeID(e.target.value)}>
                                <option value="">Myself</option>
                                {emps.map(e => (
                                    <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                <div className="ex-fld">
                    <label className="ex-lbl">Purpose <span style={{ color: "#bbb", fontWeight: 400 }}>(optional)</span></label>
                    <input className="ex-in" placeholder="What was this for?" value={purpose} onChange={e => setPurpose(e.target.value)}/>
                </div>

                <label className="ex-lbl">Expenses</label>
                <div className="ex-lines">
                    <table>
                        <thead>
                        <tr>
                            <th style={{ width: 122 }}>Date</th>
                            <th style={{ width: 130 }}>Category</th>
                            <th>Description</th>
                            <th style={{ width: 108 }}>OR / receipt no.</th>
                            <th style={{ width: 96 }}>Amount</th>
                            <th style={{ width: 86 }}>Input VAT</th>
                            <th style={{ width: 28 }}/>
                        </tr>
                        </thead>
                        <tbody>
                        {lines.map((l, i) => (
                            <tr key={i}>
                                <td><input className="ex-in" type="date" value={l.expense_date} onChange={e => setLine(i, { expense_date: e.target.value })}/></td>
                                <td>
                                    <select className="ex-in" value={l.category_id} onChange={e => setLine(i, { category_id: e.target.value })}>
                                        <option value="">Choose…</option>
                                        {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </td>
                                <td><input className="ex-in" placeholder="Taxi to client site" value={l.description} onChange={e => setLine(i, { description: e.target.value })}/></td>
                                <td><input className="ex-in" value={l.receipt_no} onChange={e => setLine(i, { receipt_no: e.target.value })}/></td>
                                <td><input className="ex-in ex-r" type="number" step="0.01" min="0" value={l.amount} onChange={e => setLine(i, { amount: e.target.value })}/></td>
                                <td><input className="ex-in ex-r" type="number" step="0.01" min="0" value={l.tax_amount} onChange={e => setLine(i, { tax_amount: e.target.value })}/></td>
                                <td>
                                    <button className="ex-btn ex-btn-sm" title="Remove line" onClick={() => dropLine(i)} style={{ padding: "4px 6px" }}>
                                        <I name="x" size={11}/>
                                    </button>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
                <div className="ex-lines-tot">
                    <span>Subtotal <b>{peso(totals.sub)}</b></span>
                    <span>Input VAT <b>{peso(totals.tax)}</b></span>
                    <span>Total <b>{peso(totals.total)}</b></span>
                </div>
                <button className="ex-btn ex-btn-sm" style={{ marginTop: 10 }} onClick={addLine}><I name="plus" size={11}/> Add line</button>

                <div className="ex-acts">
                    <button className="ex-btn" onClick={onClose}>Cancel</button>
                    <button className="ex-btn-p" disabled={busy || noCats} onClick={save}>{busy ? "Saving…" : "Save claim"}</button>
                </div>
            </div>
        </div>
    );
}

/* ================================================================
   DETAIL — lines, receipts, and whichever actions the claim's
   status and the viewer's rights actually allow.
================================================================ */

function ClaimDetail({ id, canApprove, canPay, onClose, onEdit, onChanged }) {
    const [c, setC] = useState(null);
    const [busy, setBusy] = useState("");
    const [err, setErr] = useState("");
    const [payOpen, setPayOpen] = useState(false);

    const load = useCallback(async () => {
        try { setC(await api("get_exp_claim", { id })); setErr(""); }
        catch (e) { setErr(e.message); }
    }, [id]);
    useEffect(() => { load(); }, [load]);

    const act = async (action, body, confirmMsg) => {
        if (confirmMsg && !window.confirm(confirmMsg)) return;
        setBusy(action);
        try {
            await api(action, { id, ...body });
            await load();
            onChanged();
            setErr("");
        } catch (e) { setErr(e.message); }
        setBusy("");
    };

    const reject = () => {
        const reason = window.prompt("Why is this being returned? The claimant will see this.");
        if (reason === null) return;
        act("reject_exp_claim", { reason });
    };

    const upload = async (file) => {
        if (!file) return;
        setBusy("upload");
        try {
            const dataUrl = await fileToBase64(file);
            await api("upload_exp_receipt", { claim_id: id, file_name: file.name, mime_type: file.type, file_data: dataUrl });
            await load();
            onChanged();
            setErr("");
        } catch (e) { setErr(e.message); }
        setBusy("");
    };

    const download = async (rc) => {
        try {
            const d = await api("download_exp_receipt", { id: rc.id });
            const a = document.createElement("a");
            a.href = `data:${d.mime_type};base64,${d.file_data}`;
            a.download = d.file_name;
            a.click();
        } catch (e) { setErr(e.message); }
    };

    if (!c) {
        return (
            <div className="ex-ov" onClick={onClose}>
                <div className="ex-mod ex-mod-sm" onClick={e => e.stopPropagation()}>
                    {err ? <div className="ex-err">{err}</div> : <div className="ex-m">Loading…</div>}
                </div>
            </div>
        );
    }

    const editable = c.status === "Draft" || c.status === "Rejected";

    return (
        <div className="ex-ov" onClick={onClose}>
            <div className="ex-mod" onClick={e => e.stopPropagation()}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div>
                        <div className="ex-mod-t">Claim #{c.claim_number} — {c.title}</div>
                        <div className="ex-mod-s" style={{ marginBottom: 10 }}>{STATUS_HINT[c.status]}</div>
                    </div>
                    <StatusPill status={c.status}/>
                </div>

                {err && <div className="ex-err"><I name="alert-triangle" size={14}/> {err}</div>}
                {c.status === "Rejected" && c.reject_reason && (
                    <div className="ex-err" style={{ background: "#fffbeb", borderColor: "#fde68a", color: "#92400e" }}>
                        Returned: {c.reject_reason}
                    </div>
                )}

                <div className="ex-detail-grid">
                    <span>Employee</span><b>{c.employee_name?.trim() || "—"}</b>
                    <span>Claim date</span><b>{fmtDate(c.claim_date)}</b>
                    {c.period_start && <><span>Covers</span><b>{fmtDate(c.period_start)} – {fmtDate(c.period_end)}</b></>}
                    <span>Reimburse via</span><b>{c.payment_method === "Payroll" ? "Next payroll run" : "Cash / bank"}</b>
                    {c.purpose && <><span>Purpose</span><b style={{ fontWeight: 400 }}>{c.purpose}</b></>}
                    {c.paid_at && <><span>Paid</span><b>{fmtDate(c.paid_at)}{c.payment_reference ? ` · ${c.payment_reference}` : ""}</b></>}
                </div>

                <div className="ex-lines">
                    <table>
                        <thead>
                        <tr>
                            <th style={{ width: 100 }}>Date</th><th>Description</th>
                            <th style={{ width: 130 }}>Account</th>
                            <th style={{ width: 90 }} className="ex-r">Amount</th>
                            <th style={{ width: 80 }} className="ex-r">VAT</th>
                        </tr>
                        </thead>
                        <tbody>
                        {(c.lines || []).map(l => (
                            <tr key={l.id}>
                                <td className="ex-m">{fmtDate(l.expense_date)}</td>
                                <td>
                                    {l.description}
                                    {l.receipt_no && <span className="ex-m"> · OR {l.receipt_no}</span>}
                                </td>
                                <td className="ex-m">{l.account_code} {l.account_name}</td>
                                <td className="ex-r ex-num">{peso(l.amount)}</td>
                                <td className="ex-r ex-num ex-m">{l.tax_amount ? peso(l.tax_amount) : "—"}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
                <div className="ex-lines-tot" style={{ marginBottom: 16 }}>
                    <span>Subtotal <b>{peso(c.subtotal)}</b></span>
                    <span>Input VAT <b>{peso(c.tax_total)}</b></span>
                    <span>Total <b>{peso(c.total_amount)}</b></span>
                </div>

                <label className="ex-lbl">Receipts</label>
                {(c.receipts || []).length === 0
                    ? <div className="ex-info" style={{ marginBottom: 10 }}>No receipts attached.</div>
                    : (c.receipts || []).map(rc => (
                        <div key={rc.id} className="ex-rcpt">
                            <I name="paperclip" size={13}/>
                            <span className="ex-rcpt-n">{rc.file_name}</span>
                            <span className="ex-rcpt-s">{Math.round(rc.file_size / 1024)} KB</span>
                            <button className="ex-btn ex-btn-sm" onClick={() => download(rc)}><I name="download" size={11}/></button>
                            {editable && (
                                <button className="ex-btn-d ex-btn-sm" onClick={() => act("delete_exp_receipt", { id: rc.id })}>
                                    <I name="trash-2" size={11}/>
                                </button>
                            )}
                        </div>
                    ))}
                {editable && (
                    <label className="ex-btn ex-btn-sm" style={{ marginTop: 4 }}>
                        <I name="upload" size={11}/> {busy === "upload" ? "Uploading…" : "Attach receipt"}
                        <input type="file" style={{ display: "none" }} accept="image/*,.pdf"
                               onChange={e => upload(e.target.files?.[0])}/>
                    </label>
                )}

                <div className="ex-acts">
                    <button className="ex-btn" onClick={onClose}>Close</button>

                    {editable && <button className="ex-btn" onClick={() => onEdit(c)}><I name="edit-2" size={11}/> Edit</button>}
                    {editable && (
                        <button className="ex-btn-p" disabled={busy === "submit_exp_claim"}
                                onClick={() => act("submit_exp_claim", {})}>
                            {busy === "submit_exp_claim" ? "Submitting…" : "Submit for approval"}
                        </button>
                    )}

                    {canApprove && c.status === "Submitted" && (<>
                        <button className="ex-btn-w" onClick={reject}>Return</button>
                        <button className="ex-btn-p" disabled={busy === "approve_exp_claim"}
                                onClick={() => act("approve_exp_claim", {})}>
                            {busy === "approve_exp_claim" ? "Approving…" : "Approve"}
                        </button>
                    </>)}

                    {canApprove && c.status === "Approved" && (
                        <button className="ex-btn-w" disabled={busy === "unapprove_exp_claim"}
                                onClick={() => act("unapprove_exp_claim", {},
                                    "Un-approve this claim? The accrual journal entry will be voided.")}>
                            Un-approve
                        </button>
                    )}

                    {canPay && c.status === "Approved" && (
                        <button className="ex-btn-p" onClick={() => setPayOpen(true)}>Record payment</button>
                    )}

                    {canPay && c.status === "Paid" && (
                        <button className="ex-btn-w" disabled={busy === "unpay_exp_claim"}
                                onClick={() => act("unpay_exp_claim", {},
                                    "Reverse this payment? The payment journal entry will be voided.")}>
                            Reverse payment
                        </button>
                    )}
                </div>

                {payOpen && <PayModal claim={c} onClose={() => setPayOpen(false)}
                                      onDone={() => { setPayOpen(false); load(); onChanged(); }}/>}
            </div>
        </div>
    );
}

/* ---------------------------------------------------------------- */

function PayModal({ claim, onClose, onDone }) {
    const [date, setDate] = useState(today());
    const [account, setAccount] = useState("");
    const [reference, setReference] = useState("");
    const [accounts, setAccounts] = useState([]);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    useEffect(() => {
        (async () => {
            try {
                const [assets, settings] = await Promise.all([
                    loadAccounts("Asset"),
                    api("get_exp_settings"),
                ]);
                setAccounts(assets);
                if (settings?.default_cash_account_id) setAccount(settings.default_cash_account_id);
            } catch { /* the picker still works, just without a default */ }
        })();
    }, []);

    const submit = async () => {
        setBusy(true);
        try {
            await api("pay_exp_claim", { id: claim.id, payment_date: date, account_id: account, reference });
            onDone();
        } catch (e) { setErr(e.message); setBusy(false); }
    };

    return (
        <div className="ex-ov" onClick={onClose}>
            <div className="ex-mod ex-mod-sm" onClick={e => e.stopPropagation()}>
                <div className="ex-mod-t">Record payment</div>
                <div className="ex-mod-s">
                    Posts {peso(claim.total_amount)} against the employee payable and credits the account you pick.
                </div>
                {err && <div className="ex-err">{err}</div>}
                <div className="ex-fld">
                    <label className="ex-lbl">Payment date</label>
                    <input className="ex-in" type="date" value={date} onChange={e => setDate(e.target.value)}/>
                </div>
                <div className="ex-fld">
                    <label className="ex-lbl">Paid from</label>
                    <select className="ex-in" value={account} onChange={e => setAccount(e.target.value)}>
                        <option value="">Use the default cash account…</option>
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                    </select>
                </div>
                <div className="ex-fld">
                    <label className="ex-lbl">Reference <span style={{ color: "#bbb", fontWeight: 400 }}>(optional)</span></label>
                    <input className="ex-in" placeholder="Cheque no. / transfer ref" value={reference} onChange={e => setReference(e.target.value)}/>
                </div>
                <div className="ex-acts">
                    <button className="ex-btn" onClick={onClose}>Cancel</button>
                    <button className="ex-btn-p" disabled={busy} onClick={submit}>{busy ? "Posting…" : "Record payment"}</button>
                </div>
            </div>
        </div>
    );
}
