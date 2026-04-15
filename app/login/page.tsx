import { redirect } from "next/navigation";
import { getAgentByEmail } from "@/lib/agents";
import { createMagicToken, isAdminEmail } from "@/lib/auth";
import { sendMagicLink } from "@/lib/mailer";

export const dynamic = "force-dynamic";

async function requestLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) redirect("/login?error=Enter+your+email");
  const agent = getAgentByEmail(email);
  if (!agent && !isAdminEmail(email)) {
    redirect("/login?sent=1"); // never leak which emails are known
  }
  const token = createMagicToken(email);
  const base = process.env.APP_URL ?? "http://localhost:3021";
  const link = `${base}/api/auth/verify?token=${token}`;
  await sendMagicLink(email, link);
  redirect("/login?sent=1");
}

type SearchParams = Promise<{ sent?: string; error?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md w-full">
        <div className="eyebrow">Resolve Lead Factory</div>
        <h1 className="display text-5xl font-black mt-2">Sign in</h1>
        <p className="mt-4 text-base">
          Enter your Resolve email. We'll send a one-time link — no passwords.
        </p>
        <form action={requestLink} className="mt-8 space-y-4">
          <input
            type="email"
            name="email"
            required
            autoFocus
            placeholder="you@resolve.com"
            className="w-full border-b-2 border-ink bg-transparent py-3 px-1 text-lg outline-none focus:border-blood font-sans"
          />
          <button
            type="submit"
            className="bg-ink text-cream px-6 py-3 font-sans font-semibold uppercase tracking-wider text-sm hover:bg-blood"
          >
            Send link →
          </button>
        </form>
        {sp?.sent && (
          <p className="mt-6 text-rust font-sans text-sm">
            Check your inbox. The link expires in 15 minutes.
          </p>
        )}
        {sp?.error && <p className="mt-6 text-blood font-sans text-sm">{sp.error}</p>}
        <div className="rule mt-10 pt-4 text-xs font-sans uppercase tracking-wider text-dust">
          Resolve Logistics · Internal tool
        </div>
      </div>
    </main>
  );
}
