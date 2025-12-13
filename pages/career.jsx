import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/router";
import { useSession } from 'next-auth/react';
import styles from "../styles/Career.module.css";
import { musicUrls } from "../lib/musicUrls";

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
  const [formatTemplate, setFormatTemplate] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("professional");

  // Class + Content persistence
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [savedItems, setSavedItems] = useState([]);
  const [newClassName, setNewClassName] = useState("");
  const [newClassColor, setNewClassColor] = useState("#d4af37");
  const [showClassForm, setShowClassForm] = useState(false);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [editingClassId, setEditingClassId] = useState(null);
  const [editingClassName, setEditingClassName] = useState("");
  const [editingClassColor, setEditingClassColor] = useState("#d4af37");

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
  }, []);

  // Fetch classes on mount
  useEffect(() => {
    fetchClasses();
  }, []);

  const fetchClasses = async () => {
    setLoadingClasses(true);
    try {
      const res = await fetch('/api/content/classes');
      if (res.ok) {
        const data = await res.json();
        setClasses(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch classes:', err);
    } finally {
      setLoadingClasses(false);
    }
  };

  const fetchSavedItems = async (classId) => {
    try {
      const query = classId ? `?classId=${classId}&type=${type}` : `?type=${type}`;
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
    if (selectedClassId) {
      fetchSavedItems(selectedClassId);
    }
  }, [selectedClassId, type]);

  const handleCreateClass = async () => {
    if (!newClassName.trim()) return;
    setLoadingClasses(true);
    try {
      const res = await fetch('/api/content/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newClassName, color: newClassColor })
      });
      if (res.ok) {
        const data = await res.json();
        setClasses([data.data, ...classes]);
        setSelectedClassId(data.data.id);
        setNewClassName("");
        setNewClassColor("#d4af37");
        setShowClassForm(false);
        setError("✓ Class created!");
        setTimeout(() => setError(""), 2000);
      }
    } catch (err) {
      setError('Failed to create class');
    } finally {
      setLoadingClasses(false);
    }
  };

  const handleRenameClass = async (classId) => {
    if (!editingClassName.trim()) return;
    setLoadingClasses(true);
    try {
      const res = await fetch('/api/content/classes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId, name: editingClassName, color: editingClassColor })
      });
      if (res.ok) {
        const data = await res.json();
        setClasses(classes.map(cls => cls.id === classId ? data.data : cls));
        setEditingClassId(null);
        setEditingClassName("");
        setEditingClassColor("#d4af37");
        setError("✓ Class renamed!");
        setTimeout(() => setError(""), 2000);
      }
    } catch (err) {
      setError('Error renaming class');
    } finally {
      setLoadingClasses(false);
    }
  };

  const handleDeleteClass = async (classId) => {
    if (!confirm("Delete this class and all its documents?")) return;
    setLoadingClasses(true);
    try {
      const res = await fetch('/api/content/classes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId })
      });
      if (res.ok) {
        setClasses(classes.filter(cls => cls.id !== classId));
        if (selectedClassId === classId) {
          setSelectedClassId(null);
          setSavedItems([]);
        }
        setError("✓ Class deleted");
        setTimeout(() => setError(""), 2000);
      }
    } catch (err) {
      setError('Error deleting class');
    } finally {
      setLoadingClasses(false);
    }
  };

  // Handle study music
  useEffect(() => {
    if (studyMusic !== 'none' && studyMode) {
      const audioElement = document.querySelector('audio');
      if (audioElement) {
        let usedFallback = false;
        
        const handleError = () => {
          if (!usedFallback) {
            console.warn('[Audio] Primary source failed, attempting fallback:', studyMusic);
            usedFallback = true;
            audioElement.src = musicUrls[studyMusic].fallback;
            audioElement.load();
            audioElement.play().catch((err) => {
              console.error('[Audio] Fallback also failed:', err.message);
              setError(`⚠ Unable to play ${studyMusic} music. Try another track.`);
            });
          } else {
            console.error('[Audio] Both primary and fallback failed:', studyMusic);
            setError(`⚠ Unable to load ${studyMusic} music. Check your connection.`);
          }
        };
        
        audioElement.onerror = handleError;
        audioElement.onabort = handleError;
        
        audioElement.play().catch((err) => {
          console.warn('[Audio] Play failed:', err.message);
          setError(`⚠ Unable to play ${studyMusic} music. Try another track.`);
        });
      }
      setMusicLoaded(true);
    } else {
      const audioElement = document.querySelector('audio');
      if (audioElement) {
        audioElement.pause();
        audioElement.onerror = null;
        audioElement.onabort = null;
      }
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
      setResult(data.result || {});
    } catch (err) {
      console.error(err);
      setError("Failed to generate. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = setter => e => setter(e.target.value);

  const handleSaveDocument = async () => {
    if (!selectedClassId) {
      setError("Please select or create a class first.");
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
          classId: selectedClassId,
          metadata: documentData
        })
      });
      if (res.ok) {
        setError("");
        await fetchSavedItems(selectedClassId);
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
          src={musicUrls[studyMusic]?.primary}
          autoPlay
          loop
          style={{ display: 'none' }}
          onError={() => {
            const fallback = musicUrls[studyMusic]?.fallback;
            if (fallback) {
              console.warn('[Audio] Primary source failed, attempting fallback:', studyMusic);
              audioRef.current.src = fallback;
              audioRef.current.load();
              audioRef.current.play().catch((err) => {
                console.error('[Audio] Fallback also failed:', err.message);
                setError(`⚠ Unable to play ${studyMusic} music. Try another track.`);
              });
            } else {
              console.error('[Audio] Both primary and fallback failed:', studyMusic);
              setError(`⚠ Unable to load ${studyMusic} music. Check your connection.`);
            }
          }}
        />
      )}

      <div className={`${styles.container} ${studyMode ? styles.studyModeActive : ''}`}>
        <h1 className={styles.pageTitle}>📋 Lift Career</h1>

        {/* Class Manager */}
        <div style={{ marginBottom: '1.5rem', padding: '1.25rem', background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.12), rgba(212, 175, 55, 0.05))', borderRadius: '10px', border: '1px solid rgba(212, 175, 55, 0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>📚 Classes</h2>
            <button
              onClick={() => setShowClassForm(!showClassForm)}
              style={{ padding: '0.5rem 1rem', background: 'var(--accent)', color: 'var(--accent-contrast)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
            >
              {showClassForm ? '✕ Cancel' : '+ New Class'}
            </button>
          </div>

          {showClassForm && (
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'flex-end' }}>
              <input
                type="text"
                placeholder="Class name (e.g., Job Search 2025)"
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateClass(); }}
                autoFocus
                style={{ flex: 1, padding: '0.65rem 0.75rem', border: '1px solid var(--card-border)', borderRadius: '6px', background: 'var(--input-bg)', color: 'var(--text-color)', fontSize: '1rem' }}
              />
              <input
                type="color"
                value={newClassColor}
                onChange={(e) => setNewClassColor(e.target.value)}
                title="Choose class color"
                style={{ width: '50px', height: '40px', border: '1px solid var(--card-border)', borderRadius: '6px', cursor: 'pointer' }}
              />
              <button onClick={handleCreateClass} disabled={loadingClasses} style={{ padding: '0.65rem 1rem', background: 'var(--accent)', color: 'var(--accent-contrast)', border: 'none', borderRadius: '6px', cursor: loadingClasses ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: loadingClasses ? 0.6 : 1 }}>
                {loadingClasses ? '...' : 'Create'}
              </button>
            </div>
          )}

          {classes.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', margin: '1rem 0' }}>No classes. Create one to start!</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
              {classes.map((cls) => (
                <div
                  key={cls.id}
                  onClick={() => !editingClassId && setSelectedClassId(cls.id)}
                  style={{ padding: '1rem', background: selectedClassId === cls.id ? 'rgba(212, 175, 55, 0.15)' : 'rgba(255, 255, 255, 0.03)', borderLeft: `4px solid ${cls.color || '#d4af37'}`, border: selectedClassId === cls.id ? '1px solid var(--accent)' : '1px solid var(--card-border)', borderRadius: '8px', cursor: editingClassId === cls.id ? 'default' : 'pointer', transition: 'all 0.2s' }}
                >
                  {editingClassId === cls.id ? (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                      <input
                        type="text"
                        value={editingClassName}
                        onChange={(e) => setEditingClassName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleRenameClass(cls.id); if (e.key === 'Escape') setEditingClassId(null); }}
                        autoFocus
                        style={{ flex: 1, padding: '0.5rem', border: '1px solid var(--accent)', borderRadius: '4px', background: 'var(--input-bg)', color: 'var(--text-color)', fontSize: '0.9rem' }}
                      />
                      <input
                        type="color"
                        value={editingClassColor}
                        onChange={(e) => setEditingClassColor(e.target.value)}
                        style={{ width: '40px', height: '32px', border: '1px solid var(--card-border)', borderRadius: '4px', cursor: 'pointer' }}
                      />
                      <button onClick={() => handleRenameClass(cls.id)} disabled={loadingClasses} style={{ padding: '0.5rem 0.75rem', background: 'var(--accent)', color: 'var(--accent-contrast)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}>✓</button>
                      <button onClick={() => setEditingClassId(null)} style={{ padding: '0.5rem 0.75rem', background: 'rgba(255, 255, 255, 0.1)', color: 'var(--text-color)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600 }}>{cls.name}</span>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button onClick={(e) => { e.stopPropagation(); setEditingClassId(cls.id); setEditingClassName(cls.name); setEditingClassColor(cls.color || '#d4af37'); }} title="Rename" style={{ padding: '0.4rem 0.6rem', background: 'rgba(212, 175, 55, 0.2)', color: 'var(--accent)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>✎</button>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteClass(cls.id); }} title="Delete" style={{ padding: '0.4rem 0.6rem', background: 'rgba(255, 0, 0, 0.15)', color: '#ff6b6b', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>🗑</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Saved Documents */}
        {selectedClassId && savedItems.length > 0 && (
          <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px' }}>
            <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 600 }}>📄 Saved Documents ({savedItems.length})</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {savedItems.map((item) => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'rgba(212, 175, 55, 0.1)', borderRadius: '6px' }}>
                  <span style={{ flex: 1, cursor: 'pointer', fontWeight: 500 }} onClick={() => handleLoadDocument(item)}>{item.title}</span>
                  <button onClick={() => handleDeleteDocument(item.id)} style={{ padding: '0.5rem 0.75rem', background: 'rgba(255, 0, 0, 0.2)', color: '#ff6b6b', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>Remove</button>
                </div>
              ))}
            </div>
          </div>
        )}

      <select className={styles.input} value={type} onChange={handleChange(setType)} disabled={loading}>
        <option value="resume">Resume</option>
        <option value="cover">Cover Letter</option>
      </select>

      {/* Info Box */}
      <div style={{ 
        padding: '12px 16px', 
        backgroundColor: 'rgba(212, 175, 55, 0.1)', 
        border: '1px solid rgba(212, 175, 55, 0.3)',
        borderRadius: '8px',
        marginBottom: '16px',
        fontSize: '14px',
        lineHeight: 1.6
      }}>
        <strong>💡 Quick Start:</strong> Choose a template below, fill in your information, and click Generate. 
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
            className={`${styles.btnAction} ${styles.btnPurple} ${loading ? styles.loading : ""}`}
            onClick={handleGenerate}
            disabled={loading}
            aria-label="Generate resume or cover letter"
          >
            {loading ? "Generating…" : "Generate"}
          </button>
          <button
            className={`${styles.btnAction} ${styles.btnPurple} ${loading ? styles.loading : ""}`}
            onClick={handleSaveDocument}
            disabled={loading || !selectedClassId}
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
            className={`${styles.btnAction} ${styles.btnPurple} ${loading ? styles.loading : ""}`}
            onClick={handleGenerate}
            disabled={loading}
            aria-label="Generate cover letter"
          >
            {loading ? "Generating…" : "Generate"}
          </button>
          <button
            className={`${styles.btnAction} ${styles.btnPurple} ${loading ? styles.loading : ""}`}
            onClick={handleSaveDocument}
            disabled={loading || !selectedClassId}
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
