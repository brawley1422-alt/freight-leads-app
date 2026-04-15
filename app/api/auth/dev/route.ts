import { NextRequest, NextResponse } from "next/server";
import { createSession, SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Dev-only bypass. Mints a session for ADMIN_EMAIL without any email round
// trip and redirects to /a/<slug>. Gated on ALLOW_DEV_LOGIN=1 so it cannot
// ever be reached in a real deployment unless someone deliberately flips the
// flag. Returns 404 when disabled.
export async function GET(req: NextRequest) {
  if (process.env.ALLOW_DEV_LOGIN !== "1") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const email = (process.env.ADMIN_EMAIL ?? "brawley1422@gmail.com").toLowerCase();
  const token = createSession(email);
  const { getAgentByEmail } = await import("@/lib/agents");
  const agent = getAgentByEmail(email);
  const dest = agent ? `/a/${agent.slug}` : "/admin";
  const res = NextResponse.redirect(new URL(dest, req.url));
  res.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}
