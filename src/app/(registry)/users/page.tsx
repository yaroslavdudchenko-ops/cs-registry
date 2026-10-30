import { redirect } from "next/navigation";

import { Forbidden } from "@/components/forbidden";
import { UsersManagement } from "@/components/users-management";
import { canReadUsers } from "@/lib/labels";
import { getPageAuth } from "@/server/auth/page-session";

export const dynamic = "force-dynamic";

export default async function UsersPage(): Promise<React.JSX.Element> {
  const user = await getPageAuth();
  if (user === null) {
    redirect("/login");
  }
  if (!canReadUsers(user.role)) {
    return <Forbidden />;
  }
  return <UsersManagement />;
}
