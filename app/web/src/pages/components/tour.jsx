import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { I } from "../../layouts/ERPLayout";
import { useIsSimple } from "../../utils/uimode";

/* ================================================================
   GUIDED PAGE TOURS

   A lightweight, dependency-free "show me around" walkthrough. Each page that
   opts in registers a list of steps below; a step either points at an element
   on the page (a CSS selector, usually a data-tour="..." hook) or, with no
   target, shows a centred card — handy for intros and outros.

     • First visit to a registered page auto-starts its tour once (remembered
       in localStorage); afterwards the 💡 button in the top bar replays it.
     • Step title/body may adapt to Simple/Advanced: pass a plain string, or
       { simple, advanced } to word it two ways.
     • A step whose target isn't found (hidden, not rendered yet) falls back to
       a centred card instead of breaking.

   To cover a new page: give its key elements data-tour="..." attributes and
   add an entry to TOURS keyed by the exact route path. That's the whole
   contract — no other wiring needed.
================================================================ */

const SEEN_PREFIX = "ls_tour_seen_";
const START_EVENT = "ls-tour-start";

const TOURS = {
    "/dashboard": {
        id: "dashboard",
        label: "Welcome tour",
        steps: [
            { title: "Welcome to LetterSheets 👋", body: "Here's a 20-second tour of the essentials. You can skip anytime — and replay it later from the 💡 button in the top bar." },
            { target: '[data-tour="dash-hi"]', title: "Your daily starting point", body: "This page gathers the key numbers from every part of your business, so you can see where things stand the moment you sign in." },
            { target: '[data-tour="dash-summary"]', title: "Headline numbers", body: "The figures that matter most across your modules — pulled together so you don't have to go looking for them." },
            { target: '[data-tour="dash-modules"]', title: "Module snapshots", body: "Each card sums up one area of the business. Click one to jump straight into that module." },
            { target: ".sb-nav", title: "Your main menu", body: "Everything lives in this sidebar — accounting, people, sales, stock, and more. This is how you move around." },
            { target: ".um-toggle", title: "Simple or Advanced", body: { simple: "You're in Simple mode — plain language, no accounting jargon. Flip to Advanced whenever you want the full detail.", advanced: "You're in Advanced mode — every field and accounting term is shown. Flip to Simple for plain-language labels." } },
            { target: ".tb-bell", title: "Notifications", body: "Approvals, reminders, and alerts land here as they happen." },
            { title: "You're all set 🎉", body: "That's it! Whenever you see the 💡 button in the top bar, click it to replay the guide for that page." },
        ],
    },

    "/accounting": {
        id: "accounting",
        label: "Accounting tour",
        steps: [
            { title: "Your finances, in one place", body: "A quick look at how the Accounting hub is laid out. Skip anytime, or replay later from the 💡 button up top." },
            { target: '[data-tour="acc-stats"]', title: "The four numbers to watch", body: { simple: "Cash you have, money owed to you, bills you owe, and profit so far this year — your financial health at a glance.", advanced: "Cash balance, receivables, payables, and year-to-date net income — the headline figures at a glance." } },
            { target: '[data-tour="acc-recent"]', title: { simple: "Recent transactions", advanced: "Recent journal entries" }, body: { simple: "Every bit of money in or out shows up here as you record it.", advanced: "Your latest postings — each a balanced debit/credit journal entry." } },
            { target: '[data-tour="acc-coa"]', title: { simple: "Your accounts", advanced: "Chart of accounts" }, body: "The categories your money is organised into. Use 'Manage' to set them up." },
            { target: '[data-tour="acc-side"]', title: "Who owes what", body: "Outstanding invoices and bills, what you collected and paid this month, and anything overdue." },
            { target: ".um-toggle", title: "Hide the jargon", body: { simple: "You're in Simple mode, so we say 'Money owed to you' instead of 'Accounts receivable'. Switch to Advanced for the accounting terms.", advanced: "Advanced mode shows full accounting terms. Switch to Simple to swap them for plain language across the whole app." } },
            { title: "That's the tour", body: "Dig into any card, or use the sidebar to open the journal, ledger, and reports. Replay this anytime from the 💡 button." },
        ],
    },

    "/hr": {
        id: "hr",
        label: "HR tour",
        steps: [
            { title: "Your team, at a glance", body: "A quick look around the HR hub. Skip anytime, or replay later from the 💡 button up top." },
            { target: '[data-tour="hr-stats"]', title: "Today's headline numbers", body: "Total headcount, who's in today, who's on leave, and your latest payroll total." },
            { target: '[data-tour="hr-employees"]', title: "Your people", body: "The most recently added employees. Use 'View all' to open the full directory and add someone new." },
            { target: '[data-tour="hr-side"]', title: "What needs attention", body: "Pending leave requests, onboarding in progress, recent payroll, and active loans — the things that usually need a decision." },
            { target: ".sb-nav", title: "Everything HR", body: "Attendance, leave, payroll, benefits, and compliance all live under Human Resource in the sidebar." },
            { title: "That's the tour", body: "Explore any card, or open a sub-section from the sidebar. Replay this anytime from the 💡 button." },
        ],
    },

    "/inventory": {
        id: "inventory",
        label: "Inventory tour",
        steps: [
            { title: "Your stock, at a glance", body: "A quick tour of the Inventory hub. Skip anytime, or replay later from the 💡 button up top." },
            { target: '[data-tour="inv-stats"]', title: "Stock health", body: "How many products you carry, what your stock is worth, and how much is running low or out." },
            { target: '[data-tour="inv-grid"]', title: "What needs attention", body: { simple: "Items running low, and the latest stock coming in or going out.", advanced: "Reorder alerts and your most recent stock movements." } },
            { target: ".sb-nav", title: "Everything inventory", body: "Products, storage locations, movements, and purchase orders all live under Inventory in the sidebar." },
            { title: "That's the tour", body: "Open any card or a sidebar section to dig in. Replay this anytime from the 💡 button." },
        ],
    },

    "/sales": {
        id: "sales",
        label: "Sales tour",
        steps: [
            { title: "How your selling is going", body: "A quick tour of the Sales hub. Skip anytime, or replay later from the 💡 button up top." },
            { target: '[data-tour="sales-stats"]', title: "The numbers that matter", body: { simple: "Open orders, income this month, draft quotes, and anything waiting on stock.", advanced: "Open orders, revenue this month, draft quotes, and pending backorders." } },
            { target: '[data-tour="sales-grid"]', title: "Orders & what's held up", body: { simple: "Your most recent orders, and anything held up waiting for stock.", advanced: "Recent sales orders and lines currently on backorder." } },
            { target: ".sb-nav", title: "Everything sales", body: "Quotes, orders, deliveries, price lists, and credit notes all live under Sales in the sidebar." },
            { title: "That's the tour", body: "Open any card or a sidebar section to dig in. Replay this anytime from the 💡 button." },
        ],
    },

    "/procurement": {
        id: "procurement",
        label: "Procurement tour",
        steps: [
            { title: "Buying for the business", body: "A quick tour of the buying hub — from a request, to a purchase order, to receiving goods. Skip or replay anytime from the 💡 button." },
            { target: '[data-tour="proc-stats"]', title: "Purchasing at a glance", body: { simple: "Open purchase orders and their value, plus what's waiting to be delivered or billed.", advanced: "Open POs and their value, plus orders awaiting receipt or vendor bill." } },
            { target: '[data-tour="proc-grid"]', title: "Orders & next steps", body: "Your recent purchase orders, and the ones that need action — approve, receive, or bill." },
            { target: ".sb-nav", title: "Everything buying", body: { simple: "Requests, purchase orders, receiving, and supplier credit notes all live under Buying in the sidebar.", advanced: "Requisitions, purchase orders, goods receipts, and debit memos all live under Procurement in the sidebar." } },
            { title: "That's the tour", body: "Open any card or a sidebar section to dig in. Replay this anytime from the 💡 button." },
        ],
    },

    "/crm": {
        id: "crm",
        label: "CRM tour",
        steps: [
            { title: "First contact to closed deal", body: "A quick tour of the CRM hub. Skip anytime, or replay later from the 💡 button up top." },
            { target: '[data-tour="crm-stats"]', title: "Pipeline health", body: { simple: "The value of open deals, a realistic weighted figure, your win rate, and new leads.", advanced: "Open pipeline value, probability-weighted value, win rate, and new leads." } },
            { target: '[data-tour="crm-pipeline"]', title: "Deals by stage", body: { simple: "See where your deals sit on the way to closing. Open the board to move them along.", advanced: "Your pipeline broken down by stage. Open the board to drag deals between stages." } },
            { target: ".sb-nav", title: "Everything CRM", body: "Leads, the pipeline board, and follow-up activities all live under CRM in the sidebar." },
            { title: "That's the tour", body: "Open any card or a sidebar section to dig in. Replay this anytime from the 💡 button." },
        ],
    },

    "/expenses": {
        id: "expenses",
        label: "Expenses tour",
        steps: [
            { title: "Staff reimbursements", body: "A quick tour of the Expenses hub, where employee claims are filed, approved, and paid. Skip or replay anytime from the 💡 button." },
            { target: '[data-tour="exp-stats"]', title: "Where claims stand", body: "How many claims await approval, how many are approved but unpaid, and what's been reimbursed this month." },
            { target: '[data-tour="exp-pending"]', title: "Waiting on an approver", body: "Submitted claims that still need a decision. Click any row to review it." },
            { target: ".sb-nav", title: "Everything expenses", body: "Claims, categories, and settings all live under Expenses in the sidebar." },
            { title: "That's the tour", body: "Open any card or a sidebar section to dig in. Replay this anytime from the 💡 button." },
        ],
    },

    "/fixed-assets": {
        id: "fixed-assets",
        label: "Fixed Assets tour",
        steps: [
            { title: "Your big things of value", body: "A quick tour of the Fixed Assets hub — equipment, vehicles, furniture, and how their value drops over time. Skip or replay anytime from the 💡 button." },
            { target: '[data-tour="fa-stats"]', title: "What you own", body: { simple: "How many things you own, what they're worth now, and how much value they've lost this year.", advanced: "Total assets, net book value, year-to-date depreciation, and maintenance due." } },
            { target: '[data-tour="fa-grid"]', title: "Value loss & your asset list", body: { simple: "Your record of value lost over time, and your list of assets by status.", advanced: "Depreciation runs and the asset register grouped by status." } },
            { target: ".sb-nav", title: "Everything assets", body: { simple: "Your asset list, value loss, disposals, and maintenance all live under Fixed Assets in the sidebar.", advanced: "The register, depreciation, disposals, transfers, and maintenance all live under Fixed Assets in the sidebar." } },
            { title: "That's the tour", body: "Open any card or a sidebar section to dig in. Replay this anytime from the 💡 button." },
        ],
    },

    "/ticketing": {
        id: "ticketing",
        label: "Ticketing tour",
        steps: [
            { title: "Requests & tasks", body: "A quick tour of the Ticketing hub — track support requests and tasks from open to done. Skip or replay anytime from the 💡 button." },
            { target: '[data-tour="tk-stats"]', title: "Ticket health", body: "Open tickets, work in progress, anything overdue, and how fast things are getting resolved." },
            { target: '[data-tour="tk-recent"]', title: "Recent tickets", body: "The latest requests. Open the board to work them across the columns from open to done." },
            { target: ".sb-nav", title: "Everything ticketing", body: "The board, labels, and categories all live under Ticketing in the sidebar." },
            { title: "That's the tour", body: "Open any card or a sidebar section to dig in. Replay this anytime from the 💡 button." },
        ],
    },
};

