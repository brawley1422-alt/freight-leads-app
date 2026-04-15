// Thin Ollama chat client. Talks to the local instance on TooYeezy.
// We use JSON mode (format: "json") so the qualifier can reliably parse the reply.

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const DEFAULT_MODEL = process.env.OLLAMA_MODEL ?? "qwen3:8b-q4_K_M";
const TIMEOUT_MS = 60_000;

export type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

export async function chatJSON<T = unknown>(
  messages: ChatMsg[],
  opts: { model?: string; temperature?: number } = {}
): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: opts.model ?? DEFAULT_MODEL,
        messages,
        format: "json",
        stream: false,
        options: { temperature: opts.temperature ?? 0.2 },
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { message?: { content?: string } };
    const content = data.message?.content;
    if (!content) return null;
    try {
      return JSON.parse(content) as T;
    } catch {
      // qwen sometimes wraps JSON in code fences or thinks out loud — try to salvage
      const m = content.match(/\{[\s\S]*\}/);
      if (!m) return null;
      try {
        return JSON.parse(m[0]) as T;
      } catch {
        return null;
      }
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function ollamaHealthy(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}
