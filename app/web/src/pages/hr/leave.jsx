import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";
import Modal from "../components/Modal";

const API_URL = (import.meta.env.VITE_API_BASE||"")+"/api/execute";

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
    const company = JSON.parse(localStorage.getItem("ls_company") || "{}");
    const currentUser = JSON.parse(localStorage.getItem("ls_user") || "{}");
    const isEmployee = company.role === "employee";
    const myEmployee = isEmployee ? employees.find(e => e.user_id === currentUser.id) : null;

    const [leaves, setLeaves] = useState([]);
    const [loading, setLoading] = useState(false);
    const [statusFilter, setStatusFilter] = useState("");
    const [search, setSearch] = useState("");
    const [panel, setPanel] = useState({ open: false, mode: "add", leave: null });
    const [rejectModal, setRejectModal] = useState({ open: false, id: null, note: "" });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api("get_leaves", { status: statusFilter });
            setLeaves(data.leaves || []);
        } catch { setLeaves([]); }
        setLoading(false);
    }, [statusFilter]);

    useEffect(() => { load(); }, [load]);

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

    // Stats — filter to own leaves for employee role
    const myLeaves = isEmployee && myEmployee
        ? leaves.filter(l => l.employee_id === myEmployee.id)
        : leaves;
    // Search filter
    const filtered = myLeaves.filter(l => {
        if (!search) return true;
        const name = `${l.first_name} ${l.last_name}`.toLowerCase();
        return name.includes(search.toLowerCase()) || (l.leave_type || "").toLowerCase().includes(search.toLowerCase());
    });

    return (<>
        {/* Bar */}
        <div className="lv-bar">
            <div className="lv-bar-left">
                <span className="lv-bar-count">{filtered.length} requests</span>
                <div className="lv-tabs">
                    {["", "Pending", "Approved", "Rejected"].map(s => (
                        <button key={s} className={`lv-tab ${statusFilter === s ? "lv-tab-a" : ""}`} onClick={() => setStatusFilter(s)}>
                            {s || "All"}
                        </button>
                    ))}
                </div>
            </div>
            <div className="lv-bar-right">
                {!isEmployee && <input className="lv-search" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />}
                <button className="lv-btn-p" onClick={openAdd}><I name="plus" size={14} /> New Request</button>
            </div>
        </div>

        {/* Table */}
        {loading ? (
            <div className="lv-loading">Loading...</div>
        ) : filtered.length === 0 ? (
            <div className="lv-empty">
                <div className="lv-empty-ic"><I name="calendar" size={32} /></div>
                <h3 className="lv-empty-t">No leave requests</h3>
                <p className="lv-empty-d">{statusFilter ? `No ${statusFilter.toLowerCase()} requests.` : "Create a leave request to get started."}</p>
            </div>
        ) : (
            <div className="lv-tbl-wrap">
                <table className="lv-tbl">
                    <thead>
                    <tr>
                        <th>Employee</th>
                        <th>Type</th>
                        <th>Dates</th>
                        <th>Days</th>
                        <th>Status</th>
                        <th>Reason</th>
                        <th>Actions</th>
                    </tr>
                    </thead>
                    <tbody>
                    {filtered.map(l => {
                        const sc = STATUS_COLORS[l.status] || "#ccc";
                        return (
                            <tr key={l.id} className="lv-row" onClick={() => openView(l)}>
                                <td>
                                    <div className="lv-emp">
                                        <span className="lv-emp-av">{(l.first_name?.[0] || "") + (l.last_name?.[0] || "")}</span>
                                        <div>
                                            <div className="lv-emp-name">{l.first_name} {l.last_name}</div>
                                            <div className="lv-emp-dept">{l.department || "—"}</div>
                                        </div>
                                    </div>
                                </td>
                                <td><span className="lv-type">{l.leave_type}</span></td>
                                <td className="lv-td-date">{fmtDate(l.start_date)} — {fmtDate(l.end_date)}</td>
                                <td className="lv-td-days">{l.days}</td>
                                <td><span className="lv-badge" style={{ background: sc + "18", color: sc }}><I name={STATUS_ICONS[l.status] || "circle"} size={11} /> {l.status}</span></td>
                                <td className="lv-td-reason">{l.reason || "—"}</td>
                                <td onClick={e => e.stopPropagation()}>
                                    <div className="lv-actions">
                                        {l.status === "Pending" && (<>
                                            <button className="lv-act lv-act-ok" onClick={() => approveLeave(l.id)} title="Approve"><I name="check" size={14} /></button>
                                            <button className="lv-act lv-act-no" onClick={() => openReject(l.id)} title="Reject"><I name="x" size={14} /></button>
                                        </>)}
                                    </div>
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
                    <button className="ap-btn-cancel" onClick={closeReject}>Cancel</button>
                    <button className="lv-modal-reject" onClick={confirmReject}>Reject</button>
                </div>
            </div>
        </>)}

        <LeavePanel
            open={panel.open}
            mode={panel.mode}
            leave={panel.leave}
            employees={isEmployee && myEmployee ? [myEmployee] : employees}
            onClose={closePanel}
            onSave={saveLeave}
            onDelete={deleteLeave}
            onApprove={approveLeave}
            onReject={openReject}
            readOnly={isEmployee}
        />

        <style>{lvCSS}</style>
    </>);
}

/* ================================================================
   PANEL
================================================================ */
function LeavePanel({ open, mode, leave, employees, onClose, onSave, onDelete, onApprove, onReject, readOnly }) {
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
    const isEdit = currentMode === "edit";
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
    const empName = form.first_name ? `${form.first_name} ${form.last_name}` : "";

    const renderFormFields = () => (
        <div className="ap-section">
            <h4 className="ap-sec-title">Leave Details</h4>
            <div className="ap-fields">
                {isAdd && (
                    <div className="ap-field ap-field-full">
                        <label className="ap-label">Employee <span className="ap-req"/></label>
                        <select className="ap-input" value={form.employee_id || ""} onChange={e => set("employee_id", e.target.value)}>
                            <option value="">Select employee...</option>
                            {employees.map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>
                            ))}
                        </select>
                    </div>
                )}
                {isView && (
                    <div className="ap-field ap-field-full">
                        <label className="ap-label">Employee</label>
                        <input className="ap-input" value={empName || "—"} disabled />
                    </div>
                )}
                <div className="ap-field ap-field-full">
                    <label className="ap-label">Leave Type {!isView && <span className="ap-req"/>}</label>
                    {isView
                        ? <input className="ap-input" value={form.leave_type || "—"} disabled />
                        : <select className="ap-input" value={form.leave_type || ""} onChange={e => set("leave_type", e.target.value)}>
                            {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    }
                </div>
                <div className="ap-field">
                    <label className="ap-label">Start Date {!isView && <span className="ap-req"/>}</label>
                    <input type={isView ? "text" : "date"} className="ap-input" value={isView ? fmtDate(form.start_date) : (form.start_date || "")} onChange={e => set("start_date", e.target.value)} disabled={isView} />
                </div>
                <div className="ap-field">
                    <label className="ap-label">End Date {!isView && <span className="ap-req"/>}</label>
                    <input type={isView ? "text" : "date"} className="ap-input" value={isView ? fmtDate(form.end_date) : (form.end_date || "")} onChange={e => set("end_date", e.target.value)} disabled={isView} />
                </div>
                <div className="ap-field">
                    <label className="ap-label">Days</label>
                    <input type={isView ? "text" : "number"} className="ap-input" value={form.days || ""} onChange={e => set("days", parseFloat(e.target.value) || 0)} step="0.5" min="0.5" disabled={isView} />
                </div>
                <div className="ap-field">
                    <label className="ap-label">Status</label>
                    {isView
                        ? <span className="lv-badge" style={{ background: sc + "18", color: sc }}><I name={STATUS_ICONS[form.status] || "circle"} size={11} /> {form.status}</span>
                        : <input className="ap-input" value={form.status || "Pending"} disabled />
                    }
                </div>
                {isView && form.department && (
                    <div className="ap-field ap-field-full">
                        <label className="ap-label">Department</label>
                        <input className="ap-input" value={form.department} disabled />
                    </div>
                )}
                <div className="ap-field ap-field-full">
                    <label className="ap-label">Reason</label>
                    <textarea className="ap-input ap-textarea" value={form.reason || ""} onChange={e => set("reason", e.target.value)} placeholder="Why are you taking leave?" rows={2} disabled={isView} />
                </div>
                {isView && form.rejection_note && (
                    <div className="ap-field ap-field-full">
                        <label className="ap-label">Rejection Note</label>
                        <textarea className="ap-input ap-textarea" value={form.rejection_note} disabled rows={2} />
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <Modal
            title={isAdd ? "New Leave Request" : isEdit ? "Edit Leave" : "Leave Request"}
            subtitle={isAdd ? "File a leave request" : empName}
            onClose={isEdit ? () => setCurrentMode("view") : onClose}
        >
            <div className="ap-modal-layout">
                <div className="ap-modal-scroll">
                    {renderFormFields()}
                </div>
                <div className="ap-modal-foot">
                    <div className="ap-foot-btns">
                        {isView && form.status === "Pending" ? (<>
                            <button className="ap-btn-danger" onClick={() => onDelete(form.id)}>Delete</button>
                            {!readOnly && <button className="lv-foot-reject" onClick={() => { onClose(); onReject(form.id); }}>Reject</button>}
                            {!readOnly && <button className="lv-foot-approve" onClick={() => { onApprove(form.id); onClose(); }}><I name="check" size={13} /> Approve</button>}
                        </>) : isView ? (
                            <button className="ap-btn-cancel" onClick={onClose}>Close</button>
                        ) : (<>
                            <button className="ap-btn-cancel" onClick={isEdit ? () => setCurrentMode("view") : onClose}>Cancel</button>
                            <button className="ap-btn-primary" onClick={handleSave}>{isAdd ? "Submit Request" : "Save Changes"}</button>
                        </>)}
                    </div>
                </div>
            </div>
        </Modal>
    );
}

/* ================================================================
   STYLES
================================================================ */
const lvCSS = `
  .lv-bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px}
  .lv-bar-left{display:flex;align-items:center;gap:12px}
  .lv-bar-right{display:flex;align-items:center;gap:8px}
  .lv-bar-count{font-size:13px;color:#888}
  .lv-tabs{display:flex;gap:2px;background:#f3f4f6;border-radius:8px;padding:2px}
  .lv-tab{padding:6px 14px;border:none;border-radius:6px;background:transparent;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:500;color:#666;cursor:pointer;transition:all .12s}
  .lv-tab:hover{color:#333}
  .lv-tab-a{background:#fff;color:#222;font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,.06)}
  .lv-search{padding:7px 12px;border:1px solid #e0e0e0;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:12px;color:#333;width:160px;outline:none}
  .lv-search:focus{border-color:#f59e0b}
  .lv-btn-p{display:flex;align-items:center;gap:5px;padding:9px 18px;border:none;border-radius:8px;background:#f59e0b;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;color:#fff;cursor:pointer;transition:all .15s}
  .lv-btn-p:hover{background:#d97706}
  .lv-loading{text-align:center;padding:40px;color:#999;font-size:14px}

  .lv-empty{text-align:center;padding:60px 20px}
  .lv-empty-ic{width:72px;height:72px;border-radius:50%;background:#fef3c7;color:#f59e0b;display:flex;align-items:center;justify-content:center;margin:0 auto 16px}
  .lv-empty-t{font-size:18px;font-weight:700;color:#333;margin-bottom:6px}
  .lv-empty-d{font-size:13px;color:#999;max-width:340px;margin:0 auto}

  .lv-tbl-wrap{overflow-x:auto;background:#fff;border:1px solid #eee;border-radius:12px}
  .lv-tbl{width:100%;border-collapse:collapse;font-size:13px}
  .lv-tbl thead th{text-align:left;padding:12px 14px;color:#888;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #eee;white-space:nowrap}
  .lv-tbl tbody tr{border-bottom:1px solid #f5f5f5;transition:background .1s;cursor:pointer}
  .lv-tbl tbody tr:hover{background:#fffbeb}
  .lv-tbl tbody tr:last-child{border-bottom:none}
  .lv-tbl td{padding:10px 14px;vertical-align:middle}

  .lv-emp{display:flex;align-items:center;gap:10px}
  .lv-emp-av{width:34px;height:34px;border-radius:8px;background:#fef3c7;color:#d97706;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .lv-emp-name{font-weight:600;color:#222;font-size:13px}
  .lv-emp-dept{font-size:11px;color:#aaa;margin-top:1px}
  .lv-type{font-size:12px;font-weight:500;color:#555}
  .lv-td-date{font-size:12px;color:#555;white-space:nowrap}
  .lv-td-days{font-weight:700;color:#333;text-align:center}
  .lv-td-reason{font-size:12px;color:#aaa;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .lv-badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600}

  .lv-actions{display:flex;gap:4px}
  .lv-act{width:30px;height:30px;border-radius:6px;border:1px solid #e0e0e0;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .12s}
  .lv-act-ok{color:#22c55e;border-color:#bbf7d0}
  .lv-act-ok:hover{background:#22c55e;color:#fff}
  .lv-act-no{color:#ef4444;border-color:#fecaca}
  .lv-act-no:hover{background:#ef4444;color:#fff}

  .lv-row{cursor:pointer}

  /* Reject modal */
  .lv-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:400;animation:bpFade .12s}
  @keyframes bpFade{from{opacity:0}to{opacity:1}}
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

  /* Panel form styles */
  .ap-section{margin-bottom:20px}
  .ap-sec-title{font-size:13px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px}
  .ap-req{width:6px;height:6px;border-radius:50%;background:#ef4444;flex-shrink:0;display:inline-block}
  .ap-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .ap-field{display:flex;flex-direction:column}
  .ap-field-full{grid-column:1/-1}
  .ap-label{display:flex;align-items:center;gap:4px;font-size:12px;font-weight:600;color:#666;margin-bottom:5px}
  .ap-input{width:100%;padding:9px 12px;border:1px solid #e0e0e0;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:13px;color:#333;outline:none;transition:border-color .15s;background:#fff;box-sizing:border-box}
  .ap-input:focus{border-color:#2d9e8b;box-shadow:0 0 0 2px rgba(45,158,139,.1)}
  .ap-input:disabled{background:#fafbfa;color:#555;cursor:default}
  .ap-textarea{resize:vertical;min-height:56px}
  select.ap-input{appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;padding-right:28px;cursor:pointer}
  select.ap-input:disabled{cursor:default}
  .ap-foot-btns{display:flex;justify-content:flex-end;gap:8px}
  .ap-btn-cancel{padding:9px 18px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;color:#666;cursor:pointer}
  .ap-btn-cancel:hover{background:#f5f5f5}
  .ap-btn-primary{display:flex;align-items:center;gap:5px;padding:9px 22px;border:none;border-radius:8px;background:#2d9e8b;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;color:#fff;cursor:pointer;transition:all .15s}
  .ap-btn-primary:hover{background:#268a79}
  .ap-btn-danger{padding:9px 16px;border:1px solid #fecaca;border-radius:8px;background:#fef2f2;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;color:#ef4444;cursor:pointer}
  .ap-btn-danger:hover{background:#ef4444;color:#fff}
  .ap-modal-layout{display:flex;flex-direction:column;min-height:200px;max-height:60vh}
  .ap-modal-scroll{flex:1;overflow-y:auto;padding:16px 0 0}
  .ap-modal-foot{flex-shrink:0;padding:16px 0 0;margin-top:auto}

  @media(max-width:768px){
    .lv-bar{flex-direction:column;align-items:stretch}
    .lv-bar-left,.lv-bar-right{flex-wrap:wrap}
  }
  @media(max-width:600px){
    .ap-modal-layout{max-height:65vh}
    .ap-fields{grid-template-columns:1fr}
  }
`;
