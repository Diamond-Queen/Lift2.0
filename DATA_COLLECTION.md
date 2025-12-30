# Data Collection & Failure Tracking System

## Purpose
Track all system failures, errors, and user interactions to continuously improve the Lift platform through machine learning and feature enhancement.

---

## Collection Categories

### 1. Error Tracking

#### Authentication Errors
```
event: 'auth_error'
fields:
  - error_type: (password_mismatch | invalid_email | account_not_found | lockout | session_expired)
  - ip_address: (hashed)
  - timestamp: ISO8601
  - user_id: (anonymous if not logged in)
  - retry_count: number
  - time_to_resolution: seconds
```

#### API Failures
```
event: 'api_error'
fields:
  - endpoint: string
  - method: GET|POST|PUT|DELETE
  - error_code: number
  - error_message: string
  - response_time_ms: number
  - timestamp: ISO8601
  - user_id: string (or null)
  - ai_provider: openai|anthropic|template
```

#### AI Generation Failures
```
event: 'ai_failure'
fields:
  - feature: career|cover_letter|summary|flashcard
  - ai_provider: openai|anthropic|template
  - reason: timeout|invalid_api_key|rate_limit|parsing_error
  - fallback_used: boolean
  - execution_time_ms: number
  - timestamp: ISO8601
  - user_id: string
```

#### Database Errors
```
event: 'db_error'
fields:
  - query_type: SELECT|INSERT|UPDATE|DELETE
  - table: string
  - error_message: string
  - connection_pool_size: number
  - query_time_ms: number
  - timestamp: ISO8601
```

#### Payment/Stripe Errors
```
event: 'payment_error'
fields:
  - error_type: invalid_card|insufficient_funds|declined|webhook_failure
  - stripe_error_code: string
  - amount: cents (anonymized)
  - timestamp: ISO8601
  - user_id: string
  - payment_method: card|bank_transfer
```

### 2. User Behavior Tracking

#### Feature Usage
```
event: 'feature_used'
fields:
  - feature: career|notes|flashcards|settings
  - action: create|edit|delete|view|export
  - duration_seconds: number
  - document_length: characters (approx)
  - timestamp: ISO8601
  - user_id: string
```

#### Trial Conversion
```
event: 'trial_conversion'
fields:
  - trial_type: school|social
  - days_used: number
  - features_used: array[string]
  - converted: boolean
  - timestamp: ISO8601
  - user_id: string
```

#### Session Metrics
```
event: 'session_metric'
fields:
  - session_duration_seconds: number
  - pages_visited: number
  - features_accessed: array[string]
  - api_calls: number
  - errors_encountered: number
  - timestamp: ISO8601
  - user_id: string
```

### 3. Performance Metrics

#### Page Load Times
```
event: 'page_load'
fields:
  - page: string (/dashboard, /notes, etc)
  - load_time_ms: number
  - network_latency_ms: number
  - render_time_ms: number
  - timestamp: ISO8601
  - user_id: string
```

#### API Response Times
```
event: 'api_response_time'
fields:
  - endpoint: string
  - response_time_ms: number
  - cache_hit: boolean
  - timestamp: ISO8601
  - user_id: string
```

---

## Implementation in Code

### Backend Logging (lib/logger.js)

```javascript
// Error logging
logger.error('auth_error', {
  error_type: 'password_mismatch',
  email: 'user@example.com',
  ip_address: hash(clientIp),
  timestamp: new Date().toISOString()
});

// Feature tracking
logger.track('feature_used', {
  feature: 'career',
  action: 'create',
  duration_seconds: 45,
  user_id: session.user.id
});

// AI failure
logger.warn('ai_failure', {
  feature: 'career',
  ai_provider: 'openai',
  reason: 'timeout',
  fallback_used: true
});
```

### Frontend Analytics (pages/dashboard.jsx)

```javascript
// Track feature usage
useEffect(() => {
  const startTime = Date.now();
  return () => {
    const duration = (Date.now() - startTime) / 1000;
    fetch('/api/analytics/track', {
      method: 'POST',
      body: JSON.stringify({
        event: 'feature_used',
        feature: 'dashboard',
        duration_seconds: duration,
        user_id: session.user.id
      })
    });
  };
}, []);

// Track API performance
const [loading, setLoading] = useState(false);
useEffect(() => {
  const startTime = Date.now();
  setLoading(true);
  fetch('/api/user')
    .then(res => {
      const loadTime = Date.now() - startTime;
      fetch('/api/analytics/track', {
        method: 'POST',
        body: JSON.stringify({
          event: 'api_response_time',
          endpoint: '/api/user',
          response_time_ms: loadTime
        })
      });
    })
    .finally(() => setLoading(false));
}, []);
```

---

## Data Storage

