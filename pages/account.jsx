import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "../styles/Notes.module.css";

export default function Account() {
  const [user, setUser] = useState(null);
  const [schoolCode, setSchoolCode] = useState("");
  const [message, setMessage] = useState("");
  const [theme, setTheme] = useState("dark");
  const [studyMode, setStudyMode] = useState(true);

  useEffect(() => {
    const u = localStorage.getItem("lift_user");
    if (u) setUser(JSON.parse(u));

    const t = localStorage.getItem("theme");
    const s = localStorage.getItem("studyMode");
    if (t) setTheme(t);
    if (s) setStudyMode(s === "true");
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("lift_user");
    setUser(null);
  };

  const handleRedeem = async () => {
    if (!schoolCode.trim()) return setMessage("Enter a code.");
    setMessage("");
    try {
      const res = await fetch("/api/school/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: schoolCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) return setMessage(data.error || "Invalid code.");

      // attach school to user locally for prototype
      const updated = { ...(user || {}), school: data.school };
      localStorage.setItem("lift_user", JSON.stringify(updated));
      setUser(updated);
      setMessage(`Success: ${data.school.name} added to your account.`);
    } catch (err) {
      setMessage("Network error.");
    }
  };

  const savePreferences = () => {
    localStorage.setItem("theme", theme);
    localStorage.setItem("studyMode", studyMode ? "true" : "false");
    setMessage("Preferences saved.");
    setTimeout(() => setMessage(""), 1500);
  };

  if (!user) {
    return (
      <div className={styles.container}>
        <h1 className={styles.pageTitle}>Account</h1>
        <p>You are not signed in.</p>
        <Link href="/signup" className={styles.generateButton}>Create account</Link>
        <Link href="/login" className={styles.secondaryButton} style={{ marginLeft: 8 }}>Sign in</Link>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>Account</h1>

      <div style={{ marginBottom: 12 }}>
        <strong>{user.name || user.email}</strong>
        <div style={{ color: "#666" }}>{user.email}</div>
        {user.school && <div style={{ marginTop: 8 }}>School: <strong>{user.school.name}</strong></div>}
      </div>

      <div style={{ marginBottom: 12 }}>
        <h3 style={{ marginBottom: 8 }}>Preferences</h3>
        <label style={{ display: "block", marginBottom: 8 }}>
          Theme
          <select value={theme} onChange={(e) => setTheme(e.target.value)}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
        <label style={{ display: "block", marginBottom: 8 }}>
          <input type="checkbox" checked={studyMode} onChange={(e) => setStudyMode(e.target.checked)} /> Study Mode
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={styles.generateButton} onClick={savePreferences}>Save</button>
          <button className={styles.secondaryButton} onClick={handleLogout}>Sign out</button>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 8 }}>Redeem school code</h3>
        <input value={schoolCode} onChange={(e) => setSchoolCode(e.target.value)} placeholder="Enter school code" />
        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
          <button className={styles.generateButton} onClick={handleRedeem}>Redeem</button>
        </div>
        {message && <div style={{ marginTop: 8 }} className={styles.error}>{message}</div>}
      </div>
    </div>
  );
}
