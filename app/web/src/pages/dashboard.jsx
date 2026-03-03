import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { modules, I } from "../layouts/ERPLayout";

/* ================================================================
   MODULE METRICS REGISTRY
   Keyed by module id. When you add a module to ERPLayout's modules
   array, add its metrics here too. Dashboard auto-renders it.
================================================================ */
const moduleMetrics = {
  hr: {
    metrics: [
      { label: "Employees", value: "24" },
      { label: "Present", value: "21" },
      { label: "On Leave", value: "3" },
    ],
    items: [
      { text: "Pedro Lim — Vacation leave (5 days)", type: "warn" },
      { text: "James Tan — Onboarding: Documents", type: "info" },
      { text: "2 new hires this month", type: "good" },
    ],
  },
  // Future modules — just add entries here when you add them to modules[]
  // payroll: { metrics: [...], items: [...] },
  // inventory: { metrics: [...], items: [...] },
};

/* ================================================================
   COMPONENT
================================================================ */
export default function Dashboard() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("ls_user") || "{}");
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());

  // Filter: only non-dashboard modules that have metrics
  const availableModules = modules.filter(m => m.id !== "dashboard" && moduleMetrics[m.id]);

  // Build top summary from all module metrics
  const summaryItems = availableModules.flatMap(mod => {
    const data = moduleMetrics[mod.id];
    return data.metrics.slice(0, 2).map(m => ({
      ...m, icon: mod.icon, color: getColor(mod.id),
    }));
  });

  // Calendar
  const mn = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const dn = ["Su","Mo","Tu","We","Th","Fr","Sa"];
  const td = new Date();
  const dim = new Date(calYear, calMonth + 1, 0).getDate();
  const fd = new Date(calYear, calMonth, 1).getDay();
  const cDays = []; for (let i = 0; i < fd; i++) cDays.push(null); for (let i = 1; i <= dim; i++) cDays.push(i);
  const isToday = (d) => d === td.getDate() && calMonth === td.getMonth() && calYear === td.getFullYear();

  const schedules = [
    { time: "09:00", title: "Team Standup", desc: "Daily sync with engineering", color: "#8b5cf6" },
    { time: "14:00", title: "Payroll Review", desc: "Feb payroll adjustments", color: "#2d9e8b" },
    { time: "16:30", title: "Interview", desc: "Senior dev screening", color: "#0ea5e9" },
  ];

  const dotColor = { warn: "#f59e0b", info: "#0ea5e9", good: "#22c55e", neutral: "#ccc" };

  return (<>
    {/* Greeting */}
    <div style={{marginBottom:22}}>
      <h1 className="d-h1">Hi {user.username || "there"} <span className="d-accent">Great to see you!</span></h1>
      <p className="d-sub">Here's your business overview for today.</p>
    </div>

    {/* Top summary from available modules */}
    {summaryItems.length > 0 && (
        <div className="d-summary">
          {summaryItems.map((s,i)=>(
              <div key={i} className="d-sum-item">
                <div className="d-sum-ic" style={{background:s.color+"14",color:s.color}}><I name={s.icon} size={16}/></div>
                <div>
                  <div className="d-sum-v">{s.value}</div>
                  <div className="d-sum-l">{s.label}</div>
                </div>
              </div>
          ))}
        </div>
    )}

    {/* Module cards — only available ones */}
    {availableModules.length > 0 ? (
        <div className="d-modules" style={{gridTemplateColumns: availableModules.length === 1 ? "1fr" : `repeat(${Math.min(availableModules.length, 3)}, 1fr)`}}>
          {availableModules.map(mod => {
            const data = moduleMetrics[mod.id];
            const color = getColor(mod.id);
            return (
                <div key={mod.id} className="d-mod" onClick={() => navigate(mod.path)}>
                  <div className="d-mod-head">
                    <div className="d-mod-ic" style={{background:color+"14",color}}><I name={mod.icon}/></div>
                    <div className="d-mod-title">{mod.label}</div>
                    <span className="d-mod-arrow">→</span>
                  </div>
                  <div className="d-mod-metrics">
                    {data.metrics.map((m,i) => (
                        <div key={i} className="d-mod-metric">
                          <div className="d-mod-mv">{m.value}</div>
                          <div className="d-mod-ml">{m.label}</div>
                        </div>
                    ))}
                  </div>
                  <div className="d-mod-items">
                    {data.items.map((item,i) => (
                        <div key={i} className="d-mod-item">
                          <span className="d-mod-dot" style={{background:dotColor[item.type]}}/>
                          <span>{item.text}</span>
                        </div>
                    ))}
                  </div>
                </div>
            );
          })}
        </div>
    ) : (
        <div className="d-empty">
          <div className="d-empty-ic"><I name="grid" size={32}/></div>
          <h2 className="d-empty-t">No modules configured yet</h2>
          <p className="d-empty-d">Add modules to the registry to see their metrics here.</p>
        </div>
    )}

    {/* Bottom: Calendar + Schedule */}
    <div className="d-bottom">
      <div className="d-card">
        <div className="d-card-h">
          <h3 className="d-card-t">{mn[calMonth]} {calYear}</h3>
          <div style={{display:"flex",gap:3}}>
            <button className="d-cal-b" onClick={()=>{if(calMonth===0){setCalMonth(11);setCalYear(calYear-1)}else setCalMonth(calMonth-1)}}>‹</button>
            <button className="d-cal-b" onClick={()=>{if(calMonth===11){setCalMonth(0);setCalYear(calYear+1)}else setCalMonth(calMonth+1)}}>›</button>
          </div>
        </div>
        <div className="d-cal">{dn.map(d=><div key={d} className="d-cal-dn">{d}</div>)}{cDays.map((d,i)=><div key={i} className={`d-cal-d ${isToday(d)?"d-cal-td":""} ${!d?"d-cal-e":""}`}>{d||""}</div>)}</div>
      </div>
      <div className="d-card">
        <div className="d-card-h"><h3 className="d-card-t">Today's Schedule</h3></div>
        <div className="d-sch">{schedules.map((s,i)=>(
            <div key={i} className="d-sch-i" style={{borderLeftColor:s.color}}>
              <div className="d-sch-t">{s.time}</div>
              <div className="d-sch-n">{s.title}</div>
              <div className="d-sch-d">{s.desc}</div>
            </div>
        ))}</div>
      </div>
    </div>

    <style>{`
      .d-h1{font-size:22px;font-weight:700;color:#2a3d35}
      .d-accent{font-weight:400;color:#2d9e8b;font-size:17px;margin-left:4px}
      .d-sub{font-size:13px;color:#aaa;margin-top:3px}

      .d-summary{display:flex;gap:12px;margin-bottom:20px;overflow-x:auto;padding-bottom:2px}
      .d-sum-item{display:flex;align-items:center;gap:10px;padding:14px 18px;background:#fff;border:1px solid #eee;border-radius:12px;flex:1;min-width:150px;transition:border-color .15s}
      .d-sum-item:hover{border-color:#d4e8e2}
      .d-sum-ic{width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
      .d-sum-v{font-size:20px;font-weight:700;color:#222}
      .d-sum-l{font-size:11px;color:#999}

      .d-modules{display:grid;gap:14px;margin-bottom:20px}
      .d-mod{background:#fff;border:1px solid #eee;border-radius:14px;padding:18px;cursor:pointer;transition:all .15s}
      .d-mod:hover{border-color:#c5e0d8;box-shadow:0 2px 12px rgba(45,158,139,.06)}
      .d-mod-head{display:flex;align-items:center;gap:10px;margin-bottom:14px}
      .d-mod-ic{width:36px;height:36px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
      .d-mod-title{flex:1;font-size:15px;font-weight:700;color:#222}
      .d-mod-arrow{font-size:16px;color:#ccc;transition:color .15s}
      .d-mod:hover .d-mod-arrow{color:#2d9e8b}
      .d-mod-metrics{display:flex;gap:0;margin-bottom:14px;border:1px solid #f5f5f5;border-radius:8px;overflow:hidden}
      .d-mod-metric{flex:1;padding:10px;text-align:center;border-right:1px solid #f5f5f5}
      .d-mod-metric:last-child{border-right:none}
      .d-mod-mv{font-size:18px;font-weight:700;color:#222}
      .d-mod-ml{font-size:10px;color:#aaa;margin-top:1px}
      .d-mod-items{display:flex;flex-direction:column;gap:6px}
      .d-mod-item{display:flex;align-items:flex-start;gap:7px;font-size:12px;color:#777;line-height:1.4}
      .d-mod-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;margin-top:5px}

      .d-empty{text-align:center;padding:60px 20px;background:#fff;border:1px solid #eee;border-radius:14px;margin-bottom:20px}
      .d-empty-ic{width:72px;height:72px;border-radius:50%;background:#f3f5f4;color:#ccc;display:flex;align-items:center;justify-content:center;margin:0 auto 16px}
      .d-empty-t{font-size:18px;font-weight:700;color:#444;margin-bottom:6px}
      .d-empty-d{font-size:14px;color:#999}

      .d-bottom{display:grid;grid-template-columns:1fr 1fr;gap:16px}
      .d-card{background:#fff;border:1px solid #eee;border-radius:14px;padding:20px}
      .d-card-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
      .d-card-t{font-size:15px;font-weight:700;color:#222}

      .d-cal-b{width:26px;height:26px;border-radius:6px;border:1px solid #eee;background:#fff;cursor:pointer;font-size:15px;color:#888;display:flex;align-items:center;justify-content:center}
      .d-cal-b:hover{background:#edf8f5;color:#2d9e8b}
      .d-cal{display:grid;grid-template-columns:repeat(7,1fr);text-align:center;gap:1px}
      .d-cal-dn{font-size:10px;font-weight:600;color:#ccc;padding:3px 0}
      .d-cal-d{font-size:12px;color:#666;padding:5px 0;border-radius:6px;cursor:pointer;transition:all .12s}
      .d-cal-d:hover:not(.d-cal-e){background:#edf8f5}
      .d-cal-td{background:#2d9e8b;color:#fff!important;font-weight:700}
      .d-cal-td:hover{background:#26897a}
      .d-cal-e{cursor:default}

      .d-sch{display:flex;flex-direction:column;gap:8px}
      .d-sch-i{padding:10px 12px;background:#fafbfa;border-radius:8px;border-left:3px solid;cursor:pointer;transition:all .12s}
      .d-sch-i:hover{background:#edf8f5}
      .d-sch-t{font-size:11px;font-weight:600;color:#aaa}
      .d-sch-n{font-size:13px;font-weight:600;color:#333;margin:1px 0}
      .d-sch-d{font-size:11px;color:#999}

      @media(max-width:768px){
        .d-bottom{grid-template-columns:1fr}
        .d-summary{flex-direction:column}
      }
    `}</style>
  </>);
}

/* Color map for modules */
function getColor(id) {
  const colors = {
    hr: "#2d9e8b",
    payroll: "#0ea5e9",
    inventory: "#8b5cf6",
    procurement: "#f59e0b",
    suppliers: "#ec4899",
    compliance: "#ef4444",
    reports: "#6366f1",
    approvals: "#f59e0b",
    audit: "#64748b",
    settings: "#888",
  };
  return colors[id] || "#2d9e8b";
}
