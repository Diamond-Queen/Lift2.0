#!/usr/bin/env node
/**
 * Script to notify subscribers about price increase
 * 
 * Usage:
 * node scripts/notify-price-increase.js --effective-date "2026-03-27" --old-career 900 --new-career 1100 --old-full 1200 --new-full 1500 --old-notes 900 --new-notes 1100 --old-yearly 3500 --new-yearly 4200
 */

const prisma = require('../lib/prisma');
const { sendEmailNotification } = require('../lib/notify');
const logger = require('../lib/logger');

async function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  const effectiveDate = getArgValue(args, '--effective-date') || '2026-03-27';
  const oldPrices = {
    career: parseInt(getArgValue(args, '--old-career') || '900'),
    full: parseInt(getArgValue(args, '--old-full') || '1200'),
    notes: parseInt(getArgValue(args, '--old-notes') || '900'),
    full_yearly: parseInt(getArgValue(args, '--old-yearly') || '3500'),
  };
  const newPrices = {
    career: parseInt(getArgValue(args, '--new-career') || '1100'),
    full: parseInt(getArgValue(args, '--new-full') || '1500'),
    notes: parseInt(getArgValue(args, '--new-notes') || '1100'),
    full_yearly: parseInt(getArgValue(args, '--new-yearly') || '4200'),
  };

  console.log('Price Increase Notification Script');
  console.log('==================================');
  console.log(`Effective Date: ${effectiveDate}`);
  console.log('\nOld Prices:');
  console.log(`  Career: $${(oldPrices.career / 100).toFixed(2)}`);
  console.log(`  Full: $${(oldPrices.full / 100).toFixed(2)}`);
  console.log(`  Notes: $${(oldPrices.notes / 100).toFixed(2)}`);
  console.log(`  Yearly: $${(oldPrices.full_yearly / 100).toFixed(2)}`);
  
  console.log('\nNew Prices:');
  console.log(`  Career: $${(newPrices.career / 100).toFixed(2)}`);
  console.log(`  Full: $${(newPrices.full / 100).toFixed(2)}`);
  console.log(`  Notes: $${(newPrices.notes / 100).toFixed(2)}`);
  console.log(`  Yearly: $${(newPrices.full_yearly / 100).toFixed(2)}`);
  
  console.log('\n==================================');

  try {
    // Get all users with active subscriptions
    const usersWithSubscriptions = await prisma.user.findMany({
      where: {
        subscriptions: {
          some: {
            status: { in: ['active', 'trialing'] }
          }
        }
      },
      select: {
        id: true,
        email: true,
        name: true,
        subscriptions: {
          where: { status: { in: ['active', 'trialing'] } },
          select: { plan: true, status: true }
        }
      }
    });

    console.log(`\nFound ${usersWithSubscriptions.length} users with active subscriptions\n`);

    let successCount = 0;
    let failureCount = 0;
    const failures = [];

    // Send email to each subscriber
    for (const user of usersWithSubscriptions) {
      process.stdout.write(`Notifying ${user.email}... `);
      
      try {
        const plan = user.subscriptions[0]?.plan || 'unknown';
        const oldPrice = oldPrices[plan];
        const newPrice = newPrices[plan];

        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Important: Lift Pricing Update</h2>
            
            <p>Hi ${user.name || user.email},</p>
            
            <p>We're writing to inform you that Lift is updating its subscription pricing, effective <strong>${effectiveDate}</strong>.</p>
            
            <h3>Your Current Plan</h3>
            <p><strong>Plan:</strong> ${plan.toUpperCase()}</p>
            ${oldPrice && newPrice ? `
              <p>
                <strong>Current Price:</strong> $${(oldPrice / 100).toFixed(2)}/month<br/>
                <strong>New Price:</strong> $${(newPrice / 100).toFixed(2)}/month (starting ${effectiveDate})
              </p>
            ` : ''}
            
            <h3>Important Notes</h3>
            <ul>
              <li><strong>Your current rate is locked in.</strong> This price increase does not affect your existing subscription.</li>
              <li>If you cancel and resubscribe, you will be charged at the new price.</li>
              <li>The new pricing reflects the continued development and improved features of Lift.</li>
            </ul>
            
            <p>Thank you for being a valued Lift subscriber!</p>
            
            <p>If you have any questions, please don't hesitate to contact us.</p>
            
            <p>Best regards,<br/>The Lift Team</p>
          </div>
        `;

        const text = `
Lift Pricing Update

Hi ${user.name || user.email},

We're writing to inform you that Lift is updating its subscription pricing, effective ${effectiveDate}.

Your Current Plan: ${plan.toUpperCase()}
${oldPrice && newPrice ? `Current Price: $${(oldPrice / 100).toFixed(2)}/month\nNew Price: $${(newPrice / 100).toFixed(2)}/month (starting ${effectiveDate})` : ''}

Important Notes:
- Your current rate is locked in. This price increase does not affect your existing subscription.
- If you cancel and resubscribe, you will be charged at the new price.
- The new pricing reflects the continued development and improved features of Lift.

Thank you for being a valued Lift subscriber!

Best regards,
The Lift Team
        `;

        await sendEmailNotification({
          to: user.email,
          subject: 'Lift Pricing Update - Your Rate is Protected',
          html,
          text
        });

        successCount++;
        console.log('✓');
      } catch (error) {
        failureCount++;
        failures.push({ email: user.email, error: error.message });
        console.log(`✗ (${error.message})`);
        logger.warn('price_notification_failed_individual', { email: user.email, error: error.message });
      }
    }

    console.log('\n==================================');
    console.log(`Summary:`);
    console.log(`  Sent: ${successCount}/${usersWithSubscriptions.length}`);
    console.log(`  Failed: ${failureCount}`);
    
    if (failures.length > 0) {
      console.log('\nFailed emails:');
      failures.forEach(f => console.log(`  - ${f.email}: ${f.error}`));
    }
    
    logger.info('price_notification_complete', { successCount, failureCount, total: usersWithSubscriptions.length });
    process.exit(failureCount > 0 ? 1 : 0);
  } catch (error) {
    console.error('Error:', error.message);
    logger.error('price_notification_script_error', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

function getArgValue(args, argName) {
  const index = args.indexOf(argName);
  return index !== -1 ? args[index + 1] : null;
}

main();
