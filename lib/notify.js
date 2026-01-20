const logger = require('./logger');

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

async function sendEmailNotification({ to, subject, text, html }) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_SENDER_EMAIL;
  if (!apiKey || !from) throw new Error('SendGrid not configured');

  const payload = {
    personalizations: [{ to: [{ email: to }] }],
    from: { email: from },
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

module.exports = {
  sendWebhookNotification,
  sendEmailNotification,
};
