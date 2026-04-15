import { NextRequest, NextResponse } from "next/server";
import { currentSession, isAdminEmail } from "@/lib/auth";
import { getRunById } from "@/lib/runs";
import { db } from "@/db/client";
import type { Agent } from "@/lib/types";

export const dynamic = "force-dynamic";

// Lightweight polling endpoint. Returns {status, date, lead_count} so the
// dashboard can show a spinner and flip to "done" without a full page reload.
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const run = getRunById(Number(id));
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  const agent = db().prepare("SELECT * FROM agents WHERE id = ?").get(run.agent_id) as
    | Agent
    | undefined;
  if (!agent) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (agent.email.toLowerCase() !== session.email.toLowerCase() && !isAdminEmail(session.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const leadCount = (
    db().prepare("SELECT COUNT(*) AS n FROM leads WHERE run_id = ?").get(run.id) as {
      n: number;
    }
  ).n;
  return NextResponse.json({
    id: run.id,
    date: run.date,
    status: run.status,
    vertical: run.vertical,
    error: run.error,
    lead_count: leadCount,
    has_pdf: Boolean(run.pdf_path),
  });
}
