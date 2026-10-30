"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { OwnerOption } from "@/components/system-create-form";
import {
  SYSTEM_TYPE_SELECT_CLASS,
  SystemTypeSelectOptions,
} from "@/components/system-type-options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { DateField } from "@/components/ui/date-field";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/api";
import { RU_DATE_ERROR, parseRuDate } from "@/lib/ru-date";
import { apiErrorText } from "@/lib/api-errors";
import {
  CRITICALITY_OPTIONS,
  DATA_CLASS_OPTIONS,
  HOSTING_OPTIONS,
  LIFECYCLE_OPTIONS,
  VALIDATION_LABELS,
  VALIDATION_OPTIONS,
  canChangeValidationStatus,
} from "@/lib/labels";
import { systemDetailSchema, type SystemDetail } from "@/lib/system-detail";
import type { HostingType, ValidationStatus } from "@/server/db/enums";

export function SystemEditForm({
  system,
  owners,
  role,
}: {
  system: SystemDetail;
  owners: OwnerOption[];
  role: string;
}): React.JSX.Element {
  const router = useRouter();
  const allowValidation = canChangeValidationStatus(role);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState("");
  const [hostingType, setHostingType] = useState<HostingType>(system.hosting_type);
  const [hostingProvider, setHostingProvider] = useState(system.hosting_provider ?? "");
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>(system.validation_status);
  const [validatedAt, setValidatedAt] = useState(system.validated_at ?? "");

  const mergedOwners = mergeOwners(owners, system);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const processOwnerId = String(form.get("process_owner_id") ?? "");
    const systemOwnerId = String(form.get("system_owner_id") ?? "");
    const reason = String(form.get("reason") ?? "").trim();
    if (name.length === 0 || processOwnerId.length === 0 || systemOwnerId.length === 0) {
      setError("Заполните название и обоих обязательных владельцев.");
      return;
    }
    if (reason.length === 0) {
      setError("Укажите причину изменения.");
      return;
    }
    const qualityOwnerRaw = String(form.get("quality_owner_id") ?? "");
    const validatedParsed = parseRuDate(String(form.get("validated_at") ?? ""));
    const reviewParsed = parseRuDate(String(form.get("next_review_at") ?? ""));
    if (!validatedParsed.ok || !reviewParsed.ok) {
      setError(RU_DATE_ERROR);
      return;
    }
    const body: Record<string, unknown> = {
      version: system.version,
      name,
      vendor: emptyToNull(form.get("vendor")),
      product_version: emptyToNull(form.get("product_version")),
      description: emptyToNull(form.get("description")),
      system_type: String(form.get("system_type")),
      business_process: emptyToNull(form.get("business_process")),
      process_owner_id: processOwnerId,
      system_owner_id: systemOwnerId,
      quality_owner_id: qualityOwnerRaw.length === 0 ? null : qualityOwnerRaw,
      site: emptyToNull(form.get("site")),
      hosting_type: hostingType,
      hosting_provider: emptyToNull(hostingProvider),
      data_classification: String(form.get("data_classification")),
      is_gxp_relevant: form.get("is_gxp_relevant") === "on",
      criticality: String(form.get("criticality")),
      lifecycle_status: String(form.get("lifecycle_status")),
      validated_at: validatedParsed.iso,
      next_review_at: reviewParsed.iso,
      auth_model: emptyToNull(form.get("auth_model")),
      backup_rpo_hours: optionalHours(form.get("backup_rpo_hours")),
      backup_rto_hours: optionalHours(form.get("backup_rto_hours")),
      notes: emptyToNull(form.get("notes")),
      reason,
    };
    if (allowValidation) {
      body.validation_status = validationStatus;
    }
    setPending(true);
    setError(null);
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
      setError(apiErrorText(result.code, "Не удалось сохранить изменения"));
      return;
    }
    const parsed = systemDetailSchema.safeParse(result.data);
    router.replace(parsed.success ? `/systems/${parsed.data.id}` : `/systems/${system.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="max-w-2xl space-y-5">
      <div>
        <Label htmlFor="code">Код</Label>
        <Input id="code" name="code" defaultValue={system.code} readOnly disabled />
      </div>
      <div>
        <Label htmlFor="name">Наименование</Label>
        <Input id="name" name="name" required maxLength={500} defaultValue={system.name} />
      </div>
      <div>
        <Label htmlFor="vendor">Вендор</Label>
        <Input id="vendor" name="vendor" maxLength={200} defaultValue={system.vendor ?? ""} />
      </div>
      <div>
        <Label htmlFor="product_version">Версия продукта</Label>
        <Input
          id="product_version"
          name="product_version"
          maxLength={100}
          defaultValue={system.product_version ?? ""}
        />
      </div>
      <div>
        <Label htmlFor="system_type">Тип</Label>
        <Select
          id="system_type"
          name="system_type"
          defaultValue={system.system_type}
          required
          className={SYSTEM_TYPE_SELECT_CLASS}
        >
          <SystemTypeSelectOptions />
        </Select>
      </div>
      <div>
        <Label htmlFor="business_process">Бизнес-процесс</Label>
        <Input
          id="business_process"
          name="business_process"
          maxLength={2000}
          defaultValue={system.business_process ?? ""}
        />
      </div>
      <div>
        <Label htmlFor="description">Описание</Label>
        <Textarea id="description" name="description" defaultValue={system.description ?? ""} />
      </div>
      <div>
        <Label htmlFor="process_owner_id">Владелец процесса</Label>
        <Select id="process_owner_id" name="process_owner_id" defaultValue={system.process_owner_id} required>
          {mergedOwners.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.full_name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="system_owner_id">Владелец системы</Label>
        <Select id="system_owner_id" name="system_owner_id" defaultValue={system.system_owner_id} required>
          {mergedOwners.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.full_name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="quality_owner_id">Владелец качества</Label>
        <Select
          id="quality_owner_id"
          name="quality_owner_id"
          defaultValue={system.quality_owner_id ?? ""}
        >
          <option value="">Не назначен</option>
          {mergedOwners.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.full_name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="site">Площадка</Label>
        <Input id="site" name="site" maxLength={200} defaultValue={system.site ?? ""} />
      </div>
      <div>
        <Label htmlFor="hosting_type">Размещение</Label>
        <Select
          id="hosting_type"
          name="hosting_type"
          value={hostingType}
          required
          onValueChange={(value) => setHostingType(value as HostingType)}
        >
          {HOSTING_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="hosting_provider">Провайдер</Label>
        <Input
          id="hosting_provider"
          name="hosting_provider"
          maxLength={200}
          value={hostingProvider}
          onChange={(event) => setHostingProvider(event.target.value)}
        />
        {hostingType === "cloud" && hostingProvider.trim().length === 0 ? (
          <p className="mt-1 text-sm text-muted">Для облачного размещения укажите провайдера, если он известен.</p>
        ) : null}
      </div>
      <div>
        <Label htmlFor="data_classification">Классификация данных</Label>
        <Select
          id="data_classification"
          name="data_classification"
          defaultValue={system.data_classification}
          required
        >
          {DATA_CLASS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="criticality">Критичность</Label>
        <Select id="criticality" name="criticality" defaultValue={system.criticality} required>
          {CRITICALITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="lifecycle_status">Жизненный цикл</Label>
        <Select id="lifecycle_status" name="lifecycle_status" defaultValue={system.lifecycle_status} required>
          {LIFECYCLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="validation_status">Статус валидации</Label>
        {allowValidation ? (
          <Select
            id="validation_status"
            name="validation_status"
            value={validationStatus}
            onValueChange={(value) => setValidationStatus(value as ValidationStatus)}
          >
            {VALIDATION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        ) : (
          <p id="validation_status" className="rounded-md border border-line bg-background px-3 py-2">
            {VALIDATION_LABELS[system.validation_status]}
          </p>
        )}
      </div>
      <DateField
        id="validated_at"
        name="validated_at"
        label="Дата валидации"
        isoValue={system.validated_at ?? ""}
        onIsoChange={setValidatedAt}
        {...(validationStatus === "validated" && validatedAt.length === 0
          ? { hint: "Для валидированной системы лучше указать дату. Формат ДД.ММ.ГГГГ." }
          : {})}
      />
      <DateField
        id="next_review_at"
        name="next_review_at"
        label="Следующая переоценка"
        isoValue={system.next_review_at ?? ""}
        onIsoChange={() => undefined}
      />
      <div>
        <Label htmlFor="auth_model">Модель аутентификации</Label>
        <Input id="auth_model" name="auth_model" maxLength={200} defaultValue={system.auth_model ?? ""} />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="backup_rpo_hours">RPO, часы</Label>
          <Input
            id="backup_rpo_hours"
            name="backup_rpo_hours"
            type="number"
            min={0}
            step={1}
            defaultValue={system.backup_rpo_hours ?? ""}
          />
        </div>
        <div>
          <Label htmlFor="backup_rto_hours">RTO, часы</Label>
          <Input
            id="backup_rto_hours"
            name="backup_rto_hours"
            type="number"
            min={0}
            step={1}
            defaultValue={system.backup_rto_hours ?? ""}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="notes">Примечания</Label>
        <Textarea id="notes" name="notes" defaultValue={system.notes ?? ""} />
      </div>
      <label htmlFor="is_gxp_relevant" className="flex items-center gap-2">
        <input
          id="is_gxp_relevant"
          name="is_gxp_relevant"
          type="checkbox"
          className="size-4 accent-accent"
          defaultChecked={system.is_gxp_relevant}
        />
        Система относится к GxP
      </label>
      <div>
        <Label htmlFor="reason">Причина изменения</Label>
        <Textarea id="reason" name="reason" required />
        <p className="mt-1 text-sm text-muted">
          Причина обязательна для критичных полей и любой правки валидированной системы. Укажите её
          всегда, чтобы запись в журнале была полной.
        </p>
      </div>
      {error !== null ? (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {error}
          {requestId.length > 0 ? (
            <span className="mt-1 block text-muted">Идентификатор запроса: {requestId}</span>
          ) : null}
        </p>
      ) : null}
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Сохранение…" : "Сохранить"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/systems/${system.id}`)}
          disabled={pending}
        >
          Отмена
        </Button>
      </div>
    </form>
  );
}

function emptyToNull(value: FormDataEntryValue | string | null): string | null {
  if (value === null) {
    return null;
  }
  const text = String(value).trim();
  return text.length === 0 ? null : text;
}

function optionalHours(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "").trim();
  if (text.length === 0) {
    return null;
  }
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function mergeOwners(owners: OwnerOption[], system: SystemDetail): OwnerOption[] {
  const map = new Map(owners.map((owner) => [owner.id, owner]));
  const extras: OwnerOption[] = [
    { id: system.process_owner_id, full_name: system.process_owner_name },
    { id: system.system_owner_id, full_name: system.system_owner_name },
  ];
  if (system.quality_owner_id !== null && system.quality_owner_name !== null) {
    extras.push({ id: system.quality_owner_id, full_name: system.quality_owner_name });
  }
  for (const owner of extras) {
    if (!map.has(owner.id)) {
      map.set(owner.id, owner);
    }
  }
  return [...map.values()];
}
