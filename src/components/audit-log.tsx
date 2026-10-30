"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { PaginationBar } from "@/components/pagination-bar";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/api";
import { auditPageSchema, type AuditEvent, type AuditPage } from "@/lib/audit";
import {
  formatAuditSnapshot,
  formatChangedFieldsLabel,
  formatDateTimeUtc,
  isRejectionPayload,
  rejectionLabel,
} from "@/lib/format";
import {
  AUDIT_ACTION_OPTIONS,
  ENTITY_TYPE_OPTIONS,
  actionLabel,
  entityTypeLabel,
  roleLabel,
} from "@/lib/labels";

function readParam(params: URLSearchParams, key: string): string {
  return params.get(key) ?? "";
}

function toIsoStart(date: string): string | null {
  if (date.length === 0) {
    return null;
  }
  return `${date}T00:00:00.000Z`;
}

function toIsoEnd(date: string): string | null {
  if (date.length === 0) {
    return null;
  }
  return `${date}T23:59:59.999Z`;
}

export function AuditLog(): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const from = readParam(searchParams, "from");
  const to = readParam(searchParams, "to");
  const actor = readParam(searchParams, "actor");
  const action = readParam(searchParams, "action");
  const entityType = readParam(searchParams, "entityType");
  const entityLabel = readParam(searchParams, "entityLabel");
  const reason = readParam(searchParams, "reason");
  const order = readParam(searchParams, "order") === "oldest" ? "oldest" : "newest";
  const page = Number.parseInt(readParam(searchParams, "page") || "1", 10);

  const [objectInput, setObjectInput] = useState(entityLabel);
  const [reasonInput, setReasonInput] = useState(reason);
  const [data, setData] = useState<AuditPage | null>(null);
  const [errorState, setErrorState] = useState<{
    key: string;
    message: string;
    requestId: string;
    forbidden: boolean;
  } | null>(null);
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const queryKey = useMemo(() => searchParams.toString(), [searchParams]);
  const requestKey = `${queryKey}#${String(reloadToken)}`;
  const error = errorState !== null && errorState.key === requestKey ? errorState : null;
  const loading = error === null && resolvedKey !== requestKey;

  function replaceQuery(patch: Record<string, string | null>, resetPage = true): void {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value.length === 0) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }
    if (resetPage) {
      next.delete("page");
    }
    const qs = next.toString();
    router.replace(qs.length > 0 ? `${pathname}?${qs}` : pathname);
  }

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (reasonInput === reason) {
        return;
      }
      replaceQuery({ reason: reasonInput.trim().length === 0 ? null : reasonInput.trim() });
    }, 250);
    return () => window.clearTimeout(handle);
    // replaceQuery is derived from searchParams; listing it retriggers the debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reasonInput, reason]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const trimmed = objectInput.trim();
      const next = trimmed.length === 0 ? "" : trimmed;
      if (next === entityLabel) {
        return;
      }
      replaceQuery({ entityLabel: next.length === 0 ? null : next });
    }, 250);
    return () => window.clearTimeout(handle);
    // replaceQuery is derived from searchParams; listing it retriggers the debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectInput, entityLabel]);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const apiParams = new URLSearchParams();
    const fromIso = toIsoStart(from);
    const toIso = toIsoEnd(to);
    if (fromIso !== null) apiParams.set("from", fromIso);
    if (toIso !== null) apiParams.set("to", toIso);
    if (actor.length > 0) apiParams.set("actor", actor);
    if (action.length > 0) apiParams.set("action", action);
    if (entityType.length > 0) apiParams.set("entityType", entityType);
    if (entityLabel.length > 0) apiParams.set("entityLabel", entityLabel);
    if (reason.length > 0) apiParams.set("reason", reason);
    apiParams.set("order", order);
    apiParams.set("page", String(Number.isFinite(page) && page > 0 ? page : 1));
    apiParams.set("pageSize", "50");
    void (async () => {
      const result = await apiRequest<unknown>(`/api/v1/audit?${apiParams.toString()}`, {
        method: "GET",
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      if (!result.ok) {
        if (result.status === 401) {
          router.replace("/login");
          return;
        }
        setErrorState({
          key: requestKey,
          message:
            result.status === 403
              ? "Недостаточно прав для просмотра журнала"
              : "Не удалось загрузить журнал аудита",
          requestId: result.requestId,
          forbidden: result.status === 403,
        });
        setResolvedKey(requestKey);
        return;
      }
      const parsed = auditPageSchema.safeParse(result.data);
      if (!parsed.success) {
        setErrorState({
          key: requestKey,
          message: "Не удалось загрузить журнал аудита",
          requestId: result.requestId,
          forbidden: false,
        });
        setResolvedKey(requestKey);
        return;
      }
      setData(parsed.data);
      setResolvedKey(requestKey);
    })();
    return () => controller.abort();
  }, [action, actor, entityLabel, entityType, from, order, page, reason, requestKey, router, to]);

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Журнал аудита</h1>
        <p className="mt-1 text-muted">
          Инспекторский журнал всех событий. IP-адрес и строка клиента видны только здесь.
        </p>
      </div>
      <form
        className="grid gap-3 rounded-lg border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(event) => event.preventDefault()}
      >
        <DateField
          key={`from-${from}`}
          id="from"
          label="Период с"
          isoValue={from}
          onIsoChange={(iso) => replaceQuery({ from: iso.length === 0 ? null : iso })}
        />
        <DateField
          key={`to-${to}`}
          id="to"
          label="Период по"
          isoValue={to}
          onIsoChange={(iso) => replaceQuery({ to: iso.length === 0 ? null : iso })}
        />
        <div>
          <Label htmlFor="actor">Актор</Label>
          <Input
            id="actor"
            value={actor}
            onChange={(event) => replaceQuery({ actor: event.target.value || null })}
            placeholder="Логин"
          />
        </div>
        <div>
          <Label htmlFor="action">Действие</Label>
          <Select
            id="action"
            value={action}
            onValueChange={(value) => replaceQuery({ action: value.length === 0 ? null : value })}
          >
            <option value="">Все действия</option>
            {AUDIT_ACTION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="entityType">Тип объекта</Label>
          <Select
            id="entityType"
            value={entityType}
            onValueChange={(value) => replaceQuery({ entityType: value.length === 0 ? null : value })}
          >
            <option value="">Все типы</option>
            {ENTITY_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="entityLabel">Объект</Label>
          <Input
            id="entityLabel"
            value={objectInput}
            onChange={(event) => setObjectInput(event.target.value)}
            placeholder="Код или наименование"
            autoComplete="off"
          />
        </div>
        <div>
          <Label htmlFor="audit-order">Порядок</Label>
          <Select
            id="audit-order"
            value={order}
            onValueChange={(value) => replaceQuery({ order: value === "oldest" ? "oldest" : "newest" })}
          >
            <option value="newest">Сначала новые</option>
            <option value="oldest">Сначала старые</option>
          </Select>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <Label htmlFor="reason">Поиск по причине</Label>
          <Input
            id="reason"
            value={reasonInput}
            onChange={(event) => setReasonInput(event.target.value)}
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setObjectInput("");
              setReasonInput("");
              router.replace(pathname);
            }}
          >
            Сбросить фильтры
          </Button>
        </div>
      </form>
      {loading ? <AuditSkeleton /> : null}
      {error !== null ? (
        <div className="rounded-lg border border-danger/30 bg-danger-soft p-4" role="alert">
          <p className="text-danger">{error.message}</p>
          {error.requestId.length > 0 ? (
            <p className="mt-1 text-sm text-muted">Идентификатор запроса: {error.requestId}</p>
          ) : null}
          {error.forbidden ? null : (
            <button
              type="button"
              className="mt-3 text-sm text-accent underline"
              onClick={() => setReloadToken((value) => value + 1)}
            >
              Повторить
            </button>
          )}
        </div>
      ) : null}
      {!loading && error === null && data !== null && data.items.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface p-5 text-muted">Записей по заданным условиям нет</p>
      ) : null}
      {!loading && error === null && data !== null && data.items.length > 0 ? (
        <>
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-[72rem] border-collapse text-left text-sm">
              <caption className="sr-only">Журнал аудита</caption>
              <thead className="border-b border-line bg-background/80 text-muted">
                <tr>
                  <th className="px-3 py-3 font-medium">Дата и время</th>
                  <th className="px-3 py-3 font-medium">Актор</th>
                  <th className="px-3 py-3 font-medium">Действие</th>
                  <th className="px-3 py-3 font-medium">Объект</th>
                  <th className="px-3 py-3 font-medium">Поля</th>
                  <th className="min-w-[18rem] px-3 py-3 font-medium whitespace-nowrap">Было / Стало</th>
                  <th className="px-3 py-3 font-medium">Причина</th>
                  <th className="px-3 py-3 font-medium">Запрос</th>
                  <th className="px-3 py-3 font-medium">IP-адрес</th>
                  <th className="px-3 py-3 font-medium">Клиент</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((event) => (
                  <AuditRow key={event.id} event={event} />
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onPage={(next) => replaceQuery({ page: String(next) }, false)}
          />
        </>
      ) : null}
    </section>
  );
}

