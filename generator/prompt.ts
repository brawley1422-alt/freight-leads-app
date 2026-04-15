import fs from "node:fs";
import path from "node:path";
import { db } from "../db/client";
import type { Agent } from "../lib/types";
import { pickTodayVertical } from "../lib/agents";
import { buildHints } from "../lib/searxng";

const TEMPLATE_PATH = path.join(process.cwd(), "templates", "prompt_template.md");
const CLAIM_WINDOW_DAYS = 30;
const FEEDBACK_WINDOW_DAYS = 14;
const MIN_FEEDBACK_SIGNAL = 3;

export type PromptContext = {
  vertical: string;
  prompt: string;
  hintStats: { queryCount: number; totalResults: number };
};

export async function buildPrompt(
  agent: Agent,
  date: Date = new Date(),
  opts: { skipHints?: boolean } = {}
): Promise<PromptContext> {
  const vertical = pickTodayVertical(agent, date);
  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");

  const seenRows = db()
    .prepare("SELECT company_lower FROM seen WHERE agent_id = ? ORDER BY first_seen_date DESC")
    .all(agent.id) as { company_lower: string }[];
  const seenBlock = seenRows.length
    ? seenRows.map((r) => `- ${r.company_lower}`).join("\n")
    : "(none yet — this is the first run for this agent)";

  const cutoff = new Date(date.getTime() - CLAIM_WINDOW_DAYS * 86400000)
    .toISOString()
    .slice(0, 10);
  const claimRows = db()
    .prepare(
      `SELECT company_lower FROM claims
       WHERE agent_id <> ? AND date(claimed_at) >= date(?)`
    )
    .all(agent.id, cutoff) as { company_lower: string }[];
  const claimBlock = claimRows.length
    ? claimRows.map((r) => `- ${r.company_lower}`).join("\n")
    : "(none currently claimed by other agents)";

  const feedbackCutoff = new Date(date.getTime() - FEEDBACK_WINDOW_DAYS * 86400000)
    .toISOString()
    .slice(0, 10);
  const won = db()
    .prepare(
      `SELECT DISTINCT l.company FROM leads l
       JOIN runs r ON r.id = l.run_id
       WHERE r.agent_id = ? AND l.status IN ('contacted','won') AND date(r.date) >= date(?)`
    )
    .all(agent.id, feedbackCutoff) as { company: string }[];
  const bad = db()
    .prepare(
      `SELECT DISTINCT l.company FROM leads l
       JOIN runs r ON r.id = l.run_id
       WHERE r.agent_id = ? AND l.status = 'bad_fit' AND date(r.date) >= date(?)`
    )
    .all(agent.id, feedbackCutoff) as { company: string }[];

  const highBlock =
    won.length >= MIN_FEEDBACK_SIGNAL
      ? won.map((r) => `- ${r.company}`).join("\n")
      : "(not enough signal yet — ignore this section)";
  const badBlock =
    bad.length >= MIN_FEEDBACK_SIGNAL
      ? bad.map((r) => `- ${r.company}`).join("\n")
      : "(not enough signal yet — ignore this section)";

  const hints = opts.skipHints
    ? { block: "(pre-research skipped)", queryCount: 0, totalResults: 0 }
    : await buildHints(vertical);

  const prompt = template
    .replaceAll("{{ICP}}", agent.icp_text)
    .replaceAll("{{VERTICAL}}", vertical)
    .replaceAll("{{SEEN_LIST}}", seenBlock)
    .replaceAll("{{CLAIMED_LIST}}", claimBlock)
    .replaceAll("{{HIGH_SIGNAL}}", highBlock)
    .replaceAll("{{BAD_SIGNAL}}", badBlock)
    .replaceAll("{{SEARXNG_HINTS}}", hints.block);

  return {
    vertical,
    prompt,
    hintStats: { queryCount: hints.queryCount, totalResults: hints.totalResults },
  };
}
