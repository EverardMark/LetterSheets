import { I } from "../../layouts/ERPLayout";

/* ================================================================
   CRM — shared helpers (mirrors the Sales module conventions)
================================================================ */
const API_URL = (import.meta.env.VITE_API_BASE || "") + "/api/execute";

export async function api(action, body = {}) {
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

export const peso = (n) => "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const d10 = (s) => (s || "").slice(0, 10);
export const today = () => new Date().toISOString().slice(0, 10);
export const fmtDate = (s) => {
    if (!s) return "—";
    const dt = new Date(d10(s) + "T00:00:00");
    return isNaN(dt) ? s : dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

// Open pipeline stages (kanban columns), plus the two closed outcomes.
export const OPEN_STAGES = ["Prospecting", "Qualification", "Proposal", "Negotiation"];
export const ALL_STAGES = [...OPEN_STAGES, "Won", "Lost"];
export const STAGE_COLOR = {
    Prospecting: "#6366f1", Qualification: "#0ea5e9", Proposal: "#f59e0b",
    Negotiation: "#8b5cf6", Won: "#22c55e", Lost: "#ef4444",
};
export const LEAD_STATUS_COLOR = {
    New: "#0ea5e9", Contacted: "#f59e0b", Qualified: "#22c55e", Unqualified: "#94a3b8",
};
export const LEAD_SOURCES = ["Website", "Referral", "Cold Call", "Event", "Other"];
export const ACTIVITY_TYPES = ["Call", "Email", "Meeting", "Task", "Note"];
export const ACTIVITY_ICON = { Call: "phone", Email: "message-circle", Meeting: "users", Task: "check", Note: "file-text" };

export function Empty({ icon, title, desc, action, onAction }) {
    return (
        <div className="crm-empty">
            <div className="crm-empty-ic"><I name={icon || "inbox"} size={28} /></div>
            <div className="crm-empty-t">{title || "Nothing here yet"}</div>
            {desc && <div className="crm-empty-d">{desc}</div>}
            {action && <button className="crm-btn-p" style={{ marginTop: 14 }} onClick={onAction}>{action}</button>}
        </div>
    );
}

export function initials(name = "") {
    const p = name.trim().split(/\s+/);
    return ((p[0]?.[0] || "") + (p[1]?.[0] || "")).toUpperCase() || "?";
}
