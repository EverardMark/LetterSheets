import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { I } from "../../layouts/ERPLayout";
import "./fa.css";
import { api, peso, num, d10, STATUS_BADGE, Empty } from "./shared";
import { Term, SimpleHint } from "../components/simplemode";
import Assets from "./Assets";
import Categories from "./Categories";
import Depreciation from "./Depreciation";
import Disposals from "./Disposals";
import Maintenance from "./Maintenance";
import Transfers from "./Transfers";
import Settings from "./Settings";

function getTab(pathname) {
    const map = {
        "/fixed-assets":              "overview",
        "/fixed-assets/assets":       "assets",
        "/fixed-assets/categories":   "categories",
        "/fixed-assets/depreciation": "depreciation",
        "/fixed-assets/disposals":    "disposals",
        "/fixed-assets/maintenance":  "maintenance",
        "/fixed-assets/transfers":    "transfers",
        "/fixed-assets/settings":     "settings",
    };
    return map[pathname] || "overview";
}

/* ================================================================
   OVERVIEW
================================================================ */
function FixedAssetsOverview({ nav }) {
    const [stats, setStats] = useState(null);
    const [runs, setRuns] = useState([]);
    const [assets, setAssets] = useState([]);

    useEffect(() => {
        (async () => {
            try { setStats(await api("get_fa_stats")); } catch {}
            try { const d = await api("get_fa_runs"); setRuns(Array.isArray(d) ? d : []); } catch {}
            try { const d = await api("get_fa_assets"); setAssets(Array.isArray(d) ? d : []); } catch {}
        })();
    }, []);

    const cards = [
        { label: <Term simple="Things you own" advanced="Total Assets" />,       value: stats?.total_assets ?? 0,         icon: "box",    color: "#2d9e8b" },
        { label: <Term simple="Current value" advanced="Net Book Value" />,       value: peso(stats?.net_book_value),      icon: "peso",   color: "#0ea5e9" },
        { label: <Term simple="Value lost this year" advanced="YTD Depreciation" />, value: peso(stats?.ytd_depreciation), icon: "chart",  color: "#f59e0b" },
        { label: "Maintenance Due",  value: stats?.maintenance_due ?? 0,      icon: "scroll", color: "#ef4444" },
    ];

    // Assets grouped by status
    const byStatus = {};
    assets.forEach(a => { byStatus[a.status] = (byStatus[a.status] || 0) + 1; });

    return (<>
        <SimpleHint icon="bulb">Your big things of value — equipment, vehicles, furniture — and how their value drops over time.</SimpleHint>
        <div className="fa-stats">
            {cards.map((c, i) => (
                <div key={i} className="fa-st">
                    <div className="fa-st-ic" style={{ background: c.color + "14", color: c.color }}><I name={c.icon} /></div>
                    <div className="fa-st-v">{c.value}</div>
                    <div className="fa-st-l">{c.label}</div>
                </div>
            ))}
        </div>

        <div className="fa-grid2">
            {/* Recent depreciation runs */}
            <div className="fa-card" style={{ marginBottom: 0 }}>
                <div className="fa-card-h">
                    <h3 className="fa-card-t"><Term simple="Value loss over time" advanced="Depreciation Runs" /></h3>
                    <span className="fa-card-lk" onClick={() => nav("/fixed-assets/depreciation")}>Manage →</span>
                </div>
                {runs.length > 0 ? (
                    <div className="fa-tblwrap" style={{ border: "none" }}>
                        <table className="fa-tbl">
                            <thead><tr><th>Period</th><th className="fa-tbl-r">Assets</th><th className="fa-tbl-r">Amount</th><th><Term simple="Recorded" advanced="GL" /></th></tr></thead>
                            <tbody>
                                {runs.slice(0, 6).map(r => (
                                    <tr key={r.id} style={{ opacity: r.is_voided ? 0.5 : 1 }}>
                                        <td className="fa-tbl-nm">{r.period}{r.is_voided ? " (voided)" : ""}</td>
                                        <td className="fa-tbl-r fa-tbl-mono">{r.asset_count}</td>
                                        <td className="fa-tbl-r fa-tbl-mono">{peso(r.total_amount)}</td>
                                        <td>{r.journal_entry_id ? <span className="fa-badge fa-b-blue"><Term simple="Recorded" advanced="Posted" /></span> : <span className="fa-badge fa-b-gray">—</span>}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : <Empty icon="chart" title={<Term simple="No value loss yet" advanced="No depreciation yet" />} desc={<Term simple="Record value loss each month to build the history." advanced="Run a monthly depreciation to build the schedule." />} />}
            </div>

            {/* Assets by status */}
            <div className="fa-card" style={{ marginBottom: 0 }}>
                <div className="fa-card-h">
                    <h3 className="fa-card-t"><Term simple="Asset list" advanced="Register" /></h3>
                    <span className="fa-card-lk" onClick={() => nav("/fixed-assets/assets")}>All assets →</span>
                </div>
                {assets.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {Object.entries(byStatus).map(([s, n]) => (
                            <div key={s} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f6f6f6" }}>
                                <span className={`fa-badge ${STATUS_BADGE[s] || "fa-b-gray"}`}>{s}</span>
                                <span className="fa-tbl-mono" style={{ fontWeight: 700, color: "#222" }}>{n}</span>
                            </div>
                        ))}
                        <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 6, fontSize: 13 }}>
                            <span style={{ color: "#888" }}>Total cost</span>
                            <span className="fa-tbl-mono" style={{ fontWeight: 700 }}>{peso(stats?.total_cost)}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                            <span style={{ color: "#888" }}><Term simple="Value lost so far" advanced="Accumulated depreciation" /></span>
                            <span className="fa-tbl-mono" style={{ fontWeight: 700, color: "#d97706" }}>{peso(stats?.total_accumulated_depreciation)}</span>
                        </div>
                    </div>
                ) : <Empty icon="box" title="No assets yet" desc={<Term simple="Add your first asset to your list." advanced="Add your first asset to the register." />} action="Add asset" onAction={() => nav("/fixed-assets/assets")} />}
            </div>
        </div>
    </>);
}

/* ================================================================
   MODULE ROOT
================================================================ */
export default function FixedAssetsDashboard() {
    const location = useLocation();
    const navigate = useNavigate();
    const tab = getTab(location.pathname);

    return (
        <div>
            <div className="fa-head">
                <div className="fa-head-l">
                    <div className="fa-head-ic"><I name="box" size={24} /></div>
                    <div>
                        <h1 className="fa-title">Fixed Assets</h1>
                        <p className="fa-sub"><Term simple="What you own, and how its value changes over time" advanced="Register, depreciation, disposal and lifecycle tracking" /></p>
                    </div>
                </div>
            </div>

            {tab === "overview"     && <FixedAssetsOverview nav={navigate} />}
            {tab === "assets"       && <Assets />}
            {tab === "categories"   && <Categories />}
            {tab === "depreciation" && <Depreciation />}
            {tab === "disposals"    && <Disposals />}
            {tab === "maintenance"  && <Maintenance />}
            {tab === "transfers"    && <Transfers />}
            {tab === "settings"     && <Settings />}
        </div>
    );
}
