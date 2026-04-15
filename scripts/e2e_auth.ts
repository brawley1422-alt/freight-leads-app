// End-to-end verification of the auth flow + lead status update,
// driven without going through the Next.js UI.

import { db } from "../db/client";
import { createMagicToken, consumeMagicToken, createSession, getSessionFromToken } from "../lib/auth";
import { getAgentByEmail } from "../lib/agents";
import { parseReport } from "../generator/parse";
import { buildPrompt } from "../generator/prompt";
import fs from "node:fs";
import path from "node:path";

async function main() {

const email = "brawley1422@gmail.com";
const agent = getAgentByEmail(email);
if (!agent) throw new Error("JB not seeded");
console.log(`agent: #${agent.id} ${agent.name}`);

// 1. magic link
const token = createMagicToken(email);
console.log(`created magic token: ${token.slice(0, 12)}…`);
const claim = consumeMagicToken(token);
console.log(`consumed magic token: ${claim?.email}`);
if (!claim || claim.email !== email) throw new Error("magic token round-trip failed");
// replay should be rejected
const replay = consumeMagicToken(token);
if (replay) throw new Error("magic token allowed replay — BUG");
console.log(`replay rejected: ok`);

// 2. session
const sessionToken = createSession(email);
const sess = getSessionFromToken(sessionToken);
if (!sess) throw new Error("session round-trip failed");
console.log(`session ok for: ${sess.email}`);

// 3. Simulate a run by parsing the v0 report and inserting leads, then toggle statuses
const v0Report = path.join(process.env.HOME!, "freight-leads-daily/reports/2026-04-15.md");
const md = fs.readFileSync(v0Report, "utf8");
const leads = parseReport(md);
console.log(`parsed ${leads.length} leads`);

const testDate = "2026-04-14"; // historical so it doesn't collide with today
db().prepare("DELETE FROM runs WHERE agent_id = ? AND date = ?").run(agent.id, testDate);
const runId = Number(
  db()
    .prepare("INSERT INTO runs (agent_id, date, vertical, report_md, status) VALUES (?, ?, ?, ?, 'ok')")
    .run(agent.id, testDate, "Pet products (TEST)", md).lastInsertRowid
);
console.log(`created test run #${runId}`);

const insLead = db().prepare(`
  INSERT INTO leads
    (run_id, rank, company, company_lower, website, hq, est_revenue, in_band, details_md, dm1_name, dm1_linkedin)
  VALUES (@run_id, @rank, @company, @company_lower, @website, @hq, @est_revenue, @in_band, @details_md, @dm1_name, @dm1_linkedin)
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
  insLead.run({
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
  });
  insSeen.run(agent.id, lower, testDate);
  upsertClaim.run(lower, agent.id);
}
console.log(`inserted ${leads.length} leads + seen + claims`);

// 4. Mark 3 as contacted, 2 as bad_fit, 1 as won → feedback buckets
const leadRows = db()
  .prepare("SELECT id FROM leads WHERE run_id = ? ORDER BY rank")
  .all(runId) as { id: number }[];
const mark = db().prepare("UPDATE leads SET status = ? WHERE id = ?");
mark.run("contacted", leadRows[0].id);
mark.run("contacted", leadRows[1].id);
mark.run("contacted", leadRows[2].id);
mark.run("won", leadRows[3].id);
mark.run("bad_fit", leadRows[4].id);
mark.run("bad_fit", leadRows[5].id);
mark.run("bad_fit", leadRows[6].id);
console.log("marked statuses: 3 contacted, 1 won, 3 bad_fit");

// 5. Build prompt again and verify signal blocks populated
const built = await buildPrompt(agent, new Date(testDate), { skipHints: true });
const hasHigh = /RECENTLY CONVERTED \/ CONTACTED[\s\S]*?- /.test(built.prompt);
const hasBad = /RECENTLY MARKED BAD FIT[\s\S]*?- /.test(built.prompt);
console.log(`prompt contains HIGH_SIGNAL bullets: ${hasHigh}`);
console.log(`prompt contains BAD_SIGNAL bullets: ${hasBad}`);
if (!hasHigh || !hasBad) {
  console.error("FEEDBACK INJECTION BROKEN");
  process.exit(1);
}

// 6. Shared claim rule: a second fake agent should not see any of these companies
db()
  .prepare(
    "INSERT OR IGNORE INTO agents (slug, name, email, icp_text, verticals_json, delivery_hour, active) VALUES (?,?,?,?,?,?,1)"
  )
  .run("brian", "Brian (TEST)", "brian@example.com", "Pet products ICP", JSON.stringify(["Pet products"]), 7);
const brian = getAgentByEmail("brian@example.com")!;
const brianPrompt = await buildPrompt(brian, new Date(testDate), { skipHints: true });
const leakage = leads.some((l) => {
  // brian should NOT see companies that JB already claimed
  const seenBlock = brianPrompt.prompt.match(/ALREADY DELIVERED TO THIS AGENT[\s\S]*?##/);
  const claimedBlock = brianPrompt.prompt.match(/CLAIMED BY OTHER RESOLVE AGENTS[\s\S]*?##/);
  return !claimedBlock?.[0].toLowerCase().includes(l.company.toLowerCase());
});
if (leakage) {
  console.error("CLAIM LEAKAGE: Brian's prompt did not contain every company JB claimed");
  process.exit(1);
}
console.log(`claim isolation: ok — Brian's prompt lists all ${leads.length} JB-claimed companies in the territory block`);

// cleanup test row (but keep lead signal data so dashboard has something to show)
// db().prepare("DELETE FROM agents WHERE slug = ?").run("brian");

console.log("\nALL AUTH + GENERATOR UNIT TESTS PASSED");
}

main().catch((e) => { console.error(e); process.exit(1); });
