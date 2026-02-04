# Quick Reference - Common Tasks

## 🚀 Deployment

### Deploy to Vercel (Fastest)
```bash
# One-time setup
npm i -g vercel
vercel login

# Deploy to staging
vercel

# Deploy to production
vercel --prod
```

### Deploy to AWS
```bash
# Build Docker image
docker build -t lift:latest .
docker push <ECR_URL>/lift:latest

# Update ECS service
aws ecs update-service --cluster lift-cluster --service lift-service --force-new-deployment
```

---

## 🧪 Testing

### Run All Tests
```bash
npm test
```

### Run Specific Test
```bash
npm test -- security.test.js
npm run test:e2e
```

### Generate Coverage Report
```bash
npm run test:coverage
# Open coverage/index.html
```

---

## 🐛 Debugging

### View Application Errors
1. Check Sentry: https://sentry.io
2. Filter by environment and timeframe
3. Look for error trends

### Check Database
```bash
npx prisma studio
# Or via psql
psql $DATABASE_URL -c "SELECT * FROM \"User\" LIMIT 5;"
```

### Monitor API Performance
```bash
# View response times in browser console
console.log(performance.getEntriesByType('navigation')[0])

# Or check Sentry Performance tab
```

---

## 📊 Monitoring

### View Real-time Logs
```bash
# Vercel logs
vercel logs --prod

# Or view in Sentry
# https://sentry.io/organizations/lift/logs
```

### Check Service Health
```bash
curl https://yourdomain.com/api/health
# Should return: { "status": "ok", "timestamp": "..." }
```

### Database Health
```bash
# Check connections
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"

# Should be < connection_limit (default 20)
```

---

## 🔧 Database

### Run Migrations
```bash
# Create new migration
npx prisma migrate dev --name add_feature

# Apply migrations in production
npx prisma migrate deploy

# View migration status
npx prisma migrate status
```

### Backup Database
```bash
# Manual backup
pg_dump $DATABASE_URL > backup.sql

# Verify backup
psql $DATABASE_URL < backup.sql --dry-run
```

### Rollback Migration
```bash
# Note: Use with caution in production!
npx prisma migrate resolve --rolled-back migration_name
npx prisma migrate deploy
```

---

## 🔐 Security

### Rotate Secrets
```bash
# Generate new NextAuth secret
openssl rand -base64 32

# Update in environment
vercel env add NEXTAUTH_SECRET <new_value>

# Redeploy
vercel --prod
```

### Check for Vulnerabilities
```bash
npm audit
npm audit fix
```

---

## 💰 Payment (Stripe)

### Test Payment
```bash
# Use Stripe test card
Card: 4242 4242 4242 4242
Exp: Any future date
CVC: Any 3 digits

# View in Stripe Dashboard
# https://dashboard.stripe.com
```

### Retry Failed Webhook
```bash
# In Stripe Dashboard:
# 1. Webhooks → Select endpoint
# 2. Failed requests → Click and retry
```

---

## 📧 Email

### Test Email Sending
```bash
# Create script to send test email
curl -X POST http://localhost:3000/api/auth/send-reset \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# Check SendGrid logs
# https://app.sendgrid.com/email_activity
```

### Check Email Templates
```bash
# View in SendGrid
# Settings → Mail Send Settings → Mail Send Charset
```

---

## ⚡ Performance

### Find Slow API Endpoints
1. Open Sentry → Performance
2. Sort by p95 latency
3. Identify > 1500ms endpoints

### Profile CPU Usage
```bash
node --prof server.js
node --prof-process isolate-*.log > profile.txt
# View profile.txt for bottlenecks
```

### Profile Memory
```bash
node --inspect server.js
# Open chrome://inspect in Chrome
# Take heap snapshots to find leaks
```

---

## 📱 Mobile Testing

### Test on Device
```bash
# Get local IP
ipconfig getifaddr en0  # macOS
hostname -I             # Linux

# Visit on phone
http://<YOUR_IP>:3000
```

### Responsive Design
```bash
# Chrome DevTools
# Right-click → Inspect
# Toggle device toolbar (Cmd+Shift+M)
# Test on iPhone 12, iPad, etc.
```

---

## 🚨 Emergency Procedures

### Site Down - Immediate Actions
```bash
# 1. Check Sentry for errors
curl https://sentry.io/api/0/organizations/lift/events/

# 2. Check database
psql $DATABASE_URL -c "SELECT 1;"

# 3. Check deployments
vercel list --prod

# 4. Rollback if needed
vercel --prod --previous
```

### Database Connection Issues
```bash
# Check connection pool
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"

# Increase pool if needed
# DATABASE_URL=...?connection_limit=30

# Or use PgBouncer for connection pooling
```

### Out of Memory
```bash
# Restart application
vercel redeploy

# Check for memory leaks in Sentry
# Look for trending increase in memory

# If Vercel: Check serverless function memory
```

---

## 📞 Getting Help

### Documentation
- API Reference: [docs/API.md](docs/API.md)
- Deployment: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- Runbooks: [docs/RUNBOOKS.md](docs/RUNBOOKS.md)
- Security: [docs/SECURITY_AUDIT.md](docs/SECURITY_AUDIT.md)
- Performance: [docs/PERFORMANCE.md](docs/PERFORMANCE.md)

### External Resources
- Sentry Docs: https://docs.sentry.io
- Vercel Docs: https://vercel.com/docs
- Prisma Docs: https://www.prisma.io/docs
- Next.js Docs: https://nextjs.org/docs

### Contact
- Email: williams.lift101@gmail.com
- Issues: https://github.com/[user]/Lift2.0/issues

---

## 🔄 Regular Maintenance

### Daily
- [ ] Check error rate (Sentry)
- [ ] Verify backups completed
- [ ] Monitor user reports

### Weekly
- [ ] Review performance metrics
- [ ] Check for security alerts
- [ ] Update dependencies

### Monthly
- [ ] Review cost trends
- [ ] Plan optimization work
- [ ] Update runbooks if needed

---

## 💡 Pro Tips

1. **Use environment-specific endpoints**
   ```bash
   # Development
   npx prisma studio
   
   # Production
   heroku pg:psql --app lift-prod
   ```

2. **Quick test of critical features**
   ```bash
   npm run test:e2e -- auth.spec.ts
   ```

3. **Verify deployment before promoting**
   ```bash
   vercel preview-deployment
   # Test staging URL before --prod
   ```

4. **Monitor in real-time**
   ```bash
   # Watch logs
   vercel logs --tail
   ```

5. **Cache busting for static assets**
   ```javascript
   // next.config.js
   images: { unoptimized: false }
   swcMinify: true
   ```

---

**Last Updated:** December 2024  
**Status:** Ready for use  
**Questions?** Check docs/ folder or contact williams.lift101@gmail.com
