import Link from "next/link";
import type { Agent } from "@/lib/types";

export function AgentHeader({ agent }: { agent: Agent }) {
  return (
    <header className="border-b-2 border-ink">
      <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="eyebrow">Resolve Lead Factory</div>
          <h1 className="display text-2xl font-black mt-0.5">{agent.name}</h1>
        </div>
        <nav className="flex gap-4 font-sans text-xs uppercase tracking-wider">
          <Link href={`/a/${agent.slug}`} className="no-underline text-ink hover:text-blood">
            Today
          </Link>
          <Link href={`/a/${agent.slug}/settings`} className="no-underline text-ink hover:text-blood">
            Settings
          </Link>
          <form action="/api/auth/logout" method="post">
            <button className="uppercase tracking-wider text-ink hover:text-blood" type="submit">
              Sign out
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
