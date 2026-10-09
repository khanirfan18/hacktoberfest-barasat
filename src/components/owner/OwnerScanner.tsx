"use client";

import { useCallback, useRef, useState } from "react";
import { Scanner, type IScannerError } from "@yudiel/react-qr-scanner";
import { CheckCircle2, XCircle } from "lucide-react";
import { z } from "zod";
import { copy } from "@/lib/copy";

const scanResponseSchema = z.object({
  result: z.enum(["ok", "expired", "too_early", "reused", "wrong_gym", "invalid", "cancelled"]),
  displayName: z.string().nullable(),
  slot: z.string().datetime({ offset: true }).nullable(),
});

type Result = z.infer<typeof scanResponseSchema>;

function resultMessage(result: Result["result"]) {
  if (result === "expired") return copy.owner.expired;
  if (result === "too_early") return copy.owner.tooEarly;
  if (result === "reused") return copy.owner.alreadyUsed;
  if (result === "wrong_gym") return copy.owner.wrongGym;
  if (result === "cancelled") return copy.owner.cancelled;
  return copy.owner.invalid;
}

function formatSlot(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function OwnerScanner() {
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [cameraError, setCameraError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const verify = useCallback(async (value: string) => {
    if (!value.trim() || pending || result) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: value.trim() }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        setError(copy.owner.resultError);
        setPending(false);
        return;
      }
      const parsed = scanResponseSchema.safeParse(body);
      if (!parsed.success) {
        setError(copy.owner.resultError);
        setPending(false);
        return;
      }
      setResult(parsed.data);
      if (parsed.data.result === "ok" && "vibrate" in navigator) navigator.vibrate(180);
      timer.current = setTimeout(() => {
        setResult(null);
        setCode("");
        setPending(false);
      }, 2500);
    } catch {
      setError(copy.owner.resultError);
      setPending(false);
    }
  }, [pending, result]);

  function cameraErrorHandler(_error: IScannerError) {
    setCameraError(true);
  }

  const isSuccess = result?.result === "ok";
  return (
    <main className="fixed inset-0 z-[90] flex min-h-dvh flex-col overflow-y-auto bg-[#07090B] text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-8">
        <a href="/owner" className="font-display text-sm text-lime">GYMGO <span className="text-white/45">· FRONT DESK</span></a>
        <a href="/owner/scans" className="text-xs text-cyan underline underline-offset-4">{copy.owner.scansLog}</a>
      </header>
      {result ? (
        <section className={`grid flex-1 content-center justify-items-center gap-4 p-6 text-center ${isSuccess ? "bg-lime/[0.07]" : "bg-magenta/[0.07]"}`}>
          {isSuccess ? <CheckCircle2 size={76} className="text-lime" /> : <XCircle size={76} className="text-magenta" />}
          <h1 className={`font-display text-4xl sm:text-6xl ${isSuccess ? "text-lime" : "text-magenta"}`}>{isSuccess ? copy.owner.verified : resultMessage(result.result)}</h1>
          {isSuccess ? (
            <>
              <p className="font-display text-xl">{result.displayName || copy.owner.traveller}</p>
              {result.slot && <p className="font-mono text-sm text-white/65">{copy.owner.slot}: {formatSlot(result.slot)}</p>}
            </>
          ) : <p className="max-w-md text-sm text-white/65">{resultMessage(result.result)}</p>}
        </section>
      ) : (
        <section className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-5 p-4 py-8 sm:p-8">
          <div className="text-center"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-cyan">{copy.owner.scannerEyebrow}</p><h1 className="mt-2 font-display text-2xl">{copy.owner.scannerTitle}</h1><p className="mt-2 text-sm text-white/50">{copy.owner.scanning}</p></div>
          <div className="overflow-hidden rounded-[24px] border border-lime/20 bg-black">
            <Scanner
              onScan={(codes) => {
                const value = codes[0]?.rawValue;
                if (value) void verify(value);
              }}
              onError={cameraErrorHandler}
              constraints={{ facingMode: "environment" }}
              formats={["qr_code"]}
              paused={pending}
              allowMultiple
              scanDelay={500}
              classNames={{ container: "min-h-72", video: "min-h-72 w-full object-cover" }}
            />
          </div>
          <p className="text-center text-xs text-white/45">{cameraError ? copy.owner.cameraPermission : copy.owner.cameraUnavailable}</p>
          <form onSubmit={(event) => { event.preventDefault(); void verify(code); }} className="space-y-2">
            <label htmlFor="pass-code" className="font-mono text-[10px] uppercase tracking-wider text-white/50">{copy.owner.pasteCode}</label>
            <textarea id="pass-code" value={code} onChange={(event) => setCode(event.target.value)} maxLength={4096} rows={3} disabled={pending} className="w-full resize-y rounded-xl border border-white/10 bg-white/[0.04] p-3 font-mono text-xs outline-none focus:border-lime/40 disabled:opacity-50" />
            <button type="submit" disabled={pending || !code.trim()} className="w-full rounded-full bg-lime px-5 py-3 text-sm font-semibold text-noir disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Verifying…" : copy.owner.submitCode}</button>
          </form>
          {error && <p role="alert" className="text-center text-sm text-magenta">{error}</p>}
        </section>
      )}
    </main>
  );
}
