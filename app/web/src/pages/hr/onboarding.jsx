import { useState, useEffect, useCallback, useRef } from "react";
import { I } from "../../layouts/ERPLayout";

const API_URL = (import.meta.env.VITE_API_BASE||"")+"/api/execute";
async function api(action, body = {}) {
    const session = localStorage.getItem("ls_session");
    const res = await fetch(`${API_URL}?action=${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session}` } : {}) },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`API ${action} failed`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "failed");
    return json.data;
}

function fmtDate(d) {
    if (!d) return "—";
    const dt = new Date((d || "").substring(0, 10) + "T00:00:00");
    return isNaN(dt) ? d : dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const COLORS = ["#f59e0b", "#6366f1", "#0ea5e9", "#8b5cf6", "#ef4444", "#10b981", "#ec4899"];
const ICONS = ["clipboard", "file-text", "briefcase", "book-open", "monitor", "shield", "award"];


export default function OnboardingTab({ employees = [] }) {
    const [view, setView] = useState("board");
    const [checklists, setChecklists] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [selectedCl, setSelectedCl] = useState(null);
    const [clItems, setClItems] = useState([]);
    const [showNewModal, setShowNewModal] = useState(false);
    const [dragCard, setDragCard] = useState(null);
    const [dragOver, setDragOver] = useState(null);
    const [allItemsMap, setAllItemsMap] = useState({}); // checklist_id -> items[]
    const [cardColumns, setCardColumns] = useState({}); // explicit column overrides from drag
    const boardRef = useRef(null);
    const colRefs = useRef({});
    const openChecklistRef = useRef(null);

    const loadChecklists = useCallback(async () => {
        try { const d = await api("get_onboarding_checklists", { status: "" }); setChecklists(d.checklists || []); } catch { setChecklists([]); }
    }, []);
    const loadTemplates = useCallback(async () => {
        try { const d = await api("get_onboarding_templates"); setTemplates(d.templates || []); } catch { setTemplates([]); }
    }, []);
    const loadAllItems = useCallback(async (cls) => {
        const map = {};
        for (const cl of cls) {
            try { const d = await api("get_onboarding_items", { checklist_id: cl.id }); map[cl.id] = d.items || []; } catch { map[cl.id] = []; }
        }
        setAllItemsMap(map);
    }, []);
    useEffect(() => { loadChecklists(); loadTemplates(); }, [loadChecklists, loadTemplates]);
    useEffect(() => { if (checklists.length > 0) loadAllItems(checklists); else setAllItemsMap({}); }, [checklists, loadAllItems]);

    const openChecklist = async (cl) => {
        setSelectedCl(cl);
        try { const d = await api("get_onboarding_items", { checklist_id: cl.id }); setClItems(d.items || []); } catch { setClItems([]); }
    };
    openChecklistRef.current = openChecklist;

    const startOnboarding = async (employeeId, targetDate) => {
        setShowNewModal(false);
        try {
            // Create checklist with no template
            const d = await api("create_onboarding_checklist", {
                employee_id: employeeId, template_id: "",
                start_date: new Date().toISOString().slice(0, 10), target_date: targetDate || "",
            });
            const clId = d.id;
            if (!clId) throw new Error("No checklist ID returned");

            // Add items from ALL templates
            let sortOrder = 0;
            for (const tpl of templates) {
                try {
                    const td = await api("get_template_items", { template_id: tpl.id });
                    for (const item of (td.items || [])) {
                        await api("add_onboarding_item", {
                            checklist_id: clId, title: item.title,
                            category: tpl.name, // category = template name for grouping
                            required: item.required, sort_order: sortOrder++,
                        });
                    }
                } catch {}
            }
            loadChecklists();
        } catch (e) { alert("Failed: " + e.message); }
    };

    const toggleItem = async (item) => {
        const newVal = !item.completed;
        const updated = clItems.map(it => it.id === item.id ? { ...it, completed: newVal } : it);
        setClItems(updated);
        setAllItemsMap(prev => ({ ...prev, [selectedCl.id]: updated }));
        // Clear explicit column assignment so heuristic placement takes over
        setCardColumns(prev => { const n = { ...prev }; delete n[selectedCl.id]; return n; });
        try { await api("toggle_onboarding_item", { id: item.id, completed: newVal }); } catch {}
        const total = updated.length;
        const done = updated.filter(i => i.completed).length;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        const newStatus = pct === 100 ? "Completed" : "In Progress";
        try { await api("update_onboarding_status", { id: selectedCl.id, status: newStatus, progress: pct }); } catch {}
        setSelectedCl(prev => ({ ...prev, progress: pct, status: newStatus, completed_items: done, total_items: total }));
        loadChecklists();
    };

    const addItem = async (title, category) => {
        if (!title.trim()) return;
        try {
            const d = await api("add_onboarding_item", { checklist_id: selectedCl.id, title, category: category || "Custom", required: false, sort_order: clItems.length });
            const newItem = { ...d, completed: false, category: category || "Custom" };
            setClItems(prev => [...prev, newItem]);
            setAllItemsMap(prev => ({ ...prev, [selectedCl.id]: [...(prev[selectedCl.id] || []), newItem] }));
            setSelectedCl(prev => ({ ...prev, total_items: (prev.total_items || 0) + 1 }));
        } catch (e) { alert(e.message); }
    };

    const deleteCl = async (id) => {
        if (!confirm("Delete this onboarding?")) return;
        try { await api("delete_onboarding_checklist", { id }); setSelectedCl(null); loadChecklists(); } catch (e) { alert(e.message); }
    };

    /* Mouse-based drag & drop (replaces unreliable HTML5 DnD) */
    const dragState = useRef({ active: false, card: null, ghost: null, startX: 0, startY: 0, didMove: false });
    const performDropRef = useRef(null);

    const getColAtPoint = (x, y) => {
        for (const [colId, el] of Object.entries(colRefs.current)) {
            if (!el) continue;
            const r = el.getBoundingClientRect();
            if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return colId;
        }
        return null;
    };

    const onCardMouseDown = useCallback((e, cl) => {
        if (e.button !== 0) return;
        const cardEl = e.currentTarget;
        dragState.current = { active: true, card: cl, ghost: null, cardEl, startX: e.clientX, startY: e.clientY, didMove: false };
        e.preventDefault();
    }, []);

    const performDrop = async (card, targetColId) => {
        const items = allItemsMap[card.id] || [];

        const tplNames = templates.map(t => t.name);
        let targetTplIdx = -1;
        if (targetColId !== "__not_started__" && targetColId !== "__completed__") {
            const tpl = templates.find(t => String(t.id) === String(targetColId));
            if (tpl) targetTplIdx = tplNames.indexOf(tpl.name);
        }

        const updated = items.map(item => {
            if (targetColId === "__completed__") return { ...item, completed: true };
            if (targetColId === "__not_started__") return { ...item, completed: false };
            const itemTplIdx = tplNames.indexOf(item.category);
            if (itemTplIdx === -1) return item;
            return { ...item, completed: itemTplIdx < targetTplIdx };
        });

        // Store explicit column assignment so colMap places it correctly
        setCardColumns(prev => ({ ...prev, [card.id]: targetColId }));
        setAllItemsMap(prev => ({ ...prev, [card.id]: updated }));

        for (const item of updated) {
            const orig = items.find(i => i.id === item.id);
            if (orig && orig.completed !== item.completed) {
                try { await api("toggle_onboarding_item", { id: item.id, completed: item.completed }); } catch {}
            }
        }

        const total = updated.length;
        const done = updated.filter(i => i.completed).length;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        const newStatus = pct === 100 ? "Completed" : targetColId === "__not_started__" ? "In Progress" : "In Progress";
        try { await api("update_onboarding_status", { id: card.id, status: newStatus, progress: pct }); } catch {}

        loadChecklists();
        if (selectedCl?.id === card.id) {
            setClItems(updated);
            setSelectedCl(prev => ({ ...prev, progress: pct, status: newStatus, completed_items: done, total_items: total }));
        }
    };
    performDropRef.current = performDrop;

    useEffect(() => {
        let lastHovCol = null;

        const onMouseMove = (e) => {
            const ds = dragState.current;
            if (!ds.active) return;
            const dx = e.clientX - ds.startX, dy = e.clientY - ds.startY;
            if (!ds.didMove && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
            ds.didMove = true;
            if (!ds.ghost) {
                const ghost = ds.cardEl.cloneNode(true);
                ghost.className = "ob-card ob-card-ghost";
                const rect = ds.cardEl.getBoundingClientRect();
                ghost.style.width = rect.width + "px";
                ds.offsetX = ds.startX - rect.left;
                ds.offsetY = ds.startY - rect.top;
                document.body.appendChild(ghost);
                ds.ghost = ghost;
                ds.cardEl.style.opacity = "0.3";
                setDragCard(ds.card);
            }
            // Direct DOM update for ghost position (no React re-render, GPU composited)
            ds.ghost.style.transform = `translate(${e.clientX - ds.offsetX}px, ${e.clientY - ds.offsetY}px)`;

            // Only trigger React re-render when hovered column changes
            const hovCol = getColAtPoint(e.clientX, e.clientY);
            if (hovCol !== lastHovCol) {
                lastHovCol = hovCol;
                setDragOver(hovCol);
            }
        };

        const onMouseUp = (e) => {
            const ds = dragState.current;
            if (!ds.active) return;
            const card = ds.card;
            const didMove = ds.didMove;
            if (ds.ghost) { ds.ghost.remove(); ds.ghost = null; }
            if (ds.cardEl) ds.cardEl.style.opacity = "";
            ds.active = false;
            ds.card = null;
            ds.didMove = false;
            lastHovCol = null;
            setDragCard(null);
            setDragOver(null);

            if (!didMove) {
                if (openChecklistRef.current) openChecklistRef.current(card);
                return;
            }

            const targetColId = getColAtPoint(e.clientX, e.clientY);
            if (!targetColId || !card) return;
            if (performDropRef.current) performDropRef.current(card, targetColId);
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
        return () => { document.removeEventListener("mousemove", onMouseMove); document.removeEventListener("mouseup", onMouseUp); };
    }, []);

    /* Build columns: Not Started → [templates] → Completed */
    const columns = [
        { id: "__not_started__", label: "Not Started", icon: "user-plus", color: "#9ca3af" },
        ...templates.map((t, i) => ({ id: t.id, label: t.name, icon: ICONS[i % ICONS.length], color: COLORS[i % COLORS.length], itemCount: t.item_count })),
        { id: "__completed__", label: "Completed", icon: "check-circle", color: "#22c55e" },
    ];

    /* Group checklists into columns based on explicit assignment or item progress */
    const colMap = {};
    columns.forEach(c => { colMap[c.id] = []; });
    checklists.forEach(cl => {
        const items = allItemsMap[cl.id] || [];

        // If card was explicitly dropped on a column, use that assignment
        const override = cardColumns[cl.id];
        if (override != null) {
            const matchCol = columns.find(c => String(c.id) === String(override));
            if (matchCol && colMap[matchCol.id]) {
                colMap[matchCol.id].push(cl);
                return;
            }
        }

        if (items.length === 0 || (cl.progress === 0 && cl.completed_items === 0 && !items.some(i => i.completed))) {
            colMap["__not_started__"].push(cl);
            return;
        }
        if (cl.status === "Completed" || cl.progress === 100 || items.every(i => i.completed)) {
            colMap["__completed__"].push(cl);
            return;
        }
        // Find first template (column) with incomplete items
        let placed = false;
        for (const tpl of templates) {
            const tplItems = items.filter(i => i.category === tpl.name);
            if (tplItems.length > 0 && tplItems.some(i => !i.completed)) {
                if (colMap[tpl.id]) colMap[tpl.id].push(cl);
                placed = true;
                break;
            }
        }
        if (!placed) colMap["__not_started__"].push(cl);
    });

    const onboardedIds = new Set(checklists.map(c => c.employee_id));
    const availableEmps = employees.filter(e => !onboardedIds.has(e.id));

    if (view === "templates") return <TemplatesView templates={templates} onBack={() => { setView("board"); loadTemplates(); }} onReload={loadTemplates} />;

    return (<div className="ob-wrap">
        {/* Top bar */}
        <div className="ob-topbar">
            <div className="ob-topbar-left">

            </div>
            <div className="ob-topbar-right">
                <button className="ob-btn-ghost" onClick={() => setView("templates")}><I name="settings" size={14} /> Templates</button>
                <button className="ob-btn-primary" disabled={templates.length === 0} onClick={() => setShowNewModal(true)}><I name="plus" size={14} /> New Onboarding</button>
            </div>
        </div>

        {templates.length === 0 ? (
            <div className="ob-empty-board">
                <div className="ob-empty-icon"><I name="layout" size={32} /></div>
                <h3>Create a template first</h3>
                <p>Templates become columns on the board. Add documents and stages that employees need to complete.</p>
            </div>
        ) : (
            <div className="ob-board" ref={boardRef}>
                {columns.map(col => {
                    const cards = colMap[col.id] || [];
                    const isOver = dragOver != null && String(dragOver) === String(col.id);
                    return (
                        <div key={col.id} className={`ob-col ${isOver ? "ob-col-over" : ""}`}
                             ref={el => { colRefs.current[col.id] = el; }}
                        >
                            {/* Column header */}
                            <div className="ob-col-head">
                                <div className="ob-col-dot" style={{ background: col.color }} />
                                <span className="ob-col-title">{col.label}</span>
                                <span className="ob-col-count">{cards.length}</span>
                            </div>

                            {/* Cards */}
                            <div className="ob-col-body">
                                {cards.length === 0 ? (
                                    <div className="ob-col-empty">
                                        {col.id === "__not_started__" ? "New employees go here" : col.id === "__completed__" ? "Fully onboarded" : "Drag employees here"}
                                    </div>
                                ) : cards.map(cl => {
                                    const isDragging = dragCard?.id === cl.id;
                                    const isOverdue = cl.status !== "Completed" && cl.target_date && new Date(cl.target_date) < new Date();
                                    const isSelected = selectedCl?.id === cl.id;
                                    return (
                                        <div key={cl.id}
                                             className={`ob-card ${isDragging ? "ob-card-drag" : ""} ${isOverdue ? "ob-card-overdue" : ""} ${isSelected ? "ob-card-selected" : ""}`}
                                             onMouseDown={e => onCardMouseDown(e, cl)}
                                        >
                                            <div className="ob-card-top">
                                                <div className="ob-card-av" style={{ background: col.color + "14", color: col.color }}>
                                                    {(cl.first_name?.[0] || "") + (cl.last_name?.[0] || "")}
                                                </div>
                                                <div className="ob-card-info">
                                                    <div className="ob-card-name">{cl.first_name} {cl.last_name}</div>
                                                    <div className="ob-card-pos">{cl.position || cl.department || "—"}</div>
                                                </div>
                                                <div className="ob-card-grip"><I name="grip-vertical" size={11} /></div>
                                            </div>
                                            {/* Progress */}
                                            <div className="ob-card-bar-wrap">
                                                <div className="ob-card-bar"><div className="ob-card-fill" style={{ width: cl.progress + "%", background: cl.progress === 100 ? "#22c55e" : col.color }} /></div>
                                                <span className="ob-card-pct">{cl.progress}%</span>
                                            </div>
                                            <div className="ob-card-meta">
                                                <span><I name="check-square" size={10} /> {cl.completed_items}/{cl.total_items}</span>
                                                {isOverdue && <span className="ob-card-overdue-txt"><I name="alert-circle" size={10} /> Overdue</span>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        )}

        {/* Checklist modal */}
        {selectedCl && (
            <ChecklistPanel cl={selectedCl} items={clItems} templates={templates}
                            onToggle={toggleItem} onAddItem={addItem}
                            onDelete={() => deleteCl(selectedCl.id)}
                            onClose={() => setSelectedCl(null)}
            />
        )}

        {showNewModal && <NewModal employees={availableEmps} onStart={startOnboarding} onClose={() => setShowNewModal(false)} />}
        <style>{CSS}</style>
    </div>);
}

/* ================================================================
   CHECKLIST SIDE PANEL
================================================================ */
function ChecklistPanel({ cl, items, templates, onToggle, onAddItem, onDelete, onClose }) {
    const [newTitle, setNewTitle] = useState("");
    const [newCat, setNewCat] = useState(templates[0]?.name || "Custom");
    const done = items.filter(i => i.completed).length;
    const total = items.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const isOverdue = cl.status !== "Completed" && cl.target_date && new Date(cl.target_date) < new Date();

    // Group items by category (template name)
    const grouped = {};
    items.forEach(i => { if (!grouped[i.category]) grouped[i.category] = []; grouped[i.category].push(i); });
    // Order: templates first (in order), then any extras
    const tplNames = templates.map(t => t.name);
    const orderedCats = [...tplNames.filter(n => grouped[n]), ...Object.keys(grouped).filter(k => !tplNames.includes(k))];

    return (<>
        <div className="ob-modal-bg" onClick={onClose} />
        <div className="ob-modal ob-modal-cl">
            <div className="ob-modal-cl-head">
                <div className="sp-av" style={{ background: pct === 100 ? "#dcfce7" : "#fef3c7", color: pct === 100 ? "#22c55e" : "#f59e0b" }}>
                    {(cl.first_name?.[0] || "") + (cl.last_name?.[0] || "")}
                </div>
                <div className="sp-head-info">
                    <h3 className="ob-modal-t">{cl.first_name} {cl.last_name}</h3>
                    <p className="ob-modal-sub">{cl.position || ""}{cl.department ? ` · ${cl.department}` : ""}</p>
                </div>
                <button className="sp-close" onClick={onClose}><I name="x" size={18} /></button>
            </div>

            <div className="sp-progress">
                <div className="sp-pbar"><div className="sp-pfill" style={{ width: pct + "%", background: pct === 100 ? "#22c55e" : "#f59e0b" }} /></div>
                <div className="sp-pinfo"><span>{done} of {total} completed</span><span className="sp-ppct">{pct}%</span></div>
            </div>

            <div className="sp-dates">
                <span><I name="play" size={11} /> Started {fmtDate(cl.start_date)}</span>
                {cl.target_date && <span className={isOverdue ? "sp-overdue" : ""}><I name="flag" size={11} /> Target {fmtDate(cl.target_date)}</span>}
                {cl.completed_date && <span style={{ color: "#22c55e" }}><I name="check-circle" size={11} /> Done {fmtDate(cl.completed_date)}</span>}
            </div>

            <div className="ob-modal-cl-scroll">
                {items.length === 0 ? (
                    <div className="sp-empty">No items. Add templates with items first, then start onboarding.</div>
                ) : orderedCats.map((cat, ci) => {
                    const catItems = grouped[cat];
                    const catDone = catItems.filter(i => i.completed).length;
                    const catColor = COLORS[ci % COLORS.length];
                    return (
                        <div key={cat} className="sp-group">
                            <div className="sp-group-head">
                                <div className="sp-group-icon" style={{ background: catColor + "14", color: catColor }}>
                                    <I name={ICONS[ci % ICONS.length]} size={13} />
                                </div>
                                <span className="sp-group-title">{cat}</span>
                                <span className="sp-group-count" style={{ color: catDone === catItems.length ? "#22c55e" : "#aaa" }}>
                  {catDone}/{catItems.length}
                </span>
                            </div>
                            <div className="sp-items">
                                {catItems.map(item => (
                                    <div key={item.id} className={`sp-item ${item.completed ? "sp-item-done" : ""}`} onClick={() => onToggle(item)}>
                                        <div className={`sp-ck ${item.completed ? "sp-ck-on" : ""}`}>
                                            {item.completed && <I name="check" size={12} />}
                                        </div>
                                        <div className="sp-item-body">
                                            <span className={`sp-item-title ${item.completed ? "sp-item-struck" : ""}`}>{item.title}</span>
                                        </div>
                                        {item.required && !item.completed && <span className="sp-item-req">Required</span>}
                                        {item.completed_at && <span className="sp-item-date">{fmtDate(item.completed_at)}</span>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}

                {cl.status !== "Completed" && (
                    <div className="sp-add-section">
                        <div className="sp-add">
                            <input className="sp-add-inp" placeholder="Add custom item..." value={newTitle}
                                   onChange={e => setNewTitle(e.target.value)}
                                   onKeyDown={e => { if (e.key === "Enter" && newTitle.trim()) { onAddItem(newTitle.trim(), newCat); setNewTitle(""); } }}
                            />
                            <select className="sp-add-cat" value={newCat} onChange={e => setNewCat(e.target.value)}>
                                {templates.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                                <option value="Custom">Custom</option>
                            </select>
                            <button className="sp-add-btn" disabled={!newTitle.trim()} onClick={() => { onAddItem(newTitle.trim(), newCat); setNewTitle(""); }}>
                                <I name="plus" size={14} />
                            </button>
                        </div>
                    </div>
                )}

                <DocumentsSection checklistId={cl.id} readOnly={cl.status === "Completed"} />
            </div>

            <div className="ob-modal-btns" style={{ justifyContent: "space-between" }}>
                <button className="ob-btn-danger-sm" onClick={onDelete}><I name="trash-2" size={13} /> Delete</button>
                <button className="ob-btn-ghost" onClick={onClose}>Close</button>
            </div>
        </div>
    </>);
}

/* ================================================================
   DOCUMENTS SECTION — file uploads attached to a checklist
================================================================ */
const MAX_DOC_BYTES = 10 * 1024 * 1024; // keep in sync with server maxOnboardingUpload

function fmtBytes(n) {
    if (!n && n !== 0) return "";
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
}

function docIcon(mime = "", name = "") {
    const m = mime.toLowerCase(), n = name.toLowerCase();
    if (m.startsWith("image/")) return "image";
    if (m === "application/pdf" || n.endsWith(".pdf")) return "file-text";
    if (m.includes("sheet") || n.endsWith(".xlsx") || n.endsWith(".csv")) return "grid";
    return "file";
}

function DocumentsSection({ checklistId, readOnly }) {
    const [docs, setDocs] = useState([]);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const fileRef = useRef(null);

    const load = useCallback(async () => {
        try { const d = await api("get_onboarding_documents", { checklist_id: checklistId }); setDocs(d.documents || []); }
        catch { setDocs([]); }
    }, [checklistId]);

    useEffect(() => { load(); }, [load]);

    const onPick = async (e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = ""; // allow re-selecting the same file later
        setErr("");
        for (const file of files) {
            if (file.size > MAX_DOC_BYTES) { setErr(`"${file.name}" exceeds the 10 MB limit`); continue; }
            setBusy(true);
            try {
                const b64 = await new Promise((resolve, reject) => {
                    const r = new FileReader();
                    r.onload = () => resolve(String(r.result).split(",")[1] || "");
                    r.onerror = () => reject(new Error("read failed"));
                    r.readAsDataURL(file);
                });
                await api("upload_onboarding_document", {
                    checklist_id: checklistId,
                    file_name: file.name,
                    mime_type: file.type || "application/octet-stream",
                    file_data: b64,
                });
            } catch (ex) { setErr(ex.message || "upload failed"); }
        }
        setBusy(false);
        load();
    };

    const download = async (doc) => {
        try {
            const full = await api("download_onboarding_document", { id: doc.id });
            const byteStr = atob(full.file_data || "");
            const bytes = new Uint8Array(byteStr.length);
            for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
            const url = URL.createObjectURL(new Blob([bytes], { type: doc.mime_type || "application/octet-stream" }));
            const a = document.createElement("a");
            a.href = url; a.download = doc.file_name; document.body.appendChild(a); a.click();
            a.remove(); URL.revokeObjectURL(url);
        } catch (ex) { setErr(ex.message || "download failed"); }
    };

    const remove = async (doc) => {
        if (!window.confirm(`Delete "${doc.file_name}"?`)) return;
        try { await api("delete_onboarding_document", { id: doc.id }); load(); }
        catch (ex) { setErr(ex.message || "delete failed"); }
    };

    return (
        <div className="sp-docs">
            <div className="sp-docs-head">
                <div className="sp-group-icon" style={{ background: "#6366f114", color: "#6366f1" }}><I name="paperclip" size={13} /></div>
                <span className="sp-group-title">Documents</span>
                <span className="sp-group-count" style={{ color: "#aaa" }}>{docs.length}</span>
                {!readOnly && (
                    <button className="sp-doc-upload" onClick={() => fileRef.current?.click()} disabled={busy}>
                        <I name={busy ? "loader" : "upload"} size={13} /> {busy ? "Uploading…" : "Upload"}
                    </button>
                )}
                <input ref={fileRef} type="file" multiple hidden onChange={onPick} />
            </div>

            {err && <div className="sp-doc-err">{err}</div>}

            {docs.length === 0 ? (
                <div className="sp-doc-empty">No documents yet. Attach signed contracts, IDs, or government forms.</div>
            ) : (
                <div className="sp-doc-list">
                    {docs.map(doc => (
                        <div key={doc.id} className="sp-doc" onClick={() => download(doc)}>
                            <div className="sp-doc-ic"><I name={docIcon(doc.mime_type, doc.file_name)} size={15} /></div>
                            <div className="sp-doc-body">
                                <span className="sp-doc-name">{doc.file_name}</span>
                                <span className="sp-doc-meta">
                                    {fmtBytes(doc.file_size)}{doc.uploaded_by_name ? ` · ${doc.uploaded_by_name}` : ""}{doc.created_at ? ` · ${fmtDate(doc.created_at)}` : ""}
                                </span>
                            </div>
                            <button className="sp-doc-act" title="Download" onClick={e => { e.stopPropagation(); download(doc); }}><I name="download" size={14} /></button>
                            {!readOnly && <button className="sp-doc-act sp-doc-del" title="Delete" onClick={e => { e.stopPropagation(); remove(doc); }}><I name="trash-2" size={14} /></button>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ================================================================
   NEW ONBOARDING MODAL
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

function NewModal({ employees, onStart, onClose }) {
    const [empId, setEmpId] = useState("");
    const [targetDate, setTargetDate] = useState("");
    return (<>
        <div className="ob-modal-bg" onClick={onClose} />
        <div className="ob-modal">
            <h3 className="ob-modal-t">Start Onboarding</h3>
            <p className="ob-modal-sub">Employee will be placed in "Not Started" with all template items assigned automatically.</p>
            <div className="ob-modal-fields">
                <div><label className="ob-lbl">Employee <span className="ob-req">*</span></label>
                    <EmployeePicker employees={employees} value={empId} onChange={setEmpId} />
                </div>
                <div><label className="ob-lbl">Target Completion Date</label>
                    <input type="date" className="ob-inp" value={targetDate} onChange={e => setTargetDate(e.target.value)} />
                </div>
            </div>
            <div className="ob-modal-btns">
                <button className="ob-btn-ghost" onClick={onClose}>Cancel</button>
                <button className="ob-btn-primary" disabled={!empId} onClick={() => onStart(empId, targetDate)}>Start Onboarding</button>
            </div>
        </div>
    </>);
}

/* ================================================================
   TEMPLATES VIEW
================================================================ */
function TemplatesView({ templates, onBack, onReload }) {
    const [editing, setEditing] = useState(null);
    const [tplItems, setTplItems] = useState([]);
    const [form, setForm] = useState({ name: "", description: "", category: "General", is_default: false });
    const [newTitle, setNewTitle] = useState("");
    const [dragIdx, setDragIdx] = useState(null);
    const [dragOverIdx, setDragOverIdx] = useState(null);
    const [tplDragIdx, setTplDragIdx] = useState(null);
    const [tplDragOverIdx, setTplDragOverIdx] = useState(null);

    const openTpl = async (tpl) => {
        setEditing(tpl);
        setForm({ name: tpl.name, description: tpl.description || "", category: tpl.category, is_default: tpl.is_default });
        try { const d = await api("get_template_items", { template_id: tpl.id }); setTplItems(d.items || []); } catch { setTplItems([]); }
    };
    const createTpl = async () => {
        try { const d = await api("create_onboarding_template", { name: "New Template", category: "General" }); onReload(); openTpl({ ...d, item_count: 0 }); } catch (e) { alert(e.message); }
    };
    const saveTpl = async () => {
        if (!editing) return;
        try { await api("update_onboarding_template", { id: editing.id, ...form }); onReload(); } catch (e) { alert(e.message); }
    };
    const deleteTpl = async (id) => {
        if (!confirm("Delete this template?")) return;
        try { await api("delete_onboarding_template", { id }); setEditing(null); onReload(); } catch (e) { alert(e.message); }
    };
    const addItem = async () => {
        if (!newTitle.trim() || !editing) return;
        try { const d = await api("save_template_item", { template_id: editing.id, title: newTitle.trim(), category: "General", required: true, sort_order: tplItems.length }); setTplItems(prev => [...prev, d]); setNewTitle(""); onReload(); } catch (e) { alert(e.message); }
    };
    const deleteItem = async (id) => {
        try { await api("delete_template_item", { id }); setTplItems(prev => prev.filter(i => i.id !== id)); onReload(); } catch {}
    };

    /* Template item drag & drop reorder */
    const handleItemDragStart = (e, idx) => { setDragIdx(idx); e.dataTransfer.effectAllowed = "move"; };
    const handleItemDragOver = (e, idx) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverIdx(idx); };
    const handleItemDragEnd = () => { setDragIdx(null); setDragOverIdx(null); };
    const handleItemDrop = async (e, toIdx) => {
        e.preventDefault();
        if (dragIdx === null || dragIdx === toIdx) { setDragIdx(null); setDragOverIdx(null); return; }
        const reordered = [...tplItems];
        const [moved] = reordered.splice(dragIdx, 1);
        reordered.splice(toIdx, 0, moved);
        setTplItems(reordered);
        setDragIdx(null);
        setDragOverIdx(null);
        for (let i = 0; i < reordered.length; i++) {
            try { await api("save_template_item", { id: reordered[i].id, template_id: editing.id, title: reordered[i].title, category: reordered[i].category || "General", required: reordered[i].required, sort_order: i }); } catch {}
        }
    };

    /* Template list drag & drop reorder */
    const handleTplDragStart = (e, idx) => { setTplDragIdx(idx); e.dataTransfer.effectAllowed = "move"; };
    const handleTplDragOver = (e, idx) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setTplDragOverIdx(idx); };
    const handleTplDragEnd = () => { setTplDragIdx(null); setTplDragOverIdx(null); };
    const handleTplDrop = async (e, toIdx) => {
        e.preventDefault();
        if (tplDragIdx === null || tplDragIdx === toIdx) { setTplDragIdx(null); setTplDragOverIdx(null); return; }
        const reordered = [...templates];
        const [moved] = reordered.splice(tplDragIdx, 1);
        reordered.splice(toIdx, 0, moved);
        setTplDragIdx(null);
        setTplDragOverIdx(null);
        for (let i = 0; i < reordered.length; i++) {
            try { await api("update_onboarding_template", { id: reordered[i].id, name: reordered[i].name, category: reordered[i].category, is_default: reordered[i].is_default, sort_order: i }); } catch {}
        }
        onReload();
    };

    return (<div className="tpl-wrap">
        <div className="tpl-head">
            <button className="ob-btn-ghost" onClick={onBack}><I name="arrow-left" size={16} /></button>
            <h2 className="tpl-title">Checklist Templates</h2>
            <button className="ob-btn-primary" onClick={createTpl}><I name="plus" size={14} /> New Template</button>
        </div>

        <p className="tpl-desc">Each template becomes a column on the onboarding board. Add the documents and stages employees need to complete.</p>

        <div className="tpl-layout">
            <div className="tpl-list">
                {templates.length === 0 ? (
                    <div className="tpl-empty">
                        <I name="clipboard" size={24} />
                        <p>No templates yet</p>
                        <span>Create your first template to get started.</span>
                    </div>
                ) : templates.map((tpl, tplIdx) => (
                    <div key={tpl.id} className={`tpl-card ${editing?.id === tpl.id ? "tpl-card-active" : ""} ${tplDragIdx === tplIdx ? "tpl-card-dragging" : ""} ${tplDragOverIdx === tplIdx ? "tpl-card-dragover" : ""}`}
                         draggable
                         onDragStart={e => handleTplDragStart(e, tplIdx)}
                         onDragOver={e => handleTplDragOver(e, tplIdx)}
                         onDragEnd={handleTplDragEnd}
                         onDrop={e => handleTplDrop(e, tplIdx)}
                         onClick={() => openTpl(tpl)}>
                        <div className="tpl-card-top">
                            <I name="grip-vertical" size={12} style={{ color: "#ccc", cursor: "grab", flexShrink: 0 }} />
                            <I name="clipboard" size={14} style={{ color: "#f59e0b" }} />
                            <span className="tpl-card-name">{tpl.name}</span>
                            {tpl.is_default && <span className="tpl-card-default">Default</span>}
                        </div>
                        <span className="tpl-card-meta">{tpl.item_count} items</span>
                    </div>
                ))}
            </div>

            {editing ? (
                <div className="tpl-editor">
                    <div className="tpl-editor-top">
                        <h3 className="tpl-editor-title">{form.name || "Untitled"}</h3>
                        <button className="ob-btn-danger-sm" onClick={() => deleteTpl(editing.id)}><I name="trash-2" size={12} /> Delete</button>
                    </div>

                    <div className="tpl-fields">
                        <div className="tpl-field tpl-field-wide">
                            <label className="ob-lbl">Template Name</label>
                            <input className="ob-inp" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Pre-Employment Documents, IT Setup, Training..." />
                        </div>
                        <div className="tpl-field">
                            <label className="ob-lbl">Default</label>
                            <button className={`ob-toggle ${form.is_default ? "ob-toggle-on" : ""}`} onClick={() => setForm(p => ({ ...p, is_default: !p.is_default }))}>
                                <div className="ob-toggle-dot" />
                            </button>
                        </div>
                    </div>
                    <button className="ob-btn-primary" style={{ marginBottom: 22 }} onClick={saveTpl}>Save Template</button>

                    <h4 className="tpl-section">Documents / Stages ({tplItems.length})</h4>
                    <p className="tpl-hint">These are the items employees need to complete. Each shows as a checkbox when onboarding starts.</p>

                    <div className="tpl-items">
                        {tplItems.map((it, idx) => (
                            <div key={it.id} className={`tpl-item ${dragIdx === idx ? "tpl-item-dragging" : ""} ${dragOverIdx === idx ? "tpl-item-dragover" : ""}`}
                                 draggable
                                 onDragStart={e => handleItemDragStart(e, idx)}
                                 onDragOver={e => handleItemDragOver(e, idx)}
                                 onDragEnd={handleItemDragEnd}
                                 onDrop={e => handleItemDrop(e, idx)}>
                                <I name="grip-vertical" size={11} style={{ color: "#ccc", cursor: "grab", flexShrink: 0 }} />
                                <span className="tpl-item-num">{idx + 1}</span>
                                <span className="tpl-item-title">{it.title}</span>
                                {it.required && <span className="tpl-item-req">Required</span>}
                                <button className="tpl-item-del" onClick={() => deleteItem(it.id)}><I name="x" size={12} /></button>
                            </div>
                        ))}
                    </div>

                    <div className="tpl-add">
                        <input className="tpl-add-inp" placeholder="e.g. Birth Certificate, NBI Clearance, Contract Signed..."
                               value={newTitle} onChange={e => setNewTitle(e.target.value)}
                               onKeyDown={e => { if (e.key === "Enter") addItem(); }}
                        />
                        <button className="tpl-add-btn" disabled={!newTitle.trim()} onClick={addItem}><I name="plus" size={14} /> Add</button>
                    </div>
                </div>
            ) : (
                <div className="tpl-editor tpl-editor-empty">
                    <I name="arrow-left" size={20} />
                    <p>Select a template to edit</p>
                </div>
            )}
        </div>
        <style>{CSS}</style>
    </div>);
}

/* ================================================================ */
const CSS = `
  .ob-wrap{display:flex;flex-direction:column;min-height:calc(100vh - 54px - 48px)}
  .ob-topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;flex-wrap:wrap;gap:12px}
  .ob-topbar-left{display:flex;align-items:center;gap:12px}
  .ob-topbar-right{display:flex;gap:8px}
  .ob-title{font-size:22px;font-weight:700;color:#222;margin:0}
  .ob-subtitle{font-size:13px;color:#aaa}

  .ob-btn-primary{display:flex;align-items:center;gap:5px;padding:9px 18px;border:none;border-radius:8px;background:#f59e0b;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;color:#fff;cursor:pointer}
  .ob-btn-primary:hover{background:#d97706}
  .ob-btn-primary:disabled{opacity:.5;cursor:not-allowed}
  .ob-btn-ghost{display:flex;align-items:center;gap:5px;padding:9px 16px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;color:#666;cursor:pointer}
  .ob-btn-ghost:hover{background:#f5f5f5}
  .ob-btn-danger-sm{display:flex;align-items:center;gap:4px;padding:7px 12px;border:1px solid #fecaca;border-radius:7px;background:#fef2f2;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:500;color:#ef4444;cursor:pointer}
  .ob-btn-danger-sm:hover{background:#ef4444;color:#fff}

  .ob-empty-board{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:60px 20px;background:#fff;border-radius:10px}
  .ob-empty-board h3{font-size:18px;font-weight:700;color:#333;margin:14px 0 6px}
  .ob-empty-board p{font-size:13px;color:#999;max-width:400px;margin:0 auto}
  .ob-empty-icon{width:68px;height:68px;border-radius:50%;background:#fef3c7;color:#f59e0b;display:flex;align-items:center;justify-content:center;margin:0 auto}

  /* ===== BOARD ===== */
  .ob-board{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;min-height:460px}
  .ob-col{flex:1;min-width:220px;max-width:320px;background:#fff;border:1px solid #eee;border-radius:12px;min-height:200px;display:flex;flex-direction:column}
  .ob-col-over{background:rgba(245,158,11,.06);border-color:#f59e0b;border-style:dashed}

  .ob-col-head{display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid #eee}
  .ob-col-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
  .ob-col-title{font-size:13px;font-weight:700;color:#333}
  .ob-col-count{font-size:11px;font-weight:600;color:#999;background:#eee;padding:1px 7px;border-radius:10px;margin-left:auto}

  .ob-col-body{flex:1;display:flex;flex-direction:column;gap:10px;padding:12px;min-height:100px;border-radius:0 0 11px 11px}

  .ob-col-empty{text-align:center;padding:30px 12px;font-size:12px;color:#bbb}

  .ob-card{background:#fff;border:1px solid #eee;border-radius:10px;padding:14px;cursor:grab;transition:all .15s;user-select:none;-webkit-user-select:none}
  .ob-card:hover{border-color:#ddd;box-shadow:0 2px 8px rgba(0,0,0,.05)}
  .ob-card:active{cursor:grabbing}
  .ob-card-drag{transform:scale(.97)}
  .ob-card-overdue{border-color:#fecaca}
  .ob-card-selected{border-color:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,.12)}

  .ob-card-ghost{position:fixed;left:0;top:0;z-index:9999;pointer-events:none;border:1px solid #eee;box-shadow:0 12px 32px rgba(0,0,0,.18);background:#fff;border-radius:10px;will-change:transform}

  .ob-card-top{display:flex;align-items:center;gap:10px;margin-bottom:10px}
  .ob-card-av{width:32px;height:32px;border-radius:8px;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .ob-card-info{flex:1;min-width:0}
  .ob-card-name{font-size:13px;font-weight:600;color:#222;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ob-card-pos{font-size:11px;color:#aaa;margin-top:1px}
  .ob-card-grip{color:#ddd;opacity:0;transition:opacity .15s}
  .ob-card:hover .ob-card-grip{opacity:1}

  .ob-card-bar-wrap{display:flex;align-items:center;gap:8px;margin-bottom:8px}
  .ob-card-bar{flex:1;height:4px;background:#f3f4f6;border-radius:2px;overflow:hidden}
  .ob-card-fill{height:100%;border-radius:2px;transition:width .3s}
  .ob-card-pct{font-size:10px;font-weight:700;color:#555;width:28px;text-align:right}
  .ob-card-meta{display:flex;justify-content:space-between;font-size:10px;color:#bbb}
  .ob-card-meta span{display:flex;align-items:center;gap:3px}
  .ob-card-overdue-txt{color:#ef4444 !important;font-weight:600}

  /* ===== CHECKLIST MODAL ===== */
  .ob-modal-cl{width:540px;display:flex;flex-direction:column}
  .ob-modal-cl-head{display:flex;align-items:center;gap:12px;margin-bottom:16px}
  .sp-av{width:44px;height:44px;border-radius:12px;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .sp-head-info{flex:1}
  .sp-close{width:32px;height:32px;border:none;border-radius:8px;background:#f5f5f5;color:#999;display:flex;align-items:center;justify-content:center;cursor:pointer}
  .sp-close:hover{background:#eee;color:#333}

  .sp-progress{margin-bottom:12px}
  .sp-pbar{height:8px;background:#f3f4f6;border-radius:4px;overflow:hidden}
  .sp-pfill{height:100%;border-radius:4px;transition:width .3s}
  .sp-pinfo{display:flex;justify-content:space-between;margin-top:6px;font-size:12px;color:#999}
  .sp-ppct{font-weight:700;color:#333;font-size:16px}

  .sp-dates{display:flex;gap:14px;font-size:11px;color:#aaa;flex-wrap:wrap;margin-bottom:16px}
  .sp-dates span{display:flex;align-items:center;gap:4px}
  .sp-overdue{color:#ef4444 !important;font-weight:600}

  .ob-modal-cl-scroll{flex:1;overflow-y:auto;max-height:50vh;border-top:1px solid #f0f0f0;padding-top:16px}
  .sp-empty{text-align:center;padding:30px;color:#ccc;font-size:13px}

  .sp-group{margin-bottom:16px}
  .sp-group-head{display:flex;align-items:center;gap:8px;margin-bottom:6px;padding:0 2px}
  .sp-group-icon{width:24px;height:24px;border-radius:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .sp-group-title{font-size:12px;font-weight:700;color:#555;flex:1;text-transform:uppercase;letter-spacing:.03em}
  .sp-group-count{font-size:11px;font-weight:700}

  .sp-items{display:flex;flex-direction:column;gap:3px;margin-bottom:14px}
  .sp-item{display:flex;align-items:center;gap:10px;padding:11px 14px;background:#fafafa;border:1px solid #f0f0f0;border-radius:10px;cursor:pointer;transition:all .12s}
  .sp-item:hover{border-color:#fde68a;background:#fffbeb}
  .sp-item-done{opacity:.65}
  .sp-ck{width:22px;height:22px;border-radius:6px;border:2px solid #ddd;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s}
  .sp-ck-on{background:#22c55e;border-color:#22c55e;color:#fff}
  .sp-item-body{flex:1;min-width:0}
  .sp-item-title{font-size:13px;font-weight:500;color:#333;display:block}
  .sp-item-struck{text-decoration:line-through;color:#aaa}
  .sp-item-req{font-size:9px;padding:2px 6px;border-radius:4px;background:#fef2f2;color:#ef4444;font-weight:600;flex-shrink:0}
  .sp-item-date{font-size:10px;color:#ccc;flex-shrink:0}

  .sp-add-section{margin-top:8px;padding-top:12px;border-top:1px solid #f0f0f0}
  .sp-add{display:flex;gap:6px}
  .sp-add-inp{flex:1;padding:9px 12px;border:1px solid #e0e0e0;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:13px;color:#333;outline:none}
  .sp-add-inp:focus{border-color:#f59e0b}
  .sp-add-cat{padding:9px 8px;border:1px solid #e0e0e0;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:11px;color:#666;background:#fff;max-width:120px}
  .sp-add-btn{width:38px;height:38px;border:none;border-radius:8px;background:#f59e0b;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0}
  .sp-add-btn:hover{background:#d97706}
  .sp-add-btn:disabled{opacity:.4;cursor:not-allowed}

  /* ===== DOCUMENTS ===== */
  .sp-docs{margin-top:16px;padding-top:14px;border-top:1px solid #f0f0f0}
  .sp-docs-head{display:flex;align-items:center;gap:8px;margin-bottom:10px}
  .sp-doc-upload{margin-left:auto;display:inline-flex;align-items:center;gap:5px;padding:6px 11px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;color:#555;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:600;cursor:pointer}
  .sp-doc-upload:hover:not(:disabled){border-color:#6366f1;color:#6366f1;background:#6366f108}
  .sp-doc-upload:disabled{opacity:.5;cursor:default}
  .sp-doc-err{background:#fef2f2;color:#dc2626;font-size:12px;padding:7px 10px;border-radius:7px;margin-bottom:8px}
  .sp-doc-empty{font-size:12px;color:#aaa;padding:10px 2px;text-align:center}
  .sp-doc-list{display:flex;flex-direction:column;gap:6px}
  .sp-doc{display:flex;align-items:center;gap:10px;padding:9px 10px;border:1px solid #eef0f2;border-radius:9px;cursor:pointer;transition:background .1s,border-color .1s}
  .sp-doc:hover{background:#fafbfc;border-color:#e0e0e0}
  .sp-doc-ic{width:30px;height:30px;flex-shrink:0;border-radius:7px;background:#f3f4f6;color:#6366f1;display:flex;align-items:center;justify-content:center}
  .sp-doc-body{flex:1;min-width:0;display:flex;flex-direction:column}
  .sp-doc-name{font-size:13px;font-weight:600;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .sp-doc-meta{font-size:11px;color:#999;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .sp-doc-act{width:30px;height:30px;flex-shrink:0;border:none;background:transparent;color:#999;border-radius:7px;display:flex;align-items:center;justify-content:center;cursor:pointer}
  .sp-doc-act:hover{background:#eef0f2;color:#555}
  .sp-doc-del:hover{background:#fef2f2;color:#dc2626}

  /* ===== MODAL ===== */
  .ob-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:600;animation:spFade .12s}
  @keyframes spFade{from{opacity:0}to{opacity:1}}
  .ob-modal{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:16px;padding:28px;width:440px;max-width:90vw;z-index:601;box-shadow:0 12px 40px rgba(0,0,0,.12)}
  .ob-modal-t{font-size:18px;font-weight:700;color:#222;margin:0}
  .ob-modal-sub{font-size:12px;color:#999;margin:4px 0 0}
  .ob-modal-fields{display:flex;flex-direction:column;gap:12px;margin-top:16px}
  .ob-modal-btns{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}

  /* ===== EMPLOYEE PICKER ===== */
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
  .ob-lbl{font-size:12px;font-weight:600;color:#666;margin-bottom:5px;display:block}
  .ob-req{color:#ef4444}
  .ob-inp{width:100%;padding:9px 12px;border:1px solid #e0e0e0;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:13px;color:#333;outline:none;background:#fff;box-sizing:border-box}
  .ob-inp:focus{border-color:#f59e0b;box-shadow:0 0 0 2px rgba(245,158,11,.1)}

  /* ===== TEMPLATES ===== */
  .tpl-head{display:flex;align-items:center;gap:14px;margin-bottom:6px;flex-wrap:wrap}
  .tpl-title{font-size:20px;font-weight:700;color:#222;flex:1;margin:0}
  .tpl-desc{font-size:12px;color:#aaa;margin-bottom:18px}

  .tpl-wrap{display:flex;flex-direction:column;min-height:calc(100vh - 54px - 48px)}
  .tpl-layout{display:grid;grid-template-columns:300px 1fr;grid-template-rows:1fr;gap:16px;flex:1}
  .tpl-list{display:flex;flex-direction:column;gap:6px;background:#fff;border-radius:10px;padding:12px}
  .tpl-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:40px 16px;text-align:center;color:#ccc;background:#fff;border-radius:10px}
  .tpl-empty p{font-weight:600;color:#aaa;margin:4px 0 0}
  .tpl-empty span{font-size:12px;color:#ccc;max-width:220px}

  .tpl-card{padding:14px;border:1px solid #eee;border-radius:10px;cursor:pointer;transition:all .12s;user-select:none;-webkit-user-select:none}
  .tpl-card:hover{border-color:#fde68a}
  .tpl-card-active{border-color:#f59e0b;background:#fffbeb}
  .tpl-card-dragging{opacity:.3;transform:scale(.97)}
  .tpl-card-dragover{border-color:#f59e0b;border-style:dashed}
  .tpl-card-top{display:flex;align-items:center;gap:8px;margin-bottom:2px}
  .tpl-card-name{font-size:13px;font-weight:600;color:#222;flex:1}
  .tpl-card-default{font-size:9px;padding:2px 6px;border-radius:4px;background:#fef3c7;color:#d97706;font-weight:700}
  .tpl-card-meta{font-size:11px;color:#aaa}

  .tpl-editor{background:#fff;border:1px solid #eee;border-radius:12px;padding:22px}
  .tpl-editor-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#ddd;font-size:13px}
  .tpl-editor-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
  .tpl-editor-title{font-size:18px;font-weight:700;color:#222;margin:0}

  .tpl-fields{display:flex;gap:14px;align-items:flex-end;margin-bottom:14px;flex-wrap:wrap}
  .tpl-field{display:flex;flex-direction:column}
  .tpl-field-wide{flex:1;min-width:180px}

  .tpl-section{font-size:12px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px}
  .tpl-hint{font-size:11px;color:#ccc;margin-bottom:12px}

  .tpl-items{display:flex;flex-direction:column;gap:3px;margin-bottom:14px}
  .tpl-item{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#fafafa;border:1px solid #f0f0f0;border-radius:9px;transition:border-color .12s;user-select:none;-webkit-user-select:none;cursor:grab}
  .tpl-item:hover{border-color:#eee}
  .tpl-item-dragging{opacity:.3;transform:scale(.97)}
  .tpl-item-dragover{border-color:#f59e0b;background:#fffbeb}
  .tpl-item-num{width:22px;height:22px;border-radius:50%;background:#f3f4f6;color:#999;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .tpl-item-title{flex:1;font-size:13px;font-weight:500;color:#333}
  .tpl-item-req{font-size:9px;padding:2px 6px;border-radius:4px;background:#fef2f2;color:#ef4444;font-weight:600}
  .tpl-item-del{width:24px;height:24px;border:none;border-radius:5px;background:transparent;color:#ccc;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .tpl-item-del:hover{color:#ef4444;background:#fef2f2}

  .tpl-add{display:flex;gap:6px}
  .tpl-add-inp{flex:1;padding:10px 14px;border:1px solid #e0e0e0;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:13px;color:#333;outline:none}
  .tpl-add-inp:focus{border-color:#f59e0b}
  .tpl-add-btn{display:flex;align-items:center;gap:4px;padding:10px 16px;border:none;border-radius:8px;background:#f59e0b;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;color:#fff;cursor:pointer}
  .tpl-add-btn:hover{background:#d97706}
  .tpl-add-btn:disabled{opacity:.4;cursor:not-allowed}

  .ob-toggle{width:44px;height:24px;border-radius:12px;border:none;background:#e5e7eb;cursor:pointer;position:relative;transition:background .2s;flex-shrink:0}
  .ob-toggle-on{background:#f59e0b}
  .ob-toggle-dot{width:18px;height:18px;border-radius:50%;background:#fff;position:absolute;top:3px;left:3px;transition:transform .2s;box-shadow:0 1px 3px rgba(0,0,0,.12)}
  .ob-toggle-on .ob-toggle-dot{transform:translateX(20px)}

  @media(max-width:900px){
    .ob-board{flex-direction:column}
    .ob-col{min-width:100%;max-width:100%}
    .tpl-layout{grid-template-columns:1fr}
    .ob-modal-cl{width:95vw}
  }
`;
