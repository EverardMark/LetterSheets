import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faGrip, faUsers, faBuilding, faBriefcase, faClock, faCalendar,
    faUserPlus, faPesoSign, faHeart, faCircleMinus, faMoneyBillWave,
    faBox, faCartShopping, faTruck, faShieldHalved, faFile,
    faCircleCheck, faChartSimple, faScroll, faGear, faBars,
    faMagnifyingGlass, faBell, faRightFromBracket, faLock, faTag,
    faUser, faArrowLeft, faComment, faDesktop, faHouse, faInbox,
    faChevronDown, faTags,
} from "@fortawesome/pro-light-svg-icons";
import { Permissions, SELF_SERVICE_MODULES } from "../utils/permissions";

/* ================================================================
   MODULE REGISTRY
   Top-level items have a `path`.
   Parent items have `children` array — rendered as collapsible.
   Children have `path` for routing.
   `group` on children = visual separator between groups.
================================================================ */
export const modules = [
    { id: "dashboard", label: "Dashboard", path: "/dashboard", icon: "grid" },
    {
        id: "hr", label: "Human Resource", icon: "users", badge: 24,
        children: [
            { id: "hr-overview",    label: "Overview",    path: "/hr",                icon: "grid" },
            { id: "hr-employees",   label: "Employees",   path: "/hr/employees",      icon: "users" },
            { id: "hr-departments", label: "Departments", path: "/hr/departments",    icon: "building" },
            { id: "hr-positions",   label: "Positions",      path: "/hr/positions",      icon: "briefcase" },
            { id: "hr-schedules",   label: "Work Schedules", path: "/hr/schedules",      icon: "calendar" },
            { id: "hr-attendance",  label: "Attendance",  path: "/hr/attendance",     icon: "clock" },
            { id: "hr-leave",       label: "Leave",       path: "/hr/leave",          icon: "calendar" },
            { id: "hr-onboarding",  label: "Onboarding",  path: "/hr/onboarding",     icon: "userplus" },
            { id: "hr-payroll",     label: "Payroll",     path: "/hr/payroll",        icon: "peso",     group: "PAYROLL" },
            { id: "hr-benefits",    label: "Benefits",    path: "/hr/benefits",       icon: "heart" },
            { id: "hr-loans",       label: "Loans",       path: "/hr/loans",          icon: "banknote" },
            { id: "hr-compliance",  label: "Compliance",  path: "/hr/compliance",     icon: "shield",   group: "STATUTORY" },
        ],
    },
    {
        id: "accounting", label: "Accounting", icon: "scroll",
        children: [
            { id: "acc-overview",     label: "Overview",       path: "/accounting",             icon: "grid" },
            { id: "acc-coa",          label: "Chart of Accts", path: "/accounting/coa",         icon: "file" },
            { id: "acc-journal",      label: "Journal",        path: "/accounting/journal",     icon: "scroll" },
            { id: "acc-ledger",       label: "Ledger",         path: "/accounting/ledger",      icon: "chart" },
            { id: "acc-payables",     label: "Payables",       path: "/accounting/payables",    icon: "banknote" },
            { id: "acc-receivables",  label: "Receivables",    path: "/accounting/receivables", icon: "peso" },
            { id: "acc-tax",          label: "Tax",            path: "/accounting/tax",         icon: "shield" },
            { id: "acc-bank",         label: "Bank Recon",     path: "/accounting/bank",        icon: "lock" },
            { id: "acc-reports",      label: "Reports",        path: "/accounting/reports",     icon: "chart" },
        ],
    },
    {
        id: "ticketing", label: "Ticketing", icon: "tag",
        children: [
            { id: "tk-overview",   label: "Overview",    path: "/ticketing",            icon: "grid" },
            { id: "tk-board",      label: "Board",       path: "/ticketing/board",      icon: "file" },
            { id: "tk-labels",     label: "Labels",      path: "/ticketing/labels",     icon: "tags" },
            { id: "tk-categories", label: "Categories",  path: "/ticketing/categories", icon: "tag" },
        ],
    },
    {
        id: "inventory", label: "Inventory", icon: "box",
        children: [
            { id: "inv-overview",   label: "Overview",        path: "/inventory",            icon: "grid" },
            { id: "inv-products",   label: "Products",        path: "/inventory/products",   icon: "box" },
            { id: "inv-categories", label: "Categories",      path: "/inventory/categories", icon: "tags" },
            { id: "inv-warehouses", label: "Warehouses",      path: "/inventory/warehouses", icon: "building" },
            { id: "inv-movements",  label: "Stock Movements", path: "/inventory/movements",  icon: "scroll" },
            { id: "inv-purchases",  label: "Purchase Orders", path: "/inventory/purchases",  icon: "cart",  group: "PROCUREMENT" },
            { id: "inv-suppliers",  label: "Suppliers",       path: "/inventory/suppliers",  icon: "truck" },
            { id: "inv-settings",   label: "Settings",        path: "/inventory/settings",   icon: "gear",  group: "CONFIG" },
        ],
    },
    {
        id: "fixed_assets", label: "Fixed Assets", icon: "building",
        children: [
            { id: "fa-overview",     label: "Overview",     path: "/fixed-assets",             icon: "grid" },
            { id: "fa-assets",       label: "Assets",       path: "/fixed-assets/assets",       icon: "box" },
            { id: "fa-categories",   label: "Categories",   path: "/fixed-assets/categories",   icon: "tags" },
            { id: "fa-depreciation", label: "Depreciation", path: "/fixed-assets/depreciation", icon: "chart" },
            { id: "fa-disposals",    label: "Disposals",    path: "/fixed-assets/disposals",    icon: "minus", group: "LIFECYCLE" },
            { id: "fa-maintenance",  label: "Maintenance",  path: "/fixed-assets/maintenance",  icon: "scroll" },
            { id: "fa-transfers",    label: "Transfers",    path: "/fixed-assets/transfers",    icon: "truck" },
            { id: "fa-settings",     label: "Settings",     path: "/fixed-assets/settings",     icon: "gear",  group: "CONFIG" },
        ],
    },
    {
        id: "sales", label: "Sales", icon: "cart",
        children: [
            { id: "so-overview",   label: "Overview",    path: "/sales",             icon: "grid" },
            { id: "so-quotes",     label: "Quotes",      path: "/sales/quotes",      icon: "file" },
            { id: "so-orders",     label: "Orders",      path: "/sales/orders",      icon: "cart" },
            { id: "so-deliveries", label: "Deliveries",  path: "/sales/deliveries",  icon: "truck" },
            { id: "so-pricelists", label: "Price Lists", path: "/sales/price-lists", icon: "tags",  group: "PRICING" },
            { id: "so-creditmemos",label: "Credit Memos",path: "/sales/credit-memos",icon: "scroll",group: "RETURNS" },
            { id: "so-settings",   label: "Settings",    path: "/sales/settings",    icon: "gear",  group: "CONFIG" },
        ],
    },
    {
        id: "procurement", label: "Procurement", icon: "cart",
        children: [
            { id: "pr-overview",     label: "Overview",       path: "/procurement",              icon: "grid" },
            { id: "pr-requisitions", label: "Requisitions",   path: "/procurement/requisitions", icon: "file" },
            { id: "pr-orders",       label: "Purchase Orders", path: "/procurement/orders",      icon: "cart" },
            { id: "pr-receipts",     label: "Goods Receipts", path: "/procurement/receipts",     icon: "truck" },
            { id: "pr-debitmemos",   label: "Debit Memos",    path: "/procurement/debit-memos",  icon: "scroll", group: "RETURNS" },
            { id: "pr-settings",     label: "Settings",       path: "/procurement/settings",     icon: "gear",  group: "CONFIG" },
        ],
    },
];

