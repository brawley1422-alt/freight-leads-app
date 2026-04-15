import { NextRequest, NextResponse } from "next/server";
import { consumeMagicToken, createSession, SESSION_COOKIE, isAdminEmail } from "@/lib/auth";
import { getAgentByEmail } from "@/lib/agents";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.redirect(new URL("/login?error=Missing+token", req.url));

  const claim = consumeMagicToken(token);
  if (!claim) {
    return NextResponse.redirect(new URL("/login?error=Link+expired+or+already+used", req.url));
  }

  const session = createSession(claim.email);
  const agent = getAgentByEmail(claim.email);
  const dest = agent ? `/a/${agent.slug}` : isAdminEmail(claim.email) ? "/admin" : "/login";

  const res = NextResponse.redirect(new URL(dest, req.url));
  res.cookies.set({
    name: SESSION_COOKIE,
    value: session,
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}
