"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { copy } from "@/lib/copy";

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <div className="mx-auto min-h-screen max-w-7xl px-4 pb-24 sm:px-6">
    <header className="sticky top-0 z-40 -mx-4 mb-8 flex items-center justify-between border-b border-white/[0.08] bg-noir/80 px-4 py-4 backdrop-blur-xl sm:-mx-6 sm:px-6">
      <Link href="/" className="font-display text-sm tracking-[0.25em] text-lime">{copy.brand}</Link>
      <nav className="hidden items-center gap-6 text-sm text-white/60 md:flex"><Link className={pathname === "/explore" ? "text-lime" : ""} href="/explore">Explore</Link><Link href="/me">My bookings</Link></nav>
      <Link href="/login" className="rounded-full border border-white/10 px-3 py-2 text-xs text-white/70">Sign in</Link>
    </header>
    <main>{children}</main>
    <nav className="fixed bottom-3 left-3 right-3 z-40 flex justify-around rounded-2xl border border-white/10 bg-[#101418]/90 p-3 text-xs text-white/60 backdrop-blur-xl md:hidden"><Link href="/explore">Explore</Link><Link href="/me">Bookings</Link><Link href="/owner">Owner</Link></nav>
  </div>;
}
