import { requireOperator } from "@/lib/api";
import { OpsShell } from "./shell";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await requireOperator();

  return (
    <OpsShell
      userName={`${session.user.firstName} ${session.user.lastName}`}
      userSublabel={session.user.platformRoles.join(", ").replace(/_/g, " ").toLowerCase()}
    >
      {children}
    </OpsShell>
  );
}
