import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";
import { currentSession, isAdminEmail } from "@/lib/auth";
import { getAgentBySlug, pickTodayVertical } from "@/lib/agents";
import { db } from "@/db/client";

export const dynamic = "force-dynamic";

// POST /api/runs/generate/[slug]
//
// Kicks off an on-demand brief generation for the agent. We intentionally
// do NOT run the 18-minute job inside the request — Next.js would abort it
// long before Claude finishes. Instead:
//
//   1. Insert a runs row with status='pending' so the UI has something to
//      poll immediately.
//   2. Detach-spawn `tsx generator/run_daily.ts --run-id <id>`. The child
//      process picks up the row, marks it running, and does its work.
//   3. Return 202 + the new run_id so the client can redirect to /runs/<date>
//      and start polling for status.
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> }
) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { slug } = await ctx.params;
  const agent = getAgentBySlug(slug);
  if (!agent) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (agent.email.toLowerCase() !== session.email.toLowerCase() && !isAdminEmail(session.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const date = new Date().toISOString().slice(0, 10);

  // Concurrency guard — don't stack multiple running jobs for the same agent.
  // Stale rows (>10 min old with no movement) are treated as dead and
  // reclaimed rather than blocking new runs forever.
  const inflight = db()
    .prepare(
      `SELECT id, created_at FROM runs
       WHERE agent_id = ? AND date = ? AND status IN ('pending','running')`
    )
    .get(agent.id, date) as { id: number; created_at: string } | undefined;
  if (inflight) {
    const ageMs = Date.now() - new Date(inflight.created_at + " UTC").getTime();
    const stale = ageMs > 10 * 60 * 1000;
    if (!stale) {
      return NextResponse.json(
        { error: "already running", run_id: inflight.id },
        { status: 409 }
      );
    }
    // Reclaim — the previous subprocess is long gone.
    db()
      .prepare(
        "UPDATE runs SET status = 'error', error = 'reclaimed stale run' WHERE id = ?"
      )
      .run(inflight.id);
  }

  // If a completed run already exists for today, delete it so the day only
  // ever has one visible row. History still has yesterday and earlier.
  db().prepare("DELETE FROM runs WHERE agent_id = ? AND date = ?").run(agent.id, date);

  const vertical = pickTodayVertical(agent, new Date(date));
  const runId = Number(
    db()
      .prepare(
        "INSERT INTO runs (agent_id, date, vertical, status) VALUES (?, ?, ?, 'pending')"
      )
      .run(agent.id, date, vertical).lastInsertRowid
  );

  // Detach the subprocess so it outlives the request. stdio is discarded —
  // the generator already writes to logs/<slug>-<date>.log and updates the
  // runs row status itself.
  const cwd = process.cwd();
  const tsx = path.join(cwd, "node_modules", ".bin", "tsx");
  const child = spawn(
    tsx,
    ["generator/run_daily.ts", "--agent", agent.slug, "--run-id", String(runId), "--no-email"],
    {
      cwd,
      detached: true,
      stdio: "ignore",
      env: { ...process.env },
    }
  );
  child.unref();

  return NextResponse.json({ ok: true, run_id: runId, date }, { status: 202 });
}
