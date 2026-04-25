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
    return res.json();
}

/* ================================================================
   LOCAL PERSISTENCE — fallback when API is unavailable
================================================================ */
const LS_KEY = "ls_compliance_agencies";

function lsSave(agencies) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(agencies)); } catch {}
}

function lsLoad() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) return JSON.parse(raw);
    } catch {}
    return null;
}

/* ================================================================
   FALLBACK TEMPLATES — used until backend is wired
================================================================ */
const FALLBACK_TEMPLATES = [
    { code:"PH", name:"Philippines", currency:"₱", agencies:[
            { name:"SSS", fullName:"Social Security System", color:"#0ea5e9", frequency:"Monthly", website:"https://www.sss.gov.ph",
                fields:[{key:"employer",label:"Employer Share",type:"currency"},{key:"employee",label:"Employee Share",type:"currency"}] },
            { name:"PhilHealth", fullName:"Philippine Health Insurance Corporation", color:"#22c55e", frequency:"Monthly", website:"https://www.philhealth.gov.ph",
                fields:[{key:"employer",label:"Employer Share",type:"currency"},{key:"employee",label:"Employee Share",type:"currency"}] },
            { name:"Pag-IBIG", fullName:"Home Development Mutual Fund", color:"#f59e0b", frequency:"Monthly", website:"https://www.pagibigfund.gov.ph",
                fields:[{key:"employer",label:"Employer Share",type:"currency"},{key:"employee",label:"Employee Share",type:"currency"}] },
            { name:"BIR", fullName:"Bureau of Internal Revenue", color:"#ef4444", frequency:"Quarterly", website:"https://www.bir.gov.ph",
                fields:[{key:"withheld",label:"Withholding Tax",type:"currency"},{key:"filed",label:"Last Filing",type:"text"}] },
        ]},
    { code:"US", name:"United States", currency:"$", agencies:[
            { name:"IRS", fullName:"Internal Revenue Service", color:"#0ea5e9", frequency:"Quarterly", website:"https://www.irs.gov",
                fields:[{key:"federal_withheld",label:"Federal Income Tax Withheld",type:"currency"},{key:"form",label:"Filing Form",type:"text"}] },
            { name:"SSA", fullName:"Social Security Administration", color:"#22c55e", frequency:"Monthly", website:"https://www.ssa.gov",
                fields:[{key:"employer",label:"Employer Share (6.2%)",type:"currency"},{key:"employee",label:"Employee Share (6.2%)",type:"currency"}] },
            { name:"Medicare", fullName:"Centers for Medicare & Medicaid", color:"#8b5cf6", frequency:"Monthly", website:"https://www.cms.gov",
                fields:[{key:"employer",label:"Employer Share (1.45%)",type:"currency"},{key:"employee",label:"Employee Share (1.45%)",type:"currency"}] },
            { name:"FUTA", fullName:"Federal Unemployment Tax Act", color:"#f59e0b", frequency:"Quarterly", website:"https://www.irs.gov",
                fields:[{key:"employer",label:"Employer Tax (6.0%)",type:"currency"}] },
            { name:"State Tax", fullName:"State Income Tax", color:"#ef4444", frequency:"Quarterly", website:"",
                fields:[{key:"withheld",label:"Withheld",type:"currency"},{key:"state",label:"State",type:"text"}] },
        ]},
    { code:"SG", name:"Singapore", currency:"S$", agencies:[
            { name:"CPF", fullName:"Central Provident Fund", color:"#0ea5e9", frequency:"Monthly", website:"https://www.cpf.gov.sg",
                fields:[{key:"employer",label:"Employer Share (17%)",type:"currency"},{key:"employee",label:"Employee Share (20%)",type:"currency"}] },
            { name:"IRAS", fullName:"Inland Revenue Authority of Singapore", color:"#ef4444", frequency:"Yearly", website:"https://www.iras.gov.sg",
                fields:[{key:"withheld",label:"Tax Withheld",type:"currency"},{key:"period",label:"Filing Period",type:"text"}] },
            { name:"SDL", fullName:"Skills Development Levy", color:"#f59e0b", frequency:"Monthly", website:"https://www.ssg.gov.sg",
                fields:[{key:"employer",label:"Employer Levy (0.25%)",type:"currency"}] },
        ]},
    { code:"UK", name:"United Kingdom", currency:"£", agencies:[
            { name:"HMRC", fullName:"HM Revenue & Customs", color:"#0ea5e9", frequency:"Monthly", website:"https://www.gov.uk/hmrc",
                fields:[{key:"paye",label:"PAYE Withheld",type:"currency"},{key:"period",label:"Filing Period",type:"text"}] },
            { name:"NI", fullName:"National Insurance", color:"#22c55e", frequency:"Monthly", website:"https://www.gov.uk/national-insurance",
                fields:[{key:"employer",label:"Employer NIC (13.8%)",type:"currency"},{key:"employee",label:"Employee NIC (12%)",type:"currency"}] },
            { name:"Pension", fullName:"Workplace Pension", color:"#8b5cf6", frequency:"Monthly", website:"",
                fields:[{key:"employer",label:"Employer (3%)",type:"currency"},{key:"employee",label:"Employee (5%)",type:"currency"}] },
        ]},
    { code:"IN", name:"India", currency:"₹", agencies:[
            { name:"PF", fullName:"Employees' Provident Fund Organisation", color:"#0ea5e9", frequency:"Monthly", website:"https://www.epfindia.gov.in",
                fields:[{key:"employer",label:"Employer Share (12%)",type:"currency"},{key:"employee",label:"Employee Share (12%)",type:"currency"}] },
            { name:"ESI", fullName:"Employees' State Insurance", color:"#22c55e", frequency:"Monthly", website:"https://www.esic.gov.in",
                fields:[{key:"employer",label:"Employer (3.25%)",type:"currency"},{key:"employee",label:"Employee (0.75%)",type:"currency"}] },
            { name:"TDS", fullName:"Tax Deducted at Source", color:"#ef4444", frequency:"Monthly", website:"https://www.incometax.gov.in",
                fields:[{key:"withheld",label:"Tax Withheld",type:"currency"}] },
            { name:"PT", fullName:"Professional Tax", color:"#f59e0b", frequency:"Monthly", website:"",
                fields:[{key:"deducted",label:"Deducted",type:"currency"},{key:"state",label:"State",type:"text"}] },
        ]},
    { code:"CUSTOM", name:"Custom", currency:"", agencies:[] },
];

