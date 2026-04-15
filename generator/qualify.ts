// Ollama-powered qualification pass. Runs AFTER Claude returns the report but
// BEFORE we insert leads into the DB. Each lead gets a 0-100 ICP fit score and
// a short flag string (e.g. "likely too small", "verified FTL shipper", etc).
//
// The pass is advisory — a low score does NOT remove a lead. It just surfaces
// warnings to JB in the dashboard. The point is catching Claude's bad days
// without adding another reasoning model to the critical path.

import type { ParsedLead } from "./parse";
import { chatJSON, ollamaHealthy } from "../lib/ollama";

export type QualifiedLead = ParsedLead & {
  qual_score: number | null;
  qual_flag: string | null;
};

type OllamaReply = {
  score?: number;
  flag?: string;
  reasoning?: string;
};

const SYSTEM = `You are a senior freight broker screening e-commerce shipper leads against an Ideal Customer Profile.

You evaluate ONE lead at a time and return STRICT JSON matching this schema:
{
  "score": integer from 0 to 100 (0 = clearly outside ICP, 100 = perfect fit),
  "flag":  short 3-8 word phrase summarizing your judgment (e.g. "solid FTL volume, verified revenue"),
  "reasoning": 1 short sentence citing specific evidence from the lead details
}

Scoring rubric:
- 80-100: explicit evidence of FTL volume + revenue squarely inside the ICP band
- 60-79:  revenue in band, FTL activity plausible but not explicit
- 40-59:  revenue or shipping profile uncertain, could go either way
- 20-39:  likely too small, too large, or primarily parcel/LTL
- 0-19:   clearly outside ICP (SaaS, F500, sub-scale DTC, etc.)

Never invent facts. If the lead details are sparse, score accordingly and say so in reasoning.
Return ONLY the JSON object — no prose, no code fences.`;

function buildUser(icp: string, lead: ParsedLead): string {
  return `## ICP
${icp}

## Lead
- Company: ${lead.company}
- Website: ${lead.website ?? "(unknown)"}
- HQ: ${lead.hq ?? "(unknown)"}
- Est. Revenue: ${lead.est_revenue ?? "(unknown)"}
- Claude's in-band flag: ${lead.in_band ?? "(unknown)"}

### Details
${lead.details_md ?? "(no details block)"}

Score this lead against the ICP now. Return JSON only.`;
}

export async function qualifyLeads(
  icp: string,
  leads: ParsedLead[]
): Promise<QualifiedLead[]> {
  if (leads.length === 0) return [];
  if (!(await ollamaHealthy())) {
    return leads.map((l) => ({ ...l, qual_score: null, qual_flag: null }));
  }

  const out: QualifiedLead[] = [];
  for (const lead of leads) {
    const reply = await chatJSON<OllamaReply>([
      { role: "system", content: SYSTEM },
      { role: "user", content: buildUser(icp, lead) },
    ]);

    let score: number | null = null;
    let flag: string | null = null;
    if (reply && typeof reply.score === "number") {
      score = Math.max(0, Math.min(100, Math.round(reply.score)));
      flag = typeof reply.flag === "string" ? reply.flag.slice(0, 80) : null;
    }
    out.push({ ...lead, qual_score: score, qual_flag: flag });
  }
  return out;
}
