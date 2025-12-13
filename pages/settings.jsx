import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import styles from '../styles/SignUp.module.css';

export default function Settings() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  
  const [preferences, setPreferences] = useState({
    theme: 'light',
    accentColor: '#d4af37',
    fontSize: 'medium',
    dashboardLayout: 'default',
    aiTone: 'professional',
    summaryLength: 'medium',
    flashcardDifficulty: 'medium',
    autoSaveInterval: 30,
    exportFormat: 'pdf',
    notifications: {
      email: false,
      deadlines: false
    },
    quickActions: ['notes', 'career'],
    keyboardShortcuts: true
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
    if (status === 'authenticated') {
      fetchPreferences();
    }
  }, [status, router]);

  async function fetchPreferences() {
    try {
      const res = await fetch('/api/user/preferences');
      if (res.ok) {
        const data = await res.json();
        if (data.data?.preferences) {
          setPreferences(prev => ({ ...prev, ...data.data.preferences }));
        }
      }
    } catch (err) {
      console.error('Failed to load preferences:', err);
    } finally {
      setLoading(false);
    }
  }

  async function savePreferences() {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences })
      });
      if (res.ok) {
        setMessage('✅ Settings saved successfully');
        applyTheme(preferences.theme, preferences.accentColor, preferences.fontSize);
      } else {
        setMessage('❌ Failed to save settings');
      }
    } catch (err) {
      setMessage('❌ Error saving settings');
    } finally {
      setSaving(false);
    }
  }

  function applyTheme(theme, accent, fontSize) {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-font-size', fontSize);
    document.documentElement.style.setProperty('--accent-color', accent);
  }

  if (loading) {
    return (
      <div className={styles.container} style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>Loading settings...</p>
      </div>
    );
  }

  return (
    <div className={styles.container} style={{ minHeight: '100vh', padding: '1rem' }}>
      <Head>
        <title>Settings - Lift</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div style={{ maxWidth: '800px', margin: '0 auto', width: '100%' }}>
        <h1 style={{ fontSize: 'clamp(1.5rem, 5vw, 2rem)', marginBottom: '1.5rem' }}>⚙️ Settings</h1>

        {/* Appearance */}
        <section style={{ marginBottom: '2rem', padding: 'clamp(1rem, 3vw, 1.5rem)', background: 'var(--card-bg, #fff)', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: 'clamp(1.25rem, 4vw, 1.5rem)', marginBottom: '1rem' }}>🎨 Appearance</h2>
          
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Theme</label>
            <select 
              value={preferences.theme} 
              onChange={(e) => setPreferences({ ...preferences, theme: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
            >
              <option value="light">☀️ Light</option>
              <option value="dark">🌙 Dark</option>
              <option value="auto">🔄 Auto (system)</option>
            </select>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Accent Color</label>
            <input 
              type="color" 
              value={preferences.accentColor}
              onChange={(e) => setPreferences({ ...preferences, accentColor: e.target.value })}
              style={{ width: '100px', height: '40px', border: '1px solid #ddd', borderRadius: '4px' }}
            />
            <span style={{ marginLeft: '1rem', color: '#666' }}>{preferences.accentColor}</span>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Font Size</label>
            <select 
              value={preferences.fontSize} 
              onChange={(e) => setPreferences({ ...preferences, fontSize: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
            >
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </div>
        </section>

        {/* AI Preferences */}
        <section style={{ marginBottom: '2rem', padding: '1.5rem', background: 'var(--card-bg, #fff)', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>🤖 AI Preferences</h2>
          
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Resume/Cover Letter Tone</label>
            <select 
              value={preferences.aiTone} 
              onChange={(e) => setPreferences({ ...preferences, aiTone: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
            >
              <option value="professional">Professional</option>
              <option value="friendly">Friendly</option>
              <option value="technical">Technical</option>
              <option value="creative">Creative</option>
            </select>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Summary Length</label>
            <select 
              value={preferences.summaryLength} 
              onChange={(e) => setPreferences({ ...preferences, summaryLength: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
            >
              <option value="short">Short</option>
              <option value="medium">Medium</option>
              <option value="long">Long</option>
            </select>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Flashcard Difficulty</label>
            <select 
              value={preferences.flashcardDifficulty} 
              onChange={(e) => setPreferences({ ...preferences, flashcardDifficulty: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
        </section>

        {/* Workflow */}
        <section style={{ marginBottom: '2rem', padding: '1.5rem', background: 'var(--card-bg, #fff)', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>⚡ Workflow</h2>
          
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Auto-save Interval (seconds)</label>
            <input 
              type="number" 
              min="10"
              max="300"
              value={preferences.autoSaveInterval}
              onChange={(e) => setPreferences({ ...preferences, autoSaveInterval: parseInt(e.target.value) })}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Default Export Format</label>
            <select 
              value={preferences.exportFormat} 
              onChange={(e) => setPreferences({ ...preferences, exportFormat: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
            >
              <option value="pdf">PDF</option>
              <option value="docx">Word (DOCX)</option>
              <option value="txt">Plain Text</option>
            </select>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={preferences.keyboardShortcuts}
                onChange={(e) => setPreferences({ ...preferences, keyboardShortcuts: e.target.checked })}
                style={{ marginRight: '0.5rem', width: '18px', height: '18px' }}
              />
              <span style={{ fontWeight: '600' }}>Enable Keyboard Shortcuts</span>
            </label>
          </div>
        </section>

        {/* Notifications */}
        <section style={{ marginBottom: '2rem', padding: '1.5rem', background: 'var(--card-bg, #fff)', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>🔔 Notifications</h2>
          
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={preferences.notifications?.email || false}
                onChange={(e) => setPreferences({ 
                  ...preferences, 
                  notifications: { ...preferences.notifications, email: e.target.checked }
                })}
                style={{ marginRight: '0.5rem', width: '18px', height: '18px' }}
              />
              <span style={{ fontWeight: '600' }}>Email Activity Summaries</span>
            </label>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={preferences.notifications?.deadlines || false}
                onChange={(e) => setPreferences({ 
                  ...preferences, 
                  notifications: { ...preferences.notifications, deadlines: e.target.checked }
                })}
                style={{ marginRight: '0.5rem', width: '18px', height: '18px' }}
              />
              <span style={{ fontWeight: '600' }}>Deadline Reminders</span>
            </label>
          </div>
        </section>

        {/* Save Button */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button 
            onClick={savePreferences}
            disabled={saving}
            style={{ 
              padding: '0.75rem 2rem', 
              background: 'var(--accent-color, #d4af37)', 
              color: '#fff', 
              border: 'none', 
              borderRadius: '4px', 
              fontSize: '1rem', 
              fontWeight: '600',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1
            }}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          
          <button 
            onClick={() => router.push('/dashboard')}
            style={{ 
              padding: '0.75rem 2rem', 
              background: '#f5f5f5', 
              color: '#333', 
              border: '1px solid #ddd', 
              borderRadius: '4px', 
              fontSize: '1rem',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>

          {message && <span style={{ color: message.includes('✅') ? 'green' : 'red' }}>{message}</span>}
        </div>
      </div>
    </div>
  );
}
