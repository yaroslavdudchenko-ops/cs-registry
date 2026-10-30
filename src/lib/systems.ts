import { z } from "zod";

import {
  CRITICALITIES,
  LIFECYCLE_STATUSES,
  SYSTEM_TYPES,
  VALIDATION_STATUSES,
} from "@/server/db/enums";

export const systemListItemSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  system_type: z.enum(SYSTEM_TYPES),
  criticality: z.enum(CRITICALITIES),
  lifecycle_status: z.enum(LIFECYCLE_STATUSES),
  process_owner_id: z.uuid(),
  process_owner_name: z.string(),
  site: z.string().nullable(),
  validation_status: z.enum(VALIDATION_STATUSES),
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
