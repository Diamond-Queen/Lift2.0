import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import styles from '../styles/SignUp.module.css';
import { useEffect, useState, useRef } from 'react';
import { musicUrls } from '../lib/musicUrls';

export default function Dashboard() {
  const { status } = useSession();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [plan, setPlan] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [studyMode, setStudyMode] = useState(false);
  const [studyMusic, setStudyMusic] = useState('none');
  const [error, setError] = useState("");
  const audioRef = useRef(null);

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

    // Handle audio playback with fallback support
    if (studyMode && studyMusic !== 'none' && audioRef.current) {
      let usedFallback = false;
      
      const handleError = () => {
        if (!usedFallback) {
          console.warn('[Audio] Primary source failed, attempting fallback:', studyMusic);
          usedFallback = true;
          audioRef.current.src = musicUrls[studyMusic].fallback;
          audioRef.current.load();
          audioRef.current.play().catch((err) => {
            console.error('[Audio] Fallback also failed:', err.message);
            setError(`⚠ Unable to play ${studyMusic} music. Try another track.`);
          });
        } else {
          console.error('[Audio] Both primary and fallback failed:', studyMusic);
          setError(`⚠ Unable to load ${studyMusic} music. Check your connection.`);
        }
      };
      
      audioRef.current.onerror = handleError;
      audioRef.current.onabort = handleError;
      
      audioRef.current.play().catch((err) => {
        console.warn('[Audio] Play failed:', err.message);
        setError(`⚠ Unable to play ${studyMusic} music. Try another track.`);
      });
    } else if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onerror = null;
      audioRef.current.onabort = null;
    }

    if (studyMode) {
      const elem = document.documentElement;
      if (elem.requestFullscreen) {
        elem.requestFullscreen().catch(err => console.log('Fullscreen error:', err));
      } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
      } else if (elem.msRequestFullscreen) {
        elem.msRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(err => console.log('Exit fullscreen error:', err));
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
      <div className={styles.signupContainer}>
        <div className={styles.signupCard}>
          <h1 className={styles.pageTitle}>Dashboard</h1>
          <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</p>
        </div>
      </div>
    );
  }

  const musicUrls = {
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
      {/* Music Player - Hidden audio element */}
      {studyMode && studyMusic !== 'none' && (
        <audio
          ref={audioRef}
          src={musicUrls[studyMusic]?.primary}
          autoPlay
          loop
          style={{ display: 'none' }}
        />
      )}

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
              Upgrade to Full Access ($10/month)
            </Link>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Notes button: disabled for Career-only plan */}
          {plan === 'career' ? (
            <button disabled className={styles.submitButton} style={{ display: 'block', textAlign: 'center', padding: '1.25rem', opacity: 0.6, cursor: 'not-allowed' }}>
              Lift Notes
              <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', opacity: 0.9 }}>Requires Full Access ($10/month)</div>
            </button>
          ) : (
            <Link href="/notes" className={styles.submitButton} style={{ display: 'block', textAlign: 'center', textDecoration: 'none', padding: '1.25rem' }}>
              Lift Notes
              <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', opacity: 0.9 }}>Generate study notes from your materials</div>
            </Link>
          )}

          <Link href="/career" className={styles.submitButton} style={{ display: 'block', textAlign: 'center', textDecoration: 'none', padding: '1.25rem', background: 'linear-gradient(90deg, rgba(99, 102, 241, 1) 0%, rgba(139, 92, 246, 0.95) 100%)' }}>
            Lift Career
            <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', opacity: 0.9 }}>Build resumes and cover letters</div>
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem' }}>
            <Link href="/account" className={styles.loginLink}>
              Account Settings
            </Link>
            {plan === 'career' && (
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
