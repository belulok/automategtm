import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

const sqlite = new Database(process.env.DATABASE_URL ?? './auto-gtm.db');
sqlite.pragma('journal_mode = WAL');

// Created inline so the app runs with no migration step. Swap for
// `drizzle-kit push` (and Neon/Postgres) when this needs to deploy.
sqlite.exec(`
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY, domain TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running', error TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
  run_id TEXT PRIMARY KEY REFERENCES runs(id), name TEXT NOT NULL,
  description TEXT NOT NULL, product TEXT NOT NULL,
  bullets TEXT NOT NULL, queries TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS competitors (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id),
  domain TEXT NOT NULL, name TEXT, note TEXT
);
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id),
  name TEXT NOT NULL, pitch TEXT NOT NULL, pain TEXT NOT NULL,
  criteria TEXT NOT NULL, example_clients TEXT NOT NULL,
  search_query TEXT NOT NULL, estimated_size INTEGER
);
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  name TEXT NOT NULL, domain TEXT NOT NULL, description TEXT,
  location TEXT, fit_score INTEGER, fit_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_campaigns_run ON campaigns(run_id);
CREATE INDEX IF NOT EXISTS idx_companies_campaign ON companies(campaign_id);
`);

export const db = drizzle(sqlite, { schema });
export * from './schema';
