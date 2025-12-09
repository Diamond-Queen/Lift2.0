const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

// Pass an explicit empty config object to avoid issues when the generated
// Prisma client expects an options argument in some runtime builds.
const prisma = new PrismaClient({});

async function main() {
  const file = path.join(process.cwd(), 'data', 'schoolCodes.json');
  if (!fs.existsSync(file)) {
    console.log('No data/schoolCodes.json found — skipping seed.');
    return;
  }
  const raw = fs.readFileSync(file, 'utf8');
  const list = JSON.parse(raw || '[]');

  for (const s of list) {
    const school = await prisma.school.upsert({
      where: { name: s.name },
      update: {},
      create: { name: s.name, plan: s.plan || null },
    });

    await prisma.schoolCode.upsert({
      where: { code: s.code },
      update: {},
      create: { code: s.code, schoolId: school.id },
    });

    console.log(`Seeded ${s.name} -> ${s.code}`);
  }

  console.log('Seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
