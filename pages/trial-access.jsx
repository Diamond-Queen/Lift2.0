import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import styles from '../styles/SignUp.module.css';

/**
 * Trial Access Gate - Checks if user has active trial or subscription
 * Redirects unauthenticated users to login
 * Shows trial-expired users a message to upgrade
 */
export default function TrialAccessGate() {
  const { status } = useSession();
  const router = useRouter();
  const [accessStatus, setAccessStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'loading') return;

    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }

    // Fetch trial/subscription status
    if (status === 'authenticated') {
      (async () => {
        try {
          // Check user data first (covers all access types: school, beta, subscription)
          const userRes = await fetch('/api/user');
          if (userRes.ok) {
            const userData = await userRes.json();
            const user = userData?.data?.user;
            
            // Check if user has school access
            if (user?.schoolId) {
              router.push('/dashboard');
              return;
            }
            
            // Check for active subscription
            if (user?.preferences?.subscriptionPlan) {
              router.push('/dashboard');
              return;
            }
          }
          
          // Check beta status
          const betaRes = await fetch('/api/beta/status');
          if (betaRes.ok) {
            const data = await betaRes.json();
            const trial = data?.data?.trial;

            if (trial?.status === 'trial-active') {
              // User has active beta trial - allow access
              router.push('/dashboard');
              return;
            } else if (trial?.status === 'trial-expired') {
              // Trial expired - require upgrade
              setAccessStatus('trial-expired');
              setLoading(false);
              return;
            } else if (trial?.status === 'converted') {
              // User converted to paid subscription - allow access
              router.push('/dashboard');
              return;
            }
          }
          
          // No access - show enrollment option
          setAccessStatus('not-enrolled');
          setLoading(false);
        } catch (err) {
          console.error('Error checking access:', err);
          setAccessStatus('error');
          setLoading(false);
        }
      })();
    }
  }, [status, router]);

  if (loading) {
    return (
      <div className={styles.signupContainer}>
        <div className={styles.signupCard}>
          <h1 className={styles.pageTitle}>Loading...</h1>
          <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
            Checking your access status...
          </p>
        </div>
      </div>
    );
  }

  if (accessStatus === 'not-enrolled') {
    return (
      <div className={styles.signupContainer}>
        <div className={styles.signupCard} style={{ maxWidth: '500px' }}>
          <h1 className={styles.pageTitle}>Welcome to Lift</h1>
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '20px' }}>
            Choose how you'd like to get started
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <Link href="/onboarding/school" className={styles.submitButton} style={{ textDecoration: 'none', display: 'block', textAlign: 'center' }}>
              School Code
              <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', opacity: 0.9 }}>Get full access to Lift</div>
            </Link>

            <Link href="/onboarding/beta" className={styles.submitButton} style={{ 
              textDecoration: 'none', 
              display: 'block', 
              textAlign: 'center',
              background: 'rgba(212, 175, 55, 0.08)',
              border: '1px solid rgba(212, 175, 55, 0.25)',
              color: 'inherit'
            }}>
              Beta Program
              <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', opacity: 0.9 }}>Free trial: 3-4 days (individual) or 14 days (school)</div>
            </Link>

            <Link href="/subscription/plans" className={styles.submitButton} style={{ 
              textDecoration: 'none', 
              display: 'block', 
              textAlign: 'center',
              background: 'linear-gradient(90deg, rgba(212, 175, 55, 0.95) 0%, rgba(212, 175, 55, 0.85) 100%)',
              color: '#0a0605'
            }}>
              Individual Subscription
              <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', opacity: 0.9 }}>3-day free trial • Flexible plans</div>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (accessStatus === 'trial-expired') {
    return (
      <div className={styles.signupContainer}>
        <div className={styles.signupCard} style={{ maxWidth: '500px' }}>
          <h1 className={styles.pageTitle}>Trial Period Ended</h1>
          <p style={{ 
            textAlign: 'center', 
            color: '#D4AF37', 
            marginBottom: '20px',
            padding: '15px',
            borderRadius: '8px',
            border: '1px solid rgba(212, 175, 55, 0.4)',
            backgroundColor: 'rgba(212, 175, 55, 0.08)'
          }}>
            ⏰ Your beta trial has ended. Subscribe to continue using Lift.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <Link href="/subscription/plans" className={styles.submitButton} style={{ textDecoration: 'none', display: 'block', textAlign: 'center' }}>
              View Subscription Plans
            </Link>

            <p style={{ textAlign: 'center', fontSize: '0.9em', color: 'var(--text-muted)' }}>
              We hope you enjoyed testing Lift! Subscribe to your preferred plan to keep using it.
            </p>

            <div style={{ textAlign: 'center', fontSize: '0.85em', color: 'var(--text-muted)' }}>
              <p style={{ margin: '10px 0' }}>💰 <strong>Career Only:</strong> $9/month</p>
              <p style={{ margin: '10px 0' }}>🎓 <strong>Full Access:</strong> $10/month</p>
            </div>
          </div>

          <Link href="/account" style={{ 
            textAlign: 'center', 
            display: 'block', 
            marginTop: '20px',
            color: 'var(--primary-color)',
            textDecoration: 'underline',
            fontSize: '0.9em'
          }}>
            Go to Account Settings
          </Link>
        </div>
      </div>
    );
  }

  if (accessStatus === 'error') {
    return (
      <div className={styles.signupContainer}>
        <div className={styles.signupCard}>
          <h1 className={styles.pageTitle}>Error</h1>
          <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
            Something went wrong. Please try again or contact support.
          </p>
          <button 
            className={styles.submitButton}
            onClick={() => router.reload()}
            style={{ marginTop: '15px' }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return null;
}
