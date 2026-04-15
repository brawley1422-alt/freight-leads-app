import fs from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { currentSession, isAdminEmail } from "@/lib/auth";
import { getRunById } from "@/lib/runs";
import { db } from "@/db/client";
import type { Agent } from "@/lib/types";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const run = getRunById(Number(id));
  if (!run || !run.pdf_path) return NextResponse.json({ error: "not found" }, { status: 404 });
  const agent = db().prepare("SELECT * FROM agents WHERE id = ?").get(run.agent_id) as Agent | undefined;
  if (!agent) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (agent.email.toLowerCase() !== session.email.toLowerCase() && !isAdminEmail(session.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!fs.existsSync(run.pdf_path)) {
    return NextResponse.json({ error: "pdf missing on disk" }, { status: 404 });
  }
  const bytes = fs.readFileSync(run.pdf_path);
  return new NextResponse(bytes, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${agent.slug}-${run.date}.pdf"`,
    },
  });
}
