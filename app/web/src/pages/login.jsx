import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { unlockCompanyKey } from "../utils/crypto";

const API_URL = "http://localhost:8080/api/execute";

export default function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [slide, setSlide] = useState(0);

  // Login state
  const [form, setForm] = useState({ email: "", password: "" });

  // Post-login: company selection
  const [user, setUser] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [step, setStep] = useState("login"); // "login" | "select_company"

  const update = (field) => (e) => {
    setForm({ ...form, [field]: e.target.value });
    setError("");
  };

  const handleLogin = async () => {
    if (!form.email.trim()) { setError("Username or email is required"); return; }
    if (!form.password) { setError("Password is required"); return; }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_URL}?action=login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, password: form.password }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Login failed");
        setLoading(false);
        return;
      }

      const loginUser = data.data.user;
      const loginCompanies = data.data.companies;

      setUser(loginUser);
      localStorage.setItem("ls_user", JSON.stringify(loginUser));

      if (loginCompanies.length === 1) {
        // Auto-select single company
        await selectCompany(loginUser, loginCompanies[0]);
      } else {
        // Show company picker
        setCompanies(loginCompanies);
        setStep("select_company");
      }
    } catch (e) {
      setError("Cannot connect to server");
    }
    setLoading(false);
  };

  const selectCompany = async (loginUser, company) => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_URL}?action=select_company`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: loginUser.id,
          company_id: company.company_id,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Failed to select company");
        setLoading(false);
        return;
      }

      const session = data.data;

      // Store session
      localStorage.setItem("ls_session", session.session_id);
      localStorage.setItem("ls_company", JSON.stringify({
        id: company.company_id,
        name: company.company_name,
        role: company.role,
      }));

      // Unlock company key client-side
      try {
        const companyKey = await unlockCompanyKey(
            form.password,
            loginUser.salt,
            session.wrapped_company_key
        );

        // Export key for session storage (stays in memory)
        const rawKey = await crypto.subtle.exportKey("raw", companyKey);
        const keyB64 = btoa(String.fromCharCode(...new Uint8Array(rawKey)));
        sessionStorage.setItem("ls_company_key", keyB64);
      } catch (cryptoErr) {
        console.warn("Key unlock failed:", cryptoErr);
        // Non-fatal: user can still use non-encrypted features
      }

      // Navigate to dashboard
      navigate("/dashboard");
    } catch (e) {
      setError("Cannot connect to server");
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleLogin();
  };

  const slides = [
    { title: "Lettersheets HR", desc: "Streamline Your HR Operations with End-to-End Encrypted Employee Management" },
    { title: "Secure by Design", desc: "Client-side encryption ensures your sensitive employee data stays private — even from us" },
    { title: "Built for PH", desc: "SSS, PhilHealth, Pag-IBIG, and BIR compliance requirements ready out of the box" },
  ];

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
        {/* ===== LEFT PANEL ===== */}
        <div className="left-panel">
          <div className="left-card">
            <div className="illust-area">
              <div className="circle-outer">
                <div className="circle-inner">
                  <svg width="200" height="200" viewBox="0 0 200 200" fill="none" style={{position:"relative",zIndex:2}}>
                    <line x1="30" y1="165" x2="170" y2="165" stroke="#3a7d5c" strokeWidth="1" opacity="0.3"/>
                    <rect x="32" y="152" width="14" height="13" rx="2" fill="#5a9e7a" opacity="0.25"/>
                    <path d="M39 152 Q36 140 33 135" stroke="#3a7d5c" strokeWidth="1.5" fill="none" opacity="0.4"/>
                    <path d="M39 152 Q42 138 46 134" stroke="#3a7d5c" strokeWidth="1.5" fill="none" opacity="0.4"/>
                    <ellipse cx="33" cy="134" rx="4" ry="3" fill="#5a9e7a" opacity="0.35"/>
                    <ellipse cx="46" cy="133" rx="4" ry="3" fill="#5a9e7a" opacity="0.35"/>
                    <path d="M39 148 Q37 142 39 136" stroke="#3a7d5c" strokeWidth="1.5" fill="none" opacity="0.4"/>
                    <ellipse cx="39" cy="135" rx="3.5" ry="3" fill="#4a9068" opacity="0.4"/>
                    <rect x="72" y="125" width="56" height="5" rx="2.5" fill="#3a7d5c" opacity="0.15"/>
                    <path d="M75 130 Q75 155 100 158 Q125 155 125 130" stroke="#3a7d5c" strokeWidth="1.5" fill="none" opacity="0.15"/>
                    <rect x="72" y="100" width="4" height="30" rx="2" fill="#3a7d5c" opacity="0.12"/>
                    <line x1="100" y1="158" x2="100" y2="165" stroke="#3a7d5c" strokeWidth="2" opacity="0.12"/>
                    <ellipse cx="100" cy="165" rx="15" ry="2" fill="#3a7d5c" opacity="0.08"/>
                    <circle cx="100" cy="62" r="16" fill="#f5f0eb"/>
                    <path d="M84 58 Q84 42 100 40 Q116 42 116 58" fill="#2c5e45" opacity="0.85"/>
                    <circle cx="95" cy="62" r="1.5" fill="#2c5e45"/>
                    <circle cx="105" cy="62" r="1.5" fill="#2c5e45"/>
                    <path d="M96 68 Q100 72 104 68" stroke="#2c5e45" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
                    <rect x="88" y="78" width="24" height="35" rx="4" fill="#5a9e7a" opacity="0.6"/>
                    <path d="M88 85 L65 108" stroke="#f5f0eb" strokeWidth="5" strokeLinecap="round"/>
                    <path d="M112 85 L135 105" stroke="#f5f0eb" strokeWidth="5" strokeLinecap="round"/>
                    <path d="M93 113 L85 145" stroke="#2c3e36" strokeWidth="5" strokeLinecap="round"/>
                    <path d="M107 113 L115 145" stroke="#2c3e36" strokeWidth="5" strokeLinecap="round"/>
                    <ellipse cx="82" cy="147" rx="7" ry="4" fill="#3a7d5c" opacity="0.4"/>
                    <ellipse cx="118" cy="147" rx="7" ry="4" fill="#3a7d5c" opacity="0.4"/>
                    <rect x="55" y="98" width="22" height="28" rx="2" fill="#fff" stroke="#3a7d5c" strokeWidth="1"/>
                    <rect x="59" y="103" width="14" height="1.5" rx="0.75" fill="#3a7d5c" opacity="0.25"/>
                    <rect x="59" y="107" width="10" height="1.5" rx="0.75" fill="#3a7d5c" opacity="0.2"/>
                    <rect x="59" y="111" width="14" height="1.5" rx="0.75" fill="#3a7d5c" opacity="0.25"/>
                    <rect x="59" y="115" width="8" height="1.5" rx="0.75" fill="#3a7d5c" opacity="0.2"/>
                    <rect x="59" y="119" width="12" height="1.5" rx="0.75" fill="#3a7d5c" opacity="0.15"/>
                    <line x1="133" y1="103" x2="142" y2="118" stroke="#d4a04a" strokeWidth="2" strokeLinecap="round"/>
                    <rect x="130" y="148" width="18" height="17" rx="4" fill="#5a9e7a" opacity="0.25"/>
                    <path d="M135 148 Q135 142 139 142 Q143 142 143 148" stroke="#3a7d5c" strokeWidth="1.2" fill="none" opacity="0.25"/>
                  </svg>

                  <span className="float-icon" style={{top:8, left:50, fontSize:14, opacity:0.45}}>f(x)</span>
                  <span className="float-icon" style={{top:15, right:45, fontSize:14, opacity:0.4}}>√x</span>
                  <span className="float-icon" style={{top:55, left:5, fontSize:13, opacity:0.35}}>x-y</span>
                  <span className="float-icon" style={{top:90, left:0, fontSize:12, opacity:0.3}}>(a,b)</span>
                  <span className="float-icon" style={{top:40, right:0, fontSize:14, opacity:0.4}}>π</span>
                  <span className="float-icon" style={{bottom:50, right:5, fontSize:12, opacity:0.35}}>Σ</span>
                  <span className="float-icon" style={{top:80, right:10, fontSize:13, opacity:0.35}}>x²</span>
                  <span className="float-icon" style={{bottom:75, left:15, fontSize:11, opacity:0.3}}>∞</span>
                  <div className="float-icon" style={{top:2, left:10}}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3a7d5c" strokeWidth="1.5" opacity="0.4"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  </div>
                  <div className="float-icon" style={{top:35, right:2}}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3a7d5c" strokeWidth="1.5" opacity="0.35"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                  </div>
                  <div className="float-icon" style={{bottom:40, left:2}}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3a7d5c" strokeWidth="1.5" opacity="0.35"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  </div>
                  <div className="float-icon" style={{bottom:25, right:30}}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3a7d5c" strokeWidth="1.5" opacity="0.3"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  </div>
                  <div className="float-icon" style={{top:25, left:85}}>
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                      <circle cx="11" cy="14" r="4" stroke="#3a7d5c" strokeWidth="1.2" opacity="0.35"/>
                      <circle cx="11" cy="14" r="1.5" fill="#3a7d5c" opacity="0.25"/>
                      <circle cx="20" cy="10" r="3" stroke="#3a7d5c" strokeWidth="1" opacity="0.25"/>
                      <circle cx="20" cy="10" r="1" fill="#3a7d5c" opacity="0.2"/>
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            <h2 className="left-title">{slides[slide].title}</h2>
            <p className="left-desc">{slides[slide].desc}</p>

            <div className="dots-row">
              {slides.map((_, i) => (
                  <div key={i} className={`dot ${i === slide ? "dot-active" : ""}`} onClick={() => setSlide(i)} />
              ))}
            </div>
          </div>
        </div>

        {/* ===== RIGHT PANEL ===== */}
        <div className="right-panel">
          <div className="right-inner">
            {/* Logo */}
            <div className="logo-center">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2d6a4f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="18" rx="2"/><path d="M2 7h20"/><path d="M6 11h4"/><path d="M6 15h8"/>
              </svg>
              <span className="logo-text">LETTER<span className="logo-bold">SHEETS</span></span>
            </div>

            {step === "login" ? (
                <>
                  <div className="form-fields">
                    <div className="field">
                      <label className="field-label">Username or email</label>
                      <input
                          className="field-input"
                          type="text"
                          placeholder="admin@company.com"
                          value={form.email}
                          onChange={update("email")}
                          onKeyDown={handleKeyDown}
                          autoFocus
                      />
                    </div>

                    <div className="field">
                      <label className="field-label">Password</label>
                      <div className="input-wrap">
                        <input
                            className="field-input"
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter your password"
                            value={form.password}
                            onChange={update("password")}
                            onKeyDown={handleKeyDown}
                            style={{paddingRight:42}}
                        />
                        <button className="eye-btn" onClick={() => setShowPassword(!showPassword)} type="button">
                          {showPassword ? <EyeClosed/> : <EyeOpen/>}
                        </button>
                      </div>
                      <div className="forgot-row">
                        <a className="forgot-link" href="/forgot-password">Forgot password?</a>
                      </div>
                    </div>
                  </div>

                  {error && <div className="error-box">{error}</div>}

                  <button className="btn-primary" onClick={handleLogin} disabled={loading}>
                    {loading ? <span className="spinner"/> : "Sign in"}
                  </button>

                  {/* Divider */}
                  <div className="divider-row">
                    <div className="divider-line"/>
                    <span className="divider-text">or</span>
                    <div className="divider-line"/>
                  </div>

                  {/* Google */}
                  <button className="btn-google">
                    <svg width="18" height="18" viewBox="0 0 48 48">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                    </svg>
                    Sign in with Google
                  </button>

                  <p className="footer-text">
                    Are you new? <a className="footer-link" href="/register">Create an Account</a>
                  </p>
                </>
            ) : (
                <>
                  <h2 className="select-title">Select Company</h2>
                  <p className="select-subtitle">Welcome back, {user?.username}. Choose a company to continue.</p>

                  {error && <div className="error-box">{error}</div>}

                  <div className="company-list">
                    {companies.map((c) => (
                        <button
                            key={c.company_id}
                            className="company-card"
                            onClick={() => selectCompany(user, c)}
                            disabled={loading}
                        >
                          <div className="company-info">
                            <div className="company-avatar">
                              {c.company_name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="company-name">{c.company_name}</div>
                              <div className="company-role">{c.role}</div>
                            </div>
                          </div>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6"/>
                          </svg>
                        </button>
                    ))}
                  </div>

                  <button className="btn-back" onClick={() => { setStep("login"); setError(""); }}>
                    ← Back to sign in
                  </button>
                </>
            )}
          </div>
        </div>

        <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { margin: 0; background: #dce9df; }

        .page-root {
          display: flex;
          min-height: 100vh;
          font-family: 'DM Sans', sans-serif;
          color: #222;
          background: #dce9df;
          padding: 18px;
          gap: 0;
          align-items: stretch;
        }

        .left-panel {
          flex: 0 0 48%;
          display: flex;
          align-items: stretch;
          justify-content: center;
          padding: 0;
        }
        .left-card {
          background: linear-gradient(170deg, #e8f3ec 0%, #d6ead9 50%, #cde4d1 100%);
          border-radius: 24px;
          padding: 50px 40px 40px;
          width: 100%;
          flex: 1;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .illust-area {
          display: flex;
          justify-content: center;
          margin-bottom: 30px;
        }
        .circle-outer {
          width: 280px;
          height: 280px;
          border-radius: 50%;
          background: rgba(255,255,255,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .circle-inner {
          width: 240px;
          height: 240px;
          border-radius: 50%;
          background: rgba(255,255,255,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }

        .float-icon {
          position: absolute;
          font-family: 'DM Sans', serif;
          color: #3a7d5c;
          font-weight: 500;
          font-style: italic;
          pointer-events: none;
        }

        .left-title {
          font-size: 26px;
          font-weight: 700;
          color: #1a3c2a;
          margin-bottom: 10px;
          letter-spacing: -0.02em;
        }
        .left-desc {
          font-size: 14px;
          color: #4a7a5a;
          line-height: 1.65;
          margin-bottom: 28px;
          max-width: 360px;
        }

        .dots-row {
          display: flex;
          justify-content: center;
          gap: 8px;
        }
        .dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: rgba(45,106,79,0.18);
          cursor: pointer;
          transition: all 0.3s ease;
        }
        .dot-active {
          background: #2d6a4f;
          width: 26px;
          border-radius: 5px;
        }

        .right-panel {
          flex: 1;
          background: #ffffff;
          border-radius: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px 24px;
        }
        .right-inner {
          width: 100%;
          max-width: 370px;
        }

        .logo-center {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          margin-bottom: 48px;
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

        .form-fields {
          display: flex;
          flex-direction: column;
          gap: 20px;
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
        .field-input::placeholder {
          color: #c0bfba;
        }

        .input-wrap {
          position: relative;
        }
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

        .forgot-row {
          display: flex;
          justify-content: flex-end;
          margin-top: 2px;
        }
        .forgot-link {
          font-size: 13px;
          color: #2d6a4f;
          font-weight: 500;
          cursor: pointer;
          text-decoration: underline;
        }
        .forgot-link:hover {
          color: #1a5035;
        }

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
        }
        .btn-primary:hover {
          background: #1a1a1a;
        }

        .spinner {
          width: 20px;
          height: 20px;
          border: 2.5px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          display: inline-block;
          animation: spin 0.6s linear infinite;
        }

        .divider-row {
          display: flex;
          align-items: center;
          gap: 16px;
          margin: 22px 0;
        }
        .divider-line {
          flex: 1;
          height: 1px;
          background: #eee;
        }
        .divider-text {
          font-size: 13px;
          color: #bbb;
        }

        .btn-google {
          width: 100%;
          padding: 12px 24px;
          background: #fff;
          color: #444;
          border: 1.5px solid #e0e0e0;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 500;
          font-family: 'DM Sans', sans-serif;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          transition: background 0.2s ease;
        }
        .btn-google:hover {
          background: #f9f9f7;
        }

        .footer-text {
          text-align: center;
          font-size: 13px;
          color: #999;
          margin-top: 22px;
        }
        .footer-link {
          color: #2d6a4f;
          font-weight: 600;
          cursor: pointer;
          text-decoration: underline;
        }
        .footer-link:hover {
          color: #1a5035;
        }

        /* Company selector */
        .select-title {
          font-size: 20px;
          font-weight: 700;
          color: #1a1a1a;
          text-align: center;
          margin-bottom: 4px;
        }
        .select-subtitle {
          font-size: 14px;
          color: #999;
          text-align: center;
          margin-bottom: 24px;
        }
        .company-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 16px;
        }
        .company-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 14px 16px;
          background: #f9f9f7;
          border: 1.5px solid #e8e8e5;
          border-radius: 12px;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          transition: all 0.2s ease;
          text-align: left;
        }
        .company-card:hover {
          border-color: #2d6a4f;
          background: #f0f7f2;
        }
        .company-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .company-avatar {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: #2d6a4f;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          font-weight: 700;
        }
        .company-name {
          font-size: 15px;
          font-weight: 600;
          color: #222;
        }
        .company-role {
          font-size: 12px;
          color: #888;
          font-weight: 500;
          text-transform: capitalize;
          margin-top: 1px;
        }
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
          padding: 8px 0 0;
        }
        .btn-back:hover { color: #555; }

        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 900px) {
          .page-root { flex-direction: column; padding: 12px; }
          .left-panel { display: none; }
          .right-panel { border-radius: 20px; min-height: auto; }
        }
      `}</style>
      </div>
  );
}
