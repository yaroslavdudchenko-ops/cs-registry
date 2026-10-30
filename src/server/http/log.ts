/**
 * Прикладной лог отказов. Пишется в stdout одной строкой JSON, чтобы:
 * (1) по requestId можно было найти причину отказа;
 * (2) никакие значения полей и пароли не попадали в лог — только имена полей;
 * (3) формат читался человеком и обычными сборщиками логов.
 *
 * requestId, маршрут, код, имена полей — обязательно.
 * Значения полей и секреты сюда не передаются вызывающим кодом (контракт на уровне типов).
 */

export type RejectionLogInput = {
  requestId: string;
  route: string;
  method: string;
  status: number;
  code: string;
  fields?: readonly string[];
  message?: string;
};

export function logRejection(input: RejectionLogInput): void {
  const record = {
    kind: "rejection",
    time: new Date().toISOString(),
    requestId: input.requestId,
    route: input.route,
    method: input.method,
    status: input.status,
    code: input.code,
    fields: input.fields ?? [],
    message: input.message ?? "",
  };
  console.log(JSON.stringify(record));
}

export function routeFromRequest(request: Request): string {
  try {
    const u = new URL(request.url);
    return u.pathname;
  } catch {
    return "";
  }
}
