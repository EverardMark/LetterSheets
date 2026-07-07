import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { I } from "../../layouts/ERPLayout";
import "./sales.css";
import { api, peso, num, d10, ORDER_BADGE, Empty } from "./shared";
import Quotes from "./Quotes";
import Orders from "./Orders";
import Deliveries from "./Deliveries";
import PriceLists from "./PriceLists";
import CreditMemos from "./CreditMemos";
import Settings from "./Settings";

function getTab(pathname) {
    const map = {
        "/sales":             "overview",
        "/sales/quotes":      "quotes",
        "/sales/orders":      "orders",
        "/sales/deliveries":  "deliveries",
        "/sales/price-lists": "pricelists",
        "/sales/credit-memos":"creditmemos",
        "/sales/settings":    "settings",
    };
    return map[pathname] || "overview";
}

function SalesOverview({ nav }) {
    const [stats, setStats] = useState(null);
    const [orders, setOrders] = useState([]);
    const [backorders, setBackorders] = useState([]);

    useEffect(() => {
        (async () => {
            try { setStats(await api("get_so_stats")); } catch {}
            try { const d = await api("get_so_orders"); setOrders(Array.isArray(d) ? d : []); } catch {}
            try { const d = await api("get_so_backorders"); setBackorders(Array.isArray(d) ? d : []); } catch {}
        })();
    }, []);

    const cards = [
        { label: "Open Orders",       value: stats?.open_orders ?? 0,          icon: "cart",   color: "#2d9e8b" },
        { label: "Revenue This Month",value: peso(stats?.revenue_this_month),  icon: "peso",   color: "#0ea5e9" },
        { label: "Draft Quotes",      value: stats?.draft_quotes ?? 0,         icon: "file",   color: "#f59e0b" },
        { label: "Backorders",        value: stats?.backorders_pending ?? 0,   icon: "truck",  color: "#ef4444" },
    ];

    return (<>
        <div className="so-stats">
            {cards.map((c, i) => (
                <div key={i} className="so-st">
                    <div className="so-st-ic" style={{ background: c.color + "14", color: c.color }}><I name={c.icon} /></div>
                    <div className="so-st-v">{c.value}</div>
                    <div className="so-st-l">{c.label}</div>
                </div>
            ))}
        </div>

        <div className="so-grid2">
            <div className="so-card" style={{ marginBottom: 0 }}>
                <div className="so-card-h">
                    <h3 className="so-card-t">Recent Orders</h3>
                    <span className="so-card-lk" onClick={() => nav("/sales/orders")}>All orders →</span>
                </div>
                {orders.length > 0 ? (
                    <div className="so-tblwrap" style={{ border: "none" }}>
                        <table className="so-tbl">
                            <thead><tr><th>Order</th><th>Customer</th><th className="so-tbl-r">Total</th><th>Status</th></tr></thead>
                            <tbody>
                                {orders.slice(0, 6).map(o => (
                                    <tr key={o.id}>
                                        <td className="so-tbl-nm">#{o.order_number}</td>
                                        <td>{o.customer_name || "—"}</td>
                                        <td className="so-tbl-r so-tbl-mono">{peso(o.total_amount)}</td>
                                        <td><span className={`so-badge ${ORDER_BADGE[o.status] || "so-b-gray"}`}>{o.status}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : <Empty icon="cart" title="No orders yet" desc="Create a sales order to get started." action="New order" onAction={() => nav("/sales/orders")} />}
            </div>

            <div className="so-card" style={{ marginBottom: 0 }}>
                <div className="so-card-h">
                    <h3 className="so-card-t">Backorders</h3>
                    <span className="so-card-lk" style={{ color: "#aaa" }}>{backorders.length} line(s)</span>
                </div>
                {backorders.length > 0 ? (
                    <div className="so-tblwrap" style={{ border: "none" }}>
                        <table className="so-tbl">
                            <thead><tr><th>Order</th><th>Product</th><th className="so-tbl-r">Backordered</th></tr></thead>
                            <tbody>
                                {backorders.slice(0, 7).map((b, i) => (
                                    <tr key={i}>
                                        <td className="so-tbl-nm">#{b.order_number}</td>
                                        <td>{b.product_name || "—"}<div className="so-sku">{b.customer_name}</div></td>
                                        <td className="so-tbl-r so-tbl-mono" style={{ color: "#ef4444", fontWeight: 700 }}>{num(b.qty_backordered)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : <Empty icon="check" title="No backorders" desc="Everything confirmed is in stock or fulfilled." />}
            </div>
        </div>
    </>);
}

export default function SalesDashboard() {
    const location = useLocation();
    const navigate = useNavigate();
    const tab = getTab(location.pathname);

    return (
        <div>
            <div className="so-head">
                <div className="so-head-l">
                    <div className="so-head-ic"><I name="cart" size={24} /></div>
                    <div>
                        <h1 className="so-title">Sales</h1>
                        <p className="so-sub">Quotes, orders, fulfillment and invoicing</p>
                    </div>
                </div>
            </div>

            {tab === "overview"   && <SalesOverview nav={navigate} />}
            {tab === "quotes"     && <Quotes />}
            {tab === "orders"     && <Orders />}
            {tab === "deliveries" && <Deliveries />}
            {tab === "pricelists" && <PriceLists />}
            {tab === "creditmemos"&& <CreditMemos />}
            {tab === "settings"   && <Settings />}
        </div>
    );
}
