import { db } from "../db/client";
import type { Run, Lead } from "./types";

export function listRunsForAgent(agentId: number, limit = 30): Run[] {
  return db()
    .prepare("SELECT * FROM runs WHERE agent_id = ? ORDER BY date DESC LIMIT ?")
    .all(agentId, limit) as Run[];
}

export function getRun(agentId: number, date: string): Run | null {
  return (
    (db()
      .prepare("SELECT * FROM runs WHERE agent_id = ? AND date = ?")
      .get(agentId, date) as Run) ?? null
  );
}

export function getRunById(id: number): Run | null {
  return (db().prepare("SELECT * FROM runs WHERE id = ?").get(id) as Run) ?? null;
}

export function leadsForRun(runId: number): Lead[] {
  return db()
    .prepare("SELECT * FROM leads WHERE run_id = ? ORDER BY rank")
    .all(runId) as Lead[];
}

export function getLead(id: number): Lead | null {
  return (db().prepare("SELECT * FROM leads WHERE id = ?").get(id) as Lead) ?? null;
}

export function setLeadStatus(id: number, status: Lead["status"]) {
  db().prepare("UPDATE leads SET status = ? WHERE id = ?").run(status, id);
}

export type LeadStatusCounts = {
  pending: number;
  contacted: number;
  bad_fit: number;
  won: number;
};

export function leadStatusCountsForAgent(agentId: number): LeadStatusCounts {
  const rows = db()
    .prepare(
      `SELECT l.status, COUNT(*) AS n
       FROM leads l JOIN runs r ON r.id = l.run_id
       WHERE r.agent_id = ?
       GROUP BY l.status`
    )
    .all(agentId) as { status: string; n: number }[];
  const out: LeadStatusCounts = { pending: 0, contacted: 0, bad_fit: 0, won: 0 };
  for (const r of rows) {
    if (r.status in out) (out as Record<string, number>)[r.status] = r.n;
  }
  return out;
}
