import { useState, useRef } from "react";
import { recoverKeys } from "../utils/crypto";

const API_URL = "http://localhost:8080/api/execute";

export default function ForgotPassword() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [step, setStep] = useState("upload"); // upload | reset | done
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
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
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);

                // Validate file structure
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
        if (!form.email.trim()) { setError("Email is required"); return; }
        if (!form.password) { setError("New password is required"); return; }
        if (form.password.length < 8) { setError("Password must be at least 8 characters"); return; }
        if (form.password !== form.confirm_password) { setError("Passwords do not match"); return; }

        setLoading(true);
        setError("");

        try {
            // Generate new salt
            const newSalt = crypto.randomUUID();

            // Recover: decrypt old company key with private key, re-wrap with new password
            const keys = await recoverKeys(
                recoveryData.keys.recoveryWrappedKey,
                recoveryData.keys.privateKey,
                form.password,
                newSalt
            );

            // Store new private key locally
            localStorage.setItem("ls_private_key", keys.privateKey);

            // Send to server
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

            // Save new recovery keys for download
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

    const EyeOpen = () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
        </svg>
    );
    const EyeClosed = () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
        </svg>
    );

    return (
        <div className="page-root">
            <div className="panel">
                <div className="panel-inner">
                    {/* Logo */}
                    <div className="logo-center">
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2d6a4f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="3" width="20" height="18" rx="2"/><path d="M2 7h20"/><path d="M6 11h4"/><path d="M6 15h8"/>
                        </svg>
                        <span className="logo-text">LETTER<span className="logo-bold">SHEETS</span></span>
                    </div>

                    {/* ===== STEP 1: Upload recovery file ===== */}
                    {step === "upload" && (
                        <>
                            <div className="header-icon">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
                                </svg>
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
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2d6a4f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                        <polyline points="17 8 12 3 7 8"/>
                                        <line x1="12" y1="3" x2="12" y2="15"/>
                                    </svg>
                                </div>
                                <p className="upload-text">Click or drag your recovery key file here</p>
                                <p className="upload-hint">*-recovery-key.json</p>
                            </div>

                            <div className="info-box">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,marginTop:1}}>
                                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                                </svg>
                                <p>This file was generated when you created your account. Without it, encrypted data cannot be recovered.</p>
                            </div>

                            <a className="btn-back-link" href="/">← Back to sign in</a>
                        </>
                    )}

                    {/* ===== STEP 2: Set new password ===== */}
                    {step === "reset" && (
                        <>
                            <h2 className="form-title">Set New Password</h2>
                            <p className="form-subtitle">Recovery file loaded for <strong>{recoveryData?.company}</strong></p>

                            <div className="file-badge">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2d6a4f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                                </svg>
                                <span>{recoveryFile?.name}</span>
                                <button className="file-remove" onClick={() => { setStep("upload"); setRecoveryData(null); setRecoveryFile(null); setError(""); }}>✕</button>
                            </div>

                            <div className="form-fields">
                                <div className="field">
                                    <label className="field-label">Email</label>
                                    <input className="field-input" type="email" value={form.email} onChange={update("email")} />
                                </div>
                                <div className="field">
                                    <label className="field-label">New password</label>
                                    <div className="input-wrap">
                                        <input className="field-input" type={showPassword ? "text" : "password"} placeholder="Minimum 8 characters" value={form.password} onChange={update("password")} style={{paddingRight:42}} />
                                        <button className="eye-btn" onClick={() => setShowPassword(!showPassword)} type="button">
                                            {showPassword ? <EyeClosed/> : <EyeOpen/>}
                                        </button>
                                    </div>
                                </div>
                                <div className="field">
                                    <label className="field-label">Confirm new password</label>
                                    <div className="input-wrap">
                                        <input className="field-input" type={showConfirm ? "text" : "password"} placeholder="Re-enter password" value={form.confirm_password} onChange={update("confirm_password")} style={{paddingRight:42}} />
                                        <button className="eye-btn" onClick={() => setShowConfirm(!showConfirm)} type="button">
                                            {showConfirm ? <EyeClosed/> : <EyeOpen/>}
                                        </button>
                                    </div>
                                    {form.confirm_password && form.password === form.confirm_password && (
                                        <span className="match-text">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2d6a4f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
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
                                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#2d6a4f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                                </svg>
                            </div>

                            <h2 className="form-title">Password Reset Complete</h2>
                            <p className="form-subtitle">Your password and encryption keys have been updated.</p>

                            {/* New recovery key download */}
                            <div className="key-box">
                                <div className="key-icon">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
                                    </svg>
                                </div>
                                <h3 className="key-title">Download New Recovery Key</h3>
                                <p className="key-desc">
                                    Your old recovery file is no longer valid. Download the new one and <strong>replace the old file</strong>.
                                </p>
                                <button className="btn-download" onClick={downloadNewRecoveryKey}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                        <polyline points="7 10 12 15 17 10"/>
                                        <line x1="12" y1="15" x2="12" y2="3"/>
                                    </svg>
                                    {keyDownloaded ? "Download Again" : "Download New Recovery Key"}
                                </button>
                                {keyDownloaded && (
                                    <p className="key-saved">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2d6a4f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                        Key file saved
                                    </p>
                                )}
                            </div>

                            <a className={`btn-primary ${!keyDownloaded ? "btn-disabled" : ""}`} href="/" onClick={(e) => { if (!keyDownloaded) { e.preventDefault(); setError("Please download your new recovery key first"); } }}>
                                Continue to Sign In
                            </a>
                            {error && <div className="error-box" style={{marginTop:8}}>{error}</div>}
                        </>
                    )}
                </div>
            </div>

            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { margin: 0; background: #dce9df; }

        .page-root {
          min-height: 100vh;
          font-family: 'DM Sans', sans-serif;
          color: #222;
          background: #dce9df;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .panel {
          background: #fff;
          border-radius: 24px;
          width: 100%;
          max-width: 440px;
          padding: 48px 36px;
        }
        .panel-inner {
          width: 100%;
        }

        .logo-center {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          margin-bottom: 36px;
        }
        .logo-text {
          font-size: 21px;
          font-weight: 400;
          color: #333;
          letter-spacing: 0.18em;
        }
        .logo-bold {
          font-weight: 700;
          color: #2d6a4f;
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

        .form-title {
          font-size: 20px;
          font-weight: 700;
          color: #1a1a1a;
          margin-bottom: 6px;
          text-align: center;
        }
        .form-subtitle {
          font-size: 14px;
          color: #999;
          margin-bottom: 24px;
          text-align: center;
          line-height: 1.5;
        }
        .form-subtitle strong {
          color: #555;
        }

        .form-fields {
          display: flex;
          flex-direction: column;
          gap: 18px;
          margin-bottom: 10px;
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .field-label {
          font-size: 14px;
          font-weight: 500;
          color: #555;
        }
        .field-input {
          width: 100%;
          padding: 13px 16px;
          font-size: 15px;
          font-family: 'DM Sans', sans-serif;
          border: 1.5px solid #e0e0e0;
          border-radius: 10px;
          outline: none;
          background: #f9f9f7;
          color: #222;
          transition: border-color 0.2s ease;
        }
        .field-input:focus {
          border-color: #2d6a4f;
          background: #fff;
        }
        .field-input::placeholder { color: #c0bfba; }

        .input-wrap { position: relative; }
        .eye-btn {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          padding: 2px;
          display: flex;
          align-items: center;
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
        }
        .info-box p {
          font-size: 12.5px;
          color: #6b7280;
          line-height: 1.5;
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

        .error-box {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #dc2626;
          font-size: 13px;
          font-weight: 500;
          padding: 10px 14px;
          border-radius: 8px;
          margin-bottom: 6px;
          margin-top: 4px;
        }

        .btn-primary {
          width: 100%;
          padding: 14px 24px;
          background: #2a2a2a;
          color: #fff;
          border: none;
          border-radius: 10px;
          font-size: 15px;
          font-weight: 600;
          font-family: 'DM Sans', sans-serif;
          cursor: pointer;
          transition: all 0.2s ease;
          margin-top: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          text-decoration: none;
        }
        .btn-primary:hover { background: #1a1a1a; }
        .btn-disabled { opacity: 0.4; cursor: not-allowed; }

        .btn-back {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          background: none;
          border: none;
          color: #888;
          font-size: 13px;
          font-weight: 500;
          font-family: 'DM Sans', sans-serif;
          cursor: pointer;
          padding: 10px 0 0;
        }
        .btn-back:hover { color: #555; }

        .btn-back-link {
          display: block;
          text-align: center;
          color: #888;
          font-size: 13px;
          font-weight: 500;
          text-decoration: none;
        }
        .btn-back-link:hover { color: #555; }

        .spinner {
          width: 20px;
          height: 20px;
          border: 2.5px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          display: inline-block;
          animation: spin 0.6s linear infinite;
        }

        /* Success */
        .success-icon {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: #e8f3ec;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 16px;
        }

        /* Recovery key box */
        .key-box {
          background: #fffbeb;
          border: 1.5px solid #fde68a;
          border-radius: 12px;
          padding: 20px;
          margin: 16px 0;
          text-align: center;
        }
        .key-icon {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: #fef3c7;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 10px;
        }
        .key-title {
          font-size: 15px;
          font-weight: 700;
          color: #92400e;
          margin-bottom: 6px;
        }
        .key-desc {
          font-size: 12.5px;
          color: #a16207;
          line-height: 1.5;
          margin-bottom: 14px;
        }
        .key-desc strong { color: #92400e; }
        .btn-download {
          width: 100%;
          padding: 11px 20px;
          background: #b45309;
          color: #fff;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          font-family: 'DM Sans', sans-serif;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: background 0.2s ease;
        }
        .btn-download:hover { background: #92400e; }
        .key-saved {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          font-size: 13px;
          color: #2d6a4f;
          font-weight: 600;
          margin-top: 10px;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 500px) {
          .panel { padding: 32px 20px; }
        }
      `}</style>
        </div>
    );
}
