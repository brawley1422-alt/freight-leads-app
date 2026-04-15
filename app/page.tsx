import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-2xl">
        <div className="eyebrow">Resolve Logistics · Lead Factory</div>
        <h1 className="display text-6xl md:text-7xl font-black mt-3 leading-[0.95]">
          A daily brief,<br />
          <span className="text-blood">built for your book.</span>
        </h1>
        <p className="mt-6 text-lg max-w-xl">
          Wake up to ten prospectable shippers that fit your ICP — researched overnight,
          delivered as an editorial PDF before your first call.
        </p>
        <div className="mt-10 rule-blood" />
        <div className="mt-6">
          <Link
            href="/login"
            className="inline-block bg-ink text-cream px-6 py-3 font-sans font-semibold uppercase tracking-wider text-sm no-underline hover:bg-blood"
          >
            Sign in →
          </Link>
        </div>
      </div>
    </main>
  );
}
