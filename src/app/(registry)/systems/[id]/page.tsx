import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ExportButtons } from "@/components/export-buttons";
import { SystemActions } from "@/components/system-actions";
import { SystemCard } from "@/components/system-card";
import { SystemHistory } from "@/components/system-history";
import { systemDetailSchema } from "@/lib/system-detail";
import { ApiError } from "@/server/http/errors";
import { getPageAuth } from "@/server/auth/page-session";
import { getSystemRecord } from "@/server/modules/systems/service";

export const dynamic = "force-dynamic";

export default async function SystemCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.JSX.Element> {
  const user = await getPageAuth();
  if (user === null) {
    redirect("/login");
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
  return (
    <section className="space-y-6">
      <p className="text-sm">
        <Link href="/systems" className="text-accent hover:underline">
          ← К списку
        </Link>
      </p>
      <SystemCard system={parsed.data} />
      <div className="flex flex-col gap-3">
        <ExportButtons apiPath={`/api/v1/systems/${parsed.data.id}/export`} />
        <SystemActions system={parsed.data} />
      </div>
      <SystemHistory systemId={parsed.data.id} />
    </section>
  );
}
