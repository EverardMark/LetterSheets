import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faUsers, faBriefcase, faPesoSign, faShieldHalved, faMoneyBill1,
    faHeart, faFaceSmile, faEye, faEyeSlash, faMugSaucer, faTruck, faPhone,
    faBook, faHeartPulse, faStar, faCheck, faMagnifyingGlass, faPlus,
    faLock, faCircleQuestion, faRotate, faKey, faClockRotateLeft,
} from "@fortawesome/pro-light-svg-icons";
import HistoryTab, { canViewHistory } from "../components/HistoryTab";
import { SimpleHint } from "../components/simplemode";

/* Icon mapping for dynamic lookups */
const FA = {
    users: faUsers, briefcase: faBriefcase, peso: faPesoSign,
    shield: faShieldHalved, banknote: faMoneyBill1, heart: faHeart,
    smile: faFaceSmile, eye: faEye, coffee: faMugSaucer, truck: faTruck,
    phone: faPhone, book: faBook, activity: faHeartPulse, star: faStar,
    check: faCheck, search: faMagnifyingGlass, plus: faPlus, lock: faLock,
    key: faKey,
};
import Modal from "../components/Modal";
import PermissionEditor from "../components/PermissionEditor";

/* ================================================================
   COUNTRY CODES & PHONE FORMATTING
================================================================ */
const COUNTRY_CODES = [
    { code: "PH", dial: "+63",  flag: "🇵🇭", name: "Philippines",    format: "XXX XXX XXXX" },
    { code: "US", dial: "+1",   flag: "🇺🇸", name: "United States",  format: "(XXX) XXX-XXXX" },
    { code: "GB", dial: "+44",  flag: "🇬🇧", name: "United Kingdom", format: "XXXX XXXXXX" },
    { code: "JP", dial: "+81",  flag: "🇯🇵", name: "Japan",          format: "XX XXXX XXXX" },
    { code: "KR", dial: "+82",  flag: "🇰🇷", name: "South Korea",    format: "XX XXXX XXXX" },
    { code: "CN", dial: "+86",  flag: "🇨🇳", name: "China",          format: "XXX XXXX XXXX" },
    { code: "IN", dial: "+91",  flag: "🇮🇳", name: "India",          format: "XXXXX XXXXX" },
    { code: "AU", dial: "+61",  flag: "🇦🇺", name: "Australia",      format: "XXX XXX XXX" },
    { code: "NZ", dial: "+64",  flag: "🇳🇿", name: "New Zealand",    format: "XX XXX XXXX" },
    { code: "SG", dial: "+65",  flag: "🇸🇬", name: "Singapore",      format: "XXXX XXXX" },
    { code: "MY", dial: "+60",  flag: "🇲🇾", name: "Malaysia",       format: "XX XXXX XXXX" },
    { code: "TH", dial: "+66",  flag: "🇹🇭", name: "Thailand",       format: "XX XXX XXXX" },
    { code: "VN", dial: "+84",  flag: "🇻🇳", name: "Vietnam",        format: "XXX XXX XXXX" },
    { code: "ID", dial: "+62",  flag: "🇮🇩", name: "Indonesia",      format: "XXX XXXX XXXX" },
    { code: "TW", dial: "+886", flag: "🇹🇼", name: "Taiwan",         format: "XXX XXX XXX" },
    { code: "HK", dial: "+852", flag: "🇭🇰", name: "Hong Kong",      format: "XXXX XXXX" },
    { code: "AE", dial: "+971", flag: "🇦🇪", name: "UAE",            format: "XX XXX XXXX" },
    { code: "SA", dial: "+966", flag: "🇸🇦", name: "Saudi Arabia",   format: "XX XXX XXXX" },
    { code: "DE", dial: "+49",  flag: "🇩🇪", name: "Germany",        format: "XXXX XXXXXXX" },
    { code: "FR", dial: "+33",  flag: "🇫🇷", name: "France",         format: "X XX XX XX XX" },
    { code: "IT", dial: "+39",  flag: "🇮🇹", name: "Italy",          format: "XXX XXX XXXX" },
    { code: "ES", dial: "+34",  flag: "🇪🇸", name: "Spain",          format: "XXX XXX XXX" },
    { code: "PT", dial: "+351", flag: "🇵🇹", name: "Portugal",       format: "XXX XXX XXX" },
    { code: "NL", dial: "+31",  flag: "🇳🇱", name: "Netherlands",    format: "X XXXXXXXX" },
    { code: "BE", dial: "+32",  flag: "🇧🇪", name: "Belgium",        format: "XXX XX XX XX" },
    { code: "SE", dial: "+46",  flag: "🇸🇪", name: "Sweden",         format: "XX XXX XX XX" },
    { code: "NO", dial: "+47",  flag: "🇳🇴", name: "Norway",         format: "XXX XX XXX" },
    { code: "DK", dial: "+45",  flag: "🇩🇰", name: "Denmark",        format: "XX XX XX XX" },
    { code: "FI", dial: "+358", flag: "🇫🇮", name: "Finland",        format: "XX XXX XXXX" },
    { code: "CH", dial: "+41",  flag: "🇨🇭", name: "Switzerland",    format: "XX XXX XX XX" },
    { code: "AT", dial: "+43",  flag: "🇦🇹", name: "Austria",        format: "XXXX XXXXXX" },
    { code: "PL", dial: "+48",  flag: "🇵🇱", name: "Poland",         format: "XXX XXX XXX" },
    { code: "CZ", dial: "+420", flag: "🇨🇿", name: "Czech Republic", format: "XXX XXX XXX" },
    { code: "RO", dial: "+40",  flag: "🇷🇴", name: "Romania",        format: "XXX XXX XXX" },
    { code: "HU", dial: "+36",  flag: "🇭🇺", name: "Hungary",        format: "XX XXX XXXX" },
    { code: "GR", dial: "+30",  flag: "🇬🇷", name: "Greece",         format: "XXX XXX XXXX" },
    { code: "TR", dial: "+90",  flag: "🇹🇷", name: "Turkey",         format: "XXX XXX XXXX" },
    { code: "RU", dial: "+7",   flag: "🇷🇺", name: "Russia",         format: "XXX XXX XX XX" },
    { code: "UA", dial: "+380", flag: "🇺🇦", name: "Ukraine",        format: "XX XXX XX XX" },
    { code: "IL", dial: "+972", flag: "🇮🇱", name: "Israel",         format: "XX XXX XXXX" },
    { code: "EG", dial: "+20",  flag: "🇪🇬", name: "Egypt",          format: "XX XXXX XXXX" },
    { code: "NG", dial: "+234", flag: "🇳🇬", name: "Nigeria",        format: "XXX XXX XXXX" },
    { code: "ZA", dial: "+27",  flag: "🇿🇦", name: "South Africa",   format: "XX XXX XXXX" },
    { code: "KE", dial: "+254", flag: "🇰🇪", name: "Kenya",          format: "XXX XXXXXX" },
    { code: "GH", dial: "+233", flag: "🇬🇭", name: "Ghana",          format: "XX XXX XXXX" },
    { code: "BR", dial: "+55",  flag: "🇧🇷", name: "Brazil",         format: "XX XXXXX XXXX" },
    { code: "MX", dial: "+52",  flag: "🇲🇽", name: "Mexico",         format: "XX XXXX XXXX" },
    { code: "AR", dial: "+54",  flag: "🇦🇷", name: "Argentina",      format: "XX XXXX XXXX" },
    { code: "CL", dial: "+56",  flag: "🇨🇱", name: "Chile",          format: "X XXXX XXXX" },
    { code: "CO", dial: "+57",  flag: "🇨🇴", name: "Colombia",       format: "XXX XXX XXXX" },
    { code: "PE", dial: "+51",  flag: "🇵🇪", name: "Peru",           format: "XXX XXX XXX" },
    { code: "CA", dial: "+1",   flag: "🇨🇦", name: "Canada",         format: "(XXX) XXX-XXXX" },
    { code: "IE", dial: "+353", flag: "🇮🇪", name: "Ireland",        format: "XX XXX XXXX" },
    { code: "PK", dial: "+92",  flag: "🇵🇰", name: "Pakistan",       format: "XXX XXXXXXX" },
    { code: "BD", dial: "+880", flag: "🇧🇩", name: "Bangladesh",     format: "XXXX XXXXXX" },
    { code: "LK", dial: "+94",  flag: "🇱🇰", name: "Sri Lanka",      format: "XX XXX XXXX" },
    { code: "NP", dial: "+977", flag: "🇳🇵", name: "Nepal",          format: "XXX XXXXXXX" },
    { code: "MM", dial: "+95",  flag: "🇲🇲", name: "Myanmar",        format: "XX XXX XXXX" },
    { code: "KH", dial: "+855", flag: "🇰🇭", name: "Cambodia",       format: "XX XXX XXXX" },
    { code: "LA", dial: "+856", flag: "🇱🇦", name: "Laos",           format: "XX XX XXX XXX" },
    { code: "BN", dial: "+673", flag: "🇧🇳", name: "Brunei",         format: "XXX XXXX" },
    { code: "MN", dial: "+976", flag: "🇲🇳", name: "Mongolia",       format: "XXXX XXXX" },
    { code: "QA", dial: "+974", flag: "🇶🇦", name: "Qatar",          format: "XXXX XXXX" },
    { code: "KW", dial: "+965", flag: "🇰🇼", name: "Kuwait",         format: "XXXX XXXX" },
    { code: "BH", dial: "+973", flag: "🇧🇭", name: "Bahrain",        format: "XXXX XXXX" },
    { code: "OM", dial: "+968", flag: "🇴🇲", name: "Oman",           format: "XXXX XXXX" },
    { code: "JO", dial: "+962", flag: "🇯🇴", name: "Jordan",         format: "X XXXX XXXX" },
    { code: "LB", dial: "+961", flag: "🇱🇧", name: "Lebanon",        format: "XX XXX XXX" },
];

/** Strip all non-digits from a string */
const stripDigits = (str) => (str || "").replace(/\D/g, "");

/** Format a digit string according to a pattern like "XXX XXX XXXX" */
function formatPhone(digits, pattern) {
    if (!pattern || !digits) return digits || "";
    let result = "";
    let di = 0;
    for (let i = 0; i < pattern.length && di < digits.length; i++) {
        if (pattern[i] === "X") {
            result += digits[di++];
        } else {
            result += pattern[i];
        }
    }
    return result;
}

/** Get max digits allowed by a pattern */
const maxDigits = (pattern) => (pattern || "").split("").filter(c => c === "X").length;

