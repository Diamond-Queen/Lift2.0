"use client";

import { useState, useEffect, useRef } from "react";
import JSZip from "jszip";
import styles from "../styles/Notes.module.css";
import { musicUrls, getAudioStreamUrl } from "../lib/musicUrls";
import { useStudyMode } from "../lib/StudyModeContext";
import UnlockModal from "../components/UnlockModal";
import { exportToPdf, exportToPptx, exportToDocx, exportToTxt } from "../lib/export";

export default function NotesUI() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [togglePos, setTogglePos] = useState({ top: 72, left: 16 });
  // Core state
  const [input, setInput] = useState("");
  const [summaries, setSummaries] = useState([]);
  const [flashcards, setFlashcards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { studyMode, setStudyMode, studyMusic, setStudyMusic } = useStudyMode();
  const [musicLoaded, setMusicLoaded] = useState(false);
  const audioRef = useRef(null);

  // Class + Content persistence
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [savedItems, setSavedItems] = useState([]);
  const [newClassName, setNewClassName] = useState("");
  const [newClassColor, setNewClassColor] = useState("#8b7500");
  const [showClassForm, setShowClassForm] = useState(false);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [editingClassId, setEditingClassId] = useState(null);
  const [editingClassName, setEditingClassName] = useState("");
  const [editingClassColor, setEditingClassColor] = useState("#8b7500");
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockFeature, setUnlockFeature] = useState('');
  const [userPlan, setUserPlan] = useState('full'); // track subscription
  const [exportFormat, setExportFormat] = useState('pdf'); // Selected export format
  
  // Per-class generation results
  const [classGenerations, setClassGenerations] = useState({});

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
          if (typeof prefs.subscriptionPlan === 'string') setUserPlan(prefs.subscriptionPlan);
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

  // Position the sidebar toggle directly below the global HomeFab so it always appears
  // under the logo/Fab on every screen size. Recompute on resize/scroll.
  useEffect(() => {
    const compute = () => {
      try {
        const el = document.querySelector('.homeFab');
        if (el) {
          const r = el.getBoundingClientRect();
          const top = Math.max(8, Math.round(r.top + r.height + 8));
          const left = Math.max(8, Math.round(r.left));
          setTogglePos({ top, left });
        }
      } catch (e) {}
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, { passive: true });
    const obs = new MutationObserver(compute);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute);
      obs.disconnect();
    };
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
      // Load summaries/flashcards for this specific class from classGenerations (in-memory) first
      if (classGenerations[selectedClassId]) {
        setSummaries(classGenerations[selectedClassId].summaries || []);
        setFlashcards(classGenerations[selectedClassId].flashcards || []);
      } else {
        // Try to restore from localStorage for this class
        const key = `class_${selectedClassId}_notes`;
        const stored = localStorage.getItem(key);
        if (stored) {
          try {
            const data = JSON.parse(stored);
            setInput(data.input || "");
            setSummaries(data.summaries || []);
            setFlashcards(data.flashcards || []);
            // Also update classGenerations so it persists in memory
            setClassGenerations(prev => ({
              ...prev,
              [selectedClassId]: {
                summaries: data.summaries || [],
                flashcards: data.flashcards || []
              }
            }));
          } catch (e) {
            console.error('Failed to restore from localStorage:', e);
            setSummaries([]);
            setFlashcards([]);
            setInput("");
          }
        } else {
          setSummaries([]);
          setFlashcards([]);
          setInput("");
        }
      }
      setError("");
    }
  }, [selectedClassId]);

  // Auto-save notes for the current class whenever input, summaries, or flashcards change
  useEffect(() => {
    if (selectedClassId && (input || summaries.length > 0 || flashcards.length > 0)) {
      const key = `class_${selectedClassId}_notes`;
      const dataToSave = {
        input,
        summaries,
        flashcards
      };
      localStorage.setItem(key, JSON.stringify(dataToSave));
    }
  }, [selectedClassId, input, summaries, flashcards]);

  const handleCreateClass = async () => {
    if (!newClassName.trim()) return;
    // Gate: free tier allows max 2 classes
    if (userPlan !== 'full' && userPlan !== 'notes' && classes.length >= 2) {
      setUnlockFeature('Creating more than 2 classes');
      setShowUnlockModal(true);
      return;
    }
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
        setNewClassColor("#8b7500");
      }
    } catch (err) {
      console.error('Failed to create class:', err);
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
        setEditingClassColor("#8b7500");
        setError("✓ Class renamed!");
        setTimeout(() => setError(""), 2000);
      }
    } catch (err) {
      setError('Error renaming class');
    } finally {
      setLoadingClasses(false);
    }
  };

  const handleLoadNote = (item) => {
    if (!item) return;
    setInput(item.originalInput || "");
    // if summaries/flashcards were saved, restore them
    if (item.summaries) setSummaries(item.summaries || []);
    if (item.metadata && item.metadata.flashcards) setFlashcards(item.metadata.flashcards || []);
  };

  const handleDeleteNote = async (itemId) => {
    if (!confirm('Remove this saved note?')) return;
    try {
      const res = await fetch('/api/content/items', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId })
      });
      if (res.ok) {
        setSavedItems(savedItems.filter(it => it.id !== itemId));
        setError('✓ Removed');
        setTimeout(() => setError(''), 1500);
      }
    } catch (err) {
      setError('Failed to remove note');
    }
  };

  const handleSaveNote = async () => {
    if (!selectedClassId) {
      setError('Select a class first');
      return;
    }
    const title = (input || '').split('\n')[0].slice(0, 80) || `Note ${new Date().toLocaleString()}`;
    try {
      const res = await fetch('/api/content/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          classId: selectedClassId, 
          title, 
          originalInput: input, 
          type: 'note', 
          summaries: summaries.length > 0 ? summaries : null, 
          metadata: { flashcards: flashcards.length > 0 ? flashcards : null } 
        })
      });
      if (res.ok) {
        const data = await res.json();
        setSavedItems([data.data, ...savedItems]);
        setError('✓ Saved');
        setTimeout(() => setError(''), 1500);
      } else {
        const d = await res.json();
        setError(d.error || 'Save failed');
        setTimeout(() => setError(''), 2500);
      }
    } catch (err) {
      setError('Save failed');
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


  // Audio setup for study music
  useEffect(() => {
    const setupAudio = async () => {
      // Play music whenever a track is selected and audio element exists, independent of studyMode
      if (studyMusic && studyMusic !== 'none' && audioRef.current) {
        try {
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
        // No music selected — pause and clear source
        try {
          audioRef.current.pause();
          audioRef.current.src = '';
        } catch (e) {}
      }
    };

    setupAudio();
  }, [studyMusic, studyMode]);

  useEffect(() => {
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
    // Only allow generation if a class is selected
    if (!selectedClassId) {
      setError("Please select or create a class first.");
      return;
    }
    setLoading(true);
    setError("");
    // Clear before generation to reset state
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
        const newSummaries = data.summaries || [];
        const newFlashcards = (data.flashcards || []).slice(0, 12).map((q) => ({ ...q, flipped: false }));
        setSummaries(newSummaries);
        setFlashcards(newFlashcards);
        // Store per-class - only for the currently selected class
        setClassGenerations(prev => ({
          ...prev,
          [selectedClassId]: { summaries: newSummaries, flashcards: newFlashcards }
        }));
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

  const handleExport = async (format = 'txt') => {
    if (!input.trim() && summaries.length === 0 && flashcards.length === 0) {
      setError('No content to export');
      setTimeout(() => setError(''), 2000);
      return;
    }
    
    try {
      let content = '';
      
      if (input.trim()) {
        content += 'ORIGINAL NOTES\n' + '='.repeat(50) + '\n' + input.trim() + '\n\n';
      }
      
      if (summaries.length > 0) {
        content += 'SUMMARY\n' + '='.repeat(50) + '\n';
        summaries.forEach((summary, i) => {
          content += summary.trim() + '\n\n';
        });
      }
      
      if (flashcards.length > 0) {
        content += 'FLASHCARDS\n' + '='.repeat(50) + '\n';
        flashcards.forEach((card, i) => {
          content += `${i + 1}. Q: ${card.question}\n   A: ${card.answer}\n\n`;
        });
      }
      
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `lift-notes-${timestamp}`;
      
      switch(format) {
        case 'pdf':
          await exportToPdf(content, filename);
          break;
        case 'pptx':
          await exportToPptx(content, filename);
          break;
        case 'docx':
          await exportToDocx(content, filename);
          break;
        default:
          exportToTxt(content, filename);
      }
      
      setError('✓ Exported successfully!');
      setTimeout(() => setError(''), 2000);
    } catch (err) {
      console.error('Export error:', err);
      setError('Export failed');
      setTimeout(() => setError(''), 2500);
    }
  };

  const toggleFlashcard = (index) => {
    setFlashcards((prev) =>
      prev.map((card, i) => (i === index ? { ...card, flipped: !card.flipped } : card))
    );
  };

  return (
    <>
      {/* Sidebar toggle fixed under the global HomeFab/logo */}
      <button
        onClick={() => setSidebarOpen((v) => !v)}
        aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        style={{
          position: 'fixed',
          top: togglePos.top,
          left: togglePos.left,
          zIndex: 9998,
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

      <div className={styles.container}>
      <aside className={styles.sidebar} style={{ display: sidebarOpen ? 'block' : 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>Classes</h3>
          <button 
            onClick={() => setShowClassForm(!showClassForm)} 
            style={{ 
              padding: '0.5rem 1rem', 
              background: 'var(--accent)', 
              color: 'var(--accent-contrast)', 
              border: 'none', 
              borderRadius: '6px', 
              cursor: 'pointer', 
              fontWeight: 600,
              fontSize: '1rem'
            }}
          >
            {showClassForm ? '✕' : '+ New'}
          </button>
        </div>

        {showClassForm && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--card-border)' }}>
            <input type="text" placeholder="Class name" value={newClassName} onChange={(e) => setNewClassName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleCreateClass(); if (e.key === 'Escape') setShowClassForm(false); }} autoFocus style={{ padding: '0.65rem 0.75rem', border: '1px solid var(--card-border)', borderRadius: '6px', background: 'var(--input-bg)', color: 'var(--text-color)', fontSize: '0.95rem' }} />
            <input type="color" value={newClassColor} onChange={(e) => setNewClassColor(e.target.value)} title="Choose class color" style={{ width: '100%', height: '40px', border: '1px solid var(--card-border)', borderRadius: '6px', cursor: 'pointer' }} />
            <button onClick={handleCreateClass} disabled={loadingClasses} style={{ padding: '0.65rem 1rem', background: 'var(--accent)', color: 'var(--accent-contrast)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, opacity: loadingClasses ? 0.6 : 1 }}>
              {loadingClasses ? '...' : 'Create'}
            </button>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {classes.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', margin: '0.5rem 0' }}>No classes yet</p>
            ) : (
              classes.map((cls) => (
                <div key={cls.id} onClick={() => !editingClassId && setSelectedClassId(cls.id)} style={{ padding: '0.75rem', background: selectedClassId === cls.id ? 'rgba(139, 117, 0, 0.15)' : 'rgba(255, 255, 255, 0.03)', borderLeft: `4px solid ${cls.color || '#8b7500'}`, border: selectedClassId === cls.id ? '1px solid var(--accent)' : '1px solid var(--card-border)', borderRadius: '8px', cursor: editingClassId === cls.id ? 'default' : 'pointer', transition: 'all 0.2s' }}>
                  {editingClassId === cls.id ? (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                      <input type="text" value={editingClassName} onChange={(e) => setEditingClassName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleRenameClass(cls.id); if (e.key === 'Escape') setEditingClassId(null); }} autoFocus style={{ flex: 1, padding: '0.5rem', border: '1px solid var(--accent)', borderRadius: '4px', background: 'var(--input-bg)', color: 'var(--text-color)', fontSize: '0.9rem' }} />
                      <input type="color" value={editingClassColor} onChange={(e) => setEditingClassColor(e.target.value)} style={{ width: '40px', height: '32px', border: '1px solid var(--card-border)', borderRadius: '4px', cursor: 'pointer' }} />
                      <button onClick={() => handleRenameClass(cls.id)} disabled={loadingClasses} style={{ padding: '0.5rem 0.75rem', background: 'var(--accent)', color: 'var(--accent-contrast)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}>✓</button>
                      <button onClick={() => setEditingClassId(null)} style={{ padding: '0.5rem 0.75rem', background: 'rgba(255, 255, 255, 0.1)', color: 'var(--text-color)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600 }}>{cls.name}</span>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button onClick={(e) => { e.stopPropagation(); setEditingClassId(cls.id); setEditingClassName(cls.name); setEditingClassColor(cls.color || '#8b7500'); }} title="Rename" style={{ padding: '0.4rem 0.6rem', background: 'rgba(139, 117, 0, 0.2)', color: 'var(--accent)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>✎</button>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteClass(cls.id); }} title="Delete" style={{ padding: '0.4rem 0.6rem', background: 'rgba(255, 0, 0, 0.15)', color: '#ff6b6b', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>🗑</button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Saved Notes */}
          {selectedClassId && savedItems.length > 0 && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px', borderTop: '2px solid var(--accent)' }}>
              <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 600 }}>Saved Notes ({savedItems.length})</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {savedItems.map((item) => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'rgba(139, 117, 0, 0.1)', borderRadius: '6px' }}>
                    <span style={{ flex: 1, cursor: 'pointer', fontWeight: 500 }} onClick={() => handleLoadNote(item)}>{item.title}</span>
                    <button onClick={() => handleDeleteNote(item.id)} style={{ padding: '0.5rem 0.75rem', background: 'rgba(255, 0, 0, 0.2)', color: '#ff6b6b', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>Remove</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Main content: editor and actions */}
        <main className={styles.mainContent}>
          <h1 className={styles.pageTitle}>Lift Notes</h1>

          {(() => {
            const selectedClass = selectedClassId ? classes.find(c => c.id === selectedClassId) : null;
            return selectedClass && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', borderLeft: `4px solid ${selectedClass.color || '#8b7500'}`, borderRadius: '6px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)' }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Class</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 600, color: selectedClass.color || '#8b7500' }}>
                  {selectedClass.name}
                </div>
              </div>
            );
          })()}

          <textarea className={styles.textarea} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Paste notes, type, or upload a file..." />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
            <button className={styles.secondaryButton} onClick={handleGenerate} disabled={loading} style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', color: '#8b7500', border: '2px solid #1f003bff', padding: '0.9rem 1.25rem', borderRadius: '12px', fontWeight: 700 }}>
              {loading ? 'Generating…' : 'Generate Notes'}
            </button>
            <button className={styles.secondaryButton} onClick={handleSaveNote} disabled={loading || !selectedClassId} style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', color: '#8b7500', border: '2px solid #1f003bff', padding: '0.9rem 1.25rem', borderRadius: '12px', fontWeight: 700, opacity: !selectedClassId ? 0.6 : 1 }}>
              {loading ? 'Saving…' : 'Save Note'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value)}
              style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', color: '#8b7500', border: '2px solid #1f003bff', padding: '0.65rem 1rem', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem', flex: '0 0 auto', minWidth: '100px' }}
            >
              <option value="pdf">PDF</option>
              <option value="pptx">PPTX</option>
              <option value="docx">DOCX</option>
              <option value="txt">TXT</option>
            </select>
            <button
              onClick={() => {
                if (userPlan !== 'full' && userPlan !== 'notes') {
                  setUnlockFeature('Export Notes');
                  setShowUnlockModal(true);
                } else {
                  handleExport(exportFormat);
                }
              }}
              style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', color: '#8b7500', border: '2px solid #1f003bff', padding: '0.65rem 1rem', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem', flex: '1 1 auto', minWidth: '100px' }}
            >
              Export
            </button>
            <button onClick={useSample} style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', color: '#8b7500', border: '2px solid #1f003bff', padding: '0.65rem 1rem', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem', flex: '1 1 auto', minWidth: '100px' }}>Sample</button>
            <button onClick={clearInput} style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', color: '#8b7500', border: '2px solid #1f003bff', padding: '0.65rem 1rem', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem', flex: '1 1 auto', minWidth: '100px' }}>Clear</button>
            <label style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', color: '#8b7500', border: '2px solid #1f003bff', padding: '0.65rem 1rem', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem', display: 'inline-flex', alignItems: 'center', flex: '1 1 auto', minWidth: '100px', justifyContent: 'center' }}>
              Upload
              <input type="file" accept=".pdf,.pptx" onChange={handleFileChange} disabled={loading} style={{ display: 'none' }} />
            </label>
          </div>

          {error && <div className={styles.errorMessage}>{error}</div>}

          {/* Upsell banner for non-full subscribers */}
          {(() => {
            try {
              const plan = typeof window !== 'undefined' ? (window.__liftPlan || localStorage.getItem('subscriptionPlan')) : null;
              if (plan && plan !== 'full' && plan !== 'notes') {
                return (
                  <div style={{ margin: '1rem 0', padding: '1rem', border: '1px solid var(--card-border)', borderRadius: '10px', background: 'rgba(255,255,255,0.06)' }}>
                    <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Unlock Notes</strong>
                    <ul style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--text-muted)' }}>
                      <li>Unlimited notes and class organization</li>
                      <li>Advanced summaries and flashcards</li>
                      <li>Export to PDF and more</li>
                    </ul>
                    <a href="/subscription/plans" className={styles.submitButton} style={{ display: 'inline-block', marginTop: '0.75rem' }}>View Plans</a>
                  </div>
                );
              }
            } catch (e) {}
            return null;
          })()}

          {summaries.length > 0 && (
            <div className={styles.section}>
              <h2>Summary</h2>
              {summaries.map((summary, index) => (
                <div key={index} className={styles.summaryBox}>
                  <p>{summary}</p>
                  <button onClick={() => copySummary(summary)} style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: 'rgba(139, 117, 0, 0.2)', color: 'var(--accent)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>Copy</button>
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
        </main>
      </div>

        <UnlockModal
        isOpen={showUnlockModal}
        onClose={() => setShowUnlockModal(false)}
        feature={unlockFeature}
      />
    </>
  );
}
