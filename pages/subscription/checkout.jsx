import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

export default function CheckoutPage() {
  const router = useRouter();
  const { plan } = router.query;
  const { status } = useSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?redirect=/subscription/checkout');
    }
  }, [status, router]);

  // Fetch checkout URL and redirect
  useEffect(() => {
    if (!plan || status !== 'authenticated') return;

    const startCheckout = async () => {
      try {
        setLoading(true);
        
        if (!['career', 'notes', 'full'].includes(plan)) {
          setError(`Invalid plan: ${plan}`);
          return;
        }

        const res = await fetch('/api/subscription/payment-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan })
        });

        const data = await res.json();
        console.log('Checkout response:', data);
        
        if (res.ok && data.data?.redirectUrl) {
          // Redirect to Stripe checkout
          window.location.href = data.data.redirectUrl;
        } else {
          setError(data.error || 'Failed to start checkout');
        }
      } catch (err) {
        console.error('Error starting checkout:', err);
        setError('Failed to start checkout');
      } finally {
        setLoading(false);
      }
    };

    startCheckout();
  }, [plan, status]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#000' }}>
      <div style={{ padding: '1.5rem 0', borderBottom: '2px solid #8b7500', background: '#000' }}>
        <div style={{ maxWidth: '500px', margin: '0 auto', padding: '0 0.75rem', width: '100%' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#fff', margin: 0, marginBottom: '0.5rem' }}>Complete Your Subscription</h1>
          <p style={{ color: '#aaa', fontSize: '0.9rem', margin: 0 }}>You'll get 3 days free. Cancel anytime.</p>
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
            <Link href="/subscription/plans" style={{ color: '#8b7500', textDecoration: 'underline', fontWeight: '600' }}>
              Back to Plans
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
