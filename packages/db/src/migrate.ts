import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { loadDbEnv } from './env';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const dbEnv = loadDbEnv();

async function runMigration() {
  const pool = new Pool({
    host: dbEnv.POSTGRES_HOST,
    port: dbEnv.POSTGRES_PORT,
    user: dbEnv.POSTGRES_USER,
    password: dbEnv.POSTGRES_PASSWORD,
    database: dbEnv.POSTGRES_DB_NAME,
    ssl: false,
  });

  console.log('Running migrations...');

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS __drizzle_sql_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const migrationDirCandidates = [
      path.resolve(__dirname, '../drizzle'),
      path.resolve(__dirname, '../../drizzle'),
      path.resolve(process.cwd(), 'drizzle'),
    ];
    const migrationDir = migrationDirCandidates.find((dirPath) =>
      fs.existsSync(dirPath),
    );

    if (!migrationDir) {
      throw new Error(
        `Migration directory not found. Checked: ${migrationDirCandidates.join(', ')}`,
      );
    }

    const migrationFiles = fs
      .readdirSync(migrationDir)
      .filter((fileName) => fileName.endsWith('.sql'))
      .sort();

    const appliedResult = await pool.query<{ name: string }>(
      'SELECT name FROM __drizzle_sql_migrations',
    );
    const applied = new Set(appliedResult.rows.map((row: { name: string }) => row.name));

    const usersTableCheck = await pool.query<{ regclass: string | null }>(
      "SELECT to_regclass('public.users') AS regclass",
    );
    const hasExistingSchema = Boolean(usersTableCheck.rows[0]?.regclass);

    for (const fileName of migrationFiles) {
      if (applied.has(fileName)) {
        continue;
      }

      if (hasExistingSchema && fileName.startsWith('0000_')) {
        console.log(
          `Skipping baseline ${fileName} because schema already exists; marking as applied.`,
        );
        await pool.query(
          'INSERT INTO __drizzle_sql_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
          [fileName],
        );
        continue;
      }

      const migrationSql = fs.readFileSync(
        path.join(migrationDir, fileName),
        'utf8',
      );
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(migrationSql);
        await client.query(
          'INSERT INTO __drizzle_sql_migrations (name) VALUES ($1)',
          [fileName],
        );
        await client.query('COMMIT');
        console.log(`Applied migration: ${fileName}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    console.log('Migrations complete!');
  } catch (error) {
    console.error('Migration failed!', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration().catch((err) => {
  console.error(err);
  process.exit(1);
});