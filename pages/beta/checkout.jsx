import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

export default function BetaCheckoutPage() {
  const router = useRouter();
  const { trialType } = router.query;
  const { status } = useSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const CHECKOUT_TIMEOUT = 30000; // 30 seconds

  // Redirect if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push(`/login?redirect=/beta/checkout?trialType=${trialType}`);
    }
  }, [status, trialType, router]);

  // Fetch checkout URL and redirect
  useEffect(() => {
    // Don't proceed until trialType is available from router query
    if (!trialType || status !== 'authenticated') {
      if (status === 'authenticated' && !trialType) {
        // Router is ready but trialType is missing
        setError('Invalid trial type');
        setLoading(false);
      }
      return;
    }

    const startCheckout = async () => {
      try {
        setLoading(true);
        setError(null);

        if (!['school', 'social'].includes(trialType)) {
          setError('Invalid trial type');
          setLoading(false);
          return;
        }

        // Create timeout promise
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Checkout request timed out')), CHECKOUT_TIMEOUT)
        );

        const fetchPromise = fetch('/api/beta/payment-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trialType })
        }).then(res => res.json());

        const data = await Promise.race([fetchPromise, timeoutPromise]);

        if (data?.ok && data.data?.redirectUrl) {
          // Redirect to Stripe checkout
          window.location.href = data.data.redirectUrl;
          return;
        } else {
          setError(data?.error || 'Failed to start checkout');
        }
      } catch (err) {
        console.error('Error starting checkout:', err);
        setError(err.message || 'Failed to start checkout');
      } finally {
        setLoading(false);
      }
    };

    startCheckout();
  }, [trialType, status]);

  if (!trialType) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#000', padding: '2rem' }}>
        <div style={{ maxWidth: '500px', margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ color: '#ff6b6b', marginBottom: '1rem' }}>Error</h2>
          <p style={{ color: '#aaa', marginBottom: '2rem' }}>Invalid trial type</p>
          <Link href="/beta-signup" style={{ color: '#8b7500', textDecoration: 'underline', fontWeight: '600' }}>
            Back to Beta Signup
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#000' }}>
      <div style={{ padding: '1.5rem 0', borderBottom: '2px solid #8b7500', background: '#000' }}>
        <div style={{ maxWidth: '500px', margin: '0 auto', padding: '0 0.75rem', width: '100%' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#fff', margin: 0, marginBottom: '0.5rem' }}>Complete Beta Registration</h1>
          <p style={{ color: '#aaa', fontSize: '0.9rem', margin: 0 }}>One-time $3 payment. Unlock {trialType === 'school' ? 14 : 7} days of free premium features.</p>
        </div>
      </div>

      <div style={{ flex: 1, padding: '2rem 0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {loading && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#fff', marginBottom: '1rem' }}>Redirecting to checkout...</p>
            <div style={{ color: '#8b7500' }}>One moment...</div>
          </div>
        )}
        {error && (
          <div style={{ maxWidth: '500px', textAlign: 'center' }}>
            <h2 style={{ color: '#ff6b6b', marginBottom: '1rem' }}>Error</h2>
            <p style={{ color: '#aaa', marginBottom: '2rem' }}>{error}</p>
            <Link href="/beta-signup" style={{ color: '#8b7500', textDecoration: 'underline', fontWeight: '600' }}>
              Back to Beta Signup
            </Link>
          </div>
        )}
      </div>

      <div style={{ padding: '1.5rem 0.75rem', borderTop: '2px solid #8b7500', background: '#000' }}>
        <div style={{ maxWidth: '500px', margin: '0 auto', width: '100%' }}>
          <p style={{ color: '#aaa', fontSize: '0.85rem', textAlign: 'center', margin: 0 }}>
            Your payment is secured by Stripe. Your information is encrypted and secure.
          </p>
        </div>
      </div>
    </div>
  );
}
