# Deployment Guide

## Prerequisites

- Node.js 18+
- PostgreSQL 13+
- Redis (optional, for caching)
- Stripe account
- Sentry account
- AWS/Vercel account (for hosting)

## Environment Setup

### 1. Database Setup

```bash
# Create PostgreSQL database
createdb lift_production

# Run migrations
npx prisma migrate deploy

# Seed initial data (optional)
node scripts/sync_school_codes.js
```

### 2. Environment Variables

Create `.env.production`:

```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/lift_production
SHADOW_DATABASE_URL=postgresql://user:password@host:5432/lift_production_shadow

# NextAuth
NEXTAUTH_URL=https://yourdomain.com
NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_PRICE_BETA=price_...
STRIPE_PRICE_CAREER=price_...
STRIPE_PRICE_FULL=price_...

# Sentry
SENTRY_DSN=https://...@sentry.io/...
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/... (public key)

# Email
SENDGRID_API_KEY=SG.xxx...
SENDGRID_FROM_EMAIL=noreply@lift.app

# AI
OPENAI_API_KEY=sk-...

# AWS (for file storage)
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
AWS_S3_BUCKET=lift-production

# Logging
LOG_LEVEL=info
```

### 3. Build

```bash
# Install dependencies
npm ci

# Build application
npm run build

# Run type check
npm run type-check

# Run linter
npm run lint
```

## Deployment to Vercel (Recommended)

### 1. Connect Repository

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

### 2. Configure Environment Variables in Vercel Dashboard

1. Go to Project Settings → Environment Variables
2. Add all variables from `.env.production`
3. Set to `Production` environment

### 3. Configure Database

- Vercel will auto-detect Prisma
- Create PostgreSQL instance (Vercel Postgres or external)
- Update DATABASE_URL in environment

### 4. Deploy

```bash
vercel --prod
```

## Deployment to AWS (EC2/ECS)

### 1. Build Docker Image

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

RUN npm run build

EXPOSE 3000
ENV NODE_ENV=production
CMD ["npm", "start"]
```

```bash
# Build image
docker build -t lift:latest .

# Tag for ECR
docker tag lift:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/lift:latest

# Push to ECR
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/lift:latest
```

### 2. ECS Deployment

```bash
# Create ECS cluster
aws ecs create-cluster --cluster-name lift-prod

# Register task definition
aws ecs register-task-definition --cli-input-json file://task-definition.json

# Create service
aws ecs create-service --cluster lift-prod --service-name lift --task-definition lift:1 --desired-count 2
```

## Post-Deployment Checklist

### Security
- [ ] Enable HTTPS/SSL certificate
- [ ] Configure CORS headers
- [ ] Set up Web Application Firewall (WAF)
- [ ] Enable DDoS protection
- [ ] Configure security headers (CSP, HSTS, etc.)
- [ ] Enable database encryption at rest
- [ ] Set up automated backups
- [ ] Enable audit logging

### Monitoring
- [ ] Verify Sentry integration working
- [ ] Set up alerts for errors
- [ ] Configure log aggregation
- [ ] Set up performance monitoring
- [ ] Create CloudWatch dashboards (AWS)

### Testing
- [ ] Run smoke tests
- [ ] Verify payment flow end-to-end
- [ ] Test password reset flow
- [ ] Verify email sending
- [ ] Test file uploads/exports

### Documentation
- [ ] Document deployment process
- [ ] Create runbooks for common issues
- [ ] Document scaling procedures
- [ ] Create incident response plan

## Health Checks

### Application Health

```bash
# Check if app is running
curl https://yourdomain.com/health

# Expected response
{
  "ok": true,
  "timestamp": "2024-02-03T10:00:00Z",
  "database": "connected",
  "redis": "connected"
}
```

### Database Health

```bash
# Test connection
psql -h host -U user -d database -c "SELECT 1"
```

### Monitoring Dashboards

- **Sentry**: https://sentry.io → Projects → Lift
- **Vercel**: https://vercel.com → Projects → Lift
- **AWS CloudWatch**: https://console.aws.amazon.com → CloudWatch

## Scaling

### Horizontal Scaling

1. Increase container replicas (ECS/Vercel)
2. Add load balancer (AWS ELB)
3. Configure auto-scaling policies

### Database Scaling

1. Upgrade RDS instance type
2. Enable read replicas for read-heavy operations
3. Implement query caching with Redis

### CDN & Asset Delivery

1. Configure CloudFront for static assets
2. Enable image optimization
3. Set appropriate cache headers

## Rollback Procedures

### Vercel
```bash
# View deployment history
vercel list

# Rollback to previous deployment
vercel rollback
```

### AWS
```bash
# Update ECS service with previous image
aws ecs update-service --cluster lift-prod --service lift --force-new-deployment
```

## Backup & Disaster Recovery

### Database Backup

```bash
# Manual backup
pg_dump -h host -U user -d database > backup_$(date +%Y%m%d).sql

# Restore from backup
psql -h host -U user -d database < backup_20240203.sql
```

### Automated Backups

- Enable automated snapshots in RDS (daily)
- Set retention to 30 days
- Test restore procedures monthly

## Monitoring & Alerting

### Sentry Alerts

1. Go to Sentry Project Settings
2. Set up alert rules:
   - Alert on all errors
   - Alert on performance degradation (>2s)
   - Alert on release tracking issues

### Email Notifications

Configure alerts for:
- Database connectivity issues
- Payment processing failures
- High error rates (>5 errors/minute)
- Deployment failures

## Support

For deployment issues:
- Check `/var/log/lift/app.log` (self-hosted)
- Review Sentry dashboard
- Check application health endpoint
- Review CloudWatch logs
- Contact: williams.lift101@gmail.com
