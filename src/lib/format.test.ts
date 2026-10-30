import { describe, expect, it } from "vitest";

import { ERROR_CODES } from "@/server/http/errors";

import {
  CREATED_RECORD_LABEL,
  UUID_RE,
  formatAuditSnapshot,
  formatAuditValue,
  formatChangedFieldsLabel,
  formatDate,
  formatDateTimeUtc,
  formatHours,
  formatKnownScalar,
  isRejectionPayload,
  rejectionLabel,
} from "@/lib/format";

const CREATE_AFTER = {
  id: "9a13fe66-81e4-471a-8816-f5b2cd51e2ff",
  code: "SYS-0001",
  name: "Параллель А",
  vendor: "Citroën",
  product_version: null,
  description: null,
  system_type: "LIMS",
  business_process: null,
  process_owner_id: "e6c703ef-bb50-419e-b414-082f53bf7a71",
  process_owner_name: "Иванов Иван",
  system_owner_id: "2a5faf58-1658-48a5-92fe-f9abbfc620df",
  system_owner_name: "Петров Пётр",
  quality_owner_id: null,
  quality_owner_name: null,
  site: null,
  hosting_type: "on_prem",
  hosting_provider: null,
  data_classification: "internal",
  is_gxp_relevant: true,
  criticality: "medium",
  lifecycle_status: "active",
  validation_status: "not_validated",
  validated_at: null,
  next_review_at: null,
  auth_model: null,
  backup_rpo_hours: null,
  backup_rto_hours: null,
  notes: null,
  archived_at: null,
  created_at: "2026-10-29T10:40:25.360Z",
  updated_at: "2026-10-29T10:40:25.360Z",
  version: 1,
};

describe("formatDate", () => {
  it("prints a calendar date in ru-RU", () => {
    expect(formatDate("2026-10-29")).toBe("29.10.2026");
  });

  it("prints em dash for empty", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("")).toBe("—");
  });
});

describe("formatDateTimeUtc", () => {
  it("keeps the UTC suffix", () => {
    expect(formatDateTimeUtc("2026-01-02T03:04:05.000Z")).toContain("UTC");
  });
});

describe("formatHours", () => {
  it("prints hours or em dash", () => {
    expect(formatHours(12)).toBe("12 ч");
    expect(formatHours(null)).toBe("—");
  });
});

describe("formatAuditValue", () => {
  it("translates enums and booleans", () => {
    expect(formatAuditValue("high")).toBe("Высокая");
    expect(formatAuditValue("validated")).toBe("Валидирована");
    expect(formatAuditValue(true)).toBe("Да");
    expect(formatAuditValue(null)).toBe("—");
  });
});

describe("rejection", () => {
  it("detects refusal payload and labels it in Russian", () => {
    expect(isRejectionPayload({ code: "REASON_REQUIRED" })).toBe(true);
    expect(rejectionLabel({ code: "REASON_REQUIRED" })).toBe("Нет причины изменения");
    expect(isRejectionPayload({ name: "LIMS" })).toBe(false);
  });

  it("does not treat a system snapshot with code SYS-NNNN as a refusal", () => {
    expect(isRejectionPayload({ code: "SYS-0001", name: "Параллель А" })).toBe(false);
    expect(isRejectionPayload({ code: "SYS-0001" })).toBe(false);
  });
});

describe("create snapshot", () => {
  it("omits technical keys, version and uuids from the create dump", () => {
    const text = formatAuditSnapshot(CREATE_AFTER, Object.keys(CREATE_AFTER));
    expect(text).toContain("SYS-0001");
    expect(text).toContain("Параллель А");
    expect(text).toContain("Иванов Иван");
    expect(text).toContain("LIMS");
    expect(text).not.toContain("id");
    expect(text).not.toContain("version");
    expect(text).not.toMatch(UUID_RE);
    expect(text).not.toContain("created_at");
    expect(text).not.toContain("updated_at");
    expect(text).not.toContain("archived_at");
    expect(text).not.toContain("process_owner_id");
  });

  it("does not print a field missing from changed_fields", () => {
    const text = formatAuditSnapshot(CREATE_AFTER, ["name", "criticality"]);
    expect(text).toContain("Параллель А");
    expect(text).toContain("Средняя");
    expect(text).not.toContain("Citroën");
    expect(text).not.toContain("LIMS");
  });

  it("maps owner id changes to names", () => {
    expect(formatChangedFieldsLabel(["process_owner_id", "id", "version"])).toBe("Владелец процесса");
  });
});

describe("formatChangedFieldsLabel", () => {
  it("does not enumerate fields when before is null", () => {
    const label = formatChangedFieldsLabel(Object.keys(CREATE_AFTER), {
      before: null,
      after: CREATE_AFTER,
    });
    expect(label).toBe(CREATED_RECORD_LABEL);
    expect(label).not.toContain("Наименование");
    expect(label).not.toContain(",");
  });

  it("returns the field list for a regular update and includes Наименование", () => {
    const label = formatChangedFieldsLabel(["name", "vendor"], {
      before: { name: "Старое", vendor: "Acme" },
      after: { name: "Параллель А", vendor: "Citroën" },
    });
    expect(label).toContain("Наименование");
    expect(label).toBe("Наименование, Вендор");
  });

  it("keeps an em dash for a rejection with null changed_fields", () => {
    expect(
      formatChangedFieldsLabel(null, {
        before: null,
        after: { code: "REASON_REQUIRED" },
      }),
    ).toBe("—");
  });

  it("omits service timestamps from an update field list", () => {
    const label = formatChangedFieldsLabel(["name", "created_at", "updated_at", "archived_at"], {
      before: { name: "Старое" },
      after: { name: "Параллель А" },
    });
    expect(label).toBe("Наименование");
    expect(label).not.toContain("Создана");
    expect(label).not.toContain("Изменена");
    expect(label).not.toContain("Дата архивации");
  });
});

describe("audit display codes", () => {
  it("maps every ApiError code to a Russian label without the raw code", () => {
    expect(ERROR_CODES.length).toBeGreaterThan(3);
    for (const code of ERROR_CODES) {
      const label = formatKnownScalar(code);
      expect(label.length, code).toBeGreaterThan(0);
      expect(label, code).not.toMatch(/_/);
      expect(label, code).not.toMatch(/[A-Z]/);
      expect(label, code).not.toContain(code);
    }
  });

  it("treats AUTH_LOCKED as a refusal and does not print the raw code", () => {
    expect(isRejectionPayload({ code: "AUTH_LOCKED" })).toBe(true);
    const text = formatAuditSnapshot({ code: "AUTH_LOCKED" }, null);
    expect(text).not.toContain("AUTH_LOCKED");
    expect(text).toMatch(/[А-Яа-яЁё]/);
  });

  it("prints filter order newest/oldest in Russian", () => {
    const newest = formatAuditSnapshot(
      { filters: { page: 1, order: "newest", pageSize: 50 } },
      null,
    );
    expect(newest).toContain("Сначала новые");
    expect(newest).not.toContain("newest");
    const oldest = formatAuditSnapshot(
      { filters: { page: 1, order: "oldest", pageSize: 50 } },
      null,
    );
    expect(oldest).toContain("Сначала старые");
    expect(oldest).not.toContain("oldest");
  });

  it("does not leak an unknown ApiError-like code into the UI", () => {
    expect(formatKnownScalar("SOME_NEW_ERROR")).toBe("Отказ");
    expect(formatKnownScalar("SOME_NEW_ERROR")).not.toContain("SOME_NEW_ERROR");
  });
});
