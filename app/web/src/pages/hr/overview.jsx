import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { I } from "../../layouts/ERPLayout";
import Employee, { Employees } from "./Employee";
import ComplianceTab from "./Compliance";
import BenefitsTab from "./Benefits";
import DepartmentsTab from "./Departments";
import PositionsTab from "./Positions";
import AttendanceTab from "./Attendance";
import LeaveTabComponent from "./Leave";
import PayrollTabComponent from "./Payroll";
import OnboardingTabComponent from "./Onboarding";
import LoanTabComponent from "./Loan";
import WorkSchedulesTab from "./WorkSchedules";
import { SimpleHint } from "../components/simplemode";

/* ================================================================
   HELPERS
================================================================ */
const ini = (n) => n?.split(" ").map(w => w[0]).join("") || "?";
const fmt = (n) => "₱" + (n || 0).toLocaleString();

// Shared authenticated API call for the HR overview widgets.
async function hrApi(action, body = {}) {
    const url = (import.meta.env.VITE_API_BASE || "") + "/api/execute";
    const session = localStorage.getItem("ls_session");
    const res = await fetch(`${url}?action=${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session}` } : {}) },
        body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error || "API failed");
    return json.data;
}

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
        "/hr":            "overview",
        "/hr/employees":  "employees",
        "/hr/departments":"departments",
        "/hr/positions":  "positions",
        "/hr/schedules":  "schedules",
        "/hr/attendance": "attendance",
        "/hr/leave":      "leave",
        "/hr/onboarding": "onboarding",
        "/hr/payroll":    "payroll",
        "/hr/benefits":   "benefits",
        "/hr/loans":      "loans",
        "/hr/compliance": "compliance",
    };
    return map[pathname] || "overview";
}