### Real-time Storage
- Logs sent to `lib/logger.js` (in-memory or file-based)
- Failures captured immediately

### Batch Processing
- Logs aggregated daily
- Sent to analytics service (DataDog, Sentry, or custom)
- Queryable database (separate from production DB)

### Retention Policy
- **Active failures**: 90 days (queryable)
- **Aggregated metrics**: 1 year (monthly summaries)
- **Sensitive data**: Hashed/anonymized (IPs, emails)

---

## Machine Learning Applications

### Pattern Detection
- Identify common failure modes
- Predict which users might churn
- Detect anomalous behavior (security threats)

### Performance Optimization
- Find slow endpoints
- Optimize cache strategies
- Adjust AI timeout thresholds

### Feature Improvement
- Which features are most used?
- Where do users get stuck?
- Which AI providers work best?

### User Segmentation
- Trial users vs subscribed
- School vs social users
- Engagement patterns

---

## Privacy & Legal

### Data Anonymization
- User IDs are never logged directly (use session IDs instead)
- IPs are hashed with salt
- Email addresses only for error context (hashed in analytics)
- No credit card information collected

### GDPR Compliance
- Users can request data deletion
- Data retention limits enforced
- Processing agreements with analytics vendors

### User Consent
Users must agree to these terms when creating account:
```
By using Lift, you consent to the collection and analysis of:
- Usage patterns (which features you use, how long, etc)
- Error logs (to improve reliability and performance)
- Performance metrics (load times, API response times)
- Aggregated analytics (trends across all users)

This data helps us:
- Fix bugs and improve performance
- Develop new features based on user needs
- Prevent fraud and security threats
- Train machine learning models to improve AI quality

All personal data is anonymized and encrypted. You can opt-out anytime in Settings.
```

---

## Critical Failures to Track (Priority)

### High Priority (Alert immediately)
1. **Database connection failures** - Indicates outage
2. **Authentication system failures** - Users can't log in
3. **Payment processing failures** - Revenue impact
4. **API cascade failures** - Multiple endpoints down
5. **Security incidents** - Unauthorized access attempts

### Medium Priority (Daily review)
1. **AI generation timeouts** - User experience degraded
2. **Session management issues** - Users logged out unexpectedly
3. **Rate limiting triggers** - Potential attack or legitimate spike
4. **Email/notification failures** - Users don't receive messages
5. **Data consistency errors** - Corruption or sync issues

### Low Priority (Weekly review)
1. **Cache misses** - Performance optimization opportunity
2. **Slow API endpoints** - Need optimization
3. **Unused features** - Candidate for deprecation
4. **Trial conversion metrics** - Business intelligence

---

## Failure Dashboard Queries

### Real-time Monitoring
```sql
-- Failures in last 1 hour
SELECT event, COUNT(*) as count, AVG(response_time_ms) as avg_time
FROM analytics_logs
WHERE timestamp > NOW() - INTERVAL 1 HOUR
AND severity IN ('error', 'warning')
GROUP BY event;

-- Top failing endpoints
SELECT endpoint, COUNT(*) as failures, AVG(response_time_ms)
FROM api_errors
WHERE timestamp > NOW() - INTERVAL 24 HOURS
GROUP BY endpoint
ORDER BY failures DESC
LIMIT 10;
```

### Daily Summary
```sql
-- Failed features yesterday
SELECT feature, reason, COUNT(*) as occurrences
FROM ai_failures
WHERE DATE(timestamp) = CURRENT_DATE - 1
GROUP BY feature, reason
ORDER BY occurrences DESC;

-- User impact analysis
SELECT 
  COUNT(DISTINCT user_id) as affected_users,
  event_type,
  COUNT(*) as total_errors
FROM user_errors
WHERE timestamp > NOW() - INTERVAL 24 HOURS
GROUP BY event_type;
```

---

## Compliance Checklist

- [ ] GDPR compliant (anonymization, retention limits)
- [ ] CCPA compliant (user opt-out, data deletion)
- [ ] SOC 2 compliance (encryption, access controls)
- [ ] Privacy Policy mentions data collection
- [ ] Terms of Service includes analytics consent
- [ ] Users can disable tracking in Settings
- [ ] Data encrypted in transit and at rest
- [ ] Regular penetration testing of logging system
- [ ] Data access logs maintained

---

## Status
- ✅ Created: 2025-12-30
- ⚠️ Requires implementation in production
- 📋 Terms of Service updated to include consent
- 🔐 Data anonymization required before deployment

---

**Next Steps:**
1. Add `/api/analytics/track` endpoint
2. Integrate with Sentry or DataDog for centralized logging
3. Create monitoring dashboard
4. Train team on failure analysis process
5. Establish on-call rotation for critical failures
