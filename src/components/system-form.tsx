"use client";

import { useMemo, useState } from "react";

import {
  ChipsMulti,
  DocumentsList,
  FormBlock,
  PeopleList,
  PersonField,
  StringList,
  fieldErrorFor,
  type DocumentValue,
  type OwnerOption,
  type PersonValue,
} from "@/components/system-form-blocks";
import {
  SYSTEM_TYPE_SELECT_CLASS,
  SystemTypeSelectOptions,
} from "@/components/system-type-options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  BACKUP_FREQUENCY_OPTIONS,
  COMPANY_OPTIONS,
  CRITICALITY_OPTIONS,
  DATA_CLASS_OPTIONS,
  DOMAIN_OPTIONS,
  GAMP_OPTIONS,
  HOSTING_OPTIONS,
  LIFECYCLE_OPTIONS,
  SERVER_TYPE_OPTIONS,
  VALIDATION_OPTIONS,
} from "@/lib/labels";
import type {
  BackupFrequency,
  CompanyCode,
  Criticality,
  DataClassification,
  GampCategory,
  HostingType,
  LifecycleStatus,
  ServerType,
  SystemDomain,
  SystemType,
  ValidationStatus,
} from "@/server/db/enums";
import { cn } from "@/lib/utils";

export type SystemFormInitialState = {
  name: string;
  domain: SystemDomain;
  purpose: string;
  release: string;
  vendor: string;
  product_version: string;
  description: string;
  system_type: SystemType;
  business_process: string;
  hosting_type: HostingType;
  hosting_provider: string;
  data_classification: DataClassification;
  site: string;
  server: string;
  server_type: ServerType | "";
  is_gxp_relevant: boolean;
  criticality: Criticality;
  gxp_criticality: Criticality | "";
  gamp_category: GampCategory | "";
  lifecycle_status: LifecycleStatus;
  validation_status: ValidationStatus;
  validated_at: string;
  next_review_at: string;
  auth_model: string;
  backup_frequency: BackupFrequency | "";
  backup_rpo_hours: string;
  backup_rto_hours: string;
  integrations: string[];
  notes: string;
  devops: string;
  system_owner: PersonValue | null;
  release_manager: PersonValue | null;
  process_owners: PersonValue[];
  key_users: PersonValue[];
  support_people: PersonValue[];
  project_managers: PersonValue[];
  analysts: PersonValue[];
  developers: PersonValue[];
  testers: PersonValue[];
  companies: CompanyCode[];
  internal_documents: DocumentValue[];
  vendor_documents: DocumentValue[];
};

export const EMPTY_INITIAL: SystemFormInitialState = {
  name: "",
  domain: "IT",
  purpose: "",
  release: "",
  vendor: "",
  product_version: "",
  description: "",
  system_type: "LIMS",
  business_process: "",
  hosting_type: "on_prem",
  hosting_provider: "",
  data_classification: "internal",
  site: "",
  server: "",
  server_type: "",
  is_gxp_relevant: false,
  criticality: "medium",
  gxp_criticality: "",
  gamp_category: "",
  lifecycle_status: "planned",
  validation_status: "not_required",
  validated_at: "",
  next_review_at: "",
  auth_model: "",
  backup_frequency: "",
  backup_rpo_hours: "",
  backup_rto_hours: "",
  integrations: [],
  notes: "",
  devops: "",
  system_owner: null,
  release_manager: null,
  process_owners: [],
  key_users: [],
  support_people: [],
  project_managers: [],
  analysts: [],
  developers: [],
  testers: [],
  companies: [],
  internal_documents: [],
  vendor_documents: [],
};

export type SystemFormSubmitPayload = {
  body: Record<string, unknown>;
};

type Props = {
  owners: OwnerOption[];
  initial: SystemFormInitialState;
  mode: "create" | "edit";
  code?: string;
  requireReason: boolean;
  pending: boolean;
  error: string | null;
  requestId: string;
  fieldErrors: Record<string, string>;
  onSubmit: (payload: SystemFormSubmitPayload) => void;
  onCancel: () => void;
};

