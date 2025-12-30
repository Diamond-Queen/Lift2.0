import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import styles from "../styles/SignUp.module.css"; // use dedicated signup styles
import { signIn } from 'next-auth/react';

export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const passwordMeetsPolicy = (pwd) => {
    return typeof pwd === 'string' && pwd.length >= 10 && /[0-9]/.test(pwd) && /[!@#$%^&*(),.?":{}|<>]/.test(pwd);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return; // prevent double submit
    setError("");
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim();
    if (!trimmedEmail || !password) return setError("Email and password are required.");
    if (!passwordMeetsPolicy(password)) return setError("Password must be ≥10 chars and include a number & symbol.");

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, email: trimmedEmail, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Registration failed.");
        setLoading(false);
        return;
      }
      
      // Sign in the newly registered user
      const signin = await signIn('credentials', { 
        redirect: false, 
        email: trimmedEmail, 
        password 
      });
      if (signin?.error) {
        setError(signin.error || 'Sign-in after registration failed');
        setLoading(false);
        return;
      }
      
      // Give session time to stabilize before redirecting
      // This ensures the session cookie is properly set
      await new Promise(r => setTimeout(r, 500));
      
      // Redirect to beta signup (user is now authenticated)
      router.push('/beta-signup');
    } catch (err) {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className={styles.signupContainer}>
      <div className={styles.signupCard}>
        <h1 className={styles.pageTitle}>Create an account</h1>
        <form onSubmit={handleSubmit} aria-describedby={error ? 'signup-error' : undefined} noValidate>
          <div className={styles.formGroup}>
            <label htmlFor="signup-name">Name</label>
            <input id="signup-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="signup-email">Email</label>
            <input id="signup-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
            <div className={styles.formGroup}>
            <label htmlFor="signup-password">Password</label>
            <input id="signup-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            <small style={{ display:'block', marginTop:4, color:'var(--text-muted)' }}>Must be ≥10 chars, include a number & symbol.</small>
          </div>
          <button className={styles.submitButton} type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create account'}</button>
          <Link href="/login" className={styles.loginLink}>Already have an account</Link>
          {error && (
            <div id="signup-error" className={styles.errorMessage} role="alert" aria-live="assertive">{error}</div>
          )}
        </form>
      </div>
    </div>
  );
}
