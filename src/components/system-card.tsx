import { Badge } from "@/components/ui/badge";
import { formatDate, formatDateTimeUtc, formatHours } from "@/lib/format";
import {
  CRITICALITY_LABELS,
  DATA_CLASS_LABELS,
  HOSTING_LABELS,
  LIFECYCLE_LABELS,
  SYSTEM_TYPE_LABELS,
  VALIDATION_LABELS,
} from "@/lib/labels";
import type { SystemDetail } from "@/lib/system-detail";

export function SystemCard({ system }: { system: SystemDetail }): React.JSX.Element {
  const archived = system.archived_at !== null;
  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm text-muted">{system.code}</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{system.name}</h1>
          {archived ? (
            <Badge className="bg-danger-soft text-danger">В архиве</Badge>
          ) : null}
        </div>
      </header>
      <dl className="grid gap-4 rounded-lg border border-line bg-surface p-5 sm:grid-cols-2">
        <Field label="Тип" value={SYSTEM_TYPE_LABELS[system.system_type]} />
        <Field label="Вендор" value={system.vendor} />
        <Field label="Версия продукта" value={system.product_version} />
        <Field label="Критичность" value={CRITICALITY_LABELS[system.criticality]} />
        <Field label="Жизненный цикл" value={LIFECYCLE_LABELS[system.lifecycle_status]} />
        <Field label="Валидация" value={VALIDATION_LABELS[system.validation_status]} />
        <Field label="Владелец процесса" value={system.process_owner_name} />
        <Field label="Владелец системы" value={system.system_owner_name} />
        <Field label="Владелец качества" value={system.quality_owner_name} />
        <Field label="Площадка" value={system.site} />
        <Field label="Размещение" value={HOSTING_LABELS[system.hosting_type]} />
        <Field label="Провайдер" value={system.hosting_provider} />
        <Field label="Классификация данных" value={DATA_CLASS_LABELS[system.data_classification]} />
        <Field label="GxP" value={system.is_gxp_relevant ? "Да" : "Нет"} />
        <Field label="Дата валидации" value={formatDate(system.validated_at)} />
        <Field label="Следующая переоценка" value={formatDate(system.next_review_at)} />
        <Field label="Модель аутентификации" value={system.auth_model} />
        <Field label="RPO резервного копирования" value={formatHours(system.backup_rpo_hours)} />
        <Field label="RTO резервного копирования" value={formatHours(system.backup_rto_hours)} />
        <Field label="Бизнес-процесс" value={system.business_process} wide />
        <Field label="Описание" value={system.description} wide />
        <Field label="Примечания" value={system.notes} wide />
        <Field label="Создана" value={formatDateTimeUtc(system.created_at)} />
        <Field label="Изменена" value={formatDateTimeUtc(system.updated_at)} />
      </dl>
    </article>
  );
}

function Field({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string | null;
  wide?: boolean;
}): React.JSX.Element {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 text-base">{value !== null && value.length > 0 ? value : "—"}</dd>
    </div>
  );
}
