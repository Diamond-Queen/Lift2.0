//bit.ly/LiftStudy

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import styles from "../styles/Home.module.css";

export default function Home() {
  const [theme, setTheme] = useState("dark");
  const [studyMode, setStudyMode] = useState(true);

  useEffect(() => {
    // read persisted settings
    const t = localStorage.getItem("theme");
    const s = localStorage.getItem("studyMode");
    if (t) setTheme(t);
    if (s) setStudyMode(s === "true");
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

  return (
    <main className={styles.root} role="main">
      <div className={styles.hero}>
        <div className={styles.heroContainer}>
          <div className={`${styles.heroCard} ${styles.fadeIn}`}>
            <div className={styles.titleWrap}>
              <h1 className={styles.title}>Lift</h1>
              <div className={styles.titleFlourish} aria-hidden="true" />
            </div>
            <p className={styles.subtitle}>Study smarter. Prepare faster.</p>

            <nav className={styles.actions} aria-label="Primary">
                {/* Note: Added styles.primary to enable the gold gradient */}
                <Link href="/notes" className={`${styles.btn} ${styles.primary}`}>
                  Lift Notes
                </Link>
                <Link href="/career" className={`${styles.btn} ${styles.accent}`}>
                  Lift Career
                </Link>
                <Link href="/login" className={`${styles.btn} ${styles.ghost}`}>
                  Login
                </Link>
            </nav>
          </div>

          <aside className={`${styles.heroCard} ${styles.toggles}`} aria-label="Preferences">
            <h3 className={styles.pageTitle || ''}>Preferences</h3>

            {/* DARK THEME TOGGLE - CUSTOM SWITCH MARKUP */}
            <div 
              className={`${styles.toggleRow}`}
              tabIndex={0}
              role="switch"
              onClick={toggleTheme}
              onKeyDown={handleThemeKeyDown}
              aria-checked={theme === 'dark'}
            > 
              <div className={styles.toggleLabel}>Dark theme</div>
              
              <label className={styles.switch} htmlFor="themeSwitch">
                <input
                  type="checkbox"
                  id="themeSwitch"
                  checked={theme === 'dark'}
                  onChange={toggleTheme}
                  aria-label="Toggle dark theme"
                />
                <span className={styles.slider} aria-hidden="true" />
              </label>
            </div>

            {/* STUDY MODE TOGGLE - CUSTOM SWITCH MARKUP */}
            <div 
              className={`${styles.toggleRow}`}
              tabIndex={0}
              role="switch"
              onClick={toggleStudyMode}
              onKeyDown={handleStudyKeyDown}
              aria-checked={studyMode}
            > 
              <div className={styles.toggleLabel}>Study mode</div>
              <label className={styles.switch} htmlFor="studySwitch">
                <input
                  type="checkbox"
                  id="studySwitch"
                  checked={studyMode}
                  onChange={toggleStudyMode}
                  aria-label="Toggle study mode"
                />
                <span className={styles.slider} aria-hidden="true" />
              </label>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
