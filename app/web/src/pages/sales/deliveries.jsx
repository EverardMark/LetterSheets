import { useState, useEffect, useCallback } from "react";
import { api, Empty, d10, today, SHIP_BADGE } from "./shared";

export default function Deliveries() {
    const [rows, setRows] = useState([]);
    const [msg, setMsg] = useState(null);

    const flash = (text, err = false) => { setMsg({ text, err }); setTimeout(() => setMsg(null), 4000); };
    const load = useCallback(async () => {
        try { const d = await api("get_so_shipments", { order_id: "" }); setRows(Array.isArray(d) ? d : []); } catch { setRows([]); }
    }, []);
    useEffect(() => { load(); }, [load]);

    const markDelivered = async (s) => {
        try { await api("mark_so_shipment_delivered", { id: s.id, delivered_date: today() }); flash(`Shipment #${s.shipment_number} delivered`); load(); }
        catch (e) { flash(e.message, true); }
    };
    const cancel = async (s) => {
        if (!window.confirm(`Cancel shipment #${s.shipment_number}? This returns the stock and reverses COGS.`)) return;
        try { const r = await api("cancel_so_shipment", { id: s.id }); flash(`Shipment cancelled (${r.reversed_lines} line(s) returned)`); load(); }
        catch (e) { flash(e.message, true); }
    };

    return (<>
        {msg && <div className={`so-flash ${msg.err ? "so-flash-err" : ""}`}>{msg.text}</div>}
        <div className="so-bar">
            <div className="so-bar-l"><span style={{ fontSize: 13, color: "#888" }}>{rows.length} shipment(s) · created from an order's detail</span></div>
        </div>
        {rows.length === 0 ? (
            <Empty icon="truck" title="No shipments" desc="Create a shipment from a confirmed order (Orders → open an order → Create Shipment)." />
        ) : (
            <div className="so-tblwrap">
                <table className="so-tbl">
                    <thead><tr><th>Shipment</th><th>Order</th><th>Warehouse</th><th>Carrier</th><th>Ship Date</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                        {rows.map(s => (
                            <tr key={s.id}>
                                <td className="so-tbl-nm">DN-{String(s.shipment_number).padStart(4, "0")}</td>
                                <td>SO-{String(s.order_number).padStart(4, "0")}</td>
                                <td>{s.warehouse_name || "—"}</td>
                                <td>{s.carrier || "—"}{s.tracking_number ? <div className="so-sku">{s.tracking_number}</div> : null}</td>
                                <td className="so-sku">{d10(s.ship_date)}</td>
                                <td><span className={`so-badge ${SHIP_BADGE[s.status] || "so-b-gray"}`}>{s.status}</span></td>
                                <td className="so-tbl-r">
                                    {s.status === "Shipped" && <>
                                        <button className="so-btn-ghost" style={{ color: "#0d9488" }} onClick={() => markDelivered(s)}>Delivered</button>
                                        <button className="so-btn-ghost" onClick={() => cancel(s)}>Cancel</button>
                                    </>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
    </>);
}
