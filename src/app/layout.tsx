import type { Metadata } from "next";
import { JetBrains_Mono, Manrope, Unbounded } from "next/font/google";
import "./globals.css";
import { SiteChrome } from "@/components/ui-gg/SiteChrome";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
const unbounded = Unbounded({ subsets: ["latin"], variable: "--font-unbounded" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "GymGo — Your gym, wherever you land",
  description: "Find your next training ground in any city.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${manrope.variable} ${unbounded.variable} ${jetbrains.variable}`}>
      <body><SiteChrome>{children}</SiteChrome></body>
    </html>
  );
}
