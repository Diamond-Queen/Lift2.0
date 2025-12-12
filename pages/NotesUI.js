"use client";

import { useState, useEffect, useRef } from "react";
import JSZip from "jszip";
import styles from "../styles/Notes.module.css";
import { musicUrls } from "../lib/musicUrls";

export default function NotesUI() {
  // Core state
  const [input, setInput] = useState("");
  const [summaries, setSummaries] = useState([]);
  const [flashcards, setFlashcards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [studyMode, setStudyMode] = useState(false);
  const [studyMusic, setStudyMusic] = useState('none');
  const [musicLoaded, setMusicLoaded] = useState(false);
  const audioRef = useRef(null);

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

  // Fetch user preferences on mount
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

  const fetchSavedNotes = async (classId) => {
    try {
      const query = classId ? `?classId=${classId}&type=note` : '?type=note';
      const res = await fetch(`/api/content/items${query}`);
      if (res.ok) {
        const data = await res.json();
        setSavedItems(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch saved notes:', err);
    }
  };

  useEffect(() => {
    if (selectedClassId) {
      fetchSavedNotes(selectedClassId);
    }
  }, [selectedClassId]);

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
    if (!confirm("Delete this class and all its notes?")) return;
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

  const handleSaveNote = async () => {
    if (!input.trim()) {
      setError("Please add notes before saving.");
      return;
    }
    if (!selectedClassId) {
      setError("Please select or create a class first.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/content/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'note',
          title: `Note - ${new Date().toLocaleDateString()}`,
          originalInput: input,
          classId: selectedClassId,
          summaries: { summaries, flashcards }
        })
      });
      if (res.ok) {
        setError("");
        setSummaries([]);
        setFlashcards([]);
        setInput("");
        await fetchSavedNotes(selectedClassId);
        setError("✓ Note saved!");
        setTimeout(() => setError(""), 2000);
      }
    } catch (err) {
      setError("Error saving note");
    } finally {
      setLoading(false);
    }
  };

  const handleLoadNote = async (item) => {
    setInput(item.originalInput);
    if (item.summaries) {
      setSummaries(item.summaries.summaries || []);
      const cards = (item.summaries.flashcards || []).slice(0, 12).map((q) => ({ ...q, flipped: false }));
      setFlashcards(cards);
    }
    setError("");
  };

  const handleDeleteNote = async (itemId) => {
    if (!confirm("Delete this note?")) return;
    setLoading(true);
    try {
      const res = await fetch('/api/content/items', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId })
      });
      if (res.ok) {
        await fetchSavedNotes(selectedClassId);
      }
    } catch (err) {
      setError("Error deleting note");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (studyMusic !== 'none' && studyMode && audioRef.current) {
      const audioElement = audioRef.current;
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
      setMusicLoaded(true);
    } else if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onerror = null;
      audioRef.current.onabort = null;
      setMusicLoaded(false);
    }
  }, [studyMusic, studyMode]);

  useEffect(() => {
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

  const extractTextFromPptx = async (fileBuffer) => {
    const zip = await JSZip.loadAsync(fileBuffer);
    let text = "";
    const slideFiles = Object.keys(zip.files).filter((f) => f.match(/^ppt\/slides\/slide\d+\.xml$/));
    for (const slidePath of slideFiles) {
      const slideXml = await zip.files[slidePath].async("text");
      const matches = [...slideXml.matchAll(/<a:t>(.*?)<\/a:t>/g)];
      matches.forEach((m) => (text += m[1] + "\n"));
    }
    return text.trim();
  };

  const extractTextFromPdf = async (file) => {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf");
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((item) => item.str).join(" ");
      text += pageText + "\n\n";
    }
    return text.trim();
  };

  const handleFileChange = async (e) => {
    setError("");
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      let extractedText = "";
      if (file.name.toLowerCase().endsWith(".pptx")) {
        const buffer = await file.arrayBuffer();
        extractedText = await extractTextFromPptx(buffer);
      } else if (file.name.toLowerCase().endsWith(".pdf")) {
        extractedText = await extractTextFromPdf(file);
      } else {
        throw new Error("Unsupported file type. Use PDF or PPTX.");
      }
      if (!extractedText.trim()) throw new Error("No readable text found.");
      setInput((prev) => prev ? prev.trim() + "\n\n" + extractedText.trim() : extractedText.trim());
      e.target.value = "";
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to extract text.");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!input.trim()) {
      setError("Please add notes or upload a file first.");
      return;
    }
    setLoading(true);
    setError("");
    setSummaries([]);
    setFlashcards([]);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: input }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Generation failed");
      } else {
        setSummaries(data.summaries || []);
        const newFlashcards = (data.flashcards || []).slice(0, 12).map((q) => ({ ...q, flipped: false }));
        setFlashcards(newFlashcards);
      }
    } catch (err) {
      setError("Failed to generate. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const clearInput = () => {
    setInput("");
    setSummaries([]);
    setFlashcards([]);
    setError("");
  };

  const sampleNotes = `Key topics:\n- Photosynthesis overview\n- Light-dependent reactions\n- Calvin cycle steps\n\nImportant formulas:\n- Rate = k[A]^n`;

  const useSample = () => {
    setInput(sampleNotes);
    setTimeout(() => {
      const ta = document.querySelector("textarea");
      if (ta) ta.focus();
    }, 50);
  };

  const copySummary = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setError("✓ Copied!");
      setTimeout(() => setError(""), 1500);
    } catch (err) {
      setError("Failed to copy");
      setTimeout(() => setError(""), 2500);
    }
  };

  const toggleFlashcard = (index) => {
    setFlashcards((prev) =>
      prev.map((card, i) => (i === index ? { ...card, flipped: !card.flipped } : card))
    );
  };

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
      {studyMode && studyMusic !== 'none' && (
        <audio ref={audioRef} src={musicUrls[studyMusic]?.primary} autoPlay loop style={{ display: 'none' }} />
      )}

      <div className={`${styles.container} ${studyMode ? styles.studyModeActive : ''}`}>
        <h1 className={styles.pageTitle}>📖 Lift Notes</h1>

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
                placeholder="Class name (e.g., Biology 101)"
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

        {/* Saved Notes */}
        {selectedClassId && savedItems.length > 0 && (
          <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px' }}>
            <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 600 }}>📝 Saved Notes ({savedItems.length})</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {savedItems.map((item) => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'rgba(212, 175, 55, 0.1)', borderRadius: '6px' }}>
                  <span style={{ flex: 1, cursor: 'pointer', fontWeight: 500 }} onClick={() => handleLoadNote(item)}>{item.title}</span>
                  <button onClick={() => handleDeleteNote(item.id)} style={{ padding: '0.5rem 0.75rem', background: 'rgba(255, 0, 0, 0.2)', color: '#ff6b6b', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>Remove</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <textarea className={styles.textarea} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Paste notes, type, or upload a file..." />

        <div className={styles.buttonGroup}>
          <button className={styles.submitButton} onClick={handleGenerate} disabled={loading}>{loading ? "Generating..." : "Generate & Save"}</button>
          <button className={styles.submitButton} onClick={handleSaveNote} disabled={loading || !selectedClassId}>{loading ? "Saving..." : "Save Note"}</button>
          <button className={styles.submitButton} onClick={useSample}>Sample</button>
          <button className={styles.submitButton} onClick={clearInput}>Clear</button>
          <label className={styles.submitButton} style={{ cursor: "pointer" }}>
            📄 Upload
            <input type="file" accept=".pdf,.pptx" onChange={handleFileChange} disabled={loading} style={{ display: "none" }} />
          </label>
        </div>

        {error && <div className={styles.errorMessage}>{error}</div>}

        {summaries.length > 0 && (
          <div className={styles.section}>
            <h2>Summary</h2>
            {summaries.map((summary, index) => (
              <div key={index} className={styles.summaryBox}>
                <p>{summary}</p>
                <button onClick={() => copySummary(summary)} style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: 'rgba(212, 175, 55, 0.2)', color: 'var(--accent)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>Copy</button>
              </div>
            ))}
          </div>
        )}

        {flashcards.length > 0 && (
          <div className={styles.section}>
            <h2>Flashcards ({flashcards.length})</h2>
            <div className={styles.flashcardGrid}>
              {flashcards.map((card, index) => (
                <div key={index} className={`${styles.flashcard} ${card.flipped ? styles.flipped : ''}`} onClick={() => toggleFlashcard(index)}>
                  <div className={styles.flashcardInner}>
                    <div className={styles.flashcardFront}><p>{card.question}</p></div>
                    <div className={styles.flashcardBack}><p>{card.answer}</p></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
