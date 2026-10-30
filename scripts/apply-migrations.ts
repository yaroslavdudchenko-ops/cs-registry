#!/usr/bin/env tsx
/**
 * Применяет миграции drizzle/*.sql в порядке journal'а. Отдельный скрипт
 * вместо drizzle-kit migrate: тот глотает ошибки под спиннером (NOTICE'ы
 * печатаются, но причина отказа — нет). Этот скрипт делает ровно то же
 * (schema drizzle + таблица __drizzle_migrations + hash от содержимого файла),
 * но на любую ошибку печатает SQL и падает с ненулевым кодом.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFile } from "node:process";

import postgres from "postgres";

try {
  loadEnvFile(".env");
} catch {
  // переменные можно задать и напрямую
}

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ??
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:5432/cs_registry";

type Entry = { idx: number; tag: string };

async function main(): Promise<void> {
  const journal = JSON.parse(
    readFileSync(join("drizzle", "meta", "_journal.json"), "utf8"),
  ) as { entries: Entry[] };

  const sql = postgres(ADMIN_URL, { max: 1, onnotice: () => undefined });
  try {
    await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
    await sql`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id serial PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )`;

    const applied = await sql<Array<{ hash: string }>>`
      SELECT hash FROM drizzle.__drizzle_migrations
    `;
    const appliedHashes = new Set(applied.map((r) => r.hash));

    for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
      const text = readFileSync(join("drizzle", `${entry.tag}.sql`), "utf8");
      const hash = createHash("sha256").update(text).digest("hex");
      if (appliedHashes.has(hash)) {
        console.log(`skip ${entry.tag}`);
        continue;
      }
      const statements = text
        .split(/-->\s*statement-breakpoint\s*/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      let current = "";
      // Каждая миграция — одна транзакция: при ошибке база остаётся в
      // состоянии до миграции, повторный запуск начинает её заново.
      try {
        await sql.begin(async (tx) => {
          for (const stmt of statements) {
            current = stmt;
            await tx.unsafe(stmt);
          }
          await tx.unsafe(
            "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)",
            [hash, Date.now()],
          );
        });
      } catch (err) {
        console.error(`FAILED ${entry.tag} (изменения миграции откатены):`);
        console.error("  statement:", current.slice(0, 500));
        console.error("  error:", err instanceof Error ? err.message : err);
        process.exitCode = 1;
        return;
      }
      console.log(`applied ${entry.tag}`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
