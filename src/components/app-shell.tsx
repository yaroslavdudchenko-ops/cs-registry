"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useSession } from "@/components/session-provider";
import { apiRequest } from "@/lib/api";
import { canReadAudit, canReadUsers, roleLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; visible: boolean };

export function AppShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  const user = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const items: NavItem[] = [
    { href: "/systems", label: "Системы", visible: true },
    { href: "/audit", label: "Журнал аудита", visible: canReadAudit(user.role) },
    { href: "/users", label: "Пользователи", visible: canReadUsers(user.role) },
  ];

  async function onLogout(): Promise<void> {
    setLoggingOut(true);
    setLogoutError(null);
    const result = await apiRequest<undefined>("/api/v1/auth/logout", { method: "POST" });
    setLoggingOut(false);
    if (!result.ok) {
      setLogoutError("Не удалось выйти. Попробуйте ещё раз.");
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg font-semibold tracking-tight text-ink sm:text-xl">
              Реестр компьютеризированных систем
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted sm:text-base">
              <span className="font-medium text-ink">{user.full_name}</span>
              <span className="mx-2 text-line">·</span>
              {roleLabel(user.role)}
            </p>
            <Button variant="outline" size="sm" onClick={() => void onLogout()} disabled={loggingOut}>
              {loggingOut ? "Выход…" : "Выйти"}
            </Button>
          </div>
        </div>
        {logoutError !== null ? (
          <p className="border-t border-danger/20 bg-danger-soft px-4 py-2 text-sm text-danger" role="alert">
            {logoutError}
          </p>
        ) : null}
      </header>
      <div className="mx-auto flex max-w-7xl flex-col md:flex-row">
        <nav
          aria-label="Разделы"
          className="border-b border-line bg-surface md:w-56 md:shrink-0 md:border-b-0 md:border-r"
        >
          <ul className="flex gap-1 overflow-x-auto p-2 md:flex-col md:gap-0 md:p-4">
            {items
              .filter((item) => item.visible)
              .map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "block whitespace-nowrap rounded-md px-3 py-2 text-base",
                        active
                          ? "bg-accent-soft font-medium text-accent"
                          : "text-ink hover:bg-accent-soft/60",
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
          </ul>
        </nav>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
