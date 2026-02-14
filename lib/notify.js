const logger = require('./logger');
const nodemailer = (() => {
  try {
    return require('nodemailer');
  } catch (e) {
    return null;
  }
})();

async function sendWebhookNotification(url, payload = {}, options = {}) {
  if (!url) throw new Error('No webhook URL configured');
  
  const timeout = options.timeout || 10000; // 10 second timeout by default
  const maxRetries = options.maxRetries || 1; // No retries by default (1 attempt)
  
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Webhook request failed: ${res.status} ${text}`);
      }
      
      logger.info('webhook_notification_sent', { url, attempt });
      return true;
    } catch (e) {
      lastError = e;
      const isTimeout = e.name === 'AbortError';
      const errorType = isTimeout ? 'timeout' : 'error';
      
      if (attempt < maxRetries) {
        logger.warn('webhook_notification_retry', { 
          message: e.message, 
          url, 
          attempt, 
          maxRetries,
          errorType
        });
        // Exponential backoff: wait 1s, 2s, 4s, etc.
        await new Promise(r => setTimeout(r, Math.pow(2, attempt - 1) * 1000));
      } else {
        logger.warn('webhook_notification_failed', { 
          message: e.message, 
          url, 
          attempts: attempt,
          errorType
        });
      }
    }
  }
  
  throw lastError || new Error('Webhook notification failed');
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
