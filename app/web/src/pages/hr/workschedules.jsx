import { useState, useEffect } from "react";
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

const TYPES = ["Fixed", "Flexible", "Rotating"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const COLORS = ["#6366f1", "#2d9e8b", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

function emptyDays() {
    return DAY_NAMES.map((_, i) => ({
        day_of_week: i,
        start_time: (i >= 1 && i <= 5) ? "08:00" : null,
        end_time: (i >= 1 && i <= 5) ? "17:00" : null,
        break_minutes: 60,
        is_rest_day: i === 0 || i === 6,
    }));
}

export default function WorkSchedulesTab({ departments = [], positions = [] }) {
    const [schedules, setSchedules] = useState([]);
    const [panel, setPanel] = useState({ open: false, mode: "add", sched: null, idx: -1 });
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [searching, setSearching] = useState(false);
    const [filter, setFilter] = useState("");

    useEffect(() => {
        if (!search) { setDebouncedSearch(""); setSearching(false); return; }
        setSearching(true);
        const t = setTimeout(() => { setDebouncedSearch(search); setSearching(false); }, 300);
        return () => clearTimeout(t);
    }, [search]);

    useEffect(() => {
        (async () => {
            try {
                const data = await api("get_work_schedules");
                if (Array.isArray(data)) setSchedules(data);
            } catch {}
        })();
    }, []);

    const openAdd = () => setPanel({ open: true, mode: "add", sched: null, idx: -1 });
    const openView = (s, i) => setPanel({ open: true, mode: "view", sched: s, idx: i });
    const closePanel = () => setPanel({ open: false, mode: "add", sched: null, idx: -1 });

    async function saveSched(sched, days, defaults, isNew, idx) {
        const saved = { ...sched };
        if (isNew) {
            saved._temp = true;
            setSchedules(prev => [...prev, saved]);
        } else {
            setSchedules(prev => prev.map((s, i) => i === idx ? { ...s, ...saved } : s));
        }
        closePanel();

        try {
            const data = await api(isNew ? "create_work_schedule" : "update_work_schedule", saved);
            const id = data?.id || saved.id;
            if (isNew && id) {
                setSchedules(prev => prev.map(s => s._temp && s.name === saved.name ? { ...saved, id, _temp: undefined } : s));
            }
            // Save days
            if (days && id) {
                await api("save_work_schedule_days", { schedule_id: id, days });
            }
            // Save defaults
            if (defaults && id) {
                // Get existing defaults for this schedule and delete removed ones
                try {
                    const existing = await api("get_work_schedule_defaults");
                    const existingForSched = (Array.isArray(existing) ? existing : []).filter(d => d.schedule_id === id);
                    for (const ex of existingForSched) {
                        if (!defaults.find(d => d.scope === ex.scope && d.scope_value === ex.scope_value)) {
                            await api("delete_work_schedule_default", { id: ex.id });
                        }
                    }
                } catch {}
                for (const d of defaults) {
                    await api("upsert_work_schedule_default", { ...d, schedule_id: id });
                }
            }
            // Refresh
            const fresh = await api("get_work_schedules");
            if (Array.isArray(fresh)) setSchedules(fresh);
        } catch (err) {
            console.warn("Schedule save failed:", err);
        }
    }

    async function deleteSched(idx) {
        const removed = schedules[idx];
        setSchedules(prev => prev.filter((_, i) => i !== idx));
        closePanel();
        try {
            if (removed?.id && !removed._temp) await api("delete_work_schedule", { id: removed.id });
        } catch (err) {
            console.warn("Schedule delete failed:", err);
        }
    }

    const filtered = schedules.filter(s => {
        if (filter && s.type !== filter) return false;
        if (!debouncedSearch) return true;
        const q = debouncedSearch.toLowerCase();
        return (s.name || "").toLowerCase().includes(q)
            || (s.type || "").toLowerCase().includes(q)
            || (s.description || "").toLowerCase().includes(q);
    });

    return (<>
        <div className="ws-wrap">
            <div className="ws-bar">
                <div className="ws-bar-left">
                    <div className="ws-search-wrap">
                        {searching
                            ? <div className="ws-spinner" />
                            : <I name="search" size={14} />
                        }
                        <input
                            className="ws-search"
                            placeholder="Search schedules..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    {TYPES.length > 0 && (
                        <select className="ws-filter" value={filter} onChange={e => setFilter(e.target.value)}>
                            <option value="">All Types</option>
                            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    )}
                </div>
                <button className="ws-btn-p" onClick={openAdd}><I name="calendar" size={14} /> Add Schedule</button>
            </div>

            {searching ? (
                <div className="ws-empty">
                    <div className="ws-loading-spinner" />
                    <h3 className="ws-empty-t">Searching...</h3>
                    <p className="ws-empty-d">Looking for matching schedules</p>
                </div>
            ) : filtered.length > 0 ? (
                <div style={{overflowX:"auto",flex:1,background:"#fff",borderRadius:10}}>
                    <table className="ws-tbl">
                        <thead>
                        <tr>
                            <th>Schedule</th>
                            <th>Type</th>
                            <th>Employees</th>
                            <th>Depts</th>
                            <th>Positions</th>
                            <th>Default</th>
                        </tr>
                        </thead>
                        <tbody>
                        {filtered.map((s, i) => {
                            const realIdx = schedules.indexOf(s);
                            return (
                                <tr key={i} onClick={() => openView(s, realIdx)} className="ws-row">
                                    <td>
                                        <div className="ws-name-cell">
                                            <div className="ws-av" style={{background: s.color ? `${s.color}18` : "#eef2ff", color: s.color || "#6366f1"}}>
                                                <I name="calendar" size={14} />
                                            </div>
                                            <div>
                                                <span className="ws-name">{s.name}</span>
                                                {s.description && <div className="ws-desc">{s.description}</div>}
                                            </div>
                                        </div>
                                    </td>
                                    <td><span className="ws-type-tag" style={{color: s.color || "#6366f1", background: s.color ? `${s.color}18` : "#eef2ff"}}>{s.type}</span></td>
                                    <td><span className="ws-count-tag">{s.employee_count || 0}</span></td>
                                    <td><span className="ws-count-tag">{s.department_count || 0}</span></td>
                                    <td><span className="ws-count-tag">{s.position_count || 0}</span></td>
                                    <td>{s.is_default ? <span className="ws-default-tag">Default</span> : "—"}</td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="ws-empty">
                    <div className="ws-empty-ic"><I name="calendar" size={28} /></div>
                    <h3 className="ws-empty-t">{(filter || debouncedSearch) ? "No matches found" : "No work schedules yet"}</h3>
                    <p className="ws-empty-d">{(filter || debouncedSearch) ? "Try a different search term." : "Create schedules to define working hours for your organization."}</p>
                </div>
            )}
        </div>

        <SchedPanel
            open={panel.open}
            mode={panel.mode}
            sched={panel.sched}
            idx={panel.idx}
            departments={departments}
            positions={positions}
            onClose={closePanel}
            onSave={saveSched}
            onDelete={deleteSched}
        />

        <style>{listCSS}</style>
    </>);
}

/* ================================================================
   MODAL PANEL
================================================================ */
function SchedPanel({ open, mode, sched, idx, departments, positions, onClose, onSave, onDelete }) {
    const [form, setForm] = useState({});
    const [days, setDays] = useState(emptyDays());
    const [defaults, setDefaults] = useState([]);
    const [currentMode, setCurrentMode] = useState(mode);
    const [activeTab, setActiveTab] = useState("details");

    useEffect(() => {
        if (sched && (mode === "view" || mode === "edit")) {
            setForm({ ...sched });
            // Load days + defaults
            (async () => {
                try {
                    const data = await api("get_work_schedule", { id: sched.id });
                    if (data?.schedule?.days?.length) setDays(data.schedule.days);
                    else setDays(emptyDays());
                    if (data?.defaults) setDefaults(data.defaults);
                    else setDefaults([]);
                } catch {
                    setDays(emptyDays());
                    setDefaults([]);
                }
            })();
        } else {
            setForm({ type: "Fixed", color: "#6366f1" });
            setDays(emptyDays());
            setDefaults([]);
        }
        setCurrentMode(mode);
        setActiveTab("details");
    }, [sched, mode, open]);

    if (!open) return null;

    const isView = currentMode === "view";
    const isAdd = currentMode === "add";
    const isEdit = currentMode === "edit";
    const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

    const handleSave = () => {
        if (!form.name?.trim()) return;
        onSave(form, days, defaults, isAdd, idx);
    };

    const switchToEdit = () => { setCurrentMode("edit"); setActiveTab("details"); };
    const switchToView = () => setCurrentMode("view");

    const setDay = (dayIdx, field, value) => {
        setDays(prev => prev.map((d, i) => i === dayIdx ? { ...d, [field]: value } : d));
    };

    const toggleRestDay = (dayIdx) => {
        setDays(prev => prev.map((d, i) => {
            if (i !== dayIdx) return d;
            const rest = !d.is_rest_day;
            return { ...d, is_rest_day: rest, start_time: rest ? null : "08:00", end_time: rest ? null : "17:00" };
        }));
    };

    const addDefault = (scope) => {
        setDefaults(prev => [...prev, { scope, scope_value: "", schedule_id: form.id || "" }]);
    };
    const removeDefault = (i) => setDefaults(prev => prev.filter((_, idx) => idx !== i));
    const setDefault = (i, field, value) => {
        setDefaults(prev => prev.map((d, idx) => idx === i ? { ...d, [field]: value } : d));
    };

    /* ── Tabs ── */
    const renderTabs = () => (
        <div className="pp-tabs">
            {[
                { id: "details", label: "Details", icon: "calendar" },
                { id: "days", label: "Days", icon: "clock" },
                { id: "assignments", label: "Assignments", icon: "users" },
            ].map(t => (
                <button
                    key={t.id}
                    className={`pp-tab ${activeTab === t.id ? "pp-tab-on" : ""}`}
                    onClick={() => setActiveTab(t.id)}
                >
                    <I name={t.icon} size={13} /> {t.label}
                </button>
            ))}
        </div>
    );

    /* ── Details tab ── */
    const renderDetails = () => (
        <div className="pp-section">
            <h4 className="pp-sec-title">Schedule Details</h4>
            <div className="pp-fields">
                <div className="pp-field pp-field-full">
                    <label className="pp-label">Schedule Name <span className="pp-req"/></label>
                    <input className="pp-input" value={form.name || ""} onChange={e => set("name", e.target.value)} placeholder="e.g. Regular Office Hours, Night Shift" disabled={isView} />
                </div>
                <div className="pp-field">
                    <label className="pp-label">Type</label>
                    <select className="pp-input" value={form.type || "Fixed"} onChange={e => set("type", e.target.value)} disabled={isView}>
                        {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
                <div className="pp-field">
                    <label className="pp-label">Color</label>
                    <div className="ws-color-row">
                        {COLORS.map(c => (
                            <button
                                key={c}
                                className={`ws-color-btn ${form.color === c ? "ws-color-on" : ""}`}
                                style={{ background: c }}
                                onClick={() => !isView && set("color", c)}
                                disabled={isView}
                            />
                        ))}
                    </div>
                </div>
                <div className="pp-field pp-field-full">
                    <label className="pp-label">Description</label>
                    <textarea className="pp-input pp-textarea" value={form.description || ""} onChange={e => set("description", e.target.value)} placeholder="Brief description of this schedule" rows={2} disabled={isView} />
                </div>
                <div className="pp-field">
                    <label className="pp-label" style={{ cursor: isView ? "default" : "pointer" }}>
                        <input
                            type="checkbox"
                            checked={!!form.is_default}
                            onChange={e => set("is_default", e.target.checked)}
                            disabled={isView}
                            style={{ marginRight: 6 }}
                        />
                        Company Default
                    </label>
                    <span style={{ fontSize: 11, color: "#999" }}>Fallback when no other schedule is assigned</span>
                </div>
            </div>
        </div>
    );

    /* ── Days tab ── */
    const renderDays = () => (
        <div className="pp-section">
            <h4 className="pp-sec-title">Weekly Schedule</h4>
            <div className="ws-days-list">
                {days.map((d, i) => (
                    <div key={i} className={`ws-day-row ${d.is_rest_day ? "ws-day-rest" : ""}`}>
                        <div className="ws-day-name">{DAY_SHORT[d.day_of_week ?? i]}</div>
                        {d.is_rest_day ? (
                            <div className="ws-day-rest-label">Rest Day</div>
                        ) : (
                            <div className="ws-day-times">
                                <input
                                    type="time"
                                    className="ws-day-input"
                                    value={d.start_time || ""}
                                    onChange={e => setDay(i, "start_time", e.target.value)}
                                    disabled={isView}
                                />
                                <span className="ws-day-sep">→</span>
                                <input
                                    type="time"
                                    className="ws-day-input"
                                    value={d.end_time || ""}
                                    onChange={e => setDay(i, "end_time", e.target.value)}
                                    disabled={isView}
                                />
                                <input
                                    type="number"
                                    className="ws-day-break"
                                    value={d.break_minutes ?? 60}
                                    onChange={e => setDay(i, "break_minutes", parseInt(e.target.value) || 0)}
                                    disabled={isView}
                                    min={0}
                                    title="Break (minutes)"
                                />
                                <span className="ws-day-brk-label">min</span>
                            </div>
                        )}
                        <button
                            className={`ws-day-toggle ${d.is_rest_day ? "ws-day-toggle-on" : ""}`}
                            onClick={() => !isView && toggleRestDay(i)}
                            disabled={isView}
                            title={d.is_rest_day ? "Set as work day" : "Set as rest day"}
                        >
                            {d.is_rest_day ? "Rest" : "Work"}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );

    /* ── Assignments tab ── */
    const renderAssignments = () => (
        <div className="pp-section">
            <h4 className="pp-sec-title">Department & Position Defaults</h4>
            <p style={{ fontSize: 12, color: "#999", marginBottom: 12 }}>
                Employees in these departments/positions will use this schedule unless individually overridden.
            </p>
            <div className="ws-assign-list">
                {defaults.map((d, i) => (
                    <div key={i} className="ws-assign-row">
                        <select
                            className="pp-input"
                            value={d.scope}
                            onChange={e => setDefault(i, "scope", e.target.value)}
                            disabled={isView}
                            style={{ width: 120, flexShrink: 0 }}
                        >
                            <option value="department">Department</option>
                            <option value="position">Position</option>
                        </select>
                        <select
                            className="pp-input"
                            value={d.scope_value}
                            onChange={e => setDefault(i, "scope_value", e.target.value)}
                            disabled={isView}
                            style={{ flex: 1 }}
                        >
                            <option value="">Select...</option>
                            {(d.scope === "department" ? departments : positions).map(item => (
                                <option key={item.id || item.name} value={item.name}>{item.name}</option>
                            ))}
                        </select>
                        {!isView && (
                            <button className="ws-assign-del" onClick={() => removeDefault(i)} title="Remove">×</button>
                        )}
                    </div>
                ))}
                {defaults.length === 0 && (
                    <div className="ws-assign-empty">No department or position defaults assigned.</div>
                )}
            </div>
            {!isView && (
                <div className="ws-assign-btns">
                    <button className="ws-assign-add" onClick={() => addDefault("department")}>
                        <I name="building" size={12} /> Add Department
                    </button>
                    <button className="ws-assign-add" onClick={() => addDefault("position")}>
                        <I name="briefcase" size={12} /> Add Position
                    </button>
                </div>
            )}
        </div>
    );

    /* ── Modal ── */
    return (
        <Modal
            title={isAdd ? "Add Schedule" : isEdit ? "Edit Schedule" : (form.name || "Schedule")}
            subtitle={isView ? `${form.type || "Fixed"} schedule` : "Configure schedule details"}
            onClose={isEdit ? switchToView : onClose}
        >
            <div className="pp-modal-layout">
                {isView && <div className="pp-modal-tabs-bar">{renderTabs()}</div>}

                <div className="pp-modal-scroll">
                    {(isAdd || isEdit) ? (
                        <>
                            {renderDetails()}
                            {renderDays()}
                            {renderAssignments()}
                        </>
                    ) : (
                        activeTab === "details" ? renderDetails()
                            : activeTab === "days" ? renderDays()
                                : renderAssignments()
                    )}
                </div>

                <div className="pp-modal-foot">
                    <div className="pp-legend">
                        <span className="pp-legend-item"><span className="pp-legend-dot pp-legend-dot-req"></span> Required</span>
                    </div>
                    <div className="pp-foot-btns">
                        {isView ? (<>
                            <button className="pp-btn-danger" onClick={() => onDelete(idx)}>Delete</button>
                            <button className="pp-btn-primary" onClick={switchToEdit}>Edit</button>
                        </>) : (<>
                            <button className="pp-btn-cancel" onClick={isEdit ? switchToView : onClose}>Cancel</button>
                            <button className="pp-btn-primary" onClick={handleSave}>
                                {isAdd ? "Add Schedule" : "Save Changes"}
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
const listCSS = `
  .ws-wrap{display:flex;flex-direction:column;min-height:calc(100vh - 54px - 48px)}

  .ws-bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px}
  .ws-bar-left{display:flex;align-items:center;gap:12px}
  .ws-search-wrap{display:flex;align-items:center;gap:8px;padding:8px 14px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;flex:1;max-width:200px;color:#aaa}
  .ws-search{border:none;outline:none;font-family:'DM Sans',sans-serif;font-size:13px;color:#333;flex:1;background:transparent}
  .ws-search::placeholder{color:#bbb}
  .ws-filter{padding:7px 12px;border:1px solid #e0e0e0;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:12px;color:#555;background:#fff;outline:none}
  .ws-filter:focus{border-color:#6366f1}
  .ws-btn-p{display:flex;align-items:center;gap:5px;padding:9px 18px;border:none;border-radius:8px;background:#6366f1;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;color:#fff;cursor:pointer;transition:all .15s}
  .ws-btn-p:hover{background:#4f46e5}

  .ws-tbl{width:100%;border-collapse:collapse;font-size:13px;background:#fff;border-radius:10px;overflow:hidden}
  .ws-tbl thead th{text-align:left;padding:10px 14px;font-size:11px;font-weight:600;color:#999;text-transform:uppercase;letter-spacing:.03em;border-bottom:1px solid #eee;background:#fafbfa}
  .ws-tbl tbody td{padding:12px 14px;border-bottom:1px solid #f5f5f5;color:#444}
  .ws-row{cursor:pointer;transition:background .1s}
  .ws-row:hover{background:#f9f9ff}

  .ws-name-cell{display:flex;align-items:center;gap:10px}
  .ws-av{width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .ws-name{font-weight:600;color:#222;display:block}
  .ws-desc{font-size:11px;color:#999;margin-top:1px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ws-type-tag{font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px}
  .ws-count-tag{font-size:11px;font-weight:600;color:#2d9e8b;background:#edf8f5;padding:2px 8px;border-radius:4px}
  .ws-default-tag{font-size:10px;font-weight:700;color:#6366f1;background:#eef2ff;padding:2px 8px;border-radius:4px;text-transform:uppercase;letter-spacing:.03em}

  .ws-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:60px 20px;background:#fff;border-radius:10px}
  .ws-empty-ic{width:56px;height:56px;border-radius:50%;background:#eef2ff;color:#6366f1;display:flex;align-items:center;justify-content:center;margin:0 auto 12px}
  .ws-empty-t{font-size:15px;font-weight:700;color:#333;margin-bottom:4px}
  .ws-empty-d{font-size:13px;color:#999}

  @keyframes ws-spin{to{transform:rotate(360deg)}}
  .ws-spinner{width:14px;height:14px;border:2px solid #e0e0e0;border-top-color:#6366f1;border-radius:50%;animation:ws-spin .6s linear infinite;flex-shrink:0}
  .ws-loading-spinner{width:36px;height:36px;border:3px solid #eef2ff;border-top-color:#6366f1;border-radius:50%;animation:ws-spin .7s linear infinite;margin:0 auto 12px}

  @media(max-width:600px){.ws-bar{flex-direction:column}.ws-bar-left{flex-direction:column;width:100%}.ws-search-wrap{max-width:100%}}
`;

const panelCSS = `
  button:focus,input:focus,select:focus,textarea:focus,[tabindex]:focus{outline:none}

  .pp-section{margin-bottom:20px}
  .pp-sec-title{font-size:13px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px}
  .pp-req{width:6px;height:6px;border-radius:50%;background:#ef4444;flex-shrink:0;display:inline-block}
  .pp-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .pp-field{display:flex;flex-direction:column}
  .pp-field-full{grid-column:1/-1}
  .pp-label{display:flex;align-items:center;gap:4px;font-size:12px;font-weight:600;color:#666;margin-bottom:5px}
  .pp-input{width:100%;padding:9px 12px;border:1px solid #e0e0e0;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:13px;color:#333;outline:none;transition:border-color .15s;background:#fff;box-sizing:border-box}
  .pp-input:focus{border-color:#6366f1;box-shadow:0 0 0 2px rgba(99,102,241,.1)}
  .pp-input:disabled{background:#fafbfa;color:#555;cursor:default}
  .pp-textarea{resize:vertical;min-height:56px}
  select.pp-input{appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;padding-right:28px;cursor:pointer}
  select.pp-input:disabled{cursor:default}

  .pp-foot-btns{display:flex;justify-content:flex-end;gap:8px}
  .pp-btn-cancel{padding:9px 18px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;color:#666;cursor:pointer}
  .pp-btn-cancel:hover{background:#f5f5f5}
  .pp-btn-primary{display:flex;align-items:center;gap:5px;padding:9px 22px;border:none;border-radius:8px;background:#6366f1;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;color:#fff;cursor:pointer;transition:all .15s}
  .pp-btn-primary:hover{background:#4f46e5}
  .pp-btn-danger{padding:9px 16px;border:1px solid #fecaca;border-radius:8px;background:#fef2f2;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;color:#ef4444;cursor:pointer}
  .pp-btn-danger:hover{background:#ef4444;color:#fff}

  .pp-legend{display:flex;align-items:center;gap:14px;margin-bottom:12px}
  .pp-legend-item{display:flex;align-items:center;gap:5px;font-size:11px;color:#999}
  .pp-legend-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
  .pp-legend-dot-req{background:#ef4444}

  .pp-modal-layout{display:flex;flex-direction:column;height:60vh;min-height:400px;max-height:70vh}
  .pp-modal-tabs-bar{flex-shrink:0}
  .pp-modal-scroll{flex:1;overflow-y:auto;padding:16px 0 0}
  .pp-modal-foot{flex-shrink:0;padding:16px 0 0;margin-top:auto}

  .pp-tabs{display:flex;gap:0;padding:0;overflow-x:auto;justify-content:center}
  .pp-tab{display:flex;align-items:center;gap:5px;padding:10px 14px;border:none;outline:none;background:none;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:500;color:#aaa;cursor:pointer;transition:all .15s;white-space:nowrap}
  .pp-tab:hover{color:#666}
  .pp-tab-on{color:#6366f1;font-weight:600}

  /* Color picker */
  .ws-color-row{display:flex;gap:6px;flex-wrap:wrap;padding-top:4px}
  .ws-color-btn{width:26px;height:26px;border-radius:7px;border:2px solid transparent;cursor:pointer;transition:all .15s}
  .ws-color-btn:hover{transform:scale(1.12)}
  .ws-color-on{border-color:#333;box-shadow:0 0 0 2px rgba(0,0,0,.08)}
  .ws-color-btn:disabled{cursor:default;opacity:.7}
  .ws-color-btn:disabled:hover{transform:none}

  /* Days editor */
  .ws-days-list{display:flex;flex-direction:column;gap:6px}
  .ws-day-row{display:flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid #eee;border-radius:9px;transition:background .1s}
  .ws-day-row:hover{background:#fafbfa}
  .ws-day-rest{background:#fafbfa;opacity:.7}
  .ws-day-name{width:36px;font-size:12px;font-weight:700;color:#555;flex-shrink:0}
  .ws-day-times{display:flex;align-items:center;gap:6px;flex:1}
  .ws-day-input{padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;font-family:'DM Sans',sans-serif;font-size:12px;color:#333;background:#fff;outline:none;width:100px}
  .ws-day-input:focus{border-color:#6366f1}
  .ws-day-input:disabled{background:#fafbfa;color:#888;cursor:default}
  .ws-day-sep{color:#bbb;font-size:12px;flex-shrink:0}
  .ws-day-break{padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;font-family:'DM Sans',sans-serif;font-size:12px;color:#333;background:#fff;outline:none;width:52px;text-align:center}
  .ws-day-break:focus{border-color:#6366f1}
  .ws-day-break:disabled{background:#fafbfa;color:#888;cursor:default}
  .ws-day-brk-label{font-size:10px;color:#999;flex-shrink:0}
  .ws-day-rest-label{flex:1;font-size:12px;color:#999;font-style:italic}
  .ws-day-toggle{padding:4px 10px;border:1px solid #e0e0e0;border-radius:6px;font-family:'DM Sans',sans-serif;font-size:11px;font-weight:600;color:#666;background:#fff;cursor:pointer;transition:all .15s;flex-shrink:0}
  .ws-day-toggle:hover{background:#f5f5f5}
  .ws-day-toggle-on{color:#ef4444;border-color:#fecaca;background:#fef2f2}
  .ws-day-toggle:disabled{cursor:default;opacity:.7}
  .ws-day-toggle:disabled:hover{background:inherit}

  /* Assignments */
  .ws-assign-list{display:flex;flex-direction:column;gap:6px;margin-bottom:10px}
  .ws-assign-row{display:flex;align-items:center;gap:8px}
  .ws-assign-del{width:28px;height:28px;border:1px solid #fecaca;border-radius:6px;background:#fef2f2;color:#ef4444;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s}
  .ws-assign-del:hover{background:#ef4444;color:#fff}
  .ws-assign-empty{font-size:12px;color:#bbb;text-align:center;padding:16px 0;font-style:italic}
  .ws-assign-btns{display:flex;gap:8px}
  .ws-assign-add{display:flex;align-items:center;gap:5px;padding:7px 14px;border:1px dashed #d4d4f8;border-radius:8px;background:#fafafe;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:500;color:#6366f1;cursor:pointer;transition:all .15s}
  .ws-assign-add:hover{background:#eef2ff;border-color:#6366f1}

  @media(max-width:600px){
    .pp-modal-layout{height:55vh;min-height:350px;max-height:65vh}
    .pp-fields{grid-template-columns:1fr}
    .ws-day-times{flex-wrap:wrap}
  }
`;
