import { pgTable, text, integer, timestamp, jsonb, boolean } from 'drizzle-orm/pg-core';

/** One research run against one domain. */
export const runs = pgTable('runs', {
  id: text('id').primaryKey(),
  domain: text('domain').notNull(),
  status: text('status').notNull().default('running'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Step 1 — what the company sells and to whom. */
export const profiles = pgTable('profiles', {
  runId: text('run_id').primaryKey().references(() => runs.id),
  name: text('name').notNull(),
  description: text('description').notNull(),
  product: text('product').notNull(),
  bullets: jsonb('bullets').$type<string[]>().notNull(),
  queries: jsonb('queries').$type<string[]>().notNull(),
});

/** Step 2 — neighbouring products. */
export const competitors = pgTable('competitors', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => runs.id),
  domain: text('domain').notNull(),
  name: text('name'),
  note: text('note'),
});

/** Step 3 — the ICP, split into sized segments. */
export const campaigns = pgTable('campaigns', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => runs.id),
  name: text('name').notNull(),
  pitch: text('pitch').notNull(),
  pain: text('pain').notNull(),
  criteria: jsonb('criteria').$type<string[]>().notNull(),
  exampleClients: jsonb('example_clients').$type<string[]>().notNull(),
  searchQuery: text('search_query').notNull(),
  estimatedSize: integer('estimated_size'),
});

/** Step 4 — companies matching a campaign, scored against its criteria. */
export const companies = pgTable('companies', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => runs.id),
  campaignId: text('campaign_id').notNull().references(() => campaigns.id),
  name: text('name').notNull(),
  domain: text('domain').notNull(),
  description: text('description'),
  location: text('location'),
  fitScore: integer('fit_score'),
  fitReason: text('fit_reason'),
  // Free enrichment (see lib/pipeline/enrich.ts)
  acceptsMail: boolean('accepts_mail'),
  mailProvider: text('mail_provider'),
  isUniversity: boolean('is_university'),
  country: text('country'),
  faviconUrl: text('favicon_url'),
});

export type Run = typeof runs.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type Competitor = typeof competitors.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type Company = typeof companies.$inferSelect;

/** Step 5 — decision makers found at the target companies. */
export const people = pgTable('people', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => runs.id),
  campaignId: text('campaign_id').notNull().references(() => campaigns.id),
  name: text('name').notNull(),
  title: text('title').notNull(),
  companyDomain: text('company_domain').notNull(),
  companyName: text('company_name'),
  linkedinUrl: text('linkedin_url'),
});

/** Step 6 — the drafted first touch. */
export const emails = pgTable('emails', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => runs.id),
  campaignId: text('campaign_id').notNull().references(() => campaigns.id),
  toName: text('to_name').notNull(),
  toTitle: text('to_title').notNull(),
  toCompany: text('to_company').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
});

export type Person = typeof people.$inferSelect;
export type Email = typeof emails.$inferSelect;
