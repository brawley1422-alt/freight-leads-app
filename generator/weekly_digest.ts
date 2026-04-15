import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { db } from "../db/client";
import { listActiveAgents } from "../lib/agents";
import { leadStatusCountsForAgent } from "../lib/runs";

function pct(n: number, d: number) {
  if (!d) return "—";
  return `${Math.round((100 * n) / d)}%`;
}

function build(): string {
  const date = new Date().toISOString().slice(0, 10);
  const agents = listActiveAgents();

  const lines: string[] = [];
  lines.push(`# Resolve Lead Factory — Weekly Digest`);
  lines.push(``);
  lines.push(`**Week ending ${date}** · ${agents.length} active agents`);
  lines.push(``);
  lines.push(`## Per-agent activity`);
  lines.push(``);
  lines.push(`| Agent | Pending | Contacted | Bad fit | Won | Hit rate |`);
  lines.push(`|---|---:|---:|---:|---:|---:|`);

  let totals = { pending: 0, contacted: 0, bad_fit: 0, won: 0 };
  for (const a of agents) {
    const c = leadStatusCountsForAgent(a.id);
    totals.pending += c.pending;
    totals.contacted += c.contacted;
    totals.bad_fit += c.bad_fit;
    totals.won += c.won;
    const reviewed = c.contacted + c.bad_fit + c.won;
    lines.push(
      `| ${a.name} | ${c.pending} | ${c.contacted} | ${c.bad_fit} | ${c.won} | ${pct(c.contacted + c.won, reviewed)} |`
    );
  }
  const reviewedAll = totals.contacted + totals.bad_fit + totals.won;
  lines.push(
    `| **Total** | **${totals.pending}** | **${totals.contacted}** | **${totals.bad_fit}** | **${totals.won}** | **${pct(totals.contacted + totals.won, reviewedAll)}** |`
  );

  lines.push(``);
  lines.push(`## Top verticals this week`);
  const topVerticals = db()
    .prepare(
      `SELECT vertical, COUNT(*) AS n FROM runs
       WHERE date(created_at) >= date('now', '-7 days')
       GROUP BY vertical ORDER BY n DESC LIMIT 10`
    )
    .all() as { vertical: string; n: number }[];
  if (topVerticals.length === 0) {
    lines.push(`(no runs in the last 7 days)`);
  } else {
    for (const v of topVerticals) lines.push(`- ${v.vertical} · ${v.n} briefs`);
  }

  lines.push(``);
  lines.push(`## Dedup growth`);
  const seen = db().prepare("SELECT COUNT(*) AS n FROM seen").get() as { n: number };
  const claimed = db().prepare("SELECT COUNT(*) AS n FROM claims").get() as { n: number };
  lines.push(`- Per-agent seen entries: **${seen.n}**`);
  lines.push(`- Shared claim entries: **${claimed.n}**`);

  return lines.join("\n") + "\n";
}

function main() {
  const md = build();
  const out = path.join(os.tmpdir(), `rlf-weekly-${Date.now()}.md`);
  fs.writeFileSync(out, md);
  console.log(`digest written to ${out}`);
  console.log("---");
  console.log(md);

  if (process.argv.includes("--email")) {
    const emailDoc = path.join(process.env.HOME ?? "", "bin", "email-doc");
    if (!fs.existsSync(emailDoc)) {
      console.error("~/bin/email-doc missing; not emailing");
      return;
    }
    const to = process.env.ADMIN_EMAIL ?? "brawley1422@gmail.com";
    const res = spawnSync(
      emailDoc,
      [out, "--subject", `Resolve Lead Factory — Weekly Digest`, "--to", to],
      { encoding: "utf8", stdio: "inherit" }
    );
    if (res.status !== 0) {
      console.error("email-doc failed");
      process.exit(1);
    }
  }
}

main();
