import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { execSync } from 'child_process';
import path from 'path';
import * as fs from 'fs';
import { Client } from 'pg';

let pgContainer: StartedPostgreSqlContainer;

export async function setup() {
  const startTime = Date.now();
  const projectRoot = path.resolve(__dirname, '..');

  // Phase 1: Ensure Backend Services are running
  if (process.env.POSTGRES_HOST) {
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

    // Bridge container info to environment
    process.env.POSTGRES_HOST = pgContainer.getHost();
    process.env.POSTGRES_PORT = pgContainer.getMappedPort(5432).toString();
    process.env.POSTGRES_USER = 'postgres';
    process.env.POSTGRES_PASSWORD = 'postgres';
    process.env.POSTGRES_DB = pgContainer.getDatabase();

    console.log(`Testcontainers started in ${Date.now() - startTime}ms`);
  }

  // Phase 2: Initialize Database Schemas
  // Create .env.e2e.test for the Vitest processes to consume
  const envContent = `
POSTGRES_HOST=${process.env.POSTGRES_HOST}
POSTGRES_PORT=${process.env.POSTGRES_PORT}
POSTGRES_USER=${process.env.POSTGRES_USER}
POSTGRES_PASSWORD=${process.env.POSTGRES_PASSWORD}
POSTGRES_DB=${process.env.POSTGRES_DB}
`;
  await fs.promises.writeFile(
    path.join(projectRoot, '.env.e2e.test'),
    envContent.trim(),
  );

  // Push drizzle schema to Postgres
  console.log('Pushing schema to PostgreSQL...');
  execSync('npx drizzle-kit push', {
    cwd: path.resolve(projectRoot, '../packages/db'),
    env: process.env,
    stdio: 'inherit',
  });

  // Create minimal schema for tests to run (previously MySQL, now PG)
  console.log('Pushing dummy KPI table to PostgreSQL...');
  const pgClient = new Client({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
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
