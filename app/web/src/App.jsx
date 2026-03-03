import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Frame from "./pages/loginregister/Frame";
import ERPLayout from "./layouts/ERPLayout";
import Dashboard from "./pages/Dashboard";
import HR from "./pages/hr/overview.jsx";
import Accounting from "./pages/accounting/Dashboard";
import Ticketing from "./pages/ticketing/Dashboard";

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                {/* Public — single auth page handles login, register, forgot password */}
                <Route path="/" element={<Frame />} />

                {/* ERP Shell */}
                <Route element={<ERPLayout />}>
                    <Route path="/dashboard" element={<Dashboard />} />

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

                    {/* Ticketing */}
                    <Route path="/ticketing" element={<Ticketing />} />
                    <Route path="/ticketing/board" element={<Ticketing />} />
                    <Route path="/ticketing/categories" element={<Ticketing />} />
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
}
