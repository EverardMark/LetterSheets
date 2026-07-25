/* ================================================================
   PERMISSIONS UTILITY

   Everyone is an employee. Permissions expand what they can do.

   null/empty → self-service only (own data)
   has entries → self-service + assigned modules/functions
   superadmin → everything (bypasses checks)

   Usage:
     const p = new Permissions(user.permissions, company.role);
     p.can("leave", "approve")    → true/false
     p.canAny("leave")            → true if has any leave permission
     p.isSuperAdmin()             → true if superadmin
     p.isSelfServiceOnly()        → true if no extra permissions
     p.getVisibleModules()        → module IDs for sidebar
================================================================ */

// All available modules and their functions
export const MODULE_REGISTRY = {
    employees:   { label: "Employees",   icon: "users",       functions: ["view", "create", "edit", "delete", "account"] },
    departments: { label: "Departments", icon: "building",    functions: ["view", "create", "edit", "delete"] },
    positions:   { label: "Positions",   icon: "briefcase",   functions: ["view", "create", "edit", "delete"] },
    attendance:  { label: "Attendance",  icon: "clock",       functions: ["view", "create", "edit", "delete"] },
    leave:       { label: "Leave",       icon: "calendar",    functions: ["view", "create", "approve", "reject", "delete"] },
    payroll:     { label: "Payroll",     icon: "peso",        functions: ["view", "create", "approve", "settings"] },
    benefits:    { label: "Benefits",    icon: "heart",       functions: ["view", "create", "edit", "delete"] },
    loans:       { label: "Loans",       icon: "banknote",    functions: ["view", "create", "approve", "reject", "delete", "payments"] },
    compliance:  { label: "Compliance",  icon: "shield",      functions: ["view", "create", "edit", "delete"] },
    onboarding:  { label: "Onboarding",  icon: "userplus",    functions: ["view", "create", "edit", "delete"] },
    // "close" gates the fiscal calendar: closing a period revokes everyone else's
    // ability to post into it, and closing a year writes a journal entry.
    accounting:  { label: "Accounting",  icon: "calculator",  functions: ["view", "create", "edit", "delete", "close"] },
    ticketing:   { label: "Ticketing",   icon: "ticket",      functions: ["view", "create", "edit", "delete"] },
    inventory:   { label: "Inventory",   icon: "box",         functions: ["view", "create", "edit", "delete"] },
    fixed_assets:{ label: "Fixed Assets", icon: "building",   functions: ["view", "create", "edit", "delete"] },
    sales:       { label: "Sales",        icon: "cart",        functions: ["view", "create", "edit", "delete"] },
    procurement: { label: "Procurement",  icon: "cart",        functions: ["view", "create", "edit", "delete"] },
    crm:         { label: "CRM",          icon: "target",      functions: ["view", "create", "edit", "delete"] },
    // Filing your OWN expense claim needs none of these — it is self-service,
    // like leave and loans. These rights are for acting on other people's claims.
    expenses:    { label: "Expenses",     icon: "receipt",     functions: ["view", "create", "edit", "delete", "approve", "pay"] },
};

// Self-service modules (everyone gets these for their own data).
// "expenses" is here because filing a reimbursement claim is something every
// employee does for themselves — the module rights gate acting on OTHER people's
// claims, not having one of your own.
export const SELF_SERVICE_MODULES = ["attendance", "leave", "payroll", "benefits", "loans", "expenses"];

// Preset permission templates
export const PERMISSION_PRESETS = {
    "HR Manager": {
        employees: ["view", "create", "edit", "delete", "account"],
        departments: ["view", "create", "edit", "delete"],
        positions: ["view", "create", "edit", "delete"],
        attendance: ["view", "create", "edit", "delete"],
        leave: ["view", "create", "approve", "reject", "delete"],
        payroll: ["view", "create", "approve", "settings"],
        benefits: ["view", "create", "edit", "delete"],
        loans: ["view", "create", "approve", "reject", "delete", "payments"],
        compliance: ["view", "create", "edit", "delete"],
        onboarding: ["view", "create", "edit", "delete"],
    },
    "HR Staff": {
        employees: ["view", "create", "edit"],
        departments: ["view"],
        positions: ["view"],
        attendance: ["view", "create", "edit"],
        leave: ["view", "create"],
        benefits: ["view"],
        loans: ["view"],
        onboarding: ["view", "create", "edit"],
    },
    "Department Head": {
        employees: ["view"],
        attendance: ["view", "create", "edit"],
        leave: ["view", "approve", "reject"],
    },
    "Accountant": {
        accounting: ["view", "create", "edit", "delete"],
        payroll: ["view"],
        expenses: ["view", "edit", "pay"],
    },
    "Financial Controller": {
        accounting: ["view", "create", "edit", "delete", "close"],
        payroll: ["view", "approve"],
        expenses: ["view", "create", "edit", "delete", "approve", "pay"],
    },
    "Expense Approver": {
        expenses: ["view", "approve"],
    },
    "Support Agent": {
        ticketing: ["view", "create", "edit", "delete"],
    },
    "Inventory Manager": {
        inventory: ["view", "create", "edit", "delete"],
    },
    "Asset Manager": {
        fixed_assets: ["view", "create", "edit", "delete"],
    },
    "Sales Manager": {
        sales: ["view", "create", "edit", "delete"],
        crm: ["view", "create", "edit", "delete"],
    },
    "CRM Manager": {
        crm: ["view", "create", "edit", "delete"],
    },
};

