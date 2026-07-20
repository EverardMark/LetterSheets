import { useState, useEffect, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash } from "@fortawesome/pro-light-svg-icons";
import { I } from "../../layouts/ERPLayout";
import HistoryTab, { canViewHistory } from "../components/HistoryTab";

const API_URL = (import.meta.env.VITE_API_BASE||"")+"/api/execute";

async function api(action, body = {}) {
    const session = localStorage.getItem("ls_session");
    const res = await fetch(`${API_URL}?action=${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session}` } : {}) },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`API ${action} failed: ${res.status}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || `API ${action} failed`);
    return json.data;
}

const peso = (v) => "₱" + Number(v || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Mask a currency value behind dots when the page-level "hide amounts" toggle is on.
const money = (v, hide) => hide ? "••••••" : peso(v);

// Page-level toggle to hide/show all payroll amounts (screen-share privacy).
function AmountsToggle({ hidden, onToggle }) {
    return (
        <button className="pr-btn-s" onClick={onToggle} title={hidden ? "Show amounts" : "Hide amounts"}>
            <FontAwesomeIcon icon={hidden ? faEyeSlash : faEye} style={{ fontSize: 14 }} /> {hidden ? "Show" : "Hide"} amounts
        </button>
    );
}

/* ================================================================
   PH STATUTORY TABLES (2024)
================================================================ */

// SSS 2024 contribution table (monthly salary credit → EE, ER)
const SSS_TABLE = [
    [4250,180,380],[4750,202.50,427.50],[5250,225,475],[5750,247.50,522.50],[6250,270,570],
    [6750,292.50,617.50],[7250,315,665],[7750,337.50,712.50],[8250,360,760],[8750,382.50,807.50],
    [9250,405,855],[9750,427.50,902.50],[10250,450,950],[10750,472.50,997.50],[11250,495,1045],
    [11750,517.50,1092.50],[12250,540,1140],[12750,562.50,1187.50],[13250,585,1235],[13750,607.50,1282.50],
    [14250,630,1330],[14750,652.50,1377.50],[15250,675,1425],[15750,697.50,1472.50],[16250,720,1520],
    [16750,742.50,1567.50],[17250,765,1615],[17750,787.50,1662.50],[18250,810,1710],[18750,832.50,1757.50],
    [19250,855,1805],[19750,877.50,1852.50],[20250,900,1900],[20750,922.50,1947.50],[21250,945,1995],
    [21750,967.50,2042.50],[22250,990,2090],[22750,1012.50,2137.50],[23250,1035,2185],[23750,1057.50,2232.50],
    [24250,1080,2280],[24750,1102.50,2327.50],[25250,1125,2375],[25750,1147.50,2422.50],[26250,1170,2470],
    [26750,1192.50,2517.50],[27250,1215,2565],[27750,1237.50,2612.50],[28250,1260,2660],[28750,1282.50,2707.50],
    [29250,1305,2755], // fills the gap between 28,750 and the max; verify vs the official SSS schedule
    [29750,1350,2850],
];

function computeSSS(monthlySalary) {
    if (monthlySalary < 4000) return { ee: 180, er: 380 };
    for (const [ceiling, ee, er] of SSS_TABLE) {
        if (monthlySalary <= ceiling) return { ee, er };
    }
    return { ee: 1350, er: 2850 }; // max
}

// PhilHealth 2024: 5% of monthly basic, split 50/50, floor 10k ceiling 100k
function computePhilHealth(monthlySalary) {
    const base = Math.min(Math.max(monthlySalary, 10000), 100000);
    const total = base * 0.05;
    return { ee: total / 2, er: total / 2 };
}

// Pag-IBIG: EE 1% if ≤1500, else 2%; ER always 2%; max ₱200 each (mandatory on ₱10k ceiling)
function computePagibig(monthlySalary) {
    const cap = Math.min(monthlySalary, 10000);
    const eeRate = monthlySalary <= 1500 ? 0.01 : 0.02;
    return { ee: Math.min(cap * eeRate, 200), er: Math.min(cap * 0.02, 200) };
}

// BIR 2024 monthly graduated tax (TRAIN law)
const TAX_BRACKETS_MONTHLY = [
    [20833, 0, 0],
    [33333, 20833, 0.15],
    [66667, 33333, 0.20],
    [166667, 66667, 0.25],
    [666667, 166667, 0.30],
    [Infinity, 666667, 0.35],
];
const TAX_BASE_MONTHLY = [0, 0, 1875, 8541.80, 33541.80, 183541.80];

function computeTax(monthlyTaxable) {
    if (monthlyTaxable <= 20833) return 0;
    for (let i = 1; i < TAX_BRACKETS_MONTHLY.length; i++) {
        const [ceil, floor, rate] = TAX_BRACKETS_MONTHLY[i];
        if (monthlyTaxable <= ceil) {
            return TAX_BASE_MONTHLY[i] + (monthlyTaxable - floor) * rate;
        }
    }
    return 0;
}

// Scale statutory for semi-monthly: compute on monthly, then halve
function computeStatutory(monthlySalary, settings) {
    const divisor = settings.pay_schedule === "semi_monthly" ? 2 : 1;
    const sss = settings.enable_sss ? computeSSS(monthlySalary) : { ee: 0, er: 0 };
    const ph = settings.enable_philhealth ? computePhilHealth(monthlySalary) : { ee: 0, er: 0 };
    const pi = settings.enable_pagibig ? computePagibig(monthlySalary) : { ee: 0, er: 0 };

    const totalEEDeductions = sss.ee + ph.ee + pi.ee;
    const monthlyTaxable = monthlySalary - totalEEDeductions;
    const tax = settings.enable_tax ? computeTax(monthlyTaxable) : 0;

    return {
        sss_ee: Math.round(sss.ee / divisor * 100) / 100,
        sss_er: Math.round(sss.er / divisor * 100) / 100,
        philhealth_ee: Math.round(ph.ee / divisor * 100) / 100,
        philhealth_er: Math.round(ph.er / divisor * 100) / 100,
        pagibig_ee: Math.round(pi.ee / divisor * 100) / 100,
        pagibig_er: Math.round(pi.er / divisor * 100) / 100,
        withholding_tax: Math.round(tax / divisor * 100) / 100,
    };
}

/* ================================================================
   DECRYPT HELPER
================================================================ */
async function decryptField(enc, companyKey) {
    if (!enc || !enc.iv || !enc.data) return null;
    try {
        const iv = Uint8Array.from(atob(enc.iv), c => c.charCodeAt(0));
        const data = Uint8Array.from(atob(enc.data), c => c.charCodeAt(0));
        const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, companyKey, data);
        return new TextDecoder().decode(plain);
    } catch { return null; }
}

async function getCompanyKey() {
    const keyB64 = sessionStorage.getItem("ls_company_key");
    if (!keyB64) return null;
    const keyRaw = Uint8Array.from(atob(keyB64), c => c.charCodeAt(0));
    return crypto.subtle.importKey("raw", keyRaw, { name: "AES-GCM" }, false, ["decrypt"]);
}

/* ================================================================
   MAIN COMPONENT
================================================================ */
export default function PayrollTab({ employees = [] }) {
    const company = JSON.parse(localStorage.getItem("ls_company") || "{}");
    const currentUser = JSON.parse(localStorage.getItem("ls_user") || "{}");
    const isEmployee = company.role === "employee";
    const myEmployee = isEmployee ? employees.find(e => e.user_id === currentUser.id) : null;

    const [view, setView] = useState("list"); // list | run | settings
    const [runs, setRuns] = useState([]);
    const [settings, setSettings] = useState(null);
    const [activeRun, setActiveRun] = useState(null);
    const [items, setItems] = useState([]);
    const [computing, setComputing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [hideAmounts, setHideAmounts] = useState(false);

    const loadRuns = useCallback(async () => {
        try { const d = await api("get_payroll_runs"); setRuns(d.runs || []); } catch {}
    }, []);

    const loadSettings = useCallback(async () => {
        try { const d = await api("get_payroll_settings"); setSettings(d.settings); } catch {}
    }, []);

    useEffect(() => { loadRuns(); loadSettings(); }, [loadRuns, loadSettings]);

    const openRun = async (run) => {
        setActiveRun(run);
        setView("run");
        try {
            const d = await api("get_payroll_items", { run_id: run.id });
            setItems(d.items || []);
        } catch { setItems([]); }
    };

    const createRun = async (periodStart, periodEnd, payDate) => {
        try {
            const d = await api("create_payroll_run", {
                period_start: periodStart, period_end: periodEnd,
                pay_date: payDate || null,
            });
            await loadRuns();
            if (d.id) openRun({ ...d, status: "Draft" });
        } catch (e) { alert("Failed: " + e.message); }
    };

    /* ---- COMPUTE PAYROLL (browser-side) ---- */
    const computePayroll = async () => {
        if (!activeRun || !settings) return;
        setComputing(true);

        try {
            const companyKey = await getCompanyKey();
            const newItems = [];

            // Get attendance for this period
            let attendance = [];
            try {
                const attData = await api("get_attendance", { date_from: activeRun.period_start.substring(0,10), date_to: activeRun.period_end.substring(0,10) });
                attendance = attData.attendance || [];
            } catch {}

            // Build attendance map per employee
            const attMap = {};
            attendance.forEach(a => {
                if (!attMap[a.employee_id]) attMap[a.employee_id] = { hours: 0, ot: 0, days: 0 };
                attMap[a.employee_id].hours += a.hours_worked || 0;
                attMap[a.employee_id].ot += a.overtime_hours || 0;
                // Only count actually-worked days toward basic pay. Absent / On Leave /
                // Holiday / Rest Day rows must not be paid as worked days.
                const st = a.status || "Present";
                if (st === "Present" || st === "Late") attMap[a.employee_id].days += 1;
                else if (st === "Half Day") attMap[a.employee_id].days += 0.5;
            });

            // Approved leaves overlapping this period, split into paid vs unpaid days.
            // Paid leave (Vacation, Sick, etc.) is paid like worked days; "Unpaid
            // Leave" / LWOP is docked. Days are clipped to the pay period.
            const pStart = activeRun.period_start.substring(0, 10);
            const pEnd = activeRun.period_end.substring(0, 10);
            const isUnpaidLeave = (t) => /unpaid|lwop|without pay/i.test(t || "");
            const overlapDays = (ls, le, total) => {
                if (!ls || !le) return 0;
                const s = ls > pStart ? ls : pStart;   // later of leave-start / period-start
                const e = le < pEnd ? le : pEnd;        // earlier of leave-end / period-end
                if (s > e) return 0;                    // no overlap
                const cal = Math.round((new Date(e + "T00:00:00") - new Date(s + "T00:00:00")) / 86400000) + 1;
                return Math.min(Math.max(cal, 0), total || cal); // don't exceed the leave's recorded days
            };
            const leaveMap = {};
            try {
                const lvData = await api("get_leaves", { status: "Approved" });
                (lvData.leaves || []).forEach(l => {
                    const days = overlapDays((l.start_date || "").substring(0, 10), (l.end_date || "").substring(0, 10), l.days || 0);
                    if (days <= 0) return;
                    const m = leaveMap[l.employee_id] = leaveMap[l.employee_id] || { paid: 0, unpaid: 0 };
                    if (isUnpaidLeave(l.leave_type)) m.unpaid += days; else m.paid += days;
                });
            } catch {}

            // Active-loan amortization to withhold from net pay (apportioned per pay period).
            const loanMap = {};
            try {
                const loanData = await api("get_loans", { status: "Active" });
                (loanData.loans || []).forEach(l => {
                    loanMap[l.employee_id] = (loanMap[l.employee_id] || 0) + (l.monthly_payment || 0);
                });
            } catch {}

            const activeEmps = employees.filter(e => e.status === "Active");

            for (const emp of activeEmps) {
                // Fetch full employee to get encrypted salary
                let monthlySalary = 0;
                try {
                    const full = await api("get_employee", { id: emp.id });
                    if (full.encrypted?.basic_salary && companyKey) {
                        const val = await decryptField(full.encrypted.basic_salary, companyKey);
                        monthlySalary = parseFloat(val) || 0;
                    }
                } catch {}

                if (monthlySalary <= 0) continue; // skip if no salary

                const att = attMap[emp.id] || { hours: 0, ot: 0, days: 0 };
                const workingDays = settings.working_days || 22;
                const divisor = settings.pay_schedule === "semi_monthly" ? 2 : 1;
                const periodDays = workingDays / divisor;

                // Leave-aware paid days:
                //  • with attendance → worked days + PAID leave (worked-status rows
                //    already exclude leave; add paid leave back). UNPAID leave stays
                //    excluded, so it's docked.
                //  • no attendance   → assume full period present, minus UNPAID leave
                //    (paid leave is already covered by the full period).
                // Capped at the period so it never over-pays.
                const lv = leaveMap[emp.id] || { paid: 0, unpaid: 0 };
                const paidLeaveDays = lv.paid;
                const unpaidLeaveDays = lv.unpaid;
                let daysWorked;
                if (attMap[emp.id]) {
                    daysWorked = Math.min(att.days + paidLeaveDays, periodDays);
                } else {
                    daysWorked = Math.max(periodDays - unpaidLeaveDays, 0);
                }
                daysWorked = Math.round(daysWorked * 100) / 100;

                const dailyRate = monthlySalary / workingDays;
                const basicPay = Math.round(dailyRate * daysWorked * 100) / 100;
                const hourlyRate = dailyRate / (settings.hours_per_day || 8);
                const otPay = Math.round(att.ot * hourlyRate * (settings.ot_multiplier || 1.25) * 100) / 100;

                const grossPay = basicPay + otPay;

                // Statutory (based on full monthly salary for correct bracket)
                const stat = computeStatutory(monthlySalary, settings);
                const loanDeduction = Math.round(((loanMap[emp.id] || 0) / divisor) * 100) / 100;
                const totalDeductions = stat.sss_ee + stat.philhealth_ee + stat.pagibig_ee + stat.withholding_tax + loanDeduction;
                const netPay = Math.round((grossPay - totalDeductions) * 100) / 100;

                const existing = items.find(it => it.employee_id === emp.id);

                const item = {
                    id: existing?.id || crypto.randomUUID(),
                    run_id: activeRun.id,
                    employee_id: emp.id,
                    basic_pay: basicPay,
                    days_worked: daysWorked,
                    paid_leave_days: paidLeaveDays,
                    unpaid_leave_days: unpaidLeaveDays,
                    hours_worked: att.hours,
                    ot_hours: att.ot,
                    ot_pay: otPay,
                    holiday_pay: 0,
                    night_diff: 0,
                    allowances: 0,
                    other_earnings: 0,
                    gross_pay: grossPay,
                    ...stat,
                    benefit_deductions: 0,
                    loan_deductions: loanDeduction,
                    other_deductions: 0,
                    total_deductions: Math.round(totalDeductions * 100) / 100,
                    net_pay: netPay,
                    first_name: emp.first_name,
                    last_name: emp.last_name,
                    department: emp.department,
                    position: emp.position,
                };

                // Save to server
                try { await api("save_payroll_item", item); } catch {}
                newItems.push(item);
            }

            setItems(newItems);

            // Update run totals
            const totGross = newItems.reduce((s, i) => s + i.gross_pay, 0);
            const totDed = newItems.reduce((s, i) => s + i.total_deductions, 0);
            const totNet = newItems.reduce((s, i) => s + i.net_pay, 0);

            const updated = {
                ...activeRun,
                status: activeRun.status === "Draft" ? "Draft" : activeRun.status,
                total_gross: Math.round(totGross * 100) / 100,
                total_deductions: Math.round(totDed * 100) / 100,
                total_net: Math.round(totNet * 100) / 100,
                employee_count: newItems.length,
            };
            try { await api("update_payroll_run", updated); } catch {}
            setActiveRun(updated);
            loadRuns();
        } catch (e) {
            alert("Compute failed: " + e.message);
        }
        setComputing(false);
    };

    const approveRun = async () => {
        if (!activeRun) return;
        const updated = { ...activeRun, status: "Approved" };
        try {
            await api("update_payroll_run", updated);
            setActiveRun(updated);
            loadRuns();
        } catch (e) { alert("Failed: " + e.message); }
    };

    const deleteRun = async (id) => {
        try {
            await api("delete_payroll_run", { id });
            setView("list");
            loadRuns();
        } catch (e) { alert("Failed: " + e.message); }
    };

    if (!settings) return <div style={{padding:40,textAlign:"center",color:"#999"}}>Loading...</div>;

    /* ---- SETTINGS VIEW ---- */
    if (view === "settings") return <SettingsView settings={settings} onSave={async (s) => {
        try {
            await api("save_payroll_settings", s);
            setSettings(s);
            setView("list");
        } catch (e) { alert("Failed: " + e.message); }
    }} onBack={() => setView("list")} />;

    /* ---- RUN DETAIL VIEW ---- */
    if (view === "run" && activeRun) return (
        <RunDetail
            run={activeRun} items={items} settings={settings}
            company={company}
            computing={computing}
            hideAmounts={hideAmounts}
            onToggleAmounts={() => setHideAmounts(v => !v)}
            onCompute={computePayroll}
            onApprove={approveRun}
            onDelete={() => deleteRun(activeRun.id)}
            onBack={() => { setView("list"); setActiveRun(null); }}
        />
    );

    /* ---- LIST VIEW (default) ---- */
    const visibleRuns = isEmployee ? runs.filter(r => r.status !== "Draft") : runs;

    return (<>
        <div className="pr-bar">
            <span className="pr-bar-count">{visibleRuns.length} payroll runs</span>
            <div className="pr-bar-right">
                <AmountsToggle hidden={hideAmounts} onToggle={() => setHideAmounts(v => !v)} />
                {!isEmployee && (<>
                    <button className="pr-btn-s" onClick={() => setView("settings")}><I name="settings" size={14}/> Settings</button>
                    <NewRunButton settings={settings} onCreate={createRun} />
                </>)}
            </div>
        </div>

        {visibleRuns.length === 0 ? (
            <div className="pr-empty">
                <div className="pr-empty-ic"><I name="dollar-sign" size={32}/></div>
                <h3 className="pr-empty-t">{isEmployee ? "No payslips yet" : "No payroll runs"}</h3>
                <p className="pr-empty-d">{isEmployee ? "Your payslips will appear here once payroll is processed." : "Create your first payroll run to compute employee pay."}</p>
            </div>
        ) : (
            <div className="pr-tbl-wrap">
                <table className="pr-tbl">
                    <thead><tr><th>Period</th><th>Employees</th><th>Gross</th><th>Deductions</th><th>Net</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                    {visibleRuns.map(r => {
                        const sc = r.status === "Approved" ? "#22c55e" : r.status === "Paid" ? "#0ea5e9" : "#f59e0b";
                        return (
                            <tr key={r.id} className="pr-row" onClick={() => openRun(r)}>
                                <td className="pr-td-period">{fmtPeriod(r.period_start, r.period_end)}</td>
                                <td className="pr-td-count">{r.employee_count}</td>
                                <td className="pr-td-amt">{money(r.total_gross, hideAmounts)}</td>
                                <td className="pr-td-amt">{money(r.total_deductions, hideAmounts)}</td>
                                <td className="pr-td-amt pr-td-net">{money(r.total_net, hideAmounts)}</td>
                                <td><span className="pr-badge" style={{background:sc+"18",color:sc}}>{r.status}</span></td>
                                <td><span style={{color:"#6366f1",fontWeight:600,fontSize:12}}>View →</span></td>
                            </tr>
                        );
                    })}
                    </tbody>
                </table>
            </div>
        )}
        <style>{prCSS}</style>
    </>);
}

function fmtPeriod(a, b) {
    const d1 = new Date((a||"").substring(0,10) + "T00:00:00");
    const d2 = new Date((b||"").substring(0,10) + "T00:00:00");
    const fmt = d => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${fmt(d1)} – ${fmt(d2)}, ${d2.getFullYear()}`;
}

