import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { I } from "../../layouts/ERPLayout";
import "./ai.css";

/* ================================================================
   ASSISTANT — the prompt-first entry surface.

   Reads run server-side and come back answered. Writes never do: they arrive
   as `pending` actions and are executed only when the user confirms, which is
   the whole safety model. See the ConfirmCard comment for why this component
   renders the arguments rather than the model's prose about them.
================================================================ */

async function aiApi(action, body = {}) {
    const url = (import.meta.env.VITE_API_BASE || "") + "/api/execute";
    const session = localStorage.getItem("ls_session");
    const res = await fetch(`${url}?action=${action}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(session ? { Authorization: `Bearer ${session}` } : {}),
        },
        body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
        const err = new Error(json?.error || `Request failed (${res.status})`);
        err.status = res.status;
        throw err;
    }
    return json.data;
}

/* Starter prompts. Chosen to be things the registry can actually do — a
   suggestion that leads to "I can't do that" is worse than no suggestion. */
const SUGGESTIONS = [
    "Who is off next week?",
    "Show me the timesheet for last month",
    "What expense claims are waiting for approval?",
    "How many people are in each department?",
];

/* Field labels. The wire names are correct but not what a person calls them. */
const LABELS = {
    // Mirrors the field labels in hr/employee.jsx exactly — including the title
    // case. An earlier pass edited the ID card's label map instead of this one,
    // so the detail card still said "First name" and "Birthday" where the HR
    // page says "First Name" and "Date of Birth".
    first_name: "First Name",
    middle_name: "Middle Name",
    last_name: "Last Name",
    birthday: "Date of Birth",
    address: "Address",
    department: "Department",
    position: "Position",
    // Divergence from those labels means the same field is named two different
    // things in two parts of one product.
    email: "Email Address",
    phone: "Phone Number",
    basic_salary: "Basic Monthly Salary",
    sss_no: "SSS Number",
    philhealth_no: "PhilHealth Number",
    pagibig_no: "Pag-IBIG Number",
    tin: "TIN",
    bank_name: "Bank Name",
    bank_account: "Account Number",
    joined_date: "Start Date",
    employment_type: "Type",
    employee_id: "Employee",
    leave_type: "Leave type",
    start_date: "From",
    end_date: "To",
    days: "Days",
    reason: "Reason",
    id: "Record",
    status: "Status",
    rejection_note: "Reason",
    title: "Title",
    purpose: "Purpose",
    claim_date: "Date",
    payment_method: "Paid by",
    notes: "Notes",
    lines: "Items",
    amount: "Amount",
    tax_amount: "Tax",
    merchant: "Merchant",
    receipt_no: "Receipt no.",
    description: "Description",
    expense_date: "Date",
    category_id: "Category",
    account_id: "Account",
    date_from: "From",
    date_to: "To",
};
const label = (k) => LABELS[k] || k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/* Human titles for the proposed action. Falls back to the action name so a
   newly-registered tool still renders something sensible. */
const ACTION_TITLES = {
    create_leave: "File a leave request",
    approve_leave: "Approve a leave request",
    clock_in: "Clock someone in",
    clock_out: "Clock someone out",
    create_exp_claim: "File an expense claim",
};
const actionTitle = (a) => ACTION_TITLES[a] || a.replace(/_/g, " ");

const isId = (k) => k === "id" || k.endsWith("_id");

/* ---- Attachments -----------------------------------------------------------
   Phone cameras produce 12MP JPEGs of 5-10MB. A receipt is legible at a
   fraction of that, and every byte costs upload time, base64 inflation (+33%),
   and image tokens at the model. So images are downscaled in the browser before
   they are ever sent — it is the difference between a scan that takes a moment
   and one that looks broken.

   The server independently enforces its own limits; this is about not sending
   pointless data, not about trusting the client. */
const MAX_ATTACHMENTS = 4; // matches the server's cap
const MAX_EDGE = 1600; // long edge, px — ample for printed or written text
const JPEG_QUALITY = 0.82;

function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(new Error("could not read that file"));
        r.readAsDataURL(file);
    });
}

function downscaleImage(file) {
    return new Promise((resolve, reject) => {
        // A data: URL, NOT URL.createObjectURL.
        //
        // createObjectURL yields a blob: URL, and the production Electron CSP
        // allows `img-src 'self' data: https:` with no blob:. The image simply
        // never loads and onerror fires — which surfaces to the user as "that
        // file is not a readable image" about a perfectly good PNG. The dev CSP
        // is permissive enough to include blob:, so this only breaks in a
        // packaged build.
        //
        // Widening the CSP would have fixed it too. Not needing blob: at all is
        // better than allowing it.
        readAsDataURL(file)
            .then((dataUrl) => {
                const img = new Image();
                img.onload = () => {
                    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
                    // Already small: re-encoding would only lose quality.
                    if (scale === 1 && file.size < 1_500_000) {
                        resolve({ dataUrl, w: img.width, h: img.height });
                        return;
                    }
                    const w = Math.round(img.width * scale),
                        h = Math.round(img.height * scale);
                    const canvas = document.createElement("canvas");
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext("2d");
                    // Better resampling for text, which is what these images always are.
                    ctx.imageSmoothingQuality = "high";
                    ctx.drawImage(img, 0, 0, w, h);
                    resolve({
                        dataUrl: canvas.toDataURL("image/jpeg", JPEG_QUALITY),
                        w,
                        h,
                    });
                };
                img.onerror = () => reject(new Error("that file is not a readable image"));
                img.src = dataUrl;
            })
            .catch(reject);
    });
}

/* Field order for the confirmation card.
   Object key order comes from the model's JSON, which is arbitrary — the first
   render put "To" above "From". A card someone is meant to READ before
   approving cannot present its fields in a random order, so the important ones
   are pinned and anything unlisted follows. */
const FIELD_ORDER = [
    "employee_id",
    "id",
    "title",
    "leave_type",
    "status",
    "start_date",
    "end_date",
    "claim_date",
    "expense_date",
    "days",
    "amount",
    "tax_amount",
    "payment_method",
    "merchant",
    "receipt_no",
    "category_id",
    "account_id",
    "purpose",
    "description",
    "reason",
    "rejection_note",
    "notes",
    "lines",
];
function orderFields(obj) {
    const keys = Object.keys(obj || {});
    return keys.sort((a, b) => {
        const ia = FIELD_ORDER.indexOf(a),
            ib = FIELD_ORDER.indexOf(b);
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    });
}

/* Resolving ids to names is not cosmetic.
   The card exists so a human can check the assistant got it right, and a raw
   UUID lets them check nothing — "9c86b2bf-84f4…" is unverifiable, so someone
   approves on trust, which is the failure the confirm step is supposed to
   prevent. The id is still what gets SENT; only the display changes. */
async function loadNameMap(pending) {
    const needs = (k) => pending.some((p) => JSON.stringify(p.summary || {}).includes(k));
    const map = {};
    try {
        if (needs("employee_id")) {
            const d = await aiApi("get_employees");
            const all = d?.employees || [];

            // Count first+last collisions so same-named people can be told
            // apart on the card. Two "Ana Cruz" rows render identically
            // otherwise, and the whole point of showing a name instead of a
            // UUID is that the reader can verify who this is.
            const short = (e) =>
                [e.first_name, e.last_name].filter(Boolean).join(" ").toLowerCase();
            const counts = {};
            for (const e of all) counts[short(e)] = (counts[short(e)] || 0) + 1;

            for (const e of all) {
                // The whole name, middle included — frequently the only thing
                // separating two people who share a first and last name.
                const full = [e.first_name, e.middle_name, e.last_name].filter(Boolean).join(" ");
                if (!e.id || !full) continue;
                const extra =
                    counts[short(e)] > 1
                        ? [e.department, e.position].filter(Boolean).join(", ")
                        : "";
                map[e.id] = extra ? `${full} — ${extra}` : full;
            }
        }
    } catch {
        /* a failed lookup just leaves the raw id visible */
    }
    try {
        if (needs("account_id")) {
            const d = await aiApi("get_accounts", {});
            for (const a of d?.accounts || []) {
                if (a.id) map[a.id] = [a.code, a.name].filter(Boolean).join(" — ");
            }
        }
    } catch {
        /* same */
    }
    return map;
}

/* ================================================================
   CONFIRM CARD
   Renders the VALIDATED ARGUMENTS the server will send — never the model's
   narration. The two can disagree, and only the arguments are real; a card
   that showed the prose would let someone approve a write they never read.

   Editing matters as much as approving: a corrected value is submitted with
   verdict "edited", which is the highest-signal row in the training set —
   a prompt the model nearly got right, plus the human's correction.
================================================================ */
function ConfirmCard({ pending, exampleId, onDone }) {
    const [edited, setEdited] = useState(() => pending.map((p) => ({ ...p.summary })));
    const [editing, setEditing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const [names, setNames] = useState({});

    useEffect(() => {
        loadNameMap(pending).then(setNames);
    }, [pending]);

    const setField = (i, k, v) =>
        setEdited((prev) => prev.map((row, ix) => (ix === i ? { ...row, [k]: v } : row)));

    async function submit(verdict) {
        setBusy(true);
        try {
            // Cancelling executes nothing but is still recorded: a run of
            // cancellations on one action is how a bad tool description shows up.
            const actions =
                verdict === "cancelled"
                    ? []
                    : pending.map((p, i) => ({
                          action: p.action,
                          args: editing ? edited[i] : p.args,
                      }));
            const data = await aiApi("ai_confirm", {
                example_id: exampleId,
                verdict,
                actions,
            });
            setResult({ ok: verdict !== "cancelled", data, verdict });
            onDone?.(verdict, data);
        } catch (e) {
            setResult({ ok: false, error: e.message });
        } finally {
            setBusy(false);
        }
    }

    if (result) {
        const cancelled = result.verdict === "cancelled";
        return (
            <div className={"ai-done" + (result.ok ? "" : " no")}>
                <I name={result.ok ? "check" : cancelled ? "x" : "alert-triangle"} size={13} />
                {result.error
                    ? result.error
                    : cancelled
                      ? "Cancelled — nothing was saved."
                      : `Done — ${result.data?.executed || 0} action${result.data?.executed === 1 ? "" : "s"} completed.`}
            </div>
        );
    }

    return (
        <div className="ai-confirm">
            <div className="ai-confirm-h">
                <I name="alert-triangle" size={12} />
                {pending.length === 1
                    ? actionTitle(pending[0].action)
                    : `${pending.length} actions to confirm`}
            </div>

            <div className="ai-confirm-b">
                {pending.map((p, i) => (
                    <div key={p.id || i}>
                        {pending.length > 1 && (
                            <div className="ai-fld">
                                <span className="ai-fld-k">Action</span>
                                <span className="ai-fld-v">{actionTitle(p.action)}</span>
                            </div>
                        )}
                        {orderFields(editing ? edited[i] : p.summary).map((k) => (
                            <Field
                                key={k}
                                k={k}
                                v={(editing ? edited[i] : p.summary)[k]}
                                editing={editing}
                                names={names}
                                onChange={(nv) => setField(i, k, nv)}
                            />
                        ))}
                    </div>
                ))}
            </div>

            <div className="ai-confirm-a">
                <button
                    className="ai-btn-go"
                    disabled={busy}
                    onClick={() => submit(editing ? "edited" : "confirmed")}
                >
                    {busy ? "Saving…" : editing ? "Save changes & submit" : "Confirm & submit"}
                </button>
                {!editing && (
                    <button className="ai-btn-2" disabled={busy} onClick={() => setEditing(true)}>
                        Edit
                    </button>
                )}
                <button className="ai-btn-x" disabled={busy} onClick={() => submit("cancelled")}>
                    Cancel
                </button>
            </div>
        </div>
    );
}

function Field({ k, v, editing, onChange, names = {} }) {
    // Nested line items (an expense claim's lines) get their own block rather
    // than being flattened to JSON — an amount buried in a stringified object
    // is exactly the thing someone approves without reading.
    if (Array.isArray(v)) {
        return (
            <div className="ai-fld">
                <span className="ai-fld-k">{label(k)}</span>
                <span className="ai-fld-v">
                    {v.map((row, i) => (
                        <div className="ai-nested" key={i}>
                            {Object.entries(row || {}).map(([nk, nv]) => (
                                <div className="ai-fld" key={nk}>
                                    <span className="ai-fld-k">{label(nk)}</span>
                                    <span
                                        className={
                                            "ai-fld-v" + (isId(nk) && !names[nv] ? " id" : "")
                                        }
                                    >
                                        {names[nv] || String(nv)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ))}
                </span>
            </div>
        );
    }

    const resolved = !editing && isId(k) ? names[v] : null;

    return (
        <div className="ai-fld">
            <span className="ai-fld-k">{label(k)}</span>
            <span className={"ai-fld-v" + (!editing && isId(k) && !resolved ? " id" : "")}>
                {editing ? (
                    <input value={v ?? ""} onChange={(e) => onChange(e.target.value)} />
                ) : resolved ? (
                    // The id stays visible underneath. It is what will be sent,
                    // and hiding it entirely would mean the card no longer shows
                    // what the server actually receives.
                    <>
                        {resolved}
                        <div className="ai-idsub">{String(v)}</div>
                    </>
                ) : (
                    String(v ?? "—")
                )}
            </span>
        </div>
    );
}

/* ================================================================
   IDENTITY CARD — applying a scanned ID to an employee record

   This exists because of where the encryption boundary sits. An ID card carries
   birth date, address and government numbers, and every one of those is
   encrypted with a company key that lives in this browser and has never been on
   the server. The assistant can READ them off the scan — it did the OCR — but
   it cannot store them.

   So the split is: the server extracts and hands the values back; this
   component encrypts them here and submits the update itself. It deliberately
   does NOT go through ai_confirm, because that path sends arguments to the
   server to execute, which is exactly what must not happen with these fields.

   Every value is editable before saving. That is not politeness — a 3B vision
   model transcribing a TIN can put a wrong digit into a real person's record,
   and the only thing standing between that and the database is someone reading
   this card.
================================================================ */

/* Mirrors the sensitive flags in hr/employee.jsx. A field listed here is
   encrypted before it leaves the browser; anything else is sent in the clear.
   Getting this list wrong in either direction is a real bug — a missing entry
   stores PII in plaintext, a spurious one stores ciphertext in a plaintext
   column. */
const ENCRYPTED_FIELDS = new Set([
    "email",
    "phone",
    "birthday",
    "address",
    "basic_salary",
    "sss_no",
    "philhealth_no",
    "pagibig_no",
    "tin",
    "bank_name",
    "bank_account",
]);

const ID_FIELD_ORDER = [
    "first_name",
    "middle_name",
    "last_name",
    "birthday",
    "address",
    "sss_no",
    "philhealth_no",
    "pagibig_no",
    "tin",
];

const ID_LABELS = {
    first_name: "First Name",
    middle_name: "Middle Name",
    last_name: "Last Name",
    birthday: "Date of Birth",
    address: "Address",
    sss_no: "SSS no.",
    philhealth_no: "PhilHealth no.",
    pagibig_no: "Pag-IBIG no.",
    tin: "TIN",
};

/* Encrypt one value exactly the way hr/employee.jsx does — same AES-GCM, same
   12-byte IV, same {iv, data} base64 shape. Any divergence here produces rows
   the HR module cannot decrypt. */
async function encryptField(companyKey, value) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(String(value));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, companyKey, encoded);
    return {
        iv: btoa(String.fromCharCode(...iv)),
        data: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    };
}

async function loadCompanyKey() {
    const keyB64 = sessionStorage.getItem("ls_company_key");
    if (!keyB64) throw new Error("Your session has no company key — sign out and back in.");
    const raw = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
    return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt"]);
}

function IdentityCard({ doc, onDone }) {
    const [fields, setFields] = useState(() => {
        const f = {};
        for (const k of ID_FIELD_ORDER) if (doc.fields?.[k] != null) f[k] = String(doc.fields[k]);
        return f;
    });
    const [employees, setEmployees] = useState([]);
    const [empId, setEmpId] = useState("");
    // "new" creates a record from the ID; "existing" fills one in. Defaulted
    // from whether the name already appears on the roster, since that is almost
    // always the right answer — but shown as a choice rather than assumed,
    // because guessing wrong either duplicates a person or overwrites one.
    const [mode, setMode] = useState("new");
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);

    useEffect(() => {
        (async () => {
            try {
                const d = await aiApi("get_employees");
                const list = d?.employees || [];
                setEmployees(list);
                // Pre-select on a name match, but never silently — the picker
                // still shows so the choice is visible and changeable.
                const want = [doc.fields?.first_name, doc.fields?.last_name]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();
                const hit =
                    want &&
                    list.find((e) => `${e.first_name} ${e.last_name}`.toLowerCase() === want);
                if (hit) {
                    setEmpId(hit.id);
                    setMode("existing");
                }
            } catch {
                /* picker just stays empty */
            }
        })();
    }, [doc]);

    async function save() {
        setBusy(true);
        try {
            const companyKey = await loadCompanyKey();
            const plain = {};
            const encrypted = {};
            for (const [k, v] of Object.entries(fields)) {
                if (v === "" || v == null) continue;
                if (ENCRYPTED_FIELDS.has(k)) encrypted[k] = await encryptField(companyKey, v);
                else plain[k] = v;
            }
            // Straight to the employee action, NOT through ai_confirm: the
            // encrypted blob must be built here and sent as-is.
            if (mode === "new") {
                await aiApi("create_employee", {
                    ...plain,
                    status: "Active",
                    encrypted,
                });
            } else {
                await aiApi("update_employee", { id: empId, ...plain, encrypted });
            }
            setResult({ ok: true, mode });
            onDone?.();
        } catch (e) {
            setResult({ ok: false, error: e.message });
        } finally {
            setBusy(false);
        }
    }

    if (result?.ok) {
        return (
            <div className="ai-done">
                <I name="check" size={13} />
                {result.mode === "new"
                    ? " New employee created from the ID."
                    : " Saved into the employee record."}
            </div>
        );
    }

    const lowConfidence = doc.confidence > 0 && doc.confidence < 0.6;
    const present = ID_FIELD_ORDER.filter((k) => fields[k] !== undefined);

    // Does the name on the ID match the record it is about to be written into?
    //
    // This is the worst mistake this card can make: a birth date and a TIN
    // filed against the wrong person are both wrong AND encrypted, so nobody
    // notices by glancing at the roster. Comparing on surname alone is
    // deliberately loose — an ID often carries a fuller legal name than the
    // roster does, and a warning that cries wolf gets clicked through.
    const chosen = employees.find((e) => e.id === empId);
    const idLast = String(fields.last_name || "")
        .trim()
        .toLowerCase();
    const recLast = String(chosen?.last_name || "")
        .trim()
        .toLowerCase();
    const nameMismatch = mode === "existing" && chosen && idLast && recLast && idLast !== recLast;
    const idFullName = [fields.first_name, fields.middle_name, fields.last_name]
        .filter(Boolean)
        .join(" ");
    const recFullName = chosen
        ? [chosen.first_name, chosen.middle_name, chosen.last_name].filter(Boolean).join(" ")
        : "";

    return (
        <div className="ai-confirm">
            <div className="ai-confirm-h">
                <I name="shield" size={12} /> Details read from the ID
            </div>

            <div className="ai-confirm-b">
                <div className="ai-fld">
                    <span className="ai-fld-k">Save as</span>
                    <span className="ai-fld-v">
                        <div className="ai-modes">
                            <button
                                className={"ai-mode" + (mode === "new" ? " on" : "")}
                                onClick={() => setMode("new")}
                            >
                                <I name="user-plus" size={12} /> New employee
                            </button>
                            <button
                                className={"ai-mode" + (mode === "existing" ? " on" : "")}
                                onClick={() => setMode("existing")}
                            >
                                <I name="users" size={12} /> Existing employee
                            </button>
                        </div>
                    </span>
                </div>

                {mode === "existing" && (
                    <div className="ai-fld">
                        <span className="ai-fld-k">Save into record</span>
                        <span className="ai-fld-v">
                            <select
                                className="ai-select"
                                value={empId}
                                onChange={(e) => setEmpId(e.target.value)}
                            >
                                <option value="">Choose an employee…</option>
                                {employees.map((e) => (
                                    <option key={e.id} value={e.id}>
                                        {[e.first_name, e.middle_name, e.last_name]
                                            .filter(Boolean)
                                            .join(" ")}
                                        {e.department ? ` — ${e.department}` : ""}
                                    </option>
                                ))}
                            </select>
                        </span>
                    </div>
                )}

                {present.map((k) => (
                    <div className="ai-fld" key={k}>
                        <span className="ai-fld-k">
                            {ID_LABELS[k] || k}
                            {ENCRYPTED_FIELDS.has(k) && <I name="lock" size={9} />}
                        </span>
                        <span className="ai-fld-v">
                            <input
                                value={fields[k]}
                                onChange={(e) => setFields((p) => ({ ...p, [k]: e.target.value }))}
                            />
                        </span>
                    </div>
                ))}
            </div>

            {nameMismatch && (
                <div className="ai-scan-note mismatch">
                    <I name="alert-triangle" size={11} />
                    <span>
                        The ID reads <b>{idFullName}</b>, but you are saving into{" "}
                        <b>{recFullName}</b>. If that is not the same person, change the record
                        first — these fields are encrypted once saved and a mistake is hard to spot.
                    </span>
                </div>
            )}

            <div className="ai-scan-note">
                <I name="alert-triangle" size={11} />
                {lowConfidence
                    ? " This scan was low quality. Check every number against the card before saving."
                    : " Check the numbers against the card — a misread digit is stored as fact."}
            </div>

            {result?.error && (
                <div className="ai-file-err" style={{ padding: "0 14px 8px" }}>
                    {result.error}
                </div>
            )}

            <div className="ai-confirm-a">
                <button
                    className={"ai-btn-go" + (nameMismatch ? " warn" : "")}
                    disabled={
                        busy ||
                        (mode === "existing" && !empId) ||
                        (mode === "new" && !fields.first_name && !fields.last_name)
                    }
                    onClick={save}
                >
                    {busy
                        ? "Encrypting & saving…"
                        : mode === "new"
                          ? idFullName
                              ? `Create ${idFullName}`
                              : "Name is required"
                          : chosen
                            ? `Save into ${recFullName}`
                            : "Choose a record first"}
                </button>
                <button className="ai-btn-x" disabled={busy} onClick={() => onDone?.()}>
                    Discard
                </button>
            </div>
            <div className="ai-lock-note">
                <I name="lock" size={9} /> Locked fields are encrypted in this browser before they
                are sent.
            </div>
        </div>
    );
}

/* ================================================================
   RESULT TABLE
   The answer to "show me the employee list" is the list.

   Having the model recite rows costs a second generation pass — half of a
   fourteen-second turn on the deployment GPU — to produce prose that is worse
   than a table. The rows come back as data and are rendered here; the model
   contributes one caption sentence over the top.
================================================================ */

/* Columns worth showing per action, in order. Anything not listed is hidden
   rather than dumped: a raw row carries ids, encrypted blobs and bookkeeping
   columns that make a table unreadable. */
// Columns are per action. An action absent from this map used to render
// NOTHING — find_employees was added server-side, returned six matching people,
// and the caption said so above a blank space. The fallback below now covers
// any action not listed, so a new one can never again go silently unrendered.
const EMPLOYEE_ACTIONS = new Set(["get_employee", "get_employees", "find_employees"]);

const TABLE_COLUMNS = {
    find_employees: [
        "first_name",
        "middle_name",
        "last_name",
        "department",
        "position",
        "employment_type",
        "status",
    ],
    get_employees: [
        "first_name",
        "middle_name",
        "last_name",
        "department",
        "position",
        "employment_type",
        "status",
    ],
    get_employee: [
        "first_name",
        "middle_name",
        "last_name",
        "department",
        "position",
        "employment_type",
        "status",
        "joined_date",
    ],
    get_departments: ["name", "description"],
    get_positions: ["title", "name", "department", "description"],
    get_leaves: [
        "first_name",
        "last_name",
        "leave_type",
        "start_date",
        "end_date",
        "days",
        "status",
    ],
    get_attendance: ["first_name", "last_name", "date", "time_in", "time_out", "status"],
    get_exp_claims: ["title", "claim_date", "total_amount", "status"],
    get_accounts: ["code", "name", "account_type", "is_active"],
    get_journal_entries: ["entry_no", "entry_date", "description", "status", "total_debit"],
};

/* Tool results arrive either as a bare array or wrapped under a key
   ("employees", "leaves"), depending on the handler. Find the rows either way
   rather than special-casing each action. */
const NOT_A_COLUMN = new Set([
    "id", "company_id", "user_id", "created_at", "updated_at", "is_deleted", "encrypted",
]);

/* Columns inferred from the rows, for an action with no declared set. */
function columnsFromRows(rows) {
    const seen = [];
    for (const r of rows) {
        if (!r || typeof r !== "object") continue;
        for (const k of Object.keys(r)) {
            if (NOT_A_COLUMN.has(k) || k.endsWith("_enc") || k.endsWith("_id")) continue;
            if (Array.isArray(r[k]) || (r[k] && typeof r[k] === "object")) continue;
            if (!seen.includes(k)) seen.push(k);
        }
    }
    return seen.slice(0, 8);
}

function rowsOf(json) {
    if (Array.isArray(json)) return json;
    if (json && typeof json === "object") {
        // A single record is checked FIRST, before any hunt for a nested array.
        //
        // get_employee returns one employee, and that employee carries an
        // enrolled_benefits array of its own. Scanning for "the first array
        // property" found THAT and rendered the benefits in place of the
        // person — and since most employees are enrolled in nothing, the array
        // was empty, so the card vanished entirely. A list response has no id
        // or name at its top level, so it still falls through to the scan.
        if (json.id || json.first_name || json.name) return [json];
        for (const v of Object.values(json)) if (Array.isArray(v)) return v;
    }
    return [];
}

const cell = (v) => {
    if (v === null || v === undefined || v === "") return "—";
    if (typeof v === "boolean") return v ? "Yes" : "No";
    const s = String(v);
    // MySQL hands back full timestamps where only the date matters.
    return /^\d{4}-\d{2}-\d{2}T/.test(s) ? s.slice(0, 10) : s;
};

/* One record is a profile, not a table.
   A single-row table makes the reader match headers to cells horizontally for
   information that reads naturally as a stacked list. Empty fields are kept and
   shown as "—" here, unlike in the table: on a profile "Department: —" tells you
   it is unset, which is worth knowing. */

export /* Fetch the full record and decrypt it here.
   The roster the assistant reads carries only plaintext columns; get_employee
   returns the encrypted blobs as well. The server cannot read those — but this
   browser holds the company key, so the card can show the complete record the
   way the HR page does. Same AES-GCM, same {iv, data} shape. */
async function loadFullEmployee(id) {
    const full = await aiApi("get_employee", { id });
    const keyB64 = sessionStorage.getItem("ls_company_key");
    if (!keyB64 || !full?.encrypted) return full;

    const raw = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
    const companyKey = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
        "decrypt",
    ]);

    const out = { ...full };
    for (const [field, enc] of Object.entries(full.encrypted)) {
        if (!enc?.iv || !enc?.data) continue;
        try {
            const iv = Uint8Array.from(atob(enc.iv), (c) => c.charCodeAt(0));
            const data = Uint8Array.from(atob(enc.data), (c) => c.charCodeAt(0));
            out[field] = new TextDecoder().decode(
                await crypto.subtle.decrypt({ name: "AES-GCM", iv }, companyKey, data),
            );
        } catch {
            // One unreadable field must not blank the rest of the record.
            out[field] = "[cannot decrypt]";
        }
    }
    delete out.encrypted;
    return out;
}

/* The employee panel's own section layout, mirrored field for field.
   hr/employee.jsx groups the record into tabbed sections rather than one long
   list, marks required and encrypted fields with coloured dots, and masks
   sensitive values behind a reveal toggle. The assistant showed the same record
   as a flat stack of key/value rows, so "show me andrew sample details" and
   clicking through to the same employee produced two different-looking screens
   for identical data. Divergence here is the same problem as divergent labels,
   one level up. Keep this in step with the `sections` array in that file. */
const EMPLOYEE_SECTIONS = [
    {
        id: "info",
        title: "Personal Information",
        icon: "users",
        fields: [
            { id: "first_name", required: true },
            { id: "last_name", required: true },
            { id: "middle_name" },
            { id: "email", required: true, sensitive: true },
            { id: "phone", sensitive: true },
            { id: "birthday", sensitive: true },
            { id: "address", sensitive: true, full: true },
        ],
    },
    {
        id: "employment",
        title: "Employment Details",
        icon: "briefcase",
        fields: [
            { id: "department", required: true },
            { id: "position", required: true },
            { id: "joined_date", required: true },
            { id: "employment_type", required: true },
            { id: "status", required: true },
        ],
    },
    {
        id: "compensation",
        title: "Compensation",
        icon: "peso",
        encrypted: true,
        fields: [{ id: "basic_salary", required: true, sensitive: true, prefix: "\u20b1" }],
    },
    {
        id: "government",
        title: "Government IDs",
        icon: "shield",
        encrypted: true,
        fields: [
            { id: "sss_no", sensitive: true },
            { id: "philhealth_no", sensitive: true },
            { id: "pagibig_no", sensitive: true },
            { id: "tin", sensitive: true },
        ],
    },
    {
        id: "bank",
        title: "Bank Details",
        icon: "banknote",
        encrypted: true,
        fields: [
            { id: "bank_name", sensitive: true },
            { id: "bank_account", sensitive: true },
        ],
    },
];

const MASK = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";

/* An employee rendered the way the HR panel renders one. */
function EmployeeDetail({ row }) {
    const [full, setFull] = useState(null);
    const [loadErr, setLoadErr] = useState("");
    const [tab, setTab] = useState("info");
    const [revealed, setRevealed] = useState({});

    // The roster carries only the plaintext columns, so go and get the whole
    // record — "details" that omit salary and contact details are not details.
    useEffect(() => {
        if (!row?.id) return;
        let cancelled = false;
        loadFullEmployee(row.id)
            .then((f) => {
                if (!cancelled) setFull(f);
            })
            .catch((e) => {
                if (!cancelled) setLoadErr(e.message);
            });
        return () => {
            cancelled = true;
        };
    }, [row?.id]);

    const data = full || row;
    const section = EMPLOYEE_SECTIONS.find((x) => x.id === tab) || EMPLOYEE_SECTIONS[0];
    const name =
        [data.first_name, data.middle_name, data.last_name].filter(Boolean).join(" ") ||
        data.name ||
        "\u2014";

    return (
        <div className="ai-ep">
            <div className="ai-ep-head">
                <div className="ai-ep-name">{name}</div>
                <div className="ai-ep-sub">
                    {cell(data.position)} · {cell(data.department)}
                </div>
            </div>

            <div className="ai-ep-tabs">
                {EMPLOYEE_SECTIONS.map((sec) => (
                    <button
                        key={sec.id}
                        className={"ai-ep-tab" + (sec.id === tab ? " on" : "")}
                        onClick={() => setTab(sec.id)}
                    >
                        <I name={sec.icon} size={13} /> {sec.title.split(" ")[0]}
                    </button>
                ))}
            </div>

            <div className="ai-ep-body">
                <div className="ai-ep-sec-head">
                    <h3 className="ai-ep-sec-title">{section.title}</h3>
                    {section.encrypted && (
                        <span className="ai-ep-enc">
                            <I name="lock" size={10} /> Encrypted
                        </span>
                    )}
                </div>

                <div className="ai-ep-fields">
                    {section.fields.map((f) => {
                        const value = data[f.id];
                        const has = value !== null && value !== undefined && value !== "";
                        // Still decrypting: say so rather than showing a blank
                        // where a salary belongs.
                        const waiting = f.sensitive && !full && !loadErr;
                        const masked = f.sensitive && has && !revealed[f.id];
                        return (
                            <div key={f.id} className={"ai-ep-field" + (f.full ? " full" : "")}>
                                <label className="ai-ep-label">
                                    {label(f.id)}
                                    {f.required && <span className="ai-ep-req" />}
                                    {f.sensitive && <span className="ai-ep-dot" />}
                                </label>
                                <div className="ai-ep-value-wrap">
                                    <div className={"ai-ep-value" + (waiting ? " muted" : "")}>
                                        {f.prefix && has && !masked && !waiting && (
                                            <span className="ai-ep-prefix">{f.prefix}</span>
                                        )}
                                        {waiting ? "decrypting\u2026" : masked ? MASK : cell(value)}
                                    </div>
                                    {f.sensitive && has && !waiting && (
                                        <button
                                            type="button"
                                            className="ai-ep-reveal"
                                            title={revealed[f.id] ? "Hide" : "Reveal"}
                                            aria-label={
                                                revealed[f.id] ? "Hide value" : "Reveal value"
                                            }
                                            onClick={() =>
                                                setRevealed((r) => ({ ...r, [f.id]: !r[f.id] }))
                                            }
                                        >
                                            <I name={revealed[f.id] ? "eyeOff" : "eye"} size={12} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {loadErr && (
                    <div className="ai-file-err" style={{ marginTop: 10 }}>
                        {loadErr}
                    </div>
                )}
            </div>

            <div className="ai-ep-foot">
                <span className="ai-ep-leg">
                    <span className="ai-ep-leg-dot req" /> Required
                </span>
                <span className="ai-ep-leg">
                    <span className="ai-ep-leg-dot enc" /> Encrypted
                </span>
            </div>
        </div>
    );
}

function ResultDetail({ action, row }) {
    if (EMPLOYEE_ACTIONS.has(action) && row?.id) {
        return <EmployeeDetail row={row} />;
    }

    // Everything else stays a plain stacked list: only the employee record has
    // a page layout to match.
    const cols = (TABLE_COLUMNS[action] || Object.keys(row)).filter((c) => c !== "id");
    if (!cols.length) return null;

    const title =
        [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(" ") ||
        row.name ||
        row.title ||
        "";

    return (
        <div className="ai-detail">
            {title && <div className="ai-detail-h">{title}</div>}
            <div className="ai-detail-b">
                {cols.map((c) => (
                    <div className="ai-detail-row" key={c}>
                        <span className="ai-detail-k">{label(c)}</span>
                        <span className="ai-detail-v">{cell(row[c])}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function ResultTable({ action, json }) {
    const rows = rowsOf(json);
    if (!rows.length) return null;

    // Exactly one record — a details request.
    if (rows.length === 1 && rows[0] && typeof rows[0] === "object") {
        return <ResultDetail action={action} row={rows[0]} />;
    }

    // Only columns this action declares AND that actually carry a value —
    // a column of dashes is noise.
    // An unlisted action falls back to the keys the rows actually carry, minus
    // the plumbing. Showing a plain table beats showing nothing at all.
    const declared = TABLE_COLUMNS[action] || columnsFromRows(rows);
    const cols = declared.filter((c) =>
        rows.some((r) => r?.[c] !== undefined && r?.[c] !== null && r?.[c] !== ""),
    );
    if (!cols.length) return null;

    // Long results are capped in the DOM; the count line says what was elided
    // so nobody mistakes the visible rows for the whole set.
    const MAX = 50;
    const shown = rows.slice(0, MAX);

    return (
        <div className="ai-table-wrap">
            <div className="ai-table-scroll">
                <table className="ai-table">
                    <thead>
                        <tr>
                            {cols.map((c) => (
                                <th key={c}>{label(c)}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map((r, i) => (
                            <tr key={r?.id || i}>
                                {cols.map((c) => (
                                    <td key={c}>{cell(r?.[c])}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="ai-table-n">
                {rows.length} {rows.length === 1 ? "row" : "rows"}
                {rows.length > MAX ? ` · showing first ${MAX}` : ""}
            </div>
        </div>
    );
}

/* ================================================================
   CHOICE PICKER
   Disambiguation the user settles by clicking, not by typing.

   Relaying "which Ana?" through the model and asking it to interpret a reply
   does not work on a small base model — it answers "Finance" by repeating the
   question. The server already knows the candidates, so the answer never has to
   travel back through the model: clicking re-sends the original request with
   the chosen person stated outright.
================================================================ */
function ChoicePicker({ choice, onPick, disabled }) {
    return (
        <div className="ai-choices">
            {choice.options.map((o) => (
                <button
                    key={o.id}
                    className="ai-choice"
                    disabled={disabled}
                    onClick={() => onPick(choice, o)}
                >
                    <span className="ai-choice-n">{o.label}</span>
                    <span className="ai-choice-d">{o.detail}</span>
                </button>
            ))}
        </div>
    );
}

/* ================================================================
   MAIN
================================================================ */
export default function Assistant() {
    const navigate = useNavigate();
    const [turns, setTurns] = useState([]); // {role, text, pending?, exampleId?, model?, error?}
    const [history, setHistory] = useState([]); // server-side conversation, replayed each turn
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const [disabled, setDisabled] = useState(null);
    const [files, setFiles] = useState([]); // {name, dataUrl, kb}
    const [fileErr, setFileErr] = useState("");
    const boxRef = useRef(null);
    const fileRef = useRef(null);
    const endRef = useRef(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [turns, busy]);

    // Ask once whether this server has an assistant at all. Without this the
    // user sees "What do you need to do?", types a request, and only then finds
    // out the feature does not exist here — the worst order to learn it in.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                await aiApi("ai_training_status");
                if (!cancelled) localStorage.removeItem("ls_ai_off");
            } catch (e) {
                if (cancelled) return;
                // 503 (switched off) or 400 (an older server that has never
                // heard of the action) both mean: no assistant here.
                if (e.status === 503 || e.status === 400) {
                    localStorage.setItem("ls_ai_off", "1");
                    navigate("/dashboard", { replace: true });
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [navigate]);

    async function addFiles(list) {
        setFileErr("");
        const picked = Array.from(list || []);
        if (!picked.length) return;

        const room = MAX_ATTACHMENTS - files.length;
        if (room <= 0) {
            setFileErr(`Up to ${MAX_ATTACHMENTS} images per message.`);
            return;
        }

        const next = [];
        for (const f of picked.slice(0, room)) {
            // PDFs need rasterising before a vision model can read them, which
            // the browser cannot do here — say so rather than failing at the
            // server with a vaguer message.
            if (!f.type.startsWith("image/")) {
                setFileErr(
                    f.type === "application/pdf"
                        ? "PDFs cannot be scanned yet — take a photo of the page instead."
                        : `${f.name} is not an image.`,
                );
                continue;
            }
            try {
                const { dataUrl } = await downscaleImage(f);
                next.push({
                    name: f.name,
                    dataUrl,
                    kb: Math.round((dataUrl.length * 0.75) / 1024),
                });
            } catch (e) {
                setFileErr(`${f.name}: ${e.message}`);
            }
        }
        if (next.length) setFiles((prev) => [...prev, ...next]);
        if (picked.length > room) setFileErr(`Only the first ${room} image(s) were added.`);
    }

    function grow(el) {
        el.style.height = "auto";
        el.style.height = Math.min(el.scrollHeight, 180) + "px";
    }

    async function send(text) {
        const prompt = (text ?? input).trim();
        // An image on its own is a valid request — "here is a receipt" needs no
        // sentence — so a prompt is only required when nothing is attached.
        if ((!prompt && !files.length) || busy) return;

        const attachments = files.map((f) => ({
            filename: f.name,
            data: f.dataUrl,
        }));
        const shown =
            prompt || (files.length === 1 ? "Scan this" : `Scan these ${files.length} images`);

        setInput("");
        setFiles([]);
        setFileErr("");
        if (boxRef.current) boxRef.current.style.height = "auto";
        setTurns((t) => [
            ...t,
            { role: "user", text: shown, images: attachments.map((a) => a.data) },
        ]);
        setBusy(true);

        try {
            const d = await aiApi("ai_prompt", {
                prompt: shown,
                history,
                attachments,
            });
            setHistory(d.history || []);
            setTurns((t) => [
                ...t,
                {
                    role: "ai",
                    text: d.text,
                    pending: d.pending || [],
                    choices: d.choices || [],
                    data: d.data || [],
                    extractions: d.extractions || [],
                    exampleId: d.example_id,
                    model: d.model,
                    // Kept so a picked option can restate the request it came from
                    // rather than relying on the model to remember it.
                    askedFor: prompt,
                },
            ]);
        } catch (e) {
            // 503 means the server has no model configured — a deployment
            // state, not a user error.
            if (e.status === 503) {
                // Remember it, so the next sign-in goes straight to the
                // dashboard rather than bouncing through here.
                localStorage.setItem("ls_ai_off", "1");
                setDisabled(e.message);
            } else setTurns((t) => [...t, { role: "ai", text: e.message, error: true }]);
        } finally {
            setBusy(false);
        }
    }

    // Resolving by restating rather than by follow-up: the id goes into the
    // user turn, where grounding accepts it and no reference resolution is
    // required of the model at all.
    function pick(turn, choice, option) {
        const clarified =
            `${turn.askedFor}\n\n(By "${choice.name}" I mean ${option.label}` +
            `${option.detail ? `, ${option.detail}` : ""} — ${choice.field} is ${option.id}.)`;
        // Start clean: the previous exchange was a question that is now answered,
        // and replaying it invites the model to ask again.
        setHistory([]);
        send(clarified);
    }

    if (disabled) {
        return (
            <div className="ai-off">
                <I name="zap" size={26} />
                <h3>The assistant is switched off</h3>
                <p>{disabled}</p>
                <p style={{ marginTop: 10 }}>
                    Everything else works normally — use the modules from the sidebar.
                </p>
            </div>
        );
    }

    const empty = turns.length === 0;

    const composer = (
        <>
            {/* Thumbnails sit ABOVE the input so what is attached is visible
                while you type the request that refers to it. */}
            {files.length > 0 && (
                <div className="ai-thumbs">
                    {files.map((f, i) => (
                        <div className="ai-thumb" key={i} title={`${f.name} · ${f.kb}KB`}>
                            <img src={f.dataUrl} alt={f.name} />
                            <button
                                className="ai-thumb-x"
                                title="Remove"
                                onClick={() => setFiles((p) => p.filter((_, ix) => ix !== i))}
                            >
                                <I name="x" size={9} />
                            </button>
                            <span className="ai-thumb-kb">{f.kb}KB</span>
                        </div>
                    ))}
                </div>
            )}
            {fileErr && <div className="ai-file-err">{fileErr}</div>}

            <div
                className="ai-composer"
                onDragOver={(e) => {
                    e.preventDefault();
                }}
                onDrop={(e) => {
                    e.preventDefault();
                    addFiles(e.dataTransfer.files);
                }}
            >
                <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(e) => {
                        addFiles(e.target.files);
                        e.target.value = "";
                    }}
                />
                <button
                    className="ai-attach"
                    title="Attach a photo of a receipt or document"
                    disabled={busy || files.length >= MAX_ATTACHMENTS}
                    onClick={() => fileRef.current?.click()}
                >
                    <I name="paperclip" size={14} />
                </button>
                <textarea
                    ref={boxRef}
                    rows={1}
                    placeholder="Ask anything, or say what you want to do…"
                    value={input}
                    onChange={(e) => {
                        setInput(e.target.value);
                        grow(e.target);
                    }}
                    onKeyDown={(e) => {
                        // Enter sends; Shift+Enter is a newline. A multi-line
                        // request is rare enough that requiring a modifier to
                        // send would cost more than it saves.
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            send();
                        }
                    }}
                    onPaste={(e) => {
                        // Pasting a screenshot is the shortest path from a photo
                        // on a phone or a scan on the clipboard to a claim.
                        const imgs = Array.from(e.clipboardData?.files || []).filter((f) =>
                            f.type.startsWith("image/"),
                        );
                        if (imgs.length) {
                            e.preventDefault();
                            addFiles(imgs);
                        }
                    }}
                />
                <button
                    className="ai-send"
                    disabled={busy || (!input.trim() && !files.length)}
                    onClick={() => send()}
                    title="Send"
                >
                    <I name={busy ? "loader" : "chart"} size={13} />
                </button>
            </div>
            <div className="ai-foot">
                <span>The assistant asks before changing anything.</span>
                <button
                    className="ai-chip"
                    style={{ padding: "3px 10px", fontSize: 11 }}
                    onClick={() => navigate("/dashboard")}
                >
                    Browse modules
                </button>
            </div>
        </>
    );

    return (
        <div className="ai-wrap">
            {empty ? (
                <div className="ai-hero">
                    <div>
                        <div className="ai-hero-t">What do you need to do?</div>
                    </div>
                    <div className="ai-hero-s">
                        Ask about your data, describe a task, or attach a photo of a receipt.
                    </div>
                    {composer}
                    <div className="ai-suggest">
                        {SUGGESTIONS.map((s) => (
                            <button key={s} className="ai-chip" onClick={() => send(s)}>
                                {s}
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <>
                    <div className="ai-thread">
                        {turns.map((t, i) =>
                            t.role === "user" ? (
                                <div className="ai-turn-user" key={i}>
                                    {t.images?.length > 0 && (
                                        <div className="ai-turn-imgs">
                                            {t.images.map((src, ix) => (
                                                <img key={ix} src={src} alt="" />
                                            ))}
                                        </div>
                                    )}
                                    {t.text}
                                </div>
                            ) : (
                                <div
                                    className={"ai-turn-ai" + (t.data?.length ? " wide" : "")}
                                    key={i}
                                >
                                    <div className="ai-avatar">
                                        <I name="zap" size={12} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        {t.text && (
                                            <div className={"ai-bubble" + (t.error ? " err" : "")}>
                                                {t.text}
                                            </div>
                                        )}
                                        {t.data?.map((d, di) => (
                                            <ResultTable key={di} action={d.action} json={d.json} />
                                        ))}
                                        {t.extractions
                                            ?.filter((x) => x.kind === "id")
                                            .map((x, xi) => (
                                                <IdentityCard
                                                    key={xi}
                                                    doc={x}
                                                    onDone={() => setHistory([])}
                                                />
                                            ))}
                                        {t.choices?.length > 0 &&
                                            t.choices.map((c) => (
                                                <ChoicePicker
                                                    key={c.field + c.name}
                                                    choice={c}
                                                    disabled={busy}
                                                    onPick={(ch, o) => pick(t, ch, o)}
                                                />
                                            ))}
                                        {t.pending?.length > 0 && (
                                            <ConfirmCard
                                                pending={t.pending}
                                                exampleId={t.exampleId}
                                                // A completed write invalidates whatever was on
                                                // screen, so the next turn starts from the server's
                                                // view rather than a stale local one.
                                                onDone={() => setHistory([])}
                                            />
                                        )}
                                        {t.model && (
                                            <div
                                                className="ai-foot"
                                                style={{
                                                    justifyContent: "flex-start",
                                                    marginTop: 6,
                                                }}
                                            >
                                                <span className="ai-model">
                                                    {/* A tenant on the shared base model behaves
                                                        differently from one on its own adapter, and
                                                        "which model answered this" is the first
                                                        question when output looks wrong. */}
                                                    <span
                                                        className={
                                                            "ai-dot" +
                                                            (t.model.includes("lora")
                                                                ? ""
                                                                : " base")
                                                        }
                                                    />
                                                    {t.model}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ),
                        )}
                        {busy && (
                            <div className="ai-turn-ai">
                                <div className="ai-avatar">
                                    <I name="zap" size={12} />
                                </div>
                                <div className="ai-thinking">
                                    <i />
                                    <i />
                                    <i />
                                </div>
                            </div>
                        )}
                        <div ref={endRef} />
                    </div>
                    {composer}
                </>
            )}
        </div>
    );
}
