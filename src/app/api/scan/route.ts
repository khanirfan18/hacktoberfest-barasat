import { NextResponse } from "next/server";
import { z } from "zod";
import { copy } from "@/lib/copy";
import { createServerClient } from "@/lib/supabase/server";
import { verifyToken } from "@/lib/qr";

const requestSchema = z.object({ code: z.string().trim().min(1).max(4096) });
const resultSchema = z.object({
  result: z.enum(["ok", "expired", "too_early", "reused", "wrong_gym", "invalid", "cancelled"]),
  display_name: z.string().max(120).nullable(),
  slot: z.string().datetime({ offset: true }).nullable(),
});

function invalidResult() {
  return NextResponse.json({ result: "invalid", message: copy.owner.invalid });
}

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) return NextResponse.json({ message: copy.owner.resultError }, { status: 500 });
  if (!user) return NextResponse.json({ message: copy.owner.invalid }, { status: 401 });

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) return NextResponse.json({ message: copy.owner.resultError }, { status: 500 });
  if (profile?.role !== "owner") return NextResponse.json({ message: copy.owner.invalid }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidResult();
  }
  const parsedBody = requestSchema.safeParse(body);
  if (!parsedBody.success) return invalidResult();

  let verified: ReturnType<typeof verifyToken>;
  try {
    verified = verifyToken(parsedBody.data.code);
  } catch {
    return NextResponse.json({ message: copy.owner.resultError }, { status: 500 });
  }
  if (!verified) return invalidResult();

  const { data, error } = await supabase.rpc("check_in_booking", {
    p_booking: verified.bookingId,
    p_nonce: verified.nonce,
  });
  if (error) {
    if (error.message.includes("BOOKING_NOT_FOUND")) return invalidResult();
    return NextResponse.json({ message: copy.owner.resultError }, { status: 500 });
  }
  const result = resultSchema.safeParse(Array.isArray(data) ? data[0] : data);
  if (!result.success) return NextResponse.json({ message: copy.owner.resultError }, { status: 500 });
  const displayName = result.data.display_name?.slice(0, 120) ?? null;
  return NextResponse.json({
    result: result.data.result,
    displayName,
    slot: result.data.slot,
  });
}
