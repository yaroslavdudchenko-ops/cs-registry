import { getSql } from "@/server/db/client";
import { ApiError } from "@/server/http/errors";
import { withApi } from "@/server/http/handle";
import { jsonResult } from "@/server/http/response";
import { listAuditEvents, parseAuditOrder } from "@/server/modules/audit/read";
import { appendAuditEvent } from "@/server/modules/audit/write";
import { requirePermission } from "@/server/modules/auth/guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withApi(request, async (extras) => {
    const auth = await requirePermission(request, "audit.read", extras, {
      action: "read_audit",
      entityType: "auth",
      entityId: null,
      entityLabel: null,
    });
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? "1");
    const pageSize = Number(url.searchParams.get("pageSize") ?? "50");
    const order = parseAuditOrder(url.searchParams.get("order"));
    if (order === null) {
      throw new ApiError("VALIDATION_ERROR");
    }
    await appendAuditEvent(getSql(), auth.actor, {
      action: "read_audit",
      entityType: "auth",
      entityId: null,
      entityLabel: null,
      changedFields: null,
      before: null,
      after: { filters: Object.fromEntries(url.searchParams.entries()) },
      reason: null,
    });
    const reasonRaw = url.searchParams.get("reason");
    const reason =
      reasonRaw !== null && reasonRaw.trim().length > 0 ? reasonRaw.trim() : null;
    const entityLabelRaw = url.searchParams.get("entityLabel");
    const entityLabel =
      entityLabelRaw !== null && entityLabelRaw.trim().length > 0 ? entityLabelRaw.trim() : null;
    const entityIdRaw = url.searchParams.get("entityId");
    const entityId =
      entityIdRaw !== null && entityIdRaw.trim().length > 0 ? entityIdRaw.trim() : null;
    const result = await listAuditEvents(getSql(), {
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 50,
      newestFirst: order === "newest",
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
      actor: url.searchParams.get("actor"),
      entityType: url.searchParams.get("entityType"),
      entityId,
      entityLabel,
      action: url.searchParams.get("action"),
      reason,
    });
    return jsonResult(200, result, extras.requestId);
  });
}
