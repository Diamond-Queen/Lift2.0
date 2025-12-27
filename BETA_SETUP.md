# Beta Program Implementation Guide

## Quick Start

### 1. Apply Prisma Migration
Before the app can use the beta features, you need to create the database migration:

```bash
# Generate and apply migration
npx prisma migrate dev --name add_beta_tester_model

# Or if you want to manually approve the changes
npx prisma migrate dev
```

This creates the `BetaTester` table and adds the relationship to `User`.

### 2. Update Environment Variables
Make sure you have these in your `.env` file (add if missing):
```
# Already exists - confirm:
NEXTAUTH_SECRET=your_secret_here
NEXTAUTH_URL=http://localhost:3000  # or your production URL

# Optional - for email notifications (future):
EMAIL_FROM=noreply@lift.dev
SUPPORT_EMAIL=beta@lift.dev
```

### 3. Test the Flow

#### Test School Beta Signup:
1. Go to `http://localhost:3000/signup`
2. Create a new account
3. Should redirect to `/beta-signup`
4. Select "🏫 School Beta (14 days)"
5. Fill in form and submit
6. Should see success message and redirect to `/dashboard`
7. Dashboard should show blue banner: "🎉 Beta Trial Active - School Trial: 14 days remaining"

#### Test Social Beta Signup:
1. Repeat above but select "🚀 Social Beta (3-4 days)"
2. Dashboard should show: "🌟 Social Beta Trial Active - Social Beta: 4 days remaining"

#### Test Trial Expiration (for testing):
1. Direct database update to test (change trialEndsAt to past date):
```sql
UPDATE "BetaTester" 
SET "trialEndsAt" = NOW() - INTERVAL '1 day'
WHERE "userId" = 'user-id-here';
```
2. Refresh dashboard - should show orange banner: "⏰ Trial Expired"
3. Try accessing pages - should prompt to upgrade

#### Test Existing User Joining Beta:
1. Log in as existing user
2. Visit `/beta-signup`
3. Should show form with trial type selection
4. Should allow enrollment in beta

### 4. Configure for Production

#### Update Support Email
Edit `pages/beta-signup.jsx` line ~320:
```jsx
<a href="mailto:beta@lift.dev" style={{ color: "var(--primary-color)" }}>
  beta@lift.dev
</a>
```
Change to your actual support email.

#### Trial Duration Customization
Edit `pages/api/beta/register.js` lines ~75-85:
```javascript
// Adjust these based on your strategy:
if (trialType === 'school') {
  // 14 days for schools
  trialEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
} else {
  // 4 days for social (or 3, adjust as needed)
  trialEndsAt = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
}
```

#### Enable Access Controls (Optional)
Add checks in route handlers to enforce trial expiration:

```javascript
// In any protected API route:
const { userHasAccess } = require('../../lib/trial');

export default async function handler(req, res) {
  const session = await getSession({ req });
  if (!session) return res.status(401).json({ ok: false });

  const hasAccess = await userHasAccess(session.user.id);
  if (!hasAccess) {
    return res.status(403).json({ 
      ok: false, 
      error: 'Trial expired or no active subscription',
      requiresUpgrade: true 
    });
  }
  
  // Continue with endpoint...
}
```

### 5. Stripe Integration (When Ready)

Once your Stripe account is open, update `/api/subscription/create.js`:

```javascript
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// In the POST handler:
const customer = await stripe.customers.create({
  email: user.email,
  name: user.name,
});

const subscription = await stripe.subscriptions.create({
  customer: customer.id,
  items: [{ price: process.env.STRIPE_PRICE_ID_FULL }], // or CAREER
  trial_period_days: 0, // No trial since beta already provided one
  payment_behavior: 'default_incomplete',
  expand: ['latest_invoice.payment_intent'],
});

// Store in database
await prisma.subscription.update({
  where: { id: subscriptionId },
  data: { 
    stripeCustomerId: customer.id,
    // ... other fields
  },
});
```

## Features Implemented

