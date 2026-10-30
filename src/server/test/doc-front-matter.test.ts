import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import packageJson from "../../../package.json";

import {
  packageMajorFromVersion,
  readFrontMatter,
  validateFrontMatter,
} from "./doc-front-matter";

const ROOT = process.cwd();
const REQUIRED_DOCS = [
  "README.md",
  "docs/specification/urs.md",
  "docs/specification/functional-specification.md",
  "docs/architecture/context.md",
  "docs/INITIAL-CONTEXT.md",
  "AGENTS.md",
];

function listMarkdownFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") {
      continue;
    }
    const full = path.join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      files.push(...listMarkdownFiles(full));
      continue;
    }
    if (entry.endsWith(".md")) {
      files.push(full);
    }
  }
  return files;
}

function docPaths(): string[] {
  const fromDocs = listMarkdownFiles(path.join(ROOT, "docs"));
  return [path.join(ROOT, "README.md"), path.join(ROOT, "AGENTS.md"), ...fromDocs];
}

describe("YAML front-matter документов", () => {
  const packageMajor = packageMajorFromVersion(packageJson.version);

  it("отклоняет version с запятой", () => {
    const fields = readFrontMatter(`---
title: Пример
version: 0.8.4,
status: draft
updated: 2026-10-29
---
`);
    expect(fields).not.toBeNull();
    const errors = validateFrontMatter("README.md", fields ?? {}, packageMajor);
    expect(errors.some((line) => line.includes("0.8.4,"))).toBe(true);
  });

  it("принимает semver без хвоста", () => {
    const fields = readFrontMatter(`---
title: Пример
version: 0.8.4
status: draft
updated: 2026-10-29
---
`);
    expect(validateFrontMatter("README.md", fields ?? {}, packageMajor)).toEqual([]);
  });

  it("проверяет README, URS, FS, context и остальные docs/**/*.md с front-matter", () => {
    const errors: string[] = [];
    const seen = new Set<string>();

    for (const absolute of docPaths()) {
      const relative = path.relative(ROOT, absolute).replaceAll("\\", "/");
      const text = readFileSync(absolute, "utf8");
      const fields = readFrontMatter(text);
      if (fields === null) {
        continue;
      }
      seen.add(relative);
      errors.push(...validateFrontMatter(relative, fields, packageMajor));
    }

    for (const required of REQUIRED_DOCS) {
      if (!seen.has(required)) {
        errors.push(`${required}: нет YAML front-matter`);
      }
    }

    expect(errors).toEqual([]);
  });
});
