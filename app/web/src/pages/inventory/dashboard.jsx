import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { I } from "../../layouts/ERPLayout";
import { Term, SimpleHint } from "../components/simplemode";
import "./inv.css";
import { api, peso, num, d10, MOVE_META, Empty } from "./shared";
import Products from "./Products";
import Categories from "./Categories";
import Warehouses from "./Warehouses";
import Movements from "./Movements";
import PurchaseOrders from "./PurchaseOrders";
import Suppliers from "./Suppliers";
import Settings from "./Settings";

function getTab(pathname) {
    const map = {
        "/inventory":            "overview",
        "/inventory/products":   "products",
        "/inventory/categories": "categories",
        "/inventory/warehouses": "warehouses",
        "/inventory/movements":  "movements",
        "/inventory/purchases":  "purchases",
        "/inventory/suppliers":  "suppliers",
        "/inventory/settings":   "settings",
    };
    return map[pathname] || "overview";
}

/* ================================================================
   OVERVIEW
================================================================ */
function InventoryOverview({ nav }) {
    const [stats, setStats] = useState(null);
    const [low, setLow] = useState([]);
    const [moves, setMoves] = useState([]);
    const [warehouses, setWarehouses] = useState([]);

    useEffect(() => {
        (async () => {
            try { setStats(await api("get_inv_stats")); } catch {}
            try { const d = await api("get_inv_low_stock"); setLow(Array.isArray(d) ? d : []); } catch {}
            try { const d = await api("get_inv_movements", { limit: 8 }); setMoves(Array.isArray(d) ? d : []); } catch {}
            try { const d = await api("get_inv_warehouses"); setWarehouses(Array.isArray(d) ? d : []); } catch {}
        })();
    }, []);

    const cards = [
        { label: "Products",     value: stats?.total_products ?? 0,           icon: "box",      color: "#2d9e8b" },
        { label: "Stock Value",  value: peso(stats?.stock_value),             icon: "peso",     color: "#0ea5e9" },
        { label: "Low Stock",    value: stats?.low_stock ?? 0,                icon: "chart",    color: "#f59e0b" },
        { label: "Out of Stock", value: stats?.out_of_stock ?? 0,             icon: "minus",    color: "#ef4444" },
    ];

    return (<>
        <SimpleHint icon="bulb">A snapshot of what you have in stock and what's running low.</SimpleHint>
        <div className="iv-stats">
            {cards.map((c, i) => (
                <div key={i} className="iv-st">
                    <div className="iv-st-ic" style={{ background: c.color + "14", color: c.color }}><I name={c.icon} /></div>
                    <div className="iv-st-v">{c.value}</div>
                    <div className="iv-st-l">{c.label}</div>
                </div>
            ))}
        </div>

        <div className="iv-grid2">
            {/* Reorder alerts */}
            <div className="iv-card" style={{ marginBottom: 0 }}>
                <div className="iv-card-h">
                    <h3 className="iv-card-t"><Term simple="Low-stock alerts" advanced="Reorder Alerts"/></h3>
                    <span className="iv-card-lk" onClick={() => nav("/inventory/products")}>All products →</span>
                </div>
                {low.length > 0 ? (
                    <div className="iv-tblwrap" style={{ border: "none" }}>
                        <table className="iv-tbl">
                            <thead><tr><th>Product</th><th className="iv-tbl-r">In stock</th><th className="iv-tbl-r"><Term simple="Low-stock at" advanced="Reorder"/></th></tr></thead>
                            <tbody>
                                {low.slice(0, 6).map((p) => (
                                    <tr key={p.id}>
                                        <td><div className="iv-tbl-nm">{p.name}</div><div className="iv-sku">{p.sku}</div></td>
                                        <td className="iv-tbl-r iv-tbl-mono" style={{ color: p.total_stock <= 0 ? "#ef4444" : "#d97706", fontWeight: 700 }}>{num(p.total_stock)} {p.unit}</td>
                                        <td className="iv-tbl-r iv-tbl-mono">{num(p.reorder_point)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : <Empty icon="check" title="Stock levels healthy" desc={<Term simple="Nothing needs restocking right now." advanced="No products are below their reorder point."/>} />}
            </div>

            {/* Recent movements */}
            <div className="iv-card" style={{ marginBottom: 0 }}>
                <div className="iv-card-h">
                    <h3 className="iv-card-t"><Term simple={"Recent Stock In & Out"} advanced="Recent Movements"/></h3>
                    <span className="iv-card-lk" onClick={() => nav("/inventory/movements")}>View all →</span>
                </div>
                {moves.length > 0 ? (
                    <div className="iv-tblwrap" style={{ border: "none" }}>
                        <table className="iv-tbl">
                            <thead><tr><th>Product</th><th>Type</th><th className="iv-tbl-r">Qty</th></tr></thead>
                            <tbody>
                                {moves.slice(0, 6).map((m) => {
                                    const meta = MOVE_META[m.movement_type] || { label: m.movement_type, badge: "iv-b-gray" };
                                    return (
                                        <tr key={m.id}>
                                            <td><div className="iv-tbl-nm">{m.product_name || "—"}</div><div className="iv-sku">{d10(m.created_at)}</div></td>
                                            <td><span className={`iv-badge ${meta.badge}`}>{meta.label}</span></td>
                                            <td className="iv-tbl-r iv-tbl-mono">{num(m.quantity)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : <Empty icon="scroll" title={<Term simple="Nothing in or out yet" advanced="No movements yet"/>} desc="Stock-ins, stock-outs and adjustments show here." />}
            </div>
        </div>

        {/* Warehouses */}
        <div className="iv-card" style={{ marginTop: 16 }}>
            <div className="iv-card-h">
                <h3 className="iv-card-t"><Term simple="Storage Locations" advanced="Warehouses"/></h3>
                <span className="iv-card-lk" onClick={() => nav("/inventory/warehouses")}>Manage →</span>
            </div>
            {warehouses.length > 0 ? (
                <div className="iv-tblwrap" style={{ border: "none" }}>
                    <table className="iv-tbl">
                        <thead><tr><th><Term simple="Storage Location" advanced="Warehouse"/></th><th>Location</th><th className="iv-tbl-r">Units</th><th className="iv-tbl-r">Value</th></tr></thead>
                        <tbody>
                            {warehouses.map((w) => (
                                <tr key={w.id}>
                                    <td><span className="iv-tbl-nm">{w.name}</span>{w.is_default ? <span className="iv-badge iv-b-green" style={{ marginLeft: 8 }}>Default</span> : null}</td>
                                    <td>{w.location || "—"}</td>
                                    <td className="iv-tbl-r iv-tbl-mono">{num(w.total_units)}</td>
                                    <td className="iv-tbl-r iv-tbl-mono" style={{ fontWeight: 600, color: "#222" }}>{peso(w.stock_value)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : <Empty icon="building" title={<Term simple="No storage locations" advanced="No warehouses"/>} desc={<Term simple="Add a place to keep stock and start tracking it." advanced="Add a warehouse to start tracking stock by location."/>} action={<Term simple="Add storage location" advanced="Add warehouse"/>} onAction={() => nav("/inventory/warehouses")} />}
        </div>
    </>);
}

/* ================================================================
   MODULE ROOT
================================================================ */
export default function InventoryDashboard() {
    const location = useLocation();
    const navigate = useNavigate();
    const tab = getTab(location.pathname);

    return (
        <div>
            <div className="iv-head">
                <div className="iv-head-l">
                    <div className="iv-head-ic"><I name="box" size={24} /></div>
                    <div>
                        <h1 className="iv-title">Inventory</h1>
                        <p className="iv-sub"><Term simple="What you have in stock, where it's stored, and what to reorder" advanced="Products, stock levels, warehouses and procurement"/></p>
                    </div>
                </div>
            </div>

            {tab === "overview"   && <InventoryOverview nav={navigate} />}
            {tab === "products"   && <Products />}
            {tab === "categories" && <Categories />}
            {tab === "warehouses" && <Warehouses />}
            {tab === "movements"  && <Movements />}
            {tab === "purchases"  && <PurchaseOrders />}
            {tab === "suppliers"  && <Suppliers />}
            {tab === "settings"   && <Settings />}
        </div>
    );
}
