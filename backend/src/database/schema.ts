import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const appSchema = pgSchema('mediquery_app');

export const users = appSchema.table(
  'users',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    username: varchar({ length: 255 }).notNull(),
    email: varchar({ length: 255 }),
    hashedPassword: varchar('hashed_password', { length: 255 }).notNull(),
    fullName: varchar('full_name', { length: 255 }),
    role: varchar({ length: 50 }).default('user'),
    isActive: boolean('is_active').default(true),
    preferences: jsonb().default({}),
    monthlyTokenLimit: integer('monthly_token_limit').default(1000000),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'string',
    }).default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'string',
    }).default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('idx_users_email').using('btree', table.email.asc().nullsLast().op('text_ops')),
    index('idx_users_username').using('btree', table.username.asc().nullsLast().op('text_ops')),
    unique('users_username_key').on(table.username),
    unique('users_email_key').on(table.email),
  ],
);

export const chatThreads = appSchema.table(
  'chat_threads',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid('user_id'),
    title: varchar({ length: 255 }),
    pinned: boolean('pinned').default(false),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'string',
    }).default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'string',
    }).default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'chat_threads_user_id_fkey',
    }).onDelete('cascade'),
  ],
);

export const chatMessages = appSchema.table(
  'chat_messages',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    threadId: uuid('thread_id'),
    userId: uuid('user_id'),
    role: varchar({ length: 50 }).notNull(),
    content: text().notNull(),
    agentType: varchar('agent_type', { length: 50 }),
    metadata: jsonb().default({}),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'string',
    }).default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('idx_chat_thread').using(
      'btree',
      table.threadId.asc().nullsLast().op('uuid_ops'),
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
    ),
    index('idx_chat_user').using(
      'btree',
      table.userId.asc().nullsLast().op('uuid_ops'),
      table.createdAt.desc().nullsFirst().op('timestamptz_ops'),
    ),
    foreignKey({
      columns: [table.threadId],
      foreignColumns: [chatThreads.id],
      name: 'chat_messages_thread_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'chat_messages_user_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.threadId],
      foreignColumns: [chatThreads.id],
      name: 'fk_thread_msg',
    }),
  ],
);

export const tokenBlacklist = appSchema.table('token_blacklist', {
  token: varchar().primaryKey().notNull(),
  expiresAt: timestamp('expires_at', {
    withTimezone: true,
    mode: 'string',
  }).notNull(),
  createdAt: timestamp('created_at', {
    withTimezone: true,
    mode: 'string',
  }).default(sql`CURRENT_TIMESTAMP`),
});

export const tokenUsage = appSchema.table(
  'token_usage',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid('user_id'),
    requestId: uuid('request_id').notNull(),
    provider: varchar({ length: 50 }).notNull(),
    model: varchar({ length: 255 }).notNull(),
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    totalTokens: integer('total_tokens').generatedAlwaysAs(sql`(input_tokens + output_tokens)`),
    costUsd: numeric('cost_usd', { precision: 10, scale: 6 }),
    requestMetadata: jsonb('request_metadata'),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'string',
    }).default(sql`CURRENT_TIMESTAMP`),
    agentType: varchar('agent_type', { length: 50 }),
  },
  (table) => [
    index('idx_usage_request').using('btree', table.requestId.asc().nullsLast().op('uuid_ops')),
    index('idx_usage_user_month').using(
      'btree',
      table.userId.asc().nullsLast().op('uuid_ops'),
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'token_usage_user_id_fkey',
    }).onDelete('cascade'),
  ],
);

export const userMemoryPreferences = appSchema.table(
  'user_memory_preferences',
  {
    userId: uuid('user_id').notNull(),
    preferredUnits: varchar('preferred_units', { length: 64 }),
    preferredChartStyle: varchar('preferred_chart_style', { length: 64 }),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'string',
    }).default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'user_memory_preferences_user_id_fkey',
    }).onDelete('cascade'),
    unique('user_memory_preferences_user_id_key').on(table.userId),
  ],
);

export const userMonthlyUsage = appSchema
  .materializedView('user_monthly_usage', {
    userId: uuid('user_id'),
    calendarMonth: text('calendar_month'),
    provider: varchar({ length: 50 }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    totalInputTokens: bigint('total_input_tokens', { mode: 'number' }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    totalOutputTokens: bigint('total_output_tokens', { mode: 'number' }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    totalTokens: bigint('total_tokens', { mode: 'number' }),
    totalCost: numeric('total_cost'),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    requestCount: bigint('request_count', { mode: 'number' }),
    lastUpdated: timestamp('last_updated', {
      withTimezone: true,
      mode: 'string',
    }),
  })
  .as(
    sql`SELECT user_id, to_char((created_at AT TIME ZONE 'UTC'::text), 'YYYY-MM'::text) AS calendar_month, provider, sum(input_tokens) AS total_input_tokens, sum(output_tokens) AS total_output_tokens, sum(total_tokens) AS total_tokens, sum(cost_usd) AS total_cost, count(*) AS request_count, max(created_at) AS last_updated FROM token_usage GROUP BY user_id, (to_char((created_at AT TIME ZONE 'UTC'::text), 'YYYY-MM'::text)), provider`,
  );
