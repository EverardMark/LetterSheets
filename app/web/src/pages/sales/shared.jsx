import { I } from "../../layouts/ERPLayout";

/* ================================================================
   SALES / ORDER MANAGEMENT — shared helpers
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
export const today = () => new Date().toISOString().slice(0, 10);

export const QUOTE_BADGE = {
    Draft: "so-b-gray", Sent: "so-b-blue", Accepted: "so-b-green", Converted: "so-b-purple",
    Rejected: "so-b-red", Expired: "so-b-gray",
};
export const ORDER_BADGE = {
    Draft: "so-b-gray", Confirmed: "so-b-blue", PartiallyFulfilled: "so-b-amber",
    Fulfilled: "so-b-purple", Invoiced: "so-b-green", Closed: "so-b-gray", Cancelled: "so-b-red",
};
export const SHIP_BADGE = {
    Draft: "so-b-gray", Shipped: "so-b-blue", Delivered: "so-b-green", Cancelled: "so-b-red",
};

export function Empty({ icon, title, desc, action, onAction }) {
    return (
        <div className="so-empty">
            <div className="so-empty-ic"><I name={icon || "inbox"} size={28} /></div>
            <div className="so-empty-t">{title || "No data yet"}</div>
            <div className="so-empty-d">{desc || "Data will appear here once added."}</div>
            {action && <button className="so-btn-p" style={{ marginTop: 14 }} onClick={onAction}>{action}</button>}
        </div>
    );
}
