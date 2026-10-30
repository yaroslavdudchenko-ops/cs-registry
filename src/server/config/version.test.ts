import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import packageJson from "../../../package.json";
import { GET } from "@/app/api/health/route";
import { appVersion } from "@/server/config/env";

const SRC_ROOT = path.resolve(process.cwd(), "src");
const STALE_VERSIONS = [
  ["0", "4", "0"].join("."),
  ["0", "4", "1"].join("."),
  ["0", "4", "2"].join("."),
  ["0", "4", "3"].join("."),
].filter((version) => version !== packageJson.version);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx"]);

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      files.push(...listSourceFiles(full));
      continue;
    }
    if (SOURCE_EXTENSIONS.has(path.extname(entry))) {
      files.push(full);
    }
  }
  return files;
}

describe("app version SSOT", () => {
  const previous = process.env["APP_VERSION"];

  afterEach(() => {
    if (previous === undefined) {
      delete process.env["APP_VERSION"];
    } else {
      process.env["APP_VERSION"] = previous;
    }
  });

  it("defaults appVersion() to package.json when APP_VERSION is unset", () => {
    delete process.env["APP_VERSION"];
    expect(appVersion()).toBe(packageJson.version);
  });

  it("lets APP_VERSION override package.json for debugging", () => {
    process.env["APP_VERSION"] = "debug-override";
    expect(appVersion()).toBe("debug-override");
  });

  it("returns the package.json version from GET /api/health when APP_VERSION is unset", async () => {
    delete process.env["APP_VERSION"];
    const response = await GET();
    const body: unknown = await response.json();
    expect(body).toEqual(
      expect.objectContaining({
        version: packageJson.version,
      }),
    );
  });

  it("contains no leftover hardcoded app version under src", () => {
    const hits: string[] = [];
    for (const file of listSourceFiles(SRC_ROOT)) {
      const text = readFileSync(file, "utf8");
      const relative = path.relative(process.cwd(), file);
      for (const stale of STALE_VERSIONS) {
        if (text.includes(stale)) {
          hits.push(`${relative}:${stale}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
