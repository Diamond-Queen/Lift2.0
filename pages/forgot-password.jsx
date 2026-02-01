import { useState } from 'react';
import styles from '../styles/forgot-password.module.css';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch('/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const j = await res.json();
      if (j.ok) setStatus({ ok: true, message: j.message || 'If an account exists, an email was sent' });
      else setStatus({ ok: false, message: j.error || 'Error' });
    } catch (err) {
      setStatus({ ok: false, message: err.message });
    } finally { setLoading(false); }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Forgot your password?</h1>
        <p className={styles.description}>Enter the email associated with your account and we'll send a reset link.</p>
        <form onSubmit={submit}>
          <label className={styles.label}>Email</label>
          <input className={styles.input} type="email" value={email} onChange={e => setEmail(e.target.value)} required />

          <div className={styles.actions}>
            <button className={`btn btn-primary ${styles.fullWidthBtn}`} type="submit" disabled={loading}>{loading ? 'Sending...' : 'Send reset email'}</button>
          </div>
        </form>
        {status && (
          <div className={styles.status} style={{ color: status.ok ? 'var(--accent)' : 'crimson' }}>{status.message}</div>
        )}
      </div>
    </div>
  );
}
