import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

/**
 * Quick Actions widget for dashboard
 * Displays pinned shortcuts to frequently used tools
 */
export default function QuickActions() {
  const { data: session } = useSession();
  const [quickActions, setQuickActions] = useState([
    { id: 'career', label: 'Career Tools', href: '/career', icon: '💼', enabled: true },
    { id: 'notes', label: 'AI Notes', href: '/notes', icon: '📝', enabled: true },
    { id: 'settings', label: 'Settings', href: '/settings', icon: '⚙️', enabled: true }
  ]);

  useEffect(() => {
    if (session) {
      loadQuickActions();
    }
  }, [session]);

  async function loadQuickActions() {
    try {
      const res = await fetch('/api/user/preferences');
      if (res.ok) {
        const data = await res.json();
        const prefs = data.data?.preferences || {};
        if (prefs.quickActions && Array.isArray(prefs.quickActions)) {
          setQuickActions(prefs.quickActions);
        }
      }
    } catch (err) {
      console.error('Failed to load quick actions:', err);
    }
  }

  const enabledActions = quickActions.filter(a => a.enabled !== false);

  return (
    <div style={{
      padding: 24,
      backgroundColor: 'var(--card-bg)',
      borderRadius: 12,
      border: '1px solid var(--border-color)',
      boxShadow: 'var(--shadow)'
    }}>
      <h3 style={{ marginBottom: 16, fontSize: 18, fontWeight: 600 }}>Quick Actions</h3>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: 12
      }}>
        {enabledActions.map(action => (
          <Link key={action.id} href={action.href}>
            <div style={{
              padding: 16,
              backgroundColor: 'var(--bg-color)',
              border: '1px solid var(--border-color)',
              borderRadius: 8,
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
              ':hover': {
                borderColor: 'var(--accent-color)',
                transform: 'translateY(-2px)'
              }
            }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>{action.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{action.label}</div>
            </div>
          </Link>
        ))}
      </div>
      <Link href="/settings">
        <div style={{
          marginTop: 16,
          textAlign: 'center',
          fontSize: 13,
          color: 'var(--accent-color)',
          cursor: 'pointer'
        }}>
          Customize Quick Actions →
        </div>
      </Link>
    </div>
  );
}
