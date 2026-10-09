"use client";

export default function GymError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto grid min-h-[50vh] max-w-lg content-center justify-items-center gap-4 px-5 text-center">
      <p className="font-mono text-[10px] uppercase tracking-[.2em] text-magenta">Gym details unavailable</p>
      <h1 className="font-display text-xl">We couldn&apos;t load this gym right now.</h1>
      <p className="text-sm text-white/50">Please try again. Your place in the search is still here.</p>
      <button type="button" onClick={reset} className="rounded-full border border-lime/30 px-5 py-2.5 text-sm text-lime">Try again</button>
    </div>
  );
}