// Map module IDs to sidebar paths
const MODULE_TO_PATH = {
    employees: "/hr/employees",
    departments: "/hr/departments",
    positions: "/hr/positions",
    attendance: "/hr/attendance",
    leave: "/hr/leave",
    payroll: "/hr/payroll",
    benefits: "/hr/benefits",
    loans: "/hr/loans",
    compliance: "/hr/compliance",
    onboarding: "/hr/onboarding",
    accounting: "/accounting",
    ticketing: "/ticketing",
    inventory: "/inventory",
    fixed_assets: "/fixed-assets",
    sales: "/sales",
    procurement: "/procurement",
    crm: "/crm",
    expenses: "/expenses",
};

export class Permissions {
    constructor(permissionsJson, role) {
        this.role = role || "";
        if (typeof permissionsJson === "string") {
            try { this.perms = JSON.parse(permissionsJson) || {}; }
            catch { this.perms = {}; }
        } else {
            this.perms = permissionsJson || {};
        }
    }

    isSuperAdmin() {
        return this.role === "superadmin" || this.role === "admin";
    }

    isSelfServiceOnly() {
        if (this.isSuperAdmin()) return false;
        return Object.keys(this.perms).length === 0;
    }

    // Check if user has a specific function on a module
    can(module, fn) {
        if (this.isSuperAdmin()) return true;
        const fns = this.perms[module];
        if (!fns || !Array.isArray(fns)) return false;
        return fns.includes(fn);
    }

    // Check if user has ANY permission on a module
    canAny(module) {
        if (this.isSuperAdmin()) return true;
        const fns = this.perms[module];
        return Array.isArray(fns) && fns.length > 0;
    }

    // Get all functions for a module
    getFunctions(module) {
        if (this.isSuperAdmin()) return MODULE_REGISTRY[module]?.functions || [];
        return this.perms[module] || [];
    }

    // Get module IDs visible in sidebar
    getVisibleModules() {
        if (this.isSuperAdmin()) return Object.keys(MODULE_REGISTRY);
        const visible = new Set(SELF_SERVICE_MODULES);
        for (const mod of Object.keys(this.perms)) {
            if (Array.isArray(this.perms[mod]) && this.perms[mod].length > 0) {
                visible.add(mod);
            }
        }
        return [...visible];
    }

    // Check if user can see a specific sidebar path
    canAccessPath(path) {
        if (this.isSuperAdmin()) return true;
        for (const [mod, p] of Object.entries(MODULE_TO_PATH)) {
            if (path === p || path.startsWith(p + "/")) {
                return this.canAny(mod) || SELF_SERVICE_MODULES.includes(mod);
            }
        }
        return path === "/dashboard" || path === "/hr";
    }

    // Get raw permissions object
    toJSON() {
        return { ...this.perms };
    }
}

// Helper to create Permissions instance from localStorage
export function getPermissions() {
    const company = JSON.parse(localStorage.getItem("ls_company") || "{}");
    const access = JSON.parse(localStorage.getItem("ls_access") || "{}");
    return new Permissions(access.permissions, company.role);
}

// Function label helpers
export function fnLabel(fn) {
    const labels = {
        view: "View", create: "Create", edit: "Edit", delete: "Delete",
        approve: "Approve", reject: "Reject", account: "Manage Account",
        settings: "Settings", payments: "Record Payments",
        close: "Close Periods", pay: "Pay Out",
    };
    return labels[fn] || fn;
}

// Function color helpers
export function fnColor(fn) {
    const colors = {
        view: "#0ea5e9", create: "#22c55e", edit: "#f59e0b", delete: "#ef4444",
        approve: "#22c55e", reject: "#ef4444", account: "#8b5cf6",
        settings: "#6366f1", payments: "#14b8a6",
        close: "#a855f7", pay: "#14b8a6",
    };
    return colors[fn] || "#999";
}
