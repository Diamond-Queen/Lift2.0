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
    career: { name: 'Career Only', price: 9, features: ['Lift Career', 'Resume builder', 'Cover letter generator'] },
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

  return (
    <div className={styles.signupContainer}>
      <div className={styles.signupCard} style={{ maxWidth: '500px' }}>
        <h1 className={styles.pageTitle}>{currentPlan.name} - Start Your Free Trial</h1>
        
        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(var(--accent-rgb), 0.08)', border: '1px solid var(--card-border)', borderRadius: '8px' }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--accent)', marginBottom: '0.5rem' }}>
            ${currentPlan.price}<span style={{ fontSize: '1rem', fontWeight: 400 }}>/month</span>
          </div>
          <p style={{ margin: '0.5rem 0', fontSize: '0.9rem' }}>3-day free trial, then ${currentPlan.price}/month</p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0.75rem 0 0 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            {currentPlan.features.map((feature, i) => (
              <li key={i} style={{ marginBottom: '0.25rem' }}>✓ {feature}</li>
            ))}
          </ul>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '1.5rem', padding: '0.75rem', background: 'rgba(139, 117, 0, 0.1)', border: '1px solid rgba(139, 117, 0, 0.3)', borderRadius: '8px' }}>
          <p style={{ margin: 0, color: 'var(--text-color)', fontSize: '0.9rem' }}>
            <strong>Payment Integration Coming Soon</strong><br/>
            Stripe will handle all payments securely. Cancel anytime before trial ends.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label htmlFor="sub-name">Cardholder Name</label>
            <input
              id="sub-name"
              name="name"
              type="text"
              value={formData.name}
              onChange={handleChange}
              placeholder="John Doe"
              autoComplete="name"
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="sub-email">Email</label>
            <input
              id="sub-email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          <div style={{ padding: '1rem', background: 'rgba(139, 117, 0, 0.1)', border: '1px solid rgba(139, 117, 0, 0.3)', borderRadius: '8px', marginBottom: '1rem' }}>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-color)' }}>
              <strong>⚠️ Development Mode:</strong> Payment card fields are disabled. Stripe integration required for production to securely process payments. Your card data will NEVER be stored on our servers.
            </p>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="sub-card">Card Number (Disabled - Stripe Required)</label>
            <input
              id="sub-card"
              name="cardNumber"
              type="text"
              value={formData.cardNumber}
              onChange={handleChange}
              placeholder="Payment processing not active"
              disabled
              style={{ opacity: 0.6, cursor: 'not-allowed' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className={styles.formGroup}>
              <label htmlFor="sub-expiry">Expiry (Disabled)</label>
              <input
                id="sub-expiry"
                name="expiry"
                type="text"
                value={formData.expiry}
                onChange={handleChange}
                placeholder="MM/YY"
                disabled
                style={{ opacity: 0.6, cursor: 'not-allowed' }}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="sub-cvc">CVC (Disabled)</label>
              <input
                id="sub-cvc"
                name="cvc"
                type="text"
                value={formData.cvc}
                onChange={handleChange}
                placeholder="123"
                disabled
                style={{ opacity: 0.6, cursor: 'not-allowed' }}
              />
            </div>
          </div>

          <button className={styles.submitButton} type="submit" disabled={loading}>
            {loading ? 'Processing...' : 'Start Free Trial'}
          </button>

          {error && (
            <div className={styles.errorMessage} role="alert" style={{ marginTop: '1rem' }}>
              {error}
            </div>
          )}
        </form>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
          <button
            onClick={() => router.push('/subscription/plans')}
            className={styles.loginLink}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}
          >
            Change plan
          </button>
          <button
            onClick={() => router.push('/dashboard')}
            className={styles.submitButton}
            style={{ padding: '0.5rem 0.9rem' }}
          >
            Done
          </button>
        </div>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          By starting your free trial, you agree to our <a href="/terms" style={{ color: 'inherit', textDecoration: 'underline' }}>Terms of Service</a> and <a href="/privacy" style={{ color: 'inherit', textDecoration: 'underline' }}>Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}
