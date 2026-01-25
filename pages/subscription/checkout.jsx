import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { loadStripe } from '@stripe/stripe-js';
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout
} from '@stripe/react-stripe-js';
import Link from 'next/link';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

export default function CheckoutPage() {
  const router = useRouter();
  const { plan } = router.query;
  const { status } = useSession();
  const [clientSecret, setClientSecret] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?redirect=/subscription/checkout');
    }
  }, [status, router]);

  // Fetch payment intent
  useEffect(() => {
    if (!plan) return;

    const fetchPaymentIntent = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/subscription/payment-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan })
        });

        const data = await res.json();
        console.log('Payment intent response:', data);
        if (res.ok) {
          const secret = data.data?.clientSecret || data.clientSecret;
          console.log('Client secret:', secret);
          setClientSecret(secret);
        } else {
          setError(data.error || 'Failed to initialize checkout');
        }
      } catch (err) {
        console.error('Error fetching payment intent:', err);
        setError('Failed to initialize checkout');
      } finally {
        setLoading(false);
      }
    };

    fetchPaymentIntent();
  }, [plan]);

  const checkoutOptions = useMemo(() => ({
    clientSecret,
    onComplete: async () => {
      setTimeout(() => {
        router.push('/dashboard');
      }, 1500);
    }
  }), [clientSecret, router]);

  if (status === 'loading' || loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#000', color: '#fff' }}>
        <p>Initializing checkout...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#000', color: '#fff', padding: '2rem', textAlign: 'center' }}>
        <h2 style={{ color: '#ff6b6b', marginBottom: '1rem' }}>Error</h2>
        <p style={{ color: '#aaa', marginBottom: '2rem' }}>{error}</p>
        <Link href="/subscription/plans" style={{ color: '#8b7500', textDecoration: 'underline', fontWeight: '600' }}>
          Back to Plans
        </Link>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#000' }}>
      {/* Header */}
      <div style={{ padding: '1.5rem 0', borderBottom: '2px solid #8b7500', background: '#000' }}>
        <div style={{ maxWidth: '500px', margin: '0 auto', padding: '0 0.75rem', width: '100%' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#fff', margin: 0, marginBottom: '0.5rem' }}>Complete Your Subscription</h1>
          <p style={{ color: '#aaa', fontSize: '0.9rem', margin: 0 }}>You'll get 3 days free. Cancel anytime.</p>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '2rem 0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: '500px' }}>
          {clientSecret && (
            <EmbeddedCheckoutProvider 
              stripe={stripePromise} 
              options={checkoutOptions}
            >
              <div style={{
                background: '#1a1a1a',
                borderRadius: '8px',
                border: '2px solid #8b7500',
                padding: '2rem',
                width: '100%',
                boxSizing: 'border-box'
              }}>
                <EmbeddedCheckout />
              </div>
            </EmbeddedCheckoutProvider>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '1.5rem 0.75rem', borderTop: '2px solid #8b7500', background: '#000' }}>
        <div style={{ maxWidth: '500px', margin: '0 auto', width: '100%' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'center' }}>
            <Link 
              href="/subscription/plans" 
              style={{ 
                color: '#8b7500', 
                textDecoration: 'none', 
                fontWeight: '600', 
                fontSize: '0.95rem'
              }}
            >
              ← Back to Plans
            </Link>
          </div>
          <p style={{ color: '#aaa', fontSize: '0.85rem', textAlign: 'center', marginTop: '1rem', margin: '1rem 0 0 0' }}>
            Your payment is secured by Stripe. Your information is encrypted and secure.
          </p>
        </div>
      </div>
    </div>
  );
}
