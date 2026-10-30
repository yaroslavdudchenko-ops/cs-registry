import { z } from "zod";

import {
  CRITICALITIES,
  DATA_CLASSIFICATIONS,
  HOSTING_TYPES,
  LIFECYCLE_STATUSES,
  SYSTEM_TYPES,
  VALIDATION_STATUSES,
} from "@/server/db/enums";
import { SYSTEM_SORT_FIELDS } from "@/server/db/systems-repository";
import { ApiError } from "@/server/http/errors";

const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional();

const dateField = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()])
  .optional();

const hoursField = z.union([z.number().int().min(0), z.null()]).optional();

export const createSystemSchema = z.object({
  name: z.string().trim().min(1).max(500),
  vendor: optionalText(200),
  product_version: optionalText(100),
  description: optionalText(10_000),
  system_type: z.enum(SYSTEM_TYPES),
  business_process: optionalText(2000),
  process_owner_id: z.union([z.uuid(), z.null()]).optional(),
  system_owner_id: z.union([z.uuid(), z.null()]).optional(),
  quality_owner_id: z.union([z.uuid(), z.null()]).optional(),
  site: optionalText(200),
  hosting_type: z.enum(HOSTING_TYPES),
  hosting_provider: optionalText(200),
  data_classification: z.enum(DATA_CLASSIFICATIONS),
  is_gxp_relevant: z.boolean(),
  criticality: z.enum(CRITICALITIES),
  lifecycle_status: z.enum(LIFECYCLE_STATUSES),
  validation_status: z.enum(VALIDATION_STATUSES),
  validated_at: dateField,
  next_review_at: dateField,
  auth_model: optionalText(200),
  backup_rpo_hours: hoursField,
  backup_rto_hours: hoursField,
  notes: optionalText(10_000),
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

export function requireOwners(
  processOwnerId: string | null | undefined,
  systemOwnerId: string | null | undefined,
): { processOwnerId: string; systemOwnerId: string } {
  if (
    processOwnerId === undefined ||
    processOwnerId === null ||
    processOwnerId.length === 0 ||
    systemOwnerId === undefined ||
    systemOwnerId === null ||
    systemOwnerId.length === 0
  ) {
    throw new ApiError("OWNERS_REQUIRED");
  }
  return { processOwnerId, systemOwnerId };
}

export function parseCreateSystem(body: unknown): CreateSystemInput {
  const parsed = createSystemSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR");
  }
  return parsed.data;
}

export function parsePatchSystem(body: unknown): PatchSystemInput {
  const parsed = patchSystemSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR");
  }
  return parsed.data;
}

export const exportFormatSchema = z.enum(["xlsx", "pdf"]);

export const listQuerySchema = z.object({
  q: z.string().optional(),
  type: z.enum(SYSTEM_TYPES).optional(),
  criticality: z.enum(CRITICALITIES).optional(),
  status: z.enum(LIFECYCLE_STATUSES).optional(),
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
    throw new ApiError("VALIDATION_ERROR");
  }
  return parsed.data;
}

export function parseExportFormat(raw: string | null): ExportFormat {
  const parsed = exportFormatSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR");
  }
  return parsed.data;
}
