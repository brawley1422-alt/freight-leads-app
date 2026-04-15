# Resolve Lead Factory

Multi-agent version of `~/freight-leads-daily`. Every Resolve agent gets a personalized daily brief of 10 prospectable shipper leads — researched overnight by `claude -p`, filtered against a per-agent seen list and a shared claim list, rendered as an editorial PDF, and emailed at their configured hour.

## Architecture

- **Next.js 15** (App Router, server actions) serves the dashboard, settings, admin, and a few API routes.
- **SQLite** (`better-sqlite3`) holds agents, runs, leads, seen, claims, and magic-link sessions. File lives at `data/leads.db`.
- **Generator** is a TS script (`generator/run_daily.ts`) invoked by PM2 cron at 00:30 daily. It loops over active agents, shells to `claude -p --allowedTools WebSearch,WebFetch`, parses the markdown table into `leads`, renders a PDF via `render_pdf.py`, and emails it via `~/bin/email-doc`.
- **Auth** is magic-link over email (`~/bin/email-doc` is the sender). No passwords.
- **Deploy** is PM2 on TooYeezy, exposed via a Cloudflare tunnel.

```
freight-leads-app/
├── app/                  Next.js app router
│   ├── page.tsx              marketing landing
│   ├── login/page.tsx        magic-link form
│   ├── a/[slug]/             agent dashboard (today, history, settings, run detail)
│   ├── admin/                JB-only agent CRUD
│   └── api/                  auth, leads status, run PDF
├── db/
│   ├── schema.sql            all tables
│   └── client.ts             singleton; applies schema on boot
├── generator/
│   ├── run_daily.ts          main loop
│   ├── prompt.ts             builds per-agent prompt (ICP + vertical + seen + claims + feedback)
│   ├── claude.ts             spawn claude -p
│   ├── parse.ts              markdown → leads
│   ├── deliver.ts            write md, render PDF, email
│   └── weekly_digest.ts      Sunday digest
├── lib/
│   ├── agents.ts, auth.ts, runs.ts, types.ts, mailer.ts
├── templates/
│   └── prompt_template.md    {{ICP}} {{VERTICAL}} {{SEEN_LIST}} {{CLAIMED_LIST}} {{HIGH_SIGNAL}} {{BAD_SIGNAL}}
├── render_pdf.py             editorial HTML/CSS → PDF (WeasyPrint) — copied from v0
├── ecosystem.config.js       PM2 config (web + cron + digest)
└── scripts/
    ├── db_init.ts            init DB file
    ├── seed.ts               insert JB as agent #1
    └── test_parser.ts        verify parser against a real v0 report
```

## Setup

```bash
cd ~/freight-leads-app
npm install
cp .env.example .env.local         # edit if needed
npm run db:init
npm run db:seed                    # inserts JB from ~/freight-leads-daily/verticals.txt
npm run dev                        # http://localhost:3021
```

## Running a brief

```bash
# dry-run (builds prompt, shows preview, does NOT call claude)
npm run generate -- --agent jb --dry-run

# real run for JB, skip email
npm run generate -- --agent jb --no-email

# all active agents
npm run generate
```

## Deploy

```bash
npm run build
pm2 start ecosystem.config.js
pm2 save
pm2 startup            # follow the printed command, once
```

Then expose publicly with the `/tunnel` skill:
```
/tunnel 3021
```
Point your custom hostname (e.g. `leads.<domain>`) at the tunnel.

## Data model — at a glance

- `agents` — slug, email, `icp_text`, `verticals_json`, `delivery_hour`
- `runs` — one per (agent, date), with `report_md`, `pdf_path`, status
- `leads` — parsed from each run; status = pending|contacted|bad_fit|won
- `seen` — `(agent_id, company_lower)` — per-agent dedup, forever
- `claims` — `company_lower` → first agent to see it, 30-day soft expiration
- `magic_tokens`, `sessions` — auth

The per-agent `seen` list prevents repeat offers to the same agent. The cross-agent `claims` list prevents two agents receiving the same company within a 30-day window.

## Feedback loop

When an agent marks leads as `contacted` / `won` / `bad_fit`, those company names appear in the next run's prompt under `{{HIGH_SIGNAL}}` and `{{BAD_SIGNAL}}` blocks — but only once there are ≥3 entries in each bucket, so weak signal doesn't pollute research.

## Honest caveats

- `claude -p` is ~18 min per brief. 15 agents serial is ~4.5 hours — fine for a 00:30 start. At scale, parallelize 2–3 at a time.
- PM2 must run as the `tooyeezy` user so `claude` inherits JB's CLI auth. Validate with `pm2 logs freight-leads-cron` after first run.
- No contact-info verification layer yet — emails/LinkedIn come from search snippets, same as v0. Apollo/Hunter integration is flagged for v2.
- This is internal tooling for 15 known users. Magic-link auth with no rate limit is intentional — don't copy this shape for a public app.

## Verification checklist

1. `npm run generate -- --agent jb --dry-run` — prompt builds, vertical chosen, no claude call made.
2. `npm run dev` → open http://localhost:3021, request a magic link; in dev it's logged to `data/magic-links.log`.
3. Visit the verify URL → lands on `/a/jb`.
4. Click a lead's status button in a run detail page → `leads.status` updates, UI reflects it.
5. Add a second agent via `/admin`, set 3 verticals + distinct ICP, run generator — new agent's run excludes companies claimed by JB.
6. Mark ≥3 leads `won` → re-run with `--dry-run` and inspect that `{{HIGH_SIGNAL}}` block is populated.
7. `pm2 start ecosystem.config.js`, reboot TooYeezy, confirm `pm2 ls` shows both processes up.
