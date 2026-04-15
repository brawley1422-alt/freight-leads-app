import { notFound, redirect } from "next/navigation";
import { getAgentBySlug } from "@/lib/agents";
import { getRun, leadsForRun } from "@/lib/runs";
import { currentSession, isAdminEmail } from "@/lib/auth";
import { AgentHeader } from "@/app/a/[slug]/_components/header";
import { LeadRow } from "./_lead-row";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ slug: string; date: string }>;
}) {
  const { slug, date } = await params;
  const session = await currentSession();
  if (!session) redirect("/login");
  const agent = getAgentBySlug(slug);
  if (!agent) notFound();
  if (agent.email.toLowerCase() !== session.email.toLowerCase() && !isAdminEmail(session.email)) {
    redirect("/login?error=Not+your+dashboard");
  }

  const run = getRun(agent.id, date);
  if (!run) notFound();
  const leads = leadsForRun(run.id);

  return (
    <main className="min-h-screen">
      <AgentHeader agent={agent} />
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <div className="eyebrow mt-10">{run.date}</div>
        <h2 className="display text-5xl font-black mt-2">{run.vertical}</h2>
        <div className="mt-2 font-sans text-sm uppercase tracking-wider text-dust">
          status: {run.status} · {leads.length} leads
        </div>

        <div className="mt-12 rule-blood pt-6">
          <div className="eyebrow">Leads</div>
          <ul className="mt-3 divide-y-2 divide-sand">
            {leads.map((l) => (
              <LeadRow key={l.id} lead={l} />
            ))}
            {leads.length === 0 && (
              <li className="py-6 text-dust">No leads parsed for this run.</li>
            )}
          </ul>
        </div>

        {run.report_md && (
          <details className="mt-16">
            <summary className="font-sans uppercase tracking-wider text-xs cursor-pointer text-rust">
              Full report markdown
            </summary>
            <pre className="mt-4 p-6 bg-sand/40 font-mono text-xs overflow-x-auto whitespace-pre-wrap">
              {run.report_md}
            </pre>
          </details>
        )}
      </section>
    </main>
  );
}
