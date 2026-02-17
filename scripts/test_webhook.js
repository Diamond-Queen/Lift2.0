#!/usr/bin/env node
/**
 * Test Slack webhook connectivity
 * Usage: node scripts/test_webhook.js
 */

const webhookUrl = process.env.SECURITY_ALERT_WEBHOOK;

if (!webhookUrl) {
  console.error('❌ SECURITY_ALERT_WEBHOOK environment variable not set');
  console.log('\nSet it with:');
  console.log('export SECURITY_ALERT_WEBHOOK=https://hooks.slack.com/services/YOUR/WEBHOOK/URL');
  process.exit(1);
}

console.log('🧪 Testing Slack webhook connectivity...\n');
console.log(`📍 Webhook: ${webhookUrl}`);
console.log(`⏱️  Timeout: 6 seconds per attempt\n`);

async function testWebhook() {
  const message = {
    text: '🧪 Test Alert - Lift Webhook Connectivity',
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🧪 Test Alert'
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Status:* Testing webhook connectivity\n*Timestamp:* ${new Date().toISOString()}\n*Source:* CLI Test Script`
        }
      }
    ]
  };

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log(`\n🔄 Attempt ${attempt}...`);
      const startTime = Date.now();
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout after 6s')), 6000);
      });

      const fetchPromise = fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message)
      });

      const res = await Promise.race([fetchPromise, timeoutPromise]);
      const elapsed = Date.now() - startTime;

      console.log(`   Response time: ${elapsed}ms`);
      console.log(`   Status: ${res.status} ${res.statusText}`);

      if (res.ok) {
        console.log('\n✅ Webhook is working correctly!');
        console.log('Security alerts will be delivered to Slack.');
        process.exit(0);
      } else {
        const body = await res.text().catch(() => '(no response body)');
        console.log(`   Body: ${body}`);
        
        if (res.status >= 500 && attempt < 2) {
          console.log('   → Server error, will retry...');
          await new Promise(r => setTimeout(r, 500));
          continue;
        }
      }
    } catch (err) {
      const elapsed = Date.now() - startTime;
      console.log(`   ❌ Failed after ${elapsed}ms: ${err.message}`);
      
      if (attempt < 2) {
        console.log('   → Will retry in 500ms...');
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  console.log('\n❌ Webhook test failed!');
  console.log('\nPossible causes:');
  console.log('  1. Webhook URL is incorrect');
  console.log('  2. Network connectivity issues');
  console.log('  3. Slack webhook URL has expired');
  console.log('  4. Firewall is blocking requests to Slack');
  console.log('\nTroubleshooting:');
  console.log('  • Verify webhook URL: echo $SECURITY_ALERT_WEBHOOK');
  console.log('  • Test with curl: curl -X POST $SECURITY_ALERT_WEBHOOK -d \'{...}\'');
  console.log('  • Check Slack workspace: https://api.slack.com/apps');
  process.exit(1);
}

testWebhook();
