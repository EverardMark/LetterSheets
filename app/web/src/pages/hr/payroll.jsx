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
    if (!res.ok) throw new Error(`API ${action} failed: ${res.status}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || `API ${action} failed`);
    return json.data;
}

const peso = (v) => "₱" + Number(v || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
// compliance = { sss, philhealth, pagibig, tax } — derived from active compliance agencies
function computeStatutory(monthlySalary, paySchedule, compliance) {
    const divisor = paySchedule === "semi_monthly" ? 2 : 1;
    const sss = compliance.sss ? computeSSS(monthlySalary) : { ee: 0, er: 0 };
    const ph  = compliance.philhealth ? computePhilHealth(monthlySalary) : { ee: 0, er: 0 };
    const pi  = compliance.pagibig ? computePagibig(monthlySalary) : { ee: 0, er: 0 };

    const totalEEDeductions = sss.ee + ph.ee + pi.ee;
    const monthlyTaxable = monthlySalary - totalEEDeductions;
    const tax = compliance.tax ? computeTax(monthlyTaxable) : 0;

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
    const [view, setView] = useState("list"); // list | run
    const [runs, setRuns] = useState([]);
    const [settings] = useState({ pay_schedule: "semi_monthly", ot_multiplier: 1.25 });
    const [activeRun, setActiveRun] = useState(null);
    const [items, setItems] = useState([]);
    const [computing, setComputing] = useState(false);
    const [loading, setLoading] = useState(false);

    const loadRuns = useCallback(async () => {
        try { const d = await api("get_payroll_runs"); setRuns(d.runs || []); } catch {}
    }, []);

    useEffect(() => { loadRuns(); }, [loadRuns]);

    const openRun = async (run) => {
        setActiveRun(run);
        setItems([]);
        setView("run");
        try {
            const d = await api("get_payroll_items", { run_id: run.id });
            setItems(d.items || []);
        } catch { setItems([]); }
    };

    const computeForRun = async (run) => {
        setComputing(true);
        setActiveRun(run);
        setItems([]);
        setView("run");
        // Kick off compute — reuse computePayroll logic but with explicit run arg
        await _doCompute(run);
        setComputing(false);
    };

    const createAndCompute = async (periodStart, periodEnd) => {
        try {
            const d = await api("create_payroll_run", {
                period_start: periodStart, period_end: periodEnd,
                pay_date: null,
            });
            await loadRuns();
            if (d.id) {
                const run = { ...d, status: "Draft" };
                await computeForRun(run);
            }
        } catch (e) { alert("Failed: " + e.message); }
    };

    const createRun = createAndCompute;

    const computePayroll = async () => {
        if (!activeRun) return;
        setComputing(true);
        await _doCompute(activeRun);
        setComputing(false);
    };

    /* ---- COMPUTE PAYROLL (browser-side) ---- */
    const _doCompute = async (runArg) => {
        const activeRun = runArg;
        if (!activeRun || !settings) return;
        try {
            const companyKey = await getCompanyKey();
            const newItems = [];

            // Fetch attendance for the pay period
            let attendance = [];
            try {
                const attData = await api("get_attendance", {
                    date_from: activeRun.period_start.substring(0, 10),
                    date_to: activeRun.period_end.substring(0, 10),
                });
                attendance = attData.attendance || [];
            } catch {}

            // Fetch approved leaves for the pay period
            // Endpoint: get_leaves — returns { leaves: [...] } with start_date / end_date / status fields
            const leaveByEmp = {}; // employee_id → approved leave days overlapping this pay period
            try {
                const lvData = await api("get_leaves", {
                    date_from: activeRun.period_start.substring(0, 10),
                    date_to:   activeRun.period_end.substring(0, 10),
                    status:    "Approved",
                });
                const periodStart = new Date(activeRun.period_start.substring(0, 10) + "T00:00:00");
                const periodEnd   = new Date(activeRun.period_end.substring(0, 10)   + "T00:00:00");
                // Parse dates as UTC noon to avoid DST/timezone offset shifting the day boundary
                const parseDate = (str) => { const [y,m,d] = str.substring(0,10).split("-").map(Number); return Date.UTC(y, m-1, d); };
                const pStart = parseDate(activeRun.period_start);
                const pEnd   = parseDate(activeRun.period_end);
                for (const lv of (lvData.leaves || [])) {
                    if ((lv.status || "").toLowerCase() !== "approved") continue;
                    const s = parseDate(lv.start_date);
                    const e = parseDate(lv.end_date);
                    const cs = s < pStart ? pStart : s;
                    const ce = e > pEnd   ? pEnd   : e;
                    const days = Math.max(0, Math.round((ce - cs) / 86400000) + 1);
                    if (days > 0) leaveByEmp[lv.employee_id] = (leaveByEmp[lv.employee_id] || 0) + days;
                }
            } catch (e) { console.error("get_leaves failed:", e); }

            // Fetch work schedules list for hours_per_day / working_days_per_month lookup
            const schedMetaById = {}; // id → { hours_per_day, working_days_per_month, name }
            try {
                const wsData = await api("get_work_schedules");
                const list = Array.isArray(wsData) ? wsData : [];
                for (const ws of list) {
                    if (ws.id) schedMetaById[ws.id] = ws;
                }
            } catch {}

            // Returns true when a given date string (YYYY-MM-DD) is a rest day on the schedule
            const isRestDay = (dateStr, days) => {
                if (!dateStr || !days.length) return false;
                const dow = new Date(dateStr + "T00:00:00").getDay();
                const cfg = days.find(d => (d.day_of_week ?? -1) === dow);
                return cfg ? !!cfg.is_rest_day : false;
            };

            // Estimates hours falling in the night-differential window (10 PM – 6 AM)
            // Uses clock_in / clock_out on the attendance record when available
            const nightDiffHours = (att) => {
                if (!att.clock_in || !att.clock_out) return 0;
                try {
                    const toMins = (t) => {
                        // clock_in/clock_out are stored as full datetime or HH:MM strings
                        const timepart = String(t).includes("T") ? String(t).split("T")[1] : String(t);
                        const [h, m] = timepart.split(":").map(Number);
                        return h * 60 + (m || 0);
                    };
                    const inM = toMins(att.clock_in);
                    let outM = toMins(att.clock_out);
                    if (outM <= inM) outM += 1440; // crosses midnight
                    // Night window: 22:00 → 06:00 next day (expressed as 1320 → 1800)
                    const nightStart = 22 * 60;
                    const nightEnd = 30 * 60;
                    const overlap = Math.max(0, Math.min(outM, nightEnd) - Math.max(inM, nightStart));
                    return overlap / 60;
                } catch { return 0; }
            };

            // Group attendance records by employee id
            const attByEmp = {};
            for (const a of attendance) {
                if (!attByEmp[a.employee_id]) attByEmp[a.employee_id] = [];
                attByEmp[a.employee_id].push(a);
            }

            const activeEmps = employees.filter(e => e.status === "Active");
            const divisor = settings.pay_schedule === "semi_monthly" ? 2 : 1;
            const defaultOTMult = settings.ot_multiplier || 1.25;

            // Always compute all PH statutory deductions (SSS, PhilHealth, Pag-IBIG, BIR)
            // Compliance agencies are configured in the Compliance tab — no need to re-fetch
            const compliance = { sss: true, philhealth: true, pagibig: true, tax: true };

            // Build position OT multiplier map: position name → ot_multiplier
            const posOTMap = {};
            try {
                const posData = await api("get_positions");
                const posList = Array.isArray(posData) ? posData : (posData.positions || []);
                for (const p of posList) {
                    if (p.name && p.ot_multiplier > 0) posOTMap[p.name] = p.ot_multiplier;
                }
            } catch {}

            for (const emp of activeEmps) {
                // Fetch full employee record to decrypt salary and get work_schedule field
                let monthlySalary = 0;
                try {
                    const full = await api("get_employee", { id: emp.id });
                    if (full.encrypted?.basic_salary && companyKey) {
                        const val = await decryptField(full.encrypted.basic_salary, companyKey);
                        monthlySalary = parseFloat(val) || 0;
                    }
                    // Carry work_schedule_id onto emp for resolveSchedule
                    if (!emp.work_schedule_id && full.work_schedule_id) {
                        emp.work_schedule_id = full.work_schedule_id;
                    }
                } catch {}

                if (monthlySalary <= 0) continue;

                // resolve_employee_schedule handles the full priority chain and returns days
                let resolvedSched = null;
                try {
                    resolvedSched = await api("resolve_employee_schedule", { employee_id: emp.id });
                    console.log("[sched]", emp.id, JSON.stringify(resolvedSched));
                } catch {}
                const days = resolvedSched?.days || [];
                const schedMeta = resolvedSched?.id ? (schedMetaById[resolvedSched.id] || {}) : {};
                const workingDays = schedMeta.working_days_per_month || 22;
                const hoursPerDay = schedMeta.hours_per_day || 8;
                const sched = resolvedSched; // kept for name/id display

                const dailyRate = monthlySalary / workingDays;
                const hourlyRate = dailyRate / hoursPerDay;
                const periodDays = workingDays / divisor;
                const ndPct = (sched?.night_diff_pct ?? 0.10);
                // Position-level OT rate, falling back to company default
                const otMult = posOTMap[emp.position] ?? defaultOTMult;

                const empAtt = attByEmp[emp.id] || [];

                let basicPay = 0;
                let otPay = 0;
                let nightDiff = 0;
                let daysWorked = 0;
                let totalHours = 0;
                let totalOtHours = 0;

                if (empAtt.length === 0) {
                    // No attendance data — assume the employee worked the full period
                    daysWorked = periodDays;
                    basicPay = Math.round(dailyRate * daysWorked * 100) / 100;
                } else {
                    for (const att of empAtt) {
                        const rest = isRestDay(att.date, days);
                        // Cap regular hours to scheduled hours_per_day; derive OT from the excess
                        const rawHours = (att.hours_worked ?? 0);
                        // Derive OT from schedule day config if available, else use att.overtime_hours
                        const dow = new Date(att.date.substring(0,10) + "T00:00:00").getDay();
                        const dayConf = days.find(d => d.day_of_week === dow);
                        let ot = 0;
                        if (dayConf && !dayConf.is_rest_day && dayConf.start_time && dayConf.end_time) {
                            const toM = t => { const [h,m] = t.substring(0,5).split(":").map(Number); return h*60+(m||0); };
                            const schedEnd = toM(dayConf.end_time);
                            // OT = only time worked after the scheduled end time
                            // Early arrivals before start_time do NOT count as OT
                            if (att.clock_out) {
                                const clockOutStr = String(att.clock_out).includes("T") ? String(att.clock_out).split("T")[1] : String(att.clock_out);
                                let clockOutM = toM(clockOutStr);
                                const clockInStr = att.clock_in ? (String(att.clock_in).includes("T") ? String(att.clock_in).split("T")[1] : String(att.clock_in)) : null;
                                const clockInM = clockInStr ? toM(clockInStr) : toM(dayConf.start_time);
                                if (clockOutM < clockInM) clockOutM += 1440; // crossed midnight
                                const otM = Math.max(0, clockOutM - Math.max(clockInM, schedEnd));
                                ot = otM / 60;
                            } else {
                                // No clock_out: fall back to hours - scheduled, but clamp to 0 if within schedule
                                const scheduledHours = Math.max(0, schedEnd - toM(dayConf.start_time)) / 60;
                                ot = Math.max(0, rawHours - scheduledHours);
                            }
                        } else {
                            ot = att.overtime_hours || 0;
                        }
                        console.log("[ot]", {date:att.date, dow, rawHours, dayConf: dayConf ? {start:dayConf.start_time,end:dayConf.end_time,rest:dayConf.is_rest_day} : null, ot});
                        const hw = Math.max(0, rawHours - ot);
                        const nd = nightDiffHours(att);

                        totalHours += rawHours;
                        totalOtHours += ot;
                        daysWorked++;

                        if (rest) {
                            // Philippine Labor Code: rest-day work = 130 % of hourly rate
                            // Rest-day OT = 130 % × 130 % of hourly rate
                            basicPay += hourlyRate * hw * 1.30;
                            otPay += hourlyRate * ot * 1.30 * 1.30;
                        } else {
                            basicPay += hourlyRate * hw;
                            otPay += hourlyRate * ot * otMult;
                        }

                        // Night differential: ndPct is 0 on schedules without night hours
                        nightDiff += hourlyRate * nd * ndPct;
                    }
                    basicPay = Math.round(basicPay * 100) / 100;
                    otPay = Math.round(otPay * 100) / 100;
                    nightDiff = Math.round(nightDiff * 100) / 100;
                }

                // Deduct approved leave days (unpaid leave = absent days × daily rate)
                const approvedLeaveDays = leaveByEmp[emp.id] || 0;
                const leaveDeduction = Math.round(dailyRate * approvedLeaveDays * 100) / 100;
                if (approvedLeaveDays > 0) {
                    basicPay = Math.max(0, Math.round((basicPay - leaveDeduction) * 100) / 100);
                    daysWorked = Math.max(0, daysWorked - approvedLeaveDays);
                }

                const grossPay = Math.round((basicPay + otPay + nightDiff) * 100) / 100;

                // Statutory deductions always use the full monthly salary for the correct bracket
                const stat = computeStatutory(monthlySalary, settings.pay_schedule, compliance);
                const totalDeductions = stat.sss_ee + stat.philhealth_ee + stat.pagibig_ee + stat.withholding_tax;
                const netPay = Math.round((grossPay - totalDeductions) * 100) / 100;

                const existing = items.find(it => it.employee_id === emp.id);

                // sp_upsert_payroll_item expects all these fields including schedule metadata
                const dbItem = {
                    id: existing?.id || crypto.randomUUID(),
                    run_id: activeRun.id,
                    employee_id: emp.id,
                    basic_pay: basicPay,
                    days_worked: daysWorked,
                    hours_worked: totalHours,
                    ot_hours: totalOtHours,
                    ot_pay: otPay,
                    holiday_pay: 0,
                    night_diff: nightDiff,
                    allowances: 0,
                    other_earnings: 0,
                    gross_pay: grossPay,
                    ...stat,
                    benefit_deductions: 0,
                    loan_deductions: 0,
                    other_deductions: 0,
                    total_deductions: Math.round(totalDeductions * 100) / 100,
                    net_pay: netPay,
                    work_schedule_name: sched?.name || null,
                    hours_per_day: hoursPerDay,
                    working_days_per_month: workingDays,
                    ot_multiplier_used: otMult,
                };
                // Full item for local state adds display-only fields not in DB
                const item = {
                    ...dbItem,
                    leave_days: approvedLeaveDays,
                    leave_deduction: leaveDeduction,
                    first_name: emp.first_name,
                    last_name: emp.last_name,
                    department: emp.department,
                    position: emp.position,
                };

                try { await api("save_payroll_item", dbItem); } catch { /* backend save — non-blocking */ }
                newItems.push(item);
            }

            setItems(newItems);

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

    /* ---- RUN DETAIL VIEW ---- */
    if (view === "run" && activeRun) return (
        <RunDetail
            run={activeRun} items={items} settings={settings}
            computing={computing}
            onCompute={computePayroll}
            onApprove={approveRun}
            onDelete={() => deleteRun(activeRun.id)}
            onBack={() => { setView("list"); setActiveRun(null); }}
        />
    );

    /* ---- LIST VIEW (default) ---- */
    return (<>
        <div className="pr-bar">
            <div className="pr-bar-right" style={{marginLeft:"auto"}}>
                <ComputeButton onCompute={createAndCompute} computing={computing} />
            </div>
        </div>

        {runs.length === 0 ? (
            <div className="pr-empty">
                <div className="pr-empty-ic"><I name="dollar-sign" size={32}/></div>
                <h3 className="pr-empty-t">No payroll runs</h3>
                <p className="pr-empty-d">Create your first payroll run to compute employee pay.</p>
            </div>
        ) : (
            <div className="pr-tbl-wrap">
                <table className="pr-tbl">
                    <thead><tr><th>Period</th><th>Employees</th><th>Gross</th><th>Deductions</th><th>Net</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                    {runs.map(r => {
                        const sc = r.status === "Approved" ? "#22c55e" : r.status === "Paid" ? "#0ea5e9" : "#f59e0b";
                        return (
                            <tr key={r.id} className="pr-row" onClick={() => openRun(r)}>
                                <td className="pr-td-period">{fmtPeriod(r.period_start, r.period_end)}</td>
                                <td className="pr-td-count">{r.employee_count}</td>
                                <td className="pr-td-amt">{peso(r.total_gross)}</td>
                                <td className="pr-td-amt">{peso(r.total_deductions)}</td>
                                <td className="pr-td-amt pr-td-net">{peso(r.total_net)}</td>
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

/* ================================================================
   COMPUTE PAYROLL BUTTON + MODAL
================================================================ */
function ComputeButton({ onCompute, computing }) {
    const [open, setOpen] = useState(false);
    const now = new Date();
    const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, "0");
    const [ps, setPS] = useState(`${y}-${m}-01`);
    const [pe, setPE] = useState(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10));

    const handleCompute = () => {
        if (!ps || !pe) return;
        setOpen(false);
        onCompute(ps, pe);
    };

    return (<>
        <button className="pr-btn-compute" onClick={() => setOpen(true)} disabled={computing}>
            {computing ? "Computing..." : "⚡ Compute Payroll"}
        </button>
        {open && (<>
            <div className="lv-modal-bg" onClick={() => setOpen(false)}/>
            <div className="lv-modal" style={{width:360}}>
                <h3 className="lv-modal-t">Compute Payroll</h3>
                <p style={{fontSize:13,color:"#888",margin:"6px 0 16px"}}>Select the pay period to compute.</p>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <div><label className="bp-label">Start Date</label><input type="date" className="bp-input" value={ps} onChange={e => setPS(e.target.value)}/></div>
                    <div><label className="bp-label">End Date</label><input type="date" className="bp-input" value={pe} onChange={e => setPE(e.target.value)}/></div>
                </div>
                <div className="lv-modal-btns">
                    <button className="bp-btn-cancel" onClick={() => setOpen(false)}>Cancel</button>
                    <button className="pr-btn-compute" onClick={handleCompute}>⚡ Compute</button>
                </div>
            </div>
        </>)}
    </>);
}

/* ================================================================
   RUN DETAIL
================================================================ */
function RunDetail({ run, items, settings, computing, onCompute, onApprove, onDelete, onBack }) {
    const isDraft = run.status === "Draft";
    const sc = run.status === "Approved" ? "#22c55e" : run.status === "Paid" ? "#0ea5e9" : "#f59e0b";
    const [selectedItem, setSelectedItem] = useState(null);

    return (<>
        <div className="pr-run-head">
            <button className="pr-back" onClick={onBack}><I name="arrow-left" size={16}/> Back</button>
            <div className="pr-run-info">
                <h2 className="pr-run-title">{fmtPeriod(run.period_start, run.period_end)}</h2>
                <span className="pr-badge" style={{background:sc+"18",color:sc}}>{run.status}</span>
            </div>
            <div className="pr-run-actions">
                {isDraft && <button className="pr-btn-compute" onClick={onCompute} disabled={computing}>{computing ? "Computing..." : "⚡ Compute Payroll"}</button>}
                {isDraft && items.length > 0 && <button className="lv-foot-approve" onClick={onApprove}><I name="check" size={13}/> Approve</button>}
                <button className="bp-btn-danger" onClick={() => {
                    if (!isDraft && !window.confirm("This run is " + run.status + ". Are you sure you want to permanently delete it?")) return;
                    onDelete();
                }}>Delete</button>
            </div>
        </div>

        {items.length === 0 ? (
            <div className="at-empty">
                <div className="at-empty-ic"><I name="users" size={28}/></div>
                <div className="at-empty-t">{isDraft ? "Click \"Compute Payroll\" to generate" : "No items"}</div>
                <div className="at-empty-d">Payroll will be computed for all active employees with salary data.</div>
            </div>
        ) : (
            <div style={{overflowX:"auto",flex:1,background:"#fff",borderRadius:10}}>
                <table className="at-tbl">
                    <thead>
                    <tr>
                        <th>Employee</th>
                        <th>Department</th>
                        <th style={{textAlign:"right"}}>Basic</th>
                        <th style={{textAlign:"right"}}>OT</th>
                        <th style={{textAlign:"right"}}>Night Diff</th>
                        <th style={{textAlign:"right"}}>Leave Ded</th>
                        <th style={{textAlign:"right"}}>Gross</th>
                        <th style={{textAlign:"right"}}>SSS</th>
                        <th style={{textAlign:"right"}}>PhilHealth</th>
                        <th style={{textAlign:"right"}}>HDMF</th>
                        <th style={{textAlign:"right"}}>Tax</th>
                        <th style={{textAlign:"right"}}>Total Ded</th>
                        <th style={{textAlign:"right"}}>Net Pay</th>
                    </tr>
                    </thead>
                    <tbody>
                    {items.map(it => (
                        <tr key={it.id} onClick={() => setSelectedItem(it)}>
                            <td>
                                <div className="at-emp">
                                    <span className="at-emp-av">{(it.first_name?.[0]||"")+(it.last_name?.[0]||"")}</span>
                                    <div>
                                        <div className="at-emp-name">{it.first_name} {it.last_name}</div>
                                        <div className="at-emp-pos">{it.position || "—"}</div>
                                    </div>
                                </div>
                            </td>
                            <td className="at-td-dept">{it.department || "—"}</td>
                            <td className="at-td-hrs" style={{textAlign:"right"}}>{peso(it.basic_pay)}</td>
                            <td className="at-td-hrs" style={{textAlign:"right",color: it.ot_pay > 0 ? "#f59e0b" : undefined}}>{it.ot_pay > 0 ? peso(it.ot_pay) : "—"}</td>
                            <td className="at-td-hrs" style={{textAlign:"right",color: it.night_diff > 0 ? "#8b5cf6" : undefined}}>{it.night_diff > 0 ? peso(it.night_diff) : "—"}</td>
                            <td className="at-td-hrs" style={{textAlign:"right",color: it.leave_deduction > 0 ? "#ef4444" : undefined}}>{it.leave_deduction > 0 ? `- ${peso(it.leave_deduction)}` : "—"}</td>
                            <td className="at-td-time" style={{textAlign:"right"}}>{peso(it.gross_pay)}</td>
                            <td className="at-td-hrs" style={{textAlign:"right",color:"#ef4444"}}>{peso(it.sss_ee)}</td>
                            <td className="at-td-hrs" style={{textAlign:"right",color:"#ef4444"}}>{peso(it.philhealth_ee)}</td>
                            <td className="at-td-hrs" style={{textAlign:"right",color:"#ef4444"}}>{peso(it.pagibig_ee)}</td>
                            <td className="at-td-hrs" style={{textAlign:"right",color:"#ef4444"}}>{peso(it.withholding_tax)}</td>
                            <td className="at-td-time" style={{textAlign:"right",color:"#ef4444"}}>{peso(it.total_deductions)}</td>
                            <td className="at-td-time" style={{textAlign:"right",color:"#22c55e"}}>{peso(it.net_pay)}</td>
                        </tr>
                    ))}
                    <tr style={{background:"#f8fafc",borderTop:"2px solid #e0e0e0",fontWeight:700}}>
                        <td colSpan={2} style={{padding:"12px 14px",fontSize:13}}>TOTAL</td>
                        <td className="at-td-hrs" style={{textAlign:"right",padding:"12px 14px"}}>{peso(items.reduce((s,i)=>s+i.basic_pay,0))}</td>
                        <td className="at-td-hrs" style={{textAlign:"right",padding:"12px 14px",color:"#f59e0b"}}>{peso(items.reduce((s,i)=>s+i.ot_pay,0))}</td>
                        <td className="at-td-hrs" style={{textAlign:"right",padding:"12px 14px",color:"#8b5cf6"}}>{peso(items.reduce((s,i)=>s+(i.night_diff||0),0))}</td>
                        <td className="at-td-hrs" style={{textAlign:"right",padding:"12px 14px",color:"#ef4444"}}>{peso(items.reduce((s,i)=>s+(i.leave_deduction||0),0))}</td>
                        <td className="at-td-time" style={{textAlign:"right",padding:"12px 14px"}}>{peso(items.reduce((s,i)=>s+i.gross_pay,0))}</td>
                        <td className="at-td-hrs" style={{textAlign:"right",padding:"12px 14px",color:"#ef4444"}}>{peso(items.reduce((s,i)=>s+i.sss_ee,0))}</td>
                        <td className="at-td-hrs" style={{textAlign:"right",padding:"12px 14px",color:"#ef4444"}}>{peso(items.reduce((s,i)=>s+i.philhealth_ee,0))}</td>
                        <td className="at-td-hrs" style={{textAlign:"right",padding:"12px 14px",color:"#ef4444"}}>{peso(items.reduce((s,i)=>s+i.pagibig_ee,0))}</td>
                        <td className="at-td-hrs" style={{textAlign:"right",padding:"12px 14px",color:"#ef4444"}}>{peso(items.reduce((s,i)=>s+i.withholding_tax,0))}</td>
                        <td className="at-td-time" style={{textAlign:"right",padding:"12px 14px",color:"#ef4444"}}>{peso(items.reduce((s,i)=>s+i.total_deductions,0))}</td>
                        <td className="at-td-time" style={{textAlign:"right",padding:"12px 14px",color:"#22c55e"}}>{peso(items.reduce((s,i)=>s+i.net_pay,0))}</td>
                    </tr>
                    </tbody>
                </table>
            </div>
        )}
        {selectedItem && <PayrollItemModal item={selectedItem} settings={settings} run={run} onClose={() => setSelectedItem(null)} />}
        <style>{prCSS}</style>
    </>);
}

/* ================================================================
   PAYROLL ITEM DETAIL MODAL
================================================================ */
function PayrollItemModal({ item: it, settings, run, onClose }) {
    const initials = (it.first_name?.[0] || "") + (it.last_name?.[0] || "");

    const Row = ({ label, value, color, bold, indent, top }) => (
        <div className={`pd-row${bold ? " pd-row-bold" : ""}${top ? " pd-row-top" : ""}`}>
            <span className={`pd-row-label${indent ? " pd-row-indent" : ""}`}>{label}</span>
            <span className="pd-row-value" style={color ? { color } : {}}>{value}</span>
        </div>
    );

    const Divider = ({ label }) => (
        <div className="pd-divider">{label}</div>
    );

    const workingDays = it.working_days_per_month || 22;
    const divisor = settings?.pay_schedule === "semi_monthly" ? 2 : 1;
    const periodDays = workingDays / divisor;
    const hoursPerDay = it.hours_per_day || 8;

    // Reconstruct daily / hourly rates for display
    // basic_pay already accounts for actual days worked and rest-day premiums,
    // so we show the base rates derived from the stored values
    const dailyRateApprox = it.days_worked > 0 ? it.basic_pay / it.days_worked : 0;
    const hourlyRateApprox = dailyRateApprox / hoursPerDay;

    const hasOT       = it.ot_pay > 0;
    const hasND       = it.night_diff > 0;
    const hasHoliday  = it.holiday_pay > 0;
    const hasAllow    = it.allowances > 0;
    const hasOtherEar = it.other_earnings > 0;
    const hasBenefit  = it.benefit_deductions > 0;
    const hasLoan     = it.loan_deductions > 0;
    const hasOtherDed = it.other_deductions > 0;

    const otMult = it.ot_multiplier_used || settings?.ot_multiplier || 1.25;
    // night_diff_pct is stored on the work schedule, not settings;
    // back-calculate from the stored night_diff and hours if available,
    // otherwise show a generic label
    const ndLabel = it.night_diff > 0 ? "Night-shift hours (10 PM – 6 AM) premium" : "";

    return (<>
        <div className="pd-bg" onClick={onClose} />
        <div className="pd-modal">

            {/* Header */}
            <div className="pd-head">
                <div className="pd-head-left">
                    <div className="pd-av">{initials}</div>
                    <div>
                        <div className="pd-name">{it.first_name} {it.last_name}</div>
                        <div className="pd-meta">
                            {it.department && <span>{it.department}</span>}
                            {it.position && <><span className="pd-dot">·</span><span>{it.position}</span></>}
                            {it.work_schedule_name && <><span className="pd-dot">·</span><span className="pd-sched">{it.work_schedule_name}</span></>}
                        </div>
                    </div>
                </div>
                <button className="pd-close" onClick={onClose}>×</button>
            </div>

            {/* Period strip */}
            <div className="pd-period">
                <span>Period: <strong>{fmtPeriod(run.period_start, run.period_end)}</strong></span>
                <span className="pd-dot">·</span>
                <span>{it.days_worked} days worked</span>
                {it.hours_worked > 0 && <><span className="pd-dot">·</span><span>{it.hours_worked}h total</span></>}
                {hasOT && <><span className="pd-dot">·</span><span>{it.ot_hours}h OT</span></>}
            </div>

            <div className="pd-body">
                {/* ── EARNINGS ── */}
                <Divider label="Earnings" />

                <Row label="Basic Pay" value={peso(it.basic_pay)} />
                <Row
                    label={`  ${it.days_worked} day${it.days_worked !== 1 ? "s" : ""} worked`}
                    value={it.days_worked < periodDays
                        ? `(${it.days_worked} of ${periodDays} period days)`
                        : "(full period)"}
                    indent
                />
                {(it.leave_days > 0) && <Row
                    label={`  ${it.leave_days} approved leave day${it.leave_days !== 1 ? "s" : ""} deducted`}
                    value={`- ${peso(it.leave_deduction)}`}
                    indent color="#ef4444"
                />}

                {hasOT && <>
                    <Row label="Overtime Pay" value={peso(it.ot_pay)} />
                    <Row label={`  ${it.ot_hours}h × ${otMult}× OT rate`} value="" indent />
                </>}

                {hasND && <>
                    <Row label="Night Differential" value={peso(it.night_diff)} color="#8b5cf6" />
                    <Row label={`  ${ndLabel}`} value="" indent />
                </>}

                {hasHoliday && <Row label="Holiday Pay" value={peso(it.holiday_pay)} />}
                {hasAllow   && <Row label="Allowances"  value={peso(it.allowances)} />}
                {hasOtherEar && <Row label="Other Earnings" value={peso(it.other_earnings)} />}

                <Row label="GROSS PAY" value={peso(it.gross_pay)} color="#22c55e" bold top />

                {/* ── DEDUCTIONS ── */}
                <Divider label="Statutory Deductions" />

                <Row label="SSS (Employee Share)" value={`- ${peso(it.sss_ee)}`} color="#ef4444" />
                <Row label="  (Employer share)" value={peso(it.sss_er)} indent />

                <Row label="PhilHealth (Employee Share)" value={`- ${peso(it.philhealth_ee)}`} color="#ef4444" />
                <Row label="  (Employer share)" value={peso(it.philhealth_er)} indent />

                <Row label="Pag-IBIG / HDMF (Employee Share)" value={`- ${peso(it.pagibig_ee)}`} color="#ef4444" />
                <Row label="  (Employer share)" value={peso(it.pagibig_er)} indent />

                <Row label="Withholding Tax (BIR TRAIN)" value={`- ${peso(it.withholding_tax)}`} color="#ef4444" />
                <Row
                    label={`  Taxable income: ${peso(it.gross_pay - it.sss_ee - it.philhealth_ee - it.pagibig_ee)}`}
                    value=""
                    indent
                />

                {(hasBenefit || hasLoan || hasOtherDed) && <>
                    <Divider label="Other Deductions" />
                    {hasBenefit  && <Row label="Benefit Deductions" value={`- ${peso(it.benefit_deductions)}`} color="#ef4444" />}
                    {hasLoan     && <Row label="Loan Deductions"    value={`- ${peso(it.loan_deductions)}`}    color="#ef4444" />}
                    {hasOtherDed && <Row label="Other Deductions"   value={`- ${peso(it.other_deductions)}`}  color="#ef4444" />}
                </>}

                <Row label="TOTAL DEDUCTIONS" value={`- ${peso(it.total_deductions)}`} color="#ef4444" bold top />

                {/* ── NET ── */}
                <div className="pd-net-row">
                    <span className="pd-net-label">NET PAY</span>
                    <span className="pd-net-value">{peso(it.net_pay)}</span>
                </div>

                {/* ── Employer cost summary ── */}
                <Divider label="Total Employer Cost" />
                <Row label="Gross Pay" value={peso(it.gross_pay)} />
                <Row label="SSS Employer Share" value={peso(it.sss_er)} />
                <Row label="PhilHealth Employer Share" value={peso(it.philhealth_er)} />
                <Row label="Pag-IBIG Employer Share" value={peso(it.pagibig_er)} />
                <Row
                    label="TOTAL COST TO COMPANY"
                    value={peso(it.gross_pay + it.sss_er + it.philhealth_er + it.pagibig_er)}
                    bold top
                />
            </div>

            <div className="pd-foot">
                <button className="pr-btn-p" onClick={onClose}>Close</button>
            </div>
        </div>
    </>);
}

/* ================================================================
   STYLES
================================================================ */
const prCSS = `
  .pr-bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px}
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

  .pr-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px}
  .pr-sum-card{background:#fff;border:1px solid #eee;border-radius:10px;padding:14px 16px}
  .pr-sum-l{font-size:11px;color:#999;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px}
  .pr-sum-v{font-size:20px;font-weight:700}

  .pr-item-row{cursor:pointer;transition:background .1s}
  .pr-item-row:hover{background:#f5f3ff !important}

  /* Payroll item detail modal */
  .pd-bg{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:500;animation:bpFade .12s}
  .pd-modal{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:16px;width:520px;max-width:95vw;max-height:88vh;display:flex;flex-direction:column;z-index:501;box-shadow:0 16px 48px rgba(0,0,0,.16);overflow:hidden}
  .pd-head{display:flex;align-items:center;justify-content:space-between;padding:20px 24px 16px;border-bottom:1px solid #f0f0f0;flex-shrink:0}
  .pd-head-left{display:flex;align-items:center;gap:12px}
  .pd-av{width:42px;height:42px;border-radius:12px;background:#eef2ff;color:#6366f1;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .pd-name{font-size:16px;font-weight:700;color:#222}
  .pd-meta{display:flex;align-items:center;gap:4px;font-size:11px;color:#999;margin-top:2px;flex-wrap:wrap}
  .pd-dot{color:#ddd}
  .pd-sched{color:#2d9e8b;font-weight:600}
  .pd-close{width:30px;height:30px;border-radius:8px;border:1px solid #eee;background:#fff;font-size:18px;color:#999;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;flex-shrink:0}
  .pd-close:hover{background:#f5f5f5;color:#333}
  .pd-period{padding:8px 24px;background:#fafbff;border-bottom:1px solid #f0f0f0;font-size:11px;color:#888;display:flex;align-items:center;gap:6px;flex-wrap:wrap;flex-shrink:0}
  .pd-body{flex:1;overflow-y:auto;padding:16px 24px}
  .pd-foot{padding:14px 24px;border-top:1px solid #f0f0f0;display:flex;justify-content:flex-end;flex-shrink:0}
  .pd-divider{font-size:10px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:.06em;margin:16px 0 6px;padding-bottom:4px;border-bottom:1px solid #f0f0f0}
  .pd-divider:first-child{margin-top:0}
  .pd-row{display:flex;justify-content:space-between;align-items:baseline;padding:4px 0;font-size:13px;color:#444}
  .pd-row-bold .pd-row-label,.pd-row-bold .pd-row-value{font-weight:700;font-size:13px;color:#222}
  .pd-row-top{margin-top:8px;padding-top:10px;border-top:1px solid #eee}
  .pd-row-label{color:#555}
  .pd-row-indent{font-size:11px;color:#bbb;padding-left:12px}
  .pd-row-value{font-variant-numeric:tabular-nums;font-weight:500;text-align:right}
  .pd-net-row{display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding:14px 16px;background:linear-gradient(135deg,#f0fdf4,#dcfce7);border-radius:10px;border:1px solid #bbf7d0}
  .pd-net-label{font-size:13px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:.04em}
  .pd-net-value{font-size:22px;font-weight:800;color:#16a34a;font-variant-numeric:tabular-nums}

  .pr-tbl-items td{font-size:12px}
  .pr-r{text-align:right !important;font-variant-numeric:tabular-nums}
  .pr-bold{font-weight:700}
  .pr-ded{color:#ef4444}
  .pr-nd{color:#8b5cf6}
  .pr-net{color:#22c55e;font-weight:700}
  .pr-sched-tag{font-size:10px;font-weight:600;color:#2d9e8b;background:#edf8f5;padding:2px 7px;border-radius:4px;white-space:nowrap}
  .pr-emp{display:flex;align-items:center;gap:8px}
  .pr-emp-av{width:30px;height:30px;border-radius:8px;background:#eef2ff;color:#6366f1;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .pr-emp-name{font-weight:600;color:#222;font-size:12px}
  .pr-emp-dept{font-size:10px;color:#aaa}
  .pr-total-row{background:#f8fafc !important;border-top:2px solid #e0e0e0 !important}
  .pr-total-row td{padding:14px !important}

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
  .bp-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .bp-field{display:flex;flex-direction:column}
  .bp-label{font-size:12px;font-weight:600;color:#666;margin-bottom:5px}
  .bp-input{width:100%;padding:9px 12px;border:1px solid #e0e0e0;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:13px;color:#333;outline:none;transition:border-color .15s;background:#fff;box-sizing:border-box}
  .bp-input:focus{border-color:#6366f1;box-shadow:0 0 0 2px rgba(99,102,241,.1)}

  /* Attendance-style table (shared classes) */
  .at-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:60px 20px;background:#fff;border-radius:10px}
  .at-empty-ic{width:56px;height:56px;border-radius:50%;background:#eef2ff;color:#6366f1;display:flex;align-items:center;justify-content:center;margin:0 auto 12px}
  .at-empty-t{font-size:15px;font-weight:700;color:#333;margin-bottom:4px}
  .at-empty-d{font-size:13px;color:#999}
  .at-tbl{width:100%;border-collapse:collapse;font-size:13px;background:#fff;border-radius:10px;overflow:hidden}
  .at-tbl thead th{text-align:left;padding:10px 14px;font-size:11px;font-weight:600;color:#999;text-transform:uppercase;letter-spacing:.03em;border-bottom:1px solid #eee;background:#fafbfa;white-space:nowrap}
  .at-tbl tbody td{padding:12px 14px;border-bottom:1px solid #f5f5f5;color:#444}
  .at-tbl tbody tr{transition:background .1s;cursor:pointer}
  .at-tbl tbody tr:hover{background:#f5f3ff}
  .at-emp{display:flex;align-items:center;gap:10px}
  .at-emp-av{width:34px;height:34px;border-radius:8px;background:#eef2ff;color:#6366f1;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .at-emp-name{font-weight:600;color:#222;font-size:13px}
  .at-emp-pos{font-size:11px;color:#aaa;margin-top:1px}
  .at-td-dept{color:#666;font-size:12px}
  .at-td-time{font-weight:600;color:#333;font-size:13px;font-variant-numeric:tabular-nums}
  .at-td-hrs{font-weight:500;color:#555;font-variant-numeric:tabular-nums}
`;
