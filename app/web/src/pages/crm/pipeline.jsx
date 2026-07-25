import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";
import {
    api, peso, fmtDate, Empty, OPEN_STAGES, ALL_STAGES, STAGE_COLOR,
    ACTIVITY_TYPES, ACTIVITY_ICON,
} from "./shared";
import { Term, SimpleHint } from "../components/simplemode";

export default function PipelineView() {
    const [opps, setOpps] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState(null);
    const [creating, setCreating] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try { const d = await api("get_crm_opportunities"); setOpps(d.opportunities || []); }
        catch { setOpps([]); }
        try { const c = await api("get_customers", { active_only: true }); setCustomers(Array.isArray(c) ? c : []); }
        catch { setCustomers([]); }
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const byStage = (st) => opps.filter(o => o.stage === st);
    const stageSum = (st) => byStage(st).reduce((s, o) => s + Number(o.amount || 0), 0);

    return (<>
        <SimpleHint icon="bulb">Your active deals, grouped by how close they are to closing.</SimpleHint>
        <div className="crm-bar">
            <span className="crm-bar-count">{opps.filter(o => OPEN_STAGES.includes(o.stage)).length} open · {opps.length} total</span>
            <button className="crm-btn-p" onClick={() => setCreating(true)}><I name="plus" size={14} /> <Term simple="New Deal" advanced="New Opportunity" /></button>
        </div>

        {loading ? null : opps.length === 0 ? (
            <Empty icon="chart" title={<Term simple="No deals yet" advanced="No opportunities yet" />} desc={<Term simple="Add a deal or convert a lead to get started." advanced="Add a deal or convert a lead to build your pipeline." />} action={<Term simple="New Deal" advanced="New Opportunity" />} onAction={() => setCreating(true)} />
        ) : (
            <div className="crm-board">
                {OPEN_STAGES.map(st => {
                    const list = byStage(st);
                    return (
                        <div key={st} className="crm-col">
                            <div className="crm-col-h">
                                <span className="crm-col-dot" style={{ background: STAGE_COLOR[st] }} />
                                <span className="crm-col-t">{st}</span>
                                <span className="crm-col-ct">{list.length}</span>
                            </div>
                            <div className="crm-col-sum">{peso(stageSum(st))}</div>
                            {list.map(o => <OppCard key={o.id} o={o} onClick={() => setSelected(o.id)} />)}
                        </div>
                    );
                })}
            </div>
        )}

        {/* Closed deals summary row */}
        {!loading && opps.length > 0 && (
            <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                {["Won", "Lost"].map(st => (
                    <div key={st} className="crm-card" style={{ flex: 1, margin: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span className="crm-col-dot" style={{ background: STAGE_COLOR[st] }} />
                            <span className="crm-col-t">{st}</span>
                            <span className="crm-col-ct" style={{ marginLeft: "auto" }}>{byStage(st).length} · {peso(stageSum(st))}</span>
                        </div>
                    </div>
                ))}
            </div>
        )}

        {selected && <OppDrawer id={selected} customers={customers} onClose={() => setSelected(null)} onChanged={load} />}
        {creating && <NewOppModal customers={customers} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
    </>);
}

function OppCard({ o, onClick }) {
    return (
        <div className="crm-opp" onClick={onClick}>
            <div className="crm-opp-nm">{o.name}</div>
            <div className="crm-opp-cust">{o.customer_name}</div>
            <div className="crm-opp-foot">
                <span className="crm-opp-amt">{peso(o.amount)}</span>
                <span className="crm-opp-prob" style={{ background: STAGE_COLOR[o.stage] || "#94a3b8" }}>{o.probability}%</span>
            </div>
            {o.expected_close_date && <div className="crm-sub" style={{ marginTop: 6 }}><I name="flag" size={10} /> {fmtDate(o.expected_close_date)}</div>}
        </div>
    );
}

/* ---- Opportunity drawer ---- */
function OppDrawer({ id, customers, onClose, onChanged }) {
    const [opp, setOpp] = useState(null);
    const [acts, setActs] = useState([]);
    const [err, setErr] = useState("");
    const [lostReason, setLostReason] = useState("");
    const [editing, setEditing] = useState(false);

    const load = useCallback(async () => {
        try {
            const list = await api("get_crm_opportunities");
            const o = (list.opportunities || []).find(x => x.id === id);
            setOpp(o || null);
        } catch (e) { setErr(e.message); }
        try { const a = await api("get_crm_activities", { related_type: "opportunity", related_id: id }); setActs(a.activities || []); }
        catch { setActs([]); }
    }, [id]);
    useEffect(() => { load(); }, [load]);

    const moveStage = async (stage) => {
        setErr("");
        if (stage === "Lost" && !lostReason) { setErr("Add a reason before marking Lost (field below)."); return; }
        try { await api("set_crm_opportunity_stage", { id, stage, lost_reason: lostReason }); await load(); onChanged(); }
        catch (e) { setErr(e.message); }
    };
    const makeQuote = async () => {
        setErr("");
        try { const r = await api("create_quote_from_opportunity", { id }); await load(); onChanged(); alert(`Quote #${r.quote_number} created in Sales.`); }
        catch (e) { setErr(e.message); }
    };
    const del = async () => {
        if (!window.confirm("Delete this opportunity?")) return;
        try { await api("delete_crm_opportunity", { id }); onChanged(); onClose(); } catch (e) { setErr(e.message); }
    };

    if (!opp) return (<>
        <div className="crm-modal-bg" onClick={onClose} />
        <div className="crm-drawer" />
    </>);

    return (<>
        <div className="crm-modal-bg" onClick={onClose} />
        <div className="crm-drawer">
            <div className="crm-modal-h">
                <div>
                    <div className="crm-modal-t">{opp.name}</div>
                    <div className="crm-modal-sub">{opp.customer_name} · {peso(opp.amount)}</div>
                </div>
                <button className="crm-x" onClick={onClose}><I name="x" size={16} /></button>
            </div>
            <div className="crm-modal-body">
                {err && <div className="crm-err">{err}</div>}

                <label className="crm-lbl">Stage</label>
                <div className="crm-stages">
                    {ALL_STAGES.map(s => (
                        <button key={s} className={`crm-stage-btn ${opp.stage === s ? "on" : ""}`}
                            style={opp.stage === s ? { background: STAGE_COLOR[s], borderColor: STAGE_COLOR[s] } : {}}
                            onClick={() => moveStage(s)}>{s}</button>
                    ))}
                </div>
                {opp.stage === "Lost" && (
                    <div className="crm-fld"><input className="crm-inp" placeholder="Reason lost…" value={lostReason || opp.lost_reason || ""} onChange={e => setLostReason(e.target.value)} onBlur={() => opp.stage === "Lost" && lostReason && moveStage("Lost")} /></div>
                )}

                <div className="crm-row2" style={{ margin: "6px 0 14px" }}>
                    <Info label="Probability" value={opp.probability + "%"} />
                    <Info label="Expected close" value={fmtDate(opp.expected_close_date)} />
                </div>
                {opp.notes && <div className="crm-fld"><label className="crm-lbl">Notes</label><div style={{ fontSize: 13, color: "#374151", whiteSpace: "pre-wrap" }}>{opp.notes}</div></div>}

                <div style={{ display: "flex", gap: 8, margin: "6px 0 18px" }}>
                    <button className="crm-btn-s" onClick={() => setEditing(true)}><I name="edit-2" size={12} /> Edit</button>
                    {opp.quote_id
                        ? <button className="crm-btn-s" disabled><I name="check" size={12} /> Quote created</button>
                        : <button className="crm-btn-s" onClick={makeQuote}><I name="file-text" size={12} /> Create quote</button>}
                    <button className="crm-btn-danger" style={{ marginLeft: "auto" }} onClick={del}>Delete</button>
                </div>

                <Activities relatedType="opportunity" relatedId={id} acts={acts} onChanged={load} />
            </div>
        </div>
        {editing && <NewOppModal customers={customers} existing={opp} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); onChanged(); }} />}
    </>);
}

