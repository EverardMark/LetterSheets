import { useState, useEffect, useCallback, useMemo } from "react";
import { I } from "../../layouts/ERPLayout";

const API = "http://localhost:8080/api/execute";
async function api(action, body = {}) {
    const s = localStorage.getItem("ls_session");
    const res = await fetch(`${API}?action=${action}`, { method: "POST", headers: { "Content-Type": "application/json", ...(s ? { Authorization: `Bearer ${s}` } : {}) }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error || json?.message || `API ${action} failed`);
    return json?.data ?? json;
}
const PRI_CLR = { Urgent: "#ef4444", High: "#f59e0b", Medium: "#3b82f6", Low: "#94a3b8" };
const STA_CLR = { Open: "#3b82f6", "In Progress": "#f59e0b", "On Hold": "#8b5cf6", Resolved: "#22c55e", Closed: "#6b7280" };
const timeAgo = (d) => {
    if (!d) return "";
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return "just now"; if (s < 3600) return Math.floor(s/60) + "m ago";
    if (s < 86400) return Math.floor(s/3600) + "h ago"; return Math.floor(s/86400) + "d ago";
};

export default function Ticketing({ initialView = "list" }) {
    const [view, setView] = useState(initialView);
    const [tickets, setTickets] = useState([]);
    const [categories, setCategories] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [stats, setStats] = useState(null);
    const [catStats, setCatStats] = useState([]);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState("");
    const [currentEmployee, setCurrentEmployee] = useState("");

    // Filters
    const [fStatus, setFStatus] = useState("");
    const [fPriority, setFPriority] = useState("");
    const [fCat, setFCat] = useState("");
    const [search, setSearch] = useState("");
    const [myOnly, setMyOnly] = useState(initialView === "my");

    // Ticket form
    const [form, setForm] = useState(null);
    // Detail
    const [detail, setDetail] = useState(null);
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState("");
    const [isInternal, setIsInternal] = useState(false);
    // Category form
    const [catForm, setCatForm] = useState(null);

    const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

    const loadAll = useCallback(async () => {
        setLoading(true);
        try { const d = await api("get_tickets", {}); setTickets(Array.isArray(d) ? d : []); } catch { setTickets([]); }
        try { const d = await api("get_ticket_categories", {}); setCategories(Array.isArray(d) ? d : []); } catch { setCategories([]); }
        try { const d = await api("get_employees", {}); const e = d?.employees || d || []; setEmployees(Array.isArray(e) ? e : []); } catch { setEmployees([]); }
        try {
            const d = await api("get_ticket_stats", {});
            setStats(d?.stats || null);
            setCatStats(Array.isArray(d?.categories) ? d.categories : []);
        } catch {}
        try { const u = JSON.parse(localStorage.getItem("ls_user") || "{}"); if (u.employee_id) setCurrentEmployee(u.employee_id); } catch {}
        setLoading(false);
    }, []);
    useEffect(() => { loadAll(); }, [loadAll]);
    useEffect(() => {
        if (initialView === "categories") setView("categories");
        else if (initialView === "my") { setView("list"); setMyOnly(true); }
        else setView("list");
    }, [initialView]);

    const filtered = useMemo(() => {
        let r = tickets;
        if (myOnly && currentEmployee) r = r.filter(t => t.created_by === currentEmployee || t.assigned_to === currentEmployee);
        if (fStatus) r = r.filter(t => t.status === fStatus);
        if (fPriority) r = r.filter(t => t.priority === fPriority);
        if (fCat) r = r.filter(t => t.category_id === fCat);
        if (search) { const s = search.toLowerCase(); r = r.filter(t => (t.subject||"").toLowerCase().includes(s) || (t.created_by_name||"").toLowerCase().includes(s) || String(t.ticket_number).includes(s)); }
        return r;
    }, [tickets, fStatus, fPriority, fCat, search, myOnly, currentEmployee]);

    // Ticket CRUD
    const openForm = (t) => {
        setForm(t ? { id: t.id, subject: t.subject, description: t.description || "", category_id: t.category_id || "", priority: t.priority, assigned_to: t.assigned_to || "" }
            : { subject: "", description: "", category_id: "", priority: "Medium", assigned_to: "" });
        setView("form");
    };
    const saveTicket = async () => {
        if (!form.subject) { flash("Subject required"); return; }
        try {
            if (form.id) await api("update_ticket", form); else await api("create_ticket", form);
            flash(form.id ? "Updated" : "Ticket created"); setView("list"); loadAll();
        } catch (e) { flash("Error: " + e.message); }
    };
    const openDetail = async (t) => {
        try {
            const d = await api("get_ticket", { id: t.id });
            setDetail(d?.ticket || d);
            setComments(Array.isArray(d?.comments) ? d.comments : []);
            setNewComment(""); setIsInternal(false); setView("detail");
        } catch (e) { flash("Error: " + e.message); }
    };
    const changeStatus = async (id, status) => {
        try { const d = await api("update_ticket_status", { id, status }); setDetail(d); flash("Status → " + status); loadAll(); } catch (e) { flash("Error: " + e.message); }
    };
    const assignTo = async (id, eid) => {
        try { const d = await api("assign_ticket", { id, assigned_to: eid }); setDetail(d); flash("Assigned"); loadAll(); } catch (e) { flash("Error: " + e.message); }
    };
    const deleteTicket = async (id) => {
        if (!confirm("Delete this ticket?")) return;
        try { await api("delete_ticket", { id }); flash("Deleted"); setView("list"); loadAll(); } catch (e) { flash("Error: " + e.message); }
    };

    // Comments
    const postComment = async () => {
        if (!newComment.trim()) return;
        try {
            await api("add_ticket_comment", { ticket_id: detail.id, content: newComment, is_internal: isInternal });
            setNewComment(""); setIsInternal(false);
            const d = await api("get_ticket", { id: detail.id });
            setComments(Array.isArray(d?.comments) ? d.comments : []);
        } catch (e) { flash("Error: " + e.message); }
    };
    const deleteComment = async (id) => {
        try { await api("delete_ticket_comment", { id }); const d = await api("get_ticket", { id: detail.id }); setComments(Array.isArray(d?.comments) ? d.comments : []); } catch {}
    };

    // Categories
    const openCatForm = (c) => { setCatForm(c ? { ...c } : { name: "", description: "", color: "#6366f1", icon: "tag", sla_hours: 48 }); setView("cat-form"); };
    const saveCat = async () => {
        if (!catForm.name) { flash("Name required"); return; }
        try { if (catForm.id) await api("update_ticket_category", catForm); else await api("create_ticket_category", catForm); flash("Saved"); setView("categories"); loadAll(); } catch (e) { flash("Error: " + e.message); }
    };
    const deleteCat = async (id) => { if (!confirm("Delete?")) return; try { await api("delete_ticket_category", { id }); flash("Deleted"); loadAll(); } catch (e) { flash("Error: " + e.message); } };
    const seedCats = async () => { try { await api("seed_ticket_categories", {}); flash("Default categories created"); loadAll(); } catch (e) { flash("Error: " + e.message); } };

    const empName = (id) => { const e = employees.find(x => x.id === id); return e ? `${e.first_name} ${e.last_name}` : ""; };

    if (view === "form") return renderForm();
    if (view === "detail") return renderDetail();
    if (view === "categories") return renderCategories();
    if (view === "cat-form") return renderCatForm();
    return renderList();

    /* =============== TICKET LIST =============== */
    function renderList() {
        const activeCount = (stats?.open_count||0) + (stats?.in_progress||0) + (stats?.on_hold||0);
        return (<div style={{ padding: "0 0 20px" }}>
            {msg && <div style={S.flash}>{msg}</div>}

            {/* Stats */}
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                {[{ l: "Open", v: stats?.open_count || 0, c: "#3b82f6", i: "circle" },
                    { l: "In Progress", v: stats?.in_progress || 0, c: "#f59e0b", i: "loader" },
                    { l: "Overdue", v: stats?.overdue || 0, c: "#ef4444", i: "alert-triangle" },
                    { l: "Urgent", v: stats?.urgent_open || 0, c: "#ef4444", i: "zap" },
                    { l: "Resolved Today", v: stats?.resolved_today || 0, c: "#22c55e", i: "check-circle" },
                    { l: "Avg Hours", v: stats?.avg_resolution_hours ? stats.avg_resolution_hours.toFixed(1) : "—", c: "#6366f1", i: "clock" },
                ].map(s => (
                    <div key={s.l} style={S.stat}><div style={{ ...S.statIco, background: s.c + "18", color: s.c }}><I name={s.i} size={15}/></div>
                        <div><div style={S.statV}>{s.v}</div><div style={S.statL}>{s.l}</div></div></div>
                ))}
            </div>

            {/* Category chips */}
            {catStats.length > 0 && (
                <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                    {catStats.map(c => (
                        <button key={c.id} onClick={() => setFCat(fCat === c.id ? "" : c.id)} style={{ ...S.catChip, borderColor: fCat === c.id ? c.color : "#e5e7eb", background: fCat === c.id ? c.color + "15" : "#fff" }}>
                            <I name={c.icon || "tag"} size={12} style={{ color: c.color }}/> {c.name}
                            <span style={{ fontSize: 10, background: c.active > 0 ? c.color + "20" : "#f3f4f6", color: c.active > 0 ? c.color : "#aaa", padding: "1px 6px", borderRadius: 10 }}>{c.active}</span>
                            {c.overdue > 0 && <span style={{ fontSize: 10, background: "#fef2f2", color: "#ef4444", padding: "1px 6px", borderRadius: 10 }}>{c.overdue} late</span>}
                        </button>
                    ))}
                </div>
            )}

            {/* Toolbar */}
            <div style={S.toolbar}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ position: "relative" }}><I name="search" size={14} style={{ color: "#999", position: "absolute", left: 10, top: 9 }}/><input style={S.searchIn} placeholder="Search tickets..." value={search} onChange={e => setSearch(e.target.value)}/></div>
                    <select style={S.sel} value={fStatus} onChange={e => setFStatus(e.target.value)}><option value="">All Status</option>{["Open","In Progress","On Hold","Resolved","Closed"].map(s => <option key={s}>{s}</option>)}</select>
                    <select style={S.sel} value={fPriority} onChange={e => setFPriority(e.target.value)}><option value="">All Priority</option>{["Urgent","High","Medium","Low"].map(p => <option key={p}>{p}</option>)}</select>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button style={myOnly ? S.btnP : S.btnO} onClick={() => setMyOnly(!myOnly)}><I name="user" size={14}/> My Tickets</button>
                    <button style={S.btnO} onClick={() => setView("categories")}><I name="tag" size={14}/> Categories</button>
                    <button style={S.btnP} onClick={() => openForm(null)}><I name="plus" size={14}/> New Ticket</button>
                </div>
            </div>

            {/* Ticket list */}
            <div style={S.card}>
                {loading ? <div style={S.empty}>Loading...</div> : filtered.length === 0 ? (
                    <div style={S.empty}><I name="inbox" size={28} style={{ opacity: .3, marginBottom: 6 }}/><div>No tickets found</div></div>
                ) : filtered.map(t => (
                    <div key={t.id} style={S.ticketRow} onClick={() => openDetail(t)}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                            {/* Priority indicator */}
                            <div style={{ width: 4, height: 36, borderRadius: 4, background: PRI_CLR[t.priority] || "#ccc" }}></div>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                                    <span style={{ fontSize: 11, color: "#888", fontWeight: 600 }}>#{t.ticket_number}</span>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e" }}>{t.subject}</span>
                                    {t.is_overdue && <span style={{ fontSize: 10, background: "#fef2f2", color: "#ef4444", padding: "1px 6px", borderRadius: 6, fontWeight: 600 }}>OVERDUE</span>}
                                </div>
                                <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11, color: "#888" }}>
                                    {t.category_name && <span style={{ display: "flex", alignItems: "center", gap: 3 }}><I name={t.category_icon || "tag"} size={10} style={{ color: t.category_color }}/> {t.category_name}</span>}
                                    <span>by {t.created_by_name}</span>
                                    <span>&middot; {timeAgo(t.created_at)}</span>
                                    {t.comment_count > 0 && <span style={{ display: "flex", alignItems: "center", gap: 2 }}><I name="message-circle" size={10}/> {t.comment_count}</span>}
                                </div>
                            </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {t.assigned_to_name && <span style={{ fontSize: 11, color: "#666", background: "#f3f4f6", padding: "2px 8px", borderRadius: 6 }}>{t.assigned_to_name}</span>}
                            <span style={{ ...S.badge, background: (PRI_CLR[t.priority]||"#888") + "18", color: PRI_CLR[t.priority] }}>{t.priority}</span>
                            <span style={{ ...S.badge, background: (STA_CLR[t.status]||"#888") + "18", color: STA_CLR[t.status] }}>{t.status}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>);
    }

    /* =============== TICKET FORM =============== */
    function renderForm() {
        const f = form, set = (k, v) => setForm(p => ({ ...p, [k]: v }));
        return (<div style={{ padding: "0 0 20px" }}>
            {msg && <div style={S.flash}>{msg}</div>}
            <div style={S.hdr}><button style={S.back} onClick={() => setView("list")}><I name="arrow-left" size={16}/></button><h3 style={S.title}>{f.id ? "Edit" : "New"} Ticket</h3></div>
            <div style={{ ...S.card, maxWidth: 700 }}>
                <div><label style={S.lbl}>Subject *</label><input style={S.inp} value={f.subject} onChange={e => set("subject", e.target.value)} placeholder="Brief description of the issue"/></div>
                <div style={{ marginTop: 12 }}><label style={S.lbl}>Description</label><textarea style={{ ...S.inp, minHeight: 100, resize: "vertical" }} value={f.description} onChange={e => set("description", e.target.value)} placeholder="Detailed description, steps to reproduce, etc."/></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 12 }}>
                    <div><label style={S.lbl}>Category</label><select style={S.inp} value={f.category_id} onChange={e => set("category_id", e.target.value)}><option value="">Select...</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                    <div><label style={S.lbl}>Priority</label><select style={S.inp} value={f.priority} onChange={e => set("priority", e.target.value)}>{["Low","Medium","High","Urgent"].map(p => <option key={p}>{p}</option>)}</select></div>
                    <div><label style={S.lbl}>Assign To</label><select style={S.inp} value={f.assigned_to} onChange={e => set("assigned_to", e.target.value)}><option value="">Unassigned</option>{employees.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}</select></div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                    <button style={S.btnP} onClick={saveTicket}><I name="send" size={14}/> {f.id ? "Update" : "Submit Ticket"}</button>
                    <button style={S.btnO} onClick={() => setView("list")}>Cancel</button>
                </div>
            </div>
        </div>);
    }

    /* =============== TICKET DETAIL =============== */
    function renderDetail() {
        if (!detail) return null;
        const t = detail;
        return (<div style={{ padding: "0 0 20px" }}>
            {msg && <div style={S.flash}>{msg}</div>}
            <div style={S.hdr}>
                <button style={S.back} onClick={() => setView("list")}><I name="arrow-left" size={16}/></button>
                <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12, color: "#888", fontWeight: 600 }}>#{t.ticket_number}</span>
                        <span style={{ fontSize: 16, fontWeight: 700, color: "#1a1a2e" }}>{t.subject}</span>
                        {t.is_overdue && <span style={{ fontSize: 10, background: "#fef2f2", color: "#ef4444", padding: "2px 8px", borderRadius: 6, fontWeight: 700 }}>OVERDUE</span>}
                    </div>
                </div>
            </div>

            <div style={{ display: "flex", gap: 16 }}>
                {/* Left: content + comments */}
                <div style={{ flex: 1 }}>
                    {/* Description */}
                    {t.description && <div style={{ ...S.card, marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Submitted by <strong>{t.created_by_name}</strong> &middot; {timeAgo(t.created_at)}</div>
                        <div style={{ fontSize: 13, color: "#333", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{t.description}</div>
                    </div>}

                    {/* Comments */}
                    <div style={{ ...S.card }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Activity ({comments.length})</div>
                        {comments.map(c => (
                            <div key={c.id} style={{ padding: "10px 0", borderBottom: "1px solid #f3f4f6", opacity: c.is_internal ? 0.75 : 1 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                    <div style={{ fontSize: 12 }}>
                                        <strong style={{ color: "#1a1a2e" }}>{c.author_name}</strong>
                                        <span style={{ color: "#aaa", marginLeft: 8 }}>{timeAgo(c.created_at)}</span>
                                        {c.is_internal && <span style={{ ...S.badge, background: "#fef3c7", color: "#92400e", marginLeft: 6 }}>Internal</span>}
                                    </div>
                                    <button style={{ ...S.iBtn, color: "#ccc" }} onClick={() => deleteComment(c.id)}><I name="x" size={12}/></button>
                                </div>
                                <div style={{ fontSize: 13, color: "#333", whiteSpace: "pre-wrap" }}>{c.content}</div>
                            </div>
                        ))}

                        {/* New comment */}
                        <div style={{ marginTop: 12 }}>
                            <textarea style={{ ...S.inp, minHeight: 70, resize: "vertical" }} value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Write a reply..."/>
                            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                                <button style={S.btnP} onClick={postComment}><I name="send" size={13}/> Reply</button>
                                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#888", cursor: "pointer" }}>
                                    <input type="checkbox" checked={isInternal} onChange={e => setIsInternal(e.target.checked)}/> Internal note
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right sidebar */}
                <div style={{ width: 240 }}>
                    {/* Status */}
                    <div style={{ ...S.card, marginBottom: 12 }}>
                        <div style={S.sideL}>Status</div>
                        <select style={{ ...S.inp, fontWeight: 600, color: STA_CLR[t.status] }} value={t.status} onChange={e => changeStatus(t.id, e.target.value)}>
                            {["Open","In Progress","On Hold","Resolved","Closed"].map(s => <option key={s}>{s}</option>)}
                        </select>
                    </div>

                    {/* Priority */}
                    <div style={{ ...S.card, marginBottom: 12 }}>
                        <div style={S.sideL}>Priority</div>
                        <div style={{ display: "flex", gap: 4 }}>
                            {["Low","Medium","High","Urgent"].map(p => (
                                <button key={p} onClick={() => api("update_ticket", { ...form, id: t.id, subject: t.subject, description: t.description, category_id: t.category_id, priority: p, assigned_to: t.assigned_to }).then(() => { setDetail({ ...t, priority: p }); loadAll(); })}
                                        style={{ flex: 1, padding: "5px 0", border: t.priority === p ? `2px solid ${PRI_CLR[p]}` : "1px solid #e5e7eb", borderRadius: 6, background: t.priority === p ? PRI_CLR[p] + "18" : "#fff", fontSize: 10, fontWeight: 700, color: PRI_CLR[p], cursor: "pointer" }}>{p}</button>
                            ))}
                        </div>
                    </div>

                    {/* Assigned */}
                    <div style={{ ...S.card, marginBottom: 12 }}>
                        <div style={S.sideL}>Assigned To</div>
                        <select style={S.inp} value={t.assigned_to || ""} onChange={e => assignTo(t.id, e.target.value)}>
                            <option value="">Unassigned</option>
                            {employees.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
                        </select>
                    </div>

                    {/* Category */}
                    <div style={{ ...S.card, marginBottom: 12 }}>
                        <div style={S.sideL}>Category</div>
                        {t.category_name ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                                <I name={t.category_icon || "tag"} size={14} style={{ color: t.category_color }}/> {t.category_name}
                            </div>
                        ) : <span style={{ fontSize: 12, color: "#aaa" }}>None</span>}
                    </div>

                    {/* SLA */}
                    <div style={{ ...S.card, marginBottom: 12 }}>
                        <div style={S.sideL}>SLA Deadline</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: t.is_overdue ? "#ef4444" : "#1a1a2e" }}>
                            {t.due_date ? new Date(t.due_date).toLocaleString() : "—"}
                            {t.is_overdue && <span style={{ fontSize: 10, color: "#ef4444", marginLeft: 4 }}>BREACHED</span>}
                        </div>
                        {t.resolved_at && <div style={{ fontSize: 11, color: "#22c55e", marginTop: 4 }}>Resolved: {new Date(t.resolved_at).toLocaleString()}</div>}
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <button style={S.btnO} onClick={() => openForm(t)}><I name="edit-2" size={13}/> Edit</button>
                        <button style={{ ...S.btnO, color: "#ef4444", borderColor: "#fca5a5" }} onClick={() => deleteTicket(t.id)}><I name="trash-2" size={13}/> Delete</button>
                    </div>
                </div>
            </div>
        </div>);
    }

    /* =============== CATEGORIES =============== */
    function renderCategories() {
        return (<div style={{ padding: "0 0 20px" }}>
            {msg && <div style={S.flash}>{msg}</div>}
            <div style={S.hdr}><button style={S.back} onClick={() => setView("list")}><I name="arrow-left" size={16}/></button><h3 style={S.title}>Ticket Categories</h3>
                <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                    {categories.length === 0 && <button style={S.btnO} onClick={seedCats}><I name="zap" size={14}/> Load Defaults</button>}
                    <button style={S.btnP} onClick={() => openCatForm(null)}><I name="plus" size={14}/> New Category</button>
                </div>
            </div>
            <div style={S.card}>
                {categories.length === 0 ? <div style={S.empty}>No categories. Click "Load Defaults" to create standard categories.</div> : (
                    <table style={S.tbl}><thead><tr><th style={S.th}>Category</th><th style={S.th}>Description</th><th style={S.th}>SLA</th><th style={S.th}></th></tr></thead>
                        <tbody>{categories.map(c => (
                            <tr key={c.id}>
                                <td style={S.td}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color }}></div><I name={c.icon || "tag"} size={14} style={{ color: c.color }}/><span style={{ fontWeight: 600 }}>{c.name}</span></div></td>
                                <td style={{ ...S.td, color: "#888", fontSize: 12 }}>{c.description}</td>
                                <td style={S.td}>{c.sla_hours}h</td>
                                <td style={{ ...S.td, display: "flex", gap: 4 }}>
                                    <button style={S.iBtn} onClick={() => openCatForm(c)}><I name="edit-2" size={13}/></button>
                                    <button style={{ ...S.iBtn, color: "#ef4444" }} onClick={() => deleteCat(c.id)}><I name="trash-2" size={13}/></button>
                                </td>
                            </tr>
                        ))}</tbody></table>
                )}
            </div>
        </div>);
    }

    /* =============== CATEGORY FORM =============== */
    function renderCatForm() {
        const f = catForm, set = (k, v) => setCatForm(p => ({ ...p, [k]: v }));
        const icons = ["tag","monitor","users","home","dollar-sign","key","message-circle","settings","shield","heart","briefcase","phone"];
        const colors = ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444","#6366f1","#ec4899","#14b8a6","#f97316","#64748b"];
        return (<div style={{ padding: "0 0 20px" }}>
            {msg && <div style={S.flash}>{msg}</div>}
            <div style={S.hdr}><button style={S.back} onClick={() => setView("categories")}><I name="arrow-left" size={16}/></button><h3 style={S.title}>{f.id ? "Edit" : "New"} Category</h3></div>
            <div style={{ ...S.card, maxWidth: 500 }}>
                <div><label style={S.lbl}>Name *</label><input style={S.inp} value={f.name} onChange={e => set("name", e.target.value)}/></div>
                <div style={{ marginTop: 10 }}><label style={S.lbl}>Description</label><input style={S.inp} value={f.description} onChange={e => set("description", e.target.value)}/></div>
                <div style={{ marginTop: 10 }}><label style={S.lbl}>SLA (hours)</label><input type="number" style={S.inp} value={f.sla_hours} onChange={e => set("sla_hours", Number(e.target.value))}/></div>
                <div style={{ marginTop: 10 }}>
                    <label style={S.lbl}>Color</label>
                    <div style={{ display: "flex", gap: 6 }}>{colors.map(c => (
                        <button key={c} onClick={() => set("color", c)} style={{ width: 28, height: 28, borderRadius: "50%", background: c, border: f.color === c ? "3px solid #1a1a2e" : "2px solid transparent", cursor: "pointer" }}/>
                    ))}</div>
                </div>
                <div style={{ marginTop: 10 }}>
                    <label style={S.lbl}>Icon</label>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{icons.map(i => (
                        <button key={i} onClick={() => set("icon", i)} style={{ padding: "6px 8px", borderRadius: 6, border: f.icon === i ? `2px solid ${f.color}` : "1px solid #e5e7eb", background: f.icon === i ? f.color + "18" : "#fff", cursor: "pointer" }}><I name={i} size={16} style={{ color: f.icon === i ? f.color : "#888" }}/></button>
                    ))}</div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                    <button style={S.btnP} onClick={saveCat}><I name="save" size={14}/> Save</button>
                    <button style={S.btnO} onClick={() => setView("categories")}>Cancel</button>
                </div>
            </div>
        </div>);
    }
}

