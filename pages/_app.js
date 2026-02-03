import '../styles/globals.css'
import '../styles/theme.css'
import Head from 'next/head'
import Link from 'next/link'
import Image from 'next/image'
import { SessionProvider, useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { StudyModeProvider } from '../lib/StudyModeContext'
import ShootingStars from '../components/ShootingStars'
import SiteHeader from '../components/SiteHeader'
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts'

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const [keyboardShortcutsEnabled, setKeyboardShortcutsEnabled] = useState(true);
  
  // Initialize keyboard shortcuts
  useKeyboardShortcuts(keyboardShortcutsEnabled);

  // Load user preferences on mount (theme, font size, accent color, shortcuts, study mode)
  useEffect(() => {
    async function loadPreferences() {
      // Try localStorage first for instant load
      const cachedTheme = localStorage.getItem('theme') || 'dark';
      const cachedFontSize = localStorage.getItem('fontSize') || 'medium';
      const cachedAccentColor = localStorage.getItem('accentColor') || '#d4af37';
      const cachedShortcuts = localStorage.getItem('keyboardShortcuts') !== 'false';
      const cachedStudyMode = localStorage.getItem('studyMode') === 'true';
      
      // Apply cached values immediately for instant load
      document.documentElement.setAttribute('data-theme', cachedTheme);
      document.documentElement.setAttribute('data-font-size', cachedFontSize);
      document.documentElement.style.setProperty('--accent-color', cachedAccentColor);
      document.documentElement.dataset.study = cachedStudyMode ? 'on' : 'off';
      setKeyboardShortcutsEnabled(cachedShortcuts);
      
      // Then fetch from API in background to sync (non-blocking)
      try {
        const res = await fetch('/api/user/preferences');
        if (res.ok) {
          const data = await res.json();
          const prefs = data.data?.preferences || {};
          
          const theme = prefs.theme || cachedTheme;
          const fontSize = prefs.fontSize || cachedFontSize;
          const accentColor = prefs.accentColor || cachedAccentColor;
          const shortcutsEnabled = prefs.keyboardShortcuts !== false;
          const studyMode = typeof prefs.studyMode === 'boolean' ? prefs.studyMode : cachedStudyMode;
          
          if (theme !== cachedTheme) document.documentElement.setAttribute('data-theme', theme);
          if (fontSize !== cachedFontSize) document.documentElement.setAttribute('data-font-size', fontSize);
          if (accentColor !== cachedAccentColor) document.documentElement.style.setProperty('--accent-color', accentColor);
          if (studyMode !== cachedStudyMode) document.documentElement.dataset.study = studyMode ? 'on' : 'off';
          if (shortcutsEnabled !== cachedShortcuts) setKeyboardShortcutsEnabled(shortcutsEnabled);
          
          // Update localStorage only if changed
          localStorage.setItem('theme', theme);
          localStorage.setItem('fontSize', fontSize);
          localStorage.setItem('accentColor', accentColor);
          localStorage.setItem('keyboardShortcuts', String(shortcutsEnabled));
          localStorage.setItem('studyMode', String(studyMode));
        }
      } catch (err) {
        // Already using cached values, no action needed
      }
    }
    loadPreferences();
  }, []);

  // Reset study override on route changes; study pages will re-enable explicitly if studyMode is on
  useEffect(() => {
    const handleRouteStart = () => {
      try { 
        const studyModeEnabled = localStorage.getItem('studyMode') === 'true';
        document.documentElement.dataset.study = studyModeEnabled ? 'on' : 'off'; 
      } catch(e) {}
    };
    router.events.on('routeChangeStart', handleRouteStart);
    return () => {
      router.events.off('routeChangeStart', handleRouteStart);
    };
  }, [router]);

  return (
    <StudyModeProvider>
      <>
        <Head>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes" />
          <meta name="theme-color" content="#0b0b0b" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        </Head>
        <SessionProvider session={pageProps.session}>
          {/* Global shooting stars overlay */}
          <ShootingStars />
          {/* Top header with logo */}
          <SiteHeader />
          {/* Global Home button (fixed) - route based on auth state */}
          <HomeFab />
          {/* Trial expiration check */}
          <TrialExpirationCheck />
          <Component {...pageProps} />
        </SessionProvider>
      </>
    </StudyModeProvider>
  )
}

function HomeFab() {
  const { status } = useSession();
  const router = useRouter();
  const handleClick = (e) => {
    e.preventDefault();
    if (status === 'authenticated') {
      router.push('/dashboard');
    } else {
      router.push('/login');
    }
  };
  return (
    <a href="#" className="homeFab" aria-label="Home" onClick={handleClick}>
      <Image src="/logo.png" alt="Home" width={48} height={48} style={{ display: 'block', objectFit: 'cover', borderRadius: '50%' }} />
    </a>
  );
}

