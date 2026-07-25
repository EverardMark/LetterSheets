import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";
import Modal from "../components/Modal";
import { api, Empty, peso, thisPeriod } from "./shared";
import { Term, SimpleHint } from "../components/simplemode";
import { useIsSimple } from "../../utils/uimode";

export default function Depreciation() {
    const [runs, setRuns] = useState([]);
    const [runModal, setRunModal] = useState(false);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState(null);

    const flash = (text, err = false) => { setMsg({ text, err }); setTimeout(() => setMsg(null), 4000); };
    const load = useCallback(async () => {
        try { const d = await api("get_fa_runs"); setRuns(Array.isArray(d) ? d : []); } catch { setRuns([]); }
    }, []);
    useEffect(() => { load(); }, [load]);

    async function runPeriod(period) {
        setBusy(true);
        try {
            const r = await api("run_fa_depreciation", { period });
            if (r?.asset_count > 0) flash(`Depreciated ${r.asset_count} asset(s) for ${period} · ${peso(r.total_amount)}${r.gl_posted ? " (posted to GL)" : ""}`);
            else flash(`No eligible assets to depreciate for ${period}`);
            setRunModal(false); load();
        } catch (e) { flash(e.message, true); }
        setBusy(false);
    }
    async function voidRun(run) {
        if (!window.confirm(`Void the ${run.period} depreciation run? This reverses ${peso(run.total_amount)} from ${run.asset_count} asset(s).`)) return;
        try { await api("void_fa_run", { id: run.id, period: run.period }); flash(`Run ${run.period} voided`); load(); }
        catch (e) { flash(e.message, true); }
    }

    return (<>
        {msg && <div className={`fa-flash ${msg.err ? "fa-flash-err" : ""}`}>{msg.text}</div>}
        <SimpleHint icon="bulb">Assets lose value as they age. This tracks how much, automatically.</SimpleHint>
        <div className="fa-bar">
            <div className="fa-bar-l"><span style={{ fontSize: 13, color: "#888" }}><Term simple="Record how much value your assets lost this month" advanced="Post monthly depreciation for all active assets" /></span></div>
            <button className="fa-btn-p" onClick={() => setRunModal(true)}><I name="chart" size={13} /> <Term simple="Record Value Loss" advanced="Run Depreciation" /></button>
        </div>

        {runs.length === 0 ? (
            <Empty icon="chart" title={<Term simple="No value loss recorded yet" advanced="No depreciation runs" />} desc={<Term simple="Record value loss for a month to start building the history." advanced="Run depreciation for a period to build the schedule and post to the GL." />} action={<Term simple="Record value loss" advanced="Run depreciation" />} onAction={() => setRunModal(true)} />
        ) : (
            <div className="fa-tblwrap">
                <table className="fa-tbl">
                    <thead><tr><th>Period</th><th className="fa-tbl-r">Assets</th><th className="fa-tbl-r">Amount</th><th><Term simple="Recorded" advanced="GL" /></th><th>Status</th><th></th></tr></thead>
                    <tbody>
                        {runs.map(r => (
                            <tr key={r.id} style={{ opacity: r.is_voided ? 0.5 : 1 }}>
                                <td className="fa-tbl-nm">{r.period}</td>
                                <td className="fa-tbl-r fa-tbl-mono">{r.asset_count}</td>
                                <td className="fa-tbl-r fa-tbl-mono" style={{ fontWeight: 600, color: "#222" }}>{peso(r.total_amount)}</td>
                                <td>{r.journal_entry_id ? <span className="fa-badge fa-b-blue"><Term simple="Recorded" advanced="Posted" /></span> : <span className="fa-badge fa-b-gray">—</span>}</td>
                                <td>{r.is_voided ? <span className="fa-badge fa-b-red">Voided</span> : <span className="fa-badge fa-b-green">Active</span>}</td>
                                <td className="fa-tbl-r">{!r.is_voided && <button className="fa-btn-ghost" onClick={() => voidRun(r)}>Void</button>}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}

        {runModal && <RunModal busy={busy} onClose={() => setRunModal(false)} onRun={runPeriod} />}
    </>);
}

function RunModal({ busy, onClose, onRun }) {
    const simple = useIsSimple();
    const [period, setPeriod] = useState(thisPeriod());
    const valid = /^\d{4}-\d{2}$/.test(period);
    return (
        <Modal title={simple ? "Record Value Loss" : "Run Depreciation"} subtitle={simple ? "Records the value each asset lost this month" : "Posts one depreciation entry per eligible asset"} onClose={onClose}>
            <div className="fa-modal-scroll">
                <div className="fa-f">
                    <div className="fa-field fa-f-full">
                        <label className="fa-label"><Term simple="Month (YYYY-MM)" advanced="Period (YYYY-MM)" /> <span className="fa-req" /></label>
                        <input className="fa-input" value={period} onChange={e => setPeriod(e.target.value)} placeholder="2026-07" />
                        <span className="fa-hint"><Term simple="Doing this again is safe — assets already done are skipped." advanced="Re-running a period is safe — already-depreciated assets are skipped." /></span>
                    </div>
                </div>
            </div>
            <div className="fa-modal-foot">
                <button className="fa-btn-s" onClick={onClose}>Cancel</button>
                <button className="fa-btn-p" disabled={!valid || busy} onClick={() => onRun(period)}>{busy ? (simple ? "Recording…" : "Running…") : (simple ? "Record" : "Run")}</button>
            </div>
        </Modal>
    );
}