/** Get display string for a phone value: "+63 912 345 6789" */
function displayPhone(phone, countryCode) {
    if (!phone) return "—";
    const country = COUNTRY_CODES.find(c => c.code === countryCode) || COUNTRY_CODES[0];
    const digits = stripDigits(phone);
    const formatted = formatPhone(digits, country.format);
    return `${country.dial} ${formatted}`;
}

/** Reusable phone input component */
function PhoneInput({ value, countryCode, onChange, onCountryChange, error }) {
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [ddPos, setDdPos] = useState({ top: 0, left: 0 });
    const groupRef = useRef(null);

    const country = COUNTRY_CODES.find(c => c.code === countryCode) || COUNTRY_CODES[0];
    const digits = stripDigits(value);
    const formatted = formatPhone(digits, country.format);
    const max = maxDigits(country.format);

    const handleInput = (e) => {
        const raw = stripDigits(e.target.value);
        onChange(raw.slice(0, max || 15));
    };

    const updatePosition = () => {
        if (groupRef.current) {
            const rect = groupRef.current.getBoundingClientRect();
            const ddHeight = 280;
            const spaceBelow = window.innerHeight - rect.bottom;
            if (spaceBelow >= ddHeight) {
                setDdPos({ top: rect.bottom + 4, left: rect.left });
            } else {
                setDdPos({ top: rect.top - ddHeight - 4, left: rect.left });
            }
        }
    };

    const toggleDropdown = () => {
        if (!dropdownOpen) updatePosition();
        setDropdownOpen(!dropdownOpen);
        setSearch("");
    };

    useEffect(() => {
        if (!dropdownOpen) return;
        window.addEventListener("resize", updatePosition);
        window.addEventListener("scroll", updatePosition, true);
        return () => {
            window.removeEventListener("resize", updatePosition);
            window.removeEventListener("scroll", updatePosition, true);
        };
    }, [dropdownOpen]);

    const filteredCountries = COUNTRY_CODES.filter(c =>
        !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.dial.includes(search) || c.code.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="ep-phone-wrap">
            <div ref={groupRef} className={`ep-phone-group ${error ? "ep-input-err" : ""}`}>
                <button
                    type="button"
                    className="ep-phone-cc-btn"
                    onClick={toggleDropdown}
                >
                    <span className="ep-phone-flag">{country.flag}</span>
                    <span className="ep-phone-dial">{country.dial}</span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <input
                    className="ep-phone-input"
                    type="tel"
                    value={formatted}
                    onChange={handleInput}
                    placeholder={country.format.replace(/X/g, "0")}
                />
            </div>
            {dropdownOpen && createPortal(
                <>
                    <div className="ep-phone-dd-bg" onClick={() => setDropdownOpen(false)} />
                    <div className="ep-phone-dd" style={{ top: ddPos.top, left: ddPos.left }}>
                        <div className="ep-phone-dd-search-wrap">
                            <input
                                className="ep-phone-dd-search"
                                placeholder="Search country..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                autoFocus
                            />
                        </div>
                        <div className="ep-phone-dd-list">
                            {filteredCountries.map(c => (
                                <button
                                    key={c.code + c.dial}
                                    type="button"
                                    className={`ep-phone-dd-item ${c.code === countryCode ? "ep-phone-dd-item-on" : ""}`}
                                    onClick={() => {
                                        onCountryChange(c.code);
                                        setDropdownOpen(false);
                                        const newMax = maxDigits(c.format);
                                        if (digits.length > newMax) onChange(digits.slice(0, newMax));
                                    }}
                                >
                                    <span className="ep-phone-dd-flag">{c.flag}</span>
                                    <span className="ep-phone-dd-name">{c.name}</span>
                                    <span className="ep-phone-dd-dial">{c.dial}</span>
                                </button>
                            ))}
                            {filteredCountries.length === 0 && (
                                <div className="ep-phone-dd-empty">No countries found</div>
                            )}
                        </div>
                    </div>
                </>,
                document.body
            )}
        </div>
    );
}

/* ================================================================
   FIELD DEFINITIONS
   sensitive: true → encrypted with company key before sending
================================================================ */
const sections = [
    {
        id: "info", title: "Personal Information", icon: "users",
        fields: [
            { id: "first_name",   label: "First Name",    type: "text",     required: true,  sensitive: false },
            { id: "last_name",    label: "Last Name",     type: "text",     required: true,  sensitive: false },
            { id: "middle_name",  label: "Middle Name",   type: "text",     required: false, sensitive: false },
            { id: "email",        label: "Email Address",  type: "email",    required: true,  sensitive: true },
            { id: "phone",        label: "Phone Number",   type: "tel",      required: false, sensitive: true },
            { id: "birthday",     label: "Date of Birth",  type: "date",     required: false, sensitive: true },
            { id: "address",      label: "Address",         type: "textarea", required: false, sensitive: true },
        ],
    },
    {
        id: "employment", title: "Employment Details", icon: "briefcase",
        fields: [
            { id: "department",   label: "Department",    type: "select", required: true,  sensitive: false,
                options: "__departments__" },
            { id: "position",     label: "Position",       type: "select",   required: true,  sensitive: false,
                options: "__positions__" },
            { id: "joined_date",  label: "Start Date",     type: "date",   required: true,  sensitive: false },
            { id: "employment_type", label: "Type",        type: "select", required: true,  sensitive: false,
                options: ["Regular","Probationary","Contractual","Part-time"] },
            { id: "status",       label: "Status",         type: "select", required: true,  sensitive: false,
                options: ["Active","On Leave","Suspended","Terminated"] },
        ],
    },
    {
        id: "compensation", title: "Compensation", icon: "peso", encrypted: true, hasBenefits: true,
        fields: [
            { id: "basic_salary",  label: "Basic Monthly Salary", type: "number", required: true,  sensitive: true, prefix: "₱" },
        ],
    },
    {
        id: "government", title: "Government IDs", icon: "shield", encrypted: true,
        fields: [
            { id: "sss_no",        label: "SSS Number",       type: "text", required: false, sensitive: true, placeholder: "XX-XXXXXXX-X" },
            { id: "philhealth_no", label: "PhilHealth Number", type: "text", required: false, sensitive: true, placeholder: "XX-XXXXXXXXX-X" },
            { id: "pagibig_no",    label: "Pag-IBIG Number",   type: "text", required: false, sensitive: true, placeholder: "XXXX-XXXX-XXXX" },
            { id: "tin",           label: "TIN",               type: "text", required: false, sensitive: true, placeholder: "XXX-XXX-XXX-XXX" },
        ],
    },
    {
        id: "bank", title: "Bank Details", icon: "banknote", encrypted: true,
        fields: [
            { id: "bank_name",    label: "Bank Name",      type: "text", required: false, sensitive: true },
            { id: "bank_account",  label: "Account Number", type: "text", required: false, sensitive: true },
        ],
    },
];

/* ================================================================
   BENEFITS SECTION — shown inside employee panel
================================================================ */
const BENEFIT_ICONS = {
    health:"heart", life:"shield", dental:"smile", vision:"eye",
    retirement:"banknote", rice:"coffee", clothing:"briefcase",
    transportation:"truck", meal:"coffee", communication:"phone",
    education:"book", wellness:"activity", other:"star",
};
const BENEFIT_COLORS = {
    health:"#ef4444", life:"#8b5cf6", dental:"#0ea5e9", vision:"#06b6d4",
    retirement:"#f59e0b", rice:"#22c55e", clothing:"#ec4899",
    transportation:"#6366f1", meal:"#f97316", communication:"#14b8a6",
    education:"#3b82f6", wellness:"#10b981", other:"#9ca3af",
};

function BenefitsSection({ benefits, enrolled, isView, onChange }) {
    const toggle = (id) => {
        if (isView) return;
        const next = enrolled.includes(id) ? enrolled.filter(x => x !== id) : [...enrolled, id];
        onChange(next);
    };

    if (benefits.length === 0) {
        return (
            <div className="epb-empty">
                <div className="epb-empty-ic"><FontAwesomeIcon icon={faHeart} style={{fontSize:24}} /></div>
                <div className="epb-empty-t">No benefits available</div>
                <div className="epb-empty-d">Company benefits will appear here once configured.</div>
            </div>
        );
    }

    return (
        <div className="epb-list">
            {isView && enrolled.length === 0 && (
                <div className="epb-none">No benefits assigned to this employee.</div>
            )}
            {(isView ? benefits.filter(b => enrolled.includes(b.id || b.name)) : benefits).map((b, i) => {
                const active = enrolled.includes(b.id || b.name);
                const color = BENEFIT_COLORS[b.type] || "#9ca3af";
                const icon = BENEFIT_ICONS[b.type] || "star";

                if (isView && !active) return null;

                return (
                    <div
                        key={i}
                        className={`epb-item ${active ? "epb-item-on" : ""} ${isView ? "" : "epb-item-toggle"}`}
                        onClick={() => toggle(b.id || b.name)}
                    >
                        <div className="epb-item-ic" style={{background: color + "14", color}}><FontAwesomeIcon icon={FA[icon] || faStar} style={{fontSize:15}} /></div>
                        <div className="epb-item-info">
                            <div className="epb-item-name">{b.name}</div>
                            <div className="epb-item-meta">
                                {b.provider && <span>{b.provider}</span>}
                                {b.coverage && <span>{b.coverage}</span>}
                                {b.employer_cost && <span>₱{Number(b.employer_cost).toLocaleString()}/{b.frequency === "Monthly" ? "mo" : b.frequency === "Yearly" ? "yr" : "mo"}</span>}
                            </div>
                        </div>
                        {!isView && (
                            <div className={`epb-check ${active ? "epb-check-on" : ""}`}>
                                {active && <FontAwesomeIcon icon={faCheck} style={{fontSize:12}} />}
                            </div>
                        )}
                        {isView && (
                            <span className="epb-enrolled-tag">Enrolled</span>
                        )}
                    </div>
                );
            })}
            {!isView && (
                <div className="epb-hint">{enrolled.length} of {benefits.length} benefits selected</div>
            )}
        </div>
    );
}

