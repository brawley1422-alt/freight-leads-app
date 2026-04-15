import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAgentBySlug } from "@/lib/agents";
import { listRunsForAgent, leadStatusCountsForAgent } from "@/lib/runs";
import { currentSession, isAdminEmail } from "@/lib/auth";
import { AgentHeader } from "@/app/a/[slug]/_components/header";
import { TodayCard } from "@/app/a/[slug]/_components/today-card";

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
  const todayDate = new Date().toISOString().slice(0, 10);
  const today = runs.find((r) => r.date === todayDate) ?? null;

  return (
    <main className="min-h-screen">
      <AgentHeader agent={agent} />

      <section className="max-w-5xl mx-auto px-6 pb-24">
        <div className="eyebrow mt-10">Today's brief</div>
        <TodayCard slug={agent.slug} initial={today} />

        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-0 border-t-2 border-ink">
          <Stat label="Pending" value={counts.pending} />
          <Stat label="Contacted" value={counts.contacted} />
          <Stat label="Bad fit" value={counts.bad_fit} />
          <Stat label="Won" value={counts.won} highlight />
        </div>

        <div className="eyebrow mt-16">History</div>
        <ul className="mt-3 rule pt-4 divide-y divide-sand">
          {runs.filter((r) => r.date !== todayDate).map((r) => (
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
          {runs.filter((r) => r.date !== todayDate).length === 0 && (
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
