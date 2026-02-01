import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import styles from "../styles/SignUp.module.css";
import { signIn } from 'next-auth/react';

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    if (!email || !password) return setError("Email and password are required.");
    setLoading(true);
    try {
      const res = await signIn('credentials', { redirect: false, email, password });
      if (res?.error) {
        setError(res.error || 'Login failed');
        setLoading(false);
        return;
      }
      // Check if user is onboarded
      const userRes = await fetch('/api/user');
      if (userRes.ok) {
        const data = await userRes.json();
        const user = data?.data?.user;
        if (user && !user.onboarded) {
          router.push('/onboarding');
          return;
        }
      }
      router.push('/dashboard');
    } catch (err) {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className={styles.signupContainer}>
      <div className={styles.signupCard}>
        <h1 className={styles.pageTitle}>Sign in</h1>
        <form onSubmit={handleSubmit} aria-describedby={error ? 'login-error' : undefined} noValidate>
          <div className={styles.formGroup}>
            <label htmlFor="login-email">Email</label>
            <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="login-password">Password</label>
            <input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          <button className={styles.submitButton} type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
          <Link href="/signup" className={styles.loginLink}>Don't have an account? Sign up</Link>
          {error && (
            <div id="login-error" className={styles.errorMessage} role="alert" aria-live="assertive">{error}</div>
          )}
          <Link href="/forgot-password" className={styles.loginLink}>Forgot your password?</Link>
        </form>
      </div>
    </div>
  );
}
