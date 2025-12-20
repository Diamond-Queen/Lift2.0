import { useRouter } from 'next/router';

export default function UnlockModal({ isOpen, onClose, feature = 'this feature' }) {
  const router = useRouter();

  if (!isOpen) return null;

  const handleUpgrade = () => {
    router.push('/subscription/plans');
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '500px',
          width: '100%',
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          borderRadius: '16px',
          padding: '2rem',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)'
        }}
      >
        <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent)' }}>
          Unlock Full Access
        </h2>
        <p style={{ margin: '0 0 1.5rem 0', color: 'var(--text-color)', lineHeight: 1.6 }}>
          {feature} is available with <strong>Full Access</strong>. Upgrade to unlock:
        </p>
        <ul style={{ margin: '0 0 1.5rem 0', paddingLeft: '1.5rem', color: 'var(--text-muted)', lineHeight: 1.8 }}>
          <li>Unlimited notes and flashcards</li>
          <li>Advanced AI summaries</li>
          <li>Export to PDF and Word</li>
          <li>Unlimited classes and organization</li>
          <li>Resume and cover letter generation</li>
        </ul>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={handleUpgrade}
            style={{
              flex: 1,
              padding: '0.875rem 1.5rem',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '1rem',
              cursor: 'pointer'
            }}
          >
            View Plans
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '0.875rem 1.5rem',
              background: 'transparent',
              color: 'var(--text-color)',
              border: '1px solid var(--card-border)',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '1rem',
              cursor: 'pointer'
            }}
          >
            Maybe Later
          </button>
        </div>
        <p style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          3-day free trial • Cancel anytime
        </p>
      </div>
    </div>
  );
}
