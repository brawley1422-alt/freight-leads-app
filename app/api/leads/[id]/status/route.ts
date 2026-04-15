import { NextRequest, NextResponse } from "next/server";
import { currentSession, isAdminEmail } from "@/lib/auth";
import { getLead, setLeadStatus, getRunById } from "@/lib/runs";
import { db } from "@/db/client";
import type { Agent } from "@/lib/types";

const VALID = new Set(["pending", "contacted", "bad_fit", "won"]);

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { status?: string };
  if (!body.status || !VALID.has(body.status)) {
    return NextResponse.json({ error: "bad status" }, { status: 400 });
  }
  const lead = getLead(Number(id));
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });
  const run = getRunById(lead.run_id);
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  const agent = db().prepare("SELECT * FROM agents WHERE id = ?").get(run.agent_id) as Agent | undefined;
  if (!agent) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (agent.email.toLowerCase() !== session.email.toLowerCase() && !isAdminEmail(session.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  setLeadStatus(lead.id, body.status as "pending");
  return NextResponse.json({ ok: true, status: body.status });
}
