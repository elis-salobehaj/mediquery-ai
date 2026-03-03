import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { loadDbEnv } from './src/env';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const dbEnv = loadDbEnv();

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    host: dbEnv.POSTGRES_HOST,
    port: dbEnv.POSTGRES_PORT,
    user: dbEnv.POSTGRES_USER,
    password: dbEnv.POSTGRES_PASSWORD,
    database: dbEnv.APP_DB_NAME,
    ssl: false,
  },
});