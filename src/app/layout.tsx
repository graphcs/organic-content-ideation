import type { Metadata } from "next";
import { Archivo, Newsreader } from "next/font/google";
import "./globals.css";

const sans = Archivo({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });
const serif = Newsreader({ subsets: ["latin"], weight: ["300", "400"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: "Outlier Workbench",
  description:
    "Harvest the Instagram home feed, rank posts by how far they beat their own account's baseline, dissect the hooks, and write copy from them.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
