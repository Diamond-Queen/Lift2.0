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
  const [accountType, setAccountType] = useState('');
  const [showTrialExpiredModal, setShowTrialExpiredModal] = useState(false);
  const [subscriptionWarning, setSubscriptionWarning] = useState('');

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
        
        // Determine account type and check subscription status
        if (userData?.betaTester) {
          setAccountType('Beta Tester');
          setSubscriptionWarning('Upgrade to a paid plan to keep access after your trial ends.');
        } else if (userData?.subscriptions && userData.subscriptions.length > 0) {
          const sub = userData.subscriptions[0];
          if (sub.status === 'trialing') {
            setAccountType('Beta Tester');
            // Check if trial has ended
            if (sub.trialEndsAt) {
              const trialEndTime = new Date(sub.trialEndsAt).getTime();
              const nowTime = new Date().getTime();
              if (nowTime > trialEndTime) {
                setShowTrialExpiredModal(true);
                return;
              }
              // Check if trial ends soon (within 3 days)
              const daysUntilEnd = (trialEndTime - nowTime) / (1000 * 60 * 60 * 24);
              if (daysUntilEnd <= 3 && daysUntilEnd > 0) {
                setSubscriptionWarning(`Your trial ends in ${Math.ceil(daysUntilEnd)} day${Math.ceil(daysUntilEnd) > 1 ? 's' : ''}. Upgrade now to keep your access.`);
              }
            }
          } else if (sub.status === 'active') {
            setAccountType(userData.schoolId ? 'School' : 'Individual');
          } else {
            setAccountType('Individual');
            setSubscriptionWarning('No active subscription. Upgrade to continue using Lift.');
          }
        } else {
          setAccountType(userData?.schoolId ? 'School' : 'Individual');
          setSubscriptionWarning('No active subscription. Upgrade to continue using Lift.');
        }
        
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
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#000', color: '#fff' }}>
        <p>Loading your account…</p>
      </div>
    );
  }

  // Trial expired modal
  if (showTrialExpiredModal) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', zIndex: 9999 }}>
        <div style={{ background: '#1a1a1a', padding: '2rem', borderRadius: '12px', maxWidth: '400px', textAlign: 'center', boxShadow: '0 10px 40px rgba(0,0,0,0.5)', border: '2px solid #8b7500' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '1rem', color: '#fff' }}>Your time has come to an end.</h2>
          <p style={{ color: '#aaa', marginBottom: '2rem', lineHeight: '1.6' }}>Your trial period has expired. Upgrade your account to continue using Lift.</p>
          <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column' }}>
            <Link href="/subscription/plans" style={{ padding: '0.8rem 1.5rem', background: '#8b7500', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.95rem', fontWeight: '600', cursor: 'pointer', textDecoration: 'none', textAlign: 'center', display: 'inline-block' }}>
              Upgrade Plan
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              style={{ padding: '0.8rem 1.5rem', background: '#1a1a1a', color: '#8b7500', border: '2px solid #8b7500', borderRadius: '6px', fontSize: '0.95rem', fontWeight: '600', cursor: 'pointer' }}
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#000' }}>
      {/* Content */}
      <div style={{ flex: 1, padding: '1rem 0.75rem' }}>
        <div style={{ maxWidth: '500px', margin: '0 auto', width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#fff', margin: 0 }}>Account</h1>
            <span style={{ fontSize: '0.9rem', fontWeight: '600', color: '#8b7500', background: 'rgba(139, 117, 0, 0.1)', padding: '0.4rem 0.8rem', borderRadius: '20px', border: '1px solid #8b7500' }}>{accountType}</span>
          </div>

          {/* Status Message */}
          {uiStatus.text && (
            <div style={{
              marginBottom: '1.5rem',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              background: uiStatus.type === 'success' ? 'rgba(139, 117, 0, 0.15)' : 'rgba(244, 67, 54, 0.15)',
              border: `2px solid ${uiStatus.type === 'success' ? '#8b7500' : '#f44336'}`,
              color: uiStatus.type === 'success' ? '#8b7500' : '#ff6b6b',
              fontSize: '0.9rem',
              fontWeight: '600',
              textAlign: 'center'
            }}>
              {uiStatus.text}
            </div>
          )}

          {/* Subscription Warning */}
          {subscriptionWarning && (
            <div style={{
              marginBottom: '1.5rem',
              padding: '1rem',
              borderRadius: '8px',
              background: 'rgba(255, 152, 0, 0.15)',
              border: '2px solid #ff9800',
              color: '#ffb74d',
              fontSize: '0.9rem',
              fontWeight: '600',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem'
            }}>
              <div>{subscriptionWarning}</div>
              <Link href="/subscription/plans" style={{ color: '#ffb74d', textDecoration: 'underline', fontWeight: '700' }}>
                View Plans
              </Link>
            </div>
          )}

          {/* Profile Section */}
          <div style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '2px solid #8b7500' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '0.6rem', color: '#fff' }}>Profile</h2>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontWeight: '600', marginBottom: '0.25rem', color: '#fff' }}>{user.name || user.email}</div>
              <div style={{ color: '#aaa', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>{showSensitive ? user.email : maskEmail(user.email)}</span>
                <button
                  type="button"
                  onClick={() => setShowSensitive(s => !s)}
                  style={{
                    fontSize: '0.8rem',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    border: '1px solid #8b7500',
                    background: '#1a1a1a',
                    color: '#8b7500',
                    cursor: 'pointer',
                    fontWeight: '600'
                  }}
                >
                  {showSensitive ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            {user.school && (
              <div style={{ padding: '0.6rem', background: 'rgba(139, 117, 0, 0.1)', border: '1px solid #8b7500', borderRadius: '6px', fontSize: '0.9rem', color: '#fff' }}>
                School: <strong>{user.school.name}</strong>
              </div>
            )}
          </div>

          {/* Subscription */}
          {user.subscriptions && user.subscriptions.length > 0 && (
            <div style={{ marginBottom: '2rem', paddingBottom: '2rem', borderBottom: '2px solid #8b7500' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '1rem', color: '#fff' }}>Subscription</h2>
              {(() => {
                const sub = user.subscriptions[0];
                const planName = sub.plan === 'career' ? 'Career Only' : sub.plan === 'full' ? 'Full Access' : sub.plan;
                const price = sub.priceMonthly ? `$${sub.priceMonthly}/month` : '';
                const statusText = sub.status === 'trialing' ? 'Free Trial' : sub.status === 'active' ? 'Active' : sub.status;
                const trialEnd = sub.trialEndsAt ? new Date(sub.trialEndsAt) : null;
                const now = new Date();
                const isTrialing = sub.status === 'trialing' && trialEnd && trialEnd > now;
                
                return (
                  <div style={{ padding: '1rem', background: 'rgba(139, 117, 0, 0.1)', border: '1px solid #8b7500', borderRadius: '6px' }}>
                    <div style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.5rem', color: '#fff' }}>
                      {planName} {price && `• ${price}`}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#aaa', marginBottom: '0.5rem' }}>
                      Status: <strong style={{ color: '#8b7500' }}>{statusText}</strong>
                    </div>
                    {isTrialing && trialEnd && (
                      <div style={{ fontSize: '0.85rem', color: '#aaa' }}>
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
          <div style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '2px solid #8b7500' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '0.6rem', color: '#fff' }}>Appearance</h2>
            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.4rem', color: '#fff' }}>Theme</label>
            <select 
              value={theme || 'dark'} 
              onChange={(e) => setTheme(e.target.value)} 
              style={{ width: '100%', padding: '0.6rem', border: '2px solid #8b7500', borderRadius: '6px', background: '#1a1a1a', fontSize: '0.95rem', color: '#fff' }}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>

          {/* Study Music */}
          <div style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '2px solid #8b7500' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '0.6rem', color: '#fff' }}>Study Music</h2>
            <p style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '1rem' }}>
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
                    border: '2px solid #8b7500',
                    background: studyMusic === key ? '#8b7500' : '#1a1a1a',
                    color: studyMusic === key ? '#fff' : '#8b7500',
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
          <div style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '2px solid #8b7500' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '0.6rem', color: '#fff' }}>Templates</h2>
            <p style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '1.5rem' }}>Choose your preferred templates for resumes and cover letters.</p>
            
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
          <div style={{ marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '0.6rem', color: '#fff' }}>Custom Format (Optional)</h2>
            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.4rem', color: '#fff' }}>Instructions</label>
            <small style={{ display: 'block', marginBottom: '0.6rem', color: '#aaa', fontSize: '0.85rem' }}>Add any additional formatting instructions for your documents.</small>
            <textarea 
              value={formatTemplate} 
              onChange={(e) => setFormatTemplate(e.target.value)} 
              rows={3}
              placeholder="e.g. Two-column layout, compact font, etc."
              style={{ 
                width: '100%', 
                padding: '0.6rem', 
                border: '2px solid #8b7500', 
                borderRadius: '6px', 
                background: '#1a1a1a', 
                color: '#fff', 
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
      <div style={{ padding: '1rem', borderTop: '2px solid #8b7500', background: '#000', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
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
          
          <Link 
            href="/dashboard"
            style={{ 
              padding: '0.7rem 1.5rem', 
              background: '#1a1a1a', 
              color: '#fff', 
              border: '2px solid #fff', 
              borderRadius: '6px', 
              fontSize: '0.95rem', 
              fontWeight: '600',
              cursor: 'pointer',
              textDecoration: 'none',
              display: 'inline-block'
            }}
          >
            Done
          </Link>
          
          <button 
            onClick={handleLogout}
            style={{ 
              padding: '0.7rem 1.5rem', 
              background: '#1a1a1a', 
              color: '#8b7500', 
              border: '2px solid #8b7500', 
              borderRadius: '6px', 
              fontSize: '0.95rem', 
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Sign Out
          </button>
        </div>

        <div style={{ fontSize: '0.8rem', color: '#aaa', lineHeight: '1.6' }}>
          <div style={{ marginBottom: '0.5rem' }}>
            Questions? Email: <a href="mailto:williams.lift101@gmail.com" style={{ color: '#8b7500', textDecoration: 'none' }}>williams.lift101@gmail.com</a>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <Link href="/terms" style={{ color: '#8b7500', textDecoration: 'none' }}>Terms of Service</Link>
            <Link href="/privacy" style={{ color: '#8b7500', textDecoration: 'none' }}>Privacy Policy</Link>
          </div>
        </div>
      </div>

      <audio id="musicPreviewAudio" style={{ display: 'none' }} />
    </div>
  );
}
