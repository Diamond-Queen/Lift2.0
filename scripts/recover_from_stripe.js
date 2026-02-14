/**
 * Automatic subscription recovery from Stripe
 * 
 * This script finds all paid Stripe customers and ensures they have subscription
 * records in the database. If a customer paid for a subscription but the record
 * was deleted, this will restore it.
 * 
 * Usage:
 *   node scripts/recover_from_stripe.js [--limit=10]
 */

// Load .env file manually for scripts BEFORE requiring anything else
const fs = require('fs');
const path = require('path');

try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      if (line && !line.startsWith('#')) {
        const eqIndex = line.indexOf('=');
        if (eqIndex > -1) {
          const key = line.substring(0, eqIndex).trim();
          const value = line.substring(eqIndex + 1).trim();
          if (key && !process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    });
  }
} catch (e) {
  console.warn('Warning: Could not load .env file');
}

const stripe = require('../lib/stripe');
const prisma = require('../lib/prisma');
const logger = require('../lib/logger');

const args = process.argv.slice(2);
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 100;

async function recoverFromStripe() {
  try {
    if (!prisma) {
      console.error('❌ Prisma client not available');
      process.exit(1);
    }

    if (!stripe) {
      console.error('❌ Stripe not configured');
      process.exit(1);
    }

    console.log(`\n🔍 Scanning Stripe for missing subscriptions (limit: ${limit})...\n`);

    let processedCount = 0;
    let recoveredCount = 0;
    let hasMore = true;
    let startingAfterId = null;

    while (hasMore && processedCount < limit) {
      // Fetch customers from Stripe
      const listParams = {
        limit: Math.min(100, limit - processedCount)
      };
      if (startingAfterId) {
        listParams.starting_after = startingAfterId;
      }

      const customers = await stripe.customers.list(listParams);
      
      if (customers.data.length === 0) {
        hasMore = false;
        break;
      }

      for (const customer of customers.data) {
        processedCount++;

        // Skip if no email
        if (!customer.email) continue;

        // Find user by email
        const user = await prisma.user.findUnique({
          where: { email: customer.email },
          select: { id: true, subscriptions: { select: { stripeCustomerId: true } } }
        });

        if (!user) continue;

        // Check if user already has a subscription record for this customer
        const existingSubForCustomer = user.subscriptions.find(s => s.stripeCustomerId === customer.id);
        if (existingSubForCustomer) {
          continue; // Already has a record
        }

        // Get customer's subscriptions from Stripe
        const stripeSubscriptions = await stripe.subscriptions.list({
          customer: customer.id,
          limit: 10,
          status: 'all'
        });

        for (const stripeSubData of stripeSubscriptions.data) {
          // Only recover subscriptions that have been paid (not incomplete_expired or draft)
          if (!['active', 'past_due', 'trialing', 'incomplete'].includes(stripeSubData.status)) {
            continue;
          }

          // Check if this subscription ID already exists in DB
          const existingSub = await prisma.subscription.findFirst({
            where: { stripeSubscriptionId: stripeSubData.id }
          });

          if (!existingSub) {
            // Recover the subscription
            const plan = stripeSubData.metadata?.plan || 'unknown';
            const trialEnd = stripeSubData.trial_end ? new Date(stripeSubData.trial_end * 1000) : null;

            await prisma.subscription.create({
              data: {
                userId: user.id,
                stripeCustomerId: customer.id,
                stripeSubscriptionId: stripeSubData.id,
                status: stripeSubData.status,
                plan: plan,
                trialEndsAt: trialEnd,
                createdAt: new Date(stripeSubData.created * 1000)
              }
            });

            // Also set preferences to indicate they have a subscription
            const userPrefs = await prisma.user.findUnique({
              where: { id: user.id },
              select: { preferences: true }
            });
            const currentPrefs = userPrefs?.preferences || {};
            if (plan && plan !== 'unknown') {
              await prisma.user.update({
                where: { id: user.id },
                data: {
                  preferences: {
                    ...currentPrefs,
                    subscriptionPlan: plan
                  }
                }
              });
            }

            console.log(`✅ Recovered subscription for ${customer.email}`);
            console.log(`   Plan: ${plan}, Status: ${stripeSubData.status}`);
            console.log(`   Created: ${new Date(stripeSubData.created * 1000).toISOString()}`);
            recoveredCount++;

            logger.info('subscription_recovered_from_stripe', {
              userId: user.id,
              email: customer.email,
              stripeCustomerId: customer.id,
              stripeSubscriptionId: stripeSubData.id,
              plan: plan,
              status: stripeSubData.status
            });
          }
        }
      }

      startingAfterId = customers.data[customers.data.length - 1]?.id;
      hasMore = customers.has_more;
    }

    console.log(`\n✅ Scan complete`);
    console.log(`   Processed: ${processedCount} customers`);
    console.log(`   Recovered: ${recoveredCount} subscriptions`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    logger.error('stripe_recovery_error', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

recoverFromStripe();
