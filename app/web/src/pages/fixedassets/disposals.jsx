import { useState, useEffect, useCallback } from "react";
import { api, Empty, peso, d10 } from "./shared";
import { Term, SimpleHint } from "../components/simplemode";
import { useIsSimple } from "../../utils/uimode";

export default function Disposals() {
    const simple = useIsSimple();
    const [rows, setRows] = useState([]);
    const load = useCallback(async () => {
        try { const d = await api("get_fa_disposals"); setRows(Array.isArray(d) ? d : []); } catch { setRows([]); }
    }, []);
    useEffect(() => { load(); }, [load]);

    return (<>
        <SimpleHint icon="bulb">When you sell or throw away an asset, record it here.</SimpleHint>
        <div className="fa-bar">
            <div className="fa-bar-l"><span style={{ fontSize: 13, color: "#888" }}>{simple ? `${rows.length} sold or scrapped` : `${rows.length} disposal${rows.length !== 1 ? "s" : ""}`} · <Term simple="sell or scrap an item from its detail view" advanced="create from an asset's detail view" /></span></div>
        </div>
        {rows.length === 0 ? (
            <Empty icon="minus" title={<Term simple="Nothing sold or scrapped yet" advanced="No disposals" />} desc={<Term simple="Sell or scrap an item from its detail view (Assets tab)." advanced="Dispose or scrap an asset from its detail view (Assets tab)." />} />
        ) : (
            <div className="fa-tblwrap">
                <table className="fa-tbl">
                    <thead><tr><th>Asset</th><th>Date</th><th>Type</th><th className="fa-tbl-r">Proceeds</th><th className="fa-tbl-r">Book Value</th><th className="fa-tbl-r">Gain / Loss</th><th><Term simple="Recorded" advanced="GL" /></th></tr></thead>
                    <tbody>
                        {rows.map(d => (
                            <tr key={d.id}>
                                <td><div className="fa-tbl-nm">{d.asset_name || "—"}</div><div className="fa-sku">{d.asset_number}</div></td>
                                <td className="fa-sku">{d10(d.disposal_date)}</td>
                                <td><span className={`fa-badge ${d.disposal_type === "scrap" ? "fa-b-red" : "fa-b-gray"}`}>{d.disposal_type}</span></td>
                                <td className="fa-tbl-r fa-tbl-mono">{peso(d.proceeds)}</td>
                                <td className="fa-tbl-r fa-tbl-mono">{peso(d.book_value)}</td>
                                <td className="fa-tbl-r fa-tbl-mono" style={{ fontWeight: 700, color: d.gain_loss >= 0 ? "#0d9488" : "#ef4444" }}>{d.gain_loss >= 0 ? "+" : ""}{peso(d.gain_loss)}</td>
                                <td>{d.journal_entry_id ? <span className="fa-badge fa-b-blue"><Term simple="Recorded" advanced="Posted" /></span> : <span className="fa-badge fa-b-gray">—</span>}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
    </>);
}
