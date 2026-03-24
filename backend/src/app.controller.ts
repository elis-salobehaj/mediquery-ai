import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { PG_CONNECTION } from '@/database/database.module';
import * as schema from '@/database/schema';
import { AppService } from './app.service';

@Controller('api/v1')
export class AppController {
  constructor(
    private readonly appService: AppService,
    @Inject(PG_CONNECTION) private readonly pgDb: NodePgDatabase<typeof schema>,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  async getHealth() {
    try {
      const pgResult = await this.pgDb.execute(sql`SELECT 1 as val`);

      return {
        status: 'UP',
        timestamp: new Date().toISOString(),
        database: {
          postgres: pgResult.rows,
        },
      };
    } catch (err) {
      return {
        status: 'DOWN',
        timestamp: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
