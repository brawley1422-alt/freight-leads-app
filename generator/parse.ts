// Parse a lead report markdown into structured lead rows.
// Mirrors freight-leads-daily/daily_leads.sh lines 93-117, extended to pull
// website, HQ, revenue, in-band flag, plus a per-lead details paragraph and
// a first LinkedIn URL when present.

export type ParsedLead = {
  rank: number;
  company: string;
  website: string | null;
  hq: string | null;
  est_revenue: string | null;
  in_band: string | null;
  details_md: string | null;
  dm1_name: string | null;
  dm1_linkedin: string | null;
};

const ROW_RE = /^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|/;

export function parseReport(md: string): ParsedLead[] {
  const lines = md.split("\n");
  const leads: ParsedLead[] = [];

  for (const line of lines) {
    const m = line.match(ROW_RE);
    if (!m) continue;
    if (/^#+/.test(m[2])) continue; // header row guard
    const rank = Number(m[1]);
    if (!Number.isFinite(rank)) continue;
    let company = m[2].trim().replace(/\*+$/, "").trim();
    company = company.split(/\s+—\s+/)[0].trim();
    if (!company || /company/i.test(company) === false && company === "Company") continue;
    leads.push({
      rank,
      company,
      website: clean(m[3]) || null,
      hq: clean(m[4]) || null,
      est_revenue: clean(m[5]) || null,
      in_band: clean(m[6]) || null,
      details_md: null,
      dm1_name: null,
      dm1_linkedin: null,
    });
  }

  // Try to pull per-company detail blocks from the "## Details" section.
  const detailsStart = lines.findIndex((l) => /^##\s+Details/i.test(l));
  if (detailsStart >= 0) {
    const rest = lines.slice(detailsStart + 1).join("\n");
    for (const lead of leads) {
      const block = extractBlock(rest, lead.company);
      if (block) {
        lead.details_md = block.trim();
        const li = block.match(/https?:\/\/[^\s)>\]]*linkedin\.com\/in\/[^\s)>\]]+/i);
        if (li) lead.dm1_linkedin = li[0];
        const dm = block.match(/(?:VP|Director|Head|Chief|Manager)[^\n—-]{0,80}/i);
        if (dm) lead.dm1_name = dm[0].trim();
      }
    }
  }

  return leads;
}

function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function extractBlock(rest: string, company: string): string | null {
  // Find a heading or bold mention of the company, then grab until the next
  // heading or blank line run.
  const safe = company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const idx = rest.search(new RegExp(`(^|\\n)#+\\s*[\\d.]*\\s*${safe}|\\*\\*${safe}\\*\\*`, "i"));
  if (idx < 0) return null;
  const after = rest.slice(idx);
  const next = after.search(/\n#{1,3}\s+(?!.*(?:site:|ship))/);
  return next > 0 ? after.slice(0, next) : after.slice(0, 1200);
}
