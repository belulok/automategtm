import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

export * from './schema';

/**
 * Persistence is optional. Without DATABASE_URL the pipeline still runs and
 * streams every result to the client, it just keeps no history.
 *
 * postgres-js speaks plain TCP, so the same code works against a Postgres on
 * this box and against a hosted one (Neon, Supabase) via its connection string.
 */
export const hasDb = () => Boolean(process.env.DATABASE_URL);

function create() {
  const client = postgres(process.env.DATABASE_URL!, {
    max: 5,
    idle_timeout: 20,
    // Local sockets are plaintext; hosted providers advertise sslmode in the URL.
    ssl: process.env.DATABASE_URL!.includes('sslmode=require') ? 'require' : undefined,
  });
  return { db: drizzle(client, { schema }), client };
}

let cached: ReturnType<typeof create> | null = null;

function conn() {
  // Lazily, because Next evaluates module scope at build time and a missing
  // URL would otherwise break `next build` before any database exists.
  if (!hasDb()) return null;
  cached ??= create();
  return cached;
}

export function getDb() {
  return conn()?.db ?? null;
}

let ensured: Promise<void> | null = null;

/** Create tables on first use, so a fresh database needs no migration step. */
export function ensureSchema(): Promise<void> {
  const c = conn();
  if (!c) return Promise.resolve();
  ensured ??= (async () => {
    const sql = c.client;
    await sql`CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY, domain TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running', error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
    await sql`CREATE TABLE IF NOT EXISTS profiles (
      run_id TEXT PRIMARY KEY REFERENCES runs(id), name TEXT NOT NULL,
      description TEXT NOT NULL, product TEXT NOT NULL,
      bullets JSONB NOT NULL, queries JSONB NOT NULL)`;
    await sql`CREATE TABLE IF NOT EXISTS competitors (
      id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id),
      domain TEXT NOT NULL, name TEXT, note TEXT)`;
    await sql`CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id),
      name TEXT NOT NULL, pitch TEXT NOT NULL, pain TEXT NOT NULL,
      criteria JSONB NOT NULL, example_clients JSONB NOT NULL,
      search_query TEXT NOT NULL, estimated_size INTEGER)`;
    await sql`CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id),
      campaign_id TEXT NOT NULL REFERENCES campaigns(id),
      name TEXT NOT NULL, domain TEXT NOT NULL, description TEXT,
      location TEXT, fit_score INTEGER, fit_reason TEXT)`;
    // Added after first release; ADD COLUMN IF NOT EXISTS keeps this idempotent.
    await sql`ALTER TABLE companies
      ADD COLUMN IF NOT EXISTS accepts_mail BOOLEAN,
      ADD COLUMN IF NOT EXISTS mail_provider TEXT,
      ADD COLUMN IF NOT EXISTS is_university BOOLEAN,
      ADD COLUMN IF NOT EXISTS country TEXT,
      ADD COLUMN IF NOT EXISTS favicon_url TEXT`;
    await sql`CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id),
      campaign_id TEXT NOT NULL REFERENCES campaigns(id),
      name TEXT NOT NULL, title TEXT NOT NULL,
      company_domain TEXT NOT NULL, company_name TEXT, linkedin_url TEXT)`;
    await sql`CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id),
      campaign_id TEXT NOT NULL REFERENCES campaigns(id),
      to_name TEXT NOT NULL, to_title TEXT NOT NULL, to_company TEXT NOT NULL,
      subject TEXT NOT NULL, body TEXT NOT NULL)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_campaigns_run ON campaigns(run_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_companies_campaign ON companies(campaign_id)`;
  })();
  return ensured;
}
