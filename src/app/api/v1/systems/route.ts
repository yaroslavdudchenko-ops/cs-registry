import { ApiError } from "@/server/http/errors";
import { withApi } from "@/server/http/handle";
import { readJsonBody } from "@/server/http/request";
import { jsonError, jsonResult } from "@/server/http/response";
import { requirePermission } from "@/server/modules/auth/guard";
import { listQuerySchema } from "@/server/modules/systems/fields";
import { createSystemRecord, listSystemRecords } from "@/server/modules/systems/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withApi(request, async (extras) => {
    await requirePermission(request, "systems.read", extras, {
      action: "read",
      entityType: "systems",
      entityId: null,
      entityLabel: null,
    });
    const url = new URL(request.url);
    const raw: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      raw[key] = value;
    });
    const parsed = listQuerySchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError("VALIDATION_ERROR", extras.requestId);
    }
    const archivedRaw = parsed.data.archived;
    const result = await listSystemRecords({
      q: parsed.data.q ?? null,
      type: parsed.data.type ?? null,
      criticality: parsed.data.criticality ?? null,
      status: parsed.data.status ?? null,
      processOwnerId: parsed.data.process_owner ?? null,
      site: parsed.data.site ?? null,
      includeArchived: archivedRaw === "1" || archivedRaw === "true",
      page: parsed.data.page ?? 1,
      pageSize: parsed.data.pageSize ?? 50,
      sort: parsed.data.sort ?? "code",
      order: parsed.data.order ?? "asc",
    });
    return jsonResult(200, { ...result, requestId: extras.requestId }, extras.requestId);
  });
}

export async function POST(request: Request): Promise<Response> {
  return withApi(request, async (extras) => {
    const auth = await requirePermission(request, "systems.create", extras, {
      action: "create",
      entityType: "systems",
      entityId: null,
      entityLabel: null,
    });
    const raw = await readJsonBody(request);
    if (raw === null) {
      throw new ApiError("VALIDATION_ERROR");
    }
    const created = await createSystemRecord(raw, auth.actor);
    return jsonResult(201, created, extras.requestId);
  });
}
