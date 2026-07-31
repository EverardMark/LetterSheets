import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { I } from "../../layouts/ERPLayout";
import { getPermissions } from "../../utils/permissions";
import "./expenses.css";
import { api, asList, peso, fmtDate, Empty, StatusPill } from "./shared";
import ClaimsView from "./claims";
import CategoriesView from "./categories";
import ExpenseSettingsView from "./settings";

function getTab(pathname) {
    const map = {
        "/expenses": "overview",
        "/expenses/claims": "claims",
        "/expenses/categories": "categories",
        "/expenses/settings": "settings",
    };
    return map[pathname] || "overview";
}

export default function ExpensesDashboard() {
    const loc = useLocation();
    const nav = useNavigate();
    const tab = getTab(loc.pathname);

    return (
        <div style={{ padding: "22px 26px" }}>
            {tab === "overview" && <Overview nav={nav} />}
            {tab === "claims" && <ClaimsView />}
            {tab === "categories" && <CategoriesView />}
            {tab === "settings" && <ExpenseSettingsView />}
        </div>
    );
}

/* ================================================================
   OVERVIEW — the two numbers that matter to a finance lead: what is
   waiting on an approver, and what the company owes but hasn't paid.
================================================================ */
function Overview({ nav }) {
    const perms = getPermissions();
    const [stats, setStats] = useState(null);
    const [pending, setPending] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const [s, p] = await Promise.all([
                    api("get_exp_stats"),
                    api("get_exp_claims", { status: "Submitted", limit: 8 }),
                ]);
                setStats(s);
                setPending(asList(p, "claims"));
            } catch { setStats(null); }
            setLoading(false);
        })();
    }, []);

    if (loading) return null;
    if (!stats) return <Empty icon="receipt" title="Expenses overview unavailable" desc="Try reloading." />;

    const cards = [
        { label: "Awaiting approval", value: stats.pending_approval, sub: peso(stats.pending_amount), icon: "clock", color: "#0ea5e9" },
        { label: "Approved, unpaid", value: stats.awaiting_payment, sub: peso(stats.payable_amount), icon: "hand-coin", color: "#8b5cf6" },
        { label: "Paid this month", value: peso(stats.paid_this_month), sub: "reimbursed", icon: "check", color: "#22c55e" },
        { label: "All claims", value: stats.total_claims, sub: "all time", icon: "receipt", color: "#f59e0b" },
    ];

    return (<>
        <div className="ex-stats" data-tour="exp-stats">
            {cards.map((c, i) => (
                <div key={i} className="ex-st">
                    <div className="ex-st-ic" style={{ background: c.color + "18", color: c.color }}><I name={c.icon} size={17}/></div>
                    <div className="ex-st-v">{c.value}</div>
                    <div className="ex-st-l">{c.label} · {c.sub}</div>
                </div>
            ))}
        </div>

        <div className="ex-card" data-tour="exp-pending">
            <div className="ex-card-h">
                <h3 className="ex-card-t">Waiting on an approver</h3>
                <span className="ex-card-lk" onClick={() => nav("/expenses/claims")}>All claims →</span>
            </div>
            {pending.length === 0 ? (
                <Empty icon="check" title="Nothing pending" desc="Every submitted claim has been decided."/>
            ) : (
                <table className="ex-tbl">
                    <thead>
                    <tr><th>#</th><th>Employee</th><th>Title</th><th>Filed</th><th className="ex-r">Amount</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                    {pending.map(c => (
                        <tr key={c.id} className="ex-click" onClick={() => nav("/expenses/claims")}>
                            <td className="ex-m ex-num">{c.claim_number}</td>
                            <td>{c.employee_name?.trim() || "—"}</td>
                            <td className="ex-b">{c.title}</td>
                            <td className="ex-m">{fmtDate(c.claim_date)}</td>
                            <td className="ex-r ex-b ex-num">{peso(c.total_amount)}</td>
                            <td><StatusPill status={c.status}/></td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            )}
        </div>

        {perms.can("expenses", "edit") && (
            <div className="ex-info">
                Claims can only be approved once <b>Settings</b> names the employee reimbursements payable account,
                and only filed once <b>Categories</b> exist and are mapped to expense accounts.
            </div>
        )}
    </>);
}