function AuditRow({ event }: { event: AuditEvent }): React.JSX.Element {
  const rejected = isRejectionPayload(event.after);
  const changedFieldsLabel = formatChangedFieldsLabel(event.changed_fields, {
    before: event.before,
    after: event.after,
  });
  return (
    <tr className={rejected ? "border-b border-line bg-danger-soft/70" : "border-b border-line last:border-b-0"}>
      <td className="px-3 py-3 align-top whitespace-nowrap">{formatDateTimeUtc(event.occurred_at)}</td>
      <td className="px-3 py-3 align-top">
        {event.actor_username} · {roleLabel(event.actor_role)}
      </td>
      <td className="px-3 py-3 align-top">
        {actionLabel(event.action)}
        {rejected ? <span className="mt-1 block text-danger">Отказ · {rejectionLabel(event.after)}</span> : null}
      </td>
      <td className="px-3 py-3 align-top">
        <span>{entityTypeLabel(event.entity_type)}</span>
        <span className="mt-1 block text-muted">
          {event.entity_label !== null && event.entity_label.length > 0 ? event.entity_label : "—"}
        </span>
      </td>
      <td className="px-3 py-3 align-top">{changedFieldsLabel}</td>
      <td className="min-w-[18rem] px-3 py-3 align-top break-normal hyphens-none">
        <p className="whitespace-normal break-normal">
          Было: {formatAuditSnapshot(event.before, event.changed_fields)}
        </p>
        <p className="mt-1 whitespace-normal break-normal">
          Стало:{" "}
          {rejected ? rejectionLabel(event.after) : formatAuditSnapshot(event.after, event.changed_fields)}
        </p>
      </td>
      <td className="px-3 py-3 align-top">{event.reason !== null && event.reason.length > 0 ? event.reason : "—"}</td>
      <td className="px-3 py-3 align-top font-mono text-xs">{event.request_id}</td>
      <td className="px-3 py-3 align-top">{event.ip ?? "—"}</td>
      <td className="px-3 py-3 align-top max-w-48 break-words">{event.user_agent ?? "—"}</td>
    </tr>
  );
}

function AuditSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-2 rounded-lg border border-line bg-surface p-4" aria-hidden="true">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}
