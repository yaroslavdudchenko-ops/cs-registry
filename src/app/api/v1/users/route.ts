import { ApiError } from "@/server/http/errors";
import { withApi } from "@/server/http/handle";
import { readJsonBody } from "@/server/http/request";
import { jsonResult } from "@/server/http/response";
import { requirePermission } from "@/server/modules/auth/guard";
import { createUserRecord, listUserRecords } from "@/server/modules/users/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withApi(request, async (extras) => {
    await requirePermission(request, "users.read", extras, {
      action: "read",
      entityType: "users",
      entityId: null,
      entityLabel: null,
    });
    const items = await listUserRecords();
    return jsonResult(200, { items }, extras.requestId);
  });
}

export async function POST(request: Request): Promise<Response> {
  return withApi(request, async (extras) => {
    const auth = await requirePermission(request, "users.create", extras, {
      action: "create",
      entityType: "users",
      entityId: null,
      entityLabel: null,
    });
    const raw = await readJsonBody(request);
    if (raw === null) {
      throw new ApiError("VALIDATION_ERROR");
    }
    const created = await createUserRecord(raw, auth.actor);
    return jsonResult(201, created, extras.requestId);
  });
}
