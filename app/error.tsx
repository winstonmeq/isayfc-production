"use client";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: GlobalErrorProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-300">
          System interrupted
        </p>
        <h1 className="mt-4 text-3xl font-bold">Something needs attention.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          The system caught an unexpected error before it could affect the
          whole session. Try again, then report this screen if it repeats.
        </p>
        {error.digest ? (
          <p className="mt-4 rounded-2xl bg-black/30 px-4 py-3 text-xs text-slate-400">
            Reference: {error.digest}
          </p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded-2xl bg-amber-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-300"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
