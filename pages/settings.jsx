import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import styles from '../styles/SignUp.module.css';

const settingsStyles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: '#fff',
    color: '#333'
  },
  scrollArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '2rem 1rem'
  },
  content: {
    maxWidth: '600px',
    margin: '0 auto',
    width: '100%'
  },
  header: {
    marginBottom: '2rem'
  },
  title: {
    fontSize: '2rem',
    fontWeight: '800',
    marginBottom: '0.5rem'
  },
  subtitle: {
    fontSize: '0.9rem',
    color: '#666'
  },
  section: {
    marginBottom: '2rem',
    paddingBottom: '2rem',
    borderBottom: '1px solid #eee'
  },
  sectionTitle: {
    fontSize: '1.1rem',
    fontWeight: '700',
    marginBottom: '1rem',
    color: '#000'
  },
  formGroup: {
    marginBottom: '1.2rem'
  },
  label: {
    display: 'block',
    fontSize: '0.9rem',
    fontWeight: '600',
    marginBottom: '0.4rem',
    color: '#333'
  },
  input: {
    width: '100%',
    padding: '0.6rem',
    fontSize: '0.95rem',
    border: '1px solid #ddd',
    borderRadius: '6px',
    boxSizing: 'border-box'
  },
  select: {
    width: '100%',
    padding: '0.6rem',
    fontSize: '0.95rem',
    border: '1px solid #ddd',
    borderRadius: '6px',
    boxSizing: 'border-box',
    background: '#fff'
  },
  checkbox: {
    marginRight: '0.6rem',
    width: '18px',
    height: '18px',
    cursor: 'pointer'
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    fontSize: '0.95rem',
    fontWeight: '600'
  },
  footer: {
    padding: '1rem',
    borderTop: '1px solid #eee',
    background: '#f9f9f9',
    display: 'flex',
    gap: '1rem',
    alignItems: 'center'
  },
  button: {
    padding: '0.7rem 1.5rem',
    fontSize: '0.95rem',
    fontWeight: '600',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  primaryButton: {
    background: '#8b7500',
    color: '#fff'
  },
  secondaryButton: {
    background: '#f5f5f5',
    color: '#333',
    border: '1px solid #ddd'
  },
  message: {
    fontSize: '0.9rem',
    marginLeft: 'auto'
  }
};

