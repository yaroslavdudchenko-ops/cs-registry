import { z } from "zod";

import { ApiError } from "@/server/http/errors";
import { withApi } from "@/server/http/handle";
import { readJsonBody } from "@/server/http/request";
import { jsonError, jsonResult, sessionCookie } from "@/server/http/response";
import { loginWithPassword } from "@/server/modules/auth/login";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(request: Request): Promise<Response> {
  return withApi(request, async (extras) => {
    const raw = await readJsonBody(request);
    if (raw === null) {
      return jsonError("VALIDATION_ERROR", extras.requestId);
    }
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError("VALIDATION_ERROR", extras.requestId);
    }
    try {
      const result = await loginWithPassword(parsed.data.username, parsed.data.password, extras);
      return jsonResult(
        200,
        { user: result.user, requestId: extras.requestId },
        extras.requestId,
        { "set-cookie": sessionCookie(result.token, result.maxAgeSeconds) },
      );
    } catch (error) {
      if (error instanceof ApiError) {
        return jsonError(error.code, extras.requestId, error.message);
      }
      throw error;
    }
  });
}
