import { readFile } from 'node:fs/promises';
import pg from 'pg';

export type Db = pg.Pool;

export function createPool(databaseUrl: string): Db {
  return new pg.Pool({ connectionString: databaseUrl, max: 5 });
}

/** Applies schema.sql. Every statement uses IF NOT EXISTS, so this is safe to run on every start. */
export async function migrate(db: Db): Promise<void> {
  const sql = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
  await db.query(sql);
}
