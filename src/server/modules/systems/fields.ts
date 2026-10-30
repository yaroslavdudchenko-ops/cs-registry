import { z } from "zod";

import {
  BACKUP_FREQUENCIES,
  COMPANY_CODES,
  CRITICALITIES,
  DATA_CLASSIFICATIONS,
  DOCUMENT_KINDS,
  GAMP_CATEGORIES,
  HOSTING_TYPES,
  LIFECYCLE_STATUSES,
  PERSON_ROLES,
  SERVER_TYPES,
  SYSTEM_DOMAINS,
  SYSTEM_TYPES,
  VALIDATION_STATUSES,
} from "@/server/db/enums";
import { SYSTEM_SORT_FIELDS } from "@/server/db/systems-repository";
import { isAllowedDocumentUrl } from "@/lib/documents";
import { FIELD_LABELS } from "@/lib/labels";
import { type FieldError, validationError } from "@/server/http/errors";

const trimmedString = z.string().transform((v) => v.trim());

const optionalText = (max: number) =>
  z
    .union([trimmedString.pipe(z.string().max(max)), z.null()])
    .optional();

const dateField = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()])
  .optional();

const hoursField = z.union([z.number().int().min(0), z.null()]).optional();

/** Человек: учётная запись (user_id) ИЛИ ФИО текстом. Нельзя оба и нельзя ни одного. */
export const personRefSchema = z
  .object({
    user_id: z.union([z.uuid(), z.null()]).optional(),
    full_name: z.union([trimmedString.pipe(z.string().min(1).max(200)), z.null()]).optional(),
  })
  .refine(
    (v) => {
      const hasUser = v.user_id !== undefined && v.user_id !== null;
      const hasName = v.full_name !== undefined && v.full_name !== null && v.full_name.length > 0;
      return (hasUser && !hasName) || (!hasUser && hasName);
    },
    { message: "Укажите учётную запись или ФИО (одно из двух)." },
  );

export type PersonRef = z.infer<typeof personRefSchema>;

const personListSchema = z.array(personRefSchema).max(50).optional();

export const documentSchema = z.object({
  kind: z.enum(DOCUMENT_KINDS),
  title: trimmedString.pipe(z.string().min(1).max(500)),
  url: trimmedString.pipe(z.string().min(1).max(2000)).refine(isAllowedDocumentUrl, {
    message: "Разрешены только http(s)-ссылки и сетевые пути \\\\сервер\\ресурс.",
  }),
});
export type DocumentInput = z.infer<typeof documentSchema>;

const documentsListSchema = z.array(documentSchema).max(100).optional();

const companiesSchema = z.array(z.enum(COMPANY_CODES)).max(COMPANY_CODES.length).optional();
const integrationsSchema = z
  .array(trimmedString.pipe(z.string().min(1).max(500)))
  .max(100)
  .optional();

export const createSystemSchema = z
  .object({
    name: trimmedString.pipe(z.string().min(1).max(500)),
    domain: z.enum(SYSTEM_DOMAINS),
    purpose: optionalText(10_000),
    product_version: optionalText(100),
    release: optionalText(200),
    vendor: optionalText(200),
    system_type: z.enum(SYSTEM_TYPES),
    hosting_type: z.enum(HOSTING_TYPES),
    hosting_provider: optionalText(200),
    site: optionalText(500),
    server: optionalText(500),
    server_type: z.union([z.enum(SERVER_TYPES), z.null()]).optional(),
    backup_frequency: z.union([z.enum(BACKUP_FREQUENCIES), z.null()]).optional(),
    backup_rpo_hours: hoursField,
    backup_rto_hours: hoursField,
    integrations: integrationsSchema,
    data_classification: z.enum(DATA_CLASSIFICATIONS),
    is_gxp_relevant: z.boolean(),
    criticality: z.enum(CRITICALITIES),
    gxp_criticality: z.union([z.enum(CRITICALITIES), z.null()]).optional(),
    gamp_category: z.union([z.enum(GAMP_CATEGORIES), z.null()]).optional(),
    lifecycle_status: z.enum(LIFECYCLE_STATUSES),
    validation_status: z.enum(VALIDATION_STATUSES),
    validated_at: dateField,
    next_review_at: dateField,
    auth_model: optionalText(500),
    business_process: optionalText(2000),
    description: optionalText(10_000),
    notes: optionalText(10_000),
    devops: optionalText(10_000),
    quality_owner_id: z.union([z.uuid(), z.null()]).optional(),
    system_owner: personRefSchema.optional(),
    release_manager: z.union([personRefSchema, z.null()]).optional(),
    process_owners: personListSchema,
    key_users: personListSchema,
    support_people: personListSchema,
    project_managers: personListSchema,
    analysts: personListSchema,
    developers: personListSchema,
    testers: personListSchema,
    companies: companiesSchema,
    internal_documents: documentsListSchema,
    vendor_documents: documentsListSchema,
    reason: z.string().optional(),
  });

