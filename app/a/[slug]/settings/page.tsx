import { notFound, redirect } from "next/navigation";
import { getAgentBySlug, updateAgent, verticalsFor } from "@/lib/agents";
import { currentSession, isAdminEmail } from "@/lib/auth";
import { AgentHeader } from "@/app/a/[slug]/_components/header";

export const dynamic = "force-dynamic";

const STARTER_VERTICALS = [
  "Home goods and houseware",
  "Furniture and mattresses",
  "Outdoor and sporting goods",
  "Pet products",
  "Beverage (non-alcoholic)",
  "Sports nutrition and supplements",
  "Beauty and personal care",
  "Baby and kids",
  "Apparel and footwear",
  "Tools and hardware",
  "Grill, smoker, and outdoor cooking",
  "Electronics and small appliances",
  "Food and snacks (CPG)",
  "Garage, storage, and home organization",
  "Automotive aftermarket",
  "Lawn, garden, and nursery",
  "Building materials and lumber",
  "Industrial MRO",
];

async function saveSettings(slug: string, formData: FormData) {
  "use server";
  const icp = String(formData.get("icp_text") ?? "").trim();
  const deliveryHourRaw = Number(formData.get("delivery_hour") ?? 7);
  const delivery_hour = Number.isFinite(deliveryHourRaw)
    ? Math.min(23, Math.max(0, Math.trunc(deliveryHourRaw)))
    : 7;
  const selected = formData.getAll("verticals").map((v) => String(v));
  const custom = String(formData.get("custom_verticals") ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const verticals = Array.from(new Set([...selected, ...custom]));
  updateAgent(slug, {
    icp_text: icp,
    delivery_hour,
    verticals_json: JSON.stringify(verticals),
  });
  redirect(`/a/${slug}/settings?saved=1`);
}

type SearchParams = Promise<{ saved?: string }>;

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const session = await currentSession();
  if (!session) redirect("/login");
  const agent = getAgentBySlug(slug);
  if (!agent) notFound();
  if (agent.email.toLowerCase() !== session.email.toLowerCase() && !isAdminEmail(session.email)) {
    redirect("/login?error=Not+your+dashboard");
  }
  const sp = await searchParams;
  const currentVerticals = new Set(verticalsFor(agent));
  const extras = verticalsFor(agent).filter((v) => !STARTER_VERTICALS.includes(v));
  const save = saveSettings.bind(null, slug);

  return (
    <main className="min-h-screen">
      <AgentHeader agent={agent} />
      <section className="max-w-3xl mx-auto px-6 pb-24">
        <div className="eyebrow mt-10">Settings</div>
        <h2 className="display text-5xl font-black mt-2">Your brief, your way.</h2>
        {sp?.saved && (
          <p className="mt-4 text-rust font-sans text-sm">Saved. Next run uses these settings.</p>
        )}

        <form action={save} className="mt-10 space-y-10">
          <section>
            <label className="eyebrow block">Ideal Customer Profile</label>
            <p className="text-sm mt-1 text-dust">
              Free-form. This is injected into the research prompt every morning.
            </p>
            <textarea
              name="icp_text"
              defaultValue={agent.icp_text}
              rows={14}
              className="mt-3 w-full border-2 border-ink bg-cream p-4 font-mono text-sm outline-none focus:border-blood"
            />
          </section>

          <section>
            <label className="eyebrow block">Delivery hour (24h)</label>
            <input
              type="number"
              name="delivery_hour"
              min={0}
              max={23}
              defaultValue={agent.delivery_hour}
              className="mt-3 w-24 border-b-2 border-ink bg-transparent px-2 py-2 text-xl font-sans outline-none focus:border-blood"
            />
          </section>

          <section>
            <label className="eyebrow block">Verticals</label>
            <p className="text-sm mt-1 text-dust">
              The system rotates through one per day. Pick everything your book covers.
            </p>
            <div className="mt-4 grid md:grid-cols-2 gap-2">
              {STARTER_VERTICALS.map((v) => (
                <label
                  key={v}
                  className="flex items-start gap-3 border border-sand p-3 cursor-pointer hover:border-ink font-sans text-sm"
                >
                  <input
                    type="checkbox"
                    name="verticals"
                    value={v}
                    defaultChecked={currentVerticals.has(v)}
                    className="mt-1 accent-blood"
                  />
                  <span>{v}</span>
                </label>
              ))}
            </div>
            <label className="eyebrow block mt-6">Custom verticals (one per line)</label>
            <textarea
              name="custom_verticals"
              defaultValue={extras.join("\n")}
              rows={4}
              className="mt-3 w-full border-2 border-ink bg-cream p-4 font-mono text-sm outline-none focus:border-blood"
              placeholder="e.g. Marine hardware and boat accessories"
            />
          </section>

          <button
            type="submit"
            className="bg-ink text-cream px-6 py-3 font-sans font-semibold uppercase tracking-wider text-sm hover:bg-blood"
          >
            Save settings
          </button>
        </form>
      </section>
    </main>
  );
}