### ✅ Core Beta Features
- [x] Database schema for beta tester tracking
- [x] Beta signup page with trial type selection
- [x] Trial registration API endpoint
- [x] Trial status checking API
- [x] Dashboard integration showing trial info
- [x] Trial expiration detection
- [x] Subscription conversion from trial
- [x] Support for both school (14-day) and social (4-day) trials
- [x] New user account creation during beta signup
- [x] Existing user beta enrollment

### 🔄 Integration Points
- [x] Sign-up flow redirects to beta signup
- [x] Dashboard shows trial status
- [x] Subscription creation marks trial as converted
- [x] Trial utilities library for use in other components

### 📊 What's Missing (For Later)
- [ ] Email notifications (trial ending soon, expired, etc.)
- [ ] Admin dashboard to view beta program metrics
- [ ] Feature restrictions during trial
- [ ] Coupon codes for beta converts
- [ ] Social media share integration for viral beta
- [ ] Bulk school code generation for institutional trials

## File Structure

```
Lift2.0/
├── pages/
│   ├── beta-signup.jsx          ✨ New - Beta signup form
│   ├── trial-access.jsx         ✨ New - Access gate page
│   ├── dashboard.jsx            ✏️  Updated - Shows trial info
│   ├── signup.jsx               ✏️  Updated - Redirects to beta
│   └── api/
│       └── beta/
│           ├── register.js      ✨ New - Beta registration
│           └── status.js        ✨ New - Trial status check
│       └── subscription/
│           └── create.js        ✏️  Updated - Converts trials
├── lib/
│   ├── trial.js                 ✨ New - Trial utilities
│   └── ... (other files)
├── prisma/
│   └── schema.prisma            ✏️  Updated - Added BetaTester
├── BETA_PROGRAM.md              ✨ New - Full documentation
└── ... (other files)
```

## Testing Checklist

Before launching to production:

### Database
- [ ] Migration applied successfully
- [ ] BetaTester table created
- [ ] User-BetaTester relationship working

### Flows
- [ ] School beta signup (14-day trial) working
- [ ] Social beta signup (4-day trial) working
- [ ] Dashboard shows correct trial days
- [ ] Trial expiration works
- [ ] Upgrade converts trial to subscription

### Pages
- [ ] `/beta-signup` loads correctly
- [ ] `/dashboard` shows trial banner
- [ ] `/trial-access` shows correct messages
- [ ] Redirect flows work properly

### API
- [ ] `/api/beta/register` creates BetaTester
- [ ] `/api/beta/status` returns correct data
- [ ] `/api/subscription/create` converts trials
- [ ] Rate limiting works
- [ ] Security validations pass

### Edge Cases
- [ ] Expired trials show correct message
- [ ] Duplicate beta enrollment prevented
- [ ] Password validation works for new signups
- [ ] Email normalization consistent
- [ ] Timezone handling for trial end dates

## Support & Troubleshooting

### Common Issues

**"BetaTester relation not found"**
- Run `npx prisma migrate dev`
- Restart app
- Clear Prisma cache: `rm -rf node_modules/.prisma`

**"Cannot read properties of null (reading 'user')"**
- Ensure user is authenticated before accessing `/beta-signup`
- Check NextAuth session configuration

**"Trial days showing negative**
- Check server timezone vs client timezone
- Convert to UTC in database

**User not redirected after signup**
- Check browser console for fetch errors
- Verify `/beta-signup` page loads correctly
- Check NextAuth session is established

## Next Steps

1. ✅ Deploy this code
2. ✅ Run Prisma migration
3. ✅ Test all flows locally
4. ✅ Deploy to staging
5. ✅ Test in staging environment
6. ✅ Create admin dashboard (optional)
7. ✅ Set up email notifications (optional)
8. ✅ Launch to production
9. ✅ Create social media campaign
10. ✅ Monitor conversion rates

## Questions?

Refer to [BETA_PROGRAM.md](./BETA_PROGRAM.md) for detailed documentation.
