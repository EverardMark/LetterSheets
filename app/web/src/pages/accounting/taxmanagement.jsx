import { useState, useEffect, useCallback } from "react";
import { I } from "../../layouts/ERPLayout";

const API = "/api/execute";
async function api(action, body = {}) {
    const s = localStorage.getItem("ls_session");
    const res = await fetch(`${API}?action=${action}`, { method: "POST", headers: { "Content-Type": "application/json", ...(s ? { Authorization: `Bearer ${s}` } : {}) }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error || json?.message || `API ${action} failed`);
    return json?.data ?? json;
}
const peso = (n) => "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function TaxManagement() {
    const [view, setView] = useState("summary"); // summary | detail
    const [taxRows, setTaxRows] = useState([]);
    const [vat, setVat] = useState(null);
    const [detail, setDetail] = useState([]);
    const [selAccount, setSelAccount] = useState(null);
    const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; });
    const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try { const d = await api("get_tax_summary", { date_from: dateFrom, date_to: dateTo }); setTaxRows(Array.isArray(d) ? d : []); } catch { setTaxRows([]); }
        try { const v = await api("get_vat_computation", { date_from: dateFrom, date_to: dateTo }); setVat(v); } catch { setVat(null); }
        setLoading(false);
    }, [dateFrom, dateTo]);
    useEffect(() => { load(); }, [load]);

    const openDetail = async (acct) => {
        setSelAccount(acct);
        try { const d = await api("get_tax_detail", { account_id: acct.account_id, date_from: dateFrom, date_to: dateTo }); setDetail(Array.isArray(d) ? d : []); } catch { setDetail([]); }
        setView("detail");
    };

    /* Quick presets */
    const setQuarter = () => {
        const d = new Date(), q = Math.floor(d.getMonth() / 3), qs = new Date(d.getFullYear(), q * 3, 1);
        setDateFrom(qs.toISOString().split("T")[0]);
        setDateTo(new Date(d.getFullYear(), q * 3 + 3, 0).toISOString().split("T")[0]);
    };
    const setYear = () => {
        const y = new Date().getFullYear();
        setDateFrom(`${y}-01-01`); setDateTo(`${y}-12-31`);
    };
    const setMonth = () => {
        const d = new Date();
        setDateFrom(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
        setDateTo(d.toISOString().split("T")[0]);
    };

    const vatPayable = vat ? vat.output_vat - vat.input_vat : 0;

    const inputAccounts = taxRows.filter(r => r.account_type === "Asset");
    const outputAccounts = taxRows.filter(r => r.name.toLowerCase().includes("output") || r.code === "2110");
    const whAccounts = taxRows.filter(r => (r.name.toLowerCase().includes("withholding") || r.name.toLowerCase().includes("income tax")) && r.account_type === "Liability");
    const otherTax = taxRows.filter(r => !inputAccounts.includes(r) && !outputAccounts.includes(r) && !whAccounts.includes(r));

    if (view === "detail") return renderDetail();
    return renderSummary();

    function renderSummary() {
        return (<div style={{ padding: "0 0 20px" }}>
            {/* VAT Summary Cards */}
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                <div style={{ ...S.stat, flex: 1, borderLeft: "4px solid #ef4444" }}>
                    <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>Output VAT (Sales)</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e" }}>{peso(vat?.output_vat)}</div>
                </div>
                <div style={{ ...S.stat, flex: 1, borderLeft: "4px solid #10b981" }}>
                    <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>Input VAT (Purchases)</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e" }}>{peso(vat?.input_vat)}</div>
                </div>
                <div style={{ ...S.stat, flex: 1, borderLeft: `4px solid ${vatPayable >= 0 ? "#ef4444" : "#10b981"}` }}>
                    <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>{vatPayable >= 0 ? "VAT Payable" : "Excess Input VAT"}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: vatPayable >= 0 ? "#ef4444" : "#10b981" }}>{peso(Math.abs(vatPayable))}</div>
                </div>
            </div>

            {/* Date filters */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
                <label style={S.lbl2}>From</label><input type="date" style={S.dateIn} value={dateFrom} onChange={e => setDateFrom(e.target.value)}/>
                <label style={S.lbl2}>To</label><input type="date" style={S.dateIn} value={dateTo} onChange={e => setDateTo(e.target.value)}/>
                <button style={S.chip} onClick={setMonth}>Month</button>
                <button style={S.chip} onClick={setQuarter}>Quarter</button>
                <button style={S.chip} onClick={setYear}>Year</button>
                <button style={{ ...S.chip, background: "#10b981", color: "#fff" }} onClick={load}><I name="refresh-cw" size={12}/> Refresh</button>
            </div>

            {loading ? <div style={S.empty}>Loading...</div> : (
                <>
                    {/* Tax groups */}
                    {[[outputAccounts, "Output VAT / Sales Tax", "#ef4444"],
                        [inputAccounts, "Input VAT / Purchase Tax", "#10b981"],
                        [whAccounts, "Withholding Taxes", "#f59e0b"],
                        [otherTax, "Other Tax Accounts", "#6366f1"]
                    ].filter(([rows]) => rows.length > 0).map(([rows, title, color]) => (
                        <div key={title} style={{ ...S.card, marginBottom: 12 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color, display: "flex", alignItems: "center", gap: 6 }}>
                                <div style={{ width: 10, height: 10, borderRadius: 3, background: color }}></div>{title}
                            </div>
                            <table style={S.tbl}><thead><tr>
                                <th style={S.th}>Code</th><th style={S.th}>Account Name</th><th style={S.th}>Type</th>
                                <th style={{ ...S.th, textAlign: "right" }}>Period Debits</th><th style={{ ...S.th, textAlign: "right" }}>Period Credits</th>
                                <th style={{ ...S.th, textAlign: "right" }}>Current Balance</th>
                            </tr></thead><tbody>
                            {rows.map(r => (
                                <tr key={r.account_id} style={S.row} onClick={() => openDetail(r)}>
                                    <td style={{ ...S.td, fontWeight: 600 }}>{r.code}</td>
                                    <td style={S.td}>{r.name}</td>
                                    <td style={S.td}><span style={{ ...S.badge, background: r.account_type === "Asset" ? "#dbeafe" : "#fef3c7", color: r.account_type === "Asset" ? "#1d4ed8" : "#92400e" }}>{r.account_type}</span></td>
                                    <td style={{ ...S.td, textAlign: "right" }}>{r.total_debit > 0 ? peso(r.total_debit) : ""}</td>
                                    <td style={{ ...S.td, textAlign: "right" }}>{r.total_credit > 0 ? peso(r.total_credit) : ""}</td>
                                    <td style={{ ...S.td, textAlign: "right", fontWeight: 700, color: r.current_balance > 0 ? "#1a1a2e" : "#22c55e" }}>{peso(r.current_balance)}</td>
                                </tr>
                            ))}
                            </tbody></table>
                        </div>
                    ))}

                    {taxRows.length === 0 && <div style={S.empty}><I name="inbox" size={28} style={{ opacity: .3, marginBottom: 6 }}/><div>No tax accounts found. Apply a COA template with VAT/Tax accounts first.</div></div>}

                    {/* BIR Filing Reminders */}
                    <div style={{ ...S.card, marginTop: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "#1a1a2e" }}>PH Tax Filing Reminders</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            {[{ form: "BIR 2550M", desc: "Monthly VAT Return", due: "20th of following month" },
                                { form: "BIR 2550Q", desc: "Quarterly VAT Return", due: "25th after quarter end" },
                                { form: "BIR 1601C", desc: "Monthly Withholding Tax (Compensation)", due: "10th of following month" },
                                { form: "BIR 1601E", desc: "Monthly Expanded Withholding Tax", due: "10th of following month" },
                                { form: "BIR 1604CF", desc: "Annual Withholding Tax (Compensation)", due: "January 31" },
                                { form: "BIR 2316", desc: "Annual Employee Certificate", due: "January 31" }
                            ].map(f => (
                                <div key={f.form} style={{ background: "#f9fafb", borderRadius: 6, padding: "8px 10px", fontSize: 12 }}>
                                    <span style={{ fontWeight: 700, color: "#1a1a2e" }}>{f.form}</span>{" "}<span style={{ color: "#888" }}>{f.desc}</span>
                                    <div style={{ color: "#f59e0b", fontSize: 11, marginTop: 2 }}>Due: {f.due}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>);
    }

    function renderDetail() {
        if (!selAccount) return null;
        return (<div style={{ padding: "0 0 20px" }}>
            <div style={S.hdr}><button style={S.back} onClick={() => setView("summary")}><I name="arrow-left" size={16}/></button>
                <div><div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a2e" }}>{selAccount.code} {selAccount.name}</div><div style={{ fontSize: 12, color: "#888" }}>{dateFrom} to {dateTo} &middot; Balance: {peso(selAccount.current_balance)}</div></div>
            </div>
            <div style={S.card}>
                {detail.length === 0 ? <div style={S.empty}>No transactions for this period</div> : (
                    <table style={S.tbl}><thead><tr><th style={S.th}>JE #</th><th style={S.th}>Date</th><th style={S.th}>Memo</th><th style={S.th}>Source</th><th style={S.th}>Description</th><th style={{ ...S.th, textAlign: "right" }}>Debit</th><th style={{ ...S.th, textAlign: "right" }}>Credit</th></tr></thead>
                        <tbody>{detail.map((d, i) => (
                            <tr key={i}><td style={{ ...S.td, fontWeight: 600 }}>JE-{String(d.entry_number).padStart(4, "0")}</td><td style={{ ...S.td, fontSize: 12 }}>{d.entry_date?.split("T")[0]}</td><td style={S.td}>{d.memo}</td>
                                <td style={S.td}><span style={{ ...S.badge, background: d.source_type === "payroll" ? "#dbeafe" : "#f3f4f6", color: d.source_type === "payroll" ? "#1d4ed8" : "#555" }}>{d.source_type}</span></td>
                                <td style={S.td}>{d.line_desc}</td>
                                <td style={{ ...S.td, textAlign: "right" }}>{d.debit > 0 ? peso(d.debit) : ""}</td>
                                <td style={{ ...S.td, textAlign: "right" }}>{d.credit > 0 ? peso(d.credit) : ""}</td></tr>
                        ))}</tbody></table>
                )}
            </div>
        </div>);
    }
}

const S = {
    stat: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 16px" },
    card: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 },
    tbl: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
    th: { textAlign: "left", padding: "8px 10px", fontSize: 11, fontWeight: 600, color: "#888", borderBottom: "1px solid #e5e7eb" },
    td: { padding: "7px 10px", borderBottom: "1px solid #f3f4f6" },
    row: { cursor: "pointer" },
    badge: { display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 },
    hdr: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16 },
    back: { background: "none", border: "1px solid #d1d5db", borderRadius: 8, padding: "6px 8px", cursor: "pointer", display: "flex", alignItems: "center" },
    lbl2: { fontSize: 12, color: "#888", fontWeight: 500 },
    dateIn: { padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, outline: "none" },
    chip: { padding: "5px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 12, background: "#fff", cursor: "pointer", fontWeight: 500, display: "flex", alignItems: "center", gap: 4 },
    empty: { textAlign: "center", padding: 40, color: "#aaa", fontSize: 13 },
};
