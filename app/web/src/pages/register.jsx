import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { generateRegistrationKeys } from "../utils/crypto";

const API_URL = "http://localhost:8080/api/execute";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);
  const [recoveryKeys, setRecoveryKeys] = useState(null);
  const [keyDownloaded, setKeyDownloaded] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [slide, setSlide] = useState(1);

  const [form, setForm] = useState({
    company_name: "",
    company_industry: "",
    company_city: "",
    company_province: "",
    email: "",
    username: "",
    password: "",
    confirm_password: "",
  });

  const update = (field) => (e) => {
    setForm({ ...form, [field]: e.target.value });
    setError("");
  };

  const validateStep1 = () => {
    if (!form.company_name.trim()) return "Company name is required";
    return null;
  };

  const validateStep2 = () => {
    if (!form.email.trim()) return "Email is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return "Invalid email format";
    if (!form.username.trim()) return "Username is required";
    if (!form.password) return "Password is required";
    if (form.password.length < 8) return "Password must be at least 8 characters";
    if (form.password !== form.confirm_password) return "Passwords do not match";
    return null;
  };

  const nextStep = () => {
    const err = validateStep1();
    if (err) { setError(err); return; }
    setStep(2);
    setError("");
  };

  const prevStep = () => { setStep(1); setError(""); };

  const handleSubmit = async () => {
    const err = validateStep2();
    if (err) { setError(err); return; }
    setLoading(true);
    setError("");
    try {
      // Generate salt client-side (used for both password hashing and key derivation)
      const salt = crypto.randomUUID();

      // Generate real crypto keys
      const keys = await generateRegistrationKeys(form.password, salt);

      // Store private key locally (user needs this for key exchange)
      localStorage.setItem("ls_private_key", keys.privateKey);

      const res = await fetch(`${API_URL}?action=register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: form.company_name,
          company_industry: form.company_industry || undefined,
          company_city: form.company_city || undefined,
          company_province: form.company_province || undefined,
          email: form.email,
          username: form.username,
          password: form.password,
          salt: salt,
          wrapped_company_key: keys.wrappedCompanyKey,
          key_wrap_algorithm: "AES-KW",
          public_key: keys.publicKey,
          key_algorithm: "AES-256-GCM",
        }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error || "Registration failed"); setLoading(false); return; }

      // Store keys for download
      setRecoveryKeys({
        privateKey: keys.privateKey,
        recoveryWrappedKey: keys.recoveryWrappedKey,
        publicKey: keys.publicKey,
        salt: salt,
      });

      setSuccess(data.data);
    } catch (e) {
      setError("Cannot connect to server");
    }
    setLoading(false);
  };

  const downloadRecoveryKey = () => {
    if (!recoveryKeys) return;

    const keyFile = {
      _warning: "KEEP THIS FILE SAFE. Anyone with this file can access your encrypted data. Do not share it.",
      _format: "Lettersheets Recovery Key v1",
      _created: new Date().toISOString(),
      company: form.company_name,
      email: form.email,
      username: form.username,
      keys: {
        privateKey: recoveryKeys.privateKey,
        recoveryWrappedKey: recoveryKeys.recoveryWrappedKey,
        publicKey: recoveryKeys.publicKey,
        salt: recoveryKeys.salt,
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
    a.download = `${form.company_name.toLowerCase().replace(/\s+/g, "-")}-recovery-key.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setKeyDownloaded(true);
  };

  const provinces = [
    "Metro Manila", "Cavite", "Laguna", "Batangas", "Rizal", "Bulacan",
    "Pampanga", "Cebu", "Davao del Sur", "Iloilo", "Negros Occidental",
    "Pangasinan", "Zambales", "Bataan", "Nueva Ecija", "Tarlac",
  ];

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
            {/* Illustration area */}
            <div className="illust-area">
              <div className="circle-outer">
                <div className="circle-inner">
                  {/* Person at desk SVG */}
                  <svg width="200" height="200" viewBox="0 0 200 200" fill="none" style={{position:"relative",zIndex:2}}>
                    {/* Floor line */}
                    <line x1="30" y1="165" x2="170" y2="165" stroke="#3a7d5c" strokeWidth="1" opacity="0.3"/>
                    {/* Plant pot */}
                    <rect x="32" y="152" width="14" height="13" rx="2" fill="#5a9e7a" opacity="0.25"/>
                    <path d="M39 152 Q36 140 33 135" stroke="#3a7d5c" strokeWidth="1.5" fill="none" opacity="0.4"/>
                    <path d="M39 152 Q42 138 46 134" stroke="#3a7d5c" strokeWidth="1.5" fill="none" opacity="0.4"/>
                    <ellipse cx="33" cy="134" rx="4" ry="3" fill="#5a9e7a" opacity="0.35"/>
                    <ellipse cx="46" cy="133" rx="4" ry="3" fill="#5a9e7a" opacity="0.35"/>
                    <path d="M39 148 Q37 142 39 136" stroke="#3a7d5c" strokeWidth="1.5" fill="none" opacity="0.4"/>
                    <ellipse cx="39" cy="135" rx="3.5" ry="3" fill="#4a9068" opacity="0.4"/>

                    {/* Chair */}
                    <rect x="72" y="125" width="56" height="5" rx="2.5" fill="#3a7d5c" opacity="0.15"/>
                    <path d="M75 130 Q75 155 100 158 Q125 155 125 130" stroke="#3a7d5c" strokeWidth="1.5" fill="none" opacity="0.15"/>
                    <rect x="72" y="100" width="4" height="30" rx="2" fill="#3a7d5c" opacity="0.12"/>
                    <line x1="100" y1="158" x2="100" y2="165" stroke="#3a7d5c" strokeWidth="2" opacity="0.12"/>
                    <ellipse cx="100" cy="165" rx="15" ry="2" fill="#3a7d5c" opacity="0.08"/>

                    {/* Person - head */}
                    <circle cx="100" cy="62" r="16" fill="#f5f0eb"/>
                    <path d="M84 58 Q84 42 100 40 Q116 42 116 58" fill="#2c5e45" opacity="0.85"/>
                    <circle cx="95" cy="62" r="1.5" fill="#2c5e45"/>
                    <circle cx="105" cy="62" r="1.5" fill="#2c5e45"/>
                    <path d="M96 68 Q100 72 104 68" stroke="#2c5e45" strokeWidth="1.2" fill="none" strokeLinecap="round"/>

                    {/* Person - body */}
                    <rect x="88" y="78" width="24" height="35" rx="4" fill="#5a9e7a" opacity="0.6"/>
                    {/* Arms */}
                    <path d="M88 85 L65 108" stroke="#f5f0eb" strokeWidth="5" strokeLinecap="round"/>
                    <path d="M112 85 L135 105" stroke="#f5f0eb" strokeWidth="5" strokeLinecap="round"/>
                    {/* Legs */}
                    <path d="M93 113 L85 145" stroke="#2c3e36" strokeWidth="5" strokeLinecap="round"/>
                    <path d="M107 113 L115 145" stroke="#2c3e36" strokeWidth="5" strokeLinecap="round"/>
                    {/* Shoes */}
                    <ellipse cx="82" cy="147" rx="7" ry="4" fill="#3a7d5c" opacity="0.4"/>
                    <ellipse cx="118" cy="147" rx="7" ry="4" fill="#3a7d5c" opacity="0.4"/>

                    {/* Clipboard in hand */}
                    <rect x="55" y="98" width="22" height="28" rx="2" fill="#fff" stroke="#3a7d5c" strokeWidth="1"/>
                    <rect x="59" y="103" width="14" height="1.5" rx="0.75" fill="#3a7d5c" opacity="0.25"/>
                    <rect x="59" y="107" width="10" height="1.5" rx="0.75" fill="#3a7d5c" opacity="0.2"/>
                    <rect x="59" y="111" width="14" height="1.5" rx="0.75" fill="#3a7d5c" opacity="0.25"/>
                    <rect x="59" y="115" width="8" height="1.5" rx="0.75" fill="#3a7d5c" opacity="0.2"/>
                    <rect x="59" y="119" width="12" height="1.5" rx="0.75" fill="#3a7d5c" opacity="0.15"/>

                    {/* Pen in right hand */}
                    <line x1="133" y1="103" x2="142" y2="118" stroke="#d4a04a" strokeWidth="2" strokeLinecap="round"/>

                    {/* Bag on floor */}
                    <rect x="130" y="148" width="18" height="17" rx="4" fill="#5a9e7a" opacity="0.25"/>
                    <path d="M135 148 Q135 142 139 142 Q143 142 143 148" stroke="#3a7d5c" strokeWidth="1.2" fill="none" opacity="0.25"/>
                  </svg>

                  {/* Floating formula icons around circle */}
                  <span className="float-icon" style={{top:8, left:50, fontSize:14, opacity:0.45}}>f(x)</span>
                  <span className="float-icon" style={{top:15, right:45, fontSize:14, opacity:0.4}}>√x</span>
                  <span className="float-icon" style={{top:55, left:5, fontSize:13, opacity:0.35}}>x-y</span>
                  <span className="float-icon" style={{top:90, left:0, fontSize:12, opacity:0.3}}>(a,b)</span>
                  <span className="float-icon" style={{top:40, right:0, fontSize:14, opacity:0.4}}>π</span>
                  <span className="float-icon" style={{bottom:50, right:5, fontSize:12, opacity:0.35}}>Σ</span>
                  <span className="float-icon" style={{top:80, right:10, fontSize:13, opacity:0.35}}>x²</span>
                  <span className="float-icon" style={{bottom:75, left:15, fontSize:11, opacity:0.3}}>∞</span>

                  {/* Floating SVG icons */}
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

                  {/* Small gear cluster */}
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

            {/* Title & description */}
            <h2 className="left-title">{slides[slide].title}</h2>
            <p className="left-desc">{slides[slide].desc}</p>

            {/* Dots */}
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

            {success ? (
                <div style={{textAlign:"center"}}>
                  <div className="success-icon">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#2d6a4f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                  </div>
                  <h2 className="form-title">Registration Complete</h2>
                  <p className="form-subtitle">Your company has been set up successfully.</p>

                  <div className="details-box">
                    <div className="detail-row"><span className="detail-label">Company</span><span className="detail-value">{form.company_name}</span></div>
                    <div className="detail-row"><span className="detail-label">Email</span><span className="detail-value">{form.email}</span></div>
                    <div className="detail-row"><span className="detail-label">Role</span><span className="badge-tag">Super Admin</span></div>
                  </div>

                  {/* Recovery Key Download */}
                  <div className="key-box">
                    <div className="key-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
                      </svg>
                    </div>
                    <h3 className="key-title">Download Your Recovery Key</h3>
                    <p className="key-desc">
                      This file is the <strong>only way</strong> to recover your encrypted data if you forget your password. Store it somewhere safe — we cannot recover it for you.
                    </p>
                    <button className="btn-download" onClick={downloadRecoveryKey}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                      {keyDownloaded ? "Download Again" : "Download Recovery Key"}
                    </button>
                    {keyDownloaded && (
                        <p className="key-saved">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2d6a4f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          Key file saved
                        </p>
                    )}
                  </div>

                  <a className={`btn-primary ${!keyDownloaded ? "btn-disabled" : ""}`} href="/" onClick={(e) => { if (!keyDownloaded) { e.preventDefault(); setError("Please download your recovery key first"); } }}>
                    Continue to Sign In
                  </a>
                  {error && <div className="error-box" style={{marginTop:8}}>{error}</div>}
                </div>
            ) : (
                <>
                  {step === 1 ? (
                      <>
                        <div className="form-fields">
                          <div className="field">
                            <label className="field-label">Company name</label>
                            <input className="field-input" type="text" placeholder="Acme Corporation" value={form.company_name} onChange={update("company_name")} autoFocus />
                          </div>
                          <div className="field">
                            <label className="field-label">Industry</label>
                            <select className="field-input field-select" value={form.company_industry} onChange={update("company_industry")}>
                              <option value="">Select industry</option>
                              <option value="Agriculture">Agriculture</option>
                              <option value="Automotive">Automotive</option>
                              <option value="Banking & Finance">Banking & Finance</option>
                              <option value="BPO / Outsourcing">BPO / Outsourcing</option>
                              <option value="Construction">Construction</option>
                              <option value="Consulting">Consulting</option>
                              <option value="E-Commerce">E-Commerce</option>
                              <option value="Education">Education</option>
                              <option value="Energy & Utilities">Energy & Utilities</option>
                              <option value="Engineering">Engineering</option>
                              <option value="Entertainment & Media">Entertainment & Media</option>
                              <option value="Food & Beverage">Food & Beverage</option>
                              <option value="Government">Government</option>
                              <option value="Healthcare">Healthcare</option>
                              <option value="Hospitality & Tourism">Hospitality & Tourism</option>
                              <option value="Insurance">Insurance</option>
                              <option value="IT / Software">IT / Software</option>
                              <option value="Legal Services">Legal Services</option>
                              <option value="Logistics & Transportation">Logistics & Transportation</option>
                              <option value="Manufacturing">Manufacturing</option>
                              <option value="Mining">Mining</option>
                              <option value="Non-Profit / NGO">Non-Profit / NGO</option>
                              <option value="Pharmaceutical">Pharmaceutical</option>
                              <option value="Real Estate">Real Estate</option>
                              <option value="Retail">Retail</option>
                              <option value="Telecommunications">Telecommunications</option>
                              <option value="Other">Other</option>
                            </select>
                          </div>
                          <div className="field-row">
                            <div className="field" style={{flex:1}}>
                              <label className="field-label">City</label>
                              <input className="field-input" type="text" placeholder="Makati" value={form.company_city} onChange={update("company_city")} />
                            </div>
                            <div className="field" style={{flex:1}}>
                              <label className="field-label">Province</label>
                              <select className="field-input field-select" value={form.company_province} onChange={update("company_province")}>
                                <option value="">Select</option>
                                {provinces.map(p => <option key={p} value={p}>{p}</option>)}
                              </select>
                            </div>
                          </div>
                        </div>

                        {error && <div className="error-box">{error}</div>}

                        <button className="btn-primary" onClick={nextStep}>Continue</button>
                      </>
                  ) : (
                      <>
                        <div className="form-fields">
                          <div className="field">
                            <label className="field-label">Email</label>
                            <input className="field-input" type="email" placeholder="admin@company.com" value={form.email} onChange={update("email")} autoFocus />
                          </div>
                          <div className="field">
                            <label className="field-label">Username</label>
                            <input className="field-input" type="text" placeholder="admin" value={form.username} onChange={update("username")} />
                          </div>
                          <div className="field">
                            <label className="field-label">Password</label>
                            <div className="input-wrap">
                              <input className="field-input" type={showPassword ? "text" : "password"} placeholder="Minimum 8 characters" value={form.password} onChange={update("password")} style={{paddingRight:42}} />
                              <button className="eye-btn" onClick={() => setShowPassword(!showPassword)} type="button">
                                {showPassword ? <EyeClosed/> : <EyeOpen/>}
                              </button>
                            </div>
                          </div>
                          <div className="field">
                            <label className="field-label">Confirm password</label>
                            <div className="input-wrap">
                              <input className="field-input" type={showConfirm ? "text" : "password"} placeholder="Re-enter password" value={form.confirm_password} onChange={update("confirm_password")} style={{paddingRight:42}} />
                              <button className="eye-btn" onClick={() => setShowConfirm(!showConfirm)} type="button">
                                {showConfirm ? <EyeClosed/> : <EyeOpen/>}
                              </button>
                            </div>
                          </div>
                        </div>

                        {error && <div className="error-box">{error}</div>}

                        <button className="btn-primary" onClick={handleSubmit} disabled={loading}>
                          {loading ? <span className="spinner"/> : "Create Account"}
                        </button>

                        <button className="btn-back" onClick={prevStep}>
                          ← Back to company details
                        </button>
                      </>
                  )}

                  {/* Divider */}
                  <div className="divider-row">
                    <div className="divider-line"/>
                    <span className="divider-text">or</span>
                    <div className="divider-line"/>
                  </div>

                  {/* Google button */}
                  <button className="btn-google">
                    <svg width="18" height="18" viewBox="0 0 48 48">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                    </svg>
                    Sign up with Google
                  </button>

                  <p className="footer-text">
                    Already have an account? <a className="footer-link" href="/"> Sign in</a>
                  </p>
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

        /* ===== LEFT ===== */
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

        /* ===== RIGHT ===== */
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
          margin-bottom: 40px;
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

        .form-title {
          font-size: 20px;
          font-weight: 700;
          color: #1a1a1a;
          margin-bottom: 4px;
          text-align: center;
        }
        .form-subtitle {
          font-size: 14px;
          color: #999;
          margin-bottom: 20px;
          text-align: center;
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
        .field-input::placeholder {
          color: #c0bfba;
        }
        .field-select {
          cursor: pointer;
          -webkit-appearance: none;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23999' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 14px center;
          padding-right: 36px;
        }
        .field-select option { color: #333; }

        .field-row {
          display: flex;
          gap: 12px;
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
        .btn-primary:hover {
          background: #1a1a1a;
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
          gap: 4px;
        }
        .btn-back:hover { color: #555; }

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
        .details-box {
          background: #f8faf9;
          border: 1px solid #e8f0eb;
          border-radius: 10px;
          padding: 14px 18px;
          margin: 20px 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
          text-align: left;
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .detail-label { font-size: 13px; color: #888; font-weight: 500; }
        .detail-value { font-size: 14px; font-weight: 600; color: #222; }
        .badge-tag {
          background: #e8f3ec;
          color: #2d6a4f;
          padding: 3px 10px;
          border-radius: 5px;
          font-size: 12px;
          font-weight: 600;
        }

        /* Recovery Key */
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
        .key-desc strong {
          color: #92400e;
        }
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
        .btn-download:hover {
          background: #92400e;
        }
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
        .btn-disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        /* Responsive */
        @media (max-width: 900px) {
          .page-root { flex-direction: column; padding: 12px; }
          .left-panel { display: none; }
          .right-panel { border-radius: 20px; min-height: auto; }
        }
      `}</style>
      </div>
  );
}
