import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { I } from "../../layouts/ERPLayout";

/* ================================================================
   HELPERS
================================================================ */
const ini = (n) => n?.split(" ").map(w => w[0]).join("") || "?";
const PRI_CLR = { Urgent: "#ef4444", High: "#f59e0b", Medium: "#3b82f6", Low: "#94a3b8" };
const STA_CLR = { Open: "#3b82f6", "In Progress": "#f59e0b", "On Hold": "#8b5cf6", Resolved: "#22c55e", Closed: "#6b7280" };
const timeAgo = (d) => {
    if (!d) return "";
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago"; return Math.floor(s / 86400) + "d ago";
};

function Empty({ icon, title, desc, action, onAction }) {
    return (
        <div className="h-empty">
            <div className="h-empty-ic"><I name={icon || "inbox"} size={28}/></div>
            <div className="h-empty-t">{title || "No data yet"}</div>
            <div className="h-empty-d">{desc || "Data will appear here once added."}</div>
            {action && <button className="h-btn-p" style={{marginTop:12}} onClick={onAction}>{action}</button>}
        </div>
    );
}

/* ================================================================
   PATH → TAB MAPPING
================================================================ */
function getTab(pathname) {
    const map = {
        "/ticketing":            "overview",
        "/ticketing/board":      "board",
        "/ticketing/categories": "categories",
    };
    return map[pathname] || "overview";
}

