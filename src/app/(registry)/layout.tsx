import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { SessionProvider } from "@/components/session-provider";
import { getPageAuth } from "@/server/auth/page-session";

export const dynamic = "force-dynamic";

export default async function RegistryLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.JSX.Element> {
  const user = await getPageAuth();
  if (user === null) {
    redirect("/login");
  }
  return (
    <SessionProvider user={user}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
