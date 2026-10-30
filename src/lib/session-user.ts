import type { UserRole } from "@/server/db/enums";

export type SessionUser = {
  id: string;
  username: string;
  full_name: string;
  role: UserRole;
};
