import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";

const API_URL = "http://localhost:8080/api/execute";
async function api(action, body = {}) {
    const session = localStorage.getItem("ls_session");
    const res = await fetch(`${API_URL}?action=${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session}` } : {}) },
        body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error || json?.message || `API ${action} failed (${res.status})`);
    if (json && !json.success) throw new Error(json.error || "failed");
    return json?.data;
}

function fmtMoney(n) {
    return "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const TYPES = ["All", "Asset", "Liability", "Equity", "Revenue", "Expense"];
const TYPE_COLORS = {
    Asset: "#0ea5e9", Liability: "#ef4444", Equity: "#8b5cf6",
    Revenue: "#22c55e", Expense: "#f59e0b",
};
const TYPE_ICONS = {
    Asset: "trending-up", Liability: "alert-circle", Equity: "shield",
    Revenue: "dollar-sign", Expense: "credit-card",
};
const SUBTYPES = {
    Asset: ["Current Asset", "Fixed Asset", "Other Asset", "Header"],
    Liability: ["Current Liability", "Long-term Liability", "Other Liability", "Header"],
    Equity: ["Owner Equity", "Retained Earnings", "Header"],
    Revenue: ["Operating Revenue", "Other Revenue", "Header"],
    Expense: ["Operating Expense", "Cost of Sales", "Other Expense", "Header"],
};

export default function AccountingTab() {
    const [accounts, setAccounts] = useState([]);
    const [tab, setTab] = useState("All");
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [editAccount, setEditAccount] = useState(null);
    const [expandedTypes, setExpandedTypes] = useState({ Asset: true, Liability: true, Equity: true, Revenue: true, Expense: true });
    const [expandedParents, setExpandedParents] = useState({});
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [seeding, setSeeding] = useState(false);
    const [templates, setTemplates] = useState([]);
    const [loadingTemplates, setLoadingTemplates] = useState(false);
    const [templateItems, setTemplateItems] = useState([]);
    const [tplView, setTplView] = useState("list"); // "list" | "editor"
    const [editingTpl, setEditingTpl] = useState(null);
    const [editingItems, setEditingItems] = useState([]);
    const [editingItemRow, setEditingItemRow] = useState(null);
    const [tplMeta, setTplMeta] = useState({ name: "", country: "", currency: "", flag: "", description: "" });
    const [savingTpl, setSavingTpl] = useState(false);
    const [showNewTplForm, setShowNewTplForm] = useState(false);

    const loadAccounts = useCallback(async () => {
        try {
            const d = await api("get_accounts", { account_type: tab === "All" ? "" : tab });
            setAccounts(d.accounts || []);
        } catch { setAccounts([]); }
    }, [tab]);

    useEffect(() => { loadAccounts(); }, [loadAccounts]);

    // Build tree structure
    const buildTree = (accts) => {
        const roots = accts.filter(a => !a.parent_id || !accts.find(p => p.id === a.parent_id));
        const getChildren = (parentId) => accts.filter(a => a.parent_id === parentId);
        return { roots, getChildren };
    };

    const filtered = accounts.filter(a => {
        if (search) {
            const s = search.toLowerCase();
            return a.code.toLowerCase().includes(s) || a.name.toLowerCase().includes(s);
        }
        return true;
    });

    const grouped = {};
    TYPES.slice(1).forEach(t => { grouped[t] = filtered.filter(a => a.account_type === t); });

    // Stats
    const totalAssets = accounts.filter(a => a.account_type === "Asset" && a.account_subtype !== "Header").reduce((s, a) => s + (a.normal_balance === "Debit" ? a.current_balance : -a.current_balance), 0);
    const totalLiabilities = accounts.filter(a => a.account_type === "Liability" && a.account_subtype !== "Header").reduce((s, a) => s + (a.normal_balance === "Credit" ? a.current_balance : -a.current_balance), 0);
    const totalEquity = accounts.filter(a => a.account_type === "Equity" && a.account_subtype !== "Header").reduce((s, a) => s + (a.normal_balance === "Credit" ? a.current_balance : -a.current_balance), 0);
    const totalRevenue = accounts.filter(a => a.account_type === "Revenue" && a.account_subtype !== "Header").reduce((s, a) => s + a.current_balance, 0);
    const totalExpense = accounts.filter(a => a.account_type === "Expense" && a.account_subtype !== "Header").reduce((s, a) => s + a.current_balance, 0);

    const handleCreate = () => {
        setEditAccount({
            code: "", name: "", account_type: tab !== "All" ? tab : "Asset",
            account_subtype: "", normal_balance: "", parent_id: "",
            description: "", currency: "PHP", is_active: true,
        });
        setShowModal(true);
    };

    const handleEdit = (acct) => {
        setEditAccount({ ...acct });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!editAccount.code || !editAccount.name || !editAccount.account_type) return;
        try {
            if (editAccount.id) {
                await api("update_account", editAccount);
            } else {
                await api("create_account", editAccount);
            }
            setShowModal(false);
            setEditAccount(null);
            loadAccounts();
        } catch (e) { alert("Error: " + e.message); }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Delete this account?")) return;
        try {
            await api("delete_account", { id });
            if (selected?.id === id) setSelected(null);
            loadAccounts();
        } catch (e) { alert("Error: " + e.message); }
    };

    const handleToggleActive = async (id) => {
        try {
            await api("toggle_account_active", { id });
            loadAccounts();
        } catch (e) { alert("Error: " + e.message); }
    };

    const loadTemplates = async () => {
        setLoadingTemplates(true);
        try {
            const res = await api("get_coa_templates");
            setTemplates(res.templates || []);
        } catch (e) { alert("Failed to load templates"); }
        setLoadingTemplates(false);
    };

    const handleSeedDefaults = async () => {
        setShowTemplateModal(true);
        setTplView("list");
        setSelectedTemplate(null);
        setTemplateItems([]);
        setEditingTpl(null);
        setShowNewTplForm(false);
        await loadTemplates();
    };

    const handleSelectTemplate = async (id) => {
        setSelectedTemplate(id);
        try {
            const res = await api("get_coa_template_items", { template_id: id });
            setTemplateItems(res.items || []);
        } catch (e) { setTemplateItems([]); }
    };

    const handleApplyTemplate = async () => {
        if (!selectedTemplate) return;
        const clearExisting = accounts.length > 0;
        if (clearExisting && !window.confirm("This will replace all existing accounts. Continue?")) return;
        setSeeding(true);
        try {
            await api("apply_coa_template", {
                template_id: selectedTemplate,
                clear_existing: clearExisting,
            });
            setShowTemplateModal(false);
            loadAccounts();
        } catch (e) { alert("Error: " + e.message); }
        setSeeding(false);
    };

    const openTplEditor = async (tpl) => {
        if (tpl.is_global) {
            const newName = prompt("Enter a name for your custom copy:", tpl.name + " (Custom)");
            if (!newName) return;
            try {
                const dup = await api("duplicate_coa_template", { source_id: tpl.id, new_name: newName });
                setEditingTpl(dup);
                setTplMeta({ name: dup.name, country: dup.country, currency: dup.currency, flag: dup.flag, description: dup.description || "" });
                const res = await api("get_coa_template_items", { template_id: dup.id });
                setEditingItems(res.items || []);
                setTplView("editor");
                await loadTemplates();
            } catch (e) { alert("Failed to duplicate: " + e.message); }
        } else {
            setEditingTpl(tpl);
            setTplMeta({ name: tpl.name, country: tpl.country, currency: tpl.currency, flag: tpl.flag, description: tpl.description || "" });
            try {
                const res = await api("get_coa_template_items", { template_id: tpl.id });
                setEditingItems(res.items || []);
            } catch { setEditingItems([]); }
            setTplView("editor");
        }
        setEditingItemRow(null);
    };

    const handleCreateTemplate = async () => {
        if (!tplMeta.name) return;
        try {
            const tpl = await api("create_coa_template", tplMeta);
            setEditingTpl(tpl);
            setEditingItems([]);
            setTplView("editor");
            setShowNewTplForm(false);
            await loadTemplates();
        } catch (e) { alert("Error: " + e.message); }
    };

    const handleSaveTplMeta = async () => {
        if (!editingTpl) return;
        setSavingTpl(true);
        try {
            const updated = await api("update_coa_template", { id: editingTpl.id, ...tplMeta });
            setEditingTpl(updated);
            await loadTemplates();
        } catch (e) { alert("Error: " + e.message); }
        setSavingTpl(false);
    };

    const handleDeleteTemplate = async () => {
        if (!editingTpl || !window.confirm("Delete this template?")) return;
        try {
            await api("delete_coa_template", { id: editingTpl.id });
            setTplView("list");
            setEditingTpl(null);
            await loadTemplates();
        } catch (e) { alert("Error: " + e.message); }
    };

    const handleAddItem = async () => {
        if (!editingTpl) return;
        const maxSort = editingItems.reduce((m, i) => Math.max(m, i.sort_order || 0), 0);
        const item = {
            template_id: editingTpl.id,
            code: "", name: "", account_type: "Asset", account_subtype: "Current Asset",
            normal_balance: "Debit", is_system: false, sort_order: maxSort + 1,
        };
        setEditingItemRow({ ...item, _new: true });
    };

    const handleSaveItem = async (item) => {
        if (!item.code || !item.name) return alert("Code and name are required");
        try {
            if (item._new) {
                await api("create_coa_template_item", {
                    template_id: editingTpl.id, code: item.code, name: item.name,
                    account_type: item.account_type, account_subtype: item.account_subtype,
                    normal_balance: item.normal_balance, is_system: item.is_system, sort_order: item.sort_order,
                });
            } else {
                await api("update_coa_template_item", {
                    id: item.id, code: item.code, name: item.name,
                    account_type: item.account_type, account_subtype: item.account_subtype,
                    normal_balance: item.normal_balance, is_system: item.is_system, sort_order: item.sort_order,
                });
            }
            const res = await api("get_coa_template_items", { template_id: editingTpl.id });
            setEditingItems(res.items || []);
            setEditingItemRow(null);
            await loadTemplates();
        } catch (e) { alert("Error: " + e.message); }
    };

    const handleDeleteItem = async (id) => {
        if (!window.confirm("Remove this account from template?")) return;
        try {
            await api("delete_coa_template_item", { id });
            const res = await api("get_coa_template_items", { template_id: editingTpl.id });
            setEditingItems(res.items || []);
            await loadTemplates();
        } catch (e) { alert("Error: " + e.message); }
    };

    const typesToShow = tab === "All" ? TYPES.slice(1) : [tab];

    const renderAccountRow = (acct, depth = 0) => {
        const isHeader = acct.account_subtype === "Header";
        const children = filtered.filter(a => a.parent_id === acct.id);
        const hasChildren = children.length > 0;
        const isExpanded = expandedParents[acct.id] !== false;
        const isSelected = selected?.id === acct.id;
        const color = TYPE_COLORS[acct.account_type] || "#666";

        return (
            <div key={acct.id}>
                <div
                    className="coa-row"
                    style={{
                        paddingLeft: 16 + depth * 24,
                        background: isSelected ? "#f0fdf4" : isHeader ? "#fafafa" : "#fff",
                        borderLeft: isSelected ? `3px solid #10b981` : "3px solid transparent",
                        opacity: acct.is_active ? 1 : 0.5,
                    }}
                    onClick={() => setSelected(acct)}
                >
                    {hasChildren ? (
                        <button className="coa-expand" onClick={(e) => { e.stopPropagation(); setExpandedParents(p => ({ ...p, [acct.id]: !isExpanded })); }}>
                            <I name={isExpanded ? "chevDown" : "chevron-right"} size={14}/>
                        </button>
                    ) : <span style={{ width: 22, display: "inline-block" }}/>}

                    <span className="coa-code" style={{ color }}>{acct.code}</span>
                    <span className={`coa-name ${isHeader ? "coa-header" : ""}`}>{acct.name}</span>

                    {!isHeader && (
                        <span className="coa-balance" style={{ color: acct.current_balance < 0 ? "#ef4444" : "#333" }}>
              {fmtMoney(Math.abs(acct.current_balance))}
            </span>
                    )}

                    <span className="coa-type-chip" style={{ background: color + "18", color }}>
            {acct.account_subtype || acct.account_type}
          </span>

                    <span className="coa-normal" style={{ color: acct.normal_balance === "Debit" ? "#0ea5e9" : "#8b5cf6" }}>
            {acct.normal_balance === "Debit" ? "Dr" : "Cr"}
          </span>

                    {!acct.is_system && (
                        <div className="coa-actions">
                            <button className="coa-act-btn" onClick={(e) => { e.stopPropagation(); handleEdit(acct); }} title="Edit"><I name="file-text" size={14}/></button>
                            <button className="coa-act-btn coa-act-del" onClick={(e) => { e.stopPropagation(); handleDelete(acct.id); }} title="Delete"><I name="trash-2" size={14}/></button>
                        </div>
                    )}
                    {acct.is_system && <span className="coa-sys">System</span>}
                </div>

                {hasChildren && isExpanded && children.map(child => renderAccountRow(child, depth + 1))}
            </div>
        );
    };

    return (
        <div className="coa-wrap">
            {/* Stats */}
            <div className="coa-stats">
                {[
                    { label: "Total Assets", value: totalAssets, icon: "trending-up", color: "#0ea5e9" },
                    { label: "Total Liabilities", value: totalLiabilities, icon: "alert-circle", color: "#ef4444" },
                    { label: "Total Equity", value: totalEquity, icon: "shield", color: "#8b5cf6" },
                    { label: "Net Income", value: totalRevenue - totalExpense, icon: "dollar-sign", color: "#10b981" },
                ].map((s, i) => (
                    <div key={i} className="coa-stat-card">
                        <div className="coa-stat-icon" style={{ background: s.color + "15", color: s.color }}><I name={s.icon} size={20}/></div>
                        <div><div className="coa-stat-label">{s.label}</div><div className="coa-stat-value">{fmtMoney(s.value)}</div></div>
                    </div>
                ))}
            </div>

            {/* Toolbar */}
            <div className="coa-toolbar">
                <div className="coa-tabs">
                    {TYPES.map(t => (
                        <button key={t} className={`coa-tab ${tab === t ? "coa-tab-on" : ""}`} onClick={() => setTab(t)}>
                            {t !== "All" && <span className="coa-tab-dot" style={{ background: TYPE_COLORS[t] }}/>}
                            {t}
                            {t !== "All" && <span className="coa-tab-count">{accounts.filter(a => a.account_type === t).length}</span>}
                        </button>
                    ))}
                </div>
                <div className="coa-toolbar-r">
                    <div className="coa-search">
                        <I name="search" size={14}/>
                        <input type="text" placeholder="Search accounts..." value={search} onChange={e => setSearch(e.target.value)}/>
                    </div>
                    {accounts.length === 0 && (
                        <button className="coa-btn coa-btn-outline" onClick={handleSeedDefaults}>
                            <I name="play" size={14}/> Use Template
                        </button>
                    )}
                    {accounts.length > 0 && (
                        <button className="coa-btn coa-btn-outline" onClick={handleSeedDefaults}>
                            <I name="settings" size={14}/> Templates
                        </button>
                    )}
                    <button className="coa-btn coa-btn-primary" onClick={handleCreate}>
                        <I name="plus" size={14}/> New Account
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="coa-main">
                {/* Account List */}
                <div className={`coa-list ${selected ? "coa-list-narrow" : ""}`}>
                    {/* Column Headers */}
                    <div className="coa-col-header">
                        <span style={{ width: 22 }}/>
                        <span className="coa-ch-code">Code</span>
                        <span className="coa-ch-name">Account Name</span>
                        <span className="coa-ch-bal">Balance</span>
                        <span className="coa-ch-type">Type</span>
                        <span className="coa-ch-norm">N/B</span>
                        <span className="coa-ch-act">Actions</span>
                    </div>

                    {accounts.length === 0 ? (
                        <div className="coa-empty">
                            <I name="book-open" size={40}/>
                            <h3>No Chart of Accounts</h3>
                            <p>Set up your chart of accounts to start tracking finances.</p>
                            <button className="coa-btn coa-btn-primary" onClick={handleSeedDefaults} style={{ marginTop: 12 }}>
                                <I name="play" size={14}/> Choose a Template
                            </button>
                        </div>
                    ) : (
                        typesToShow.map(type => {
                            const typeAccounts = grouped[type] || [];
                            if (typeAccounts.length === 0) return null;
                            const isExpanded = expandedTypes[type] !== false;
                            const roots = typeAccounts.filter(a => !a.parent_id || !typeAccounts.find(p => p.id === a.parent_id));
                            const color = TYPE_COLORS[type];

                            return (
                                <div key={type} className="coa-type-group">
                                    <div className="coa-type-header" onClick={() => setExpandedTypes(p => ({ ...p, [type]: !isExpanded }))}>
                                        <I name={isExpanded ? "chevDown" : "chevron-right"} size={14}/>
                                        <span className="coa-type-icon" style={{ background: color + "15", color }}><I name={TYPE_ICONS[type]} size={14}/></span>
                                        <span className="coa-type-title">{type}</span>
                                        <span className="coa-type-count">{typeAccounts.length} accounts</span>
                                    </div>
                                    {isExpanded && (
                                        <div className="coa-type-body">
                                            {roots.map(acct => renderAccountRow(acct, 0))}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Detail Panel */}
                {selected && (
                    <div className="coa-panel">
                        <div className="coa-panel-header">
                            <div>
                                <div className="coa-panel-code" style={{ color: TYPE_COLORS[selected.account_type] }}>{selected.code}</div>
                                <h3 className="coa-panel-name">{selected.name}</h3>
                            </div>
                            <button className="coa-panel-close" onClick={() => setSelected(null)}><I name="x" size={18}/></button>
                        </div>

                        <div className="coa-panel-body">
                            {/* Type & Status */}
                            <div className="coa-panel-row">
                <span className="coa-type-chip" style={{ background: TYPE_COLORS[selected.account_type] + "18", color: TYPE_COLORS[selected.account_type] }}>
                  {selected.account_type}
                </span>
                                {selected.account_subtype && selected.account_subtype !== "Header" && (
                                    <span className="coa-panel-subtype">{selected.account_subtype}</span>
                                )}
                                <span className={`coa-panel-status ${selected.is_active ? "coa-active" : "coa-inactive"}`}>
                  {selected.is_active ? "Active" : "Inactive"}
                </span>
                                {selected.is_system && <span className="coa-panel-sys">System</span>}
                            </div>

                            {/* Balance */}
                            <div className="coa-panel-balance-box">
                                <div className="coa-panel-balance-label">Current Balance</div>
                                <div className="coa-panel-balance-val" style={{ color: selected.current_balance === 0 ? "#999" : selected.current_balance > 0 ? "#10b981" : "#ef4444" }}>
                                    {fmtMoney(Math.abs(selected.current_balance))}
                                </div>
                                <div className="coa-panel-balance-norm">
                                    Normal Balance: <strong style={{ color: selected.normal_balance === "Debit" ? "#0ea5e9" : "#8b5cf6" }}>
                                    {selected.normal_balance}
                                </strong>
                                </div>
                            </div>

                            {/* Details */}
                            <div className="coa-panel-details">
                                <div className="coa-panel-detail">
                                    <span className="coa-detail-label">Currency</span>
                                    <span className="coa-detail-val">{selected.currency || "PHP"}</span>
                                </div>
                                {selected.parent_name && (
                                    <div className="coa-panel-detail">
                                        <span className="coa-detail-label">Parent Account</span>
                                        <span className="coa-detail-val">{selected.parent_code} {selected.parent_name}</span>
                                    </div>
                                )}
                                {selected.description && (
                                    <div className="coa-panel-detail">
                                        <span className="coa-detail-label">Description</span>
                                        <span className="coa-detail-val">{selected.description}</span>
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            {!selected.is_system && (
                                <div className="coa-panel-actions">
                                    <button className="coa-btn coa-btn-primary" onClick={() => handleEdit(selected)} style={{ flex: 1 }}>
                                        <I name="file-text" size={14}/> Edit
                                    </button>
                                    <button className="coa-btn coa-btn-outline" onClick={() => handleToggleActive(selected.id)}>
                                        {selected.is_active ? "Deactivate" : "Activate"}
                                    </button>
                                    <button className="coa-btn coa-btn-danger" onClick={() => handleDelete(selected.id)}>
                                        <I name="trash-2" size={14}/>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Create/Edit Modal */}
            {showModal && editAccount && (
                <div className="coa-modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="coa-modal" onClick={e => e.stopPropagation()}>
                        <div className="coa-modal-header">
                            <h3>{editAccount.id ? "Edit Account" : "New Account"}</h3>
                            <button className="coa-panel-close" onClick={() => setShowModal(false)}><I name="x" size={18}/></button>
                        </div>
                        <div className="coa-modal-body">
                            <div className="coa-form-row">
                                <div className="coa-form-group" style={{ flex: "0 0 120px" }}>
                                    <label>Code</label>
                                    <input type="text" value={editAccount.code} onChange={e => setEditAccount({ ...editAccount, code: e.target.value })} placeholder="1010"/>
                                </div>
                                <div className="coa-form-group" style={{ flex: 1 }}>
                                    <label>Account Name</label>
                                    <input type="text" value={editAccount.name} onChange={e => setEditAccount({ ...editAccount, name: e.target.value })} placeholder="Cash on Hand"/>
                                </div>
                            </div>

                            <div className="coa-form-row">
                                <div className="coa-form-group" style={{ flex: 1 }}>
                                    <label>Account Type</label>
                                    <select value={editAccount.account_type} onChange={e => {
                                        const t = e.target.value;
                                        const nb = (t === "Asset" || t === "Expense") ? "Debit" : "Credit";
                                        setEditAccount({ ...editAccount, account_type: t, normal_balance: nb, account_subtype: "" });
                                    }}>
                                        {TYPES.slice(1).map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div className="coa-form-group" style={{ flex: 1 }}>
                                    <label>Subtype</label>
                                    <select value={editAccount.account_subtype} onChange={e => setEditAccount({ ...editAccount, account_subtype: e.target.value })}>
                                        <option value="">Select subtype</option>
                                        {(SUBTYPES[editAccount.account_type] || []).map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="coa-form-row">
                                <div className="coa-form-group" style={{ flex: 1 }}>
                                    <label>Normal Balance</label>
                                    <select value={editAccount.normal_balance} onChange={e => setEditAccount({ ...editAccount, normal_balance: e.target.value })}>
                                        <option value="Debit">Debit</option>
                                        <option value="Credit">Credit</option>
                                    </select>
                                </div>
                                <div className="coa-form-group" style={{ flex: 1 }}>
                                    <label>Parent Account</label>
                                    <select value={editAccount.parent_id} onChange={e => setEditAccount({ ...editAccount, parent_id: e.target.value })}>
                                        <option value="">None (Top Level)</option>
                                        {accounts.filter(a => a.account_type === editAccount.account_type && a.id !== editAccount.id).map(a => (
                                            <option key={a.id} value={a.id}>{a.code} {a.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="coa-form-row">
                                <div className="coa-form-group" style={{ flex: 1 }}>
                                    <label>Currency</label>
                                    <select value={editAccount.currency || "PHP"} onChange={e => setEditAccount({ ...editAccount, currency: e.target.value })}>
                                        <option value="PHP">PHP</option>
                                        <option value="USD">USD</option>
                                        <option value="JPY">JPY</option>
                                        <option value="EUR">EUR</option>
                                    </select>
                                </div>
                                <div className="coa-form-group" style={{ flex: 1, display: "flex", alignItems: "flex-end", paddingBottom: 4 }}>
                                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                                        <input type="checkbox" checked={editAccount.is_active} onChange={e => setEditAccount({ ...editAccount, is_active: e.target.checked })}/>
                                        Active
                                    </label>
                                </div>
                            </div>

                            <div className="coa-form-group">
                                <label>Description</label>
                                <textarea rows={3} value={editAccount.description || ""} onChange={e => setEditAccount({ ...editAccount, description: e.target.value })} placeholder="Optional description..."/>
                            </div>
                        </div>
                        <div className="coa-modal-footer">
                            <button className="coa-btn coa-btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                            <button className="coa-btn coa-btn-primary" onClick={handleSave} disabled={!editAccount.code || !editAccount.name}>
                                {editAccount.id ? "Save Changes" : "Create Account"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Template Modal */}
            {showTemplateModal && (
                <div className="coa-modal-overlay" onClick={() => setShowTemplateModal(false)}>
                    <div className={`coa-tpl-modal ${tplView === "editor" ? "coa-tpl-wide" : ""}`} onClick={e => e.stopPropagation()}>

                        {/* ===== LIST VIEW ===== */}
                        {tplView === "list" && (<>
                            <div className="coa-modal-header">
                                <div>
                                    <h3>Chart of Accounts Templates</h3>
                                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "#888", fontWeight: 400 }}>Select a template to apply, or edit to customize</p>
                                </div>
                                <div style={{ display: "flex", gap: 6 }}>
                                    <button className="coa-btn coa-btn-outline" onClick={() => { setShowNewTplForm(true); setTplMeta({ name: "", country: "", currency: "PHP", flag: "", description: "" }); }}>
                                        <I name="plus" size={14}/> New
                                    </button>
                                    <button className="coa-panel-close" onClick={() => setShowTemplateModal(false)}><I name="x" size={18}/></button>
                                </div>
                            </div>

                            {/* New Template Form */}
                            {showNewTplForm && (
                                <div style={{ padding: "16px 24px", borderBottom: "1px solid #eee", background: "#f9fafb" }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "#444" }}>Create New Template</div>
                                    <div className="coa-form-row">
                                        <div className="coa-form-group" style={{ flex: 2 }}>
                                            <label>Name</label>
                                            <input value={tplMeta.name} onChange={e => setTplMeta({ ...tplMeta, name: e.target.value })} placeholder="My Custom Template"/>
                                        </div>
                                        <div className="coa-form-group" style={{ flex: 1 }}>
                                            <label>Country</label>
                                            <input value={tplMeta.country} onChange={e => setTplMeta({ ...tplMeta, country: e.target.value })} placeholder="PH"/>
                                        </div>
                                        <div className="coa-form-group" style={{ flex: 1 }}>
                                            <label>Currency</label>
                                            <input value={tplMeta.currency} onChange={e => setTplMeta({ ...tplMeta, currency: e.target.value })} placeholder="PHP"/>
                                        </div>
                                        <div className="coa-form-group" style={{ flex: 0.5 }}>
                                            <label>Flag</label>
                                            <input value={tplMeta.flag} onChange={e => setTplMeta({ ...tplMeta, flag: e.target.value })} placeholder="🇵🇭"/>
                                        </div>
                                    </div>
                                    <div className="coa-form-group" style={{ marginBottom: 10 }}>
                                        <label>Description</label>
                                        <input value={tplMeta.description} onChange={e => setTplMeta({ ...tplMeta, description: e.target.value })} placeholder="Optional description"/>
                                    </div>
                                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                        <button className="coa-btn coa-btn-outline" onClick={() => setShowNewTplForm(false)}>Cancel</button>
                                        <button className="coa-btn coa-btn-primary" onClick={handleCreateTemplate} disabled={!tplMeta.name}>Create & Edit</button>
                                    </div>
                                </div>
                            )}

                            <div className="coa-tpl-body">
                                {loadingTemplates ? (
                                    <div style={{ padding: 40, textAlign: "center", color: "#999" }}>Loading templates...</div>
                                ) : templates.length === 0 ? (
                                    <div style={{ padding: 40, textAlign: "center", color: "#999" }}>No templates available</div>
                                ) : templates.map(tpl => {
                                    const isSelected = selectedTemplate === tpl.id;
                                    const preview = isSelected ? templateItems : [];
                                    const typeCount = {};
                                    preview.forEach(a => { if (a.account_subtype !== "Header") typeCount[a.account_type] = (typeCount[a.account_type] || 0) + 1; });
                                    return (
                                        <div key={tpl.id} className={`coa-tpl-card ${isSelected ? "coa-tpl-sel" : ""}`}>
                                            <div className="coa-tpl-top" onClick={() => handleSelectTemplate(tpl.id)} style={{ cursor: "pointer" }}>
                                                <span className="coa-tpl-flag">{tpl.flag}</span>
                                                <div className="coa-tpl-info">
                                                    <div className="coa-tpl-name">{tpl.name}</div>
                                                    <div className="coa-tpl-currency">
                                                        {tpl.currency}
                                                        {tpl.is_global && <span className="coa-tpl-badge coa-tpl-badge-g">GLOBAL</span>}
                                                        {!tpl.is_global && <span className="coa-tpl-badge coa-tpl-badge-c">CUSTOM</span>}
                                                    </div>
                                                </div>
                                                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                                    <button className="coa-tpl-edit-btn" title={tpl.is_global ? "Duplicate & Edit" : "Edit"} onClick={e => { e.stopPropagation(); openTplEditor(tpl); }}>
                                                        <I name={tpl.is_global ? "copy" : "edit-2"} size={13}/>
                                                    </button>
                                                    <div className={`coa-tpl-check ${isSelected ? "coa-tpl-check-on" : ""}`}>
                                                        {isSelected && <I name="check-circle" size={18}/>}
                                                    </div>
                                                </div>
                                            </div>
                                            {tpl.description && <div className="coa-tpl-desc">{tpl.description}</div>}
                                            <div className="coa-tpl-breakdown">
                                                {isSelected && Object.entries(typeCount).map(([type, count]) => (
                                                    <span key={type} className="coa-tpl-chip" style={{ background: (TYPE_COLORS[type] || "#888") + "15", color: TYPE_COLORS[type] || "#888" }}>
                            {type} ({count})
                          </span>
                                                ))}
                                                <span className="coa-tpl-total">{tpl.item_count} accounts</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="coa-modal-footer">
                                <button className="coa-btn coa-btn-outline" onClick={() => setShowTemplateModal(false)}>Cancel</button>
                                <button className="coa-btn coa-btn-primary" onClick={handleApplyTemplate} disabled={!selectedTemplate || seeding}>
                                    {seeding ? "Applying..." : accounts.length > 0 ? "Replace with Template" : "Apply Template"}
                                </button>
                            </div>
                        </>)}

                        {/* ===== EDITOR VIEW ===== */}
                        {tplView === "editor" && editingTpl && (<>
                            <div className="coa-modal-header">
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <button className="coa-panel-close" onClick={() => { setTplView("list"); setEditingTpl(null); }} title="Back to list">
                                        <I name="arrow-left" size={16}/>
                                    </button>
                                    <div>
                                        <h3 style={{ margin: 0 }}>{editingTpl.flag} {editingTpl.name}</h3>
                                        <p style={{ margin: "2px 0 0", fontSize: 11, color: "#888", fontWeight: 400 }}>{editingItems.length} accounts in template</p>
                                    </div>
                                </div>
                                <div style={{ display: "flex", gap: 6 }}>
                                    <button className="coa-btn coa-btn-outline" style={{ color: "#ef4444", borderColor: "#fca5a5" }} onClick={handleDeleteTemplate}>
                                        <I name="trash-2" size={13}/> Delete
                                    </button>
                                    <button className="coa-panel-close" onClick={() => setShowTemplateModal(false)}><I name="x" size={18}/></button>
                                </div>
                            </div>

                            {/* Template Metadata */}
                            <div style={{ padding: "14px 24px", borderBottom: "1px solid #eee", background: "#fafafa" }}>
                                <div className="coa-form-row" style={{ marginBottom: 8 }}>
                                    <div className="coa-form-group" style={{ flex: 2 }}>
                                        <label>Template Name</label>
                                        <input value={tplMeta.name} onChange={e => setTplMeta({ ...tplMeta, name: e.target.value })}/>
                                    </div>
                                    <div className="coa-form-group" style={{ flex: 0.8 }}>
                                        <label>Country</label>
                                        <input value={tplMeta.country} onChange={e => setTplMeta({ ...tplMeta, country: e.target.value })}/>
                                    </div>
                                    <div className="coa-form-group" style={{ flex: 0.8 }}>
                                        <label>Currency</label>
                                        <input value={tplMeta.currency} onChange={e => setTplMeta({ ...tplMeta, currency: e.target.value })}/>
                                    </div>
                                    <div className="coa-form-group" style={{ flex: 0.5 }}>
                                        <label>Flag</label>
                                        <input value={tplMeta.flag} onChange={e => setTplMeta({ ...tplMeta, flag: e.target.value })}/>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "flex-end" }}>
                                        <button className="coa-btn coa-btn-primary" onClick={handleSaveTplMeta} disabled={savingTpl} style={{ height: 35 }}>
                                            {savingTpl ? "..." : "Save"}
                                        </button>
                                    </div>
                                </div>
                                <div className="coa-form-group">
                                    <input value={tplMeta.description} onChange={e => setTplMeta({ ...tplMeta, description: e.target.value })} placeholder="Description (optional)" style={{ fontSize: 12 }}/>
                                </div>
                            </div>

                            {/* Items Table */}
                            <div className="coa-tpl-editor-body">
                                <div className="coa-tpl-tbl-wrap">
                                    <table className="coa-tpl-tbl">
                                        <thead>
                                        <tr>
                                            <th style={{ width: 60 }}>Code</th>
                                            <th>Name</th>
                                            <th style={{ width: 90 }}>Type</th>
                                            <th style={{ width: 110 }}>Subtype</th>
                                            <th style={{ width: 55 }}>Dr/Cr</th>
                                            <th style={{ width: 35 }}>Sys</th>
                                            <th style={{ width: 60 }}></th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {editingItems.map(item => {
                                            const isEditing = editingItemRow && editingItemRow.id === item.id && !editingItemRow._new;
                                            const row = isEditing ? editingItemRow : item;
                                            const color = TYPE_COLORS[row.account_type] || "#888";
                                            return (
                                                <tr key={item.id} className={`coa-tpl-row ${row.account_subtype === "Header" ? "coa-tpl-row-hdr" : ""}`}>
                                                    {isEditing ? (<>
                                                        <td><input className="coa-tpl-inp" value={row.code} onChange={e => setEditingItemRow({ ...row, code: e.target.value })}/></td>
                                                        <td><input className="coa-tpl-inp coa-tpl-inp-wide" value={row.name} onChange={e => setEditingItemRow({ ...row, name: e.target.value })}/></td>
                                                        <td>
                                                            <select className="coa-tpl-inp" value={row.account_type} onChange={e => {
                                                                const t = e.target.value;
                                                                const nb = (t === "Asset" || t === "Expense") ? "Debit" : "Credit";
                                                                setEditingItemRow({ ...row, account_type: t, account_subtype: SUBTYPES[t][0], normal_balance: nb });
                                                            }}>
                                                                {TYPES.slice(1).map(t => <option key={t} value={t}>{t}</option>)}
                                                            </select>
                                                        </td>
                                                        <td>
                                                            <select className="coa-tpl-inp" value={row.account_subtype} onChange={e => setEditingItemRow({ ...row, account_subtype: e.target.value })}>
                                                                {(SUBTYPES[row.account_type] || []).map(s => <option key={s} value={s}>{s}</option>)}
                                                            </select>
                                                        </td>
                                                        <td>
                                                            <select className="coa-tpl-inp" value={row.normal_balance} onChange={e => setEditingItemRow({ ...row, normal_balance: e.target.value })}>
                                                                <option value="Debit">Dr</option><option value="Credit">Cr</option>
                                                            </select>
                                                        </td>
                                                        <td style={{ textAlign: "center" }}>
                                                            <input type="checkbox" checked={row.is_system} onChange={e => setEditingItemRow({ ...row, is_system: e.target.checked })}/>
                                                        </td>
                                                        <td>
                                                            <div style={{ display: "flex", gap: 2 }}>
                                                                <button className="coa-tpl-act" title="Save" onClick={() => handleSaveItem(row)}><I name="check" size={13} style={{ color: "#16a34a" }}/></button>
                                                                <button className="coa-tpl-act" title="Cancel" onClick={() => setEditingItemRow(null)}><I name="x" size={13} style={{ color: "#ef4444" }}/></button>
                                                            </div>
                                                        </td>
                                                    </>) : (<>
                                                        <td><span style={{ fontFamily: "monospace", fontSize: 12, color, fontWeight: 600 }}>{item.code}</span></td>
                                                        <td style={{ fontWeight: item.account_subtype === "Header" ? 700 : 400 }}>{item.name}</td>
                                                        <td><span className="coa-tpl-type-dot" style={{ background: color }}/> {item.account_type}</td>
                                                        <td style={{ fontSize: 11, color: "#888" }}>{item.account_subtype}</td>
                                                        <td style={{ fontSize: 11, color: "#888" }}>{item.normal_balance === "Debit" ? "Dr" : "Cr"}</td>
                                                        <td style={{ textAlign: "center", fontSize: 11, color: item.is_system ? "#3b82f6" : "#ccc" }}>{item.is_system ? "✓" : ""}</td>
                                                        <td>
                                                            <div style={{ display: "flex", gap: 2 }}>
                                                                <button className="coa-tpl-act" title="Edit" onClick={() => setEditingItemRow({ ...item })}><I name="edit-2" size={12}/></button>
                                                                <button className="coa-tpl-act" title="Delete" onClick={() => handleDeleteItem(item.id)}><I name="trash-2" size={12}/></button>
                                                            </div>
                                                        </td>
                                                    </>)}
                                                </tr>
                                            );
                                        })}

                                        {/* New item inline row */}
                                        {editingItemRow && editingItemRow._new && (
                                            <tr className="coa-tpl-row coa-tpl-row-new">
                                                <td><input className="coa-tpl-inp" value={editingItemRow.code} onChange={e => setEditingItemRow({ ...editingItemRow, code: e.target.value })} placeholder="1000" autoFocus/></td>
                                                <td><input className="coa-tpl-inp coa-tpl-inp-wide" value={editingItemRow.name} onChange={e => setEditingItemRow({ ...editingItemRow, name: e.target.value })} placeholder="Account Name"/></td>
                                                <td>
                                                    <select className="coa-tpl-inp" value={editingItemRow.account_type} onChange={e => {
                                                        const t = e.target.value;
                                                        const nb = (t === "Asset" || t === "Expense") ? "Debit" : "Credit";
                                                        setEditingItemRow({ ...editingItemRow, account_type: t, account_subtype: SUBTYPES[t][0], normal_balance: nb });
                                                    }}>
                                                        {TYPES.slice(1).map(t => <option key={t} value={t}>{t}</option>)}
                                                    </select>
                                                </td>
                                                <td>
                                                    <select className="coa-tpl-inp" value={editingItemRow.account_subtype} onChange={e => setEditingItemRow({ ...editingItemRow, account_subtype: e.target.value })}>
                                                        {(SUBTYPES[editingItemRow.account_type] || []).map(s => <option key={s} value={s}>{s}</option>)}
                                                    </select>
                                                </td>
                                                <td>
                                                    <select className="coa-tpl-inp" value={editingItemRow.normal_balance} onChange={e => setEditingItemRow({ ...editingItemRow, normal_balance: e.target.value })}>
                                                        <option value="Debit">Dr</option><option value="Credit">Cr</option>
                                                    </select>
                                                </td>
                                                <td style={{ textAlign: "center" }}>
                                                    <input type="checkbox" checked={editingItemRow.is_system} onChange={e => setEditingItemRow({ ...editingItemRow, is_system: e.target.checked })}/>
                                                </td>
                                                <td>
                                                    <div style={{ display: "flex", gap: 2 }}>
                                                        <button className="coa-tpl-act" title="Save" onClick={() => handleSaveItem(editingItemRow)}><I name="check" size={13} style={{ color: "#16a34a" }}/></button>
                                                        <button className="coa-tpl-act" title="Cancel" onClick={() => setEditingItemRow(null)}><I name="x" size={13} style={{ color: "#ef4444" }}/></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                        </tbody>
                                    </table>
                                </div>
                                {editingItems.length === 0 && !editingItemRow && (
                                    <div style={{ padding: 30, textAlign: "center", color: "#bbb", fontSize: 13 }}>No accounts yet. Add your first account below.</div>
                                )}
                            </div>

                            <div className="coa-modal-footer">
                                <button className="coa-btn coa-btn-outline" onClick={handleAddItem} disabled={editingItemRow && editingItemRow._new}>
                                    <I name="plus" size={14}/> Add Account
                                </button>
                                <div style={{ flex: 1 }}/>
                                <button className="coa-btn coa-btn-outline" onClick={() => { setTplView("list"); setEditingTpl(null); }}>Back to List</button>
                                <button className="coa-btn coa-btn-primary" onClick={() => { setSelectedTemplate(editingTpl.id); setTplView("list"); loadTemplates(); }}>
                                    Done
                                </button>
                            </div>
                        </>)}

                    </div>
                </div>
            )}

            <style>{`
        .coa-wrap{font-family:'DM Sans',sans-serif;color:#333}

        /* Stats */
        .coa-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px}
        .coa-stat-card{display:flex;align-items:center;gap:14px;background:#fff;border:1px solid #eee;border-radius:12px;padding:18px 20px}
        .coa-stat-icon{width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
        .coa-stat-label{font-size:12px;color:#999;font-weight:500}
        .coa-stat-value{font-size:18px;font-weight:700;color:#222;margin-top:2px}

        /* Toolbar */
        .coa-toolbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:12px}
        .coa-tabs{display:flex;gap:4px;background:#f5f5f5;border-radius:10px;padding:3px}
        .coa-tab{display:flex;align-items:center;gap:6px;padding:7px 14px;border:none;background:none;border-radius:8px;font-family:inherit;font-size:12.5px;font-weight:500;color:#888;cursor:pointer;transition:all .15s}
        .coa-tab:hover{color:#555}
        .coa-tab-on{background:#fff;color:#222;font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,.08)}
        .coa-tab-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
        .coa-tab-count{font-size:10px;background:#eee;padding:1px 6px;border-radius:8px;font-weight:600}
        .coa-toolbar-r{display:flex;gap:8px;align-items:center}
        .coa-search{display:flex;align-items:center;gap:6px;padding:7px 12px;background:#f5f5f5;border-radius:8px;color:#aaa}
        .coa-search input{border:none;background:none;font-family:inherit;font-size:13px;color:#333;outline:none;width:160px}
        .coa-search input::placeholder{color:#ccc}

        /* Buttons */
        .coa-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:8px;font-family:inherit;font-size:12.5px;font-weight:600;border:none;cursor:pointer;transition:all .15s}
        .coa-btn-primary{background:#10b981;color:#fff}
        .coa-btn-primary:hover{background:#059669}
        .coa-btn-primary:disabled{opacity:.5;cursor:not-allowed}
        .coa-btn-outline{background:#fff;color:#555;border:1px solid #ddd}
        .coa-btn-outline:hover{background:#f5f5f5}
        .coa-btn-danger{background:#fef2f2;color:#ef4444;border:1px solid #fecaca}
        .coa-btn-danger:hover{background:#ef4444;color:#fff}

        /* Main layout */
        .coa-main{display:flex;gap:0;min-height:500px}
        .coa-list{flex:1;background:#fff;border:1px solid #eee;border-radius:12px;overflow:hidden;transition:all .2s}
        .coa-list-narrow{border-radius:12px 0 0 12px;border-right:none}

        /* Column headers */
        .coa-col-header{display:flex;align-items:center;gap:8px;padding:10px 16px;background:#fafafa;border-bottom:1px solid #eee;font-size:11px;font-weight:600;color:#aaa;text-transform:uppercase;letter-spacing:.05em}
        .coa-ch-code{width:70px}
        .coa-ch-name{flex:1}
        .coa-ch-bal{width:120px;text-align:right}
        .coa-ch-type{width:130px}
        .coa-ch-norm{width:30px;text-align:center}
        .coa-ch-act{width:70px;text-align:right}

        /* Type groups */
        .coa-type-group{border-bottom:1px solid #f0f0f0}
        .coa-type-group:last-child{border-bottom:none}
        .coa-type-header{display:flex;align-items:center;gap:10px;padding:12px 16px;cursor:pointer;background:#fafafa;transition:background .12s;font-size:13px;font-weight:600;color:#555}
        .coa-type-header:hover{background:#f0f0f0}
        .coa-type-icon{width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center}
        .coa-type-title{flex:1}
        .coa-type-count{font-size:11px;color:#aaa;font-weight:500}
        .coa-type-body{}

        /* Account rows */
        .coa-row{display:flex;align-items:center;gap:8px;padding:10px 16px;cursor:pointer;transition:background .1s;border-bottom:1px solid #f8f8f8;font-size:13px}
        .coa-row:hover{background:#f0fdf4!important}
        .coa-expand{width:22px;height:22px;border:none;background:none;cursor:pointer;color:#aaa;display:flex;align-items:center;justify-content:center;border-radius:4px;flex-shrink:0}
        .coa-expand:hover{background:#e5e7eb;color:#333}
        .coa-code{width:70px;font-weight:600;font-size:12.5px;flex-shrink:0;font-family:'DM Mono',monospace}
        .coa-name{flex:1;font-weight:500;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .coa-header{font-weight:700;color:#222}
        .coa-balance{width:120px;text-align:right;font-weight:600;font-size:12.5px;flex-shrink:0}
        .coa-type-chip{display:inline-flex;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:600;flex-shrink:0}
        .coa-normal{width:30px;text-align:center;font-size:11px;font-weight:700;flex-shrink:0}
        .coa-actions{display:flex;gap:2px;width:70px;justify-content:flex-end;opacity:0;transition:opacity .12s}
        .coa-row:hover .coa-actions{opacity:1}
        .coa-act-btn{width:28px;height:28px;border:none;background:none;cursor:pointer;color:#aaa;display:flex;align-items:center;justify-content:center;border-radius:6px}
        .coa-act-btn:hover{background:#e5e7eb;color:#333}
        .coa-act-del:hover{background:#fef2f2;color:#ef4444}
        .coa-sys{font-size:10px;color:#aaa;font-weight:500;width:70px;text-align:right}

        /* Detail Panel */
        .coa-panel{width:360px;background:#fff;border:1px solid #eee;border-radius:0 12px 12px 0;overflow-y:auto;flex-shrink:0}
        .coa-panel-header{display:flex;justify-content:space-between;align-items:flex-start;padding:20px;border-bottom:1px solid #eee}
        .coa-panel-code{font-size:12px;font-weight:700;margin-bottom:2px}
        .coa-panel-name{font-size:16px;font-weight:700;color:#222;margin:0}
        .coa-panel-close{width:30px;height:30px;border:1px solid #eee;background:#fff;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#aaa}
        .coa-panel-close:hover{background:#f5f5f5;color:#333}
        .coa-panel-body{padding:20px}
        .coa-panel-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:16px}
        .coa-panel-subtype{font-size:11px;color:#888;background:#f5f5f5;padding:2px 8px;border-radius:6px}
        .coa-panel-status{font-size:11px;font-weight:600;padding:2px 8px;border-radius:6px}
        .coa-active{background:#dcfce7;color:#16a34a}
        .coa-inactive{background:#f3f4f6;color:#9ca3af}
        .coa-panel-sys{font-size:10px;background:#dbeafe;color:#3b82f6;padding:2px 8px;border-radius:6px;font-weight:600}

        .coa-panel-balance-box{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin-bottom:16px;text-align:center}
        .coa-panel-balance-label{font-size:11px;color:#888;font-weight:500;margin-bottom:4px}
        .coa-panel-balance-val{font-size:24px;font-weight:700}
        .coa-panel-balance-norm{font-size:11px;color:#888;margin-top:6px}

        .coa-panel-details{margin-bottom:20px}
        .coa-panel-detail{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f5f5f5;font-size:13px}
        .coa-detail-label{color:#999;font-weight:500}
        .coa-detail-val{color:#333;font-weight:500;text-align:right}

        .coa-panel-actions{display:flex;gap:8px}

        /* Empty */
        .coa-empty{text-align:center;padding:60px 20px;color:#ccc}
        .coa-empty h3{font-size:16px;color:#888;margin:12px 0 4px;font-weight:600}
        .coa-empty p{font-size:13px;color:#aaa}

        /* Modal */
        .coa-modal-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.4);z-index:999;display:flex;align-items:center;justify-content:center}
        .coa-modal{background:#fff;border-radius:14px;width:560px;max-width:95vw;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.15)}
        .coa-modal-header{display:flex;justify-content:space-between;align-items:center;padding:20px 24px;border-bottom:1px solid #eee}
        .coa-modal-header h3{margin:0;font-size:16px;font-weight:700}
        .coa-modal-body{padding:24px}
        .coa-modal-footer{display:flex;justify-content:flex-end;gap:8px;padding:16px 24px;border-top:1px solid #eee}

        .coa-form-row{display:flex;gap:12px;margin-bottom:14px}
        .coa-form-group{display:flex;flex-direction:column;gap:4px}
        .coa-form-group label{font-size:12px;font-weight:600;color:#555}
        .coa-form-group input,.coa-form-group select,.coa-form-group textarea{padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-family:inherit;font-size:13px;color:#333;outline:none;transition:border .15s}
        .coa-form-group input:focus,.coa-form-group select:focus,.coa-form-group textarea:focus{border-color:#10b981}
        .coa-form-group textarea{resize:vertical}

        /* Responsive */
        @media(max-width:900px){
          .coa-stats{grid-template-columns:repeat(2,1fr)}
          .coa-toolbar{flex-direction:column;align-items:stretch}
          .coa-tabs{overflow-x:auto}
          .coa-panel{width:100%;border-radius:0 0 12px 12px}
          .coa-main{flex-direction:column}
          .coa-list-narrow{border-radius:12px 12px 0 0;border-right:1px solid #eee;border-bottom:none}
        }

        /* Template Modal */
        .coa-tpl-modal{background:#fff;border-radius:14px;width:680px;max-width:95vw;max-height:90vh;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.15);display:flex;flex-direction:column;transition:width .2s}
        .coa-tpl-wide{width:920px}
        .coa-tpl-body{padding:16px 24px;overflow-y:auto;display:flex;flex-direction:column;gap:12px;flex:1}
        .coa-tpl-card{border:2px solid #eee;border-radius:12px;padding:16px;transition:all .15s}
        .coa-tpl-card:hover{border-color:#a7f3d0;background:#f0fdf4}
        .coa-tpl-sel{border-color:#10b981!important;background:#f0fdf4!important}
        .coa-tpl-top{display:flex;align-items:center;gap:12px;margin-bottom:8px}
        .coa-tpl-flag{font-size:32px;line-height:1}
        .coa-tpl-info{flex:1}
        .coa-tpl-name{font-size:14px;font-weight:700;color:#222}
        .coa-tpl-currency{font-size:11px;color:#888;font-weight:500;margin-top:1px;display:flex;align-items:center;gap:4px}
        .coa-tpl-badge{font-size:9px;padding:1px 6px;border-radius:4px;font-weight:600}
        .coa-tpl-badge-g{background:#dbeafe;color:#3b82f6}
        .coa-tpl-badge-c{background:#dcfce7;color:#16a34a}
        .coa-tpl-check{width:24px;height:24px;border-radius:50%;border:2px solid #ddd;display:flex;align-items:center;justify-content:center;color:#ddd;flex-shrink:0}
        .coa-tpl-check-on{border-color:#10b981;color:#10b981}
        .coa-tpl-desc{font-size:12px;color:#777;line-height:1.5;margin-bottom:10px}
        .coa-tpl-breakdown{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
        .coa-tpl-chip{font-size:10px;font-weight:600;padding:2px 8px;border-radius:6px}
        .coa-tpl-total{font-size:10px;color:#aaa;font-weight:500;margin-left:4px}
        .coa-tpl-edit-btn{width:28px;height:28px;border:1px solid #ddd;background:#fff;border-radius:7px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#888;transition:all .15s}
        .coa-tpl-edit-btn:hover{background:#f0fdf4;border-color:#10b981;color:#10b981}

        /* Template Editor */
        .coa-tpl-editor-body{flex:1;overflow-y:auto;padding:0}
        .coa-tpl-tbl-wrap{overflow-x:auto}
        .coa-tpl-tbl{width:100%;border-collapse:collapse;font-size:12px}
        .coa-tpl-tbl thead th{padding:8px 10px;text-align:left;font-weight:600;color:#888;font-size:10px;text-transform:uppercase;letter-spacing:.5px;background:#fafafa;border-bottom:1px solid #eee;position:sticky;top:0;z-index:1}
        .coa-tpl-row td{padding:6px 10px;border-bottom:1px solid #f3f3f3;vertical-align:middle}
        .coa-tpl-row:hover td{background:#f9fafb}
        .coa-tpl-row-hdr td{background:#f8fafc}
        .coa-tpl-row-new td{background:#f0fdf4}
        .coa-tpl-inp{width:100%;padding:4px 6px;border:1px solid #ddd;border-radius:5px;font-size:12px;font-family:inherit;outline:none}
        .coa-tpl-inp:focus{border-color:#10b981}
        .coa-tpl-inp-wide{min-width:120px}
        .coa-tpl-act{width:24px;height:24px;border:none;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:5px;color:#999;padding:0}
        .coa-tpl-act:hover{background:#f3f4f6;color:#333}
        .coa-tpl-type-dot{display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:4px;vertical-align:middle}
      `}</style>
        </div>
    );
}
