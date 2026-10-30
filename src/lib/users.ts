import { z } from "zod";

import { USER_ROLES } from "@/server/db/enums";

export const userRecordSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  full_name: z.string(),
  email: z.string(),
  role: z.enum(USER_ROLES),
  is_active: z.boolean(),
  last_login_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  version: z.number().int(),
});

export const userListResponseSchema = z.object({
  items: z.array(userRecordSchema),
});

export type UserRecord = z.infer<typeof userRecordSchema>;
