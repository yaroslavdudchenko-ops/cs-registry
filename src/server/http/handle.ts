import { ApiError } from "@/server/http/errors";
import { clientIp, clientUserAgent, requestIdFrom } from "@/server/http/request";
import { jsonError } from "@/server/http/response";

export type RequestExtras = {
  requestId: string;
  ip: string | null;
  userAgent: string | null;
};

export async function withApi(
  request: Request,
  fn: (extras: RequestExtras) => Promise<Response>,
): Promise<Response> {
  const extras: RequestExtras = {
    requestId: requestIdFrom(request),
    ip: clientIp(request),
    userAgent: clientUserAgent(request),
  };
  try {
    return await fn(extras);
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error.code, extras.requestId, error.message);
    }
    console.error(error);
    return jsonError("INTERNAL_ERROR", extras.requestId);
  }
}
