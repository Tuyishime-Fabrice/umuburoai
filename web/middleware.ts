import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

const PROTECTED = [
  "/overview",
  "/map",
  "/forecast",
  "/data",
  "/upload",
  "/alerts",
  "/reports",
  "/report",
  "/settings",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  const isProtected = PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  if (isProtected && !hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname === "/login" && hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/overview";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/overview/:path*",
    "/map/:path*",
    "/forecast/:path*",
    "/data/:path*",
    "/upload/:path*",
    "/alerts/:path*",
    "/reports/:path*",
    "/report/:path*",
    "/report",
    "/settings/:path*",
    "/login",
  ],
};
