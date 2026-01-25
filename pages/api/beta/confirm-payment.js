const stripe = require('../../../lib/stripe');
const prisma = require('../../../lib/prisma');
const { getServerSession } = require('next-auth/next');
const logger = require('../../../lib/logger');
const {
  setSecureHeaders,
  validateRequest,
  auditLog,
} = require('../../../lib/security');
const { extractClientIp } = require('../../../lib/ip');

async function handler(req, res) {
  setSecureHeaders(res);
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const ip = extractClientIp(req);
  const validation = validateRequest(req);
  if (!validation.valid) {
    return res.status(400).json({ ok: false, error: 'Request rejected' });
  }

  let authOptions;
  try {
    const imported = await import('../../../lib/authOptions');
    authOptions = imported.authOptions;
  } catch (e) {
    logger.error('failed_to_import_auth_options', { error: e.message });
    return res.status(500).json({ ok: false, error: 'Server configuration error' });
  }

  let session;
  try {
    session = await getServerSession(req, res, authOptions);
  } catch (e) {
    logger.error('beta_confirm_payment_session_error', { message: e.message });
    return res.status(500).json({ ok: false, error: 'Session error' });
  }

  if (!session || !session.user?.email) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const { intentId, trialType } = req.body || {};

  if (!intentId || !trialType) {
    return res.status(400).json({ ok: false, error: 'Missing required fields' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, email: true }
    });

    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

    // Check if user is already a beta tester
    const existingBeta = await prisma.betaTester.findUnique({
      where: { userId: user.id }
    });

    if (existingBeta) {
      return res.json({ ok: true, message: 'Already a beta tester', betaTesterId: existingBeta.id });
    }

    // Dev mode handling
    if (intentId.includes('dev')) {
      const daysToAdd = trialType === 'school' ? 14 : 7;
      const trialEnds = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000);

      const betaTester = await prisma.betaTester.create({
        data: {
          userId: user.id,
          trialType,
          trialEndsAt: trialEnds,
          status: 'active'
        }
      });

      await prisma.user.update({
        where: { id: user.id },
        data: { onboarded: true }
      });

      logger.info('dev_beta_confirmed', { userId: user.id, trialType, betaTesterId: betaTester.id });
      return res.json({ ok: true, message: 'Beta access confirmed (dev mode)', betaTesterId: betaTester.id });
    }

    // Retrieve payment intent from Stripe
    if (!stripe) {
      return res.status(503).json({ ok: false, error: 'Stripe not configured' });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(intentId);

    // Check if payment succeeded
    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({ ok: false, error: 'Payment not completed', status: paymentIntent.status });
    }

    // Create beta tester record
    const daysToAdd = trialType === 'school' ? 14 : 7;
    const trialEnds = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000);

    const betaTester = await prisma.betaTester.create({
      data: {
        userId: user.id,
        trialType,
        trialEndsAt: trialEnds,
        status: 'active'
      }
    });

    // Mark user as onboarded
    await prisma.user.update({
      where: { id: user.id },
      data: { onboarded: true }
    });

    logger.info('beta_payment_confirmed', { userId: user.id, trialType, betaTesterId: betaTester.id, intentId });
    auditLog('beta_payment_confirmed', user.id, { trialType, betaTesterId: betaTester.id, ip });

    return res.json({ ok: true, message: 'Beta access confirmed', betaTesterId: betaTester.id });
  } catch (err) {
    logger.error('beta_confirm_payment_error', { message: err.message, stack: err.stack });
    auditLog('beta_confirm_payment_error', null, { message: err.message }, 'error');
    return res.status(500).json({ ok: false, error: 'Failed to confirm payment' });
  }
}

module.exports = handler;
