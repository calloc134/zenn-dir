import { readFile } from 'fs/promises';
import { join } from 'path';
import { getDb, closeDb } from '../src/lib/db.js';

async function seed() {
  try {
    const db = getDb();
    
    // Read and execute seed data
    const seedPath = join(process.cwd(), 'database', 'seed.sql');
    const seedData = await readFile(seedPath, 'utf-8');
    
    console.log('Seeding database...');
    await db.unsafe(seedData);
    
    console.log('Database seeding completed successfully!');
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await closeDb();
  }
}

seed();