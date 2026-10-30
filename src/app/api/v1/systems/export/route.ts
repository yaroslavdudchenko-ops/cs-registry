import { withApi } from "@/server/http/handle";
import { fileResult } from "@/server/http/response";
import { requirePermission } from "@/server/modules/auth/guard";
import { exportRegistry, searchParamsRecord } from "@/server/modules/export/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withApi(request, async (extras) => {
    const auth = await requirePermission(request, "systems.export", extras, {
      action: "export",
      entityType: "systems",
      entityId: null,
      entityLabel: "Реестр",
    });
    const file = await exportRegistry(searchParamsRecord(new URL(request.url)), auth.actor);
    return fileResult(file.body, extras.requestId, {
      filename: file.filename,
      contentType: file.contentType,
    });
  });
}
