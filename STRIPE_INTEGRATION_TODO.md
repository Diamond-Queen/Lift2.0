# Stripe Integration TODO

## ⚠️ CRITICAL: Payment Processing Not Active

The subscription flow is currently in **development mode**. Payment cards are NOT processed, stored, or transmitted.

---

## Required Before Production

### 1. Install Stripe
```bash
npm install stripe @stripe/stripe-js @stripe/react-stripe-js
```

### 2. Environment Variables
Add to `.env`:
```
STRIPE_SECRET_KEY=sk_test_... (or sk_live_... for production)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_... (or pk_live_...)
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 3. Create Stripe Product & Price
In Stripe Dashboard:
- Create Product: "Lift Subscription"
- Create Price: $9.99/month recurring
- Copy Price ID (e.g., `price_xxxxx`)

### 4. Update Subscription Page (`pages/subscription.jsx`)
Replace form with Stripe Elements:
```jsx
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

// In handleSubmit:
const stripe = useStripe();
const elements = useElements();
const { error, paymentMethod } = await stripe.createPaymentMethod({
  type: 'card',
  card: elements.getElement(CardElement),
});
// Send paymentMethod.id to server (NOT raw card data)
```

### 5. Update API Endpoint (`pages/api/subscription/create.js`)
```javascript
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Create customer
const customer = await stripe.customers.create({
  email: session.user.email,
  name: name,
  payment_method: paymentMethodId, // From client
  invoice_settings: { default_payment_method: paymentMethodId },
});

// Create subscription with 3-day trial
const subscription = await stripe.subscriptions.create({
  customer: customer.id,
  items: [{ price: 'price_xxxxx' }], // Your Stripe price ID
  trial_period_days: 3,
  expand: ['latest_invoice.payment_intent'],
});

// Store in database
await prisma.user.update({
  where: { id: user.id },
  data: { 
    onboarded: true,
    // Add stripeCustomerId field to schema
  },
});

await prisma.subscription.create({
  data: {
    stripeCustomerId: customer.id,
    status: subscription.status,
    plan: 'individual',
  },
});
```

### 6. Add Webhook Endpoint (`pages/api/webhooks/stripe.js`)
Handle subscription events:
- `customer.subscription.trial_will_end` - Send reminder email
- `customer.subscription.updated` - Update subscription status in DB
- `customer.subscription.deleted` - Handle cancellation
- `invoice.payment_succeeded` - Confirm payment
- `invoice.payment_failed` - Handle failed payment

### 7. Update Database Schema
```prisma
model User {
  // ... existing fields
  stripeCustomerId String? @unique
}

model Subscription {
  // ... existing fields
  stripeSubscriptionId String? @unique
  currentPeriodEnd DateTime?
}
```

### 8. Add Cancellation Endpoint
`pages/api/subscription/cancel.js`:
```javascript
const subscription = await stripe.subscriptions.update(subscriptionId, {
  cancel_at_period_end: true,
});
```

### 9. Security Checklist
- ✅ NEVER store raw card data
- ✅ Use Stripe Elements for PCI compliance
- ✅ Validate webhook signatures
- ✅ Use HTTPS in production
- ✅ Verify webhook events against database
- ✅ Log all payment events
- ✅ Handle failed payments gracefully

### 10. Testing
- Use Stripe test mode cards: https://stripe.com/docs/testing
- Test card: `4242 4242 4242 4242` (any future expiry, any CVC)
- Test 3-day trial flow end-to-end
- Test cancellation before trial ends
- Test payment after trial

---

## Current Implementation Status
- ❌ Stripe not integrated
- ❌ Cards not processed
- ❌ No actual charges
- ✅ Trial flow structure in place
- ✅ Database schema ready
- ✅ UI complete (needs Stripe Elements swap)

---

## Documentation
- Stripe Subscriptions: https://stripe.com/docs/billing/subscriptions/overview
- Stripe Elements React: https://stripe.com/docs/stripe-js/react
- Webhooks: https://stripe.com/docs/webhooks
