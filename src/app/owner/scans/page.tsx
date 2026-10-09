import { GlassCard, SectionTitle } from "@/components/ui-gg";
import { copy } from "@/lib/copy";
import { formatGymTime } from "@/lib/format";
import { requireRole } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type GymRow = { id: string; name: string; cities: Array<{ timezone: string }> | null };
type ScanRow = {
  id: string;
  gym_id: string;
  result: "ok" | "expired" | "too_early" | "reused" | "wrong_gym" | "invalid" | "cancelled";
  created_at: string;
  booking_id: string | null;
  bookings: Array<{ user_id: string; slot_start: string }> | null;
};

function resultLabel(result: ScanRow["result"]) {
  if (result === "ok") return copy.owner.scanStatusOk;
  if (result === "expired") return copy.owner.scanStatusExpired;
  if (result === "too_early") return copy.owner.scanStatusTooEarly;
  if (result === "reused") return copy.owner.scanStatusReused;
  if (result === "wrong_gym") return copy.owner.scanStatusWrongGym;
  if (result === "cancelled") return copy.owner.scanStatusCancelled;
  return copy.owner.scanStatusInvalid;
}

function resultTone(result: ScanRow["result"]) {
  return result === "ok" ? "border-lime/25 bg-lime/[0.06] text-lime" : "border-magenta/20 bg-magenta/[0.05] text-magenta";
}

export default async function ScansPage() {
  const owner = await requireRole("owner");
  const supabase = await createServerClient();
  const { data: gymsData, error: gymsError } = await supabase
    .from("gyms")
    .select("id, name, cities(timezone)")
    .eq("owner_id", owner.id);
  if (gymsError) throw new Error(`Load gyms for scans: ${gymsError.message}`);
  const gyms = (gymsData ?? []) as GymRow[];
  const gymIds = gyms.map((gym) => gym.id);
  const gymById = new Map(gyms.map((gym) => [gym.id, gym]));
  const { data: scansData, error: scansError } = gymIds.length
    ? await supabase.from("scans")
      .select("id, gym_id, result, created_at, booking_id, bookings(user_id, slot_start)")
      .in("gym_id", gymIds)
      .order("created_at", { ascending: false })
      .limit(100)
    : { data: [], error: null };
  if (scansError) throw new Error(`Load owner scans: ${scansError.message}`);
  const scans = (scansData ?? []) as ScanRow[];
  const userIds = [...new Set(scans.flatMap((scan) => scan.bookings?.map((booking) => booking.user_id) ?? []))];
  const names = new Map<string, string>();
  if (userIds.length) {
    const { data: profiles, error: profilesError } = await adminClient
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);
    if (profilesError) throw new Error(`Load scan traveller names: ${profilesError.message}`);
    for (const profile of profiles ?? []) names.set(profile.id, profile.display_name?.slice(0, 80) || copy.owner.traveller);
  }

  return (
    <div className="py-8">
      <SectionTitle eyebrow={copy.owner.scansLog} title={copy.owner.scanLogTitle} />
      <GlassCard className="mt-6 overflow-hidden">
        {scans.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left text-sm">
              <thead><tr className="border-b border-white/10 font-mono text-[10px] uppercase tracking-wider text-white/40">
                <th className="px-4 py-3">{copy.owner.scanTime}</th><th className="px-4 py-3">{copy.owner.scanResult}</th><th className="px-4 py-3">{copy.owner.traveller}</th><th className="px-4 py-3">{copy.owner.slot}</th>
              </tr></thead>
              <tbody>
                {scans.map((scan) => {
                  const booking = scan.bookings?.[0];
                  const gym = gymById.get(scan.gym_id);
                  const timezone = gym?.cities?.[0]?.timezone ?? "UTC";
                  return (
                    <tr key={scan.id} className="border-b border-white/[0.06] last:border-0">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-white/55">{formatGymTime(scan.created_at, timezone)}</td>
                      <td className="px-4 py-3"><span className={`rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase ${resultTone(scan.result)}`}>{resultLabel(scan.result)}</span></td>
                      <td className="px-4 py-3 text-white/70">{booking ? names.get(booking.user_id) ?? copy.owner.traveller : "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-white/55">{booking ? formatGymTime(booking.slot_start, timezone) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="p-6 text-sm text-white/45">{copy.owner.noScans}</p>}
      </GlassCard>
    </div>
  );
}
