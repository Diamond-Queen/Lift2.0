import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import styles from '../styles/SignUp.module.css';
import { useEffect, useState, useRef } from 'react';
import { musicUrls, getAudioStreamUrl } from '../lib/musicUrls';
import { useStudyMode } from '../lib/StudyModeContext';

export default function Dashboard() {
  const { status } = useSession();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [plan, setPlan] = useState(null);
  const [trialInfo, setTrialInfo] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [denyReason, setDenyReason] = useState('');
  const { studyMode, setStudyMode, studyMusic, setStudyMusic } = useStudyMode();
  const [error, setError] = useState("");
  const audioRef = useRef(null);
  const iframeRef = useRef(null);

  // Fetch user preferences for study mode and music (populate global context)
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
  }, [setStudyMode, setStudyMusic]);

  // Enter/exit fullscreen based on studyMode and handle music playback
  useEffect(() => {
    document.documentElement.dataset.study = studyMode ? 'on' : 'off';

    const setupAudio = async () => {
      // Play music whenever a track is selected and music preference enabled — independent of fullscreen/studyMode
      if (studyMusic && studyMusic !== 'none' && audioRef.current) {
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
        try { audioRef.current.pause(); audioRef.current.src = ''; } catch(e){}
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
          // OPTIMIZATION: Fetch user and trial data in parallel instead of sequentially
          const [userRes, trialRes] = await Promise.all([
            fetch('/api/user'),
            fetch('/api/beta/status')
          ]);
          
          // Process user data
          if (userRes.ok) {
            const data = await userRes.json();
            const u = data?.data?.user;
            setUser(u);
            const p = u?.preferences?.subscriptionPlan || null;
            setPlan(p);
            
            // Check if user is onboarded - if not, redirect to onboarding
            if (!u?.onboarded) {
              router.push('/onboarding');
              return;
            }
          }
          
          // Process trial data
          if (trialRes.ok) {
            const trialData = await trialRes.json();
            const trial = trialData?.data?.trial;
            setTrialInfo(trial);
            
            // Check trial/subscription access
            if (trial?.status === 'expired') {
              setAccessDenied(true);
              setDenyReason('trial-expired');
              return;
            }
          } else if (trialRes.status === 401) {
            // Not in beta program
            const subRes = await fetch('/api/user');
            if (subRes.ok) {
              const userData = await subRes.json();
              const hasPaidSub = userData?.data?.user?.preferences?.subscriptionPlan;
              if (!hasPaidSub) {
                setAccessDenied(true);
                setDenyReason('not-enrolled');
                return;
              }
            }
          }
        } catch (err) {
          console.error('Failed to fetch dashboard data:', err);
        }
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

  // Check if access is denied
  if (accessDenied) {
    if (denyReason === 'trial-expired') {
      return (
        <div className={styles.signupContainer}>
          <div className={styles.signupCard} style={{ maxWidth: '500px' }}>
            <h1 className={styles.pageTitle}>Trial Period Ended</h1>
            <p style={{ 
              textAlign: 'center', 
              color: '#a78bfa',
              marginBottom: '20px',
              padding: '15px',
              borderRadius: '8px',
              border: '1px solid #a78bfa',
              backgroundColor: 'rgba(147, 51, 234, 0.1)'
            }}>
              ⏰ Your beta trial has ended. Subscribe to continue using Lift.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <Link href="/subscription/plans" className={styles.submitButton} style={{ textDecoration: 'none', display: 'block', textAlign: 'center' }}>
                View Subscription Plans
              </Link>
              <p style={{ textAlign: 'center', fontSize: '0.9em', color: 'var(--text-muted)' }}>
                We hope you enjoyed testing Lift! Subscribe to your preferred plan to keep using it.
              </p>
            </div>
          </div>
        </div>
      );
    } else if (denyReason === 'not-enrolled') {
      return (
        <div className={styles.signupContainer}>
          <div className={styles.signupCard} style={{ maxWidth: '500px' }}>
            <h1 className={styles.pageTitle}>Welcome to Lift</h1>
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '20px' }}>
              Choose how you'd like to get started
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <Link href="/onboarding/school" className={styles.submitButton} style={{ textDecoration: 'none', display: 'block', textAlign: 'center' }}>
                School Code
                <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', opacity: 0.9 }}>Get full access to Lift</div>
              </Link>
              <Link href="/onboarding/beta" className={styles.submitButton} style={{ 
                textDecoration: 'none', 
                display: 'block', 
                textAlign: 'center',
                background: 'rgba(147, 51, 234, 0.08)',
                border: '1px solid rgba(147, 51, 234, 0.25)',
                color: 'inherit'
              }}>
                Beta Program
                <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', opacity: 0.9 }}>Free trial: 3-4 days or 14 days</div>
              </Link>
              <Link href="/subscription/plans" className={styles.submitButton} style={{ 
                textDecoration: 'none', 
                display: 'block', 
                textAlign: 'center',
                background: 'linear-gradient(90deg, #000000 0%, #000000 100%)',
                border: '1px solid rgba(147, 51, 234, 0.3)',
                color: '#a78bfa'
              }}>
                Individual Subscription
                <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', opacity: 0.9 }}>3-day free trial • Flexible plans</div>
              </Link>
            </div>
          </div>
        </div>
      );
    }
  }

  if (loadingUser) {
    return (
      <>
        {/* Music Player - Hidden audio element */}
        {studyMusic && studyMusic !== 'none' && (
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
        {trialInfo && trialInfo.status === 'trial-active' && trialInfo.daysRemaining === 1 && (
          <div style={{
            textAlign: 'center',
            marginTop: '0.5rem',
            marginBottom: '1rem',
            padding: '0.9rem',
            borderRadius: '8px',
            border: '1px solid #ffae42',
            background: 'rgba(255, 174, 66, 0.06)',
            color: '#b35f00'
          }}>
            <div style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              ⚠️ One day left in your beta trial
            </div>
            <div style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>
              Subscribe now to keep using Lift without interruption.
            </div>
            <Link href="/subscription/plans" className={styles.loginLink} style={{ color: '#b35f00', textDecoration: 'underline', display: 'inline-block', marginTop: '0.25rem' }}>
              View Subscription Plans
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
            border: '2px solid #a78bfa',
            background: 'rgba(167, 139, 250, 0.1)',
            color: '#a78bfa'
          }}>
            <div style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              ⏰ Trial Expired
            </div>
            <div style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
              Your beta trial has ended. Subscribe now to continue using Lift.
            </div>
            <Link href="/subscription/plans" className={styles.loginLink} style={{ color: '#a78bfa', textDecoration: 'underline', display: 'inline-block', marginTop: '0.5rem' }}>
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
              Upgrade to Full Access ($10/month) or Notes Only ($7/month)
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
              Upgrade to Full Access ($10/month) or Career Only ($7/month)
            </Link>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Notes button: disabled for Career-only plan */}
          {plan === 'career' ? (
            <button disabled className={styles.submitButton} style={{ display: 'block', textAlign: 'center', padding: '1.25rem', opacity: 0.6, cursor: 'not-allowed' }}>
              Lift Notes
              <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', opacity: 0.9 }}>Requires Notes ($7/mo) or Full Access ($10/mo)</div>
            </button>
          ) : (
            <Link href="/notes" className={styles.submitButton} style={{ display: 'block', textAlign: 'center', textDecoration: 'none', padding: '1.25rem' }}>
              Lift Notes
              <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', opacity: 0.9 }}>Generate study notes from your materials</div>
            </Link>
          )}

          {/* Career button: disabled for Notes-only plan */}
          {plan === 'notes' ? (
            <button disabled className={styles.submitButton} style={{ display: 'block', textAlign: 'center', padding: '1.25rem', opacity: 0.6, cursor: 'not-allowed', background: 'linear-gradient(90deg, #000000 0%, #000000 100%)', border: '1px solid rgba(147, 51, 234, 0.2)' }}>
              Lift Career
              <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', opacity: 0.9 }}>Requires Career ($7/mo) or Full Access ($10/mo)</div>
            </button>
          ) : (
            <Link href="/career" className={styles.submitButton} style={{ display: 'block', textAlign: 'center', textDecoration: 'none', padding: '1.25rem', background: 'linear-gradient(90deg, #000000 0%, #000000 100%)', color: '#a78bfa', border: '1px solid rgba(167, 139, 250, 0.5)' }}>
              Lift Career
              <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', opacity: 0.9 }}>Build resumes and cover letters</div>
            </Link>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <Link href="/account" className={styles.loginLink}>
              Account Settings
            </Link>
            {(plan === 'career' || plan === 'notes') && (
              <Link href="/subscription/plans" className={styles.loginLink}>
                Upgrade Plan
              </Link>
            )}
            {plan && (plan === 'career' || plan === 'notes' || plan === 'full') && (
              <Link href="/account?tab=subscription" className={styles.loginLink} style={{ color: '#dc2626' }}>
                Cancel Subscription
              </Link>
            )}
          </div>
        </div>
      </div>
      </div>
    </>
  );
}

export async function getServerSideProps(context) {
  const { req, res } = context;
  let session = null;
  try {
    const { getServerSession } = await import('next-auth/next');
    // lazy-require to avoid potential circular imports
    const { authOptions } = require('../lib/authOptions');
    session = await getServerSession(req, res, authOptions);
  } catch (e) {
    // ignore - handled below
  }

  if (!session || !session.user?.email) {
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    };
  }

  const prisma = require('../lib/prisma');
  try {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 }, betaTester: true },
    });

    if (!user) {
      return { redirect: { destination: '/signup', permanent: false } };
    }

    if (!user.onboarded) {
      return { redirect: { destination: '/onboarding', permanent: false } };
    }

    const hasSubscription = Boolean(
      (user.subscriptions && user.subscriptions.length > 0 && ['active', 'trialing'].includes(user.subscriptions[0].status)) ||
        (user.preferences && user.preferences.subscriptionPlan)
    );

    const beta = user.betaTester;
    const betaActive = Boolean(beta && beta.status === 'active' && new Date(beta.trialEndsAt) > new Date());

    if (!hasSubscription && !betaActive) {
      return { redirect: { destination: '/subscription/plans', permanent: false } };
    }

    return { props: {} };
  } catch (err) {
    return { props: {} };
  }
}
