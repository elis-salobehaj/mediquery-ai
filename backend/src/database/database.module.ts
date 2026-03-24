import { Global, Module } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { ConfigModule } from '@/config/config.module';
import { ConfigService } from '@/config/config.service';
import { DatabaseService } from './database.service';
import * as schema from './schema';

export const PG_CONNECTION = 'PG_CONNECTION';
export const PG_POOL = 'PG_POOL';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return new Pool({
          host: configService.get('POSTGRES_HOST'),
          port: configService.get('POSTGRES_PORT'),
          user: configService.get('POSTGRES_USER'),
          password: configService.get('POSTGRES_PASSWORD'),
          database: configService.get('APP_DB_NAME'),
          options: `-c search_path=${configService.get('APP_DB_SCHEMA')},public`,
        });
      },
    },
    {
      provide: PG_CONNECTION,
      inject: [PG_POOL],
      useFactory: (pool: Pool) => {
        return drizzle(pool, { schema });
      },
    },
    DatabaseService,
  ],
  exports: [PG_CONNECTION, PG_POOL, DatabaseService],
})
export class DatabaseModule {}
