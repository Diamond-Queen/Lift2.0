const prisma = require('../../../lib/prisma');
const { getServerSession } = require('next-auth/next');
const { setSecureHeaders, auditLog } = require('../../../lib/security');
const logger = require('../../../lib/logger');
const { sendWebhookNotification, sendEmailNotification } = require('../../../lib/notify');

async function handler(req, res) {
  setSecureHeaders(res);

  // Check if Prisma client is available
  if (!prisma) {
    logger.error('prisma_client_unavailable', { error: 'Prisma client failed to initialize' });
    return res.status(500).json({ ok: false, error: 'Database connection error. Please try again.' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Get authOptions - try static import first, fall back if needed
  let authOptions;
  try {
    const { authOptions: staticAuthOptions } = await import('../../../lib/authOptions');
    authOptions = staticAuthOptions;
  } catch (e) {
    logger.warn('failed_to_import_auth_options_statically', { error: e.message });
    return res.status(500).json({ ok: false, error: 'Server configuration error' });
  }

  if (!authOptions) {
    logger.error('beta_status_no_auth_options', { error: 'Failed to load authOptions' });
    return res.status(500).json({ ok: false, error: 'Server configuration error' });
  }

  let session;
  try {
    session = await getServerSession(req, res, authOptions);
  } catch (e) {
    logger.error('session_error', { message: e.message });
    return res.status(500).json({ ok: false, error: 'Session error' });
  }

  if (!session?.user?.id) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const userId = session.user?.id;
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  try {
    const betaTester = await prisma.betaTester.findUnique({
      where: { userId },
      select: {
        id: true,
        userId: true,
        trialType: true,
        schoolName: true,
        organizationName: true,
        trialEndsAt: true,
        status: true,
        createdAt: true,
        user: { select: { email: true, name: true, id: true } }
      }
    });

    if (!betaTester) {
      return res.status(200).json({
        ok: true,
        data: { trial: null },
      });
    }

    // RECOVERY: If beta tester is marked 'pending' but has actually paid via Stripe,
    // auto-fix their status to 'active'. This handles users who paid during the bug.
    if (betaTester.status === 'pending') {
      const stripe = require('../../../lib/stripe');
      
      // Check if user has a completed payment for beta in Stripe
      if (stripe) {
        try {
          // Look for one-time payments (payment intents) or subscriptions related to this user
          const paymentIntents = await stripe.paymentIntents.list({
            limit: 100,
            metadata: {
              userId: userId,
              betaTesterId: betaTester.id
            }
          });
          
          const hasPaidPaymentIntent = paymentIntents.data.some(pi => 
            pi.status === 'succeeded' || pi.status === 'processing'
          );
          
          // Also check for completed Stripe checkout sessions
          const subscriptions = await stripe.subscriptions.list({
            customer: undefined, // We'll filter by metadata
            limit: 100,
            status: 'all'
          });
          
          const hasPaidSubscription = subscriptions.data.some(sub => 
            sub.metadata?.userId === userId && 
            sub.metadata?.betaTesterId === betaTester.id &&
            (sub.status === 'active' || sub.status === 'trialing')
          );
          
          // If user has a successful payment, mark them as active now
          if (hasPaidPaymentIntent || hasPaidSubscription) {
            await prisma.betaTester.update({
              where: { id: betaTester.id },
              data: { status: 'active' }
            });
            
            logger.info('beta_status_auto_recovered', {
              userId,
              betaTesterId: betaTester.id,
              hasPaidPaymentIntent,
              hasPaidSubscription
            });
            
            // Return with updated status
            const updatedBeta = await prisma.betaTester.findUnique({
              where: { userId },
              select: {
                id: true,
                userId: true,
                trialType: true,
                schoolName: true,
                organizationName: true,
                trialEndsAt: true,
                status: true,
                createdAt: true,
                user: { select: { email: true, name: true } }
              }
            });
            
            if (updatedBeta) {
              const trialEndsAt = new Date(updatedBeta.trialEndsAt);
              const now = new Date();
              const msRemaining = trialEndsAt.getTime() - now.getTime();
              const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
              
              return res.status(200).json({
                ok: true,
                data: {
                  trial: {
                    id: updatedBeta.id,
                    status: updatedBeta.status,
                    trialType: updatedBeta.trialType,
                    schoolName: updatedBeta.schoolName,
                    organizationName: updatedBeta.organizationName,
                    trialEndsAt: updatedBeta.trialEndsAt,
                    daysRemaining: Math.max(0, daysRemaining),
                    createdAt: updatedBeta.createdAt
                  }
                }
              });
            }
          }
        } catch (e) {
          logger.warn('beta_status_stripe_recovery_failed', {
            userId,
            error: e.message
          });
          // Continue with normal flow if recovery fails
        }
      }
    }

    // Ensure dates are Date objects
    const trialEndsAt = new Date(betaTester.trialEndsAt);
    const createdAt = new Date(betaTester.createdAt);
    const now = new Date();

    // Calculate days remaining
    const msRemaining = trialEndsAt.getTime() - now.getTime();
    const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));

    // Determine trial status
    let status = betaTester.status; // Could be 'active', 'active_notified', 'converted', 'expired', etc.

    // If status is not explicitly 'converted' or 'expired', check if expired
    if (status !== 'converted' && status !== 'expired') {
      if (now > trialEndsAt) {
        status = 'expired';
        // Update status in database (async, non-blocking)
        prisma.betaTester.update({
          where: { id: betaTester.id },
          data: { status: 'expired' }
        }).catch(e => {
          logger.warn('failed_to_mark_beta_expired', { betaTesterId: betaTester.id, error: e.message });
        });
      } else if (!status || status === 'active') {
        // Only set to 'active' if status is empty or already 'active'
        // This preserves 'active_notified' and prevents duplicate notifications
        status = 'active';
      }
    }

    // If only one day remains and tester is active, send a one-day warning notification.
    try {
      if (status === 'active' && Math.max(0, daysRemaining) === 1) {
        const notifyPayload = {
          userId: betaTester.userId,
          email: betaTester.user?.email || null,
          name: betaTester.user?.name || null,
          trialType: betaTester.trialType,
          daysRemaining: Math.max(0, daysRemaining),
          trialEndsAt: trialEndsAt.toISOString(),
        };

        const webhookUrl = process.env.NOTIFY_WEBHOOK_URL || null;
        let notified = false;

        if (webhookUrl) {
          try {
            // Send webhook with timeout and no retries (we'll fall back to email if it fails)
            await sendWebhookNotification(webhookUrl, notifyPayload, { 
              timeout: 10000, 
              maxRetries: 1 
            });
            notified = true;
            logger.info('beta_one_day_webhook_sent', { userId: betaTester.userId });
          } catch (e) {
            logger.warn('beta_one_day_webhook_error', { message: e.message });
            // Don't throw - try email instead
          }
        }

        // Fallback to email if webhook didn't work
        if (!notified && process.env.SENDGRID_API_KEY && betaTester.user?.email) {
          try {
            const to = betaTester.user.email;
            const subject = 'One day left in your Lift beta trial';
            const text = `Hi ${betaTester.user?.name || ''},\n\nYour Lift beta trial ends in 1 day (${trialEndsAt.toISOString()}). Subscribe to keep using Lift without interruption.`;
            const html = `<p>Hi ${betaTester.user?.name || 'there'},</p><p>Your Lift beta trial ends in <strong>1 day</strong> (${trialEndsAt.toISOString()}). <a href=\"https://yourdomain.com/subscription/plans\">Subscribe</a> to keep using Lift without interruption.</p>`;
            await sendEmailNotification({ to, subject, text, html });
            notified = true;
            logger.info('beta_one_day_email_sent', { userId: betaTester.userId, email: to });
          } catch (e) {
            logger.warn('beta_one_day_email_error', { message: e.message });
            // Don't throw - continue to mark status update
          }
        }

        // Mark as notified ONLY if notification actually succeeded (async, non-blocking)
        // This prevents duplicate notifications on subsequent requests
        if (notified) {
          prisma.betaTester.update({ 
            where: { id: betaTester.id }, 
            data: { status: 'active_notified' } 
          }).catch(e => {
            logger.warn('failed_to_mark_beta_notified', { betaTesterId: betaTester.id, error: e.message });
          });
        }
      }
    } catch (e) {
      logger.warn('beta_one_day_notification_flow_failed', { message: e.message });
    }

    return res.status(200).json({
      ok: true,
      data: {
        trial: {
          id: betaTester.id,
          trialType: betaTester.trialType,
          schoolName: betaTester.schoolName,
          organizationName: betaTester.organizationName,
          trialEndsAt: trialEndsAt.toISOString(),
          createdAt: createdAt.toISOString(),
          daysRemaining: Math.max(0, daysRemaining),
          status,
        },
      },
    });
  } catch (err) {
    logger.error('beta_status_error', {
      message: err.message,
      code: err.code,
      userId: session.user.id,
      stack: err.stack
    });

    auditLog('beta_status_error', session.user.id, {
      message: err.message,
      code: err.code,
    }, 'error');

    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

module.exports = handler;