// Exact-match only: the pilot registers module landing pages, not every sub-route.
function resolveTour(pathname) {
    return TOURS[pathname] || null;
}

export function hasTour(pathname) {
    return !!resolveTour(pathname);
}

export function startTour() {
    window.dispatchEvent(new Event(START_EVENT));
}

const isModeText = (v) => v && typeof v === "object" && ("simple" in v || "advanced" in v);

/* Top-bar launcher — renders only on pages that have a tour. */
export function TourButton() {
    const { pathname } = useLocation();
    if (!hasTour(pathname)) return null;
    return (
        <>
            <button className="tour-btn" onClick={startTour} title="Show me around this page" aria-label="Show me around this page">
                <I name="bulb" size={16} />
            </button>
            <style>{`
        .tour-btn{width:34px;height:34px;border-radius:9px;border:none;background:none;color:#8a8f8d;
          cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:all .15s;flex-shrink:0}
        .tour-btn:hover{background:#edf8f5;color:#2d9e8b}
      `}</style>
        </>
    );
}

/* The walkthrough engine — mount once inside the page area. */
export function PageTour() {
    const { pathname } = useLocation();
    const tour = resolveTour(pathname);
    const isSimple = useIsSimple();

    const [active, setActive] = useState(false);
    const [step, setStep] = useState(0);
    const [rect, setRect] = useState(null);   // target box, or null for a centred card
    const [ready, setReady] = useState(false); // true once the current step has been located
    const [pos, setPos] = useState(null);      // resolved tooltip {top,left}
    const tipRef = useRef(null);

    const steps = tour?.steps || [];
    const current = steps[step];
    const txt = (v) => (isModeText(v) ? (isSimple ? v.simple : v.advanced) : v);

    const close = useCallback((markSeen) => {
        setActive(false);
        setStep(0);
        setRect(null);
        setReady(false);
        setPos(null);
        if (markSeen && tour) { try { localStorage.setItem(SEEN_PREFIX + tour.id, "1"); } catch { /* private mode */ } }
    }, [tour]);

    // Manual launch via the 💡 button
    useEffect(() => {
        const onStart = () => { if (tour) { setStep(0); setActive(true); } };
        window.addEventListener(START_EVENT, onStart);
        return () => window.removeEventListener(START_EVENT, onStart);
    }, [tour]);

    // First-visit auto-start — once per page, then remembered
    useEffect(() => {
        if (!tour) return;
        let seen = false;
        try { seen = !!localStorage.getItem(SEEN_PREFIX + tour.id); } catch { seen = false; }
        if (seen) return;
        const t = setTimeout(() => { setStep(0); setActive(true); }, 700);
        return () => clearTimeout(t);
    }, [tour]);

    // Leaving the page ends the tour (steps are page-specific)
    useEffect(() => { setActive(false); setStep(0); }, [pathname]);

    // Locate and keep tracking the current step's target
    useEffect(() => {
        if (!active) return;
        setReady(false);
        setPos(null);
        const sel = current?.target;
        let cancelled = false;
        let tries = 0;

        const measure = (allowScroll) => {
            if (cancelled) return;
            const el = sel ? document.querySelector(sel) : null;
            if (el) {
                let r = el.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) {
                    if (allowScroll && (r.top < 70 || r.bottom > window.innerHeight - 20)) {
                        el.scrollIntoView({ block: "center", behavior: "auto" });
                        r = el.getBoundingClientRect();
                    }
                    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
                    setReady(true);
                    return;
                }
            }
            // Not found / hidden / not rendered yet — retry briefly, then centre.
            if (sel && tries < 12) { tries += 1; setTimeout(() => measure(allowScroll), 60); }
            else { setRect(null); setReady(true); }
        };
        measure(true);

        const reposition = () => {
            const el = sel ? document.querySelector(sel) : null;
            if (el) {
                const r = el.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
            }
        };
        window.addEventListener("resize", reposition);
        window.addEventListener("scroll", reposition, true);
        return () => {
            cancelled = true;
            window.removeEventListener("resize", reposition);
            window.removeEventListener("scroll", reposition, true);
        };
    }, [active, step, pathname]); // eslint-disable-line react-hooks/exhaustive-deps

    // Place the tooltip once the target (and its own size) are known. Runs
    // immediately and again on the next frame — the second pass catches the
    // final size after the injected styles have settled — plus on resize.
    useLayoutEffect(() => {
        if (!active || !ready) return;
        let raf = 0;
        const place = () => {
            const tip = tipRef.current;
            if (!tip) return;
            const tw = tip.offsetWidth, th = tip.offsetHeight;
            const vw = window.innerWidth, vh = window.innerHeight, m = 14;
            // Retry until the viewport and tooltip have real sizes (they can read
            // 0 for a frame or two right after mount / injected-style application).
            if (!tw || !th || !vw || !vh) { raf = requestAnimationFrame(place); return; }
            let top, left;
            if (!rect) {
                top = Math.max(m, (vh - th) / 2);
                left = Math.max(m, (vw - tw) / 2);
            } else {
                const below = rect.top + rect.height + m;
                const above = rect.top - th - m;
                if (below + th <= vh - m) top = below;
                else if (above >= m) top = above;
                else top = Math.max(m, vh - th - m);
                left = rect.left + rect.width / 2 - tw / 2;
                left = Math.min(Math.max(m, left), vw - tw - m);
            }
            setPos({ top, left });
        };
        place();
        raf = requestAnimationFrame(place);
        window.addEventListener("resize", place);
        return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", place); };
    }, [active, ready, rect, step, isSimple]);

    // Keyboard: ← back, → / Enter next, Esc close
    useEffect(() => {
        if (!active) return;
        const onKey = (e) => {
            if (e.key === "Escape") { e.preventDefault(); close(true); }
            else if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); if (step >= steps.length - 1) close(true); else setStep((s) => s + 1); }
            else if (e.key === "ArrowLeft") { e.preventDefault(); setStep((s) => Math.max(0, s - 1)); }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [active, step, steps.length, close]);

    if (!active || !tour || !current) return null;

    const last = step >= steps.length - 1;
    const spotlight = !!rect;
    const tipStyle = pos
        ? { top: pos.top, left: pos.left, visibility: "visible" }
        : { top: -9999, left: -9999, visibility: "hidden" };

    const overlay = (
        <div className="tour-root" role="dialog" aria-modal="true" aria-label={tour.label}>
            {/* Click-blocker; also the dimmer when there's no spotlight cutout */}
            <div className={`tour-block${spotlight ? "" : " tour-dim"}`} />

            {/* Spotlight — its huge box-shadow dims everything but the target */}
            {spotlight && (
                <div
                    className="tour-ring"
                    style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
                />
            )}

            {/* Tooltip card */}
            <div ref={tipRef} className="tour-tip" style={tipStyle}>
                <div className="tour-tip-top">
                    <span className="tour-count">{step + 1}<span> / {steps.length}</span></span>
                    <button className="tour-x" onClick={() => close(true)} aria-label="Close tour"><I name="x" size={14} /></button>
                </div>
                <h4 className="tour-tip-t">{txt(current.title)}</h4>
                <p className="tour-tip-b">{txt(current.body)}</p>
                <div className="tour-dots">
                    {steps.map((_, i) => <span key={i} className={`tour-dot${i === step ? " tour-dot-on" : ""}`} />)}
                </div>
                <div className="tour-tip-ft">
                    <button className="tour-skip" onClick={() => close(true)}>Skip</button>
                    <div className="tour-nav">
                        {step > 0 && <button className="tour-b tour-b-ghost" onClick={() => setStep((s) => Math.max(0, s - 1))}>Back</button>}
                        <button className="tour-b tour-b-go" onClick={() => (last ? close(true) : setStep((s) => s + 1))}>{last ? "Done" : "Next"}</button>
                    </div>
                </div>
            </div>

            <style>{`
        .tour-root{position:fixed;inset:0;z-index:100000;font-family:'DM Sans',sans-serif}
        .tour-block{position:fixed;inset:0;z-index:100000}
        .tour-dim{background:rgba(15,23,42,.55)}
        .tour-ring{position:fixed;z-index:100001;border-radius:12px;pointer-events:none;
          box-shadow:0 0 0 9999px rgba(15,23,42,.55);outline:2px solid #2d9e8b;outline-offset:2px;
          transition:top .28s cubic-bezier(.4,0,.2,1),left .28s cubic-bezier(.4,0,.2,1),width .28s,height .28s}
        .tour-tip{position:fixed;z-index:100002;width:330px;max-width:calc(100vw - 28px);
          background:#fff;border-radius:14px;padding:15px 16px 13px;box-shadow:0 14px 44px rgba(0,0,0,.24);
          animation:tour-pop .18s ease}
        @keyframes tour-pop{from{opacity:0;transform:translateY(4px) scale(.985)}to{opacity:1;transform:none}}
        .tour-tip-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:7px}
        .tour-count{font-size:11px;font-weight:700;color:#2d9e8b;letter-spacing:.03em}
        .tour-count span{color:#c3c9c7;font-weight:600}
        .tour-x{border:none;background:none;color:#bbb;cursor:pointer;padding:2px;border-radius:6px;display:flex;line-height:0}
        .tour-x:hover{background:#f2f4f3;color:#666}
        .tour-tip-t{font-size:15px;font-weight:700;color:#22322e;margin:0 0 5px}
        .tour-tip-b{font-size:13px;line-height:1.55;color:#5f6b67;margin:0 0 12px}
        .tour-dots{display:flex;gap:5px;margin-bottom:12px}
        .tour-dot{width:6px;height:6px;border-radius:50%;background:#e2e6e5;transition:all .2s}
        .tour-dot-on{background:#2d9e8b;width:18px;border-radius:3px}
        .tour-tip-ft{display:flex;align-items:center;justify-content:space-between;gap:8px}
        .tour-skip{border:none;background:none;font-family:inherit;font-size:12.5px;color:#a3aaa7;cursor:pointer;padding:6px 4px}
        .tour-skip:hover{color:#777;text-decoration:underline}
        .tour-nav{display:flex;gap:8px}
        .tour-b{font-family:inherit;font-size:13px;font-weight:600;border-radius:8px;padding:8px 16px;cursor:pointer;border:1px solid transparent;transition:all .15s}
        .tour-b-ghost{background:#fff;border-color:#e3e7e6;color:#5f6b67}
        .tour-b-ghost:hover{background:#f6f8f7}
        .tour-b-go{background:#2d9e8b;color:#fff}
        .tour-b-go:hover{background:#268a79}
      `}</style>
        </div>
    );

    return createPortal(overlay, document.body);
}
