import { useState, useEffect, useCallback, useRef } from "react";

/*
 * Header "Update" button — drives the Electron auto-updater (electron-updater).
 * Talks to the main process through the `window.updater` preload bridge:
 *   check()  → look for a newer release
 *   download() → pull it down
 *   install()  → quit & relaunch into the new version
 * Renders nothing outside Electron (the bridge is absent in a plain browser).
 *
 * State machine (driven by "updater:status" events from main):
 *   idle → checking → available → downloading → downloaded → (install)
 *                    ↘ not-available (auto-reverts to idle)
 *                    ↘ error
 * Click behaviour by state:
 *   idle / not-available / error → check()
 *   available                    → download()
 *   downloaded                   → install()
 */

const CFG = {
    idle:            { text: "Update",            accent: false, disabled: false },
    checking:        { text: "Checking…",         accent: false, disabled: true  },
    available:       { text: "Update available",  accent: true,  disabled: false },
    downloading:     { text: "Updating…",         accent: true,  disabled: true  },
    downloaded:      { text: "Restart to update", accent: true,  disabled: false },
    "not-available": { text: "Up to date",        accent: false, disabled: true  },
    error:           { text: "Update failed",     accent: false, disabled: false },
    dev:             { text: "Update",            accent: false, disabled: true  },
    // Mac fallback (unsigned): the update opens as a .dmg download in the browser.
    "manual-opened": { text: "Downloading in browser…", accent: false, disabled: false },
};

export default function UpdateButton() {
    const updater = typeof window !== "undefined" ? window.updater : null;
    const [state, setState] = useState("idle");
    const [percent, setPercent] = useState(0);
    const [version, setVersion] = useState("");       // version of an *available* update
    const [appVersion, setAppVersion] = useState(""); // currently-running app version
    const [message, setMessage] = useState("");
    const [manual, setManual] = useState(false);      // Mac unsigned → download .dmg manually
    const revertTimer = useRef(null);

    useEffect(() => {
        if (!updater) return;
        let mounted = true;

        updater.getVersion().then((v) => {
            if (!mounted) return;
            if (v?.version) setAppVersion(v.version);
            if (!v?.packaged) setState("dev"); // dev run: bridge exists but updates are inert
        }).catch(() => {});

        const off = updater.onStatus((s) => {
            if (!mounted) return;
            if (revertTimer.current) { clearTimeout(revertTimer.current); revertTimer.current = null; }
            if (s.state === "downloading") setPercent(s.percent || 0);
            if (s.version) setVersion(s.version);
            if (typeof s.manual === "boolean") setManual(s.manual);
            if (s.state === "error") setMessage(s.message || "Update error");
            setState(s.state);
            if (s.state === "not-available") {
                revertTimer.current = setTimeout(() => { if (mounted) setState("idle"); }, 4000);
            }
        });

        // Check on mount so the button reflects reality without a click.
        updater.check().then((r) => { if (mounted && r?.state) setState(r.state); }).catch(() => {});

        return () => {
            mounted = false;
            if (off) off();
            if (revertTimer.current) clearTimeout(revertTimer.current);
        };
    }, [updater]);

    const onClick = useCallback(() => {
        if (!updater) return;
        if (state === "available") {
            if (manual) { updater.openDownload(); setState("manual-opened"); } // Mac: open .dmg download
            else updater.download();
        }
        else if (state === "manual-opened") updater.openDownload(); // re-open the download link
        else if (state === "downloaded") updater.install();
        else if (state === "idle" || state === "error" || state === "not-available") updater.check();
    }, [updater, state, manual]);

    if (!updater) return null; // plain browser / non-Electron → no button

    const cfg = CFG[state] || CFG.idle;
    const label =
        state === "downloading" ? `Updating ${percent}%` :
        (state === "available" && manual) ? "Download update" :
        cfg.text;
    const title =
        state === "error" ? message :
        state === "dev" ? "Updates apply in the installed app" :
        state === "manual-opened" ? "Your browser is downloading the update. Open the .dmg and drag LetterSheets to Applications, then relaunch." :
        (state === "available" && manual) ? `Downloads v${version} — open the .dmg to install` :
        (state === "available" || state === "downloaded") && version ? `Version ${version}` :
        "Check for updates";

    return (
        <div className="upd-wrap">
            <button
                className={`upd-btn${cfg.accent ? " upd-btn-accent" : ""}`}
                onClick={onClick}
                disabled={cfg.disabled}
                title={title}
                aria-label={label}
            >
                <span className={`upd-ic upd-ic-${state}`} />
                <span className="upd-tx">{label}</span>
            </button>
            {appVersion && <span className="upd-ver">v{appVersion}</span>}
            <style>{CSS}</style>
        </div>
    );
}

const CSS = `
  .upd-wrap{display:inline-flex;flex-direction:column;align-items:center;gap:2px}
  .upd-ver{font-family:'DM Sans',sans-serif;font-size:10.5px;font-weight:500;color:#9aa0a8;line-height:1}
  .upd-btn{display:inline-flex;align-items:center;gap:7px;padding:7px 12px;border:1px solid #e2e4e8;border-radius:8px;background:#fff;font-family:'DM Sans',sans-serif;font-size:12.5px;font-weight:600;color:#555;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s,color .15s}
  .upd-btn:hover:not(:disabled){background:#f6f7f8;border-color:#d0d3d8}
  .upd-btn:disabled{cursor:default;opacity:.8}
  .upd-btn-accent{background:#2d9e8b;border-color:#2d9e8b;color:#fff}
  .upd-btn-accent:hover:not(:disabled){background:#268a79;border-color:#268a79}
  .upd-tx{line-height:1}
  .upd-ic{width:8px;height:8px;border-radius:50%;background:#c4c8cf;flex-shrink:0}
  .upd-ic-available,.upd-ic-downloaded{background:#fff}
  .upd-btn-accent .upd-ic{background:rgba(255,255,255,.95)}
  @keyframes upd-spin{to{transform:rotate(360deg)}}
  .upd-ic-checking,.upd-ic-downloading{width:11px;height:11px;background:transparent;border:2px solid rgba(0,0,0,.16);border-top-color:#2d9e8b;border-radius:50%;animation:upd-spin .7s linear infinite}
  .upd-btn-accent .upd-ic-downloading{border-color:rgba(255,255,255,.45);border-top-color:#fff}
`;