function Info({ label, value }) {
    return <div><label className="crm-lbl">{label}</label><div style={{ fontSize: 13, fontWeight: 600, color: "#1f2937" }}>{value}</div></div>;
}

/* ---- Activities timeline (reused by leads too) ---- */
export function Activities({ relatedType, relatedId, acts, onChanged }) {
    const [adding, setAdding] = useState(false);
    const [f, setF] = useState({ type: "Note", subject: "", notes: "", due_date: "" });
    const set = (k, v) => setF(p => ({ ...p, [k]: v }));

    const add = async () => {
        if (!f.subject.trim()) return;
        try {
            await api("create_crm_activity", { related_type: relatedType, related_id: relatedId, ...f });
            setF({ type: "Note", subject: "", notes: "", due_date: "" }); setAdding(false); onChanged();
        } catch (e) { alert(e.message); }
    };
    const toggle = async (a) => {
        try { await api("complete_crm_activity", { id: a.id, completed: !a.completed }); onChanged(); } catch (e) { alert(e.message); }
    };
    const del = async (a) => {
        try { await api("delete_crm_activity", { id: a.id }); onChanged(); } catch (e) { alert(e.message); }
    };

    return (
        <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <label className="crm-lbl" style={{ margin: 0 }}>Activity</label>
                <button className="crm-btn-s" style={{ padding: "5px 10px" }} onClick={() => setAdding(v => !v)}><I name="plus" size={12} /> Log</button>
            </div>

            {adding && (
                <div style={{ background: "#f7f8fa", borderRadius: 8, padding: 10, marginBottom: 10 }}>
                    <div className="crm-row2">
                        <select className="crm-sel" value={f.type} onChange={e => set("type", e.target.value)}>{ACTIVITY_TYPES.map(t => <option key={t}>{t}</option>)}</select>
                        <input className="crm-inp" type="date" value={f.due_date} onChange={e => set("due_date", e.target.value)} title="Follow-up due date" />
                    </div>
                    <input className="crm-inp" style={{ margin: "8px 0" }} placeholder="Subject" value={f.subject} onChange={e => set("subject", e.target.value)} />
                    <textarea className="crm-ta" placeholder="Notes (optional)" value={f.notes} onChange={e => set("notes", e.target.value)} style={{ minHeight: 48 }} />
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                        <button className="crm-btn-s" onClick={() => setAdding(false)}>Cancel</button>
                        <button className="crm-btn-p" onClick={add}>Add</button>
                    </div>
                </div>
            )}

            {acts.length === 0 ? <div className="crm-sub" style={{ padding: "8px 0" }}>No activity logged yet.</div> : acts.map(a => {
                const overdue = !a.completed && a.due_date && new Date(a.due_date) < new Date();
                return (
                    <div key={a.id} className="crm-act">
                        {(a.type === "Task" || a.due_date)
                            ? <div className={`crm-act-ck ${a.completed ? "on" : ""}`} onClick={() => toggle(a)}>{a.completed && <I name="check" size={12} />}</div>
                            : <div className="crm-act-ic"><I name={ACTIVITY_ICON[a.type] || "file-text"} size={14} /></div>}
                        <div className="crm-act-body">
                            <div className="crm-act-subj" style={a.completed ? { textDecoration: "line-through", color: "#9ca3af" } : {}}>{a.subject}</div>
                            {a.notes && <div className="crm-act-notes">{a.notes}</div>}
                            <div className="crm-act-meta">
                                <span>{a.type}</span>
                                {a.due_date && <span className={`crm-act-due ${overdue ? "crm-act-overdue" : ""}`}>{overdue ? "Overdue " : "Due "}{fmtDate(a.due_date)}</span>}
                            </div>
                        </div>
                        <button className="crm-x" style={{ width: 26, height: 26, background: "transparent" }} onClick={() => del(a)}><I name="trash-2" size={12} /></button>
                    </div>
                );
            })}
        </div>
    );
}