/* ================================================================
   MAIN TICKETING COMPONENT
================================================================ */
export default function TicketingDashboard() {
    const location = useLocation();
    const navigate = useNavigate();
    const tab = getTab(location.pathname);

    const API_URL = "http://localhost:8080/api/execute";
    const apiCall = async (action, body = {}) => {
        const session = localStorage.getItem("ls_session");
        const res = await fetch(`${API_URL}?action=${action}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session}` } : {}) },
            body: JSON.stringify(body),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error || json?.message || "API failed");
        return json?.data ?? json;
    };

    const [tickets, setTickets] = useState([]);
    const [categories, setCategories] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [stats, setStats] = useState(null);
    const [catStats, setCatStats] = useState([]);
    const [currentEmployee, setCurrentEmployee] = useState("");
    const [msg, setMsg] = useState("");

    const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

    const loadAll = useCallback(async () => {
        try { const d = await apiCall("get_tickets", {}); setTickets(Array.isArray(d) ? d : []); } catch { setTickets([]); }
        try { const d = await apiCall("get_ticket_categories", {}); setCategories(Array.isArray(d) ? d : []); } catch { setCategories([]); }
        try { const d = await apiCall("get_employees", {}); const e = d?.employees || d || []; setEmployees(Array.isArray(e) ? e : []); } catch { setEmployees([]); }
        try {
            const d = await apiCall("get_ticket_stats", {});
            setStats(d?.stats || null);
            setCatStats(Array.isArray(d?.categories) ? d.categories : []);
        } catch {}
        try { const u = JSON.parse(localStorage.getItem("ls_user") || "{}"); if (u.employee_id) setCurrentEmployee(u.employee_id); } catch {}
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    return (<>
        {/* Header */}
        <div className="h-head">
            <div className="h-head-l">
                <div className="h-head-ic"><I name="tag" size={24}/></div>
                <div>
                    <h1 className="h-title">Ticketing</h1>
                    <p className="h-sub">Track requests, issues, and internal support tickets</p>
                </div>
            </div>
        </div>

        {msg && <div className="tk-flash">{msg}</div>}

        {/* Content */}
        {tab === "overview"   && <TicketOverview nav={navigate} tickets={tickets} categories={categories} employees={employees} stats={stats} catStats={catStats} currentEmployee={currentEmployee} apiCall={apiCall} flash={flash} loadAll={loadAll}/>}
        {tab === "board"      && <KanbanBoard nav={navigate} tickets={tickets} categories={categories} employees={employees} currentEmployee={currentEmployee} apiCall={apiCall} flash={flash} loadAll={loadAll}/>}
        {tab === "categories" && <CategoriesTab categories={categories} apiCall={apiCall} flash={flash} loadAll={loadAll}/>}

        <style>{`
            .h-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px}
            .h-head-l{display:flex;align-items:center;gap:14px}
            .h-head-ic{width:48px;height:48px;border-radius:12px;background:#edf8f5;color:#2d9e8b;display:flex;align-items:center;justify-content:center}
            .h-title{font-size:22px;font-weight:700;color:#222}
            .h-sub{font-size:13px;color:#aaa;margin-top:2px}
            .h-btn-p{display:flex;align-items:center;gap:6px;padding:9px 18px;background:#2d9e8b;color:#fff;border:none;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;cursor:pointer;transition:background .15s}
            .h-btn-p:hover{background:#268a79}
            .h-card{background:#fff;border:1px solid #eee;border-radius:14px;padding:20px}
            .h-card-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px}
            .h-card-t{font-size:15px;font-weight:700;color:#222}
            .h-card-lk{font-size:12px;font-weight:600;color:#2d9e8b;cursor:pointer}
            .h-card-lk:hover{text-decoration:underline}
            .h-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px}
            .h-st{background:#fff;border:1px solid #eee;border-radius:12px;padding:16px;transition:border-color .15s}
            .h-st:hover{border-color:#d4e8e2}
            .h-st-ic{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;margin-bottom:10px}
            .h-st-v{font-size:24px;font-weight:700;color:#222}
            .h-st-l{font-size:12px;color:#999;margin-top:2px}
            .h-tbl{width:100%;border-collapse:collapse;font-size:13px}
            .h-tbl th{text-align:left;padding:10px 12px;font-size:11px;font-weight:600;color:#aaa;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #f0f0f0}
            .h-tbl td{padding:10px 12px;border-bottom:1px solid #f8f8f8;color:#555}
            .h-tbl tr:last-child td{border-bottom:none}
            .h-tbl tr:hover td{background:#fafffe}
            .h-tbl-nm{font-weight:600;color:#333}
            .h-tbl-click{cursor:pointer;transition:background .12s}
            .h-tbl-click:hover{background:#f8fffe}
            .h-badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}
            .h-b-due{background:#fef2f2;color:#ef4444}
            .h-b-pending{background:#fef3c7;color:#d97706}
            .h-search{display:flex;align-items:center;gap:6px;padding:7px 12px;background:#f5f5f5;border-radius:8px;color:#bbb;max-width:240px}
            .h-search input{border:none;background:none;font-family:'DM Sans',sans-serif;font-size:13px;color:#555;outline:none;width:100%}
            .h-search input::placeholder{color:#ccc}
            .h-empty{text-align:center;padding:40px 20px}
            .h-empty-ic{width:56px;height:56px;border-radius:50%;background:#f3f5f4;color:#ccc;display:flex;align-items:center;justify-content:center;margin:0 auto 12px}
            .h-empty-t{font-size:15px;font-weight:700;color:#444;margin-bottom:4px}
            .h-empty-d{font-size:13px;color:#999;max-width:300px;margin:0 auto}
            .tk-flash{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;padding:8px 14px;border-radius:8px;font-size:13px;margin-bottom:12px}
            .tk-inp{width:100%;padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;outline:none;box-sizing:border-box;font-family:'DM Sans',sans-serif}
            .tk-sel{padding:7px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:12px;background:#fff;cursor:pointer;font-family:'DM Sans',sans-serif}
            .tk-kanban{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;align-items:start}
            .tk-col{background:#f8f9fa;border-radius:12px;min-height:200px;transition:background .15s}
            .tk-col-over{background:#edf8f5;outline:2px dashed #2d9e8b}
            .tk-col-hdr{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid #e5e7eb}
            .tk-col-body{padding:8px;display:flex;flex-direction:column;gap:8px;min-height:100px}
            .tk-card{position:relative;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:10px 10px 10px 14px;cursor:grab;transition:box-shadow .15s,transform .15s}
            .tk-card:hover{box-shadow:0 2px 8px rgba(0,0,0,.08);transform:translateY(-1px)}
            .tk-card:active{cursor:grabbing}
            .tk-card-drag{opacity:.4}
            .tk-card-tag{display:inline-flex;align-items:center;gap:3px;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;background:color-mix(in srgb,var(--tc) 12%,white);color:var(--tc)}
            .tk-pri-bar{width:4px;height:36px;border-radius:4px;flex-shrink:0}
            .tk-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;font-size:12px;font-weight:500;cursor:pointer}
            .tk-chip.active{border-color:var(--clr);background:color-mix(in srgb,var(--clr) 10%,white)}
            .tk-side{width:240px;display:flex;flex-direction:column;gap:12px}
            .tk-side-lbl{font-size:11px;font-weight:600;color:#aaa;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px}
            @media(max-width:1200px){.tk-kanban{grid-template-columns:repeat(3,1fr)}}
            @media(max-width:900px){.h-stats{grid-template-columns:repeat(2,1fr)}.tk-kanban{grid-template-columns:repeat(2,1fr)}}
        `}</style>
    </>);
}

/* ================================================================
   TICKET OVERVIEW (Dashboard Metrics)
================================================================ */
function TicketOverview({ nav, tickets, categories, employees, stats, catStats, currentEmployee, apiCall, flash, loadAll }) {
    const openTickets = tickets.filter(t => t.status === "Open");
    const inProgress = tickets.filter(t => t.status === "In Progress");
    const overdueTickets = tickets.filter(t => t.is_overdue && t.status !== "Resolved" && t.status !== "Closed");
    const recentTickets = [...tickets].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
    const recentResolved = tickets.filter(t => t.status === "Resolved" || t.status === "Closed").sort((a, b) => new Date(b.resolved_at || b.updated_at) - new Date(a.resolved_at || a.updated_at)).slice(0, 5);

    // Priority distribution
    const priCounts = { Urgent: 0, High: 0, Medium: 0, Low: 0 };
    tickets.filter(t => !["Resolved","Closed"].includes(t.status)).forEach(t => { if (priCounts[t.priority] !== undefined) priCounts[t.priority]++; });
    const priTotal = Object.values(priCounts).reduce((a, b) => a + b, 0) || 1;

    return (<>
        {/* Stats */}
        <div className="h-stats" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
            {[
                { label: "Open Tickets", value: stats?.open_count || 0, icon: "file", color: "#3b82f6" },
                { label: "In Progress", value: stats?.in_progress || 0, icon: "clock", color: "#f59e0b" },
                { label: "Overdue", value: stats?.overdue || 0, icon: "bell", color: "#ef4444" },
                { label: "Urgent / High", value: (stats?.urgent_open || 0) + (stats?.high_open || 0), icon: "shield", color: "#ef4444" },
                { label: "Resolved Today", value: stats?.resolved_today || 0, icon: "check", color: "#22c55e" },
                { label: "Avg Resolution", value: stats?.avg_resolution_hours ? stats.avg_resolution_hours.toFixed(1) + "h" : "—", icon: "clock", color: "#6366f1" },
            ].map((s, i) => (
                <div key={i} className="h-st">
                    <div className="h-st-ic" style={{ background: s.color + "14", color: s.color }}><I name={s.icon}/></div>
                    <div className="h-st-v">{s.value}</div>
                    <div className="h-st-l">{s.label}</div>
                </div>
            ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 310px", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Recent Tickets */}
                <div className="h-card">
                    <div className="h-card-h"><h3 className="h-card-t">Recent Tickets</h3><span className="h-card-lk" onClick={() => nav("/ticketing/board")}>View all →</span></div>
                    {recentTickets.length > 0 ? (
                        <div style={{ overflowX: "auto" }}>
                            <table className="h-tbl"><thead><tr><th>Ticket</th><th>Category</th><th>Priority</th><th>Status</th><th>Created</th></tr></thead>
                                <tbody>{recentTickets.map(t => (
                                    <tr key={t.id} className="h-tbl-click" onClick={() => nav("/ticketing/board")}>
                                        <td><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div className="tk-pri-bar" style={{ background: PRI_CLR[t.priority] || "#ccc" }}></div><div><span style={{ fontSize: 11, color: "#888", fontWeight: 600 }}>#{t.ticket_number}</span> <span className="h-tbl-nm">{t.subject}</span>{t.is_overdue && <span className="h-badge h-b-due" style={{ marginLeft: 6 }}>OVERDUE</span>}</div></div></td>
                                        <td>{t.category_name && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><I name={t.category_icon || "tag"} size={12} style={{ color: t.category_color }}/> {t.category_name}</span>}</td>
                                        <td><span className="h-badge" style={{ background: (PRI_CLR[t.priority] || "#888") + "18", color: PRI_CLR[t.priority] }}>{t.priority}</span></td>
                                        <td><span className="h-badge" style={{ background: (STA_CLR[t.status] || "#888") + "18", color: STA_CLR[t.status] }}>{t.status}</span></td>
                                        <td style={{ fontSize: 12, color: "#888" }}>{timeAgo(t.created_at)}</td>
                                    </tr>
                                ))}</tbody></table>
                        </div>
                    ) : <Empty icon="file" title="No tickets yet" desc="Create your first ticket to get started." action="New Ticket" onAction={() => nav("/ticketing/board")}/>}
                </div>

                {/* Overdue Tickets */}
                <div className="h-card">
                    <div className="h-card-h"><h3 className="h-card-t">Overdue Tickets</h3></div>
                    {overdueTickets.length > 0 ? (
                        <div style={{ overflowX: "auto" }}>
                            <table className="h-tbl"><thead><tr><th>Ticket</th><th>Assigned To</th><th>SLA Deadline</th><th>Priority</th></tr></thead>
                                <tbody>{overdueTickets.slice(0, 5).map(t => (
                                    <tr key={t.id} className="h-tbl-click" onClick={() => nav("/ticketing/board")}>
                                        <td><span style={{ fontSize: 11, color: "#888", fontWeight: 600 }}>#{t.ticket_number}</span> <span className="h-tbl-nm">{t.subject}</span></td>
                                        <td>{t.assigned_to_name || <span style={{ color: "#ccc" }}>Unassigned</span>}</td>
                                        <td style={{ color: "#ef4444", fontWeight: 600, fontSize: 12 }}>{t.due_date ? new Date(t.due_date).toLocaleDateString() : "—"}</td>
                                        <td><span className="h-badge" style={{ background: (PRI_CLR[t.priority] || "#888") + "18", color: PRI_CLR[t.priority] }}>{t.priority}</span></td>
                                    </tr>
                                ))}</tbody></table>
                        </div>
                    ) : <Empty icon="check" title="No overdue tickets" desc="All tickets are within their SLA deadlines."/>}
                </div>
            </div>

            {/* Right column */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Priority Breakdown */}
                <div className="h-card">
                    <h3 className="h-card-t" style={{ marginBottom: 14 }}>Active by Priority</h3>
                    {["Urgent","High","Medium","Low"].map(p => (
                        <div key={p} style={{ marginBottom: 10 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                                <span style={{ fontWeight: 600, color: PRI_CLR[p] }}>{p}</span>
                                <span style={{ color: "#888" }}>{priCounts[p]}</span>
                            </div>
                            <div style={{ height: 6, background: "#f3f4f6", borderRadius: 3, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: (priCounts[p] / priTotal * 100) + "%", background: PRI_CLR[p], borderRadius: 3, transition: "width .3s" }}></div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Categories Breakdown */}
                <div className="h-card">
                    <div className="h-card-h"><h3 className="h-card-t">By Category</h3><span className="h-card-lk" onClick={() => nav("/ticketing/categories")}>Manage →</span></div>
                    {catStats.length > 0 ? catStats.map(c => (
                        <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f8f8f8" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color }}></div>
                                <span style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>{c.name}</span>
                            </div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <span className="h-badge" style={{ background: c.active > 0 ? c.color + "18" : "#f3f4f6", color: c.active > 0 ? c.color : "#aaa" }}>{c.active} active</span>
                                {c.overdue > 0 && <span className="h-badge h-b-due">{c.overdue} late</span>}
                            </div>
                        </div>
                    )) : <Empty icon="tag" title="No categories" desc="Set up ticket categories." action="Configure" onAction={() => nav("/ticketing/categories")}/>}
                </div>

                {/* Recently Resolved */}
                <div className="h-card">
                    <div className="h-card-h"><h3 className="h-card-t">Recently Resolved</h3></div>
                    {recentResolved.length > 0 ? recentResolved.map(t => (
                        <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #f8f8f8" }}>
                            <div style={{ width: 28, height: 28, borderRadius: 7, background: "#e0faf1", color: "#0d9488", display: "flex", alignItems: "center", justifyContent: "center" }}><I name="check" size={13}/></div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>{t.subject}</div>
                                <div style={{ fontSize: 11, color: "#999" }}>{t.assigned_to_name || t.created_by_name} · {timeAgo(t.resolved_at || t.updated_at)}</div>
                            </div>
                        </div>
                    )) : <Empty icon="check" title="No resolved tickets" desc="Resolved tickets will appear here."/>}
                </div>
            </div>
        </div>
    </>);
}

/* ================================================================
   KANBAN BOARD
================================================================ */
const COLUMNS = [
    { key: "Open",        label: "Open",        color: "#3b82f6" },
    { key: "In Progress", label: "In Progress",  color: "#f59e0b" },
    { key: "On Hold",     label: "On Hold",      color: "#8b5cf6" },
    { key: "Resolved",    label: "Resolved",     color: "#22c55e" },
    { key: "Closed",      label: "Closed",       color: "#6b7280" },
];

function KanbanBoard({ nav, tickets, categories, employees, currentEmployee, apiCall, flash, loadAll }) {
    const [search, setSearch] = useState("");
    const [fCat, setFCat] = useState("");
    const [fPriority, setFPriority] = useState("");
    const [dragging, setDragging] = useState(null);
    const [dragOver, setDragOver] = useState(null);

    // Sub-views for form / detail
    const [view, setView] = useState("board");
    const [form, setForm] = useState(null);
    const [detail, setDetail] = useState(null);
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState("");
    const [isInternal, setIsInternal] = useState(false);

    const filtered = useMemo(() => {
        let r = tickets;
        if (fCat) r = r.filter(t => t.category_id === fCat);
        if (fPriority) r = r.filter(t => t.priority === fPriority);
        if (search) { const s = search.toLowerCase(); r = r.filter(t => (t.subject || "").toLowerCase().includes(s) || String(t.ticket_number).includes(s) || (t.created_by_name || "").toLowerCase().includes(s)); }
        return r;
    }, [tickets, fCat, fPriority, search]);

    const grouped = useMemo(() => {
        const g = {};
        COLUMNS.forEach(c => { g[c.key] = []; });
        filtered.forEach(t => { if (g[t.status]) g[t.status].push(t); });
        // Sort each column: urgent first, then by created_at
        const priOrder = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
        Object.keys(g).forEach(k => g[k].sort((a, b) => (priOrder[a.priority] ?? 9) - (priOrder[b.priority] ?? 9)));
        return g;
    }, [filtered]);

    // CRUD (same as before)
    const openForm = (t) => {
        setForm(t ? { id: t.id, subject: t.subject, description: t.description || "", category_id: t.category_id || "", priority: t.priority, assigned_to: t.assigned_to || "" }
            : { subject: "", description: "", category_id: "", priority: "Medium", assigned_to: "" });
        setView("form");
    };
    const saveTicket = async () => {
        if (!form.subject) { flash("Subject required"); return; }
        try {
            if (form.id) await apiCall("update_ticket", form); else await apiCall("create_ticket", form);
            flash(form.id ? "Updated" : "Ticket created"); setView("board"); loadAll();
        } catch (e) { flash("Error: " + e.message); }
    };
    const openDetail = async (t) => {
        try {
            const d = await apiCall("get_ticket", { id: t.id });
            setDetail(d?.ticket || d);
            setComments(Array.isArray(d?.comments) ? d.comments : []);
            setNewComment(""); setIsInternal(false); setView("detail");
        } catch (e) { flash("Error: " + e.message); }
    };
    const changeStatus = async (id, status) => {
        try { const d = await apiCall("update_ticket_status", { id, status }); setDetail(d); flash("Status → " + status); loadAll(); } catch (e) { flash("Error: " + e.message); }
    };
    const assignTo = async (id, eid) => {
        try { const d = await apiCall("assign_ticket", { id, assigned_to: eid }); setDetail(d); flash("Assigned"); loadAll(); } catch (e) { flash("Error: " + e.message); }
    };
    const deleteTicket = async (id) => {
        if (!confirm("Delete this ticket?")) return;
        try { await apiCall("delete_ticket", { id }); flash("Deleted"); setView("board"); loadAll(); } catch (e) { flash("Error: " + e.message); }
    };
    const postComment = async () => {
        if (!newComment.trim()) return;
        try {
            await apiCall("add_ticket_comment", { ticket_id: detail.id, content: newComment, is_internal: isInternal });
            setNewComment(""); setIsInternal(false);
            const d = await apiCall("get_ticket", { id: detail.id });
            setComments(Array.isArray(d?.comments) ? d.comments : []);
        } catch (e) { flash("Error: " + e.message); }
    };
    const deleteComment = async (cid) => {
        try { await apiCall("delete_ticket_comment", { id: cid }); const d = await apiCall("get_ticket", { id: detail.id }); setComments(Array.isArray(d?.comments) ? d.comments : []); } catch {}
    };

    // Drag & drop
    const onDragStart = (e, t) => { setDragging(t); e.dataTransfer.effectAllowed = "move"; };
    const onDragOver = (e, colKey) => { e.preventDefault(); setDragOver(colKey); };
    const onDragLeave = () => setDragOver(null);
    const onDrop = async (e, colKey) => {
        e.preventDefault(); setDragOver(null);
        if (!dragging || dragging.status === colKey) { setDragging(null); return; }
        try {
            await apiCall("update_ticket_status", { id: dragging.id, status: colKey });
            flash(`#${dragging.ticket_number} → ${colKey}`);
            loadAll();
        } catch (err) { flash("Error: " + err.message); }
        setDragging(null);
    };

    if (view === "form") return <TicketForm form={form} setForm={setForm} categories={categories} employees={employees} onSave={saveTicket} onCancel={() => setView("board")}/>;
    if (view === "detail") return <TicketDetail t={detail} comments={comments} employees={employees} newComment={newComment} setNewComment={setNewComment} isInternal={isInternal} setIsInternal={setIsInternal} onChangeStatus={changeStatus} onAssign={assignTo} onDelete={deleteTicket} onPostComment={postComment} onDeleteComment={deleteComment} onEdit={openForm} onBack={() => setView("board")} apiCall={apiCall} loadAll={loadAll}/>;

    return (<>
        {/* Toolbar */}
        <div className="h-card-h" style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div className="h-search"><I name="search" size={14}/><input placeholder="Search tickets..." value={search} onChange={e => setSearch(e.target.value)}/></div>
                <select className="tk-sel" value={fCat} onChange={e => setFCat(e.target.value)}>
                    <option value="">All Categories</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select className="tk-sel" value={fPriority} onChange={e => setFPriority(e.target.value)}>
                    <option value="">All Priority</option>{["Urgent","High","Medium","Low"].map(p => <option key={p}>{p}</option>)}
                </select>
            </div>
            <button className="h-btn-p" onClick={() => openForm(null)}><I name="userplus" size={15}/> New Ticket</button>
        </div>

        {/* Kanban columns */}
        <div className="tk-kanban">
            {COLUMNS.map(col => (
                <div key={col.key} className={`tk-col${dragOver === col.key ? " tk-col-over" : ""}`}
                     onDragOver={e => onDragOver(e, col.key)} onDragLeave={onDragLeave} onDrop={e => onDrop(e, col.key)}>
                    {/* Column header */}
                    <div className="tk-col-hdr">
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 10, height: 10, borderRadius: "50%", background: col.color }}></div>
                            <span style={{ fontWeight: 700, fontSize: 13, color: "#222" }}>{col.label}</span>
                        </div>
                        <span style={{ background: col.color + "18", color: col.color, padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700 }}>{grouped[col.key].length}</span>
                    </div>

                    {/* Cards */}
                    <div className="tk-col-body">
                        {grouped[col.key].length === 0 && (
                            <div style={{ padding: "20px 10px", textAlign: "center", color: "#ccc", fontSize: 12 }}>No tickets</div>
                        )}
                        {grouped[col.key].map(t => (
                            <div key={t.id} className={`tk-card${dragging?.id === t.id ? " tk-card-drag" : ""}`}
                                 draggable onDragStart={e => onDragStart(e, t)} onClick={() => openDetail(t)}>
                                {/* Priority bar */}
                                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, borderRadius: "8px 0 0 8px", background: PRI_CLR[t.priority] || "#ccc" }}></div>
                                {/* Content */}
                                <div style={{ paddingLeft: 8 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                                        <span style={{ fontSize: 11, color: "#888", fontWeight: 600 }}>#{t.ticket_number}</span>
                                        {t.is_overdue && <span style={{ fontSize: 9, background: "#fef2f2", color: "#ef4444", padding: "1px 5px", borderRadius: 4, fontWeight: 700 }}>OVERDUE</span>}
                                    </div>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e", marginBottom: 6, lineHeight: 1.3 }}>{t.subject}</div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                                        {t.category_name && <span className="tk-card-tag" style={{ "--tc": t.category_color || "#888" }}><I name={t.category_icon || "tag"} size={10}/> {t.category_name}</span>}
                                        <span className="tk-card-tag" style={{ "--tc": PRI_CLR[t.priority] }}>{t.priority}</span>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "#999" }}>
                                        <span>{t.assigned_to_name || t.created_by_name}</span>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                            {t.comment_count > 0 && <span style={{ display: "flex", alignItems: "center", gap: 2 }}><I name="message-circle" size={10}/> {t.comment_count}</span>}
                                            <span>{timeAgo(t.created_at)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    </>);
}

/* ================================================================
   TICKET FORM
================================================================ */
function TicketForm({ form, setForm, categories, employees, onSave, onCancel }) {
    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
    return (
        <div className="h-card" style={{ maxWidth: 700 }}>
            <div className="h-card-h"><h3 className="h-card-t">{form.id ? "Edit" : "New"} Ticket</h3></div>
            <div><label style={L.lbl}>Subject *</label><input className="tk-inp" value={form.subject} onChange={e => set("subject", e.target.value)} placeholder="Brief description of the issue"/></div>
            <div style={{ marginTop: 12 }}><label style={L.lbl}>Description</label><textarea className="tk-inp" style={{ minHeight: 100, resize: "vertical" }} value={form.description} onChange={e => set("description", e.target.value)} placeholder="Detailed description, steps to reproduce, etc."/></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 12 }}>
                <div><label style={L.lbl}>Category</label><select className="tk-inp" value={form.category_id} onChange={e => set("category_id", e.target.value)}><option value="">Select...</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div><label style={L.lbl}>Priority</label><select className="tk-inp" value={form.priority} onChange={e => set("priority", e.target.value)}>{["Low","Medium","High","Urgent"].map(p => <option key={p}>{p}</option>)}</select></div>
                <div><label style={L.lbl}>Assign To</label><select className="tk-inp" value={form.assigned_to} onChange={e => set("assigned_to", e.target.value)}><option value="">Unassigned</option>{employees.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}</select></div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button className="h-btn-p" onClick={onSave}><I name="check" size={14}/> {form.id ? "Update" : "Submit Ticket"}</button>
                <button style={{ padding: "9px 18px", background: "#fff", color: "#374151", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, cursor: "pointer" }} onClick={onCancel}>Cancel</button>
            </div>
        </div>
    );
}

/* ================================================================
   TICKET DETAIL
================================================================ */
function TicketDetail({ t, comments, employees, newComment, setNewComment, isInternal, setIsInternal, onChangeStatus, onAssign, onDelete, onPostComment, onDeleteComment, onEdit, onBack, apiCall, loadAll }) {
    if (!t) return null;
    return (<div style={{ display: "flex", gap: 16 }}>
        {/* Left — content + comments */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Header */}
            <div className="h-card">
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <button style={{ background: "none", border: "1px solid #d1d5db", borderRadius: 8, padding: "6px 8px", cursor: "pointer", display: "flex" }} onClick={onBack}><I name="arrow-left" size={16}/></button>
                    <span style={{ fontSize: 12, color: "#888", fontWeight: 600 }}>#{t.ticket_number}</span>
                    <h3 className="h-card-t" style={{ margin: 0 }}>{t.subject}</h3>
                    {t.is_overdue && <span className="h-badge h-b-due">OVERDUE</span>}
                </div>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>Submitted by <strong>{t.created_by_name}</strong> · {timeAgo(t.created_at)}</div>
                {t.description && <div style={{ fontSize: 13, color: "#555", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{t.description}</div>}
            </div>

            {/* Comments */}
            <div className="h-card">
                <h3 className="h-card-t" style={{ marginBottom: 12 }}>Activity ({comments.length})</h3>
                {comments.map(c => (
                    <div key={c.id} style={{ padding: "10px 0", borderBottom: "1px solid #f8f8f8", opacity: c.is_internal ? 0.75 : 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                            <div style={{ fontSize: 12 }}>
                                <strong style={{ color: "#333" }}>{c.author_name}</strong>
                                <span style={{ color: "#aaa", marginLeft: 8 }}>{timeAgo(c.created_at)}</span>
                                {c.is_internal && <span className="h-badge h-b-pending" style={{ marginLeft: 6 }}>Internal</span>}
                            </div>
                            <button style={{ background: "none", border: "none", cursor: "pointer", color: "#ccc", padding: 4 }} onClick={() => onDeleteComment(c.id)}><I name="minus" size={12}/></button>
                        </div>
                        <div style={{ fontSize: 13, color: "#333", whiteSpace: "pre-wrap" }}>{c.content}</div>
                    </div>
                ))}
                <div style={{ marginTop: 14 }}>
                    <textarea className="tk-inp" style={{ minHeight: 70, resize: "vertical" }} value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Write a reply..."/>
                    <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                        <button className="h-btn-p" onClick={onPostComment}><I name="check" size={13}/> Reply</button>
                        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#888", cursor: "pointer" }}>
                            <input type="checkbox" checked={isInternal} onChange={e => setIsInternal(e.target.checked)}/> Internal note
                        </label>
                    </div>
                </div>
            </div>
        </div>

        {/* Right sidebar */}
        <div className="tk-side">
            <div className="h-card">
                <div className="tk-side-lbl">Status</div>
                <select className="tk-inp" style={{ fontWeight: 600, color: STA_CLR[t.status] }} value={t.status} onChange={e => onChangeStatus(t.id, e.target.value)}>
                    {["Open","In Progress","On Hold","Resolved","Closed"].map(s => <option key={s}>{s}</option>)}
                </select>
            </div>
            <div className="h-card">
                <div className="tk-side-lbl">Priority</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4 }}>
                    {["Low","Medium","High","Urgent"].map(p => (
                        <button key={p} onClick={() => apiCall("update_ticket", { id: t.id, subject: t.subject, description: t.description, category_id: t.category_id, priority: p, assigned_to: t.assigned_to }).then(loadAll)}
                                style={{ padding: "5px 0", border: t.priority === p ? `2px solid ${PRI_CLR[p]}` : "1px solid #e5e7eb", borderRadius: 6, background: t.priority === p ? PRI_CLR[p] + "18" : "#fff", fontSize: 10, fontWeight: 700, color: PRI_CLR[p], cursor: "pointer" }}>{p}</button>
                    ))}
                </div>
            </div>
            <div className="h-card">
                <div className="tk-side-lbl">Assigned To</div>
                <select className="tk-inp" value={t.assigned_to || ""} onChange={e => onAssign(t.id, e.target.value)}>
                    <option value="">Unassigned</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
                </select>
            </div>
            <div className="h-card">
                <div className="tk-side-lbl">Category</div>
                {t.category_name ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                        <I name={t.category_icon || "tag"} size={14} style={{ color: t.category_color }}/> {t.category_name}
                    </div>
                ) : <span style={{ fontSize: 12, color: "#aaa" }}>None</span>}
            </div>
            <div className="h-card">
                <div className="tk-side-lbl">SLA Deadline</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: t.is_overdue ? "#ef4444" : "#222" }}>
                    {t.due_date ? new Date(t.due_date).toLocaleString() : "—"}
                    {t.is_overdue && <span style={{ fontSize: 10, color: "#ef4444", marginLeft: 4 }}>BREACHED</span>}
                </div>
                {t.resolved_at && <div style={{ fontSize: 11, color: "#22c55e", marginTop: 4 }}>Resolved: {new Date(t.resolved_at).toLocaleString()}</div>}
            </div>
            <button className="h-btn-p" style={{ width: "100%", justifyContent: "center" }} onClick={() => onEdit(t)}><I name="briefcase" size={13}/> Edit</button>
            <button style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 18px", background: "#fff", color: "#ef4444", border: "1px solid #fca5a5", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }} onClick={() => onDelete(t.id)}><I name="minus" size={13}/> Delete</button>
        </div>
    </div>);
}

/* ================================================================
   CATEGORIES TAB
================================================================ */
function CategoriesTab({ categories, apiCall, flash, loadAll }) {
    const [view, setView] = useState("list");
    const [form, setForm] = useState(null);
    const icons = ["tag","monitor","users","home","peso","lock","message-circle","gear","shield","heart","briefcase","bell"];
    const colors = ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444","#6366f1","#ec4899","#14b8a6","#f97316","#64748b"];

    const openForm = (c) => { setForm(c ? { ...c } : { name: "", description: "", color: "#6366f1", icon: "tag", sla_hours: 48 }); setView("form"); };
    const save = async () => {
        if (!form.name) { flash("Name required"); return; }
        try { if (form.id) await apiCall("update_ticket_category", form); else await apiCall("create_ticket_category", form); flash("Saved"); setView("list"); loadAll(); } catch (e) { flash("Error: " + e.message); }
    };
    const del = async (id) => { if (!confirm("Delete?")) return; try { await apiCall("delete_ticket_category", { id }); flash("Deleted"); loadAll(); } catch (e) { flash("Error: " + e.message); } };
    const seed = async () => { try { await apiCall("seed_ticket_categories", {}); flash("Default categories created"); loadAll(); } catch (e) { flash("Error: " + e.message); } };

    if (view === "form") {
        const f = form, set = (k, v) => setForm(p => ({ ...p, [k]: v }));
        return (
            <div className="h-card" style={{ maxWidth: 500 }}>
                <div className="h-card-h"><h3 className="h-card-t">{f.id ? "Edit" : "New"} Category</h3></div>
                <div><label style={L.lbl}>Name *</label><input className="tk-inp" value={f.name} onChange={e => set("name", e.target.value)}/></div>
                <div style={{ marginTop: 10 }}><label style={L.lbl}>Description</label><input className="tk-inp" value={f.description} onChange={e => set("description", e.target.value)}/></div>
                <div style={{ marginTop: 10 }}><label style={L.lbl}>SLA (hours)</label><input type="number" className="tk-inp" value={f.sla_hours} onChange={e => set("sla_hours", Number(e.target.value))}/></div>
                <div style={{ marginTop: 10 }}>
                    <label style={L.lbl}>Color</label>
                    <div style={{ display: "flex", gap: 6 }}>{colors.map(c => (
                        <button key={c} onClick={() => set("color", c)} style={{ width: 28, height: 28, borderRadius: "50%", background: c, border: f.color === c ? "3px solid #1a1a2e" : "2px solid transparent", cursor: "pointer" }}/>
                    ))}</div>
                </div>
                <div style={{ marginTop: 10 }}>
                    <label style={L.lbl}>Icon</label>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{icons.map(i => (
                        <button key={i} onClick={() => set("icon", i)} style={{ padding: "6px 8px", borderRadius: 6, border: f.icon === i ? `2px solid ${f.color}` : "1px solid #e5e7eb", background: f.icon === i ? f.color + "18" : "#fff", cursor: "pointer" }}><I name={i} size={16}/></button>
                    ))}</div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                    <button className="h-btn-p" onClick={save}><I name="check" size={14}/> Save</button>
                    <button style={{ padding: "9px 18px", background: "#fff", color: "#374151", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, cursor: "pointer" }} onClick={() => setView("list")}>Cancel</button>
                </div>
            </div>
        );
    }

    return (
        <div className="h-card">
            <div className="h-card-h">
                <h3 className="h-card-t">Ticket Categories ({categories.length})</h3>
                <div style={{ display: "flex", gap: 8 }}>
                    {categories.length === 0 && <button style={{ padding: "9px 18px", background: "#fff", color: "#374151", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer" }} onClick={seed}><I name="shield" size={14}/> Load Defaults</button>}
                    <button className="h-btn-p" onClick={() => openForm(null)}><I name="userplus" size={15}/> New Category</button>
                </div>
            </div>
            {categories.length > 0 ? (
                <div style={{ overflowX: "auto" }}>
                    <table className="h-tbl">
                        <thead><tr><th>Category</th><th>Description</th><th>SLA</th><th></th></tr></thead>
                        <tbody>{categories.map(c => (
                            <tr key={c.id}>
                                <td><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color }}></div><I name={c.icon || "tag"} size={14} style={{ color: c.color }}/><span className="h-tbl-nm">{c.name}</span></div></td>
                                <td style={{ color: "#888", fontSize: 12 }}>{c.description}</td>
                                <td>{c.sla_hours}h</td>
                                <td>
                                    <div style={{ display: "flex", gap: 4 }}>
                                        <span className="h-card-lk" onClick={() => openForm(c)}>Edit</span>
                                        <span className="h-card-lk" style={{ color: "#ef4444" }} onClick={() => del(c.id)}>Delete</span>
                                    </div>
                                </td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
            ) : <Empty icon="tag" title="No categories" desc="Categories help organize tickets. Click 'Load Defaults' to start." action="Load Defaults" onAction={seed}/>}
        </div>
    );
}

const L = { lbl: { display: "block", fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 4 } };
