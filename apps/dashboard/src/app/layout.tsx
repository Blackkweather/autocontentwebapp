import type { Metadata } from "next";
import { Geist, Geist_Mono, Anton } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Same face the poster renderer stands in for Impact with (see src/lib/poster/fonts.ts) —
// used here so the admin UI reads as the same brand system as the posters it produces.
const anton = Anton({
  variable: "--font-anton",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Amaze Live — Poster Pipeline",
  description: "Automated on-brand poster generation for Amaze Live events.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${anton.variable}`}>
      <body>{children}</body>
    </html>
  );
}
