"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";

const credentials = z.object({ email: z.string().email(), password: z.string().min(8) });
function safeDestination(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/explore";
  try {
    const destination = new URL(value, "https://gymgo.invalid");
    return destination.origin === "https://gymgo.invalid" ? `${destination.pathname}${destination.search}${destination.hash}` : "/explore";
  } catch {
    return "/explore";
  }
}

export async function signIn(formData: FormData) {
  const destination = safeDestination(formData.get("next"));
  const parsed = credentials.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/login?next=${encodeURIComponent(destination)}`);
  const supabase = await createServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) redirect(`/login?next=${encodeURIComponent(destination)}`);
  redirect(destination);
}
export async function signUp(formData: FormData) {
  const parsed = credentials.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/signup");
  const supabase = await createServerClient();
  const { error } = await supabase.auth.signUp(parsed.data);
  if (error) redirect("/signup");
  redirect("/explore");
}
export async function demoSignIn(formData: FormData) {
  const role = z.enum(["traveller", "owner", "admin"]).parse(formData.get("role"));
  const requestedDestination = safeDestination(formData.get("next"));
  const destination = requestedDestination !== "/explore"
    ? requestedDestination
    : role === "owner" ? "/owner" : role === "admin" ? "/admin" : "/me";
  const email = `${role === "traveller" ? "traveller" : role}@gymgo.demo`;
  const supabase = await createServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: process.env.DEMO_PASSWORD! });
  if (error) redirect("/login");
  redirect(destination);
}
