import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";
import { api, fmtDate, initials, Empty, LEAD_STATUS_COLOR, LEAD_SOURCES } from "./shared";
import { Term, SimpleHint } from "../components/simplemode";

const STATUSES = ["New", "Contacted", "Qualified", "Unqualified"];
const RATINGS = ["", "Hot", "Warm", "Cold"];

export default function LeadsView() {
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("");
    const [editing, setEditing] = useState(null);   // lead object or {} for new
    const [converting, setConverting] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try { const d = await api("get_crm_leads", { status: filter }); setLeads(d.leads || []); }
        catch { setLeads([]); }
        setLoading(false);
    }, [filter]);

    useEffect(() => { load(); }, [load]);

    return (<>
        <SimpleHint icon="bulb">People who might buy from you but aren't customers yet.</SimpleHint>
        <div className="crm-bar">
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span className="crm-bar-count">{leads.length} leads</span>
                <select className="crm-sel" style={{ width: 150 }} value={filter} onChange={e => setFilter(e.target.value)}>
                    <option value="">All statuses</option>
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>
            <button className="crm-btn-p" onClick={() => setEditing({})}><I name="plus" size={14} /> New Lead</button>
        </div>

        {loading ? null : leads.length === 0 ? (
            <Empty icon="userplus" title="No leads yet" desc={<Term simple="Add someone who's interested to start tracking them." advanced="Capture an inbound contact to start the funnel." />} action="New Lead" onAction={() => setEditing({})} />
        ) : (
            <div className="crm-tblwrap">
                <table className="crm-tbl">
                    <thead><tr>
                        <th>Name</th><th>Company</th><th>Contact</th><th>Source</th>
                        <th>Status</th><th>Created</th><th></th>
                    </tr></thead>
                    <tbody>
                        {leads.map(l => (
                            <tr key={l.id} style={{ cursor: "pointer" }} onClick={() => setEditing(l)}>
                                <td>
                                    <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
                                        <span className="crm-av" style={{ background: "#eef2ff", color: "#6366f1" }}>{initials(l.name)}</span>
                                        <div>
                                            <div className="crm-nm">{l.name}</div>
                                            {l.title && <div className="crm-sub">{l.title}</div>}
                                        </div>
                                    </div>
                                </td>
                                <td>{l.company_name || "—"}</td>
                                <td>
                                    <div>{l.email || "—"}</div>
                                    {l.phone && <div className="crm-sub">{l.phone}</div>}
                                </td>
                                <td>{l.source}</td>
                                <td>
                                    <span className="crm-badge" style={{ background: (LEAD_STATUS_COLOR[l.status] || "#94a3b8") + "1f", color: LEAD_STATUS_COLOR[l.status] || "#64748b" }}>{l.status}</span>
                                    {l.is_converted ? <div className="crm-sub" style={{ color: "#22c55e", marginTop: 3 }}>Converted</div> : null}
                                </td>
                                <td className="crm-sub">{fmtDate(l.created_at)}</td>
                                <td onClick={e => e.stopPropagation()}>
                                    {!l.is_converted && (
                                        <button className="crm-btn-s" style={{ padding: "6px 10px" }} onClick={() => setConverting(l)}>
                                            <I name="repeat" size={12} /> Convert
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}

        {editing && <LeadModal lead={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
        {converting && <ConvertModal lead={converting} onClose={() => setConverting(null)} onDone={() => { setConverting(null); load(); }} />}
    </>);
}

function LeadModal({ lead, onClose, onSaved }) {
    const isNew = !lead.id;
    const [f, setF] = useState({
        name: lead.name || "", company_name: lead.company_name || "", title: lead.title || "",
        email: lead.email || "", phone: lead.phone || "", source: lead.source || "Website",
        status: lead.status || "New", rating: lead.rating || "", notes: lead.notes || "",
    });
    const [err, setErr] = useState("");
    const [saving, setSaving] = useState(false);
    const set = (k, v) => setF(p => ({ ...p, [k]: v }));

    const save = async () => {
        if (!f.name.trim()) { setErr("Name is required"); return; }
        setSaving(true); setErr("");
        try {
            if (isNew) await api("create_crm_lead", f);
            else await api("update_crm_lead", { id: lead.id, ...f });
            onSaved();
        } catch (e) { setErr(e.message); setSaving(false); }
    };
    const del = async () => {
        if (!window.confirm("Delete this lead?")) return;
        try { await api("delete_crm_lead", { id: lead.id }); onSaved(); } catch (e) { setErr(e.message); }
    };

    return (<>
        <div className="crm-modal-bg" onClick={onClose} />
        <div className="crm-modal">
            <div className="crm-modal-h">
                <div><div className="crm-modal-t">{isNew ? "New Lead" : "Edit Lead"}</div></div>
                <button className="crm-x" onClick={onClose}><I name="x" size={16} /></button>
            </div>
            <div className="crm-modal-body">
                {err && <div className="crm-err">{err}</div>}
                <div className="crm-fld"><label className="crm-lbl">Name *</label><input className="crm-inp" value={f.name} onChange={e => set("name", e.target.value)} autoFocus /></div>
                <div className="crm-row2">
                    <div className="crm-fld"><label className="crm-lbl">Company</label><input className="crm-inp" value={f.company_name} onChange={e => set("company_name", e.target.value)} /></div>
                    <div className="crm-fld"><label className="crm-lbl">Job title</label><input className="crm-inp" value={f.title} onChange={e => set("title", e.target.value)} /></div>
                </div>
                <div className="crm-row2">
                    <div className="crm-fld"><label className="crm-lbl">Email</label><input className="crm-inp" value={f.email} onChange={e => set("email", e.target.value)} /></div>
                    <div className="crm-fld"><label className="crm-lbl">Phone</label><input className="crm-inp" value={f.phone} onChange={e => set("phone", e.target.value)} /></div>
                </div>
                <div className="crm-row2">
                    <div className="crm-fld"><label className="crm-lbl">Source</label>
                        <select className="crm-sel" value={f.source} onChange={e => set("source", e.target.value)}>{LEAD_SOURCES.map(s => <option key={s}>{s}</option>)}</select>
                    </div>
                    <div className="crm-fld"><label className="crm-lbl">Status</label>
                        <select className="crm-sel" value={f.status} onChange={e => set("status", e.target.value)}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select>
                    </div>
                </div>
                <div className="crm-fld"><label className="crm-lbl">Rating</label>
                    <select className="crm-sel" value={f.rating} onChange={e => set("rating", e.target.value)}>{RATINGS.map(s => <option key={s} value={s}>{s || "—"}</option>)}</select>
                </div>
                <div className="crm-fld"><label className="crm-lbl">Notes</label><textarea className="crm-ta" value={f.notes} onChange={e => set("notes", e.target.value)} /></div>
            </div>
            <div className="crm-modal-foot">
                {!isNew ? <button className="crm-btn-danger" onClick={del}>Delete</button> : <span />}
                <div style={{ display: "flex", gap: 8 }}>
                    <button className="crm-btn-s" onClick={onClose}>Cancel</button>
                    <button className="crm-btn-p" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
                </div>
            </div>
        </div>
    </>);
}

function ConvertModal({ lead, onClose, onDone }) {
    const [f, setF] = useState({
        opportunity_name: (lead.company_name || lead.name) + " deal",
        amount: "", expected_close_date: "",
    });
    const [err, setErr] = useState("");
    const [saving, setSaving] = useState(false);
    const set = (k, v) => setF(p => ({ ...p, [k]: v }));

    const convert = async () => {
        setSaving(true); setErr("");
        try {
            await api("convert_crm_lead", {
                id: lead.id, opportunity_name: f.opportunity_name,
                amount: parseFloat(f.amount) || 0, expected_close_date: f.expected_close_date,
            });
            onDone();
        } catch (e) { setErr(e.message); setSaving(false); }
    };

    return (<>
        <div className="crm-modal-bg" onClick={onClose} />
        <div className="crm-modal">
            <div className="crm-modal-h">
                <div>
                    <div className="crm-modal-t">Convert Lead</div>
                    <div className="crm-modal-sub"><Term simple="Creates a customer and a deal" advanced="Creates a customer account + an opportunity" /></div>
                </div>
                <button className="crm-x" onClick={onClose}><I name="x" size={16} /></button>
            </div>
            <div className="crm-modal-body">
                {err && <div className="crm-err">{err}</div>}
                <div className="crm-fld" style={{ background: "#f7f8fa", padding: 10, borderRadius: 8 }}>
                    <div className="crm-nm">{lead.name}</div>
                    <div className="crm-sub">{lead.company_name || "—"}{lead.email ? ` · ${lead.email}` : ""}</div>
                </div>
                <div className="crm-fld"><label className="crm-lbl"><Term simple="Deal name" advanced="Opportunity name" /></label><input className="crm-inp" value={f.opportunity_name} onChange={e => set("opportunity_name", e.target.value)} /></div>
                <div className="crm-row2">
                    <div className="crm-fld"><label className="crm-lbl">Deal amount (₱)</label><input className="crm-inp" type="number" value={f.amount} onChange={e => set("amount", e.target.value)} placeholder="0.00" /></div>
                    <div className="crm-fld"><label className="crm-lbl">Expected close</label><input className="crm-inp" type="date" value={f.expected_close_date} onChange={e => set("expected_close_date", e.target.value)} /></div>
                </div>
            </div>
            <div className="crm-modal-foot">
                <span />
                <div style={{ display: "flex", gap: 8 }}>
                    <button className="crm-btn-s" onClick={onClose}>Cancel</button>
                    <button className="crm-btn-p" disabled={saving} onClick={convert}>{saving ? "Converting…" : "Convert"}</button>
                </div>
            </div>
        </div>
    </>);
}
