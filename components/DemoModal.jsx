import { useState } from 'react';
import Link from 'next/link';
import styles from '../styles/SignUp.module.css';

/**
 * Demo Modal - Shows a product demo video after signup
 * Routes users to trial, school, or subscription plans
 */
export default function DemoModal({ onClose, isOpen }) {
  const [videoWatched, setVideoWatched] = useState(false);
  const [loading, setLoading] = useState(false);

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

  const handleClose = () => {
    onClose();
  };

  const handleRouteClick = async (path) => {
    setLoading(true);
    onClose();
    // Router navigation handled by Link component
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: '#1a1a2e',
        borderRadius: '12px',
        maxWidth: '600px',
        width: '100%',
        padding: '30px',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
        maxHeight: '90vh',
        overflowY: 'auto'
      }}>
        {!videoWatched ? (
          <>
            <h2 style={{ marginTop: 0, marginBottom: '20px', textAlign: 'center' }}>
              Welcome to Lift 🚀
            </h2>
            
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '20px' }}>
              See how Lift can help you succeed in just 60 seconds
            </p>

            {/* Video Container */}
            <div style={{
              position: 'relative',
              width: '100%',
              paddingBottom: '56.25%', // 16:9 aspect ratio
              marginBottom: '20px',
              backgroundColor: '#000'
            }}>
              <video
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  borderRadius: '8px'
                }}
                controls
                onEnded={handleVideoEnded}
                autoPlay
              >
                <source src="/videos/demo.mp4" type="video/mp4" />
                <p>Your browser doesn't support HTML5 video. You can still explore Lift by choosing an option below!</p>
              </video>
            </div>

            <p style={{ textAlign: 'center', fontSize: '0.9em', color: 'var(--text-muted)' }}>
              ⏱️ Watch the demo to continue, or skip to explore Lift now
            </p>

            <button
              onClick={handleClose}
              style={{
                width: '100%',
                padding: '12px',
                marginTop: '15px',
                backgroundColor: 'rgba(147, 51, 234, 0.2)',
                border: '1px solid rgba(147, 51, 234, 0.3)',
                color: 'inherit',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '1em',
                fontWeight: 500
              }}
            >
              Skip Demo
            </button>
          </>
        ) : (
          <>
            <h2 style={{ marginTop: 0, marginBottom: '20px', textAlign: 'center' }}>
              Ready to Get Started? ✨
            </h2>

            <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '25px' }}>
              Choose how you'd like to experience Lift
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Link
                href="/onboarding/beta"
                onClick={() => handleRouteClick('/onboarding/beta')}
                style={{
                  textDecoration: 'none',
                  padding: '14px 18px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(147, 51, 234, 0.15)',
                  border: '1px solid rgba(147, 51, 234, 0.4)',
                  color: 'inherit',
                  textAlign: 'center',
                  cursor: 'pointer',
                  fontWeight: 500,
                  transition: 'all 0.3s'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = 'rgba(147, 51, 234, 0.25)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'rgba(147, 51, 234, 0.15)';
                }}
              >
                🎯 Beta Program (Free Trial)
                <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>Get early access with 7-14 day trial</div>
              </Link>

              <Link
                href="/onboarding/school"
                onClick={() => handleRouteClick('/onboarding/school')}
                style={{
                  textDecoration: 'none',
                  padding: '14px 18px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(59, 130, 246, 0.15)',
                  border: '1px solid rgba(59, 130, 246, 0.4)',
                  color: 'inherit',
                  textAlign: 'center',
                  cursor: 'pointer',
                  fontWeight: 500,
                  transition: 'all 0.3s'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = 'rgba(59, 130, 246, 0.25)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
                }}
              >
                🎓 School Code
                <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>Full access with your school</div>
              </Link>

              <Link
                href="/subscription/plans"
                onClick={() => handleRouteClick('/subscription/plans')}
                style={{
                  textDecoration: 'none',
                  padding: '14px 18px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(34, 197, 94, 0.15)',
                  border: '1px solid rgba(34, 197, 94, 0.4)',
                  color: 'inherit',
                  textAlign: 'center',
                  cursor: 'pointer',
                  fontWeight: 500,
                  transition: 'all 0.3s'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = 'rgba(34, 197, 94, 0.25)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'rgba(34, 197, 94, 0.15)';
                }}
              >
                💳 Individual Subscription
                <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>Start at just $10/month</div>
              </Link>
            </div>

            <button
              onClick={handleClose}
              style={{
                width: '100%',
                padding: '12px',
                marginTop: '20px',
                backgroundColor: 'transparent',
                border: '1px solid var(--text-muted)',
                color: 'var(--text-muted)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.95em'
              }}
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}
