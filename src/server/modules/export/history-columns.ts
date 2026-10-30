import {
  formatAuditSnapshot,
  formatChangedFieldsLabel,
  formatDateTimeUtc,
} from "@/lib/format";
import { actionLabel, roleLabel } from "@/lib/labels";
import type { ChainedAuditEvent } from "@/server/modules/audit/hash-chain";

export type HistoryColumn = {
  key: string;
  header: string;
  value: (event: ChainedAuditEvent) => string;
};

export const HISTORY_COLUMNS: HistoryColumn[] = [
  {
    key: "occurred_at",
    header: "Когда",
    value: (event) => formatDateTimeUtc(event.occurred_at),
  },
  {
    key: "action",
    header: "Действие",
    value: (event) => actionLabel(event.action),
  },
  {
    key: "actor",
    header: "Кто",
    value: (event) => `${event.actor_username} · ${roleLabel(event.actor_role)}`,
  },
  {
    key: "changed_fields",
    header: "Изменённые поля",
    value: (event) =>
      formatChangedFieldsLabel(event.changed_fields, {
        before: event.before,
        after: event.after,
      }),
  },
  {
    key: "before",
    header: "Было",
    value: (event) => formatAuditSnapshot(event.before, event.changed_fields),
  },
  {
    key: "after",
    header: "Стало",
    value: (event) => formatAuditSnapshot(event.after, event.changed_fields),
  },
  {
    key: "reason",
    header: "Причина",
    value: (event) => {
      if (event.reason === null || event.reason.trim().length === 0) {
        return "—";
      }
      return event.reason;
    },
  },
];
