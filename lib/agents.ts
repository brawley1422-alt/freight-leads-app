import { db } from "@/db/client";
import type { Agent } from "./types";

export function listActiveAgents(): Agent[] {
  return db().prepare("SELECT * FROM agents WHERE active = 1 ORDER BY id").all() as Agent[];
}

export function getAgentBySlug(slug: string): Agent | null {
  return (db().prepare("SELECT * FROM agents WHERE slug = ?").get(slug) as Agent) ?? null;
}

export function getAgentByEmail(email: string): Agent | null {
  return (db().prepare("SELECT * FROM agents WHERE lower(email) = lower(?)").get(email) as Agent) ?? null;
}

export function verticalsFor(agent: Agent): string[] {
  try {
    const arr = JSON.parse(agent.verticals_json);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function pickTodayVertical(agent: Agent, date: Date = new Date()): string {
  const v = verticalsFor(agent);
  if (v.length === 0) return "General e-commerce";
  const start = new Date(date.getFullYear(), 0, 0);
  const doy = Math.floor((date.getTime() - start.getTime()) / 86400000);
  return v[doy % v.length];
}

export function updateAgent(slug: string, fields: Partial<Agent>) {
  const keys = Object.keys(fields).filter((k) => k !== "id" && k !== "created_at");
  if (keys.length === 0) return;
  const setSql = keys.map((k) => `${k} = @${k}`).join(", ");
  db().prepare(`UPDATE agents SET ${setSql} WHERE slug = @slug`).run({ ...fields, slug });
}

export function createAgent(a: Omit<Agent, "id" | "created_at">): number {
  const stmt = db().prepare(`
    INSERT INTO agents (slug, name, email, icp_text, verticals_json, delivery_hour, active)
    VALUES (@slug, @name, @email, @icp_text, @verticals_json, @delivery_hour, @active)
  `);
  const res = stmt.run(a);
  return Number(res.lastInsertRowid);
}
