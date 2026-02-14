// pages/Notes.js

import dynamic from 'next/dynamic';

const NotesDynamic = dynamic(() => import('./NotesUI'), {
  ssr: false,
  loading: () => <p>Loading Note Generator...</p>
});

export default function Notes() {
  return <NotesDynamic />;
}

export async function getServerSideProps(context) {
  const { req, res } = context;
  try {
    const { getServerSession } = await import('next-auth/next');
    const { authOptions } = require('../lib/authOptions');
    const session = await getServerSession(req, res, authOptions);

    if (!session || !session.user?.email) {
      return { redirect: { destination: '/login', permanent: false } };
    }

    const prisma = require('../lib/prisma');
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 }, betaTester: true }
    });

    if (!user) return { redirect: { destination: '/signup', permanent: false } };
    if (!user.onboarded) return { redirect: { destination: '/onboarding', permanent: false } };

    const hasSubscription = Boolean(
      (user.subscriptions && user.subscriptions.length > 0 && ['active'].includes(user.subscriptions[0].status)) ||
      (user.preferences && user.preferences.subscriptionPlan)
    );

    const beta = user.betaTester;
    
    // RECOVERY: If beta is marked 'pending' but user has actually paid, auto-fix status
    if (beta && beta.status === 'pending') {
      const stripe = require('../lib/stripe');
      let shouldAutoActivate = false;
      
      if (stripe) {
        try {
          const paymentIntents = await stripe.paymentIntents.list({
            limit: 100,
            metadata: {
              userId: user.id,
              betaTesterId: beta.id
            }
          });
          
          shouldAutoActivate = paymentIntents.data.some(pi => 
            pi.status === 'succeeded' || pi.status === 'processing'
          );
        } catch (e) {
          console.warn('Failed to check Stripe for beta recovery:', e.message);
        }
      }
      
      if (shouldAutoActivate) {
        await prisma.betaTester.update({
          where: { id: beta.id },
          data: { status: 'active' }
        }).catch(e => console.warn('Failed to auto-recover beta status:', e.message));
        
        // Fetch updated beta data
        const updatedBeta = await prisma.betaTester.findUnique({
          where: { id: beta.id }
        });
        
        if (updatedBeta) {
          Object.assign(beta, updatedBeta);
        }
      }
    }
    
    // Beta access requires: active status, valid trial period, and confirmed payment
    const betaActive = Boolean(
      beta &&
      beta.status === 'active' &&
      new Date(beta.trialEndsAt) > new Date() &&
      beta.id // ID exists only if payment was successfully processed via webhook
    );
    
    // School code members get instant access
    const hasSchoolAccess = Boolean(user.schoolId);

    if (!hasSubscription && !betaActive && !hasSchoolAccess) {
      return { redirect: { destination: '/subscription/plans', permanent: false } };
    }

    return { props: {} };
  } catch (err) {
    return { props: {} };
  }
}