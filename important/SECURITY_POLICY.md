# SECURITY POLICY & FIREWALL RULES

## Overview

This document outlines the security measures, firewall rules, and protective mechanisms in place to prevent illegal activity, unauthorized access, and misuse of the Lift application.

## 1. REQUEST VALIDATION & RATE LIMITING

### 1.1 API Rate Limiting (In-Memory)
- **IP limits (1-minute window, 5-minute block on breach):**
  - Global: 100 requests/min/IP
  - Auth login/register/reset: 5 requests/min/IP
  - Content classes/items: 50 requests/min/IP
  - AI endpoints (`/api/career`, `/api/notes`): 30 requests/min/IP
  - Subscription endpoints: 10 requests/min/IP
- **User limits (1-minute window):**
  - Global: 200 requests/min/user
  - Content: 100 requests/min/user
  - AI endpoints: 50 requests/min/user
  - Subscription: 20 requests/min/user
- **Lockout:** Offending IPs are blocked for 5 minutes; requests return HTTP 429.

### 1.2 Request Validation
- Firewall rejects malicious user-agents (sqlmap, nikto, burp, zap, etc.).
- SQL injection and XSS regex detection over body + query; requests rejected with HTTP 400.
- Request body size capped at 10MB; oversized requests rejected with HTTP 413/400.
- Security headers applied to every API response (CSP, XFO, HSTS in prod, CORP/COOP/COEP).

## 2. AUTHENTICATION & AUTHORIZATION

### 2.1 Session Security
- NextAuth sessions with secure tokens (JWT fallback, database sessions when Prisma is available).
- Session max age: 7 days.
- Secure cookies: HttpOnly, SameSite=Lax, Secure in production.
- Session validation on every protected request via `getServerSession`.
- Invalid/expired sessions return HTTP 401.

### 2.2 Password Security
- Minimum 10 characters with at least one number and one special character (signup validation enforced).
- Passwords hashed with **Argon2** (`timeCost: 3`, `memoryCost: 19456`).
- Failed login attempts tracked; DB lockout kicks in after 5 failures (15 minutes) and firewall lockout after 5 failures (30 minutes).
- Login is rate-limited (5 attempts/minute per IP via firewall; additional per-user caps).

### 2.3 User Authorization
- Role-based access control (RBAC)
- Users can only access their own data
- Admin actions require elevated permissions
- Subscription status validation before content access
- School code redemption only once per account

## 3. DATABASE PROTECTION

### 3.1 SQL Injection Prevention
- Parameterized queries for all database operations
- Prisma ORM prevents direct SQL string concatenation
- Input sanitization for search/filter operations
- No user input directly interpolated into SQL
- Prepared statements for legacy SQL fallbacks

### 3.2 Data Access Control
- Queries always filter by authenticated user ID
- No queries expose data across users
- Admin-only endpoints require role verification
- Soft deletes for sensitive data (users, preferences)
- Audit logging for destructive operations

## 4. API SECURITY

### 4.1 CORS Protection
- Whitelist of allowed origins (localhost, vercel.app, lift-app.com)
- GET/HEAD/OPTIONS allowed for public data
- POST/PUT/DELETE require authentication
- Preflight requests validated
- X-Requested-With header verification

### 4.2 Request/Response Security
- CSRF tokens required for state-changing operations
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- Strict-Transport-Security headers
- Content-Security-Policy for XSS prevention

### 4.3 API Authentication
- All protected endpoints require valid NextAuth session
- Session validation via getServerSession()
- Bearer token validation for external integrations
- API key hashing and rotation
- Token expiration and refresh mechanisms

## 5. INPUT VALIDATION & XSS PREVENTION

### 5.1 Input Sanitization
- User inputs trimmed and validated
- HTML/script tags stripped from text fields
- Email validation with RFC 5322 standard
- URL validation for links and media
- File uploads scanned for malicious content

### 5.2 Output Encoding
- React's JSX automatically escapes text content
- Special characters encoded in JSON responses
- Template strings used safely
- No dangerouslySetInnerHTML without sanitization

### 5.3 Content Security Policy
- Script execution restricted to trusted sources
- Inline scripts disabled
- Style-src restricted
- Font and image sources whitelisted
- Report-uri logs CSP violations

## 6. FILE UPLOAD SECURITY

### 6.1 File Validation
- PDF and PPTX only (whitelist approach)
- Maximum file size: 25MB
- MIME type validation
- File extension verification
- Virus/malware scanning on upload (future)

