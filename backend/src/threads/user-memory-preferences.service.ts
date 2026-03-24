import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DatabaseService } from '@/database/database.service';
import { userMemoryPreferences } from '@/database/schema';

interface UserMemoryPreferencesUpdate {
  preferredUnits?: string;
  preferredChartStyle?: string;
}

@Injectable()
export class UserMemoryPreferencesService {
  constructor(private readonly db: DatabaseService) {}

  async getUserMemoryPreferences(userId: string) {
    const rows = await this.db.pg
      .select({
        preferredUnits: userMemoryPreferences.preferredUnits,
        preferredChartStyle: userMemoryPreferences.preferredChartStyle,
        updatedAt: userMemoryPreferences.updatedAt,
      })
      .from(userMemoryPreferences)
      .where(eq(userMemoryPreferences.userId, userId))
      .limit(1)
      .execute();

    return rows[0] ?? null;
  }

  async upsertUserMemoryPreferences(userId: string, updates: UserMemoryPreferencesUpdate) {
    if (!updates.preferredUnits && !updates.preferredChartStyle) {
      return this.getUserMemoryPreferences(userId);
    }

    await this.db.pg
      .insert(userMemoryPreferences)
      .values({
        userId,
        preferredUnits: updates.preferredUnits,
        preferredChartStyle: updates.preferredChartStyle,
      })
      .onConflictDoUpdate({
        target: userMemoryPreferences.userId,
        set: {
          preferredUnits: updates.preferredUnits,
          preferredChartStyle: updates.preferredChartStyle,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      })
      .execute();

    return this.getUserMemoryPreferences(userId);
  }

  async clearUserMemoryPreferences(userId: string) {
    await this.db.pg
      .delete(userMemoryPreferences)
      .where(eq(userMemoryPreferences.userId, userId))
      .execute();
  }
}
