import { Injectable, Inject, Logger } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from '@/database/schema';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
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

  constructor(
    @Inject(PG_CONNECTION) public readonly pg: NodePgDatabase<typeof schema>,
  ) {
    this.loadSemanticView();
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
      const result = await this.pg.execute(sql`
        SELECT tablename 
        FROM pg_catalog.pg_tables 
        WHERE schemaname != 'pg_catalog' AND schemaname != 'information_schema'
      `);
      return result.rows.map((row) => String(row.tablename));
    } catch (err) {
      this.logger.error(
        `Failed to get table names: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  async getTableSchema(tableName: string): Promise<[string, string][]> {
    try {
      const result = await this.pg.execute(sql`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = ${tableName}
      `);
      return result.rows.map((row) => [
        String(row.column_name),
        String(row.data_type),
      ]);
    } catch (err) {
      this.logger.error(
        `Failed to get schema for table ${tableName}: ${err instanceof Error ? err.message : String(err)}`,
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

    try {
      // 1. Syntax validation via EXPLAIN
      // Postgres EXPLAIN doesn't need the string escaping used in mysql
      await this.pg.execute(sql.raw(`EXPLAIN ${sqlClean}`));

      // 2. Row count estimate
      const countResult = await this.pg.execute(
        sql.raw(`SELECT COUNT(*) as count FROM (${sqlClean}) AS subquery`),
      );
      const rowCount = Number(countResult.rows[0]?.count || 0);

      // 3. Sample data retrieval
      const sampleResult = await this.pg.execute(
        sql.raw(`SELECT * FROM (${sqlClean}) AS subquery LIMIT 5`),
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
      this.logger.warn(
        `SQL validation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        valid: false,
        error: err instanceof Error ? err.message : String(err),
        row_count: null,
        warnings: [],
      };
    }
  }

  async executeQuery(sqlQuery: string): Promise<KpiQueryResult> {
    const sqlClean = sqlQuery.trim().replace(/;$/, '');
    try {
      const result = await this.pg.execute(sql.raw(sqlClean));
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
      this.logger.error(
        `Query execution failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }
}
