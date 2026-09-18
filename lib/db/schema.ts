import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/** One research run against one domain. */
export const runs = sqliteTable('runs', {
  id: text('id').primaryKey(),
  domain: text('domain').notNull(),
  status: text('status', { enum: ['running', 'done', 'error'] })
    .notNull()
    .default('running'),
  error: text('error'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** Step 1 — what the company sells and to whom. */
export const profiles = sqliteTable('profiles', {
  runId: text('run_id').primaryKey().references(() => runs.id),
  name: text('name').notNull(),
  description: text('description').notNull(),
  product: text('product').notNull(),
  bullets: text('bullets', { mode: 'json' }).$type<string[]>().notNull(),
  queries: text('queries', { mode: 'json' }).$type<string[]>().notNull(),
});

/** Step 2 — neighbouring products. */
export const competitors = sqliteTable('competitors', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => runs.id),
  domain: text('domain').notNull(),
  name: text('name'),
  note: text('note'),
});

/** Step 3 — the ICP, split into sized segments. */
export const campaigns = sqliteTable('campaigns', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => runs.id),
  name: text('name').notNull(),
  pitch: text('pitch').notNull(),
  pain: text('pain').notNull(),
  criteria: text('criteria', { mode: 'json' }).$type<string[]>().notNull(),
  exampleClients: text('example_clients', { mode: 'json' }).$type<string[]>().notNull(),
  searchQuery: text('search_query').notNull(),
  estimatedSize: integer('estimated_size'),
});

/** Step 4 — companies matching a campaign. */
export const companies = sqliteTable('companies', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => runs.id),
  campaignId: text('campaign_id').notNull().references(() => campaigns.id),
  name: text('name').notNull(),
  domain: text('domain').notNull(),
  description: text('description'),
  location: text('location'),
  /** 0-5, scored against the campaign's own criteria. */
  fitScore: integer('fit_score'),
  fitReason: text('fit_reason'),
});

export type Run = typeof runs.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type Competitor = typeof competitors.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type Company = typeof companies.$inferSelect;
