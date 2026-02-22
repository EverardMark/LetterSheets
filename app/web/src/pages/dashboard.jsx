import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("ls_user") || "{}");
  const company = JSON.parse(localStorage.getItem("ls_company") || "{}");
  const hasKey = !!sessionStorage.getItem("ls_company_key");

  const handleLogout = () => {
    localStorage.removeItem("ls_session");
    localStorage.removeItem("ls_user");
    localStorage.removeItem("ls_company");
    sessionStorage.removeItem("ls_company_key");
    navigate("/");
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.statusDot}/>
        <h1 style={styles.title}>Dashboard</h1>
        <p style={styles.subtitle}>You're logged in successfully.</p>

        <div style={styles.details}>
          <div style={styles.row}><span style={styles.label}>User</span><span style={styles.value}>{user.username || "—"}</span></div>
          <div style={styles.row}><span style={styles.label}>Email</span><span style={styles.value}>{user.email || "—"}</span></div>
          <div style={styles.row}><span style={styles.label}>Company</span><span style={styles.value}>{company.name || "—"}</span></div>
          <div style={styles.row}><span style={styles.label}>Role</span><span style={styles.badge}>{company.role || "—"}</span></div>
          <div style={styles.row}>
            <span style={styles.label}>Encryption</span>
            <span style={{...styles.badge, background: hasKey ? "#e8f3ec" : "#fef2f2", color: hasKey ? "#2d6a4f" : "#dc2626"}}>
              {hasKey ? "Key unlocked" : "No key"}
            </span>
          </div>
        </div>

        <button style={styles.btn} onClick={handleLogout}>Sign out</button>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#dce9df",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'DM Sans', sans-serif",
    padding: 24,
  },
  card: {
    background: "#fff",
    borderRadius: 24,
    padding: "48px 40px",
    maxWidth: 420,
    width: "100%",
    textAlign: "center",
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: "#2d6a4f",
    margin: "0 auto 16px",
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: "#1a1a1a",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#999",
    marginBottom: 28,
  },
  details: {
    background: "#f8faf9",
    border: "1px solid #e8f0eb",
    borderRadius: 12,
    padding: "16px 20px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    textAlign: "left",
    marginBottom: 24,
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: { fontSize: 13, color: "#888", fontWeight: 500 },
  value: { fontSize: 14, fontWeight: 600, color: "#222" },
  badge: {
    background: "#e8f3ec",
    color: "#2d6a4f",
    padding: "3px 10px",
    borderRadius: 5,
    fontSize: 12,
    fontWeight: 600,
    textTransform: "capitalize",
  },
  btn: {
    width: "100%",
    padding: "13px 24px",
    background: "#2a2a2a",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 600,
    fontFamily: "'DM Sans', sans-serif",
    cursor: "pointer",
  },
};