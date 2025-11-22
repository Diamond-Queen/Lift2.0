import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import styles from "../styles/Notes.module.css";

export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!email || !password) return setError("Email and password are required.");

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();
      if (!res.ok) return setError(data.error || "Registration failed.");

      // Simple client-side storage for prototype
      localStorage.setItem("lift_user", JSON.stringify(data.user));
      router.push("/account");
    } catch (err) {
      setError("Network error. Please try again.");
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>Create an account</h1>
      <form onSubmit={handleSubmit} style={{ maxWidth: 640 }}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className={styles.generateButton} type="submit">Create account</button>
          <Link href="/login" className={styles.secondaryButton}>Already have an account</Link>
        </div>

        {error && <div className={styles.error}>{error}</div>}
      </form>
    </div>
  );
}
