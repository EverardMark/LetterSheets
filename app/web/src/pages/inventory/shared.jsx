import { I } from "../../layouts/ERPLayout";

/* ================================================================
   INVENTORY — shared helpers (API + formatting + small components)
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
export const initials = (s) => (s || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

export function timeAgo(d) {
    if (!d) return "";
    const s = Math.floor((Date.now() - new Date(d.replace(" ", "T")).getTime()) / 1000);
    if (isNaN(s)) return d10(d);
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    if (s < 604800) return Math.floor(s / 86400) + "d ago";
    return d10(d);
}

// Movement type → label / color / icon
export const MOVE_META = {
    in:           { label: "Stock In",     color: "#0d9488", badge: "iv-b-green" },
    out:          { label: "Stock Out",    color: "#ef4444", badge: "iv-b-red" },
    adjust:       { label: "Adjustment",   color: "#d97706", badge: "iv-b-amber" },
    transfer_in:  { label: "Transfer In",  color: "#0369a1", badge: "iv-b-blue" },
    transfer_out: { label: "Transfer Out", color: "#7c3aed", badge: "iv-b-purple" },
};

// Purchase-order status → badge class
export const PO_BADGE = {
    Draft: "iv-b-gray", Ordered: "iv-b-blue", Partial: "iv-b-amber",
    Received: "iv-b-green", Cancelled: "iv-b-red",
};

// Stock health for a product given its total stock + reorder point.
export function stockStatus(total, reorder) {
    if (total <= 0) return { label: "Out of stock", badge: "iv-b-red" };
    if (reorder > 0 && total <= reorder) return { label: "Low stock", badge: "iv-b-amber" };
    return { label: "In stock", badge: "iv-b-green" };
}

const AV_COLORS = ["#2d9e8b", "#0ea5e9", "#8b5cf6", "#f59e0b", "#ef4444", "#0d9488", "#7c3aed"];
export const avColor = (s) => AV_COLORS[((s || "").charCodeAt(0) || 0) % AV_COLORS.length];

export function Empty({ icon, title, desc, action, onAction }) {
    return (
        <div className="iv-empty">
            <div className="iv-empty-ic"><I name={icon || "inbox"} size={28} /></div>
            <div className="iv-empty-t">{title || "No data yet"}</div>
            <div className="iv-empty-d">{desc || "Data will appear here once added."}</div>
            {action && <button className="iv-btn-p" style={{ marginTop: 14 }} onClick={onAction}>{action}</button>}
        </div>
    );
}
