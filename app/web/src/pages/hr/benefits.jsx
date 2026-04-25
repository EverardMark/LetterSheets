import { useState, useEffect } from "react";
import { I } from "../../layouts/ERPLayout";
import Modal from "../components/Modal";

/* ================================================================
   API HELPER
================================================================ */
const API_URL = "/api/execute";

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
   CONSTANTS
================================================================ */
const BENEFIT_TYPES = [
    { value: "health",       label: "Health Insurance (HMO)" },
    { value: "life",         label: "Life Insurance" },
    { value: "dental",       label: "Dental" },
    { value: "vision",       label: "Vision" },
    { value: "retirement",   label: "Retirement / Pension" },
    { value: "rice",         label: "Rice Subsidy" },
    { value: "clothing",     label: "Clothing Allowance" },
    { value: "transportation", label: "Transportation Allowance" },
    { value: "meal",         label: "Meal Allowance" },
    { value: "communication", label: "Communication Allowance" },
    { value: "education",    label: "Education / Training" },
    { value: "wellness",     label: "Wellness / Gym" },
    { value: "other",        label: "Other" },
];

const FREQUENCIES = ["Monthly", "Quarterly", "Semi-Annual", "Yearly", "One-time"];

const TYPE_ICONS = {
    health: "heart", life: "shield", dental: "smile", vision: "eye",
    retirement: "banknote", rice: "coffee", clothing: "briefcase",
    transportation: "truck", meal: "coffee", communication: "phone",
    education: "book", wellness: "activity", other: "star",
};

const TYPE_COLORS = {
    health: "#ef4444", life: "#8b5cf6", dental: "#0ea5e9", vision: "#06b6d4",
    retirement: "#f59e0b", rice: "#22c55e", clothing: "#ec4899",
    transportation: "#6366f1", meal: "#f97316", communication: "#14b8a6",
    education: "#3b82f6", wellness: "#10b981", other: "#9ca3af",
};

function freqShort(f) {
    switch(f) {
        case "Monthly": return "mo"; case "Quarterly": return "qtr";
        case "Semi-Annual": return "6mo"; case "Yearly": return "yr";
        case "One-time": return "once"; default: return "mo";
    }
}

function typeName(t) { return BENEFIT_TYPES.find(b => b.value === t)?.label || t || "Benefit"; }

function toMonthly(cost, frequency) {
    const c = Number(cost) || 0;
    switch(frequency) {
        case "Yearly": return c / 12;
        case "Quarterly": return c / 3;
        case "Semi-Annual": return c / 6;
        default: return c;
    }
}

// Get the cheapest tier employer cost for card display
function minTierCost(tiers = []) {
    if (!tiers.length) return 0;
    return Math.min(...tiers.map(t => Number(t.employer_cost) || 0));
}
function maxTierCost(tiers = []) {
    if (!tiers.length) return 0;
    return Math.max(...tiers.map(t => Number(t.employer_cost) || 0));
}
function costRange(tiers = [], freq) {
    if (!tiers.length) return "—";
    const min = minTierCost(tiers);
    const max = maxTierCost(tiers);
    const f = freqShort(freq);
    if (min === max) return `₱${min.toLocaleString()}/${f}`;
    return `₱${min.toLocaleString()} – ₱${max.toLocaleString()}/${f}`;
}

