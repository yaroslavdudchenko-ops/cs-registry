import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE_NAME } from "@/server/config/env";

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api") || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }
  const hasSession = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isLogin = pathname === "/login";
  if ((hasSession === undefined || hasSession.length === 0) && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const callback = `${pathname}${request.nextUrl.search}`;
    if (callback !== "/" && callback !== "/login") {
      url.searchParams.set("callbackUrl", callback);
    }
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
