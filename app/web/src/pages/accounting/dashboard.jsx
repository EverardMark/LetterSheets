import { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AccountingCOA from "./Accounting";
import JournalEntries from "./JournalEntries";
import GeneralLedger from "./GeneralLedger";
import AccountsPayable from "./AccountsPayable";
import AccountsReceivable from "./AccountsReceivable";
import TaxManagement from "./TaxManagement";
import BankReconciliation from "./BankReconciliation";
import FinancialReports from "./FinancialReports";

function getTab(pathname) {
    const map = {
        "/accounting":              "overview",
        "/accounting/coa":          "coa",
        "/accounting/journal":      "journal",
        "/accounting/ledger":       "ledger",
        "/accounting/payables":     "payables",
        "/accounting/receivables":  "receivables",
        "/accounting/tax":          "tax",
        "/accounting/bank":         "bank",
        "/accounting/reports":      "reports",
    };
    return map[pathname] || "overview";
}

function Placeholder({ title, icon, description }) {
    return (
        <div style={{ textAlign: "center", padding: "80px 20px", color: "#ccc" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
            <h3 style={{ fontSize: 18, color: "#888", margin: "0 0 8px", fontWeight: 600 }}>{title}</h3>
            <p style={{ fontSize: 13, color: "#aaa" }}>{description}</p>
        </div>
    );
}

export default function AccountingDashboard() {
    const location = useLocation();
    const tab = getTab(location.pathname);

    return (
        <div>
            {tab === "overview"     && <Placeholder title="Accounting Overview" description="Financial dashboard coming soon."/>}
            {tab === "coa"          && <AccountingCOA/>}
            {tab === "journal"      && <JournalEntries/>}
            {tab === "ledger"       && <GeneralLedger/>}
            {tab === "payables"     && <AccountsPayable/>}
            {tab === "receivables"  && <AccountsReceivable/>}
            {tab === "tax"          && <TaxManagement/>}
            {tab === "bank"         && <BankReconciliation/>}
            {tab === "reports"      && <FinancialReports/>}
        </div>
    );
}