export const patchSystemSchema = createSystemSchema.partial().extend({
  version: z.number().int(),
  reason: z.string().optional(),
});

export const archiveBodySchema = z.object({
  reason: z.string(),
  version: z.number().int().optional(),
});

export type CreateSystemInput = z.infer<typeof createSystemSchema>;
export type PatchSystemInput = z.infer<typeof patchSystemSchema>;

/** Поля-псевдонимы для подсказок пользователю (zod отдаёт путь к полю; русские подписи — в FIELD_LABELS). */
function toFieldErrors(error: z.ZodError): FieldError[] {
  const seen = new Set<string>();
  const out: FieldError[] = [];
  for (const issue of error.issues) {
    const first = issue.path[0];
    const field = first === undefined ? "" : String(first);
    if (seen.has(field)) continue;
    seen.add(field);
    const label = FIELD_LABELS[field] ?? field;
    const message = humanizeIssueMessage(issue.message, label);
    out.push({ field, message });
  }
  if (out.length === 0) {
    out.push({ field: "", message: "Запрос не проходит проверку." });
  }
  return out;
}

function humanizeIssueMessage(raw: string, label: string): string {
  const lowered = raw.toLowerCase();
  if (lowered.includes("required") || lowered.includes("expected") || lowered.includes("invalid input")) {
    return `${label}: укажите значение.`;
  }
  if (lowered.includes("too_small") || lowered.includes("at least") || lowered.includes("minimum")) {
    return `${label}: значение слишком короткое.`;
  }
  if (lowered.includes("too_big") || lowered.includes("at most") || lowered.includes("maximum")) {
    return `${label}: значение слишком длинное.`;
  }
  if (lowered.includes("email")) return `${label}: неверный формат электронной почты.`;
  if (lowered.includes("url") || lowered.includes("uuid")) return `${label}: неверный формат.`;
  if (lowered.includes("regex")) return `${label}: неверный формат.`;
  if (raw.length > 0 && !/^[A-Z_][A-Z0-9_]*$/.test(raw)) return raw;
  return `${label}: некорректное значение.`;
}

export function parseCreateSystem(body: unknown): CreateSystemInput {
  const parsed = createSystemSchema.safeParse(body);
  if (!parsed.success) {
    throw validationError(toFieldErrors(parsed.error));
  }
  return applyGxpRule(parsed.data);
}

export function parsePatchSystem(body: unknown): PatchSystemInput {
  const parsed = patchSystemSchema.safeParse(body);
  if (!parsed.success) {
    throw validationError(toFieldErrors(parsed.error));
  }
  return applyGxpRulePatch(parsed.data);
}

/**
 * Единое правило GxP → валидация (скриншот gxp-validation.png):
 * не-GxP: status принудительно not_required, gxp_criticality/gamp/даты валидации очищаются.
 * GxP: status != not_required, gxp_criticality и gamp обязательны.
 */