/* ================================================================
   MAIN HR COMPONENT
================================================================ */
export default function HR() {
    const location = useLocation();
    const navigate = useNavigate();
    const tab = getTab(location.pathname);
    const [empPanel, setEmpPanel] = useState({ open: false, mode: "add", employee: null });
    const [agencies, setAgencies] = useState([]);

    // These would come from API — empty for now
    const [employees, setEmployees] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [leaveRequests, setLeaveRequests] = useState([]);
    const [onboarding, setOnboarding] = useState([]);
    const [payrollHistory, setPayrollHistory] = useState([]);
    const [benefits, setBenefits] = useState([]);
    const [positions, setPositions] = useState([]);
    const [loans, setLoans] = useState([]);

    const API_URL = (import.meta.env.VITE_API_BASE||"")+"/api/execute";
    const apiCall = async (action, body = {}) => {
        const session = localStorage.getItem("ls_session");
        const res = await fetch(`${API_URL}?action=${action}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session}` } : {}) },
            body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || "API failed");
        return json.data;
    };

    // Load employees and departments on mount
    useEffect(() => {
        (async () => {
            try {
                const data = await apiCall("get_employees");
                if (data.employees) setEmployees(data.employees);
            } catch {}
            try {
                const data = await apiCall("get_departments");
                if (data.departments) setDepartments(data.departments);
            } catch {}
            try {
                const data = await apiCall("get_positions");
                if (data.positions) setPositions(data.positions);
            } catch {}
        })();
    }, []);

    const openAdd = () => setEmpPanel({ open: true, mode: "add", employee: null });
    const openView = (emp) => setEmpPanel({ open: true, mode: "view", employee: emp });
    const closePanel = () => setEmpPanel({ open: false, mode: "add", employee: null });

    return (<>
        {/* Content */}
        {tab === "overview"    && <Overview nav={navigate} employees={employees} departments={departments}/>}
        {tab === "employees"   && <Employees employees={employees} onAdd={openAdd} onView={openView}/>}
        {tab === "departments" && <DepartmentsTab departments={departments} setDepartments={setDepartments} employees={employees}/>}
        {tab === "leave"       && <LeaveTabComponent employees={employees}/>}
        {tab === "onboarding"  && <OnboardingTabComponent employees={employees}/>}
        {tab === "payroll"     && <PayrollTabComponent employees={employees}/>}
        {tab === "benefits"    && <BenefitsTab benefits={benefits} setBenefits={setBenefits} employees={employees}/>}
        {tab === "loans"       && <LoanTabComponent employees={employees}/>}
        {tab === "compliance"  && <ComplianceTab agencies={agencies} setAgencies={setAgencies} currency="₱"/>}
        {tab === "positions"   && <PositionsTab positions={positions} setPositions={setPositions} departments={departments} employees={employees}/>}
        {tab === "schedules"   && <WorkSchedulesTab departments={departments} positions={positions}/>}
        {tab === "attendance"  && <AttendanceTab employees={employees}/>}

        {/* Employee Panel — Add / View / Edit */}
        <Employee
            open={empPanel.open}
            mode={empPanel.mode}
            employee={empPanel.employee}
            benefits={benefits}
            departments={departments}
            positions={positions}
            onClose={closePanel}
            onSave={(saved) => {
                setEmployees(prev => {
                    const exists = prev.findIndex(e => e.id === saved.id);
                    if (exists >= 0) {
                        const next = [...prev];
                        next[exists] = { ...next[exists], ...saved };
                        return next;
                    }
                    return [...prev, saved];
                });
            }}
            onDelete={async (emp) => {
                if (!emp?.id) return;
                try {
                    await apiCall("delete_employee", { id: emp.id });
                    setEmployees(prev => prev.filter(e => e.id !== emp.id));
                    closePanel();
                } catch (err) {
                    console.warn("Delete failed:", err);
                }
            }}
        />

        <style>{`

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

      .h-g-main{display:grid;grid-template-columns:1fr 310px;gap:16px}
      .h-g-col{display:flex;flex-direction:column;gap:16px}

      .h-tbl{width:100%;border-collapse:collapse;font-size:13px}
      .h-tbl th{text-align:left;padding:10px 12px;font-size:11px;font-weight:600;color:#aaa;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #f0f0f0}
      .h-tbl td{padding:10px 12px;border-bottom:1px solid #f8f8f8;color:#555}
      .h-tbl tr:last-child td{border-bottom:none}
      .h-tbl tr:hover td{background:#fafffe}
      .h-tbl-nm{font-weight:600;color:#333}
      .h-tbl-av{width:28px;height:28px;border-radius:7px;background:#edf8f5;color:#2d9e8b;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;margin-right:8px;vertical-align:middle}
      .h-tbl-click{cursor:pointer;transition:background .12s}
      .h-tbl-click:hover{background:#f8fffe}
      .h-badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}
      .h-b-active{background:#e0faf1;color:#0d9488}
      .h-b-leave{background:#fef3c7;color:#d97706}
      .h-b-pending{background:#fef3c7;color:#d97706}
      .h-b-done{background:#e0faf1;color:#0d9488}
      .h-b-due{background:#fef2f2;color:#ef4444}
      .h-b-paid{background:#f3f4f6;color:#999}

      .h-search{display:flex;align-items:center;gap:6px;padding:7px 12px;background:#f5f5f5;border-radius:8px;color:#bbb;max-width:240px}
      .h-search input{border:none;background:none;font-family:'DM Sans',sans-serif;font-size:13px;color:#555;outline:none;width:100%}
      .h-search input::placeholder{color:#ccc}

      .h-dept-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
      .h-dept{border:1px solid #eee;border-radius:12px;padding:16px;background:#fff;cursor:pointer;transition:all .15s;border-left:3px solid}
      .h-dept:hover{border-color:#d4e8e2;background:#fafffe}
      .h-dept-nm{font-size:14px;font-weight:700;color:#333;margin-bottom:4px}
      .h-dept-hd{font-size:12px;color:#999}
      .h-dept-ct{font-size:20px;font-weight:700;color:#222;margin-top:8px}
      .h-dept-ct span{font-size:12px;font-weight:500;color:#aaa;margin-left:4px}

      .h-lv{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #f8f8f8}
      .h-lv:last-child{border-bottom:none}
      .h-lv-av{width:32px;height:32px;border-radius:8px;background:#fef3c7;color:#d97706;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0}
      .h-lv-info{flex:1}
      .h-lv-nm{font-size:13px;font-weight:600;color:#444}
      .h-lv-meta{font-size:11px;color:#999}
      .h-lv-days{font-size:13px;font-weight:700;color:#d97706;white-space:nowrap}

      .h-onb{padding:12px;background:#f9fafb;border-radius:10px;margin-bottom:8px}
      .h-onb:last-child{margin-bottom:0}
      .h-onb-nm{font-size:13px;font-weight:600;color:#333}
      .h-onb-pos{font-size:11px;color:#999;margin-bottom:8px}
      .h-onb-bar{height:6px;background:#eee;border-radius:3px;overflow:hidden}
      .h-onb-fill{height:100%;background:#2d9e8b;border-radius:3px;transition:width .3s}
      .h-onb-ft{display:flex;justify-content:space-between;margin-top:4px;font-size:11px;color:#aaa}

      .h-empty{text-align:center;padding:40px 20px}
      .h-empty-ic{width:56px;height:56px;border-radius:50%;background:#f3f5f4;color:#ccc;display:flex;align-items:center;justify-content:center;margin:0 auto 12px}
      .h-empty-t{font-size:15px;font-weight:700;color:#444;margin-bottom:4px}
      .h-empty-d{font-size:13px;color:#999;max-width:300px;margin:0 auto}

      .h-ph{text-align:center;padding:48px 20px}
      .h-ph-ic{width:64px;height:64px;border-radius:50%;background:#f3f5f4;color:#ccc;display:flex;align-items:center;justify-content:center;margin:0 auto 14px}
      .h-ph-t{font-size:16px;font-weight:700;color:#444;margin-bottom:4px}
      .h-ph-d{font-size:13px;color:#999}

      @media(max-width:900px){.h-stats{grid-template-columns:repeat(2,1fr)}.h-g-main{grid-template-columns:1fr}.h-dept-grid{grid-template-columns:1fr 1fr}}
      @media(max-width:600px){.h-dept-grid{grid-template-columns:1fr}}
    `}</style>
    </>);
}

