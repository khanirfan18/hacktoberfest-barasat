import Link from "next/link";
import { signIn, demoSignIn } from "../actions";
import { NeonButton, GlassCard, SectionTitle } from "@/components/ui-gg";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const params = await searchParams;
  const next = typeof params.next === "string" && params.next.startsWith("/") && !params.next.startsWith("//") ? params.next : "";
  const demo = process.env.NEXT_PUBLIC_DEMO === "1";
  return <div className="mx-auto max-w-md py-12"><SectionTitle eyebrow="Welcome back" title="Sign in to GymGo" /><GlassCard className="p-6"><form action={signIn} className="space-y-4"><input type="hidden" name="next" value={next} /><input name="email" type="email" required placeholder="you@example.com" className="w-full rounded-xl border border-white/10 bg-white/5 p-3 outline-none" /><input name="password" type="password" required placeholder="Password" className="w-full rounded-xl border border-white/10 bg-white/5 p-3 outline-none" /><NeonButton className="w-full" type="submit">Sign in</NeonButton></form>{demo && <div className="mt-6 border-t border-white/10 pt-5"><p className="mb-3 text-xs text-white/50">DEMO ACCESS</p><div className="grid gap-2 sm:grid-cols-3">{(["traveller", "owner", "admin"] as const).map((role) => <form action={demoSignIn} key={role}><input type="hidden" name="role" value={role} /><input type="hidden" name="next" value={next} /><button className="w-full rounded-xl border border-white/10 px-3 py-2 text-xs capitalize hover:border-lime/50">{role}</button></form>)}</div></div>}<p className="mt-6 text-center text-sm text-white/50">New here? <Link className="text-lime" href="/signup">Create an account</Link></p></GlassCard></div>;
}
