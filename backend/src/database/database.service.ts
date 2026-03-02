import { Injectable, Inject, Logger } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from '@/database/schema';
import { ConfigService } from '@/config/config.service';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { Pool } from 'pg';
import type {
  SemanticView,
  SemanticViewTable,
  KpiRow,
  KpiQueryResult,
} from '@/common/types';

const PG_CONNECTION = 'PG_CONNECTION';

@Injectable()
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name);
  private semanticView: SemanticView | null = null;
  private tenantPool: Pool | null = null;

  constructor(
    @Inject(PG_CONNECTION) public readonly pg: NodePgDatabase<typeof schema>,
    private readonly configService: ConfigService,
  ) {
    this.loadSemanticView();
  }

  private getTenantPool(): Pool {
    if (this.tenantPool) {
      return this.tenantPool;
    }

    const tenantSchema = this.configService.get('NEXUS_TENANT_DB_NAME');

    this.tenantPool = new Pool({
      host: this.configService.get('POSTGRES_HOST'),
      port: this.configService.get('POSTGRES_PORT'),
      user: this.configService.get('POSTGRES_USER'),
      password: this.configService.get('POSTGRES_PASSWORD'),
      database: this.configService.get('TENANTS_DB_NAME'),
      options: `-c search_path=${tenantSchema},omop_vocab,public`,
    });

    return this.tenantPool;
  }

  private extractDbErrorMessage(err: unknown): string {
    if (!(err instanceof Error)) {
      return String(err);
    }

    const cause = (err as { cause?: unknown }).cause;
    if (cause instanceof Error && cause.message) {
      return cause.message;
    }

    if (cause && typeof cause === 'object') {
      const causeRecord = cause as Record<string, unknown>;
      const message =
        typeof causeRecord.message === 'string' ? causeRecord.message : '';
      const detail =
        typeof causeRecord.detail === 'string' ? causeRecord.detail : '';
      const hint = typeof causeRecord.hint === 'string' ? causeRecord.hint : '';

      const parts = [message, detail, hint].filter(Boolean);
      if (parts.length > 0) {
        return parts.join(' | ');
      }
    }

    return err.message;
  }

  private loadSemanticView() {
    try {
      const viewPath = path.resolve(
        __dirname,
        '../ai/prompts/semantic_view.yaml',
      );
      if (fs.existsSync(viewPath)) {
        const fileContents = fs.readFileSync(viewPath, 'utf8');
        this.semanticView = yaml.load(fileContents) as SemanticView;
        this.logger.log('Loaded semantic view configuration');
      } else {
        // Try alternate path for dev/watch mode
        const devPath = path.resolve(
          process.cwd(),
          'src/ai/prompts/semantic_view.yaml',
        );
        if (fs.existsSync(devPath)) {
          const fileContents = fs.readFileSync(devPath, 'utf8');
          this.semanticView = yaml.load(fileContents) as SemanticView;
          this.logger.log('Loaded semantic view configuration (dev path)');
        }
      }
    } catch (err) {
      this.logger.warn(
        `Failed to load semantic view: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async getSchema(): Promise<string> {
    if (this.semanticView) {
      return this.getSchemaFromSemanticView();
    }
    return this.getSchemaFromDatabase();
  }

  private getSchemaFromSemanticView(): string {
    const parts: string[] = [];
    const view = this.semanticView;

    parts.push(`Database: ${view!.database || 'mediquery'}`);
    parts.push(`Dialect: ${view!.dialect || 'postgresql'}`);
    parts.push(`Hub Table: ${view!.hub_table || 'patients'}`);
    parts.push('');

    if (view!.reasoning) {
      parts.push('System Overview:');
      parts.push(view!.reasoning);
      parts.push('');
    }

    const tables = view!.tables || {};
    for (const [tableName, tableInfo] of Object.entries<SemanticViewTable>(
      tables,
    )) {
      parts.push(`Table: ${tableName}`);
      if (tableInfo.description)
        parts.push(`  Description: ${tableInfo.description}`);
      if (tableInfo.primary_key) {
        const pk = Array.isArray(tableInfo.primary_key)
          ? tableInfo.primary_key.join(', ')
          : tableInfo.primary_key;
        parts.push(`  Primary Key: ${pk}`);
      }
      if (tableInfo.join_key) {
        parts.push(`  Join Key: ${tableInfo.join_key} -> patients.patient_id`);
      }

      if (tableInfo.columns) {
        parts.push('  Columns:');
        for (const [colName, colDesc] of Object.entries<string>(
          tableInfo.columns,
        )) {
          parts.push(`    - ${colName}: ${colDesc}`);
        }
      }

      if (tableInfo.important_notes) {
        parts.push('  Important Notes:');
        for (const note of tableInfo.important_notes) {
          parts.push(`    - ${note}`);
        }
      }
      parts.push('');
    }

    return parts.join('\n');
  }

  private async getSchemaFromDatabase(): Promise<string> {
    const parts: string[] = [];
    const tables = await this.getAllTableNames();

    for (const table of tables) {
      parts.push(`Table: ${table}`);
      const schema = await this.getTableSchema(table);
      parts.push('  Columns:');
      for (const [name, type] of schema) {
        parts.push(`    - ${name} (${type})`);
      }
      parts.push('');
    }

    return parts.join('\n');
  }

  async getAllTableNames(): Promise<string[]> {
    try {
      const tenantPool = this.getTenantPool();
      const result = await tenantPool.query(`
        SELECT tablename 
        FROM pg_catalog.pg_tables 
        WHERE schemaname != 'pg_catalog' AND schemaname != 'information_schema'
      `);
      return result.rows.map((row) => String(row.tablename));
    } catch (err) {
      this.logger.error(
        `Failed to get table names: ${this.extractDbErrorMessage(err)}`,
      );
      return [];
    }
  }

  async getTableSchema(tableName: string): Promise<[string, string][]> {
    try {
      const tenantPool = this.getTenantPool();
      const result = await tenantPool.query(
        `
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = $1
      `,
        [tableName],
      );
      return result.rows.map((row) => [
        String(row.column_name),
        String(row.data_type),
      ]);
    } catch (err) {
      this.logger.error(
        `Failed to get schema for table ${tableName}: ${this.extractDbErrorMessage(err)}`,
      );
      return [];
    }
  }

  async validateSql(sqlQuery: string): Promise<{
    valid: boolean;
    error: string | null;
    row_count: number | null;
    kpi_results?: KpiRow[];
    warnings: string[];
  }> {
    const warnings: string[] = [];
    const sqlClean = sqlQuery.trim().replace(/;$/, '');
    const tenantPool = this.getTenantPool();

    try {
      // 1. Syntax validation via EXPLAIN
      // Postgres EXPLAIN doesn't need the string escaping used in mysql
      await tenantPool.query(`EXPLAIN ${sqlClean}`);

      // 2. Row count estimate
      const countResult = await tenantPool.query(
        `SELECT COUNT(*) as count FROM (${sqlClean}) AS subquery`,
      );
      const rowCount = Number(countResult.rows[0]?.count || 0);

      // 3. Sample data retrieval
      const sampleResult = await tenantPool.query(
        `SELECT * FROM (${sqlClean}) AS subquery LIMIT 5`,
      );

      // Filtering patient_id from sample data
      const filteredSample = sampleResult.rows.map((row) => {
        return Object.fromEntries(
          Object.entries(row).filter(
            ([key]) => !['patient_id', 'patient_id'].includes(key),
          ),
        );
      });

      return {
        valid: true,
        error: null,
        row_count: rowCount,
        kpi_results: filteredSample as unknown as KpiRow[],
        warnings,
      };
    } catch (err) {
      const errorMessage = this.extractDbErrorMessage(err);
      this.logger.warn(
        `SQL validation failed: ${errorMessage}`,
      );
      return {
        valid: false,
        error: errorMessage,
        row_count: null,
        warnings: [],
      };
    }
  }

  async executeQuery(sqlQuery: string): Promise<KpiQueryResult> {
    const sqlClean = sqlQuery.trim().replace(/;$/, '');
    const tenantPool = this.getTenantPool();
    try {
      const result = await tenantPool.query(sqlClean);
      const rows = result.rows;
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

      // Filter out patient_id from results
      const filteredRows: KpiRow[] = rows.map((row) => {
        return Object.fromEntries(
          Object.entries(row).filter(
            ([key]) => !['patient_id', 'patient_id'].includes(key),
          ),
        ) as unknown as KpiRow;
      });

      return {
        columns: columns.filter(
          (c) => !['patient_id', 'patient_id'].includes(c),
        ),
        data: filteredRows,
        row_count: filteredRows.length,
      };
    } catch (err) {
      const errorMessage = this.extractDbErrorMessage(err);
      this.logger.error(
        `Query execution failed: ${errorMessage}`,
      );
      throw new Error(errorMessage);
    }
  }
}
