import * as fs from 'node:fs';
import * as path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as dotenv from 'dotenv';
import request from 'supertest';
import { App } from 'supertest/types';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { LLMService } from './../src/ai/llm.service';
import { AppModule } from './../src/app.module';
import { MockLLMService } from './mocks/llm.service';

const envPath = path.resolve(__dirname, '../../.env.e2e.test');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, override: true });
}

describe('Schema Validation (e2e)', () => {
  let app: INestApplication;
  let jwtToken: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(LLMService)
      .useClass(MockLLMService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const jwtService = app.get(JwtService);
    jwtToken = jwtService.sign({
      id: 'test-user',
      username: 'tester',
      role: 'admin',
    });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('rejects an empty payload with 422 Unprocessable Entity', async () => {
    const res = await request(app.getHttpServer() as App)
      .post('/api/v1/queries/query')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({});

    expect(res.status).toBe(422);
    expect(res.body.message).toBe('Validation failed');
  });

  it('rejects an invalid thread_id with 422 Unprocessable Entity', async () => {
    const res = await request(app.getHttpServer() as App)
      .post('/api/v1/queries/query')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        question: 'What is the sum of KPIs?',
        thread_id: 'not-a-uuid',
      });

    expect(res.status).toBe(422);
    expect(res.body.message).toBe('Validation failed');
  });
});
