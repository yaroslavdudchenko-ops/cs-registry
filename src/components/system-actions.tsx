"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ReasonDialog } from "@/components/reason-dialog";
import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api";
import { apiErrorText } from "@/lib/api-errors";
import {
  canArchiveSystem,
  canRestoreSystem,
  canUpdateSystem,
} from "@/lib/labels";
import type { SystemDetail } from "@/lib/system-detail";

type DialogKind = "archive" | "restore" | null;

export function SystemActions({ system }: { system: SystemDetail }): React.JSX.Element | null {
  const user = useSession();
  const router = useRouter();
  const archived = system.archived_at !== null;
  const canEdit = canUpdateSystem(user.role) && !archived;
  const canArchive = canArchiveSystem(user.role) && !archived;
  const canRestore = canRestoreSystem(user.role) && archived;
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState("");

  if (!canEdit && !canArchive && !canRestore) {
    return null;
  }

  async function submit(kind: "archive" | "restore", reason: string): Promise<void> {
    setPending(true);
    setError(null);
    const path =
      kind === "archive"
        ? `/api/v1/systems/${system.id}/archive`
        : `/api/v1/systems/${system.id}/restore`;
    const result = await apiRequest<unknown>(path, {
      method: "POST",
      body: JSON.stringify({ reason, version: system.version }),
    });
    setPending(false);
    if (!result.ok) {
      setRequestId(result.requestId);
      if (result.status === 401) {
        router.replace("/login");
        return;
      }
      setError(apiErrorText(result.code, "Не удалось выполнить действие"));
      return;
    }
    setDialog(null);
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap gap-3">
        {canEdit ? (
          <Button asChild>
            <Link href={`/systems/${system.id}/edit`}>Изменить</Link>
          </Button>
        ) : null}
        {canArchive ? (
          <Button
            variant="danger"
            onClick={() => {
              setError(null);
              setRequestId("");
              setDialog("archive");
            }}
          >
            Архивировать
          </Button>
        ) : null}
        {canRestore ? (
          <Button
            onClick={() => {
              setError(null);
              setRequestId("");
              setDialog("restore");
            }}
          >
            Восстановить
          </Button>
        ) : null}
      </div>
      <ReasonDialog
        key={dialog === "archive" ? "archive" : "archive-closed"}
        open={dialog === "archive"}
        title="Архивировать систему"
        description="Запись останется в реестре, но не будет доступна для правки. Укажите причину."
        confirmLabel="Архивировать"
        pending={pending}
        error={error}
        requestId={requestId}
        onClose={() => {
          if (!pending) {
            setDialog(null);
          }
        }}
        onConfirm={(reason) => void submit("archive", reason)}
      />
      <ReasonDialog
        key={dialog === "restore" ? "restore" : "restore-closed"}
        open={dialog === "restore"}
        title="Восстановить систему"
        description="Запись снова станет действующей. Укажите причину восстановления."
        confirmLabel="Восстановить"
        pending={pending}
        error={error}
        requestId={requestId}
        onClose={() => {
          if (!pending) {
            setDialog(null);
          }
        }}
        onConfirm={(reason) => void submit("restore", reason)}
      />
    </>
  );
}
