import { useState, useEffect } from "react";
import { MODULE_REGISTRY, PERMISSION_PRESETS, fnLabel, fnColor } from "../../utils/permissions";
import { I } from "../../layouts/ERPLayout";

export default function PermissionEditor({ permissions, onChange, disabled }) {
    const [perms, setPerms] = useState(() => {
        if (typeof permissions === "string") {
            try { return JSON.parse(permissions) || {}; } catch { return {}; }
        }
        return permissions || {};
    });
    const [preset, setPreset] = useState("");

    useEffect(() => {
        let p = permissions;
        if (typeof p === "string") {
            try { p = JSON.parse(p) || {}; } catch { p = {}; }
        }
        setPerms(p || {});
    }, [permissions]);

    const update = (next) => {
        // Clean undefined/empty values
        const clean = {};
        for (const [k, v] of Object.entries(next)) {
            if (Array.isArray(v) && v.length > 0) clean[k] = v;
        }
        setPerms(clean);
        if (onChange) onChange(clean);
    };

    const toggle = (mod, fn) => {
        if (disabled) return;
        const current = perms[mod] || [];
        const next = current.includes(fn)
            ? current.filter(f => f !== fn)
            : [...current, fn];
        update({ ...perms, [mod]: next.length > 0 ? next : undefined });
    };

    const toggleAll = (mod) => {
        if (disabled) return;
        const current = perms[mod] || [];
        const all = MODULE_REGISTRY[mod].functions;
        const hasAll = all.every(f => current.includes(f));
        update({ ...perms, [mod]: hasAll ? undefined : [...all] });
    };

    const applyPreset = (name) => {
        if (disabled) return;
        const p = PERMISSION_PRESETS[name];
        if (p) {
            update({ ...p });
            setPreset(name);
        }
    };

    const clearAll = () => {
        if (disabled) return;
        update({});
        setPreset("");
    };

    const moduleEntries = Object.entries(MODULE_REGISTRY);
    const assignedCount = Object.keys(perms).filter(k => perms[k]?.length > 0).length;

    return (
        <div className="pe-wrap">
            {/* Presets */}
            {!disabled && (
                <div className="pe-presets">
                    <span className="pe-presets-label">Quick assign:</span>
                    {Object.keys(PERMISSION_PRESETS).map(name => (
                        <button key={name} className={`pe-preset-btn ${preset === name ? "pe-preset-on" : ""}`} onClick={() => applyPreset(name)}>
                            {name}
                        </button>
                    ))}
                    {assignedCount > 0 && (
                        <button className="pe-preset-btn pe-preset-clear" onClick={clearAll}>Clear All</button>
                    )}
                </div>
            )}

            {/* Summary */}
            {disabled && assignedCount === 0 && (
                <div className="pe-empty">No extra permissions. Self-service access only.</div>
            )}

            {/* Module grid */}
            <div className="pe-modules">
                {moduleEntries.map(([mod, info]) => {
                    const fns = perms[mod] || [];
                    const hasAny = fns.length > 0;
                    const hasAll = info.functions.every(f => fns.includes(f));

                    return (
                        <div key={mod} className={`pe-mod ${hasAny ? "pe-mod-on" : ""}`}>
                            <div className="pe-mod-head" onClick={() => !disabled && toggleAll(mod)}>
                                <div className="pe-mod-info">
                                    <I name={info.icon} size={14} />
                                    <span className="pe-mod-name">{info.label}</span>
                                </div>
                                <div className="pe-mod-right">
                                    {hasAny && <span className="pe-mod-count">{fns.length}/{info.functions.length}</span>}
                                    {!disabled && (
                                        <div className={`pe-toggle ${hasAll ? "pe-toggle-on" : hasAny ? "pe-toggle-partial" : ""}`}>
                                            <div className="pe-toggle-dot" />
                                        </div>
                                    )}
                                </div>
                            </div>
                            {(hasAny || !disabled) && (
                                <div className="pe-fns">
                                    {info.functions.map(fn => {
                                        const active = fns.includes(fn);
                                        return (
                                            <button
                                                key={fn}
                                                className={`pe-fn ${active ? "pe-fn-on" : ""}`}
                                                style={active ? { background: fnColor(fn) + "14", color: fnColor(fn), borderColor: fnColor(fn) + "40" } : {}}
                                                onClick={() => toggle(mod, fn)}
                                                disabled={disabled}
                                            >
                                                {active && <I name="check" size={10} />}
                                                {fnLabel(fn)}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <style>{peCSS}</style>
        </div>
    );
}

const peCSS = `
  .pe-wrap{padding:4px 0}

  .pe-presets{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:14px}
  .pe-presets-label{font-size:11px;font-weight:600;color:#aaa;text-transform:uppercase;letter-spacing:.03em}
  .pe-preset-btn{padding:4px 10px;border:1px solid #e0e0e0;border-radius:6px;background:#fff;font-family:'DM Sans',sans-serif;font-size:11px;font-weight:500;color:#666;cursor:pointer;transition:all .12s}
  .pe-preset-btn:hover{border-color:#2d9e8b;color:#2d9e8b}
  .pe-preset-on{border-color:#2d9e8b;background:#edf8f5;color:#2d9e8b;font-weight:600}
  .pe-preset-clear{border-color:#fecaca;color:#ef4444}
  .pe-preset-clear:hover{background:#fef2f2;border-color:#ef4444}

  .pe-empty{text-align:center;padding:20px;color:#ccc;font-size:13px}

  .pe-modules{display:flex;flex-direction:column;gap:6px}
  .pe-mod{border:1px solid #f0f0f0;border-radius:10px;padding:10px 12px;transition:all .12s}
  .pe-mod-on{border-color:#d4e8e2;background:#fafffe}
  .pe-mod-head{display:flex;align-items:center;justify-content:space-between;cursor:pointer}
  .pe-mod-info{display:flex;align-items:center;gap:8px;color:#888}
  .pe-mod-name{font-size:13px;font-weight:600;color:#333}
  .pe-mod-on .pe-mod-name{color:#2d9e8b}
  .pe-mod-right{display:flex;align-items:center;gap:8px}
  .pe-mod-count{font-size:10px;font-weight:600;color:#2d9e8b;background:#edf8f5;padding:1px 6px;border-radius:4px}

  .pe-toggle{width:32px;height:18px;border-radius:9px;background:#e5e7eb;position:relative;transition:background .2s;flex-shrink:0}
  .pe-toggle-on{background:#2d9e8b}
  .pe-toggle-partial{background:#86efac}
  .pe-toggle-dot{width:14px;height:14px;border-radius:50%;background:#fff;position:absolute;top:2px;left:2px;transition:transform .2s;box-shadow:0 1px 3px rgba(0,0,0,.12)}
  .pe-toggle-on .pe-toggle-dot{transform:translateX(14px)}
  .pe-toggle-partial .pe-toggle-dot{transform:translateX(7px)}

  .pe-fns{display:flex;gap:4px;flex-wrap:wrap;margin-top:8px}
  .pe-fn{padding:3px 8px;border:1px solid #e8e8e8;border-radius:5px;background:#fff;font-family:'DM Sans',sans-serif;font-size:10px;font-weight:600;color:#aaa;cursor:pointer;transition:all .1s;display:flex;align-items:center;gap:3px}
  .pe-fn:hover{border-color:#ccc;color:#666}
  .pe-fn-on{font-weight:700}
  .pe-fn:disabled{cursor:default;opacity:.7}
`;
