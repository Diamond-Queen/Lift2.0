#!/usr/bin/env node
/**
 * Check and manage blocked IPs
 * Usage: node scripts/check_blocked_ips.js [action] [ip]
 * 
 * Actions:
 *   list              - List all currently blocked IPs
 *   unblock <ip>      - Unblock a specific IP
 *   check <ip>        - Check if an IP is blocked
 */

const { 
  isIpBlocked, 
  unblockIp, 
  listTrustedIps,
  addTrustedIp,
  removeTrustedIp
} = require('../lib/security');

const action = process.argv[2];
const targetIp = process.argv[3];

// Note: In production, you need to export these functions from security.js
// For now, this is a template - you'll need to add these to security.js exports

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║          Lift IP Blocking Management Utility                 ║
╚═══════════════════════════════════════════════════════════════╝
`);

console.log('⚠️  NOTE: This is a template. The actual blocked IPs are stored in');
console.log('    memory and cannot be accessed from a separate process.');
console.log('');
console.log('To properly monitor blocked IPs, you should:');
console.log('');
console.log('1. Export blockedIps Map from lib/security.js');
console.log('2. Create an admin API endpoint to list/unblock IPs');
console.log('3. Add logging to show what triggered each block');
console.log('');
console.log('Current workaround:');
console.log('- Check server logs for [SECURITY-FIREWALL] messages');
console.log('- Add this to your .env to see blocked IP details:');
console.log('  SECURITY_ALERT_WEBHOOK=<your-webhook-url>');
console.log('');
console.log('Trusted IPs (if configured):');
const trustedIps = listTrustedIps();
if (trustedIps.length > 0) {
  trustedIps.forEach(ip => console.log(`  ✓ ${ip}`));
} else {
  console.log('  (none configured)');
}
