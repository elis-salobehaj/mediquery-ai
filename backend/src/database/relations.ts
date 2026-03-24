import { relations } from 'drizzle-orm/relations';
import { chatMessages, chatThreads, tokenUsage, userMemoryPreferences, users } from './schema';

export const chatThreadsRelations = relations(chatThreads, ({ one, many }) => ({
  user: one(users, {
    fields: [chatThreads.userId],
    references: [users.id],
  }),
  chatMessages_threadId: many(chatMessages, {
    relationName: 'chatMessages_threadId_chatThreads_id',
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  chatThreads: many(chatThreads),
  chatMessages: many(chatMessages),
  tokenUsages: many(tokenUsage),
  userMemoryPreferences: many(userMemoryPreferences),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  chatThread_threadId: one(chatThreads, {
    fields: [chatMessages.threadId],
    references: [chatThreads.id],
    relationName: 'chatMessages_threadId_chatThreads_id',
  }),
  user: one(users, {
    fields: [chatMessages.userId],
    references: [users.id],
  }),
}));

export const tokenUsageRelations = relations(tokenUsage, ({ one }) => ({
  user: one(users, {
    fields: [tokenUsage.userId],
    references: [users.id],
  }),
}));

export const userMemoryPreferencesRelations = relations(userMemoryPreferences, ({ one }) => ({
  user: one(users, {
    fields: [userMemoryPreferences.userId],
    references: [users.id],
  }),
}));
