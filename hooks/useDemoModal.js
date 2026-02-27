/**
 * Custom hook to manage demo modal visibility
 * Shows demo to new users who haven't watched it yet
 */
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

export function useDemoModal() {
  const { data: session, status } = useSession();
  const [showDemo, setShowDemo] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user?.email) {
      setLoading(false);
      return;
    }

    // Check if user has watched the demo
    (async () => {
      try {
        const res = await fetch('/api/user');
        if (res.ok) {
          const data = await res.json();
          const user = data?.data?.user;
          
          // Show demo if user hasn't watched it and doesn't have access yet
          if (user && !user.demoWatched && !user.schoolId && !user.preferences?.subscriptionPlan) {
            setShowDemo(true);
          }
        }
      } catch (err) {
        console.error('Error checking demo status:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [session, status]);

  const closeDemo = () => {
    setShowDemo(false);
  };

  return {
    showDemo,
    closeDemo,
    loading
  };
}
