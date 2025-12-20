//bit.ly/LiftStudy

import { useEffect, useState, useCallback, useRef } from "react";
import { musicUrls, getAudioStreamUrl } from "../lib/musicUrls";
import Link from "next/link";
import styles from "../styles/Home.module.css";

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState(null);
  const [studyMode, setStudyMode] = useState(null);

  useEffect(() => {
    setMounted(true);
    // read persisted settings
    const t = localStorage.getItem("theme");
    const s = localStorage.getItem("studyMode");
    setTheme(t || "dark");
    setStudyMode(s === "true" || s === null);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("studyMode", studyMode ? "true" : "false");
    // expose study mode globally so CSS can react
    document.documentElement.setAttribute("data-studymode", studyMode ? "true" : "false");
  }, [studyMode]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  const handleThemeKeyDown = useCallback((e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleTheme();
    }
  }, [toggleTheme]);

  const toggleStudyMode = useCallback(() => {
    setStudyMode((s) => !s);
  }, []);

  const handleStudyKeyDown = useCallback((e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleStudyMode();
    }
  }, [toggleStudyMode]);

  // Audio reference for streaming study music
  const audioRef = useRef(null);
  const [musicEnabled, setMusicEnabled] = useState(null);
  const [studyMusic, setStudyMusic] = useState('none');
  
  useEffect(() => {
    try { setMusicEnabled(localStorage.getItem('studyMusic') !== 'false'); } catch (e) { setMusicEnabled(true); }
    // load preferred music type from server or localStorage
    (async () => {
      try {
        const res = await fetch('/api/user/preferences');
        if (res.ok) {
          const data = await res.json();
          const prefType = data?.preferences?.studyMusic;
          if (typeof prefType === 'string') setStudyMusic(prefType);
        } else {
          const localType = localStorage.getItem('studyMusicType');
          if (localType) setStudyMusic(localType);
        }
      } catch {
        const localType = localStorage.getItem('studyMusicType');
        if (localType) setStudyMusic(localType);
      }
    })();
  }, []);

  const startStudyMusic = async () => {
    if (!musicEnabled || !audioRef.current) return;
    try {
      const primaryUrl = musicUrls[studyMusic]?.primary;
      const fallbackUrl = musicUrls[studyMusic]?.fallback;
      
      let streamUrl = await getAudioStreamUrl(primaryUrl);
      if (!streamUrl && fallbackUrl) {
        streamUrl = await getAudioStreamUrl(fallbackUrl);
      }
      
      if (streamUrl && audioRef.current) {
        audioRef.current.src = streamUrl;
        audioRef.current.load();
        audioRef.current.play().catch((err) => {
          console.warn('[Audio] Play failed:', err.message);
        });
      }
    } catch (err) {
      console.warn('Could not start study audio', err);
    }
  };

  const stopStudyMusic = async () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
  };

  // react to studyMode changes
  useEffect(() => {
    if (studyMode && musicEnabled && studyMusic !== 'none') {
      startStudyMusic();
    } else {
      stopStudyMusic();
    }
    try { localStorage.setItem('studyMode', studyMode ? 'true' : 'false'); } catch(e){}
  }, [studyMode, musicEnabled, studyMusic]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => { stopStudyMusic(); };
  }, []);

  const toggleMusicEnabled = () => {
    setMusicEnabled((s) => { const v = !s; try { localStorage.setItem('studyMusic', v ? 'true' : 'false'); } catch(e){}; if (!v) stopStudyMusic(); else if (studyMode) startStudyMusic(); return v; });
  };

  return (
    <main className={styles.root} role="main">
      {studyMode && musicEnabled && studyMusic !== 'none' && (
        <audio
          ref={audioRef}
          autoPlay
          loop
          style={{ display: 'none' }}
          onError={() => {
            console.error('Audio playback failed');
          }}
        />
      )}
      {/* Shooting-stars overlay (pure CSS animation) */}
      <div className="shooting-stars" aria-hidden="true">
        <span className="shooting-star s1" />
        <span className="shooting-star s2" />
        <span className="shooting-star s3" />
        <span className="shooting-star s4" />
        <span className="shooting-star s5" />
        <span className="shooting-star s6" />
      </div>
      <div className={styles.hero}>
        {(studyMode && musicEnabled && studyMusic !== 'none') && (
          <div style={{ position: 'fixed', top: '12px', right: '12px', zIndex: 9999, padding: '0.4rem 0.75rem', borderRadius: '999px', background: 'rgba(0,0,0,0.4)', color: 'white', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.15)' }}>
            Now Playing: {String(studyMusic).toUpperCase()}
          </div>
        )}
        <div className={styles.heroContainer}>
          <div className={`${styles.heroCard} ${styles.fadeIn}`}>
            <div className={styles.titleWrap}>
              <h1 className={styles.title}>Lift</h1>
              <div className={styles.titleFlourish} aria-hidden="true" />
            </div>
            <p className={styles.subtitle}>Study smarter. Prepare faster.</p>

            <nav className={styles.actions} aria-label="Primary">
                {/* Keep landing simple: only Login before account creation */}
                <Link href="/login" className={`btn ${styles.primary}`}>
                  Login
                </Link>
            </nav>
          </div>

        </div>
      </div>
    </main>
  );
}
