import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Sql } from "postgres";
import { describe, expect, it } from "vitest";

import {
  compareCheckpoint,
  formatChainBreak,
  formatChainOk,
  loadLast,
  readCheckpoint,
  writeCheckpointAtomic,
} from "./verify-job";

type AuditIdRow = { id: number; hash: string };

/**
 * Имитирует резолв ORDER BY в PostgreSQL: при `id::text AS id` + `ORDER BY id`
 * сортировка лексикографическая, при `ORDER BY audit_events.id` — числовая.
 */
function sqlForEvents(events: AuditIdRow[]): Sql {
  const exec = async (strings: TemplateStringsArray): Promise<AuditIdRow[]> => {
    const query = strings.join("?");
    const usesTextAlias = /id::text\s+AS\s+id/i.test(query);
    const orderByUnqualifiedId = /ORDER BY\s+id\s+DESC/i.test(query);
    const orderByTableId = /ORDER BY\s+audit_events\.id\s+DESC/i.test(query);
    const lexicographic = usesTextAlias && orderByUnqualifiedId && !orderByTableId;
    const sorted = [...events].sort((left, right) => {
      if (lexicographic) {
        return String(right.id).localeCompare(String(left.id), "en");
      }
      return right.id - left.id;
    });
    return sorted.slice(0, 1);
  };
  return exec as unknown as Sql;
}

describe("URS-099 / URS-100 проверка цепочки и контрольная точка", () => {
  it("печатает успех и разрыв по-русски", () => {
    expect(formatChainOk(12)).toContain("Проверено записей: 12");
    expect(formatChainOk(12)).toContain("Цепочка цела");
    expect(formatChainBreak(12, 5, "hash_mismatch")).toContain("id=5");
    expect(formatChainBreak(12, 5, "hash_mismatch")).toContain("несовпадение hash");
  });

  it("сравнивает контрольную точку с текущим журналом", () => {
    expect(compareCheckpoint(null, null, { id: 3, hash: "aaa" }).ok).toBe(true);
    const previous = { id: 2, hash: "abc", count: 2, checkedAt: "2026-10-29T00:00:00.000Z" };
    expect(compareCheckpoint(previous, { id: 2, hash: "abc" }, { id: 4, hash: "ddd" }).ok).toBe(
      true,
    );
    const missing = compareCheckpoint(previous, null, { id: 4, hash: "ddd" });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.message).toContain("отсутствующую запись");
    }
    const changed = compareCheckpoint(previous, { id: 2, hash: "zzz" }, { id: 4, hash: "ddd" });
    expect(changed.ok).toBe(false);
    if (!changed.ok) {
      expect(changed.message).toContain("расходится");
    }
  });

  it("loadLast на выборке с id=9 и id=10 совпадает с max(id)", async () => {
    const events: AuditIdRow[] = [
      { id: 8, hash: "h8" },
      { id: 9, hash: "h9" },
      { id: 10, hash: "h10" },
    ];
    const last = await loadLast(sqlForEvents(events));
    const numericMax = Math.max(...events.map((row) => row.id));
    expect(numericMax).toBe(10);
    expect(last?.id).toBe(numericMax);
    expect(last?.hash).toBe("h10");
    expect(last?.id).not.toBe(9);
  });

  it("пишет контрольную точку атомарно", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "audit-cp-"));
    const file = path.join(dir, "checkpoint.json");
    writeCheckpointAtomic(file, {
      id: 7,
      hash: "deadbeef",
      count: 7,
      checkedAt: "2026-10-29T00:00:00.000Z",
    });
    const loaded = readCheckpoint(file);
    expect(loaded?.id).toBe(7);
    expect(loaded?.hash).toBe("deadbeef");
    const raw = readFileSync(file, "utf8");
    expect(JSON.parse(raw)).toEqual(loaded);
  });
});
