/**
 * main.test.ts — E2E test entrypoint.
 *
 * This file is compiled only in the backend.Dockerfile test stage (not in the
 * production runner stage).  It bootstraps AppTestModule, which wires
 * MockLLMService in place of the real LLMService so full-stack Playwright
 * tests run without any external LLM API keys.
 */
import { NestFactory } from '@nestjs/core';
import { AppTestModule } from './app-test.module';
import { Logger } from 'nestjs-pino';
import { config } from '../src/config/env.config';

async function bootstrap() {
  const app = await NestFactory.create(AppTestModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const port = config.PORT;
  await app.listen(port, '0.0.0.0');
  console.log(`[TEST] Backend listening on 0.0.0.0:${port}`);
}
void bootstrap();
