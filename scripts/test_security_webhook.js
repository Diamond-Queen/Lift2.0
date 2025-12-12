#!/usr/bin/env node
/**
 * Test script to verify SECURITY_ALERT_WEBHOOK is working.
 * Simulates a security event and posts it to the webhook.
 * 
 * Usage:
 *   node scripts/test_security_webhook.js
 *   or
 *   SECURITY_ALERT_WEBHOOK=https://... node scripts/test_security_webhook.js
 */

require('dotenv').config();

const webhook = process.env.SECURITY_ALERT_WEBHOOK;

if (!webhook) {
  console.error('❌ SECURITY_ALERT_WEBHOOK not set in .env');
  console.error('   Add it to .env and try again:');
  console.error('   SECURITY_ALERT_WEBHOOK=https://hooks.slack.com/services/...');
  process.exit(1);
}

console.log(`📡 Testing webhook: ${webhook}`);
console.log('Sending test security alert...\n');

// Simulate a security audit event with Slack formatting
const testEvent = {
  text: '🔒 Lift Security Alert - Test',
  blocks: [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🔒 Lift Security Alert'
      }
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Action:*\ntest_security_alert`
        },
        {
          type: 'mrkdwn',
          text: `*Severity:*\nℹ️ info`
        },
        {
          type: 'mrkdwn',
          text: `*Timestamp:*\n${new Date().toISOString()}`
        },
        {
          type: 'mrkdwn',
          text: `*Source:*\nlift-app`
        }
      ]
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Details:*\nThis is a test alert to verify the webhook is working correctly.`
      }
    }
  ]
};

fetch(webhook, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(testEvent)
})
  .then((res) => {
    if (res.ok) {
      console.log('✅ Webhook received successfully (HTTP', res.status + ')');
      console.log('\n📊 Test event sent:');
      console.log(JSON.stringify(testEvent, null, 2));
      console.log('\n✨ You should see this alert in your Slack channel now!');
      process.exit(0);
    } else {
      console.error(`❌ Webhook returned HTTP ${res.status}`);
      console.error('   The webhook URL may be invalid or the service is down.');
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('❌ Failed to reach webhook:', err.message);
    console.error('   Check your internet connection and webhook URL.');
    process.exit(1);
  });
