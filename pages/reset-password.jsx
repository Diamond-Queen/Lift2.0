import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import styles from '../styles/reset-password.module.css';

export default function ResetPassword() {
  const router = useRouter();
  const { token: queryToken, email: queryEmail } = router.query || {};
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (queryToken) setToken(queryToken);
    if (queryEmail) setEmail(queryEmail);
  }, [queryToken, queryEmail]);

  async function submit(e) {
    e.preventDefault();
    setStatus(null);
    if (password !== confirm) return setStatus({ ok: false, message: 'Passwords do not match' });
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, token, password }) });
      const j = await res.json();
      if (j.ok) {
        setStatus({ ok: true, message: 'Password updated. Redirecting to login...' });
        setTimeout(() => router.push('/login'), 1500);
      } else setStatus({ ok: false, message: j.error || 'Error' });
    } catch (err) {
      setStatus({ ok: false, message: err.message });
    } finally { setLoading(false); }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Reset password</h1>
        <form onSubmit={submit}>
          <label className={styles.label}>Email</label>
          <input className={styles.input} type="email" value={email} onChange={e => setEmail(e.target.value)} required />

          <label className={styles.label}>New password</label>
          <input className={styles.input} type="password" value={password} onChange={e => setPassword(e.target.value)} required />

          <label className={styles.label}>Confirm password</label>
          <input className={styles.input} type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required />

          <div className={styles.actions}>
            <button className={`btn btn-primary ${styles.fullWidthBtn}`} type="submit" disabled={loading}>{loading ? 'Updating...' : 'Update password'}</button>
          </div>
        </form>
        {status && (
          <div className={styles.status} style={{ color: status.ok ? 'var(--accent)' : 'crimson' }}>{status.message}</div>
        )}
      </div>
    </div>
  );
}
