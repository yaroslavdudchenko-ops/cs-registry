"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { ExportButtons } from "@/components/export-buttons";
import {
  SYSTEM_TYPE_SELECT_CLASS,
  SystemTypeSelectOptions,
} from "@/components/system-type-options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/components/session-provider";
import { apiRequest } from "@/lib/api";
import {
  CRITICALITY_LABELS,
  CRITICALITY_OPTIONS,
  LIFECYCLE_LABELS,
  LIFECYCLE_OPTIONS,
  SYSTEM_TYPE_LABELS,
  VALIDATION_LABELS,
  canCreateSystem,
} from "@/lib/labels";
import {
  systemListResponseSchema,
  type SystemListItem,
  type SystemListResponse,
} from "@/lib/systems";
import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 250;

function readParam(params: URLSearchParams, key: string): string {
  return params.get(key) ?? "";
}

export function SystemsList(): React.JSX.Element {
  const user = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const allowCreate = canCreateSystem(user.role);

  const qParam = readParam(searchParams, "q");
  const type = readParam(searchParams, "type");
  const status = readParam(searchParams, "status");
  const criticality = readParam(searchParams, "criticality");
  const site = readParam(searchParams, "site");
  const archived = readParam(searchParams, "archived");
  const sort = readParam(searchParams, "sort") || "code";
  const order = readParam(searchParams, "order") || "asc";

  const [searchInput, setSearchInput] = useState(qParam);
  const [data, setData] = useState<SystemListResponse | null>(null);
  const [errorState, setErrorState] = useState<{
    key: string;
    message: string;
    requestId: string;
  } | null>(null);
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

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
      const trimmed = searchInput.trim();
      if (trimmed.length === 1) {
        return;
      }
      const nextQ = trimmed.length >= 2 ? trimmed : "";
      if (nextQ === qParam) {
        return;
      }
      replaceQuery({ q: nextQ.length === 0 ? null : nextQ });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce only tracks the input field
  }, [searchInput]);

  const queryKey = useMemo(() => searchParams.toString(), [searchParams]);
  const requestKey = `${queryKey}#${String(reloadToken)}`;
  const error =
    errorState !== null && errorState.key === requestKey ? errorState : null;
  const loading = error === null && resolvedKey !== requestKey;

  function resetFilters(): void {
    setSearchInput("");
    router.replace(pathname);
  }

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const path = `/api/v1/systems${queryKey.length > 0 ? `?${queryKey}` : ""}`;
    void (async () => {
      const result = await apiRequest<unknown>(path, { method: "GET", signal: controller.signal });
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
          message: "Не удалось загрузить данные",
          requestId: result.requestId,
        });
        setResolvedKey(requestKey);
        return;
      }
      const parsed = systemListResponseSchema.safeParse(result.data);
      if (!parsed.success) {
        setErrorState({
          key: requestKey,
          message: "Не удалось загрузить данные",
          requestId: result.requestId,
        });
        setResolvedKey(requestKey);
        return;
      }
      setData(parsed.data);
      setResolvedKey(requestKey);
    })();

    return () => controller.abort();
  }, [queryKey, reloadToken, requestKey, router]);

  const hasFilters =
    qParam.length > 0 ||
    type.length > 0 ||
    status.length > 0 ||
    criticality.length > 0 ||
    site.length > 0 ||
    archived === "1" ||
    archived === "true";

  const totalPages =
    data !== null && data.pageSize > 0 ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  function toggleSort(field: string): void {
    if (sort === field) {
      replaceQuery({ sort: field, order: order === "asc" ? "desc" : "asc" }, false);
      return;
    }
    replaceQuery({ sort: field, order: "asc" }, false);
  }

  function sortLabel(field: string, label: string): string {
    if (sort !== field) {
      return label;
    }
    return order === "asc" ? `${label}, по возрастанию` : `${label}, по убыванию`;
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Системы</h1>
          <p className="mt-1 text-muted">Каталог компьютеризированных систем организации.</p>
        </div>
        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          <ExportButtons apiPath="/api/v1/systems/export" query={searchParams} />
          {allowCreate ? (
            <Button asChild>
              <Link href="/systems/new">Добавить систему</Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 rounded-lg border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2 lg:col-span-3">
          <Label htmlFor="systems-search">Поиск</Label>
          <Input
            id="systems-search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Код, название или вендор"
            autoComplete="off"
          />
        </div>
        <div>
          <Label htmlFor="filter-type">Тип</Label>
          <Select
            id="filter-type"
            value={type}
            onValueChange={(value) => replaceQuery({ type: value })}
            className={SYSTEM_TYPE_SELECT_CLASS}
          >
            <SystemTypeSelectOptions includeAllLabel="Все типы" />
          </Select>
        </div>
        <div>
          <Label htmlFor="filter-status">Статус жизненного цикла</Label>
          <Select
            id="filter-status"
            value={status}
            onValueChange={(value) => replaceQuery({ status: value })}
          >
            <option value="">Все статусы</option>
            {LIFECYCLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="filter-criticality">Критичность</Label>
          <Select
            id="filter-criticality"
            value={criticality}
            onValueChange={(value) => replaceQuery({ criticality: value })}
          >
            <option value="">Любая</option>
            {CRITICALITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="filter-site">Площадка</Label>
          <Input
            id="filter-site"
            value={site}
            onChange={(event) => replaceQuery({ site: event.target.value })}
            placeholder="Название площадки"
          />
        </div>
        <div className="flex items-end pb-1">
          <label htmlFor="filter-archived" className="flex items-center gap-2 text-base">
            <input
              id="filter-archived"
              type="checkbox"
              className="size-4 accent-accent"
              checked={archived === "1" || archived === "true"}
              onChange={(event) => replaceQuery({ archived: event.target.checked ? "1" : null })}
            />
            Показать архивные
          </label>
        </div>
        {hasFilters ? (
          <div className="flex items-end">
            <Button variant="ghost" onClick={resetFilters}>
              Сбросить фильтры
            </Button>
          </div>
        ) : null}
      </div>

      {loading ? <ListSkeleton /> : null}

      {!loading && error !== null ? (
        <div className="rounded-lg border border-danger/30 bg-danger-soft p-6" role="alert">
          <p className="font-medium text-danger">{error.message}</p>
          {error.requestId.length > 0 ? (
            <p className="mt-1 text-sm text-muted">Идентификатор запроса: {error.requestId}</p>
          ) : null}
          <Button className="mt-4" onClick={() => setReloadToken((value) => value + 1)}>
            Повторить
          </Button>
        </div>
      ) : null}

      {!loading && error === null && data !== null && data.items.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface p-8">
          {hasFilters ? (
            <>
              <p className="text-lg font-medium">Ничего не найдено</p>
              <p className="mt-2 text-muted">Измените запрос или сбросьте фильтры.</p>
              <Button className="mt-4" variant="outline" onClick={resetFilters}>
                Сбросить фильтры
              </Button>
            </>
          ) : (
            <>
              <p className="text-lg font-medium">В реестре пока нет систем</p>
              <p className="mt-2 text-muted">Добавьте первую запись, если у вас есть право создания.</p>
              {allowCreate ? (
                <Button className="mt-4" asChild>
                  <Link href="/systems/new">Добавить систему</Link>
                </Button>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {!loading && error === null && data !== null && data.items.length > 0 ? (
        <>
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">Список компьютеризированных систем</caption>
              <thead className="border-b border-line bg-background/80 text-sm text-muted">
                <tr>
                  <SortHeader
                    label="Код"
                    field="code"
                    current={sort}
                    order={order}
                    onToggle={toggleSort}
                    ariaLabel={sortLabel("code", "Код")}
                  />
                  <SortHeader
                    label="Наименование"
                    field="name"
                    current={sort}
                    order={order}
                    onToggle={toggleSort}
                    ariaLabel={sortLabel("name", "Наименование")}
                  />
                  <th className="px-1.5 py-3 font-medium">Тип</th>
                  <SortHeader
                    label="Критичность"
                    field="criticality"
                    current={sort}
                    order={order}
                    onToggle={toggleSort}
                    ariaLabel={sortLabel("criticality", "Критичность")}
                  />
                  <SortHeader
                    label="Жизненный цикл"
                    field="lifecycle_status"
                    current={sort}
                    order={order}
                    onToggle={toggleSort}
                    ariaLabel={sortLabel("lifecycle_status", "Жизненный цикл")}
                  />
                  <th className="px-1.5 py-3 font-medium">Владелец процесса</th>
                  <th className="px-1.5 py-3 font-medium">Площадка</th>
                  <th className="px-1.5 py-3 font-medium">Валидация</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <SystemRow key={item.id} item={item} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              Страница {data.page} из {totalPages}, всего {data.total}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={data.page <= 1}
                onClick={() => replaceQuery({ page: String(data.page - 1) }, false)}
              >
                Назад
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={data.page >= totalPages}
                onClick={() => replaceQuery({ page: String(data.page + 1) }, false)}
              >
                Вперёд
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

function SystemRow({ item }: { item: SystemListItem }): React.JSX.Element {
  return (
    <tr className="border-b border-line last:border-b-0 hover:bg-accent-soft/40">
      <td className="px-1.5 py-3 font-medium whitespace-nowrap">
        <Link href={`/systems/${item.id}`} className="whitespace-nowrap text-accent underline-offset-2 hover:underline">
          {item.code}
        </Link>
      </td>
      <td className="px-1.5 py-3">
        <Link href={`/systems/${item.id}`} className="hover:underline">
          {item.name}
        </Link>
      </td>
      <td className="px-1.5 py-3 whitespace-nowrap">{SYSTEM_TYPE_LABELS[item.system_type]}</td>
      <td className="px-1.5 py-3 whitespace-nowrap">{CRITICALITY_LABELS[item.criticality]}</td>
      <td className="px-1.5 py-3 whitespace-nowrap">{LIFECYCLE_LABELS[item.lifecycle_status]}</td>
      <td className="px-1.5 py-3">{item.process_owner_name}</td>
      <td className="px-1.5 py-3">{item.site ?? "—"}</td>
      <td className="px-1.5 py-3 whitespace-nowrap">{VALIDATION_LABELS[item.validation_status]}</td>
    </tr>
  );
}

function SortHeader({
  label,
  field,
  current,
  order,
  onToggle,
  ariaLabel,
  nowrap = false,
  className,
}: {
  label: string;
  field: string;
  current: string;
  order: string;
  onToggle: (field: string) => void;
  ariaLabel: string;
  nowrap?: boolean;
  className?: string;
}): React.JSX.Element {
  const active = current === field;
  return (
    <th className={cn("px-1.5 py-3 font-medium", nowrap && "whitespace-nowrap", className)}>
      <button
        type="button"
        className={cn(
          "text-left hover:text-ink",
          active ? "text-ink" : "text-muted",
          nowrap && "whitespace-nowrap",
        )}
        onClick={() => onToggle(field)}
        aria-label={ariaLabel}
      >
        {label}
        {active ? <span aria-hidden="true">{order === "asc" ? " ↑" : " ↓"}</span> : null}
      </button>
    </th>
  );
}

function ListSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-2 rounded-lg border border-line bg-surface p-4" aria-hidden="true">
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}
