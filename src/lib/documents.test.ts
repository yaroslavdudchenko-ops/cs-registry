import { describe, expect, it } from "vitest";

import {
  documentUrlReason,
  isAllowedDocumentUrl,
  isHttpUrl,
  isUncPath,
} from "./documents";

describe("isHttpUrl", () => {
  it("http и https — true", () => {
    expect(isHttpUrl("http://example.com")).toBe(true);
    expect(isHttpUrl("https://example.com/path?q=1")).toBe(true);
    expect(isHttpUrl("  https://example.com  ")).toBe(true);
  });

  it("javascript:, data:, file:, ftp: — false", () => {
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("data:text/html,<script>")).toBe(false);
    expect(isHttpUrl("file:///etc/passwd")).toBe(false);
    expect(isHttpUrl("ftp://example.com")).toBe(false);
    expect(isHttpUrl("")).toBe(false);
    expect(isHttpUrl("example.com")).toBe(false);
  });
});

describe("isUncPath", () => {
  it("распознаёт \\\\server\\share", () => {
    expect(isUncPath("\\\\fileserver\\docs")).toBe(true);
    expect(isUncPath("\\\\srv\\dir\\sub")).toBe(true);
  });

  it("отвергает одиночный \\, http и прочее", () => {
    expect(isUncPath("\\single")).toBe(false);
    expect(isUncPath("https://x")).toBe(false);
    expect(isUncPath("\\\\")).toBe(false);
  });
});

describe("isAllowedDocumentUrl и documentUrlReason", () => {
  it("http(s) и UNC — разрешены, причины нет", () => {
    expect(isAllowedDocumentUrl("https://wiki/urs")).toBe(true);
    expect(isAllowedDocumentUrl("\\\\fs\\share\\doc.pdf")).toBe(true);
    expect(documentUrlReason("https://wiki/urs")).toBeNull();
    expect(documentUrlReason("\\\\fs\\share\\doc.pdf")).toBeNull();
  });

  it("опасные схемы — не разрешены, причина по-русски", () => {
    expect(isAllowedDocumentUrl("javascript:alert(1)")).toBe(false);
    const reason = documentUrlReason("javascript:alert(1)");
    expect(reason).not.toBeNull();
    expect(reason!).toContain("http");
    expect(reason!).toContain("\\\\");
  });

  it("пустая строка — отдельная подсказка", () => {
    expect(documentUrlReason("")).toBe("Укажите адрес.");
  });
});