/* ================================================================
   MAIN COMPONENT
================================================================ */
export default function BenefitsTab({ benefits, setBenefits, employees = [] }) {
    const company = JSON.parse(localStorage.getItem("ls_company") || "{}");
    const isEmployee = company.role === "employee";

    const [panel, setPanel] = useState({ open: false, mode: "add", benefit: null, idx: -1 });

    useEffect(() => {
        (async () => {
            try {
                const data = await api("get_benefits");
                if (data.benefits?.length > 0) setBenefits(data.benefits);
            } catch {}
        })();
    }, []);

    const openAdd = () => setPanel({ open: true, mode: "add", benefit: null, idx: -1 });
    const openView = (b, i) => setPanel({ open: true, mode: "view", benefit: b, idx: i });
    const closePanel = () => setPanel({ open: false, mode: "add", benefit: null, idx: -1 });

    async function saveBenefit(benefit, isNew, idx) {
        const saved = { ...benefit };
        if (!saved.name?.trim()) saved.name = typeName(saved.type);
        saved.enrolled = Number(saved.enrolled) || 0;
        saved.eligibility = saved.eligibility || null;
        saved.description = saved.description || null;
        // Ensure tier costs are numbers
        saved.tiers = (saved.tiers || []).map(t => ({
            ...t,
            employer_cost: Number(t.employer_cost) || 0,
            employee_cost: Number(t.employee_cost) || 0,
        }));

        if (isNew) {
            saved._temp = true;
            setBenefits(prev => [...prev, saved]);
        } else {
            setBenefits(prev => prev.map((b, i) => i === idx ? saved : b));
        }
        closePanel();

        try {
            const data = await api(isNew ? "create_benefit" : "update_benefit", saved);
            if (isNew && data?.id) {
                setBenefits(prev => prev.map(b => b._temp && b.name === saved.name ? { ...saved, id: data.id, tiers: data.tiers || saved.tiers, _temp: undefined } : b));
            }
        } catch (err) {
            console.warn("Benefit save failed:", err);
        }
    }

    async function deleteBenefit(idx) {
        const removed = benefits[idx];
        setBenefits(prev => prev.filter((_, i) => i !== idx));
        closePanel();
        try {
            if (removed?.id && !removed._temp) await api("delete_benefit", { benefit_id: removed.id });
        } catch (err) {
            console.warn("Benefit delete failed:", err);
        }
    }

    return (<>
        <div className="bf-bar">
            <span className="bf-bar-count">{benefits.length} benefit plans</span>
            {!isEmployee && <button className="bf-btn-p" onClick={openAdd}><I name="plus" size={14}/> Add Benefit</button>}
        </div>

        {benefits.length > 0 ? (
            <div className="bf-grid">
                {benefits.map((b, i) => {
                    const color = TYPE_COLORS[b.type] || "#9ca3af";
                    const icon = TYPE_ICONS[b.type] || "star";
                    const tiers = b.tiers || [];
                    return (
                        <div key={i} className="bf-card" style={{borderTopColor: color}} onClick={() => openView(b, i)}>
                            <div className="bf-card-head">
                                <div className="bf-card-ic" style={{background: color + "14", color}}><I name={icon}/></div>
                                <div className="bf-card-info">
                                    <div className="bf-card-name">{b.name || typeName(b.type)}</div>
                                    <div className="bf-card-provider">{b.provider || "—"}</div>
                                </div>
                                <span className={`bf-badge ${b.status === "Active" ? "bf-b-active" : "bf-b-inactive"}`}>{b.status || "Active"}</span>
                            </div>
                            <div className="bf-card-body">
                                {b.coverage && <div className="bf-card-row"><span className="bf-card-rl">Coverage</span><span className="bf-card-rv">{b.coverage}</span></div>}
                                <div className="bf-card-row"><span className="bf-card-rl">Employer Cost</span><span className="bf-card-rv">{costRange(tiers, b.frequency)}</span></div>
                                {tiers.length > 1 && (
                                    <div className="bf-card-row"><span className="bf-card-rl">Tiers</span><span className="bf-card-rv">{tiers.map(t=>t.name).join(", ")}</span></div>
                                )}
                                <div className="bf-card-row"><span className="bf-card-rl">Enrolled</span><span className="bf-card-rv" style={{color:"#2d9e8b"}}>{(() => { const enrolled = employees.filter(e => { try { const eb = typeof e.enrolled_benefits === "string" ? JSON.parse(e.enrolled_benefits) : (e.enrolled_benefits || []); return Array.isArray(eb) && eb.includes(b.id); } catch { return false; } }); return `${enrolled.length} / ${employees.length}`; })()}</span></div>
                                {(() => {
                                    const enrolled = employees.filter(e => { try { const eb = typeof e.enrolled_benefits === "string" ? JSON.parse(e.enrolled_benefits) : (e.enrolled_benefits || []); return Array.isArray(eb) && eb.includes(b.id); } catch { return false; } });
                                    if (enrolled.length === 0) return null;
                                    return (
                                        <div className="bf-enrolled-list">
                                            {enrolled.map(e => (
                                                <div key={e.id} className="bf-enrolled-item">
                                                    <span className="bf-enrolled-av">{(e.first_name?.[0] || "") + (e.last_name?.[0] || "")}</span>
                                                    <div className="bf-enrolled-info">
                                                        <span className="bf-enrolled-name">{e.first_name} {e.last_name}</span>
                                                        <span className="bf-enrolled-dept">{e.department || e.position || "—"}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    );
                })}
            </div>
        ) : (
            <div className="bf-empty">
                <div className="bf-empty-ic"><I name="heart" size={32}/></div>
                <h3 className="bf-empty-t">No benefits configured</h3>
                <p className="bf-empty-d">Set up health insurance, allowances, and other employee benefits.</p>
            </div>
        )}

        <BenefitPanel
            open={panel.open}
            mode={isEmployee ? "view" : panel.mode}
            benefit={panel.benefit}
            idx={panel.idx}
            employees={employees}
            onClose={closePanel}
            onSave={saveBenefit}
            onDelete={isEmployee ? null : deleteBenefit}
        />

        <style>{benefitsCSS}</style>
    </>);
}

/* ================================================================
   BENEFIT PANEL — Slide-out from right
================================================================ */
function BenefitPanel({ open, mode, benefit, idx, employees, onClose, onSave, onDelete }) {
    const [form, setForm] = useState({});
    const [currentMode, setCurrentMode] = useState(mode);
    const [detailTab, setDetailTab] = useState("details");

    useEffect(() => {
        if (benefit && (mode === "view" || mode === "edit")) {
            setForm({ ...benefit, tiers: [...(benefit.tiers || [])] });
        } else {
            setForm({ type: "health", frequency: "Monthly", status: "Active", tiers: [{ name: "Default", employer_cost: 0, employee_cost: 0 }] });
        }
        setCurrentMode(mode);
        setDetailTab("details");
    }, [benefit, mode, open]);

    if (!open) return null;

    const isView = currentMode === "view";
    const isAdd = currentMode === "add";
    const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
    const switchToEdit = () => setCurrentMode("edit");
    const switchToView = () => setCurrentMode("view");

    // Tier helpers
    const tiers = form.tiers || [];
    const setTier = (i, k, v) => {
        const next = [...tiers];
        next[i] = { ...next[i], [k]: v };
        set("tiers", next);
    };
    const addTier = () => set("tiers", [...tiers, { name: "", employer_cost: 0, employee_cost: 0 }]);
    const removeTier = (i) => set("tiers", tiers.filter((_, j) => j !== i));

    const handleSave = () => {
        if (!form.name?.trim() && !form.type) return;
        if (tiers.length === 0) return;
        onSave(form, isAdd, idx);
    };

    const color = TYPE_COLORS[form.type] || "#9ca3af";
    const icon = TYPE_ICONS[form.type] || "star";
    const displayName = form.name || typeName(form.type);

    return (
        <Modal
            title={isAdd ? "Add Benefit" : currentMode === "edit" ? "Edit Benefit" : (displayName || "Benefit")}
            subtitle={isAdd ? "Configure a new employee benefit plan" : (form.provider || typeName(form.type))}
            onClose={currentMode === "edit" ? switchToView : onClose}
        >
            <div className="ap-modal-layout">
                <div className="ap-modal-scroll">
                    {isView ? (
                        <>
                            {/* Tab Navigation */}
                            <div className="bf-detail-tabs">
                                <button className={`bf-detail-tab ${detailTab === "details" ? "bf-detail-tab-a" : ""}`} onClick={() => setDetailTab("details")}>Details</button>
                                <button className={`bf-detail-tab ${detailTab === "employees" ? "bf-detail-tab-a" : ""}`} onClick={() => setDetailTab("employees")}>
                                    Employees {(() => { try { return `(${employees.filter(e => { const eb = typeof e.enrolled_benefits === "string" ? JSON.parse(e.enrolled_benefits) : (e.enrolled_benefits || []); return Array.isArray(eb) && eb.includes(form.id); }).length})`; } catch { return "(0)"; } })()}
                                </button>
                            </div>

                            {detailTab === "details" ? (
                                <>
                                    <div className="ap-section">
                                        <h4 className="ap-sec-title">Benefit Details</h4>
                                        <div className="ap-fields">
                                            <div className="ap-field">
                                                <label className="ap-label">Type</label>
                                                <input className="ap-input" value={typeName(form.type)} disabled />
                                            </div>
                                            <div className="ap-field">
                                                <label className="ap-label">Status</label>
                                                <span className={`bf-badge ${form.status === "Active" ? "bf-b-active" : "bf-b-inactive"}`}>{form.status || "Active"}</span>
                                            </div>
                                            {form.name && <div className="ap-field ap-field-full">
                                                <label className="ap-label">Name</label>
                                                <input className="ap-input" value={form.name} disabled />
                                            </div>}
                                            {form.provider && <div className="ap-field">
                                                <label className="ap-label">Provider</label>
                                                <input className="ap-input" value={form.provider} disabled />
                                            </div>}
                                            {form.coverage && <div className="ap-field">
                                                <label className="ap-label">Coverage</label>
                                                <input className="ap-input" value={form.coverage} disabled />
                                            </div>}
                                            {form.frequency && <div className="ap-field">
                                                <label className="ap-label">Frequency</label>
                                                <input className="ap-input" value={form.frequency} disabled />
                                            </div>}
                                        </div>
                                    </div>

                                    <div className="ap-section">
                                        <h4 className="ap-sec-title">Tiers & Costs</h4>
                                        {tiers.length > 0 ? (
                                            <div className="bp-tier-table">
                                                <div className="bp-tier-hdr">
                                                    <span className="bp-tier-hc" style={{flex:2}}>Tier</span>
                                                    <span className="bp-tier-hc">Employer</span>
                                                    <span className="bp-tier-hc">Employee</span>
                                                </div>
                                                {tiers.map((t, i) => (
                                                    <div key={i} className="bp-tier-row">
                                                        <span className="bp-tier-name" style={{flex:2}}>{t.name}</span>
                                                        <span className="bp-tier-cost">₱{Number(t.employer_cost).toLocaleString()}</span>
                                                        <span className="bp-tier-cost">₱{Number(t.employee_cost).toLocaleString()}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="bp-tier-none">No tiers configured</div>
                                        )}
                                    </div>

                                    {(form.eligibility || form.description) && (
                                        <div className="ap-section">
                                            <h4 className="ap-sec-title">Additional Info</h4>
                                            <div className="ap-fields">
                                                {form.eligibility && <div className="ap-field ap-field-full">
                                                    <label className="ap-label">Eligibility</label>
                                                    <input className="ap-input" value={form.eligibility} disabled />
                                                </div>}
                                                {form.description && <div className="ap-field ap-field-full">
                                                    <label className="ap-label">Notes</label>
                                                    <textarea className="ap-input ap-textarea" value={form.description} disabled rows={2} />
                                                </div>}
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                /* Employees Tab */
                                (() => {
                                    const enrolled = employees.filter(e => { try { const eb = typeof e.enrolled_benefits === "string" ? JSON.parse(e.enrolled_benefits) : (e.enrolled_benefits || []); return Array.isArray(eb) && eb.includes(form.id); } catch { return false; } });
                                    const notEnrolled = employees.filter(e => !enrolled.some(en => en.id === e.id));
                                    return (
                                        <>
                                            <div className="ap-section">
                                                <h4 className="ap-sec-title">Enrolled ({enrolled.length})</h4>
                                                {enrolled.length > 0 ? (
                                                    <div className="bf-detail-employees">
                                                        {enrolled.map(e => (
                                                            <div key={e.id} className="bf-detail-emp bf-detail-emp-enrolled">
                                                                <span className="bf-detail-emp-av">{(e.first_name?.[0] || "") + (e.last_name?.[0] || "")}</span>
                                                                <div className="bf-detail-emp-info">
                                                                    <span className="bf-detail-emp-name">{e.first_name} {e.last_name}</span>
                                                                    <span className="bf-detail-emp-dept">{e.department || e.position || "—"}</span>
                                                                </div>
                                                                <span className="bf-emp-badge bf-emp-badge-yes"><I name="check" size={10}/> Enrolled</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div style={{textAlign:"center",padding:"16px 0",color:"#ccc",fontSize:13}}>No employees enrolled yet.</div>
                                                )}
                                            </div>
                                            {notEnrolled.length > 0 && (
                                                <div className="ap-section">
                                                    <h4 className="ap-sec-title">Not Enrolled ({notEnrolled.length})</h4>
                                                    <div className="bf-detail-employees">
                                                        {notEnrolled.map(e => (
                                                            <div key={e.id} className="bf-detail-emp">
                                                                <span className="bf-detail-emp-av" style={{background:"#f3f4f6",color:"#999"}}>{(e.first_name?.[0] || "") + (e.last_name?.[0] || "")}</span>
                                                                <div className="bf-detail-emp-info">
                                                                    <span className="bf-detail-emp-name" style={{color:"#888"}}>{e.first_name} {e.last_name}</span>
                                                                    <span className="bf-detail-emp-dept">{e.department || e.position || "—"}</span>
                                                                </div>
                                                                <span className="bf-emp-badge bf-emp-badge-no">Not Enrolled</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    );
                                })()
                            )}
                        </>
                    ) : (
                        <>
                            <div className="ap-section">
                                <h4 className="ap-sec-title">Benefit Details</h4>
                                <div className="ap-fields">
                                    <div className="ap-field">
                                        <label className="ap-label">Benefit Type <span className="ap-req"/></label>
                                        <select className="ap-input" value={form.type||""} onChange={e=>set("type",e.target.value)}>
                                            {BENEFIT_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
                                        </select>
                                    </div>
                                    <div className="ap-field">
                                        <label className="ap-label">Benefit Name</label>
                                        <input className="ap-input" value={form.name||""} onChange={e=>set("name",e.target.value)} placeholder={typeName(form.type)}/>
                                    </div>
                                    <div className="ap-field">
                                        <label className="ap-label">Provider / Carrier</label>
                                        <input className="ap-input" value={form.provider||""} onChange={e=>set("provider",e.target.value)} placeholder="e.g. Maxicare, Sun Life"/>
                                    </div>
                                    <div className="ap-field">
                                        <label className="ap-label">Status</label>
                                        <select className="ap-input" value={form.status||"Active"} onChange={e=>set("status",e.target.value)}>
                                            <option value="Active">Active</option><option value="Inactive">Inactive</option><option value="Pending">Pending</option>
                                        </select>
                                    </div>
                                    <div className="ap-field ap-field-full">
                                        <label className="ap-label">Coverage Description</label>
                                        <input className="ap-input" value={form.coverage||""} onChange={e=>set("coverage",e.target.value)} placeholder="e.g. Employee + Dependents, ₱1M coverage"/>
                                    </div>
                                    <div className="ap-field">
                                        <label className="ap-label">Frequency</label>
                                        <select className="ap-input" value={form.frequency||"Monthly"} onChange={e=>set("frequency",e.target.value)}>
                                            {FREQUENCIES.map(f=><option key={f} value={f}>{f}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="ap-section">
                                <h4 className="ap-sec-title">Tiers & Costs <span className="ap-req"/></h4>
                                <p style={{fontSize:12,color:"#bbb",margin:"-6px 0 12px"}}>Add one or more tiers with different cost levels.</p>
                                {tiers.map((t, i) => (
                                    <div key={i} className="bp-tier-edit">
                                        <div className="bp-tier-edit-head">
                                            <span className="bp-tier-edit-num">Tier {i + 1}</span>
                                            {tiers.length > 1 && <button className="bp-tier-edit-rm" onClick={() => removeTier(i)}>✕</button>}
                                        </div>
                                        <div className="bp-tier-edit-fields">
                                            <div className="ap-field" style={{flex:2}}>
                                                <label className="ap-label">Tier Name</label>
                                                <input className="ap-input" value={t.name||""} onChange={e=>setTier(i,"name",e.target.value)} placeholder={tiers.length === 1 ? "Default" : `e.g. ${["Basic","Premium","Family"][i] || "Tier "+(i+1)}`}/>
                                            </div>
                                            <div className="ap-field">
                                                <label className="ap-label">Employer ₱</label>
                                                <input className="ap-input" type="number" value={t.employer_cost||""} onChange={e=>setTier(i,"employer_cost",e.target.value)} placeholder="0"/>
                                            </div>
                                            <div className="ap-field">
                                                <label className="ap-label">Employee ₱</label>
                                                <input className="ap-input" type="number" value={t.employee_cost||""} onChange={e=>setTier(i,"employee_cost",e.target.value)} placeholder="0"/>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                <button className="bp-tier-add" onClick={addTier}><I name="plus" size={13}/> Add Tier</button>
                            </div>

                            <div className="ap-section">
                                <h4 className="ap-sec-title">Additional Information</h4>
                                <div className="ap-fields">
                                    <div className="ap-field ap-field-full">
                                        <label className="ap-label">Eligibility Requirements</label>
                                        <textarea className="ap-input ap-textarea" value={form.eligibility||""} onChange={e=>set("eligibility",e.target.value)} placeholder="e.g. After 6 months, regular employees only" rows={2}/>
                                    </div>
                                    <div className="ap-field ap-field-full">
                                        <label className="ap-label">Notes / Description</label>
                                        <textarea className="ap-input ap-textarea" value={form.description||""} onChange={e=>set("description",e.target.value)} placeholder="Additional details..." rows={2}/>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="ap-modal-foot">
                    <div className="ap-foot-btns">
                        {isView ? (<>
                            {onDelete && <button className="ap-btn-danger" onClick={() => onDelete(idx)}>Delete</button>}
                            <button className="ap-btn-primary" onClick={switchToEdit}><I name="briefcase" size={13}/> Edit</button>
                        </>) : (<>
                            <button className="ap-btn-cancel" onClick={currentMode === "edit" ? switchToView : onClose}>Cancel</button>
                            <button className="ap-btn-primary" onClick={handleSave}>{isAdd ? "Add Benefit" : "Save Changes"}</button>
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
const benefitsCSS = `
  .bf-bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px}
  .bf-bar-count{font-size:13px;color:#888}
  .bf-btn-p{display:flex;align-items:center;gap:5px;padding:9px 18px;border:none;border-radius:8px;background:#2d9e8b;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;color:#fff;cursor:pointer;transition:all .15s}
  .bf-btn-p:hover{background:#268a79}

  .bf-grid{display:grid;grid-template-columns:1fr;gap:14px}
  .bf-card{background:#fff;border:none;border-radius:12px;padding:18px;cursor:pointer;transition:all .15s}
  .bf-card:hover{border-color:#d4e8e2;box-shadow:0 2px 8px rgba(45,158,139,.06)}
  .bf-card-head{display:flex;align-items:flex-start;gap:12px;margin-bottom:14px}
  .bf-card-ic{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .bf-card-info{flex:1;min-width:0}
  .bf-card-name{font-size:15px;font-weight:700;color:#222}
  .bf-card-provider{font-size:12px;color:#aaa;margin-top:1px}
  .bf-card-body{display:flex;flex-direction:column}
  .bf-enrolled-list{margin-top:8px;padding-top:8px;border-top:1px solid #f0f0f0;display:flex;flex-direction:column;gap:6px}
  .bf-enrolled-item{display:flex;align-items:center;gap:8px;padding:4px 0}
  .bf-enrolled-av{width:26px;height:26px;border-radius:6px;background:#edf8f5;color:#2d9e8b;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .bf-enrolled-info{display:flex;flex-direction:column;min-width:0}
  .bf-enrolled-name{font-size:12px;font-weight:600;color:#333}
  .bf-enrolled-dept{font-size:10px;color:#aaa}

  .bf-detail-employees{display:flex;flex-direction:column;gap:4px}
  .bf-detail-emp{display:flex;align-items:center;gap:10px;padding:8px 12px;background:#fafbfa;border:1px solid #f0f0f0;border-radius:8px}
  .bf-detail-emp-av{width:30px;height:30px;border-radius:7px;background:#edf8f5;color:#2d9e8b;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .bf-detail-emp-info{display:flex;flex-direction:column;min-width:0}
  .bf-detail-emp-name{font-size:13px;font-weight:600;color:#333}
  .bf-detail-emp-dept{font-size:11px;color:#aaa}
  .bf-detail-emp-enrolled{background:#f0fdf4;border-color:#bbf7d0}

  .bf-detail-tabs{display:flex;gap:0;padding:0;overflow-x:auto;justify-content:center;margin-bottom:16px}
  .bf-detail-tab{display:flex;align-items:center;gap:5px;padding:10px 14px;border:none;outline:none;background:none;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:500;color:#aaa;cursor:pointer;transition:all .15s;white-space:nowrap;-webkit-tap-highlight-color:transparent}
  .bf-detail-tab:focus{outline:none;box-shadow:none}
  .bf-detail-tab:hover{color:#666}
  .bf-detail-tab-a{color:#2d9e8b;font-weight:600}

  .bf-emp-badge{padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;margin-left:auto;flex-shrink:0}
  .bf-emp-badge-yes{background:#dcfce7;color:#16a34a}
  .bf-emp-badge-no{background:#f3f4f6;color:#999}
  .bf-card-row{display:flex;justify-content:space-between;padding:7px 0;font-size:13px;border-bottom:1px solid #f8f8f8}
  .bf-card-row:last-child{border-bottom:none}
  .bf-card-rl{color:#888}
  .bf-card-rv{font-weight:600;color:#333}

  .bf-badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}
  .bf-b-active{background:#e0faf1;color:#0d9488}
  .bf-b-inactive{background:#f3f4f6;color:#999}

  .bf-empty{text-align:center;padding:60px 20px}
  .bf-empty-ic{width:72px;height:72px;border-radius:50%;background:#fef2f2;color:#ef4444;display:flex;align-items:center;justify-content:center;margin:0 auto 16px}
  .bf-empty-t{font-size:18px;font-weight:700;color:#333;margin-bottom:6px}
  .bf-empty-d{font-size:13px;color:#999;max-width:340px;margin:0 auto}

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
  .ap-btn-danger{padding:9px 16px;border:1px solid #fecaca;border-radius:8px;background:#fef2f2;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;color:#ef4444;cursor:pointer;margin-right:auto}
  .ap-btn-danger:hover{background:#ef4444;color:#fff}
  .ap-modal-layout{display:flex;flex-direction:column;height:55vh;max-height:55vh}
  .ap-modal-scroll{flex:1;overflow-y:auto;padding:16px 0 0}
  .ap-modal-foot{flex-shrink:0;padding:16px 0 0;margin-top:auto}

  /* Tier view table */
  .bp-tier-table{border:1px solid #eee;border-radius:10px;overflow:hidden}
  .bp-tier-hdr{display:flex;background:#fafbfa;padding:8px 14px;border-bottom:1px solid #eee}
  .bp-tier-hc{flex:1;font-size:11px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:.03em}
  .bp-tier-row{display:flex;padding:12px 14px;border-bottom:1px solid #f5f5f5}
  .bp-tier-row:last-child{border-bottom:none}
  .bp-tier-name{flex:1;font-size:13px;font-weight:600;color:#333}
  .bp-tier-cost{flex:1;font-size:13px;color:#555}
  .bp-tier-none{font-size:13px;color:#ccc;text-align:center;padding:16px}

  /* Tier editor */
  .bp-tier-edit{border:1px solid #eee;border-radius:10px;padding:12px;margin-bottom:10px;background:#fafbfa}
  .bp-tier-edit-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
  .bp-tier-edit-num{font-size:11px;font-weight:700;color:#aaa;text-transform:uppercase}
  .bp-tier-edit-rm{width:22px;height:22px;border:1px solid #e0e0e0;border-radius:6px;background:#fff;cursor:pointer;font-size:12px;color:#999;display:flex;align-items:center;justify-content:center}
  .bp-tier-edit-rm:hover{background:#fef2f2;border-color:#fecaca;color:#ef4444}
  .bp-tier-edit-fields{display:flex;gap:10px}
  .bp-tier-edit-fields .ap-field{flex:1;margin-bottom:0}
  .bp-tier-add{display:flex;align-items:center;gap:5px;padding:8px 14px;border:1px dashed #d4e8e2;border-radius:8px;background:#fafffe;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:600;color:#2d9e8b;cursor:pointer;width:100%;justify-content:center;transition:all .15s}
  .bp-tier-add:hover{background:#edf8f5;border-color:#2d9e8b}

  @media(max-width:768px){.bf-grid{grid-template-columns:1fr}}
  @media(max-width:600px){.ap-modal-layout{max-height:65vh}.ap-fields{grid-template-columns:1fr}.bp-tier-edit-fields{flex-direction:column}}
`;
