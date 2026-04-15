// Qdrant HTTP client for the TooYeezy instance on :6333.
// One collection named `leads`. Each point is one lead the system has ever
// surfaced. Payload carries identity so we can filter by agent on search.

import { EMBED_DIMS } from "./embed";
import crypto from "node:crypto";

const QDRANT_URL = process.env.QDRANT_URL ?? "http://localhost:6333";
const COLLECTION = process.env.QDRANT_COLLECTION ?? "leads";
const TIMEOUT_MS = 10_000;

export type LeadPayload = {
  lead_id: number;
  agent_id: number;
  agent_slug: string;
  company: string;
  company_lower: string;
  date: string; // YYYY-MM-DD
  run_id: number;
};

export type QdrantMatch = {
  score: number;
  payload: LeadPayload;
};

async function q<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${QDRANT_URL}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function qdrantHealthy(): Promise<boolean> {
  const res = await q<{ status: string }>("/collections");
  return res !== null;
}

// Idempotent. Call on boot or before first upsert. Picks cosine distance —
// the default for text embeddings — and our fixed 768 dims from nomic.
export async function ensureCollection(): Promise<boolean> {
  const existing = await q<{ result?: { status?: string } }>(
    `/collections/${COLLECTION}`
  );
  if (existing?.result?.status) return true;

  const created = await q(`/collections/${COLLECTION}`, {
    method: "PUT",
    body: JSON.stringify({
      vectors: { size: EMBED_DIMS, distance: "Cosine" },
    }),
  });
  if (!created) return false;

  // Add payload indexes so filters on agent_id and date are fast.
  for (const field of ["agent_id", "date"]) {
    await q(`/collections/${COLLECTION}/index`, {
      method: "PUT",
      body: JSON.stringify({
        field_name: field,
        field_schema: field === "agent_id" ? "integer" : "keyword",
      }),
    });
  }
  return true;
}

export async function upsertLead(
  vector: number[],
  payload: LeadPayload
): Promise<boolean> {
  const id = pointIdFor(payload.agent_id, payload.lead_id);
  const res = await q(`/collections/${COLLECTION}/points?wait=true`, {
    method: "PUT",
    body: JSON.stringify({ points: [{ id, vector, payload }] }),
  });
  return res !== null;
}

// Find semantically similar leads owned by THIS agent. Cosine scores are
// higher = more similar.
export async function searchAgent(
  vector: number[],
  agentId: number,
  limit = 3
): Promise<QdrantMatch[]> {
  const res = await q<{ result?: { score: number; payload: LeadPayload }[] }>(
    `/collections/${COLLECTION}/points/search`,
    {
      method: "POST",
      body: JSON.stringify({
        vector,
        limit,
        with_payload: true,
        filter: {
          must: [{ key: "agent_id", match: { value: agentId } }],
        },
      }),
    }
  );
  return (res?.result ?? []).map((m) => ({ score: m.score, payload: m.payload }));
}

// Find semantically similar leads owned by any OTHER agent within the claim
// window. Used to catch cross-territory near-duplicates that the exact-string
// claims table misses.
export async function searchOtherAgents(
  vector: number[],
  agentId: number,
  sinceDate: string,
  limit = 3
): Promise<QdrantMatch[]> {
  const res = await q<{ result?: { score: number; payload: LeadPayload }[] }>(
    `/collections/${COLLECTION}/points/search`,
    {
      method: "POST",
      body: JSON.stringify({
        vector,
        limit,
        with_payload: true,
        filter: {
          must_not: [{ key: "agent_id", match: { value: agentId } }],
          must: [{ key: "date", range: { gte: sinceDate } }],
        },
      }),
    }
  );
  return (res?.result ?? []).map((m) => ({ score: m.score, payload: m.payload }));
}

// Deterministic integer point IDs so re-inserts overwrite rather than
// duplicating. Qdrant accepts unsigned ints; derive from agent+lead row.
export function pointIdFor(agentId: number, leadId: number): number {
  const h = crypto.createHash("sha1");
  h.update(`${agentId}:${leadId}`);
  // take the top 6 hex chars and clamp — stays under Number.MAX_SAFE_INTEGER.
  const hex = h.digest("hex").slice(0, 12);
  return parseInt(hex, 16);
}
