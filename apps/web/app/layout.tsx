import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  // The trader sees the partner's product, so the title is set per-page from
  // branding rather than hardcoded to SpreddPay.
  title: "Your payout account",
  description: "Receive a payout and make it ready to spend.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