function TrialExpirationCheck() {
  const { status } = useSession();
  const router = useRouter();
  const [showExpiredModal, setShowExpiredModal] = useState(false);
  const [banner, setBanner] = useState(null);

  useEffect(() => {
    if (status !== 'authenticated') return;

    const checkTrialStatus = async () => {
      try {
        // Check user subscriptions for trial timing
        const [userRes, betaRes] = await Promise.allSettled([
          fetch('/api/user'),
          fetch('/api/beta/status')
        ]);

        let dismissed = false;
        try { dismissed = localStorage.getItem('trialBannerDismissed') === 'true'; } catch(e) {}

        if (userRes.status === 'fulfilled' && userRes.value.ok) {
          const data = await userRes.value.json();
          const user = data?.data?.user;
          if (user?.subscriptions && user.subscriptions.length > 0) {
            const sub = user.subscriptions[0];
            if (sub.trialEndsAt) {
              const trialEndTime = new Date(sub.trialEndsAt).getTime();
              const nowTime = Date.now();
              const msLeft = trialEndTime - nowTime;
              const hoursLeft = Math.round(msLeft / (1000 * 60 * 60));
              if (msLeft <= 0) {
                setShowExpiredModal(true);
                if (!dismissed) setBanner({ type: 'expired', text: 'Your free trial has ended.' });
                return;
              } else if (msLeft <= 48 * 60 * 60 * 1000) {
                if (!dismissed) setBanner({ type: 'ending', text: `Your trial ends in ~${hoursLeft} hours.` });
              }
            }
          }
        }

        // Check beta status separately
        if (betaRes.status === 'fulfilled' && betaRes.value.ok) {
          const data = await betaRes.value.json();
          const trial = data?.data?.trial;
          if (trial) {
            if (trial.status === 'trial-expired') {
              setShowExpiredModal(true);
              if (!dismissed) setBanner({ type: 'beta-expired', text: 'Your beta trial has ended.' });
              return;
            }
            if (trial.status === 'trial-active' && trial.endsAt) {
              const trialEndTime = new Date(trial.endsAt).getTime();
              const msLeft = trialEndTime - Date.now();
              const hoursLeft = Math.round(msLeft / (1000 * 60 * 60));
              if (msLeft <= 48 * 60 * 60 * 1000 && msLeft > 0 && !dismissed) {
                setBanner({ type: 'ending', text: `Your beta trial ends in ~${hoursLeft} hours.` });
              }
            }
          }
        }
      } catch (err) {
        console.error('Error checking trial status:', err);
      }
    };

    checkTrialStatus();
  }, [status]);

  if (banner) {
    return (
      <div style={{ position: 'fixed', top: 64, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999 }}>
        <div style={{ width: '100%', maxWidth: '960px', margin: '0.5rem', background: '#fff6f0', border: '1px solid #ffd8b5', padding: '0.75rem 1rem', borderRadius: '8px', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ flex: 1, color: '#5b3b00' }}>
            <strong style={{ display: 'block', fontSize: '0.98rem' }}>{banner.type === 'ending' ? 'Trial Ending Soon' : 'Trial Expired'}</strong>
            <div style={{ fontSize: '0.9rem', color: '#6b4a00' }}>{banner.text} We recommend upgrading or choosing another access option.</div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => router.push('/subscription/plans')} style={{ padding: '0.5rem 0.9rem', background: '#8b7500', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>View Plans</button>
            <button onClick={() => router.push('/onboarding')} style={{ padding: '0.5rem 0.9rem', background: '#fff', color: '#8b7500', border: '1px solid #8b7500', borderRadius: '6px', cursor: 'pointer' }}>Choose Another Option</button>
            <button onClick={() => { try { localStorage.setItem('trialBannerDismissed', 'true'); } catch(e){} setBanner(null); }} style={{ padding: '0.4rem 0.6rem', background: 'transparent', border: 'none', cursor: 'pointer', color: '#6b4a00' }}>✕</button>
          </div>
        </div>
      </div>
    );
  }

  if (!showExpiredModal) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', zIndex: 99999 }}>
      <div style={{ background: '#fff', padding: '2rem', borderRadius: '12px', maxWidth: '400px', textAlign: 'center', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '1rem', color: '#000' }}>Trial Expired</h2>
        <p style={{ color: '#666', marginBottom: '2rem', lineHeight: '1.6' }}>Your trial period has ended. Upgrade your account to continue using Lift.</p>
        <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column' }}>
          <button
            onClick={() => router.push('/subscription/plans')}
            style={{ padding: '0.8rem 1.5rem', background: '#8b7500', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.95rem', fontWeight: '600', cursor: 'pointer' }}
          >
            Upgrade Plan
          </button>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            style={{ padding: '0.8rem 1.5rem', background: '#fff', color: '#8b7500', border: '2px solid #8b7500', borderRadius: '6px', fontSize: '0.95rem', fontWeight: '600', cursor: 'pointer' }}
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
