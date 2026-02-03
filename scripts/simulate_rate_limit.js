const { trackIpRateLimit, unblockIp } = require('../lib/security');

function simulate(ip, endpoint, attempts) {
  console.log(`\nSimulating ${attempts} requests from ${ip} to ${endpoint}`);
  for (let i = 1; i <= attempts; i++) {
    const res = trackIpRateLimit(ip, endpoint);
    if (i <= 15 || i % 10 === 0 || !res.allowed) {
      console.log(`[${endpoint}] #${i} -> allowed=${res.allowed} reason=${res.reason || 'ok'} count=${res.count} limit=${res.limit || 'N/A'}${res.retryAfter ? ' retryAfter='+res.retryAfter+'s' : ''}`);
    }
    // small artificial pause to mimic burst spacing - synchronous so no real wait
  }
}

// Run soft-throttle endpoint test
simulate('::ffff:127.0.0.1', '/api/generate', 250);

// Reset any limiter state for the second test by unblocking/unsetting
try { unblockIp('::ffff:127.0.0.1'); } catch(e){}

// Run hard-block endpoint test
simulate('::ffff:127.0.0.1', '/api/auth/register', 50);

console.log('\nSimulation complete.');
