import type { Metadata } from "next";
import "./globals.css";
import { AppProviders } from "../src/providers/app-providers";

export const metadata: Metadata = {
  title: "Hypermarket",
  description: "Hyperliquid for Polymarket."
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
