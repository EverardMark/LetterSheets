import { I } from "../../layouts/ERPLayout";

/* ================================================================
   PROCUREMENT / PURCHASE-TO-PAY — shared helpers
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

export const REQ_BADGE = {
    Draft: "pr-b-gray", Submitted: "pr-b-blue", Approved: "pr-b-green", Converted: "pr-b-purple",
    Rejected: "pr-b-red", Cancelled: "pr-b-gray",
};
export const PO_BADGE = {
    Draft: "pr-b-gray", Approved: "pr-b-blue", PartiallyReceived: "pr-b-amber",
    Received: "pr-b-purple", Billed: "pr-b-green", Closed: "pr-b-gray", Cancelled: "pr-b-red",
};
export const RECEIPT_BADGE = {
    Received: "pr-b-green", Cancelled: "pr-b-red",
};

export const vendorName = (v) => v.name || "";

export function Empty({ icon, title, desc, action, onAction }) {
    return (
        <div className="pr-empty">
            <div className="pr-empty-ic"><I name={icon || "inbox"} size={28} /></div>
            <div className="pr-empty-t">{title || "No data yet"}</div>
            <div className="pr-empty-d">{desc || "Data will appear here once added."}</div>
            {action && <button className="pr-btn-p" style={{ marginTop: 14 }} onClick={onAction}>{action}</button>}
        </div>
    );
}
