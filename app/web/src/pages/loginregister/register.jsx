import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash } from "@fortawesome/pro-light-svg-icons";
import { generateRegistrationKeys } from "../../utils/crypto";
import Modal from "../components/Modal";
import { termsContent } from "../legal/terms";
import { privacyContent } from "../legal/privacy";

const API_URL = (import.meta.env.VITE_API_BASE||"")+"/api/execute";

export default function RegisterPage({ onNavigate }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);
  const [recoveryKeys, setRecoveryKeys] = useState(null);
  const [keyDownloaded, setKeyDownloaded] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [legalModal, setLegalModal] = useState(null);

  const [form, setForm] = useState({
    company_name: "",
    company_industry: "",
    company_country: "",
    company_city: "",
    company_province: "",
    company_zip: "",
    email: "",
    username: "",
    password: "",
    confirm_password: "",
  });

  const update = (field) => (e) => {
    setForm({ ...form, [field]: e.target.value });
    setError("");
    setFieldErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
  };

  const validateStep1 = () => {
    const errs = {};
    if (!form.company_name.trim()) errs.company_name = true;
    if (!form.company_industry) errs.company_industry = true;
    if (!form.company_country) errs.company_country = true;
    if (form.company_country && !form.company_city) errs.company_city = true;
    if (form.company_country && !form.company_province) errs.company_province = true;
    if (form.company_country && !form.company_zip.trim()) errs.company_zip = true;
    return Object.keys(errs).length ? errs : null;
  };

  const getStep1Error = () => {
    if (!form.company_name.trim()) return "Company name is required";
    if (!form.company_industry) return "Industry is required";
    if (!form.company_country) return "Country is required";
    if (!form.company_city) return "City is required";
    if (!form.company_province) return "State / Province is required";
    if (!form.company_zip.trim()) return "Zip / Postal code is required";
    return null;
  };

  const validateStep2 = () => {
    const errs = {};
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = true;
    if (!form.username.trim()) errs.username = true;
    if (!form.password || form.password.length < 8) errs.password = true;
    if (form.password !== form.confirm_password) errs.confirm_password = true;
    return Object.keys(errs).length ? errs : null;
  };

  const getStep2Error = () => {
    if (!form.email.trim()) return "Email is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return "Invalid email format";
    if (!form.username.trim()) return "Username is required";
    if (!form.password) return "Password is required";
    if (form.password.length < 8) return "Password must be at least 8 characters";
    if (form.password !== form.confirm_password) return "Passwords do not match";
    return null;
  };

  const nextStep = () => {
    const errs = validateStep1();
    if (errs) { setFieldErrors(errs); setError(getStep1Error()); return; }
    setStep(2);
    setError("");
    setFieldErrors({});
  };

  const prevStep = () => { setStep(1); setError(""); setFieldErrors({}); };

  const handleSubmit = async () => {
    const errs = validateStep2();
    if (errs) { setFieldErrors(errs); setError(getStep2Error()); return; }
    setLoading(true);
    setError("");
    try {
      const salt = crypto.randomUUID();
      const keys = await generateRegistrationKeys(form.password, salt);

      localStorage.setItem("ls_kem_private_key", keys.kemPrivateKey);
      localStorage.setItem("ls_dsa_private_key", keys.dsaPrivateKey);

      const res = await fetch(`${API_URL}?action=register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: form.company_name,
          company_industry: form.company_industry || undefined,
          company_country: form.company_country || undefined,
          company_city: form.company_city || undefined,
          company_province: form.company_province || undefined,
          company_zip: form.company_zip || undefined,
          email: form.email,
          username: form.username,
          password: form.password,
          salt: salt,
          wrapped_company_key: keys.wrappedCompanyKey,
          key_wrap_algorithm: "AES-KW",
          key_exchange_algorithm: "ML-KEM-768",
          public_key: keys.kemPublicKey,
          signing_public_key: keys.dsaPublicKey,
          key_algorithm: "AES-256-GCM",
        }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error || "Registration failed"); setLoading(false); return; }

      setRecoveryKeys({
        kemPrivateKey: keys.kemPrivateKey,
        dsaPrivateKey: keys.dsaPrivateKey,
        kemPublicKey: keys.kemPublicKey,
        dsaPublicKey: keys.dsaPublicKey,
        recoveryKemCiphertext: keys.recoveryKemCiphertext,
        recoveryWrappedKey: keys.recoveryWrappedKey,
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
      _format: "Lettersheets Recovery Key v2 (Post-Quantum)",
      _created: new Date().toISOString(),
      company: form.company_name,
      email: form.email,
      username: form.username,
      keys: {
        kemPrivateKey: recoveryKeys.kemPrivateKey,
        dsaPrivateKey: recoveryKeys.dsaPrivateKey,
        kemPublicKey: recoveryKeys.kemPublicKey,
        dsaPublicKey: recoveryKeys.dsaPublicKey,
        recoveryKemCiphertext: recoveryKeys.recoveryKemCiphertext,
        recoveryWrappedKey: recoveryKeys.recoveryWrappedKey,
        salt: recoveryKeys.salt,
        keyAlgorithm: "AES-256-GCM",
        keyWrapAlgorithm: "AES-KW",
        keyExchangeAlgorithm: "ML-KEM-768",
        signatureAlgorithm: "ML-DSA-65",
        kdfAlgorithm: "PBKDF2-SHA256-600000",
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

  const countryData = {
    "Philippines": {
      cities: ["Makati", "Quezon City", "Manila", "Taguig", "Pasig", "Cebu City", "Davao City", "Pasay", "Mandaluyong", "Parañaque", "Caloocan", "Las Piñas", "Muntinlupa", "San Juan", "Marikina", "Iloilo City", "Bacolod", "Cagayan de Oro", "Zamboanga City", "General Santos"],
      label: "Province",
      regions: ["Metro Manila", "Cavite", "Laguna", "Batangas", "Rizal", "Bulacan", "Pampanga", "Cebu", "Davao del Sur", "Iloilo", "Negros Occidental", "Pangasinan", "Zambales", "Bataan", "Nueva Ecija", "Tarlac"],
    },
    "Japan": {
      cities: ["Tokyo", "Osaka", "Yokohama", "Nagoya", "Sapporo", "Kobe", "Kyoto", "Fukuoka", "Kawasaki", "Saitama", "Hiroshima", "Sendai", "Chiba", "Kitakyushu", "Sakai", "Niigata", "Hamamatsu", "Shizuoka", "Sagamihara", "Okayama"],
      label: "Prefecture",
      regions: ["Tokyo", "Osaka", "Kanagawa", "Aichi", "Hokkaido", "Hyogo", "Kyoto", "Fukuoka", "Saitama", "Hiroshima", "Miyagi", "Chiba", "Shizuoka", "Niigata", "Okinawa", "Nagano"],
    },
    "United States": {
      cities: ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "Philadelphia", "San Antonio", "San Diego", "Dallas", "San Jose", "Austin", "Jacksonville", "Fort Worth", "Columbus", "Charlotte", "Indianapolis", "San Francisco", "Seattle", "Denver", "Washington DC"],
      label: "State",
      regions: ["California", "Texas", "Florida", "New York", "Illinois", "Pennsylvania", "Ohio", "Georgia", "North Carolina", "Michigan", "New Jersey", "Virginia", "Washington", "Arizona", "Massachusetts", "Colorado"],
    },
    "Singapore": {
      cities: ["Singapore"],
      label: "District",
      regions: ["Central", "North", "North-East", "East", "West"],
    },
    "Malaysia": {
      cities: ["Kuala Lumpur", "George Town", "Johor Bahru", "Ipoh", "Shah Alam", "Petaling Jaya", "Kuching", "Kota Kinabalu", "Malacca City", "Subang Jaya"],
      label: "State",
      regions: ["Selangor", "Kuala Lumpur", "Johor", "Penang", "Perak", "Sarawak", "Sabah", "Malacca", "Pahang", "Kedah"],
    },
    "Indonesia": {
      cities: ["Jakarta", "Surabaya", "Bandung", "Medan", "Semarang", "Makassar", "Palembang", "Depok", "Tangerang", "Bekasi"],
      label: "Province",
      regions: ["Jakarta", "West Java", "East Java", "Central Java", "North Sumatra", "South Sulawesi", "South Sumatra", "Banten", "Bali", "West Kalimantan"],
    },
    "Vietnam": {
      cities: ["Ho Chi Minh City", "Hanoi", "Da Nang", "Hai Phong", "Can Tho", "Nha Trang", "Hue", "Vung Tau", "Bien Hoa", "Buon Ma Thuot"],
      label: "Province",
      regions: ["Ho Chi Minh City", "Hanoi", "Da Nang", "Hai Phong", "Can Tho", "Binh Duong", "Dong Nai", "Khanh Hoa", "Thua Thien Hue", "Quang Nam"],
    },
    "Thailand": {
      cities: ["Bangkok", "Chiang Mai", "Pattaya", "Phuket", "Nonthaburi", "Hat Yai", "Nakhon Ratchasima", "Udon Thani", "Khon Kaen", "Chon Buri"],
      label: "Province",
      regions: ["Bangkok", "Chiang Mai", "Phuket", "Chon Buri", "Nonthaburi", "Nakhon Ratchasima", "Songkhla", "Udon Thani", "Khon Kaen", "Pathum Thani"],
    },
    "Australia": {
      cities: ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide", "Gold Coast", "Canberra", "Newcastle", "Hobart", "Darwin"],
      label: "State",
      regions: ["New South Wales", "Victoria", "Queensland", "Western Australia", "South Australia", "Tasmania", "ACT", "Northern Territory"],
    },
    "United Kingdom": {
      cities: ["London", "Birmingham", "Manchester", "Glasgow", "Liverpool", "Leeds", "Edinburgh", "Bristol", "Sheffield", "Cardiff"],
      label: "Region",
      regions: ["England", "Scotland", "Wales", "Northern Ireland", "Greater London", "South East", "North West", "West Midlands", "Yorkshire", "East Midlands"],
    },
    "India": {
      cities: ["Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai", "Kolkata", "Pune", "Ahmedabad", "Jaipur", "Lucknow"],
      label: "State",
      regions: ["Maharashtra", "Delhi", "Karnataka", "Telangana", "Tamil Nadu", "West Bengal", "Gujarat", "Rajasthan", "Uttar Pradesh", "Kerala"],
    },
    "South Korea": {
      cities: ["Seoul", "Busan", "Incheon", "Daegu", "Daejeon", "Gwangju", "Suwon", "Ulsan", "Changwon", "Seongnam"],
      label: "Province",
      regions: ["Seoul", "Gyeonggi", "Busan", "Incheon", "Daegu", "Daejeon", "Gwangju", "Ulsan", "Gangwon", "Jeju"],
    },
    "Canada": {
      cities: ["Toronto", "Montreal", "Vancouver", "Calgary", "Edmonton", "Ottawa", "Winnipeg", "Quebec City", "Hamilton", "Halifax"],
      label: "Province",
      regions: ["Ontario", "Quebec", "British Columbia", "Alberta", "Manitoba", "Saskatchewan", "Nova Scotia", "New Brunswick", "Newfoundland", "PEI"],
    },
    "Germany": {
      cities: ["Berlin", "Munich", "Hamburg", "Frankfurt", "Cologne", "Stuttgart", "Düsseldorf", "Leipzig", "Dortmund", "Essen"],
      label: "State",
      regions: ["Bavaria", "North Rhine-Westphalia", "Baden-Württemberg", "Lower Saxony", "Hesse", "Berlin", "Saxony", "Hamburg", "Rhineland-Palatinate", "Brandenburg"],
    },
    "UAE": {
      cities: ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah", "Fujairah", "Al Ain"],
      label: "Emirate",
      regions: ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah", "Fujairah", "Umm Al Quwain"],
    },
  };

  const countries = Object.keys(countryData).sort();
  const selectedCountry = countryData[form.company_country];
  const cities = selectedCountry?.cities || [];
  const regions = selectedCountry?.regions || [];
  const regionLabel = selectedCountry?.label || "State / Province";

  const updateCountry = (e) => {
    setForm({ ...form, company_country: e.target.value, company_city: "", company_province: "", company_zip: "" });
    setError("");
    setFieldErrors((prev) => { const next = { ...prev }; delete next.company_country; delete next.company_city; delete next.company_province; delete next.company_zip; return next; });
  };

  return (
      <>
        <div className="form-panel">
          <div className="form-inner">
            {/* Logo */}
            <div className="logo-center">
              <i className="fa-solid fa-table-columns" style={{fontSize:22, color:"#2d6a4f"}}></i>
              <span className="logo-text">LETTER<span className="logo-bold">SHEETS</span></span>
            </div>

            {success ? (
                <div style={{textAlign:"center"}}>
                  <div className="success-icon">
                    <i className="fa-solid fa-circle-check" style={{fontSize:36, color:"#2d6a4f"}}></i>
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
                      <i className="fa-solid fa-key" style={{fontSize:20, color:"#b45309"}}></i>
                    </div>
                    <h3 className="key-title">Download Your Recovery Key</h3>
                    <p className="key-desc">
                      This file is the <strong>only way</strong> to recover your encrypted data if you forget your password. Store it somewhere safe — we cannot recover it for you.
                    </p>
                    <button className="btn-download" onClick={downloadRecoveryKey}>
                      <i className="fa-solid fa-download" style={{fontSize:16}}></i>
                      {keyDownloaded ? "Download Again" : "Download Recovery Key"}
                    </button>
                    {keyDownloaded && (
                        <p className="key-saved">
                          <i className="fa-solid fa-check" style={{fontSize:13, color:"#2d6a4f"}}></i>
                          Key file saved
                        </p>
                    )}
                  </div>

                  <button className={`btn-primary ${!keyDownloaded ? "btn-disabled" : ""}`} onClick={() => { if (!keyDownloaded) { setError("Please download your recovery key first"); return; } onNavigate("login"); }}>
                    Continue to Sign In
                  </button>
                  {error && <div className="error-box" style={{marginTop:8}}>{error}</div>}
                </div>
            ) : (
                <>
                  {step === 1 ? (
                      <>
                        <div className="form-fields">
                          <div className="field">
                            <label className="field-label">Company name</label>
                            <input className={`field-input${fieldErrors.company_name ? " field-error" : ""}`} type="text" placeholder="Acme Corporation" value={form.company_name} onChange={update("company_name")} autoFocus />
                          </div>
                          <div className="field">
                            <label className="field-label">Industry</label>
                            <select className={`field-input field-select${fieldErrors.company_industry ? " field-error" : ""}`} value={form.company_industry} onChange={update("company_industry")}>
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
                          <div className="field">
                            <label className="field-label">Country</label>
                            <select className={`field-input field-select${fieldErrors.company_country ? " field-error" : ""}`} value={form.company_country} onChange={updateCountry}>
                              <option value="">Select country</option>
                              {countries.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                          {form.company_country && (
                              <>
                                <div className="field-row">
                                  <div className="field" style={{flex:1}}>
                                    <label className="field-label">City</label>
                                    <select className={`field-input field-select${fieldErrors.company_city ? " field-error" : ""}`} value={form.company_city} onChange={update("company_city")}>
                                      <option value="">Select city</option>
                                      {cities.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                  </div>
                                  <div className="field" style={{flex:1}}>
                                    <label className="field-label">{regionLabel}</label>
                                    <select className={`field-input field-select${fieldErrors.company_province ? " field-error" : ""}`} value={form.company_province} onChange={update("company_province")}>
                                      <option value="">Select</option>
                                      {regions.map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                  </div>
                                </div>
                                <div className="field">
                                  <label className="field-label">Zip / Postal code</label>
                                  <input className={`field-input${fieldErrors.company_zip ? " field-error" : ""}`} type="text" placeholder="1200" value={form.company_zip} onChange={update("company_zip")} style={{maxWidth:160}} />
                                </div>
                              </>
                          )}
                        </div>

                        {error && <div className="error-box">{error}</div>}

                        <button className="btn-primary" onClick={nextStep} style={{marginTop:50}}>Continue</button>
                      </>
                  ) : (
                      <>
                        <div className="form-fields">
                          <div className="field">
                            <label className="field-label">Email</label>
                            <input className={`field-input${fieldErrors.email ? " field-error" : ""}`} type="email" placeholder="admin@company.com" value={form.email} onChange={update("email")} autoFocus />
                          </div>
                          <div className="field">
                            <label className="field-label">Username</label>
                            <input className={`field-input${fieldErrors.username ? " field-error" : ""}`} type="text" placeholder="admin" value={form.username} onChange={update("username")} />
                          </div>
                          <div className="field">
                            <label className="field-label">Password</label>
                            <div className="input-wrap">
                              <input className={`field-input${fieldErrors.password ? " field-error" : ""}`} type={showPassword ? "text" : "password"} placeholder="Minimum 8 characters" value={form.password} onChange={update("password")} style={{paddingRight:42}} />
                              <button className="eye-btn" onClick={() => setShowPassword(!showPassword)} type="button" title={showPassword ? "Hide password" : "Show password"} aria-label={showPassword ? "Hide password" : "Show password"}>
                                <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} style={{fontSize:16, color:"#999"}} />
                              </button>
                            </div>
                          </div>
                          <div className="field">
                            <label className="field-label">Confirm password</label>
                            <div className="input-wrap">
                              <input className={`field-input${fieldErrors.confirm_password ? " field-error" : ""}`} type={showConfirm ? "text" : "password"} placeholder="Re-enter password" value={form.confirm_password} onChange={update("confirm_password")} style={{paddingRight:42}} />
                              <button className="eye-btn" onClick={() => setShowConfirm(!showConfirm)} type="button" title={showConfirm ? "Hide password" : "Show password"} aria-label={showConfirm ? "Hide password" : "Show password"}>
                                <FontAwesomeIcon icon={showConfirm ? faEyeSlash : faEye} style={{fontSize:16, color:"#999"}} />
                              </button>
                            </div>
                          </div>
                        </div>

                        {error && <div className="error-box">{error}</div>}

                        <button className="btn-primary" onClick={handleSubmit} disabled={loading} style={{marginTop:50}}>
                          {loading ? <span className="spinner"/> : "Create Account"}
                        </button>

                        <button className="btn-back" onClick={prevStep} style={{fontSize:15, marginTop:10}}>
                          ← Back to company details
                        </button>
                      </>
                  )}

                  <p className="footer-text">
                    Already have an account? <button className="footer-link" onClick={() => onNavigate("login")}> Sign in</button>
                  </p>

                  <p className="terms-text">
                    By creating an account, you agree to our <span className="terms-link" onClick={() => setLegalModal("terms")}>Terms of Service</span> and <span className="terms-link" onClick={() => setLegalModal("privacy")}>Privacy Policy</span>
                  </p>
                </>
            )}
          </div>
          <p className="copyright-text">© {new Date().getFullYear()} Lettersheets. All rights reserved.</p>
        </div>

        <style>{`
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
        /* Success */
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
      `}</style>

        {legalModal && (
            <Modal
                title={legalModal === "terms" ? "Terms of Service" : "Privacy Policy"}
                subtitle="Effective Date: February 27, 2026"
                onClose={() => setLegalModal(null)}
            >
              {legalModal === "terms" ? termsContent : privacyContent}
            </Modal>
        )}
      </>
  );
}
