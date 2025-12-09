# Stripe Setup Instructions

## 1. Create Stripe Account
Visit https://dashboard.stripe.com and create an account (use test mode for development)

## 2. Get API Keys
From Dashboard > Developers > API Keys:
- Copy **Secret key** (starts with `sk_test_...`)
- Copy **Publishable key** (starts with `pk_test_...`)

## 3. Create Products & Prices
From Dashboard > Products > Add Product:

**Career Only Plan:**
- Name: Career Only
- Price: $9/month (recurring)
- Copy the Price ID (starts with `price_...`)

**Full Access Plan:**
- Name: Full Access
- Price: $10/month (recurring)
- Copy the Price ID (starts with `price_...`)

## 4. Set Environment Variables
Add to `.env`:
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_PRICE_CAREER=price_...
STRIPE_PRICE_FULL=price_...
```

## 5. Set Up Webhook (for local testing)
Install Stripe CLI:
```bash
brew install stripe/stripe-cli/stripe
# or download from https://stripe.com/docs/stripe-cli
```

Login to Stripe:
```bash
stripe login
```

Forward webhooks to local server:
```bash
stripe listen --forward-to localhost:3000/api/subscription/webhook
```

Copy the webhook signing secret (starts with `whsec_...`) and add to `.env`:
```
STRIPE_WEBHOOK_SECRET=whsec_...
```

## 6. Run Migration
```bash
npx prisma migrate dev --name add_subscription_user_link
```

## 7. Test Subscription Flow
1. Start dev server: `npm run dev`
2. Sign up for new account
3. Choose "Individual Subscription" from onboarding
4. Select a plan
5. Use test card: `4242 4242 4242 4242` (any future date, any CVC)
6. Complete checkout
7. Verify subscription created in Stripe Dashboard
8. Verify user marked as `onboarded` in database

## 8. Production Deployment
1. Switch to live mode in Stripe Dashboard
2. Create live Products & Prices
3. Update environment variables with live keys
4. Set up production webhook endpoint:
   - Dashboard > Developers > Webhooks > Add endpoint
   - URL: `https://yourdomain.com/api/subscription/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.*`, `invoice.*`
   - Copy webhook signing secret to production env

## Test Cards
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- Auth required: `4000 0025 0000 3155`

## Webhook Events Handled
- ✅ `checkout.session.completed` - User completes checkout
- ✅ `customer.subscription.created` - Subscription created
- ✅ `customer.subscription.updated` - Status/trial changes
- ✅ `customer.subscription.deleted` - Cancellation
- ✅ `invoice.payment_succeeded` - Payment successful
- ✅ `invoice.payment_failed` - Payment failed (retry or cancel)
