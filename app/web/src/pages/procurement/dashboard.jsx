import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { I } from "../../layouts/ERPLayout";
import "./proc.css";
import { api, peso, num, d10, PO_BADGE, Empty } from "./shared";
import { Term, SimpleHint } from "../components/simplemode";
import Requisitions from "./Requisitions";
import Orders from "./Orders";
import Receipts from "./Receipts";
import DebitMemos from "./DebitMemos";
import Settings from "./Settings";

function getTab(pathname) {
    const map = {
        "/procurement":              "overview",
        "/procurement/requisitions": "requisitions",
        "/procurement/orders":       "orders",
        "/procurement/receipts":     "receipts",
        "/procurement/debit-memos":  "debitmemos",
        "/procurement/settings":     "settings",
    };
    return map[pathname] || "overview";
}

function ProcurementOverview({ nav }) {
    const [stats, setStats] = useState(null);
    const [orders, setOrders] = useState([]);

    useEffect(() => {
        (async () => {
            try { setStats(await api("get_pur_stats")); } catch {}
            try { const d = await api("get_pur_orders"); setOrders(Array.isArray(d) ? d : []); } catch {}
        })();
    }, []);

    const cards = [
        { label: "Open POs",          value: stats?.open_orders ?? 0,        icon: "cart",   color: "#2d9e8b" },
        { label: "Open PO Value",     value: peso(stats?.open_po_value),     icon: "peso",   color: "#0ea5e9" },
        { label: <Term simple="Awaiting Delivery" advanced="Awaiting Receipt" />,  value: stats?.awaiting_receipt ?? 0,   icon: "truck",  color: "#f59e0b" },
        { label: "Awaiting Bill",     value: stats?.awaiting_bill ?? 0,      icon: "file",   color: "#8b5cf6" },
    ];

    const pending = orders.filter(o => o.status === "Draft" || o.status === "PartiallyReceived" || o.status === "Approved");

    return (<>
        <SimpleHint icon="bulb">Buying things for the business — from a request, to a purchase order, to receiving the goods.</SimpleHint>
        <div className="pr-stats" data-tour="proc-stats">
            {cards.map((c, i) => (
                <div key={i} className="pr-st">
                    <div className="pr-st-ic" style={{ background: c.color + "14", color: c.color }}><I name={c.icon} /></div>
                    <div className="pr-st-v">{c.value}</div>
                    <div className="pr-st-l">{c.label}</div>
                </div>
            ))}
        </div>

        <div className="pr-grid2" data-tour="proc-grid">
            <div className="pr-card" style={{ marginBottom: 0 }}>
                <div className="pr-card-h">
                    <h3 className="pr-card-t">Recent Purchase Orders</h3>
                    <span className="pr-card-lk" onClick={() => nav("/procurement/orders")}>All POs →</span>
                </div>
                {orders.length > 0 ? (
                    <div className="pr-tblwrap" style={{ border: "none" }}>
                        <table className="pr-tbl">
                            <thead><tr><th>PO</th><th><Term simple="Supplier" advanced="Vendor" /></th><th className="pr-tbl-r">Total</th><th>Status</th></tr></thead>
                            <tbody>
                                {orders.slice(0, 6).map(o => (
                                    <tr key={o.id}>
                                        <td className="pr-tbl-nm">PO-{String(o.po_number).padStart(4, "0")}</td>
                                        <td>{o.vendor_name || "—"}</td>
                                        <td className="pr-tbl-r pr-tbl-mono">{peso(o.total_amount)}</td>
                                        <td><span className={`pr-badge ${PO_BADGE[o.status] || "pr-b-gray"}`}>{o.status}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : <Empty icon="cart" title="No purchase orders yet" desc={<Term simple="Create a purchase request or a purchase order to get started." advanced="Raise a requisition or create a PO to get started." />} action="New PO" onAction={() => nav("/procurement/orders")} />}
            </div>

            <div className="pr-card" style={{ marginBottom: 0 }}>
                <div className="pr-card-h">
                    <h3 className="pr-card-t">Needs Action</h3>
                    <span className="pr-card-lk" style={{ color: "#aaa" }}>{pending.length} PO(s)</span>
                </div>
                {pending.length > 0 ? (
                    <div className="pr-tblwrap" style={{ border: "none" }}>
                        <table className="pr-tbl">
                            <thead><tr><th>PO</th><th><Term simple="Supplier" advanced="Vendor" /></th><th className="pr-tbl-r">Next step</th></tr></thead>
                            <tbody>
                                {pending.slice(0, 7).map(o => (
                                    <tr key={o.id}>
                                        <td className="pr-tbl-nm">PO-{String(o.po_number).padStart(4, "0")}</td>
                                        <td>{o.vendor_name || "—"}<div className="pr-sku">{d10(o.order_date)}</div></td>
                                        <td className="pr-tbl-r" style={{ fontSize: 12, color: "#6b7280" }}>
                                            {o.status === "Draft" ? "Approve" : o.status === "Approved" ? "Receive goods" : "Receive / bill"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : <Empty icon="check" title="Nothing pending" desc="All purchase orders are received and billed." />}
            </div>
        </div>
    </>);
}

export default function ProcurementDashboard() {
    const location = useLocation();
    const navigate = useNavigate();
    const tab = getTab(location.pathname);

    return (
        <div>
            <div className="pr-head">
                <div className="pr-head-l">
                    <div className="pr-head-ic"><I name="cart" size={24} /></div>
                    <div>
                        <h1 className="pr-title">Procurement</h1>
                        <p className="pr-sub"><Term simple="Purchase requests, purchase orders, received items and supplier bills" advanced="Requisitions, purchase orders, goods receipt and vendor bills" /></p>
                    </div>
                </div>
            </div>

            {tab === "overview"     && <ProcurementOverview nav={navigate} />}
            {tab === "requisitions" && <Requisitions />}
            {tab === "orders"       && <Orders />}
            {tab === "receipts"     && <Receipts />}
            {tab === "debitmemos"   && <DebitMemos />}
            {tab === "settings"     && <Settings />}
        </div>
    );
}