/* ================================================================
   EMPLOYEES LIST — named export used by overview
================================================================ */
export function Employees({ employees, onAdd, onView }) {
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        if (!search) { setDebouncedSearch(""); setSearching(false); return; }
        setSearching(true);
        const t = setTimeout(() => { setDebouncedSearch(search); setSearching(false); }, 300);
        return () => clearTimeout(t);
    }, [search]);

    const filtered = employees.filter(e => {
        if (!debouncedSearch) return true;
        const q = debouncedSearch.toLowerCase();
        return (e.name || `${e.first_name} ${e.last_name}`).toLowerCase().includes(q)
            || (e.dept || e.department || "").toLowerCase().includes(q)
            || (e.pos || e.position || "").toLowerCase().includes(q);
    });

    const ini = (e) => {
        const n = e.name || `${e.first_name || ""} ${e.last_name || ""}`.trim();
        return n.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
    };
    const displayName = (e) => e.name || `${e.first_name || ""} ${e.last_name || ""}`.trim() || "—";

    return (
        <div className="el-wrap">
            <SimpleHint icon="bulb">Everyone who works here and their details.</SimpleHint>
            <div className="el-bar">
                <div className="el-search-wrap">
                    {searching
                        ? <div className="el-spinner" />
                        : <FontAwesomeIcon icon={faMagnifyingGlass} style={{fontSize:14}} />
                    }
                    <input
                        className="el-search"
                        placeholder="Search employees..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <button className="el-btn-add" onClick={onAdd}>
                    <FontAwesomeIcon icon={faPlus} style={{fontSize:14}} /> Add Employee
                </button>

            </div>

            {searching ? (
                <div className="el-empty">
                    <div className="el-loading-spinner" />
                    <div className="el-empty-t">Searching...</div>
                    <div className="el-empty-d">Looking for matching employees</div>
                </div>
            ) : filtered.length === 0 ? (
                <div className="el-empty">
                    <div className="el-empty-ic"><FontAwesomeIcon icon={faUsers} style={{fontSize:28}} /></div>
                    <div className="el-empty-t">{debouncedSearch ? "No matches found" : "No employees yet"}</div>
                    <div className="el-empty-d">{debouncedSearch ? "Try a different search term." : "Add your first employee to get started."}</div>

                </div>
            ) : (
                <div style={{overflowX:"auto",flex:1,background:"#fff",borderRadius:10}}>
                    <table className="el-tbl">
                        <thead>
                        <tr>
                            <th>Employee</th>
                            <th>Department</th>
                            <th>Position</th>
                            <th>Type</th>
                            <th>Status</th>
                        </tr>
                        </thead>
                        <tbody>
                        {filtered.map(e => (
                            <tr key={e.id} onClick={() => onView(e)} className="el-row">
                                <td>
                                    <div className="el-emp">
                                        <div className="el-av">{ini(e)}</div>
                                        <span className="el-name">{displayName(e)}</span>
                                    </div>
                                </td>
                                <td>{e.dept || e.department || "—"}</td>
                                <td>{e.pos || e.position || "—"}</td>
                                <td><span className="el-tag-type">{e.employment_type || e.type || "—"}</span></td>
                                <td>
                                        <span className={`el-badge ${(e.status||"Active")==="Active"?"el-b-active":"el-b-other"}`}>
                                            {e.status || "Active"}
                                        </span>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            )}

            <style>{employeesListCSS}</style>
        </div>
    );
}

const employeesListCSS = `
  .el-wrap{display:flex;flex-direction:column;min-height:calc(100vh - 54px - 48px)}
  .el-bar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap}
  .el-search-wrap{display:flex;align-items:center;gap:8px;padding:8px 14px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;flex:1;max-width:200px;color:#aaa}
  .el-search{border:none;outline:none;font-family:'DM Sans',sans-serif;font-size:13px;color:#333;flex:1;background:transparent}
  .el-search::placeholder{color:#bbb}
  .el-btn-add{display:flex;align-items:center;gap:5px;padding:9px 18px;border:none;border-radius:8px;background:#2d9e8b;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;color:#fff;cursor:pointer;transition:background .15s;white-space:nowrap}
  .el-btn-add:hover{background:#268a79}

  .el-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:60px 20px;background:#fff;border-radius:10px}
  .el-empty-ic{width:56px;height:56px;border-radius:50%;background:#edf8f5;color:#2d9e8b;display:flex;align-items:center;justify-content:center;margin:0 auto 12px}
  .el-empty-t{font-size:15px;font-weight:700;color:#333;margin-bottom:4px}
  .el-empty-d{font-size:13px;color:#999}

  @keyframes el-spin{to{transform:rotate(360deg)}}
  .el-spinner{width:14px;height:14px;border:2px solid #e0e0e0;border-top-color:#2d9e8b;border-radius:50%;animation:el-spin .6s linear infinite;flex-shrink:0}
  .el-loading-spinner{width:36px;height:36px;border:3px solid #edf8f5;border-top-color:#2d9e8b;border-radius:50%;animation:el-spin .7s linear infinite;margin:0 auto 12px}
  .el-tbl{width:100%;border-collapse:collapse;font-size:13px;background:#fff;border-radius:10px;overflow:hidden}
  .el-tbl thead th{text-align:left;padding:10px 14px;font-size:11px;font-weight:600;color:#999;text-transform:uppercase;letter-spacing:.03em;border-bottom:1px solid #eee;background:#fafbfa}
  .el-tbl tbody td{padding:12px 14px;border-bottom:1px solid #f5f5f5;color:#444}
  .el-row{cursor:pointer;transition:background .1s}
  .el-row:hover{background:#f9fffe}
  .el-emp{display:flex;align-items:center;gap:10px}
  .el-av{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,#2d9e8b,#22c55e);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;text-transform:uppercase}
  .el-name{font-weight:600;color:#222}
  .el-tag-type{font-size:11px;font-weight:600;color:#2d9e8b;background:#edf8f5;padding:2px 8px;border-radius:4px}
  .el-badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}
  .el-b-active{background:#e0faf1;color:#0d9488}
  .el-b-other{background:#fef3c7;color:#d97706}
  @media(max-width:600px){.el-bar{flex-direction:column}.el-search-wrap{max-width:100%}}
`;

/* Check whether an email is already registered (so a login isn't created for an
   email that already belongs to an account). Returns true if it exists. */
async function checkEmailExists(email) {
    const API_URL = (import.meta.env.VITE_API_BASE || "") + "/api/execute";
    const session = localStorage.getItem("ls_session");
    const res = await fetch(`${API_URL}?action=check_email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session}` } : {}) },
        body: JSON.stringify({ email }),
    });
    const json = await res.json();
    return !!(json?.data?.exists);
}

