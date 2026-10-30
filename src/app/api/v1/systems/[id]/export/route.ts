import { withApi } from "@/server/http/handle";
import { fileResult } from "@/server/http/response";
import { requirePermission } from "@/server/modules/auth/guard";
import { exportSystemCard } from "@/server/modules/export/service";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return withApi(request, async (extras) => {
    const { id } = await context.params;
    const auth = await requirePermission(request, "systems.export", extras, {
      action: "export",
      entityType: "systems",
      entityId: id,
      entityLabel: null,
    });
    const format = new URL(request.url).searchParams.get("format");
    const file = await exportSystemCard(id, format, auth.actor);
    return fileResult(file.body, extras.requestId, {
      filename: file.filename,
      contentType: file.contentType,
    });
  });
}