function fmtDate(d) {
    if (!d) return "—";
    const dt = new Date((d || "").substring(0, 10) + "T00:00:00");
    return isNaN(dt) ? d : dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/* ================================================================
   NEW RUN BUTTON (with period picker)
================================================================ */
function NewRunButton({ settings, onCreate }) {
    const [open, setOpen] = useState(false);
    const [ps, setPS] = useState("");
    const [pe, setPE] = useState("");

    useEffect(() => {
        const now = new Date();
        const y = now.getFullYear(), m = now.getMonth();
        if (settings?.pay_schedule === "semi_monthly") {
            if (now.getDate() <= 15) {
                setPS(`${y}-${String(m+1).padStart(2,"0")}-01`);
                setPE(`${y}-${String(m+1).padStart(2,"0")}-15`);
            } else {
                setPS(`${y}-${String(m+1).padStart(2,"0")}-16`);
                setPE(new Date(y, m+1, 0).toISOString().slice(0,10));
            }
        } else {
            setPS(`${y}-${String(m+1).padStart(2,"0")}-01`);
            setPE(new Date(y, m+1, 0).toISOString().slice(0,10));
        }
    }, [settings, open]);

    return (<>
        <button className="pr-btn-p" onClick={() => setOpen(true)}><I name="plus" size={14}/> New Run</button>
        {open && (<>
            <div className="lv-modal-bg" onClick={() => setOpen(false)}/>
            <div className="lv-modal" style={{width:380}}>
                <h3 className="lv-modal-t">New Payroll Run</h3>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:14}}>
                    <div><label className="bp-label">Period Start</label><input type="date" className="bp-input" value={ps} onChange={e => setPS(e.target.value)}/></div>
                    <div><label className="bp-label">Period End</label><input type="date" className="bp-input" value={pe} onChange={e => setPE(e.target.value)}/></div>
                </div>
                <div className="lv-modal-btns">
                    <button className="bp-btn-cancel" onClick={() => setOpen(false)}>Cancel</button>
                    <button className="pr-btn-p" onClick={() => { onCreate(ps, pe); setOpen(false); }}>Create Run</button>
                </div>
            </div>
        </>)}
    </>);
}