/* ================================================================
   OVERVIEW
================================================================ */
function Overview({ nav, employees, departments }) {
    // Overview-specific data — fetched here so each stat/panel reflects real data.
    const [leaves, setLeaves] = useState([]);
    const [runs, setRuns] = useState([]);
    const [loans, setLoans] = useState([]);
    const [checklists, setChecklists] = useState([]);
    const [agencies, setAgencies] = useState([]);
    const [attendance, setAttendance] = useState([]);

    useEffect(() => {
        const todayStr = new Date().toISOString().slice(0, 10);
        (async () => {
            try { const d = await hrApi("get_leaves");                 setLeaves(d.leaves || []); } catch {}
            try { const d = await hrApi("get_payroll_runs");           setRuns(d.runs || []); } catch {}
            try { const d = await hrApi("get_loans");                  setLoans(d.loans || []); } catch {}
            try { const d = await hrApi("get_onboarding_checklists");  setChecklists(d.checklists || []); } catch {}
            try { const d = await hrApi("get_compliance_agencies");    setAgencies(Array.isArray(d) ? d : (d?.agencies || [])); } catch {}
            try { const d = await hrApi("get_attendance", { date_from: todayStr, date_to: todayStr }); setAttendance(d.attendance || []); } catch {}
        })();
    }, []);

    const d10 = (s) => (s || "").slice(0, 10);                      // dates arrive as full timestamps
    const fullName = (o) => `${o.first_name || ""} ${o.last_name || ""}`.trim() || "—";
    const todayStr = new Date().toISOString().slice(0, 10);

    // --- Stats (all derived from real API data) ---
    const presentToday = attendance.filter(a => ["Present", "Late", "Half Day"].includes(a.status)).length;
    const onLeaveToday = new Set(
        leaves.filter(l => l.status === "Approved" && d10(l.start_date) <= todayStr && d10(l.end_date) >= todayStr)
              .map(l => l.employee_id)
    ).size;
    // Salary is E2E-encrypted and never leaves the server in the clear, so payroll
    // cost is taken from the most recent payroll run's net total, not employee salaries.
    const latestRun = runs.slice().sort((a, b) => d10(b.period_end).localeCompare(d10(a.period_end)))[0];
    const monthlyPayroll = latestRun ? (latestRun.total_net || 0) : 0;

    const pendingLeaves = leaves.filter(l => l.status === "Pending");
    const activeLoans = loans.filter(l => l.status === "Active");
    const activeChecklists = checklists.filter(c => c.status !== "Completed");

    return (<>
        <SimpleHint icon="bulb">Your team at a glance — who's in, who's on leave, and what needs attention.</SimpleHint>
        <div className="h-stats">
            {[
                { label:"Total Employees", value: employees.length.toString(), icon:"users",    color:"#2d9e8b" },
                { label:"Present Today",   value: presentToday.toString(),     icon:"check",    color:"#0ea5e9" },
                { label:"On Leave",        value: onLeaveToday.toString(),      icon:"calendar", color:"#f59e0b" },
                { label:"Monthly Payroll", value: fmt(monthlyPayroll),         icon:"peso",     color:"#8b5cf6" },
            ].map((s,i) => (
                <div key={i} className="h-st">
                    <div className="h-st-ic" style={{background:s.color+"14",color:s.color}}><I name={s.icon}/></div>
                    <div className="h-st-v">{s.value}</div>
                    <div className="h-st-l">{s.label}</div>
                </div>
            ))}
        </div>
        <div className="h-g-main">
            <div className="h-g-col">
                {/* Recent Employees */}
                <div className="h-card">
                    <div className="h-card-h"><h3 className="h-card-t">Recent Employees</h3><span className="h-card-lk" onClick={()=>nav("/hr/employees")}>View all →</span></div>
                    {employees.length > 0 ? (
                        <div style={{overflowX:"auto"}}><table className="h-tbl"><thead><tr><th>Name</th><th>Department</th><th>Position</th><th>Status</th></tr></thead><tbody>
                        {employees.slice(0,5).map(e => (
                            <tr key={e.id}><td><span className="h-tbl-av">{ini(e.name)}</span><span className="h-tbl-nm">{e.name}</span></td><td>{e.dept || e.department}</td><td>{e.pos || e.position}</td><td><span className={`h-badge ${e.status==="Active"?"h-b-active":"h-b-leave"}`}>{e.status}</span></td></tr>
                        ))}
                        </tbody></table></div>
                    ) : <Empty icon="users" title="No employees" desc="Add your first employee to get started."/>}
                </div>

                {/* Departments */}
                <div className="h-card">
                    <div className="h-card-h"><h3 className="h-card-t">Departments</h3><span className="h-card-lk" onClick={()=>nav("/hr/departments")}>Manage →</span></div>
                    {departments.length > 0 ? (
                        <div className="h-dept-grid">{departments.map((d,i) => (
                            <div key={i} className="h-dept" style={{borderLeftColor:d.color||"#2d9e8b"}}><div className="h-dept-nm">{d.name}</div><div className="h-dept-hd">Head: {d.head||"—"}</div><div className="h-dept-ct">{d.count||0}<span>employees</span></div></div>
                        ))}</div>
                    ) : <Empty icon="grid" title="No departments" desc="Departments will appear here once configured."/>}
                </div>

                {/* Compliance */}
                <div className="h-card">
                    <div className="h-card-h"><h3 className="h-card-t">Compliance Status</h3><span className="h-card-lk" onClick={()=>nav("/hr/compliance")}>Details →</span></div>
                    {agencies.length > 0 ? (
                        <div style={{overflowX:"auto"}}><table className="h-tbl"><thead><tr><th>Agency</th><th>Status</th><th>Frequency</th></tr></thead><tbody>
                        {agencies.map((c,i) => (
                            <tr key={c.id||i}><td><span className="h-tbl-nm">{c.name}</span></td><td><span className={`h-badge ${c.status==="Remitted"||c.status==="Filed"?"h-b-done":c.status==="Due"?"h-b-pending":"h-b-leave"}`}>{c.status||"—"}</span></td><td>{c.frequency||"—"}</td></tr>
                        ))}
                        </tbody></table></div>
                    ) : <Empty icon="shield" title="No compliance agencies" desc="Set up your statutory requirements." action="Configure" onAction={()=>nav("/hr/compliance")}/>}
                </div>
            </div>

            <div className="h-g-col">
                {/* Pending Leave */}
                <div className="h-card">
                    <div className="h-card-h"><h3 className="h-card-t">Pending Leave</h3><span className="h-card-lk" onClick={()=>nav("/hr/leave")}>View all</span></div>
                    {pendingLeaves.length > 0
                        ? pendingLeaves.slice(0,5).map((l,i) => (<div key={l.id||i} className="h-lv"><div className="h-lv-av">{ini(fullName(l))}</div><div className="h-lv-info"><div className="h-lv-nm">{fullName(l)}</div><div className="h-lv-meta">{l.leave_type} · {d10(l.start_date)} — {d10(l.end_date)}</div></div><div className="h-lv-days">{l.days}d</div></div>))
                        : <Empty icon="calendar" title="No pending leave" desc="Leave requests will appear here."/>
                    }
                </div>

                {/* Onboarding */}
                <div className="h-card">
                    <div className="h-card-h"><h3 className="h-card-t">Onboarding</h3><span className="h-card-lk" onClick={()=>nav("/hr/onboarding")}>View all</span></div>
                    {activeChecklists.length > 0
                        ? activeChecklists.slice(0,4).map((o,i) => (<div key={o.id||i} className="h-onb"><div className="h-onb-nm">{fullName(o)}</div><div className="h-onb-pos">{o.position||"—"}</div><div className="h-onb-bar"><div className="h-onb-fill" style={{width:(o.progress||0)+"%"}}/></div><div className="h-onb-ft"><span>{(o.completed_items||0)}/{(o.total_items||0)} items</span><span>{o.progress||0}%</span></div></div>))
                        : <Empty icon="clipboard" title="No onboarding" desc="New hires in progress will appear here."/>
                    }
                </div>

                {/* Payroll */}
                <div className="h-card">
                    <div className="h-card-h"><h3 className="h-card-t">Payroll</h3><span className="h-card-lk" onClick={()=>nav("/hr/payroll")}>View all</span></div>
                    {runs.length > 0
                        ? runs.slice(0,2).map((p,i) => (<div key={p.id||i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:i<1?"1px solid #f8f8f8":"none"}}><div><div style={{fontSize:13,fontWeight:600,color:"#333"}}>{d10(p.period_start)} — {d10(p.period_end)}</div><div style={{fontSize:11,color:"#aaa"}}>Net: {fmt(p.total_net)}</div></div><span className={`h-badge ${p.status==="Completed"?"h-b-done":"h-b-pending"}`}>{p.status}</span></div>))
                        : <Empty icon="peso" title="No payroll runs" desc="Payroll history will appear here."/>
                    }
                </div>

                {/* Active Loans */}
                <div className="h-card">
                    <div className="h-card-h"><h3 className="h-card-t">Active Loans</h3><span className="h-card-lk" onClick={()=>nav("/hr/loans")}>View all</span></div>
                    {activeLoans.length > 0
                        ? activeLoans.slice(0,3).map((l,i) => (<div key={l.id||i} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:i<2?"1px solid #f8f8f8":"none",fontSize:13}}><div><span style={{fontWeight:600,color:"#333"}}>{fullName(l)}</span><div style={{fontSize:11,color:"#aaa"}}>{l.loan_type_name}</div></div><div style={{textAlign:"right"}}><div style={{fontWeight:700,color:"#222"}}>{fmt(l.balance)}</div><div style={{fontSize:11,color:"#aaa"}}>{fmt(l.monthly_payment)}/mo</div></div></div>))
                        : <Empty icon="banknote" title="No active loans" desc="Employee loans will appear here."/>
                    }
                </div>
            </div>
        </div>
    </>);
}



/* ================================================================
   DEPARTMENTS
================================================================ */


/* ================================================================
   LEAVE
================================================================ */

/* ================================================================
   LOANS
================================================================ */
/* ================================================================
   PLACEHOLDER
================================================================ */
function Placeholder({ name }) {
    return (<div className="h-card"><div className="h-ph"><div className="h-ph-ic"><I name="briefcase" size={28}/></div><div className="h-ph-t">{name.charAt(0).toUpperCase()+name.slice(1)}</div><div className="h-ph-d">This sub-module is under development.</div></div></div>);
}
