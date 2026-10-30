"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTimeUtc, formatHours } from "@/lib/format";
import { isUncPath } from "@/lib/documents";
import {
  BACKUP_FREQUENCY_LABELS,
  COMPANY_LABELS,
  CRITICALITY_LABELS,
  DATA_CLASS_LABELS,
  DOMAIN_LABELS,
  GAMP_LABELS,
  HOSTING_LABELS,
  LIFECYCLE_LABELS,
  SERVER_TYPE_LABELS,
  SYSTEM_TYPE_LABELS,
  VALIDATION_LABELS,
} from "@/lib/labels";
import type { SystemDetail } from "@/lib/system-detail";

type PersonEntry = SystemDetail["people"][number];

export function SystemCard({ system }: { system: SystemDetail }): React.JSX.Element {
  const archived = system.archived_at !== null;
  const peopleBy = (role: PersonEntry["role"]): PersonEntry[] =>
    system.people.filter((p) => p.role === role);
  const notRequired = !system.is_gxp_relevant;
  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm text-muted">{system.code}</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{system.name}</h1>
          {archived ? <Badge className="bg-danger-soft text-danger">В архиве</Badge> : null}
          <Badge className="bg-accent-soft text-accent">
            {system.domain} — {DOMAIN_LABELS[system.domain]}
          </Badge>
        </div>
      </header>

      <Block title="1. Идентификация">
        <Field label="ID системы" value={system.code} />
        <Field label="Название" value={system.name} />
        <Field label="Домен" value={`${system.domain} — ${DOMAIN_LABELS[system.domain]}`} />
        <Field label="Назначение системы" value={system.purpose} wide />
        <Field label="Версия" value={system.product_version} />
        <Field label="Релиз" value={system.release} />
        <Field label="Подрядчик" value={system.vendor} />
        <Field label="РПП" value={system.release_manager_name} />
        <Field label="Тип" value={SYSTEM_TYPE_LABELS[system.system_type]} />
      </Block>

      <Block title="2. Владельцы и ответственные">
        <Field label="Владелец системы" value={system.system_owner_name} />
        <PeopleField label="Владельцы процесса" entries={peopleBy("process_owner")} />
        <PeopleField label="Ключевые пользователи" entries={peopleBy("key_user")} />
        <Field label="Владелец качества" value={system.quality_owner_name} />
      </Block>

      <Block title="3. Компания">
        <div className="sm:col-span-2">
          <dt className="text-sm text-muted">Компании группы</dt>
          <dd className="mt-1 text-base">
            {system.companies.length === 0
              ? "—"
              : system.companies.map((code) => COMPANY_LABELS[code]).join(", ")}
          </dd>
        </div>
      </Block>

      <Block title="4. GxP и валидация">
        <Field label="GxP-статус" value={system.is_gxp_relevant ? "Относится к GxP" : "Не относится к GxP"} />
        <GxpLockedField
          label="GxP-критичность"
          value={system.gxp_criticality === null ? null : CRITICALITY_LABELS[system.gxp_criticality]}
          locked={notRequired}
        />
        <GxpLockedField
          label="Категория GAMP 5"
          value={system.gamp_category === null ? null : GAMP_LABELS[system.gamp_category]}
          locked={notRequired}
        />
        <GxpLockedField
          label="Статус валидации"
          value={VALIDATION_LABELS[system.validation_status]}
          locked={notRequired}
        />
        <GxpLockedField
          label="Дата последней валидации"
          value={formatDate(system.validated_at)}
          locked={notRequired}
        />
        <GxpLockedField
          label="Плановая ревалидация"
          value={formatDate(system.next_review_at)}
          locked={notRequired}
        />
        <Field label="Общая критичность" value={CRITICALITY_LABELS[system.criticality]} />
      </Block>

      <Block title="5. ИТ">
        <PeopleField label="Поддержка" entries={peopleBy("support")} />
        <PeopleField label="Проектный менеджер" entries={peopleBy("project_manager")} />
        <PeopleField label="Бизнес-/системный аналитик" entries={peopleBy("analyst")} />
        <PeopleField label="Разработчик" entries={peopleBy("developer")} />
        <PeopleField label="Тестировщик" entries={peopleBy("tester")} />
      </Block>

      <Block title="6. Инфраструктура">
        <Field label="Сервер" value={system.server} />
        <Field
          label="Тип сервера"
          value={system.server_type === null ? null : SERVER_TYPE_LABELS[system.server_type]}
        />
        <Field label="Тип системы" value={SYSTEM_TYPE_LABELS[system.system_type]} />
        <Field label="Размещение" value={HOSTING_LABELS[system.hosting_type]} />
        <Field label="Провайдер" value={system.hosting_provider} />
        <Field label="Классификация данных" value={DATA_CLASS_LABELS[system.data_classification]} />
        <Field label="Жизненный цикл" value={LIFECYCLE_LABELS[system.lifecycle_status]} />
        <Field label="Площадка" value={system.site} />
        <Field
          label="Периодичность бэкапа"
          value={system.backup_frequency === null ? null : BACKUP_FREQUENCY_LABELS[system.backup_frequency]}
        />
        <Field label="RPO" value={formatHours(system.backup_rpo_hours)} />
        <Field label="RTO" value={formatHours(system.backup_rto_hours)} />
        <Field label="Модель аутентификации" value={system.auth_model} />
        <div className="sm:col-span-2">
          <dt className="text-sm text-muted">Интеграции</dt>
          <dd className="mt-1 text-base">
            {system.integrations.length === 0 ? "—" : system.integrations.join(", ")}
          </dd>
        </div>
      </Block>

      <Block title="7. Документация">
        <DocumentsBlock
          label="Внутренняя документация"
          items={system.documents.filter((d) => d.kind === "internal")}
        />
        <DocumentsBlock
          label="Документация вендора"
          items={system.documents.filter((d) => d.kind === "vendor")}
        />
      </Block>

      <Block title="8. Примечания">
        <Field label="Примечания" value={system.notes} wide />
        <Field label="Описание" value={system.description} wide />
        <Field label="Бизнес-процесс" value={system.business_process} wide />
        <Field label="DevOps" value={system.devops} wide />
      </Block>

      <dl className="grid gap-2 rounded-lg border border-line bg-surface p-4 text-sm text-muted sm:grid-cols-2">
        <div>Создана: {formatDateTimeUtc(system.created_at)}</div>
        <div>Изменена: {formatDateTimeUtc(system.updated_at)}</div>
      </dl>
    </article>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="space-y-3 rounded-lg border border-line bg-surface p-5">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <dl className="grid gap-4 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Field({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string | null | undefined;
  wide?: boolean;
}): React.JSX.Element {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 text-base">{value !== null && value !== undefined && value.length > 0 ? value : "—"}</dd>
    </div>
  );
}

