"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, LoaderCircle, XCircle } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { cancelTicketBooking } from "@/app/ticket/actions";
import { copy } from "@/lib/copy";
import { createClient } from "@/lib/supabase/browser";

type BookingStatus = "confirmed" | "checked_in" | "cancelled";

export function TicketPass({
  bookingId,
  gymName,
  address,
  timezone,
  slotStart,
  slotEnd,
  price,
  token,
  initialStatus,
  initialCheckedInAt,
}: {
  bookingId: string;
  gymName: string;
  address: string | null;
  timezone: string;
  slotStart: string;
  slotEnd: string;
  price: string;
  token: string | null;
  initialStatus: BookingStatus;
  initialCheckedInAt: string | null;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [checkedInAt, setCheckedInAt] = useState(initialCheckedInAt);
  const [liveError, setLiveError] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const start = new Date(slotStart);
  const end = new Date(slotEnd);
  const dateLabel = new Intl.DateTimeFormat("en", {
    dateStyle: "full",
    timeZone: timezone,
  }).format(start);
  const timeLabel = (value: Date) => new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(value);
  const canCancel = status === "confirmed" && start.getTime() - Date.now() >= 2 * 60 * 60 * 1000;

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`ticket-${bookingId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "bookings",
        filter: `id=eq.${bookingId}`,
      }, (payload) => {
        const row = payload.new as { status?: unknown; checked_in_at?: unknown };
        if (row.status === "confirmed" || row.status === "checked_in" || row.status === "cancelled") {
          setStatus(row.status);
        }
        if (typeof row.checked_in_at === "string") setCheckedInAt(row.checked_in_at);
      })
      .subscribe((subscriptionStatus) => {
        setLiveError(subscriptionStatus === "CHANNEL_ERROR" || subscriptionStatus === "TIMED_OUT");
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [bookingId]);

  function cancel() {
    if (!canCancel || isPending) return;
    if (!window.confirm(copy.bookingTicket.cancelConfirm)) return;
    setMessage("");
    startTransition(async () => {
      const result = await cancelTicketBooking(bookingId);
      if (!result.success) {
        setMessage(result.message);
        return;
      }
      setStatus("cancelled");
      setMessage(copy.bookingTicket.cancelSuccess);
    });
  }

  return (
    <article className="overflow-hidden rounded-[24px] border border-lime/25 bg-[#101416] shadow-[0_0_40px_rgba(198,255,61,.08)]">
      <div className="border-b border-dashed border-white/15 px-6 py-6 text-center sm:px-8">
        <p className="font-mono text-[10px] uppercase tracking-[.22em] text-cyan">{copy.bookingTicket.ticketTitle}</p>
        <h1 className="mt-3 font-display text-2xl">{gymName}</h1>
        <p className="mt-3 text-sm text-white/55">{dateLabel}</p>
        <p className="mt-1 font-mono text-lg text-lime">{timeLabel(start)}–{timeLabel(end)}</p>
        <p className="mt-1 font-mono text-[10px] text-white/35">{timezone}</p>
      </div>

      {status === "checked_in" ? (
        <div className="grid min-h-64 place-content-center justify-items-center gap-3 p-6 text-center">
          <CheckCircle2 size={42} className="text-lime" />
          <p className="font-display text-lg text-lime">{copy.bookingTicket.checkedIn}</p>
          <time className="font-mono text-sm text-white/70" dateTime={checkedInAt ?? undefined}>
            {checkedInAt ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(checkedInAt)) : ""}
          </time>
        </div>
      ) : status === "cancelled" ? (
        <div className="grid min-h-64 place-content-center justify-items-center gap-3 p-6 text-center">
          <XCircle size={40} className="text-white/40" />
          <p className="font-display text-lg text-white/65">{copy.bookingTicket.statusCancelled}</p>
        </div>
      ) : (
        <div className="grid justify-items-center gap-4 px-6 py-7">
          {token && <div className="rounded-2xl bg-white p-3"><QRCodeSVG value={token} size={224} level="H" includeMargin /></div>}
          <p className="max-w-xs text-center text-xs leading-relaxed text-white/50">{copy.bookingTicket.qrInstructions}</p>
          <span className="rounded-full border border-lime/30 px-3 py-1.5 font-mono text-[10px] tracking-wider text-lime">{copy.bookingTicket.confirmed}</span>
        </div>
      )}

      <div className="space-y-4 border-t border-white/[0.08] p-6 sm:px-8">
        {address && <p className="text-center text-sm text-white/60">{address}</p>}
        <p className="text-center font-display text-xl">{price}</p>
        {liveError && <p role="status" className="text-center text-xs text-magenta">{copy.bookingTicket.liveStatusUnavailable}</p>}
        {message && <p role="status" className="text-center text-xs text-white/65">{message}</p>}
        {canCancel && (
          <button type="button" onClick={cancel} disabled={isPending} className="mx-auto flex items-center justify-center gap-2 rounded-full border border-magenta/25 px-5 py-2.5 text-xs text-magenta transition hover:bg-magenta/10 disabled:cursor-not-allowed disabled:opacity-50">
            {isPending && <LoaderCircle size={14} className="animate-spin" />}
            {isPending ? copy.bookingTicket.cancelling : copy.bookingTicket.cancelBooking}
          </button>
        )}
      </div>
    </article>
  );
}

export function TicketStatusLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="text-xs font-semibold text-cyan underline underline-offset-4">{children}</Link>;
}
