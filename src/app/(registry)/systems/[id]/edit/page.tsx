import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Forbidden } from "@/components/forbidden";
import { SystemEditForm } from "@/components/system-edit-form";
import { canUpdateSystem } from "@/lib/labels";
import { systemDetailSchema } from "@/lib/system-detail";
import { getSql } from "@/server/db/client";
import { listUsers, publicUser } from "@/server/db/users-repository";
import { ApiError } from "@/server/http/errors";
import { getPageAuth } from "@/server/auth/page-session";
import { getSystemRecord } from "@/server/modules/systems/service";

export const dynamic = "force-dynamic";

export default async function EditSystemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.JSX.Element> {
  const user = await getPageAuth();
  if (user === null) {
    redirect("/login");
  }
  if (!canUpdateSystem(user.role)) {
    return <Forbidden />;
  }
  const { id } = await params;
  let row: unknown;
  try {
    row = await getSystemRecord(id);
  } catch (error) {
    if (error instanceof ApiError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }
  const parsed = systemDetailSchema.safeParse(row);
  if (!parsed.success) {
    notFound();
  }
  if (parsed.data.archived_at !== null) {
    redirect(`/systems/${parsed.data.id}`);
  }
  const rows = await listUsers(getSql());
  const owners = rows
    .filter((item) => item.is_active)
    .map((item) => {
      const pub = publicUser(item);
      return { id: pub.id, full_name: pub.full_name };
    });
  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm">
          <Link href={`/systems/${parsed.data.id}`} className="text-accent hover:underline">
            ← К карточке
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Изменить систему</h1>
        <p className="mt-1 text-muted">
          Код {parsed.data.code} не меняется. Причину изменения нужно указать внизу формы.
        </p>
      </div>
      <SystemEditForm system={parsed.data} owners={owners} role={user.role} />
    </section>
  );
}
