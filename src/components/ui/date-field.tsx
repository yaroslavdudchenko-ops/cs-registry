"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  RU_DATE_ERROR,
  RU_DATE_HINT,
  isoToRuDate,
  maskRuDate,
  parseRuDate,
} from "@/lib/ru-date";

export function DateField({
  id,
  name,
  label,
  isoValue,
  onIsoChange,
  hint,
}: {
  id: string;
  name?: string;
  label: string;
  isoValue: string;
  onIsoChange: (iso: string) => void;
  hint?: string;
}): React.JSX.Element {
  const [display, setDisplay] = useState(() => isoToRuDate(isoValue));
  const [error, setError] = useState<string | null>(null);

  function apply(raw: string, commit: boolean): void {
    const masked = maskRuDate(raw);
    setDisplay(masked);
    const parsed = parseRuDate(masked);
    if (parsed.ok) {
      setError(null);
      onIsoChange(parsed.iso ?? "");
      return;
    }
    if (commit || masked.length === 10) {
      setError(RU_DATE_ERROR);
    }
  }

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        inputMode="numeric"
        autoComplete="off"
        placeholder={RU_DATE_HINT}
        value={display}
        onChange={(event) => apply(event.target.value, false)}
        onBlur={() => apply(display, true)}
        aria-invalid={error !== null}
        aria-describedby={error !== null ? `${id}-error` : `${id}-hint`}
      />
      <p id={`${id}-hint`} className="mt-1 text-sm text-muted">
        {hint ?? `Формат ${RU_DATE_HINT}. Пустое значение — не задано.`}
      </p>
      {error !== null ? (
        <p id={`${id}-error`} className="mt-1 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
