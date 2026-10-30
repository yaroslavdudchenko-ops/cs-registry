"use client";

import { useCallback, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { documentUrlReason, isUncPath } from "@/lib/documents";
import { cn } from "@/lib/utils";

export type OwnerOption = { id: string; full_name: string };

export type PersonValue = {
  user_id: string | null;
  full_name: string;
};

type PeopleListProps = {
  label: string;
  value: PersonValue[];
  onChange: (next: PersonValue[]) => void;
  owners: OwnerOption[];
  fieldName: string;
  error?: string | undefined;
  maxCount?: number;
};

/**
 * Список людей: каждая строка — выбор учётной записи ИЛИ ввод ФИО текстом.
 * Соответствует требованию «Человек = учётка или ФИО», одно из двух.
 */
export function PeopleList({
  label,
  value,
  onChange,
  owners,
  fieldName,
  error,
  maxCount = 20,
}: PeopleListProps): React.JSX.Element {
  const baseId = useId();
  const add = (): void =>
    onChange([...value, { user_id: null, full_name: "" }]);
  const remove = (idx: number): void =>
    onChange(value.filter((_, i) => i !== idx));
  const patch = (idx: number, next: PersonValue): void =>
    onChange(value.map((v, i) => (i === idx ? next : v)));

  return (
    <fieldset className="space-y-2" aria-describedby={error ? `${baseId}-err` : undefined}>
      <legend className="text-sm font-medium text-ink">{label}</legend>
      {value.length === 0 ? (
        <p className="text-sm text-muted">Пока никого.</p>
      ) : null}
      <ul className="space-y-2">
        {value.map((entry, idx) => (
          <li key={idx} className="grid gap-2 rounded-md border border-line bg-surface p-3 sm:grid-cols-[1fr_1fr_auto]">
            <div>
              <Label htmlFor={`${baseId}-user-${idx}`} className="text-xs text-muted">
                Учётная запись
              </Label>
              <Select
                id={`${baseId}-user-${idx}`}
                data-testid={`${fieldName}-user-${idx}`}
                value={entry.user_id ?? ""}
                onValueChange={(val) =>
                  patch(idx, { user_id: val === "" ? null : val, full_name: val === "" ? entry.full_name : "" })
                }
              >
                <option value="">— не из учёток —</option>
                {owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.full_name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor={`${baseId}-name-${idx}`} className="text-xs text-muted">
                Или ФИО текстом
              </Label>
              <Input
                id={`${baseId}-name-${idx}`}
                data-testid={`${fieldName}-name-${idx}`}
                value={entry.full_name}
                disabled={entry.user_id !== null}
                onChange={(e) => patch(idx, { ...entry, full_name: e.target.value })}
                placeholder="Фамилия Имя"
                maxLength={200}
              />
            </div>
            <div className="flex items-end">
              <Button type="button" variant="ghost" size="sm" onClick={() => remove(idx)}>
                Удалить
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {value.length < maxCount ? (
        <Button type="button" variant="outline" size="sm" onClick={add}>
          Добавить
        </Button>
      ) : null}
      {error !== undefined ? (
        <p id={`${baseId}-err`} className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

type SinglePersonProps = {
  label: string;
  value: PersonValue | null;
  onChange: (next: PersonValue | null) => void;
  owners: OwnerOption[];
  fieldName: string;
  required?: boolean;
  error?: string | undefined;
};

export function PersonField({
  label,
  value,
  onChange,
  owners,
  fieldName,
  required = false,
  error,
}: SinglePersonProps): React.JSX.Element {
  const idUser = useId();
  const idName = useId();
  const current = value ?? { user_id: null, full_name: "" };
  const update = (next: PersonValue): void => {
    if (!required && next.user_id === null && next.full_name.trim().length === 0) {
      onChange(null);
      return;
    }
    onChange(next);
  };
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div>
        <Label htmlFor={idUser}>{label} — учётка</Label>
        <Select
          id={idUser}
          data-testid={`${fieldName}-user`}
          value={current.user_id ?? ""}
          onValueChange={(val) =>
            update({ user_id: val === "" ? null : val, full_name: val === "" ? current.full_name : "" })
          }
        >
          <option value="">— не из учёток —</option>
          {owners.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.full_name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor={idName}>Или ФИО текстом</Label>
        <Input
          id={idName}
          data-testid={`${fieldName}-name`}
          value={current.full_name}
          disabled={current.user_id !== null}
          onChange={(e) => update({ ...current, full_name: e.target.value })}
          placeholder="Фамилия Имя"
          maxLength={200}
        />
        {error !== undefined ? (
          <p className="mt-1 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export type DocumentValue = { title: string; url: string };

type DocumentsListProps = {
  label: string;
  value: DocumentValue[];
  onChange: (next: DocumentValue[]) => void;
  fieldName: string;
  error?: string | undefined;
};

export function DocumentsList({
  label,
  value,
  onChange,
  fieldName,
  error,
}: DocumentsListProps): React.JSX.Element {
  const baseId = useId();
  const [touched, setTouched] = useState<Record<number, boolean>>({});
  const add = (): void => onChange([...value, { title: "", url: "" }]);
  const remove = (idx: number): void => onChange(value.filter((_, i) => i !== idx));
  const patch = (idx: number, next: DocumentValue): void =>
    onChange(value.map((v, i) => (i === idx ? next : v)));
  const touch = useCallback((idx: number): void => {
    setTouched((prev) => ({ ...prev, [idx]: true }));
  }, []);

  return (
    <fieldset className="space-y-2" aria-describedby={error ? `${baseId}-err` : undefined}>
      <legend className="text-sm font-medium text-ink">{label}</legend>
      <ul className="space-y-2">
        {value.map((entry, idx) => {
          const urlReason = documentUrlReason(entry.url);
          const titleEmpty = entry.title.trim().length === 0;
          return (
            <li
              key={idx}
              className="grid gap-2 rounded-md border border-line bg-surface p-3 sm:grid-cols-[1fr_1fr_auto]"
            >
              <div>
                <Label htmlFor={`${baseId}-title-${idx}`} className="text-xs text-muted">
                  Название
                </Label>
                <Input
                  id={`${baseId}-title-${idx}`}
                  data-testid={`${fieldName}-title-${idx}`}
                  value={entry.title}
                  onChange={(e) => patch(idx, { ...entry, title: e.target.value })}
                  onBlur={() => touch(idx)}
                  maxLength={500}
                />
                {touched[idx] && titleEmpty ? (
                  <p className="mt-1 text-sm text-danger">Укажите название.</p>
                ) : null}
              </div>
              <div>
                <Label htmlFor={`${baseId}-url-${idx}`} className="text-xs text-muted">
                  Адрес (http/https или \\сервер\ресурс)
                </Label>
                <Input
                  id={`${baseId}-url-${idx}`}
                  data-testid={`${fieldName}-url-${idx}`}
                  value={entry.url}
                  onChange={(e) => patch(idx, { ...entry, url: e.target.value })}
                  onBlur={() => touch(idx)}
                  maxLength={2000}
                  autoComplete="off"
                />
                {touched[idx] && urlReason !== null ? (
                  <p className={cn("mt-1 text-sm", "text-danger")}>{urlReason}</p>
                ) : isUncPath(entry.url) ? (
                  <p className="mt-1 text-sm text-muted">Сетевой путь будет показан с кнопкой «Скопировать».</p>
                ) : null}
              </div>
              <div className="flex items-end">
                <Button type="button" variant="ghost" size="sm" onClick={() => remove(idx)}>
                  Удалить
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <Button type="button" variant="outline" size="sm" onClick={add}>
        Добавить
      </Button>
      {error !== undefined ? (
        <p id={`${baseId}-err`} className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

type ChipsMultiProps<T extends string> = {
  label: string;
  value: T[];
  onChange: (next: T[]) => void;
  options: Array<{ value: T; label: string }>;
  fieldName: string;
};

export function ChipsMulti<T extends string>({
  label,
  value,
  onChange,
  options,
  fieldName,
}: ChipsMultiProps<T>): React.JSX.Element {
  const toggle = (v: T): void => {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]);
  };
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-ink">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const checked = value.includes(opt.value);
          return (
            <label
              key={opt.value}
              className={cn(
                "cursor-pointer rounded-full border px-3 py-1 text-sm",
                checked ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-muted",
              )}
            >
              <input
                type="checkbox"
                className="sr-only"
                data-testid={`${fieldName}-${opt.value}`}
                checked={checked}
                onChange={() => toggle(opt.value)}
              />
              {opt.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

type StringListProps = {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  fieldName: string;
  placeholder?: string;
};

export function StringList({
  label,
  value,
  onChange,
  fieldName,
  placeholder,
}: StringListProps): React.JSX.Element {
  const add = (): void => onChange([...value, ""]);
  const remove = (idx: number): void => onChange(value.filter((_, i) => i !== idx));
  const patch = (idx: number, v: string): void =>
    onChange(value.map((x, i) => (i === idx ? v : x)));
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-ink">{label}</legend>
      <ul className="space-y-2">
        {value.map((v, idx) => (
          <li key={idx} className="flex gap-2">
            <Input
              data-testid={`${fieldName}-${idx}`}
              value={v}
              onChange={(e) => patch(idx, e.target.value)}
              placeholder={placeholder}
              maxLength={500}
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => remove(idx)}>
              Удалить
            </Button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" size="sm" onClick={add}>
        Добавить
      </Button>
    </fieldset>
  );
}

type FieldErrorMap = Record<string, string>;

export function fieldErrorFor(errors: FieldErrorMap, field: string): string | undefined {
  return errors[field];
}

/** Контейнер блока карточки с заголовком. */
export function FormBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="space-y-4 rounded-lg border border-line bg-surface p-5">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}
