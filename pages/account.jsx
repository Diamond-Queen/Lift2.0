import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import styles from "../styles/SignUp.module.css";
import { useSession, signOut } from 'next-auth/react';
import TemplatePicker from "../components/TemplatePicker";

export default function Account() {
  const { status } = useSession();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [uiStatus, setUiStatus] = useState({ type: null, text: '' });
  const [theme, setTheme] = useState(null);
  const [studyMode, setStudyMode] = useState(null);
  const [formatTemplate, setFormatTemplate] = useState('');
  const [resumeTemplate, setResumeTemplate] = useState('professional');
  const [coverLetterTemplate, setCoverLetterTemplate] = useState('formal');
  const [studyMusic, setStudyMusic] = useState('none');
  const [mounted, setMounted] = useState(false);
  const [preferencesSaved, setPreferencesSaved] = useState(true);
  const [showSensitive, setShowSensitive] = useState(false);
  // Auto-hide sensitive email after 10s when revealed
  useEffect(() => {
    if (!showSensitive) return;
    const t = setTimeout(() => setShowSensitive(false), 10000);
    return () => clearTimeout(t);
  }, [showSensitive]);

  // helpers
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

  // Apply theme to DOM
  useEffect(() => {
    if (theme && mounted) {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('theme', theme);
    }
  }, [theme, mounted]);

  // Track changes to all preferences and templates
  useEffect(() => {
    if (mounted && (theme !== null || studyMode !== null || formatTemplate || resumeTemplate || coverLetterTemplate || studyMusic)) {
      setPreferencesSaved(false);
    }
  }, [theme, studyMode, formatTemplate, resumeTemplate, coverLetterTemplate, studyMusic, mounted]);

  // Reflect study mode globally for CSS overrides only when active
  useEffect(() => {
    if (!mounted) return;
    document.documentElement.dataset.study = studyMode ? 'on' : 'off';
  }, [studyMode, mounted]);

  useEffect(() => {
    setMounted(true);
  
    // fetch user from server if authenticated
    (async () => {
      try {
        const res = await fetch('/api/user');
        if (!res.ok) return;
        const data = await res.json();
        const userData = (data && data.data && data.data.user) || null;
        // Redirect to onboarding if not onboarded
        if (userData && !userData.onboarded) {
          router.push('/onboarding');
          return;
        }
        setUser(userData);
        // load saved format template/preferences from server (source of truth)
        try {
          const p = await fetch('/api/user/preferences');
          if (p.ok) {
            const pd = await p.json();
            setFormatTemplate(pd.data?.formatTemplate || '');
            setResumeTemplate(pd.data?.resumeTemplate || 'professional');
            setCoverLetterTemplate(pd.data?.coverLetterTemplate || 'formal');
            // Apply server preferences
            if (pd.data?.preferences) {
              const prefs = pd.data.preferences;
              setTheme(prefs.theme || 'dark');
              setStudyMode(typeof prefs.studyMode === 'boolean' ? prefs.studyMode : false);
              setStudyMusic(prefs.studyMusic || 'none');
              // Sync to localStorage for theme
              if (prefs.theme) localStorage.setItem('theme', prefs.theme);
              // Mark as saved since we just loaded from server
              setPreferencesSaved(true);
            } else {
              // No server preferences, use defaults
              setTheme('dark');
              setStudyMode(false);
              setStudyMusic('none');
              setPreferencesSaved(true);
            }
            // Mark as saved after loading
            setPreferencesSaved(true);
          }
        } catch (e) {
          // fallback to defaults
          setTheme('dark');
          setStudyMode(false);
          setStudyMusic('none');
          setPreferencesSaved(true);
        }
      } catch (e) {
        // ignore
      }
    })();
  }, []);

  const handleLogout = () => {
    signOut({ callbackUrl: '/login' });
  };



  const saveAllSettings = () => {
    // Persist locally and to server preferences endpoint
    localStorage.setItem("theme", theme);
    localStorage.setItem("studyMode", studyMode ? "true" : "false");
    (async () => {
      try {
        const res = await fetch('/api/user/preferences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            preferences: { theme, studyMode, studyMusic },
            formatTemplate,
            resumeTemplate,
            coverLetterTemplate
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setUiStatus({ type: 'error', text: d.error || 'Failed to save settings' });
          setTimeout(() => setUiStatus({ type: null, text: '' }), 2000);
          return;
        }
        setUiStatus({ type: 'success', text: '✅ All settings saved successfully' });
        setPreferencesSaved(true);
        setTimeout(() => setUiStatus({ type: null, text: '' }), 1500);
      } catch (err) {
        setUiStatus({ type: 'error', text: 'Network error.' });
        setTimeout(() => setUiStatus({ type: null, text: '' }), 2000);
      }
    })();
  };

  const handleDone = () => {
    if (!preferencesSaved) {
      setUiStatus({ type: 'error', text: 'Remember to save your settings' });
      setTimeout(() => setUiStatus({ type: null, text: '' }), 3000);
      return;
    }
    router.push('/dashboard');
  };

  if (status === 'loading') {
    return (
      <div className={styles.signupContainer}>
        <div className={styles.signupCard}>
          <h1 className={styles.pageTitle}>Account</h1>
          <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated' && !user) {
    return (
      <div className={styles.signupContainer}>
        <div className={styles.signupCard}>
          <h1 className={styles.pageTitle}>Account</h1>
          <p style={{ textAlign: 'center', marginBottom: '1rem' }}>You are not signed in.</p>
          <Link href="/signup" className={styles.submitButton} style={{ display: 'block', textAlign: 'center', marginBottom: '0.75rem', textDecoration: 'none' }}>Create account</Link>
          <Link href="/login" className={styles.loginLink}>Already have an account? Sign in</Link>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={styles.signupContainer}>
        <div className={styles.signupCard}>
          <h1 className={styles.pageTitle}>Account</h1>
          <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading your account…</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.signupContainer}>
      <div className={styles.signupCard} style={{ maxWidth: '600px' }}>
        <h1 className={styles.pageTitle}>Account</h1>

        {/* Status Message */}
        {uiStatus.text && (
          <div style={{
            marginBottom: '1rem',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            background: uiStatus.type === 'error' ? 'rgba(220, 38, 38, 0.1)' : 'rgba(34, 197, 94, 0.1)',
            border: `1px solid ${uiStatus.type === 'error' ? 'rgba(220, 38, 38, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`,
            color: uiStatus.type === 'error' ? '#ef4444' : '#22c55e',
            fontSize: '0.95rem',
            fontWeight: 600,
            textAlign: 'center'
          }}>
            {uiStatus.text}
          </div>
        )}

        <div style={{ marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--card-border)' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.25rem' }}>{user.name || user.email}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>{showSensitive ? user.email : maskEmail(user.email)}</span>
            <button
              type="button"
              onClick={() => setShowSensitive(s => !s)}
              aria-label={showSensitive ? 'Hide email' : 'Show email'}
              style={{
                fontSize: '0.8rem',
                padding: '0.2rem 0.5rem',
                borderRadius: '6px',
                border: '1px solid var(--card-border)',
                background: 'rgba(255,255,255,0.04)',
                color: 'var(--text-color)',
                cursor: 'pointer'
              }}
            >
              {showSensitive ? 'Hide' : 'Show'}
            </button>
          </div>
          {user.school && <div style={{ marginTop: '0.75rem', padding: '0.5rem', background: 'rgba(var(--accent-rgb), 0.08)', borderRadius: '6px', fontSize: '0.95rem' }}>School: <strong>{user.school.name}</strong></div>}
          
          {/* Subscription Info */}
          {user.subscriptions && user.subscriptions.length > 0 && (
            <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(var(--accent-rgb), 0.12)', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem', color: 'var(--accent-color)' }}>Subscription</div>
              {(() => {
                const sub = user.subscriptions[0];
                const planName = sub.plan === 'career' ? 'Career Only' : sub.plan === 'full' ? 'Full Access' : sub.plan;
                const price = sub.priceMonthly ? `$${sub.priceMonthly}/month` : '';
                const statusText = sub.status === 'trialing' ? 'Free Trial' : sub.status === 'active' ? 'Active' : sub.status;
                const trialEnd = sub.trialEndsAt ? new Date(sub.trialEndsAt) : null;
                const now = new Date();
                const isTrialing = sub.status === 'trialing' && trialEnd && trialEnd > now;
                
                return (
                  <>
                    <div style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>{planName} {price && `• ${price}`}</div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Status: <strong>{statusText}</strong></div>
                    {isTrialing && trialEnd && (
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        Trial ends: {trialEnd.toLocaleDateString()}
                      </div>
                    )}
                    {sub.plan === 'career' && (
                      <Link href="/subscription/plans" style={{ display: 'inline-block', marginTop: '0.5rem', padding: '0.4rem 0.75rem', background: 'var(--accent-color)', color: 'white', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none' }}>
                        Upgrade to Full Access
                      </Link>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>

        <div className={styles.formGroup}>
          <label>Theme</label>
          <select value={theme || 'dark'} onChange={(e) => setTheme(e.target.value)} style={{ width: '100%', padding: '0.65rem 0.75rem', border: '1px solid var(--input-border)', borderRadius: '6px', background: 'var(--input-bg)', color: 'var(--text-color)', fontSize: '1rem' }}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </div>

        <div className={styles.formGroup}>
          <label>Study Music</label>
          <select value={studyMusic} onChange={(e) => setStudyMusic(e.target.value)} style={{ width: '100%', padding: '0.65rem 0.75rem', border: '1px solid var(--input-border)', borderRadius: '6px', background: 'var(--input-bg)', color: 'var(--text-color)', fontSize: '1rem' }}>
            <option value="none">None</option>
            <option value="lofi">Lo-fi Beats</option>
            <option value="classical">Classical Focus</option>
            <option value="ambient">Ambient</option>
            <option value="rain">Rain & Thunder</option>
          </select>
        </div>

        <div className={styles.formGroup}>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>Study Mode</label>
          <button 
            onClick={() => setStudyMode(!studyMode)}
            style={{
              background: studyMode ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'rgba(255,255,255,0.06)',
              color: studyMode ? 'white' : 'var(--text-color)',
              border: studyMode ? 'none' : '1px solid var(--input-border)',
              padding: '0.75rem 1.5rem',
              borderRadius: '25px',
              fontSize: '1rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: studyMode ? '0 4px 15px rgba(102, 126, 234, 0.4)' : 'none',
              transition: 'all 0.3s ease',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem'
            }}
          >
            {studyMode ? '🌙 Study Mode ON' : '✨ Study Mode OFF'}
          </button>
          <small style={{ display: 'block', marginTop: '0.5rem', color: 'var(--text-muted)' }}>
            {studyMode ? 'Focus mode with fullscreen and music enabled' : 'Enable for immersive study experience'}
          </small>
        </div>

        <button className={styles.submitButton} onClick={saveAllSettings} style={{ marginBottom: '1rem' }}>💾 Save All Settings</button>

        <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--card-border)' }}>
          <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: 600 }}>Resume & Cover Letter Templates</h3>
          <p style={{ marginBottom: '1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Choose your preferred templates for generating resumes and cover letters.</p>
          
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
          
          <div className={styles.formGroup} style={{ marginTop: '1.5rem' }}>
            <label>Custom Format Instructions (Optional)</label>
            <small style={{ display: 'block', marginTop: '-0.25rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Add any additional formatting instructions for your documents.</small>
            <textarea value={formatTemplate} onChange={(e) => setFormatTemplate(e.target.value)} rows={4} placeholder="e.g. Two-column resume: left=contact, right=experience; compact font" style={{ width: '100%', padding: '0.65rem 0.75rem', border: '1px solid var(--input-border)', borderRadius: '6px', background: 'var(--input-bg)', color: 'var(--text-color)', fontSize: '1rem', fontFamily: 'inherit', resize: 'vertical' }}></textarea>
          </div>
          <button className={styles.submitButton} onClick={handleDone} style={{ marginTop: '0.5rem', marginBottom: '1rem', background: 'rgba(255,255,255,0.06)', color: 'var(--text-color)' }}>Done</button>
        </div>

        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--card-border)', textAlign: 'center' }}>
          <button onClick={handleLogout} className={styles.loginLink} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 600 }}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
