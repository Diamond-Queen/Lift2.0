# Data Failure Tracking Implementation Guide

## Quick Start: What to Monitor

### 🔴 CRITICAL (Alert Immediately)
These failures require immediate attention and should trigger paging:

1. **Database Connection Failures**
   ```javascript
   // lib/db.js
   pool.on('error', (err) => {
     logger.error('db_pool_error', { 
       message: err.message,
       severity: 'CRITICAL'
     });
     // Send alert to Slack/PagerDuty
     fetch(process.env.CRITICAL_ALERT_WEBHOOK, {
       method: 'POST',
       body: JSON.stringify({ alert: 'Database pool error', error: err.message })
     });
   });
   ```

2. **Authentication System Down**
   ```javascript
   // pages/api/auth/[...nextauth].js
   catch (err) {
     logger.error('auth_system_failure', {
       message: err.message,
       severity: 'CRITICAL'
     });
   }
   ```

3. **Payment Processing Failures**
   ```javascript
   // pages/api/subscription/checkout.js
   try {
     const session = await stripe.checkout.sessions.create({...});
   } catch (err) {
     logger.error('stripe_checkout_error', {
       error: err.message,
       severity: 'CRITICAL'
     });
   }
   ```

4. **API Cascade Failures** (Multiple endpoints down)
   ```javascript
   // Monitor: if 3+ endpoints fail in 5 min, escalate
   const recentErrors = await getErrorsInTimeWindow('5min');
   if (recentErrors.filter(e => e.type === 'api_error').length >= 3) {
     logger.error('cascade_failure_detected', { severity: 'CRITICAL' });
   }
   ```

5. **Security Incidents** (Unauthorized access)
   ```javascript
   // lib/security.js
   if (failedAttempts >= 5) {
     logger.error('security_incident_lockout', {
       email: user.email,
       ip: clientIp,
       severity: 'CRITICAL'
     });
   }
   ```

---

## Medium Priority Failures (Daily Review)

### AI Generation Failures
```javascript
// lib/ai.js - already logs timeouts
logger.warn('ai_failure', {
  feature: 'career',
  ai_provider: 'openai',
  reason: 'timeout',
  fallback_used: true
});
```

Track: How many timeouts per feature? Which provider fails most?

### Session/Auth Issues
```javascript
// pages/beta-signup.jsx
if (!s || !s.user) {
  logger.warn('session_stabilization_failure', {
    attempts: i,
    reason: 'session not available'
  });
}
```

Track: Do users see "not authenticated" errors? Session timeout rate?

### Rate Limiting Triggers
```javascript
// lib/security.js - already logs
auditLog('beta_register_rate_limited', null, { ip });
```

Track: Which IPs are being limited? Is it legitimate spike or attack?

### Email/Notification Failures
```javascript
// Any email-sending code
fetch(FORMSPREE_ENDPOINT).catch(err => {
  logger.warn('formspree_failure', { message: err.message });
});
```

Track: How often does Formspree fail? Need fallback?

### Data Consistency Errors
```javascript
// pages/api/beta/register.js
const existing = await prisma.betaTester.findUnique({...});
if (existing && user.betaTester !== existing) {
  logger.error('data_consistency_error', {
    expected: existing.id,
    actual: user.betaTester?.id,
    severity: 'WARNING'
  });
}
```

---

## Low Priority (Weekly Review)

### Cache Performance
```javascript
// lib/cache.js
const cacheHit = cache.get(key) !== null;
logger.track('cache_performance', {
  key,
  hit: cacheHit,
  ttl: 5 * 60 // 5 minutes
});
```

### Slow Endpoints
```javascript
// API response tracking
const startTime = Date.now();
// ... handle request ...
const duration = Date.now() - startTime;
if (duration > 1000) { // > 1 second
  logger.warn('slow_endpoint', {
    endpoint: req.url,
    duration_ms: duration
  });
}
```

### Unused Features
```javascript
// Track feature adoption
logger.track('feature_used', {
  feature: 'flashcards',
  user_id: userId
});
// Weekly: which features have 0 users?
```

---

## Logging Best Practices

### What to Log
✅ DO log:
- Error messages and stack traces
- User ID (or session ID if not logged in)
- Timestamp
- Affected resource (endpoint, feature, user)
- Recovery action taken (fallback used? retry attempted?)

❌ DON'T log:
- Passwords or API keys
- Full credit card numbers
- Personal data (phone, address)
- Raw request/response bodies (too large)

### Example Good Log
```javascript
logger.error('api_timeout', {
  endpoint: '/api/career',
  duration_ms: 10050,
  user_id: session.user.id, // hashed in transit
  fallback_used: 'template',
  retry_count: 2,
  timestamp: new Date().toISOString()
});
```

### Example Bad Log
```javascript
logger.error('error', {
  message: err.toString(), // unclear
  body: req.body, // too much data
  apiKey: process.env.OPENAI_API_KEY, // SECURITY RISK
  user: { email: 'user@example.com', phone: '555-1234' } // PII
});
```

---

## Integration Checklist

### Phase 1: Logging Infrastructure (Now)
- [x] lib/logger.js handles error logging
- [x] lib/security.js tracks auth failures
- [x] API endpoints log errors on catch
- [x] Status: 70% complete (add more tracking)

