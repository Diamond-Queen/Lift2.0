import { useEffect, useRef } from 'react';

/**
 * Auto-save hook with configurable interval
 * Usage: useAutoSave(data, saveFunction, enabled, intervalSeconds);
 * 
 * @param {any} data - The data to auto-save
 * @param {Function} saveFunction - Async function to call for saving
 * @param {boolean} enabled - Whether auto-save is enabled
 * @param {number} intervalSeconds - How often to save (in seconds, default 30)
 */
export default function useAutoSave(data, saveFunction, enabled = true, intervalSeconds = 30) {
  const lastSavedRef = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (!enabled || !saveFunction) return;

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Check if data has changed
    const dataString = JSON.stringify(data);
    if (dataString === lastSavedRef.current) {
      return; // No changes, skip
    }

    // Set timeout for auto-save
    timeoutRef.current = setTimeout(async () => {
      try {
        await saveFunction(data);
        lastSavedRef.current = dataString;
        console.log('Auto-saved at', new Date().toLocaleTimeString());
      } catch (err) {
        console.error('Auto-save failed:', err);
      }
    }, intervalSeconds * 1000);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [data, saveFunction, enabled, intervalSeconds]);
}
