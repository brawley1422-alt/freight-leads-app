"use client";
import { useState, useTransition } from "react";
import type { Lead } from "@/lib/types";

type Status = Lead["status"];

function QualBadge({ lead }: { lead: Lead }) {
  const s = lead.qual_score ?? 0;
  const tone =
    s >= 80
      ? "bg-blood text-cream border-blood"
      : s >= 60
      ? "border-rust text-rust"
      : s >= 40
      ? "border-dust text-dust"
      : "border-ink text-ink bg-sand/50";
  return (
    <span
      className={`inline-flex items-center gap-1 border px-2 py-0.5 normal-case tracking-normal ${tone}`}
      title={lead.qual_flag ?? "Ollama qual score"}
    >
      <span className="font-mono font-bold">{s}</span>
      {lead.qual_flag && <span className="text-[10px]">{lead.qual_flag}</span>}
    </span>
  );
}

function DupBadge({ lead }: { lead: Lead }) {
  const s = lead.dup_score ?? 0;
  const tone =
    s >= 0.9
      ? "bg-ink text-cream border-ink"
      : s >= 0.85
      ? "border-ink text-ink"
      : "border-dust text-dust";
  return (
    <span
      className={`inline-flex items-center gap-1 border px-2 py-0.5 normal-case tracking-normal ${tone}`}
      title={`Semantic match: ${lead.dup_of ?? "unknown"}`}
    >
      <span className="font-mono font-bold">dup {Math.round(s * 100)}</span>
      {lead.dup_of && <span className="text-[10px]">{lead.dup_of}</span>}
    </span>
  );
}

const OPTS: { key: Status; label: string; className: string }[] = [
  { key: "pending", label: "Pending", className: "border-dust text-dust" },
  { key: "contacted", label: "Contacted", className: "border-rust text-rust" },
  { key: "bad_fit", label: "Bad fit", className: "border-ink text-ink" },
  { key: "won", label: "Won", className: "border-blood text-cream bg-blood" },
];

export function LeadRow({ lead }: { lead: Lead }) {
  const [status, setStatus] = useState<Status>(lead.status);
  const [pending, start] = useTransition();

  function change(next: Status) {
    setStatus(next);
    start(async () => {
      const res = await fetch(`/api/leads/${lead.id}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) setStatus(lead.status);
    });
  }

  return (
    <li className="py-6">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="font-sans text-xs uppercase tracking-wider text-dust flex items-center gap-2 flex-wrap">
            <span>#{lead.rank}</span>
            <span>·</span>
            <span>{lead.est_revenue ?? "revenue unknown"}</span>
            {lead.in_band && (
              <>
                <span>·</span>
                <span>{lead.in_band}</span>
              </>
            )}
            {typeof lead.qual_score === "number" && <QualBadge lead={lead} />}
            {typeof lead.dup_score === "number" && <DupBadge lead={lead} />}
          </div>
          <h3 className="display text-2xl font-bold mt-0.5">{lead.company}</h3>
          <div className="mt-1 font-sans text-sm">
            {lead.website && (
              <a href={`https://${lead.website.replace(/^https?:\/\//, "")}`} target="_blank">
                {lead.website}
              </a>
            )}
            {lead.hq && <span className="text-dust"> · {lead.hq}</span>}
          </div>
          {lead.dm1_name && (
            <div className="mt-1 font-sans text-sm">
              {lead.dm1_name}
              {lead.dm1_linkedin && (
                <>
                  {" — "}
                  <a href={lead.dm1_linkedin} target="_blank">
                    LinkedIn
                  </a>
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {OPTS.map((o) => (
            <button
              key={o.key}
              disabled={pending}
              onClick={() => change(o.key)}
              className={`font-sans text-[11px] uppercase tracking-wider border-2 px-3 py-1.5 transition ${
                status === o.key ? o.className : "border-sand text-dust hover:border-ink hover:text-ink"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </li>
  );
}
