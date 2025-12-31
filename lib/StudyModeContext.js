import { createContext, useContext, useState, useEffect } from "react";

const StudyModeContext = createContext();

export function StudyModeProvider({ children }) {
  const [studyMode, setStudyMode] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("studyMode") === "true";
    }
    return false;
  });
  const [studyMusic, setStudyMusic] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("studyMusic") || "none";
    }
    return "none";
  });

  // Sync to localStorage and listen for changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("studyMode", studyMode ? "true" : "false");
    window.dispatchEvent(new Event("studyModeChange"));
  }, [studyMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("studyMusic", studyMusic || "none");
    window.dispatchEvent(new Event("studyMusicChange"));
  }, [studyMusic]);

  // Listen for changes from other tabs
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleStorage = (e) => {
      if (e.key === "studyMode") setStudyMode(e.newValue === "true");
      if (e.key === "studyMusic") setStudyMusic(e.newValue || "none");
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // Listen for custom events in same tab
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleMode = () => setStudyMode(localStorage.getItem("studyMode") === "true");
    const handleMusic = () => setStudyMusic(localStorage.getItem("studyMusic") || "none");
    window.addEventListener("studyModeChange", handleMode);
    window.addEventListener("studyMusicChange", handleMusic);
    return () => {
      window.removeEventListener("studyModeChange", handleMode);
      window.removeEventListener("studyMusicChange", handleMusic);
    };
  }, []);

  return (
    <StudyModeContext.Provider value={{ studyMode, setStudyMode, studyMusic, setStudyMusic }}>
      {children}
    </StudyModeContext.Provider>
  );
}

export function useStudyMode() {
  return useContext(StudyModeContext);
}
