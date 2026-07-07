import { useState, useEffect } from "react";
import { I } from "../../layouts/ERPLayout";
import Modal from "../components/Modal";

/* ================================================================
   API
================================================================ */
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

/* ================================================================
   MAIN COMPONENT
================================================================ */
export default function DepartmentsTab({ departments, setDepartments, employees = [] }) {
    const [panel, setPanel] = useState({ open: false, mode: "add", dept: null, idx: -1 });
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
                const data = await api("get_departments");
                if (data.departments) setDepartments(data.departments);
            } catch {}
        })();
    }, []);

    const openAdd = () => setPanel({ open: true, mode: "add", dept: null, idx: -1 });
    const openView = (d, i) => setPanel({ open: true, mode: "view", dept: d, idx: i });
    const closePanel = () => setPanel({ open: false, mode: "add", dept: null, idx: -1 });

    async function saveDept(dept, isNew, idx) {
        const saved = { ...dept };
        if (!saved.color) saved.color = "#2d9e8b";
        saved.description = saved.description || null;

        if (isNew) {
            saved._temp = true;
            setDepartments(prev => [...prev, saved]);
        } else {
            setDepartments(prev => prev.map((d, i) => i === idx ? { ...d, ...saved } : d));
        }
        closePanel();

        try {
            const data = await api(isNew ? "create_department" : "update_department", saved);
            if (isNew && data?.id) {
                setDepartments(prev => prev.map(d => d._temp && d.name === saved.name ? { ...saved, id: data.id, _temp: undefined } : d));
            }
        } catch (err) {
            console.warn("Department save failed:", err);
        }
    }

    async function deleteDept(idx) {
        const removed = departments[idx];
        setDepartments(prev => prev.filter((_, i) => i !== idx));
        closePanel();
        try {
            if (removed?.id && !removed._temp) await api("delete_department", { id: removed.id });
        } catch (err) {
            console.warn("Department delete failed:", err);
        }
    }

    // Count employees per department
    const deptCounts = {};
    employees.forEach(e => {
        if (e.department) deptCounts[e.department] = (deptCounts[e.department] || 0) + 1;
    });

    const filtered = departments.filter(d => {
        if (!debouncedSearch) return true;
        const q = debouncedSearch.toLowerCase();
        return (d.name || "").toLowerCase().includes(q)
            || (d.description || "").toLowerCase().includes(q);
    });

    return (<>
        <div className="dp-wrap">
            <div className="dp-bar">
                <div className="dp-search-wrap">
                    {searching
                        ? <div className="dp-spinner" />
                        : <I name="search" size={14} />
                    }
                    <input
                        className="dp-search"
                        placeholder="Search departments..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <button className="dp-btn-p" onClick={openAdd}><I name="plus" size={14} /> Add Department</button>
            </div>

            {searching ? (
                <div className="dp-empty">
                    <div className="dp-loading-spinner" />
                    <h3 className="dp-empty-t">Searching...</h3>
                    <p className="dp-empty-d">Looking for matching departments</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className="dp-empty">
                    <div className="dp-empty-ic"><I name="grid" size={32} /></div>
                    <h3 className="dp-empty-t">{debouncedSearch ? "No matches found" : "No departments"}</h3>
                    <p className="dp-empty-d">{debouncedSearch ? "Try a different search term." : "Create departments to organize your workforce."}</p>
                </div>
            ) : (
                <div style={{overflowX:"auto",flex:1,background:"#fff",borderRadius:10}}>
                    <table className="dp-tbl">
                        <thead>
                        <tr>
                            <th>Department</th>
                            <th>Description</th>
                            <th>Employees</th>
                        </tr>
                        </thead>
                        <tbody>
                        {filtered.map((d, i) => {
                            const realIdx = departments.indexOf(d);
                            const color = d.color || "#2d9e8b";
                            const count = d.employee_count || deptCounts[d.name] || 0;
                            return (
                                <tr key={i} onClick={() => openView(d, realIdx)} className="dp-row">
                                    <td>
                                        <div className="dp-dept">
                                            <div className="dp-av" style={{ background: color + "20", color }}><I name="grid" size={14} /></div>
                                            <span className="dp-dept-name">{d.name}</span>
                                        </div>
                                    </td>
                                    <td className="dp-desc-cell">{d.description || "—"}</td>
                                    <td><span className="dp-count-tag">{count}</span></td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>

        <DeptPanel
            open={panel.open}
            mode={panel.mode}
            dept={panel.dept}
            idx={panel.idx}
            onClose={closePanel}
            onSave={saveDept}
            onDelete={deleteDept}
            employees={employees}
        />

        <style>{deptCSS}</style>
    </>);
}

/* ================================================================
   SLIDE-OUT PANEL (view) + MODAL (add/edit)
================================================================ */
function DeptPanel({ open, mode, dept, idx, onClose, onSave, onDelete, employees = [] }) {
    const [form, setForm] = useState({});
    const [currentMode, setCurrentMode] = useState(mode);
    const [activeTab, setActiveTab] = useState("details");

    useEffect(() => {
        if (dept && (mode === "view" || mode === "edit")) {
            setForm({ ...dept });
        } else {
            setForm({ color: "#2d9e8b" });
        }
        setCurrentMode(mode);
        setActiveTab("details");
    }, [dept, mode, open]);

    if (!open) return null;

    const isView = currentMode === "view";
    const isAdd = currentMode === "add";
    const isEdit = currentMode === "edit";
    const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

    const handleSave = () => {
        if (!form.name?.trim()) return;
        onSave(form, isAdd, idx);
    };

    const color = form.color || "#2d9e8b";

    const switchToEdit = () => { setCurrentMode("edit"); setActiveTab("details"); };
    const switchToView = () => setCurrentMode("view");

    // Employees in this department
    const deptEmployees = employees.filter(e => (e.department || e.dept) === form.name);

    const ini = (e) => {
        const n = e.name || `${e.first_name || ""} ${e.last_name || ""}`.trim();
        return n.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
    };
    const displayName = (e) => e.name || `${e.first_name || ""} ${e.last_name || ""}`.trim() || "—";

    /* ── Tabs (only in view mode) ── */
    const renderTabs = () => (
        <div className="dp-tabs">
            {[
                { id: "details", label: "Details", icon: "grid" },
                { id: "employees", label: `Employees (${deptEmployees.length})`, icon: "users" },
            ].map(t => (
                <button
                    key={t.id}
                    className={`dp-tab ${activeTab === t.id ? "dp-tab-on" : ""}`}
                    onClick={() => setActiveTab(t.id)}
                >
                    <I name={t.icon} size={13} /> {t.label}
                </button>
            ))}
        </div>
    );

    /* ── Shared form fields ── */
    const renderFormFields = () => (
        <div className="bp-section">
            <h4 className="bp-sec-title">Department Details</h4>
            <div className="bp-fields">
                <div className="bp-field bp-field-full">
                    <label className="bp-label">Department Name <span className="bp-req"/></label>
                    <div className="dp-name-row">
                        <input className="bp-input" value={form.name || ""} onChange={e => set("name", e.target.value)} placeholder="e.g. Engineering, Marketing" disabled={isView} />
                        <input
                            type="color"
                            className="dp-color-picker"
                            value={form.color || "#2d9e8b"}
                            onChange={e => set("color", e.target.value)}
                            disabled={isView}
                            title="Department color"
                        />
                    </div>
                </div>
                <div className="bp-field bp-field-full">
                    <label className="bp-label">Description</label>
                    <textarea className="bp-input bp-textarea" value={form.description || ""} onChange={e => set("description", e.target.value)} placeholder="What does this department handle?" rows={3} disabled={isView} />
                </div>
            </div>
        </div>
    );

    /* ── Employees list tab ── */
    const renderEmployees = () => (
        <div className="dp-emp-tab">
            {deptEmployees.length === 0 ? (
                <div className="dp-emp-empty">
                    <div className="dp-emp-empty-ic"><I name="users" size={24} /></div>
                    <div className="dp-emp-empty-t">No employees</div>
                    <div className="dp-emp-empty-d">No employees are assigned to this department yet.</div>
                </div>
            ) : (
                <div className="dp-emp-list">
                    {deptEmployees.map((e, i) => (
                        <div key={e.id || i} className="dp-emp-item">
                            <div className="dp-emp-av" style={{ background: color + "20", color }}>{ini(e)}</div>
                            <div className="dp-emp-info">
                                <div className="dp-emp-name">{displayName(e)}</div>
                                <div className="dp-emp-meta">{e.position || e.pos || "No position"}</div>
                            </div>
                            <span className={`dp-emp-badge ${(e.status || "Active") === "Active" ? "dp-emp-b-active" : "dp-emp-b-other"}`}>
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
            title={isAdd ? "Add Department" : isEdit ? "Edit Department" : (form.name || "Department")}
            subtitle={isView ? `${deptEmployees.length} employee${deptEmployees.length !== 1 ? "s" : ""}` : "Configure department details"}
            onClose={isEdit ? switchToView : onClose}
        >
            <div className="dp-modal-layout">
                {isView && <div className="dp-modal-tabs-bar">{renderTabs()}</div>}

                <div className="dp-modal-scroll">
                    {(isAdd || isEdit || activeTab === "details") ? renderFormFields() : renderEmployees()}
                </div>

                <div className="dp-modal-foot">
                    <div className="bp-legend">
                        <span className="bp-legend-item"><span className="bp-legend-dot bp-legend-dot-req"></span> Required</span>
                        <span className="bp-legend-item"><span className="bp-legend-dot bp-legend-dot-enc"></span> Encrypted</span>
                    </div>
                    <div className="bp-foot-btns">
                        {isView ? (<>
                            <button className="bp-btn-danger" onClick={() => onDelete(idx)}>Delete</button>
                            <button className="bp-btn-primary" onClick={switchToEdit}>Edit</button>
                        </>) : (<>
                            <button className="bp-btn-cancel" onClick={isEdit ? switchToView : onClose}>Cancel</button>
                            <button className="bp-btn-primary" onClick={handleSave}>
                                {isAdd ? "Add Department" : "Save Changes"}
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
const deptCSS = `
  .dp-wrap{display:flex;flex-direction:column;min-height:calc(100vh - 54px - 48px)}

  .dp-bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px}
  .dp-search-wrap{display:flex;align-items:center;gap:8px;padding:8px 14px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;flex:1;max-width:200px;color:#aaa}
  .dp-search{border:none;outline:none;font-family:'DM Sans',sans-serif;font-size:13px;color:#333;flex:1;background:transparent}
  .dp-search::placeholder{color:#bbb}
  .dp-bar-count{font-size:13px;color:#888}
  .dp-btn-p{display:flex;align-items:center;gap:5px;padding:9px 18px;border:none;border-radius:8px;background:#2d9e8b;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;color:#fff;cursor:pointer;transition:all .15s}
  .dp-btn-p:hover{background:#268a79}

  .dp-tbl{width:100%;border-collapse:collapse;font-size:13px;background:#fff;border-radius:10px;overflow:hidden}
  .dp-tbl thead th{text-align:left;padding:10px 14px;font-size:11px;font-weight:600;color:#999;text-transform:uppercase;letter-spacing:.03em;border-bottom:1px solid #eee;background:#fafbfa}
  .dp-tbl tbody td{padding:12px 14px;border-bottom:1px solid #f5f5f5;color:#444}
  .dp-row{cursor:pointer;transition:background .1s}
  .dp-row:hover{background:#f9fffe}
  .dp-dept{display:flex;align-items:center;gap:10px}
  .dp-av{width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .dp-dept-name{font-weight:600;color:#222}
  .dp-desc-cell{color:#888;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .dp-count-tag{font-size:11px;font-weight:600;color:#2d9e8b;background:#edf8f5;padding:2px 8px;border-radius:4px}

  .dp-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:60px 20px;background:#fff;border-radius:10px}
  .dp-empty-ic{width:56px;height:56px;border-radius:50%;background:#edf8f5;color:#2d9e8b;display:flex;align-items:center;justify-content:center;margin:0 auto 12px}
  .dp-empty-t{font-size:15px;font-weight:700;color:#333;margin-bottom:4px}
  .dp-empty-d{font-size:13px;color:#999}

  @keyframes dp-spin{to{transform:rotate(360deg)}}
  .dp-spinner{width:14px;height:14px;border:2px solid #e0e0e0;border-top-color:#2d9e8b;border-radius:50%;animation:dp-spin .6s linear infinite;flex-shrink:0}
  .dp-loading-spinner{width:36px;height:36px;border:3px solid #edf8f5;border-top-color:#2d9e8b;border-radius:50%;animation:dp-spin .7s linear infinite;margin:0 auto 12px}

  .dp-name-row{display:flex;align-items:center;gap:8px}
  .dp-name-row .bp-input{flex:1}
  .dp-color-picker{width:38px;height:38px;border:1px solid #e0e0e0;border-radius:8px;padding:2px;cursor:pointer;background:#fff;flex-shrink:0}
  .dp-color-picker::-webkit-color-swatch-wrapper{padding:0}
  .dp-color-picker::-webkit-color-swatch{border:none;border-radius:5px}
  .dp-color-picker::-moz-color-swatch{border:none;border-radius:5px}
  .dp-color-picker:disabled{cursor:default;opacity:.8}
  .dp-color-dot{display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:6px;vertical-align:middle}

  @media(max-width:600px){.dp-bar{flex-direction:column}.dp-search-wrap{max-width:100%}}
`;

const panelCSS = `
  button:focus,input:focus,select:focus,textarea:focus,[tabindex]:focus{outline:none}

  /* Shared panel styles */
  .bp-section{margin-bottom:20px}
  .bp-sec-title{font-size:13px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px}
  .bp-req{width:6px;height:6px;border-radius:50%;background:#ef4444;flex-shrink:0;display:inline-block}
  .bp-legend{display:flex;align-items:center;gap:14px;margin-bottom:12px}
  .bp-legend-item{display:flex;align-items:center;gap:5px;font-size:11px;color:#999}
  .bp-legend-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
  .bp-legend-dot-req{background:#ef4444}
  .bp-legend-dot-enc{background:#2d9e8b}
  .bp-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .bp-field{display:flex;flex-direction:column}
  .bp-field-full{grid-column:1/-1}
  .bp-label{display:flex;align-items:center;gap:4px;font-size:12px;font-weight:600;color:#666;margin-bottom:5px}
  .bp-input{width:100%;padding:9px 12px;border:1px solid #e0e0e0;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:13px;color:#333;outline:none;transition:border-color .15s;background:#fff;box-sizing:border-box}
  .bp-input:focus{border-color:#2d9e8b;box-shadow:0 0 0 2px rgba(45,158,139,.1)}
  .bp-input:disabled{background:#fafbfa;color:#555;cursor:default}
  .bp-textarea{resize:vertical;min-height:56px}
  .bp-foot-btns{display:flex;justify-content:flex-end;gap:8px}
  .bp-btn-cancel{padding:9px 18px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;color:#666;cursor:pointer}
  .bp-btn-cancel:hover{background:#f5f5f5}
  .bp-btn-primary{display:flex;align-items:center;gap:5px;padding:9px 22px;border:none;border-radius:8px;background:#2d9e8b;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;color:#fff;cursor:pointer;transition:all .15s}
  .bp-btn-primary:hover{background:#268a79}
  .bp-btn-danger{padding:9px 16px;border:1px solid #fecaca;border-radius:8px;background:#fef2f2;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;color:#ef4444;cursor:pointer}
  .bp-btn-danger:hover{background:#ef4444;color:#fff}

  /* Modal fixed-height layout */
  .dp-modal-layout{display:flex;flex-direction:column;height:60vh;min-height:400px;max-height:70vh}
  .dp-modal-tabs-bar{flex-shrink:0}
  .dp-modal-scroll{flex:1;overflow-y:auto;padding:16px 0 0}
  .dp-modal-foot{flex-shrink:0;padding:16px 0 0;margin-top:auto}

  /* Tabs */
  .dp-tabs{display:flex;gap:0;padding:0;overflow-x:auto;justify-content:center}
  .dp-tab{display:flex;align-items:center;gap:5px;padding:10px 14px;border:none;outline:none;background:none;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:500;color:#aaa;cursor:pointer;transition:all .15s;white-space:nowrap}
  .dp-tab:hover{color:#666}
  .dp-tab-on{color:#2d9e8b;font-weight:600}

  /* Employees tab */
  .dp-emp-tab{padding:4px 0}
  .dp-emp-list{display:flex;flex-direction:column;gap:6px}
  .dp-emp-item{display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid #eee;border-radius:10px;transition:background .1s}
  .dp-emp-item:hover{background:#fafffe;border-color:#d4e8e2}
  .dp-emp-av{width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;font-weight:700}
  .dp-emp-info{flex:1;min-width:0}
  .dp-emp-name{font-size:13px;font-weight:600;color:#222;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .dp-emp-meta{font-size:11px;color:#999;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .dp-emp-badge{font-size:10px;font-weight:600;padding:2px 8px;border-radius:4px;flex-shrink:0}
  .dp-emp-b-active{color:#0d9488;background:#e0faf1}
  .dp-emp-b-other{color:#888;background:#f0f0f0}
  .dp-emp-empty{text-align:center;padding:30px 10px}
  .dp-emp-empty-ic{width:48px;height:48px;border-radius:50%;background:#edf8f5;color:#2d9e8b;display:flex;align-items:center;justify-content:center;margin:0 auto 10px}
  .dp-emp-empty-t{font-size:14px;font-weight:700;color:#444;margin-bottom:4px}
  .dp-emp-empty-d{font-size:12px;color:#999}

  @media(max-width:600px){
    .dp-modal-layout{height:55vh;min-height:350px;max-height:65vh}
  }
`;
