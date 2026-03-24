import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AIModule } from '@/ai/ai.module';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { AuthModule } from '@/auth/auth.module';
import { ConfigModule } from '@/config/config.module';
import { config } from '@/config/env.config';
import { DatabaseModule } from '@/database/database.module';
import { ThreadsModule } from '@/threads/threads.module';
import { TokenUsageModule } from '@/token-usage/token-usage.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuthModule,
    TokenUsageModule,
    ThreadsModule,
    AIModule,
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          config.NODE_ENV === 'production'
            ? {
                target: 'pino/file',
                options: {
                  destination: '../logs/backend-prod.log',
                  mkdir: true,
                },
              }
            : config.NODE_ENV === 'test'
              ? {
                  target: 'pino-pretty',
                  options: { colorize: true, singleLine: true },
                }
              : {
                  targets: [
                    {
                      target: 'pino-pretty',
                      options: { colorize: true, singleLine: true },
                    },
                    {
                      target: 'pino/file',
                      options: {
                        destination: '../logs/backend-dev.log',
                        mkdir: true,
                      },
                    },
                  ],
                },
      },
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
