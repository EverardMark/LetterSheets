import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";
import Modal from "../components/Modal";
import { api, Empty, peso, num, d10, STATUS_BADGE, METHODS, methodLabel } from "./shared";
import { Term, SimpleHint } from "../components/simplemode";
import { useIsSimple } from "../../utils/uimode";

const empName = (e) => e.name || `${e.first_name || ""} ${e.last_name || ""}`.trim();

export default function Assets() {
    const [rows, setRows] = useState([]);
    const [categories, setCategories] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [form, setForm] = useState(null);    // add/edit form modal
    const [detail, setDetail] = useState(null); // asset id for detail modal
    const [msg, setMsg] = useState(null);

    const flash = (text, err = false) => { setMsg({ text, err }); setTimeout(() => setMsg(null), 3500); };

    const load = useCallback(async () => {
        try { const d = await api("get_fa_assets", { status: statusFilter }); setRows(Array.isArray(d) ? d : []); } catch { setRows([]); }
    }, [statusFilter]);
    const loadRefs = useCallback(async () => {
        try { const d = await api("get_fa_categories"); setCategories(Array.isArray(d) ? d : []); } catch {}
        try { const d = await api("get_employees"); const e = d?.employees || d || []; setEmployees(Array.isArray(e) ? e : []); } catch {}
    }, []);
    useEffect(() => { load(); }, [load]);
    useEffect(() => { loadRefs(); }, [loadRefs]);

    const filtered = rows.filter(a => !search || (a.name || "").toLowerCase().includes(search.toLowerCase()) || (a.asset_number || "").toLowerCase().includes(search.toLowerCase()));

    async function save(f) {
        const body = {
            name: f.name, description: f.description, category_id: f.category_id || "",
            acquisition_cost: Number(f.acquisition_cost) || 0, acquisition_date: f.acquisition_date,
            in_service_date: f.in_service_date || "", useful_life_months: Number(f.useful_life_months) || 0,
            salvage_value: Number(f.salvage_value) || 0, depreciation_method: f.depreciation_method || "straight_line",
            department: f.department || "", location: f.location || "", custodian_id: f.custodian_id || "", serial_number: f.serial_number || "",
        };
        try {
            if (f.id) await api("update_fa_asset", { id: f.id, ...body });
            else { const r = await api("create_fa_asset", body); if (r?.gl_posted) flash("Asset added — acquisition posted to GL"); else flash("Asset added"); }
            if (f.id) flash("Asset saved");
            setForm(null); load();
        } catch (e) { flash(e.message, true); }
    }
    async function remove(id) {
        try { await api("delete_fa_asset", { id }); setDetail(null); flash("Asset deleted"); load(); }
        catch (e) { flash(e.message, true); }
    }

    return (<>
        {msg && <div className={`fa-flash ${msg.err ? "fa-flash-err" : ""}`}>{msg.text}</div>}
        <SimpleHint icon="bulb">The big things your business owns — equipment, vehicles, furniture. Add each one to track its value over time.</SimpleHint>
        <div className="fa-bar">
            <div className="fa-bar-l">
                <div className="fa-search"><I name="search" size={14} /><input placeholder="Search name or asset #..." value={search} onChange={e => setSearch(e.target.value)} /></div>
                <select className="fa-sel" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="">All statuses</option>
                    {["Active", "Fully Depreciated", "Disposed", "Scrapped"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>
            <button className="fa-btn-p" onClick={() => setForm({ depreciation_method: "straight_line", acquisition_date: new Date().toISOString().slice(0, 10) })}><I name="box" size={13} /> Add Asset</button>
        </div>

        {filtered.length === 0 ? (
            <Empty icon="box" title={search || statusFilter ? "No matches" : "No assets"} desc={search || statusFilter ? "Try adjusting filters." : <Term simple="Add your first item so we can track its value." advanced="Add your first fixed asset to the register." />} action={search || statusFilter ? null : "Add asset"} onAction={() => setForm({ depreciation_method: "straight_line", acquisition_date: new Date().toISOString().slice(0, 10) })} />
        ) : (
            <div className="fa-tblwrap fa-tbl-click">
                <table className="fa-tbl">
                    <thead><tr><th>Asset</th><th>Category</th><th className="fa-tbl-r">Cost</th><th className="fa-tbl-r">Accum. Dep.</th><th className="fa-tbl-r">Book Value</th><th>Status</th></tr></thead>
                    <tbody>
                        {filtered.map(a => (
                            <tr key={a.id} onClick={() => setDetail(a.id)}>
                                <td><div className="fa-tbl-nm">{a.name}</div><div className="fa-sku">{a.asset_number}</div></td>
                                <td>{a.category_name || "—"}</td>
                                <td className="fa-tbl-r fa-tbl-mono">{peso(a.acquisition_cost)}</td>
                                <td className="fa-tbl-r fa-tbl-mono" style={{ color: "#d97706" }}>{peso(a.accumulated_depreciation)}</td>
                                <td className="fa-tbl-r fa-tbl-mono" style={{ fontWeight: 700, color: "#222" }}>{peso(a.net_book_value)}</td>
                                <td><span className={`fa-badge ${STATUS_BADGE[a.status] || "fa-b-gray"}`}>{a.status}</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}

        {form && <AssetForm data={form} categories={categories} employees={employees} onClose={() => setForm(null)} onSave={save} />}
        {detail && <AssetDetail id={detail} employees={employees} onClose={() => { setDetail(null); load(); }} onEdit={(a) => { setDetail(null); setForm(a); }} onDelete={remove} flash={flash} />}
    </>);
}

/* ---------------- Add / edit form ---------------- */
function AssetForm({ data, categories, employees, onClose, onSave }) {
    const simple = useIsSimple();
    const [f, setF] = useState({ ...data });
    const set = (k, v) => setF(p => ({ ...p, [k]: v }));
    const isEdit = !!f.id;
    const depreciable = (Number(f.acquisition_cost) || 0) - (Number(f.salvage_value) || 0);

    return (
        <Modal title={isEdit ? f.name || "Edit Asset" : "Add Asset"} subtitle={isEdit ? f.asset_number : (simple ? "New item you own" : "New fixed asset")} onClose={onClose}>
            <div className="fa-modal-scroll">
                <div className="fa-f">
                    <div className="fa-field fa-f-full">
                        <label className="fa-label">Asset Name <span className="fa-req" /></label>
                        <input className="fa-input" value={f.name || ""} onChange={e => set("name", e.target.value)} placeholder="e.g. Delivery Truck #2" />
                    </div>
                    <div className="fa-field">
                        <label className="fa-label">Category</label>
                        <select className="fa-fsel" value={f.category_id || ""} onChange={e => set("category_id", e.target.value)}>
                            <option value="">— None —</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div className="fa-field">
                        <label className="fa-label"><Term simple="How it loses value" advanced="Depreciation Method" /></label>
                        <select className="fa-fsel" value={f.depreciation_method || "straight_line"} onChange={e => set("depreciation_method", e.target.value)}>
                            {METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                        {simple && <span className="fa-hint">Straight-line spreads the loss evenly over the years — a safe pick if you're unsure.</span>}
                    </div>
                    <div className="fa-field">
                        <label className="fa-label"><Term simple="Purchase price (₱)" advanced="Acquisition Cost (₱)" /> <span className="fa-req" /></label>
                        <input className="fa-input" type="number" min="0" step="0.01" value={f.acquisition_cost ?? ""} onChange={e => set("acquisition_cost", e.target.value)} placeholder="0.00" />
                    </div>
                    <div className="fa-field">
                        <label className="fa-label"><Term simple="Leftover value (₱)" advanced="Salvage Value (₱)" /></label>
                        <input className="fa-input" type="number" min="0" step="0.01" value={f.salvage_value ?? ""} onChange={e => set("salvage_value", e.target.value)} placeholder="0.00" />
                        {depreciable > 0 && <span className="fa-hint"><Term simple="Value to spread out" advanced="Depreciable base" />: {peso(depreciable)}</span>}
                    </div>
                    <div className="fa-field">
                        <label className="fa-label"><Term simple="Purchase date" advanced="Acquisition Date" /> <span className="fa-req" /></label>
                        <input className="fa-input" type="date" value={d10(f.acquisition_date)} onChange={e => set("acquisition_date", e.target.value)} />
                    </div>
                    <div className="fa-field">
                        <label className="fa-label"><Term simple="Date first used" advanced="In-Service Date" /></label>
                        <input className="fa-input" type="date" value={d10(f.in_service_date)} onChange={e => set("in_service_date", e.target.value)} />
                        <span className="fa-hint"><Term simple="Value loss starts this month (defaults to the purchase date)" advanced="Depreciation starts this month (defaults to acquisition)" /></span>
                    </div>
                    <div className="fa-field">
                        <label className="fa-label"><Term simple="How long it lasts (months)" advanced="Useful Life (months)" /></label>
                        <input className="fa-input" type="number" min="0" value={f.useful_life_months ?? ""} onChange={e => set("useful_life_months", e.target.value)} placeholder="e.g. 60" />
                    </div>
                    <div className="fa-field">
                        <label className="fa-label">Serial Number</label>
                        <input className="fa-input" value={f.serial_number || ""} onChange={e => set("serial_number", e.target.value)} />
                    </div>
                    <div className="fa-field">
                        <label className="fa-label">Department</label>
                        <input className="fa-input" value={f.department || ""} onChange={e => set("department", e.target.value)} />
                    </div>
                    <div className="fa-field">
                        <label className="fa-label">Location</label>
                        <input className="fa-input" value={f.location || ""} onChange={e => set("location", e.target.value)} />
                    </div>
                    <div className="fa-field">
                        <label className="fa-label"><Term simple="Person responsible" advanced="Custodian" /></label>
                        <select className="fa-fsel" value={f.custodian_id || ""} onChange={e => set("custodian_id", e.target.value)}>
                            <option value="">— None —</option>
                            {employees.map(e => <option key={e.id} value={e.id}>{empName(e)}</option>)}
                        </select>
                    </div>
                </div>
                {isEdit && <div className="fa-hint" style={{ marginTop: 10 }}><Term simple="Purchase price, life, leftover value and method are locked once value loss has been recorded." advanced="Cost, life, salvage and method are locked once depreciation has been posted." /></div>}
            </div>
            <div className="fa-modal-foot">
                <button className="fa-btn-s" onClick={onClose}>Cancel</button>
                <button className="fa-btn-p" onClick={() => f.name?.trim() && f.acquisition_date && onSave(f)}>{isEdit ? "Save Changes" : "Add Asset"}</button>
            </div>
        </Modal>
    );
}

/* ---------------- Detail + lifecycle actions ---------------- */
function AssetDetail({ id, employees, onClose, onEdit, onDelete, flash }) {
    const [a, setA] = useState(null);
    const [revals, setRevals] = useState([]);
    const [action, setAction] = useState(null); // 'dispose' | 'revalue' | 'transfer' | 'maintenance'

    const load = useCallback(async () => {
        try { setA(await api("get_fa_asset", { id })); } catch (e) { flash(e.message, true); }
        try { const d = await api("get_fa_revaluations"); setRevals((Array.isArray(d) ? d : []).filter(r => r.asset_id === id)); } catch {}
    }, [id, flash]);
    useEffect(() => { load(); }, [load]);

    if (!a) return <Modal title="Asset" onClose={onClose}><div style={{ padding: 20, color: "#999" }}>Loading…</div></Modal>;

    const active = a.status === "Active" || a.status === "Fully Depreciated";
    const refresh = () => { setAction(null); load(); };

    return (
        <Modal title={`${a.name}`} subtitle={`${a.asset_number} · ${a.category_name || "Uncategorised"}`} onClose={onClose}>
            <div className="fa-modal-scroll">
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
                    <span className={`fa-badge ${STATUS_BADGE[a.status] || "fa-b-gray"}`}>{a.status}</span>
                    <span className="fa-sku">{methodLabel(a.depreciation_method)} · {a.useful_life_months || 0} mo</span>
                    {a.acquisition_journal_id && <span className="fa-badge fa-b-blue"><Term simple="Purchase recorded" advanced="Acquisition posted" /></span>}
                </div>

                <div className="fa-f" style={{ marginBottom: 16 }}>
                    {[[<Term simple="Purchase price" advanced="Acquisition cost" />, peso(a.acquisition_cost)], [<Term simple="Value lost so far" advanced="Accumulated depreciation" />, peso(a.accumulated_depreciation)],
                      [<Term simple="Current value" advanced="Net book value" />, peso(a.net_book_value)], [<Term simple="Leftover value" advanced="Salvage value" />, peso(a.salvage_value)],
                      [<Term simple="Purchased" advanced="Acquired" />, d10(a.acquisition_date)], [<Term simple="Months of value loss" advanced="Periods depreciated" />, `${a.periods_depreciated || 0} / ${a.useful_life_months || 0}`],
                      [<Term simple="Person responsible" advanced="Custodian" />, a.custodian_name || "—"], ["Location", a.location || "—"]].map(([l, v], i) => (
                        <div key={i} className="fa-field">
                            <label className="fa-label">{l}</label>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>{v}</div>
                        </div>
                    ))}
                </div>

                {active && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                        <button className="fa-btn-s" onClick={() => setAction("dispose")}><I name="minus" size={12} /> <Term simple="Sell or Scrap" advanced="Dispose" /></button>
                        <button className="fa-btn-s" onClick={() => setAction("revalue")}><I name="chart" size={12} /> <Term simple="Change its value" advanced="Revalue / Impair" /></button>
                        <button className="fa-btn-s" onClick={() => setAction("transfer")}><I name="truck" size={12} /> Transfer</button>
                        <button className="fa-btn-s" onClick={() => setAction("maintenance")}><I name="scroll" size={12} /> Log Maintenance</button>
                    </div>
                )}

                {/* Depreciation schedule */}
                <div className="fa-label" style={{ marginBottom: 6 }}><Term simple="Value-loss schedule" advanced="Depreciation schedule" /></div>
                {a.schedule && a.schedule.length > 0 ? (
                    <div className="fa-tblwrap" style={{ marginBottom: 14 }}>
                        <table className="fa-tbl">
                            <thead><tr><th>Period</th><th className="fa-tbl-r">Opening</th><th className="fa-tbl-r">Depreciation</th><th className="fa-tbl-r">Closing NBV</th></tr></thead>
                            <tbody>
                                {a.schedule.map(s => (
                                    <tr key={s.id} style={{ opacity: s.is_voided ? 0.4 : 1 }}>
                                        <td className="fa-tbl-nm">{s.period}</td>
                                        <td className="fa-tbl-r fa-tbl-mono">{peso(s.opening_nbv)}</td>
                                        <td className="fa-tbl-r fa-tbl-mono">{peso(s.amount)}</td>
                                        <td className="fa-tbl-r fa-tbl-mono">{peso(s.closing_nbv)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : <div className="fa-hint" style={{ marginBottom: 14 }}><Term simple="No value loss recorded yet." advanced="No depreciation posted yet." /></div>}

                {/* Revaluations */}
                {revals.length > 0 && (<>
                    <div className="fa-label" style={{ marginBottom: 6 }}><Term simple="Value changes" advanced="Revaluations & impairment" /></div>
                    <div className="fa-tblwrap" style={{ marginBottom: 14 }}>
                        <table className="fa-tbl">
                            <thead><tr><th>Date</th><th>Type</th><th className="fa-tbl-r">Old</th><th className="fa-tbl-r">New</th><th className="fa-tbl-r">Δ</th></tr></thead>
                            <tbody>
                                {revals.map(r => (
                                    <tr key={r.id}>
                                        <td className="fa-sku">{d10(r.revaluation_date)}</td>
                                        <td><span className={`fa-badge ${r.delta >= 0 ? "fa-b-green" : "fa-b-red"}`}>{r.revaluation_type}</span></td>
                                        <td className="fa-tbl-r fa-tbl-mono">{peso(r.old_value)}</td>
                                        <td className="fa-tbl-r fa-tbl-mono">{peso(r.new_value)}</td>
                                        <td className="fa-tbl-r fa-tbl-mono" style={{ color: r.delta >= 0 ? "#0d9488" : "#ef4444" }}>{peso(r.delta)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>)}

                {/* Maintenance + transfers history */}
                {a.maintenance && a.maintenance.length > 0 && (
                    <div className="fa-hint" style={{ marginBottom: 6 }}>{a.maintenance.length} maintenance record(s) · {a.transfers?.length || 0} transfer(s)</div>
                )}
            </div>

            <div className="fa-modal-foot" style={{ justifyContent: "space-between" }}>
                <button className="fa-btn-danger" onClick={() => onDelete(a.id)}>Delete</button>
                <div style={{ display: "flex", gap: 8 }}>
                    <button className="fa-btn-s" onClick={onClose}>Close</button>
                    {active && <button className="fa-btn-p" onClick={() => onEdit(a)}>Edit</button>}
                </div>
            </div>

            {action === "dispose" && <DisposeForm asset={a} onClose={() => setAction(null)} onDone={refresh} flash={flash} />}
            {action === "revalue" && <RevalueForm asset={a} onClose={() => setAction(null)} onDone={refresh} flash={flash} />}
            {action === "transfer" && <TransferForm asset={a} employees={employees} onClose={() => setAction(null)} onDone={refresh} flash={flash} />}
            {action === "maintenance" && <MaintenanceForm asset={a} onClose={() => setAction(null)} onDone={refresh} flash={flash} />}
        </Modal>
    );
}

const today = () => new Date().toISOString().slice(0, 10);

function DisposeForm({ asset, onClose, onDone, flash }) {
    const simple = useIsSimple();
    const [f, setF] = useState({ disposal_date: today(), disposal_type: "sale", proceeds: "" });
    const set = (k, v) => setF(p => ({ ...p, [k]: v }));
    const gain = (Number(f.proceeds) || 0) - (asset.net_book_value || 0);
    const submit = async () => {
        try { const r = await api("create_fa_disposal", { asset_id: asset.id, ...f, proceeds: Number(f.proceeds) || 0 });
            flash(r?.gl_posted ? "Disposed — posted to GL" : "Asset disposed"); onDone(); }
        catch (e) { flash(e.message, true); }
    };
    return (
        <Modal title={simple ? `Sell or scrap ${asset.asset_number}` : `Dispose ${asset.asset_number}`} subtitle={simple ? `Current value ${peso(asset.net_book_value)}` : `Book value ${peso(asset.net_book_value)}`} onClose={onClose}>
            <div className="fa-modal-scroll">
                <div className="fa-f">
                    <div className="fa-field"><label className="fa-label">Date</label><input className="fa-input" type="date" value={f.disposal_date} onChange={e => set("disposal_date", e.target.value)} /></div>
                    <div className="fa-field"><label className="fa-label">Type</label>
                        <select className="fa-fsel" value={f.disposal_type} onChange={e => set("disposal_type", e.target.value)}><option value="sale">Sale</option><option value="scrap">Scrap</option></select>
                    </div>
                    <div className="fa-field"><label className="fa-label"><Term simple="Money received (₱)" advanced="Proceeds (₱)" /></label><input className="fa-input" type="number" min="0" step="0.01" value={f.proceeds} onChange={e => set("proceeds", e.target.value)} placeholder="0.00" /></div>
                    <div className="fa-field"><label className="fa-label">Buyer</label><input className="fa-input" value={f.buyer || ""} onChange={e => set("buyer", e.target.value)} /></div>
                    <div className="fa-field fa-f-full"><label className="fa-label">Reference</label><input className="fa-input" value={f.reference || ""} onChange={e => set("reference", e.target.value)} /></div>
                </div>
                <div className="fa-hint" style={{ marginTop: 8 }}>Estimated {gain >= 0 ? "gain" : "loss"}{simple ? "" : " on disposal"}: <b style={{ color: gain >= 0 ? "#0d9488" : "#ef4444" }}>{peso(Math.abs(gain))}</b></div>
            </div>
            <div className="fa-modal-foot"><button className="fa-btn-s" onClick={onClose}>Cancel</button><button className="fa-btn-p" onClick={submit}><Term simple="Confirm" advanced="Confirm Disposal" /></button></div>
        </Modal>
    );
}

function RevalueForm({ asset, onClose, onDone, flash }) {
    const simple = useIsSimple();
    const [f, setF] = useState({ revaluation_date: today(), revaluation_type: "revaluation", new_value: "" });
    const set = (k, v) => setF(p => ({ ...p, [k]: v }));
    const delta = (Number(f.new_value) || 0) - (asset.net_book_value || 0);
    const submit = async () => {
        const type = delta >= 0 ? "revaluation" : "impairment";
        try { const r = await api("create_fa_revaluation", { asset_id: asset.id, revaluation_date: f.revaluation_date, revaluation_type: type, new_value: Number(f.new_value) || 0, reason: f.reason || "" });
            flash(r?.gl_posted ? "Revaluation posted to GL" : "Revaluation recorded"); onDone(); }
        catch (e) { flash(e.message, true); }
    };
    return (
        <Modal title={simple ? `Change value · ${asset.asset_number}` : `Revalue / Impair ${asset.asset_number}`} subtitle={simple ? `Current value ${peso(asset.net_book_value)}` : `Current book value ${peso(asset.net_book_value)}`} onClose={onClose}>
            <div className="fa-modal-scroll">
                <div className="fa-f">
                    <div className="fa-field"><label className="fa-label">Date</label><input className="fa-input" type="date" value={f.revaluation_date} onChange={e => set("revaluation_date", e.target.value)} /></div>
                    <div className="fa-field"><label className="fa-label"><Term simple="New value (₱)" advanced="New carrying value (₱)" /> <span className="fa-req" /></label><input className="fa-input" type="number" min="0" step="0.01" value={f.new_value} onChange={e => set("new_value", e.target.value)} placeholder="0.00" /></div>
                    <div className="fa-field fa-f-full"><label className="fa-label">Reason</label><input className="fa-input" value={f.reason || ""} onChange={e => set("reason", e.target.value)} placeholder={simple ? "e.g. worth more now, or damaged" : "e.g. market revaluation, impairment test"} /></div>
                </div>
                {f.new_value !== "" && <div className="fa-hint" style={{ marginTop: 8 }}>{simple ? (delta >= 0 ? "Value up by " : "Value down by ") : (delta >= 0 ? "Revaluation increase of " : "Impairment of ")}<b style={{ color: delta >= 0 ? "#0d9488" : "#ef4444" }}>{peso(Math.abs(delta))}</b></div>}
            </div>
            <div className="fa-modal-foot"><button className="fa-btn-s" onClick={onClose}>Cancel</button><button className="fa-btn-p" disabled={f.new_value === ""} onClick={submit}>Apply</button></div>
        </Modal>
    );
}

function TransferForm({ asset, employees, onClose, onDone, flash }) {
    const [f, setF] = useState({ transfer_date: today() });
    const set = (k, v) => setF(p => ({ ...p, [k]: v }));
    const submit = async () => {
        try { await api("create_fa_transfer", { asset_id: asset.id, transfer_date: f.transfer_date, to_department: f.to_department || "", to_location: f.to_location || "", to_custodian_id: f.to_custodian_id || "", notes: f.notes || "" });
            flash("Asset transferred"); onDone(); }
        catch (e) { flash(e.message, true); }
    };
    return (
        <Modal title={`Transfer ${asset.asset_number}`} subtitle={`From ${asset.location || "—"} · ${asset.custodian_name || "no custodian"}`} onClose={onClose}>
            <div className="fa-modal-scroll">
                <div className="fa-f">
                    <div className="fa-field"><label className="fa-label">Date</label><input className="fa-input" type="date" value={f.transfer_date} onChange={e => set("transfer_date", e.target.value)} /></div>
                    <div className="fa-field"><label className="fa-label">To Department</label><input className="fa-input" value={f.to_department || ""} onChange={e => set("to_department", e.target.value)} /></div>
                    <div className="fa-field"><label className="fa-label">To Location</label><input className="fa-input" value={f.to_location || ""} onChange={e => set("to_location", e.target.value)} /></div>
                    <div className="fa-field"><label className="fa-label"><Term simple="New person responsible" advanced="To Custodian" /></label>
                        <select className="fa-fsel" value={f.to_custodian_id || ""} onChange={e => set("to_custodian_id", e.target.value)}>
                            <option value="">— None —</option>
                            {employees.map(e => <option key={e.id} value={e.id}>{empName(e)}</option>)}
                        </select>
                    </div>
                    <div className="fa-field fa-f-full"><label className="fa-label">Notes</label><input className="fa-input" value={f.notes || ""} onChange={e => set("notes", e.target.value)} /></div>
                </div>
            </div>
            <div className="fa-modal-foot"><button className="fa-btn-s" onClick={onClose}>Cancel</button><button className="fa-btn-p" onClick={submit}>Transfer</button></div>
        </Modal>
    );
}

function MaintenanceForm({ asset, onClose, onDone, flash }) {
    const [f, setF] = useState({ service_date: today(), maintenance_type: "service" });
    const set = (k, v) => setF(p => ({ ...p, [k]: v }));
    const submit = async () => {
        try { await api("create_fa_maintenance", { asset_id: asset.id, service_date: f.service_date, maintenance_type: f.maintenance_type, description: f.description || "", cost: Number(f.cost) || 0, vendor: f.vendor || "", performed_by: f.performed_by || "", next_service_date: f.next_service_date || "" });
            flash("Maintenance logged"); onDone(); }
        catch (e) { flash(e.message, true); }
    };
    return (
        <Modal title={`Log Maintenance · ${asset.asset_number}`} onClose={onClose}>
            <div className="fa-modal-scroll">
                <div className="fa-f">
                    <div className="fa-field"><label className="fa-label">Service Date</label><input className="fa-input" type="date" value={f.service_date} onChange={e => set("service_date", e.target.value)} /></div>
                    <div className="fa-field"><label className="fa-label">Type</label><input className="fa-input" value={f.maintenance_type} onChange={e => set("maintenance_type", e.target.value)} placeholder="service / repair" /></div>
                    <div className="fa-field"><label className="fa-label">Cost (₱)</label><input className="fa-input" type="number" min="0" step="0.01" value={f.cost || ""} onChange={e => set("cost", e.target.value)} /></div>
                    <div className="fa-field"><label className="fa-label"><Term simple="Supplier" advanced="Vendor" /></label><input className="fa-input" value={f.vendor || ""} onChange={e => set("vendor", e.target.value)} /></div>
                    <div className="fa-field"><label className="fa-label">Next Service</label><input className="fa-input" type="date" value={f.next_service_date || ""} onChange={e => set("next_service_date", e.target.value)} /></div>
                    <div className="fa-field fa-f-full"><label className="fa-label">Description</label><input className="fa-input" value={f.description || ""} onChange={e => set("description", e.target.value)} /></div>
                </div>
            </div>
            <div className="fa-modal-foot"><button className="fa-btn-s" onClick={onClose}>Cancel</button><button className="fa-btn-p" onClick={submit}>Save</button></div>
        </Modal>
    );
}
