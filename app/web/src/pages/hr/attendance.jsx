import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";
import Modal from "../components/Modal";

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

const STATUSES = ["Present", "Absent", "Late", "Half Day", "On Leave", "Holiday", "Rest Day"];
const STATUS_COLORS = {
    Present: "#22c55e", Absent: "#ef4444", Late: "#f59e0b", "Half Day": "#f97316",
    "On Leave": "#0ea5e9", Holiday: "#8b5cf6", "Rest Day": "#9ca3af",
};

function fmtDate(d) { return d.toISOString().slice(0, 10); }
function fmtTime(dt) {
    if (!dt) return "—";
    const raw = String(dt).replace("T", " ").replace("Z", "").substring(0, 16);
    const d = new Date(raw);
    if (isNaN(d)) return dt;
    return d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true });
}
function fmtHours(h) {
    if (h === null || h === undefined) return "—";
    return Number(h).toFixed(1) + "h";
}
function dateLabel(d) {
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export default function AttendanceTab({ employees = [] }) {
    const [date, setDate] = useState(fmtDate(new Date()));
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(false);
    const [panel, setPanel] = useState({ open: false, mode: "add", record: null });
    const [filter, setFilter] = useState("");
    const [debouncedFilter, setDebouncedFilter] = useState("");
    const [searching, setSearching] = useState(false);
    const [deptFilter, setDeptFilter] = useState("");

    const load = useCallback(async (d) => {
        setLoading(true);
        try {
            const data = await api("get_attendance", { date_from: d, date_to: d });
            setRecords(data.attendance || []);
        } catch { setRecords([]); }
        setLoading(false);
    }, []);

    useEffect(() => { load(date); }, [date, load]);

    useEffect(() => {
        if (!filter) { setDebouncedFilter(""); setSearching(false); return; }
        setSearching(true);
        const t = setTimeout(() => { setDebouncedFilter(filter); setSearching(false); }, 300);
        return () => clearTimeout(t);
    }, [filter]);

    const openAdd = () => setPanel({ open: true, mode: "add", record: null });
    const openView = (r) => setPanel({ open: true, mode: "view", record: r });
    const closePanel = () => setPanel({ open: false, mode: "add", record: null });

    const saveRecord = async (rec, isNew) => {
        closePanel();
        try {
            await api(isNew ? "create_attendance" : "update_attendance", rec);
            load(date);
        } catch (e) { alert("Save failed: " + e.message); }
    };

    const deleteRecord = async (id) => {
        closePanel();
        try {
            await api("delete_attendance", { id });
            load(date);
        } catch (e) { alert("Delete failed: " + e.message); }
    };

    // Build map of today's attendance by employee
    const attendMap = {};
    records.forEach(r => { attendMap[r.employee_id] = r; });

    const depts = [...new Set(employees.map(e => e.department).filter(Boolean))];

    // Filter employees
    let shown = employees.filter(e => {
        const name = `${e.first_name} ${e.last_name}`.toLowerCase();
        if (debouncedFilter && !name.includes(debouncedFilter.toLowerCase())) return false;
        if (deptFilter && e.department !== deptFilter) return false;
        return true;
    });

    return (<div className="at-wrap">
        {/* Bar */}
        <div className="at-bar">
            <div className="at-bar-left">
                <div className="at-search-wrap">
                    {searching
                        ? <div className="at-spinner" />
                        : <I name="search" size={14} />
                    }
                    <input
                        className="at-search"
                        placeholder="Search employees..."
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                    />
                </div>
                {depts.length > 0 && (
                    <select className="at-dept-filter" value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
                        <option value="">All Depts</option>
                        {depts.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                )}
                <input type="date" className="at-date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="at-bar-right">
                <button className="at-btn-p" onClick={openAdd}><I name="plus" size={14} /> Add Record</button>
            </div>
        </div>

        {/* Table */}
        {loading || searching ? (
            <div className="at-empty">
                <div className="at-loading-spinner" />
                <div className="at-empty-t">{loading ? "Loading..." : "Searching..."}</div>
                <div className="at-empty-d">{loading ? "Fetching attendance records" : "Looking for matching employees"}</div>
            </div>
        ) : shown.length === 0 ? (
            <div className="at-empty">
                <div className="at-empty-ic"><I name="users" size={28} /></div>
                <div className="at-empty-t">{debouncedFilter ? "No matches found" : "No employees found"}</div>
                <div className="at-empty-d">{debouncedFilter ? "Try a different search term." : "No employees to display for this date."}</div>
            </div>
        ) : (
            <div style={{overflowX:"auto",flex:1,background:"#fff",borderRadius:10}}>
                <table className="at-tbl">
                    <thead>
                    <tr>
                        <th>Employee</th>
                        <th>Department</th>
                        <th>Clock In</th>
                        <th>Clock Out</th>
                        <th>Hours</th>
                        <th>OT</th>
                        <th>Status</th>
                    </tr>
                    </thead>
                    <tbody>
                    {shown.map(emp => {
                        const rec = attendMap[emp.id];
                        const status = rec ? rec.status : "—";
                        const statusColor = STATUS_COLORS[status] || "#ccc";

                        return (
                            <tr key={emp.id} onClick={() => rec ? openView(rec) : setPanel({ open: true, mode: "add", record: { employee_id: emp.id, date } })}>
                                <td>
                                    <div className="at-emp">
                                        <span className="at-emp-av">{(emp.first_name?.[0] || "") + (emp.last_name?.[0] || "")}</span>
                                        <div>
                                            <div className="at-emp-name">{emp.first_name} {emp.last_name}</div>
                                            <div className="at-emp-pos">{emp.position || "—"}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="at-td-dept">{emp.department || "—"}</td>
                                <td className="at-td-time">{rec && rec.clock_in ? fmtTime(rec.clock_in) : "—"}</td>
                                <td className="at-td-time">{rec && rec.clock_out ? fmtTime(rec.clock_out) : "—"}</td>
                                <td className="at-td-hrs">{rec ? fmtHours(rec.hours_worked) : "—"}</td>
                                <td className="at-td-hrs">{rec && rec.overtime_hours > 0 ? fmtHours(rec.overtime_hours) : "—"}</td>
                                <td><span className="at-badge" style={{ background: statusColor + "18", color: statusColor }}>{status}</span></td>
                            </tr>
                        );
                    })}
                    </tbody>
                </table>
            </div>
        )}

        <AttendancePanel
            open={panel.open}
            mode={panel.mode}
            record={panel.record}
            employees={employees}
            date={date}
            onClose={closePanel}
            onSave={saveRecord}
            onDelete={deleteRecord}
        />

        <style>{attCSS}</style>
    </div>);
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
   MODAL PANEL — all modes use Modal
================================================================ */
function AttendancePanel({ open, mode, record, employees, date, onClose, onSave, onDelete }) {
    const [form, setForm] = useState({});
    const [currentMode, setCurrentMode] = useState(mode);

    useEffect(() => {
        if (record && (mode === "view" || mode === "edit")) {
            setForm({
                ...record,
                date: (record.date || "").substring(0, 10),
                clock_in: record.clock_in ? record.clock_in.replace("T", " ").substring(0, 16) : "",
                clock_out: record.clock_out ? record.clock_out.replace("T", " ").substring(0, 16) : "",
                remarks: record.remarks || "",
            });
        } else {
            setForm({
                date: record?.date || date,
                status: "Present",
                clock_in: "",
                clock_out: "",
                remarks: "",
                employee_id: record?.employee_id || "",
            });
        }
        setCurrentMode(mode);
    }, [record, mode, open, date]);

    if (!open) return null;

    const isView = currentMode === "view";
    const isAdd = currentMode === "add";
    const isEdit = currentMode === "edit";
    const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

    const switchToEdit = () => setCurrentMode("edit");
    const switchToView = () => setCurrentMode("view");

    const handleSave = () => {
        if (isAdd && !form.employee_id) return;
        if (!form.status) return;
        const payload = {
            ...form,
            date: form.date || date,
            clock_in: form.clock_in || null,
            clock_out: form.clock_out || null,
            remarks: form.remarks || null,
        };
        onSave(payload, isAdd);
    };

    const empName = record ? `${record.first_name || ""} ${record.last_name || ""}`.trim() : "";

    /* ── Shared form fields ── */
    const renderFormFields = () => (
        <div className="ap-section">
            <h4 className="ap-sec-title">Details</h4>
            <div className="ap-fields">
                {isAdd && (
                    <div className="ap-field ap-field-full">
                        <label className="ap-label">Employee <span className="ap-req"/></label>
                        <EmployeePicker employees={employees} value={form.employee_id || ""} onChange={v => set("employee_id", v)} />
                    </div>
                )}
                {!isAdd && isView && (
                    <div className="ap-field ap-field-full">
                        <label className="ap-label">Employee</label>
                        <input className="ap-input" value={empName || "—"} disabled />
                    </div>
                )}
                <div className="ap-field">
                    <label className="ap-label">Date</label>
                    <input type={isView ? "text" : "date"} className="ap-input" value={isView ? dateLabel(form.date || date) : (form.date || date).substring(0, 10)} onChange={e => set("date", e.target.value)} disabled={isView} />
                </div>
                <div className="ap-field">
                    <label className="ap-label">Status <span className="ap-req"/></label>
                    <select className="ap-input" value={form.status || ""} onChange={e => set("status", e.target.value)} disabled={isView}>
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                <div className="ap-field">
                    <label className="ap-label">Clock In</label>
                    <input type={isView ? "text" : "datetime-local"} className="ap-input" value={isView ? (form.clock_in ? fmtTime(form.clock_in) : "—") : (form.clock_in || "")} onChange={e => set("clock_in", e.target.value)} disabled={isView} />
                </div>
                <div className="ap-field">
                    <label className="ap-label">Clock Out</label>
                    <input type={isView ? "text" : "datetime-local"} className="ap-input" value={isView ? (form.clock_out ? fmtTime(form.clock_out) : "—") : (form.clock_out || "")} onChange={e => set("clock_out", e.target.value)} disabled={isView} />
                </div>
                <div className="ap-field ap-field-full">
                    <label className="ap-label">Remarks</label>
                    <textarea className="ap-input ap-textarea" value={form.remarks || ""} onChange={e => set("remarks", e.target.value)} placeholder="Optional notes..." rows={2} disabled={isView} />
                </div>
            </div>
        </div>
    );

    /* ── ALL MODES → Modal ── */
    return (
        <Modal
            title={isAdd ? "Add Attendance Record" : isEdit ? "Edit Attendance" : "Attendance Record"}
            subtitle={isAdd ? "Manual entry" : empName}
            onClose={isEdit ? switchToView : onClose}
        >
            <div className="ap-modal-layout">
                <div className="ap-modal-scroll">
                    {renderFormFields()}
                </div>

                <div className="ap-modal-foot">
                    <div className="ap-legend">
                        <span className="ap-legend-item"><span className="ap-legend-dot ap-legend-dot-req"></span> Required</span>
                        <span className="ap-legend-item"><span className="ap-legend-dot ap-legend-dot-enc"></span> Encrypted</span>
                    </div>
                    <div className="ap-foot-btns">
                        {isView ? (<>
                            <button className="ap-btn-danger" onClick={() => onDelete(record.id)}>Delete</button>
                            <button className="ap-btn-primary" onClick={switchToEdit}>Edit</button>
                        </>) : (<>
                            <button className="ap-btn-cancel" onClick={isEdit ? switchToView : onClose}>Cancel</button>
                            <button className="ap-btn-primary" onClick={handleSave}>
                                {isAdd ? "Add Record" : "Save Changes"}
                            </button>
                        </>)}
                    </div>
                </div>
            </div>

            <style>{panelCSS}</style>
        </Modal>
    );
}

/* ================================================================
   STYLES
================================================================ */
const attCSS = `
  .at-wrap{display:flex;flex-direction:column;min-height:calc(100vh - 54px - 48px)}
  .at-bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px}
  .at-bar-left{display:flex;align-items:center;gap:8px}
  .at-bar-right{display:flex;align-items:center;gap:8px}
  .at-search-wrap{display:flex;align-items:center;gap:8px;padding:8px 14px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;flex:1;max-width:200px;color:#aaa}
  .at-search{border:none;outline:none;font-family:'DM Sans',sans-serif;font-size:13px;color:#333;flex:1;background:transparent}
  .at-search::placeholder{color:#bbb}
  .at-date{padding:7px 12px;border:1px solid #e0e0e0;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:13px;color:#333;background:#fff;outline:none;position:relative;z-index:0;overflow:hidden}
  .at-date::-webkit-calendar-picker-indicator{cursor:pointer}
  .at-date:focus{border-color:#2d9e8b}
  .at-dept-filter{padding:7px 12px;border:1px solid #e0e0e0;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:12px;color:#555;background:#fff;outline:none}
  .at-btn-p{display:flex;align-items:center;gap:5px;padding:9px 18px;border:none;border-radius:8px;background:#2d9e8b;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;color:#fff;cursor:pointer;transition:all .15s;white-space:nowrap}
  .at-btn-p:hover{background:#268a79}

  .at-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:60px 20px;background:#fff;border-radius:10px}
  .at-empty-ic{width:56px;height:56px;border-radius:50%;background:#edf8f5;color:#2d9e8b;display:flex;align-items:center;justify-content:center;margin:0 auto 12px}
  .at-empty-t{font-size:15px;font-weight:700;color:#333;margin-bottom:4px}
  .at-empty-d{font-size:13px;color:#999}

  @keyframes at-spin{to{transform:rotate(360deg)}}
  .at-spinner{width:14px;height:14px;border:2px solid #e0e0e0;border-top-color:#2d9e8b;border-radius:50%;animation:at-spin .6s linear infinite;flex-shrink:0}
  .at-loading-spinner{width:36px;height:36px;border:3px solid #edf8f5;border-top-color:#2d9e8b;border-radius:50%;animation:at-spin .7s linear infinite;margin:0 auto 12px}

  .at-tbl{width:100%;border-collapse:collapse;font-size:13px;background:#fff;border-radius:10px;overflow:hidden}
  .at-tbl thead th{text-align:left;padding:10px 14px;font-size:11px;font-weight:600;color:#999;text-transform:uppercase;letter-spacing:.03em;border-bottom:1px solid #eee;background:#fafbfa}
  .at-tbl tbody td{padding:12px 14px;border-bottom:1px solid #f5f5f5;color:#444}
  .at-tbl tbody tr{transition:background .1s;cursor:pointer}
  .at-tbl tbody tr:hover{background:#f9fffe}

  .at-emp{display:flex;align-items:center;gap:10px}
  .at-emp-av{width:34px;height:34px;border-radius:8px;background:#edf8f5;color:#2d9e8b;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .at-emp-name{font-weight:600;color:#222;font-size:13px}
  .at-emp-pos{font-size:11px;color:#aaa;margin-top:1px}
  .at-td-dept{color:#666;font-size:12px}
  .at-td-time{font-weight:600;color:#333;font-size:13px;font-variant-numeric:tabular-nums}
  .at-td-hrs{font-weight:500;color:#555;font-variant-numeric:tabular-nums}
  .at-badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600}

  @media(max-width:768px){
    .at-bar{flex-direction:column;align-items:stretch}
    .at-bar-left,.at-bar-right{flex-wrap:wrap}
    .at-search-wrap{max-width:100%}
  }
`;

const panelCSS = `
  button:focus,input:focus,select:focus,textarea:focus,[tabindex]:focus{outline:none}

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

  .ap-legend{display:flex;align-items:center;gap:14px;margin-bottom:12px}
  .ap-legend-item{display:flex;align-items:center;gap:5px;font-size:11px;color:#999}
  .ap-legend-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
  .ap-legend-dot-req{background:#ef4444}
  .ap-legend-dot-enc{background:#2d9e8b}

  /* Modal fixed-height layout */
  .ap-modal-layout{display:flex;flex-direction:column;min-height:200px;max-height:60vh}
  .ap-modal-scroll{flex:1;overflow-y:auto;padding:16px 0 0}
  .ap-modal-foot{flex-shrink:0;padding:16px 0 0;margin-top:auto}

  /* Employee Picker */
  .ep-wrap{position:relative}
  .ep-input-wrap{display:flex;align-items:center;gap:8px;padding:9px 12px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;transition:border-color .15s}
  .ep-input-wrap:focus-within{border-color:#2d9e8b;box-shadow:0 0 0 2px rgba(45,158,139,.1)}
  .ep-input{border:none;outline:none;font-family:'DM Sans',sans-serif;font-size:13px;color:#333;flex:1;background:transparent}
  .ep-input::placeholder{color:#bbb}
  .ep-clear{background:none;border:none;color:#bbb;cursor:pointer;font-size:14px;padding:0 2px;line-height:1}
  .ep-clear:hover{color:#999}
  .ep-drop{position:absolute;top:calc(100% + 4px);left:0;right:0;background:#fff;border:1px solid #e0e0e0;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.1);max-height:240px;overflow-y:auto;z-index:10}
  .ep-hint{padding:14px 16px;font-size:12px;color:#aaa;text-align:center}
  .ep-item{display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;transition:background .1s}
  .ep-item:hover{background:#edf8f5}
  .ep-item-av{width:30px;height:30px;border-radius:8px;background:#f3f4f6;color:#888;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .ep-item-info{display:flex;flex-direction:column;min-width:0}
  .ep-item-name{font-size:13px;font-weight:600;color:#222;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ep-item-dept{font-size:11px;color:#aaa}
  .ep-selected{display:flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid #e0e0e0;border-radius:8px;background:#fafbfa}
  .ep-sel-av{width:32px;height:32px;border-radius:8px;background:#edf8f5;color:#2d9e8b;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .ep-sel-info{display:flex;flex-direction:column;flex:1;min-width:0}
  .ep-sel-name{font-size:13px;font-weight:600;color:#222}
  .ep-sel-dept{font-size:11px;color:#aaa}
  .ep-sel-clear{background:none;border:none;color:#ccc;cursor:pointer;font-size:14px;padding:4px;line-height:1;border-radius:4px}
  .ep-sel-clear:hover{color:#999;background:#f0f0f0}

  @media(max-width:600px){
    .ap-modal-layout{max-height:65vh}
    .ap-fields{grid-template-columns:1fr}
  }
`;
