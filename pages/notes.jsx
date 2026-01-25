// pages/Notes.js
'use client';

import dynamic from 'next/dynamic';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

const NotesDynamic = dynamic(() => import('./NotesUI'), {
  ssr: false,
  loading: () => <p>Loading Note Generator...</p>
});

export default function Notes() {
  const { data: session, status } = useSession();
  const router = useRouter();

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
              return;
            }
            // Check subscription tier via user.preferences
            const plan = user?.preferences?.subscriptionPlan || null;
            if (plan === 'career') {
              alert('Notes requires Notes Only ($7/month) or Full Access ($10/month). You currently have Career Only access.');
              router.replace('/subscription/plans');
              return;
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
  
  if (status === 'unauthenticated' || !session) {
    return null;
  }

  return <NotesDynamic />;
  // Consider moving upsell into NotesUI for richer placement.
}