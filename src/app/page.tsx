import { redirect } from "next/navigation";

import { getPageAuth } from "@/server/auth/page-session";

export const dynamic = "force-dynamic";

export default async function HomePage(): Promise<never> {
  const user = await getPageAuth();
  if (user === null) {
    redirect("/login");
  }
  redirect("/systems");
}
