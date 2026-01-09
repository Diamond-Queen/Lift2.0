import { useState } from "react";
import { useRouter } from "next/router";
import { useSession } from 'next-auth/react';
import Link from "next/link";
import styles from "../../styles/SignUp.module.css";

export default function SubscriptionPlans() {
  const { status } = useSession();
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const devMode = String(process.env.NEXT_PUBLIC_STRIPE_DEV_MODE || "").toLowerCase() === 'true';

  if (status === 'loading') {
    return (
      <div className={styles.signupContainer}>
        <div className={styles.signupCard}>
          <h1 className={styles.pageTitle}>Choose Your Plan</h1>
          <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    router.push('/signup');
    return null;
  }
  if (status === 'unauthenticated') {
    router.push('/signup');
    return null;
  }

  // Subscriptions temporarily disabled
  return (
    <div className={styles.signupContainer}>
      <div className={styles.signupCard} style={{ maxWidth: '700px', textAlign: 'center' }}>
        <h1 className={styles.pageTitle}>Plans — Coming Soon</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>We're preparing subscription support and payment integration. Plans will be available soon.</p>

        <div role="note" style={{ marginTop: '1rem', padding: '1rem', borderRadius: '8px', background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.18)' }}>
          Subscriptions are temporarily unavailable — Coming Soon.
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1.5rem' }}>
          <button onClick={() => router.push('/dashboard')} className={styles.submitButton} style={{ padding: '0.6rem 1rem' }}>Back to Dashboard</button>
          <button onClick={() => router.push('/onboarding')} className={styles.loginLink} style={{ background: 'none', border: 'none' }}>Explore Options</button>
        </div>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Want early access? Sign up for updates on our <a href="/beta-signup" style={{ color: 'inherit', textDecoration: 'underline' }}>beta page</a>.
        </p>
      </div>
    </div>
  );
}
