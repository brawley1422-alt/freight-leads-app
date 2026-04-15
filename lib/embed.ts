// Thin wrapper around Ollama's embedding endpoint. Uses nomic-embed-text by
// default — 768-dim, fast, runs on CPU fine, and it's already pulled on TooYeezy.

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text";
const TIMEOUT_MS = 20_000;

export const EMBED_DIMS = 768;

export async function embed(text: string): Promise<number[] | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { embedding?: number[] };
    if (!data.embedding || data.embedding.length !== EMBED_DIMS) return null;
    return data.embedding;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// What we actually embed for a lead. Joins the company name with the thinking
// signal you'd find on a company's About page: website, HQ, revenue bracket,
// and any details Claude wrote. The mix is deliberately redundant so typos and
// name variants ("Ollie Pets" vs "Ollie Pet Food") still land nearby.
export function leadEmbeddingText(lead: {
  company: string;
  website: string | null;
  hq: string | null;
  est_revenue: string | null;
  details_md: string | null;
}): string {
  const parts = [
    lead.company,
    lead.company.toLowerCase(),
    lead.website ?? "",
    lead.hq ?? "",
    lead.est_revenue ?? "",
    (lead.details_md ?? "").slice(0, 1200),
  ];
  return parts.filter(Boolean).join("\n").slice(0, 3000);
}
