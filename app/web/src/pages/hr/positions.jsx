import { useState, useEffect } from "react";
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

const LEVELS = ["Entry", "Junior", "Mid", "Senior", "Lead", "Manager", "Director", "VP", "C-Level"];

export default function PositionsTab({ positions, setPositions, departments = [], employees = [] }) {
    const [panel, setPanel] = useState({ open: false, mode: "add", pos: null, idx: -1 });
    const [filter, setFilter] = useState("");
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        if (!search) { setDebouncedSearch(""); setSearching(false); return; }
        setSearching(true);
        const t = setTimeout(() => { setDebouncedSearch(search); setSearching(false); }, 300);
        return () => clearTimeout(t);
    }, [search]);

    useEffect(() => {
        (async () => {
            try {
                const data = await api("get_positions");
                if (data.positions) setPositions(data.positions);
            } catch {}
        })();
    }, []);

    const openAdd = () => setPanel({ open: true, mode: "add", pos: null, idx: -1 });
    const openView = (p, i) => setPanel({ open: true, mode: "view", pos: p, idx: i });
    const closePanel = () => setPanel({ open: false, mode: "add", pos: null, idx: -1 });

    async function savePos(pos, isNew, idx) {
        const saved = { ...pos };
        saved.description = saved.description || null;

        if (isNew) {
            saved._temp = true;
            setPositions(prev => [...prev, saved]);
        } else {
            setPositions(prev => prev.map((p, i) => i === idx ? { ...p, ...saved } : p));
        }
        closePanel();

        try {
            const data = await api(isNew ? "create_position" : "update_position", saved);
            if (isNew && data?.id) {
                setPositions(prev => prev.map(p => p._temp && p.name === saved.name ? { ...saved, id: data.id, _temp: undefined } : p));
            }
        } catch (err) {
            console.warn("Position save failed:", err);
        }
    }

    async function deletePos(idx) {
        const removed = positions[idx];
        setPositions(prev => prev.filter((_, i) => i !== idx));
        closePanel();
        try {
            if (removed?.id && !removed._temp) await api("delete_position", { id: removed.id });
        } catch (err) {
            console.warn("Position delete failed:", err);
        }
    }

    const posCounts = {};
    employees.forEach(e => {
        if (e.position) posCounts[e.position] = (posCounts[e.position] || 0) + 1;
    });

    const deptNames = [...new Set(positions.map(p => p.department).filter(Boolean))];
    const filtered = positions.filter(p => {
        if (filter && p.department !== filter) return false;
        if (!debouncedSearch) return true;
        const q = debouncedSearch.toLowerCase();
        return (p.name || "").toLowerCase().includes(q)
            || (p.department || "").toLowerCase().includes(q)
            || (p.level || "").toLowerCase().includes(q)
            || (p.description || "").toLowerCase().includes(q);
    });

    return (<>
        <div className="ps-wrap">

            <div className="ps-bar">
                <div className="ps-bar-left">
                    <div className="ps-search-wrap">
                        {searching
                            ? <div className="ps-spinner" />
                            : <I name="search" size={14} />
                        }
                        <input
                            className="ps-search"
                            placeholder="Search positions..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    {deptNames.length > 0 && (
                        <select className="ps-filter" value={filter} onChange={e => setFilter(e.target.value)}>
                            <option value="">All Departments</option>
                            {deptNames.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                    )}
                </div>
                <button className="ps-btn-p" onClick={openAdd}><I name="plus" size={14} /> Add Position</button>
            </div>

            {searching ? (
                <div className="ps-empty">
                    <div className="ps-loading-spinner" />
                    <h3 className="ps-empty-t">Searching...</h3>
                    <p className="ps-empty-d">Looking for matching positions</p>
                </div>
            ) : filtered.length > 0 ? (
                <div style={{overflowX:"auto",flex:1,background:"#fff",borderRadius:10}}>
                    <table className="ps-tbl">
                        <thead>
                        <tr>
                            <th>Position</th>
                            <th>Department</th>
                            <th>Level</th>
                            <th>OT Rate</th>
                            <th>Employees</th>
                        </tr>
                        </thead>
                        <tbody>
                        {filtered.map((p, i) => {
                            const count = p.employee_count || posCounts[p.name] || 0;
                            const realIdx = positions.indexOf(p);
                            return (
                                <tr key={i} onClick={() => openView(p, realIdx)} className="ps-row">
                                    <td>
                                        <div className="ps-pos">
                                            <div className="ps-av"><I name="briefcase" size={14} /></div>
                                            <span className="ps-pos-name">{p.name}</span>
                                        </div>
                                    </td>
                                    <td>{p.department || "—"}</td>
                                    <td>{p.level ? <span className="ps-level-tag">{p.level}</span> : "—"}</td>
                                    <td>{p.ot_multiplier > 0 ? <span className="ps-ot-tag">{p.ot_multiplier}×</span> : <span style={{color:"#bbb"}}>default</span>}</td>
                                    <td><span className="ps-count-tag">{count}</span></td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="ps-empty">
                    <div className="ps-empty-ic"><I name="briefcase" size={28} /></div>
                    <h3 className="ps-empty-t">{(filter || debouncedSearch) ? "No matches found" : "No positions yet"}</h3>
                    <p className="ps-empty-d">{(filter || debouncedSearch) ? "Try a different search term." : "Create positions to define roles in your organization."}</p>
                </div>
            )}
        </div>

        <PosPanel
            open={panel.open}
            mode={panel.mode}
            pos={panel.pos}
            idx={panel.idx}
            departments={departments}
            onClose={closePanel}
            onSave={savePos}
            onDelete={deletePos}
            employees={employees}
        />

        <style>{posCSS}</style>
    </>);
}

/* ================================================================
   MODAL PANEL — all modes use Modal
================================================================ */
function PosPanel({ open, mode, pos, idx, departments, onClose, onSave, onDelete, employees = [] }) {
    const [form, setForm] = useState({});
    const [currentMode, setCurrentMode] = useState(mode);
    const [activeTab, setActiveTab] = useState("details");

    useEffect(() => {
        if (pos && (mode === "view" || mode === "edit")) {
            setForm({ ...pos });
        } else {
            setForm({});
        }
        setCurrentMode(mode);
        setActiveTab("details");
    }, [pos, mode, open]);

    if (!open) return null;

    const isView = currentMode === "view";
    const isAdd = currentMode === "add";
    const isEdit = currentMode === "edit";
    const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

    const handleSave = () => {
        if (!form.name?.trim()) return;
        onSave(form, isAdd, idx);
    };

    const switchToEdit = () => { setCurrentMode("edit"); setActiveTab("details"); };
    const switchToView = () => setCurrentMode("view");

    // Employees in this position
    const posEmployees = employees.filter(e => (e.position || e.pos) === form.name);

    const ini = (e) => {
        const n = e.name || `${e.first_name || ""} ${e.last_name || ""}`.trim();
        return n.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
    };
    const displayName = (e) => e.name || `${e.first_name || ""} ${e.last_name || ""}`.trim() || "—";

    /* ── Tabs (only in view mode) ── */
    const renderTabs = () => (
        <div className="pp-tabs">
            {[
                { id: "details", label: "Details", icon: "briefcase" },
                { id: "employees", label: `Employees (${posEmployees.length})`, icon: "users" },
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

    /* ── Shared form fields ── */
    const renderFormFields = () => (
        <div className="pp-section">
            <h4 className="pp-sec-title">Position Details</h4>
            <div className="pp-fields">
                <div className="pp-field pp-field-full">
                    <label className="pp-label">Position Title <span className="pp-req"/></label>
                    <input className="pp-input" value={form.name || ""} onChange={e => set("name", e.target.value)} placeholder="e.g. Software Engineer, HR Manager" disabled={isView} />
                </div>
                <div className="pp-field">
                    <label className="pp-label">Department</label>
                    <select className="pp-input" value={form.department || ""} onChange={e => set("department", e.target.value)} disabled={isView}>
                        <option value="">Select...</option>
                        {departments.map(d => <option key={d.id || d.name} value={d.name}>{d.name}</option>)}
                    </select>
                </div>
                <div className="pp-field">
                    <label className="pp-label">Level</label>
                    <select className="pp-input" value={form.level || ""} onChange={e => set("level", e.target.value)} disabled={isView}>
                        <option value="">Select...</option>
                        {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                </div>
                <div className="pp-field">
                    <label className="pp-label">OT Multiplier</label>
                    <input
                        type="number"
                        className="pp-input"
                        value={form.ot_multiplier || ""}
                        onChange={e => set("ot_multiplier", parseFloat(e.target.value) || 0)}
                        placeholder="e.g. 1.25"
                        step="0.05" min="0"
                        disabled={isView}
                    />
                    <span style={{fontSize:11,color:"#999",marginTop:3}}>
                        {form.ot_multiplier > 0
                            ? `${form.ot_multiplier}× hourly rate for OT hours`
                            : "0 = use company default (1.25×)"}
                    </span>
                </div>
                <div className="pp-field pp-field-full">
                    <label className="pp-label">Description</label>
                    <textarea className="pp-input pp-textarea" value={form.description || ""} onChange={e => set("description", e.target.value)} placeholder="Role responsibilities and requirements" rows={3} disabled={isView} />
                </div>
            </div>
        </div>
    );

    /* ── Employees list tab ── */
    const renderEmployees = () => (
        <div className="pp-emp-tab">
            {posEmployees.length === 0 ? (
                <div className="pp-emp-empty">
                    <div className="pp-emp-empty-ic"><I name="users" size={24} /></div>
                    <div className="pp-emp-empty-t">No employees</div>
                    <div className="pp-emp-empty-d">No employees hold this position yet.</div>
                </div>
            ) : (
                <div className="pp-emp-list">
                    {posEmployees.map((e, i) => (
                        <div key={e.id || i} className="pp-emp-item">
                            <div className="pp-emp-av">{ini(e)}</div>
                            <div className="pp-emp-info">
                                <div className="pp-emp-name">{displayName(e)}</div>
                                <div className="pp-emp-meta">{e.department || e.dept || "No department"}</div>
                            </div>
                            <span className={`pp-emp-badge ${(e.status || "Active") === "Active" ? "pp-emp-b-active" : "pp-emp-b-other"}`}>
                                {e.status || "Active"}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    /* ── ALL MODES → Modal ── */
    return (
        <Modal
            title={isAdd ? "Add Position" : isEdit ? "Edit Position" : (form.name || "Position")}
            subtitle={isView ? `${form.department || "No department"} · ${posEmployees.length} employee${posEmployees.length !== 1 ? "s" : ""}` : "Configure position details"}
            onClose={isEdit ? switchToView : onClose}
        >
            <div className="pp-modal-layout">
                {isView && <div className="pp-modal-tabs-bar">{renderTabs()}</div>}

                <div className="pp-modal-scroll">
                    {(isAdd || isEdit || activeTab === "details") ? renderFormFields() : renderEmployees()}
                </div>

                <div className="pp-modal-foot">
                    <div className="pp-legend">
                        <span className="pp-legend-item"><span className="pp-legend-dot pp-legend-dot-req"></span> Required</span>
                        <span className="pp-legend-item"><span className="pp-legend-dot pp-legend-dot-enc"></span> Encrypted</span>
                    </div>
                    <div className="pp-foot-btns">
                        {isView ? (<>
                            <button className="pp-btn-danger" onClick={() => onDelete(idx)}>Delete</button>
                            <button className="pp-btn-primary" onClick={switchToEdit}>Edit</button>
                        </>) : (<>
                            <button className="pp-btn-cancel" onClick={isEdit ? switchToView : onClose}>Cancel</button>
                            <button className="pp-btn-primary" onClick={handleSave}>
                                {isAdd ? "Add Position" : "Save Changes"}
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
const posCSS = `
  .ps-wrap{display:flex;flex-direction:column;min-height:calc(100vh - 54px - 48px)}

  .ps-bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px}
  .ps-bar-left{display:flex;align-items:center;gap:12px}
  .ps-search-wrap{display:flex;align-items:center;gap:8px;padding:8px 14px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;flex:1;max-width:200px;color:#aaa}
  .ps-search{border:none;outline:none;font-family:'DM Sans',sans-serif;font-size:13px;color:#333;flex:1;background:transparent}
  .ps-search::placeholder{color:#bbb}
  .ps-filter{padding:7px 12px;border:1px solid #e0e0e0;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:12px;color:#555;background:#fff;outline:none}
  .ps-filter:focus{border-color:#6366f1}
  .ps-btn-p{display:flex;align-items:center;gap:5px;padding:9px 18px;border:none;border-radius:8px;background:#6366f1;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;color:#fff;cursor:pointer;transition:all .15s}
  .ps-btn-p:hover{background:#4f46e5}

  .ps-tbl{width:100%;border-collapse:collapse;font-size:13px;background:#fff;border-radius:10px;overflow:hidden}
  .ps-tbl thead th{text-align:left;padding:10px 14px;font-size:11px;font-weight:600;color:#999;text-transform:uppercase;letter-spacing:.03em;border-bottom:1px solid #eee;background:#fafbfa}
  .ps-tbl tbody td{padding:12px 14px;border-bottom:1px solid #f5f5f5;color:#444}
  .ps-row{cursor:pointer;transition:background .1s}
  .ps-row:hover{background:#f9f9ff}
  .ps-pos{display:flex;align-items:center;gap:10px}
  .ps-av{width:34px;height:34px;border-radius:9px;background:#eef2ff;color:#6366f1;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .ps-pos-name{font-weight:600;color:#222}
  .ps-level-tag{font-size:11px;font-weight:600;color:#6366f1;background:#eef2ff;padding:2px 8px;border-radius:4px}
  .ps-count-tag{font-size:11px;font-weight:600;color:#2d9e8b;background:#edf8f5;padding:2px 8px;border-radius:4px}
  .ps-ot-tag{font-size:11px;font-weight:600;color:#ea580c;background:#fff7ed;padding:2px 8px;border-radius:4px}

  .ps-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:60px 20px;background:#fff;border-radius:10px}
  .ps-empty-ic{width:56px;height:56px;border-radius:50%;background:#eef2ff;color:#6366f1;display:flex;align-items:center;justify-content:center;margin:0 auto 12px}
  .ps-empty-t{font-size:15px;font-weight:700;color:#333;margin-bottom:4px}
  .ps-empty-d{font-size:13px;color:#999}

  @keyframes ps-spin{to{transform:rotate(360deg)}}
  .ps-spinner{width:14px;height:14px;border:2px solid #e0e0e0;border-top-color:#6366f1;border-radius:50%;animation:ps-spin .6s linear infinite;flex-shrink:0}
  .ps-loading-spinner{width:36px;height:36px;border:3px solid #eef2ff;border-top-color:#6366f1;border-radius:50%;animation:ps-spin .7s linear infinite;margin:0 auto 12px}

  @media(max-width:600px){.ps-bar{flex-direction:column}.ps-bar-left{flex-direction:column;width:100%}.ps-search-wrap{max-width:100%}}
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
  .pp-legend-dot-enc{background:#2d9e8b}

  /* Modal fixed-height layout */
  .pp-modal-layout{display:flex;flex-direction:column;height:60vh;min-height:400px;max-height:70vh}
  .pp-modal-tabs-bar{flex-shrink:0}
  .pp-modal-scroll{flex:1;overflow-y:auto;padding:16px 0 0}
  .pp-modal-foot{flex-shrink:0;padding:16px 0 0;margin-top:auto}

  /* Tabs */
  .pp-tabs{display:flex;gap:0;padding:0;overflow-x:auto;justify-content:center}
  .pp-tab{display:flex;align-items:center;gap:5px;padding:10px 14px;border:none;outline:none;background:none;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:500;color:#aaa;cursor:pointer;transition:all .15s;white-space:nowrap}
  .pp-tab:hover{color:#666}
  .pp-tab-on{color:#6366f1;font-weight:600}

  /* Employees tab */
  .pp-emp-tab{padding:4px 0}
  .pp-emp-list{display:flex;flex-direction:column;gap:6px}
  .pp-emp-item{display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid #eee;border-radius:10px;transition:background .1s}
  .pp-emp-item:hover{background:#f9f9ff;border-color:#d4d4f8}
  .pp-emp-av{width:34px;height:34px;border-radius:9px;background:#eef2ff;color:#6366f1;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;font-weight:700}
  .pp-emp-info{flex:1;min-width:0}
  .pp-emp-name{font-size:13px;font-weight:600;color:#222;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .pp-emp-meta{font-size:11px;color:#999;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .pp-emp-badge{font-size:10px;font-weight:600;padding:2px 8px;border-radius:4px;flex-shrink:0}
  .pp-emp-b-active{color:#0d9488;background:#e0faf1}
  .pp-emp-b-other{color:#888;background:#f0f0f0}
  .pp-emp-empty{text-align:center;padding:30px 10px}
  .pp-emp-empty-ic{width:48px;height:48px;border-radius:50%;background:#eef2ff;color:#6366f1;display:flex;align-items:center;justify-content:center;margin:0 auto 10px}
  .pp-emp-empty-t{font-size:14px;font-weight:700;color:#444;margin-bottom:4px}
  .pp-emp-empty-d{font-size:12px;color:#999}

  @media(max-width:600px){
    .pp-modal-layout{height:55vh;min-height:350px;max-height:65vh}
    .pp-fields{grid-template-columns:1fr}
  }
`;
