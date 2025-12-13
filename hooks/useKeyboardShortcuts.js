import { useEffect } from 'react';
import { useRouter } from 'next/router';

/**
 * Global keyboard shortcuts hook
 * Usage: import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';
 *        useKeyboardShortcuts(enabled);
 */
export default function useKeyboardShortcuts(enabled = true) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(e) {
      // Ignore if user is typing in an input/textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const mod = isMac ? e.metaKey : e.ctrlKey;

      // Ctrl/Cmd + K: Quick search/command palette (future feature)
      if (mod && e.key === 'k') {
        e.preventDefault();
        console.log('Quick search (not yet implemented)');
      }

      // Ctrl/Cmd + N: New note
      if (mod && e.key === 'n') {
        e.preventDefault();
        router.push('/notes');
      }

      // Ctrl/Cmd + R: Resume/Career
      if (mod && e.key === 'r') {
        e.preventDefault();
        router.push('/career');
      }

      // Ctrl/Cmd + D: Dashboard
      if (mod && e.key === 'd') {
        e.preventDefault();
        router.push('/dashboard');
      }

      // Ctrl/Cmd + , : Settings
      if (mod && e.key === ',') {
        e.preventDefault();
        router.push('/settings');
      }

      // Escape: Go back (if not on home)
      if (e.key === 'Escape' && router.pathname !== '/') {
        e.preventDefault();
        router.back();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, router]);
}
