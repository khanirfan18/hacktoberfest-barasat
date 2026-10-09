import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const requiredVariables = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;
const missingVariables = requiredVariables.filter((name) => !process.env[name]);
if (missingVariables.length > 0) {
  console.error(`verify_db: missing ${missingVariables.join(", ")}.`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const password = `Verify-${randomUUID()}-9a`;
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

type TempUser = { user: User; client: SupabaseClient };
type Check = { name: string; pass: boolean; detail?: string };

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) return String(error.message).replace(/\s+/g, " ").slice(0, 140);
  return "unexpected error";
}

async function createTempUser(role: "user" | "owner", label: string): Promise<TempUser> {
  const email = `verify-${label}-${randomUUID()}@gymgo.demo`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`create ${label}: ${errorMessage(error)}`);
  const { error: profileError } = await admin.from("profiles").upsert({ id: data.user.id, role, display_name: `Verify ${label}` });
  if (profileError) throw new Error(`profile ${label}: ${errorMessage(profileError)}`);
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`sign in ${label}: ${errorMessage(signInError)}`);
  return { user: data.user, client };
}

async function rpcError(client: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<string | null> {
  const { error } = await client.rpc(fn, args);
  return error ? errorMessage(error) : null;
}

async function main(): Promise<void> {
  const checks: Check[] = [];
  const tempUsers: TempUser[] = [];
  let gymId: string | undefined;
  let cityId: string | undefined;
  let claimId: string | undefined;
  let bookingId: string | undefined;
  let checkInBookingId: string | undefined;
  let cancelBookingId: string | undefined;

  try {
    const { data: city, error: cityError } = await admin.from("cities").select("id").eq("slug", "barasat").single();
    if (cityError || !city) throw new Error(`city lookup: ${errorMessage(cityError)}`);
    cityId = city.id;
    const ownerA = await createTempUser("owner", "owner-a");
    const ownerB = await createTempUser("owner", "owner-b");
    const traveller = await createTempUser("user", "traveller");
    const capacityUsers = await Promise.all([1, 2, 3, 4, 5].map((n) => createTempUser("user", `capacity-${n}`)));
    tempUsers.push(ownerA, ownerB, traveller, ...capacityUsers);

    const openingHours = Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => [day, [["00:00", "23:59"]]]));
    const { data: gym, error: gymError } = await admin.from("gyms").insert({
      slug: `verify-${randomUUID()}`, city_id: cityId, name: "Verification Gym", owner_id: ownerA.user.id,
      status: "claimed", price_minor: 1000, price_currency: "INR", capacity_per_hour: 2, opening_hours: openingHours,
    }).select("id").single();
    if (gymError || !gym) throw new Error(`gym: ${errorMessage(gymError)}`);
    gymId = gym.id;

    const { data: claim, error: claimError } = await admin.from("claim_requests").insert({
      gym_id: gymId, user_id: traveller.user.id, business_email: "verify@gymgo.demo", message: "temporary",
    }).select("id").single();
    if (claimError || !claim) throw new Error(`claim: ${errorMessage(claimError)}`);
    claimId = claim.id;

    const { data: anonBookings } = await anon.from("bookings").select("id").eq("gym_id", gymId);
    const { data: anonClaims } = await anon.from("claim_requests").select("id").eq("id", claimId);
    checks.push({ name: "anon cannot read bookings or claim_requests", pass: !anonBookings?.length && !anonClaims?.length });

    const roleError = await traveller.client.from("profiles").update({ role: "owner" }).eq("id", traveller.user.id);
    checks.push({ name: "signed-in user cannot change own role", pass: Boolean(roleError.error) });

    const directInsert = await traveller.client.from("bookings").insert({
      gym_id: gymId, user_id: traveller.user.id, slot_start: new Date(Date.now() + 86400000).toISOString(),
      slot_end: new Date(Date.now() + 90000000).toISOString(), price_minor: 1000, currency: "INR",
    });
    checks.push({ name: "user cannot insert bookings directly", pass: Boolean(directInsert.error) });

    const validStart = new Date(Date.now() + 2 * 86400000);
    validStart.setUTCMinutes(0, 0, 0);
    const capacityResults = await Promise.all(capacityUsers.map(({ client }) => client.rpc("book_slot", {
      p_gym: gymId, p_start: validStart.toISOString(),
    })));
    const successfulBookings = capacityResults.filter(({ data, error }) => Boolean(data) && !error);
    bookingId = successfulBookings[0]?.data as string | undefined;
    const capacityErrors = [...new Set(capacityResults.filter(({ error }) => error).map(({ error }) => errorMessage(error)))].join(" | ");
    checks.push({ name: "capacity 2 allows exactly 2 of 5 parallel bookings", pass: successfulBookings.length === 2, detail: `succeeded=${successfulBookings.length}${capacityErrors ? `, errors=${capacityErrors}` : ""}` });

    const offHour = new Date(Date.now() + 3 * 86400000);
    offHour.setHours(3, 0, 0, 0);
    const offHourError = await rpcError(traveller.client, "book_slot", { p_gym: gymId, p_start: offHour.toISOString() });
    const offHourPass = Boolean(offHourError);

    const closedHour = new Date(Date.now() + 4 * 86400000);
    closedHour.setHours(12, 0, 0, 0);
    const closedDay = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"][closedHour.getDay() === 0 ? 6 : closedHour.getDay() - 1];
    const closedHours = { ...openingHours, [closedDay]: [] };
    await admin.from("gyms").update({ opening_hours: closedHours }).eq("id", gymId);
    const closedError = await rpcError(traveller.client, "book_slot", { p_gym: gymId, p_start: closedHour.toISOString() });
    const closedHourPass = Boolean(closedError);
    await admin.from("gyms").update({ opening_hours: openingHours }).eq("id", gymId);

    const tooFar = new Date(Date.now() + 8 * 86400000);
    tooFar.setUTCMinutes(0, 0, 0);
    const tooFarError = await rpcError(traveller.client, "book_slot", { p_gym: gymId, p_start: tooFar.toISOString() });
    const tooFarPass = Boolean(tooFarError);
    checks.push({ name: "off-hour, closed-hour, and >7-day bookings fail", pass: offHourPass && closedHourPass && tooFarPass });

    const checkInStart = new Date(Date.now() - 5 * 60000);
    const { data: checkInBooking, error: checkInError } = await admin.from("bookings").insert({
      gym_id: gymId, user_id: traveller.user.id, slot_start: checkInStart.toISOString(),
      slot_end: new Date(Date.now() + 55 * 60000).toISOString(), price_minor: 1000, currency: "INR", status: "confirmed",
    }).select("id,qr_nonce").single();
    if (checkInError || !checkInBooking) throw new Error(`check-in booking: ${errorMessage(checkInError)}`);
    checkInBookingId = checkInBooking.id;

    const wrongGym = await ownerB.client.rpc("check_in_booking", { p_booking: checkInBooking.id, p_nonce: checkInBooking.qr_nonce });
    const { data: wrongScan } = await admin.from("scans").select("result").eq("booking_id", checkInBooking.id).eq("result", "wrong_gym");
    checks.push({ name: "owner B cannot check in owner A booking", pass: wrongGym.data?.[0]?.result === "wrong_gym" && Boolean(wrongScan?.length) });

    const firstCheckIn = await ownerA.client.rpc("check_in_booking", { p_booking: checkInBooking.id, p_nonce: checkInBooking.qr_nonce });
    const secondCheckIn = await ownerA.client.rpc("check_in_booking", { p_booking: checkInBooking.id, p_nonce: checkInBooking.qr_nonce });
    checks.push({ name: "check_in_booking returns ok then reused", pass: firstCheckIn.data?.[0]?.result === "ok" && secondCheckIn.data?.[0]?.result === "reused" });

    const cancelStart = new Date(Date.now() + 60 * 60000);
    const { data: cancelBooking, error: cancelError } = await admin.from("bookings").insert({
      gym_id: gymId, user_id: traveller.user.id, slot_start: cancelStart.toISOString(),
      slot_end: new Date(Date.now() + 120 * 60000).toISOString(), price_minor: 1000, currency: "INR", status: "confirmed",
    }).select("id").single();
    if (cancelError || !cancelBooking) throw new Error(`cancel booking: ${errorMessage(cancelError)}`);
    cancelBookingId = cancelBooking.id;
    const cancelResult = await rpcError(traveller.client, "cancel_booking", { p_id: cancelBooking.id });
    checks.push({ name: "cancel inside 2 hours fails", pass: Boolean(cancelResult) });
  } catch (error) {
    checks.push({ name: "test setup", pass: false, detail: errorMessage(error) });
  } finally {
    if (gymId) await admin.from("scans").delete().eq("gym_id", gymId);
    if (bookingId) await admin.from("bookings").delete().eq("id", bookingId);
    if (checkInBookingId) await admin.from("bookings").delete().eq("id", checkInBookingId);
    if (cancelBookingId) await admin.from("bookings").delete().eq("id", cancelBookingId);
    if (claimId) await admin.from("claim_requests").delete().eq("id", claimId);
    if (gymId) await admin.from("gyms").delete().eq("id", gymId);
    if (cityId) void cityId;
    for (const { user } of tempUsers) await admin.auth.admin.deleteUser(user.id);
  }

  for (const check of checks) console.log(`${check.pass ? "PASS" : "FAIL"} ${check.name}${check.detail ? `: ${check.detail}` : ""}`);
  if (checks.length !== 8 || checks.some(({ pass }) => !pass)) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(`FAIL verify_db: ${errorMessage(error)}`);
  process.exitCode = 1;
});
