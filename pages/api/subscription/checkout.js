const stripe = require('../../../lib/stripe');
const prisma = require('../../../lib/prisma');
const { getServerSession } = require('next-auth/next');
const logger = require('../../../lib/logger');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { authOptions } = await import('../auth/[...nextauth]');
  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user?.email) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  if (!stripe) {
    return res.status(503).json({ ok: false, error: 'Stripe not configured. Contact support.' });
  }

  const { plan } = req.body || {};
  
  // Validate plan
  const validPlans = {
    career: { price: process.env.STRIPE_PRICE_CAREER, amount: 900, name: 'Career Only' },
    full: { price: process.env.STRIPE_PRICE_FULL, amount: 1000, name: 'Full Access' }
  };
  
  if (!validPlans[plan]) {
    return res.status(400).json({ ok: false, error: 'Invalid plan' });
  }

  const planConfig = validPlans[plan];

  try {
    const user = await prisma.user.findUnique({ 
      where: { email: session.user.email },
      select: { id: true, email: true, name: true }
    });

    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

    // Check if user already has an active subscription
    const existingSub = await prisma.subscription.findFirst({
      where: { 
        stripeCustomerId: { not: null },
        status: { in: ['active', 'trialing'] }
      }
    });

    if (existingSub) {
      return res.status(400).json({ ok: false, error: 'You already have an active subscription' });
    }

    // Create or retrieve Stripe customer
    const customers = await stripe.customers.list({
      email: user.email,
      limit: 1
    });

    let customer;
    if (customers.data.length > 0) {
      customer = customers.data[0];
    } else {
      customer = await stripe.customers.create({
        email: user.email,
        name: user.name || undefined,
        metadata: { userId: user.id }
      });
    }

    // Create Checkout Session with 3-day trial
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: planConfig.price,
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: 3,
        metadata: {
          userId: user.id,
          plan: plan
        }
      },
      success_url: `${process.env.NEXTAUTH_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXTAUTH_URL}/subscription/plans`,
      metadata: {
        userId: user.id,
        plan: plan
      }
    });

    logger.info('checkout_session_created', { 
      userId: user.id, 
      sessionId: checkoutSession.id, 
      plan 
    });

    return res.json({ 
      ok: true, 
      data: { 
        sessionId: checkoutSession.id,
        url: checkoutSession.url
      } 
    });
  } catch (err) {
    logger.error('checkout_creation_error', { message: err.message, stack: err.stack });
    return res.status(500).json({ ok: false, error: 'Failed to create checkout session' });
  }
}
