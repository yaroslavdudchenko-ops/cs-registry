import { z } from "zod";

import { DATA_CLASS_LABELS, HOSTING_LABELS } from "@/lib/labels";
import {
  CRITICALITIES,
  DATA_CLASSIFICATIONS,
  HOSTING_TYPES,
  LIFECYCLE_STATUSES,
  SYSTEM_TYPES,
  VALIDATION_STATUSES,
} from "@/server/db/enums";

export { DATA_CLASS_LABELS, HOSTING_LABELS };

export const systemDetailSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  vendor: z.string().nullable(),
  product_version: z.string().nullable(),
  description: z.string().nullable(),
  system_type: z.enum(SYSTEM_TYPES),
  business_process: z.string().nullable(),
  process_owner_id: z.uuid(),
  process_owner_name: z.string(),
  system_owner_id: z.uuid(),
  system_owner_name: z.string(),
  quality_owner_id: z.uuid().nullable(),
  quality_owner_name: z.string().nullable(),
  site: z.string().nullable(),
  hosting_type: z.enum(HOSTING_TYPES),
  hosting_provider: z.string().nullable(),
  data_classification: z.enum(DATA_CLASSIFICATIONS),
  is_gxp_relevant: z.boolean(),
  criticality: z.enum(CRITICALITIES),
  lifecycle_status: z.enum(LIFECYCLE_STATUSES),
  validation_status: z.enum(VALIDATION_STATUSES),
  validated_at: z.string().nullable(),
  next_review_at: z.string().nullable(),
  auth_model: z.string().nullable(),
  backup_rpo_hours: z.number().nullable(),
  backup_rto_hours: z.number().nullable(),
  notes: z.string().nullable(),
  archived_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  version: z.number().int(),
});

export type SystemDetail = z.infer<typeof systemDetailSchema>;
