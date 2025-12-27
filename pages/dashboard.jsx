import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import styles from '../styles/SignUp.module.css';
import { useEffect, useState, useRef } from 'react';
import { musicUrls, getAudioStreamUrl } from '../lib/musicUrls';

export default function Dashboard() {
  const { status } = useSession();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [plan, setPlan] = useState(null);
  const [trialInfo, setTrialInfo] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [studyMode, setStudyMode] = useState(false);
  const [studyMusic, setStudyMusic] = useState('none');
  const [error, setError] = useState("");
  const audioRef = useRef(null);
  const iframeRef = useRef(null);

  // Fetch user preferences for study mode and music
  useEffect(() => {
    const fetchPreferences = async () => {
      try {
        const res = await fetch('/api/user/preferences');
        if (res.ok) {
          const data = await res.json();
          const prefs = data?.data?.preferences || {};
          if (typeof prefs.studyMode === 'boolean') setStudyMode(prefs.studyMode);
          if (typeof prefs.studyMusic === 'string') setStudyMusic(prefs.studyMusic);
        }
      } catch (err) {
        console.error('Failed to fetch preferences:', err);
      }
    };
    
    fetchPreferences();
  }, []);

  // Enter/exit fullscreen based on studyMode and handle music playback
  useEffect(() => {
    document.documentElement.dataset.study = studyMode ? 'on' : 'off';

    const setupAudio = async () => {
      if (studyMode && studyMusic !== 'none' && audioRef.current) {
        try {
          // Get stream URL from backend
          const primaryUrl = musicUrls[studyMusic]?.primary;
          const fallbackUrl = musicUrls[studyMusic]?.fallback;
          
          let streamUrl = await getAudioStreamUrl(primaryUrl);
          
          if (!streamUrl && fallbackUrl) {
            console.warn('[Audio] Primary URL failed, trying fallback');
            streamUrl = await getAudioStreamUrl(fallbackUrl);
          }
          
          if (streamUrl) {
            audioRef.current.src = streamUrl;
            audioRef.current.load();
            audioRef.current.play().catch((err) => {
              console.warn('[Audio] Play failed:', err.message);
              setError(`⚠ Unable to play ${studyMusic} music. Try another track.`);
            });
          } else {
            setError(`⚠ Unable to load ${studyMusic} music. Check your connection.`);
          }
        } catch (err) {
          console.error('[Audio] Setup error:', err);
          setError(`⚠ Failed to setup audio stream.`);
        }
      } else if (audioRef.current) {
        audioRef.current.pause();
      }
    };

    setupAudio();

    if (studyMode) {
      const elem = document.documentElement;
      if (elem.requestFullscreen) {
        elem.requestFullscreen().catch(() => {});
      } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
      } else if (elem.msRequestFullscreen) {
        elem.msRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
    }
  }, [studyMode, studyMusic]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
      return;
    }
    if (status === 'authenticated') {
      (async () => {
        try {
          const res = await fetch('/api/user');
          if (res.ok) {
            const data = await res.json();
            const u = data?.data?.user;
            setUser(u);
            const p = u?.preferences?.subscriptionPlan || null;
            setPlan(p);
          }

          // Fetch trial info
          try {
            const trialRes = await fetch('/api/beta/status');
            if (trialRes.ok) {
              const trialData = await trialRes.json();
              setTrialInfo(trialData?.data?.trial || null);
            }
          } catch (err) {
            console.error('Failed to fetch trial info:', err);
          }
        } catch (_) {}
        setLoadingUser(false);
      })();
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className={styles.signupContainer}>
        <div className={styles.signupCard}>
          <h1 className={styles.pageTitle}>Dashboard</h1>
          <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return null;
  }

  if (loadingUser) {
    return (
      <>
        {/* Music Player - Hidden audio element */}
        {studyMode && studyMusic !== 'none' && (
          <audio
            ref={audioRef}
            autoPlay
            loop
            style={{ display: 'none' }}
            onError={() => {
              setError(`⚠ Failed to load audio. Try another track.`);
            }}
          />
        )}
        <div className={styles.signupContainer}>
          <div className={styles.signupCard}>
            <h1 className={styles.pageTitle}>Dashboard</h1>
            <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</p>
          </div>
        </div>
      </>
    );
  }

  const musicUrls_temp = {
    lofi: {
      primary: 'https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3',
      fallback: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3'
    },
    classical: {
      primary: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
      fallback: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3'
    },
    ambient: {
      primary: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
      fallback: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3'
    },
    rain: {
      primary: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
      fallback: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'
    }
  };

  return (
    <>

      <div className={`${styles.signupContainer} ${studyMode ? styles.studyModeActive : ''}`}>
        {/* Shooting-stars overlay (pure CSS animation) */}
        <div className="shooting-stars" aria-hidden="true">
          <span className="shooting-star s1" />
          <span className="shooting-star s2" />
          <span className="shooting-star s3" />
          <span className="shooting-star s4" />
          <span className="shooting-star s5" />
          <span className="shooting-star s6" />
        </div>
        <div className={styles.signupCard}>
        <h1 className={styles.pageTitle}>Welcome to Lift</h1>
        {trialInfo && trialInfo.status === 'trial-active' && (
          <div style={{
            textAlign: 'center',
            marginTop: '-0.5rem',
            marginBottom: '1rem',
            padding: '1rem',
            borderRadius: '8px',
            border: '2px solid var(--accent)',
            background: 'rgba(var(--accent-rgb),0.1)',
            color: 'var(--accent)'
          }}>
            <div style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              🎉 Beta Trial Active
            </div>
            <div style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
              {trialInfo.trialType === 'school' 
                ? `School Trial: ${trialInfo.daysRemaining} days remaining` 
                : `Social Beta: ${trialInfo.daysRemaining} days remaining`}
            </div>
            <Link href="/subscription/plans" className={styles.loginLink} style={{ color: 'var(--accent)', textDecoration: 'underline', display: 'inline-block', marginTop: '0.5rem' }}>
              Upgrade to Paid Plan
            </Link>
          </div>
        )}
        {trialInfo && trialInfo.status === 'trial-expired' && (
          <div style={{
            textAlign: 'center',
            marginTop: '-0.5rem',
            marginBottom: '1rem',
            padding: '1rem',
            borderRadius: '8px',
            border: '2px solid #d97706',
            background: 'rgba(217, 119, 6, 0.1)',
            color: '#d97706'
          }}>
            <div style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              ⏰ Trial Expired
            </div>
            <div style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
              Your beta trial has ended. Subscribe now to continue using Lift.
            </div>
            <Link href="/subscription/plans" className={styles.loginLink} style={{ color: '#d97706', textDecoration: 'underline', display: 'inline-block', marginTop: '0.5rem' }}>
              View Subscription Plans
            </Link>
          </div>
        )}
        {plan && (
          <div style={{
            textAlign: 'center',
            marginTop: '-0.5rem',
            marginBottom: '1rem'
          }}>
            <span style={{
              fontSize: '0.9rem',
              padding: '0.35rem 0.75rem',
              borderRadius: '9999px',
              border: '1px solid var(--card-border)',
              background: 'rgba(var(--accent-rgb),0.10)',
              color: 'var(--accent)',
              display: 'inline-block'
            }}>
              {plan === 'career' ? 'Career Only' : 'Full Access'}
            </span>
          </div>
        )}
        <p style={{ textAlign: 'center', marginBottom: '0.75rem', color: 'var(--text-muted)' }}>
          Choose a tool to get started:
        </p>
        {plan === 'career' && (
          <div style={{
            textAlign: 'center',
            marginBottom: '1rem',
            padding: '0.75rem',
            borderRadius: '8px',
            border: '1px solid var(--card-border)',
            background: 'rgba(255,255,255,0.04)'
          }}>
            <div style={{ fontSize: '0.95rem' }}>
              Notes is part of Full Access. Upgrade to unlock.
            </div>
            <Link href="/subscription/plans" className={styles.loginLink} style={{ display: 'inline-block', marginTop: '0.5rem' }}>
              Upgrade to Full Access ($10/month) or Notes Only ($5/month)
            </Link>
          </div>
        )}
        {plan === 'notes' && (
          <div style={{
            textAlign: 'center',
            marginBottom: '1rem',
            padding: '0.75rem',
            borderRadius: '8px',
            border: '1px solid var(--card-border)',
            background: 'rgba(255,255,255,0.04)'
          }}>
            <div style={{ fontSize: '0.95rem' }}>
              Career is part of Full Access. Upgrade to unlock.
            </div>
            <Link href="/subscription/plans" className={styles.loginLink} style={{ display: 'inline-block', marginTop: '0.5rem' }}>
              Upgrade to Full Access ($10/month) or Career Only ($5/month)
            </Link>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Notes button: disabled for Career-only plan */}
          {plan === 'career' ? (
            <button disabled className={styles.submitButton} style={{ display: 'block', textAlign: 'center', padding: '1.25rem', opacity: 0.6, cursor: 'not-allowed' }}>
              Lift Notes
              <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', opacity: 0.9 }}>Requires Notes ($5/mo) or Full Access ($10/mo)</div>
            </button>
          ) : (
            <Link href="/notes" className={styles.submitButton} style={{ display: 'block', textAlign: 'center', textDecoration: 'none', padding: '1.25rem' }}>
              Lift Notes
              <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', opacity: 0.9 }}>Generate study notes from your materials</div>
            </Link>
          )}

          {/* Career button: disabled for Notes-only plan */}
          {plan === 'notes' ? (
            <button disabled className={styles.submitButton} style={{ display: 'block', textAlign: 'center', padding: '1.25rem', opacity: 0.6, cursor: 'not-allowed', background: 'linear-gradient(90deg, rgba(99, 102, 241, 0.5) 0%, rgba(139, 92, 246, 0.5) 100%)' }}>
              Lift Career
              <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', opacity: 0.9 }}>Requires Career ($5/mo) or Full Access ($10/mo)</div>
            </button>
          ) : (
            <Link href="/career" className={styles.submitButton} style={{ display: 'block', textAlign: 'center', textDecoration: 'none', padding: '1.25rem', background: 'linear-gradient(90deg, rgba(99, 102, 241, 1) 0%, rgba(139, 92, 246, 0.95) 100%)' }}>
              Lift Career
              <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', opacity: 0.9 }}>Build resumes and cover letters</div>
            </Link>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem' }}>
            <Link href="/account" className={styles.loginLink}>
              Account Settings
            </Link>
            {(plan === 'career' || plan === 'notes') && (
              <Link href="/subscription/plans" className={styles.loginLink}>
                Upgrade to Full Access
              </Link>
            )}
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
