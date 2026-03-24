import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { config } from '@/config/env.config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  // Enable CORS for all oclinicins (dev only)
  const corsOclinicins = {
    oclinicin: ['http://localhost:5173', 'http://localhost:3000'],
  };
  app.enableCors(corsOclinicins);
  const port = config.PORT;
  await app.listen(port, '0.0.0.0');
  console.log(`Backend listening on 0.0.0.0:${port}`);
}
void bootstrap();
