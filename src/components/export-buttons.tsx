"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useSession } from "@/components/session-provider";
import { canExportSystems } from "@/lib/labels";

export function ExportButtons({
  apiPath,
  query,
}: {
  apiPath: string;
  query?: { toString(): string };
}): React.JSX.Element | null {
  const user = useSession();
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState("");
  const [pending, setPending] = useState<"xlsx" | "pdf" | null>(null);

  if (!canExportSystems(user.role)) {
    return null;
  }

  async function download(format: "xlsx" | "pdf"): Promise<void> {
    setPending(format);
    setError(null);
    setRequestId("");
    const params = new URLSearchParams(query === undefined ? "" : query.toString());
    params.delete("page");
    params.delete("pageSize");
    params.set("format", format);
    const qs = params.toString();
    const url = qs.length > 0 ? `${apiPath}?${qs}` : `${apiPath}?format=${format}`;
    try {
      const response = await fetch(url, { credentials: "include" });
      if (response.status === 401) {
        window.location.replace("/login");
        return;
      }
      const headerId = response.headers.get("x-request-id") ?? "";
      if (!response.ok) {
        setRequestId(headerId);
        setError("Не удалось сформировать выгрузку");
        return;
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] ?? `cs-registry.${format}`;
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setError("Не удалось сформировать выгрузку");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" disabled={pending !== null} onClick={() => void download("xlsx")}>
          {pending === "xlsx" ? "Формируется…" : "Выгрузить в Excel"}
        </Button>
        <Button variant="outline" disabled={pending !== null} onClick={() => void download("pdf")}>
          {pending === "pdf" ? "Формируется…" : "Выгрузить в PDF"}
        </Button>
      </div>
      {error !== null ? (
        <p className="text-sm text-danger" role="alert">
          {error}
          {requestId.length > 0 ? ` Идентификатор запроса: ${requestId}` : ""}
        </p>
      ) : null}
    </div>
  );
}
