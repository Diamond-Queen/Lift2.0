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
        user: { select: { email: true, name: true } }
      }
    });

    if (!betaTester) {
      return res.status(200).json({
        ok: true,
        data: { trial: null },
      });
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
            await sendWebhookNotification(webhookUrl, notifyPayload);
            notified = true;
            logger.info('beta_one_day_webhook_sent', { userId: betaTester.userId });
          } catch (e) {
            logger.warn('beta_one_day_webhook_error', { message: e.message });
          }
        }

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
          }
        }

        // If we successfully notified via webhook or email, mark tester to avoid duplicate sends.
        if (notified) {
          prisma.betaTester.update({ where: { id: betaTester.id }, data: { status: 'active_notified' } }).catch(e => {
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
