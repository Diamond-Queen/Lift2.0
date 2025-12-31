import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useSession, signOut } from 'next-auth/react';
import TemplatePicker from "../components/TemplatePicker";
import { musicUrls, getAudioStreamUrl } from "../lib/musicUrls";

export default function Account() {
  const { status } = useSession();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [uiStatus, setUiStatus] = useState({ type: null, text: '' });
  const [theme, setTheme] = useState(null);
  const [formatTemplate, setFormatTemplate] = useState('');
  const [resumeTemplate, setResumeTemplate] = useState('professional');
  const [coverLetterTemplate, setCoverLetterTemplate] = useState('formal');
  const [studyMusic, setStudyMusic] = useState('none');
  const [mounted, setMounted] = useState(false);
  const [showSensitive, setShowSensitive] = useState(false);

  // Auto-hide sensitive email after 10s when revealed
  useEffect(() => {
    if (!showSensitive) return;
    const t = setTimeout(() => setShowSensitive(false), 10000);
    return () => clearTimeout(t);
  }, [showSensitive]);

  const maskEmail = (email) => {
    if (!email || typeof email !== 'string' || !email.includes('@')) return '';
    const [local, domain] = email.split('@');
    const maskedLocal = local.length <= 2 ? local[0] + '*' : local[0] + '*'.repeat(Math.max(1, local.length - 2)) + local.slice(-1);
    const lastDot = domain.lastIndexOf('.');
    if (lastDot === -1) return `${maskedLocal}@${domain[0]}***`;
    const dName = domain.slice(0, lastDot);
    const tld = domain.slice(lastDot);
    const maskedDomain = (dName.length <= 2 ? dName[0] + '*' : dName[0] + '*'.repeat(Math.max(1, dName.length - 2)) + dName.slice(-1)) + tld;
    return `${maskedLocal}@${maskedDomain}`;
  };

  useEffect(() => {
    if (theme && mounted) {
      const scrollPos = window.scrollY || document.documentElement.scrollTop;
      requestAnimationFrame(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        window.scrollTo(0, scrollPos);
      });
    }
  }, [theme, mounted]);

  useEffect(() => {
    setMounted(true);
    
    (async () => {
      try {
        const res = await fetch('/api/user');
        if (!res.ok) return;
        const data = await res.json();
        const userData = (data && data.data && data.data.user) || null;
        if (userData && !userData.onboarded) {
          router.push('/onboarding');
          return;
        }
        setUser(userData);
        
        try {
          const p = await fetch('/api/user/preferences');
          if (p.ok) {
            const pd = await p.json();
            setFormatTemplate(pd.data?.formatTemplate || '');
            setResumeTemplate(pd.data?.resumeTemplate || 'professional');
            setCoverLetterTemplate(pd.data?.coverLetterTemplate || 'formal');
            if (pd.data?.preferences) {
              const prefs = pd.data.preferences;
              setTheme(prefs.theme || 'dark');
              setStudyMusic(prefs.studyMusic || 'none');
            }
          }
        } catch (e) {
          console.error('Error loading preferences:', e);
        }
      } catch (err) {
        console.error('Account error:', err);
      }
    })();
  }, [router]);

  async function saveAllSettings() {
    setUiStatus({ type: 'loading', text: 'Saving...' });
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferences: {
            theme: theme || 'dark',
            studyMusic: studyMusic || 'none',
          },
          formatTemplate,
          resumeTemplate,
          coverLetterTemplate,
        })
      });
      if (res.ok) {
        setUiStatus({ type: 'success', text: 'Settings saved!' });
        setTimeout(() => setUiStatus({ type: null, text: '' }), 3000);
      } else {
        setUiStatus({ type: 'error', text: 'Failed to save' });
      }
    } catch (err) {
      setUiStatus({ type: 'error', text: 'Error saving settings' });
    }
  }

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/' });
  };

  if (!user) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
        <p>Loading your account…</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#fff' }}>
      {/* Scrollable Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '2rem 1rem' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', width: '100%' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: '800', marginBottom: '2rem' }}>Account</h1>

          {/* Status Message */}
          {uiStatus.text && (
            <div style={{
              marginBottom: '1.5rem',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              background: uiStatus.type === 'success' ? '#e8f5e9' : '#ffebee',
              border: `1px solid ${uiStatus.type === 'success' ? '#4caf50' : '#f44336'}`,
              color: uiStatus.type === 'success' ? '#2e7d32' : '#c62828',
              fontSize: '0.9rem',
              fontWeight: '600',
              textAlign: 'center'
            }}>
              {uiStatus.text}
            </div>
          )}

          {/* Profile Section */}
          <div style={{ marginBottom: '2rem', paddingBottom: '2rem', borderBottom: '1px solid #eee' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '1rem' }}>Profile</h2>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>{user.name || user.email}</div>
              <div style={{ color: '#999', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>{showSensitive ? user.email : maskEmail(user.email)}</span>
                <button
                  type="button"
                  onClick={() => setShowSensitive(s => !s)}
                  style={{
                    fontSize: '0.8rem',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    border: '1px solid #ddd',
                    background: '#f5f5f5',
                    cursor: 'pointer'
                  }}
                >
                  {showSensitive ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            {user.school && (
              <div style={{ padding: '0.6rem', background: '#f0f0f0', borderRadius: '6px', fontSize: '0.9rem' }}>
                School: <strong>{user.school.name}</strong>
              </div>
            )}
          </div>

          {/* Subscription */}
          {user.subscriptions && user.subscriptions.length > 0 && (
            <div style={{ marginBottom: '2rem', paddingBottom: '2rem', borderBottom: '1px solid #eee' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '1rem' }}>Subscription</h2>
              {(() => {
                const sub = user.subscriptions[0];
                const planName = sub.plan === 'career' ? 'Career Only' : sub.plan === 'full' ? 'Full Access' : sub.plan;
                const price = sub.priceMonthly ? `$${sub.priceMonthly}/month` : '';
                const statusText = sub.status === 'trialing' ? 'Free Trial' : sub.status === 'active' ? 'Active' : sub.status;
                const trialEnd = sub.trialEndsAt ? new Date(sub.trialEndsAt) : null;
                const now = new Date();
                const isTrialing = sub.status === 'trialing' && trialEnd && trialEnd > now;
                
                return (
                  <div style={{ padding: '1rem', background: '#f9f9f9', borderRadius: '6px' }}>
                    <div style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                      {planName} {price && `• ${price}`}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.5rem' }}>
                      Status: <strong>{statusText}</strong>
                    </div>
                    {isTrialing && trialEnd && (
                      <div style={{ fontSize: '0.85rem', color: '#666' }}>
                        Trial ends: {trialEnd.toLocaleDateString()}
                      </div>
                    )}
                    {sub.plan === 'career' && (
                      <Link href="/subscription/plans" style={{ display: 'inline-block', marginTop: '0.75rem', padding: '0.5rem 1rem', background: '#8b7500', color: 'white', borderRadius: '6px', fontSize: '0.9rem', fontWeight: '600', textDecoration: 'none' }}>
                        Upgrade
                      </Link>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Appearance */}
          <div style={{ marginBottom: '2rem', paddingBottom: '2rem', borderBottom: '1px solid #eee' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '1rem' }}>Appearance</h2>
            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.4rem' }}>Theme</label>
            <select 
              value={theme || 'dark'} 
              onChange={(e) => setTheme(e.target.value)} 
              style={{ width: '100%', padding: '0.6rem', border: '1px solid #ddd', borderRadius: '6px', background: '#fff', fontSize: '0.95rem' }}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>

          {/* Study Music */}
          <div style={{ marginBottom: '2rem', paddingBottom: '2rem', borderBottom: '1px solid #eee' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '1rem' }}>Study Music</h2>
            <p style={{ color: '#999', fontSize: '0.9rem', marginBottom: '1rem' }}>
              Plays automatically when Study Mode is enabled.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
              {[
                { key: 'none', label: 'None' },
                { key: 'lofi', label: 'Lo-fi' },
                { key: 'classical', label: 'Classical' },
                { key: 'ambient', label: 'Ambient' },
                { key: 'rain', label: 'Rain' },
                { key: 'rap', label: 'Rap' },
                { key: 'rnb', label: 'R&B' }
              ].map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStudyMusic(key)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '20px',
                    border: '1px solid #ddd',
                    background: studyMusic === key ? '#8b7500' : '#f5f5f5',
                    color: studyMusic === key ? '#fff' : '#333',
                    fontSize: '0.85rem',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Resume & Cover Letter Templates */}
          <div style={{ marginBottom: '2rem', paddingBottom: '2rem', borderBottom: '1px solid #eee' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '1rem' }}>Templates</h2>
            <p style={{ color: '#999', fontSize: '0.9rem', marginBottom: '1.5rem' }}>Choose your preferred templates for resumes and cover letters.</p>
            
            <TemplatePicker 
              type="resume" 
              currentTemplate={resumeTemplate}
              onSelect={(template) => setResumeTemplate(template.id)}
            />
            
            <TemplatePicker 
              type="cover-letter" 
              currentTemplate={coverLetterTemplate}
              onSelect={(template) => setCoverLetterTemplate(template.id)}
            />
          </div>

          {/* Custom Format Instructions */}
          <div style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '1rem' }}>Custom Format (Optional)</h2>
            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.4rem' }}>Instructions</label>
            <small style={{ display: 'block', marginBottom: '0.6rem', color: '#999', fontSize: '0.85rem' }}>Add any additional formatting instructions for your documents.</small>
            <textarea 
              value={formatTemplate} 
              onChange={(e) => setFormatTemplate(e.target.value)} 
              rows={3}
              placeholder="e.g. Two-column layout, compact font, etc."
              style={{ 
                width: '100%', 
                padding: '0.6rem', 
                border: '1px solid #ddd', 
                borderRadius: '6px', 
                background: '#fff', 
                color: '#333', 
                fontSize: '0.95rem', 
                fontFamily: 'inherit', 
                resize: 'vertical',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>
      </div>

      {/* Fixed Footer */}
      <div style={{ padding: '1rem', borderTop: '1px solid #eee', background: '#f9f9f9', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <button 
          onClick={saveAllSettings}
          style={{ 
            padding: '0.7rem 1.5rem', 
            background: '#8b7500', 
            color: '#fff', 
            border: 'none', 
            borderRadius: '6px', 
            fontSize: '0.95rem', 
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          Save Settings
        </button>
        
        <button 
          onClick={handleLogout}
          style={{ 
            padding: '0.7rem 1.5rem', 
            background: '#f5f5f5', 
            color: '#333', 
            border: '1px solid #ddd', 
            borderRadius: '6px', 
            fontSize: '0.95rem', 
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          Sign Out
        </button>
      </div>

      <audio id="musicPreviewAudio" style={{ display: 'none' }} />
    </div>
  );
}
