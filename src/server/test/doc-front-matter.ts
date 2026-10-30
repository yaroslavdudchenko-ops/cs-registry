export const DOC_VERSION_RE = /^\d+\.\d+\.\d+$/;
export const DOC_UPDATED_RE = /^\d{4}-\d{2}-\d{2}$/;
export const DOC_STATUSES = new Set(["draft", "in-review", "approved", "published", "deprecated"]);

export type FrontMatterFields = Record<string, string>;

export function readFrontMatter(text: string): FrontMatterFields | null {
  const normalized = text.replace(/^\uFEFF/, "");
  if (!normalized.startsWith("---\n") && !normalized.startsWith("---\r\n")) {
    return null;
  }
  const rest = normalized.startsWith("---\r\n") ? normalized.slice(5) : normalized.slice(4);
  const closer = rest.search(/\n---(?:\n|$)/);
  if (closer < 0) {
    return null;
  }
  const block = rest.slice(0, closer);
  const fields: FrontMatterFields = {};
  for (const rawLine of block.split(/\r?\n/)) {
    if (rawLine.length === 0 || rawLine.startsWith(" ") || rawLine.startsWith("#") || rawLine.startsWith("-")) {
      continue;
    }
    const idx = rawLine.indexOf(":");
    if (idx <= 0) {
      continue;
    }
    const key = rawLine.slice(0, idx).trim();
    const value = rawLine.slice(idx + 1).trim();
    if (key.length === 0) {
      continue;
    }
    fields[key] = value;
  }
  return fields;
}

function parseMajor(version: string): number | null {
  if (!DOC_VERSION_RE.test(version)) {
    return null;
  }
  const major = Number.parseInt(version.split(".")[0] ?? "", 10);
  return Number.isFinite(major) ? major : null;
}

export function validateFrontMatter(
  relativePath: string,
  fields: FrontMatterFields,
  packageMajor: number,
): string[] {
  const errors: string[] = [];
  const version = fields["version"];
  if (version === undefined || version.length === 0) {
    errors.push(`${relativePath}: нет поля version`);
  } else if (!DOC_VERSION_RE.test(version)) {
    errors.push(`${relativePath}: version «${version}» не semver X.Y.Z`);
  } else {
    const major = parseMajor(version);
    if (major !== null && major > packageMajor) {
      errors.push(`${relativePath}: version ${version} обгоняет MAJOR ${packageMajor} системы`);
    }
  }

  const status = fields["status"];
  if (status === undefined || status.length === 0) {
    errors.push(`${relativePath}: нет поля status`);
  } else if (!DOC_STATUSES.has(status)) {
    errors.push(`${relativePath}: status «${status}» не из известного набора`);
  }

  const updated = fields["updated"];
  if (updated === undefined || updated.length === 0) {
    errors.push(`${relativePath}: нет поля updated`);
  } else if (!DOC_UPDATED_RE.test(updated) || Number.isNaN(Date.parse(`${updated}T00:00:00Z`))) {
    errors.push(`${relativePath}: updated «${updated}» не дата YYYY-MM-DD`);
  }

  return errors;
}

export function packageMajorFromVersion(version: string): number {
  const major = parseMajor(version);
  if (major === null) {
    throw new Error(`package.json version «${version}» не semver X.Y.Z`);
  }
  return major;
}