function GxpLockedField({
  label,
  value,
  locked,
}: {
  label: string;
  value: string | null | undefined;
  locked: boolean;
}): React.JSX.Element {
  return (
    <div className={locked ? "opacity-60" : undefined} data-testid={`gxp-field-${label}`}>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 text-base">
        {locked ? "Не требуется" : value !== null && value !== undefined && value.length > 0 ? value : "—"}
      </dd>
    </div>
  );
}

function PeopleField({ label, entries }: { label: string; entries: PersonEntry[] }): React.JSX.Element {
  return (
    <div className="sm:col-span-2">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 text-base">
        {entries.length === 0 ? "—" : entries.map((p) => p.full_name).join(", ")}
      </dd>
    </div>
  );
}

function DocumentsBlock({
  label,
  items,
}: {
  label: string;
  items: SystemDetail["documents"];
}): React.JSX.Element {
  return (
    <div className="sm:col-span-2">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1">
        {items.length === 0 ? (
          <p className="text-base">—</p>
        ) : (
          <ul className="space-y-1">
            {items.map((d) => (
              <li key={d.id}>
                <DocumentRow title={d.title} url={d.url} />
              </li>
            ))}
          </ul>
        )}
      </dd>
    </div>
  );
}

function DocumentRow({ title, url }: { title: string; url: string }): React.JSX.Element {
  if (isUncPath(url)) {
    return <UncRow title={title} url={url} />;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent underline-offset-2 hover:underline"
    >
      {title} <span className="text-muted">({url})</span>
    </a>
  );
}

function UncRow({ title, url }: { title: string; url: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const copy = async (): Promise<void> => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard !== undefined) {
        await navigator.clipboard.writeText(url);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="font-medium">{title}</span>
      <code className="rounded bg-background px-2 py-0.5 text-sm">{url}</code>
      <Button type="button" variant="ghost" size="sm" onClick={() => void copy()}>
        {copied ? "Скопировано" : "Скопировать"}
      </Button>
    </span>
  );
}
