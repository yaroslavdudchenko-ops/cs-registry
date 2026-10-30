"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ReasonDialog({
  open,
  title,
  description,
  confirmLabel,
  pending,
  error,
  requestId,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  pending: boolean;
  error: string | null;
  requestId: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}): React.JSX.Element | null {
  const titleId = useId();
  const [reason, setReason] = useState("");

  if (!open) {
    return null;
  }

  const trimmed = reason.trim();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-lg border border-line bg-surface p-5 shadow-lg"
      >
        <h2 id={titleId} className="text-xl font-semibold">
          {title}
        </h2>
        <p className="mt-2 text-muted">{description}</p>
        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmed.length === 0 || pending) {
              return;
            }
            onConfirm(trimmed);
          }}
        >
          <div>
            <Label htmlFor={`${titleId}-reason`}>Причина</Label>
            <Textarea
              id={`${titleId}-reason`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
              disabled={pending}
              autoFocus
            />
          </div>
          {error !== null ? (
            <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
              {error}
              {requestId.length > 0 ? (
                <span className="mt-1 block text-muted">Идентификатор запроса: {requestId}</span>
              ) : null}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={pending || trimmed.length === 0}>
              {pending ? "Сохранение…" : confirmLabel}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setReason("");
                onClose();
              }}
              disabled={pending}
            >
              Отмена
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
