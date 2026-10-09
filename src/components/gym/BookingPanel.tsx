"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { HeatStrip } from "@/components/ui-gg/HeatStrip";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { bookGymSlot } from "@/app/gym/actions";
import { copy } from "@/lib/copy";
import { formatMoney } from "@/lib/format";
import { z } from "zod";

const slotSchema = z.object({
  hour: z.number().int().min(0).max(23),
  capacity: z.number().int().nonnegative(),
  booked: z.number().int().nonnegative(),
  open: z.boolean(),
});
const slotsSchema = z.array(slotSchema);
type Slot = z.infer<typeof slotSchema>;

function localDate(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function localDayLabel(date: string, timezone: string, index: number) {
  if (index === 0) return "Today";
  return new Intl.DateTimeFormat("en", { weekday: "short", timeZone: timezone })
    .format(new Date(`${date}T12:00:00Z`));
}

function hourLabel(hour: number) {
  return new Intl.DateTimeFormat("en", { hour: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(2026, 0, 1, hour)));
}

function zonedDateParts(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    hour: Number(part("hour")),
    minute: Number(part("minute")),
  };
}

function slotStartIso(date: string, hour: number, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour);
  let utc = desired;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const local = zonedDateParts(new Date(utc), timezone);
    const [localYear, localMonth, localDay] = local.date.split("-").map(Number);
    utc += desired - Date.UTC(localYear, localMonth - 1, localDay, local.hour, local.minute);
  }
  return new Date(utc).toISOString();
}

