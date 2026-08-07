"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppShell, Button, PoweredBy, type NavSection } from "@spreddpay/ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Trader portal navigation, matching TECHNICAL_README section 15. */
const SECTIONS: NavSection[] = [
  {
    items: [
      { href: "/dashboard", label: "Home" },
      { href: "/card", label: "Card" },
      { href: "/activity", label: "Activity" },
      { href: "/payouts", label: "Payouts" },
    ],
  },
  {
    items: [
      { href: "/settings", label: "Settings" },
      { href: "/support", label: "Support" },
    ],
  },
];

export function TraderShell({
  productName,
  logoUrl,
  poweredBySpreddPay,
  userName,
  userEmail,
  children,
}: {
  productName: string;
  logoUrl: string | null;
  poweredBySpreddPay: boolean;
  userName: string;
  userEmail: string;
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
      user={{ name: userName, sublabel: userEmail }}
      LinkComponent={Link}
      footer={
        <div className="flex flex-col gap-2">
          <Button variant="ghost" size="sm" onClick={signOut} className="px-0">
            Sign out
          </Button>
          <PoweredBy show={poweredBySpreddPay} />
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
