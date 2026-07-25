import { useState, useEffect, useCallback, useMemo } from "react";
import { I } from "../../layouts/ERPLayout";
import { useIsSimple } from "../../utils/uimode";
import "./acc-layout.css";

const API = (import.meta.env.VITE_API_BASE||"")+"/api/execute";
async function api(action, body = {}) {
    const s = localStorage.getItem("ls_session");
    const res = await fetch(`${API}?action=${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(s ? { Authorization: `Bearer ${s}` } : {}) },
        body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error || json?.message || `API ${action} failed`);
    return json?.data ?? json;
}

function fmtMoney(n) {
    return "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_CLR = { Draft: "#f59e0b", Posted: "#22c55e", Voided: "#ef4444" };
const SRC_LABEL = { manual: "Manual", payroll: "Payroll", loan: "Loan", adjustment: "Adjustment", recurring: "Recurring" };
const SRC_ICON = { manual: "edit-3", payroll: "users", loan: "dollar-sign", adjustment: "sliders", recurring: "repeat" };

const FREQ_OPTIONS = ["Weekly", "Monthly", "Quarterly", "Yearly"];
const FREQ_UNIT = { Weekly: "week", Monthly: "month", Quarterly: "quarter", Yearly: "year" };
// Human summary of a schedule, e.g. "Monthly" or "Every 2 weeks".
function freqLabel(freq, interval) {
    if (interval > 1) return `Every ${interval} ${FREQ_UNIT[freq]}s`;
    return freq;
}

/* ===== MAPPING KEY DEFINITIONS ===== */
const MAPPING_DEFS = [
    { key: "PAYROLL_SALARIES_DR", label: "Salaries & Wages", side: "Dr", group: "Payroll Expenses" },
    { key: "PAYROLL_SSS_EXPENSE_DR", label: "SSS Expense (Employer)", side: "Dr", group: "Payroll Expenses" },
    { key: "PAYROLL_SSSEC_EXPENSE_DR", label: "SSS EC Expense", side: "Dr", group: "Payroll Expenses" },
    { key: "PAYROLL_PHILHEALTH_EXPENSE_DR", label: "PhilHealth Expense (ER)", side: "Dr", group: "Payroll Expenses" },
    { key: "PAYROLL_PAGIBIG_EXPENSE_DR", label: "Pag-IBIG Expense (ER)", side: "Dr", group: "Payroll Expenses" },
    { key: "PAYROLL_BENEFITS_EXPENSE_DR", label: "Benefits Expense", side: "Dr", group: "Payroll Expenses" },
    { key: "PAYROLL_SSS_PAYABLE_CR", label: "SSS Payable (EE+ER)", side: "Cr", group: "Payroll Payables" },
    { key: "PAYROLL_SSSEC_PAYABLE_CR", label: "SSS EC Payable", side: "Cr", group: "Payroll Payables" },
    { key: "PAYROLL_PHILHEALTH_PAYABLE_CR", label: "PhilHealth Payable (EE+ER)", side: "Cr", group: "Payroll Payables" },
    { key: "PAYROLL_PAGIBIG_PAYABLE_CR", label: "Pag-IBIG Payable (EE+ER)", side: "Cr", group: "Payroll Payables" },
    { key: "PAYROLL_TAX_PAYABLE_CR", label: "Withholding Tax Payable", side: "Cr", group: "Payroll Payables" },
    { key: "PAYROLL_LOANS_PAYABLE_CR", label: "Loan Deductions Payable", side: "Cr", group: "Payroll Payables" },
    { key: "PAYROLL_OTHER_DEDUCTIONS_CR", label: "Other Deductions (Accrued)", side: "Cr", group: "Payroll Payables" },
    { key: "PAYROLL_CASH_CR", label: "Cash Disbursement (Net Pay)", side: "Cr", group: "Cash" },
    { key: "LOAN_DISBURSEMENT_DR", label: "Advances to Employees", side: "Dr", group: "Loan" },
    { key: "LOAN_DISBURSEMENT_CR", label: "Cash (Loan Disbursement)", side: "Cr", group: "Loan" },
];

/* ===== SIMPLE-MODE TRANSACTION PRESETS =====
   Each preset is a plain-language transaction. The user only chooses a type, an
   amount and (in friendly terms) which accounts are involved — never a debit or a
   credit. The `debit`/`credit` sides fix the accounting direction; `role:"cash"`
   asks for a cash/bank account, `role:"category"` asks for the matching income /
   expense / etc. account, filtered to `types` and with the named account floated to
   the top of the list via `hint`. */
const TXN_PRESETS = [
    // ---- MONEY OUT ----
    {
        id: "pay_expense", group: "Money Out", icon: "trending-down", color: "#ef4444",
        label: "Pay an expense", sub: "Rent, utilities, supplies, fuel…",
        debit: { role: "category", types: ["Expense"], label: "What was it for?", hint: "" },
        credit: { role: "cash", types: ["Asset"], label: "Paid from", hint: "cash" },
    },
    {
        id: "pay_supplier", group: "Money Out", icon: "receipt", color: "#f97316",
        label: "Pay a supplier / bill", sub: "Settle money you already owe",
        debit: { role: "category", types: ["Liability"], label: "Which payable?", hint: "payable" },
        credit: { role: "cash", types: ["Asset"], label: "Paid from", hint: "cash" },
    },
    {
        id: "buy_asset", group: "Money Out", icon: "cube", color: "#8b5cf6",
        label: "Buy equipment / asset", sub: "Something you'll keep and use",
        debit: { role: "category", types: ["Asset"], label: "What did you buy?", hint: "equip" },
        credit: { role: "cash", types: ["Asset"], label: "Paid from", hint: "cash" },
    },
    {
        id: "owner_draw", group: "Money Out", icon: "user-minus", color: "#ec4899",
        label: "Owner withdrawal", sub: "Money the owner took out",
        debit: { role: "category", types: ["Equity"], label: "Drawings account", hint: "draw" },
        credit: { role: "cash", types: ["Asset"], label: "Paid from", hint: "cash" },
    },
    // ---- MONEY IN ----
    {
        id: "cash_sale", group: "Money In", icon: "trending-up", color: "#22c55e",
        label: "Sale / income received", sub: "Cash sale or other income",
        debit: { role: "cash", types: ["Asset"], label: "Received into", hint: "cash" },
        credit: { role: "category", types: ["Revenue"], label: "Kind of income", hint: "" },
    },
    {
        id: "collect_ar", group: "Money In", icon: "hand-coin", color: "#10b981",
        label: "Customer paid me", sub: "Collecting money owed to you",
        debit: { role: "cash", types: ["Asset"], label: "Received into", hint: "cash" },
        credit: { role: "category", types: ["Asset"], label: "Which receivable?", hint: "receivable" },
    },
    {
        id: "owner_invest", group: "Money In", icon: "user-plus", color: "#0ea5e9",
        label: "Owner investment", sub: "Owner put money into the business",
        debit: { role: "cash", types: ["Asset"], label: "Received into", hint: "cash" },
        credit: { role: "category", types: ["Equity"], label: "Capital account", hint: "capital" },
    },
    // ---- MOVE MONEY ----
    {
        id: "transfer", group: "Move Money", icon: "repeat", color: "#6366f1",
        label: "Transfer / deposit", sub: "Move money between cash & bank",
        debit: { role: "cash", types: ["Asset"], label: "To (destination)", hint: "bank" },
        credit: { role: "cash", types: ["Asset"], label: "From (source)", hint: "cash" },
    },
];
const TXN_GROUPS = ["Money Out", "Money In", "Move Money"];

export default function JournalEntries() {
    const [entries, setEntries] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [selected, setSelected] = useState(null);
    const [lines, setLines] = useState([]);
    const [loading, setLoading] = useState(false);
    const [view, setView] = useState("list"); // list | create | mapping | payroll
    const [filterStatus, setFilterStatus] = useState("");
    const [filterSource, setFilterSource] = useState("");
    const [search, setSearch] = useState("");
    const [msg, setMsg] = useState("");

    // Create/Edit form
    const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
    const [formMemo, setFormMemo] = useState("");
    const [formLines, setFormLines] = useState([{ account_id: "", description: "", debit: 0, credit: 0 }]);
    const [editingId, setEditingId] = useState(null);

    // Entry mode follows the GLOBAL Simple/Advanced toggle (top bar) so there is
    // one control for the whole app, not a second one buried in this screen.
    // `entryMode` is still local state because a beginner can escape to the raw
    // grid for a single tricky entry via the inline link in the guided form; that
    // one-off override resets whenever the create view is re-opened.
    const globalSimple = useIsSimple();
    const [entryMode, setEntryMode] = useState(globalSimple ? "simple" : "advanced"); // simple | advanced
    const [simpleType, setSimpleType] = useState("");      // preset id
    const [simpleAmount, setSimpleAmount] = useState("");
    const [sDebit, setSDebit] = useState("");
    const [sCredit, setSCredit] = useState("");
    const [saving, setSaving] = useState(false);

    // Recurring entries
    const [recurringList, setRecurringList] = useState([]);
    const [dueList, setDueList] = useState([]);
    const [editingRecId, setEditingRecId] = useState(null);
    const [recPreset, setRecPreset] = useState("");   // preset id, "" when editing / free-form
    const [recName, setRecName] = useState("");
    const [recAmount, setRecAmount] = useState("");
    const [recDebit, setRecDebit] = useState("");
    const [recCredit, setRecCredit] = useState("");
    const [recFreq, setRecFreq] = useState("Monthly");
    const [recInterval, setRecInterval] = useState(1);
    const [recStart, setRecStart] = useState(new Date().toISOString().split("T")[0]);
    const [recEnd, setRecEnd] = useState("");
    const [recAutoPost, setRecAutoPost] = useState(false);
    const [recLimit, setRecLimit] = useState("");

    // Mapping
    const [mappings, setMappings] = useState([]);
    const [mappingLoading, setMappingLoading] = useState(false);

    // Payroll
    const [payrollRuns, setPayrollRuns] = useState([]);
    const [selectedRun, setSelectedRun] = useState(null);
    const [payrollTotals, setPayrollTotals] = useState(null);
    const [generating, setGenerating] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const acctData = await api("get_accounts", {});
            const accts = acctData?.accounts || acctData || [];
            setAccounts(Array.isArray(accts) ? accts.filter(a => a.account_subtype !== "Header") : []);
        } catch (e) { console.error("load accounts:", e); }
        try {
            const je = await api("get_journal_entries", {});
            setEntries(Array.isArray(je) ? je : []);
        } catch (e) { console.error("load entries:", e); setEntries([]); }
        try {
            const due = await api("get_due_recurring", {});
            setDueList(Array.isArray(due) ? due : []);
        } catch (e) { /* recurring tables may not be migrated yet — non-fatal */ setDueList([]); }
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

    /* ------- LIST FILTERING ------- */
    const filtered = useMemo(() => {
        let r = entries;
        if (filterStatus) r = r.filter(e => e.status === filterStatus);
        if (filterSource) r = r.filter(e => e.source_type === filterSource);
        if (search) {
            const s = search.toLowerCase();
            r = r.filter(e => (e.memo || "").toLowerCase().includes(s) || String(e.entry_number).includes(s));
        }
        return r;
    }, [entries, filterStatus, filterSource, search]);

    /* ------- SELECT ENTRY ------- */
    const selectEntry = async (e) => {
        setSelected(e);
        try {
            const ls = await api("get_journal_lines", { entry_id: e.id });
            setLines(Array.isArray(ls) ? ls : []);
        } catch (err) { setLines([]); }
    };

    /* ------- CREATE / EDIT ------- */
    const openCreate = () => {
        setEditingId(null);
        setFormDate(new Date().toISOString().split("T")[0]);
        setFormMemo("");
        setFormLines([{ account_id: "", description: "", debit: 0, credit: 0 }, { account_id: "", description: "", debit: 0, credit: 0 }]);
        setEntryMode(globalSimple ? "simple" : "advanced");
        setSimpleType("");
        setSimpleAmount("");
        setSDebit("");
        setSCredit("");
        setView("create");
    };

    const openEdit = async (e) => {
        if (e.status !== "Draft") return;
        setEntryMode("advanced"); // existing multi-line drafts need the full grid
        setEditingId(e.id);
        setFormDate(e.entry_date?.split("T")[0] || "");
        setFormMemo(e.memo || "");
        try {
            const ls = await api("get_journal_lines", { entry_id: e.id });
            setFormLines((ls || []).map(l => ({ account_id: l.account_id, description: l.description, debit: l.debit, credit: l.credit })));
        } catch { setFormLines([{ account_id: "", description: "", debit: 0, credit: 0 }]); }
        setView("create");
    };

    const addLine = () => setFormLines(p => [...p, { account_id: "", description: "", debit: 0, credit: 0 }]);
    const removeLine = (i) => setFormLines(p => p.filter((_, j) => j !== i));
    const updateLine = (i, field, val) => setFormLines(p => p.map((l, j) => j === i ? { ...l, [field]: val } : l));

    const totalDr = formLines.reduce((s, l) => s + Number(l.debit || 0), 0);
    const totalCr = formLines.reduce((s, l) => s + Number(l.credit || 0), 0);
    const balanced = Math.abs(totalDr - totalCr) < 0.005 && totalDr > 0;

    const saveEntry = async () => {
        const validLines = formLines.filter(l => l.account_id && (l.debit > 0 || l.credit > 0));
        if (!formDate || validLines.length < 2) { flash("Need date and at least 2 lines"); return; }
        if (!balanced) { flash("Debits must equal credits"); return; }
        try {
            if (editingId) {
                await api("update_journal_entry", { id: editingId, entry_date: formDate, memo: formMemo, lines: validLines });
            } else {
                await api("create_journal_entry", { entry_date: formDate, memo: formMemo, lines: validLines });
            }
            flash(editingId ? "Entry updated" : "Entry created");
            setView("list");
            load();
        } catch (e) { flash("Error: " + e.message); }
    };

    /* ------- SIMPLE (GUIDED) ENTRY ------- */
    // Accounts matching a preset side, with the hinted account floated to the top.
    const pickAccounts = useCallback((side) => {
        if (!side) return [];
        let list = accounts.filter(a => side.types.includes(a.account_type));
        if (side.hint) {
            const h = side.hint.toLowerCase();
            const score = (a) => `${a.name || ""} ${a.code || ""}`.toLowerCase().includes(h) ? 0 : 1;
            list = [...list].sort((a, b) => score(a) - score(b));
        }
        return list;
    }, [accounts]);

    // Restore the last account the user chose for this preset+side, else the best default.
    const recallAcct = (presetId, role, list) => {
        const saved = localStorage.getItem(`ls_simple_${presetId}_${role}`);
        if (saved && list.some(a => a.id === saved)) return saved;
        return list[0]?.id || "";
    };

    const activePreset = useMemo(() => TXN_PRESETS.find(p => p.id === simpleType) || null, [simpleType]);

    const choosePreset = (p) => {
        setSimpleType(p.id);
        setSDebit(recallAcct(p.id, "debit", pickAccounts(p.debit)));
        setSCredit(recallAcct(p.id, "credit", pickAccounts(p.credit)));
    };

    const saveSimple = async () => {
        const p = activePreset;
        if (!p) return;
        const amt = Number(simpleAmount);
        if (!amt || amt <= 0) { flash("Enter an amount"); return; }
        if (!sDebit || !sCredit) { flash("Choose both accounts"); return; }
        if (sDebit === sCredit) { flash("The two accounts must be different"); return; }
        setSaving(true);
        try {
            await api("create_simple_transaction", {
                entry_date: formDate,
                memo: formMemo || p.label,
                debit_account_id: sDebit,
                credit_account_id: sCredit,
                amount: amt,
                post: true,
            });
            localStorage.setItem(`ls_simple_${p.id}_debit`, sDebit);
            localStorage.setItem(`ls_simple_${p.id}_credit`, sCredit);
            flash("Transaction recorded ✓");
            setView("list");
            load();
        } catch (e) { flash("Error: " + e.message); }
        setSaving(false);
    };

    /* ------- RECURRING ENTRIES ------- */
    const activeRecPreset = useMemo(() => TXN_PRESETS.find(p => p.id === recPreset) || null, [recPreset]);

    const loadRecurring = async () => {
        try {
            const list = await api("get_recurring_entries", {});
            setRecurringList(Array.isArray(list) ? list : []);
        } catch (e) { flash("Error: " + e.message); setRecurringList([]); }
    };

    const openRecurring = () => { setView("recurring"); loadRecurring(); };

    const openRecurringCreate = () => {
        setEditingRecId(null);
        setRecPreset("");
        setRecName(""); setRecAmount(""); setRecDebit(""); setRecCredit("");
        setRecFreq("Monthly"); setRecInterval(1);
        setRecStart(new Date().toISOString().split("T")[0]);
        setRecEnd(""); setRecAutoPost(false); setRecLimit("");
        setView("recurring-form");
    };

    const chooseRecPreset = (p) => {
        setRecPreset(p.id);
        setRecDebit(pickAccounts(p.debit)[0]?.id || "");
        setRecCredit(pickAccounts(p.credit)[0]?.id || "");
        setRecName(prev => prev || p.label);
    };

    const openRecurringEdit = async (rec) => {
        try {
            const full = await api("get_recurring_entry", { id: rec.id });
            const lines = full?.lines || [];
            const dr = lines.find(l => Number(l.debit) > 0) || lines[0] || {};
            const cr = lines.find(l => Number(l.credit) > 0) || lines[1] || {};
            setEditingRecId(rec.id);
            setRecPreset("");
            setRecName(full.name || "");
            setRecAmount(Number(dr.debit) || Number(cr.credit) || "");
            setRecDebit(dr.account_id || "");
            setRecCredit(cr.account_id || "");
            setRecFreq(full.frequency || "Monthly");
            setRecInterval(full.interval_count || 1);
            setRecStart((full.start_date || "").split("T")[0]);
            setRecEnd((full.end_date || "").split("T")[0]);
            setRecAutoPost(full.auto_post !== false);
            setRecLimit(full.occurrences_limit != null ? String(full.occurrences_limit) : "");
            setView("recurring-form");
        } catch (e) { flash("Error: " + e.message); }
    };

    const saveRecurring = async () => {
        const amt = Number(recAmount);
        if (!recName.trim()) { flash("Give it a name"); return; }
        if (!amt || amt <= 0) { flash("Enter an amount"); return; }
        if (!recDebit || !recCredit) { flash("Choose both accounts"); return; }
        if (recDebit === recCredit) { flash("The two accounts must be different"); return; }
        if (!recStart) { flash("Pick a start date"); return; }
        const payload = {
            name: recName.trim(),
            memo: recName.trim(),
            frequency: recFreq,
            interval_count: Math.max(1, Number(recInterval) || 1),
            start_date: recStart,
            end_date: recEnd || "",
            auto_post: recAutoPost,
            occurrences_limit: recLimit ? Number(recLimit) : null,
            lines: [
                { account_id: recDebit, debit: amt, credit: 0 },
                { account_id: recCredit, debit: 0, credit: amt },
            ],
        };
        setSaving(true);
        try {
            if (editingRecId) await api("update_recurring_entry", { id: editingRecId, ...payload });
            else await api("create_recurring_entry", payload);
            flash(editingRecId ? "Recurring entry updated" : "Recurring entry created");
            setView("recurring");
            loadRecurring();
        } catch (e) { flash("Error: " + e.message); }
        setSaving(false);
    };

    const processDue = async () => {
        try {
            const res = await api("process_due_recurring", {});
            const n = res?.generated || 0;
            flash(n > 0 ? `Generated ${n} entr${n === 1 ? "y" : "ies"}` : "Nothing due right now");
            load();
            if (view === "recurring") loadRecurring();
        } catch (e) { flash("Error: " + e.message); }
    };

    const runRecurNow = async (rec) => {
        if (!confirm(`Generate "${rec.name}" now?`)) return;
        try {
            await api("run_recurring_now", { id: rec.id });
            flash("Entry generated");
            loadRecurring();
            load();
        } catch (e) { flash("Error: " + e.message); }
    };

    const toggleRecur = async (rec) => {
        try {
            await api("toggle_recurring_active", { id: rec.id, active: !rec.is_active });
            loadRecurring();
            load();
        } catch (e) { flash("Error: " + e.message); }
    };

    const deleteRecur = async (rec) => {
        if (!confirm(`Delete recurring entry "${rec.name}"? Already-generated entries are kept.`)) return;
        try {
            await api("delete_recurring_entry", { id: rec.id });
            flash("Recurring entry deleted");
            loadRecurring();
            load();
        } catch (e) { flash("Error: " + e.message); }
    };

    /* ------- POST / VOID / DELETE ------- */
    const postEntry = async (id) => {
        if (!confirm("Post this journal entry? This will update account balances.")) return;
        try {
            await api("post_journal_entry", { id });
            flash("Entry posted");
            load();
            setSelected(null);
        } catch (e) { flash("Error: " + e.message); }
    };

    const voidEntry = async (id) => {
        const reason = prompt("Reason for voiding:");
        if (!reason) return;
        try {
            await api("void_journal_entry", { id, reason });
            flash("Entry voided");
            load();
            setSelected(null);
        } catch (e) { flash("Error: " + e.message); }
    };

    const deleteEntry = async (id) => {
        if (!confirm("Delete this draft entry?")) return;
        try {
            await api("delete_journal_entry", { id });
            flash("Entry deleted");
            load();
            setSelected(null);
        } catch (e) { flash("Error: " + e.message); }
    };

    /* ------- MAPPINGS ------- */
    const loadMappings = async () => {
        setMappingLoading(true);
        try {
            const m = await api("get_account_mappings", {});
            setMappings(Array.isArray(m) ? m : []);
        } catch (e) { console.error(e); }
        setMappingLoading(false);
    };

    const autoMap = async () => {
        setMappingLoading(true);
        try {
            const m = await api("auto_map_payroll_accounts", {});
            setMappings(Array.isArray(m) ? m : []);
            flash("Auto-mapped " + (m?.length || 0) + " accounts");
        } catch (e) { flash("Error: " + e.message); }
        setMappingLoading(false);
    };

    const updateMapping = async (key, accountId, desc) => {
        try {
            await api("upsert_account_mapping", { mapping_key: key, account_id: accountId, description: desc });
            loadMappings();
        } catch (e) { flash("Error: " + e.message); }
    };

    /* ------- PAYROLL JOURNAL ------- */
    const loadPayrollRuns = async () => {
        try {
            const data = await api("get_payroll_runs", {});
            const runs = data?.runs || data || [];
            setPayrollRuns(Array.isArray(runs) ? runs : []);
        } catch (e) { console.error("load payroll runs:", e); setPayrollRuns([]); }
    };

    const loadPayrollTotals = async (runId) => {
        try {
            const t = await api("get_payroll_run_totals", { run_id: runId });
            setPayrollTotals(t);
        } catch (e) { setPayrollTotals(null); flash("Error: " + e.message); }
    };

    const generatePayrollJournal = async () => {
        if (!selectedRun) return;
        setGenerating(true);
        try {
            const result = await api("generate_payroll_journal", { run_id: selectedRun.id, auto_post: false });
            flash("Payroll journal created (JE-" + result.entry?.entry_number + ")");
            setView("list");
            load();
        } catch (e) { flash("Error: " + e.message); }
        setGenerating(false);
    };

    /* ------- ACCOUNT PICKER ------- */
    const acctMap = useMemo(() => {
        const m = {};
        accounts.forEach(a => { m[a.id] = a; });
        return m;
    }, [accounts]);

    const acctLabel = (id) => {
        const a = acctMap[id];
        return a ? `${a.code} ${a.name}` : "Select account...";
    };

    /* ===== STATS ===== */
    const stats = useMemo(() => {
        const draft = entries.filter(e => e.status === "Draft").length;
        const posted = entries.filter(e => e.status === "Posted").length;
        const voided = entries.filter(e => e.status === "Voided").length;
        const totalPosted = entries.filter(e => e.status === "Posted").reduce((s, e) => s + (e.total_debit || 0), 0);
        return { total: entries.length, draft, posted, voided, totalPosted };
    }, [entries]);

    /* ===== RENDER ===== */
    if (view === "create") return renderCreateView();
    if (view === "mapping") return renderMappingView();
    if (view === "payroll") return renderPayrollView();
    if (view === "recurring") return renderRecurringView();
    if (view === "recurring-form") return renderRecurringForm();

    return (
        <div className="acc-wrap">
            {msg && <div className="je-flash">{msg}</div>}

            {/* Toolbar */}
            <div className="acc-bar">
                <div className="acc-bar-left">
                    <div className="acc-search-wrap">
                        <I name="search" size={14}/>
                        <input className="acc-search" placeholder="Search entries..." value={search} onChange={e => setSearch(e.target.value)}/>
                    </div>
                    <select className="acc-filter" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                        <option value="">All Status</option>
                        <option value="Draft">Draft</option>
                        <option value="Posted">Posted</option>
                        <option value="Voided">Voided</option>
                    </select>
                    <select className="acc-filter" value={filterSource} onChange={e => setFilterSource(e.target.value)}>
                        <option value="">All Sources</option>
                        <option value="manual">Manual</option>
                        <option value="payroll">Payroll</option>
                        <option value="loan">Loan</option>
                    </select>
                </div>
                <div className="acc-bar-right">
                    <button className="acc-btn-s" onClick={openRecurring}>
                        <I name="repeat" size={14}/> Recurring
                        {dueList.length > 0 && <span className="je-due-badge">{dueList.length}</span>}
                    </button>
                    <button className="acc-btn-s" onClick={() => { setView("mapping"); loadMappings(); }}>
                        <I name="link" size={14}/> Mappings
                    </button>
                    <button className="acc-btn-s" onClick={() => { setView("payroll"); loadPayrollRuns(); }}>
                        <I name="users" size={14}/> From Payroll
                    </button>
                    <button className="acc-btn-p" onClick={openCreate}>
                        <I name="plus" size={14}/> New Entry
                    </button>
                </div>
            </div>

            {/* Recurring due banner */}
            {dueList.length > 0 && (
                <div className="je-due-banner">
                    <div className="je-due-banner-l">
                        <I name="clock" size={16}/>
                        <span><b>{dueList.length}</b> recurring transaction{dueList.length === 1 ? " is" : "s are"} due to be generated</span>
                    </div>
                    <button className="je-due-gen-btn" onClick={processDue}>
                        <I name="check" size={13}/> Generate now
                    </button>
                </div>
            )}

            {/* Main Content */}
            <div className="je-grid acc-fill">
                {/* Entry List */}
                <div className="je-list-pane">
                    {loading ? (
                        <div className="je-list-msg">Loading...</div>
                    ) : filtered.length === 0 ? (
                        <div className="acc-empty">
                            <div className="acc-empty-ic"><I name="inbox" size={28}/></div>
                            <div className="acc-empty-t">No journal entries yet</div>
                            <div className="acc-empty-d">Create a manual entry or generate from payroll</div>
                        </div>
                    ) : filtered.map(e => (
                        <div key={e.id} className={`je-entry-row${selected?.id === e.id ? " je-entry-row-sel" : ""}`}
                             onClick={() => selectEntry(e)}>
                            <div className="je-entry-left">
                                <div className="je-src-badge" style={{ background: (e.source_type === "payroll" ? "#6366f1" : "#10b981") + "18", color: e.source_type === "payroll" ? "#6366f1" : "#10b981" }}>
                                    <I name={SRC_ICON[e.source_type] || "file-text"} size={14}/>
                                </div>
                                <div>
                                    <div className="je-entry-num">JE-{e.entry_number}</div>
                                    <div className="je-entry-memo">{e.memo || "No description"}</div>
                                </div>
                            </div>
                            <div className="je-entry-right">
                                <div className="je-entry-amt acc-cell-mono">{fmtMoney(e.total_debit)}</div>
                                <div className="je-entry-status">
                                    <span className="je-status-dot" style={{ background: STATUS_CLR[e.status] || "#999" }}/>
                                    <span style={{ fontSize: 11, color: STATUS_CLR[e.status] || "#999" }}>{e.status}</span>
                                </div>
                                <div className="je-entry-date">{e.entry_date?.split("T")[0]}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Detail Panel */}
                <div className="je-detail-pane">
                    {!selected ? (
                        <div className="je-detail-empty">
                            <I name="book-open" size={36} style={{ opacity: 0.3, marginBottom: 8 }}/>
                            <div style={{ fontSize: 13 }}>Select an entry to view details</div>
                        </div>
                    ) : (
                        <div>
                            <div className="je-detail-header">
                                <div>
                                    <div className="je-detail-title">JE-{selected.entry_number}</div>
                                    <div className="je-detail-sub">{selected.entry_date?.split("T")[0]} &middot; {SRC_LABEL[selected.source_type] || selected.source_type}</div>
                                </div>
                                <div className="acc-badge" style={{ background: STATUS_CLR[selected.status] + "18", color: STATUS_CLR[selected.status] }}>
                                    {selected.status}
                                </div>
                            </div>

                            {selected.memo && <div className="je-detail-memo">{selected.memo}</div>}

                            {/* Lines Table */}
                            <table className="acc-tbl je-lines-tbl">
                                <thead>
                                <tr>
                                    <th>Account</th>
                                    <th>Description</th>
                                    <th className="acc-right">Debit</th>
                                    <th className="acc-right">Credit</th>
                                </tr>
                                </thead>
                                <tbody>
                                {lines.map(l => (
                                    <tr key={l.id}>
                                        <td>
                                            <span style={{ fontWeight: 600, fontSize: 12 }}>{l.account_code}</span>
                                            <span style={{ color: "#666", marginLeft: 6, fontSize: 12 }}>{l.account_name}</span>
                                        </td>
                                        <td style={{ color: "#888", fontSize: 12 }}>{l.description || ""}</td>
                                        <td className="acc-right acc-cell-mono" style={{ fontWeight: l.debit > 0 ? 600 : 400, color: l.debit > 0 ? "#1a1a2e" : "#ccc" }}>
                                            {l.debit > 0 ? fmtMoney(l.debit) : ""}
                                        </td>
                                        <td className="acc-right acc-cell-mono" style={{ fontWeight: l.credit > 0 ? 600 : 400, color: l.credit > 0 ? "#1a1a2e" : "#ccc" }}>
                                            {l.credit > 0 ? fmtMoney(l.credit) : ""}
                                        </td>
                                    </tr>
                                ))}
                                <tr className="je-totals-row">
                                    <td colSpan={2} style={{ fontWeight: 700 }}>TOTALS</td>
                                    <td className="acc-right acc-cell-mono" style={{ fontWeight: 700 }}>{fmtMoney(selected.total_debit)}</td>
                                    <td className="acc-right acc-cell-mono" style={{ fontWeight: 700 }}>{fmtMoney(selected.total_credit)}</td>
                                </tr>
                                </tbody>
                            </table>

                            {/* Actions */}
                            <div className="je-detail-actions">
                                {selected.status === "Draft" && (
                                    <>
                                        <button className="acc-btn-p" onClick={() => postEntry(selected.id)}><I name="check" size={14}/> Post</button>
                                        <button className="acc-btn-s" onClick={() => openEdit(selected)}><I name="edit-2" size={14}/> Edit</button>
                                        <button className="acc-btn-danger" onClick={() => deleteEntry(selected.id)}><I name="trash-2" size={14}/> Delete</button>
                                    </>
                                )}
                                {selected.status === "Posted" && (
                                    <button className="acc-btn-danger" onClick={() => voidEntry(selected.id)}><I name="x-circle" size={14}/> Void</button>
                                )}
                                {selected.status === "Voided" && selected.void_reason && (
                                    <div style={{ fontSize: 12, color: "#ef4444", fontStyle: "italic" }}>Voided: {selected.void_reason}</div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <style>{jeCSS}</style>
        </div>
    );

    /* ===== CREATE / EDIT VIEW ===== */
    function renderCreateView() {
        return (
            <div className="acc-wrap">
                {msg && <div className="je-flash">{msg}</div>}
                <div className="je-view-header">
                    <button className="je-back-btn" onClick={() => setView("list")}><I name="arrow-left" size={16}/></button>
                    <h3 className="acc-title" style={{ margin: 0 }}>{editingId ? "Edit Journal Entry" : "Record a Transaction"}</h3>
                    {/* The Simple/Advanced choice is the single global toggle in the top
                        bar now — no second toggle here. When the guided form can't do
                        what's needed, the inline "switch to the full grid" link below
                        flips just this one entry. */}
                    {!editingId && entryMode === "advanced" && globalSimple && (
                        <button
                            onClick={() => setEntryMode("simple")}
                            style={{ marginLeft: "auto", border: "1px solid #e2e5e9", background: "#fff", color: "#2d9e8b",
                                     fontFamily: "inherit", fontSize: 12, fontWeight: 600, padding: "6px 11px",
                                     borderRadius: 8, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
                            <I name="zap" size={12}/> Back to guided
                        </button>
                    )}
                </div>

                {entryMode === "simple" && !editingId ? renderSimpleForm() : (
                <div className="acc-card je-form-card">
                    <div className="je-form-head">
                        <div style={{ flex: 1 }}>
                            <label className="acc-label">Date</label>
                            <input type="date" className="acc-input" value={formDate} onChange={e => setFormDate(e.target.value)}/>
                        </div>
                        <div style={{ flex: 3 }}>
                            <label className="acc-label">Memo / Description</label>
                            <input className="acc-input" placeholder="e.g. Payroll for January 2026" value={formMemo} onChange={e => setFormMemo(e.target.value)}/>
                        </div>
                    </div>

                    {/* Lines */}
                    <table className="acc-tbl je-lines-tbl">
                        <thead>
                        <tr>
                            <th style={{ width: "35%" }}>Account</th>
                            <th style={{ width: "25%" }}>Description</th>
                            <th className="acc-right" style={{ width: "15%" }}>Debit</th>
                            <th className="acc-right" style={{ width: "15%" }}>Credit</th>
                            <th style={{ width: "10%" }}></th>
                        </tr>
                        </thead>
                        <tbody>
                        {formLines.map((l, i) => (
                            <tr key={i}>
                                <td>
                                    <select className="acc-input" style={{ margin: 0 }} value={l.account_id} onChange={e => updateLine(i, "account_id", e.target.value)}>
                                        <option value="">Select account...</option>
                                        {accounts.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                                    </select>
                                </td>
                                <td>
                                    <input className="acc-input" style={{ margin: 0 }} placeholder="Line desc" value={l.description} onChange={e => updateLine(i, "description", e.target.value)}/>
                                </td>
                                <td>
                                    <input type="number" min="0" step="0.01" className="acc-input" style={{ margin: 0, textAlign: "right" }}
                                           value={l.debit || ""} onChange={e => { updateLine(i, "debit", Number(e.target.value)); if (Number(e.target.value) > 0) updateLine(i, "credit", 0); }}/>
                                </td>
                                <td>
                                    <input type="number" min="0" step="0.01" className="acc-input" style={{ margin: 0, textAlign: "right" }}
                                           value={l.credit || ""} onChange={e => { updateLine(i, "credit", Number(e.target.value)); if (Number(e.target.value) > 0) updateLine(i, "debit", 0); }}/>
                                </td>
                                <td>
                                    {formLines.length > 2 && (
                                        <button className="je-icon-btn" onClick={() => removeLine(i)}><I name="x" size={14}/></button>
                                    )}
                                </td>
                            </tr>
                        ))}
                        <tr className="je-totals-row">
                            <td colSpan={2} style={{ fontWeight: 700 }}>
                                <button className="je-addline-btn" onClick={addLine}><I name="plus" size={12}/> Add Line</button>
                            </td>
                            <td className="acc-right acc-cell-mono" style={{ fontWeight: 700, color: !balanced && totalDr > 0 ? "#ef4444" : "#1a1a2e" }}>{fmtMoney(totalDr)}</td>
                            <td className="acc-right acc-cell-mono" style={{ fontWeight: 700, color: !balanced && totalCr > 0 ? "#ef4444" : "#1a1a2e" }}>{fmtMoney(totalCr)}</td>
                            <td></td>
                        </tr>
                        </tbody>
                    </table>

                    {!balanced && totalDr > 0 && (
                        <div style={{ fontSize: 12, color: "#ef4444", marginTop: 8 }}>
                            ⚠ Difference: {fmtMoney(Math.abs(totalDr - totalCr))} (must be zero)
                        </div>
                    )}

                    <div className="acc-foot-btns" style={{ justifyContent: "flex-start", marginTop: 16 }}>
                        <button className="acc-btn-primary" onClick={saveEntry} disabled={!balanced}>
                            <I name="save" size={14}/> {editingId ? "Update" : "Save"} Entry
                        </button>
                        <button className="acc-btn-cancel" onClick={() => setView("list")}>Cancel</button>
                    </div>
                </div>
                )}

                <style>{jeCSS}</style>
            </div>
        );
    }

    /* ===== SIMPLE (GUIDED) FORM ===== */
    function renderSimpleForm() {
        // Step 1 — pick the kind of transaction.
        if (!activePreset) {
            return (
                <div className="je-simple-pick">
                    <div className="je-view-desc" style={{ margin: "0 0 14px" }}>
                        Pick what happened. We'll handle the debits and credits for you.
                    </div>
                    {TXN_GROUPS.map(group => (
                        <div key={group} className="je-pick-group">
                            <div className="je-pick-group-t">{group}</div>
                            <div className="je-pick-grid">
                                {TXN_PRESETS.filter(p => p.group === group).map(p => (
                                    <button key={p.id} className="je-pick-card" onClick={() => choosePreset(p)}>
                                        <span className="je-pick-ic" style={{ background: p.color + "18", color: p.color }}>
                                            <I name={p.icon} size={18}/>
                                        </span>
                                        <span className="je-pick-txt">
                                            <span className="je-pick-label">{p.label}</span>
                                            <span className="je-pick-sub">{p.sub}</span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            );
        }

        // Step 2 — fill in amount + the two friendly account pickers.
        const p = activePreset;
        const debitList = pickAccounts(p.debit);
        const creditList = pickAccounts(p.credit);
        const acctName = (id) => { const a = acctMap[id]; return a ? `${a.code} ${a.name}` : "—"; };
        const amt = Number(simpleAmount) || 0;
        const ready = amt > 0 && sDebit && sCredit && sDebit !== sCredit;
        const missingAccts = debitList.length === 0 || creditList.length === 0;

        return (
            <div className="acc-card je-form-card">
                <button className="je-change-type" onClick={() => { setSimpleType(""); }}>
                    <I name="chevron-left" size={13}/> Change type
                </button>
                <div className="je-simple-title">
                    <span className="je-pick-ic" style={{ background: p.color + "18", color: p.color }}><I name={p.icon} size={18}/></span>
                    <div>
                        <div className="je-pick-label" style={{ fontSize: 15 }}>{p.label}</div>
                        <div className="je-pick-sub">{p.sub}</div>
                    </div>
                </div>

                {missingAccts && (
                    <div className="je-simple-warn">
                        <I name="alert-triangle" size={14}/>
                        You don't have the right accounts set up for this yet. Add them under
                        <b> Chart of Accts</b>, or{" "}
                        <button onClick={() => setEntryMode("advanced")}
                            style={{ border: "none", background: "none", color: "#2d9e8b", fontFamily: "inherit",
                                     fontSize: "inherit", fontWeight: 700, cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                            use the full grid
                        </button>.
                    </div>
                )}

                {/* Amount — the star of the form */}
                <label className="acc-label">Amount</label>
                <div className="je-amount-wrap">
                    <span className="je-amount-peso">₱</span>
                    <input type="number" min="0" step="0.01" className="je-amount-input" placeholder="0.00"
                        value={simpleAmount} onChange={e => setSimpleAmount(e.target.value)} autoFocus/>
                </div>

                {/* The two accounts, in plain language */}
                <div className="je-simple-row">
                    <div style={{ flex: 1 }}>
                        <label className="acc-label">{p.debit.label}</label>
                        <select className="acc-input" style={{ margin: 0 }} value={sDebit} onChange={e => setSDebit(e.target.value)}>
                            <option value="">Select…</option>
                            {debitList.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                        </select>
                    </div>
                    <div style={{ flex: 1 }}>
                        <label className="acc-label">{p.credit.label}</label>
                        <select className="acc-input" style={{ margin: 0 }} value={sCredit} onChange={e => setSCredit(e.target.value)}>
                            <option value="">Select…</option>
                            {creditList.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                        </select>
                    </div>
                </div>

                <div className="je-simple-row">
                    <div style={{ flex: 1 }}>
                        <label className="acc-label">Date</label>
                        <input type="date" className="acc-input" style={{ margin: 0 }} value={formDate} onChange={e => setFormDate(e.target.value)}/>
                    </div>
                    <div style={{ flex: 2 }}>
                        <label className="acc-label">Note <span style={{ color: "#aaa", fontWeight: 400 }}>(optional)</span></label>
                        <input className="acc-input" style={{ margin: 0 }} placeholder="e.g. July office rent" value={formMemo} onChange={e => setFormMemo(e.target.value)}/>
                    </div>
                </div>

                {/* Transparent "here's the entry we'll post" — educational, collapsible-feel */}
                {ready && (
                    <div className="je-accountant-peek">
                        <div className="je-peek-head"><I name="book-open" size={12}/> Accountant view</div>
                        <div className="je-peek-line"><span className="je-peek-dr">Dr</span> {acctName(sDebit)} <span className="je-peek-amt">{fmtMoney(amt)}</span></div>
                        <div className="je-peek-line"><span className="je-peek-cr">Cr</span> {acctName(sCredit)} <span className="je-peek-amt">{fmtMoney(amt)}</span></div>
                    </div>
                )}

                <div className="acc-foot-btns" style={{ justifyContent: "flex-start", marginTop: 16 }}>
                    <button className="acc-btn-primary" onClick={saveSimple} disabled={!ready || saving}>
                        <I name={saving ? "loader" : "check"} size={14}/> {saving ? "Recording…" : "Record Transaction"}
                    </button>
                    <button className="acc-btn-cancel" onClick={() => setView("list")}>Cancel</button>
                </div>
            </div>
        );
    }

    /* ===== MAPPING VIEW ===== */
    function renderMappingView() {
        const mappingMap = {};
        mappings.forEach(m => { mappingMap[m.mapping_key] = m; });
        const groups = [...new Set(MAPPING_DEFS.map(d => d.group))];

        return (
            <div className="acc-wrap">
                {msg && <div className="je-flash">{msg}</div>}
                <div className="je-view-header">
                    <button className="je-back-btn" onClick={() => setView("list")}><I name="arrow-left" size={16}/></button>
                    <h3 className="acc-title" style={{ margin: 0 }}>Account Mappings</h3>
                    <div style={{ marginLeft: "auto" }}>
                        <button className="acc-btn-p" onClick={autoMap} disabled={mappingLoading}>
                            <I name="zap" size={14}/> Auto-Map (BIR)
                        </button>
                    </div>
                </div>

                <div className="je-view-desc">
                    Link your payroll categories to COA accounts. Click "Auto-Map" to automatically match using BIR template account codes, then adjust as needed.
                </div>

                {groups.map(group => (
                    <div key={group} className="acc-card je-form-card">
                        <div className="je-group-title">{group}</div>
                        {MAPPING_DEFS.filter(d => d.group === group).map(def => {
                            const current = mappingMap[def.key];
                            return (
                                <div key={def.key} className="je-map-row">
                                    <div className="je-map-label">
                                        <span className="je-side-badge" style={{ background: def.side === "Dr" ? "#dbeafe" : "#fce7f3", color: def.side === "Dr" ? "#2563eb" : "#db2777" }}>{def.side}</span>
                                        {def.label}
                                    </div>
                                    <select className="acc-input" style={{ flex: 1, margin: 0, fontSize: 12 }}
                                            value={current?.account_id || ""}
                                            onChange={e => { if (e.target.value) updateMapping(def.key, e.target.value, def.label); }}>
                                        <option value="">Not mapped</option>
                                        {accounts.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                                    </select>
                                    {current && (
                                        <span style={{ fontSize: 11, color: "#22c55e" }}><I name="check" size={12}/></span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}

                <style>{jeCSS}</style>
            </div>
        );
    }

    /* ===== PAYROLL VIEW ===== */
    function renderPayrollView() {
        return (
            <div className="acc-wrap">
                {msg && <div className="je-flash">{msg}</div>}
                <div className="je-view-header">
                    <button className="je-back-btn" onClick={() => setView("list")}><I name="arrow-left" size={16}/></button>
                    <h3 className="acc-title" style={{ margin: 0 }}>Generate Journal from Payroll</h3>
                </div>

                <div className="je-view-desc">
                    Select an approved payroll run to automatically generate the journal entry with all debits and credits.
                    Make sure account mappings are configured first.
                </div>

                <div className="acc-card je-form-card">
                    <label className="acc-label">Select Payroll Run</label>
                    {payrollRuns.length === 0 ? (
                        <div className="je-list-msg">No payroll runs found. Create and compute a payroll run in the HR &gt; Payroll module first.</div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {payrollRuns.map(run => {
                                const ready = run.status === "Approved" || run.status === "Paid";
                                return (
                                    <div key={run.id} className={`je-payroll-card${selectedRun?.id === run.id ? " je-payroll-card-sel" : ""}`}
                                        style={!ready ? { opacity: 0.6 } : undefined}
                                        onClick={() => { if (ready) { setSelectedRun(run); loadPayrollTotals(run.id); } else { flash("Approve this payroll run first before generating a journal entry"); } }}>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: 13 }}>{run.period_start?.split("T")[0]} to {run.period_end?.split("T")[0]}</div>
                                            <div style={{ fontSize: 11, color: "#888" }}>
                                                {run.employee_count} employees &middot;
                                                <span style={{ color: run.status === "Approved" ? "#22c55e" : run.status === "Paid" ? "#0ea5e9" : "#f59e0b", fontWeight: 600, marginLeft: 4 }}>{run.status}</span>
                                            </div>
                                        </div>
                                        <div style={{ textAlign: "right" }}>
                                            <div style={{ fontWeight: 700, fontSize: 14 }}>{fmtMoney(run.total_gross)}</div>
                                            <div style={{ fontSize: 11, color: "#888" }}>Gross</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {payrollTotals && selectedRun && (
                        <div style={{ marginTop: 16 }}>
                            <div className="je-group-title">Preview Journal Lines</div>
                            <table className="acc-tbl je-lines-tbl">
                                <thead>
                                <tr>
                                    <th>Description</th>
                                    <th className="acc-right">Debit</th>
                                    <th className="acc-right">Credit</th>
                                </tr>
                                </thead>
                                <tbody>
                                {payrollTotals.total_gross > 0 && <tr><td>Salaries and Wages</td><td className="acc-right acc-cell-mono">{fmtMoney(payrollTotals.total_gross)}</td><td></td></tr>}
                                {payrollTotals.total_sss_er > 0 && <tr><td>SSS Expense (ER)</td><td className="acc-right acc-cell-mono">{fmtMoney(payrollTotals.total_sss_er)}</td><td></td></tr>}
                                {payrollTotals.total_philhealth_er > 0 && <tr><td>PhilHealth Expense (ER)</td><td className="acc-right acc-cell-mono">{fmtMoney(payrollTotals.total_philhealth_er)}</td><td></td></tr>}
                                {payrollTotals.total_pagibig_er > 0 && <tr><td>Pag-IBIG Expense (ER)</td><td className="acc-right acc-cell-mono">{fmtMoney(payrollTotals.total_pagibig_er)}</td><td></td></tr>}

                                {(payrollTotals.total_sss_ee + payrollTotals.total_sss_er) > 0 && <tr><td>SSS Payable (EE+ER)</td><td></td><td className="acc-right acc-cell-mono">{fmtMoney(payrollTotals.total_sss_ee + payrollTotals.total_sss_er)}</td></tr>}
                                {(payrollTotals.total_philhealth_ee + payrollTotals.total_philhealth_er) > 0 && <tr><td>PhilHealth Payable (EE+ER)</td><td></td><td className="acc-right acc-cell-mono">{fmtMoney(payrollTotals.total_philhealth_ee + payrollTotals.total_philhealth_er)}</td></tr>}
                                {(payrollTotals.total_pagibig_ee + payrollTotals.total_pagibig_er) > 0 && <tr><td>Pag-IBIG Payable (EE+ER)</td><td></td><td className="acc-right acc-cell-mono">{fmtMoney(payrollTotals.total_pagibig_ee + payrollTotals.total_pagibig_er)}</td></tr>}
                                {payrollTotals.total_tax > 0 && <tr><td>Withholding Tax Payable</td><td></td><td className="acc-right acc-cell-mono">{fmtMoney(payrollTotals.total_tax)}</td></tr>}
                                {payrollTotals.total_loan_deductions > 0 && <tr><td>Loan Deductions</td><td></td><td className="acc-right acc-cell-mono">{fmtMoney(payrollTotals.total_loan_deductions)}</td></tr>}
                                {payrollTotals.total_net_pay > 0 && <tr><td>Net Pay (Cash)</td><td></td><td className="acc-right acc-cell-mono">{fmtMoney(payrollTotals.total_net_pay)}</td></tr>}
                                </tbody>
                            </table>

                            <button className="acc-btn-primary" style={{ marginTop: 12 }} onClick={generatePayrollJournal} disabled={generating}>
                                <I name={generating ? "loader" : "file-plus"} size={14}/> {generating ? "Generating..." : "Generate Journal Entry"}
                            </button>
                        </div>
                    )}
                </div>

                <style>{jeCSS}</style>
            </div>
        );
    }

    /* ===== RECURRING LIST VIEW ===== */
    function renderRecurringView() {
        return (
            <div className="acc-wrap">
                {msg && <div className="je-flash">{msg}</div>}
                <div className="je-view-header">
                    <button className="je-back-btn" onClick={() => setView("list")}><I name="arrow-left" size={16}/></button>
                    <h3 className="acc-title" style={{ margin: 0 }}>Recurring Transactions</h3>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                        {dueList.length > 0 && (
                            <button className="acc-btn-s" onClick={processDue}>
                                <I name="clock" size={14}/> Generate {dueList.length} due
                            </button>
                        )}
                        <button className="acc-btn-p" onClick={openRecurringCreate}>
                            <I name="plus" size={14}/> New Recurring
                        </button>
                    </div>
                </div>

                <div className="je-view-desc">
                    Set up transactions that repeat on a schedule — rent, subscriptions, loan payments.
                    Each one generates a journal entry automatically when it falls due.
                </div>

                {recurringList.length === 0 ? (
                    <div className="acc-empty">
                        <div className="acc-empty-ic"><I name="repeat" size={28}/></div>
                        <div className="acc-empty-t">No recurring transactions yet</div>
                        <div className="acc-empty-d">Create one to have it post on a schedule</div>
                    </div>
                ) : (
                    <div className="je-rec-list">
                        {recurringList.map(rec => {
                            const due = new Date(rec.next_run_date) <= new Date(new Date().toISOString().split("T")[0]);
                            return (
                                <div key={rec.id} className={`je-rec-card${rec.is_active ? "" : " je-rec-card-off"}`}>
                                    <div className="je-rec-main">
                                        <div className="je-rec-ic" style={{ background: (rec.is_active ? "#6366f1" : "#9ca3af") + "18", color: rec.is_active ? "#6366f1" : "#9ca3af" }}>
                                            <I name="repeat" size={16}/>
                                        </div>
                                        <div style={{ minWidth: 0 }}>
                                            <div className="je-rec-name">{rec.name}</div>
                                            <div className="je-rec-sub">
                                                {freqLabel(rec.frequency, rec.interval_count)}
                                                {rec.auto_post ? " · auto-posts" : " · saves as draft"}
                                                {rec.occurrences_limit ? ` · ${rec.occurrences_count}/${rec.occurrences_limit} runs` : ""}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="je-rec-mid">
                                        <div className="je-rec-amt acc-cell-mono">{fmtMoney(rec.total_debit)}</div>
                                        <div className={`je-rec-next${due && rec.is_active ? " je-rec-next-due" : ""}`}>
                                            {rec.is_active ? <>Next: {rec.next_run_date?.split("T")[0]}{due ? " (due)" : ""}</> : "Paused"}
                                        </div>
                                    </div>
                                    <div className="je-rec-actions">
                                        {rec.is_active && (
                                            <button className="je-icon-act" title="Generate now" onClick={() => runRecurNow(rec)}><I name="play" size={14}/></button>
                                        )}
                                        <button className="je-icon-act" title={rec.is_active ? "Pause" : "Resume"} onClick={() => toggleRecur(rec)}>
                                            <I name={rec.is_active ? "pause" : "play"} size={14}/>
                                        </button>
                                        <button className="je-icon-act" title="Edit" onClick={() => openRecurringEdit(rec)}><I name="edit-2" size={14}/></button>
                                        <button className="je-icon-act je-icon-act-danger" title="Delete" onClick={() => deleteRecur(rec)}><I name="trash-2" size={14}/></button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                <style>{jeCSS}</style>
            </div>
        );
    }

    /* ===== RECURRING CREATE / EDIT FORM ===== */
    function renderRecurringForm() {
        // Step 1 (create only) — pick the kind of transaction, like Simple mode.
        if (!editingRecId && !activeRecPreset) {
            return (
                <div className="acc-wrap">
                    {msg && <div className="je-flash">{msg}</div>}
                    <div className="je-view-header">
                        <button className="je-back-btn" onClick={() => setView("recurring")}><I name="arrow-left" size={16}/></button>
                        <h3 className="acc-title" style={{ margin: 0 }}>New Recurring Transaction</h3>
                    </div>
                    <div className="je-view-desc" style={{ margin: "0 0 14px" }}>
                        What repeats? We'll handle the debits and credits for you.
                    </div>
                    {TXN_GROUPS.map(group => (
                        <div key={group} className="je-pick-group">
                            <div className="je-pick-group-t">{group}</div>
                            <div className="je-pick-grid">
                                {TXN_PRESETS.filter(p => p.group === group).map(p => (
                                    <button key={p.id} className="je-pick-card" onClick={() => chooseRecPreset(p)}>
                                        <span className="je-pick-ic" style={{ background: p.color + "18", color: p.color }}>
                                            <I name={p.icon} size={18}/>
                                        </span>
                                        <span className="je-pick-txt">
                                            <span className="je-pick-label">{p.label}</span>
                                            <span className="je-pick-sub">{p.sub}</span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                    <style>{jeCSS}</style>
                </div>
            );
        }

        // Step 2 — transaction details + schedule.
        const debitList = activeRecPreset ? pickAccounts(activeRecPreset.debit) : accounts;
        const creditList = activeRecPreset ? pickAccounts(activeRecPreset.credit) : accounts;
        const debitLabel = activeRecPreset ? activeRecPreset.debit.label : "Money goes to (debit)";
        const creditLabel = activeRecPreset ? activeRecPreset.credit.label : "Money comes from (credit)";
        const acctName = (id) => { const a = acctMap[id]; return a ? `${a.code} ${a.name}` : "—"; };
        const amt = Number(recAmount) || 0;
        const ready = recName.trim() && amt > 0 && recDebit && recCredit && recDebit !== recCredit && recStart;

        return (
            <div className="acc-wrap">
                {msg && <div className="je-flash">{msg}</div>}
                <div className="je-view-header">
                    <button className="je-back-btn" onClick={() => setView("recurring")}><I name="arrow-left" size={16}/></button>
                    <h3 className="acc-title" style={{ margin: 0 }}>{editingRecId ? "Edit" : "New"} Recurring Transaction</h3>
                </div>

                <div className="acc-card je-form-card">
                    {!editingRecId && activeRecPreset && (
                        <button className="je-change-type" onClick={() => setRecPreset("")}>
                            <I name="chevron-left" size={13}/> Change type
                        </button>
                    )}

                    <label className="acc-label">Name</label>
                    <input className="acc-input" placeholder="e.g. Monthly office rent" value={recName} onChange={e => setRecName(e.target.value)}/>

                    <label className="acc-label" style={{ marginTop: 14 }}>Amount</label>
                    <div className="je-amount-wrap">
                        <span className="je-amount-peso">₱</span>
                        <input type="number" min="0" step="0.01" className="je-amount-input" placeholder="0.00"
                            value={recAmount} onChange={e => setRecAmount(e.target.value)}/>
                    </div>

                    <div className="je-simple-row">
                        <div style={{ flex: 1 }}>
                            <label className="acc-label">{debitLabel}</label>
                            <select className="acc-input" style={{ margin: 0 }} value={recDebit} onChange={e => setRecDebit(e.target.value)}>
                                <option value="">Select…</option>
                                {debitList.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                            </select>
                        </div>
                        <div style={{ flex: 1 }}>
                            <label className="acc-label">{creditLabel}</label>
                            <select className="acc-input" style={{ margin: 0 }} value={recCredit} onChange={e => setRecCredit(e.target.value)}>
                                <option value="">Select…</option>
                                {creditList.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="je-rec-sched">
                        <div className="je-group-title" style={{ marginTop: 4 }}>Schedule</div>
                        <div className="je-simple-row" style={{ marginTop: 0 }}>
                            <div style={{ flex: 1 }}>
                                <label className="acc-label">Repeats</label>
                                <select className="acc-input" style={{ margin: 0 }} value={recFreq} onChange={e => setRecFreq(e.target.value)}>
                                    {FREQ_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                                </select>
                            </div>
                            <div style={{ flex: 1 }}>
                                <label className="acc-label">Every</label>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <input type="number" min="1" step="1" className="acc-input" style={{ margin: 0, width: 70 }}
                                        value={recInterval} onChange={e => setRecInterval(e.target.value)}/>
                                    <span style={{ fontSize: 12, color: "#888" }}>{FREQ_UNIT[recFreq]}(s)</span>
                                </div>
                            </div>
                        </div>
                        <div className="je-simple-row">
                            <div style={{ flex: 1 }}>
                                <label className="acc-label">Starts</label>
                                <input type="date" className="acc-input" style={{ margin: 0 }} value={recStart} onChange={e => setRecStart(e.target.value)}/>
                            </div>
                            <div style={{ flex: 1 }}>
                                <label className="acc-label">Ends <span style={{ color: "#aaa", fontWeight: 400 }}>(optional)</span></label>
                                <input type="date" className="acc-input" style={{ margin: 0 }} value={recEnd} onChange={e => setRecEnd(e.target.value)}/>
                            </div>
                            <div style={{ flex: 1 }}>
                                <label className="acc-label">Max runs <span style={{ color: "#aaa", fontWeight: 400 }}>(optional)</span></label>
                                <input type="number" min="1" step="1" className="acc-input" style={{ margin: 0 }} placeholder="∞"
                                    value={recLimit} onChange={e => setRecLimit(e.target.value)}/>
                            </div>
                        </div>
                        <label className="je-autopost">
                            <input type="checkbox" checked={recAutoPost} onChange={e => setRecAutoPost(e.target.checked)}/>
                            <span>Post automatically when generated <span style={{ color: "#888" }}>(otherwise saved as a draft for you to review and post)</span></span>
                        </label>
                    </div>

                    {ready && (
                        <div className="je-accountant-peek">
                            <div className="je-peek-head"><I name="book-open" size={12}/> Each run posts</div>
                            <div className="je-peek-line"><span className="je-peek-dr">Dr</span> {acctName(recDebit)} <span className="je-peek-amt">{fmtMoney(amt)}</span></div>
                            <div className="je-peek-line"><span className="je-peek-cr">Cr</span> {acctName(recCredit)} <span className="je-peek-amt">{fmtMoney(amt)}</span></div>
                        </div>
                    )}

                    <div className="acc-foot-btns" style={{ justifyContent: "flex-start", marginTop: 16 }}>
                        <button className="acc-btn-primary" onClick={saveRecurring} disabled={!ready || saving}>
                            <I name={saving ? "loader" : "save"} size={14}/> {saving ? "Saving…" : editingRecId ? "Update" : "Create"} Recurring
                        </button>
                        <button className="acc-btn-cancel" onClick={() => setView("recurring")}>Cancel</button>
                    </div>
                </div>

                <style>{jeCSS}</style>
            </div>
        );
    }
}

/* ===== PAGE-SPECIFIC STYLES (not covered by acc-layout.css) ===== */
const jeCSS = `
  .je-flash{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;padding:8px 14px;border-radius:8px;font-size:13px;margin-bottom:12px}

  /* stat cards: icon + value + label stacked, matching this page's original horizontal card */
  .acc-st{display:flex;align-items:center;gap:10px}
  .acc-st .acc-st-ic{margin-bottom:0}

  /* two-pane list + detail layout */
  .je-grid{display:grid;grid-template-columns:1fr 380px;grid-template-rows:minmax(0,1fr);gap:12px;min-height:0}
  .je-list-pane{background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden}
  .je-list-msg{text-align:center;padding:20px;color:#999;font-size:13px}
  .je-detail-pane{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;min-height:300px}
  .je-detail-empty{text-align:center;padding:60px;color:#bbb}

  .je-entry-row{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid #f3f4f6;cursor:pointer;transition:background .15s}
  .je-entry-row:hover{background:#fafffe}
  .je-entry-row-sel{background:#edf8f5}
  .je-entry-left{display:flex;align-items:center;gap:10px}
  .je-src-badge{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center}
  .je-entry-num{font-size:13px;font-weight:700;color:#1a1a2e}
  .je-entry-memo{font-size:11px;color:#888;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .je-entry-right{text-align:right}
  .je-entry-amt{font-size:13px;font-weight:700;color:#1a1a2e}
  .je-entry-status{display:flex;gap:6px;align-items:center;justify-content:flex-end}
  .je-status-dot{width:7px;height:7px;border-radius:50%;display:inline-block}
  .je-entry-date{font-size:11px;color:#aaa}

  .je-detail-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px}
  .je-detail-title{font-size:18px;font-weight:700;color:#1a1a2e}
  .je-detail-sub{font-size:12px;color:#888;margin-top:2px}
  .je-detail-memo{font-size:12px;color:#666;background:#f9fafb;border-radius:6px;padding:8px 10px;margin-bottom:12px}
  .je-detail-actions{display:flex;gap:8px;margin-top:16px}

  /* line tables: tighter than default acc-tbl for dense JE data */
  .je-lines-tbl thead th{padding:6px 8px}
  .je-lines-tbl tbody td{padding:6px 8px;border-bottom:1px solid #f3f4f6}
  .je-totals-row td{border-top:2px solid #e0e0e0}

  .je-view-header{display:flex;align-items:center;gap:10px;margin-bottom:16px}
  .je-back-btn{background:none;border:1px solid #d1d5db;border-radius:8px;padding:6px 8px;cursor:pointer;display:flex;align-items:center}
  .je-view-desc{font-size:12px;color:#888;margin:8px 0 16px;line-height:1.5}
  .je-form-card{margin-bottom:12px}
  .je-form-head{display:flex;gap:16px;margin-bottom:16px}
  .je-group-title{font-size:13px;font-weight:700;color:#1a1a2e;margin-bottom:12px}

  .je-icon-btn{background:none;border:none;cursor:pointer;color:#ef4444;padding:4px}
  .je-addline-btn{display:flex;align-items:center;gap:4px;background:none;border:1px dashed #d1d5db;border-radius:6px;padding:6px 12px;font-size:12px;color:#2d9e8b;cursor:pointer;font-weight:600}

  .je-map-row{display:flex;align-items:center;gap:12px;margin-bottom:8px}
  .je-map-label{width:220px;font-size:12px;color:#555}
  .je-side-badge{display:inline-block;padding:1px 5px;border-radius:4px;font-size:10px;font-weight:700;margin-right:6px}

  .je-payroll-card{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer;transition:all .15s}
  .je-payroll-card-sel{border:2px solid #2d9e8b;background:#edf8f5}

  /* ---- simple (guided) mode ---- */
  .je-mode-toggle{margin-left:auto;display:inline-flex;background:#f1f5f9;border-radius:8px;padding:3px}
  .je-mode-toggle button{display:flex;align-items:center;gap:5px;border:none;background:none;padding:6px 12px;border-radius:6px;font-size:12px;font-weight:600;color:#64748b;cursor:pointer}
  .je-mode-toggle .je-mode-on{background:#fff;color:#2d9e8b;box-shadow:0 1px 2px rgba(0,0,0,.08)}

  .je-pick-group{margin-bottom:18px}
  .je-pick-group-t{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#94a3b8;margin-bottom:8px}
  .je-pick-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
  .je-pick-card{display:flex;align-items:center;gap:12px;text-align:left;padding:12px 14px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;cursor:pointer;transition:all .15s}
  .je-pick-card:hover{border-color:#2d9e8b;box-shadow:0 2px 8px rgba(45,158,139,.12);transform:translateY(-1px)}
  .je-pick-ic{width:38px;height:38px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .je-pick-txt{display:flex;flex-direction:column;gap:2px;min-width:0}
  .je-pick-label{font-size:13px;font-weight:700;color:#1a1a2e}
  .je-pick-sub{font-size:11px;color:#94a3b8}

  .je-change-type{display:inline-flex;align-items:center;gap:3px;background:none;border:none;color:#64748b;font-size:12px;font-weight:600;cursor:pointer;padding:0;margin-bottom:12px}
  .je-change-type:hover{color:#2d9e8b}
  .je-simple-title{display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid #f1f5f9}
  .je-simple-warn{display:flex;gap:8px;align-items:flex-start;background:#fffbeb;border:1px solid #fde68a;color:#92400e;font-size:12px;line-height:1.5;padding:10px 12px;border-radius:8px;margin-bottom:14px}
  .je-simple-row{display:flex;gap:14px;margin-top:14px}
  .je-amount-wrap{display:flex;align-items:center;border:2px solid #e5e7eb;border-radius:10px;padding:4px 14px;background:#fff;transition:border-color .15s}
  .je-amount-wrap:focus-within{border-color:#2d9e8b}
  .je-amount-peso{font-size:24px;font-weight:700;color:#94a3b8;margin-right:6px}
  .je-amount-input{border:none;outline:none;font-size:28px;font-weight:700;color:#1a1a2e;width:100%;padding:6px 0;background:transparent}

  .je-accountant-peek{margin-top:16px;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:8px;padding:10px 14px}
  .je-peek-head{display:flex;align-items:center;gap:5px;font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#94a3b8;margin-bottom:6px}
  .je-peek-line{display:flex;align-items:center;font-size:12px;color:#475569;padding:2px 0}
  .je-peek-dr,.je-peek-cr{display:inline-block;width:22px;font-weight:700}
  .je-peek-dr{color:#2563eb}
  .je-peek-cr{color:#db2777;margin-left:16px}
  .je-peek-amt{margin-left:auto;font-family:ui-monospace,monospace;font-weight:600;color:#1a1a2e}

  /* ---- recurring entries ---- */
  .je-due-badge{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 4px;margin-left:6px;background:#ef4444;color:#fff;border-radius:8px;font-size:10px;font-weight:700}
  .je-due-banner{display:flex;justify-content:space-between;align-items:center;gap:12px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:10px 14px;margin-bottom:12px}
  .je-due-banner-l{display:flex;align-items:center;gap:8px;font-size:13px;color:#3730a3}
  .je-due-gen-btn{display:flex;align-items:center;gap:5px;background:#6366f1;color:#fff;border:none;border-radius:8px;padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer}
  .je-due-gen-btn:hover{background:#4f46e5}

  .je-rec-list{display:flex;flex-direction:column;gap:8px}
  .je-rec-card{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px}
  .je-rec-card-off{opacity:.65}
  .je-rec-main{display:flex;align-items:center;gap:12px;flex:1;min-width:0}
  .je-rec-ic{width:38px;height:38px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .je-rec-name{font-size:13px;font-weight:700;color:#1a1a2e;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .je-rec-sub{font-size:11px;color:#94a3b8;margin-top:2px}
  .je-rec-mid{text-align:right;margin-right:6px}
  .je-rec-amt{font-size:14px;font-weight:700;color:#1a1a2e}
  .je-rec-next{font-size:11px;color:#94a3b8;margin-top:2px}
  .je-rec-next-due{color:#6366f1;font-weight:600}
  .je-rec-actions{display:flex;gap:4px}
  .je-icon-act{background:#f8fafc;border:1px solid #e5e7eb;border-radius:7px;width:30px;height:30px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#64748b}
  .je-icon-act:hover{background:#f1f5f9;color:#2d9e8b;border-color:#cbd5e1}
  .je-icon-act-danger:hover{color:#ef4444;border-color:#fecaca;background:#fef2f2}
  .je-rec-sched{background:#f8fafc;border:1px solid #eef2f7;border-radius:10px;padding:12px 14px;margin-top:16px}
  .je-autopost{display:flex;align-items:center;gap:8px;font-size:12px;color:#475569;margin-top:14px;cursor:pointer}
  .je-autopost input{width:15px;height:15px;cursor:pointer}

  @media(max-width:900px){.je-grid{grid-template-columns:1fr}.je-simple-row{flex-direction:column;gap:12px}}
`;
