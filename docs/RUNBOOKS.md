# Operations Runbooks

## Common Issues & Solutions

### 1. Payment Processing Failures

**Problem:** Stripe charges declining or webhook not processing

**Steps:**
1. Check Sentry for webhook errors: `stripe_webhook_error`
2. Verify Stripe API keys in environment
3. Check Stripe logs: https://dashboard.stripe.com/logs
4. Review subscription webhook handler:
   ```bash
   grep -n "stripe.webhook" pages/api/subscription/webhook.js
   ```
5. Verify webhook endpoint is registered in Stripe dashboard
6. Re-trigger webhook:
   ```bash
   curl -X POST https://yourdomain.com/api/subscription/webhook \
     -H "stripe-signature: <test_signature>"
   ```

**Resolution:**
- Update Stripe keys if expired
- Re-register webhook endpoint
- Force reprocessing of failed payments:
  ```sql
  UPDATE "Subscription" SET status='incomplete' WHERE status='failed';
  ```

### 2. High Database Latency

**Problem:** Slow queries causing timeouts

**Diagnosis:**
```bash
# Check slow query log
SELECT query, calls, mean_time, max_time 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;
```

**Common Culprits:**
- N+1 queries in resume generation
- Missing indexes on frequently filtered columns
- Large JOIN operations

**Fixes:**
```sql
-- Add missing indexes
CREATE INDEX idx_content_items_class_id ON "ContentItem"(classId);
CREATE INDEX idx_subscriptions_user_id ON "Subscription"(userId);

-- Analyze query plans
EXPLAIN ANALYZE SELECT * FROM "User" WHERE email = $1;
```

**Optimization:**
1. Enable query result caching:
   ```javascript
   const cacheKey = `user_${userId}`;
   let user = cache.get(cacheKey);
   if (!user) {
     user = await prisma.user.findUnique({...});
     cache.set(cacheKey, user, 5 * 60 * 1000); // 5 min TTL
   }
   ```

### 3. Out of Memory (OOM) Errors

**Problem:** Node.js process crashing with memory errors

**Steps:**
1. Check memory usage:
   ```bash
   node --max-old-space-size=4096 npm start
   ```

2. Identify memory leaks in Sentry:
   - Look for `FATAL: JavaScript heap out of memory`
   - Check heap snapshots

3. Common causes:
   - Uncleared intervals/timeouts
   - Large file uploads not streaming
   - Unbounded cache growth

**Fix:**
```javascript
// Before: Loads entire file in memory
const data = fs.readFileSync(largeFile);

// After: Stream the file
const stream = fs.createReadStream(largeFile);
stream.on('data', chunk => {
  // Process chunk
});
```

### 4. Session/Authentication Issues

**Problem:** Users getting logged out unexpectedly or unable to login

**Steps:**
1. Check session configuration:
   ```javascript
   // lib/authOptions.js
   session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 7 }
   ```

2. Verify NextAuth secret is set:
   ```bash
   echo $NEXTAUTH_SECRET
   ```

3. Check cookie settings in browser:
   - Open DevTools → Application → Cookies
   - Look for `next-auth.session-token`

4. If sessions missing:
   ```sql
   SELECT * FROM "Session" ORDER BY expires DESC LIMIT 5;
   ```

**Resolution:**
- Clear browser cookies and re-login
- Restart authentication service
- Regenerate NEXTAUTH_SECRET (users will need to re-login)

### 5. Email Delivery Issues

**Problem:** Password reset/welcome emails not sending

**Steps:**
1. Verify SendGrid API key:
   ```bash
   curl -X GET "https://api.sendgrid.com/v3/mail/settings" \
     -H "Authorization: Bearer $SENDGRID_API_KEY"
   ```

2. Check email logs:
   ```bash
   tail -f logs/lift.log | grep "email"
   ```

3. Look for bounced emails:
   ```bash
   # Check SMTP response logs
   grep "5[0-9][0-9]" logs/lift.log
   ```

4. Test email endpoint:
   ```bash
   curl -X POST http://localhost:3000/api/auth/send-reset \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com"}'
   ```

**Fixes:**
- Add email to SendGrid whitelist if on restricted list
- Check email template in SendGrid dashboard
- Verify sender email is verified in SendGrid

### 6. Resume/Cover Letter Generation Failures

**Problem:** AI generation returning errors or empty responses

**Steps:**
1. Check OpenAI API status:
   ```bash
   curl -X GET "https://api.openai.com/v1/models" \
     -H "Authorization: Bearer $OPENAI_API_KEY"
   ```

