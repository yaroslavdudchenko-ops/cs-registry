import Link from "next/link";
import { redirect } from "next/navigation";

import { Forbidden } from "@/components/forbidden";
import { SystemCreateForm } from "@/components/system-create-form";
import { canCreateSystem } from "@/lib/labels";
import { getSql } from "@/server/db/client";
import { listUsers, publicUser } from "@/server/db/users-repository";
import { getPageAuth } from "@/server/auth/page-session";

export const dynamic = "force-dynamic";

export default async function NewSystemPage(): Promise<React.JSX.Element> {
  const user = await getPageAuth();
  if (user === null) {
    redirect("/login");
  }
  if (!canCreateSystem(user.role)) {
    return <Forbidden />;
  }
  const rows = await listUsers(getSql());
  const owners = rows.filter((row) => row.is_active).map((row) => {
    const pub = publicUser(row);
    return { id: pub.id, full_name: pub.full_name };
  });
  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm">
          <Link href="/systems" className="text-accent hover:underline">
            ← К списку
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Новая система</h1>
        <p className="mt-1 text-muted">Обязательны наименование, тип и оба владельца.</p>
      </div>
      <SystemCreateForm owners={owners} />
    </section>
  );
}
