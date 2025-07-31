import { readFile } from 'fs/promises';
import { join } from 'path';
import { getDb, closeDb } from '../src/lib/db.js';

async function migrate() {
  try {
    const db = getDb();
    
    // Read and execute schema
    const schemaPath = join(process.cwd(), 'database', 'schema.sql');
    const schema = await readFile(schemaPath, 'utf-8');
    
    console.log('Executing database schema...');
    await db.unsafe(schema);
    
    console.log('Database migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await closeDb();
  }
}

migrate();