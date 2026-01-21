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

  const plans = [
    { id: 'beta', name: 'Beta Program', price: 300, features: ['Access to beta features', 'Community support', '3-day free trial'] },
    { id: 'notes', name: 'Notes Only', price: 700, features: ['Unlimited notes', 'PDF export', 'Cloud sync'] },
    { id: 'career', name: 'Career Only', price: 700, features: ['Career tools', 'Resume builder', 'Interview prep'] },
    { id: 'full', name: 'Full Access', price: 1000, features: ['All features', 'Notes + Career', 'Priority support'] }
  ];

  const handleCheckout = async (planId) => {
    setLoading(true);
    setSelectedPlan(planId);
    setError('');
    try {
      const response = await fetch('/api/subscription/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId })
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Checkout failed');
        setLoading(false);
        setSelectedPlan(null);
        return;
      }
      if (data.data.method === 'cashapp') {
        window.location.href = data.data.url;
      } else if (data.data.url) {
        window.location.href = data.data.url;
      } else if (data.data.sessionId) {
        router.push(data.data.url);
      }
    } catch (err) {
      setError(err.message || 'An error occurred');
      setLoading(false);
      setSelectedPlan(null);
    }
  };

  return (
    <div className={styles.signupContainer}>
      <div className={styles.signupCard} style={{ maxWidth: '900px' }}>
        <h1 className={styles.pageTitle}>Choose Your Plan</h1>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '2rem' }}>All plans include a 3-day free trial.</p>
        {error && <div style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: '4px', background: 'rgba(239,68,68,0.1)', color: 'rgb(239,68,68)' }}>{error}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
          {plans.map((p) => (
            <div key={p.id} style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>{p.name}</h3>
                <p style={{ fontSize: '1.75rem', fontWeight: 'bold', color: 'var(--accent)', marginBottom: '1rem' }}>${(p.price / 100).toFixed(2)}<span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>/mo</span></p>
                <ul style={{ margin: '1rem 0', paddingLeft: '1.25rem', listStyle: 'disc' }}>
                  {p.features.map((f, i) => <li key={i} style={{ marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{f}</li>)}
                </ul>
              </div>
              <button onClick={() => handleCheckout(p.id)} disabled={loading && selectedPlan === p.id} className={styles.submitButton} style={{ width: '100%', marginTop: '1rem' }}>
                {loading && selectedPlan === p.id ? 'Processing...' : 'Subscribe Now'}
              </button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button onClick={() => router.push('/dashboard')} className={styles.submitButton} style={{ padding: '0.6rem 1rem' }}>Back to Dashboard</button>
        </div>
      </div>
    </div>
  );
}
