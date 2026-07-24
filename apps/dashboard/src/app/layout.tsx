import type { Metadata } from "next";
import { Anton, Barlow_Condensed, Space_Mono } from "next/font/google";
import "./globals.css";

// Display face — same Impact stand-in the poster renderer uses, so the OS reads
// as the same brand system as the posters it produces.
const anton = Anton({
  variable: "--font-anton",
  weight: "400",
  subsets: ["latin"],
});

// Condensed grotesque for headings / labels.
const barlow = Barlow_Condensed({
  variable: "--font-head",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

// Mono for serials, tags, data.
const spaceMono = Space_Mono({
  variable: "--font-mono",
  weight: ["400", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Club OS — Amaze Live",
  description: "AI Operating System for nightlife: posters, video, guests, revenue, growth and city intelligence.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${anton.variable} ${barlow.variable} ${spaceMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
