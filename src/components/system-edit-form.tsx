"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { SystemForm, initialFromDetail } from "@/components/system-form";
import type { OwnerOption } from "@/components/system-form-blocks";
import { apiRequest } from "@/lib/api";
import { apiErrorText } from "@/lib/api-errors";
import { systemDetailSchema, type SystemDetail } from "@/lib/system-detail";

export function SystemEditForm({
  system,
  owners,
}: {
  system: SystemDetail;
  owners: OwnerOption[];
  role: string;
}): React.JSX.Element {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submit(payload: { body: Record<string, unknown> }): Promise<void> {
    setPending(true);
    setError(null);
    setFieldErrors({});
    const body = { ...payload.body, version: system.version };
    const result = await apiRequest<unknown>(`/api/v1/systems/${system.id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    setPending(false);
    if (!result.ok) {
      setRequestId(result.requestId);
      if (result.status === 401) {
        router.replace("/login");
        return;
      }
      const fields = result.data?.fields ?? [];
      if (fields.length > 0) {
        const map: Record<string, string> = {};
        for (const f of fields) {
          if (f.field.length > 0) map[f.field] = f.message;
        }
        setFieldErrors(map);
        const first = fields[0];
        setError(first !== undefined ? first.message : "Запрос не проходит проверку.");
        return;
      }
      setError(apiErrorText(result.code, "Не удалось сохранить изменения."));
      return;
    }
    const parsed = systemDetailSchema.safeParse(result.data);
    router.replace(parsed.success ? `/systems/${parsed.data.id}` : `/systems/${system.id}`);
    router.refresh();
  }

  return (
    <SystemForm
      owners={owners}
      initial={initialFromDetail(system)}
      mode="edit"
      code={system.code}
      requireReason
      pending={pending}
      error={error}
      requestId={requestId}
      fieldErrors={fieldErrors}
      onSubmit={(payload) => void submit(payload)}
      onCancel={() => router.push(`/systems/${system.id}`)}
    />
  );
}
