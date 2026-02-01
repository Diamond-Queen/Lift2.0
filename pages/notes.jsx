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
      (user.subscriptions && user.subscriptions.length > 0 && ['active', 'trialing'].includes(user.subscriptions[0].status)) ||
      (user.preferences && user.preferences.subscriptionPlan)
    );

    const beta = user.betaTester;
    const betaActive = Boolean(beta && beta.status === 'active' && new Date(beta.trialEndsAt) > new Date());

    if (!hasSubscription && !betaActive) {
      return { redirect: { destination: '/subscription/plans', permanent: false } };
    }

    return { props: {} };
  } catch (err) {
    return { props: {} };
  }
}