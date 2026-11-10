import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "@lichess-org/chessground/assets/chessground.base.css";
import "@lichess-org/chessground/assets/chessground.cburnett.css";
import "@lichess-org/chessground/assets/chessground.brown.css";
import { Analytics } from "@vercel/analytics/next";
import { ViewTransition } from "react";
import SiteHeader from "./components/SiteHeader";
import { SITE_DESCRIPTION, SITE_NAME, getSiteUrl } from "./lib/site";

const siteUrl = getSiteUrl();
const geistSans = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-app-sans",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-app-mono",
});

// Runs before paint so a leaderboard deep link doesn't flash the puzzle view first.
const TAB_SCRIPT = `try{var tab=new URLSearchParams(location.search).get("tab");if(tab==="benchmark"||tab==="leaderboard"||location.hash==="#benchmarks")document.documentElement.dataset.benchTab="leaderboard"}catch(e){}`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: SITE_NAME,
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#121110",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The head script sets data-bench-tab before hydration; suppress the attribute mismatch.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TAB_SCRIPT }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} bg-[var(--background)] font-sans text-[var(--text-primary)] antialiased`}>
        <div className="mx-auto flex min-h-dvh w-full max-w-[1500px] flex-col px-3 pt-4 pb-6 sm:px-5 sm:pt-5 sm:pb-8 lg:px-8 xl:px-10">
          {/* Outside the transition, so it stays put while pages crossfade beneath it. */}
          <SiteHeader />
          <ViewTransition default="page-fade">
            <main className="flex min-w-0 flex-1 flex-col">{children}</main>
          </ViewTransition>
        </div>
        <Analytics />
      </body>
    </html>
  );
}
