import { withApi } from "@/server/http/handle";
import { expiredSessionCookie, noContent } from "@/server/http/response";
import { requirePermission } from "@/server/modules/auth/guard";
import { logoutSession } from "@/server/modules/auth/login";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return withApi(request, async (extras) => {
    const auth = await requirePermission(request, "auth.logout", extras, {
      action: "logout",
      entityType: "auth",
      entityId: null,
      entityLabel: null,
    });
    await logoutSession(auth.sessionId, auth.actor);
    return noContent(extras.requestId, { "set-cookie": expiredSessionCookie() });
  });
}
