const argon2 = require('argon2');
const prisma = require('../lib/prisma');

(async function main(){
  try {
    const hash = await argon2.hash('password123');
    const u = await prisma.user.upsert({ where: { email: 'admin@lift.local' }, update: {}, create: { name: 'Admin', email: 'admin@lift.local', password: hash } });
    console.log('Created user', u.email);
  } catch (e) {
    console.error('Error creating demo user', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
