import crypto from "node:crypto";
import { db } from "../db/client";
import { cookies } from "next/headers";
import { getAgentByEmail } from "./agents";

const MAGIC_TTL_MINUTES = 15;
const SESSION_TTL_DAYS = 30;
const COOKIE_NAME = "rlf_session";

export function createMagicToken(email: string): string {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + MAGIC_TTL_MINUTES * 60_000).toISOString();
  db()
    .prepare("INSERT INTO magic_tokens (token, email, expires_at) VALUES (?, ?, ?)")
    .run(token, email.toLowerCase(), expires);
  return token;
}

export function consumeMagicToken(token: string): { email: string } | null {
  const row = db()
    .prepare("SELECT * FROM magic_tokens WHERE token = ?")
    .get(token) as { email: string; expires_at: string; used: number } | undefined;
  if (!row) return null;
  if (row.used) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  db().prepare("UPDATE magic_tokens SET used = 1 WHERE token = ?").run(token);
  return { email: row.email };
}

export function createSession(email: string): string {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(
    Date.now() + SESSION_TTL_DAYS * 86_400_000
  ).toISOString();
  db()
    .prepare("INSERT INTO sessions (token, email, expires_at) VALUES (?, ?, ?)")
    .run(token, email.toLowerCase(), expires);
  return token;
}

export function getSessionFromToken(token: string): { email: string } | null {
  const row = db()
    .prepare("SELECT * FROM sessions WHERE token = ?")
    .get(token) as { email: string; expires_at: string } | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return { email: row.email };
}

export async function currentSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return getSessionFromToken(token);
}

export async function currentAgent() {
  const sess = await currentSession();
  if (!sess) return null;
  return getAgentByEmail(sess.email);
}

export function isAdminEmail(email: string): boolean {
  const admin = (process.env.ADMIN_EMAIL ?? "brawley1422@gmail.com").toLowerCase();
  return email.toLowerCase() === admin;
}

export const SESSION_COOKIE = COOKIE_NAME;
