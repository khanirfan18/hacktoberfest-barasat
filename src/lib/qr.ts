import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const tokenPayloadSchema = z.object({
  bookingId: z.string().uuid(),
  nonce: z.string().uuid(),
});

export type QrBooking = { id: string; qr_nonce: string };

function secret(): string {
  const value = process.env.QR_SECRET;
  if (!value) throw new Error("Missing QR signing secret");
  return value;
}

function signature(payload: string): Buffer {
  return createHmac("sha256", secret()).update(payload).digest();
}

export function signToken(booking: QrBooking): string {
  const parsed = tokenPayloadSchema.parse({ bookingId: booking.id, nonce: booking.qr_nonce });
  const payload = Buffer.from(JSON.stringify(parsed)).toString("base64url");
  return `${payload}.${signature(payload).toString("base64url")}`;
}

export function verifyToken(token: string): z.infer<typeof tokenPayloadSchema> | null {
  const [payload, encodedSignature, extra] = token.split(".");
  if (!payload || !encodedSignature || extra !== undefined) return null;
  let received: Buffer;
  try {
    received = Buffer.from(encodedSignature, "base64url");
  } catch {
    return null;
  }
  const expected = signature(payload);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const json: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const parsed = tokenPayloadSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