/* Employee-only nav: limited sidebar */
const employeeModules = [
    { id: "dashboard", label: "My Profile", path: "/dashboard", icon: "grid" },
    {
        id: "hr", label: "Self Service", icon: "users",
        children: [
            { id: "hr-attendance",  label: "Attendance",  path: "/hr/attendance",     icon: "clock" },
            { id: "hr-leave",       label: "Leave",       path: "/hr/leave",          icon: "calendar" },
            { id: "hr-payroll",     label: "Payslips",    path: "/hr/payroll",        icon: "peso" },
            { id: "hr-benefits",    label: "Benefits",    path: "/hr/benefits",       icon: "heart" },
            { id: "hr-loans",       label: "Loans",       path: "/hr/loans",          icon: "banknote" },
        ],
    },
];

// Map permission module IDs to sidebar child IDs
const PERM_TO_CHILD = {
    employees: "hr-employees", departments: "hr-departments", positions: "hr-positions",
    attendance: "hr-attendance", leave: "hr-leave", payroll: "hr-payroll",
    benefits: "hr-benefits", loans: "hr-loans", compliance: "hr-compliance",
    onboarding: "hr-onboarding",
};

function buildNavModules(perms) {
    if (perms.isSuperAdmin()) return modules;
    if (perms.isSelfServiceOnly()) return employeeModules;

    const visible = perms.getVisibleModules();
    const result = [{ id: "dashboard", label: "Dashboard", path: "/dashboard", icon: "grid" }];

    // Build HR children
    const hrFull = modules.find(m => m.id === "hr");
    if (hrFull) {
        const visibleChildIds = new Set();
        for (const mod of visible) {
            if (PERM_TO_CHILD[mod]) visibleChildIds.add(PERM_TO_CHILD[mod]);
        }
        // Always include self-service modules
        for (const mod of SELF_SERVICE_MODULES) {
            if (PERM_TO_CHILD[mod]) visibleChildIds.add(PERM_TO_CHILD[mod]);
        }
        const children = hrFull.children.filter(c => visibleChildIds.has(c.id));
        if (children.length > 0) {
            // Add overview if they have any non-self-service HR permission
            const hasAdminHR = visible.some(m => PERM_TO_CHILD[m] && !SELF_SERVICE_MODULES.includes(m));
            if (hasAdminHR) children.unshift({ id: "hr-overview", label: "Overview", path: "/hr", icon: "grid" });
            result.push({ id: "hr", label: "Human Resource", icon: "users", children });
        }
    }

    // Accounting
    if (visible.includes("accounting")) {
        const acc = modules.find(m => m.id === "accounting");
        if (acc) result.push(acc);
    }

    // Ticketing
    if (visible.includes("ticketing")) {
        const tk = modules.find(m => m.id === "ticketing");
        if (tk) result.push(tk);
    }

    // Inventory
    if (visible.includes("inventory")) {
        const inv = modules.find(m => m.id === "inventory");
        if (inv) result.push(inv);
    }

    // Fixed Assets
    if (visible.includes("fixed_assets")) {
        const fa = modules.find(m => m.id === "fixed_assets");
        if (fa) result.push(fa);
    }

    // Sales
    if (visible.includes("sales")) {
        const so = modules.find(m => m.id === "sales");
        if (so) result.push(so);
    }

    // Procurement
    if (visible.includes("procurement")) {
        const pr = modules.find(m => m.id === "procurement");
        if (pr) result.push(pr);
    }

    return result;
}

