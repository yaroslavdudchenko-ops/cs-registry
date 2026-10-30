import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";

import * as schema from "./schema";

let sqlClient: Sql | undefined;
let sqlClientUrl: string | undefined;

export function getDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    return undefined;
  }
  return url;
}

export function getSql(): Sql {
  const url = getDatabaseUrl();
  if (url === undefined) {
    throw new Error("DATABASE_URL is not set");
  }
  if (sqlClient === undefined || sqlClientUrl !== url) {
    sqlClient = postgres(url, { max: 4 });
    sqlClientUrl = url;
  }
  return sqlClient;
}

export async function closeSql(): Promise<void> {
  if (sqlClient !== undefined) {
    await sqlClient.end({ timeout: 5 });
    sqlClient = undefined;
    sqlClientUrl = undefined;
  }
}

export function getDb() {
  return drizzle(getSql(), { schema });
}

export async function pingDatabase(): Promise<boolean> {
  if (getDatabaseUrl() === undefined) {
    return false;
  }
  try {
    const sql = getSql();
    await sql`select 1`;
    return true;
  } catch {
    return false;
  }
}
