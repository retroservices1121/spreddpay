"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppShell, Button, type NavSection } from "@spreddpay/ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Admin portal navigation, matching TECHNICAL_README section 15. */
const SECTIONS: NavSection[] = [
  {
    items: [
      { href: "/partners", label: "Partners" },
      { href: "/programs", label: "Programs" },
      { href: "/users", label: "Users" },
    ],
  },
  {
    title: "Operations",
    items: [
      { href: "/payouts", label: "Payouts" },
      { href: "/manual-operations", label: "Manual operations" },
      { href: "/provider-events", label: "Provider events" },
      { href: "/reconciliation", label: "Reconciliation" },
      { href: "/support", label: "Support" },
    ],
  },
  {
    title: "Oversight",
    items: [
      { href: "/revenue", label: "Revenue" },
      { href: "/audit", label: "Audit" },
      { href: "/system", label: "System" },
    ],
  },
];

export function OpsShell({
  userName,
  userSublabel,
  children,
}: {
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
      productName="SpreddPay Ops"
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
