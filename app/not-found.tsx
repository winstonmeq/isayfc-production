import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-300">
          Page not found
        </p>
        <h1 className="mt-4 text-3xl font-bold">This workspace route is unavailable.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          The page may have moved, or your account may need a different module
          enabled.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex rounded-2xl bg-amber-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-300"
        >
          Return to dashboard
        </Link>
      </section>
    </main>
  );
}
