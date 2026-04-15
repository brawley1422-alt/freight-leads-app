import fs from "node:fs";
import { db } from "../db/client";
import { listActiveAgents, getAgentBySlug } from "../lib/agents";
import type { Agent } from "../lib/types";
import { buildPrompt } from "./prompt";
import { runClaude, stripPreamble } from "./claude";
import { parseReport } from "./parse";
import { qualifyLeads } from "./qualify";
import { dedupLeads } from "./dedup";
import { upsertLead } from "../lib/qdrant";
import { paths, writeReport, renderPdf, emailPdf } from "./deliver";

type Flags = { agent?: string; noEmail: boolean; dryRun: boolean; date?: string };

function parseArgs(argv: string[]): Flags {
  const out: Flags = { noEmail: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--agent") out.agent = argv[++i];
    else if (a === "--no-email") out.noEmail = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--date") out.date = argv[++i];
  }
  return out;
}

function todayStr(date: Date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function log(line: string, file?: string) {
  const stamped = `[${new Date().toISOString()}] ${line}`;
  console.log(stamped);
  if (file) fs.appendFileSync(file, stamped + "\n");
}

async function runForAgent(agent: Agent, flags: Flags) {
  const date = flags.date ?? todayStr();
  const p = paths(agent.slug, date);
  fs.writeFileSync(p.log, ""); // reset

  log(`agent=${agent.slug} date=${date} starting`, p.log);

  const existing = db()
    .prepare("SELECT id FROM runs WHERE agent_id = ? AND date = ?")
    .get(agent.id, date) as { id: number } | undefined;
  if (existing && !flags.dryRun) {
    log(`  already has run #${existing.id} for today — skipping`, p.log);
    return;
  }

  const { vertical, prompt, hintStats } = await buildPrompt(agent, new Date(date));
  log(`  vertical: ${vertical}`, p.log);
  log(
    `  searxng hints: ${hintStats.totalResults} raw results across ${hintStats.queryCount} queries`,
    p.log
  );
  log(`  prompt chars: ${prompt.length}`, p.log);

  if (flags.dryRun) {
    const preview = prompt.slice(0, 400).replace(/\n/g, " ⏎ ");
    log(`  DRY RUN — would run claude -p. preview: ${preview}…`, p.log);
    return;
  }

  const runId = Number(
    db()
      .prepare(
        "INSERT INTO runs (agent_id, date, vertical, status) VALUES (?, ?, ?, 'running')"
      )
      .run(agent.id, date, vertical).lastInsertRowid
  );

  try {
    log(`  launching claude -p...`, p.log);
    const res = await runClaude(prompt);
    if (res.code !== 0 || !res.stdout.trim()) {
      throw new Error(`claude exited ${res.code}: ${res.stderr.slice(0, 500)}`);
    }
    const md = stripPreamble(res.stdout);
    writeReport(p.md, md);
    log(`  report: ${p.md} (${md.length} chars)`, p.log);

    const rawLeads = parseReport(md);
    log(`  parsed ${rawLeads.length} leads`, p.log);

    log(`  qualifying via ollama...`, p.log);
    const qualified = await qualifyLeads(agent.icp_text, rawLeads);
    const scored = qualified.filter((l) => l.qual_score !== null).length;
    const weak = qualified.filter(
      (l) => typeof l.qual_score === "number" && l.qual_score < 40
    ).length;
    log(`  qualified: ${scored}/${qualified.length} scored · ${weak} flagged weak`, p.log);

    log(`  semantic dedup via qdrant...`, p.log);
    const { leads, available: qdrantOn } = await dedupLeads(
      agent.id,
      agent.slug,
      qualified,
      date
    );
    const dupFlagged = leads.filter((l) => l.dup_score !== null).length;
    log(
      `  dedup: qdrant=${qdrantOn ? "on" : "off"} · ${dupFlagged} semantic duplicates flagged`,
      p.log
    );

    const insertedLeadIds: {
      id: number;
      vector: number[] | null;
      company: string;
      lower: string;
    }[] = [];

    const tx = db().transaction(() => {
      db()
        .prepare("UPDATE runs SET report_md = ?, status = 'ok' WHERE id = ?")
        .run(md, runId);
      const insLead = db().prepare(`
        INSERT INTO leads
          (run_id, rank, company, company_lower, website, hq, est_revenue, in_band, details_md, dm1_name, dm1_linkedin, qual_score, qual_flag, dup_score, dup_of)
        VALUES (@run_id, @rank, @company, @company_lower, @website, @hq, @est_revenue, @in_band, @details_md, @dm1_name, @dm1_linkedin, @qual_score, @qual_flag, @dup_score, @dup_of)
      `);
      const insSeen = db().prepare(
        "INSERT OR IGNORE INTO seen (agent_id, company_lower, first_seen_date) VALUES (?, ?, ?)"
      );
      const upsertClaim = db().prepare(`
        INSERT INTO claims (company_lower, agent_id, claimed_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(company_lower) DO NOTHING
      `);
      for (const l of leads) {
        const lower = l.company.toLowerCase();
        const res = insLead.run({
          run_id: runId,
          rank: l.rank,
          company: l.company,
          company_lower: lower,
          website: l.website,
          hq: l.hq,
          est_revenue: l.est_revenue,
          in_band: l.in_band,
          details_md: l.details_md,
          dm1_name: l.dm1_name,
          dm1_linkedin: l.dm1_linkedin,
          qual_score: l.qual_score,
          qual_flag: l.qual_flag,
          dup_score: l.dup_score,
          dup_of: l.dup_of,
        });
        insertedLeadIds.push({ id: Number(res.lastInsertRowid), vector: l.vector, company: l.company, lower });
        insSeen.run(agent.id, lower, date);
        upsertClaim.run(lower, agent.id);
      }
    });

    tx();

    // Index each new lead in Qdrant now that we have its row id. Failures are
    // non-fatal — dedup degrades to "off" on the next run but the DB is still
    // correct.
    if (qdrantOn) {
      for (const row of insertedLeadIds) {
        if (!row.vector) continue;
        await upsertLead(row.vector, {
          lead_id: row.id,
          agent_id: agent.id,
          agent_slug: agent.slug,
          company: row.company,
          company_lower: row.lower,
          date,
          run_id: runId,
        });
      }
      log(`  qdrant: upserted ${insertedLeadIds.filter((r) => r.vector).length} vectors`, p.log);
    }

    const pdf = renderPdf(p.md, p.pdf);
    log(`  pdf: ${pdf.ok ? "ok" : "FAIL"}`, p.log);
    if (pdf.log) fs.appendFileSync(p.log, pdf.log + "\n");

    if (pdf.ok) {
      db().prepare("UPDATE runs SET pdf_path = ? WHERE id = ?").run(p.pdf, runId);
    }

    if (!flags.noEmail && pdf.ok) {
      const subj = `Freight Leads — ${date} — ${vertical}`;
      const email = emailPdf(p.pdf, subj, agent.email);
      log(`  email: ${email.ok ? "sent" : "FAIL"}`, p.log);
      if (email.log) fs.appendFileSync(p.log, email.log + "\n");
    } else {
      log(`  email skipped`, p.log);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`  ERROR: ${msg}`, p.log);
    db()
      .prepare("UPDATE runs SET status = 'error', error = ? WHERE id = ?")
      .run(msg, runId);
  }
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));

  // Cron-safety guard: when PM2 kicks this off on start (which it always does
  // before the cron schedule takes over), the env var PM2_CRON_SCHEDULE will
  // be set. In that case we only actually run if we're inside the window —
  // otherwise we exit cleanly without burning a claude -p call.
  const cronWindow = process.env.PM2_CRON_SCHEDULE;
  if (cronWindow && !flags.agent && !flags.dryRun) {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const insideWindow = h === 0 && m >= 25 && m <= 59;
    if (!insideWindow) {
      console.log(
        `[${now.toISOString()}] outside cron window (${h}:${m.toString().padStart(2, "0")}); exiting without running`
      );
      process.exit(0);
    }
  }

  db();

  const agents = flags.agent
    ? ([getAgentBySlug(flags.agent)].filter(Boolean) as Agent[])
    : listActiveAgents();

  if (agents.length === 0) {
    console.error("no matching active agents");
    process.exit(1);
  }

  for (const a of agents) {
    await runForAgent(a, flags);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
