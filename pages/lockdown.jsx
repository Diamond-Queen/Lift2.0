import Head from 'next/head';
import styles from '../styles/SignUp.module.css';

export default function Lockdown() {
  return (
    <div className={styles.container} style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '2rem' }}>
      <Head>
        <title>Service Temporarily Locked Down</title>
        <meta name="robots" content="noindex" />
      </Head>
      <h1 style={{ fontSize: '2.25rem', marginBottom: '1rem' }}>Service Temporarily Locked Down</h1>
      <p style={{ maxWidth: '640px', marginBottom: '1.5rem', lineHeight: 1.6 }}>
        We detected unusual activity and temporarily locked down access. Please try again later. If you
        believe this is in error, contact support with the time you attempted to access the app.
      </p>
      <div style={{ opacity: 0.7 }}>Error code: LOCKDOWN_ACTIVE</div>
    </div>
  );
}
