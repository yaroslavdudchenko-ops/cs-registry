/**
 * Правило `reason` из FS §7. Чистая функция: журнал не пишется отсюда.
 * HTTP-слой ловит `ReasonRequiredError` и отвечает 422 REASON_REQUIRED,
 * а отказ в аудит записывает отдельным вызовом сервиса.
 */

export const REASON_REQUIRED_CODE = "REASON_REQUIRED" as const;

const CRITICAL_FIELDS = ["validation_status", "criticality", "is_gxp_relevant"] as const;

export type ReasonCheckInput = {
  changedFields: readonly string[];
  currentValidationStatus?: string | null;
  isArchive?: boolean;
  isRestore?: boolean;
  isRoleChange?: boolean;
  isDeactivation?: boolean;
};

export class ReasonRequiredError extends Error {
  readonly code = REASON_REQUIRED_CODE;

  constructor() {
    super("Для этого изменения нужна причина");
    this.name = "ReasonRequiredError";
  }
}

export function hasReason(reason: string | null | undefined): boolean {
  return reason !== undefined && reason !== null && reason.trim().length >= 1;
}

export function isReasonRequired(input: ReasonCheckInput): boolean {
  if (input.isArchive === true || input.isRestore === true) {
    return true;
  }
  if (input.isRoleChange === true || input.isDeactivation === true) {
    return true;
  }
  for (const field of CRITICAL_FIELDS) {
    if (input.changedFields.includes(field)) {
      return true;
    }
  }
  if (input.currentValidationStatus === "validated" && input.changedFields.length > 0) {
    return true;
  }
  return false;
}

export function assertReason(reason: string | null | undefined, input: ReasonCheckInput): void {
  if (isReasonRequired(input) && !hasReason(reason)) {
    throw new ReasonRequiredError();
  }
}
