import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Head from 'next/head';
import styles from '../styles/SignUp.module.css';

export default function Templates() {
  const { data: session, status } = useSession();
  const [templates, setTemplates] = useState({
    resume: '',
    coverLetter: ''
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (status === 'authenticated') {
      loadTemplates();
    }
  }, [status]);

  async function loadTemplates() {
    try {
      const res = await fetch('/api/user/preferences');
      if (res.ok) {
        const data = await res.json();
        const prefs = data.data?.preferences || {};
        setTemplates({
          resume: prefs.resumeTemplate || '',
          coverLetter: prefs.coverLetterTemplate || ''
        });
      }
    } catch (err) {
      console.error('Failed to load templates:', err);
    }
  }

  async function saveTemplates() {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferences: {
            resumeTemplate: templates.resume,
            coverLetterTemplate: templates.coverLetter
          }
        })
      });

      if (res.ok) {
        setMessage('Templates saved successfully!');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('Failed to save templates');
      }
    } catch (err) {
      setMessage('Error saving templates');
    } finally {
      setSaving(false);
    }
  }

  if (status === 'loading') return <div className={styles.container}>Loading...</div>;
  if (status === 'unauthenticated') return <div className={styles.container}>Please sign in</div>;

  return (
    <>
      <Head>
        <title>Default Templates - Lift</title>
      </Head>
      <div className={styles.container}>
        <div className={styles.card} style={{ maxWidth: 900 }}>
          <h1 style={{ marginBottom: 24 }}>Default Templates</h1>
          <p style={{ marginBottom: 32, color: '#888' }}>
            Save default templates to pre-fill resume and cover letter forms. These will auto-populate when you start a new document.
          </p>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
              Resume Template
            </label>
            <textarea
              value={templates.resume}
              onChange={(e) => setTemplates({ ...templates, resume: e.target.value })}
              placeholder="Default resume content (objective, experience, skills, etc.)"
              style={{
                width: '100%',
                minHeight: 200,
                padding: 12,
                borderRadius: 8,
                border: '1px solid #333',
                backgroundColor: '#1a1a1a',
                color: '#fff',
                fontFamily: 'monospace',
                fontSize: 14
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
              Cover Letter Template
            </label>
            <textarea
              value={templates.coverLetter}
              onChange={(e) => setTemplates({ ...templates, coverLetter: e.target.value })}
              placeholder="Default cover letter opening or key points"
              style={{
                width: '100%',
                minHeight: 200,
                padding: 12,
                borderRadius: 8,
                border: '1px solid #333',
                backgroundColor: '#1a1a1a',
                color: '#fff',
                fontFamily: 'monospace',
                fontSize: 14
              }}
            />
          </div>

          <button
            onClick={saveTemplates}
            disabled={saving}
            style={{
              padding: '12px 24px',
              backgroundColor: saving ? '#555' : '#d4af37',
              color: '#000',
              border: 'none',
              borderRadius: 8,
              fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer'
            }}
          >
            {saving ? 'Saving...' : 'Save Templates'}
          </button>

          {message && (
            <div style={{ 
              marginTop: 16, 
              padding: 12, 
              backgroundColor: 'rgba(212, 175, 55, 0.1)',
              borderRadius: 8,
              color: '#D4AF37',
              border: '1px solid rgba(212, 175, 55, 0.3)'
            }}>
              {message}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
