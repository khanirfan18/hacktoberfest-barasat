"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-[#07090B] text-white">
        <main className="grid min-h-screen place-items-center p-6 text-center">
          <div>
            <h1 className="font-display text-2xl">Something went wrong.</h1>
            <p className="mt-3 text-sm text-white/60">Please try again.</p>
            <button
              type="button"
              onClick={reset}
              className="mt-6 rounded-full border border-lime/40 px-5 py-2 text-sm text-lime"
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
