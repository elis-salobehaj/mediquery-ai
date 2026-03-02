import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from './schema';
import { loadDbEnv } from './env';

// Use same config as migration script
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const dbEnv = loadDbEnv();

async function seed() {
  const pool = new Pool({
    host: dbEnv.POSTGRES_HOST,
    port: dbEnv.POSTGRES_PORT,
    user: dbEnv.POSTGRES_USER,
    password: dbEnv.POSTGRES_PASSWORD,
    database: dbEnv.POSTGRES_DB_NAME,
    ssl: false,
  });

  const db = drizzle(pool, { schema });

  console.log('Seeding database...');

  try {
    const existing = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, 'admin'))
      .execute();

    if (existing.length === 0) {
      const hashedPassword = await argon2.hash('admin');
      await db
        .insert(schema.users)
        .values({
          username: 'admin',
          hashedPassword,
          fullName: 'System Admin',
          email: 'admin@mediquery.ai',
          role: 'admin',
        })
        .execute();
      console.log("✅ Created default 'admin' user with password 'admin'");
    } else {
      console.log("ℹ️ User 'admin' already exists.");
    }

    console.log('✅ Seeding complete!');
  } catch (error) {
    console.error('❌ Seeding failed!', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
