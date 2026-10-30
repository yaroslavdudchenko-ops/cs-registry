import { z } from "zod";

import {
  BACKUP_FREQUENCIES,
  COMPANY_CODES,
  CRITICALITIES,
  DOCUMENT_KINDS,
  GAMP_CATEGORIES,
  LIFECYCLE_STATUSES,
  PERSON_ROLES,
  SERVER_TYPES,
  SYSTEM_DOMAINS,
  SYSTEM_TYPES,
  VALIDATION_STATUSES,
} from "@/server/db/enums";

export const personEntrySchema = z.object({
  role: z.enum(PERSON_ROLES),
  user_id: z.uuid().nullable(),
  full_name: z.string(),
  position: z.number().int(),
});
export type PersonEntryDto = z.infer<typeof personEntrySchema>;

export const documentEntrySchema = z.object({
  id: z.string(),
  kind: z.enum(DOCUMENT_KINDS),
  title: z.string(),
  url: z.string(),
  position: z.number().int(),
});
export type DocumentEntryDto = z.infer<typeof documentEntrySchema>;

export const systemListItemSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  domain: z.enum(SYSTEM_DOMAINS),
  system_type: z.enum(SYSTEM_TYPES),
  criticality: z.enum(CRITICALITIES),
  gxp_criticality: z.enum(CRITICALITIES).nullable(),
  gamp_category: z.enum(GAMP_CATEGORIES).nullable(),
  lifecycle_status: z.enum(LIFECYCLE_STATUSES),
  process_owner_id: z.uuid().nullable(),
  process_owner_name: z.string().nullable(),
  system_owner_id: z.uuid().nullable(),
  system_owner_name: z.string().nullable(),
  release_manager_name: z.string().nullable(),
  quality_owner_name: z.string().nullable(),
  site: z.string().nullable(),
  server: z.string().nullable(),
  server_type: z.enum(SERVER_TYPES).nullable(),
  validation_status: z.enum(VALIDATION_STATUSES),
  validated_at: z.string().nullable(),
  next_review_at: z.string().nullable(),
  is_gxp_relevant: z.boolean(),
  purpose: z.string().nullable(),
  release: z.string().nullable(),
  vendor: z.string().nullable(),
  product_version: z.string().nullable(),
  backup_frequency: z.enum(BACKUP_FREQUENCIES).nullable(),
  backup_rpo_hours: z.number().nullable(),
  backup_rto_hours: z.number().nullable(),
  integrations: z.array(z.string()),
  people: z.array(personEntrySchema),
  companies: z.array(z.enum(COMPANY_CODES)),
  documents: z.array(documentEntrySchema),
  notes: z.string().nullable(),
  devops: z.string().nullable(),
  archived_at: z.string().nullable(),
});

export const systemListResponseSchema = z.object({
  items: z.array(systemListItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  requestId: z.string().optional(),
});

export type SystemListItem = z.infer<typeof systemListItemSchema>;
export type SystemListResponse = z.infer<typeof systemListResponseSchema>;
