import { Injectable } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import { DatabaseService } from '@/database/database.service';
import { chatMessages, chatThreads } from '@/database/schema';

@Injectable()
export class ThreadsService {
  constructor(private readonly db: DatabaseService) {}

  async createThread(userId: string, title: string = 'New Chat'): Promise<string> {
    const result = await this.db.pg
      .insert(chatThreads)
      .values({
        userId,
        title,
      })
      .returning({ id: chatThreads.id })
      .execute();
    return result[0].id;
  }

  async getUserThreads(userId: string) {
    const threads = await this.db.pg
      .select({
        id: chatThreads.id,
        title: chatThreads.title,
        pinned: chatThreads.pinned,
        updatedAt: chatThreads.updatedAt,
      })
      .from(chatThreads)
      .where(eq(chatThreads.userId, userId))
      .orderBy(desc(chatThreads.pinned), desc(chatThreads.updatedAt))
      .execute();

    return threads.map((t) => ({
      id: t.id,
      title: t.title,
      updated_at: t.updatedAt ? new Date(t.updatedAt).getTime() / 1000 : null,
      pinned: t.pinned || false,
    }));
  }

  async deleteThread(threadId: string) {
    await this.db.pg.delete(chatThreads).where(eq(chatThreads.id, threadId)).execute();
  }

  async updateThread(threadId: string, title?: string, pinned?: boolean) {
    if (title === undefined && pinned === undefined) return;

    type UpdateType = {
      title?: string;
      pinned?: boolean;
      updatedAt?: ReturnType<typeof sql>;
    };
    const updateData: UpdateType = {};

    if (title !== undefined) updateData.title = title;
    if (pinned !== undefined) {
      updateData.pinned = pinned;
      // Only bump updatedAt when pinning so that pinned threads float to top
      updateData.updatedAt = sql`CURRENT_TIMESTAMP`;
    }

    await this.db.pg
      .update(chatThreads)
      .set(updateData)
      .where(eq(chatThreads.id, threadId))
      .execute();
  }

  async getThreadMessages(threadId: string, limit?: number) {
    const query = this.db.pg.select().from(chatMessages).where(eq(chatMessages.threadId, threadId));

    const messages =
      typeof limit === 'number' && limit > 0
        ? await query.orderBy(desc(chatMessages.createdAt)).limit(limit).execute()
        : await query.orderBy(chatMessages.createdAt).execute();

    const orderedMessages =
      typeof limit === 'number' && limit > 0 ? [...messages].reverse() : messages;

    return orderedMessages.map((m) => ({
      id: m.id,
      role: m.role,
      text: m.content,
      timestamp: m.createdAt ? new Date(m.createdAt).getTime() / 1000 : null,
      meta: m.metadata || {},
    }));
  }

  async addMessage(
    threadId: string,
    role: string,
    content: string,
    metadata: Record<string, unknown> = {},
  ) {
    await this.db.pg
      .insert(chatMessages)
      .values({
        threadId,
        role,
        content,
        metadata,
      })
      .execute();

    // Update thread timestamp
    await this.db.pg
      .update(chatThreads)
      .set({ updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(chatThreads.id, threadId))
      .execute();
  }
}
