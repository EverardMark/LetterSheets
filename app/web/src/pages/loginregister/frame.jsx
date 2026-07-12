import { useState, useEffect } from "react";
import "@fortawesome/fontawesome-free/css/all.min.css"; // bundled locally (offline-safe) — replaces the old CDN link
import Login from "./Login";
import Register from "./Register";
import ForgotPassword from "./ForgotPassword";

const SLIDES = {
    login: [
        { title: "Lettersheets HR", desc: "Streamline Your HR Operations with End-to-End Encrypted Employee Management" },
        { title: "Secure by Design", desc: "Client-side encryption ensures your sensitive employee data stays private — even from us" },
        { title: "Built for PH", desc: "SSS, PhilHealth, Pag-IBIG, and BIR compliance requirements ready out of the box" },
    ],
    register: [
        { title: "Lettersheets ERP", desc: "Streamline Your Business Operations with Post-Quantum Encrypted Data Protection" },
        { title: "Quantum-Safe Security", desc: "ML-KEM-768 key exchange and ML-DSA-65 signatures protect your data against current and future threats" },
        { title: "Built for PH", desc: "SSS, PhilHealth, Pag-IBIG, and BIR compliance requirements ready out of the box" },
    ],
};

const INITIAL_SLIDE = { login: 0, register: 1 };

export default function Frame() {
    const [view, setView] = useState("login");
    const [slide, setSlide] = useState(0);
    const [screenHeight, setScreenHeight] = useState(window.innerHeight);

    useEffect(() => {
        const handleResize = () => setScreenHeight(window.innerHeight);
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    // Load Font Awesome CDN
    const handleNavigate = (newView) => {
        setView(newView);
        if (newView in INITIAL_SLIDE) setSlide(INITIAL_SLIDE[newView]);
    };

    const child = (() => {
        switch (view) {
            case "register":
                return <Register onNavigate={handleNavigate} />;
            case "forgot":
                return <ForgotPassword onNavigate={handleNavigate} />;
            default:
                return <Login onNavigate={handleNavigate} />;
        }
    })();

    const slides = SLIDES[view] || SLIDES.login;
    const showLeftPanel = view !== "forgot";

    return (
        <div className={`page-root${view === "forgot" ? " page-root-centered" : ""}`} style={{ "--screen-height": `${screenHeight}px` }}>
            {child}

            {showLeftPanel && (
                <div className="illust-panel">
                    <div className="illust-card">
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
                                        <i className="fa-regular fa-clock" style={{fontSize:18, color:"#3a7d5c", opacity:0.4}}></i>
                                    </div>
                                    <div className="float-icon" style={{top:35, right:2}}>
                                        <i className="fa-solid fa-globe" style={{fontSize:16, color:"#3a7d5c", opacity:0.35}}></i>
                                    </div>
                                    <div className="float-icon" style={{bottom:40, left:2}}>
                                        <i className="fa-regular fa-star" style={{fontSize:15, color:"#3a7d5c", opacity:0.35}}></i>
                                    </div>
                                    <div className="float-icon" style={{bottom:25, right:30}}>
                                        <i className="fa-solid fa-circle-check" style={{fontSize:14, color:"#3a7d5c", opacity:0.3}}></i>
                                    </div>
                                    <div className="float-icon" style={{top:25, left:85}}>
                                        <i className="fa-solid fa-gears" style={{fontSize:18, color:"#3a7d5c", opacity:0.3}}></i>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <h2 className="illust-title">{slides[slide].title}</h2>
                        <p className="illust-desc">{slides[slide].desc}</p>

                        <div className="dots-row">
                            {slides.map((_, i) => (
                                <div key={i} className={`dot ${i === slide ? "dot-active" : ""}`} onClick={() => setSlide(i)} />
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <style>{`
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; width:100%;}

        body { margin: 0; background: #dce9df; }

        i.fa-solid, i.fa-regular, i.fa-brands {
          width: auto;
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
          width: auto;
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
          margin-top: 10px;
        }

        .field-input.field-error,
        .field-select.field-error {
          border-color: #dc2626;
          background: #fef8f8;
        }

        .field-input.field-error:focus,
        .field-select.field-error:focus {
          border-color: #dc2626;
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

        .btn-primary:hover {
          background: #1a1a1a;
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

        @keyframes spin { to { transform: rotate(360deg); } }

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

        .form-fields {
          display: flex;
          flex-direction: column;
          gap: 18px;
          margin-bottom: 10px;
        }

        .logo-center {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          margin-bottom: 40px;
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

        .illust-panel {
          width:calc(100% - 510px);
          display: flex;
          align-items: stretch;
          justify-content: center;
          padding: 0;
        }

        .illust-card {
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

        .illust-title {
          font-size: 26px;
          font-weight: 700;
          color: #1a3c2a;
          margin-bottom: 10px;
          letter-spacing: -0.02em;
        }

        .illust-desc {
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

        .form-panel {
          width: 500px;
            margin-right: 10px;
          background: #ffffff;
          border-radius: 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 24px;
        }

        .form-inner {
          width: 100%;
          max-width: 370px;
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
          font-size: 15px;
          color: #999;
          font-weight:bold;
          text-align:center;
        }

        .footer-text {
          text-align: center;
          font-size: 14px;
          color: #999;
          font-weight:bold;
          margin-top: 22px;
        }

        .footer-link {
            margin-top:5px;
          color: #2d6a4f;
          font-weight: 600;
          cursor: pointer;
          text-decoration: underline;
          background: none;
          border: none;
          font-size: 15px;
          font-family: 'DM Sans', sans-serif;
          padding: 0;
        }

        .terms-text {
          text-align: center;
          font-size: 12px;
          color: #aaa;
          margin-top: 16px;
          line-height: 1.5;
        }

        .terms-link {
          color: #888;
          text-decoration: underline;
          font-weight: 500;
          cursor: pointer;
        }

        .terms-link:hover {
          color: #2d6a4f;
        }

        .copyright-text {
          text-align: center;
          font-size: 11px;
          color: #bbb;
          margin-top: auto;
          padding-top: 20px;
        }

        @media (max-width: 900px) {
          .page-root { flex-direction: column; padding: 12px; height: var(--screen-height, 100vh); }
          .illust-panel { display: none; }
          .form-panel { width: 100%; height: var(--screen-height, 100vh); border-radius: 20px; min-height: auto; margin-right: 0; }
        }

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

        .page-root-centered {
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
      `}</style>
        </div>
    );
}