export function BookingPanel({
  gymId,
  gymName,
  timezone,
  priceMinor,
  currency,
  claimed,
  claimHref,
  signedIn,
}: {
  gymId: string;
  gymName: string;
  timezone: string;
  priceMinor: number | null;
  currency: string;
  claimed: boolean;
  claimHref: string;
  signedIn: boolean;
}) {
  const today = useMemo(() => localDate(new Date(), timezone), [timezone]);
  const dates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(today, index)), [today]);
  const router = useRouter();
  const pathname = usePathname();
  const [selectedDate, setSelectedDate] = useState(dates[0]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedStart, setSelectedStart] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [checkoutPhase, setCheckoutPhase] = useState<"idle" | "processing" | "complete">("idle");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const requestedStart = new URLSearchParams(window.location.search).get("slotStart");
      if (!requestedStart) return;
      const parsed = new Date(requestedStart);
      if (Number.isNaN(parsed.getTime())) return;
      const local = zonedDateParts(parsed, timezone);
      if (!dates.includes(local.date)) return;
      setSelectedDate(local.date);
      setSelectedStart(parsed.toISOString());
      setConfirmOpen(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [dates, timezone]);

  const chooseDate = (date: string) => {
    if (date === selectedDate) return;
    setLoading(true);
    setSelectedDate(date);
  };

  const loadSlots = useCallback(async () => {
    if (!claimed || document.visibilityState !== "visible") return;
    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc("slot_availability", {
      p_gym: gymId,
      p_day: selectedDate,
    });
    if (rpcError) {
      setError("Availability could not be refreshed. Please try again.");
      setLoading(false);
      return;
    }
    const parsed = slotsSchema.safeParse(data ?? []);
    if (!parsed.success) {
      setError("Availability data was invalid. Please try again later.");
      setLoading(false);
      return;
    }
    setError("");
    setSlots(parsed.data);
    setLoading(false);
  }, [claimed, gymId, selectedDate]);

  useEffect(() => {
    if (!claimed) return;
    const initialLoad = window.setTimeout(() => void loadSlots(), 0);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadSlots();
    }, 10_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void loadSlots();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [claimed, loadSlots]);

  if (!claimed) {
    return (
      <aside className="rounded-[20px] border border-white/10 bg-white/[0.04] p-5">
        <p className="font-display text-base">Make this gym bookable</p>
        <p className="mt-2 text-sm text-white/50">This gym hasn&apos;t been claimed yet.</p>
        <a href={signedIn ? claimHref : "/login"} className="mt-4 inline-flex rounded-full bg-lime px-4 py-2.5 text-xs font-semibold text-noir">{signedIn ? "Claim this gym" : "Sign in to claim this gym"}</a>
      </aside>
    );
  }

  const normalized = [...slots].sort((a, b) => a.hour - b.hour);
  const heatValues = normalized.map((slot) => slot.open && slot.capacity > 0 ? slot.booked / slot.capacity : 0);
  const nowInZone = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date()).find((part) => part.type === "hour")?.value;
  const currentHour = selectedDate === today ? Number(nowInZone ?? "0") : -1;
  const selectHour = (hour: number) => {
    const start = slotStartIso(selectedDate, hour, timezone);
    if (!signedIn) {
      const destination = `${pathname}?slotStart=${encodeURIComponent(start)}`;
      router.push(`/login?next=${encodeURIComponent(destination)}`);
      return;
    }
    setError("");
    setCheckoutPhase("idle");
    setSelectedStart(start);
    setMobileOpen(false);
    setConfirmOpen(true);
  };
  const confirmBooking = async () => {
    if (!selectedStart || checkoutPending) return;
    setCheckoutPending(true);
    setError("");
    setCheckoutPhase("processing");
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
    setCheckoutPhase("complete");
    try {
      const result = await bookGymSlot({ gymId, slotStart: selectedStart, returnTo: pathname });
      if (!result.success) {
        setCheckoutPending(false);
        setCheckoutPhase("idle");
        setError(result.message);
        if (result.loginUrl) router.push(result.loginUrl);
        return;
      }
      router.push(`/ticket/${result.bookingId}`);
    } catch {
      setCheckoutPending(false);
      setCheckoutPhase("idle");
      setError(copy.bookingTicket.bookingFailed);
    }
  };
  const selectedStartDate = selectedStart ? new Date(selectedStart) : null;
  const selectedEndDate = selectedStartDate ? new Date(selectedStartDate.getTime() + 60 * 60 * 1000) : null;
  const selectedLocalDate = selectedStartDate
    ? new Intl.DateTimeFormat("en", { dateStyle: "full", timeZone: timezone }).format(selectedStartDate)
    : "";
  const selectedLocalRange = selectedStartDate && selectedEndDate
    ? `${new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(selectedStartDate)}–${new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(selectedEndDate)}`
    : "";
  const controls = (
    <BookingControls
      dates={dates}
      selectedDate={selectedDate}
      setSelectedDate={chooseDate}
      timezone={timezone}
      normalized={normalized}
      currentHour={currentHour}
      loading={loading}
      error={error}
      heatValues={heatValues}
      disabled={checkoutPending}
      onSelectHour={selectHour}
    />
  );

  return (
    <>
      <aside className="hidden rounded-[20px] border border-lime/20 bg-[#0d1112] p-5 shadow-[0_0_32px_rgba(198,255,61,.06)] lg:block">
        <p className="font-mono text-[10px] uppercase tracking-[.2em] text-lime">Book a 1-hour session</p>
        <p className="mt-1 text-xs text-white/40">{gymName} · local time</p>
        {controls}
        <p className="mt-4 text-[10px] text-white/35">DEMO · Pay at gym</p>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="bottom" showCloseButton className="max-h-[88dvh] overflow-y-auto rounded-t-[24px] border-white/10 bg-[#101418] p-5 text-white lg:hidden">
          <SheetHeader className="p-0">
            <SheetTitle className="font-display text-base text-white">Choose a session</SheetTitle>
            <SheetDescription className="text-white/55">{gymName} · times shown in {timezone}</SheetDescription>
          </SheetHeader>
          {controls}
          <p className="text-[10px] text-white/35">DEMO · Pay at gym</p>
        </SheetContent>
      </Sheet>

      <Sheet open={confirmOpen} onOpenChange={setConfirmOpen}>
        <SheetContent side="bottom" className="rounded-t-[24px] border-white/10 bg-[#101418] p-5 text-white sm:mx-auto sm:max-w-lg">
          <SheetHeader className="p-0">
            <SheetTitle className="font-display text-base text-white">{copy.bookingTicket.confirmTitle}</SheetTitle>
            <SheetDescription className="text-white/55">{gymName}</SheetDescription>
          </SheetHeader>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-white/40">{copy.bookingTicket.dateLabel}</p>
            <p className="mt-2 text-sm font-medium">{selectedLocalDate}</p>
            <p className="mt-1 font-mono text-sm text-cyan">{selectedLocalRange} · {timezone}</p>
            <div className="mt-4 flex items-end justify-between border-t border-white/10 pt-3">
              <span className="text-xs text-white/50">{copy.bookingTicket.payAtGym}</span>
              <span className="font-display text-xl text-lime">{formatMoney(priceMinor, currency)}</span>
            </div>
          </div>
          <div className="rounded-xl border border-magenta/25 bg-magenta/[0.06] p-3">
            <p className="font-mono text-[10px] font-bold tracking-[.18em] text-magenta">{copy.bookingTicket.demoCheckout}</p>
            <p className="mt-1 text-xs text-white/65">{copy.bookingTicket.payAtGym} · No payment is collected online.</p>
          </div>
          {error && <p role="alert" className="text-sm text-magenta">{error}</p>}
          <button type="button" onClick={() => void confirmBooking()} disabled={checkoutPending || !selectedStart || priceMinor === null} className="flex w-full items-center justify-center gap-2 rounded-full bg-lime px-5 py-3 text-sm font-semibold text-noir disabled:cursor-not-allowed disabled:opacity-50">
            {checkoutPhase === "processing" ? <><LoaderCircle size={16} className="animate-spin" />{copy.bookingTicket.processing}</> : checkoutPhase === "complete" ? <><CheckCircle2 size={16} />{copy.bookingTicket.sessionBooked}</> : copy.bookingTicket.confirmBooking}
          </button>
        </SheetContent>
      </Sheet>

      <button type="button" onClick={() => setMobileOpen(true)} className="fixed bottom-20 left-1/2 z-30 -translate-x-1/2 rounded-full bg-lime px-5 py-3 text-sm font-semibold text-noir shadow-xl lg:hidden">Check availability</button>
    </>
  );
}

