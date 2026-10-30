"use client";

import { useEffect, useRef, useState } from "react";

import { PaginationBar } from "@/components/pagination-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/api";
import { auditPageSchema, type AuditEvent, type AuditPage } from "@/lib/audit";
import {
  CREATED_RECORD_LABEL,
  formatChangedFieldsLabel,
  formatDateTimeUtc,
  isRejectionPayload,
  rejectionLabel,
  snapshotLines,
} from "@/lib/format";
import { actionLabel, roleLabel } from "@/lib/labels";

const PAGE_SIZE = 50;

export function SystemHistory({ systemId }: { systemId: string }): React.JSX.Element {
  const [page, setPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);
  const [data, setData] = useState<AuditPage | null>(null);
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);
  const [errorState, setErrorState] = useState<{
    key: string;
    message: string;
    requestId: string;
    forbidden: boolean;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const requestKey = `${systemId}:${String(page)}:${String(reloadToken)}`;
  const error = errorState !== null && errorState.key === requestKey ? errorState : null;
  const loading = error === null && resolvedKey !== requestKey;

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    void (async () => {
      const result = await apiRequest<unknown>(
        `/api/v1/systems/${systemId}/history?page=${String(page)}&pageSize=${String(PAGE_SIZE)}`,
        { method: "GET", signal: controller.signal },
      );
      if (controller.signal.aborted) {
        return;
      }
      if (!result.ok) {
        setErrorState({
          key: requestKey,
          message:
            result.status === 403
              ? "Недостаточно прав для просмотра истории"
              : "Не удалось загрузить историю изменений",
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
          message: "Не удалось загрузить историю изменений",
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
  }, [page, requestKey, systemId]);

  return (
    <section className="space-y-4" aria-labelledby="system-history-title">
      <h2 id="system-history-title" className="text-xl font-semibold">
        История изменений
      </h2>
      {loading ? <HistorySkeleton /> : null}
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
        <p className="rounded-lg border border-line bg-surface p-5 text-muted">Изменений пока нет</p>
      ) : null}
      {!loading && error === null && data !== null && data.items.length > 0 ? (
        <>
          <ol className="space-y-3">
            {data.items.map((event) => (
              <HistoryItem key={event.id} event={event} />
            ))}
          </ol>
          <PaginationBar
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onPage={setPage}
          />
        </>
      ) : null}
    </section>
  );
}

function HistoryItem({ event }: { event: AuditEvent }): React.JSX.Element {
  const rejected = isRejectionPayload(event.after);
  const changedFieldsLabel = formatChangedFieldsLabel(event.changed_fields, {
    before: event.before,
    after: event.after,
  });
  return (
    <li
      className={
        rejected
          ? "rounded-lg border border-danger/40 bg-danger-soft p-4"
          : "rounded-lg border border-line bg-surface p-4"
      }
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">
          {actionLabel(event.action)}
          {rejected ? (
            <span className="ml-2 text-sm font-medium text-danger">Отказ · {rejectionLabel(event.after)}</span>
          ) : null}
        </p>
        <p className="text-sm text-muted">{formatDateTimeUtc(event.occurred_at)}</p>
      </div>
      <p className="mt-1 text-sm">
        {event.actor_username} · {roleLabel(event.actor_role)}
      </p>
      <dl className="mt-3 grid grid-cols-1 gap-3 text-sm">
        {changedFieldsLabel === CREATED_RECORD_LABEL ? (
          <div className="flex flex-col gap-1">
            <dd>{CREATED_RECORD_LABEL}</dd>
          </div>
        ) : (
          <HistoryField label="Изменённые поля" value={changedFieldsLabel} />
        )}
        <HistoryField
          label="Причина"
          value={event.reason !== null && event.reason.length > 0 ? event.reason : "—"}
        />
        <HistorySnapshot label="Было" event={event} side="before" />
        <HistorySnapshot label="Стало" event={event} side="after" />
        <HistoryField label="Идентификатор запроса" value={event.request_id} mono />
      </dl>
    </li>
  );
}

function HistoryField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-muted">{label}</dt>
      <dd className={mono ? "break-all font-mono text-sm" : "break-words"}>{value}</dd>
    </div>
  );
}

function HistorySnapshot({
  label,
  event,
  side,
}: {
  label: string;
  event: AuditEvent;
  side: "before" | "after";
}): React.JSX.Element {
  const payload = side === "before" ? event.before : event.after;
  if (side === "after" && isRejectionPayload(payload)) {
    return <HistoryField label={label} value={rejectionLabel(payload)} />;
  }
  const lines = snapshotLines(payload, event.changed_fields);
  if (lines.length === 0) {
    return <HistoryField label={label} value="—" />;
  }
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-muted">{label}</dt>
      <dd>
        <ul className="space-y-1 break-words">
          {lines.map((line) => (
            <li key={`${label}-${line.label}`}>
              <span className="text-muted">{line.label}: </span>
              <span>{line.value}</span>
            </li>
          ))}
        </ul>
      </dd>
    </div>
  );
}

function HistorySkeleton(): React.JSX.Element {
  return (
    <div className="space-y-3" aria-hidden="true">
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-28 w-full" />
    </div>
  );
}