### Phase 2: Centralized Collection (1-2 weeks)
- [ ] Create `/api/analytics/track` endpoint
  ```javascript
  // pages/api/analytics/track.js
  export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();
    
    const { event, data } = req.body;
    
    // Log to database/file
    await db.analytics.create({
      event,
      data: JSON.stringify(data),
      timestamp: new Date(),
      user_id: req.session?.user?.id || null
    });
    
    res.status(200).json({ ok: true });
  }
  ```
  
- [ ] Frontend sends errors on catch
  ```javascript
  // hooks/useErrorTracking.js
  export function useErrorTracking() {
    return async (error, context) => {
      await fetch('/api/analytics/track', {
        method: 'POST',
        body: JSON.stringify({
          event: 'client_error',
          data: {
            message: error.message,
            context,
            userAgent: navigator.userAgent
          }
        })
      });
    };
  }
  ```

- [ ] Integrate with Sentry.io or DataDog
  ```javascript
  // pages/_app.js
  import * as Sentry from "@sentry/react";
  
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    environment: process.env.NODE_ENV
  });
  ```

### Phase 3: Monitoring Dashboard (2-4 weeks)
- [ ] Create dashboard page at `/admin/analytics`
  - Real-time error feeds
  - Failure rate by endpoint
  - Top errors (last 24 hours)
  - User impact analysis
  
- [ ] Setup alerts
  - Email on CRITICAL severity
  - Slack notifications for WARNING
  - Daily digest of trends

### Phase 4: ML Integration (1-2 months)
- [ ] Analyze error patterns
- [ ] Predict which users might churn
- [ ] Optimize AI model parameters based on failure modes
- [ ] Detect anomalous user behavior

---

## SQL Queries for Analysis

### Find All Errors (Last 24 Hours)
```sql
SELECT 
  event,
  severity,
  COUNT(*) as count,
  COUNT(DISTINCT user_id) as affected_users,
  AVG(CASE WHEN data->>'duration_ms' IS NOT NULL 
      THEN (data->>'duration_ms')::int ELSE NULL END) as avg_duration_ms
FROM analytics_logs
WHERE timestamp > NOW() - INTERVAL 24 HOURS
  AND event LIKE '%error%'
GROUP BY event, severity
ORDER BY count DESC;
```

### Feature Adoption
```sql
SELECT 
  data->>'feature' as feature,
  COUNT(*) as usage_count,
  COUNT(DISTINCT user_id) as unique_users,
  AVG((data->>'duration_seconds')::int) as avg_duration_seconds
FROM analytics_logs
WHERE event = 'feature_used'
  AND timestamp > NOW() - INTERVAL 7 DAYS
GROUP BY feature
ORDER BY usage_count DESC;
```

### Trial Conversion Rates
```sql
SELECT 
  data->>'trial_type' as trial_type,
  CASE WHEN data->>'converted' = 'true' THEN 'converted' ELSE 'expired' END as outcome,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY data->>'trial_type'), 2) as percent
FROM analytics_logs
WHERE event = 'trial_conversion'
  AND timestamp > NOW() - INTERVAL 30 DAYS
GROUP BY trial_type, outcome;
```

### Slowest Endpoints
```sql
SELECT 
  data->>'endpoint' as endpoint,
  COUNT(*) as request_count,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY (data->>'response_time_ms')::int) as p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (data->>'response_time_ms')::int) as p95_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY (data->>'response_time_ms')::int) as p99_ms
FROM analytics_logs
WHERE event = 'api_response_time'
  AND timestamp > NOW() - INTERVAL 7 DAYS
GROUP BY endpoint
HAVING COUNT(*) > 10
ORDER BY p99_ms DESC;
```

---

## On-Call Runbook

### Receiving a CRITICAL Alert

**Step 1: Check Severity** (< 5 min)
```
Alert received: "Database pool error"
1. SSH to production
2. Check: psql -U user -d lift -c "SELECT count(*) FROM pg_stat_activity;"
3. Is connection count > 20? → Pool exhaustion
4. Is response time > 10s? → Slow queries
```

**Step 2: Mitigate** (< 15 min)
```
If pool exhausted:
- Kill long-running queries: SELECT pg_terminate_backend(pid);
- Restart app: vercel deployments --rollback
If slow queries:
- Check table sizes: SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) FROM pg_tables;
- Add index if needed: CREATE INDEX CONCURRENTLY ...;
```

**Step 3: Investigate** (< 1 hour)
```
1. Review logs for error pattern
2. Check Sentry for stack traces
3. Identify root cause
4. Implement permanent fix
5. Document in incident report
```

**Step 4: Notify** (< 30 min)
```
Email users: "We experienced brief downtime, now resolved"
Post in status page: https://status.studentlift.org (TBD)
```

---

## Next Steps

1. **This Week**: Review DATA_COLLECTION.md, plan Phase 2
2. **Next Week**: Implement `/api/analytics/track` endpoint
3. **Month 1**: Integrate Sentry, setup dashboard
4. **Month 2**: ML analysis of error patterns
5. **Ongoing**: Weekly review of failure logs, optimize based on data

---

**Questions?** Ask in #engineering or email williams.lift101@gmail.com

---

**Last Updated**: December 30, 2025
**Status**: Ready for implementation