export function applyGxpRule(input: CreateSystemInput): CreateSystemInput {
  if (!input.is_gxp_relevant) {
    if (input.validation_status !== "not_required") {
      throw validationError(
        [
          {
            field: "validation_status",
            message: "Для системы вне GxP статус должен быть «Не требуется».",
          },
        ],
      );
    }
    return {
      ...input,
      gxp_criticality: null,
      gamp_category: null,
      validated_at: null,
      next_review_at: null,
    };
  }
  const errors: FieldError[] = [];
  if (input.validation_status === "not_required") {
    errors.push({
      field: "validation_status",
      message: "Для GxP-системы статус «Не требуется» недоступен.",
    });
  }
  if (input.gxp_criticality === undefined || input.gxp_criticality === null) {
    errors.push({ field: "gxp_criticality", message: "GxP-критичность: укажите значение." });
  }
  if (input.gamp_category === undefined || input.gamp_category === null) {
    errors.push({ field: "gamp_category", message: "Категория GAMP 5: укажите значение." });
  }
  if (errors.length > 0) throw validationError(errors);
  return input;
}

export function applyGxpRulePatch(input: PatchSystemInput): PatchSystemInput {
  if (input.is_gxp_relevant === undefined) return input;
  if (input.is_gxp_relevant === false) {
    if (input.validation_status !== undefined && input.validation_status !== "not_required") {
      throw validationError([
        {
          field: "validation_status",
          message: "Для системы вне GxP статус должен быть «Не требуется».",
        },
      ]);
    }
    return {
      ...input,
      validation_status: "not_required",
      gxp_criticality: null,
      gamp_category: null,
      validated_at: null,
      next_review_at: null,
    };
  }
  const errors: FieldError[] = [];
  if (input.validation_status === "not_required") {
    errors.push({
      field: "validation_status",
      message: "Для GxP-системы статус «Не требуется» недоступен.",
    });
  }
  if (input.gxp_criticality === null) {
    errors.push({ field: "gxp_criticality", message: "GxP-критичность: укажите значение." });
  }
  if (input.gamp_category === null) {
    errors.push({ field: "gamp_category", message: "Категория GAMP 5: укажите значение." });
  }
  if (errors.length > 0) throw validationError(errors);
  return input;
}

export const exportFormatSchema = z.enum(["xlsx", "pdf"]);

export const listQuerySchema = z.object({
  q: z.string().optional(),
  type: z.enum(SYSTEM_TYPES).optional(),
  domain: z.enum(SYSTEM_DOMAINS).optional(),
  criticality: z.enum(CRITICALITIES).optional(),
  gxp_criticality: z.enum(CRITICALITIES).optional(),
  gamp_category: z.enum(GAMP_CATEGORIES).optional(),
  status: z.enum(LIFECYCLE_STATUSES).optional(),
  validation_status: z.enum(VALIDATION_STATUSES).optional(),
  gxp: z.enum(["0", "1", "true", "false"]).optional(),
  company: z.enum(COMPANY_CODES).optional(),
  owner: z.uuid().optional(),
  process_owner: z.uuid().optional(),
  site: z.string().optional(),
  archived: z.enum(["1", "true", "0", "false"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.enum(SYSTEM_SORT_FIELDS).optional(),
  order: z.enum(["asc", "desc"]).optional(),
});

export const exportQuerySchema = listQuerySchema.omit({ page: true, pageSize: true }).extend({
  format: exportFormatSchema,
});

export type ExportQueryInput = z.infer<typeof exportQuerySchema>;
export type ExportFormat = z.infer<typeof exportFormatSchema>;

export function parseExportQuery(raw: Record<string, string>): ExportQueryInput {
  const parsed = exportQuerySchema.safeParse(raw);
  if (!parsed.success) {
    throw validationError(toFieldErrors(parsed.error));
  }
  return parsed.data;
}

export function parseExportFormat(raw: string | null): ExportFormat {
  const parsed = exportFormatSchema.safeParse(raw);
  if (!parsed.success) {
    throw validationError(toFieldErrors(parsed.error));
  }
  return parsed.data;
}

export { PERSON_ROLES };
