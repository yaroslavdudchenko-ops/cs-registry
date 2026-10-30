import packageJson from "../../../../package.json";

import { appVersion } from "@/server/config/env";
import { pingDatabase } from "@/server/db/client";

export const dynamic = "force-dynamic";

const packageVersion: string = packageJson.version;

export async function GET(): Promise<Response> {
  const databaseUp = await pingDatabase();
  const version = appVersion() || packageVersion;
  const body = {
    status: databaseUp ? "ok" : "degraded",
    version,
    database: databaseUp ? "up" : "down",
  };

  return Response.json(body, {
    status: databaseUp ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
