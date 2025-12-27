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
          const res = await fetch('/api/beta/status');
          if (res.ok) {
            const data = await res.json();
            const trial = data?.data?.trial;

            if (!trial) {
              // User is not in beta program and has no subscription - show join beta option
              setAccessStatus('not-enrolled');
            } else if (trial.status === 'trial-active') {
              // User has active trial - allow access
              router.push('/dashboard');
            } else if (trial.status === 'trial-expired') {
              // Trial expired - require upgrade
              setAccessStatus('trial-expired');
            } else if (trial.status === 'converted') {
              // User converted to paid subscription
              router.push('/dashboard');
            } else {
              // Check for paid subscription
              const subRes = await fetch('/api/user');
              if (subRes.ok) {
                const userData = await subRes.json();
                if (userData?.data?.user?.preferences?.subscriptionPlan) {
                  router.push('/dashboard');
                } else {
                  setAccessStatus('not-enrolled');
                }
              }
            }
          }
        } catch (err) {
          console.error('Error checking access:', err);
          setAccessStatus('error');
        } finally {
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
            You're not yet enrolled in our beta program. Join now to get started!
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <Link href="/beta-signup" className={styles.submitButton} style={{ textDecoration: 'none', display: 'block', textAlign: 'center' }}>
              Join Beta Program
            </Link>

            <div style={{ textAlign: 'center', fontSize: '0.9em', color: 'var(--text-muted)' }}>
              or
            </div>

            <Link href="/subscription/plans" className={styles.submitButton} style={{ 
              textDecoration: 'none', 
              display: 'block', 
              textAlign: 'center',
              backgroundColor: 'rgba(var(--accent-rgb), 0.1)',
              color: 'var(--accent)',
              border: '1px solid var(--accent)'
            }}>
              Subscribe Now
            </Link>
          </div>

          <p style={{ textAlign: 'center', fontSize: '0.85em', color: 'var(--text-muted)', marginTop: '20px' }}>
            Beta access is free for 3-4 days (individuals) or 14 days (schools).
          </p>
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
            color: '#d97706', 
            marginBottom: '20px',
            padding: '15px',
            borderRadius: '8px',
            border: '1px solid #d97706',
            backgroundColor: 'rgba(217, 119, 6, 0.1)'
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
