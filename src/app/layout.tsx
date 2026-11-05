import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import type { ReactNode } from "react";
import { SITE } from "@/config/site";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-bricolage",
  display: "swap",
});

export const metadata: Metadata = {
  title: SITE.name,
  description: SITE.description,
  metadataBase: new URL(SITE.url),
  authors: [{ name: SITE.author, url: SITE.authorUrl }],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={bricolage.variable}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
