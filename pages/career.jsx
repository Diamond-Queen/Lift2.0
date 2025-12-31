import { useState, useCallback, useEffect, useRef } from "react";
import { useStudyMode } from "../lib/StudyModeContext";
import { useRouter } from "next/router";
import { useSession } from 'next-auth/react';
import styles from "../styles/Career.module.css";
import { musicUrls, getAudioStreamUrl } from "../lib/musicUrls";

export default function Career() {
    const [sidebarOpen, setSidebarOpen] = useState(true);
  const { status } = useSession();
  const router = useRouter();
  
  // State declarations must come before useEffect
  const [type, setType] = useState("resume");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { studyMode, studyMusic } = useStudyMode();
  const [musicLoaded, setMusicLoaded] = useState(false);

  // Refs
  const audioRef = useRef(null);
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
  const [formatTemplate, setFormatTemplate] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("professional");

  // Job + Content persistence
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [savedItems, setSavedItems] = useState([]);
  const [newJobName, setNewJobName] = useState("");
  const [newJobColor, setNewJobColor] = useState("#8b7500");
  const [showJobForm, setShowJobForm] = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [editingJobId, setEditingJobId] = useState(null);
  const [editingJobName, setEditingJobName] = useState("");
  const [editingJobColor, setEditingJobColor] = useState("#8b7500");
  
  // Per-job generation results
  const [jobGenerations, setJobGenerations] = useState({});

  // Reset template when type changes
  useEffect(() => {
    if (type === "resume") {
      setSelectedTemplateId("professional");
      setFormatTemplate(`Professional Resume Format:
- Contact info at top (Name, Email, Phone, Address)
- Professional Summary: 2-3 sentences
- Experience: Job Title | Company | Dates on one line, bullet points for details
- Education: Degree, School (Year)
- Skills: Comma-separated list
- Certifications: List format`);
    } else {
      setSelectedTemplateId("formal");
      setFormatTemplate(`Formal Cover Letter:
[Your Name]
[Address]
[City, State ZIP]
[Email] | [Phone]

[Date]

[Recipient Name]
[Title]
[Company]
[Address]

Dear [Recipient],

[Opening paragraph: Express interest, mention position]
[Body paragraph: Highlight relevant skills and experience]
[Closing: Express enthusiasm, call to action]

Sincerely,
[Your Name]`);
    }
  }, [type]);

  // Fetch user preferences on mount only (removed slow polling)
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

    // Listen for localStorage changes (studyMode, studyMusic)
    const handleStorage = (e) => {
      if (e.key === 'studyMode') {
        setStudyMode(e.newValue === 'true');
      }
      if (e.key === 'studyMusic') {
        setStudyMusic(e.newValue || 'none');
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Fetch jobs on mount
  useEffect(() => {
    fetchJobs();
  }, []);

  // Helper functions for localStorage persistence per job
  const saveJobContentToStorage = (jobId, jobType, jobInput, jobResult) => {
    if (!jobId) return;
    const key = `job_${jobId}_${jobType}`;
    localStorage.setItem(key, JSON.stringify({
      type: jobType,
      input: jobInput,
      result: jobResult,
      timestamp: Date.now()
    }));
  };

  const clearJobContentFromStorage = (jobId, jobType) => {
    if (!jobId) return;
    const key = `job_${jobId}_${jobType}`;
    localStorage.removeItem(key);
  };

  // Auto-save job content to localStorage whenever input or result changes
  useEffect(() => {
    if (selectedJobId && type && (result || name || email || phone || (type === "resume" ? address || linkedin || objective || experience || education || skills || certifications : recipient || position || paragraphs))) {
      const jobInput = {
        type,
        name,
        email,
        phone,
        ...(type === "resume" && { address, linkedin, objective, experience, education, skills, certifications }),
        ...(type === "cover" && { recipient, position, paragraphs })
      };
      saveJobContentToStorage(selectedJobId, type, jobInput, result);
    }
  }, [selectedJobId, type, result, name, email, phone, address, linkedin, objective, experience, education, skills, certifications, recipient, position, paragraphs]);

  const fetchJobs = async () => {
    setLoadingJobs(true);
    try {
      const res = await fetch('/api/content/classes');
      if (res.ok) {
        const data = await res.json();
        setJobs(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    } finally {
      setLoadingJobs(false);
    }
  };

  const fetchSavedItems = async (jobId) => {
    try {
      const query = jobId ? `?classId=${jobId}&type=${type}` : `?type=${type}`;
      const res = await fetch(`/api/content/items${query}`);
      if (res.ok) {
        const data = await res.json();
        setSavedItems(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch saved items:', err);
    }
  };

  useEffect(() => {
    if (selectedJobId) {
      fetchSavedItems(selectedJobId);
      // Load previous generated content for this specific job from jobGenerations (in-memory) first
      if (jobGenerations[selectedJobId]) {
        setResult(jobGenerations[selectedJobId].result || null);
      } else {
        // Try to restore from localStorage for this job
        const key = `job_${selectedJobId}_${type}`;
        const stored = localStorage.getItem(key);
        if (stored) {
          try {
            const data = JSON.parse(stored);
            setName(data.input?.name || "");
            setEmail(data.input?.email || "");
            setPhone(data.input?.phone || "");
            
            if (data.input?.type === "resume") {
              setAddress(data.input?.address || "");
              setLinkedin(data.input?.linkedin || "");
              setObjective(data.input?.objective || "");
              setExperience(data.input?.experience || "");
              setEducation(data.input?.education || "");
              setSkills(data.input?.skills || "");
              setCertifications(data.input?.certifications || "");
            } else if (data.input?.type === "cover") {
              setRecipient(data.input?.recipient || "");
              setPosition(data.input?.position || "");
              setParagraphs(data.input?.paragraphs || "");
            }
            
            setResult(data.result || null);
            
            // Also update jobGenerations so it persists in memory
            setJobGenerations(prev => ({
              ...prev,
              [selectedJobId]: {
                result: data.result || null
              }
            }));
          } catch (e) {
            console.error('Failed to restore from localStorage:', e);
            setResult(null);
          }
        } else {
          setResult(null);
        }
      }
      setError("");
    }
  }, [selectedJobId, type]);

  const handleCreateJob = async () => {
    if (!newJobName.trim()) return;
    setLoadingJobs(true);
    try {
      const res = await fetch('/api/content/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newJobName, color: newJobColor })
      });
      if (res.ok) {
        const data = await res.json();
        setJobs([data.data, ...jobs]);
        setSelectedJobId(data.data.id);
        setNewJobName("");
        setNewJobColor("#8b7500");
        setShowJobForm(false);
        setError("✓ Job created!");
        setTimeout(() => setError(""), 2000);
      }
    } catch (err) {
      setError('Failed to create job');
    } finally {
      setLoadingJobs(false);
    }
  };

  const handleRenameJob = async (jobId) => {
    if (!editingJobName.trim()) return;
    setLoadingJobs(true);
    try {
      const res = await fetch('/api/content/classes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId: jobId, name: editingJobName, color: editingJobColor })
      });
      if (res.ok) {
        const data = await res.json();
        setJobs(jobs.map(job => job.id === jobId ? data.data : job));
        setEditingJobId(null);
        setEditingJobName("");
        setEditingJobColor("#8b7500");
        setError("✓ Job renamed!");
        setTimeout(() => setError(""), 2000);
      }
    } catch (err) {
      setError('Error renaming job');
    } finally {
      setLoadingJobs(false);
    }
  };

  const handleDeleteJob = async (jobId) => {
    if (!confirm("Delete this job and all its documents?")) return;
    setLoadingJobs(true);
    try {
      const res = await fetch('/api/content/classes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId: jobId })
      });
      if (res.ok) {
        // Clear localStorage for all content types for this job
        clearJobContentFromStorage(jobId, "resume");
        clearJobContentFromStorage(jobId, "cover");
        
        setJobs(jobs.filter(job => job.id !== jobId));
        if (selectedJobId === jobId) {
          setSelectedJobId(null);
          setSavedItems([]);
        }
        setError("✓ Job deleted");
        setTimeout(() => setError(""), 2000);
      }
    } catch (err) {
      setError('Error deleting job');
    } finally {
      setLoadingJobs(false);
    }
  };

  // Handle study music - removed useEffect that conflicts with audio element props

  // Audio setup for study music
  useEffect(() => {
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
  }, [studyMode, studyMusic]);

  // Enter/exit fullscreen based on studyMode
  useEffect(() => {
    // Reflect study mode globally for CSS overrides
    document.documentElement.dataset.study = studyMode ? 'on' : 'off';

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
  }, [studyMode]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        // ...existing logic...
        // (move the logic for onboarding and plan check here if needed)
      } catch (e) {
        // ignore
      }
    })();
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

    if (!name.trim() || !email.trim() || !phone.trim()) {
      setError("Name, email, and phone are required.");
      return;
    }

    setLoading(true);

    // Use the selected template from TemplatePicker (already in state)
    // If not set, try to fetch from user preferences as fallback
    let templateToUse = formatTemplate;
    if (!templateToUse) {
      try {
        const prefRes = await fetch('/api/user/preferences');
        if (prefRes.ok) {
          const prefData = await prefRes.json();
          templateToUse = prefData?.data?.formatTemplate || '';
        }
      } catch (e) {
        // Ignore and proceed without format template
      }
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
        formatTemplate: templateToUse,
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
      const newResult = data.result || {};
      setResult(newResult);
      // Store per-job
      if (selectedJobId) {
        setJobGenerations(prev => ({
          ...prev,
          [selectedJobId]: { result: newResult }
        }));
      }
    } catch (err) {
      console.error(err);
      setError("Failed to generate. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = setter => e => setter(e.target.value);

  const handleSaveDocument = async () => {
    if (!selectedJobId) {
      setError("Please select or create a job first.");
      return;
    }

    const documentData = {
      type,
      name,
      email,
      phone,
      ...(type === "resume" && { address, linkedin, objective, experience, education, skills, certifications }),
      ...(type === "cover" && { recipient, position, paragraphs })
    };

    // Check if we have at least some data
    const hasData = name.trim() || email.trim() || phone.trim() || (type === "resume" ? experience.trim() || education.trim() : paragraphs.trim());
    if (!hasData) {
      setError("Please fill in at least some fields before saving.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/content/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: type === "resume" ? "resume" : "cover_letter",
          title: `${type === "resume" ? "Resume" : "Cover Letter"} - ${new Date().toLocaleDateString()}`,
          originalInput: JSON.stringify(documentData),
          classId: selectedJobId,
          metadata: documentData
        })
      });
      if (res.ok) {
        clearJobContentFromStorage(selectedJobId, type);
        setError("");
        await fetchSavedItems(selectedJobId);
        setError("✓ Document saved!");
        setTimeout(() => setError(""), 2000);
      }
    } catch (err) {
      setError("Error saving document");
    } finally {
      setLoading(false);
    }
  };

  const handleLoadDocument = async (item) => {
    try {
      const data = JSON.parse(item.originalInput);
      setType(data.type);
      setName(data.name || "");
      setEmail(data.email || "");
      setPhone(data.phone || "");
      
      if (data.type === "resume") {
        setAddress(data.address || "");
        setLinkedin(data.linkedin || "");
        setObjective(data.objective || "");
        setExperience(data.experience || "");
        setEducation(data.education || "");
        setSkills(data.skills || "");
        setCertifications(data.certifications || "");
      } else {
        setRecipient(data.recipient || "");
        setPosition(data.position || "");
        setParagraphs(data.paragraphs || "");
      }
      
      setResult(null);
      setError("✓ Document loaded!");
      setTimeout(() => setError(""), 2000);
    } catch (err) {
      setError("Error loading document");
    }
  };

  const handleDeleteDocument = async (itemId) => {
    if (!confirm("Delete this document?")) return;
    setLoading(true);
    try {
      const res = await fetch('/api/content/items', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId })
      });
      if (res.ok) {
        await fetchSavedItems(selectedClassId);
      }
    } catch (err) {
      setError("Error deleting document");
    } finally {
      setLoading(false);
    }
  };

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

      {/* Sidebar toggle fixed under the global HomeFab/logo */}
      <button
        onClick={() => setSidebarOpen((v) => !v)}
        aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        style={{
          position: 'fixed',
          top: 72,
          left: 16,
          zIndex: 9999,
          background: 'var(--accent)',
          color: 'var(--accent-contrast)',
          border: 'none',
          borderRadius: '50%',
          width: 36,
          height: 36,
          boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800
        }}
      >
        {sidebarOpen ? '←' : '→'}
      </button>

      <div className={`${styles.container} ${studyMode ? styles.studyModeActive : ''}`}>
        <h1 className={styles.pageTitle}>Lift Career</h1>

        {/* Sidebar: Job Manager + Saved Documents */}
        <aside style={{ display: sidebarOpen ? 'block' : 'none', width: 320, flexShrink: 0 }}>
        {/* Job Manager */}
        <div style={{ marginBottom: '1.5rem', padding: '1.25rem', background: 'linear-gradient(135deg, rgba(139, 117, 0, 0.12), rgba(139, 117, 0, 0.05))', borderRadius: '10px', border: '1px solid rgba(139, 117, 0, 0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Jobs</h2>
            <button
              onClick={() => setShowJobForm(!showJobForm)}
              style={{ padding: '0.5rem 1rem', background: 'var(--accent)', color: 'var(--accent-contrast)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
            >
              {showJobForm ? '✕ Cancel' : '+ New Job'}
            </button>
          </div>

          {showJobForm && (
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'flex-end' }}>
              <input
                type="text"
                placeholder="Job name (e.g., Software Engineer @ Google)"
                value={newJobName}
                onChange={(e) => setNewJobName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateJob(); }}
                autoFocus
                style={{ flex: 1, padding: '0.65rem 0.75rem', border: '1px solid var(--card-border)', borderRadius: '6px', background: 'var(--input-bg)', color: 'var(--text-color)', fontSize: '1rem' }}
              />
              <input
                type="color"
                value={newJobColor}
                onChange={(e) => setNewJobColor(e.target.value)}
                title="Choose job color"
                style={{ width: '50px', height: '40px', border: '1px solid var(--card-border)', borderRadius: '6px', cursor: 'pointer' }}
              />
              <button onClick={handleCreateJob} disabled={loadingJobs} style={{ padding: '0.65rem 1rem', background: 'var(--accent)', color: 'var(--accent-contrast)', border: 'none', borderRadius: '6px', cursor: loadingJobs ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: loadingJobs ? 0.6 : 1 }}>
                {loadingJobs ? '...' : 'Create'}
              </button>
            </div>
          )}

          {jobs.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', margin: '1rem 0' }}>No jobs. Create one to start!</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
              {jobs.map((job) => (
                <div
                  key={job.id}
                  onClick={() => !editingJobId && setSelectedJobId(job.id)}
                  style={{ padding: '1rem', background: selectedJobId === job.id ? 'rgba(139, 117, 0, 0.15)' : 'rgba(255, 255, 255, 0.03)', borderLeft: `4px solid ${job.color || '#8b7500'}`, border: selectedJobId === job.id ? '1px solid var(--accent)' : '1px solid var(--card-border)', borderRadius: '8px', cursor: editingJobId === job.id ? 'default' : 'pointer', transition: 'all 0.2s' }}
                >
                  {editingJobId === job.id ? (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                      <input
                        type="text"
                        value={editingJobName}
                        onChange={(e) => setEditingJobName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleRenameJob(job.id); if (e.key === 'Escape') setEditingJobId(null); }}
                        autoFocus
                        style={{ flex: 1, padding: '0.5rem', border: '1px solid var(--accent)', borderRadius: '4px', background: 'var(--input-bg)', color: 'var(--text-color)', fontSize: '0.9rem' }}
                      />
                      <input
                        type="color"
                        value={editingJobColor}
                        onChange={(e) => setEditingJobColor(e.target.value)}
                        style={{ width: '40px', height: '32px', border: '1px solid var(--card-border)', borderRadius: '4px', cursor: 'pointer' }}
                      />
                      <button onClick={() => handleRenameJob(job.id)} disabled={loadingJobs} style={{ padding: '0.5rem 0.75rem', background: 'var(--accent)', color: 'var(--accent-contrast)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}>✓</button>
                      <button onClick={() => setEditingJobId(null)} style={{ padding: '0.5rem 0.75rem', background: 'rgba(255, 255, 255, 0.1)', color: 'var(--text-color)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600 }}>{job.name}</span>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button onClick={(e) => { e.stopPropagation(); setEditingJobId(job.id); setEditingJobName(job.name); setEditingJobColor(job.color || '#8b7500'); }} title="Rename" style={{ padding: '0.4rem 0.6rem', background: 'rgba(139, 117, 0, 0.2)', color: 'var(--accent)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>✎</button>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteJob(job.id); }} title="Delete" style={{ padding: '0.4rem 0.6rem', background: 'rgba(139, 117, 0, 0.15)', color: '#8b7500', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>Delete</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Saved Documents */}
        {selectedJobId && savedItems.length > 0 && (
          <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px' }}>
            <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 600 }}>Saved Documents ({savedItems.length})</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {savedItems.map((item) => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'rgba(139, 117, 0, 0.1)', borderRadius: '6px' }}>
                  <span style={{ flex: 1, cursor: 'pointer', fontWeight: 500 }} onClick={() => handleLoadDocument(item)}>{item.title}</span>
                  <button onClick={() => handleDeleteDocument(item.id)} style={{ padding: '0.5rem 0.75rem', background: 'rgba(139, 117, 0, 0.15)', color: '#8b7500', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>Remove</button>
                </div>
              ))}
            </div>
          </div>
        )}
        </aside>

        {/* Job Color Header */}
        {selectedJobId && (() => {
          const selectedJob = jobs.find(j => j.id === selectedJobId);
          return selectedJob ? (
            <div style={{ padding: '0.75rem', borderLeft: `4px solid ${selectedJob.color || '#8b7500'}`, background: `rgba(${parseInt(selectedJob.color?.slice(1, 3), 16)}, ${parseInt(selectedJob.color?.slice(3, 5), 16)}, ${parseInt(selectedJob.color?.slice(5, 7), 16)}, 0.02)`, borderRadius: '8px', marginBottom: '1.5rem' }}>
              <span style={{ color: selectedJob.color || '#8b7500', fontWeight: 600, fontSize: '1rem' }}>Job: {selectedJob.name}</span>
            </div>
          ) : null;
        })()}

      <select className={styles.input} value={type} onChange={handleChange(setType)} disabled={loading}>
        <option value="resume">Resume</option>
        <option value="cover">Cover Letter</option>
      </select>

      {/* Info Box */}
      <div style={{ 
        padding: '12px 16px', 
        backgroundColor: 'rgba(139, 117, 0, 0.1)', 
        border: '1px solid rgba(139, 117, 0, 0.3)',
        borderRadius: '8px',
        marginBottom: '16px',
        fontSize: '14px',
        lineHeight: 1.6
      }}>
        <strong>Tip:</strong> Choose a template below, fill in your information, and click Generate. 
        The AI will create a professional {type === 'resume' ? 'resume' : 'cover letter'} based on your selected style.
        {type === 'resume' && <span> Use commas or | to separate experience/education details.</span>}
      </div>

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
            style={{ background: 'linear-gradient(135deg, #000000 0%, #1a1a1a 100%)', color: '#8b7500', border: '2px solid #8b7500', padding: '0.9rem 1.5rem', borderRadius: '12px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, width: '100%', fontSize: '1rem' }}
            onClick={handleGenerate}
            disabled={loading}
            aria-label="Generate resume or cover letter"
          >
            {loading ? "Generating…" : "Generate"}
          </button>
          <button
            style={{ background: 'linear-gradient(135deg, #000000 0%, #1a1a1a 100%)', color: '#8b7500', border: '2px solid #8b7500', padding: '0.9rem 1.5rem', borderRadius: '12px', fontWeight: 700, cursor: (loading || !selectedJobId) ? 'not-allowed' : 'pointer', opacity: (loading || !selectedJobId) ? 0.6 : 1, width: '100%', fontSize: '1rem', marginTop: '0.75rem' }}
            onClick={handleSaveDocument}
            disabled={loading || !selectedJobId}
            aria-label="Save resume"
          >
            {loading ? "Saving…" : "Save Document"}
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
            style={{ background: 'linear-gradient(135deg, #000000 0%, #1a1a1a 100%)', color: '#8b7500', border: '2px solid #8b7500', padding: '0.9rem 1.5rem', borderRadius: '12px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, width: '100%', fontSize: '1rem' }}
            onClick={handleGenerate}
            disabled={loading}
            aria-label="Generate cover letter"
          >
            {loading ? "Generating…" : "Generate"}
          </button>
          <button
            style={{ background: 'linear-gradient(135deg, #000000 0%, #1a1a1a 100%)', color: '#8b7500', border: '2px solid #8b7500', padding: '0.9rem 1.5rem', borderRadius: '12px', fontWeight: 700, cursor: (loading || !selectedJobId) ? 'not-allowed' : 'pointer', opacity: (loading || !selectedJobId) ? 0.6 : 1, width: '100%', fontSize: '1rem', marginTop: '0.75rem' }}
            onClick={handleSaveDocument}
            disabled={loading || !selectedJobId}
            aria-label="Save cover letter"
          >
            {loading ? "Saving…" : "Save Document"}
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
