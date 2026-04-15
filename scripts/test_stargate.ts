// End-to-end smoke test of the Mini Stargate integrations.
// 1. SearXNG hint build for a sample vertical
// 2. Ollama qualify pass against the 9 leads parsed from v0's 2026-04-15 report

import fs from "node:fs";
import path from "node:path";
import { buildHints } from "../lib/searxng";
import { parseReport } from "../generator/parse";
import { qualifyLeads } from "../generator/qualify";
import { getAgentByEmail } from "../lib/agents";
import { db } from "../db/client";

async function main() {
  db();

  console.log("== SearXNG ==");
  const t0 = Date.now();
  const hints = await buildHints("Pet products (food, accessories)");
  const t1 = Date.now();
  console.log(
    `  ${hints.queryCount} queries, ${hints.totalResults} raw results, ${t1 - t0}ms`
  );
  console.log(`  block length: ${hints.block.length} chars`);
  console.log(`  first 500 chars:\n${hints.block.slice(0, 500)}`);
  console.log();

  console.log("== Ollama qualify ==");
  const agent = getAgentByEmail("brawley1422@gmail.com");
  if (!agent) throw new Error("JB not seeded");

  const report = fs.readFileSync(
    path.join(process.env.HOME!, "freight-leads-daily/reports/2026-04-15.md"),
    "utf8"
  );
  const leads = parseReport(report);
  console.log(`  parsed ${leads.length} leads from v0 report`);

  const q0 = Date.now();
  const scored = await qualifyLeads(agent.icp_text, leads);
  const q1 = Date.now();
  console.log(`  qualified ${scored.length} leads in ${((q1 - q0) / 1000).toFixed(1)}s`);
  console.log();
  for (const l of scored) {
    const score = l.qual_score === null ? " ?? " : String(l.qual_score).padStart(3, " ");
    console.log(`  ${score}  ${l.company.padEnd(28)}  ${l.qual_flag ?? "(no flag)"}`);
  }

  const nulls = scored.filter((l) => l.qual_score === null).length;
  if (nulls === scored.length) {
    console.error("\nALL LEADS RETURNED NULL — Ollama not responding or JSON parse failed");
    process.exit(1);
  }
  console.log("\nSTARGATE SMOKE TEST PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
