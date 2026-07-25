import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Frame from "./pages/loginregister/Frame";
import ERPLayout from "./layouts/ERPLayout";
import Dashboard from "./pages/Dashboard";
import HR from "./pages/hr/overview.jsx";
import Accounting from "./pages/accounting/Dashboard";
import Ticketing from "./pages/ticketing/Dashboard";
import Inventory from "./pages/inventory/Dashboard";
import FixedAssets from "./pages/fixedassets/Dashboard";
import Sales from "./pages/sales/Dashboard";
import Procurement from "./pages/procurement/Dashboard";
import CRM from "./pages/crm/Dashboard";
import Expenses from "./pages/expenses/Dashboard";
import Settings from "./pages/settings/settings.jsx";

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                {/* Public — single auth page handles login, register, forgot password */}
                <Route path="/" element={<Frame />} />

                {/* ERP Shell */}
                <Route element={<ERPLayout />}>
                    <Route path="/dashboard" element={<Dashboard />} />

                    {/* Account & Settings */}
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/profile" element={<Settings />} />

                    {/* HR — single component, reads path for active sub-tab */}
                    <Route path="/hr" element={<HR />} />
                    <Route path="/hr/employees" element={<HR />} />
                    <Route path="/hr/departments" element={<HR />} />
                    <Route path="/hr/positions" element={<HR />} />
                    <Route path="/hr/schedules" element={<HR />} />
                    <Route path="/hr/attendance" element={<HR />} />
                    <Route path="/hr/leave" element={<HR />} />
                    <Route path="/hr/onboarding" element={<HR />} />
                    <Route path="/hr/payroll" element={<HR />} />
                    <Route path="/hr/benefits" element={<HR />} />
                    <Route path="/hr/loans" element={<HR />} />
                    <Route path="/hr/compliance" element={<HR />} />

                    {/* Accounting */}
                    <Route path="/accounting" element={<Accounting />} />
                    <Route path="/accounting/coa" element={<Accounting />} />
                    <Route path="/accounting/journal" element={<Accounting />} />
                    <Route path="/accounting/ledger" element={<Accounting />} />
                    <Route path="/accounting/payables" element={<Accounting />} />
                    <Route path="/accounting/receivables" element={<Accounting />} />
                    <Route path="/accounting/tax" element={<Accounting />} />
                    <Route path="/accounting/bank" element={<Accounting />} />
                    <Route path="/accounting/reports" element={<Accounting />} />
                    <Route path="/accounting/periods" element={<Accounting />} />

                    {/* Ticketing */}
                    <Route path="/ticketing" element={<Ticketing />} />
                    <Route path="/ticketing/board" element={<Ticketing />} />
                    <Route path="/ticketing/labels" element={<Ticketing />} />
                    <Route path="/ticketing/categories" element={<Ticketing />} />

                    {/* Inventory */}
                    <Route path="/inventory" element={<Inventory />} />
                    <Route path="/inventory/products" element={<Inventory />} />
                    <Route path="/inventory/categories" element={<Inventory />} />
                    <Route path="/inventory/warehouses" element={<Inventory />} />
                    <Route path="/inventory/movements" element={<Inventory />} />
                    <Route path="/inventory/purchases" element={<Inventory />} />
                    <Route path="/inventory/suppliers" element={<Inventory />} />
                    <Route path="/inventory/settings" element={<Inventory />} />

                    {/* Fixed Assets */}
                    <Route path="/fixed-assets" element={<FixedAssets />} />
                    <Route path="/fixed-assets/assets" element={<FixedAssets />} />
                    <Route path="/fixed-assets/categories" element={<FixedAssets />} />
                    <Route path="/fixed-assets/depreciation" element={<FixedAssets />} />
                    <Route path="/fixed-assets/disposals" element={<FixedAssets />} />
                    <Route path="/fixed-assets/maintenance" element={<FixedAssets />} />
                    <Route path="/fixed-assets/transfers" element={<FixedAssets />} />
                    <Route path="/fixed-assets/settings" element={<FixedAssets />} />

                    {/* Sales */}
                    <Route path="/sales" element={<Sales />} />
                    <Route path="/sales/quotes" element={<Sales />} />
                    <Route path="/sales/orders" element={<Sales />} />
                    <Route path="/sales/deliveries" element={<Sales />} />
                    <Route path="/sales/price-lists" element={<Sales />} />
                    <Route path="/sales/credit-memos" element={<Sales />} />
                    <Route path="/sales/settings" element={<Sales />} />

                    {/* CRM */}
                    {/* Expenses — employee reimbursement claims */}
                    <Route path="/expenses" element={<Expenses />} />
                    <Route path="/expenses/claims" element={<Expenses />} />
                    <Route path="/expenses/categories" element={<Expenses />} />
                    <Route path="/expenses/settings" element={<Expenses />} />

                    <Route path="/crm" element={<CRM />} />
                    <Route path="/crm/leads" element={<CRM />} />
                    <Route path="/crm/pipeline" element={<CRM />} />
                    <Route path="/crm/activities" element={<CRM />} />

                    {/* Procurement */}
                    <Route path="/procurement" element={<Procurement />} />
                    <Route path="/procurement/requisitions" element={<Procurement />} />
                    <Route path="/procurement/orders" element={<Procurement />} />
                    <Route path="/procurement/receipts" element={<Procurement />} />
                    <Route path="/procurement/debit-memos" element={<Procurement />} />
                    <Route path="/procurement/settings" element={<Procurement />} />
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
}
