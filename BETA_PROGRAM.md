# Beta Testing Program Setup

## Overview
The beta testing program has been implemented to allow schools and individual users to test Lift with free trial access before converting to paid subscriptions.

### Trial Periods
- **Schools**: 14 days of free access
- **Social/Individual Users**: 3-4 days of free access

## Architecture

### Database Schema
New `BetaTester` model added to Prisma:
```prisma
model BetaTester {
  id              String   @id @default(cuid())
  userId          String   @unique
  trialType       String   // "school" or "social"
  schoolName      String?  // For school trials
  organizationName String? // For social trials
  trialEndsAt     DateTime
  status          String   @default("active") // "active", "expired", "converted"
  convertedToSub  String?  // subscription ID if converted
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

User model updated with relationship:
```prisma
betaTester  BetaTester?
```

## User Flows

### 1. New User Sign-Up → Beta Program
1. User visits `/signup` and creates account
2. Redirected to `/beta-signup`
3. User selects trial type (School or Social)
4. Beta registration form collects:
   - Name, Email
   - School name (for schools)
   - Organization name (for social)
5. System creates BetaTester record with calculated trial end date
6. User redirected to `/dashboard`

### 2. Existing User Enrolling in Beta
1. User visits `/beta-signup` while logged in
2. Form auto-populated with their email
3. Selects trial type and organization details
4. Same flow as above

### 3. Non-Beta Users Joining Beta Later
1. User can visit `/beta-signup` anytime
2. If not logged in, they see option to create account or login
3. Once authenticated, can enroll in beta program

### 4. Trial Expiration & Payment Conversion
1. When trial expires, user is redirected or restricted from access
2. User can upgrade to paid subscription at `/subscription/plans`
3. Upon payment, trial is marked as "converted" to paid subscription
4. Access continues with paid plan

## Endpoints

### Beta Registration
- **Route**: `/api/beta/register`
- **Method**: POST
- **Auth**: Required (NextAuth session)
- **Payload**:
```json
{
  "email": "user@example.com",
  "name": "User Name",
  "trialType": "school|social",
  "schoolName": "School Name", // optional, required for school type
  "organizationName": "Org Name" // optional, for social type
}
```

### Beta Status Check
- **Route**: `/api/beta/status`
- **Method**: GET
- **Auth**: Required
- **Response**:
```json
{
  "ok": true,
  "data": {
    "trial": {
      "id": "trial-id",
      "trialType": "school|social",
      "schoolName": "School Name",
      "organizationName": "Org Name",
      "trialEndsAt": "2025-12-31T23:59:59Z",
      "daysRemaining": 10,
      "status": "trial-active|trial-expired|converted",
      "createdAt": "2025-12-21T00:00:00Z"
    }
  }
}
```

## Pages

### `/beta-signup` (pages/beta-signup.jsx)
- Handles both authenticated and unauthenticated users
- Trial type selection (School vs Social)
- Organization/school details collection
- New user account creation support
- Auto-redirects on success to `/dashboard`

### `/dashboard` (pages/dashboard.jsx)
- Updated to show trial information
- Displays "Beta Trial Active" banner with days remaining
- Shows "Trial Expired" banner if trial has ended
- Links to upgrade plans

### `/trial-access` (pages/trial-access.jsx)
- Access gate for non-trial users
- Offers option to join beta program
- Shows trial expiration message with upgrade link
- Handles various access states (not-enrolled, trial-expired, error)

## Utility Functions

### lib/trial.js
Helper functions for trial management:

- `getTrialAndSubscriptionStatus(userId)`: Get user's trial and subscription status
- `userHasAccess(userId)`: Check if user has active trial or subscription
- `convertTrialToSubscription(userId, subscriptionId)`: Mark trial as converted
- `expireTrial(userId)`: Mark trial as expired

## Subscription Integration

Updated `/api/subscription/create` to:
1. Create subscription record
2. Check if user has active beta trial
3. Convert beta trial to paid subscription if applicable
4. Log conversion for analytics

## Database Migrations

You'll need to run a Prisma migration to add the BetaTester model:
```bash
npx prisma migrate dev --name add_beta_tester_model
```

## Testing Checklist

- [ ] Create account and complete beta signup flow
- [ ] Verify trial end date is correctly calculated (14 days for school, 4 days for social)
- [ ] Check dashboard displays trial info correctly
- [ ] Verify trial status API returns correct data
- [ ] Test subscription upgrade converts trial properly
- [ ] Test trial-expired state shows correct message
- [ ] Test non-enrolled users can join beta anytime

## Configuration Notes

### Trial Duration
Adjust trial days in `/api/beta/register`:
```javascript
// For schools (currently 14 days)
trialEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

// For social (currently 4 days)
trialEndsAt = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
```

### Email Configuration
Update beta support email in components:
- Current: `beta@lift.dev` (in beta-signup.jsx)
- Update to your actual support email

## Analytics & Monitoring

Key metrics to track:
- Number of school vs social beta registrations
- Trial-to-paid conversion rate
- Average days to upgrade after trial
- Trial expiration without upgrade

Add these to your logging/analytics system for business insights.

## Future Enhancements

1. **Email Notifications**
   - Trial ending soon (1 day before)
   - Trial expired reminder
   - Upgrade incentive (special pricing)

2. **Analytics Dashboard**
   - View beta program metrics
   - Track conversion funnel
   - Cohort analysis by trial type

3. **Automated Cleanup**
   - Archive expired trials after 30 days
   - Purge old analytics data
   - Clean up incomplete signups

4. **Feature Limitations**
   - Restrict certain features during trial
   - Show usage limits/quotas
   - Upsell premium features

5. **Stripe Integration**
   - Complete payment processing
   - Automatic invoicing
   - Subscription management in Stripe dashboard
