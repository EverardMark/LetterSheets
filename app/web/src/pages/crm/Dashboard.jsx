import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { I } from "../../layouts/ERPLayout";
import "./crm.css";
import { api, peso, OPEN_STAGES, STAGE_COLOR, Empty } from "./shared";
import { Term, SimpleHint } from "../components/simplemode";
import LeadsView from "./leads";
import PipelineView from "./pipeline";
import ActivitiesView from "./activities";

function getTab(pathname) {
    const map = {
        "/crm": "overview",
        "/crm/leads": "leads",
        "/crm/pipeline": "pipeline",
        "/crm/activities": "activities",
    };
    return map[pathname] || "overview";
}

export default function CRMDashboard() {
    const loc = useLocation();
    const nav = useNavigate();
    const tab = getTab(loc.pathname);

    return (
        <div style={{ padding: "22px 26px" }}>
            {tab === "overview" && <Overview nav={nav} />}
            {tab === "leads" && <LeadsView />}
            {tab === "pipeline" && <PipelineView />}
            {tab === "activities" && <ActivitiesView />}
        </div>
    );
}

function Overview({ nav }) {
    const [ov, setOv] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try { setOv(await api("get_crm_overview")); } catch { setOv(null); }
            setLoading(false);
        })();
    }, []);

    if (loading) return null;
    if (!ov) return <Empty icon="chart" title="CRM overview unavailable" desc="Try reloading." />;

    const cards = [
        { label: <Term simple="Open Deals" advanced="Open Pipeline" />, value: peso(ov.open_value), sub: `${ov.open_count} deals`, icon: "chart", color: "#6366f1" },
        { label: "Weighted Value", value: peso(ov.weighted_value), sub: "by probability", icon: "peso", color: "#0ea5e9" },
        { label: "Win Rate", value: Math.round(ov.win_rate) + "%", sub: `${ov.won_count}W · ${ov.lost_count}L`, icon: "check", color: "#22c55e" },
        { label: "New Leads", value: ov.new_leads, sub: ov.overdue_tasks + " overdue tasks", icon: "userplus", color: "#f59e0b" },
    ];

    const openStages = (ov.by_stage || []).filter(s => OPEN_STAGES.includes(s.stage));
    const maxAmt = Math.max(1, ...openStages.map(s => s.amount));

    return (<>
        <SimpleHint icon="bulb">Track potential customers from first contact to closed deal.</SimpleHint>
        <div className="crm-stats">
            {cards.map((c, i) => (
                <div key={i} className="crm-st">
                    <div className="crm-st-ic" style={{ background: c.color + "18", color: c.color }}><I name={c.icon} size={17} /></div>
                    <div className="crm-st-v">{c.value}</div>
                    <div className="crm-st-l">{c.label} · {c.sub}</div>
                </div>
            ))}
        </div>

        <div className="crm-card">
            <div className="crm-card-h">
                <h3 className="crm-card-t"><Term simple="Deals by stage" advanced="Pipeline by stage" /></h3>
                <span className="crm-card-lk" onClick={() => nav("/crm/pipeline")}>Open board →</span>
            </div>
            {openStages.length === 0 || openStages.every(s => s.count === 0) ? (
                <Empty icon="chart" title="No open deals" desc={<Term simple="Convert a lead or add a deal." advanced="Convert a lead or add an opportunity." />} action={<Term simple="Go to deals" advanced="Go to pipeline" />} onAction={() => nav("/crm/pipeline")} />
            ) : (
                <div className="crm-funnel">
                    {openStages.map(s => (
                        <div key={s.stage} className="crm-fn-row">
                            <span className="crm-fn-label">{s.stage}</span>
                            <div className="crm-fn-track">
                                <div className="crm-fn-fill" style={{ width: (s.amount / maxAmt * 100) + "%", background: STAGE_COLOR[s.stage] }} />
                            </div>
                            <span className="crm-fn-meta"><b>{peso(s.amount)}</b> · {s.count}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>

        <div style={{ display: "flex", gap: 12 }}>
            <div className="crm-card" style={{ flex: 1, margin: 0, cursor: "pointer" }} onClick={() => nav("/crm/leads")}>
                <div className="crm-card-t">Leads</div>
                <div className="crm-st-v" style={{ marginTop: 6 }}>{ov.new_leads}</div>
                <div className="crm-st-l">new & unworked</div>
            </div>
            <div className="crm-card" style={{ flex: 1, margin: 0, cursor: "pointer" }} onClick={() => nav("/crm/activities")}>
                <div className="crm-card-t">Follow-ups</div>
                <div className="crm-st-v" style={{ marginTop: 6, color: ov.overdue_tasks > 0 ? "#dc2626" : "#1f2937" }}>{ov.overdue_tasks}</div>
                <div className="crm-st-l">overdue</div>
            </div>
            <div className="crm-card" style={{ flex: 1, margin: 0 }}>
                <div className="crm-card-t">Won (all-time)</div>
                <div className="crm-st-v" style={{ marginTop: 6, color: "#22c55e" }}>{peso(ov.won_value)}</div>
                <div className="crm-st-l">{ov.won_count} deals</div>
            </div>
        </div>
    </>);
}
