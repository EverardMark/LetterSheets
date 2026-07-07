import { useState, useEffect, useCallback } from "react";
import { api, Empty, d10 } from "./shared";

export default function Transfers() {
    const [rows, setRows] = useState([]);
    const load = useCallback(async () => {
        try { const d = await api("get_fa_transfers"); setRows(Array.isArray(d) ? d : []); } catch { setRows([]); }
    }, []);
    useEffect(() => { load(); }, [load]);

    const loc = (dept, place) => [dept, place].filter(Boolean).join(" · ") || "—";

    return (<>
        <div className="fa-bar">
            <div className="fa-bar-l"><span style={{ fontSize: 13, color: "#888" }}>{rows.length} transfer{rows.length !== 1 ? "s" : ""} · move an asset from its detail view</span></div>
        </div>
        {rows.length === 0 ? (
            <Empty icon="truck" title="No transfers" desc="Transfer an asset between departments, locations or custodians from its detail view." />
        ) : (
            <div className="fa-tblwrap">
                <table className="fa-tbl">
                    <thead><tr><th>Asset</th><th>Date</th><th>From</th><th>To</th><th>New Custodian</th></tr></thead>
                    <tbody>
                        {rows.map(t => (
                            <tr key={t.id}>
                                <td><div className="fa-tbl-nm">{t.asset_name || "—"}</div><div className="fa-sku">{t.asset_number}</div></td>
                                <td className="fa-sku">{d10(t.transfer_date)}</td>
                                <td>{loc(t.from_department, t.from_location)}</td>
                                <td>{loc(t.to_department, t.to_location)}</td>
                                <td>{t.to_custodian_name || "—"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
    </>);
}
