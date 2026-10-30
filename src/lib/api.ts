export type ApiFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
  requestId: string;
};

export type ApiSuccess<T> = {
  ok: true;
  status: number;
  data: T;
  requestId: string;
};

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

function requestIdFrom(response: Response, body: { requestId?: unknown } | null): string {
  const header = response.headers.get("x-request-id");
  if (header !== null && header.length > 0) {
    return header;
  }
  if (body !== null && typeof body.requestId === "string") {
    return body.requestId;
  }
  return "";
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const requestInit: RequestInit = {
    credentials: "include",
    ...init,
    headers,
  };
  let response: Response;
  try {
    response = await fetch(path, requestInit);
  } catch {
    return {
      ok: false,
      status: 0,
      code: "NETWORK",
      message: "Не удалось связаться с сервером",
      requestId: "",
    };
  }

  if (response.status === 204) {
    return { ok: true, status: 204, data: undefined as T, requestId: requestIdFrom(response, null) };
  }

  const text = await response.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    const record = parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    const code = typeof record["code"] === "string" ? record["code"] : "ERROR";
    const message =
      typeof record["message"] === "string" ? record["message"] : "Не удалось выполнить запрос";
    return {
      ok: false,
      status: response.status,
      code,
      message,
      requestId: requestIdFrom(response, record),
    };
  }

  return {
    ok: true,
    status: response.status,
    data: parsed as T,
    requestId: requestIdFrom(
      response,
      parsed !== null && typeof parsed === "object" ? (parsed as { requestId?: unknown }) : null,
    ),
  };
}