/* ---- New / edit opportunity ---- */
function NewOppModal({ customers, existing, onClose, onSaved }) {
    const isEdit = !!existing;
    const [f, setF] = useState({
        name: existing?.name || "", customer_id: existing?.customer_id || "",
        amount: existing?.amount || "", probability: existing?.probability ?? 10,
        stage: existing?.stage || "Prospecting", expected_close_date: existing?.expected_close_date?.slice(0, 10) || "",
        source: existing?.source || "", notes: existing?.notes || "",
    });
    const [err, setErr] = useState("");
    const [saving, setSaving] = useState(false);
    const set = (k, v) => setF(p => ({ ...p, [k]: v }));

    const save = async () => {
        if (!f.name.trim()) { setErr("Name is required"); return; }
        if (!f.customer_id) { setErr("Pick a customer account"); return; }
        setSaving(true); setErr("");
        const body = { ...f, amount: parseFloat(f.amount) || 0, probability: parseInt(f.probability) || 0 };
        try {
            if (isEdit) await api("update_crm_opportunity", { id: existing.id, ...body });
            else await api("create_crm_opportunity", body);
            onSaved();
        } catch (e) { setErr(e.message); setSaving(false); }
    };

    return (<>
        <div className="crm-modal-bg" onClick={onClose} />
        <div className="crm-modal">
            <div className="crm-modal-h">
                <div className="crm-modal-t">{isEdit ? <Term simple="Edit Deal" advanced="Edit Opportunity" /> : <Term simple="New Deal" advanced="New Opportunity" />}</div>
                <button className="crm-x" onClick={onClose}><I name="x" size={16} /></button>
            </div>
            <div className="crm-modal-body">
                {err && <div className="crm-err">{err}</div>}
                <div className="crm-fld"><label className="crm-lbl">Deal name *</label><input className="crm-inp" value={f.name} onChange={e => set("name", e.target.value)} autoFocus /></div>
                <div className="crm-fld"><label className="crm-lbl"><Term simple="Customer" advanced="Customer account" /> *</label>
                    <select className="crm-sel" value={f.customer_id} onChange={e => set("customer_id", e.target.value)}>
                        <option value="">Select a customer…</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {customers.length === 0 && <div className="crm-sub" style={{ marginTop: 4 }}>No customers yet — add one in Sales/Receivables, or convert a lead.</div>}
                </div>
                <div className="crm-row2">
                    <div className="crm-fld"><label className="crm-lbl">Amount (₱)</label><input className="crm-inp" type="number" value={f.amount} onChange={e => set("amount", e.target.value)} placeholder="0.00" /></div>
                    <div className="crm-fld"><label className="crm-lbl">Probability (%)</label><input className="crm-inp" type="number" min="0" max="100" value={f.probability} onChange={e => set("probability", e.target.value)} /></div>
                </div>
                <div className="crm-row2">
                    {!isEdit && <div className="crm-fld"><label className="crm-lbl">Stage</label>
                        <select className="crm-sel" value={f.stage} onChange={e => set("stage", e.target.value)}>{OPEN_STAGES.map(s => <option key={s}>{s}</option>)}</select>
                    </div>}
                    <div className="crm-fld"><label className="crm-lbl">Expected close</label><input className="crm-inp" type="date" value={f.expected_close_date} onChange={e => set("expected_close_date", e.target.value)} /></div>
                </div>
                <div className="crm-fld"><label className="crm-lbl">Notes</label><textarea className="crm-ta" value={f.notes} onChange={e => set("notes", e.target.value)} /></div>
            </div>
            <div className="crm-modal-foot">
                <span />
                <div style={{ display: "flex", gap: 8 }}>
                    <button className="crm-btn-s" onClick={onClose}>Cancel</button>
                    <button className="crm-btn-p" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
                </div>
            </div>
        </div>
    </>);
}
