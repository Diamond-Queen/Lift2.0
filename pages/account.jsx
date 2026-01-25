import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useSession, signOut } from 'next-auth/react';
import TemplatePicker from "../components/TemplatePicker";
import { musicUrls, getAudioStreamUrl } from "../lib/musicUrls";
import { useStudyMode } from "../lib/StudyModeContext";

export default function Account() {
    const { studyMode, setStudyMode, studyMusic, setStudyMusic } = useStudyMode();
  const { status } = useSession();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [uiStatus, setUiStatus] = useState({ type: null, text: '' });
  const [theme, setTheme] = useState(null);
  const [formatTemplate, setFormatTemplate] = useState('');
  const [resumeTemplate, setResumeTemplate] = useState('professional');
  const [coverLetterTemplate, setCoverLetterTemplate] = useState('formal');
  const [mounted, setMounted] = useState(false);
  const [showSensitive, setShowSensitive] = useState(false);
  const [accountType, setAccountType] = useState('');
  const [showTrialExpiredModal, setShowTrialExpiredModal] = useState(false);
  const [subscriptionWarning, setSubscriptionWarning] = useState('');
  const [summaryLength, setSummaryLength] = useState('medium');
  const [flashcardDifficulty, setFlashcardDifficulty] = useState('medium');
  const [subscription, setSubscription] = useState(null);
  const [cancelingSubscription, setCancelingSubscription] = useState(false);
  const [cancelingBeta, setCancelingBeta] = useState(false);

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

  // Apply study mode immediately when changed
  useEffect(() => {
    if (!mounted) return;
    document.documentElement.dataset.study = studyMode ? 'on' : 'off';
    localStorage.setItem('studyMode', String(studyMode));
  }, [studyMode, mounted]);

  // Apply study music immediately when changed
  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem('studyMusic', studyMusic || 'none');
  }, [studyMusic, mounted]);

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
          // Determine plan type
          const planType = sub.plan === 'career' ? 'Career Only' : 
                          sub.plan === 'notes' ? 'Notes Only' : 
                          sub.plan === 'full' ? 'Full Access' : 'Individual';
          
          if (sub.status === 'trialing') {
            // For paid subscriptions on trial, show the plan type with trial indicator
            setAccountType(`${planType} (Trial)`);
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
                setSubscriptionWarning(`Your ${planType} trial ends in ${Math.ceil(daysUntilEnd)} day${Math.ceil(daysUntilEnd) > 1 ? 's' : ''}. Your payment method will be charged after the trial.`);
              }
            }
          } else if (sub.status === 'active') {
            setAccountType(userData.schoolId ? 'School' : planType);
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
            if (pd.data?.preferences) {
              const prefs = pd.data.preferences;
              setTheme(prefs.theme || 'dark');
              if (prefs.studyMusic) setStudyMusic(prefs.studyMusic);
              setSummaryLength(prefs.summaryLength || 'medium');
              setFlashcardDifficulty(prefs.flashcardDifficulty || 'medium');
              setResumeTemplate(prefs.resumeTemplate || 'professional');
              setCoverLetterTemplate(prefs.coverLetterTemplate || 'formal');
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
            studyMode: studyMode || false,
            studyMusic: studyMusic || 'none',
            summaryLength: summaryLength || 'medium',
            flashcardDifficulty: flashcardDifficulty || 'medium',
            resumeTemplate: resumeTemplate || 'professional',
            coverLetterTemplate: coverLetterTemplate || 'formal',
          },
          formatTemplate,
        })
      });
      if (res.ok) {
        // Update localStorage after successful save
        localStorage.setItem('theme', theme || 'dark');
        localStorage.setItem('studyMode', String(studyMode || false));
        localStorage.setItem('studyMusic', studyMusic || 'none');
        
        setUiStatus({ type: 'success', text: 'Settings saved!' });
        setTimeout(() => setUiStatus({ type: null, text: '' }), 3000);
      } else {
        setUiStatus({ type: 'error', text: 'Failed to save' });
      }
    } catch (err) {
      setUiStatus({ type: 'error', text: 'Error saving settings' });
    }
  }

  const handleCancelSubscription = async () => {
    if (!window.confirm('Are you sure you want to cancel your subscription? You will lose access to premium features and your account will be permanently deleted.')) {
      return;
    }

    setCancelingSubscription(true);
    try {
      const res = await fetch('/api/subscription/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok) {
        setUiStatus({ type: 'success', text: '✅ Subscription canceled and account deleted' });
        // Sign out and redirect immediately
        signOut({ redirect: true, callbackUrl: '/login' });
      } else {
        console.error('Cancel subscription error:', data);
        setUiStatus({ type: 'error', text: `❌ ${data.error || 'Failed to cancel'}` });
        setCancelingSubscription(false);
      }
    } catch (err) {
      console.error('Cancel subscription exception:', err);
      setUiStatus({ type: 'error', text: '❌ Error canceling subscription' });
      setCancelingSubscription(false);
    }
  }

  const handleCancelBetaTrial = async () => {
    if (!window.confirm('Are you sure you want to cancel your beta trial? You will lose access to Lift.')) {
      return;
    }

    setCancelingBeta(true);
    try {
      const res = await fetch('/api/beta/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok) {
        setUiStatus({ type: 'success', text: '✅ Beta trial canceled. Signing out...' });
        // Sign out and redirect immediately
        signOut({ redirect: true, callbackUrl: '/login' });
      } else {
        console.error('Cancel beta trial error:', data);
        setUiStatus({ type: 'error', text: `❌ ${data.error || 'Failed to cancel'}` });
        setCancelingBeta(false);
      }
    } catch (err) {
      console.error('Cancel beta trial exception:', err);
      setUiStatus({ type: 'error', text: '❌ Error canceling beta trial' });
      setCancelingBeta(false);
    }
  }

  const handleUpgradeSubscription = async () => {
    try {
      await router.push('/subscription/plans');
    } catch (err) {
      setUiStatus({ type: 'error', text: '❌ Failed to navigate to upgrade page' });
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

          {/* Subscription Management - Active Paid Subscription */}
          {user?.subscriptions && user.subscriptions.length > 0 && (user.subscriptions[0].status === 'active' || user.subscriptions[0].status === 'trialing') && (
            <div style={{
              marginBottom: '1.5rem',
              padding: '1rem',
              borderRadius: '8px',
              background: 'rgba(147, 51, 234, 0.1)',
              border: '1px solid rgba(147, 51, 234, 0.3)',
              color: '#fff'
            }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: '700', marginBottom: '0.75rem', color: '#fff' }}>
                {user.subscriptions[0].status === 'trialing' ? 'Trial Subscription' : 'Active Subscription'}
              </h3>
              <div style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                <p style={{ margin: '0.25rem 0', color: '#aaa' }}>
                  Plan: <span style={{ color: '#9333EA', fontWeight: '600' }}>{user.subscriptions[0].plan.charAt(0).toUpperCase() + user.subscriptions[0].plan.slice(1)}</span>
                </p>
                {user.subscriptions[0].status === 'trialing' && user.subscriptions[0].trialEndsAt && (
                  <p style={{ margin: '0.25rem 0', color: '#aaa' }}>
                    Trial ends: <span style={{ color: '#9333EA', fontWeight: '600' }}>{new Date(user.subscriptions[0].trialEndsAt).toLocaleDateString()}</span>
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {user.subscriptions[0].plan !== 'full' && (
                  <button
                    onClick={handleUpgradeSubscription}
                    disabled={cancelingSubscription}
                    style={{
                      padding: '0.6rem 1rem',
                      background: '#8b7500',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '0.9rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      opacity: cancelingSubscription ? 0.6 : 1,
                      transition: 'all 0.2s'
                    }}
                  >
                    Upgrade Plan
                  </button>
                )}
                <button
                  onClick={handleCancelSubscription}
                  disabled={cancelingSubscription}
                  style={{
                    padding: '0.6rem 1rem',
                    background: '#dc2626',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    fontWeight: '600',
                    cursor: cancelingSubscription ? 'not-allowed' : 'pointer',
                    opacity: cancelingSubscription ? 0.6 : 1,
                    transition: 'all 0.2s'
                  }}
                >
                  {cancelingSubscription ? 'Canceling...' : 'Cancel Subscription'}
                </button>
              </div>
            </div>
          )}

          {/* Beta Tester Management */}
          {user?.betaTester && (
            <div style={{
              marginBottom: '1.5rem',
              padding: '1rem',
              borderRadius: '8px',
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              color: '#fff'
            }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: '700', marginBottom: '0.75rem', color: '#fff' }}>Beta Tester</h3>
              <div style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                <p style={{ margin: '0.25rem 0', color: '#aaa' }}>
                  You are enrolled in the Lift beta program. Enjoy early access to new features!
                </p>
                {user.betaTrialEndsAt && (
                  <p style={{ margin: '0.25rem 0', color: '#aaa' }}>
                    Beta trial ends: <span style={{ color: '#3B82F6', fontWeight: '600' }}>{new Date(user.betaTrialEndsAt).toLocaleDateString()}</span>
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  onClick={handleUpgradeSubscription}
                  style={{
                    padding: '0.6rem 1rem',
                    background: '#8b7500',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  Upgrade to Paid Plan
                </button>
                <button
                  onClick={handleCancelBetaTrial}
                  disabled={cancelingBeta}
                  style={{
                    padding: '0.6rem 1rem',
                    background: '#dc2626',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    fontWeight: '600',
                    cursor: cancelingBeta ? 'not-allowed' : 'pointer',
                    opacity: cancelingBeta ? 0.6 : 1,
                    transition: 'all 0.2s'
                  }}
                >
                  {cancelingBeta ? 'Canceling...' : 'Cancel Trial'}
                </button>
              </div>
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
                    {(sub.status === 'active' || sub.status === 'trialing') && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <button
                          onClick={handleCancelSubscription}
                          disabled={cancelingSubscription}
                          style={{
                            padding: '0.5rem 1rem',
                            marginLeft: 0,
                            background: '#dc2626',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '0.9rem',
                            fontWeight: '600',
                            cursor: cancelingSubscription ? 'not-allowed' : 'pointer',
                            opacity: cancelingSubscription ? 0.6 : 1
                          }}
                        >
                          {cancelingSubscription ? 'Canceling...' : 'Cancel Subscription'}
                        </button>
                      </div>
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

          {/* Study Mode Toggle */}
          <div style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '2px solid #8b7500' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '0.3rem', color: '#fff' }}>Study Mode</h2>
                <p style={{ fontSize: '0.85rem', color: '#aaa', margin: 0 }}>Enable focus-friendly interface</p>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', position: 'relative' }}>
                <input 
                  type="checkbox" 
                  checked={studyMode}
                  onChange={(e) => setStudyMode(e.target.checked)}
                  style={{ display: 'none' }}
                />
                <div style={{
                  width: '50px',
                  height: '26px',
                  backgroundColor: studyMode ? '#8b7500' : '#444',
                  borderRadius: '13px',
                  padding: '2px',
                  transition: 'background-color 0.3s',
                  display: 'flex',
                  alignItems: 'center',
                  marginRight: '0.75rem'
                }}>
                  <div style={{
                    width: '22px',
                    height: '22px',
                    backgroundColor: '#fff',
                    borderRadius: '50%',
                    transition: 'transform 0.3s',
                    transform: studyMode ? 'translateX(24px)' : 'translateX(0)'
                  }} />
                </div>
                <span style={{ color: '#fff', fontWeight: '600', minWidth: '35px' }}>
                  {studyMode ? 'On' : 'Off'}
                </span>
              </label>
            </div>
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

          {/* Notes Preferences - Only for users with notes access */}
          {user?.subscriptions?.[0]?.plan !== 'career' || user?.betaTester ? (
          <div style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '2px solid #8b7500' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '0.6rem', color: '#fff' }}>Notes Preferences</h2>
            <p style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '1rem' }}>
              Customize how Lift generates summaries and flashcards for your notes.
            </p>
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: '#fff', fontSize: '0.9rem', fontWeight: '600' }}>
                Summary Length
              </label>
              <select
                value={summaryLength}
                onChange={(e) => setSummaryLength(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.7rem',
                  borderRadius: '8px',
                  border: '2px solid #8b7500',
                  background: '#1a1a1a',
                  color: '#fff',
                  fontSize: '0.9rem',
                  cursor: 'pointer'
                }}
              >
                <option value="short">Short - Quick overview</option>
                <option value="medium">Medium - Balanced detail</option>
                <option value="long">Long - Comprehensive explanation</option>
              </select>
            </div>

            {/* Only show flashcard difficulty for users with notes access (not career-only) */}
            {user?.subscriptions?.[0]?.plan !== 'career' && user?.betaTester && (
              <div style={{ marginBottom: '0' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#fff', fontSize: '0.9rem', fontWeight: '600' }}>
                  Flashcard Difficulty
                </label>
                <select
                  value={flashcardDifficulty}
                  onChange={(e) => setFlashcardDifficulty(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.7rem',
                    borderRadius: '8px',
                    border: '2px solid #8b7500',
                    background: '#1a1a1a',
                    color: '#fff',
                    fontSize: '0.9rem',
                    cursor: 'pointer'
                  }}
                >
                  <option value="easy">Easy - Basic concepts</option>
                  <option value="medium">Medium - Key understanding</option>
                  <option value="hard">Hard - Deep comprehension</option>
                </select>
              </div>
            )}
            
            {/* Show flashcard difficulty for non-career plans */}
            {user?.subscriptions?.[0]?.plan !== 'career' && !user?.betaTester && (
              <div style={{ marginBottom: '0' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#fff', fontSize: '0.9rem', fontWeight: '600' }}>
                  Flashcard Difficulty
                </label>
                <select
                  value={flashcardDifficulty}
                  onChange={(e) => setFlashcardDifficulty(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.7rem',
                    borderRadius: '8px',
                    border: '2px solid #8b7500',
                    background: '#1a1a1a',
                    color: '#fff',
                    fontSize: '0.9rem',
                    cursor: 'pointer'
                  }}
                >
                  <option value="easy">Easy - Basic concepts</option>
                  <option value="medium">Medium - Key understanding</option>
                  <option value="hard">Hard - Deep comprehension</option>
                </select>
              </div>
            )}
          </div>
          ) : null}

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
        {/* Status Message - Positioned above buttons */}
        {uiStatus.text && (
          <div style={{
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

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button 
            onClick={saveAllSettings}
            style={{ 
              padding: '0.7rem 1.5rem', 
              background: '#000000ff', 
              color: '#8b7500', 
              border: '1px solid #8b7500', 
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
              background: '#000000ff', 
              color: '#8b7500', 
              border: '2px solid #8b7500', 
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
              background: '#000000ff', 
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
