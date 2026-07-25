import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";
import Modal from "../components/Modal";
import { api, Empty, num, d10, RECEIPT_BADGE } from "./shared";
import { Term, SimpleHint, AdvancedOnly } from "../components/simplemode";

export default function Receipts() {
    const [rows, setRows] = useState([]);
    const [modal, setModal] = useState(null);
    const [msg, setMsg] = useState(null);

    const flash = (text, err = false) => { setMsg({ text, err }); setTimeout(() => setMsg(null), 4000); };
    const load = useCallback(async () => {
        try { const d = await api("get_pur_receipts", { order_id: "" }); setRows(Array.isArray(d) ? d : []); } catch { setRows([]); }
    }, []);
    useEffect(() => { load(); }, [load]);

    return (<>
        {msg && <div className={`pr-flash ${msg.err ? "pr-flash-err" : ""}`}>{msg.text}</div>}
        <SimpleHint icon="bulb">Record what actually arrived when a delivery comes in.</SimpleHint>
        <div className="pr-bar">
            <div className="pr-bar-l"><span className="pr-hint"><Term simple="Deliveries received across all purchase orders" advanced="Goods receipts across all purchase orders" /></span></div>
        </div>

        {rows.length === 0 ? (
            <Empty icon="truck" title={<Term simple="No received items yet" advanced="No goods receipts" />} desc={<Term simple="Record a delivery against an approved purchase order to see it here." advanced="Receive goods against an approved PO to see receipts here." />} />
        ) : (
            <div className="pr-tblwrap pr-tbl-click">
                <table className="pr-tbl">
                    <thead><tr><th><Term simple="Delivery" advanced="Receipt" /></th><th>PO</th><th>Warehouse</th><th>Date</th><th className="pr-tbl-r">Lines</th><AdvancedOnly><th>GL</th></AdvancedOnly><th>Status</th></tr></thead>
                    <tbody>
                        {rows.map(rc => (
                            <tr key={rc.id} onClick={() => setModal({ id: rc.id })}>
                                <td className="pr-tbl-nm">GR-{String(rc.receipt_number).padStart(4, "0")}</td>
                                <td>PO-{String(rc.po_number).padStart(4, "0")}</td>
                                <td>{rc.warehouse_name || "—"}</td>
                                <td className="pr-sku">{d10(rc.receipt_date)}</td>
                                <td className="pr-tbl-r pr-tbl-mono">{rc.item_count}</td>
                                <AdvancedOnly><td>{rc.journal_entry_id ? <span className="pr-badge pr-b-green">Posted</span> : <span className="pr-badge pr-b-gray">—</span>}</td></AdvancedOnly>
                                <td><span className={`pr-badge ${RECEIPT_BADGE[rc.status] || "pr-b-gray"}`}>{rc.status}</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
        {modal && <ReceiptModal receipt={rows.find(r => r.id === modal.id)} onClose={() => { setModal(null); load(); }} flash={flash} />}
    </>);
}

function ReceiptModal({ receipt, onClose, flash }) {
    const cancel = async () => {
        try { const r = await api("cancel_pur_receipt", { id: receipt.id }); flash(`Receipt reversed (${r?.reversed_lines ?? 0} line(s))`); onClose(); }
        catch (e) { flash(e.message, true); }
    };

    return (
        <Modal title={`GR-${String(receipt.receipt_number).padStart(4, "0")}`} subtitle={`PO-${String(receipt.po_number).padStart(4, "0")} · ${receipt.status}`} onClose={onClose}>
            <div className="pr-modal-scroll">
                <div className="pr-f" style={{ marginBottom: 4 }}>
                    <div className="pr-field"><label className="pr-label">Warehouse</label><div className="pr-ro">{receipt.warehouse_name || "—"}</div></div>
                    <div className="pr-field"><label className="pr-label"><Term simple="Date Received" advanced="Receipt Date" /></label><div className="pr-ro">{d10(receipt.receipt_date)}</div></div>
                    <div className="pr-field"><label className="pr-label">Lines</label><div className="pr-ro">{num(receipt.item_count)}</div></div>
                    <AdvancedOnly><div className="pr-field"><label className="pr-label">GL</label><div className="pr-ro">{receipt.journal_entry_id ? "Posted (Dr Inventory / Cr GR-IR)" : "Not posted"}</div></div></AdvancedOnly>
                </div>
                {receipt.notes && <div className="pr-hint" style={{ marginTop: 8 }}>{receipt.notes}</div>}
            </div>
            <div className="pr-modal-foot" style={{ justifyContent: "space-between" }}>
                <div>{receipt.status === "Received" && <button className="pr-btn-danger" onClick={cancel}><Term simple="Undo Delivery" advanced="Reverse Receipt" /></button>}</div>
                <button className="pr-btn-s" onClick={onClose}>Close</button>
            </div>
        </Modal>
    );
}
