import { useState, useEffect, useMemo } from "react";
import { I } from "../../layouts/ERPLayout";

const API_URL = (import.meta.env.VITE_API_BASE || "") + "/api/execute";
async function api(action, body = {}) {
    const s = localStorage.getItem("ls_session");
    const res = await fetch(`${API_URL}?action=${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(s ? { Authorization: `Bearer ${s}` } : {}) },
        body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) throw new Error(json?.error || `API ${action} failed`);
    return json.data;
}

// Roles allowed to view change history (mirrors the server-side gate on get_history).
export function canViewHistory() {
    const role = JSON.parse(localStorage.getItem("ls_company") || "{}").role;
    return role === "superadmin" || role === "admin" || role === "hr";
}

const CHANGE_META = {
    INSERT: { label: "Created", color: "#22c55e", icon: "plus" },
    UPDATE: { label: "Updated", color: "#3b82f6", icon: "edit-2" },
    DELETE: { label: "Deleted", color: "#ef4444", icon: "trash-2" },
};
const changeMeta = (t) => CHANGE_META[(t || "").toUpperCase()] || { label: t || "Changed", color: "#888", icon: "clock" };

// snake_case column -> "Title Case" label.
const humanizeField = (f) => (f || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const actorName = (r) => r.changed_by_username || r.changed_by_email || "Someone";

function fmtWhen(s) {
    if (!s) return "";
    // MySQL DATETIME comes back as "2026-07-14 10:00:00" (UTC) or RFC3339; normalize.
    const d = new Date(typeof s === "string" && s.length === 19 ? s.replace(" ", "T") + "Z" : s);
    if (isNaN(d)) return s;
    return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

const shorten = (v) => (v == null ? "—" : String(v).length > 80 ? String(v).slice(0, 80) + "…" : String(v));

// The audit table stores one row per changed field; consecutive rows sharing the
// same (timestamp, actor, change type) came from one action, so fold them into a
// single event with a list of field changes.
function groupEvents(records) {
    const events = [];
    let cur = null;
    for (const r of records) {
        const key = `${r.changed_at}|${r.changed_by}|${r.change_type}`;
        if (!cur || cur.key !== key) {
            cur = {
                key,
                type: (r.change_type || "").toUpperCase(),
                meta: changeMeta(r.change_type),
                actor: actorName(r),
                when: fmtWhen(r.changed_at),
                fields: [],
            };
            events.push(cur);
        }
        cur.fields.push(r);
    }
    return events;
}

export default function HistoryTab({ table, recordId }) {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");

    useEffect(() => {
        if (!table || !recordId) { setLoading(false); return; }
        let alive = true;
        setLoading(true); setErr("");
        api("get_history", { table_name: table, record_id: recordId, limit: 200 })
            .then((d) => { if (alive) setRecords(d.records || []); })
            .catch((e) => { if (alive) setErr(e.message || "error"); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [table, recordId]);

    const events = useMemo(() => groupEvents(records), [records]);

    let body;
    if (loading) {
        body = <div className="hist-msg">Loading history…</div>;
    } else if (err) {
        body = <div className="hist-msg hist-err">{/permission|forbidden/i.test(err) ? "You don't have permission to view history." : "Couldn't load history."}</div>;
    } else if (!events.length) {
        body = (
            <div className="hist-empty">
                <div className="hist-empty-ic"><I name="clock" size={22} /></div>
                <div className="hist-empty-t">No changes recorded yet</div>
                <div className="hist-empty-d">Edits to this record will appear here.</div>
            </div>
        );
    } else {
        body = (
            <div className="hist-timeline">
                {events.map((ev, i) => (
                    <div key={i} className="hist-event">
                        <span className="hist-dot" style={{ background: ev.meta.color }} />
                        <div className="hist-card">
                            <div className="hist-head">
                                <span className="hist-badge" style={{ background: ev.meta.color + "18", color: ev.meta.color }}>
                                    <I name={ev.meta.icon} size={11} /> {ev.meta.label}
                                </span>
                                <span className="hist-actor"><I name="user" size={11} /> {ev.actor}</span>
                                <span className="hist-when">{ev.when}</span>
                            </div>
                            {ev.type !== "DELETE" && ev.fields.length > 0 && (
                                <div className="hist-fields">
                                    {ev.fields.map((f, j) => (
                                        <div key={j} className="hist-field">
                                            <span className="hist-fname">{humanizeField(f.field_name)}</span>
                                            {f.is_encrypted ? (
                                                <span className="hist-enc">••• changed (hidden)</span>
                                            ) : ev.type === "INSERT" ? (
                                                <span className="hist-new">{shorten(f.new_value)}</span>
                                            ) : (
                                                <span className="hist-diff">
                                                    <span className="hist-old">{shorten(f.old_value)}</span>
                                                    <span className="hist-arrow">→</span>
                                                    <span className="hist-new">{shorten(f.new_value)}</span>
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return <div className="hist-wrap">{body}<style>{histCSS}</style></div>;
}

const histCSS = `
  .hist-wrap{padding:4px 2px}
  .hist-msg{padding:24px;text-align:center;color:#888;font-size:13px}
  .hist-err{color:#b45309}
  .hist-empty{text-align:center;padding:36px 20px;color:#aaa}
  .hist-empty-ic{width:52px;height:52px;border-radius:50%;background:#f3f4f6;color:#9ca3af;display:flex;align-items:center;justify-content:center;margin:0 auto 12px}
  .hist-empty-t{font-size:14px;font-weight:600;color:#666}
  .hist-empty-d{font-size:12px;color:#aaa;margin-top:4px}

  .hist-timeline{position:relative;padding-left:22px}
  .hist-timeline:before{content:"";position:absolute;left:6px;top:6px;bottom:6px;width:2px;background:#eef0f2}
  .hist-event{position:relative;margin-bottom:12px}
  .hist-dot{position:absolute;left:-19px;top:6px;width:11px;height:11px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #e5e7eb}
  .hist-card{background:#fff;border:1px solid #eef0f2;border-radius:10px;padding:10px 12px}
  .hist-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .hist-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600}
  .hist-actor{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:600;color:#444}
  .hist-when{margin-left:auto;font-size:11px;color:#9ca3af;white-space:nowrap}
  .hist-fields{margin-top:8px;display:flex;flex-direction:column;gap:5px}
  .hist-field{display:flex;align-items:baseline;gap:8px;font-size:12px;flex-wrap:wrap}
  .hist-fname{color:#6b7280;font-weight:600;min-width:90px}
  .hist-diff{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap}
  .hist-old{color:#9ca3af;text-decoration:line-through}
  .hist-arrow{color:#cbd5e1}
  .hist-new{color:#111827;font-weight:500}
  .hist-enc{color:#9ca3af;font-style:italic}
`;
