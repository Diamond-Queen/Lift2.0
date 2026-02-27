const prisma = require('../../../lib/prisma');
const { sendEmailNotification } = require('../../../lib/notify');
const { getServerSession } = require('next-auth/next');
const logger = require('../../../lib/logger');
const { setSecureHeaders, auditLog } = require('../../../lib/security');

async function handler(req, res) {
  setSecureHeaders(res);
  
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Verify admin access
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
    logger.error('notify_session_error', { message: e.message });
    return res.status(500).json({ ok: false, error: 'Session error' });
  }

  // Check if user is admin (you may need to adjust this based on your auth model)
  if (!session?.user?.email || session.user.email !== 'williams.lift101@gmail.com') {
    auditLog('price_notification_unauthorized', session?.user?.email, {}, 'warning');
    return res.status(403).json({ ok: false, error: 'Admin access required' });
  }

  const { effectiveDate, oldPrices, newPrices } = req.body || {};

  if (!effectiveDate || !oldPrices || !newPrices) {
    return res.status(400).json({ 
      ok: false, 
      error: 'Missing required fields: effectiveDate, oldPrices, newPrices' 
    });
  }

  try {
    // Get all users with active subscriptions
    const usersWithSubscriptions = await prisma.user.findMany({
      where: {
        subscriptions: {
          some: {
            status: { in: ['active', 'trialing'] }
          }
        }
      },
      select: {
        id: true,
        email: true,
        name: true,
        subscriptions: {
          where: { status: { in: ['active', 'trialing'] } },
          select: { plan: true, status: true }
        }
      }
    });

    logger.info('price_notification_start', { userCount: usersWithSubscriptions.length });

    let successCount = 0;
    let failureCount = 0;
    const failures = [];

    // Send email to each subscriber
    for (const user of usersWithSubscriptions) {
      try {
        const plan = user.subscriptions[0]?.plan || 'unknown';
        const oldPrice = oldPrices[plan];
        const newPrice = newPrices[plan];

        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Important: Lift Pricing Update</h2>
            
            <p>Hi ${user.name || user.email},</p>
            
            <p>We're writing to inform you that Lift is updating its subscription pricing, effective <strong>${effectiveDate}</strong>.</p>
            
            <h3>Your Current Plan</h3>
            <p><strong>Plan:</strong> ${plan.toUpperCase()}</p>
            ${oldPrice && newPrice ? `
              <p>
                <strong>Current Price:</strong> $${(oldPrice / 100).toFixed(2)}/month<br/>
                <strong>New Price:</strong> $${(newPrice / 100).toFixed(2)}/month (starting ${effectiveDate})
              </p>
            ` : ''}
            
            <h3>Important Notes</h3>
            <ul>
              <li><strong>Your current rate is locked in.</strong> This price increase does not affect your existing subscription.</li>
              <li>If you cancel and resubscribe, you will be charged at the new price.</li>
              <li>The new pricing reflects the continued development and improved features of Lift.</li>
            </ul>
            
            <p>Thank you for being a valued Lift subscriber!</p>
            
            <p>If you have any questions, please don't hesitate to contact us.</p>
            
            <p>Best regards,<br/>The Lift Team</p>
          </div>
        `;

        const text = `
Lift Pricing Update

Hi ${user.name || user.email},

We're writing to inform you that Lift is updating its subscription pricing, effective ${effectiveDate}.

Your Current Plan: ${plan.toUpperCase()}
${oldPrice && newPrice ? `Current Price: $${(oldPrice / 100).toFixed(2)}/month\nNew Price: $${(newPrice / 100).toFixed(2)}/month (starting ${effectiveDate})` : ''}

Important Notes:
- Your current rate is locked in. This price increase does not affect your existing subscription.
- If you cancel and resubscribe, you will be charged at the new price.
- The new pricing reflects the continued development and improved features of Lift.

Thank you for being a valued Lift subscriber!

Best regards,
The Lift Team
        `;

        await sendEmailNotification({
          to: user.email,
          subject: 'Lift Pricing Update - Your Rate is Protected',
          html,
          text
        });

        successCount++;
      } catch (error) {
        failureCount++;
        failures.push({ email: user.email, error: error.message });
        logger.warn('price_notification_failed_individual', { email: user.email, error: error.message });
      }
    }

    auditLog('price_notification_sent', session.user.email, { 
      successCount, 
      failureCount, 
      totalUsers: usersWithSubscriptions.length 
    });

    return res.status(200).json({ 
      ok: true, 
      message: `Notifications sent to ${successCount} users`,
      successCount,
      failureCount,
      failures: failures.length > 0 ? failures : undefined
    });
  } catch (error) {
    logger.error('price_notification_error', { error: error.message, stack: error.stack });
    auditLog('price_notification_error', session.user.email, { error: error.message }, 'error');
    return res.status(500).json({ ok: false, error: error.message });
  }
}

export default handler;