const PERSON_LIST_KEYS = [
  "process_owners",
  "key_users",
  "support_people",
  "project_managers",
  "analysts",
  "developers",
  "testers",
] as const satisfies ReadonlyArray<keyof SystemFormInitialState>;

function toPersonDto(person: PersonValue | null): Record<string, unknown> | null {
  if (person === null) return null;
  if (person.user_id !== null) return { user_id: person.user_id };
  const name = person.full_name.trim();
  if (name.length === 0) return null;
  return { full_name: name };
}

function toPersonList(list: PersonValue[]): Array<Record<string, unknown>> {
  return list
    .map(toPersonDto)
    .filter((v): v is Record<string, unknown> => v !== null);
}

function toDocsDto(list: DocumentValue[]): Array<Record<string, unknown>> {
  return list
    .map((d) => ({ title: d.title.trim(), url: d.url.trim() }))
    .filter((d) => d.title.length > 0 && d.url.length > 0);
}

function toNullableInt(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function SystemForm({
  owners,
  initial,
  mode,
  code,
  requireReason,
  pending,
  error,
  requestId,
  fieldErrors,
  onSubmit,
  onCancel,
}: Props): React.JSX.Element {
  const [state, setState] = useState<SystemFormInitialState>(initial);
  const [reason, setReason] = useState("");

  const patch = <K extends keyof SystemFormInitialState>(
    key: K,
    value: SystemFormInitialState[K],
  ): void => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const gxpLocked = !state.is_gxp_relevant;
  const effectiveValidation: ValidationStatus = gxpLocked ? "not_required" : state.validation_status;

  const buildBody = (): Record<string, unknown> => {
    const body: Record<string, unknown> = {
      name: state.name.trim(),
      domain: state.domain,
      purpose: state.purpose.trim() || null,
      release: state.release.trim() || null,
      vendor: state.vendor.trim() || null,
      product_version: state.product_version.trim() || null,
      description: state.description.trim() || null,
      system_type: state.system_type,
      business_process: state.business_process.trim() || null,
      hosting_type: state.hosting_type,
      hosting_provider: state.hosting_provider.trim() || null,
      data_classification: state.data_classification,
      is_gxp_relevant: state.is_gxp_relevant,
      criticality: state.criticality,
      gxp_criticality: gxpLocked ? null : state.gxp_criticality === "" ? null : state.gxp_criticality,
      gamp_category: gxpLocked ? null : state.gamp_category === "" ? null : state.gamp_category,
      lifecycle_status: state.lifecycle_status,
      validation_status: gxpLocked ? "not_required" : state.validation_status,
      validated_at: gxpLocked ? null : state.validated_at || null,
      next_review_at: gxpLocked ? null : state.next_review_at || null,
      site: state.site.trim() || null,
      server: state.server.trim() || null,
      server_type: state.server_type === "" ? null : state.server_type,
      auth_model: state.auth_model.trim() || null,
      backup_frequency: state.backup_frequency === "" ? null : state.backup_frequency,
      backup_rpo_hours: toNullableInt(state.backup_rpo_hours),
      backup_rto_hours: toNullableInt(state.backup_rto_hours),
      integrations: state.integrations.map((v) => v.trim()).filter((v) => v.length > 0),
      notes: state.notes.trim() || null,
      devops: state.devops.trim() || null,
      system_owner: toPersonDto(state.system_owner) ?? undefined,
      release_manager: state.release_manager === null ? null : toPersonDto(state.release_manager),
      process_owners: toPersonList(state.process_owners),
      key_users: toPersonList(state.key_users),
      support_people: toPersonList(state.support_people),
      project_managers: toPersonList(state.project_managers),
      analysts: toPersonList(state.analysts),
      developers: toPersonList(state.developers),
      testers: toPersonList(state.testers),
      companies: state.companies,
      internal_documents: toDocsDto(state.internal_documents).map((d) => ({ ...d, kind: "internal" })),
      vendor_documents: toDocsDto(state.vendor_documents).map((d) => ({ ...d, kind: "vendor" })),
    };
    if (body.system_owner === undefined) delete body.system_owner;
    if (reason.trim().length > 0) body.reason = reason.trim();
    return body;
  };

  const handle = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onSubmit({ body: buildBody() });
  };

  const combinedOwners = useMemo(() => owners, [owners]);

  return (
    <form onSubmit={handle} className="space-y-6" aria-busy={pending}>
      <FormBlock title="1. Идентификация">
        {mode === "edit" && code !== undefined ? (
          <div>
            <Label htmlFor="code">ID системы</Label>
            <Input id="code" value={code} readOnly disabled />
          </div>
        ) : null}
        <div>
          <Label htmlFor="name">Название</Label>
          <Input
            id="name"
            value={state.name}
            onChange={(e) => patch("name", e.target.value)}
            maxLength={500}
            required
            aria-invalid={fieldErrorFor(fieldErrors, "name") !== undefined}
          />
          <FieldError text={fieldErrorFor(fieldErrors, "name")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="domain">Домен</Label>
            <Select
              id="domain"
              value={state.domain}
              onValueChange={(v) => patch("domain", v as SystemDomain)}
              required
            >
              {DOMAIN_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <FieldError text={fieldErrorFor(fieldErrors, "domain")} />
          </div>
          <div>
            <Label htmlFor="system_type">Тип</Label>
            <Select
              id="system_type"
              value={state.system_type}
              onValueChange={(v) => patch("system_type", v as SystemType)}
              className={SYSTEM_TYPE_SELECT_CLASS}
              required
            >
              <SystemTypeSelectOptions />
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="purpose">Назначение системы</Label>
          <Textarea
            id="purpose"
            value={state.purpose}
            onChange={(e) => patch("purpose", e.target.value)}
            maxLength={10_000}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="product_version">Версия</Label>
            <Input
              id="product_version"
              value={state.product_version}
              onChange={(e) => patch("product_version", e.target.value)}
              maxLength={100}
            />
          </div>
          <div>
            <Label htmlFor="release">Релиз</Label>
            <Input
              id="release"
              value={state.release}
              onChange={(e) => patch("release", e.target.value)}
              maxLength={200}
            />
          </div>
          <div>
            <Label htmlFor="vendor">Подрядчик</Label>
            <Input
              id="vendor"
              value={state.vendor}
              onChange={(e) => patch("vendor", e.target.value)}
              maxLength={200}
            />
          </div>
        </div>
        <PersonField
          label="РПП — руководитель портфеля проектов"
          value={state.release_manager}
          onChange={(v) => patch("release_manager", v)}
          owners={combinedOwners}
          fieldName="release_manager"
          error={fieldErrorFor(fieldErrors, "release_manager")}
        />
      </FormBlock>

      <FormBlock title="2. Владельцы и ответственные">
        <PersonField
          label="Владелец системы"
          value={state.system_owner}
          onChange={(v) => patch("system_owner", v)}
          owners={combinedOwners}
          fieldName="system_owner"
          error={fieldErrorFor(fieldErrors, "system_owner")}
        />
        <PeopleList
          label="Владельцы процесса"
          value={state.process_owners}
          onChange={(v) => patch("process_owners", v)}
          owners={combinedOwners}
          fieldName="process_owners"
          error={fieldErrorFor(fieldErrors, "process_owners")}
        />
        <PeopleList
          label="Ключевые пользователи"
          value={state.key_users}
          onChange={(v) => patch("key_users", v)}
          owners={combinedOwners}
          fieldName="key_users"
          error={fieldErrorFor(fieldErrors, "key_users")}
        />
      </FormBlock>

      <FormBlock title="3. Компания">
        <ChipsMulti
          label="Компании группы"
          value={state.companies}
          onChange={(v) => patch("companies", v)}
          options={COMPANY_OPTIONS}
          fieldName="companies"
        />
      </FormBlock>

      <FormBlock title="4. GxP и валидация">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="size-4 accent-accent"
            checked={state.is_gxp_relevant}
            data-testid="is_gxp_relevant"
            onChange={(e) => patch("is_gxp_relevant", e.target.checked)}
          />
          <span>Система относится к GxP</span>
        </label>
        <div className={cn("grid gap-4 sm:grid-cols-2", gxpLocked && "opacity-60")}>
          <div>
            <Label htmlFor="gxp_criticality">GxP-критичность</Label>
            <Select
              id="gxp_criticality"
              value={state.gxp_criticality}
              onValueChange={(v) => patch("gxp_criticality", v as Criticality | "")}
              disabled={gxpLocked}
              aria-invalid={fieldErrorFor(fieldErrors, "gxp_criticality") !== undefined}
            >
              <option value="">— не выбрано —</option>
              {CRITICALITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <FieldError text={fieldErrorFor(fieldErrors, "gxp_criticality")} />
          </div>
          <div>
            <Label htmlFor="gamp_category">Категория GAMP 5</Label>
            <Select
              id="gamp_category"
              value={state.gamp_category}
              onValueChange={(v) => patch("gamp_category", v as GampCategory | "")}
              disabled={gxpLocked}
              aria-invalid={fieldErrorFor(fieldErrors, "gamp_category") !== undefined}
            >
              <option value="">— не выбрано —</option>
              {GAMP_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <FieldError text={fieldErrorFor(fieldErrors, "gamp_category")} />
          </div>
          <div>
            <Label htmlFor="validation_status">Статус валидации</Label>
            <Select
              id="validation_status"
              data-testid="validation_status"
              value={effectiveValidation}
              onValueChange={(v) => patch("validation_status", v as ValidationStatus)}
              disabled={gxpLocked}
              aria-invalid={fieldErrorFor(fieldErrors, "validation_status") !== undefined}
            >
              {VALIDATION_OPTIONS.filter(
                (o) => !state.is_gxp_relevant || o.value !== "not_required",
              ).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <FieldError text={fieldErrorFor(fieldErrors, "validation_status")} />
          </div>
          <div>
            <Label htmlFor="validated_at">Дата последней валидации</Label>
            <Input
              id="validated_at"
              type="date"
              value={state.validated_at}
              onChange={(e) => patch("validated_at", e.target.value)}
              disabled={gxpLocked}
            />
          </div>
          <div>
            <Label htmlFor="next_review_at">Плановая ревалидация</Label>
            <Input
              id="next_review_at"
              type="date"
              value={state.next_review_at}
              onChange={(e) => patch("next_review_at", e.target.value)}
              disabled={gxpLocked}
            />
          </div>
          <div>
            <Label htmlFor="criticality">Общая критичность</Label>
            <Select
              id="criticality"
              value={state.criticality}
              onValueChange={(v) => patch("criticality", v as Criticality)}
            >
              {CRITICALITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </FormBlock>

      <FormBlock title="5. ИТ">
        <PeopleList
          label="Поддержка"
          value={state.support_people}
          onChange={(v) => patch("support_people", v)}
          owners={combinedOwners}
          fieldName="support_people"
        />
        <PeopleList
          label="Проектный менеджер"
          value={state.project_managers}
          onChange={(v) => patch("project_managers", v)}
          owners={combinedOwners}
          fieldName="project_managers"
        />
        <PeopleList
          label="Бизнес-/системный аналитик"
          value={state.analysts}
          onChange={(v) => patch("analysts", v)}
          owners={combinedOwners}
          fieldName="analysts"
        />
        <PeopleList
          label="Разработчик"
          value={state.developers}
          onChange={(v) => patch("developers", v)}
          owners={combinedOwners}
          fieldName="developers"
        />
        <PeopleList
          label="Тестировщик"
          value={state.testers}
          onChange={(v) => patch("testers", v)}
          owners={combinedOwners}
          fieldName="testers"
        />
      </FormBlock>

      <FormBlock title="6. Инфраструктура">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="server">Сервер</Label>
            <Input
              id="server"
              value={state.server}
              onChange={(e) => patch("server", e.target.value)}
              maxLength={500}
            />
          </div>
          <div>
            <Label htmlFor="server_type">Тип сервера</Label>
            <Select
              id="server_type"
              value={state.server_type}
              onValueChange={(v) => patch("server_type", v as ServerType | "")}
            >
              <option value="">— не выбрано —</option>
              {SERVER_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="hosting_type">Размещение</Label>
            <Select
              id="hosting_type"
              value={state.hosting_type}
              onValueChange={(v) => patch("hosting_type", v as HostingType)}
            >
              {HOSTING_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="hosting_provider">Провайдер</Label>
            <Input
              id="hosting_provider"
              value={state.hosting_provider}
              onChange={(e) => patch("hosting_provider", e.target.value)}
              maxLength={200}
            />
          </div>
          <div>
            <Label htmlFor="data_classification">Классификация данных</Label>
            <Select
              id="data_classification"
              value={state.data_classification}
              onValueChange={(v) => patch("data_classification", v as DataClassification)}
            >
              {DATA_CLASS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="lifecycle_status">Жизненный цикл</Label>
            <Select
              id="lifecycle_status"
              value={state.lifecycle_status}
              onValueChange={(v) => patch("lifecycle_status", v as LifecycleStatus)}
            >
              {LIFECYCLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="site">Площадка</Label>
            <Input
              id="site"
              value={state.site}
              onChange={(e) => patch("site", e.target.value)}
              maxLength={500}
            />
          </div>
          <div>
            <Label htmlFor="backup_frequency">Периодичность бэкапа</Label>
            <Select
              id="backup_frequency"
              value={state.backup_frequency}
              onValueChange={(v) => patch("backup_frequency", v as BackupFrequency | "")}
            >
              <option value="">— не выбрано —</option>
              {BACKUP_FREQUENCY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="backup_rpo_hours">RPO, ч</Label>
            <Input
              id="backup_rpo_hours"
              type="number"
              min={0}
              value={state.backup_rpo_hours}
              onChange={(e) => patch("backup_rpo_hours", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="backup_rto_hours">RTO, ч</Label>
            <Input
              id="backup_rto_hours"
              type="number"
              min={0}
              value={state.backup_rto_hours}
              onChange={(e) => patch("backup_rto_hours", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="auth_model">Модель аутентификации</Label>
            <Input
              id="auth_model"
              value={state.auth_model}
              onChange={(e) => patch("auth_model", e.target.value)}
              maxLength={500}
            />
          </div>
        </div>
        <StringList
          label="Интеграции"
          value={state.integrations}
          onChange={(v) => patch("integrations", v)}
          fieldName="integrations"
          placeholder="SAP ERP"
        />
      </FormBlock>

      <FormBlock title="7. Документация">
        <DocumentsList
          label="Внутренняя документация"
          value={state.internal_documents}
          onChange={(v) => patch("internal_documents", v)}
          fieldName="internal_documents"
          error={fieldErrorFor(fieldErrors, "internal_documents")}
        />
        <DocumentsList
          label="Документация вендора"
          value={state.vendor_documents}
          onChange={(v) => patch("vendor_documents", v)}
          fieldName="vendor_documents"
          error={fieldErrorFor(fieldErrors, "vendor_documents")}
        />
      </FormBlock>

      <FormBlock title="8. Примечания">
        <div>
          <Label htmlFor="notes">Примечания</Label>
          <Textarea
            id="notes"
            value={state.notes}
            onChange={(e) => patch("notes", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="description">Описание</Label>
          <Textarea
            id="description"
            value={state.description}
            onChange={(e) => patch("description", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="business_process">Бизнес-процесс</Label>
          <Input
            id="business_process"
            value={state.business_process}
            onChange={(e) => patch("business_process", e.target.value)}
            maxLength={2000}
          />
        </div>
        <div>
          <Label htmlFor="devops">DevOps</Label>
          <Textarea id="devops" value={state.devops} onChange={(e) => patch("devops", e.target.value)} />
        </div>
      </FormBlock>

      {requireReason ? (
        <FormBlock title="Причина изменения">
          <Label htmlFor="reason">Причина</Label>
          <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          <p className="text-sm text-muted">
            Обязательна для критичных полей и правок валидированной системы. Пишите всегда — так полнее журнал.
          </p>
        </FormBlock>
      ) : null}

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
          {pending ? "Сохранение…" : mode === "create" ? "Создать" : "Сохранить"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Отмена
        </Button>
      </div>
    </form>
  );
}

function FieldError({ text }: { text: string | undefined }): React.JSX.Element | null {
  if (text === undefined) return null;
  return (
    <p className="mt-1 text-sm text-danger" role="alert">
      {text}
    </p>
  );
}

export function initialFromDetail(detail: {
  name: string;
  domain: SystemDomain;
  purpose: string | null;
  release: string | null;
  vendor: string | null;
  product_version: string | null;
  description: string | null;
  system_type: SystemType;
  business_process: string | null;
  hosting_type: HostingType;
  hosting_provider: string | null;
  data_classification: DataClassification;
  site: string | null;
  server: string | null;
  server_type: ServerType | null;
  is_gxp_relevant: boolean;
  criticality: Criticality;
  gxp_criticality: Criticality | null;
  gamp_category: GampCategory | null;
  lifecycle_status: LifecycleStatus;
  validation_status: ValidationStatus;
  validated_at: string | null;
  next_review_at: string | null;
  auth_model: string | null;
  backup_frequency: BackupFrequency | null;
  backup_rpo_hours: number | null;
  backup_rto_hours: number | null;
  integrations: string[];
  notes: string | null;
  devops: string | null;
  people: Array<{ role: string; user_id: string | null; full_name: string }>;
  companies: CompanyCode[];
  documents: Array<{ kind: "internal" | "vendor"; title: string; url: string }>;
}): SystemFormInitialState {
  const peopleOf = (role: string): PersonValue[] =>
    detail.people
      .filter((p) => p.role === role)
      .map((p) => ({ user_id: p.user_id, full_name: p.user_id === null ? p.full_name : "" }));
  const single = (role: string): PersonValue | null => peopleOf(role)[0] ?? null;
  return {
    name: detail.name,
    domain: detail.domain,
    purpose: detail.purpose ?? "",
    release: detail.release ?? "",
    vendor: detail.vendor ?? "",
    product_version: detail.product_version ?? "",
    description: detail.description ?? "",
    system_type: detail.system_type,
    business_process: detail.business_process ?? "",
    hosting_type: detail.hosting_type,
    hosting_provider: detail.hosting_provider ?? "",
    data_classification: detail.data_classification,
    site: detail.site ?? "",
    server: detail.server ?? "",
    server_type: detail.server_type ?? "",
    is_gxp_relevant: detail.is_gxp_relevant,
    criticality: detail.criticality,
    gxp_criticality: detail.gxp_criticality ?? "",
    gamp_category: detail.gamp_category ?? "",
    lifecycle_status: detail.lifecycle_status,
    validation_status: detail.validation_status,
    validated_at: detail.validated_at ?? "",
    next_review_at: detail.next_review_at ?? "",
    auth_model: detail.auth_model ?? "",
    backup_frequency: detail.backup_frequency ?? "",
    backup_rpo_hours: detail.backup_rpo_hours === null ? "" : String(detail.backup_rpo_hours),
    backup_rto_hours: detail.backup_rto_hours === null ? "" : String(detail.backup_rto_hours),
    integrations: detail.integrations,
    notes: detail.notes ?? "",
    devops: detail.devops ?? "",
    system_owner: single("system_owner"),
    release_manager: single("release_manager"),
    process_owners: peopleOf("process_owner"),
    key_users: peopleOf("key_user"),
    support_people: peopleOf("support"),
    project_managers: peopleOf("project_manager"),
    analysts: peopleOf("analyst"),
    developers: peopleOf("developer"),
    testers: peopleOf("tester"),
    companies: detail.companies,
    internal_documents: detail.documents
      .filter((d) => d.kind === "internal")
      .map((d) => ({ title: d.title, url: d.url })),
    vendor_documents: detail.documents
      .filter((d) => d.kind === "vendor")
      .map((d) => ({ title: d.title, url: d.url })),
  };
}

export const PERSON_LIST_KEYS_VALUE = PERSON_LIST_KEYS;
