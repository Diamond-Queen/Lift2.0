import React, { useEffect, useState } from 'react';
import styles from '../styles/FirewallBlock.module.css';

/**
 * FirewallBlock Component
 * Displays a prominent red alert when the user hits the firewall
 * Shows details about why they were blocked and how long the block lasts
 */
export default function FirewallBlock({ 
  isBlocked = false, 
  reason = '', 
  blockUntil = null,
  onDismiss = null 
}) {
  const [remainingTime, setRemainingTime] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!isBlocked || !blockUntil) return;

    const updateTimer = () => {
      const now = new Date().getTime();
      const until = new Date(blockUntil).getTime();
      const remaining = Math.max(0, until - now);
      
      if (remaining <= 0) {
        setRemainingTime(null);
      } else {
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        setRemainingTime({ minutes, seconds });
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [isBlocked, blockUntil]);

  if (!isBlocked) return null;

  const reasonMessages = {
    'rate_limit_exceeded': 'Too many requests in a short time',
    'temporarily_blocked': 'Temporary block due to rate limiting',
    'throttled': 'Too many requests - please wait',
    'ip_blocked': 'Your IP has been blocked for security reasons',
    'account_locked': 'Account locked due to failed login attempts',
    'sql_injection_detected': 'Suspicious activity detected (SQL injection pattern)',
    'xss_detected': 'Suspicious activity detected (XSS pattern)',
    'malicious_user_agent': 'Suspicious request detected',
    'request_too_large': 'Request payload too large',
    'service_locked_down': 'Service is temporarily locked down for security',
  };

  const reasonDescription = reasonMessages[reason] || 'Your request was blocked by our security system';

  return (
    <div className={styles.firewallBlockOverlay}>
      <div className={styles.firewallBlockContainer}>
        {/* Warning Icon */}
        <div className={styles.warningIcon}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 9v2m0 4v2m7.431-10.771L13.34 3.11a2 2 0 00-3.268 0l-6.092 10.119a2 2 0 001.634 3.22h12.124a2 2 0 001.634-3.22z" />
          </svg>
        </div>

        {/* Main Title */}
        <h1 className={styles.title}>🚨 Security Block Active</h1>

        {/* Description */}
        <p className={styles.description}>
          {reasonDescription}
        </p>

        {/* Reason Details */}
        <div className={styles.reasonBox}>
          <strong>Reason:</strong>
          <code className={styles.reasonCode}>{reason}</code>
        </div>

        {/* Countdown Timer */}
        {remainingTime && (
          <div className={styles.timerBox}>
            <p>Your request was rejected. You can retry in:</p>
            <div className={styles.timer}>
              <span className={styles.timeNumber}>
                {remainingTime.minutes}:{String(remainingTime.seconds).padStart(2, '0')}
              </span>
              <span className={styles.timeLabel}>
                {remainingTime.minutes > 0 ? 'minutes' : 'seconds'}
              </span>
            </div>
          </div>
        )}

        {/* Details Toggle */}
        <button 
          className={styles.detailsToggle}
          onClick={() => setShowDetails(!showDetails)}
        >
          {showDetails ? '▼ Hide Details' : '▶ Show Details'}
        </button>

        {/* Detailed Information */}
        {showDetails && (
          <div className={styles.detailsBox}>
            <h3>What happened?</h3>
            <ul>
              <li>Your IP made too many requests in a short time period</li>
              <li>Our security system temporarily blocked further requests</li>
              <li>This is an automated protection measure against abuse</li>
            </ul>

            <h3>What should you do?</h3>
            <ul>
              <li>Wait for the timer to expire</li>
              <li>Refresh the page to retry once the block lifts</li>
              <li>Contact support if you believe this is a mistake</li>
            </ul>

            <h3>Why does this happen?</h3>
            <p>
              Rate limiting protects our service from abuse and keeps it fast for everyone. 
              If you're experiencing frequent blocks, please contact our support team.
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className={styles.actions}>
          <button 
            className={styles.retryBtn}
            onClick={() => window.location.reload()}
          >
            ↻ Retry Now
          </button>
          <button 
            className={styles.supportBtn}
            onClick={() => window.open('mailto:support@liftapp.com')}
          >
            📧 Contact Support
          </button>
        </div>

        {/* Dismiss Button (if provided) */}
        {onDismiss && (
          <button 
            className={styles.dismissBtn}
            onClick={onDismiss}
            aria-label="Close"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