/* ================================================================
   RUN DETAIL
================================================================ */
function RunDetail({ run, items, settings, company, computing, hideAmounts, onToggleAmounts, onCompute, onApprove, onDelete, onBack }) {
    const isDraft = run.status === "Draft";
    const sc = run.status === "Approved" ? "#22c55e" : run.status === "Paid" ? "#0ea5e9" : "#f59e0b";
    const m = (v) => money(v, hideAmounts);
    const [showHist, setShowHist] = useState(false);
    const [payslipItem, setPayslipItem] = useState(null);

    return (<>
        <div className="pr-run-head">
            <button className="pr-back" onClick={onBack}><I name="arrow-left" size={16}/> Back</button>
            <div className="pr-run-info">
                <h2 className="pr-run-title">{fmtPeriod(run.period_start, run.period_end)}</h2>
                <span className="pr-badge" style={{background:sc+"18",color:sc}}>{run.status}</span>
            </div>
            <div className="pr-run-actions">
                <AmountsToggle hidden={hideAmounts} onToggle={onToggleAmounts} />
                {canViewHistory() && (
                    <button className="pr-btn-hist" onClick={() => setShowHist(v => !v)} style={{display:"inline-flex",alignItems:"center",gap:5,padding:"8px 14px",border:"1px solid "+(showHist?"#2d9e8b":"#e0e0e0"),borderRadius:8,background:showHist?"#eafaf6":"#fff",color:showHist?"#2d9e8b":"#555",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                        <I name="clock" size={13}/> History
                    </button>
                )}
                {isDraft && <button className="pr-btn-compute" onClick={onCompute} disabled={computing}>{computing ? "Computing..." : "⚡ Compute Payroll"}</button>}
                {isDraft && items.length > 0 && <button className="lv-foot-approve" onClick={onApprove}><I name="check" size={13}/> Approve</button>}
                {isDraft && <button className="bp-btn-danger" onClick={onDelete}>Delete</button>}
            </div>
        </div>

        <div className="pr-summary">
            {[
                { label: "Employees", value: items.length, color: "#6366f1" },
                { label: "Gross Pay", value: m(run.total_gross), color: "#22c55e" },
                { label: "Deductions", value: m(run.total_deductions), color: "#ef4444" },
                { label: "Net Pay", value: m(run.total_net), color: "#0ea5e9" },
            ].map((s,i) => (
                <div key={i} className="pr-sum-card">
                    <div className="pr-sum-l">{s.label}</div>
                    <div className="pr-sum-v" style={{color:s.color}}>{s.value}</div>
                </div>
            ))}
        </div>

        {showHist && (
            <div style={{background:"#fff",border:"1px solid #eef0f2",borderRadius:12,padding:"14px 16px",marginBottom:14}}>
                <h3 style={{fontSize:14,fontWeight:700,color:"#333",marginBottom:6}}>Change History</h3>
                <HistoryTab table="payroll_runs" recordId={run.id} />
            </div>
        )}

        {items.length === 0 ? (
            <div className="pr-empty">
                <div className="pr-empty-ic"><I name="users" size={28}/></div>
                <h3 className="pr-empty-t">{isDraft ? 'Click "Compute Payroll" to generate' : "No items"}</h3>
                <p className="pr-empty-d">Payroll will be computed for all active employees with salary data.</p>
            </div>
        ) : (
            <div className="pr-tbl-wrap">
                <table className="pr-tbl pr-tbl-items">
                    <thead>
                    <tr>
                        <th>Employee</th>
                        <th style={{textAlign:"right"}}>Basic</th>
                        <th style={{textAlign:"right"}}>OT</th>
                        <th style={{textAlign:"right"}}>Gross</th>
                        <th style={{textAlign:"right"}}>SSS</th>
                        <th style={{textAlign:"right"}}>PhilH</th>
                        <th style={{textAlign:"right"}}>HDMF</th>
                        <th style={{textAlign:"right"}}>Tax</th>
                        <th style={{textAlign:"right"}}>Total Ded</th>
                        <th style={{textAlign:"right"}}>Net Pay</th>
                        <th style={{textAlign:"center",width:44}}></th>
                    </tr>
                    </thead>
                    <tbody>
                    {items.map(it => (
                        <tr key={it.id}>
                            <td>
                                <div className="pr-emp">
                                    <span className="pr-emp-av">{(it.first_name?.[0]||"")+(it.last_name?.[0]||"")}</span>
                                    <div><div className="pr-emp-name">{it.first_name} {it.last_name}</div><div className="pr-emp-dept">{it.department}</div>
                                    {(it.paid_leave_days > 0 || it.unpaid_leave_days > 0) && (
                                        <div style={{fontSize:11,marginTop:2}}>
                                            {it.paid_leave_days > 0 && <span style={{color:"#16a34a"}}>{it.paid_leave_days} paid leave</span>}
                                            {it.paid_leave_days > 0 && it.unpaid_leave_days > 0 && <span style={{color:"#ccc"}}> · </span>}
                                            {it.unpaid_leave_days > 0 && <span style={{color:"#ef4444"}}>{it.unpaid_leave_days} unpaid (docked)</span>}
                                        </div>
                                    )}
                                </div>
                                </div>
                            </td>
                            <td className="pr-r">{m(it.basic_pay)}</td>
                            <td className="pr-r">{it.ot_pay > 0 ? m(it.ot_pay) : "—"}</td>
                            <td className="pr-r pr-bold">{m(it.gross_pay)}</td>
                            <td className="pr-r pr-ded">{m(it.sss_ee)}</td>
                            <td className="pr-r pr-ded">{m(it.philhealth_ee)}</td>
                            <td className="pr-r pr-ded">{m(it.pagibig_ee)}</td>
                            <td className="pr-r pr-ded">{m(it.withholding_tax)}</td>
                            <td className="pr-r pr-ded pr-bold">{m(it.total_deductions)}</td>
                            <td className="pr-r pr-net">{m(it.net_pay)}</td>
                            <td style={{textAlign:"center"}}>
                                <button className="pr-slip-btn" title="View / print payslip" onClick={() => setPayslipItem(it)}>
                                    <I name="file-text" size={15}/>
                                </button>
                            </td>
                        </tr>
                    ))}
                    <tr className="pr-total-row">
                        <td style={{fontWeight:700}}>TOTAL</td>
                        <td className="pr-r pr-bold">{m(items.reduce((s,i)=>s+i.basic_pay,0))}</td>
                        <td className="pr-r">{m(items.reduce((s,i)=>s+i.ot_pay,0))}</td>
                        <td className="pr-r pr-bold">{m(items.reduce((s,i)=>s+i.gross_pay,0))}</td>
                        <td className="pr-r pr-ded">{m(items.reduce((s,i)=>s+i.sss_ee,0))}</td>
                        <td className="pr-r pr-ded">{m(items.reduce((s,i)=>s+i.philhealth_ee,0))}</td>
                        <td className="pr-r pr-ded">{m(items.reduce((s,i)=>s+i.pagibig_ee,0))}</td>
                        <td className="pr-r pr-ded">{m(items.reduce((s,i)=>s+i.withholding_tax,0))}</td>
                        <td className="pr-r pr-ded pr-bold">{m(items.reduce((s,i)=>s+i.total_deductions,0))}</td>
                        <td className="pr-r pr-net pr-bold">{m(items.reduce((s,i)=>s+i.net_pay,0))}</td>
                        <td></td>
                    </tr>
                    </tbody>
                </table>
            </div>
        )}
        {payslipItem && <PayslipModal item={payslipItem} run={run} company={company} onClose={() => setPayslipItem(null)} />}
        <style>{prCSS}</style>
    </>);
}

/* ================================================================
   PAYSLIP — printable per-employee pay statement
   Rendered from the already-computed payroll item; "Print" hands off
   to the browser's print dialog (Save as PDF) via a scoped print CSS
   that hides everything except .payslip-print.
================================================================ */
function PayslipModal({ item, run, company, onClose }) {
    const p = (v) => peso(v);
    const companyName = company?.name || company?.company_name || "Company";
    const empName = `${item.first_name || ""} ${item.last_name || ""}`.trim() || "Employee";

    const earnings = [
        ["Basic Pay", item.basic_pay],
        ["Overtime", item.ot_pay],
        ["Holiday Pay", item.holiday_pay],
        ["Night Differential", item.night_diff],
        ["Allowances", item.allowances],
        ["Other Earnings", item.other_earnings],
    ].filter(([, v]) => Number(v || 0) !== 0);

    const deductions = [
        ["SSS", item.sss_ee],
        ["PhilHealth", item.philhealth_ee],
        ["Pag-IBIG", item.pagibig_ee],
        ["Withholding Tax", item.withholding_tax],
        ["Benefit Deductions", item.benefit_deductions],
        ["Loan Deductions", item.loan_deductions],
        ["Other Deductions", item.other_deductions],
    ].filter(([, v]) => Number(v || 0) !== 0);

    return (
        <div className="ps-bg" onClick={onClose}>
            <div className="ps-modal" onClick={e => e.stopPropagation()}>
                <div className="ps-toolbar">
                    <span className="ps-toolbar-t">Payslip</span>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button className="ps-btn-print" onClick={() => window.print()}><I name="download" size={13}/> Print / Save PDF</button>
                        <button className="ps-btn-close" onClick={onClose}><I name="x-circle" size={16}/></button>
                    </div>
                </div>

                <div className="payslip-print">
                    <div className="ps-head">
                        <div>
                            <div className="ps-co">{companyName}</div>
                            <div className="ps-doc">PAYSLIP</div>
                        </div>
                        <div className="ps-period">
                            <div>Pay Period</div>
                            <strong>{fmtPeriod(run.period_start, run.period_end)}</strong>
                            {run.pay_date && <div className="ps-paydate">Pay Date: {fmtDate(run.pay_date)}</div>}
                        </div>
                    </div>

                    <div className="ps-emp">
                        <div><span className="ps-lbl">Employee</span><strong>{empName}</strong></div>
                        {item.department && <div><span className="ps-lbl">Department</span>{item.department}</div>}
                        {item.days_worked != null && <div><span className="ps-lbl">Days Worked</span>{Number(item.days_worked)}</div>}
                        <div><span className="ps-lbl">Run Status</span>{run.status}</div>
                    </div>

                    <div className="ps-cols">
                        <div className="ps-col">
                            <div className="ps-col-h ps-earn">Earnings</div>
                            {earnings.length ? earnings.map(([l, v]) => (
                                <div key={l} className="ps-row"><span>{l}</span><span>{p(v)}</span></div>
                            )) : <div className="ps-row ps-muted"><span>—</span><span></span></div>}
                            <div className="ps-row ps-sub"><span>Gross Pay</span><span>{p(item.gross_pay)}</span></div>
                        </div>
                        <div className="ps-col">
                            <div className="ps-col-h ps-ded-h">Deductions</div>
                            {deductions.length ? deductions.map(([l, v]) => (
                                <div key={l} className="ps-row"><span>{l}</span><span>{p(v)}</span></div>
                            )) : <div className="ps-row ps-muted"><span>—</span><span></span></div>}
                            <div className="ps-row ps-sub"><span>Total Deductions</span><span>{p(item.total_deductions)}</span></div>
                        </div>
                    </div>

                    <div className="ps-net">
                        <span>NET PAY</span>
                        <span>{p(item.net_pay)}</span>
                    </div>

                    <div className="ps-foot">
                        This is a system-generated payslip and does not require a signature.
                    </div>
                </div>
            </div>
            <style>{psCSS}</style>
        </div>
    );
}

const psCSS = `
.ps-bg{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:700;display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow:auto}
.ps-modal{background:#fff;border-radius:14px;width:100%;max-width:640px;box-shadow:0 20px 60px rgba(0,0,0,.25);overflow:hidden}
.ps-toolbar{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #eef0f2;background:#fafbfc}
.ps-toolbar-t{font-size:14px;font-weight:700;color:#333}
.ps-btn-print{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border:none;border-radius:8px;background:#0ea5e9;color:#fff;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;cursor:pointer}
.ps-btn-print:hover{background:#0284c7}
.ps-btn-close{width:34px;height:34px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;color:#888;display:flex;align-items:center;justify-content:center;cursor:pointer}
.payslip-print{padding:28px 30px;color:#1f2937;font-family:'DM Sans',sans-serif}
.ps-head{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;border-bottom:2px solid #111827;margin-bottom:18px}
.ps-co{font-size:20px;font-weight:800;color:#111827}
.ps-doc{font-size:12px;letter-spacing:3px;color:#6b7280;margin-top:2px;font-weight:600}
.ps-period{text-align:right;font-size:12px;color:#6b7280}
.ps-period strong{display:block;font-size:14px;color:#111827;margin-top:2px}
.ps-paydate{margin-top:4px}
.ps-emp{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin-bottom:20px}
.ps-emp>div{font-size:13px;color:#374151}
.ps-emp strong{color:#111827}
.ps-lbl{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#9ca3af;margin-bottom:1px}
.ps-cols{display:flex;gap:24px}
.ps-col{flex:1}
.ps-col-h{font-size:12px;font-weight:700;padding:6px 0;border-bottom:1px solid #e5e7eb;margin-bottom:6px}
.ps-earn{color:#059669}
.ps-ded-h{color:#dc2626}
.ps-row{display:flex;justify-content:space-between;font-size:13px;padding:5px 0;color:#374151}
.ps-row.ps-sub{border-top:1px solid #e5e7eb;margin-top:4px;padding-top:8px;font-weight:700;color:#111827}
.ps-row.ps-muted{color:#9ca3af}
.ps-net{display:flex;justify-content:space-between;align-items:center;margin-top:22px;padding:16px 18px;background:#0ea5e912;border:1px solid #0ea5e930;border-radius:10px;font-size:16px;font-weight:800;color:#0369a1}
.ps-foot{margin-top:20px;font-size:11px;color:#9ca3af;text-align:center;font-style:italic}
@media print{
  body *{visibility:hidden !important}
  .payslip-print,.payslip-print *{visibility:visible !important}
  .ps-bg{position:static;background:none;padding:0;overflow:visible}
  .ps-modal{box-shadow:none;max-width:none;border-radius:0}
  .ps-toolbar{display:none !important}
  .payslip-print{position:absolute;left:0;top:0;width:100%;padding:0}
}
`;

/* ================================================================
   SETTINGS VIEW
================================================================ */
function SettingsView({ settings, onSave, onBack }) {
    const [form, setForm] = useState({ ...settings });
    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    return (<>
        <div className="pr-run-head">
            <button className="pr-back" onClick={onBack}><I name="arrow-left" size={16}/> Back</button>
            <h2 className="pr-run-title">Payroll Settings</h2>
            <button className="pr-btn-p" onClick={() => onSave(form)}>Save Settings</button>
        </div>

        <div className="pr-settings">
            <div className="pr-set-section">
                <h4 className="bp-sec-title">Schedule & Rates</h4>
                <div className="bp-fields">
                    <div className="bp-field">
                        <label className="bp-label">Pay Schedule</label>
                        <select className="bp-input" value={form.pay_schedule} onChange={e => set("pay_schedule", e.target.value)}>
                            <option value="semi_monthly">Semi-Monthly (1-15, 16-end)</option>
                            <option value="monthly">Monthly</option>
                        </select>
                    </div>
                    <div className="bp-field">
                        <label className="bp-label">Working Days/Month</label>
                        <input type="number" className="bp-input" value={form.working_days} onChange={e => set("working_days", parseInt(e.target.value)||22)} />
                    </div>
                    <div className="bp-field">
                        <label className="bp-label">Hours/Day</label>
                        <input type="number" className="bp-input" value={form.hours_per_day} onChange={e => set("hours_per_day", parseFloat(e.target.value)||8)} step="0.5" />
                    </div>
                    <div className="bp-field">
                        <label className="bp-label">OT Multiplier</label>
                        <input type="number" className="bp-input" value={form.ot_multiplier} onChange={e => set("ot_multiplier", parseFloat(e.target.value)||1.25)} step="0.05" />
                    </div>
                    <div className="bp-field">
                        <label className="bp-label">Night Diff %</label>
                        <input type="number" className="bp-input" value={form.night_diff_pct} onChange={e => set("night_diff_pct", parseFloat(e.target.value)||0.10)} step="0.01" />
                    </div>
                </div>
            </div>

            <div className="pr-set-section">
                <h4 className="bp-sec-title">Statutory Deductions</h4>
                <p style={{fontSize:12,color:"#888",marginBottom:14}}>Toggle which PH statutory contributions to auto-compute. Uses 2024 contribution tables.</p>
                <div className="pr-toggles">
                    {[
                        { key: "enable_sss", label: "SSS", desc: "Social Security System" },
                        { key: "enable_philhealth", label: "PhilHealth", desc: "Philippine Health Insurance" },
                        { key: "enable_pagibig", label: "Pag-IBIG / HDMF", desc: "Home Development Mutual Fund" },
                        { key: "enable_tax", label: "Withholding Tax", desc: "BIR graduated tax (TRAIN Law)" },
                    ].map(t => (
                        <div key={t.key} className="pr-toggle-row">
                            <div className="pr-toggle-info">
                                <div className="pr-toggle-label">{t.label}</div>
                                <div className="pr-toggle-desc">{t.desc}</div>
                            </div>
                            <button className={`pr-toggle ${form[t.key] ? "pr-toggle-on" : ""}`} onClick={() => set(t.key, !form[t.key])}>
                                <div className="pr-toggle-dot"/>
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
        <style>{prCSS}</style>
    </>);
}

/* ================================================================
   STYLES
================================================================ */
const prCSS = `
  .pr-bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px}
  .pr-bar-count{font-size:13px;color:#888}
  .pr-bar-right{display:flex;gap:8px}
  .pr-btn-p{display:flex;align-items:center;gap:5px;padding:9px 18px;border:none;border-radius:8px;background:#6366f1;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;color:#fff;cursor:pointer;transition:all .15s}
  .pr-btn-p:hover{background:#4f46e5}
  .pr-btn-s{display:flex;align-items:center;gap:5px;padding:9px 16px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;color:#666;cursor:pointer}
  .pr-btn-s:hover{background:#f5f5f5}

  .pr-empty{text-align:center;padding:60px 20px}
  .pr-empty-ic{width:72px;height:72px;border-radius:50%;background:#eef2ff;color:#6366f1;display:flex;align-items:center;justify-content:center;margin:0 auto 16px}
  .pr-empty-t{font-size:18px;font-weight:700;color:#333;margin-bottom:6px}
  .pr-empty-d{font-size:13px;color:#999;max-width:380px;margin:0 auto}

  .pr-tbl-wrap{overflow-x:auto;background:#fff;border:1px solid #eee;border-radius:12px}
  .pr-tbl{width:100%;border-collapse:collapse;font-size:13px}
  .pr-tbl thead th{text-align:left;padding:12px 14px;color:#888;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #eee;white-space:nowrap}
  .pr-tbl tbody tr{border-bottom:1px solid #f5f5f5;transition:background .1s}
  .pr-tbl tbody tr:hover{background:#fafbfa}
  .pr-tbl tbody tr:last-child{border-bottom:none}
  .pr-tbl td{padding:10px 14px;vertical-align:middle}
  .pr-row{cursor:pointer}
  .pr-row:hover{background:#f5f3ff !important}
  .pr-td-period{font-weight:600;color:#222;white-space:nowrap}
  .pr-td-count{text-align:center;font-weight:600}
  .pr-td-amt{text-align:right;font-variant-numeric:tabular-nums;font-weight:500}
  .pr-td-net{font-weight:700;color:#222}
  .pr-badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600}

  /* Run detail */
  .pr-run-head{display:flex;align-items:center;gap:14px;margin-bottom:18px;flex-wrap:wrap}
  .pr-back{display:flex;align-items:center;gap:4px;padding:8px 14px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;font-family:'DM Sans',sans-serif;font-size:13px;color:#666;cursor:pointer}
  .pr-back:hover{background:#f5f5f5}
  .pr-run-info{display:flex;align-items:center;gap:10px;flex:1}
  .pr-run-title{font-size:20px;font-weight:700;color:#222;margin:0}
  .pr-run-actions{display:flex;gap:8px;margin-left:auto}
  .pr-btn-compute{padding:9px 20px;border:none;border-radius:8px;background:linear-gradient(135deg,#6366f1,#8b5cf6);font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;color:#fff;cursor:pointer;transition:all .15s}
  .pr-btn-compute:hover{opacity:.9}
  .pr-btn-compute:disabled{opacity:.5;cursor:not-allowed}
  .pr-slip-btn{width:30px;height:30px;border:1px solid #e5e7eb;border-radius:7px;background:#fff;color:#0ea5e9;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:all .12s}
  .pr-slip-btn:hover{background:#0ea5e9;color:#fff;border-color:#0ea5e9}

  .pr-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px}
  .pr-sum-card{background:#fff;border:1px solid #eee;border-radius:10px;padding:14px 16px}
  .pr-sum-l{font-size:11px;color:#999;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px}
  .pr-sum-v{font-size:20px;font-weight:700}

  .pr-tbl-items td{font-size:12px}
  .pr-r{text-align:right !important;font-variant-numeric:tabular-nums}
  .pr-bold{font-weight:700}
  .pr-ded{color:#ef4444}
  .pr-net{color:#22c55e;font-weight:700}
  .pr-emp{display:flex;align-items:center;gap:8px}
  .pr-emp-av{width:30px;height:30px;border-radius:8px;background:#eef2ff;color:#6366f1;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .pr-emp-name{font-weight:600;color:#222;font-size:12px}
  .pr-emp-dept{font-size:10px;color:#aaa}
  .pr-total-row{background:#f8fafc !important;border-top:2px solid #e0e0e0 !important}
  .pr-total-row td{padding:14px !important}

  /* Settings */
  .pr-settings{max-width:640px}
  .pr-set-section{background:#fff;border:1px solid #eee;border-radius:12px;padding:20px 24px;margin-bottom:16px}
  .pr-toggles{display:flex;flex-direction:column;gap:2px}
  .pr-toggle-row{display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid #f5f5f5}
  .pr-toggle-row:last-child{border-bottom:none}
  .pr-toggle-info{flex:1}
  .pr-toggle-label{font-size:14px;font-weight:600;color:#222}
  .pr-toggle-desc{font-size:11px;color:#999;margin-top:2px}
  .pr-toggle{width:44px;height:24px;border-radius:12px;border:none;background:#e5e7eb;cursor:pointer;position:relative;transition:background .2s;flex-shrink:0}
  .pr-toggle-on{background:#6366f1}
  .pr-toggle-dot{width:18px;height:18px;border-radius:50%;background:#fff;position:absolute;top:3px;left:3px;transition:transform .2s;box-shadow:0 1px 3px rgba(0,0,0,.12)}
  .pr-toggle-on .pr-toggle-dot{transform:translateX(20px)}

  @media(max-width:768px){.pr-summary{grid-template-columns:repeat(2,1fr)}}

  /* Shared modal styles */
  .lv-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:400;animation:bpFade .12s}
  @keyframes bpFade{from{opacity:0}to{opacity:1}}
  .lv-modal{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:16px;padding:28px;width:420px;max-width:90vw;z-index:401;box-shadow:0 12px 40px rgba(0,0,0,.12)}
  .lv-modal-t{font-size:18px;font-weight:700;color:#222;margin-bottom:6px}
  .lv-modal-btns{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
  .lv-foot-approve{display:flex;align-items:center;gap:5px;padding:9px 20px;border:none;border-radius:8px;background:#22c55e;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;color:#fff;cursor:pointer}
  .lv-foot-approve:hover{background:#16a34a}
  .bp-btn-cancel{padding:9px 18px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;color:#666;cursor:pointer}
  .bp-btn-cancel:hover{background:#f5f5f5}
  .bp-btn-danger{padding:9px 16px;border:1px solid #fecaca;border-radius:8px;background:#fef2f2;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;color:#ef4444;cursor:pointer}
  .bp-btn-danger:hover{background:#ef4444;color:#fff}
  .bp-sec-title{font-size:13px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px}
  .bp-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .bp-field{display:flex;flex-direction:column}
  .bp-label{font-size:12px;font-weight:600;color:#666;margin-bottom:5px}
  .bp-input{width:100%;padding:9px 12px;border:1px solid #e0e0e0;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:13px;color:#333;outline:none;transition:border-color .15s;background:#fff;box-sizing:border-box}
  .bp-input:focus{border-color:#6366f1;box-shadow:0 0 0 2px rgba(99,102,241,.1)}
`;
