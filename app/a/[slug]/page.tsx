import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAgentBySlug } from "@/lib/agents";
import { listRunsForAgent, leadStatusCountsForAgent } from "@/lib/runs";
import { currentSession, isAdminEmail } from "@/lib/auth";
import { AgentHeader } from "@/app/a/[slug]/_components/header";

export const dynamic = "force-dynamic";

export default async function AgentDashboard({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await currentSession();
  if (!session) redirect("/login");
  const agent = getAgentBySlug(slug);
  if (!agent) notFound();
  if (agent.email.toLowerCase() !== session.email.toLowerCase() && !isAdminEmail(session.email)) {
    redirect("/login?error=Not+your+dashboard");
  }

  const runs = listRunsForAgent(agent.id, 30);
  const counts = leadStatusCountsForAgent(agent.id);
  const today = runs[0];

  return (
    <main className="min-h-screen">
      <AgentHeader agent={agent} />

      <section className="max-w-5xl mx-auto px-6 pb-24">
        <div className="eyebrow mt-10">Today's brief</div>
        {today ? (
          <article className="mt-3 border-t-[3px] border-double border-blood pt-6">
            <div className="flex items-baseline justify-between flex-wrap gap-4">
              <div>
                <div className="font-sans text-sm uppercase tracking-wider text-dust">
                  {today.date}
                </div>
                <h2 className="display text-4xl md:text-5xl font-black mt-1">
                  {today.vertical}
                </h2>
              </div>
              <div className="flex gap-3">
                <Link
                  href={`/a/${agent.slug}/runs/${today.date}`}
                  className="bg-ink text-cream px-5 py-3 font-sans font-semibold uppercase tracking-wider text-xs no-underline hover:bg-blood"
                >
                  Open brief →
                </Link>
                {today.pdf_path && (
                  <a
                    href={`/api/runs/${today.id}/pdf`}
                    className="border-2 border-ink px-5 py-3 font-sans font-semibold uppercase tracking-wider text-xs no-underline text-ink hover:bg-ink hover:text-cream"
                  >
                    PDF
                  </a>
                )}
              </div>
            </div>
            {today.status === "error" && (
              <p className="mt-3 text-blood font-sans text-sm">
                This run errored: {today.error}
              </p>
            )}
          </article>
        ) : (
          <p className="mt-4 text-dust">
            No brief yet. Your first one lands tomorrow at {agent.delivery_hour}:00.
          </p>
        )}

        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-0 border-t-2 border-ink">
          <Stat label="Pending" value={counts.pending} />
          <Stat label="Contacted" value={counts.contacted} />
          <Stat label="Bad fit" value={counts.bad_fit} />
          <Stat label="Won" value={counts.won} highlight />
        </div>

        <div className="eyebrow mt-16">History</div>
        <ul className="mt-3 rule pt-4 divide-y divide-sand">
          {runs.slice(1).map((r) => (
            <li key={r.id} className="py-4 flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="font-sans text-xs uppercase tracking-wider text-dust">
                  {r.date} · {r.status}
                </div>
                <div className="display text-xl font-bold mt-0.5">{r.vertical}</div>
              </div>
              <div className="flex gap-2">
                <Link
                  href={`/a/${agent.slug}/runs/${r.date}`}
                  className="font-sans text-xs uppercase tracking-wider no-underline border border-ink px-3 py-2 hover:bg-ink hover:text-cream"
                >
                  View
                </Link>
                {r.pdf_path && (
                  <a
                    href={`/api/runs/${r.id}/pdf`}
                    className="font-sans text-xs uppercase tracking-wider no-underline border border-ink px-3 py-2 hover:bg-ink hover:text-cream"
                  >
                    PDF
                  </a>
                )}
              </div>
            </li>
          ))}
          {runs.length <= 1 && (
            <li className="py-4 text-dust">No past briefs yet.</li>
          )}
        </ul>
      </section>
    </main>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`p-5 border-r border-ink last:border-r-0 ${highlight ? "bg-blood text-cream" : ""}`}>
      <div className="font-sans text-xs uppercase tracking-wider opacity-70">{label}</div>
      <div className="display text-4xl font-black mt-1">{value}</div>
    </div>
  );
}
