import { useState, useRef } from "react";
import { recoverKeys } from "../../utils/crypto";

const API_URL = "http://localhost:8080/api/execute";

export default function ForgotPassword({ onNavigate }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [step, setStep] = useState("upload"); // upload | reset | done
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [fieldErrors, setFieldErrors] = useState({});
    const [recoveryFile, setRecoveryFile] = useState(null);
    const [recoveryData, setRecoveryData] = useState(null);
    const [keyDownloaded, setKeyDownloaded] = useState(false);
    const [newRecoveryKeys, setNewRecoveryKeys] = useState(null);
    const fileInputRef = useRef(null);

    const [form, setForm] = useState({
        email: "",
        password: "",
        confirm_password: "",
    });

    const update = (field) => (e) => {
        setForm({ ...form, [field]: e.target.value });
        setError("");
        setFieldErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);

                if (!data.keys?.privateKey || !data.keys?.recoveryWrappedKey) {
                    setError("Invalid recovery key file. Missing required keys.");
                    return;
                }
                if (data._format !== "Lettersheets Recovery Key v1") {
                    setError("Unrecognized recovery key format.");
                    return;
                }

                setRecoveryFile(file);
                setRecoveryData(data);
                setForm({ ...form, email: data.email || "" });
                setStep("reset");
                setError("");
            } catch {
                setError("Invalid file. Please upload a valid recovery key JSON file.");
            }
        };
        reader.readAsText(file);
    };

    const handleReset = async () => {
        const errs = {};
        if (!form.email.trim()) errs.email = true;
        if (!form.password || form.password.length < 8) errs.password = true;
        if (form.password !== form.confirm_password) errs.confirm_password = true;
        if (Object.keys(errs).length) {
            setFieldErrors(errs);
            if (!form.email.trim()) setError("Email is required");
            else if (!form.password) setError("New password is required");
            else if (form.password.length < 8) setError("Password must be at least 8 characters");
            else if (form.password !== form.confirm_password) setError("Passwords do not match");
            return;
        }

        setLoading(true);
        setError("");

        try {
            const newSalt = crypto.randomUUID();

            const keys = await recoverKeys(
                recoveryData.keys.recoveryWrappedKey,
                recoveryData.keys.privateKey,
                form.password,
                newSalt
            );

            localStorage.setItem("ls_private_key", keys.privateKey);

            const res = await fetch(`${API_URL}?action=reset_password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: form.email,
                    password: form.password,
                    salt: newSalt,
                    wrapped_company_key: keys.wrappedCompanyKey,
                    key_wrap_algorithm: "AES-KW",
                    public_key: keys.publicKey,
                }),
            });

            const data = await res.json();
            if (!data.success) {
                setError(data.error || "Password reset failed");
                setLoading(false);
                return;
            }

            setNewRecoveryKeys({
                privateKey: keys.privateKey,
                recoveryWrappedKey: keys.recoveryWrappedKey,
                publicKey: keys.publicKey,
                salt: newSalt,
            });

            setStep("done");
        } catch (e) {
            setError("Recovery failed. The key file may be corrupted or for a different account.");
        }
        setLoading(false);
    };

    const downloadNewRecoveryKey = () => {
        if (!newRecoveryKeys) return;

        const keyFile = {
            _warning: "KEEP THIS FILE SAFE. Anyone with this file can access your encrypted data. Do not share it.",
            _format: "Lettersheets Recovery Key v1",
            _created: new Date().toISOString(),
            company: recoveryData.company,
            email: form.email,
            username: recoveryData.username,
            keys: {
                privateKey: newRecoveryKeys.privateKey,
                recoveryWrappedKey: newRecoveryKeys.recoveryWrappedKey,
                publicKey: newRecoveryKeys.publicKey,
                salt: newRecoveryKeys.salt,
                keyAlgorithm: "AES-256-GCM",
                keyWrapAlgorithm: "AES-KW",
                kdfAlgorithm: "PBKDF2-SHA256-600000",
                publicKeyAlgorithm: "RSA-OAEP-2048-SHA256",
            },
        };

        const blob = new Blob([JSON.stringify(keyFile, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${(recoveryData.company || "company").toLowerCase().replace(/\s+/g, "-")}-recovery-key.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setKeyDownloaded(true);
    };

    return (
        <>
            <div className="panel">
                <div className="panel-inner">
                    {/* Logo */}
                    <div className="logo-center">
                        <i className="fa-solid fa-table-columns" style={{fontSize:22, color:"#2d6a4f"}}></i>
                        <span className="logo-text">LETTER<span className="logo-bold">SHEETS</span></span>
                    </div>

                    {/* ===== STEP 1: Upload recovery file ===== */}
                    {step === "upload" && (
                        <>
                            <div className="header-icon">
                                <i className="fa-solid fa-key" style={{fontSize:22, color:"#b45309"}}></i>
                            </div>

                            <h2 className="form-title">Reset Your Password</h2>
                            <p className="form-subtitle">Upload the recovery key file you downloaded when you registered.</p>

                            {error && <div className="error-box">{error}</div>}

                            <input
                                type="file"
                                accept=".json"
                                ref={fileInputRef}
                                style={{ display: "none" }}
                                onChange={handleFileUpload}
                            />

                            <div
                                className="upload-zone"
                                onClick={() => fileInputRef.current?.click()}
                                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("drag-over"); }}
                                onDragLeave={(e) => e.currentTarget.classList.remove("drag-over")}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    e.currentTarget.classList.remove("drag-over");
                                    const file = e.dataTransfer.files[0];
                                    if (file) {
                                        const input = fileInputRef.current;
                                        const dt = new DataTransfer();
                                        dt.items.add(file);
                                        input.files = dt.files;
                                        input.dispatchEvent(new Event("change", { bubbles: true }));
                                    }
                                }}
                            >
                                <div className="upload-icon">
                                    <i className="fa-solid fa-cloud-arrow-up" style={{fontSize:28, color:"#2d6a4f"}}></i>
                                </div>
                                <p className="upload-text">Click or drag your recovery key file here</p>
                                <p className="upload-hint">*-recovery-key.json</p>
                            </div>

                            <div className="info-box">
                                <i className="fa-solid fa-circle-info" style={{fontSize:15, color:"#6b7280", flexShrink:0, marginTop:1}}></i>
                                <p>This file was generated when you created your account. Without it, encrypted data cannot be recovered.</p>
                            </div>

                            <button className="btn-back-link" onClick={() => onNavigate("login")}>← Back to sign in</button>
                        </>
                    )}

                    {/* ===== STEP 2: Set new password ===== */}
                    {step === "reset" && (
                        <>
                            <h2 className="form-title">Set New Password</h2>
                            <p className="form-subtitle">Recovery file loaded for <strong>{recoveryData?.company}</strong></p>

                            <div className="file-badge">
                                <i className="fa-solid fa-file" style={{fontSize:15, color:"#2d6a4f"}}></i>
                                <span>{recoveryFile?.name}</span>
                                <button className="file-remove" onClick={() => { setStep("upload"); setRecoveryData(null); setRecoveryFile(null); setError(""); }}>✕</button>
                            </div>

                            <div className="form-fields">
                                <div className="field">
                                    <label className="field-label">Email</label>
                                    <input className={`field-input${fieldErrors.email ? " field-error" : ""}`} type="email" value={form.email} onChange={update("email")} />
                                </div>
                                <div className="field">
                                    <label className="field-label">New password</label>
                                    <div className="input-wrap">
                                        <input className={`field-input${fieldErrors.password ? " field-error" : ""}`} type={showPassword ? "text" : "password"} placeholder="Minimum 8 characters" value={form.password} onChange={update("password")} style={{paddingRight:42}} />
                                        <button className="eye-btn" onClick={() => setShowPassword(!showPassword)} type="button">
                                            <i className={`fa-solid ${showPassword ? "fa-eye-slash" : "fa-eye"}`} style={{fontSize:16, color:"#999"}}></i>
                                        </button>
                                    </div>
                                </div>
                                <div className="field">
                                    <label className="field-label">Confirm new password</label>
                                    <div className="input-wrap">
                                        <input className={`field-input${fieldErrors.confirm_password ? " field-error" : ""}`} type={showConfirm ? "text" : "password"} placeholder="Re-enter password" value={form.confirm_password} onChange={update("confirm_password")} style={{paddingRight:42}} />
                                        <button className="eye-btn" onClick={() => setShowConfirm(!showConfirm)} type="button">
                                            <i className={`fa-solid ${showConfirm ? "fa-eye-slash" : "fa-eye"}`} style={{fontSize:16, color:"#999"}}></i>
                                        </button>
                                    </div>
                                    {form.confirm_password && form.password === form.confirm_password && (
                                        <span className="match-text">
                                            <i className="fa-solid fa-check" style={{fontSize:11, color:"#2d6a4f"}}></i>
                                            Passwords match
                                        </span>
                                    )}
                                </div>
                            </div>

                            {error && <div className="error-box">{error}</div>}

                            <button className="btn-primary" onClick={handleReset} disabled={loading}>
                                {loading ? <span className="spinner"/> : "Reset Password"}
                            </button>

                            <button className="btn-back" onClick={() => { setStep("upload"); setError(""); }}>
                                ← Use a different file
                            </button>
                        </>
                    )}

                    {/* ===== STEP 3: Success + new recovery key ===== */}
                    {step === "done" && (
                        <>
                            <div className="success-icon">
                                <i className="fa-solid fa-circle-check" style={{fontSize:36, color:"#2d6a4f"}}></i>
                            </div>

                            <h2 className="form-title">Password Reset Complete</h2>
                            <p className="form-subtitle">Your password and encryption keys have been updated.</p>

                            {/* New recovery key download */}
                            <div className="key-box">
                                <div className="key-icon">
                                    <i className="fa-solid fa-key" style={{fontSize:20, color:"#b45309"}}></i>
                                </div>
                                <h3 className="key-title">Download New Recovery Key</h3>
                                <p className="key-desc">
                                    Your old recovery file is no longer valid. Download the new one and <strong>replace the old file</strong>.
                                </p>
                                <button className="btn-download" onClick={downloadNewRecoveryKey}>
                                    <i className="fa-solid fa-download" style={{fontSize:16}}></i>
                                    {keyDownloaded ? "Download Again" : "Download New Recovery Key"}
                                </button>
                                {keyDownloaded && (
                                    <p className="key-saved">
                                        <i className="fa-solid fa-check" style={{fontSize:13, color:"#2d6a4f"}}></i>
                                        Key file saved
                                    </p>
                                )}
                            </div>

                            <button className={`btn-primary ${!keyDownloaded ? "btn-disabled" : ""}`} onClick={() => { if (!keyDownloaded) { setError("Please download your new recovery key first"); return; } onNavigate("login"); }}>
                                Continue to Sign In
                            </button>
                            {error && <div className="error-box" style={{marginTop:8}}>{error}</div>}
                        </>
                    )}
                </div>
                <p className="copyright-text">© {new Date().getFullYear()} Lettersheets. All rights reserved.</p>
            </div>

            <style>{`
        .panel {
          background: #fff;
          border-radius: 24px;
          width: 100%;
          max-width: 440px;
          padding: 48px 36px;
          display: flex;
          flex-direction: column;
          min-height: 100%;
        }
        .panel-inner {
          width: 100%;
        }
        .header-icon {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          background: #fef3c7;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 14px;
        }
        .form-subtitle strong {
          color: #555;
        }
        .match-text {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: #2d6a4f;
          font-weight: 600;
          margin-top: 2px;
        }
        /* Upload zone */
        .upload-zone {
          border: 2px dashed #d1d5db;
          border-radius: 14px;
          padding: 36px 20px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s ease;
          margin-bottom: 16px;
        }
        .upload-zone:hover, .upload-zone.drag-over {
          border-color: #2d6a4f;
          background: #f0f7f2;
        }
        .upload-icon {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: #e8f3ec;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 12px;
        }
        .upload-text {
          font-size: 14px;
          font-weight: 600;
          color: #333;
          margin-bottom: 4px;
        }
        .upload-hint {
          font-size: 12px;
          color: #999;
          font-family: monospace;
        }
        /* Info box */
        .info-box {
          display: flex;
          gap: 10px;
          padding: 12px 14px;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          margin-bottom: 20px;
          overflow: hidden;
        }
        .info-box i {
          width: auto;
          min-width: auto;
        }
        .info-box p {
          font-size: 12.5px;
          color: #6b7280;
          line-height: 1.5;
          min-width: 0;
        }
        /* File badge */
        .file-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          background: #e8f3ec;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          color: #2d6a4f;
          margin-bottom: 20px;
        }
        .file-badge span {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .file-remove {
          background: none;
          border: none;
          color: #2d6a4f;
          cursor: pointer;
          font-size: 14px;
          padding: 0 2px;
          opacity: 0.6;
        }
        .file-remove:hover { opacity: 1; }
        .btn-back-link {
          display: block;
          text-align: center;
          color: #888;
          font-size: 13px;
          font-weight: 500;
          background: none;
          border: none;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          padding: 0;
          width: 100%;
        }
        .btn-back-link:hover { color: #555; }

        @media (max-width: 500px) {
          .panel { padding: 32px 20px; }
        }
        .logo-center {
          margin-bottom: 36px;
        }
        .btn-back {
          padding: 10px 0 0;
        }
        .form-title {
          margin-bottom: 6px;
        }
        .form-subtitle {
          margin-bottom: 24px;
          line-height: 1.5;
        }
      `}</style>
        </>
    );
}
