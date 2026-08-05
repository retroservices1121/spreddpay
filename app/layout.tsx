import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SpreddPay — Branded payout cards for funded trading firms",
  description: "Embedded payout infrastructure for funded trading platforms."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
