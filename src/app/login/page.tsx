import { Suspense } from "react";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { getPageAuth } from "@/server/auth/page-session";

export const dynamic = "force-dynamic";

export default async function LoginPage(): Promise<React.JSX.Element> {
  const user = await getPageAuth();
  if (user !== null) {
    redirect("/systems");
  }
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Вход в реестр</h1>
        <p className="mt-2 text-muted">
          Реестр компьютеризированных систем. Войдите с персональной учётной записью.
        </p>
        <div className="mt-8">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
