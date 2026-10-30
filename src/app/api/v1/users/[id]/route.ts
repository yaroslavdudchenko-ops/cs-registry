import { ApiError } from "@/server/http/errors";
import { withApi } from "@/server/http/handle";
import { readJsonBody } from "@/server/http/request";
import { jsonResult } from "@/server/http/response";
import { requirePermission } from "@/server/modules/auth/guard";
import { updateUserRecord } from "@/server/modules/users/service";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  return withApi(request, async (extras) => {
    const { id } = await context.params;
    const auth = await requirePermission(request, "users.update", extras, {
      action: "update",
      entityType: "users",
      entityId: id,
      entityLabel: null,
    });
    const raw = await readJsonBody(request);
    if (raw === null) {
      throw new ApiError("VALIDATION_ERROR");
    }
    const updated = await updateUserRecord(id, raw, auth.actor);
    return jsonResult(200, updated, extras.requestId);
  });
}