export default function Settings() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  
  const [preferences, setPreferences] = useState({
    theme: 'light',
    accentColor: '#8b7500',
    fontSize: 'medium',
    aiTone: 'professional',
    summaryLength: 'medium',
    flashcardDifficulty: 'medium',
    autoSaveInterval: 30,
    exportFormat: 'pdf',
    notifications: { email: false, deadlines: false },
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
        setMessage('✅ Saved');
      } else {
        setMessage('❌ Failed');
      }
    } catch (err) {
      setMessage('❌ Error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{ ...settingsStyles.container, justifyContent: 'center', alignItems: 'center' }}>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div style={settingsStyles.container}>
      <Head>
        <title>Settings - Lift</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div style={settingsStyles.scrollArea}>
        <div style={settingsStyles.content}>
          <div style={settingsStyles.header}>
            <h1 style={settingsStyles.title}>Settings</h1>
          </div>

          {/* Appearance */}
          <div style={settingsStyles.section}>
            <h2 style={settingsStyles.sectionTitle}>Appearance</h2>
            
            <div style={settingsStyles.formGroup}>
              <label style={settingsStyles.label}>Theme</label>
              <select 
                value={preferences.theme}
                onChange={(e) => setPreferences({ ...preferences, theme: e.target.value })}
                style={settingsStyles.select}
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="auto">Auto (System)</option>
              </select>
            </div>

            <div style={settingsStyles.formGroup}>
              <label style={settingsStyles.label}>Accent Color</label>
              <input 
                type="color"
                value={preferences.accentColor}
                onChange={(e) => setPreferences({ ...preferences, accentColor: e.target.value })}
                style={{ ...settingsStyles.input, maxWidth: '100px', height: '40px', padding: '2px' }}
              />
              <span style={{ fontSize: '0.85rem', color: '#999', marginTop: '0.3rem', display: 'block' }}>
                {preferences.accentColor}
              </span>
            </div>

            <div style={settingsStyles.formGroup}>
              <label style={settingsStyles.label}>Font Size</label>
              <select 
                value={preferences.fontSize}
                onChange={(e) => setPreferences({ ...preferences, fontSize: e.target.value })}
                style={settingsStyles.select}
              >
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>
          </div>

          {/* AI Preferences */}
          <div style={settingsStyles.section}>
            <h2 style={settingsStyles.sectionTitle}>AI Preferences</h2>
            
            <div style={settingsStyles.formGroup}>
              <label style={settingsStyles.label}>Resume/Letter Tone</label>
              <select 
                value={preferences.aiTone}
                onChange={(e) => setPreferences({ ...preferences, aiTone: e.target.value })}
                style={settingsStyles.select}
              >
                <option value="professional">Professional</option>
                <option value="friendly">Friendly</option>
                <option value="technical">Technical</option>
                <option value="creative">Creative</option>
              </select>
            </div>

            <div style={settingsStyles.formGroup}>
              <label style={settingsStyles.label}>Summary Length</label>
              <select 
                value={preferences.summaryLength}
                onChange={(e) => setPreferences({ ...preferences, summaryLength: e.target.value })}
                style={settingsStyles.select}
              >
                <option value="short">Short</option>
                <option value="medium">Medium</option>
                <option value="long">Long</option>
              </select>
            </div>

            <div style={settingsStyles.formGroup}>
              <label style={settingsStyles.label}>Flashcard Difficulty</label>
              <select 
                value={preferences.flashcardDifficulty}
                onChange={(e) => setPreferences({ ...preferences, flashcardDifficulty: e.target.value })}
                style={settingsStyles.select}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>

          {/* Workflow */}
          <div style={settingsStyles.section}>
            <h2 style={settingsStyles.sectionTitle}>Workflow</h2>
            
            <div style={settingsStyles.formGroup}>
              <label style={settingsStyles.label}>Auto-save Interval (seconds)</label>
              <input 
                type="number"
                min="10"
                max="300"
                value={preferences.autoSaveInterval}
                onChange={(e) => setPreferences({ ...preferences, autoSaveInterval: parseInt(e.target.value) })}
                style={settingsStyles.input}
              />
            </div>

            <div style={settingsStyles.formGroup}>
              <label style={settingsStyles.label}>Default Export Format</label>
              <select 
                value={preferences.exportFormat}
                onChange={(e) => setPreferences({ ...preferences, exportFormat: e.target.value })}
                style={settingsStyles.select}
              >
                <option value="pdf">PDF</option>
                <option value="docx">Word (DOCX)</option>
                <option value="txt">Plain Text</option>
              </select>
            </div>

            <div style={settingsStyles.formGroup}>
              <label style={settingsStyles.checkboxLabel}>
                <input 
                  type="checkbox"
                  checked={preferences.keyboardShortcuts}
                  onChange={(e) => setPreferences({ ...preferences, keyboardShortcuts: e.target.checked })}
                  style={settingsStyles.checkbox}
                />
                Enable Keyboard Shortcuts
              </label>
            </div>
          </div>

          {/* Notifications */}
          <div style={settingsStyles.section}>
            <h2 style={settingsStyles.sectionTitle}>Notifications</h2>
            
            <div style={settingsStyles.formGroup}>
              <label style={settingsStyles.checkboxLabel}>
                <input 
                  type="checkbox"
                  checked={preferences.notifications?.email || false}
                  onChange={(e) => setPreferences({ 
                    ...preferences, 
                    notifications: { ...preferences.notifications, email: e.target.checked }
                  })}
                  style={settingsStyles.checkbox}
                />
                Email Activity Summaries
              </label>
            </div>

            <div style={settingsStyles.formGroup}>
              <label style={settingsStyles.checkboxLabel}>
                <input 
                  type="checkbox"
                  checked={preferences.notifications?.deadlines || false}
                  onChange={(e) => setPreferences({ 
                    ...preferences, 
                    notifications: { ...preferences.notifications, deadlines: e.target.checked }
                  })}
                  style={settingsStyles.checkbox}
                />
                Deadline Reminders
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Footer with Save Button */}
      <div style={settingsStyles.footer}>
        <button 
          onClick={savePreferences}
          disabled={saving}
          style={{ 
            ...settingsStyles.button, 
            ...settingsStyles.primaryButton,
            opacity: saving ? 0.6 : 1,
            cursor: saving ? 'not-allowed' : 'pointer'
          }}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        
        <button 
          onClick={() => router.push('/dashboard')}
          style={{ 
            ...settingsStyles.button, 
            ...settingsStyles.secondaryButton
          }}
        >
          Cancel
        </button>

        {message && (
          <span style={{
            ...settingsStyles.message,
            color: message.includes('✅') ? '#4caf50' : '#f44336',
            fontSize: '0.85rem'
          }}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
