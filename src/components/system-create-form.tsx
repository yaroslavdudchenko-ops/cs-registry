"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  SYSTEM_TYPE_SELECT_CLASS,
  SystemTypeSelectOptions,
} from "@/components/system-type-options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { apiRequest } from "@/lib/api";
import { CRITICALITY_OPTIONS, LIFECYCLE_OPTIONS, VALIDATION_OPTIONS } from "@/lib/labels";
import { DATA_CLASS_LABELS, HOSTING_LABELS, systemDetailSchema } from "@/lib/system-detail";
import { DATA_CLASSIFICATIONS, HOSTING_TYPES } from "@/server/db/enums";

export type OwnerOption = { id: string; full_name: string };

export function SystemCreateForm({ owners }: { owners: OwnerOption[] }): React.JSX.Element {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string>("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const processOwnerId = String(form.get("process_owner_id") ?? "");
    const systemOwnerId = String(form.get("system_owner_id") ?? "");
    if (name.length === 0 || processOwnerId.length === 0 || systemOwnerId.length === 0) {
      setError("Заполните название и обоих обязательных владельцев.");
      return;
    }
    setPending(true);
    setError(null);
    const result = await apiRequest<unknown>("/api/v1/systems", {
      method: "POST",
      body: JSON.stringify({
        name,
        vendor: emptyToNull(form.get("vendor")),
        system_type: String(form.get("system_type")),
        hosting_type: String(form.get("hosting_type")),
        data_classification: String(form.get("data_classification")),
        is_gxp_relevant: form.get("is_gxp_relevant") === "on",
        criticality: String(form.get("criticality")),
        lifecycle_status: String(form.get("lifecycle_status")),
        validation_status: String(form.get("validation_status")),
        process_owner_id: processOwnerId,
        system_owner_id: systemOwnerId,
        site: emptyToNull(form.get("site")),
      }),
    });
    setPending(false);
    if (!result.ok) {
      setRequestId(result.requestId);
      if (result.status === 403) {
        setError("Недостаточно прав для этого действия");
        return;
      }
      if (result.status === 422) {
        setError("Нужны владелец процесса и владелец системы");
        return;
      }
      setError("Не удалось создать систему");
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
    <form onSubmit={(event) => void onSubmit(event)} className="max-w-2xl space-y-5">
      <div>
        <Label htmlFor="name">Наименование</Label>
        <Input id="name" name="name" required maxLength={500} />
      </div>
      <div>
        <Label htmlFor="vendor">Вендор</Label>
        <Input id="vendor" name="vendor" maxLength={200} />
      </div>
      <div>
        <Label htmlFor="system_type">Тип</Label>
        <Select
          id="system_type"
          name="system_type"
          defaultValue="LIMS"
          required
          className={SYSTEM_TYPE_SELECT_CLASS}
        >
          <SystemTypeSelectOptions />
        </Select>
      </div>
      <div>
        <Label htmlFor="hosting_type">Размещение</Label>
        <Select id="hosting_type" name="hosting_type" defaultValue="on_prem" required>
          {HOSTING_TYPES.map((value) => (
            <option key={value} value={value}>
              {HOSTING_LABELS[value]}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="data_classification">Классификация данных</Label>
        <Select id="data_classification" name="data_classification" defaultValue="internal" required>
          {DATA_CLASSIFICATIONS.map((value) => (
            <option key={value} value={value}>
              {DATA_CLASS_LABELS[value]}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="criticality">Критичность</Label>
        <Select id="criticality" name="criticality" defaultValue="medium" required>
          {CRITICALITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="lifecycle_status">Жизненный цикл</Label>
        <Select id="lifecycle_status" name="lifecycle_status" defaultValue="planned" required>
          {LIFECYCLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="validation_status">Статус валидации</Label>
        <Select id="validation_status" name="validation_status" defaultValue="not_validated" required>
          {VALIDATION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="process_owner_id">Владелец процесса</Label>
        <Select id="process_owner_id" name="process_owner_id" defaultValue="" required>
          <option value="" disabled>
            Выберите сотрудника
          </option>
          {owners.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.full_name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="system_owner_id">Владелец системы</Label>
        <Select id="system_owner_id" name="system_owner_id" defaultValue="" required>
          <option value="" disabled>
            Выберите сотрудника
          </option>
          {owners.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.full_name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="site">Площадка</Label>
        <Input id="site" name="site" maxLength={200} />
      </div>
      <label htmlFor="is_gxp_relevant" className="flex items-center gap-2">
        <input id="is_gxp_relevant" name="is_gxp_relevant" type="checkbox" className="size-4 accent-accent" />
        Система относится к GxP
      </label>
      {error !== null ? (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {error}
          {requestId.length > 0 ? <span className="mt-1 block text-muted">Идентификатор запроса: {requestId}</span> : null}
        </p>
      ) : null}
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Сохранение…" : "Создать"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/systems")} disabled={pending}>
          Отмена
        </Button>
      </div>
    </form>
  );
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  if (value === null) {
    return null;
  }
  const text = String(value).trim();
  return text.length === 0 ? null : text;
}
