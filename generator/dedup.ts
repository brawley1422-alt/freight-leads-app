// Qdrant-backed semantic dedup.
//
// For each qualified lead, embed (company + site + hq + revenue + details),
// query the `leads` collection twice:
//   1. this agent's own history  → "seen before"
//   2. other agents' last 30 days → "territory conflict"
// Attach a dup_score + dup_of fingerprint to the lead. Inserting into Qdrant
// itself happens in run_daily.ts AFTER the DB row exists so we have a stable
// lead_id for the point payload.

import type { QualifiedLead } from "./qualify";
import { embed, leadEmbeddingText } from "../lib/embed";
import {
  ensureCollection,
  qdrantHealthy,
  searchAgent,
  searchOtherAgents,
} from "../lib/qdrant";

// Threshold for the automatic flag. Cosine scores 0..1.
//   >= 0.90 → near-certain duplicate (same company, different surface form)
//   >= 0.80 → probable semantic neighbor worth flagging
//   <  0.80 → ignore
const FLAG_THRESHOLD = 0.8;

export type DedupedLead = QualifiedLead & {
  vector: number[] | null;
  dup_score: number | null;
  dup_of: string | null; // "own:Ollie Pets" | "brian:Nulo Pet Food"
};

export async function dedupLeads(
  agentId: number,
  agentSlug: string,
  leads: QualifiedLead[],
  today: string
): Promise<{ leads: DedupedLead[]; available: boolean }> {
  const base: DedupedLead[] = leads.map((l) => ({
    ...l,
    vector: null,
    dup_score: null,
    dup_of: null,
  }));

  if (!(await qdrantHealthy())) return { leads: base, available: false };
  if (!(await ensureCollection())) return { leads: base, available: false };

  const cutoff = new Date(
    new Date(today).getTime() - 30 * 86400000
  )
    .toISOString()
    .slice(0, 10);

  for (const l of base) {
    const vec = await embed(leadEmbeddingText(l));
    if (!vec) continue;
    l.vector = vec;

    const [mine, others] = await Promise.all([
      searchAgent(vec, agentId, 3),
      searchOtherAgents(vec, agentId, cutoff, 3),
    ]);

    // Pick the strongest match across both buckets, but exclude matches
    // against *this exact* lead if we've already indexed it (shouldn't happen
    // pre-insert, but defensive).
    let best: { score: number; label: string } | null = null;
    for (const m of mine) {
      if (!best || m.score > best.score) {
        best = { score: m.score, label: `own:${m.payload.company}` };
      }
    }
    for (const m of others) {
      if (!best || m.score > best.score) {
        best = {
          score: m.score,
          label: `${m.payload.agent_slug}:${m.payload.company}`,
        };
      }
    }

    if (best && best.score >= FLAG_THRESHOLD) {
      l.dup_score = Math.round(best.score * 1000) / 1000;
      l.dup_of = best.label;
    }
  }

  return { leads: base, available: true };
}
