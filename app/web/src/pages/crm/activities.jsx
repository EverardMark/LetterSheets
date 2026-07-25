import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";
import { api, fmtDate, Empty, ACTIVITY_ICON } from "./shared";
import { SimpleHint } from "../components/simplemode";

export default function ActivitiesView() {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try { const d = await api("get_crm_overdue_tasks"); setTasks(d.activities || []); }
        catch { setTasks([]); }
        setLoading(false);
    }, []);
    useEffect(() => { load(); }, [load]);

    const complete = async (a) => {
        try { await api("complete_crm_activity", { id: a.id, completed: true }); load(); } catch (e) { alert(e.message); }
    };

    return (<>
        <SimpleHint icon="bulb">Follow-ups you still owe — the overdue ones show up here.</SimpleHint>
        <div className="crm-bar">
            <span className="crm-bar-count">{tasks.length} overdue follow-up{tasks.length === 1 ? "" : "s"}</span>
        </div>

        {loading ? null : tasks.length === 0 ? (
            <Empty icon="check" title="All caught up" desc="No overdue follow-ups. Nice work." />
        ) : (
            <div className="crm-card">
                {tasks.map(a => (
                    <div key={a.id} className="crm-act">
                        <div className="crm-act-ck" onClick={() => complete(a)} title="Mark done" />
                        <div className="crm-act-ic"><I name={ACTIVITY_ICON[a.type] || "file-text"} size={14} /></div>
                        <div className="crm-act-body">
                            <div className="crm-act-subj">{a.subject}</div>
                            {a.notes && <div className="crm-act-notes">{a.notes}</div>}
                            <div className="crm-act-meta">
                                <span>{a.type} · {a.related_type}</span>
                                <span className="crm-act-due crm-act-overdue">Overdue {fmtDate(a.due_date)}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        )}
    </>);
}
