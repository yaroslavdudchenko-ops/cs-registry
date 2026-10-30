import { z } from "zod";

export const auditEventSchema = z.object({
  id: z.number().int(),
  occurred_at: z.string(),
  actor_id: z.string().nullable(),
  actor_username: z.string(),
  actor_role: z.string(),
  action: z.string(),
  entity_type: z.string(),
  entity_id: z.string().nullable(),
  entity_label: z.string().nullable(),
  changed_fields: z.array(z.string()).nullable(),
  before: z.unknown(),
  after: z.unknown(),
  reason: z.string().nullable(),
  request_id: z.string(),
  ip: z.string().nullable(),
  user_agent: z.string().nullable(),
});

export const auditPageSchema = z.object({
  items: z.array(auditEventSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export type AuditEvent = z.infer<typeof auditEventSchema>;
export type AuditPage = z.infer<typeof auditPageSchema>;