const S = {
    flash: { background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46", padding: "8px 14px", borderRadius: 8, fontSize: 13, marginBottom: 12 },
    stat: { display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 12px", flex: 1 },
    statIco: { width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" },
    statV: { fontSize: 16, fontWeight: 700, color: "#1a1a2e" },
    statL: { fontSize: 10, color: "#888" },
    catChip: { display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer" },
    toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
    searchIn: { padding: "7px 10px 7px 30px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, width: 220, outline: "none" },
    sel: { padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 12, background: "#fff", cursor: "pointer" },
    btnP: { display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#10b981", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" },
    btnO: { display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#fff", color: "#374151", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer" },
    card: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 },
    tbl: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
    th: { textAlign: "left", padding: "8px 10px", fontSize: 11, fontWeight: 600, color: "#888", borderBottom: "1px solid #e5e7eb" },
    td: { padding: "8px 10px", borderBottom: "1px solid #f3f4f6" },
    badge: { display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 },
    hdr: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16 },
    back: { background: "none", border: "1px solid #d1d5db", borderRadius: 8, padding: "6px 8px", cursor: "pointer", display: "flex", alignItems: "center" },
    title: { margin: 0, fontSize: 16, fontWeight: 700, color: "#1a1a2e" },
    lbl: { display: "block", fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 4 },
    inp: { width: "100%", padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" },
    iBtn: { background: "none", border: "none", cursor: "pointer", color: "#6366f1", padding: 4, display: "flex", alignItems: "center" },
    sideL: { fontSize: 11, fontWeight: 600, color: "#888", marginBottom: 6 },
    ticketRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderBottom: "1px solid #f3f4f6", cursor: "pointer", transition: "background 0.15s" },
    empty: { textAlign: "center", padding: 40, color: "#aaa", fontSize: 13 },
};
