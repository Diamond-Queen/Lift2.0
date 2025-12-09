import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/router";
import { useSession } from 'next-auth/react';
import styles from "../styles/Career.module.css";

export default function Career() {
  const { status } = useSession();
  const router = useRouter();
  
  // State declarations must come before useEffect
  const [type, setType] = useState("resume");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [studyMode, setStudyMode] = useState(false);
  const [studyMusic, setStudyMusic] = useState('none');
  const [musicLoaded, setMusicLoaded] = useState(false);

  // Common fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Resume-specific
  const [address, setAddress] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [objective, setObjective] = useState("");
  const [experience, setExperience] = useState("");
  const [education, setEducation] = useState("");
  const [skills, setSkills] = useState("");
  const [certifications, setCertifications] = useState("");

  // Cover letter-specific
  const [recipient, setRecipient] = useState("");
  const [position, setPosition] = useState("");
  const [paragraphs, setParagraphs] = useState("");

  const [result, setResult] = useState(null);

  // Fetch user preferences on mount and poll for changes
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
    const interval = setInterval(fetchPreferences, 2000);
    
    return () => clearInterval(interval);
  }, []);

  // Handle study music
  useEffect(() => {
    if (studyMusic !== 'none' && studyMode) {
      setMusicLoaded(true);
    } else {
      setMusicLoaded(false);
    }
  }, [studyMusic, studyMode]);

  // Enter/exit fullscreen based on studyMode
  useEffect(() => {
    // Reflect study mode globally for CSS overrides
    document.documentElement.dataset.study = studyMode ? 'on' : 'off';

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
  }, [studyMode]);

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
            const user = data?.data?.user;
            if (user && !user.onboarded) {
              router.replace('/onboarding');
            }
          }
        } catch (e) {
          // ignore
        }
      })();
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p>Checking authentication...</p>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return null;
  }

  // Helper to safely render values that may be strings or objects from the AI
  const asText = (v) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number") return String(v);
    if (Array.isArray(v)) return v.map(asText).filter(Boolean).join(", ");
    if (typeof v === "object") {
      // common keys the AI might use. If a candidate value is itself an object, recurse.
      const preferred = ["name", "title", "degree", "qualification", "school", "institution", "college", "company", "employer", "dates", "date", "period", "details", "description"];
      for (const key of preferred) {
        if (v[key] !== undefined && v[key] !== null && v[key] !== "") return asText(v[key]);
      }
      // If object has one key, unwrap it
      const entries = Object.entries(v || {});
      if (entries.length === 1) return asText(entries[0][1]);
      const vals = entries.map(([k, val]) => asText(val)).filter(Boolean);
      if (vals.length) return vals.join(" — ");
      try { return JSON.stringify(v); } catch (e) { return String(v); }
    }
    return String(v);
  };

  const handleGenerate = async () => {
    setError("");
    setResult(null);

    if (!name.trim() || !email.trim() || !phone.trim()) {
      setError("Name, email, and phone are required.");
      return;
    }

    setLoading(true);

    // Fetch user's format template preference
    let formatTemplate = '';
    try {
      const prefRes = await fetch('/api/user/preferences');
      if (prefRes.ok) {
        const prefData = await prefRes.json();
        formatTemplate = prefData?.data?.formatTemplate || '';
      }
    } catch (e) {
      // Ignore and proceed without format template
    }
    try {
      // parse textarea inputs for structured display — accept commas (preferred) or pipes
      const parsedExperience = (String(experience || "")).split("\n").map(l => l.trim()).filter(Boolean).map(line => {
        const parts = line.split(/\s*\|\s*|\s*,\s*/).map(s => s?.trim() || "");
        const [title, company, dates, details] = parts;
        return { title: title || "", company: company || "", dates: dates || "", details: details || "" };
      }).filter(e => e.title || e.company);

      const parsedEducation = (String(education || "")).split("\n").map(l => l.trim()).filter(Boolean).map(line => {
        const parts = line.split(/\s*\|\s*|\s*,\s*/).map(s => s?.trim() || "");
        const [degree, school, dates] = parts;
        return { degree: degree || "", school: school || "", dates: dates || "" };
      }).filter(e => e.degree || e.school || e.dates);

      const parsedSkills = skills.split(",").map(s => s.trim()).filter(Boolean);
      const parsedCerts = certifications.split(",").map(s => s.trim()).filter(Boolean);

      const bodyData = {
        type,
        name,
        email,
        phone,
        formatTemplate,
        ...(type === "resume" && {
          address,
          linkedin,
          objective,
          experience: parsedExperience,
          education: parsedEducation,
          skills: parsedSkills,
          certifications: parsedCerts
        }),
        ...(type === "cover" && { recipient, position, paragraphs })
      };

      const res = await fetch("/api/career", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData)
      });

      if (!res.ok) throw new Error("Network response not ok");
      const data = await res.json();
      setResult(data.result || {});
    } catch (err) {
      console.error(err);
      setError("Failed to generate. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = setter => e => setter(e.target.value);

  const musicUrls = {
    lofi: 'https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3',
    classical: 'https://cdn.pixabay.com/audio/2022/03/10/audio_4621b1a4d4.mp3',
    ambient: 'https://cdn.pixabay.com/audio/2022/03/15/audio_c610232532.mp3',
    rain: 'https://cdn.pixabay.com/audio/2022/03/12/audio_4a3bf2e471.mp3'
  };

  return (
    <>
      {/* Music Player - Hidden audio element */}
      {studyMode && studyMusic !== 'none' && (
        <audio
          src={musicUrls[studyMusic]}
          autoPlay
          loop
          style={{ display: 'none' }}
        />
      )}

      <div className={`${styles.container} ${studyMode ? styles.studyModeActive : ''}`}>
        <h1 className={styles.pageTitle}>Lift Career Generator</h1>

      <select className={styles.input} value={type} onChange={handleChange(setType)} disabled={loading}>
        <option value="resume">Resume</option>
        <option value="cover">Cover Letter</option>
      </select>

      {/* Common Fields */}
      <input type="text" placeholder="Full Name" className={styles.input} value={name} onChange={handleChange(setName)} disabled={loading} />
      <input type="email" placeholder="Email" className={styles.input} value={email} onChange={handleChange(setEmail)} disabled={loading} />
      <input type="text" placeholder="Phone" className={styles.input} value={phone} onChange={handleChange(setPhone)} disabled={loading} />

      {/* Resume Fields */}
      {type === "resume" && (
        <>
          <input type="text" placeholder="Address" className={styles.input} value={address} onChange={handleChange(setAddress)} disabled={loading} />
          <input type="text" placeholder="LinkedIn / Portfolio" className={styles.input} value={linkedin} onChange={handleChange(setLinkedin)} disabled={loading} />
          <textarea placeholder="Objective / Summary" className={styles.textarea} value={objective} onChange={handleChange(setObjective)} rows={3} disabled={loading} />
          <textarea placeholder="Experience (Title, Company, Dates, Details per line) — commas or '|' OK" className={styles.textarea} value={experience} onChange={handleChange(setExperience)} rows={4} disabled={loading} />
          <textarea placeholder="Education (Degree, School, Dates per line) — commas or '|' OK" className={styles.textarea} value={education} onChange={handleChange(setEducation)} rows={3} disabled={loading} />
          <textarea placeholder="Skills (comma separated)" className={styles.textarea} value={skills} onChange={handleChange(setSkills)} rows={2} disabled={loading} />
          <textarea placeholder="Certifications (comma separated)" className={styles.textarea} value={certifications} onChange={handleChange(setCertifications)} rows={2} disabled={loading} />
          <button
            className={`${styles.btnAction} ${styles.btnPurple} ${loading ? styles.loading : ""}`}
            onClick={handleGenerate}
            disabled={loading}
            aria-label="Generate resume or cover letter"
          >
            {loading ? "Generating…" : "Generate"}
          </button>
        </>
      )}

      {/* Cover Letter Fields */}
      {type === "cover" && (
        <>
          <input type="text" placeholder="Recipient Name/Company" className={styles.input} value={recipient} onChange={handleChange(setRecipient)} disabled={loading} />
          <input type="text" placeholder="Position Applying For" className={styles.input} value={position} onChange={handleChange(setPosition)} disabled={loading} />
          <textarea placeholder="Just one sentence: your experience, skills, and why you want this job" className={styles.textarea} value={paragraphs} onChange={handleChange(setParagraphs)} rows={6} disabled={loading} />
          <button
            className={`${styles.btnAction} ${styles.btnPurple} ${loading ? styles.loading : ""}`}
            onClick={handleGenerate}
            disabled={loading}
            aria-label="Generate cover letter"
          >
            {loading ? "Generating…" : "Generate"}
          </button>
        </>
      )}

      {/* Display Result */}
      {result && (
        <div className={styles.resultCard}>
          {type === "resume" && result.name && (
            <div className={styles.printableResume}>
              <h1>{result.name}</h1>
              <p className={styles.contact}>{result.email} | {result.phone}{result.address && ` | ${result.address}`}</p>
              {result.linkedin && <p>LinkedIn / Portfolio: {result.linkedin}</p>}
              {result.objective && <p><strong>Objective:</strong> {result.objective}</p>}

              {result.experience?.length > 0 && (
                <>
                  <h2>Experience</h2>
                  {result.experience.map((job, i) => {
                    const full = asText(job);
                    // If the API returned a single readable string for the job, print it as a single line
                    if (typeof job === 'string' || (full && !asText(job.title) && !asText(job.company) && !asText(job.dates) && !asText(job.details))) {
                      return (
                        <div key={i} className={styles.sectionItem}>
                          <div>{full}</div>
                        </div>
                      );
                    }
                    // Otherwise treat it as an object with fields
                    const title = asText(job.title);
                    const company = asText(job.company);
                    const dates = asText(job.dates);
                    const details = asText(job.details);
                    return (
                      <div key={i} className={styles.sectionItem}>
                        <strong>{title}</strong>{title && company ? ' — ' : ' '}{company}{dates ? ` (${dates})` : ''}
                        <p>{details}</p>
                      </div>
                    );
                  })}
                </>
              )}

              {result.education?.length > 0 && (
                <>
                  <h2>Education</h2>
                  {result.education.map((edu, i) => {
                    // Prefer a single readable string if possible (handles many nested shapes)
                    const full = asText(edu);
                    const degree = asText(edu.degree);
                    const school = asText(edu.school);
                    const dates = asText(edu.dates);
                    return (
                      <div key={i} className={styles.sectionItem}>
                        {full ? (
                          <div>{full}</div>
                        ) : (
                          <div><strong>{degree}</strong>{degree && school ? ' — ' : ' '}{school}{dates ? ` (${dates})` : ''}</div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}

              {result.skills?.length > 0 && (
                <>
                  <h2>Skills</h2>
                  <p>{result.skills.map(asText).filter(Boolean).join(", ")}</p>
                </>
              )}

              {result.certifications?.length > 0 && (
                <>
                  <h2>Certifications</h2>
                  <p>{result.certifications.map(asText).filter(Boolean).join(", ")}</p>
                </>
              )}
            </div>
          )}

        {type === "cover" && result && (
          <div className={styles.printableCover}>
            {/* === Letterhead === */}
            <div className={styles.letterhead}>
              <h1 className={styles.letterName}>{result.name || name}</h1>
              <div className={styles.contactRow}>
                {(result.email || email) && <span>{result.email || email}</span>}
                {(result.phone || phone) && <span>• {result.phone || phone}</span>}
                {(result.address || address) && <span>• {result.address || address}</span>}
              </div>
            </div>

            {/* === Letter Body === */}
            <div className={styles.letterBody}>
              <p className={styles.date}>{new Date().toLocaleDateString()}</p>

              {(result.recipient || recipient) && (
                <p className={styles.recipient}>{result.recipient || recipient}</p>
              )}

              <p>Dear {(result.recipient || recipient) || "Hiring Manager"},</p>

              {/* Always make paragraphs an array */}
              {result.paragraphs
                ? (Array.isArray(result.paragraphs) 
                    ? result.paragraphs 
                    : [result.paragraphs]
                  ).map((para, i) => <p key={i}>{para}</p>)
                : (paragraphs ? [paragraphs] : []).map((para, i) => <p key={i}>{para}</p>)
              }

              <p>Sincerely,</p>
              <p><strong>{result.name || name}</strong></p>
            </div>
          </div>
        )}




          <button className={styles.printBtn} onClick={() => {
            try {
              if (document.exitFullscreen) document.exitFullscreen().catch(()=>{});
            } catch(e) {}
            window.print();
          }}>
            Print {type === "resume" ? "Resume" : "Cover Letter"}
          </button>
        </div>
      )}
      </div>
    </>
  );
}
