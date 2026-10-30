import { z } from "zod";

import { getSql } from "@/server/db/client";
import { ApiError } from "@/server/http/errors";
import { withApi } from "@/server/http/handle";
import { jsonResult } from "@/server/http/response";
import { appendAuditEvent } from "@/server/modules/audit/write";
import { listObjectHistory, parsePageParams } from "@/server/modules/audit/read";
import { requirePermission } from "@/server/modules/auth/guard";
import { getSystemRecord } from "@/server/modules/systems/service";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return withApi(request, async (extras) => {
    const { id } = await context.params;
    const auth = await requirePermission(request, "systems.read_history", extras, {
      action: "read_system_history",
      entityType: "systems",
      entityId: id,
      entityLabel: null,
    });
    if (!z.uuid().safeParse(id).success) {
      throw new ApiError("NOT_FOUND");
    }
    const system = await getSystemRecord(id);
    const parsed = parsePageParams(new URL(request.url).searchParams);
    if (parsed === null) {
      throw new ApiError("VALIDATION_ERROR");
    }
    const result = await listObjectHistory(getSql(), {
      entityType: "systems",
      entityId: id,
      page: parsed.page,
      pageSize: parsed.pageSize,
    });
    const code = typeof system["code"] === "string" ? system["code"] : null;
    const name = typeof system["name"] === "string" ? system["name"] : null;
    const entityLabel = code !== null && name !== null ? `${code} ${name}` : id;
    await appendAuditEvent(getSql(), auth.actor, {
      action: "read_system_history",
      entityType: "systems",
      entityId: id,
      entityLabel,
      changedFields: null,
      before: null,
      after: { page: result.page, pageSize: result.pageSize },
      reason: null,
    });
    return jsonResult(200, result, extras.requestId);
  });
}
