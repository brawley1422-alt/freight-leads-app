"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Run } from "@/lib/types";

type Props = {
  slug: string;
  initial: Run | null;
};

type PollShape = {
  id: number;
  date: string;
  status: "pending" | "running" | "ok" | "error";
  vertical: string;
  error: string | null;
  lead_count: number;
  has_pdf: boolean;
};

export function TodayCard({ slug, initial }: Props) {
  const [run, setRun] = useState<Run | null>(initial);
  const [pending, startRequest] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  const isLive = run?.status === "pending" || run?.status === "running";

  // Poll status every 8s while the run is in flight. Refreshes the server
  // component tree via router.refresh() once it lands in a terminal state.
  useEffect(() => {
    if (!run || !isLive) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/runs/${run.id}/status`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as PollShape;
        if (cancelled) return;
        if (data.status !== run.status) {
          setRun({ ...run, status: data.status, error: data.error });
          if (data.status === "ok" || data.status === "error") {
            router.refresh();
          }
        }
      } catch {
        /* network hiccup — try again next tick */
      }
    };
    const timer = setInterval(tick, 8000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [run, isLive, router]);

  function kickOff() {
    setErr(null);
    startRequest(async () => {
      const res = await fetch(`/api/runs/generate/${slug}`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        run_id?: number;
        date?: string;
        error?: string;
      };
      if (res.status === 409) {
        setErr("A run is already in progress for today.");
        router.refresh();
        return;
      }
      if (!res.ok || !data.run_id) {
        setErr(data.error ?? `HTTP ${res.status}`);
        return;
      }
      // Optimistic: set a synthetic "pending" run so the UI flips immediately.
      setRun({
        id: data.run_id,
        agent_id: 0,
        date: data.date ?? new Date().toISOString().slice(0, 10),
        vertical: "",
        report_md: null,
        pdf_path: null,
        status: "pending",
        error: null,
        created_at: new Date().toISOString(),
      });
      router.refresh();
    });
  }

  return (
    <article className="mt-3 border-t-[3px] border-double border-blood pt-6">
      <div className="flex items-baseline justify-between flex-wrap gap-4">
        <div className="min-w-0 flex-1">
          {run ? (
            <>
              <div className="font-sans text-sm uppercase tracking-wider text-dust flex items-center gap-3 flex-wrap">
                <span>{run.date}</span>
                <StatusPill status={run.status} />
              </div>
              <h2 className="display text-4xl md:text-5xl font-black mt-1">
                {run.vertical || "Researching…"}
              </h2>
              {run.status === "error" && run.error && (
                <p className="mt-2 text-blood font-sans text-sm">{run.error}</p>
              )}
              {isLive && (
                <p className="mt-2 text-dust font-sans text-sm">
                  SearXNG → Claude → Ollama qualify → Qdrant dedup → PDF.
                  Typical runtime: ~18 minutes. This card refreshes automatically.
                </p>
              )}
            </>
          ) : (
            <>
              <div className="eyebrow">No brief yet today</div>
              <h2 className="display text-4xl md:text-5xl font-black mt-1">
                Hit the button.
              </h2>
              <p className="mt-2 text-dust font-sans text-sm">
                Click "Generate now" to kick off today's brief on demand. The
                scheduled run fires automatically at 00:30.
              </p>
            </>
          )}
        </div>
        <div className="flex gap-3 flex-wrap">
          {run && run.status === "ok" && (
            <Link
              href={`/a/${slug}/runs/${run.date}`}
              className="bg-ink text-cream px-5 py-3 font-sans font-semibold uppercase tracking-wider text-xs no-underline hover:bg-blood"
            >
              Open brief →
            </Link>
          )}
          {run && run.status === "ok" && run.pdf_path && (
            <a
              href={`/api/runs/${run.id}/pdf`}
              className="border-2 border-ink px-5 py-3 font-sans font-semibold uppercase tracking-wider text-xs no-underline text-ink hover:bg-ink hover:text-cream"
            >
              PDF
            </a>
          )}
          <button
            onClick={kickOff}
            disabled={pending || isLive}
            className="bg-blood text-cream px-5 py-3 font-sans font-semibold uppercase tracking-wider text-xs hover:bg-rust disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLive
              ? "Researching…"
              : pending
              ? "Starting…"
              : run?.status === "ok"
              ? "Regenerate"
              : "Generate now →"}
          </button>
        </div>
      </div>
      {err && <p className="mt-3 text-blood font-sans text-sm">{err}</p>}
    </article>
  );
}

function StatusPill({ status }: { status: Run["status"] }) {
  const map: Record<Run["status"], { label: string; cls: string }> = {
    pending: { label: "queued", cls: "border-dust text-dust" },
    running: { label: "running", cls: "border-rust text-rust animate-pulse" },
    ok: { label: "ready", cls: "border-blood text-blood" },
    error: { label: "error", cls: "border-blood bg-blood text-cream" },
  };
  const s = map[status];
  return (
    <span className={`inline-block border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${s.cls}`}>
      {s.label}
    </span>
  );
}