### 6.2 File Storage
- Files stored outside web root
- Unique filenames with random tokens
- No direct file path exposure
- Secure download URLs with tokens
- Auto-delete after 24 hours

## 7. EXTERNAL SERVICE SECURITY

### 7.1 Stripe Integration
- PCI-DSS compliance
- No credit card data stored locally
- Webhook signature verification
- Idempotency keys for payment operations
- Test/live mode separation

### 7.2 NextAuth Configuration
- Secure callback URLs whitelist
- JWT encryption with HS256
- Provider secrets stored in environment variables
- Session secret randomization

### 7.3 AI/LLM APIs
- API keys stored in environment variables (never committed)
- Request signing and verification
- Rate limiting on external API calls
- Cost control and quota management
- Sensitive data filtering before API calls

## 8. ENVIRONMENT & CONFIGURATION

### 8.1 Secrets Management
- All API keys in .env.local (never in repo)
- Environment-specific configurations
- Secret rotation policies
- No defaults for critical secrets
- Automated detection of exposed secrets

### 8.2 Error Handling
- Generic error messages to users
- Detailed logs server-side only
- No stack traces exposed to clients
- Error codes for debugging
- Null/undefined checks before use

### 8.3 Logging & Monitoring
- Audit logging for security events (rate limit blocks, auth successes/failures, webhook issues).
- Failed authentication attempts and lockouts recorded server-side.
- Suspicious/malicious request patterns logged with IP and reason.
- Access attempts on sensitive endpoints tracked for investigation.

## 9. DENIAL OF SERVICE (DoS) PROTECTION

### 9.1 Request Throttling
- IP-based rate limiting
- User session rate limiting
- Per-endpoint throttling
- Exponential backoff for retries
- Circuit breaker patterns

### 9.2 Computational Limits
- API request timeouts (30 seconds)
- Database query timeouts
- AI API call limits (cost control)
- Concurrent request limits per user
- Background job timeouts

### 9.3 DDoS Mitigation
- Cloudflare DDoS protection
- WAF rules for common attacks
- IP reputation scoring
- Automatic blocking of suspicious IPs
- Rate limit escalation for repeat offenders

## 10. SPECIFIC ILLEGAL ACTIVITY BLOCKING

### 10.1 Fraud Prevention
- Subscription duplicate prevention
- School code redemption: one per account
- Refund fraud detection
- Payment method validation
- Account age verification

### 10.2 Hacking & Exploitation Prevention
- Vulnerability scanning (OWASP Top 10)
- Dependency vulnerability checks
- Security headers enforced
- No debug information exposed
- Source maps excluded from production

### 10.3 Data Theft Prevention
- User data encryption at rest (future)
- Transport encryption (HTTPS only)
- API response filtering (no sensitive fields)
- Database backup encryption
- Secure deletion of user data on request

### 10.4 Account Abuse Prevention
- Account creation rate limiting (5 per minute per IP via firewall).
- Email uniqueness enforced; duplicates rejected.
- Login abuse protection: per-IP throttling plus account lockouts after repeated failures.
- Suspicious request patterns (SQLi/XSS/scan UAs) blocked by firewall.

## 11. MONITORING & ENFORCEMENT

### 11.1 Real-time Alerts
- Failed authentication attempts
- Rate limit breaches
- Unusual API activity
- Large data exports
- Admin account access

### 11.2 Investigation Tools
- IP tracking and geolocation
- Session activity logs
- API request history
- Database change audit
- User behavior analysis

### 11.3 Enforcement Actions
- Account suspension (immediate)
- IP blocking (24-48 hours)
- Data purge from violators
- Legal notice generation
- Law enforcement referral

## 12. UPDATES & COMPLIANCE

### 12.1 Regular Security Audits
- Monthly code reviews
- Quarterly penetration testing
- Annual third-party security assessment
- Dependency updates and patching
- Security training for developers

### 12.2 Compliance Standards
- GDPR compliance
- CCPA compliance
- PCI-DSS for payment processing
- OWASP Top 10 mitigation
- CWE vulnerability prevention

## 13. INCIDENT RESPONSE

### 13.1 Breach Protocol
1. Immediate containment
2. Forensic investigation
3. User notification (within 48 hours)
4. Evidence preservation
5. Law enforcement contact
6. Remediation & patching

### 13.2 Communication
- Status page updates
- User notification emails
- Transparent incident reports
- Recommended actions for affected users
- Public disclosure timeline

---

**This security policy is actively enforced and violations are prosecuted to the fullest extent of the law.**

**Lift Technologies & Jamyiah Williams - Security First**

**Last Updated: December 13, 2025**
