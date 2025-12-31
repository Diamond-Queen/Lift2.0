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
  const devMode = String(process.env.NEXT_PUBLIC_STRIPE_DEV_MODE || "").toLowerCase() === 'true';

  const handleSelectPlan = async (plan) => {
    setSelectedPlan(plan);
    setError("");
    setLoading(true);

    try {
      const res = await fetch('/api/subscription/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });

      const data = await res.json();
      
      if (!res.ok || !data.ok) {
        setError(data.error || 'Failed to create checkout session');
        setLoading(false);
        return;
      }

      // Redirect to Stripe Checkout
      if (data.data?.url) {
        window.location.href = data.data.url;
      }
    } catch (err) {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className={styles.signupContainer}>
      <div className={styles.signupCard} style={{ maxWidth: '700px' }}>
        <h1 className={styles.pageTitle}>Choose Your Plan</h1>
        <p style={{ textAlign: 'center', marginBottom: '2rem', color: 'var(--text-muted)' }}>
          Start with a 3-day free trial. Cancel anytime.
        </p>

        {devMode && (
          <div role="note" style={{
            margin: '0 0 1rem 0',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            background: 'rgba(234,179,8,0.12)',
            border: '1px solid rgba(234,179,8,0.35)',
            color: 'var(--text-color)'
          }}>
            Simulated checkout is enabled (dev mode). No real payment is processed.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
          {/* Career Only Plan */}
          <div 
            onClick={() => handleSelectPlan('career')}
            style={{ 
              border: '2px solid var(--card-border)', 
              borderRadius: '12px', 
              padding: '1.5rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: selectedPlan === 'career' ? 'rgba(var(--accent-rgb), 0.1)' : 'transparent'
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--card-border)'}
          >
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent)', marginBottom: '0.5rem' }}>
              $5<span style={{ fontSize: '1rem', fontWeight: 400 }}>/month</span>
            </div>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.2rem' }}>Career Only</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem' }}>
              <li style={{ marginBottom: '0.5rem' }}>✓ Lift Career</li>
              <li style={{ marginBottom: '0.5rem' }}>✓ Resume builder</li>
              <li style={{ marginBottom: '0.5rem' }}>✓ Cover letter generator</li>
              <li style={{ marginBottom: '0.5rem' }}>✓ 3-day free trial</li>
            </ul>
            <button 
              className={styles.submitButton} 
              style={{ marginTop: '1rem', width: '100%', padding: '0.75rem' }}
              onClick={() => handleSelectPlan('career')}
            >
              Select Career
            </button>
          </div>

          {/* Notes Only Plan */}
          <div 
            onClick={() => handleSelectPlan('notes')}
            style={{ 
              border: '2px solid var(--card-border)', 
              borderRadius: '12px', 
              padding: '1.5rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: selectedPlan === 'notes' ? 'rgba(var(--accent-rgb), 0.1)' : 'transparent'
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--card-border)'}
          >
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent)', marginBottom: '0.5rem' }}>
              $5<span style={{ fontSize: '1rem', fontWeight: 400 }}>/month</span>
            </div>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.2rem' }}>Notes Only</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem' }}>
              <li style={{ marginBottom: '0.5rem' }}>✓ Lift Notes</li>
              <li style={{ marginBottom: '0.5rem' }}>✓ AI study summaries</li>
              <li style={{ marginBottom: '0.5rem' }}>✓ Flashcard generator</li>
              <li style={{ marginBottom: '0.5rem' }}>✓ 3-day free trial</li>
            </ul>
            <button 
              className={styles.submitButton} 
              style={{ marginTop: '1rem', width: '100%', padding: '0.75rem' }}
              onClick={() => handleSelectPlan('notes')}
            >
              Select Notes
            </button>
          </div>

          {/* Full Access Plan */}
          <div 
            onClick={() => handleSelectPlan('full')}
            style={{ 
              border: '2px solid var(--accent)', 
              borderRadius: '12px', 
              padding: '1.5rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: 'rgba(var(--accent-rgb), 0.08)',
              position: 'relative'
            }}
          >
            <div style={{ position: 'absolute', top: '-12px', right: '12px', background: 'var(--accent)', color: 'var(--accent-contrast)', padding: '0.25rem 0.75rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700 }}>
              BEST VALUE
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent)', marginBottom: '0.5rem' }}>
              $10<span style={{ fontSize: '1rem', fontWeight: 400 }}>/month</span>
            </div>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.2rem' }}>Full Access</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem' }}>
              <li style={{ marginBottom: '0.5rem' }}>✓ Lift Career</li>
              <li style={{ marginBottom: '0.5rem' }}>✓ <strong>Lift Notes</strong></li>
              <li style={{ marginBottom: '0.5rem' }}>✓ AI study note generation</li>
              <li style={{ marginBottom: '0.5rem' }}>✓ Resume & cover letters</li>
              <li style={{ marginBottom: '0.5rem' }}>✓ 3-day free trial</li>
            </ul>
            <button 
              className={styles.submitButton} 
              style={{ marginTop: '1rem', width: '100%', padding: '0.75rem' }}
              onClick={() => handleSelectPlan('full')}
            >
              Select Full Access
            </button>
          </div>
        </div>

        {error && (
          <div className={styles.errorMessage} role="alert" style={{ marginBottom: '1rem', textAlign: 'center' }}>
            {error}
          </div>
        )}

        {loading && (
          <div style={{ textAlign: 'center', marginBottom: '1rem', color: 'var(--accent)' }}>
            Redirecting to checkout...
          </div>
        )}

        <button
          onClick={() => router.push('/onboarding')}
          className={styles.loginLink}
          disabled={loading}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', width: '100%', textAlign: 'center' }}
        >
          Back to options
        </button>

        <div style={{ marginTop: '2rem' }}>
          <h3 style={{ textAlign: 'center', marginBottom: '0.75rem' }}>Why Lift?</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: 'var(--text-muted)' }}>
              <li>• Study faster with AI summaries</li>
              <li>• Better grades through organized notes</li>
              <li>• Interview-ready resumes and letters</li>
              <li>• Unlimited notes and classes</li>
            </ul>
            <div style={{ alignSelf: 'center' }}>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                <span style={{ padding: '0.35rem 0.6rem', border: '1px solid var(--card-border)', borderRadius: '999px' }}>Privacy-first</span>
                <span style={{ padding: '0.35rem 0.6rem', border: '1px solid var(--card-border)', borderRadius: '999px' }}>No data resale</span>
                <span style={{ padding: '0.35rem 0.6rem', border: '1px solid var(--card-border)', borderRadius: '999px' }}>Cancel anytime</span>
              </div>
            </div>
          </div>
        </div>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          By subscribing, you agree to our <a href="/terms" style={{ color: 'inherit', textDecoration: 'underline' }}>Terms of Service</a> and <a href="/privacy" style={{ color: 'inherit', textDecoration: 'underline' }}>Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}
