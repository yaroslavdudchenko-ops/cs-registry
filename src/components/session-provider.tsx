"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { SessionUser } from "@/lib/session-user";

const SessionContext = createContext<SessionUser | null>(null);

export function SessionProvider({
  user,
  children,
}: {
  user: SessionUser;
  children: ReactNode;
}): React.JSX.Element {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionUser {
  const value = useContext(SessionContext);
  if (value === null) {
    throw new Error("useSession used outside SessionProvider");
  }
  return value;
}
