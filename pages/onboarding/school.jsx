import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useSession } from 'next-auth/react';
import { signIn } from 'next-auth/react';
import styles from "../../styles/SignUp.module.css";

export default function SchoolCodeOnboarding() {
  const { status, update } = useSession();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Prefill code from query string if present, but do not auto-submit
  useEffect(() => {
    const q = router.query?.code;
    if (q && typeof q === 'string' && !code) {
      setCode(q);
    }
  }, [router.query]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!code.trim()) return setError("Please enter a school code.");
    setError("");
    setLoading(true);
    console.log('[onboarding/school] Submitting code:', code);

    try {
      const res = await fetch('/api/school/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      console.log('[onboarding/school] Response:', { status: res.status, ok: data.ok, error: data.error });
      if (!res.ok || !data.ok) {
        console.error('[onboarding/school] Redeem failed:', data.error);
        setError(data.error || 'Invalid school code.');
        setLoading(false);
        return;
      }
      console.log('[onboarding/school] Redeem success! School:', data.data?.school?.name);
      // Refresh NextAuth session to get updated user data with schoolId
      console.log('[onboarding/school] Refreshing session...');
      await update();
      // Give a moment for session to update before redirecting
      await new Promise(r => setTimeout(r, 500));
      router.push('/dashboard');
    } catch (err) {
      console.error('[onboarding/school] Network error:', err.message);
      setError('Network error. Please try again.');
      setLoading(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className={styles.signupContainer}>
        <div className={styles.signupCard}>
          <h1 className={styles.pageTitle}>School Code</h1>
          <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    router.push('/signup');
    return null;
  }

  return (
    <div className={styles.signupContainer}>
      <div className={styles.signupCard}>
        <h1 className={styles.pageTitle}>Enter School Code</h1>
        <p style={{ textAlign: 'center', marginBottom: '1.5rem', color: 'var(--text-muted)' }}>
          Enter the code provided by your school to activate your account.
        </p>

        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label htmlFor="school-code">School Code</label>
            <input
              id="school-code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter your school code"
              autoComplete="off"
            />
          </div>

          <button className={styles.submitButton} type="submit" disabled={loading}>
            {loading ? 'Redeeming...' : 'Activate Account'}
          </button>

          {error && (
            <div className={styles.errorMessage} role="alert" style={{ marginTop: '1rem' }}>
              {error}
            </div>
          )}
        </form>

        <button
          onClick={() => router.push('/onboarding')}
          className={styles.loginLink}
          style={{ marginTop: '1rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}
        >
          Back to options
        </button>
      </div>
    </div>
  );
}
