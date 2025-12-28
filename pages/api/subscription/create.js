const prisma = require('../../../lib/prisma');
const { getServerSession } = require('next-auth/next');
const { pool, findUserByEmail } = require('../../../lib/db');
const logger = require('../../../lib/logger');
const {
  setSecureHeaders,
  validateRequest,
  trackIpRateLimit,
  trackUserRateLimit,
  auditLog,
} = require('../../../lib/security');
const { extractClientIp } = require('../../../lib/ip');

// IMPORTANT: This is a placeholder for Stripe integration
// DO NOT store or log actual payment card data
// In production, use Stripe.js to tokenize cards on the client
// and only send the token to your server

async function handler(req, res) {
  setSecureHeaders(res);
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const ip = extractClientIp(req);
  const validation = validateRequest(req);
  if (!validation.valid) {
    auditLog('subscription_create_request_blocked', null, { ip, reason: validation.reason }, 'warning');
    return res.status(400).json({ ok: false, error: 'Request rejected', reason: validation.reason });
  }
  const ipLimit = trackIpRateLimit(ip, '/api/subscription/create');
  if (!ipLimit.allowed) {
    auditLog('subscription_create_rate_limited_ip', null, { ip });
    return res.status(429).json({ ok: false, error: 'Too many requests. Try again later.' });
  }

  const { authOptions } = await import('../auth/[...nextauth]');
  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user?.email) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const { name, email, plan, priceMonthly } = req.body || {};
  
  // Basic validation
  if (!name || !email || !plan || !priceMonthly) {
    return res.status(400).json({ ok: false, error: 'Name, email, plan, and price are required' });
  }

  // Validate plan and price
  const validPlans = {
    career: 9,
    full: 10
  };
  
  if (!validPlans[plan] || validPlans[plan] !== priceMonthly) {
    return res.status(400).json({ ok: false, error: 'Invalid plan or pricing' });
  }

  try {
    // STRIPE INTEGRATION REQUIRED HERE:
    // This endpoint currently marks users as onboarded without payment processing
    // Before production deployment:
    // 
    // 1. Install Stripe: npm install stripe
    // 2. Add STRIPE_SECRET_KEY to .env
    // 3. Use Stripe Elements on client to tokenize card (never send raw card data to server)
    // 4. Receive payment method token from client
    // 5. Create Stripe customer with email
    // 6. Attach payment method to customer
    // 7. Create subscription with trial_period_days: 3
    // 8. Store Stripe customer ID and subscription ID in database
    // 9. Set up webhook to handle subscription.updated events (cancel/charge after trial)
    //
    // Example production code:
    // const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    // const customer = await stripe.customers.create({ email, name });
    // const subscription = await stripe.subscriptions.create({
    //   customer: customer.id,
    //   items: [{ price: 'price_xxxxx' }], // Your price ID
    //   trial_period_days: 3,
    //   payment_behavior: 'default_incomplete',
    //   expand: ['latest_invoice.payment_intent'],
    // });
    
    const user = prisma 
      ? await prisma.user.findUnique({ where: { email: session.user.email } })
      : await findUserByEmail(session.user.email);

    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

    const userLimit = trackUserRateLimit(user.id || session.user.id || session.user.email, '/api/subscription/create');
    if (!userLimit.allowed) {
      auditLog('subscription_create_rate_limited_user', user.id || session.user.id || session.user.email, { ip });
      return res.status(429).json({ ok: false, error: 'Too many requests for this user.' });
    }

    const trialEnd = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    // Mark user as onboarded and store plan inside preferences for enforcement
    if (prisma) {
      // Merge subscription plan into preferences JSON
      const current = user.preferences || {};
      const nextPreferences = { ...current, subscriptionPlan: plan, subscriptionPrice: priceMonthly };
      
      // Create subscription record
      const subscription = await prisma.subscription.create({
        data: {
          status: 'trialing',
          plan: plan, // 'career' or 'full'
          userId: user.id,
          // stripeCustomerId: customer.id, // Add when Stripe integrated
          // schoolId: user.schoolId || null, // if tied to a school program
        },
      });

      await prisma.user.update({
        where: { id: user.id },
        data: { onboarded: true, preferences: nextPreferences },
      });

      // Check if user has an active beta trial and convert it
      try {
        const betaTester = await prisma.betaTester.findUnique({
          where: { userId: user.id },
        });
        
        if (betaTester && betaTester.status === 'active') {
          await prisma.betaTester.update({
            where: { userId: user.id },
            data: {
              status: 'converted',
              convertedToSub: subscription.id,
            },
          });
          auditLog('beta_trial_converted_to_paid', user.id, { 
            subscriptionId: subscription.id, 
            plan,
            previousTrialType: betaTester.trialType 
          });
        }
      } catch (betaErr) {
        // Non-critical error, log but don't fail the subscription creation
        logger.warn('failed_to_convert_beta_trial', { userId: user.id, error: betaErr.message });
      }
    } else {
      // Merge subscription plan into preferences JSON (pg fallback)
      const current = user.preferences || {};
      const nextPreferences = { ...current, subscriptionPlan: plan, subscriptionPrice: priceMonthly };
      await pool.query('UPDATE "User" SET onboarded = true, preferences = $2 WHERE id = $1', [user.id, nextPreferences]);
      // Store subscription in database (matching current table columns)
      await pool.query(
        `INSERT INTO "Subscription" (id, status, plan, "createdAt") VALUES (gen_random_uuid(), $1, $2, NOW())`,
        ['trialing', plan]
      );
    }

    logger.info('subscription_trial_started', { userId: user.id, email: user.email, trialEnd: trialEnd.toISOString() });
    auditLog('subscription_trial_started', user.id, { plan, priceMonthly, trialEnd: trialEnd.toISOString(), ip });
    
    return res.json({ 
      ok: true, 
      data: { 
        message: 'Free trial started successfully',
        trialEnds: trialEnd.toISOString(),
        note: 'Payment processing not yet integrated - Stripe setup required for production'
      } 
    });
  } catch (err) {
    logger.error('subscription_create_error', { message: err.message });
    auditLog('subscription_create_error', null, { message: err.message }, 'error');
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

module.exports = handler;
