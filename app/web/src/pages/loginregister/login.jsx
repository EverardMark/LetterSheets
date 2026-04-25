import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { unlockCompanyKey } from "../../utils/crypto";
import Modal from "../components/Modal";
import { termsContent } from "../legal/terms";
import { privacyContent } from "../legal/privacy";

const API_URL = "http://localhost:8080/api/execute";

export default function Login({ onNavigate }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [legalModal, setLegalModal] = useState(null);

  // Login state
  const [form, setForm] = useState({ email: "", password: "" });

  // Post-login: company selection
  const [user, setUser] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [step, setStep] = useState("login"); // "login" | "select_company"

  const update = (field) => (e) => {
    setForm({ ...form, [field]: e.target.value });
    setError("");
    setFieldErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
  };

  const handleLogin = async () => {
    const errs = {};
    if (!form.email.trim()) errs.email = true;
    if (!form.password) errs.password = true;
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      setError(!form.email.trim() ? "Username or email is required" : "Password is required");
      return;
    }

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
        await selectCompany(loginUser, loginCompanies[0]);
      } else {
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

      localStorage.setItem("ls_session", session.session_id);
      localStorage.setItem("ls_company", JSON.stringify({
        id: company.company_id,
        name: company.company_name,
        role: company.role,
        permissions: company.permissions || null,
      }));

      try {
        const companyKey = await unlockCompanyKey(
            form.password,
            loginUser.salt,
            session.wrapped_company_key
        );

        const rawKey = await crypto.subtle.exportKey("raw", companyKey);
        const keyB64 = btoa(String.fromCharCode(...new Uint8Array(rawKey)));
        sessionStorage.setItem("ls_company_key", keyB64);
      } catch (cryptoErr) {
        console.warn("Key unlock failed:", cryptoErr);
      }

      navigate("/dashboard");
    } catch (e) {
      setError("Cannot connect to server");
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleLogin();
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

            {step === "login" ? (
                <>
                  <div className="form-fields">
                    <div className="field">
                      <label className="field-label">Username or email</label>
                      <input
                          className={`field-input${fieldErrors.email ? " field-error" : ""}`}
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
                            className={`field-input${fieldErrors.password ? " field-error" : ""}`}
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter your password"
                            value={form.password}
                            onChange={update("password")}
                            onKeyDown={handleKeyDown}
                            style={{paddingRight:42}}
                        />
                        <button className="eye-btn" onClick={() => setShowPassword(!showPassword)} type="button">
                          <i className={`fa-solid ${showPassword ? "fa-eye-slash" : "fa-eye"}`} style={{fontSize:16, color:"#999"}}></i>
                        </button>
                      </div>
                      <div className="forgot-row">
                        <button className="forgot-link" onClick={() => onNavigate("forgot")}>Forgot password?</button>
                      </div>
                    </div>
                  </div>

                  {error && <div className="error-box">{error}</div>}

                  <button className="btn-primary" onClick={handleLogin} disabled={loading}>
                    {loading ? <span className="spinner"/> : "Sign in"}
                  </button>

                  <p className="footer-text">
                    Are you new? <button className="footer-link" onClick={() => onNavigate("register")}>Create an Account</button>
                  </p>

                  <p className="terms-text">
                    By signing in, you agree to our <span className="terms-link" onClick={() => setLegalModal("terms")}>Terms of Service</span> and <span className="terms-link" onClick={() => setLegalModal("privacy")}>Privacy Policy</span>
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
                          <i className="fa-solid fa-chevron-right" style={{fontSize:14, color:"#999"}}></i>
                        </button>
                    ))}
                  </div>

                  <button className="btn-back" onClick={() => { setStep("login"); setError(""); }}>
                    ← Back to sign in
                  </button>
                </>
            )}
          </div>
          <p className="copyright-text">© {new Date().getFullYear()} Lettersheets. All rights reserved.</p>
        </div>

        <style>{`
        .forgot-row {
          display: flex;
          justify-content: flex-end;
          margin-top: 10px;
          margin-bottom: 10px;
        }
        .forgot-link {
          font-size: 13px;
          color: #2d6a4f;
          font-weight: 500;
          cursor: pointer;
          text-decoration: underline;
          background: none;
          border: none;
          font-family: 'DM Sans', sans-serif;
          padding: 0;
          width: auto;
        }
        .forgot-link:hover {
          color: #1a5035;
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
        .form-fields {
          gap: 20px;
        }
        .logo-center {
          margin-bottom: 48px;
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
