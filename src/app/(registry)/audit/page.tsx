import { redirect } from "next/navigation";

import { AuditLog } from "@/components/audit-log";
import { Forbidden } from "@/components/forbidden";
import { canReadAudit } from "@/lib/labels";
import { getPageAuth } from "@/server/auth/page-session";

export const dynamic = "force-dynamic";

export default async function AuditPage(): Promise<React.JSX.Element> {
  const user = await getPageAuth();
  if (user === null) {
    redirect("/login");
  }
  if (!canReadAudit(user.role)) {
    return <Forbidden />;
  }
  return <AuditLog />;
}
