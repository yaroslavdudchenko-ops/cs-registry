import { z } from "zod";

import { ApiError } from "@/server/http/errors";
import { withApi } from "@/server/http/handle";
import { readJsonBody } from "@/server/http/request";
import { jsonResult } from "@/server/http/response";
import { requirePermission } from "@/server/modules/auth/guard";
import { archiveSystemRecord } from "@/server/modules/systems/service";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  reason: z.string().optional(),
  version: z.number().int().optional(),
});

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return withApi(request, async (extras) => {
    const { id } = await context.params;
    const auth = await requirePermission(request, "systems.archive", extras, {
      action: "archive",
      entityType: "systems",
      entityId: id,
      entityLabel: null,
    });
    const raw = await readJsonBody(request);
    if (raw === null) {
      throw new ApiError("VALIDATION_ERROR");
    }
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      throw new ApiError("VALIDATION_ERROR");
    }
    const row = await archiveSystemRecord(id, parsed.data.reason, parsed.data.version, auth.actor);
    return jsonResult(200, row, extras.requestId);
  });
}
