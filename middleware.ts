import { NextRequest, NextResponse } from "next/server";

// Lightweight gate. Full session validation happens in the page/route via
// currentSession() which hits SQLite. This middleware just bounces users
// with no cookie at all.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const protectedPath =
    pathname.startsWith("/a/") || pathname === "/admin" || pathname.startsWith("/admin/");
  if (!protectedPath) return NextResponse.next();
  const token = req.cookies.get("rlf_session")?.value;
  if (!token) {
    const url = new URL("/login", req.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/a/:path*", "/admin/:path*", "/admin"],
};
