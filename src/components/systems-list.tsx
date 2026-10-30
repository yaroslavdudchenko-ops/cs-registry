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
  COMPANY_LABELS,
  COMPANY_OPTIONS,
  CRITICALITY_LABELS,
  CRITICALITY_OPTIONS,
  DOMAIN_LABELS,
  DOMAIN_OPTIONS,
  GAMP_LABELS,
  GAMP_OPTIONS,
  LIFECYCLE_LABELS,
  LIFECYCLE_OPTIONS,
  SYSTEM_TYPE_LABELS,
  VALIDATION_LABELS,
  VALIDATION_OPTIONS,
  canCreateSystem,
} from "@/lib/labels";
import {
  systemListResponseSchema,
  type SystemListItem,
  type SystemListResponse,
} from "@/lib/systems";
import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 250;
const COLUMNS_LS_KEY = "cs-registry:list-columns:v1";

type ColumnDef = {
  key: string;
  header: string;
  render: (item: SystemListItem) => React.ReactNode;
  defaultVisible: boolean;
  group: string;
};

const COLUMNS: ColumnDef[] = [
  {
    key: "code",
    header: "ID",
    group: "Идентификация",
    defaultVisible: true,
    render: (item) => (
      <Link href={`/systems/${item.id}`} className="whitespace-nowrap text-accent underline-offset-2 hover:underline">
        {item.code}
      </Link>
    ),
  },
  {
    key: "name",
    header: "Название",
    group: "Идентификация",
    defaultVisible: true,
    render: (item) => (
      <Link href={`/systems/${item.id}`} className="hover:underline">
        {item.name}
      </Link>
    ),
  },
  {
    key: "domain",
    header: "Домен",
    group: "Идентификация",
    defaultVisible: true,
    render: (item) => `${item.domain} — ${DOMAIN_LABELS[item.domain]}`,
  },
  {
    key: "system_owner_name",
    header: "Владелец системы",
    group: "Владельцы",
    defaultVisible: true,
    render: (item) => item.system_owner_name ?? "—",
  },
  {
    key: "is_gxp_relevant",
    header: "GxP",
    group: "GxP",
    defaultVisible: true,
    render: (item) => (item.is_gxp_relevant ? "Да" : "Нет"),
  },
  {
    key: "validation_status",
    header: "Статус валидации",
    group: "GxP",
    defaultVisible: true,
    render: (item) => VALIDATION_LABELS[item.validation_status],
  },
  {
    key: "lifecycle_status",
    header: "Жизненный цикл",
    group: "Инфраструктура",
    defaultVisible: true,
    render: (item) => LIFECYCLE_LABELS[item.lifecycle_status],
  },
  {
    key: "companies",
    header: "Компания",
    group: "Компания",
    defaultVisible: true,
    render: (item) => (item.companies.length === 0 ? "—" : item.companies.map((c) => COMPANY_LABELS[c]).join(", ")),
  },
  {
    key: "next_review_at",
    header: "Плановая ревалидация",
    group: "GxP",
    defaultVisible: true,
    render: (item) => item.next_review_at ?? "—",
  },
  // optional
  {
    key: "system_type",
    header: "Тип",
    group: "Идентификация",
    defaultVisible: false,
    render: (item) => SYSTEM_TYPE_LABELS[item.system_type],
  },
  {
    key: "criticality",
    header: "Общая критичность",
    group: "GxP",
    defaultVisible: false,
    render: (item) => CRITICALITY_LABELS[item.criticality],
  },
  {
    key: "gxp_criticality",
    header: "GxP-критичность",
    group: "GxP",
    defaultVisible: false,
    render: (item) => (item.gxp_criticality === null ? "—" : CRITICALITY_LABELS[item.gxp_criticality]),
  },
  {
    key: "gamp_category",
    header: "GAMP",
    group: "GxP",
    defaultVisible: false,
    render: (item) => (item.gamp_category === null ? "—" : GAMP_LABELS[item.gamp_category]),
  },
  {
    key: "process_owner_name",
    header: "Владелец процесса",
    group: "Владельцы",
    defaultVisible: false,
    render: (item) => item.process_owner_name ?? "—",
  },
  {
    key: "release_manager_name",
    header: "РПП",
    group: "Владельцы",
    defaultVisible: false,
    render: (item) => item.release_manager_name ?? "—",
  },
  {
    key: "quality_owner_name",
    header: "Владелец качества",
    group: "Владельцы",
    defaultVisible: false,
    render: (item) => item.quality_owner_name ?? "—",
  },
  {
    key: "vendor",
    header: "Подрядчик",
    group: "Идентификация",
    defaultVisible: false,
    render: (item) => item.vendor ?? "—",
  },
  {
    key: "product_version",
    header: "Версия",
    group: "Идентификация",
    defaultVisible: false,
    render: (item) => item.product_version ?? "—",
  },
  {
    key: "release",
    header: "Релиз",
    group: "Идентификация",
    defaultVisible: false,
    render: (item) => item.release ?? "—",
  },
  {
    key: "purpose",
    header: "Назначение",
    group: "Идентификация",
    defaultVisible: false,
    render: (item) => item.purpose ?? "—",
  },
  {
    key: "site",
    header: "Площадка",
    group: "Инфраструктура",
    defaultVisible: false,
    render: (item) => item.site ?? "—",
  },
  {
    key: "server",
    header: "Сервер",
    group: "Инфраструктура",
    defaultVisible: false,
    render: (item) => item.server ?? "—",
  },
  {
    key: "integrations",
    header: "Интеграции",
    group: "Инфраструктура",
    defaultVisible: false,
    render: (item) => (item.integrations.length === 0 ? "—" : item.integrations.join(", ")),
  },
  {
    key: "notes",
    header: "Примечания",
    group: "Прочее",
    defaultVisible: false,
    render: (item) => item.notes ?? "—",
  },
];

