//bit.ly/LiftStudy

import { useEffect, useState, useCallback, useRef } from "react";
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

  // WebAudio-based study music (start/stop on study mode). Lightweight, user-gesture-initiated.
  const audioCtxRef = useRef(null);
  const nodesRef = useRef(null);
  const [musicEnabled, setMusicEnabled] = useState(null);
  useEffect(() => {
    try { setMusicEnabled(localStorage.getItem('studyMusic') !== 'false'); } catch (e) { setMusicEnabled(true); }
  }, []);

  const startStudyMusic = async () => {
    if (!musicEnabled) return;
    if (audioCtxRef.current) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContext();
      // Some browsers require resume() after user gesture
      try { await ctx.resume(); } catch(e) {}
      audioCtxRef.current = ctx;

      const master = ctx.createGain();
      master.gain.value = 0.02; // very low volume
      master.connect(ctx.destination);

      // Two detuned oscillators for a warm, non-intrusive pad
      const o1 = ctx.createOscillator();
      o1.type = 'sine';
      o1.frequency.value = 220; // A3
      const o2 = ctx.createOscillator();
      o2.type = 'sine';
      o2.frequency.value = 223; // slight detune

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1200;

      o1.connect(filter);
      o2.connect(filter);
      filter.connect(master);

      // slow LFO to breathe the amplitude
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.08; // very slow
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.012;
      lfo.connect(lfoGain);
      lfoGain.connect(master.gain);

      o1.start();
      o2.start();
      lfo.start();

      nodesRef.current = { o1, o2, lfo, lfoGain, filter, master };
    } catch (err) {
      console.warn('Could not start study audio', err);
    }
  };

  const stopStudyMusic = async () => {
    if (!audioCtxRef.current) return;
    try {
      const ctx = audioCtxRef.current;
      const n = nodesRef.current || {};
      if (n.o1?.stop) n.o1.stop();
      if (n.o2?.stop) n.o2.stop();
      if (n.lfo?.stop) n.lfo.stop();
      try { n.o1?.disconnect(); n.o2?.disconnect(); n.lfo?.disconnect(); n.filter?.disconnect(); n.master?.disconnect(); } catch(e){}
      await ctx.close();
    } catch (err) {
      console.warn('Error stopping audio', err);
    } finally {
      audioCtxRef.current = null;
      nodesRef.current = null;
    }
  };

  // react to studyMode changes
  useEffect(() => {
    if (studyMode) {
      // user gesture (toggleStudyMode) should allow audio to start
      startStudyMusic();
    } else {
      stopStudyMusic();
    }
    try { localStorage.setItem('studyMode', studyMode ? 'true' : 'false'); } catch(e){}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyMode, musicEnabled]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => { stopStudyMusic(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMusicEnabled = () => {
    setMusicEnabled((s) => { const v = !s; try { localStorage.setItem('studyMusic', v ? 'true' : 'false'); } catch(e){}; if (!v) stopStudyMusic(); else if (studyMode) startStudyMusic(); return v; });
  };

  return (
    <main className={styles.root} role="main">
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