2. Review Sentry errors:
   - Filter by `ai.js`
   - Look for timeout or rate limit errors

3. Check API limits:
   - Login to OpenAI: https://platform.openai.com/account/usage/overview
   - Verify quota is available

**Resolution:**
- Increase request timeout if API is slow
- Implement exponential backoff for retries:
  ```javascript
  const MAX_RETRIES = 3;
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      return await generateCompletion(...);
    } catch (e) {
      if (i < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
      }
    }
  }
  ```

### 7. Rate Limiting False Positives

**Problem:** Legitimate users getting blocked

**Steps:**
1. Check rate limit configuration:
   ```javascript
   // lib/security.js
   const MAX_REQUESTS = 30;
   const WINDOW_MS = 60 * 1000; // 1 minute
   ```

2. Identify problematic IPs:
   ```sql
   SELECT ip, COUNT(*) as attempts, MAX(timestamp) as last
   FROM "AuditLog" 
   WHERE action = 'rate_limited'
   GROUP BY ip
   ORDER BY attempts DESC;
   ```

3. Check if IP is behind corporate proxy (shared IP)

**Resolution:**
- Whitelist trusted IPs:
  ```javascript
  const WHITELIST_IPS = ['203.0.113.0', '198.51.100.0'];
  if (WHITELIST_IPS.includes(ip)) return { allowed: true };
  ```

- Increase rate limit for authenticated users:
  ```javascript
  const limit = session ? 100 : 30; // More lenient for logged-in users
  ```

### 8. Database Connection Pool Exhaustion

**Problem:** Hanging requests, "too many clients" errors

**Steps:**
1. Check current connections:
   ```sql
   SELECT datname, count(*) FROM pg_stat_activity GROUP BY datname;
   ```

2. Identify long-running queries:
   ```sql
   SELECT pid, query, query_start 
   FROM pg_stat_activity 
   WHERE query_start < now() - interval '5 minutes';
   ```

3. Review Prisma pool settings:
   ```javascript
   // lib/prisma.js
   const prisma = new PrismaClient({
     datasources: {
       db: {
         url: process.env.DATABASE_URL
           // ?connection_limit=5 for reduced pool size
       }
     }
   });
   ```

**Fix:**
- Increase pool size in connection string:
  ```
  DATABASE_URL=postgresql://user:pass@host/db?connection_limit=20
  ```
- Reduce connection timeout for idle connections
- Add connection pooler (PgBouncer):
  ```
  DATABASE_URL=postgresql://user:pass@pgbouncer:6432/db
  ```

## Performance Optimization Checklist

- [ ] Enable database query caching for frequently-accessed data
- [ ] Add Redis for session caching
- [ ] Implement CDN for static assets
- [ ] Enable Gzip compression in Next.js config
- [ ] Optimize images with Next.js Image component
- [ ] Implement lazy loading for heavy components
- [ ] Profile CPU with Node --prof
- [ ] Review slow database queries in pg_stat_statements
- [ ] Set up performance monitoring in Sentry

## Monitoring Alerts to Set Up

| Alert | Threshold | Action |
|-------|-----------|--------|
| Error Rate | > 5 errors/min | Page on-call engineer |
| Database Latency | > 500ms | Investigate slow queries |
| Memory Usage | > 80% of limit | Scale up or identify leak |
| Disk Space | < 10% free | Archive logs, add storage |
| Payment Failures | > 5% of transactions | Contact Stripe support |
| Auth Failures | > 10 per minute | Check for attacks |
| API Response Time | p95 > 2s | Identify slow endpoints |

## Emergency Procedures

### Site Down - Incident Response

1. **Assess (0-5 min)**
   - Is it a deployment issue or infrastructure?
   - Check Sentry dashboard
   - Check status page
   - Verify database connectivity

2. **Communicate (5 min)**
   - Post to status page
   - Notify team via Slack
   - Start war room call

3. **Mitigate (5-30 min)**
   - Rollback recent deployment if applicable
   - Scale up resources if under load
   - Switch to maintenance mode if needed

4. **Resolve (30+ min)**
   - Fix underlying issue
   - Verify fix in staging first
   - Deploy to production
   - Monitor for recurrence

5. **Post-Mortem (next day)**
   - Document what happened
   - Identify root cause
   - Create action items to prevent recurrence

## Support Contacts

- **On-Call**: Pagerduty (https://lift.pagerduty.com)
- **Stripe Support**: https://stripe.com/support
- **Sentry Support**: https://sentry.io/support
- **Email**: williams.lift101@gmail.com