const frequencies = ["Monthly", "Quarterly", "Semi-Annual", "Yearly"];
const defaultColors = ["#0ea5e9","#22c55e","#8b5cf6","#f59e0b","#ef4444","#ec4899","#6366f1","#14b8a6"];

/* ================================================================
   MAIN COMPONENT
================================================================ */
export default function ComplianceTab({ agencies, setAgencies, currency = "₱" }) {
    const [mode, setMode] = useState(agencies.length > 0 ? "dashboard" : "setup");
    const [panel, setPanel] = useState({ open: false, mode: "view", idx: -1 });
    const [toast, setToast] = useState(null);

    const showToast = (msg, ok = true) => {
        setToast({ msg, ok });
        setTimeout(() => setToast(null), 2500);
    };

    // Load company agencies on mount
    useEffect(() => {
        loadAgencies();
    }, []);

    async function loadAgencies() {
        try {
            const data = await api("get_compliance_agencies");
            const assembled = assembleAgencies(data);
            if (assembled.length > 0) {
                setAgencies(assembled);
                lsSave(assembled);
                setMode("dashboard");
                return;
            }
        } catch {
            // API not ready — try localStorage
        }
        const cached = lsLoad();
        if (cached && cached.length > 0) {
            setAgencies(cached);
            setMode("dashboard");
        }
    }

    // Apply template
    async function applyTemplate(templateCode) {
        const tmpl = FALLBACK_TEMPLATES.find(t => t.code === templateCode);
        if (!tmpl) return;

        const newAgencies = tmpl.agencies.map(a => ({
            ...a,
            status: "Not Filed",
            dueDate: "",
            lastFiled: "",
            values: Object.fromEntries(a.fields.map(f => [f.key, ""])),
        }));

        setAgencies(newAgencies);
        lsSave(newAgencies);
        setMode("dashboard");

        // Try API too (non-blocking)
        try {
            await api("apply_compliance_template", { template_code: templateCode });
        } catch {
            // Fine — local state is already set
        }
    }

    // Save agency
    async function saveAgency(agencyData, isNew, idx) {
        let next;
        if (isNew) {
            next = [...agencies, agencyData];
        } else {
            next = [...agencies];
            next[idx] = agencyData;
        }
        setAgencies(next);
        lsSave(next);
        showToast("Agency saved");

        // Try API too
        try {
            const action = isNew ? "create_compliance_agency" : "update_compliance_agency";
            await api(action, {
                ...(isNew ? {} : { agency_id: agencyData.id }),
                name: agencyData.name,
                full_name: agencyData.fullName,
                color: agencyData.color,
                frequency: agencyData.frequency,
                website: agencyData.website || "",
                status: agencyData.status || "Not Filed",
                due_date: agencyData.dueDate || null,
                last_filed: agencyData.lastFiled || null,
                fields: agencyData.fields.map(f => ({
                    key: f.key || f.field_key,
                    label: f.label,
                    type: f.type || f.field_type || "currency",
                })),
            });
        } catch {
            // Local state already updated and persisted to localStorage
        }
    }

    // Delete agency
    async function deleteAgency(idx) {
        const removed = agencies[idx];
        const next = agencies.filter((_, i) => i !== idx);
        setAgencies(next);
        lsSave(next);
        showToast("Agency deleted");
        try {
            if (removed.id) await api("delete_compliance_agency", { agency_id: removed.id });
        } catch {}
    }

    // ---- SETUP MODE ----
    const closePanel = () => setPanel({ open: false, mode: "view", idx: -1 });
    const panelAgency = panel.open && panel.mode !== "add" && panel.idx >= 0 ? agencies[panel.idx] : null;
    const blankAgency = {
        name: "", fullName: "", color: defaultColors[agencies.length % defaultColors.length],
        frequency: "Monthly", website: "",
        fields: [{ label: "Amount", key: "amount", type: "currency" }],
        status: "Not Filed", dueDate: "", lastFiled: "",
        values: { amount: "" },
    };

    if (mode === "setup") {
        return <Setup onSelect={applyTemplate} />;
    }

    // ---- DASHBOARD ----
    return (
        <div className="c-wrap">
            {toast && (
                <div style={{
                    position: "fixed", bottom: 24, right: 24, zIndex: 9999,
                    padding: "10px 18px", borderRadius: 10, fontFamily: "'DM Sans',sans-serif",
                    fontSize: 13, fontWeight: 600, color: "#fff",
                    background: toast.ok ? "#2d9e8b" : "#ef4444",
                    boxShadow: "0 4px 16px rgba(0,0,0,.15)",
                    animation: "fadeInUp .2s ease"
                }}>{toast.msg}</div>
            )}
            <div className="c-bar">
                <span className="c-bar-count">{agencies.length} agencies configured</span>
                <div className="c-bar-btns">
                    <button className="c-btn-sec" onClick={() => setPanel({ open: true, mode: "add", idx: -1 })}><I name="shield" size={14}/> Add Agency</button>
                    <button className="c-btn-sec c-btn-reset" onClick={() => setMode("setup")}><I name="grid" size={14}/> Change Template</button>
                </div>
            </div>

            <div className="c-grid">
                {agencies.map((a, i) => (
                    <div key={i} className="c-card" style={{ borderTopColor: a.color, cursor:"pointer" }} onClick={() => setPanel({ open: true, mode: "view", idx: i })}>
                        <div className="c-card-head">
                            <div>
                                <div className="c-card-name">{a.name}</div>
                                <div className="c-card-full">{a.fullName}</div>
                            </div>
                            <div className="c-card-actions">
                                <span className={`c-badge ${badgeClass(a.status)}`}>{a.status}</span>
                                <button className="c-card-edit" onClick={(e) => { e.stopPropagation(); setPanel({ open: true, mode: "edit", idx: i }); }}>Edit</button>
                            </div>
                        </div>
                        {a.fields.map((f, j) => (
                            <div key={j} className="c-card-row">
                                <span className="c-card-rl">{f.label}</span>
                                <span className="c-card-rv">{f.type === "currency" && currency}{a.values?.[f.key] || "—"}</span>
                            </div>
                        ))}
                        <div className="c-card-foot">
                            <span>Frequency: {a.frequency}</span>
                            <span>Due: {a.dueDate || "—"}</span>
                            <span>Last: {a.lastFiled || "—"}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* View Modal */}
            {panel.open && panel.mode === "view" && panelAgency && (
                <Modal
                    title={panelAgency.name}
                    subtitle={panelAgency.fullName}
                    onClose={closePanel}
                >
                    <div className="ap-modal-layout">
                        <div className="ap-modal-scroll">
                            <div className="ap-section">
                                <h4 className="ap-sec-title">Agency Details</h4>
                                <div className="ap-fields">
                                    <div className="ap-field">
                                        <label className="ap-label">Short Name</label>
                                        <input className="ap-input" value={panelAgency.name} disabled />
                                    </div>
                                    <div className="ap-field">
                                        <label className="ap-label">Status</label>
                                        <span className={`c-badge ${badgeClass(panelAgency.status)}`}>{panelAgency.status}</span>
                                    </div>
                                    {panelAgency.fullName && <div className="ap-field ap-field-full">
                                        <label className="ap-label">Full Name</label>
                                        <input className="ap-input" value={panelAgency.fullName} disabled />
                                    </div>}
                                    <div className="ap-field">
                                        <label className="ap-label">Frequency</label>
                                        <input className="ap-input" value={panelAgency.frequency} disabled />
                                    </div>
                                    {panelAgency.website && <div className="ap-field">
                                        <label className="ap-label">Website</label>
                                        <input className="ap-input" value={panelAgency.website} disabled />
                                    </div>}
                                    {panelAgency.dueDate && <div className="ap-field">
                                        <label className="ap-label">Due Date</label>
                                        <input className="ap-input" value={panelAgency.dueDate} disabled />
                                    </div>}
                                    {panelAgency.lastFiled && <div className="ap-field">
                                        <label className="ap-label">Last Filed</label>
                                        <input className="ap-input" value={panelAgency.lastFiled} disabled />
                                    </div>}
                                </div>
                            </div>

                            {panelAgency.fields?.length > 0 && (
                                <div className="ap-section">
                                    <h4 className="ap-sec-title">Contributions</h4>
                                    <div className="ap-fields">
                                        {panelAgency.fields.map((f, j) => (
                                            <div key={j} className="ap-field">
                                                <label className="ap-label">{f.label}</label>
                                                <input className="ap-input" value={`${f.type === "currency" ? currency : ""}${panelAgency.values?.[f.key] || "—"}${f.type === "percent" ? "%" : ""}`} disabled />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="ap-modal-foot">
                            <div className="ap-foot-btns">
                                <button className="ap-btn-danger" onClick={() => { deleteAgency(panel.idx); closePanel(); }}>Delete</button>
                                <button className="ap-btn-primary" onClick={() => setPanel({ ...panel, mode: "edit" })}><I name="edit-2" size={13}/> Edit</button>
                            </div>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Edit Modal */}
            {panel.open && panel.mode === "edit" && panelAgency && (
                <Modal
                    title={`Edit: ${panelAgency.name}`}
                    subtitle={panelAgency.fullName}
                    onClose={closePanel}
                >
                    <AgencyEditor
                        agency={panelAgency}
                        currency={currency}
                        onSave={(updated) => { saveAgency(updated, false, panel.idx); closePanel(); }}
                        onDelete={() => { deleteAgency(panel.idx); closePanel(); }}
                        onCancel={closePanel}
                    />
                </Modal>
            )}

            {/* Add Modal */}
            {panel.open && panel.mode === "add" && (
                <Modal
                    title="Add Agency"
                    subtitle="Configure a new compliance agency"
                    onClose={closePanel}
                >
                    <AgencyEditor
                        agency={blankAgency}
                        currency={currency}
                        isNew
                        onSave={(created) => { saveAgency(created, true, -1); closePanel(); }}
                        onCancel={closePanel}
                    />
                </Modal>
            )}

            <style>{complianceCSS}</style>
        </div>
    );
}

/* ================================================================
   ASSEMBLE — Join agencies + fields + values from API response
================================================================ */
function assembleAgencies(data) {
    const { agencies = [], fields = [], values = [] } = data;
    const fieldMap = {};
    for (const f of fields) { if (!fieldMap[f.agency_id]) fieldMap[f.agency_id] = []; fieldMap[f.agency_id].push(f); }
    const valueMap = {};
    for (const v of values) { if (!valueMap[v.field_id]) valueMap[v.field_id] = v; }
    return agencies.map(a => ({
        id: a.id, name: a.name, fullName: a.full_name, color: a.color,
        frequency: a.frequency, website: a.website, status: a.status,
        dueDate: a.due_date || "", lastFiled: a.last_filed || "",
        fields: (fieldMap[a.id] || []).map(f => ({ id: f.id, key: f.field_key, label: f.label, type: f.field_type })),
        values: Object.fromEntries((fieldMap[a.id] || []).map(f => [f.field_key, valueMap[f.id]?.value_encrypted || ""])),
    }));
}

/* ================================================================
   SETUP — Country template picker
================================================================ */
function Setup({ onSelect }) {
    const [templates, setTemplates] = useState(FALLBACK_TEMPLATES);
    const [selected, setSelected] = useState(null);
    const [preview, setPreview] = useState(null);

    // Try loading from API, fall back silently
    useEffect(() => {
        (async () => {
            try {
                const data = await api("get_compliance_templates");
                const assembled = assembleTemplates(data);
                if (assembled.length > 0) setTemplates(assembled);
            } catch {
                // API not ready — using fallback templates
            }
        })();
    }, []);

    return (
        <div className="c-setup">
            <div className="c-setup-ic"><I name="shield" size={32}/></div>
            <h2 className="c-setup-t">Configure Compliance</h2>
            <p className="c-setup-d">Select your country to load statutory requirements, or start from scratch.</p>

            <div className="c-tmpl-grid">
                {templates.map((tmpl) => (
                    <div
                        key={tmpl.code}
                        className={`c-tmpl ${selected === tmpl.code ? "c-tmpl-on" : ""}`}
                        onClick={() => { setSelected(tmpl.code); setPreview(tmpl); }}
                    >
                        <div className="c-tmpl-name">{tmpl.name}</div>
                        <div className="c-tmpl-count">
                            {tmpl.code === "CUSTOM" ? "Start empty" : `${tmpl.agencies.length} agencies`}
                        </div>
                        {tmpl.code !== "CUSTOM" && (
                            <div className="c-tmpl-tags">
                                {tmpl.agencies.map((a, i) => (
                                    <span key={i} className="c-tmpl-tag" style={{ background: a.color + "14", color: a.color }}>{a.name}</span>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {preview && selected !== "CUSTOM" && (
                <div className="c-preview">
                    <h3 className="c-preview-t">{preview.name} — {preview.agencies.length} agencies</h3>
                    <div className="c-preview-list">
                        {preview.agencies.map((a, i) => (
                            <div key={i} className="c-preview-item">
                                <span className="c-preview-dot" style={{ background: a.color }}/>
                                <div>
                                    <div className="c-preview-name">{a.name}</div>
                                    <div className="c-preview-full">{a.fullName}</div>
                                    <div className="c-preview-meta">{a.frequency} · {a.fields.map(f => f.label).join(", ")}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="c-preview-note">You can add, remove, or edit agencies after import.</p>
                </div>
            )}

            <button
                className="c-btn-p"
                disabled={!selected}
                onClick={() => selected && onSelect(selected)}
            >
                {selected === "CUSTOM" ? "Start with Empty Configuration" : selected ? `Use ${templates.find(t=>t.code===selected)?.name} Template` : "Select a Country"}
            </button>

            <style>{complianceCSS}</style>
        </div>
    );
}

/* ================================================================
   ASSEMBLE TEMPLATES from API
================================================================ */
function assembleTemplates(data) {
    const { templates = [], agencies = [], fields = [] } = data;
    const fieldMap = {};
    for (const f of fields) { if (!fieldMap[f.agency_id]) fieldMap[f.agency_id] = []; fieldMap[f.agency_id].push(f); }
    const agencyMap = {};
    for (const a of agencies) {
        if (!agencyMap[a.template_id]) agencyMap[a.template_id] = [];
        agencyMap[a.template_id].push({
            name: a.name, fullName: a.full_name, color: a.color, frequency: a.frequency, website: a.website,
            fields: (fieldMap[a.id] || []).map(f => ({ key: f.field_key, label: f.label, type: f.field_type })),
        });
    }
    return templates.map(t => ({ code: t.code, name: t.name, currency: t.currency_symbol || "", agencies: agencyMap[t.id] || [] }));
}

/* ================================================================
   AGENCY EDITOR
================================================================ */
function AgencyEditor({ agency, currency, isNew, onSave, onDelete, onCancel }) {
    const [form, setForm] = useState({ ...agency });
    const [fields, setFields] = useState([...(agency.fields || [])]);
    const [values, setValues] = useState({ ...(agency.values || {}) });

    const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

    const addField = () => {
        const key = "field_" + Date.now();
        setFields([...fields, { label: "", key, type: "currency" }]);
        setValues(prev => ({ ...prev, [key]: "" }));
    };

    const removeField = (idx) => {
        const f = fields[idx];
        setFields(fields.filter((_, i) => i !== idx));
        setValues(prev => { const n = { ...prev }; delete n[f.key]; return n; });
    };

    const updateField = (idx, k, v) => {
        const next = [...fields];
        if (k === "label") {
            const oldKey = next[idx].key;
            // Only auto-rename key for brand-new fields (key starts with "field_")
            const isAutoKey = oldKey.startsWith("field_");
            if (isAutoKey) {
                const autoKey = v.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || oldKey;
                next[idx] = { ...next[idx], label: v, key: autoKey };
                if (autoKey !== oldKey) {
                    setValues(prev => {
                        const n = { ...prev };
                        n[autoKey] = n[oldKey] || "";
                        delete n[oldKey];
                        return n;
                    });
                } else {
                    setFields(next);
                    return;
                }
            } else {
                // Preserve stable key for existing fields
                next[idx] = { ...next[idx], label: v };
            }
        } else {
            next[idx] = { ...next[idx], [k]: v };
        }
        setFields(next);
    };

    const save = () => {
        if (!form.name.trim()) return;
        onSave({ ...form, fields, values });
    };

    return (
        <div className="ap-modal-layout">
            <div className="ap-modal-scroll">
                <div className="ap-section">
                    <h4 className="ap-sec-title">Agency Details</h4>
                    <div className="c-editor-grid">
                        <div className="c-field"><label className="c-label">Short Name <span className="c-req">*</span></label><input className="c-input" value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. SSS"/></div>
                        <div className="c-field"><label className="c-label">Full Name</label><input className="c-input" value={form.fullName} onChange={e => set("fullName", e.target.value)} placeholder="e.g. Social Security System"/></div>
                        <div className="c-field"><label className="c-label">Frequency</label><select className="c-input" value={form.frequency} onChange={e => set("frequency", e.target.value)}>{frequencies.map(f => <option key={f} value={f}>{f}</option>)}</select></div>
                        <div className="c-field"><label className="c-label">Color</label><div className="c-name-row"><input type="color" className="c-color-picker" value={form.color || "#0ea5e9"} onChange={e => set("color", e.target.value)} title="Agency color"/></div></div>
                        <div className="c-field"><label className="c-label">Website</label><input className="c-input" value={form.website || ""} onChange={e => set("website", e.target.value)} placeholder="https://..."/></div>
                        <div className="c-field"><label className="c-label">Status</label><select className="c-input" value={form.status || "Not Filed"} onChange={e => set("status", e.target.value)}><option value="Remitted">Remitted</option><option value="Filed">Filed</option><option value="Due">Due</option><option value="Overdue">Overdue</option><option value="Not Filed">Not Filed</option></select></div>
                        <div className="c-field"><label className="c-label">Due Date</label><input className="c-input" type="date" value={form.dueDate || ""} onChange={e => set("dueDate", e.target.value)}/></div>
                        <div className="c-field"><label className="c-label">Last Filed</label><input className="c-input" type="date" value={form.lastFiled || ""} onChange={e => set("lastFiled", e.target.value)}/></div>
                    </div>
                </div>

                <div className="ap-section">
                    <div className="c-editor-sh-row"><h4 className="ap-sec-title" style={{margin:0}}>Contribution Fields</h4><button className="c-btn-sm" onClick={addField}>+ Add Field</button></div>
                    <p className="c-editor-hint">Define what values to track for this agency.</p>
                    {fields.length === 0 && <div className="c-empty-fields">No fields defined. Click "Add Field" to start.</div>}
                    {fields.map((f, i) => (
                        <div key={i} className="c-field-row">
                            <input className="c-input c-input-sm" value={f.label} onChange={e => updateField(i, "label", e.target.value)} placeholder="Field label"/>
                            <select className="c-input c-input-sm c-input-type" value={f.type} onChange={e => updateField(i, "type", e.target.value)}>
                                <option value="currency">Currency ({currency})</option><option value="text">Text</option><option value="percent">Percentage</option>
                            </select>
                            <div className="c-input-val-wrap">
                                {f.type === "currency" && <span className="c-val-prefix">{currency}</span>}
                                {f.type === "percent" && <span className="c-val-suffix">%</span>}
                                <input className={`c-input c-input-sm ${f.type === "currency" ? "c-input-prefixed" : ""}`} value={values[f.key] || ""} onChange={e => setValues(prev => ({ ...prev, [f.key]: e.target.value }))} placeholder="Current value"/>
                            </div>
                            <button className="c-field-rm" onClick={() => removeField(i)}>✕</button>
                        </div>
                    ))}
                </div>
            </div>

            <div className="ap-modal-foot">
                <div className="ap-foot-btns">
                    {!isNew && onDelete && <button className="ap-btn-danger" onClick={onDelete}>Delete</button>}
                    <button className="ap-btn-cancel" onClick={onCancel}>Cancel</button>
                    <button className="ap-btn-primary" onClick={save}>Save</button>
                </div>
            </div>

            <style>{complianceCSS}</style>
        </div>
    );
}

/* ================================================================
   HELPERS
================================================================ */
function badgeClass(status) {
    switch (status) {
        case "Remitted": case "Filed": return "c-b-done";
        case "Due": return "c-b-due";
        case "Overdue": return "c-b-overdue";
        default: return "c-b-neutral";
    }
}

/* ================================================================
   STYLES
================================================================ */
const complianceCSS = `
  .c-wrap{display:flex;flex-direction:column;height:100%;overflow:hidden}
  .c-bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px;flex-shrink:0}
  .c-bar-count{font-size:13px;color:#888}
  .c-bar-btns{display:flex;gap:8px}

  .c-btn-p{padding:10px 22px;border:none;border-radius:8px;background:#2d9e8b;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;color:#fff;cursor:pointer;transition:all .15s}
  .c-btn-p:hover{background:#268a79}
  .c-btn-p:disabled{opacity:.5;cursor:not-allowed}
  .c-btn-sec{display:flex;align-items:center;gap:5px;padding:8px 14px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:500;color:#666;cursor:pointer;transition:all .15s}
  .c-btn-sec:hover{background:#f5f5f5;border-color:#ccc}
  .c-btn-reset{color:#999}
  .c-btn-sm{padding:5px 12px;border:1px solid #d4e8e2;border-radius:6px;background:#edf8f5;font-family:'DM Sans',sans-serif;font-size:11px;font-weight:600;color:#2d9e8b;cursor:pointer;transition:all .12s}
  .c-btn-sm:hover{background:#2d9e8b;color:#fff}
  .c-btn-danger{padding:8px 14px;border:1px solid #fecaca;border-radius:8px;background:#fef2f2;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:500;color:#ef4444;cursor:pointer}
  .c-btn-danger:hover{background:#ef4444;color:#fff}

  .c-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;margin-bottom:18px}
  .c-stat{background:#fff;border:1px solid #eee;border-radius:12px;padding:16px;cursor:pointer;transition:all .15s}
  .c-stat:hover{border-color:#d4e8e2;box-shadow:0 2px 8px rgba(45,158,139,.06)}
  .c-stat-ic{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;margin-bottom:10px}
  .c-stat-v{font-size:18px;font-weight:700;color:#222}
  .c-stat-l{margin-top:4px}

  .c-badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}
  .c-b-done{background:#e0faf1;color:#0d9488}
  .c-b-due{background:#fef3c7;color:#d97706}
  .c-b-overdue{background:#fef2f2;color:#ef4444}
  .c-b-neutral{background:#f3f4f6;color:#999}

  .c-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;flex:1;min-height:0;overflow-y:auto;padding-right:4px;align-content:start;scrollbar-color:transparent transparent}
  .c-grid::-webkit-scrollbar{width:6px}
  .c-grid::-webkit-scrollbar-track{background:transparent}
  .c-grid::-webkit-scrollbar-thumb{background:transparent;border-radius:3px}
  .c-card{border:none;border-radius:12px;padding:18px;background:#fff}
  .c-card-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;gap:8px}
  .c-card-name{font-size:18px;font-weight:700;color:#222}
  .c-card-full{font-size:11px;color:#aaa;margin-top:1px}
  .c-card-actions{display:flex;align-items:center;gap:6px;flex-shrink:0}
  .c-card-edit{padding:4px 10px;border:1px solid #eee;border-radius:6px;background:#fff;font-family:'DM Sans',sans-serif;font-size:11px;color:#888;cursor:pointer;transition:all .12s}
  .c-card-edit:hover{background:#edf8f5;color:#2d9e8b;border-color:#d4e8e2}
  .c-card-row{display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid #f8f8f8}
  .c-card-row:last-child{border-bottom:none}
  .c-card-rl{color:#888}
  .c-card-rv{font-weight:600;color:#333}
  .c-card-foot{display:flex;gap:16px;margin-top:10px;font-size:11px;color:#aaa;flex-wrap:wrap}

  .c-setup{text-align:center;max-width:700px;margin:0 auto}
  .c-setup-ic{width:72px;height:72px;border-radius:50%;background:#edf8f5;color:#2d9e8b;display:flex;align-items:center;justify-content:center;margin:0 auto 16px}
  .c-setup-t{font-size:20px;font-weight:700;color:#222;margin-bottom:6px}
  .c-setup-d{font-size:14px;color:#999;margin-bottom:24px}

  .c-tmpl-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;text-align:left}
  .c-tmpl{padding:16px;border:2px solid #eee;border-radius:12px;cursor:pointer;transition:all .15s;background:#fff}
  .c-tmpl:hover{border-color:#d4e8e2}
  .c-tmpl-on{border-color:#2d9e8b;background:#fafffe}
  .c-tmpl-name{font-size:15px;font-weight:700;color:#222;margin-bottom:2px}
  .c-tmpl-count{font-size:12px;color:#999;margin-bottom:8px}
  .c-tmpl-tags{display:flex;flex-wrap:wrap;gap:4px}
  .c-tmpl-tag{font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px}

  .c-preview{text-align:left;background:#fff;border:1px solid #eee;border-radius:12px;padding:20px;margin-bottom:20px}
  .c-preview-t{font-size:15px;font-weight:700;color:#222;margin-bottom:12px}
  .c-preview-list{display:flex;flex-direction:column;gap:10px}
  .c-preview-item{display:flex;gap:10px;align-items:flex-start}
  .c-preview-dot{width:8px;height:8px;border-radius:50%;margin-top:5px;flex-shrink:0}
  .c-preview-name{font-size:14px;font-weight:700;color:#333}
  .c-preview-full{font-size:12px;color:#888}
  .c-preview-meta{font-size:11px;color:#bbb;margin-top:2px}
  .c-preview-note{font-size:12px;color:#2d9e8b;margin-top:12px;font-style:italic}

  .c-editor{max-width:700px}
  .c-editor-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:10px}
  .c-editor-t{font-size:18px;font-weight:700;color:#222}
  .c-editor-btns{display:flex;gap:8px}
  .c-editor-section{background:#fff;border:1px solid #eee;border-radius:12px;padding:20px;margin-bottom:16px}
  .c-editor-sh{font-size:14px;font-weight:700;color:#333;margin-bottom:12px}
  .c-editor-sh-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
  .c-editor-hint{font-size:12px;color:#aaa;margin-bottom:12px}
  .c-editor-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}

  .c-field{display:flex;flex-direction:column}
  .c-label{font-size:12px;font-weight:600;color:#666;margin-bottom:5px}
  .c-req{color:#ef4444}
  .c-input{width:100%;padding:9px 12px;border:1px solid #e0e0e0;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:13px;color:#333;outline:none;transition:border-color .15s;background:#fff;box-sizing:border-box}
  .c-input:focus{border-color:#2d9e8b;box-shadow:0 0 0 2px rgba(45,158,139,.1)}
  .c-input-sm{padding:8px 10px;font-size:12px}
  .c-input-type{max-width:150px}
  .c-input-prefixed{padding-left:24px}
  select.c-input{appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;padding-right:28px;cursor:pointer}

  .c-color-picker{width:38px;height:38px;border:1px solid #e0e0e0;border-radius:8px;padding:2px;cursor:pointer;background:#fff;flex-shrink:0}
  .c-color-picker::-webkit-color-swatch-wrapper{padding:0}
  .c-color-picker::-webkit-color-swatch{border:none;border-radius:5px}
  .c-color-picker::-moz-color-swatch{border:none;border-radius:5px}

  .c-field-row{display:flex;gap:8px;align-items:center;margin-bottom:8px}
  .c-field-row .c-input{flex:1}
  .c-input-val-wrap{position:relative;flex:1;display:flex;align-items:center}
  .c-val-prefix{position:absolute;left:10px;font-size:12px;color:#aaa;font-weight:600;pointer-events:none}
  .c-val-suffix{position:absolute;right:10px;font-size:12px;color:#aaa;font-weight:600;pointer-events:none}
  .c-field-rm{width:28px;height:28px;border-radius:6px;border:1px solid #eee;background:#fff;color:#ccc;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;transition:all .12s}
  .c-field-rm:hover{background:#fef2f2;color:#ef4444;border-color:#fecaca}
  .c-empty-fields{text-align:center;padding:20px;color:#ccc;font-size:13px}

  .c-spinner{width:28px;height:28px;border:3px solid #eee;border-top-color:#2d9e8b;border-radius:50%;animation:cSpin .6s linear infinite;margin:0 auto}
  @keyframes cSpin{to{transform:rotate(360deg)}}
  @keyframes fadeInUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}

  @media(max-width:768px){.c-tmpl-grid{grid-template-columns:1fr 1fr}.c-grid{grid-template-columns:1fr}.c-editor-grid{grid-template-columns:1fr}}
  @media(max-width:500px){.c-tmpl-grid{grid-template-columns:1fr}}

  /* Panel form styles */
  .ap-section{margin-bottom:20px}
  .ap-sec-title{font-size:13px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px}
  .ap-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .ap-field{display:flex;flex-direction:column}
  .ap-field-full{grid-column:1/-1}
  .ap-label{display:flex;align-items:center;gap:4px;font-size:12px;font-weight:600;color:#666;margin-bottom:5px}
  .ap-input{width:100%;padding:9px 12px;border:1px solid #e0e0e0;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:13px;color:#333;outline:none;transition:border-color .15s;background:#fff;box-sizing:border-box}
  .ap-input:focus{border-color:#2d9e8b;box-shadow:0 0 0 2px rgba(45,158,139,.1)}
  .ap-input:disabled{background:#fafbfa;color:#555;cursor:default}
  .ap-foot-btns{display:flex;justify-content:flex-end;gap:8px}
  .ap-btn-cancel{padding:9px 18px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;color:#666;cursor:pointer}
  .ap-btn-cancel:hover{background:#f5f5f5}
  .ap-btn-primary{display:flex;align-items:center;gap:5px;padding:9px 22px;border:none;border-radius:8px;background:#2d9e8b;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;color:#fff;cursor:pointer;transition:all .15s}
  .ap-btn-primary:hover{background:#268a79}
  .ap-btn-danger{padding:9px 16px;border:1px solid #fecaca;border-radius:8px;background:#fef2f2;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;color:#ef4444;cursor:pointer;margin-right:auto}
  .ap-btn-danger:hover{background:#ef4444;color:#fff}
  .ap-modal-layout{display:flex;flex-direction:column;min-height:200px;max-height:60vh}
  .ap-modal-scroll{flex:1;overflow-y:auto;padding:16px 0 0}
  .ap-modal-foot{flex-shrink:0;padding:16px 0 0;margin-top:auto}
  @media(max-width:600px){.ap-fields{grid-template-columns:1fr}}
`;
