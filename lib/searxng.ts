// SearXNG client — queries the self-hosted instance on TooYeezy (:8888).
// Used as a pre-fetch layer so Claude doesn't burn 40-60 WebSearch turns
// discovering companies it could've seen in a bulk SearXNG query first.

const SEARXNG_URL = process.env.SEARXNG_URL ?? "http://localhost:8888";
const SEARXNG_TIMEOUT_MS = 8000;
const PER_QUERY_RESULTS = 8;

export type SearxResult = {
  title: string;
  url: string;
  content: string;
  engine?: string;
};

async function search(query: string): Promise<SearxResult[]> {
  const u = new URL("/search", SEARXNG_URL);
  u.searchParams.set("q", query);
  u.searchParams.set("format", "json");
  u.searchParams.set("safesearch", "0");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SEARXNG_TIMEOUT_MS);
  try {
    const res = await fetch(u, { signal: ctrl.signal });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: SearxResult[] };
    return (data.results ?? []).slice(0, PER_QUERY_RESULTS);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function queriesFor(vertical: string): string[] {
  const v = vertical.replace(/\([^)]*\)/g, "").trim();
  return [
    `mid-market ${v} brands $50M revenue truckload`,
    `Growjo ${v} 50M revenue companies`,
    `Inc 5000 ${v} brands shipping`,
    `${v} brand director of logistics site:linkedin.com`,
    `${v} brand VP supply chain site:linkedin.com`,
    `${v} brand warehouse Amazon Vendor Central`,
  ];
}

export type SearxHints = {
  block: string;        // markdown block to inject into the prompt
  totalResults: number; // for logging
  queryCount: number;
};

export async function buildHints(vertical: string): Promise<SearxHints> {
  const queries = queriesFor(vertical);
  const all = await Promise.all(queries.map(search));

  // Deduplicate by hostname — SearXNG often returns the same article from
  // multiple engines. One row per unique domain keeps the block compact.
  const seen = new Set<string>();
  const lines: string[] = [];
  let totalResults = 0;

  for (let i = 0; i < queries.length; i++) {
    const results = all[i];
    totalResults += results.length;
    const kept: SearxResult[] = [];
    for (const r of results) {
      try {
        const host = new URL(r.url).hostname.replace(/^www\./, "");
        if (seen.has(host)) continue;
        seen.add(host);
        kept.push(r);
      } catch {
        /* skip malformed url */
      }
      if (kept.length >= 5) break;
    }
    if (kept.length === 0) continue;
    lines.push(`**Query:** \`${queries[i]}\``);
    for (const r of kept) {
      const snippet = (r.content ?? "").replace(/\s+/g, " ").slice(0, 220);
      lines.push(`- [${r.title.slice(0, 90)}](${r.url})`);
      if (snippet) lines.push(`  > ${snippet}`);
    }
    lines.push("");
  }

  const block =
    lines.length === 0
      ? "(SearXNG returned no usable results — proceed with your own WebSearch only)"
      : lines.join("\n").trim();

  return { block, totalResults, queryCount: queries.length };
}