/* ================================================================
   ICON COMPONENT — Font Awesome 6 Pro Light
================================================================ */
const faMap = {
    grid: faGrip,
    users: faUsers,
    building: faBuilding,
    briefcase: faBriefcase,
    clock: faClock,
    calendar: faCalendar,
    userplus: faUserPlus,
    peso: faPesoSign,
    heart: faHeart,
    minus: faCircleMinus,
    banknote: faMoneyBillWave,
    box: faBox,
    cart: faCartShopping,
    truck: faTruck,
    shield: faShieldHalved,
    file: faFile,
    check: faCircleCheck,
    chart: faChartSimple,
    scroll: faScroll,
    gear: faGear,
    menu: faBars,
    search: faMagnifyingGlass,
    bell: faBell,
    logout: faRightFromBracket,
    lock: faLock,
    tag: faTag,
    tags: faTags,
    user: faUser,
    "arrow-left": faArrowLeft,
    "message-circle": faComment,
    monitor: faDesktop,
    home: faHouse,
    inbox: faInbox,
    chevDown: faChevronDown,
};

export const I = ({ name, size = 16 }) => {
    const icon = faMap[name];
    if (!icon) return null;
    return <FontAwesomeIcon icon={icon} style={{ fontSize: size }} />;
};

/* ================================================================
   HELPERS
================================================================ */
function getAllLeaves(mods) {
    const leaves = [];
    for (const mod of mods) {
        if (mod.path) leaves.push(mod);
        if (mod.children) leaves.push(...mod.children);
    }
    return leaves;
}

