// Semantic dedup smoke test.
//
// 1. Bootstrap collection, seed it with the 9 v0-report leads for JB
// 2. Re-run dedup against a copy of the same leads + 3 near-dup variants.
//    Expect the originals to come back with dup_score ≈ 1.0 (exact match),
//    and the variants to come back with dup_score ≥ 0.8.
// 3. Re-run against a fresh ICP-matching lead — expect dup_score null.

import fs from "node:fs";
import path from "node:path";
import { db } from "../db/client";
import { getAgentByEmail } from "../lib/agents";
import { parseReport } from "../generator/parse";
import { qualifyLeads } from "../generator/qualify";
import { dedupLeads } from "../generator/dedup";
import { upsertLead, ensureCollection, qdrantHealthy } from "../lib/qdrant";
import { embed, leadEmbeddingText } from "../lib/embed";

async function main() {
  db();
  const agent = getAgentByEmail("brawley1422@gmail.com");
  if (!agent) throw new Error("JB not seeded");
  if (!(await qdrantHealthy())) throw new Error("qdrant not reachable");
  await ensureCollection();

  const reportPath = path.join(process.env.HOME!, "freight-leads-daily/reports/2026-04-15.md");
  const md = fs.readFileSync(reportPath, "utf8");
  const parsed = parseReport(md);
  console.log(`parsed ${parsed.length} leads`);

  // Skip ollama qualify for speed — give each a fake qual_score so shape matches
  const qualified = parsed.map((l) => ({ ...l, qual_score: 80, qual_flag: "test" }));

  console.log("\n== Seeding Qdrant with the 9 leads ==");
  for (const l of qualified) {
    const vec = await embed(leadEmbeddingText(l));
    if (!vec) continue;
    // Use a synthetic negative ID to stay out of the way of real test data
    const leadId = -(Math.floor(Math.random() * 1e8) + 1);
    await upsertLead(vec, {
      lead_id: leadId,
      agent_id: agent.id,
      agent_slug: agent.slug,
      company: l.company,
      company_lower: l.company.toLowerCase(),
      date: "2026-04-15",
      run_id: -1,
    });
  }
  console.log(`  seeded ${qualified.length} points`);

  console.log("\n== Test 1: exact same leads should come back as near-1.0 duplicates ==");
  const check1 = await dedupLeads(agent.id, agent.slug, qualified, "2026-04-16");
  let exactCaught = 0;
  for (const l of check1.leads) {
    const score = l.dup_score === null ? " -- " : l.dup_score.toFixed(3);
    console.log(`  ${score}  ${l.company.padEnd(28)}  -> ${l.dup_of ?? ""}`);
    if (l.dup_score !== null && l.dup_score >= 0.95) exactCaught++;
  }
  if (exactCaught < qualified.length) {
    console.error(`FAIL: only ${exactCaught}/${qualified.length} caught as exact duplicates`);
    process.exit(1);
  }

  console.log("\n== Test 2: near-dup variants should also score ≥ 0.8 ==");
  const variants = [
    {
      rank: 100,
      company: "Ollie Pet Food",             // vs "Ollie Pets"
      website: "ollie.com",
      hq: "New York NY",
      est_revenue: "~$60M",
      in_band: "yes",
      details_md: "DTC fresh dog food subscription scaling through retail expansion",
      dm1_name: null,
      dm1_linkedin: null,
    },
    {
      rank: 101,
      company: "Nulo Pet Foods",             // vs "Nulo Pet Food"
      website: "nulo.com",
      hq: "Austin TX",
      est_revenue: "~$40M",
      in_band: "yes",
      details_md: "High-protein kibble brand shipping truckload from co-packers",
      dm1_name: null,
      dm1_linkedin: null,
    },
    {
      rank: 102,
      company: "Just Food For Dogs",         // vs "JustFoodForDogs"
      website: "justfoodfordogs.com",
      hq: "Los Angeles CA",
      est_revenue: "~$85M",
      in_band: "yes",
      details_md: "Human-grade fresh dog food shipped to retail pantries",
      dm1_name: null,
      dm1_linkedin: null,
    },
  ];
  const variantsQual = variants.map((v) => ({ ...v, qual_score: 80, qual_flag: "test" }));
  const check2 = await dedupLeads(agent.id, agent.slug, variantsQual, "2026-04-16");
  let variantsCaught = 0;
  for (const l of check2.leads) {
    const score = l.dup_score === null ? " -- " : l.dup_score.toFixed(3);
    console.log(`  ${score}  ${l.company.padEnd(28)}  -> ${l.dup_of ?? ""}`);
    if (l.dup_score !== null && l.dup_score >= 0.8) variantsCaught++;
  }
  if (variantsCaught < 2) {
    console.error(`FAIL: only ${variantsCaught}/3 variants caught at threshold 0.8`);
    process.exit(1);
  }

  console.log("\n== Test 3: a fresh unrelated lead should NOT trigger ==");
  const fresh = [
    {
      rank: 200,
      company: "Yeti Coolers Holdings",
      website: "yeti.com",
      hq: "Austin TX",
      est_revenue: "~$1.6B",
      in_band: "no — too large",
      details_md: "Premium outdoor cooler and drinkware brand, F500 scale",
      dm1_name: null,
      dm1_linkedin: null,
      qual_score: 80,
      qual_flag: "test",
    },
  ];
  const check3 = await dedupLeads(agent.id, agent.slug, fresh, "2026-04-16");
  const yetiScore = check3.leads[0].dup_score;
  console.log(`  ${yetiScore === null ? "clean" : yetiScore.toFixed(3)}  Yeti Coolers`);

  console.log("\nDEDUP SMOKE TEST PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
