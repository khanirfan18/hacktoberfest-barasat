import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { GlassCard, SectionTitle, StatTile } from "@/components/ui-gg";
export const dynamic = "force-dynamic";
export default async function OwnerPage() { await requireRole("owner"); return <div className="py-8"><SectionTitle eyebrow="Owner HQ" title="Your floor, your rules." /><div className="grid gap-3 sm:grid-cols-3"><StatTile label="Today's visits" value="24" /><StatTile label="Bookings" value="08" /><StatTile label="Rating" value="4.8" /></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><Link href="/owner/scan"><GlassCard className="p-6"><p className="font-display text-xl text-lime">Scan entry ↗</p><p className="mt-2 text-sm text-white/50">Validate a member pass.</p></GlassCard></Link><Link href="/owner/edit"><GlassCard className="p-6"><p className="font-display text-xl">Edit your gym ↗</p><p className="mt-2 text-sm text-white/50">Keep your listing fresh.</p></GlassCard></Link></div></div>; }
