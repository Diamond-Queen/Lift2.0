const fs = require('fs');
const path = require('path');

// Load .env file BEFORE requiring other modules
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

const prisma = require('../lib/prisma');

async function fixAccount(email) {
  try {
    console.log(`🔧 Fixing account: ${email}`);
    
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true }
    });

    if (!user) {
      console.log('❌ User not found');
      return;
    }

    const subs = await prisma.subscription.findMany({
      where: { userId: user.id }
    });

    console.log(`📋 Found ${subs.length} subscriptions:`);
    subs.forEach(s => console.log(`   - ${s.id}: ${s.plan} (${s.status})`));

    // Delete the "full" subscription (incorrect)
    const fullSub = subs.find(s => s.plan === 'full');
    if (fullSub) {
      console.log(`🗑️  Deleting incorrect "full" subscription: ${fullSub.id}`);
      await prisma.subscription.delete({ where: { id: fullSub.id } });
      console.log('✅ Deleted');
    }

    // Update the "unknown" subscription to "notes"
    const unknownSub = subs.find(s => s.plan === 'unknown');
    if (unknownSub) {
      console.log(`📝 Updating subscription to "notes": ${unknownSub.id}`);
      await prisma.subscription.update({
        where: { id: unknownSub.id },
        data: { plan: 'notes' }
      });
      console.log('✅ Updated');
    }

    // Update preferences to match - if this fails, that's OK
    try {
      console.log(`📋 Updating preferences to subscriptionPlan: "notes"`);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          preferences: {
            subscriptionPlan: 'notes'
          }
        }
      });
      console.log('✅ Preferences updated');
    } catch (e) {
      console.log('⚠️  Could not update preferences (not critical)');
    }

    console.log(`\n✨ Account fixed - user now has access to "notes" plan only`);
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

const email = process.argv[2] || 'qneverhadthis@gmail.com';
fixAccount(email);