function findActive(pathname, mods) {
    const leaves = getAllLeaves(mods);
    return leaves.find(m => m.path === pathname)
        || [...leaves].sort((a,b) => b.path.length - a.path.length).find(m => pathname.startsWith(m.path))
        || leaves[0];
}

function findParent(activeId, mods) {
    for (const mod of mods) {
        if (mod.children?.some(c => c.id === activeId)) return mod;
    }
    return null;
}

/* ================================================================
   LAYOUT
================================================================ */
export default function ERPLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const user = JSON.parse(localStorage.getItem("ls_user") || "{}");
    const company = JSON.parse(localStorage.getItem("ls_company") || "{}");
    const hasKey = !!sessionStorage.getItem("ls_company_key");
    const perms = new Permissions(company.permissions, company.role);
    const isEmployee = perms.isSelfServiceOnly();
    const navModules = buildNavModules(perms);
    const [collapsed, setCollapsed] = useState(false);
    const [rightOpen, setRightOpen] = useState(true);
    const [mobileMenu, setMobileMenu] = useState(false);
    const [mobileNotif, setMobileNotif] = useState(false);

    // No encryption key → redirect to login
    useEffect(() => {
        if (!hasKey) {
            localStorage.removeItem("ls_session");
            localStorage.removeItem("ls_user");
            localStorage.removeItem("ls_company");
            localStorage.removeItem("ls_access");
            localStorage.removeItem("ls_kem_private_key");
            localStorage.removeItem("ls_dsa_private_key");
            sessionStorage.removeItem("ls_company_key");
            navigate("/");
        }
    }, [hasKey]);

    if (!hasKey) return null;

    const active = findActive(location.pathname, navModules);
    const activeParent = findParent(active.id, navModules);

    // Track expanded parents
    const [expanded, setExpanded] = useState(() => {
        const init = {};
        navModules.forEach(m => { if (m.children) init[m.id] = !!activeParent && activeParent.id === m.id; });
        return init;
    });

    // Auto-expand parent when navigating into its children
    useEffect(() => {
        if (activeParent && !expanded[activeParent.id]) {
            setExpanded(prev => ({ ...prev, [activeParent.id]: true }));
        }
        setMobileMenu(false);
        setMobileNotif(false);
    }, [location.pathname]);

    const toggle = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

    const handleLogout = () => {
        localStorage.removeItem("ls_session");
        localStorage.removeItem("ls_user");
        localStorage.removeItem("ls_company");
        localStorage.removeItem("ls_access");
        localStorage.removeItem("ls_kem_private_key");
        localStorage.removeItem("ls_dsa_private_key");
        sessionStorage.removeItem("ls_company_key");
        navigate("/");
    };

    // Breadcrumb
    const bcParts = [];
    if (activeParent) bcParts.push(activeParent.label);
    bcParts.push(active.label);

    return (
        <div className="erp">
            {mobileMenu && <div className="sb-overlay" onClick={()=>setMobileMenu(false)}/>}
            {mobileNotif && <div className="sb-overlay" onClick={()=>setMobileNotif(false)}/>}
            <aside className={`sb ${collapsed ? "sb-col" : ""}${mobileMenu?" sb-open":""}`}>
                <div className="sb-logo">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2d9e8b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="3" width="20" height="18" rx="2"/><path d="M2 7h20"/><path d="M6 11h4"/><path d="M6 15h8"/>
                    </svg>
                    {!collapsed && <span className="sb-logo-t">LETTER<b>SHEETS</b></span>}
                </div>

                <nav className="sb-nav">
                    {navModules.map((mod) => {
                        // Simple link
                        if (mod.path) {
                            return (
                                <Link key={mod.id} to={mod.path} className={`sb-link ${active.id===mod.id?"sb-on":""}`} title={collapsed?mod.label:""}>
                                    <span className="sb-ic"><I name={mod.icon}/></span>
                                    {!collapsed && <span className="sb-lbl">{mod.label}</span>}
                                </Link>
                            );
                        }

                        // Collapsible parent
                        const isOpen = expanded[mod.id];
                        const hasActive = mod.children?.some(c => c.id === active.id);

                        return (
                            <div key={mod.id} className="sb-grp">
                                <button
                                    className={`sb-link sb-parent ${hasActive?"sb-parent-on":""}`}
                                    onClick={() => {
                                        if (collapsed) {
                                            setCollapsed(false);
                                            setExpanded(prev => ({ ...prev, [mod.id]: true }));
                                        } else {
                                            toggle(mod.id);
                                        }
                                    }}
                                    title={collapsed ? mod.label : ""}
                                >
                                    <span className="sb-ic"><I name={mod.icon}/></span>
                                    {!collapsed && <span className="sb-lbl">{mod.label}</span>}
                                    {!collapsed && mod.badge != null && <span className="sb-badge">{mod.badge}</span>}
                                    {!collapsed && <span className={`sb-chev ${isOpen?"sb-chev-open":""}`}><I name="chevDown" size={14}/></span>}
                                </button>
                                {!collapsed && isOpen && (
                                    <div className="sb-kids">
                                        {mod.children.map((child, ci) => {
                                            const showGroupSep = child.group && (ci === 0 || mod.children[ci-1].group !== child.group) && ci > 0;
                                            return (
                                                <div key={child.id}>
                                                    {showGroupSep && <div className="sb-kid-sep"><span>{child.group}</span></div>}
                                                    <Link
                                                        to={child.path}
                                                        className={`sb-link sb-kid ${active.id===child.id?"sb-on":""}`}
                                                    >
                                                        <span className="sb-dot"/>
                                                        <span className="sb-lbl">{child.label}</span>
                                                    </Link>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </nav>

                <div className="sb-foot">
                    {hasKey && (
                        <div className={`sb-enc ${collapsed?"sb-enc-sm":""}`}>
                            <I name="lock" size={14}/>{!collapsed && <span>E2E Encrypted</span>}
                        </div>
                    )}
                    <button className="sb-link sb-out" onClick={handleLogout}>
                        <span className="sb-ic"><I name="logout"/></span>
                        {!collapsed && <span className="sb-lbl">Sign Out</span>}
                    </button>
                </div>
            </aside>

            <div className={`mn${rightOpen?"":" mn-rp-closed"}`}>
                <header className="tb">
                    <div className="tb-l">
                        <button className="tb-tog" onClick={()=>setMobileMenu(!mobileMenu)}><I name="menu"/></button>
                        <div className="tb-bc">
                            <span className="tb-bc-r">{company.name||"Company"}</span>
                            {bcParts.map((p,i)=>(
                                <span key={i}><span className="tb-bc-s">/</span><span className={i===bcParts.length-1?"tb-bc-c":"tb-bc-m"}>{p}</span></span>
                            ))}
                        </div>
                    </div>
                    <div className="tb-r">
                        <div className="tb-srch"><I name="search" size={15}/><input type="text" placeholder="Search..." className="tb-inp"/></div>
                        <div className="tb-prof">
                            <div className="tb-av">{(user.username||"U")[0].toUpperCase()}</div>
                            <div className="tb-ui"><span className="tb-nm">{user.username||"User"}</span><span className="tb-rl">{company.role||"employee"}</span></div>
                        </div>
                        <button className="tb-bell" onClick={()=>{setRightOpen(!rightOpen);setMobileNotif(!mobileNotif)}}><I name="bell" size={17}/><span className="tb-dot"/></button>
                    </div>
                </header>
                <div className="pg"><Outlet/></div>
            </div>

            <aside className={`rp${rightOpen?"":" rp-closed"}${mobileNotif?" rp-open":""}`}>
                <div className="rp-hdr">
                    <span className="rp-title">Notifications</span>
                </div>
                <div className="rp-body">
                    <div className="rp-empty">
                        <I name="bell" size={28}/>
                        <span>No new notifications</span>
                    </div>
                </div>
            </aside>

            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}body{margin:0}
        #root{width:100%;}
        .erp{display:flex;min-height:100vh;font-family:'DM Sans',sans-serif;background:#f3f5f4;color:#333}

        .sb{width:230px;background:#fff;border-right:1px solid #eee;display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:200;transition:width .2s;overflow-y:auto;overflow-x:hidden}
        .sb-col{width:62px}
        .sb-logo{display:flex;align-items:center;gap:9px;padding:16px 16px 12px;white-space:nowrap;overflow:hidden;height: 53px;border-bottom: 1px solid #f0f0f0;}
        .sb-logo-t{font-size:13px;color:#555;letter-spacing:.12em}
        .sb-logo-t b{color:#2d9e8b;font-weight:700}

        .sb-nav{flex:1;padding:4px 8px;overflow-y:auto}
        .sb-grp{margin-bottom:2px}

        .sb-link{display:flex;align-items:center;gap:10px;width:100%;padding:9px 10px;border:none;background:none;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;color:#777;cursor:pointer;border-radius:8px;transition:all .15s;white-space:nowrap;overflow:hidden;text-decoration:none}
        .sb-link:hover{background:#f0faf7;color:#2d9e8b}
        .sb-on{background:#edf8f5;color:#2d9e8b;font-weight:600}
        .sb-ic{width:20px;height:20px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
        .sb-lbl{flex:1;text-align:left}
        .sb-badge{width:18px;height:18px;font-size:10px;line-height:18px;font-weight:700;background:#2d9e8b;color:#fff;border-radius:10px;min-width:18px;text-align:center}

        .sb-parent-on{color:#2d9e8b;font-weight:600}
        .sb-chev{display:flex;align-items:center;color:#ccc;transition:transform .2s}
        .sb-chev-open{transform:rotate(180deg)}

        .sb-kids{margin-left:18px;padding-left:10px;border-left:1.5px solid #f0f0f0}
        .sb-kid{    margin-left: 5px;padding:7px 10px;font-size:12.5px;gap:8px}
        .sb-dot{width:5px;height:5px;border-radius:50%;background:#ddd;flex-shrink:0;transition:background .15s}
        .sb-kid:hover .sb-dot{background:#2d9e8b}
        .sb-kid.sb-on .sb-dot{background:#2d9e8b}
        .sb-kid-sep{padding:8px 10px 3px;font-size:9px;font-weight:700;color:#ccc;letter-spacing:.1em;text-transform:uppercase}

        .sb-foot{padding:8px;border-top:1px solid #f0f0f0}
        .sb-enc{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:#2d9e8b;padding:6px 10px;background:#edf8f5;border-radius:6px;margin-bottom:4px}
        .sb-enc-sm{justify-content:center;padding:6px}
        .sb-out{color:#999}.sb-out:hover{color:#ef4444;background:#fef2f2}

        .mn{flex:1;margin-left:230px;margin-right:230px;transition:margin-left .2s,margin-right .2s;min-height:100vh}
        .sb-col~.mn{margin-left:62px}
        .mn-rp-closed{margin-right:0}

        .tb{display:flex;align-items:center;justify-content:space-between;height:54px;padding:0 24px;background:#fff;border-bottom:1px solid #eee;position:sticky;top:0;z-index:100}
        .tb-l{display:flex;align-items:center;gap:12px}
        .tb-tog{width:32px;height:32px;border-radius:8px;border:1px solid #eee;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#888}
        .tb-tog:hover{background:#f0faf7;color:#2d9e8b}
        .tb-bc{align-items:center;gap:0;font-size:16px}
        .tb-bc-r{color:#aaa;font-weight:500;margin-right:0}
        .tb-bc-s{color:#ddd;margin:0 6px}
        .tb-bc-m{color:#bbb;font-weight:500}
        .tb-bc-c{color:#333;font-weight:600}
        .tb-r{display:flex;align-items:center;gap:10px;width:fit-content}
        .tb-srch{display:flex;align-items:center;gap:6px;padding:6px 12px;background:#f5f5f5;border-radius:8px;color:#bbb;width:fit-content}
        .tb-srch i{font-size:14px;flex-shrink:0}
        .tb-inp{border:none;background:none;font-family:'DM Sans',sans-serif;font-size:13px;color:#555;outline:none;width:130px}
        .tb-inp::placeholder{color:#ccc}
        .tb-bell{position:relative;width:32px;height:32px;border-radius:8px;border:1px solid #eee;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#888}
        .tb-dot{position:absolute;top:5px;right:6px;width:7px;height:7px;border-radius:50%;background:#ef4444;border:1.5px solid #fff}
        .tb-prof{display:flex;align-items:center;gap:8px;padding:3px;cursor:pointer;width:fit-content}
        .tb-av{width:30px;height:30px;border-radius:15px;background:linear-gradient(135deg,#2d9e8b,#3abfab);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0}
        .tb-ui{display:flex;flex-direction:column}
        .tb-nm{font-size:12px;font-weight:600;color:#333;line-height:1.2}
        .tb-rl{font-size:10px;color:#aaa;text-transform:capitalize}

        .pg{padding:24px 28px;max-width:1020px;margin:0 auto}

        .rp{width:230px;background:#fff;border-left:1px solid #eee;display:flex;flex-direction:column;position:fixed;top:0;right:0;bottom:0;z-index:200;transition:transform .2s;overflow-y:auto;overflow-x:hidden}
        .rp-closed{transform:translateX(100%)}
        .rp-hdr{    height: 54px;display:flex;align-items:center;justify-content:space-between;padding:14px 16px 12px;border-bottom:1px solid #f0f0f0}
        .rp-title{font-size:13px;font-weight:600;color:#333}
        .rp-body{flex:1;padding:16px}
        .rp-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:40px 0;color:#ccc;font-size:12px;font-weight:500}

        @media(min-width:1021px){.tb-tog,.tb-bell{display:none}.sb,.sb.sb-col{transform:none!important}.rp,.rp.rp-closed{transform:none!important}.mn,.mn.mn-rp-closed{margin-right:230px!important}.sb-overlay{display:none!important}}
        @media(max-width:1020px){
          .sb{transform:translateX(-100%);transition:transform .25s ease}
          .sb.sb-open{transform:translateX(0)}
          .rp{transform:translateX(100%);display:flex;transition:transform .25s ease}.rp.rp-open{transform:translateX(0)}
          .mn{margin-left:0!important;margin-right:0!important}
        }
        @media(max-width:768px){
          .pg{padding:16px}.tb-srch,.tb-ui{display:none}
        }
        .sb-overlay{position:fixed;inset:0;background:rgba(0,0,0,.3);z-index:199;animation:fadeIn .25s ease}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
      `}</style>
        </div>
    );
}
