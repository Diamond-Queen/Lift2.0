import { useState } from "react";
import { useRouter } from "next/router";
import { useSession } from 'next-auth/react';
import styles from "../styles/SignUp.module.css";

export default function Subscription() {
  const { status } = useSession();
  const router = useRouter();
  const { plan } = router.query; // 'career' or 'full'
  const [formData, setFormData] = useState({
    cardNumber: '',
    expiry: '',
    cvc: '',
    name: '',
    email: '',
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const planDetails = {
    career: { name: 'Career Only', price: 7, features: ['Lift Career', 'Resume builder', 'Cover letter generator'] },
    full: { name: 'Full Access', price: 10, features: ['Lift Career', 'Lift Notes', 'AI study notes', 'Resume & cover letters'] }
  };

  const currentPlan = planDetails[plan] || planDetails.full;

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    
    if (!formData.name || !formData.email) {
      return setError("Name and email are required.");
    }

    // IMPORTANT: Card validation disabled - Stripe integration required
    // In production with Stripe:
    // 1. Use Stripe Elements to collect card details securely
    // 2. Tokenize card on client side
    // 3. Send only the token to your server
    // 4. Never send raw card data to your server

    setLoading(true);

    try {
      // Currently only sends name, email, and plan - no payment processing
      const res = await fetch('/api/subscription/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: formData.name, 
          email: formData.email,
          plan: plan || 'full',
          priceMonthly: currentPlan.price
        }),
      });
      
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'Failed to create subscription.');
        setLoading(false);
        return;
      }

      // Success - show Done button to go to dashboard
      setLoading(false);
      setError('');
      setFormData({ ...formData });
      alert('Free trial started! You can finish setup and go to your dashboard.');
      // Optional: auto-redirect after short delay
      // setTimeout(() => router.push('/dashboard'), 500);
    } catch (err) {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className={styles.signupContainer}>
        <div className={styles.signupCard}>
          <h1 className={styles.pageTitle}>Subscription</h1>
          <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    router.push('/signup');
    return null;
  }

  // Subscriptions are temporarily disabled — show Coming Soon
  return (
    <div className={styles.signupContainer}>
      <div className={styles.signupCard} style={{ maxWidth: '560px', textAlign: 'center' }}>
        <h1 className={styles.pageTitle}>Subscriptions — Coming Soon</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
          We're working on subscriptions and payment integration. For now, subscriptions are temporarily unavailable. Check back soon.
        </p>

        <div style={{ margin: '1.25rem 0', padding: '1rem', borderRadius: '8px', background: 'rgba(var(--accent-rgb), 0.06)', border: '1px solid var(--card-border)' }}>
          <strong>Coming Soon:</strong> Secure payments with Stripe and subscription management.
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1rem' }}>
          <button
            onClick={() => router.push('/dashboard')}
            className={styles.submitButton}
            style={{ padding: '0.6rem 1rem' }}
          >
            Back to Dashboard
          </button>
          <button
            onClick={() => router.push('/onboarding')}
            className={styles.loginLink}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}
          >
            Explore Options
          </button>
        </div>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Questions? Contact <a href="/privacy" style={{ color: 'inherit', textDecoration: 'underline' }}>support</a>.
        </p>
      </div>
    </div>
  );
}
