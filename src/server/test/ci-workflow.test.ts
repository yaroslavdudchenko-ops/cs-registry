import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("URS-101 CI-гейт", () => {
  const yaml = readFileSync(path.join(process.cwd(), ".github/workflows/ci.yml"), "utf8");
  const local = readFileSync(path.join(process.cwd(), "scripts/ci-local.sh"), "utf8");

  it("описывает jobs check и integration на push и pull_request", () => {
    expect(yaml).toContain("on:");
    expect(yaml).toContain("push:");
    expect(yaml).toContain("pull_request:");
    expect(yaml).toContain("name: check");
    expect(yaml).toContain("name: integration");
    expect(yaml).toContain("pnpm install --frozen-lockfile");
    expect(yaml).toContain("pnpm lint");
    expect(yaml).toContain("pnpm typecheck");
    expect(yaml).toContain("pnpm test");
    expect(yaml).toContain("pnpm build");
    expect(yaml).toContain("pnpm test:integration");
    expect(yaml).toContain("postgres:16");
    expect(yaml).toContain("TEST_DATABASE_URL");
    expect(yaml).toContain("corepack");
    expect(yaml).toContain("node-version: \"22\"");
    expect(yaml).toContain("origin.cursor.com/my2/cs-registry");
  });

  it("локальный скрипт повторяет ту же цепочку", () => {
    expect(local).toContain("pnpm lint");
    expect(local).toContain("pnpm typecheck");
    expect(local).toContain("pnpm test");
    expect(local).toContain("pnpm test:integration");
    expect(local).toContain("pnpm build");
    expect(local).toContain("pnpm e2e");
    expect(local).toContain("TEST_DATABASE_URL");
    expect(local).toContain("Код возврата");
  });
});
