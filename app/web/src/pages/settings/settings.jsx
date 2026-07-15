import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";
import { rewrapCompanyKeys } from "../../utils/crypto";

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

const ls = (k) => JSON.parse(localStorage.getItem(k) || "{}");
function fmtDate(d) {
    if (!d) return "—";
    const dt = new Date(d);
    if (isNaN(dt)) return "—";
    return dt.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
const ROLE_LABEL = { superadmin: "Super Admin", admin: "Admin", hr: "HR", payroll: "Payroll", manager: "Manager", employee: "Employee" };

export default function Settings() {
    const company = ls("ls_company");
    const isAdmin = company.role === "admin" || company.role === "superadmin";

    const [tab, setTab] = useState("profile");
    const [user, setUser] = useState(null);
    const [flash, setFlash] = useState("");
    const showFlash = (m) => { setFlash(m); setTimeout(() => setFlash(""), 3500); };

    const loadUser = useCallback(async () => {
        try { setUser(await api("get_user", {})); } catch { setUser(ls("ls_user")); }
    }, []);
    useEffect(() => { loadUser(); }, [loadUser]);

    return (
        <div className="st-wrap">
            {flash && <div className="st-flash"><I name="check" size={14} /> {flash}</div>}

            <div className="st-head">
                <div className="st-avatar">{(ls("ls_user").username || "U")[0].toUpperCase()}</div>
                <div>
                    <h2 className="st-title">{ls("ls_user").username || "My Account"}</h2>
                    <div className="st-sub">{ROLE_LABEL[company.role] || company.role} · {company.name || "—"}</div>
                </div>
            </div>

            <div className="st-tabs">
                <button className={`st-tab ${tab === "profile" ? "on" : ""}`} onClick={() => setTab("profile")}><I name="user" size={14} /> Profile</button>
                <button className={`st-tab ${tab === "security" ? "on" : ""}`} onClick={() => setTab("security")}><I name="lock" size={14} /> Security</button>
                {isAdmin && <button className={`st-tab ${tab === "company" ? "on" : ""}`} onClick={() => setTab("company")}><I name="building" size={14} /> Company</button>}
            </div>

            <div className="st-body">
                {tab === "profile" && <ProfileTab user={user} company={company} onSaved={(u) => { setUser(u); showFlash("Profile updated"); }} />}
                {tab === "security" && <SecurityTab user={user} onFlash={showFlash} />}
                {tab === "company" && isAdmin && <CompanyTab onFlash={showFlash} />}
            </div>

            <style>{stCSS}</style>
        </div>
    );
}

/* ─────────── PROFILE ─────────── */
function ProfileTab({ user, company, onSaved }) {
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    useEffect(() => {
        const u = user || ls("ls_user");
        setUsername(u.username || "");
        setEmail(u.email || "");
    }, [user]);

    const dirty = user && (username !== (user.username || "") || email !== (user.email || ""));

    const save = async () => {
        if (!username.trim() || !email.trim()) { setErr("Username and email are required"); return; }
        setBusy(true); setErr("");
        try {
            await api("update_user", { username: username.trim(), email: email.trim() });
            const merged = { ...ls("ls_user"), username: username.trim(), email: email.trim() };
            localStorage.setItem("ls_user", JSON.stringify(merged));
            onSaved({ ...(user || {}), username: username.trim(), email: email.trim() });
        } catch (e) { setErr(e.message); }
        setBusy(false);
    };

    return (
        <div className="st-card">
            <h3 className="st-card-t">Account details</h3>
            {err && <div className="st-err">{err}</div>}
            <div className="st-grid">
                <div className="st-field">
                    <label className="st-label">Username</label>
                    <input className="st-input" value={username} onChange={e => setUsername(e.target.value)} />
                </div>
                <div className="st-field">
                    <label className="st-label">Email</label>
                    <input className="st-input" type="email" value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                <div className="st-field">
                    <label className="st-label">Role</label>
                    <input className="st-input" value={ROLE_LABEL[company.role] || company.role || "—"} disabled />
                </div>
                <div className="st-field">
                    <label className="st-label">Company</label>
                    <input className="st-input" value={company.name || "—"} disabled />
                </div>
                <div className="st-field">
                    <label className="st-label">Member since</label>
                    <input className="st-input" value={fmtDate(user?.created_at)} disabled />
                </div>
                <div className="st-field">
                    <label className="st-label">Last login</label>
                    <input className="st-input" value={fmtDate(user?.last_login_at)} disabled />
                </div>
            </div>
            <div className="st-foot">
                <button className="st-btn-p" onClick={save} disabled={!dirty || busy}>{busy ? "Saving…" : "Save changes"}</button>
            </div>
        </div>
    );
}

/* ─────────── SECURITY ─────────── */
function SecurityTab({ user, onFlash }) {
    const [cur, setCur] = useState("");
    const [nw, setNw] = useState("");
    const [cf, setCf] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [outBusy, setOutBusy] = useState(false);

    const changePw = async () => {
        setErr("");
        if (nw.length < 8) { setErr("New password must be at least 8 characters"); return; }
        if (nw !== cf) { setErr("New passwords don't match"); return; }
        if (nw === cur) { setErr("New password must be different from the current one"); return; }
        const lsUser = ls("ls_user");
        if (!lsUser.salt) { setErr("Your session is missing key material — sign out and back in, then retry."); return; }
        setBusy(true);
        try {
            // Re-wrap every company key under the new password, entirely client-side.
            const newSalt = crypto.randomUUID();
            const companies = await api("get_user_companies", {});
            const list = Array.isArray(companies) ? companies : (companies?.companies || []);
            const wrapped_keys = await rewrapCompanyKeys(cur, lsUser.salt, nw, newSalt, list);
            await api("change_password", { current_password: cur, new_password: nw, new_salt: newSalt, wrapped_keys });
            localStorage.setItem("ls_user", JSON.stringify({ ...lsUser, salt: newSalt }));
            setCur(""); setNw(""); setCf("");
            onFlash("Password changed");
        } catch (e) { setErr(e.message || "Failed to change password"); }
        setBusy(false);
    };

    const signOutOthers = async () => {
        if (!confirm("Sign out of all other devices? Your current session stays active.")) return;
        setOutBusy(true);
        try { await api("logout_all", {}); onFlash("Signed out of other devices"); }
        catch (e) { alert("Failed: " + e.message); }
        setOutBusy(false);
    };

    return (
        <>
            <div className="st-card">
                <h3 className="st-card-t">Change password</h3>
                <div className="st-note"><I name="lock" size={13} /> Your data is end-to-end encrypted. Changing your password re-encrypts your keys in your browser — it never leaves your device unprotected.</div>
                {err && <div className="st-err">{err}</div>}
                <div className="st-grid">
                    <div className="st-field st-field-full">
                        <label className="st-label">Current password</label>
                        <input className="st-input" type="password" value={cur} onChange={e => setCur(e.target.value)} autoComplete="current-password" />
                    </div>
                    <div className="st-field">
                        <label className="st-label">New password</label>
                        <input className="st-input" type="password" value={nw} onChange={e => setNw(e.target.value)} autoComplete="new-password" />
                    </div>
                    <div className="st-field">
                        <label className="st-label">Confirm new password</label>
                        <input className="st-input" type="password" value={cf} onChange={e => setCf(e.target.value)} autoComplete="new-password" />
                    </div>
                </div>
                <div className="st-foot">
                    <span className="st-meta">Last changed: {fmtDate(user?.password_changed_at)}</span>
                    <button className="st-btn-p" onClick={changePw} disabled={busy || !cur || !nw || !cf}>{busy ? "Updating…" : "Update password"}</button>
                </div>
            </div>

            <div className="st-card">
                <h3 className="st-card-t">Active sessions</h3>
                <div className="st-note">Signed in on this device. If you've logged in elsewhere, you can end those sessions.</div>
                <div className="st-foot" style={{ justifyContent: "flex-start" }}>
                    <button className="st-btn-s" onClick={signOutOthers} disabled={outBusy}><I name="logout" size={13} /> {outBusy ? "…" : "Sign out other devices"}</button>
                </div>
            </div>
        </>
    );
}

/* ─────────── COMPANY (admin) ─────────── */
function CompanyTab({ onFlash }) {
    const [c, setC] = useState(null);
    const [form, setForm] = useState({});
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    useEffect(() => {
        api("get_company", {}).then(d => { setC(d); setForm({ name: d.name || "", industry: d.industry || "", address: d.address || "", city: d.city || "", state: d.state || "", province: d.province || "" }); }).catch(() => {});
    }, []);

    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
    const save = async () => {
        if (!form.name?.trim()) { setErr("Company name is required"); return; }
        setBusy(true); setErr("");
        try {
            await api("update_company", form);
            const merged = { ...ls("ls_company"), name: form.name.trim() };
            localStorage.setItem("ls_company", JSON.stringify(merged));
            onFlash("Company updated");
        } catch (e) { setErr(e.message); }
        setBusy(false);
    };

    if (!c) return <div className="st-card"><div className="st-note">Loading…</div></div>;
    const s = c; // company_settings joined onto the company object

    return (
        <>
            <div className="st-card">
                <h3 className="st-card-t">Company profile</h3>
                {err && <div className="st-err">{err}</div>}
                <div className="st-grid">
                    <div className="st-field st-field-full"><label className="st-label">Company name</label><input className="st-input" value={form.name} onChange={e => set("name", e.target.value)} /></div>
                    <div className="st-field"><label className="st-label">Industry</label><input className="st-input" value={form.industry} onChange={e => set("industry", e.target.value)} /></div>
                    <div className="st-field"><label className="st-label">City</label><input className="st-input" value={form.city} onChange={e => set("city", e.target.value)} /></div>
                    <div className="st-field st-field-full"><label className="st-label">Address</label><input className="st-input" value={form.address} onChange={e => set("address", e.target.value)} /></div>
                    <div className="st-field"><label className="st-label">State</label><input className="st-input" value={form.state} onChange={e => set("state", e.target.value)} /></div>
                    <div className="st-field"><label className="st-label">Province</label><input className="st-input" value={form.province} onChange={e => set("province", e.target.value)} /></div>
                </div>
                <div className="st-foot"><button className="st-btn-p" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></div>
            </div>

            <div className="st-card">
                <h3 className="st-card-t">Operational settings <span className="st-ro">read-only</span></h3>
                <div className="st-grid">
                    {[["Timezone", s.timezone], ["Currency", s.currency], ["Date format", s.date_format], ["Pay frequency", s.pay_frequency], ["Default vacation days", s.default_vacation_days], ["Default sick days", s.default_sick_days]].map(([k, v]) => (
                        <div className="st-field" key={k}><label className="st-label">{k}</label><input className="st-input" value={v ?? "—"} disabled /></div>
                    ))}
                </div>
            </div>
        </>
    );
}

const stCSS = `
  .st-wrap{max-width:820px;margin:0 auto;padding:4px 2px 40px}
  .st-flash{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:6px;background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;padding:9px 14px;border-radius:8px;font-size:13px;margin-bottom:14px}
  .st-head{display:flex;align-items:center;gap:16px;margin-bottom:20px}
  .st-avatar{width:60px;height:60px;border-radius:16px;background:linear-gradient(135deg,#2d9e8b,#22c55e);color:#fff;font-size:26px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .st-title{font-size:22px;font-weight:700;color:#1a1a2e}
  .st-sub{font-size:13px;color:#888;margin-top:2px}
  .st-tabs{display:flex;gap:2px;border-bottom:1px solid #e5e7eb;margin-bottom:20px}
  .st-tab{display:inline-flex;align-items:center;gap:6px;padding:10px 18px;border:none;background:none;border-bottom:2px solid transparent;font-family:inherit;font-size:13px;font-weight:600;color:#999;cursor:pointer;margin-bottom:-1px}
  .st-tab:hover{color:#555}
  .st-tab.on{color:#2d9e8b;border-bottom-color:#2d9e8b}
  .st-body{display:flex;flex-direction:column;gap:16px}
  .st-card{background:#fff;border:1px solid #eef0f2;border-radius:14px;padding:22px 24px}
  .st-card-t{font-size:15px;font-weight:700;color:#1a1a2e;margin-bottom:16px;display:flex;align-items:center;gap:8px}
  .st-ro{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#9ca3af;background:#f3f4f6;padding:2px 7px;border-radius:5px}
  .st-note{display:flex;align-items:flex-start;gap:7px;font-size:12px;color:#6b7280;line-height:1.55;background:#f8fafc;border:1px solid #eef2f7;border-radius:9px;padding:10px 12px;margin-bottom:16px}
  .st-err{background:#fef2f2;border:1px solid #fecaca;color:#dc2626;font-size:12.5px;padding:9px 12px;border-radius:8px;margin-bottom:14px}
  .st-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .st-field{display:flex;flex-direction:column}
  .st-field-full{grid-column:1/-1}
  .st-label{font-size:12px;font-weight:600;color:#6b7280;margin-bottom:6px}
  .st-input{width:100%;padding:10px 12px;border:1px solid #e2e5e9;border-radius:9px;font-family:inherit;font-size:13.5px;color:#1a1a2e;outline:none;box-sizing:border-box;transition:border-color .15s}
  .st-input:focus{border-color:#2d9e8b;box-shadow:0 0 0 3px rgba(45,158,139,.1)}
  .st-input:disabled{background:#f8fafc;color:#64748b;cursor:default}
  .st-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:18px}
  .st-meta{font-size:12px;color:#9ca3af}
  .st-btn-p{padding:10px 22px;border:none;border-radius:9px;background:#2d9e8b;color:#fff;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:background .15s}
  .st-btn-p:hover:not(:disabled){background:#268a79}
  .st-btn-p:disabled{opacity:.5;cursor:not-allowed}
  .st-btn-s{display:inline-flex;align-items:center;gap:6px;padding:9px 16px;border:1px solid #e2e5e9;border-radius:9px;background:#fff;color:#475569;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer}
  .st-btn-s:hover:not(:disabled){background:#f8fafc;border-color:#cbd5e1}
  @media(max-width:640px){.st-grid{grid-template-columns:1fr}}
`;
