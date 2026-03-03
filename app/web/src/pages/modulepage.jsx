import { useLocation } from "react-router-dom";
import { modules, I } from "../layouts/ERPLayout";

export default function ModulePage() {
    const location = useLocation();
    const active = [...modules]
        .sort((a, b) => b.path.length - a.path.length)
        .find(m => location.pathname.startsWith(m.path)) || { label: "Module", icon: "grid" };

    return (
        <div>
            <div className="mp-h">
                <div className="mp-ic"><I name={active.icon} size={24}/></div>
                <div>
                    <h1 className="mp-t">{active.label}</h1>
                    {active.section && <p className="mp-s">{active.section}</p>}
                </div>
            </div>
            <div className="mp-card">
                <div className="mp-empty">
                    <div className="mp-e-ic"><I name={active.icon} size={36}/></div>
                    <h2 className="mp-e-t">{active.label} Module</h2>
                    <p className="mp-e-d">This module is under development. It will be available in a future update.</p>
                    <div className="mp-tags">
                        <span className="mp-tag">Data Management</span>
                        <span className="mp-tag">CRUD Operations</span>
                        <span className="mp-tag">E2E Encrypted</span>
                        <span className="mp-tag">Role-Based Access</span>
                    </div>
                </div>
            </div>
            <style>{`
        .mp-h{display:flex;align-items:center;gap:14px;margin-bottom:22px}
        .mp-ic{width:48px;height:48px;border-radius:12px;background:#edf8f5;color:#2d9e8b;display:flex;align-items:center;justify-content:center}
        .mp-t{font-size:22px;font-weight:700;color:#222}
        .mp-s{font-size:12px;color:#aaa;text-transform:uppercase;letter-spacing:.05em;margin-top:2px}
        .mp-card{background:#fff;border:1px solid #eee;border-radius:14px;padding:40px}
        .mp-empty{text-align:center;padding:40px 0}
        .mp-e-ic{width:72px;height:72px;border-radius:50%;background:#f3f5f4;color:#ccc;display:flex;align-items:center;justify-content:center;margin:0 auto 16px}
        .mp-e-t{font-size:18px;font-weight:700;color:#444;margin-bottom:6px}
        .mp-e-d{font-size:14px;color:#999;max-width:360px;margin:0 auto 20px;line-height:1.5}
        .mp-tags{display:flex;justify-content:center;gap:8px;flex-wrap:wrap}
        .mp-tag{padding:5px 12px;border-radius:6px;background:#f3f5f4;color:#888;font-size:12px;font-weight:500}
      `}</style>
        </div>
    );
}
