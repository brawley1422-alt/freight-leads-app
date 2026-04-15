"use client";
import { useState, useTransition } from "react";
import type { Lead } from "@/lib/types";

type Status = Lead["status"];

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
          <div className="font-sans text-xs uppercase tracking-wider text-dust">
            #{lead.rank} · {lead.est_revenue ?? "revenue unknown"} · {lead.in_band ?? ""}
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
