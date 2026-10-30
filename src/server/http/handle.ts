import { ApiError, ERROR_HTTP_STATUS } from "@/server/http/errors";
import { logRejection, routeFromRequest } from "@/server/http/log";
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
    const response = await fn(extras);
    if (response.status >= 400) {
      logRejection({
        requestId: extras.requestId,
        route: routeFromRequest(request),
        method: request.method,
        status: response.status,
        code: response.headers.get("x-rejection-code") ?? "",
        fields: parseFieldsHeader(response.headers.get("x-rejection-fields")),
      });
    }
    return response;
  } catch (error) {
    if (error instanceof ApiError) {
      const status = ERROR_HTTP_STATUS[error.code];
      logRejection({
        requestId: extras.requestId,
        route: routeFromRequest(request),
        method: request.method,
        status,
        code: error.code,
        fields: error.fields.map((f) => f.field),
        message: error.message,
      });
      return jsonError(error.code, extras.requestId, error.message, error.fields);
    }
    console.error(error);
    logRejection({
      requestId: extras.requestId,
      route: routeFromRequest(request),
      method: request.method,
      status: 500,
      code: "INTERNAL_ERROR",
    });
    return jsonError("INTERNAL_ERROR", extras.requestId);
  }
}

function parseFieldsHeader(value: string | null): readonly string[] {
  if (value === null || value.length === 0) return [];
  return value.split(",").map((v) => v.trim()).filter((v) => v.length > 0);
}
