/* ================================================================
   GLOBAL UI MODE — "Simple" vs "Advanced"

   One preference, shared across every module, so a non-accountant can run
   the whole app in plain language and someone who wants the raw accounting
   controls can switch to Advanced once, everywhere.

     Simple   (default)  friendly labels, jargon hidden, optional accountant
                         fields tucked away, sensible defaults chosen for you.
     Advanced            every field and every term the accountant expects.

   The choice lives in localStorage and is broadcast to all mounted screens so
   flipping the top-bar toggle re-renders the app live — no reload.

   Usage:
     const [mode, setMode] = useUIMode();      // "simple" | "advanced"
     const simple = useIsSimple();             // boolean shortcut
     <AdvancedOnly> …accountant-only fields… </AdvancedOnly>
     <Term simple="Money we owe staff" advanced="Reimbursements payable"/>
================================================================ */

import { useSyncExternalStore } from "react";

const KEY = "ls_ui_mode";
const EVENT = "ls-ui-mode-change";

// Default to Simple: the whole point is that someone with no business
// background can pick the app up. An accountant flips to Advanced once and it
// sticks.
export function getMode() {
    const v = localStorage.getItem(KEY);
    return v === "advanced" ? "advanced" : "simple";
}

export function setMode(mode) {
    const next = mode === "advanced" ? "advanced" : "simple";
    localStorage.setItem(KEY, next);
    // Notify listeners in THIS tab (the native 'storage' event only fires in
    // other tabs), so every mounted screen re-renders immediately.
    window.dispatchEvent(new Event(EVENT));
}

export function toggleMode() {
    setMode(getMode() === "simple" ? "advanced" : "simple");
}

// --- React binding ---------------------------------------------------------

function subscribe(cb) {
    window.addEventListener(EVENT, cb);
    window.addEventListener("storage", cb); // other tabs
    return () => {
        window.removeEventListener(EVENT, cb);
        window.removeEventListener("storage", cb);
    };
}

// useUIMode returns [mode, setMode] and re-renders the component whenever the
// mode changes anywhere in the app.
export function useUIMode() {
    const mode = useSyncExternalStore(subscribe, getMode, () => "simple");
    return [mode, setMode];
}

export function useIsSimple() {
    return useUIMode()[0] === "simple";
}