function defaultVisible(): Set<string> {
  return new Set(COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key));
}

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
  const domain = readParam(searchParams, "domain");
  const status = readParam(searchParams, "status");
  const validationStatus = readParam(searchParams, "validation_status");
  const criticality = readParam(searchParams, "criticality");
  const gxpCriticality = readParam(searchParams, "gxp_criticality");
  const gampCategory = readParam(searchParams, "gamp_category");
  const gxp = readParam(searchParams, "gxp");
  const company = readParam(searchParams, "company");
  const owner = readParam(searchParams, "owner");
  const site = readParam(searchParams, "site");
  const archived = readParam(searchParams, "archived");

  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return defaultVisible();
    try {
      const raw = window.localStorage.getItem(COLUMNS_LS_KEY);
      if (raw === null) return defaultVisible();
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return defaultVisible();
      const keys = parsed.filter((v): v is string => typeof v === "string");
      if (keys.length === 0) return defaultVisible();
      return new Set(keys);
    } catch {
      return defaultVisible();
    }
  });
  const [columnsOpen, setColumnsOpen] = useState(false);
  const toggleColumn = (key: string): void => {
    const next = new Set(visibleColumns);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setVisibleColumns(next);
    try {
      window.localStorage.setItem(COLUMNS_LS_KEY, JSON.stringify([...next]));
    } catch {
      // localStorage недоступен — выбор не переживёт перезагрузку
    }
  };

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
    if (resetPage) next.delete("page");
    const qs = next.toString();
    router.replace(qs.length > 0 ? `${pathname}?${qs}` : pathname);
  }

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const trimmed = searchInput.trim();
      if (trimmed.length === 1) return;
      const nextQ = trimmed.length >= 2 ? trimmed : "";
      if (nextQ === qParam) return;
      replaceQuery({ q: nextQ.length === 0 ? null : nextQ });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const queryKey = useMemo(() => searchParams.toString(), [searchParams]);
  const requestKey = `${queryKey}#${String(reloadToken)}`;
  const error = errorState !== null && errorState.key === requestKey ? errorState : null;
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
      if (controller.signal.aborted) return;
      if (!result.ok) {
        if (result.status === 401) {
          router.replace("/login");
          return;
        }
        setErrorState({ key: requestKey, message: "Не удалось загрузить данные", requestId: result.requestId });
        setResolvedKey(requestKey);
        return;
      }
      const parsed = systemListResponseSchema.safeParse(result.data);
      if (!parsed.success) {
        setErrorState({ key: requestKey, message: "Не удалось загрузить данные", requestId: result.requestId });
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
    domain.length > 0 ||
    status.length > 0 ||
    validationStatus.length > 0 ||
    criticality.length > 0 ||
    gxpCriticality.length > 0 ||
    gampCategory.length > 0 ||
    gxp.length > 0 ||
    company.length > 0 ||
    owner.length > 0 ||
    site.length > 0 ||
    archived === "1" || archived === "true";

  const totalPages =
    data !== null && data.pageSize > 0 ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const visibleCols = COLUMNS.filter((c) => visibleColumns.has(c.key));

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
            placeholder="ID, название или подрядчик"
            autoComplete="off"
          />
        </div>
        <div>
          <Label htmlFor="filter-domain">Домен</Label>
          <Select id="filter-domain" value={domain} onValueChange={(v) => replaceQuery({ domain: v })}>
            <option value="">Все домены</option>
            {DOMAIN_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="filter-company">Компания</Label>
          <Select id="filter-company" value={company} onValueChange={(v) => replaceQuery({ company: v })}>
            <option value="">Все компании</option>
            {COMPANY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="filter-gxp">GxP</Label>
          <Select id="filter-gxp" value={gxp} onValueChange={(v) => replaceQuery({ gxp: v })}>
            <option value="">Все</option>
            <option value="1">Относится к GxP</option>
            <option value="0">Не относится</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="filter-gxp-crit">GxP-критичность</Label>
          <Select
            id="filter-gxp-crit"
            value={gxpCriticality}
            onValueChange={(v) => replaceQuery({ gxp_criticality: v })}
          >
            <option value="">Любая</option>
            {CRITICALITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="filter-gamp">GAMP</Label>
          <Select
            id="filter-gamp"
            value={gampCategory}
            onValueChange={(v) => replaceQuery({ gamp_category: v })}
          >
            <option value="">Все</option>
            {GAMP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="filter-validation">Статус валидации</Label>
          <Select
            id="filter-validation"
            value={validationStatus}
            onValueChange={(v) => replaceQuery({ validation_status: v })}
          >
            <option value="">Все статусы</option>
            {VALIDATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="filter-status">Жизненный цикл</Label>
          <Select id="filter-status" value={status} onValueChange={(v) => replaceQuery({ status: v })}>
            <option value="">Все статусы</option>
            {LIFECYCLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="filter-type">Тип</Label>
          <Select
            id="filter-type"
            value={type}
            onValueChange={(v) => replaceQuery({ type: v })}
            className={SYSTEM_TYPE_SELECT_CLASS}
          >
            <SystemTypeSelectOptions includeAllLabel="Все типы" />
          </Select>
        </div>
        <div>
          <Label htmlFor="filter-criticality">Общая критичность</Label>
          <Select
            id="filter-criticality"
            value={criticality}
            onValueChange={(v) => replaceQuery({ criticality: v })}
          >
            <option value="">Любая</option>
            {CRITICALITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={() => setColumnsOpen((v) => !v)}>
          Колонки
        </Button>
        {columnsOpen ? (
          <div className="w-full rounded-lg border border-line bg-surface p-4" role="region" aria-label="Выбор колонок">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {COLUMNS.map((col) => (
                <label key={col.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={visibleColumns.has(col.key)}
                    data-testid={`columns-toggle-${col.key}`}
                    onChange={() => toggleColumn(col.key)}
                    className="size-4 accent-accent"
                  />
                  <span>{col.header}</span>
                  <span className="text-xs text-muted">({col.group})</span>
                </label>
              ))}
            </div>
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
                  {visibleCols.map((col) => (
                    <th
                      key={col.key}
                      className={cn("px-1.5 py-3 font-medium", col.key === "code" && "whitespace-nowrap")}
                    >
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id} className="border-b border-line last:border-b-0 hover:bg-accent-soft/40">
                    {visibleCols.map((col) => (
                      <td key={col.key} className={cn("px-1.5 py-3", col.key === "code" && "whitespace-nowrap font-medium")}>
                        {col.render(item)}
                      </td>
                    ))}
                  </tr>
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
