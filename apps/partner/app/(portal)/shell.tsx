"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppShell, Button, type NavSection } from "@spreddpay/ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Partner portal navigation, matching TECHNICAL_README section 15. */
const SECTIONS: NavSection[] = [
  {
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/traders", label: "Traders" },
      { href: "/payouts", label: "Payouts" },
      { href: "/cards", label: "Cards" },
      { href: "/transactions", label: "Transactions" },
    ],
  },
  {
    title: "Reporting",
    items: [
      { href: "/revenue", label: "Revenue" },
      { href: "/reports", label: "Reports" },
    ],
  },
  {
    title: "Configuration",
    items: [
      { href: "/branding", label: "Branding" },
      { href: "/api-keys", label: "API keys" },
      { href: "/webhooks", label: "Webhooks" },
      { href: "/team", label: "Team" },
      { href: "/settings", label: "Settings" },
    ],
  },
];

export function PortalShell({
  productName,
  logoUrl,
  userName,
  userSublabel,
  children,
}: {
  productName: string;
  logoUrl: string | null;
  userName: string;
  userSublabel: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await fetch(`${API_URL}/api/v1/auth/logout`, { method: "POST", credentials: "include" });
    router.push("/login");
    router.refresh();
  }

  return (
    <AppShell
      productName={productName}
      logoUrl={logoUrl}
      sections={SECTIONS}
      currentPath={pathname}
      user={{ name: userName, sublabel: userSublabel }}
      LinkComponent={Link}
      footer={
        <Button variant="ghost" size="sm" onClick={signOut} className="px-0">
          Sign out
        </Button>
      }
    >
      {children}
    </AppShell>
  );
}
