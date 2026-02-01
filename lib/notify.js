const logger = require('./logger');
const nodemailer = (() => {
  try {
    return require('nodemailer');
  } catch (e) {
    return null;
  }
})();

async function sendWebhookNotification(url, payload = {}) {
  if (!url) throw new Error('No webhook URL configured');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Webhook request failed: ${res.status} ${text}`);
    }
    return true;
  } catch (e) {
    logger.warn('webhook_notification_failed', { message: e.message, url });
    throw e;
  }
}

// Send email using SMTP (preferred) or fall back to SendGrid API if configured
async function sendEmailNotification({ to, subject, text, html }) {
  // If SMTP is configured via env, use nodemailer
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || process.env.SENDGRID_SENDER_EMAIL;

  if (smtpHost && nodemailer) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort ? parseInt(smtpPort, 10) : 587,
        secure: smtpPort && Number(smtpPort) === 465, // true for 465, false for other ports
        auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined,
      });

      const mail = {
        from: from,
        to,
        subject: subject || 'Notification from Lift',
      };
      if (html) mail.html = html;
      if (text) mail.text = text;

      const info = await transporter.sendMail(mail);
      logger.info('smtp_email_sent', { to, messageId: info.messageId });
      return true;
    } catch (e) {
      logger.warn('smtp_notification_failed', { message: e.message, to });
      throw e;
    }
  }

  // Fallback to SendGrid if provided
  const apiKey = process.env.SENDGRID_API_KEY;
  const sendgridFrom = process.env.SENDGRID_SENDER_EMAIL;
  if (apiKey && sendgridFrom) {
    const payload = {
      personalizations: [{ to: [{ email: to }] }],
      from: { email: sendgridFrom },
      subject: subject || 'Notification from Lift',
      content: [],
    };
    if (html) payload.content.push({ type: 'text/html', value: html });
    if (text) payload.content.push({ type: 'text/plain', value: text });

    try {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`SendGrid error ${res.status}: ${body}`);
      }
      return true;
    } catch (e) {
      logger.warn('sendgrid_notification_failed', { message: e.message, to });
      throw e;
    }
  }

  throw new Error('No email provider configured (set SMTP_* or SENDGRID_API_KEY)');
}

module.exports = {
  sendWebhookNotification,
  sendEmailNotification,
};
