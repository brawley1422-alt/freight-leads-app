import { redirect } from "next/navigation";
import Link from "next/link";
import { currentSession, isAdminEmail } from "@/lib/auth";
import { db } from "@/db/client";
import { createAgent, updateAgent } from "@/lib/agents";
import type { Agent } from "@/lib/types";

export const dynamic = "force-dynamic";

async function addAgent(formData: FormData) {
  "use server";
  const { currentSession, isAdminEmail } = await import("@/lib/auth");
  const session = await currentSession();
  if (!session || !isAdminEmail(session.email)) return;
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const icp_text = String(formData.get("icp_text") ?? "").trim();
  if (!slug || !name || !email) return;
  const { createAgent } = await import("@/lib/agents");
  createAgent({
    slug,
    name,
    email,
    icp_text: icp_text || "(not set yet — edit in settings)",
    verticals_json: JSON.stringify([
      "Home goods and houseware",
      "Pet products",
      "Food and snacks (CPG)",
    ]),
    delivery_hour: 7,
    active: 1,
  });
  redirect("/admin?saved=1");
}

async function toggleActive(id: number) {
  "use server";
  const { currentSession, isAdminEmail } = await import("@/lib/auth");
  const session = await currentSession();
  if (!session || !isAdminEmail(session.email)) return;
  const { db } = await import("@/db/client");
  db().prepare("UPDATE agents SET active = 1 - active WHERE id = ?").run(id);
  redirect("/admin");
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const session = await currentSession();
  if (!session) redirect("/login");
  if (!isAdminEmail(session.email)) redirect("/login?error=Admin+only");

  const agents = db().prepare("SELECT * FROM agents ORDER BY id").all() as Agent[];
  const sp = await searchParams;

  return (
    <main className="min-h-screen">
      <header className="border-b-2 border-ink">
        <div className="max-w-5xl mx-auto px-6 py-5">
          <div className="eyebrow">Resolve Lead Factory · Admin</div>
          <h1 className="display text-3xl font-black mt-0.5">Agents</h1>
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-6 py-12">
        {sp?.saved && (
          <p className="mb-6 text-rust font-sans text-sm">Agent added.</p>
        )}

        <div className="rule-blood pt-6">
          <ul className="divide-y-2 divide-sand">
            {agents.map((a) => (
              <li key={a.id} className="py-5 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="eyebrow">{a.active ? "Active" : "Paused"}</div>
                  <div className="display text-2xl font-bold mt-0.5">{a.name}</div>
                  <div className="font-sans text-sm text-dust">
                    {a.email} · /a/{a.slug} · delivery {a.delivery_hour}:00
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/a/${a.slug}`}
                    className="border border-ink px-3 py-2 font-sans text-xs uppercase tracking-wider no-underline text-ink hover:bg-ink hover:text-cream"
                  >
                    Open
                  </Link>
                  <form action={toggleActive.bind(null, a.id)}>
                    <button
                      type="submit"
                      className="border border-ink px-3 py-2 font-sans text-xs uppercase tracking-wider hover:bg-ink hover:text-cream"
                    >
                      {a.active ? "Pause" : "Activate"}
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-16">
          <div className="eyebrow">Add agent</div>
          <form action={addAgent} className="mt-4 space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <input name="slug" required placeholder="slug (e.g. brian)" className="border-b-2 border-ink bg-transparent py-2 px-1 font-sans outline-none focus:border-blood" />
              <input name="name" required placeholder="Display name" className="border-b-2 border-ink bg-transparent py-2 px-1 font-sans outline-none focus:border-blood" />
              <input name="email" type="email" required placeholder="email" className="border-b-2 border-ink bg-transparent py-2 px-1 font-sans outline-none focus:border-blood" />
            </div>
            <textarea
              name="icp_text"
              rows={6}
              placeholder="Initial ICP (agent can edit in their settings)"
              className="w-full border-2 border-ink bg-cream p-4 font-mono text-sm outline-none focus:border-blood"
            />
            <button
              type="submit"
              className="bg-ink text-cream px-6 py-3 font-sans font-semibold uppercase tracking-wider text-sm hover:bg-blood"
            >
              Add agent
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
