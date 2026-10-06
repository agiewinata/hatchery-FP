import type { Metadata } from "next";
import { Bricolage_Grotesque, Public_Sans } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

/**
 * Display face. Bricolage Grotesque has variable width and optical-size axes
 * and a deliberate wonkiness that reads like artist-alley poster lettering -
 * chosen over the usual neutral grotesques because the storefront is selling
 * other people's artwork and needs its own voice without shouting.
 */
const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

/**
 * Body face. Public Sans is plain and slightly utilitarian, which keeps prices,
 * specifications and order statuses legible at small sizes.
 */
const body = Public_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Keychain - charms, pins and memorabilia by independent artists",
    template: "%s - Keychain",
  },
  description:
    "Buy acrylic charms, enamel pins and stickers from independent artists. We print and ship, or the artist does.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {children}
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
