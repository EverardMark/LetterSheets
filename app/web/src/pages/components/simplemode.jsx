import { useUIMode, useIsSimple } from "../../utils/uimode";
import { I } from "../../layouts/ERPLayout";

/* ================================================================
   SIMPLE-MODE UI HELPERS

   Presentational glue over the global UI-mode store (utils/uimode.js).
   Keep the logic there; keep the JSX here.
================================================================ */

// AdvancedOnly hides its children unless the user is in Advanced mode. Use it to
// tuck away accountant-only fields (GL account pickers, VAT accounts, posting
// switches) so a normal person never sees them.
export function AdvancedOnly({ children }) {
    return useIsSimple() ? null : children;
}

// SimpleOnly is the inverse — content shown only to beginners, e.g. a plain
// "we set this up for you" reassurance that would just be noise in Advanced.
export function SimpleOnly({ children }) {
    return useIsSimple() ? children : null;
}

// Term shows plain wording in Simple mode and the precise term in Advanced, so
// the same screen reads as "Money we owe staff" for one user and "Reimbursements
// payable" for their accountant.
export function Term({ simple, advanced }) {
    return <>{useIsSimple() ? simple : advanced}</>;
}

// term() is the string form, for places that need a plain value (placeholders,
// titles, aria labels) rather than a node.
export function term(simple, advanced, isSimple) {
    return isSimple ? simple : advanced;
}

// ModeToggle is the top-bar pill that flips the whole app between Simple and
// Advanced. Small, always visible, and labelled so its effect is obvious.
export function ModeToggle() {
    const [mode, setMode] = useUIMode();
    const simple = mode === "simple";
    return (
        <div className="um-toggle" role="group" aria-label="Interface mode">
            <button
                className={`um-seg${simple ? " um-on" : ""}`}
                onClick={() => setMode("simple")}
                title="Plain language — hides accounting jargon"
            >
                <I name="zap" size={12} /> Simple
            </button>
            <button
                className={`um-seg${simple ? "" : " um-on"}`}
                onClick={() => setMode("advanced")}
                title="Show every field and accounting term"
            >
                <I name="sliders" size={12} /> Advanced
            </button>
            <style>{`
        .um-toggle{display:inline-flex;background:#f1f3f2;border-radius:9px;padding:2px;gap:2px}
        .um-seg{display:inline-flex;align-items:center;gap:5px;border:none;background:none;
          font-family:inherit;font-size:11.5px;font-weight:600;color:#8a8f8d;cursor:pointer;
          padding:5px 10px;border-radius:7px;transition:all .15s;white-space:nowrap}
        .um-seg:hover{color:#555}
        .um-on{background:#fff;color:#2d9e8b;box-shadow:0 1px 2px rgba(0,0,0,.06)}
        @media(max-width:720px){.um-seg span,.um-seg{font-size:0}.um-seg svg{font-size:13px!important}
          .um-seg{padding:6px 8px}}
      `}</style>
        </div>
    );
}

// SimpleHint is a soft, friendly note shown only in Simple mode — for the one
// line of reassurance or plain explanation a beginner needs and an expert
// doesn't. Renders nothing in Advanced.
export function SimpleHint({ children, icon = "info" }) {
    const simple = useIsSimple();
    if (!simple) return null;
    return (
        <div className="um-hint">
            <I name={icon} size={13} />
            <span>{children}</span>
            <style>{`
        .um-hint{display:flex;gap:8px;align-items:flex-start;background:#f0faf7;border:1px solid #d5ede6;
          color:#3f6b61;font-size:11.5px;line-height:1.55;padding:9px 11px;border-radius:9px;margin:2px 0 12px}
        .um-hint svg{margin-top:1px;flex-shrink:0;color:#2d9e8b}
      `}</style>
        </div>
    );
}
