import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";

const API_URL = "http://localhost:8080/api/execute";

async function api(action, body = {}) {
    const session = localStorage.getItem("ls_session");
    const res = await fetch(`${API_URL}?action=${action}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(session ? { Authorization: `Bearer ${session}` } : {}),
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`API ${action} failed: ${res.status}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || `API ${action} failed`);
    return json.data;
}

const LEAVE_TYPES = ["Vacation Leave", "Sick Leave", "Emergency Leave", "Maternity Leave", "Paternity Leave", "Bereavement Leave", "Unpaid Leave"];
const STATUS_COLORS = {
    Pending: "#f59e0b", Approved: "#22c55e", Rejected: "#ef4444", Cancelled: "#9ca3af",
};
const STATUS_ICONS = {
    Pending: "clock", Approved: "check-circle", Rejected: "x-circle", Cancelled: "slash",
};

function fmtDate(d) {
    if (!d) return "—";
    const dt = new Date(d + (d.length === 10 ? "T00:00:00" : ""));
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function daysBetween(a, b) {
    if (!a || !b) return 1;
    const d1 = new Date(a + "T00:00:00"), d2 = new Date(b + "T00:00:00");
    return Math.max(Math.round((d2 - d1) / 86400000) + 1, 0.5);
}

export default function LeaveTab({ employees = [] }) {
    const [leaves, setLeaves] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [searching, setSearching] = useState(false);
    const [statusFilter, setStatusFilter] = useState("");
    const [panel, setPanel] = useState({ open: false, mode: "add", leave: null });
    const [rejectModal, setRejectModal] = useState({ open: false, id: null, note: "" });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api("get_leaves", {});
            setLeaves(data.leaves || []);
        } catch { setLeaves([]); }
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!search) { setDebouncedSearch(""); setSearching(false); return; }
        setSearching(true);
        const t = setTimeout(() => { setDebouncedSearch(search); setSearching(false); }, 300);
        return () => clearTimeout(t);
    }, [search]);

    const openAdd = () => setPanel({ open: true, mode: "add", leave: null });
    const openView = (l) => setPanel({ open: true, mode: "view", leave: l });
    const closePanel = () => setPanel({ open: false, mode: "add", leave: null });

    const saveLeave = async (rec, isNew) => {
        closePanel();
        try {
            await api(isNew ? "create_leave" : "update_leave", rec);
            load();
        } catch (e) { alert("Save failed: " + e.message); }
    };

    const approveLeave = async (id) => {
        try {
            await api("approve_leave", { id, status: "Approved" });
            load();
        } catch (e) { alert("Approve failed: " + e.message); }
    };

    const openReject = (id) => setRejectModal({ open: true, id, note: "" });
    const closeReject = () => setRejectModal({ open: false, id: null, note: "" });
    const confirmReject = async () => {
        try {
            await api("approve_leave", { id: rejectModal.id, status: "Rejected", rejection_note: rejectModal.note });
            closeReject();
            load();
        } catch (e) { alert("Reject failed: " + e.message); }
    };

    const deleteLeave = async (id) => {
        closePanel();
        try {
            await api("delete_leave", { id });
            load();
        } catch (e) { alert("Delete failed: " + e.message); }
    };

    // Search + status filter
    const filtered = leaves.filter(l => {
        if (debouncedSearch) {
            const name = `${l.first_name} ${l.last_name}`.toLowerCase();
            if (!name.includes(debouncedSearch.toLowerCase()) && !(l.leave_type || "").toLowerCase().includes(debouncedSearch.toLowerCase())) return false;
        }
        if (statusFilter && l.status !== statusFilter) return false;
        return true;
    });

    return (<>
        {/* Bar */}
        <div className="lv-bar">
            <div className="lv-bar-left">
                <div className="lv-search-wrap">
                    {searching
                        ? <div className="lv-spinner" />
                        : <I name="search" size={14} />
                    }
                    <input className="lv-search" placeholder="Search leaves..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <select className="lv-status-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="">All Status</option>
                    <option value="Pending">Requests</option>
                    <option value="Approved">Approved</option>
                    <option value="Rejected">Denied</option>
                </select>
            </div>
            <button className="lv-btn-p" onClick={openAdd}><I name="plus" size={14} /> New Request</button>
        </div>

        {/* Table */}
        {loading || searching ? (
            <div className="lv-empty">
                <div className="lv-loading-spinner" />
                <div className="lv-empty-t">{loading ? "Loading..." : "Searching..."}</div>
                <div className="lv-empty-d">{loading ? "Fetching leave records" : "Looking for matching results"}</div>
            </div>
        ) : filtered.length === 0 ? (
            <div className="lv-empty">
                <div className="lv-empty-ic"><I name="calendar" size={28} /></div>
                <div className="lv-empty-t">{debouncedSearch || statusFilter ? "No matches found" : "No leave requests"}</div>
                <div className="lv-empty-d">{debouncedSearch || statusFilter ? "Try a different search term or filter." : "No leave requests have been filed yet."}</div>
            </div>
        ) : (
            <div style={{overflowX:"auto",flex:1,background:"#fff",borderRadius:10}}>
                <table className="lv-tbl">
                    <thead>
                    <tr>
                        <th>Employee</th>
                        <th>Department</th>
                        <th>Leave Type</th>
                        <th>Start</th>
                        <th>End</th>
                        <th>Days</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                    </thead>
                    <tbody>
                    {filtered.map(l => {
                        const sc = STATUS_COLORS[l.status] || "#ccc";
                        return (
                            <tr key={l.id} onClick={() => openView(l)}>
                                <td>
                                    <div className="lv-emp">
                                        <span className="lv-emp-av" style={{background: sc + "18", color: sc}}>{(l.first_name?.[0] || "") + (l.last_name?.[0] || "")}</span>
                                        <div>
                                            <div className="lv-emp-name">{l.first_name} {l.last_name}</div>
                                            <div className="lv-emp-pos">{l.position || "—"}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="lv-td-dept">{l.department || "—"}</td>
                                <td className="lv-td-type"><I name="file-text" size={12} /> {l.leave_type}</td>
                                <td className="lv-td-date">{fmtDate(l.start_date)}</td>
                                <td className="lv-td-date">{fmtDate(l.end_date)}</td>
                                <td className="lv-td-days">{l.days} day{l.days !== 1 ? "s" : ""}</td>
                                <td><span className="lv-badge" style={{ background: sc + "18", color: sc }}><I name={STATUS_ICONS[l.status] || "circle"} size={11} /> {l.status}</span></td>
                                <td onClick={e => e.stopPropagation()}>
                                    {l.status === "Pending" ? (
                                        <div className="lv-tbl-actions">
                                            <button className="lv-act lv-act-ok" onClick={() => approveLeave(l.id)} title="Approve"><I name="check" size={13} /></button>
                                            <button className="lv-act lv-act-no" onClick={() => openReject(l.id)} title="Reject"><I name="x" size={13} /></button>
                                        </div>
                                    ) : (
                                        <span className="lv-td-na">—</span>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                    </tbody>
                </table>
            </div>
        )}

        {/* Reject modal */}
        {rejectModal.open && (<>
            <div className="lv-modal-bg" onClick={closeReject} />
            <div className="lv-modal">
                <h3 className="lv-modal-t">Reject Leave Request</h3>
                <p className="lv-modal-d">Provide a reason for rejection (optional):</p>
                <textarea className="lv-modal-ta" value={rejectModal.note} onChange={e => setRejectModal(prev => ({ ...prev, note: e.target.value }))} placeholder="Reason for rejection..." rows={3} />
                <div className="lv-modal-btns">
                    <button className="bp-btn-cancel" onClick={closeReject}>Cancel</button>
                    <button className="lv-modal-reject" onClick={confirmReject}>Reject</button>
                </div>
            </div>
        </>)}

        <LeavePanel
            open={panel.open}
            mode={panel.mode}
            leave={panel.leave}
            employees={employees}
            onClose={closePanel}
            onSave={saveLeave}
            onDelete={deleteLeave}
            onApprove={approveLeave}
            onReject={openReject}
        />

        <style>{lvCSS}</style>
    </>);
}

/* ================================================================
   SEARCHABLE EMPLOYEE PICKER (handles 1000+ employees)
================================================================ */
function EmployeePicker({ employees, value, onChange }) {
    const [query, setQuery] = useState("");
    const [showDrop, setShowDrop] = useState(false);
    const wrapRef = useState(null);

    const selected = employees.find(e => String(e.id) === String(value));

    const filtered = query.trim()
        ? employees.filter(e => {
            const full = `${e.first_name} ${e.last_name} ${e.department || ""}`.toLowerCase();
            return full.includes(query.toLowerCase());
        }).slice(0, 50)
        : [];

    const pick = (emp) => {
        onChange(emp.id);
        setQuery("");
        setShowDrop(false);
    };

    const clear = () => {
        onChange("");
        setQuery("");
    };

    // close dropdown on outside click
    useEffect(() => {
        const handler = (e) => {
            if (wrapRef[0] && !wrapRef[0].contains(e.target)) setShowDrop(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    if (selected && !showDrop) {
        return (
            <div className="ep-selected">
                <span className="ep-sel-av">{(selected.first_name?.[0] || "") + (selected.last_name?.[0] || "")}</span>
                <div className="ep-sel-info">
                    <span className="ep-sel-name">{selected.first_name} {selected.last_name}</span>
                    {selected.department && <span className="ep-sel-dept">{selected.department}</span>}
                </div>
                <button type="button" className="ep-sel-clear" onClick={clear} title="Change employee">✕</button>
            </div>
        );
    }

    return (
        <div className="ep-wrap" ref={el => wrapRef[0] = el}>
            <div className="ep-input-wrap">
                <I name="search" size={13} style={{ color: "#bbb", flexShrink: 0 }} />
                <input
                    className="ep-input"
                    placeholder="Type to search employees..."
                    value={query}
                    onChange={e => { setQuery(e.target.value); setShowDrop(true); }}
                    onFocus={() => setShowDrop(true)}
                    autoComplete="off"
                />
                {query && <button type="button" className="ep-clear" onClick={() => setQuery("")}>✕</button>}
            </div>
            {showDrop && (
                <div className="ep-drop">
                    {!query.trim() ? (
                        <div className="ep-hint">Start typing a name to search {employees.length.toLocaleString()} employees...</div>
                    ) : filtered.length === 0 ? (
                        <div className="ep-hint">No employees match "{query}"</div>
                    ) : (<>
                        {filtered.map(emp => (
                            <div key={emp.id} className="ep-item" onClick={() => pick(emp)}>
                                <span className="ep-item-av">{(emp.first_name?.[0] || "") + (emp.last_name?.[0] || "")}</span>
                                <div className="ep-item-info">
                                    <span className="ep-item-name">{emp.first_name} {emp.last_name}</span>
                                    {emp.department && <span className="ep-item-dept">{emp.department}</span>}
                                </div>
                            </div>
                        ))}
                        {filtered.length === 50 && <div className="ep-hint">Showing first 50 results. Keep typing to narrow down...</div>}
                    </>)}
                </div>
            )}
        </div>
    );
}

/* ================================================================
   PANEL (view/edit) + MODAL (add)
================================================================ */
function LeavePanel({ open, mode, leave, employees, onClose, onSave, onDelete, onApprove, onReject }) {
    const [form, setForm] = useState({});
    const [currentMode, setCurrentMode] = useState(mode);

    useEffect(() => {
        if (leave && (mode === "view" || mode === "edit")) {
            setForm({
                ...leave,
                start_date: (leave.start_date || "").substring(0, 10),
                end_date: (leave.end_date || "").substring(0, 10),
                reason: leave.reason || "",
            });
        } else {
            setForm({ leave_type: "Vacation Leave", days: 1, reason: "" });
        }
        setCurrentMode(mode);
    }, [leave, mode, open]);

    if (!open) return null;

    const isView = currentMode === "view";
    const isAdd = currentMode === "add";
    const set = (k, v) => {
        const next = { ...form, [k]: v };
        if ((k === "start_date" || k === "end_date") && next.start_date && next.end_date) {
            next.days = daysBetween(next.start_date, next.end_date);
        }
        setForm(next);
    };

    const handleSave = () => {
        if (isAdd && !form.employee_id) return;
        if (!form.leave_type || !form.start_date || !form.end_date) return;
        const payload = {
            ...form,
            days: form.days || daysBetween(form.start_date, form.end_date),
            reason: form.reason || null,
        };
        onSave(payload, isAdd);
    };

    const sc = STATUS_COLORS[form.status] || "#ccc";

    /* ── Form fields (shared across add, edit, view) ── */
    const ro = isView;
    const renderFields = () => (
        <div className="bp-section">
            <h4 className="bp-sec-title">Leave Details</h4>
            <div className="bp-fields">
                {isAdd ? (
                    <div className="bp-field bp-field-full">
                        <label className="bp-label">Employee <span className="bp-req">*</span></label>
                        <EmployeePicker employees={employees} value={form.employee_id || ""} onChange={v => set("employee_id", v)} />
                    </div>
                ) : (
                    <div className="bp-field bp-field-full">
                        <label className="bp-label">Employee</label>
                        <input className="bp-input" value={`${form.first_name || ""} ${form.last_name || ""}`} disabled />
                    </div>
                )}
                {ro && form.department && (
                    <div className="bp-field bp-field-full">
                        <label className="bp-label">Department</label>
                        <input className="bp-input" value={form.department} disabled />
                    </div>
                )}
                <div className="bp-field bp-field-full">
                    <label className="bp-label">Leave Type {!ro && <span className="bp-req">*</span>}</label>
                    {ro ? (
                        <input className="bp-input" value={form.leave_type || ""} disabled />
                    ) : (
                        <select className="bp-input" value={form.leave_type || ""} onChange={e => set("leave_type", e.target.value)}>
                            {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    )}
                </div>
                <div className="bp-field">
                    <label className="bp-label">Start Date {!ro && <span className="bp-req">*</span>}</label>
                    {ro ? (
                        <input className="bp-input" value={fmtDate(form.start_date)} disabled />
                    ) : (
                        <input type="date" className="bp-input" value={form.start_date || ""} onChange={e => set("start_date", e.target.value)} />
                    )}
                </div>
                <div className="bp-field">
                    <label className="bp-label">End Date {!ro && <span className="bp-req">*</span>}</label>
                    {ro ? (
                        <input className="bp-input" value={fmtDate(form.end_date)} disabled />
                    ) : (
                        <input type="date" className="bp-input" value={form.end_date || ""} onChange={e => set("end_date", e.target.value)} />
                    )}
                </div>
                <div className="bp-field">
                    <label className="bp-label">Days</label>
                    <input type={ro ? "text" : "number"} className="bp-input" value={form.days || ""} onChange={e => set("days", parseFloat(e.target.value) || 0)} step="0.5" min="0.5" disabled={ro} />
                </div>
                {ro && (
                    <div className="bp-field">
                        <label className="bp-label">Status</label>
                        <div style={{paddingTop:4}}>
                            <span className="lv-badge" style={{ background: sc + "18", color: sc }}><I name={STATUS_ICONS[form.status] || "circle"} size={11} /> {form.status}</span>
                        </div>
                    </div>
                )}
                <div className="bp-field bp-field-full">
                    <label className="bp-label">Reason</label>
                    <textarea className="bp-input bp-textarea" value={form.reason || ""} onChange={e => set("reason", e.target.value)} placeholder={ro ? "—" : "Why are you taking leave?"} rows={3} disabled={ro} />
                </div>
                {ro && form.rejection_note && (
                    <div className="bp-field bp-field-full">
                        <label className="bp-label">Rejection Note</label>
                        <textarea className="bp-input bp-textarea" value={form.rejection_note} rows={2} disabled />
                    </div>
                )}
            </div>
        </div>
    );

    /* ── ADD MODE → Centered Modal ── */
    if (isAdd) {
        return (<>
            <div className="lm-bg" onClick={onClose} />
            <div className="lm-modal">
                <div className="lm-head">
                    <div className="lm-head-left">
                        <div className="lm-head-ic"><I name="calendar" size={18} /></div>
                        <div>
                            <h2 className="lm-title">New Leave Request</h2>
                            <p className="lm-sub">File a leave request for an employee</p>
                        </div>
                    </div>
                    <button className="bp-close" onClick={onClose}>✕</button>
                </div>
                <div className="lm-body">
                    {renderFields()}
                </div>
                <div className="lm-foot">
                    <button className="bp-btn-cancel" onClick={onClose}>Cancel</button>
                    <button className="bp-btn-primary" onClick={handleSave}>Submit Request</button>
                </div>
            </div>
        </>);
    }

    /* ── VIEW / EDIT MODE → Centered Modal ── */
    return (<>
        <div className="lm-bg" onClick={onClose} />
        <div className="lm-modal">
            <div className="lm-head">
                <div className="lm-head-left">
                    <div className="lm-head-ic" style={{ background: sc + "20", color: sc }}><I name={STATUS_ICONS[form.status] || "calendar"} size={18} /></div>
                    <div>
                        <h2 className="lm-title">{isView ? `${form.first_name} ${form.last_name}` : "Edit Leave"}</h2>
                        <p className="lm-sub">{isView ? form.leave_type : `${form.first_name} ${form.last_name}`}</p>
                    </div>
                </div>
                <div style={{display:'flex',gap:6,alignItems:'center'}}>
                    {isView && form.status === "Pending" && (
                        <button className="bp-btn-edit" onClick={() => setCurrentMode("edit")}><I name="edit-2" size={13} /> Edit</button>
                    )}
                    <button className="bp-close" onClick={onClose}>✕</button>
                </div>
            </div>
            <div className="lm-body">
                {renderFields()}
            </div>
            <div className="lm-foot">
                {isView && form.status === "Pending" ? (<>
                    <button className="bp-btn-danger" onClick={() => onDelete(form.id)}>Delete</button>
                    <div style={{flex:1}} />
                    <button className="lv-foot-reject" onClick={() => { onClose(); onReject(form.id); }}>Reject</button>
                    <button className="lv-foot-approve" onClick={() => { onApprove(form.id); onClose(); }}><I name="check" size={13} /> Approve</button>
                </>) : isView ? (
                    <button className="bp-btn-cancel" onClick={onClose}>Close</button>
                ) : (<>
                    <button className="bp-btn-cancel" onClick={currentMode === "edit" ? () => setCurrentMode("view") : onClose}>Cancel</button>
                    <button className="bp-btn-primary" onClick={handleSave}>Save Changes</button>
                </>)}
            </div>
        </div>
    </>);
}

/* ================================================================
   STYLES
================================================================ */
const lvCSS = `
  .lv-bar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap}
  .lv-bar-left{display:flex;align-items:center;gap:8px}
  .lv-search-wrap{display:flex;align-items:center;gap:8px;padding:8px 14px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;flex:1;max-width:200px;color:#aaa}
  .lv-search{border:none;outline:none;font-family:'DM Sans',sans-serif;font-size:13px;color:#333;flex:1;background:transparent}
  .lv-search::placeholder{color:#bbb}
  .lv-status-filter{padding:7px 12px;border:1px solid #e0e0e0;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:12px;color:#555;background:#fff;outline:none}
  .lv-btn-p{display:flex;align-items:center;gap:5px;padding:9px 18px;border:none;border-radius:8px;background:#f59e0b;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;color:#fff;cursor:pointer;transition:background .15s;white-space:nowrap}
  .lv-btn-p:hover{background:#d97706}

  @keyframes lv-spin{to{transform:rotate(360deg)}}
  .lv-spinner{width:14px;height:14px;border:2px solid #e0e0e0;border-top-color:#f59e0b;border-radius:50%;animation:lv-spin .6s linear infinite;flex-shrink:0}
  .lv-loading-spinner{width:36px;height:36px;border:3px solid #fef3c7;border-top-color:#f59e0b;border-radius:50%;animation:lv-spin .7s linear infinite;margin:0 auto 12px}

  .lv-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:60px 20px;background:#fff;border-radius:10px}
  .lv-empty-ic{width:56px;height:56px;border-radius:50%;background:#fef3c7;color:#f59e0b;display:flex;align-items:center;justify-content:center;margin:0 auto 12px}
  .lv-empty-t{font-size:15px;font-weight:700;color:#333;margin-bottom:4px}
  .lv-empty-d{font-size:13px;color:#999}

  .lv-tbl{width:100%;border-collapse:collapse;font-size:13px;background:#fff;border-radius:10px;overflow:hidden}
  .lv-tbl thead th{text-align:left;padding:10px 14px;font-size:11px;font-weight:600;color:#999;text-transform:uppercase;letter-spacing:.03em;border-bottom:1px solid #eee;background:#fafbfa;vertical-align:middle}
  .lv-tbl tbody td{padding:12px 14px;border-bottom:1px solid #f5f5f5;color:#444;vertical-align:middle}
  .lv-tbl tbody tr{transition:background .1s;cursor:pointer}
  .lv-tbl tbody tr:hover{background:#fffbeb}

  .lv-emp{display:flex;align-items:center;gap:10px}
  .lv-emp-av{width:34px;height:34px;border-radius:8px;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .lv-emp-name{font-weight:600;color:#222;font-size:13px}
  .lv-emp-pos{font-size:11px;color:#aaa;margin-top:1px}
  .lv-td-dept{color:#666;font-size:12px}
  .lv-td-type{display:inline-flex;align-items:center;gap:5px;color:#555;font-size:12px}
  .lv-td-date{font-weight:500;color:#333;font-size:12px;white-space:nowrap}
  .lv-td-days{font-weight:600;color:#555;font-size:12px}
  .lv-td-na{color:#ccc;font-size:12px}
  .lv-badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap}

  .lv-tbl-actions{display:flex;gap:6px}
  .lv-act{width:30px;height:30px;border-radius:6px;border:1px solid #e0e0e0;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .12s}
  .lv-act-ok{color:#22c55e;border-color:#bbf7d0}
  .lv-act-ok:hover{background:#22c55e;color:#fff;border-color:#22c55e}
  .lv-act-no{color:#ef4444;border-color:#fecaca}
  .lv-act-no:hover{background:#ef4444;color:#fff;border-color:#ef4444}

  /* Add Leave Modal */
  .lm-bg{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:400;animation:bpFade .15s}
  .lm-modal{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:16px;width:520px;max-width:92vw;max-height:85vh;z-index:401;box-shadow:0 20px 60px rgba(0,0,0,.15);display:flex;flex-direction:column;animation:lmPop .2s ease-out}
  @keyframes lmPop{from{opacity:0;transform:translate(-50%,-50%) scale(.96)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
  @keyframes bpFade{from{opacity:0}to{opacity:1}}
  .lm-head{display:flex;align-items:flex-start;justify-content:space-between;padding:20px 24px;border-bottom:1px solid #eee}
  .lm-head-left{display:flex;align-items:center;gap:12px}
  .lm-head-ic{width:40px;height:40px;border-radius:10px;background:#fef3c7;color:#f59e0b;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .lm-title{font-size:18px;font-weight:700;color:#222;margin:0}
  .lm-sub{font-size:12px;color:#999;margin:3px 0 0}
  .lm-body{flex:1;overflow-y:auto;padding:20px 24px}
  .lm-foot{display:flex;justify-content:flex-end;gap:8px;padding:16px 24px;border-top:1px solid #eee;background:#fafbfa;border-radius:0 0 16px 16px}

  @media(max-width:768px){
    .lm-modal{width:96vw;max-height:90vh}
  }

  /* Reject modal */
  .lv-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:400;animation:bpFade .12s}
  .lv-modal{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:16px;padding:28px;width:420px;max-width:90vw;z-index:401;box-shadow:0 12px 40px rgba(0,0,0,.12)}
  .lv-modal-t{font-size:18px;font-weight:700;color:#222;margin-bottom:6px}
  .lv-modal-d{font-size:13px;color:#888;margin-bottom:14px}
  .lv-modal-ta{width:100%;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:13px;color:#333;outline:none;resize:vertical;box-sizing:border-box}
  .lv-modal-ta:focus{border-color:#ef4444}
  .lv-modal-btns{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
  .lv-modal-reject{padding:9px 20px;border:none;border-radius:8px;background:#ef4444;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;color:#fff;cursor:pointer}
  .lv-modal-reject:hover{background:#dc2626}

  /* Panel footer buttons */
  .lv-foot-approve{display:flex;align-items:center;gap:5px;padding:9px 20px;border:none;border-radius:8px;background:#22c55e;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;color:#fff;cursor:pointer;transition:all .15s}
  .lv-foot-approve:hover{background:#16a34a}
  .lv-foot-reject{padding:9px 16px;border:1px solid #fecaca;border-radius:8px;background:#fef2f2;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;color:#ef4444;cursor:pointer}
  .lv-foot-reject:hover{background:#ef4444;color:#fff}

  @media(max-width:768px){
    .lv-bar{flex-direction:column;align-items:stretch}
    .lv-bar-left{flex-wrap:wrap}
    .lv-search-wrap{max-width:100%}
  }

  /* Shared panel/modal classes */
  .bp-close{width:32px;height:32px;border-radius:8px;border:1px solid #eee;background:#fff;cursor:pointer;font-size:16px;color:#999;display:flex;align-items:center;justify-content:center;flex-shrink:0}

  /* Employee Picker */
  .ep-wrap{position:relative}
  .ep-input-wrap{display:flex;align-items:center;gap:8px;padding:9px 12px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;transition:border-color .15s}
  .ep-input-wrap:focus-within{border-color:#f59e0b;box-shadow:0 0 0 2px rgba(245,158,11,.1)}
  .ep-input{border:none;outline:none;font-family:'DM Sans',sans-serif;font-size:13px;color:#333;flex:1;background:transparent}
  .ep-input::placeholder{color:#bbb}
  .ep-clear{background:none;border:none;color:#bbb;cursor:pointer;font-size:14px;padding:0 2px;line-height:1}
  .ep-clear:hover{color:#999}
  .ep-drop{position:absolute;top:calc(100% + 4px);left:0;right:0;background:#fff;border:1px solid #e0e0e0;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.1);max-height:240px;overflow-y:auto;z-index:10}
  .ep-hint{padding:14px 16px;font-size:12px;color:#aaa;text-align:center}
  .ep-item{display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;transition:background .1s}
  .ep-item:hover{background:#fef3c7}
  .ep-item-av{width:30px;height:30px;border-radius:8px;background:#f3f4f6;color:#888;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .ep-item-info{display:flex;flex-direction:column;min-width:0}
  .ep-item-name{font-size:13px;font-weight:600;color:#222;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ep-item-dept{font-size:11px;color:#aaa}
  .ep-selected{display:flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid #e0e0e0;border-radius:8px;background:#fafbfa}
  .ep-sel-av{width:32px;height:32px;border-radius:8px;background:#fef3c7;color:#d97706;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .ep-sel-info{display:flex;flex-direction:column;flex:1;min-width:0}
  .ep-sel-name{font-size:13px;font-weight:600;color:#222}
  .ep-sel-dept{font-size:11px;color:#aaa}
  .ep-sel-clear{background:none;border:none;color:#ccc;cursor:pointer;font-size:14px;padding:4px;line-height:1;border-radius:4px}
  .ep-sel-clear:hover{color:#999;background:#f0f0f0}
  .bp-close:hover{background:#f5f5f5;color:#333}
  .bp-btn-edit{display:flex;align-items:center;gap:4px;padding:6px 12px;border:1px solid #fde68a;border-radius:6px;background:#fef3c7;font-family:'DM Sans',sans-serif;font-size:11px;font-weight:600;color:#d97706;cursor:pointer;transition:all .12s}
  .bp-btn-edit:hover{background:#f59e0b;color:#fff}
  .bp-section{margin-bottom:20px}
  .bp-sec-title{font-size:13px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px}
  .bp-req{color:#ef4444}
  .bp-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .bp-field{display:flex;flex-direction:column}
  .bp-field-full{grid-column:1/-1}
  .bp-label{font-size:12px;font-weight:600;color:#666;margin-bottom:5px}
  .bp-input{width:100%;padding:9px 12px;border:1px solid #e0e0e0;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:13px;color:#333;outline:none;transition:border-color .15s;background:#fff;box-sizing:border-box}
  .bp-input:focus{border-color:#f59e0b;box-shadow:0 0 0 2px rgba(245,158,11,.1)}
  .bp-input:disabled{background:#fafbfa;color:#555;cursor:default}
  .bp-textarea{resize:vertical;min-height:56px}
  .bp-btn-cancel{padding:9px 18px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;color:#666;cursor:pointer}
  .bp-btn-cancel:hover{background:#f5f5f5}
  .bp-btn-primary{display:flex;align-items:center;gap:5px;padding:9px 22px;border:none;border-radius:8px;background:#f59e0b;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;color:#fff;cursor:pointer;transition:all .15s}
  .bp-btn-primary:hover{background:#d97706}
  .bp-btn-danger{padding:9px 16px;border:1px solid #fecaca;border-radius:8px;background:#fef2f2;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;color:#ef4444;cursor:pointer;margin-right:auto}
  .bp-btn-danger:hover{background:#ef4444;color:#fff}
`;
