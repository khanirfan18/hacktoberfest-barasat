import { NextResponse } from "next/server";

export function GET() {
  if (process.env.SENTRY_TEST !== "1") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  throw new Error("Sentry test exception");
}
