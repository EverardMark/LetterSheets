import { I } from "../../layouts/ERPLayout";

/* ================================================================
   EXPENSES — shared helpers (mirrors the CRM/Sales module conventions)
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

// asList normalises a list endpoint's response. Some actions answer a bare JSON
// array (get_exp_claims, get_exp_categories) and others wrap it in a named key
// (get_accounts → {accounts:[…]}, get_employees → {employees:[…]}). Guessing
// wrong renders `undefined.map(...)`, which in React unmounts the whole tree and
// leaves a blank page — so every list response goes through here.
export function asList(d, key) {
    if (Array.isArray(d)) return d;
    if (key && Array.isArray(d?.[key])) return d[key];
    const first = d && typeof d === "object" ? Object.values(d).find(Array.isArray) : null;
    return first || [];
}

// loadAccounts unwraps get_accounts, which answers {accounts:[...]} rather than a
// bare array. Every other module in the app unwraps it at the call site; missing
// that here crashed the whole React tree with "accounts.map is not a function",
// so it lives in one helper now instead of being re-derived per screen.
export async function loadAccounts(accountType = "", activeOnly = true) {
    return asList(await api("get_accounts", { account_type: accountType, active_only: activeOnly }), "accounts");
}

export async function loadEmployees() {
    return asList(await api("get_employees"), "employees");
}

export const peso = (n) => "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const d10 = (s) => (s || "").slice(0, 10);
export const today = () => new Date().toISOString().slice(0, 10);
export const fmtDate = (s) => {
    if (!s) return "—";
    const dt = new Date(d10(s) + "T00:00:00");
    return isNaN(dt) ? s : dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

// The claim lifecycle, in the order it actually happens.
export const CLAIM_STATUSES = ["Draft", "Submitted", "Approved", "Paid", "Rejected", "Cancelled"];
export const STATUS_COLOR = {
    Draft: "#94a3b8", Submitted: "#0ea5e9", Approved: "#8b5cf6",
    Paid: "#22c55e", Rejected: "#ef4444", Cancelled: "#94a3b8",
};

// What each status means to the person looking at it — shown as a caption so a
// non-accountant knows whether the ball is in their court.
export const STATUS_HINT = {
    Draft: "Not submitted yet — you can still edit it.",
    Submitted: "Waiting for an approver.",
    Approved: "Approved and recorded as owed to you. Awaiting payment.",
    Paid: "Reimbursed.",
    Rejected: "Returned to you. Edit and resubmit.",
    Cancelled: "Withdrawn.",
};

export function Empty({ icon, title, desc, action, onAction }) {
    return (
        <div className="ex-empty">
            <div className="ex-empty-ic"><I name={icon || "inbox"} size={28} /></div>
            <div className="ex-empty-t">{title || "Nothing here yet"}</div>
            {desc && <div className="ex-empty-d">{desc}</div>}
            {action && <button className="ex-btn-p" style={{ marginTop: 14 }} onClick={onAction}>{action}</button>}
        </div>
    );
}

export function StatusPill({ status }) {
    const c = STATUS_COLOR[status] || "#94a3b8";
    return <span className="ex-pill" style={{ background: c + "1a", color: c }}>{status}</span>;
}

// fileToBase64 reads a picked receipt for the upload endpoint, which takes the
// bytes base64-encoded in JSON (the same shape onboarding documents use).
export function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error("could not read file"));
        fr.readAsDataURL(file);
    });
}
