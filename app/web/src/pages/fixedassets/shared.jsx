import { I } from "../../layouts/ERPLayout";

/* ================================================================
   FIXED ASSETS — shared helpers (API + formatting + small components)
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
export const num = (n) => Number(n || 0).toLocaleString("en-PH", { maximumFractionDigits: 2 });
export const d10 = (s) => (s || "").slice(0, 10);

// Asset status -> badge class
export const STATUS_BADGE = {
    Active: "fa-b-green",
    "Fully Depreciated": "fa-b-blue",
    Disposed: "fa-b-gray",
    Scrapped: "fa-b-red",
};

export const METHODS = [
    { value: "straight_line", label: "Straight-line" },
    { value: "declining_balance", label: "Declining balance (150%)" },
    { value: "double_declining", label: "Double-declining (200%)" },
];
export const methodLabel = (m) => METHODS.find(x => x.value === m)?.label || m || "—";

// current YYYY-MM
export function thisPeriod() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function Empty({ icon, title, desc, action, onAction }) {
    return (
        <div className="fa-empty">
            <div className="fa-empty-ic"><I name={icon || "inbox"} size={28} /></div>
            <div className="fa-empty-t">{title || "No data yet"}</div>
            <div className="fa-empty-d">{desc || "Data will appear here once added."}</div>
            {action && <button className="fa-btn-p" style={{ marginTop: 14 }} onClick={onAction}>{action}</button>}
        </div>
    );
}
