"use client";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="grid min-h-64 place-items-center rounded-[20px] border border-magenta/25 bg-white/[0.025] p-8 text-center">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-magenta">Something went wrong</p>
        <h1 className="mt-3 font-display text-lg">GymGo couldn&apos;t load this page.</h1>
        <p className="mt-2 text-sm text-white/50">Please try again in a moment.</p>
        <button type="button" onClick={reset} className="mt-5 rounded-full bg-lime px-5 py-2.5 text-sm font-semibold text-noir">Try again</button>
      </div>
    </div>
  );
}
