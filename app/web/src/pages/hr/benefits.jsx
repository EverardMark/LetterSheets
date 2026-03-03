import { useState, useEffect } from "react";
import { I } from "../../layouts/ERPLayout";

/* ================================================================
   API HELPER
================================================================ */
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

    // Stats
    const totalMonthly = benefits.reduce((s, b) => {
        const tiers = b.tiers || [];
        const avgCost = tiers.length ? tiers.reduce((a, t) => a + (Number(t.employer_cost) || 0), 0) / tiers.length : 0;
        return s + toMonthly(avgCost, b.frequency);
    }, 0);
    const activeCount = benefits.filter(b => b.status !== "Inactive").length;
    const totalEnrolled = benefits.reduce((s, b) => s + (Number(b.enrolled) || 0), 0);

    return (<>
        <div className="bf-stats">
            {[
                { label:"Total Benefits",     value: benefits.length,                      icon:"heart",  color:"#2d9e8b" },
                { label:"Active Plans",       value: activeCount,                           icon:"check",  color:"#0ea5e9" },
                { label:"Total Enrollments",  value: totalEnrolled,                         icon:"users",  color:"#8b5cf6" },
                { label:"Monthly Cost (est.)",value: "₱"+Math.round(totalMonthly).toLocaleString(), icon:"peso", color:"#f59e0b" },
            ].map((s,i) => (
                <div key={i} className="bf-st">
                    <div className="bf-st-ic" style={{background:s.color+"14",color:s.color}}><I name={s.icon}/></div>
                    <div className="bf-st-v">{s.value}</div>
                    <div className="bf-st-l">{s.label}</div>
                </div>
            ))}
        </div>

        <div className="bf-bar">
            <span className="bf-bar-count">{benefits.length} benefit plans</span>
            <button className="bf-btn-p" onClick={openAdd}><I name="plus" size={14}/> Add Benefit</button>
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
                                <div className="bf-card-row"><span className="bf-card-rl">Enrolled</span><span className="bf-card-rv" style={{color:"#2d9e8b"}}>{b.enrolled||0}{employees.length>0?` / ${employees.length}`:""}</span></div>
                            </div>
                            <div className="bf-card-foot"><span>{typeName(b.type)}</span><span style={{color:"#2d9e8b",fontWeight:600}}>View →</span></div>
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
            mode={panel.mode}
            benefit={panel.benefit}
            idx={panel.idx}
            employees={employees}
            onClose={closePanel}
            onSave={saveBenefit}
            onDelete={deleteBenefit}
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

    useEffect(() => {
        if (benefit && (mode === "view" || mode === "edit")) {
            setForm({ ...benefit, tiers: [...(benefit.tiers || [])] });
        } else {
            setForm({ type: "health", frequency: "Monthly", status: "Active", tiers: [{ name: "Default", employer_cost: 0, employee_cost: 0 }] });
        }
        setCurrentMode(mode);
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

    return (<>
        <div className="bp-bg" onClick={onClose}/>
        <div className="bp-panel">
            {/* Header */}
            <div className="bp-head">
                {isAdd ? (
                    <div className="bp-head-simple">
                        <div>
                            <h2 className="bp-title">Add Benefit</h2>
                            <p className="bp-sub">Configure a new employee benefit plan</p>
                        </div>
                        <button className="bp-close" onClick={onClose}>✕</button>
                    </div>
                ) : (
                    <div className="bp-head-detail">
                        <div className="bp-head-top">
                            <div className="bp-avatar" style={{background: color + "20", color}}><I name={icon} size={22}/></div>
                            <div className="bp-head-info">
                                <h2 className="bp-name">{displayName}</h2>
                                <p className="bp-provider">{form.provider || "No provider set"}</p>
                                <div className="bp-tags">
                                    <span className={`bf-badge ${form.status === "Active" ? "bf-b-active" : "bf-b-inactive"}`}>{form.status || "Active"}</span>
                                    <span className="bp-tag-type">{typeName(form.type)}</span>
                                    {form.frequency && <span className="bp-tag-freq">{form.frequency}</span>}
                                    {tiers.length > 1 && <span className="bp-tag-freq">{tiers.length} tiers</span>}
                                </div>
                            </div>
                            <div className="bp-head-actions">
                                {isView && <button className="bp-btn-edit" onClick={switchToEdit}><I name="briefcase" size={13}/> Edit</button>}
                                {currentMode === "edit" && <button className="bp-btn-cancel-sm" onClick={switchToView}>Cancel</button>}
                                <button className="bp-close" onClick={onClose}>✕</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Body */}
            <div className="bp-body">
                {isView ? (
                    /* ---- VIEW MODE ---- */
                    <>
                        <div className="bp-section">
                            <h4 className="bp-sec-title">Benefit Details</h4>
                            {[
                                { label: "Type", value: typeName(form.type) },
                                { label: "Name", value: form.name },
                                { label: "Provider", value: form.provider },
                                { label: "Coverage", value: form.coverage },
                                { label: "Frequency", value: form.frequency },
                                { label: "Enrolled", value: form.enrolled ? `${form.enrolled}${employees.length > 0 ? ` / ${employees.length}` : ""} employees` : null },
                            ].filter(r => r.value).map((r, i) => (
                                <div key={i} className="bp-view-row">
                                    <span className="bp-view-l">{r.label}</span>
                                    <span className="bp-view-v">{r.value}</span>
                                </div>
                            ))}
                        </div>

                        <div className="bp-section">
                            <h4 className="bp-sec-title">Tiers & Costs</h4>
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
                            <div className="bp-section">
                                <h4 className="bp-sec-title">Additional Info</h4>
                                {[
                                    { label: "Eligibility", value: form.eligibility },
                                    { label: "Notes", value: form.description },
                                ].filter(r => r.value).map((r, i) => (
                                    <div key={i} className="bp-view-row">
                                        <span className="bp-view-l">{r.label}</span>
                                        <span className="bp-view-v">{r.value}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    /* ---- ADD / EDIT MODE ---- */
                    <>
                        <div className="bp-section">
                            <h4 className="bp-sec-title">Benefit Details</h4>
                            <div className="bp-fields">
                                <div className="bp-field">
                                    <label className="bp-label">Benefit Type <span className="bp-req">*</span></label>
                                    <select className="bp-input" value={form.type||""} onChange={e=>set("type",e.target.value)}>
                                        {BENEFIT_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
                                    </select>
                                </div>
                                <div className="bp-field">
                                    <label className="bp-label">Benefit Name</label>
                                    <input className="bp-input" value={form.name||""} onChange={e=>set("name",e.target.value)} placeholder={typeName(form.type)}/>
                                </div>
                                <div className="bp-field">
                                    <label className="bp-label">Provider / Carrier</label>
                                    <input className="bp-input" value={form.provider||""} onChange={e=>set("provider",e.target.value)} placeholder="e.g. Maxicare, Sun Life"/>
                                </div>
                                <div className="bp-field">
                                    <label className="bp-label">Status</label>
                                    <select className="bp-input" value={form.status||"Active"} onChange={e=>set("status",e.target.value)}>
                                        <option value="Active">Active</option><option value="Inactive">Inactive</option><option value="Pending">Pending</option>
                                    </select>
                                </div>
                                <div className="bp-field bp-field-full">
                                    <label className="bp-label">Coverage Description</label>
                                    <input className="bp-input" value={form.coverage||""} onChange={e=>set("coverage",e.target.value)} placeholder="e.g. Employee + Dependents, ₱1M coverage"/>
                                </div>
                                <div className="bp-field">
                                    <label className="bp-label">Frequency</label>
                                    <select className="bp-input" value={form.frequency||"Monthly"} onChange={e=>set("frequency",e.target.value)}>
                                        {FREQUENCIES.map(f=><option key={f} value={f}>{f}</option>)}
                                    </select>
                                </div>
                                <div className="bp-field">
                                    <label className="bp-label">Enrolled Employees</label>
                                    <input className="bp-input" type="number" value={form.enrolled||""} onChange={e=>set("enrolled",e.target.value)} placeholder="0"/>
                                </div>
                            </div>
                        </div>

                        <div className="bp-section">
                            <h4 className="bp-sec-title">Tiers & Costs <span className="bp-req">*</span></h4>
                            <p className="bp-sec-desc">Add one or more tiers with different cost levels (e.g. Basic, Premium, Family).</p>

                            {tiers.map((t, i) => (
                                <div key={i} className="bp-tier-edit">
                                    <div className="bp-tier-edit-head">
                                        <span className="bp-tier-edit-num">Tier {i + 1}</span>
                                        {tiers.length > 1 && (
                                            <button className="bp-tier-edit-rm" onClick={() => removeTier(i)}>✕</button>
                                        )}
                                    </div>
                                    <div className="bp-tier-edit-fields">
                                        <div className="bp-field" style={{flex:2}}>
                                            <label className="bp-label">Tier Name</label>
                                            <input className="bp-input" value={t.name||""} onChange={e=>setTier(i,"name",e.target.value)} placeholder={tiers.length === 1 ? "Default" : `e.g. ${["Basic","Premium","Family"][i] || "Tier "+(i+1)}`}/>
                                        </div>
                                        <div className="bp-field">
                                            <label className="bp-label">Employer ₱</label>
                                            <input className="bp-input" type="number" value={t.employer_cost||""} onChange={e=>setTier(i,"employer_cost",e.target.value)} placeholder="0"/>
                                        </div>
                                        <div className="bp-field">
                                            <label className="bp-label">Employee ₱</label>
                                            <input className="bp-input" type="number" value={t.employee_cost||""} onChange={e=>setTier(i,"employee_cost",e.target.value)} placeholder="0"/>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            <button className="bp-tier-add" onClick={addTier}><I name="plus" size={13}/> Add Tier</button>
                        </div>

                        <div className="bp-section">
                            <h4 className="bp-sec-title">Additional Information</h4>
                            <div className="bp-fields">
                                <div className="bp-field bp-field-full">
                                    <label className="bp-label">Eligibility Requirements</label>
                                    <textarea className="bp-input bp-textarea" value={form.eligibility||""} onChange={e=>set("eligibility",e.target.value)} placeholder="e.g. After 6 months, regular employees only" rows={2}/>
                                </div>
                                <div className="bp-field bp-field-full">
                                    <label className="bp-label">Notes / Description</label>
                                    <textarea className="bp-input bp-textarea" value={form.description||""} onChange={e=>set("description",e.target.value)} placeholder="Additional details..." rows={2}/>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Footer */}
            <div className="bp-foot">
                <div className="bp-foot-btns">
                    {isView ? (<>
                        {onDelete && <button className="bp-btn-danger" onClick={() => onDelete(idx)}>Delete</button>}
                        <button className="bp-btn-primary" onClick={switchToEdit}><I name="briefcase" size={13}/> Edit Benefit</button>
                    </>) : (<>
                        <button className="bp-btn-cancel" onClick={currentMode === "edit" ? switchToView : onClose}>Cancel</button>
                        <button className="bp-btn-primary" onClick={handleSave}>{isAdd ? "Add Benefit" : "Save Changes"}</button>
                    </>)}
                </div>
            </div>
        </div>
    </>);
}

/* ================================================================
   STYLES
================================================================ */
const benefitsCSS = `
  .bf-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px}
  .bf-st{background:#fff;border:1px solid #eee;border-radius:12px;padding:16px;transition:border-color .15s}
  .bf-st:hover{border-color:#d4e8e2}
  .bf-st-ic{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;margin-bottom:10px}
  .bf-st-v{font-size:24px;font-weight:700;color:#222}
  .bf-st-l{font-size:12px;color:#999;margin-top:2px}

  .bf-bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px}
  .bf-bar-count{font-size:13px;color:#888}
  .bf-btn-p{display:flex;align-items:center;gap:5px;padding:9px 18px;border:none;border-radius:8px;background:#2d9e8b;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;color:#fff;cursor:pointer;transition:all .15s}
  .bf-btn-p:hover{background:#268a79}

  .bf-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
  .bf-card{background:#fff;border:1px solid #eee;border-radius:12px;padding:18px;border-top:3px solid;cursor:pointer;transition:all .15s}
  .bf-card:hover{border-color:#d4e8e2;box-shadow:0 2px 8px rgba(45,158,139,.06)}
  .bf-card-head{display:flex;align-items:flex-start;gap:12px;margin-bottom:14px}
  .bf-card-ic{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .bf-card-info{flex:1;min-width:0}
  .bf-card-name{font-size:15px;font-weight:700;color:#222}
  .bf-card-provider{font-size:12px;color:#aaa;margin-top:1px}
  .bf-card-body{display:flex;flex-direction:column}
  .bf-card-row{display:flex;justify-content:space-between;padding:7px 0;font-size:13px;border-bottom:1px solid #f8f8f8}
  .bf-card-row:last-child{border-bottom:none}
  .bf-card-rl{color:#888}
  .bf-card-rv{font-weight:600;color:#333}
  .bf-card-foot{display:flex;justify-content:space-between;margin-top:12px;padding-top:10px;border-top:1px solid #f3f3f3;font-size:11px;color:#bbb}
  .bf-badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}
  .bf-b-active{background:#e0faf1;color:#0d9488}
  .bf-b-inactive{background:#f3f4f6;color:#999}

  .bf-empty{text-align:center;padding:60px 20px}
  .bf-empty-ic{width:72px;height:72px;border-radius:50%;background:#fef2f2;color:#ef4444;display:flex;align-items:center;justify-content:center;margin:0 auto 16px}
  .bf-empty-t{font-size:18px;font-weight:700;color:#333;margin-bottom:6px}
  .bf-empty-d{font-size:13px;color:#999;max-width:340px;margin:0 auto}

  .bp-bg{position:fixed;inset:0;background:rgba(0,0,0,.3);z-index:300;animation:bpFade .15s}
  @keyframes bpFade{from{opacity:0}to{opacity:1}}
  @keyframes bpSlide{from{transform:translateX(100%)}to{transform:translateX(0)}}
  .bp-panel{position:fixed;top:0;right:0;bottom:0;width:560px;max-width:100vw;background:#fff;z-index:301;display:flex;flex-direction:column;animation:bpSlide .2s ease-out;box-shadow:-4px 0 24px rgba(0,0,0,.08)}

  .bp-head{border-bottom:1px solid #eee}
  .bp-head-simple{display:flex;justify-content:space-between;align-items:flex-start;padding:20px 24px}
  .bp-title{font-size:20px;font-weight:700;color:#222}
  .bp-sub{font-size:12px;color:#2d9e8b;margin-top:3px}
  .bp-head-detail{padding:0}
  .bp-head-top{display:flex;gap:14px;padding:20px 24px 16px;align-items:flex-start}
  .bp-avatar{width:52px;height:52px;border-radius:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .bp-head-info{flex:1;min-width:0}
  .bp-name{font-size:20px;font-weight:700;color:#222}
  .bp-provider{font-size:13px;color:#888;margin-top:2px}
  .bp-tags{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
  .bp-tag-type{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#edf8f5;color:#2d9e8b}
  .bp-tag-freq{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#f3f4f6;color:#888}
  .bp-head-actions{display:flex;gap:6px;align-items:center;flex-shrink:0}
  .bp-btn-edit{display:flex;align-items:center;gap:4px;padding:6px 12px;border:1px solid #d4e8e2;border-radius:6px;background:#edf8f5;font-family:'DM Sans',sans-serif;font-size:11px;font-weight:600;color:#2d9e8b;cursor:pointer;transition:all .12s}
  .bp-btn-edit:hover{background:#2d9e8b;color:#fff}
  .bp-btn-cancel-sm{padding:6px 12px;border:1px solid #e0e0e0;border-radius:6px;background:#fff;font-family:'DM Sans',sans-serif;font-size:11px;font-weight:500;color:#888;cursor:pointer}
  .bp-btn-cancel-sm:hover{background:#f5f5f5}
  .bp-close{width:32px;height:32px;border-radius:8px;border:1px solid #eee;background:#fff;cursor:pointer;font-size:16px;color:#999;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .bp-close:hover{background:#f5f5f5;color:#333}

  .bp-body{flex:1;overflow-y:auto;padding:20px 24px}
  .bp-section{margin-bottom:20px}
  .bp-sec-title{font-size:13px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px}
  .bp-sec-desc{font-size:12px;color:#bbb;margin:-6px 0 12px}
  .bp-req{color:#ef4444}

  .bp-view-row{display:flex;justify-content:space-between;align-items:center;padding:13px 0;border-bottom:1px solid #f5f5f5}
  .bp-view-row:last-child{border-bottom:none}
  .bp-view-l{font-size:13px;color:#888}
  .bp-view-v{font-size:14px;font-weight:600;color:#222;text-align:right;max-width:60%;word-break:break-word}

  .bp-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .bp-field{display:flex;flex-direction:column}
  .bp-field-full{grid-column:1/-1}
  .bp-label{font-size:12px;font-weight:600;color:#666;margin-bottom:5px}
  .bp-input{width:100%;padding:9px 12px;border:1px solid #e0e0e0;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:13px;color:#333;outline:none;transition:border-color .15s;background:#fff;box-sizing:border-box}
  .bp-input:focus{border-color:#2d9e8b;box-shadow:0 0 0 2px rgba(45,158,139,.1)}
  .bp-textarea{resize:vertical;min-height:56px}
  select.bp-input{appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;padding-right:28px;cursor:pointer}

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
  .bp-tier-edit-fields .bp-field{flex:1;margin-bottom:0}
  .bp-tier-add{display:flex;align-items:center;gap:5px;padding:8px 14px;border:1px dashed #d4e8e2;border-radius:8px;background:#fafffe;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:600;color:#2d9e8b;cursor:pointer;width:100%;justify-content:center;transition:all .15s}
  .bp-tier-add:hover{background:#edf8f5;border-color:#2d9e8b}

  .bp-foot{padding:16px 24px;border-top:1px solid #eee;background:#fafbfa}
  .bp-foot-btns{display:flex;justify-content:flex-end;gap:8px}
  .bp-btn-cancel{padding:9px 18px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;color:#666;cursor:pointer}
  .bp-btn-cancel:hover{background:#f5f5f5}
  .bp-btn-primary{display:flex;align-items:center;gap:5px;padding:9px 22px;border:none;border-radius:8px;background:#2d9e8b;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;color:#fff;cursor:pointer;transition:all .15s}
  .bp-btn-primary:hover{background:#268a79}
  .bp-btn-danger{padding:9px 16px;border:1px solid #fecaca;border-radius:8px;background:#fef2f2;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;color:#ef4444;cursor:pointer;margin-right:auto}
  .bp-btn-danger:hover{background:#ef4444;color:#fff}

  @media(max-width:768px){.bf-grid{grid-template-columns:1fr}.bf-stats{grid-template-columns:repeat(2,1fr)}}
  @media(max-width:600px){.bp-panel{width:100vw}.bp-fields{grid-template-columns:1fr}.bp-tier-edit-fields{flex-direction:column}}
`;
