import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import styles from '../../styles/SignUp.module.css';

/**
 * Demo Page - Shows product demo video after signup
 * User can watch the demo or skip directly to beta signup
 */
export default function DemoPage() {
  const { status } = useSession();
  const router = useRouter();
  const [videoWatched, setVideoWatched] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/signup');
    }
  }, [status, router]);

  const handleVideoEnded = async () => {
    setVideoWatched(true);
    
    // Mark demo as watched in database
    try {
      await fetch('/api/user/demo-watched', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err) {
      console.error('Error marking demo as watched:', err);
    }
  };

  const handleContinue = async () => {
    setLoading(true);
    router.push('/beta-signup');
  };

  if (status === 'loading') {
    return (
      <div className={styles.signupContainer}>
        <div className={styles.signupCard}>
          <h1 className={styles.pageTitle}>Loading...</h1>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.signupContainer}>
      <div className={styles.signupCard} style={{ maxWidth: '600px' }}>
        <h1 className={styles.pageTitle}>Welcome to Lift 🚀</h1>
        
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '30px' }}>
          See how Lift can help you succeed in just 60 seconds
        </p>

        {/* Video Container */}
        <div style={{
          position: 'relative',
          width: '100%',
          paddingBottom: '56.25%', // 16:9 aspect ratio
          marginBottom: '30px',
          backgroundColor: '#000',
          borderRadius: '8px',
          overflow: 'hidden'
        }}>
          <video
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%'
            }}
            controls
            onEnded={handleVideoEnded}
            autoPlay
          >
            <source src="/videos/demo.mp4" type="video/mp4" />
            <p>Your browser doesn't support HTML5 video.</p>
          </video>
        </div>

        <p style={{ textAlign: 'center', fontSize: '0.9em', color: 'var(--text-muted)', marginBottom: '30px' }}>
          ⏱️ Watch the demo to learn more, or skip to get started
        </p>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '15px', flexDirection: 'column' }}>
          <button
            className={styles.submitButton}
            onClick={handleContinue}
            disabled={loading}
            style={{
              background: '#FFFFFF',
              color: '#000000',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'Continuing...' : videoWatched ? ' Continue' : 'Skip'}
          </button>
        </div>

        <p style={{ textAlign: 'center', fontSize: '0.85em', color: 'var(--text-muted)', marginTop: '20px' }}>
          You'll be able to choose your access method on the next page
        </p>
      </div>
    </div>
  );
}
