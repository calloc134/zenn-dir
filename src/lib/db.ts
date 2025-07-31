import postgres from 'postgres';

let db: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (!db) {
    const config = {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'yamaten',
      username: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'postgres',
      max: 20,
      idle_timeout: 20,
      connect_timeout: 60,
    };
    
    db = postgres(config);
  }
  
  return db;
}

export async function closeDb() {
  if (db) {
    await db.end();
    db = null;
  }
}