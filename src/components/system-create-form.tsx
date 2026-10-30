"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { EMPTY_INITIAL, SystemForm } from "@/components/system-form";
import type { OwnerOption } from "@/components/system-form-blocks";
import { apiRequest } from "@/lib/api";
import { systemDetailSchema } from "@/lib/system-detail";

export type { OwnerOption };

export function SystemCreateForm({ owners }: { owners: OwnerOption[] }): React.JSX.Element {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submit(payload: { body: Record<string, unknown> }): Promise<void> {
    setPending(true);
    setError(null);
    setFieldErrors({});
    const result = await apiRequest<unknown>("/api/v1/systems", {
      method: "POST",
      body: JSON.stringify(payload.body),
    });
    setPending(false);
    if (!result.ok) {
      setRequestId(result.requestId);
      if (result.status === 403) {
        setError("Недостаточно прав для этого действия.");
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
      setError("Не удалось создать систему.");
      return;
    }
    const parsed = systemDetailSchema.safeParse(result.data);
    if (!parsed.success) {
      router.replace("/systems");
      router.refresh();
      return;
    }
    router.replace(`/systems/${parsed.data.id}`);
    router.refresh();
  }

  return (
    <SystemForm
      owners={owners}
      initial={EMPTY_INITIAL}
      mode="create"
      requireReason={false}
      pending={pending}
      error={error}
      requestId={requestId}
      fieldErrors={fieldErrors}
      onSubmit={(payload) => void submit(payload)}
      onCancel={() => router.push("/systems")}
    />
  );
}
