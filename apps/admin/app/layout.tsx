import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SpreddPay Operations",
  description: "Partner programs, payouts, reconciliation and audit.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