function BookingControls({
  dates,
  selectedDate,
  setSelectedDate,
  timezone,
  normalized,
  currentHour,
  loading,
  error,
  heatValues,
  disabled,
  onSelectHour,
}: {
  dates: string[];
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  timezone: string;
  normalized: Slot[];
  currentHour: number;
  loading: boolean;
  error: string;
  heatValues: number[];
  disabled: boolean;
  onSelectHour: (hour: number) => void;
}) {
  return (
    <>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
        {dates.map((date, index) => (
          <button key={date} type="button" disabled={disabled} onClick={() => setSelectedDate(date)} aria-pressed={selectedDate === date} className={`min-w-16 rounded-xl border px-3 py-2 text-center disabled:opacity-50 ${selectedDate === date ? "border-lime/45 bg-lime/10 text-lime" : "border-white/10 text-white/50"}`}>
            <span className="block text-xs">{localDayLabel(date, timezone, index)}</span><span className="mt-1 block font-mono text-[10px]">{date.slice(5)}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-end justify-between text-[10px] text-white/40"><span>Live availability</span><span>Busier →</span></div>
      <HeatStrip values={heatValues} />
      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {loading ? Array.from({ length: 8 }, (_, index) => <div key={index} className="h-10 animate-pulse rounded-lg bg-white/[0.06]" />)
          : normalized.map((slot) => {
            const full = slot.booked >= slot.capacity;
            const unavailable = !slot.open || full || slot.hour <= currentHour;
            return (
              <button key={slot.hour} type="button" disabled={disabled || unavailable} onClick={() => onSelectHour(slot.hour)} title={full ? "This hour is full" : !slot.open ? "Gym is closed" : undefined}
                className={`rounded-lg border px-2 py-2 text-[11px] transition ${disabled || unavailable ? "cursor-not-allowed border-white/[0.05] text-white/25" : "border-lime/15 text-white/70 hover:border-lime/50 hover:bg-lime/10 hover:text-lime"}`}>
                {hourLabel(slot.hour)}{full && <span className="sr-only"> — full</span>}
              </button>
            );
          })}
      </div>
      {error && <p role="alert" className="mt-3 text-xs text-magenta">{error}</p>}
      {!loading && !error && normalized.every((slot) => !slot.open || slot.booked >= slot.capacity) && <p className="mt-3 text-xs text-white/45">No bookable hours on this day.</p>}
    </>
  );
}
