import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const code = 'Z' + Math.random().toString(36).slice(2, 7).toUpperCase();
    const ev = await prisma.event.create({ data: { code, name: 'Test', durationMinutes: 60 } });
    console.log('OK', ev.id, ev.code);
  } catch (err) {
    console.error('ERR', (err && err.message) || err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

