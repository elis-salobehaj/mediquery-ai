import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { execSync } from 'child_process';
import path from 'path';
import * as fs from 'fs';
import { Client } from 'pg';
import { z } from 'zod';

let pgContainer: StartedPostgreSqlContainer;

const E2EEnvSchema = z.object({
  POSTGRES_HOST: z.string().optional(),
  POSTGRES_PORT: z.string().optional(),
  POSTGRES_USER: z.string().optional(),
  POSTGRES_PASSWORD: z.string().optional(),
  APP_DB_NAME: z.string().optional(),
});

export async function setup() {
  const startTime = Date.now();
  const projectRoot = path.resolve(__dirname, '..');
  let e2eEnv = E2EEnvSchema.parse(process.env);

  // Phase 1: Ensure Backend Services are running
  if (e2eEnv.POSTGRES_HOST) {
    console.log(
      'Using existing database services (skipping Testcontainers startup)',
    );
  } else {
    console.log('Starting Testcontainers...');
    pgContainer = await new PostgreSqlContainer('postgres:18.3-alpine')
      .withDatabase('mediquery_app')
      .withUsername('postgres')
      .withPassword('postgres')
      .start();

    e2eEnv = {
      ...e2eEnv,
      POSTGRES_HOST: pgContainer.getHost(),
      POSTGRES_PORT: pgContainer.getMappedPort(5432).toString(),
      POSTGRES_USER: 'postgres',
      POSTGRES_PASSWORD: 'postgres',
      APP_DB_NAME: pgContainer.getDatabase(),
    };

    console.log(`Testcontainers started in ${Date.now() - startTime}ms`);
  }

  // Phase 2: Initialize Database Schemas
  // Create .env.e2e.test for the Vitest processes to consume
  const envContent = `
POSTGRES_HOST=${e2eEnv.POSTGRES_HOST}
POSTGRES_PORT=${e2eEnv.POSTGRES_PORT}
POSTGRES_USER=${e2eEnv.POSTGRES_USER}
POSTGRES_PASSWORD=${e2eEnv.POSTGRES_PASSWORD}
APP_DB_NAME=${e2eEnv.APP_DB_NAME}
`;
  await fs.promises.writeFile(
    path.join(projectRoot, '.env.e2e.test'),
    envContent.trim(),
  );

  // Push drizzle schema to Postgres
  console.log('Pushing schema to PostgreSQL...');
  execSync('pnpm exec drizzle-kit push', {
    cwd: path.resolve(projectRoot, '../packages/db'),
    env: {
      ...process.env,
      ...e2eEnv,
    },
    stdio: 'inherit',
  });

  // Create minimal schema for tests to run (previously MySQL, now PG)
  console.log('Pushing dummy KPI table to PostgreSQL...');
  const pgClient = new Client({
    host: e2eEnv.POSTGRES_HOST || 'localhost',
    port: parseInt(e2eEnv.POSTGRES_PORT || '5432', 10),
    user: e2eEnv.POSTGRES_USER,
    password: e2eEnv.POSTGRES_PASSWORD,
    database: e2eEnv.APP_DB_NAME,
  });

  await pgClient.connect();
  await pgClient.query(
    'CREATE TABLE dummy_kpi (id INT PRIMARY KEY, name VARCHAR(255))',
  );
  await pgClient.end();
}

export async function teardown() {
  console.log('Stopping Testcontainers...');
  const stops: Promise<any>[] = [];
  if (pgContainer) stops.push(pgContainer.stop());
  await Promise.all(stops);
  console.log('Testcontainers stopped.');
}