/* ================================================================
   MAIN COMPONENT
   mode: "view" | "add" | "edit"
   employee: existing employee data (for view/edit)
   benefits: company benefits list
   onClose, onSave, onEdit, onDelete
================================================================ */
export default function Employee({ open, mode = "view", employee, benefits = [], departments = [], positions = [], onClose, onSave, onEdit, onDelete }) {
    const [form, setForm] = useState({});
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState({});
    const [activeSection, setActiveSection] = useState(sections[0].id);
    const [currentMode, setCurrentMode] = useState(mode);
    const [createAccount, setCreateAccount] = useState(false);
    const [accountUsername, setAccountUsername] = useState("");
    const [tempPassword, setTempPassword] = useState("");
    const [createdAccount, setCreatedAccount] = useState(null);
    const [resetResult, setResetResult] = useState(null);
    const [resetting, setResetting] = useState(false);
    const [showLinkAccount, setShowLinkAccount] = useState(false);
    const [linkEmail, setLinkEmail] = useState("");
    const [linkUsername, setLinkUsername] = useState("");
    const [linkPassword, setLinkPassword] = useState("");
    const [empPermissions, setEmpPermissions] = useState(null);
    const empPermissionsRef = useRef(null);
    const [savingPerms, setSavingPerms] = useState(false);
    // Which sensitive fields are currently revealed in view mode (id -> bool)
    const [revealed, setRevealed] = useState({});
    const [leaveBalances, setLeaveBalances] = useState([]); // [{leave_type, balance, ...}]
    const toggleReveal = (id) => setRevealed(prev => ({ ...prev, [id]: !prev[id] }));
    // Draft autosave (Add/Edit): true when a cached draft is available to restore.
    const [draftFound, setDraftFound] = useState(false);
    const draftTimer = useRef(null);
    const dirtyRef = useRef(false); // user has changed a field since load (edit-mode gate)
    // Account-email availability check (warn before creating a duplicate login).
    const [emailCheck, setEmailCheck] = useState({ value: "", taken: false, loading: false });

    // Populate form when employee changes
    useEffect(() => {
        if (employee && (mode === "view" || mode === "edit")) {
            setForm({ phone_country_code: "PH", ...employee });
            // Fetch full record with encrypted fields and decrypt
            if (employee.id) {
                (async () => {
                    try {
                        const API_URL = (import.meta.env.VITE_API_BASE||"")+"/api/execute";
                        const session = localStorage.getItem("ls_session");
                        const res = await fetch(`${API_URL}?action=get_employee`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                ...(session ? { Authorization: `Bearer ${session}` } : {}),
                            },
                            body: JSON.stringify({ id: employee.id }),
                        });
                        const json = await res.json();
                        if (!res.ok || !json.success) return;
                        const full = json.data;

                        // Decrypt encrypted fields
                        const keyB64 = sessionStorage.getItem("ls_company_key");
                        if (!keyB64 || !full.encrypted) {
                            setForm(prev => ({ ...prev, ...full }));
                            return;
                        }

                        const keyRaw = Uint8Array.from(atob(keyB64), c => c.charCodeAt(0));
                        const companyKey = await crypto.subtle.importKey("raw", keyRaw, { name: "AES-GCM" }, false, ["decrypt"]);

                        const decrypted = { ...full };
                        for (const [field, enc] of Object.entries(full.encrypted)) {
                            if (enc && enc.iv && enc.data) {
                                try {
                                    const iv = Uint8Array.from(atob(enc.iv), c => c.charCodeAt(0));
                                    const data = Uint8Array.from(atob(enc.data), c => c.charCodeAt(0));
                                    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, companyKey, data);
                                    decrypted[field] = new TextDecoder().decode(plain);
                                } catch {
                                    decrypted[field] = "[decrypt error]";
                                }
                            }
                        }
                        delete decrypted.encrypted;
                        setForm(prev => ({ ...prev, ...decrypted }));
                    } catch (err) {
                        console.warn("Failed to load full employee:", err);
                    }
                })();
            }
        } else {
            setForm({ status: "Active", employment_type: "Regular", phone_country_code: "PH" });
        }
        setCurrentMode(mode);
        setErrors({});
        setRevealed({});
        dirtyRef.current = false;
        setActiveSection(sections[0].id);
        setCreateAccount(false);
        setAccountUsername("");
        setTempPassword("");
        setCreatedAccount(null);
        setResetResult(null);
        setShowLinkAccount(false);
        setLinkEmail("");
        setLinkUsername("");
        setLinkPassword("");
        setEmpPermissions(employee?.permissions || null);
        empPermissionsRef.current = employee?.permissions || null;
        setSavingPerms(false);
        // Load permissions if employee has account
        if (employee?.id && (mode === "view" || mode === "edit")) {
            (async () => {
                try {
                    const API_URL = (import.meta.env.VITE_API_BASE||"")+"/api/execute";
                    const session = localStorage.getItem("ls_session");
                    const res = await fetch(`${API_URL}?action=get_permissions`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session}` } : {}) },
                        body: JSON.stringify({ employee_id: employee.id }),
                    });
                    const json = await res.json();
                    if (res.ok && json.success) {
                        setEmpPermissions(json.data?.permissions || null);
                        empPermissionsRef.current = json.data?.permissions || null;
                    }
                } catch (err) { console.error("load permissions:", err); }
            })();
        }

        // Leave-credit balances for this employee (shown in the Compensation tab).
        setLeaveBalances([]);
        if (employee?.id && (mode === "view" || mode === "edit")) {
            (async () => {
                try {
                    const API_URL = (import.meta.env.VITE_API_BASE || "") + "/api/execute";
                    const session = localStorage.getItem("ls_session");
                    const res = await fetch(`${API_URL}?action=get_leave_balances`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session}` } : {}) },
                        body: JSON.stringify({ employee_id: employee.id }),
                    });
                    const json = await res.json();
                    if (res.ok && json.success) setLeaveBalances(json.data?.accounts || []);
                } catch { /* ignore */ }
            })();
        }
    }, [employee, mode, open]);

    const generateTempPassword = useCallback(() => {
        const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
        let pw = "";
        const arr = crypto.getRandomValues(new Uint8Array(12));
        for (let i = 0; i < 12; i++) pw += chars[arr[i] % chars.length];
        setTempPassword(pw);
        return pw;
    }, []);

    const handleResetEmployeePassword = async () => {
        const userId = form.user_id || employee?.user_id;
        if (!userId) return;
        setResetting(true);
        try {
            const newPassword = generateTempPassword();
            const newSalt = crypto.randomUUID();

            const keyB64 = sessionStorage.getItem("ls_company_key");
            if (!keyB64) {
                alert("Company key not found. Please re-login.");
                setResetting(false);
                return;
            }
            const keyRaw = Uint8Array.from(atob(keyB64), c => c.charCodeAt(0));
            const existingCompanyKey = await crypto.subtle.importKey("raw", keyRaw, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);

            const { deriveKEK, wrapCompanyKey, generateKEMKeyPair, generateDSAKeyPair } = await import("../../utils/crypto");
            const kek = await deriveKEK(newPassword, newSalt);
            const wrappedKey = await wrapCompanyKey(existingCompanyKey, kek);

            const kemPair = generateKEMKeyPair();
            const dsaPair = generateDSAKeyPair();

            const API_URL = (import.meta.env.VITE_API_BASE||"")+"/api/execute";
            const session = localStorage.getItem("ls_session");
            const res = await fetch(`${API_URL}?action=admin_reset_password`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(session ? { Authorization: `Bearer ${session}` } : {}),
                },
                body: JSON.stringify({
                    user_id: userId,
                    password: newPassword,
                    salt: newSalt,
                    wrapped_company_key: Array.from(new Uint8Array(wrappedKey)),
                    key_wrap_algorithm: "AES-KW",
                    key_exchange_algorithm: "ML-KEM-768",
                    public_key: Array.from(kemPair.encapsulationKey),
                    signing_public_key: Array.from(dsaPair.verificationKey),
                }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error || "Reset failed");

            setResetResult({
                email: form.email || "unknown",
                username: json.data?.username || "unknown",
                tempPassword: newPassword,
            });
        } catch (err) {
            alert("Failed to reset password: " + err.message);
        }
        setResetting(false);
    };

    const handleSavePermissions = async (newPerms) => {
        const empId = employee?.id || form.id;
        if (!empId) { alert("No employee_id found"); return; }
        try {
            const API_URL = (import.meta.env.VITE_API_BASE||"")+"/api/execute";
            const session = localStorage.getItem("ls_session");
            const body = JSON.stringify({ employee_id: empId, permissions: newPerms });
            const res = await fetch(`${API_URL}?action=update_permissions`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session}` } : {}) },
                body,
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error || "Failed to save permissions");
        } catch (err) {
            alert("Save error: " + err.message);
        }
    };

    const handleCreateAccountForExisting = async () => {
        if (!linkEmail || !linkUsername || !linkPassword) {
            alert("Email, username, and password are required.");
            return;
        }
        // Final email check at submit (guards against a stale/in-flight input check).
        try {
            if (await checkEmailExists(linkEmail)) {
                setEmailCheck({ value: linkEmail, taken: true, loading: false });
                alert("This email is already registered. Use a different email for the employee's login.");
                return;
            }
        } catch { /* check endpoint unavailable — server still rejects reuse */ }
        setSaving(true);
        try {
            const accountSalt = crypto.randomUUID();

            const keyB64 = sessionStorage.getItem("ls_company_key");
            if (!keyB64) {
                alert("Company key not found. Please re-login.");
                setSaving(false);
                return;
            }
            const keyRaw = Uint8Array.from(atob(keyB64), c => c.charCodeAt(0));
            const existingCompanyKey = await crypto.subtle.importKey("raw", keyRaw, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);

            const { deriveKEK, wrapCompanyKey, generateKEMKeyPair, generateDSAKeyPair } = await import("../../utils/crypto");
            const kek = await deriveKEK(linkPassword, accountSalt);
            const wrappedKey = await wrapCompanyKey(existingCompanyKey, kek);
            const kemPair = generateKEMKeyPair();
            const dsaPair = generateDSAKeyPair();

            const API_URL = (import.meta.env.VITE_API_BASE||"")+"/api/execute";
            const session = localStorage.getItem("ls_session");
            const res = await fetch(`${API_URL}?action=create_employee_account`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(session ? { Authorization: `Bearer ${session}` } : {}),
                },
                body: JSON.stringify({
                    employee_id: employee.id,
                    email: linkEmail,
                    username: linkUsername,
                    password: linkPassword,
                    salt: accountSalt,
                    wrapped_company_key: Array.from(new Uint8Array(wrappedKey)),
                    key_wrap_algorithm: "AES-KW",
                    key_exchange_algorithm: "ML-KEM-768",
                    public_key: Array.from(kemPair.encapsulationKey),
                    signing_public_key: Array.from(dsaPair.verificationKey),
                }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error || "Failed");

            setShowLinkAccount(false);
            setCreatedAccount({
                email: linkEmail,
                username: json.data?.username || linkUsername,
                tempPassword: linkPassword,
                reused: !!json.data?.reused,
            });
        } catch (err) {
            alert("Failed to create account: " + err.message);
        }
        setSaving(false);
    };

    /* ── Draft autosave (Add + Edit) ────────────────────────────────────────
       Recovers an accidentally-closed employee form. Cached in localStorage,
       scoped per company AND per record (an "Add" draft lives under "new";
       each edited employee gets its own key). Sensitive fields are ENCRYPTED
       with the company key (same as a real save) so no plaintext PII sits in
       the cache; non-sensitive fields (name, dept, dates) are stored plainly.
       NOTE: these hooks must stay ABOVE the `if (!open) return null` early
       return — placing hooks after a conditional return breaks the Rules of
       Hooks and blanks the whole app when the modal opens. */
    const draftKey = () => {
        const cid = JSON.parse(localStorage.getItem("ls_company") || "{}").id || "_";
        return `ls_emp_draft_${cid}_${employee?.id || "new"}`;
    };

    const clearDraft = () => {
        if (draftTimer.current) { clearTimeout(draftTimer.current); draftTimer.current = null; }
        try { localStorage.removeItem(draftKey()); } catch { /* ignore */ }
    };

    const saveDraft = async (f) => {
        const fields = sections.flatMap(s => s.fields);
        const plain = {}, enc = {};
        let companyKey = null;
        const keyB64 = sessionStorage.getItem("ls_company_key");
        if (keyB64) {
            try {
                const raw = Uint8Array.from(atob(keyB64), c => c.charCodeAt(0));
                companyKey = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt"]);
            } catch { companyKey = null; }
        }
        for (const fld of fields) {
            const val = f[fld.id];
            if (val === undefined || val === null || val === "") continue;
            if (fld.sensitive) {
                if (!companyKey) continue; // no key → never cache plaintext PII
                const iv = crypto.getRandomValues(new Uint8Array(12));
                const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, companyKey, new TextEncoder().encode(val.toString()));
                enc[fld.id] = {
                    iv: btoa(String.fromCharCode(...iv)),
                    data: btoa(String.fromCharCode(...new Uint8Array(ct))),
                };
            } else {
                plain[fld.id] = val;
            }
        }
        // Only keep a draft once the user has entered something beyond the defaults.
        const DEFAULTS = ["status", "employment_type", "phone_country_code"];
        const meaningful = Object.keys(plain).some(k => !DEFAULTS.includes(k)) || Object.keys(enc).length > 0;
        if (!meaningful) { clearDraft(); return; }
        if (f.phone_country_code) plain.phone_country_code = f.phone_country_code;
        if (f.enrolled_benefits) plain.enrolled_benefits = f.enrolled_benefits;
        try {
            localStorage.setItem(draftKey(), JSON.stringify({ v: 1, savedAt: Date.now(), plain, enc }));
        } catch { /* quota / disabled storage — ignore */ }
    };

    const restoreDraft = async () => {
        let draft = null;
        try { draft = JSON.parse(localStorage.getItem(draftKey()) || "null"); } catch { draft = null; }
        if (!draft) { setDraftFound(false); return; }
        const restored = { ...draft.plain };
        const keyB64 = sessionStorage.getItem("ls_company_key");
        if (keyB64 && draft.enc) {
            try {
                const raw = Uint8Array.from(atob(keyB64), c => c.charCodeAt(0));
                const companyKey = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["decrypt"]);
                for (const [id, e] of Object.entries(draft.enc)) {
                    try {
                        const iv = Uint8Array.from(atob(e.iv), c => c.charCodeAt(0));
                        const data = Uint8Array.from(atob(e.data), c => c.charCodeAt(0));
                        const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, companyKey, data);
                        restored[id] = new TextDecoder().decode(pt);
                    } catch { /* skip a field that won't decrypt */ }
                }
            } catch { /* no/invalid key → restore plain fields only */ }
        }
        setForm(prev => ({ ...prev, ...restored }));
        dirtyRef.current = true; // restored content is a change worth keeping
        setDraftFound(false);
    };

    // Save a draft, but for an EDIT only if the user actually changed something
    // (a pristine, just-opened edit form shouldn't spawn a "restore?" prompt).
    const maybeSaveDraft = () => {
        if (employee && !dirtyRef.current) return;
        saveDraft(form); // fire-and-forget; the localStorage write finishes async
    };

    const closeAddWithDraft = () => {
        if (draftTimer.current) { clearTimeout(draftTimer.current); draftTimer.current = null; }
        maybeSaveDraft();
        onClose();
    };

    // Flag an existing draft when an Add or Edit form opens.
    useEffect(() => {
        if (open && (mode === "add" || mode === "edit")) {
            let has = false;
            try { has = !!localStorage.getItem(draftKey()); } catch { has = false; }
            setDraftFound(has);
        } else {
            setDraftFound(false);
        }
    }, [open, mode]);

    // Debounced autosave while adding/editing (also covers a hard close / crash).
    // Paused while the restore banner is up so it can't wipe the pending draft.
    useEffect(() => {
        if (!open || (currentMode !== "add" && currentMode !== "edit") || draftFound) return;
        if (draftTimer.current) clearTimeout(draftTimer.current);
        draftTimer.current = setTimeout(() => { maybeSaveDraft(); }, 1200);
        return () => { if (draftTimer.current) clearTimeout(draftTimer.current); };
    }, [form, open, currentMode, draftFound]);

    // Debounced check of the account email being entered — the Add-mode
    // create-account form (form.email) or the "Create Account" dialog (linkEmail).
    useEffect(() => {
        const email = showLinkAccount ? linkEmail : (currentMode === "add" && createAccount ? form.email : "");
        const valid = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        if (!valid) { setEmailCheck({ value: email || "", taken: false, loading: false }); return; }
        setEmailCheck(c => ({ ...c, loading: true }));
        const t = setTimeout(async () => {
            try {
                const taken = await checkEmailExists(email);
                setEmailCheck({ value: email, taken, loading: false });
            } catch { setEmailCheck({ value: email, taken: false, loading: false }); }
        }, 400);
        return () => clearTimeout(t);
    }, [showLinkAccount, linkEmail, createAccount, form.email, currentMode]);

    if (!open) return null;

    const isView = currentMode === "view";
    const isEdit = currentMode === "edit";
    const isAdd = currentMode === "add";

    // Is the account email currently entered already registered?
    const activeAccountEmail = showLinkAccount ? linkEmail : form.email;
    const accountEmailTaken = emailCheck.taken && !!emailCheck.value && emailCheck.value === activeAccountEmail;

    const set = (id, val) => {
        dirtyRef.current = true; // a real user edit (loads use setForm directly, not this)
        setForm(prev => ({ ...prev, [id]: val }));
        if (errors[id]) setErrors(prev => { const n = { ...prev }; delete n[id]; return n; });
    };

    const validate = () => {
        const errs = {};
        for (const sec of sections) {
            for (const f of sec.fields) {
                if (f.required && !form[f.id]?.toString().trim()) errs[f.id] = "Required";
            }
        }
        if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = "Invalid email";
        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleSave = async () => {
        if (!validate()) {
            // Jump to first section with error
            for (const sec of sections) {
                if (sec.fields.some(f => errors[f.id])) { setActiveSection(sec.id); break; }
            }
            return;
        }
        // When creating a login account, re-check the email at submit (guards
        // against a stale/in-flight input check).
        if (isAdd && createAccount && form.email) {
            try {
                if (await checkEmailExists(form.email)) {
                    setEmailCheck({ value: form.email, taken: true, loading: false });
                    setActiveSection(sections[sections.length - 1].id); // jump to the account section
                    alert("This email is already registered. Use a different email for the login.");
                    return;
                }
            } catch { /* check endpoint unavailable — server still rejects reuse */ }
        }
        setSaving(true);

        try {
            const keyB64 = sessionStorage.getItem("ls_company_key");
            if (!keyB64) {
                sessionStorage.clear();
                window.location.href = "/";
                return;
            }

            const keyRaw = Uint8Array.from(atob(keyB64), c => c.charCodeAt(0));
            const companyKey = await crypto.subtle.importKey("raw", keyRaw, { name: "AES-GCM" }, false, ["encrypt"]);

            const plainFields = {};
            const encryptedFields = {};

            for (const sec of sections) {
                for (const f of sec.fields) {
                    const val = form[f.id];
                    if (val === undefined || val === null || val === "") continue;
                    if (f.sensitive) {
                        const iv = crypto.getRandomValues(new Uint8Array(12));
                        const encoded = new TextEncoder().encode(val.toString());
                        const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, companyKey, encoded);
                        encryptedFields[f.id] = {
                            iv: btoa(String.fromCharCode(...iv)),
                            data: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
                        };
                    } else {
                        plainFields[f.id] = f.type === "date" ? val.toString().substring(0, 10) : val;
                    }
                }
            }

            const payload = { ...plainFields, encrypted: encryptedFields };
            // Truncate date fields to YYYY-MM-DD
            if (payload.joined_date) payload.joined_date = payload.joined_date.substring(0, 10);
            if (payload.birthday) payload.birthday = payload.birthday.substring(0, 10);
            if (form.enrolled_benefits) payload.enrolled_benefits = form.enrolled_benefits;
            if (form.phone_country_code) payload.phone_country_code = form.phone_country_code;
            if (isEdit && employee?.id) payload.id = employee.id;

            // Account creation: wrap EXISTING company key for new user
            if (isAdd && createAccount && form.email && accountUsername && tempPassword) {
                const accountSalt = crypto.randomUUID();

                const keyB64 = sessionStorage.getItem("ls_company_key");
                if (!keyB64) {
                    alert("Company key not found in session. Please re-login.");
                    setSaving(false);
                    return;
                }
                const keyRaw2 = Uint8Array.from(atob(keyB64), c => c.charCodeAt(0));
                const existingCompanyKey = await crypto.subtle.importKey("raw", keyRaw2, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);

                const { deriveKEK, wrapCompanyKey } = await import("../../utils/crypto");
                const kek = await deriveKEK(tempPassword, accountSalt);
                const wrappedKey = await wrapCompanyKey(existingCompanyKey, kek);

                const { generateKEMKeyPair, generateDSAKeyPair } = await import("../../utils/crypto");
                const kemPair = generateKEMKeyPair();
                const dsaPair = generateDSAKeyPair();

                payload.create_account = true;
                payload.account_email = form.email;
                payload.account_username = accountUsername;
                payload.account_password = tempPassword;
                payload.account_salt = accountSalt;
                payload.wrapped_company_key = Array.from(new Uint8Array(wrappedKey));
                payload.key_wrap_algorithm = "AES-KW";
                payload.key_exchange_algorithm = "ML-KEM-768";
                payload.public_key = Array.from(kemPair.encapsulationKey);
                payload.signing_public_key = Array.from(dsaPair.verificationKey);
            }

            // Call API (separate try/catch for clearer errors)
            try {
                const API_URL = (import.meta.env.VITE_API_BASE||"")+"/api/execute";
                const session = localStorage.getItem("ls_session");
                const action = isAdd ? "create_employee" : "update_employee";
                const res = await fetch(`${API_URL}?action=${action}`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...(session ? { Authorization: `Bearer ${session}` } : {}),
                    },
                    body: JSON.stringify(payload),
                });
                const json = await res.json();
                if (!res.ok || !json.success) throw new Error(json.error || "Save failed");

                if (json.data?.account_created) {
                    setCreatedAccount({
                        email: form.email,
                        username: accountUsername,
                        tempPassword: tempPassword,
                    });
                    onSave?.(json.data?.employee || payload);
                } else {
                    // Save permissions if changed
                    const empId = form.id || employee?.id;
                    const permsToSave = empPermissionsRef.current;
                    if (empId && permsToSave && Object.keys(permsToSave).length > 0) {
                        await handleSavePermissions(permsToSave);
                    }
                    // create_employee returns { employee: {...} }; update_employee returns the flat record.
                    onSave?.(json.data?.employee || json.data || payload);
                    clearDraft();            // add ("new") or this employee's edit draft
                    dirtyRef.current = false;
                    if (isAdd) setForm({ status: "Active", employment_type: "Regular" });
                    onClose();
                }
            } catch (apiErr) {
                console.error("API save failed:", apiErr);
                alert("Failed to save employee: " + apiErr.message);
            }
        } catch (err) {
            console.error("Encryption failed:", err);
            alert("Failed to encrypt employee data.");
        } finally {
            setSaving(false);
        }
    };

    const switchToEdit = () => {
        setCurrentMode("edit");
        dirtyRef.current = false; // fresh edit session — nothing changed yet
        let has = false;
        try { has = !!localStorage.getItem(draftKey()); } catch { has = false; }
        setDraftFound(has); // show the restore banner if this employee has a draft
    };
    // Leaving edit (Cancel / ✕ / Esc) saves a draft of any unsaved changes first.
    const switchToView = () => {
        maybeSaveDraft();
        setCurrentMode("view"); setErrors({}); setRevealed({}); dirtyRef.current = false;
    };

    // Compute display name and tenure
    const displayName = form.first_name && form.last_name
        ? `${form.first_name} ${form.last_name}`
        : form.name || "New Employee";

    const initials = displayName.split(" ").map(w => w[0]).join("").slice(0, 2);

    const tenure = () => {
        const d = form.joined_date || form.joined;
        if (!d) return "—";
        const start = new Date(d);
        const now = new Date();
        const m = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
        return m >= 12 ? `${Math.floor(m / 12)}y ${m % 12}m` : `${m}m`;
    };

    const sensitiveCount = sections.flatMap(s => s.fields).filter(f => f.sensitive).length;
    const currentSection = sections.find(s => s.id === activeSection);
    const hasAccount = !!(form.user_id || employee?.user_id);

    /* ── Shared form content (used in both modal and panel) ── */
    const renderTabs = () => (
        <div className="ep-tabs">
            {sections.map(s => (
                <button
                    key={s.id}
                    className={`ep-tab ${activeSection === s.id ? "ep-tab-on" : ""} ${
                        s.fields.some(f => errors[f.id]) ? "ep-tab-err" : ""
                    }`}
                    onClick={() => setActiveSection(s.id)}
                >
                    <FontAwesomeIcon icon={FA[s.icon] || faStar} style={{fontSize:13}} /> {s.title.split(" ")[0]}
                </button>
            ))}
            {hasAccount && (
                <button
                    className={`ep-tab ${activeSection === "account" ? "ep-tab-on" : ""}`}
                    onClick={() => setActiveSection("account")}
                >
                    <FontAwesomeIcon icon={faKey} style={{fontSize:13}} /> Account
                </button>
            )}
            {hasAccount && (
                <button
                    className={`ep-tab ${activeSection === "permissions" ? "ep-tab-on" : ""}`}
                    onClick={() => setActiveSection("permissions")}
                >
                    <FontAwesomeIcon icon={faShieldHalved} style={{fontSize:13}} /> Permissions
                </button>
            )}
            {canViewHistory() && employee?.id && (
                <button
                    className={`ep-tab ${activeSection === "history" ? "ep-tab-on" : ""}`}
                    onClick={() => setActiveSection("history")}
                >
                    <FontAwesomeIcon icon={faClockRotateLeft} style={{fontSize:13}} /> History
                </button>
            )}
        </div>
    );

    // ── Sensitive-field masking (view mode) ──
    const MASK = "••••••••";
    // In view mode, a sensitive field is masked until the user reveals it.
    const isMasked = (f) => isView && f.sensitive && !revealed[f.id] && !!form[f.id];
    // 👁 toggle shown for sensitive fields that have a value, in view mode only.
    const revealBtn = (f) => (isView && f.sensitive && !!form[f.id]) ? (
        <button
            type="button"
            className="ep-reveal"
            onClick={() => toggleReveal(f.id)}
            title={revealed[f.id] ? "Hide" : "Reveal"}
            aria-label={revealed[f.id] ? "Hide value" : "Reveal value"}
        >
            <FontAwesomeIcon icon={revealed[f.id] ? faEyeSlash : faEye} style={{fontSize:13}} />
        </button>
    ) : null;

    const renderSectionBody = () => {
        if (activeSection === "history") {
            return (
                <div className="ep-sec">
                    <div className="ep-sec-head"><h3 className="ep-sec-title">Change History</h3></div>
                    <HistoryTab table="employees" recordId={employee?.id || form.id} />
                </div>
            );
        }
        if (activeSection === "permissions" && hasAccount) {
            return (
                <div className="ep-sec">
                    <div className="ep-sec-head">
                        <h3 className="ep-sec-title">Permissions</h3>
                    </div>
                    <p style={{fontSize:12, color:"#999", marginBottom:14}}>
                        Toggle modules and functions this employee can access. Self-service is always included.
                    </p>
                    <PermissionEditor
                        permissions={empPermissions}
                        onChange={(newPerms) => { setEmpPermissions(newPerms); empPermissionsRef.current = newPerms; }}
                        disabled={isView}
                    />
                </div>
            );
        }
        if (activeSection === "account" && hasAccount) {
            return (
                <div className="ep-sec">
                    <div className="ep-sec-head">
                        <h3 className="ep-sec-title">Account</h3>
                        <span className="ep-enc-tag"><FontAwesomeIcon icon={faLock} style={{fontSize:11}} /> PQ Encrypted</span>
                    </div>
                    <div className="ep-fields">
                        <div className="ep-field">
                            <label className="ep-label">Email</label>
                            <input className="ep-input" type="email" value={form.account_email || employee?.account_email || form.email || ""} readOnly disabled />
                        </div>
                        <div className="ep-field">
                            <label className="ep-label">Username</label>
                            <input className="ep-input" type="text" value={form.account_username || employee?.account_username || ""} readOnly disabled />
                        </div>
                        <div className="ep-field ep-field-full">
                            <label className="ep-label">Password</label>
                            <input className="ep-input" type="password" value="••••••••••••" readOnly disabled style={{fontFamily:"monospace", letterSpacing:2}} />
                            <span style={{fontSize:11, color:"#999", marginTop:3, display:"block"}}>Password is hashed and cannot be displayed.</span>
                            <button
                                className="ep-btn-warn"
                                onClick={handleResetEmployeePassword}
                                disabled={resetting}
                                style={{marginTop:10}}
                            >
                                <FontAwesomeIcon icon={faKey} style={{fontSize:13}} /> {resetting ? "Resetting..." : "Reset Password"}
                            </button>
                        </div>
                    </div>
                </div>
            );
        }
        return currentSection && (
            <div className="ep-sec">
                <div className="ep-sec-head">
                    <h3 className="ep-sec-title">{currentSection.title}</h3>
                    {currentSection.encrypted && (
                        <span className="ep-enc-tag"><FontAwesomeIcon icon={faLock} style={{fontSize:11}} /> Encrypted</span>
                    )}
                </div>

                <div className="ep-fields">
                    {currentSection.fields.map(f => (
                        <div key={f.id} className={`ep-field ${f.type === "textarea" ? "ep-field-full" : ""}`}>
                            <label className="ep-label">
                                {f.label}
                                {f.required && <span className="ep-req"/>}
                                {f.sensitive && <span className="ep-lock-dot"/>}
                            </label>
                            {f.type === "select" ? (() => {
                                const opts = f.options === "__departments__"
                                    ? departments.map(d => d.name)
                                    : f.options === "__positions__"
                                        ? positions.map(p => p.name)
                                        : f.options;
                                return (
                                    <select
                                        className={`ep-input ${errors[f.id] ? "ep-input-err" : ""}`}
                                        value={form[f.id] || ""}
                                        onChange={e => set(f.id, e.target.value)}
                                        disabled={isView}
                                    >
                                        <option value="">Select...</option>
                                        {opts.map(o => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                );
                            })() : f.type === "textarea" ? (
                                <div className="ep-input-wrap">
                                    <textarea
                                        className={`ep-input ep-textarea ${f.sensitive ? "ep-input-reveal" : ""} ${errors[f.id] ? "ep-input-err" : ""}`}
                                        value={isMasked(f) ? MASK : (form[f.id] || "")}
                                        onChange={e => set(f.id, e.target.value)}
                                        placeholder={f.placeholder || ""}
                                        rows={2}
                                        disabled={isView}
                                    />
                                    {revealBtn(f)}
                                </div>
                            ) : f.id === "phone" ? (
                                isView ? (
                                    <div className="ep-input-wrap">
                                        <input
                                            className="ep-input ep-input-reveal"
                                            value={isMasked(f) ? MASK : (form[f.id] ? displayPhone(form[f.id], form.phone_country_code) : "—")}
                                            disabled
                                        />
                                        {revealBtn(f)}
                                    </div>
                                ) : (
                                    <PhoneInput
                                        value={form.phone || ""}
                                        countryCode={form.phone_country_code || "PH"}
                                        onChange={(val) => set("phone", val)}
                                        onCountryChange={(cc) => set("phone_country_code", cc)}
                                        error={errors.phone}
                                    />
                                )
                            ) : (
                                <div className="ep-input-wrap">
                                    {f.prefix && !isView && <span className="ep-prefix">{f.prefix}</span>}
                                    <input
                                        className={`ep-input ${f.prefix && !isView ? "ep-input-prefixed" : ""} ${isView && f.sensitive ? "ep-input-reveal" : ""} ${errors[f.id] ? "ep-input-err" : ""}`}
                                        type={isView ? "text" : f.type}
                                        value={
                                            isMasked(f) ? MASK :
                                            isView
                                                ? (f.prefix && form[f.id] ? `${f.prefix}${Number(form[f.id]).toLocaleString()}` :
                                                    f.type === "date" && form[f.id] ? new Date(form[f.id]).toLocaleDateString("en-PH", {year:"numeric",month:"long",day:"numeric"}) :
                                                        (form[f.id] || "—"))
                                                : (f.type === "date" && form[f.id] ? form[f.id].substring(0, 10) : (form[f.id] || ""))
                                        }
                                        onChange={e => set(f.id, e.target.value)}
                                        placeholder={f.placeholder || ""}
                                        disabled={isView}
                                    />
                                    {revealBtn(f)}
                                </div>
                            )}
                            {errors[f.id] && <span className="ep-err">{errors[f.id]}</span>}
                        </div>
                    ))}
                </div>

                {/* Benefits list — shown below salary in Compensation tab */}
                {currentSection.hasBenefits && (
                    <>
                        <div className="ep-benefits-divider">
                            <span className="ep-benefits-divider-label">Benefits</span>
                        </div>
                        <BenefitsSection
                            benefits={benefits}
                            enrolled={form.enrolled_benefits || []}
                            isView={isView}
                            onChange={(ids) => set("enrolled_benefits", ids)}
                        />
                    </>
                )}

                {/* Leave balances — accrual-based "days left" per leave type */}
                {currentSection.hasBenefits && isView && leaveBalances.length > 0 && (
                    <>
                        <div className="ep-benefits-divider">
                            <span className="ep-benefits-divider-label">Leave Balances</span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
                            {leaveBalances.map(a => (
                                <div key={a.leave_type} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "10px 14px", background: "#f9fafb", border: "1px solid #eee", borderRadius: 10, minWidth: 130 }}>
                                    <span style={{ fontSize: 11, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".03em" }}>{a.leave_type}</span>
                                    <span style={{ fontSize: 18, fontWeight: 700, color: a.balance < 0 ? "#ef4444" : "#16a34a" }}>{a.balance} <span style={{ fontSize: 12, fontWeight: 500, color: "#999" }}>left</span></span>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {/* Account creation — only in add mode, last section */}
                {isAdd && activeSection === sections[sections.length - 1].id && (
                    <div style={{marginTop: 16, borderTop: "1px solid #eee", paddingTop: 16}}>
                        <div className="ep-sec-head">
                            <h3 className="ep-sec-title">System Account</h3>
                            <span className="ep-enc-tag"><FontAwesomeIcon icon={faLock} style={{fontSize:11}} /> PQ Encrypted</span>
                        </div>
                        <div style={{padding: "12px 0"}}>
                            <label style={{display:"flex", alignItems:"center", gap:10, cursor:"pointer", fontSize:14}}>
                                <input type="checkbox" checked={createAccount} onChange={e => {
                                    setCreateAccount(e.target.checked);
                                    if (e.target.checked && !tempPassword) generateTempPassword();
                                    if (e.target.checked && !accountUsername && form.first_name) {
                                        setAccountUsername((form.first_name + (form.last_name || "")).toLowerCase().replace(/\s+/g, ""));
                                    }
                                }} style={{width:18, height:18, accentColor:"#2d6a4f"}} />
                                <span style={{fontWeight:500, color:"#333"}}>Create login account for this employee</span>
                            </label>
                        </div>
                        {createAccount && (
                            <div className="ep-fields">
                                <div className="ep-field">
                                    <label className="ep-label">Account Email<span className="ep-req"/></label>
                                    <input className={`ep-input ${accountEmailTaken ? "ep-input-err" : ""}`} type="email" value={form.email || ""} onChange={e => set("email", e.target.value)} placeholder="employee@company.com" />
                                    {accountEmailTaken
                                        ? <span style={{fontSize:11, color:"#ef4444", marginTop:3, fontWeight:500}}>This email is already registered — use a different one for the login.</span>
                                        : <span style={{fontSize:11, color:"#999", marginTop:3}}>{emailCheck.loading ? "Checking availability…" : "Uses the email from Personal Information"}</span>}
                                </div>
                                <div className="ep-field">
                                    <label className="ep-label">Username<span className="ep-req"/></label>
                                    <input className="ep-input" type="text" value={accountUsername} onChange={e => setAccountUsername(e.target.value)} placeholder="jdoe" />
                                </div>
                                <div className="ep-field">
                                    <label className="ep-label">Temporary Password</label>
                                    <div className="ep-input-wrap">
                                        <input className="ep-input" type="text" value={tempPassword} readOnly style={{fontFamily:"monospace", letterSpacing:1}} />
                                        <button onClick={generateTempPassword} type="button" title="Regenerate" style={{position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#888", cursor:"pointer", padding:4}}>
                                            <FontAwesomeIcon icon={faRotate} />
                                        </button>
                                    </div>
                                    <span style={{fontSize:11, color:"#999", marginTop:3}}>Share this password with the employee. They should change it on first login.</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    /* ── ADD / EDIT MODE → Modal ── */
    if (isAdd || isEdit) {
        return (
            <Modal
                title={isAdd ? "Add Employee" : "Edit Employee"}
                subtitle={<span style={{userSelect:"none"}}>{sensitiveCount} fields will be end-to-end encrypted <FontAwesomeIcon icon={faCircleQuestion} style={{fontSize:12,cursor:"pointer",opacity:0.6,color:"#f59e0b"}} title="Sensitive fields are encrypted before leaving your device. Only authorized personnel with the decryption key can view them." /></span>}
                onClose={isEdit ? switchToView : closeAddWithDraft}
            >
                <div className="ep-modal-layout">
                    <div className="ep-modal-tabs-bar">
                        {renderTabs()}
                    </div>

                    <div className="ep-modal-scroll">
                        {(isAdd || isEdit) && draftFound && (
                            <div className="ep-draft">
                                <div className="ep-draft-msg">
                                    <FontAwesomeIcon icon={faRotate} style={{fontSize:13}} />
                                    <span>{isEdit ? "You have unsaved changes from before. Restore them?" : "You have an unsaved draft. Restore your previous entries?"}</span>
                                </div>
                                <div className="ep-draft-acts">
                                    <button className="ep-draft-restore" onClick={restoreDraft}>Restore</button>
                                    <button className="ep-draft-discard" onClick={() => { clearDraft(); setDraftFound(false); }}>Discard</button>
                                </div>
                            </div>
                        )}
                        {renderSectionBody()}
                    </div>

                    <div className="ep-modal-foot">
                        <div className="ep-legend">
                            <span className="ep-legend-item"><span className="ep-legend-dot ep-legend-dot-req"></span> Required</span>
                            <span className="ep-legend-item"><span className="ep-legend-dot ep-legend-dot-enc"></span> Encrypted</span>
                        </div>
                        <div className="ep-foot-btns">
                            <button className="ep-btn-cancel" onClick={isEdit ? switchToView : closeAddWithDraft}>Cancel</button>
                            <button className="ep-btn-primary" onClick={handleSave} disabled={saving || (isAdd && createAccount && accountEmailTaken)}>
                                {saving ? "Encrypting..." : isAdd ? (createAccount ? "Save & Create Account" : "Save Employee") : "Save Changes"}
                            </button>
                        </div>
                    </div>
                </div>

                <style>{panelCSS}</style>
            </Modal>
        );
    }

    /* ── VIEW MODE → Modal ── */
    return (
        <Modal
            title={displayName}
            subtitle={<span>{form.position || form.pos || "—"} · {form.department || form.dept || "—"}</span>}
            onClose={onClose}
        >
            <div className="ep-modal-layout">
                <div className="ep-modal-tabs-bar">
                    {renderTabs()}
                </div>

                <div className="ep-modal-scroll">
                    {renderSectionBody()}
                </div>

                <div className="ep-modal-foot">
                    <div className="ep-legend">
                        <span className="ep-legend-item"><span className="ep-legend-dot ep-legend-dot-req"></span> Required</span>
                        <span className="ep-legend-item"><span className="ep-legend-dot ep-legend-dot-enc"></span> Encrypted</span>
                    </div>
                    <div className="ep-foot-btns">
                        {!hasAccount && (
                            <button className="ep-btn-accent" style={{marginRight:"auto"}} onClick={() => {
                                setShowLinkAccount(true);
                                setLinkEmail(form.email || "");
                                setLinkUsername((form.first_name + (form.last_name || "")).toLowerCase().replace(/\s+/g, ""));
                                const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
                                let pw = "";
                                const arr = crypto.getRandomValues(new Uint8Array(12));
                                for (let i = 0; i < 12; i++) pw += chars[arr[i] % chars.length];
                                setLinkPassword(pw);
                            }}>
                                Create Account
                            </button>
                        )}
                        {onDelete && <button className="ep-btn-danger" onClick={() => { onDelete(employee); onClose(); }}>Delete</button>}
                        <button className="ep-btn-primary" onClick={switchToEdit}>Edit</button>
                    </div>
                </div>
            </div>

            {/* Create Account for Existing Employee Dialog */}
            {showLinkAccount && (
                <div className="ep-dialog-overlay">
                    <div className="ep-dialog" style={{textAlign:"left"}}>
                        <h3 style={{textAlign:"center", marginBottom:16}}>Create Account for {form.first_name} {form.last_name}</h3>
                        <div style={{display:"flex", flexDirection:"column", gap:14}}>
                            <div>
                                <label className="ep-label">Email<span className="ep-req"/></label>
                                <input className={`ep-input ${accountEmailTaken ? "ep-input-err" : ""}`} type="email" value={linkEmail} onChange={e => setLinkEmail(e.target.value)} placeholder="employee@company.com" />
                                {accountEmailTaken
                                    ? <span style={{fontSize:11, color:"#ef4444", marginTop:3, display:"block", fontWeight:500}}>This email is already registered — use a different one for the employee's login.</span>
                                    : emailCheck.loading && <span style={{fontSize:11, color:"#999", marginTop:3, display:"block"}}>Checking availability…</span>}
                            </div>
                            <div>
                                <label className="ep-label">Username<span className="ep-req"/></label>
                                <input className="ep-input" type="text" value={linkUsername} onChange={e => setLinkUsername(e.target.value)} placeholder="jdoe" />
                            </div>
                            <div>
                                <label className="ep-label">Temporary Password</label>
                                <input className="ep-input" type="text" value={linkPassword} readOnly style={{fontFamily:"monospace", letterSpacing:1}} />
                                <span style={{fontSize:11, color:"#999", marginTop:3, display:"block"}}>Share this with the employee after creation.</span>
                            </div>
                        </div>
                        <div style={{display:"flex", gap:8, marginTop:20, justifyContent:"flex-end"}}>
                            <button className="ep-btn-cancel" onClick={() => setShowLinkAccount(false)}>Cancel</button>
                            <button className="ep-btn-primary" onClick={handleCreateAccountForExisting} disabled={saving || accountEmailTaken}>
                                {saving ? "Creating..." : "Create Account"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Account Created Dialog */}
            {createdAccount && (
                <div className="ep-dialog-overlay">
                    <div className="ep-dialog">
                        <div style={{color:"#2d6a4f", marginBottom:12}}><FontAwesomeIcon icon={faCheck} style={{fontSize:32}} /></div>
                        <h3>Employee and Account Created</h3>
                        <p>Share these credentials with the employee:</p>
                        <div className="ep-cred-box">
                            <div className="ep-cred-row"><span>Email</span><strong>{createdAccount.email}</strong></div>
                            <div className="ep-cred-row"><span>Username</span><strong>{createdAccount.username}</strong></div>
                            <div className="ep-cred-row"><span>Temporary Password</span><strong style={{fontFamily:"monospace"}}>{createdAccount.tempPassword}</strong></div>
                        </div>
                        <p style={{fontSize:12, color:"#e67700", marginTop:8}}>This password will not be shown again. Make sure to copy it now.</p>
                        <button className="ep-btn-primary" style={{marginTop:16, width:"100%"}} onClick={() => {
                            setCreatedAccount(null);
                            setForm({ status: "Active", employment_type: "Regular" });
                            setCreateAccount(false);
                            setAccountUsername("");
                            setTempPassword("");
                            onClose();
                        }}>Done</button>
                    </div>
                </div>
            )}

            {/* Reset Password Dialog */}
            {resetResult && (
                <div className="ep-dialog-overlay">
                    <div className="ep-dialog">
                        <div style={{color:"#b45309", marginBottom:12}}><FontAwesomeIcon icon={faKey} style={{fontSize:32}} /></div>
                        <h3>Password Reset Complete</h3>
                        <p>Share these new credentials with the employee:</p>
                        <div className="ep-cred-box">
                            <div className="ep-cred-row"><span>Email</span><strong>{resetResult.email}</strong></div>
                            <div className="ep-cred-row"><span>Username</span><strong>{resetResult.username}</strong></div>
                            <div className="ep-cred-row"><span>New Password</span><strong style={{fontFamily:"monospace"}}>{resetResult.tempPassword}</strong></div>
                        </div>
                        <p style={{fontSize:12, color:"#e67700", marginTop:8}}>This password will not be shown again. Make sure to copy it now.</p>
                        <button className="ep-btn-primary" style={{marginTop:16, width:"100%"}} onClick={() => setResetResult(null)}>Done</button>
                    </div>
                </div>
            )}

            <style>{panelCSS}</style>
        </Modal>
    );
}

/* ================================================================
   STYLES
================================================================ */
const panelCSS = `
  button:focus,input:focus,select:focus,textarea:focus,[tabindex]:focus{outline:none}

  /* Section tabs */
  .ep-tabs{display:flex;gap:0;padding:0;overflow-x:auto;justify-content:center}
  .ep-tab{display:flex;align-items:center;gap:5px;padding:10px 14px;border:none;outline:none;background:none;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:500;color:#aaa;cursor:pointer;transition:all .15s;white-space:nowrap}
  .ep-tab:hover{color:#666}
  .ep-tab-on{color:#2d9e8b;font-weight:600}
  .ep-tab-err{color:#ef4444}

  .ep-sec{}
  .ep-sec-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
  .ep-sec-title{font-size:15px;font-weight:700;color:#333}
  .ep-enc-tag{display:flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:#2d9e8b;background:#edf8f5;padding:3px 8px;border-radius:4px}

  /* Edit/Add mode */
  .ep-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .ep-field-full{grid-column:1/-1}

  .ep-label{display:flex;align-items:center;gap:4px;font-size:12px;font-weight:600;color:#666;margin-bottom:5px}
  .ep-req{width:6px;height:6px;border-radius:50%;background:#ef4444;flex-shrink:0;display:inline-block}
  .ep-lock-dot{width:6px;height:6px;border-radius:50%;background:#2d9e8b;flex-shrink:0}

  .ep-input-wrap{display:flex;align-items:center;position:relative}
  .ep-prefix{position:absolute;left:10px;font-size:13px;color:#aaa;font-weight:600;pointer-events:none;z-index:1}
  .ep-input{width:100%;padding:9px 12px;border:1px solid #e0e0e0;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:13px;color:#333;outline:none;transition:border-color .15s;background:#fff;box-sizing:border-box}
  .ep-input-prefixed{padding-left:28px}
  .ep-input:focus{border-color:#2d9e8b;box-shadow:0 0 0 2px rgba(45,158,139,.1)}
  .ep-input:disabled{background:#fafbfa;color:#555;cursor:default}
  .ep-input-err{border-color:#ef4444}
  .ep-input-err:focus{box-shadow:0 0 0 2px rgba(239,68,68,.1)}
  .ep-textarea{resize:vertical;min-height:60px}
  .ep-err{font-size:11px;color:#ef4444;margin-top:2px}

  /* Click-to-reveal toggle for sensitive fields (view mode) */
  .ep-input-reveal{padding-right:38px}
  .ep-reveal{position:absolute;right:6px;top:50%;transform:translateY(-50%);display:flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:none;border-radius:6px;background:transparent;color:#999;cursor:pointer;transition:color .15s,background .15s}
  .ep-reveal:hover{color:#2d9e8b;background:rgba(45,158,139,.08)}
  .ep-textarea ~ .ep-reveal{top:8px;transform:none}

  select.ep-input{appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;padding-right:28px;cursor:pointer}
  select.ep-input:disabled{cursor:default}

  /* Footer */
  .ep-foot{padding:16px 24px;border-top:1px solid #eee;background:#fafbfa}
  .ep-foot-info{display:flex;align-items:center;gap:6px;font-size:11px;color:#2d9e8b;margin-bottom:12px}
  .ep-foot-btns{display:flex;justify-content:flex-end;gap:8px}
  .ep-btn-cancel{padding:9px 18px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;color:#666;cursor:pointer;transition:all .15s}
  .ep-btn-cancel:hover{background:#f5f5f5}
  .ep-btn-primary{display:flex;align-items:center;gap:5px;padding:9px 22px;border:none;border-radius:8px;background:#2d9e8b;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;color:#fff;cursor:pointer;transition:all .15s}
  .ep-btn-primary:hover{background:#268a79}
  .ep-btn-primary:disabled{opacity:.6;cursor:not-allowed}
  .ep-btn-danger{padding:9px 16px;border:1px solid #fecaca;border-radius:8px;background:#fef2f2;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;color:#ef4444;cursor:pointer}
  .ep-btn-danger:hover{background:#ef4444;color:#fff}

  @media(max-width:600px){
    .ep-panel{width:100vw}
    .ep-fields{grid-template-columns:1fr}
    .ep-modal-layout{height:55vh;min-height:350px;max-height:65vh}
  }

  /* Benefits section */
  .epb-list{display:flex;flex-direction:column;gap:8px}
  .epb-item{display:flex;align-items:center;gap:12px;padding:12px;border:1px solid #eee;border-radius:10px;transition:all .15s}
  .epb-item-on{border-color:#d4e8e2;background:#fafffe}
  .epb-item-toggle{cursor:pointer}
  .epb-item-toggle:hover{border-color:#2d9e8b;background:#fafffe}
  .epb-item-ic{width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .epb-item-info{flex:1;min-width:0}
  .epb-item-name{font-size:13px;font-weight:600;color:#333}
  .epb-item-meta{display:flex;gap:8px;font-size:11px;color:#999;margin-top:2px;flex-wrap:wrap}
  .epb-check{width:22px;height:22px;border-radius:6px;border:2px solid #ddd;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s}
  .epb-check-on{background:#2d9e8b;border-color:#2d9e8b;color:#fff}
  .epb-enrolled-tag{font-size:11px;font-weight:600;color:#0d9488;background:#e0faf1;padding:2px 8px;border-radius:4px;flex-shrink:0}
  .epb-hint{font-size:11px;color:#aaa;text-align:center;margin-top:4px}
  .epb-none{font-size:13px;color:#ccc;text-align:center;padding:20px 0}
  .epb-empty{text-align:center;padding:30px 10px}
  .epb-empty-ic{width:48px;height:48px;border-radius:50%;background:#fef2f2;color:#ef4444;display:flex;align-items:center;justify-content:center;margin:0 auto 10px}
  .epb-empty-t{font-size:14px;font-weight:700;color:#444;margin-bottom:4px}
  .epb-empty-d{font-size:12px;color:#999}
  .ep-benefits-divider{display:flex;align-items:center;gap:10px;margin:20px 0 14px}
  .ep-benefits-divider::before,.ep-benefits-divider::after{content:'';flex:1;height:1px;background:#eee}
  .ep-benefits-divider-label{font-size:12px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:.04em}

  /* Phone input with country code */
  .ep-phone-wrap{position:relative}
  .ep-phone-group{display:flex;align-items:center;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;transition:border-color .15s}
  .ep-phone-group:focus-within{border-color:#2d9e8b;box-shadow:0 0 0 2px rgba(45,158,139,.1)}
  .ep-phone-group.ep-input-err{border-color:#ef4444}
  .ep-phone-group.ep-input-err:focus-within{box-shadow:0 0 0 2px rgba(239,68,68,.1)}
  .ep-phone-cc-btn{display:flex;align-items:center;gap:5px;padding:9px 10px;border:none;border-radius:0;background:#fafbfa;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:13px;color:#555;border-right:1px solid #e0e0e0;white-space:nowrap;flex-shrink:0}
  .ep-phone-flag{font-size:16px;line-height:1}
  .ep-phone-dial{font-size:12px;font-weight:600;color:#666}
  .ep-phone-input{flex:1;padding:9px 12px;border:none;outline:none;font-family:'DM Sans',sans-serif;font-size:13px;color:#333;background:transparent;min-width:0}
  .ep-phone-input::placeholder{color:#bbb}

  /* Modal fixed-height layout */
  .ep-modal-layout{display:flex;flex-direction:column;height:60vh;min-height:400px;max-height:70vh}
  .ep-modal-tabs-bar{flex-shrink:0}
  .ep-modal-scroll{flex:1;overflow-y:auto;padding:16px 0 0}
  .ep-modal-foot{flex-shrink:0;padding:16px 0 0;margin-top:auto}

  /* Draft-restore banner (Add mode) */
  .ep-draft{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;padding:10px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px}
  .ep-draft-msg{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:500;color:#92400e}
  .ep-draft-acts{display:flex;gap:8px;flex-shrink:0}
  .ep-draft-restore{padding:6px 14px;border:none;border-radius:7px;background:#2d9e8b;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:600;color:#fff;cursor:pointer}
  .ep-draft-restore:hover{background:#268a79}
  .ep-draft-discard{padding:6px 12px;border:1px solid #fde68a;border-radius:7px;background:#fff;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:500;color:#92400e;cursor:pointer}
  .ep-draft-discard:hover{background:#fef3c7}

  /* Legend */
  .ep-legend{display:flex;align-items:center;gap:14px;margin-bottom:12px}
  .ep-legend-item{display:flex;align-items:center;gap:5px;font-size:11px;color:#999}
  .ep-legend-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
  .ep-legend-dot-req{background:#ef4444}
  .ep-legend-dot-enc{background:#2d9e8b}

  /* Phone dropdown */
  .ep-phone-dd-bg{position:fixed;inset:0;z-index:9998}
  .ep-phone-dd{position:fixed;width:280px;max-height:260px;background:#fff;border:1px solid #e0e0e0;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.1);z-index:9999;display:flex;flex-direction:column;overflow:hidden}
  .ep-phone-dd-search-wrap{padding:8px}
  .ep-phone-dd-search{width:100%;padding:8px 10px;border:1px solid #e8e8e8;border-radius:6px;font-family:'DM Sans',sans-serif;font-size:12px;color:#333;outline:none;box-sizing:border-box}
  .ep-phone-dd-search:focus{border-color:#2d9e8b}
  .ep-phone-dd-search::placeholder{color:#bbb}
  .ep-phone-dd-list{flex:1;overflow-y:auto;padding:0 4px 4px}
  .ep-phone-dd-item{display:flex;align-items:center;gap:8px;width:100%;padding:7px 8px;border:none;background:none;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:12px;color:#444;border-radius:6px;transition:background .1s;text-align:left}
  .ep-phone-dd-item:hover{background:#f5f9f8}
  .ep-phone-dd-item-on{background:#edf8f5;font-weight:600;color:#2d9e8b}
  .ep-phone-dd-flag{font-size:16px;line-height:1;flex-shrink:0}
  .ep-phone-dd-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ep-phone-dd-dial{font-size:11px;color:#999;flex-shrink:0}
  .ep-phone-dd-empty{padding:16px;text-align:center;font-size:12px;color:#bbb}

  .ep-btn-warn{padding:9px 16px;background:#fef3c7;color:#92400e;border:1px solid #fde68a;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:6px}
  .ep-btn-warn:hover{background:#fde68a}
  .ep-btn-warn:disabled{opacity:0.5;cursor:not-allowed}
  .ep-btn-accent{padding:9px 16px;background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:6px}
  .ep-btn-accent:hover{background:#bae6fd}

  .ep-dialog-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:9999}
  .ep-dialog{background:#fff;border-radius:16px;padding:30px;max-width:380px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.15)}
  .ep-dialog h3{font-size:18px;font-weight:700;color:#222;margin-bottom:6px}
  .ep-dialog p{font-size:13px;color:#666;margin-bottom:14px}
  .ep-cred-box{background:#f8faf9;border:1px solid #e0ebe4;border-radius:10px;padding:14px;text-align:left}
  .ep-cred-row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-size:13px}
  .ep-cred-row span{color:#888}
  .ep-cred-row strong{color:#222}
`;
