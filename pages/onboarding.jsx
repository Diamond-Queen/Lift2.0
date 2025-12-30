import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useSession } from 'next-auth/react';
import Link from "next/link";
import styles from "../styles/SignUp.module.css";

export default function Onboarding() {
  const { status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already onboarded and redirect
    (async () => {
      if (status === 'authenticated') {
        try {
          const res = await fetch('/api/user');
          if (res.ok) {
            const data = await res.json();
            const user = data?.data?.user;
            if (user?.onboarded) {
              router.push('/account');
              return;
            }
          }
        } catch (e) {
          // ignore
        }
      }
      setLoading(false);
    })();
  }, [status, router]);

  if (status === 'loading' || loading) {
    return (
      <div className={styles.signupContainer}>
        <div className={styles.signupCard}>
          <h1 className={styles.pageTitle}>Welcome</h1>
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
        <h1 className={styles.pageTitle}>Welcome to Lift</h1>
        <p style={{ textAlign: 'center', marginBottom: '2rem', color: 'var(--text-muted)' }}>
          Choose how you'd like to get started
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Link href="/onboarding/school" className={styles.submitButton} style={{ display: 'block', textAlign: 'center', textDecoration: 'none', padding: '1.25rem' }}>
            School Code
            <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', opacity: 0.9 }}>Get full access to Lift Notes and Lift Career</div>
          </Link>

          <Link href="/onboarding/beta" className={styles.submitButton} style={{ display: 'block', textAlign: 'center', textDecoration: 'none', padding: '1.25rem', background: 'rgba(147, 51, 234, 0.08)', border: '1px solid rgba(147, 51, 234, 0.25)' }}>
            Beta Program
            <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', opacity: 0.9 }}>3-4 days free trial (individual) or 14 days (school)</div>
          </Link>

          <Link href="/subscription/plans" className={styles.submitButton} style={{ display: 'block', textAlign: 'center', textDecoration: 'none', padding: '1rem', background: 'linear-gradient(90deg, #000000 0%, #000000 100%)', color: '#1f003bff', border: '1px solid rgba(31, 0, 59, 0.5)' }}>
            Individual Subscription
            <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', opacity: 0.9 }}>3-day free trial • Flexible plans</div>
          </Link>
        </div>
      </div>
    </div>
  );
}
