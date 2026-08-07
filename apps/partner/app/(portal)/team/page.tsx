import { Badge, Card, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@spreddpay/ui";
import { apiFetch, requireSession } from "@/lib/api";

export const dynamic = "force-dynamic";

interface TeamMember {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  mfaEnabled: boolean;
  roles: string[];
  lastLoginAt: string | null;
}

export default async function TeamPage() {
  const session = await requireSession();

  if (!session.user.permissions.includes("team:manage")) {
    return (
      <>
        <PageHeader title="Team" />
        <Card>
          <EmptyState
            title="Not available"
            description="Managing team members requires the team:manage permission."
          />
        </Card>
      </>
    );
  }

  const team = await apiFetch<{ data: TeamMember[] }>(`/partners/${session.partnerId}/team`);

  return (
    <>
      <PageHeader
        title="Team"
        description="Who can create payouts, approve them and manage your program."
      />

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Member</Th>
              <Th>Roles</Th>
              <Th>MFA</Th>
              <Th>Status</Th>
              <Th>Last sign-in</Th>
            </tr>
          </thead>
          <tbody>
            {team.data.map((member) => (
              <tr key={member.id}>
                <Td>
                  <div className="font-medium">
                    {member.firstName} {member.lastName}
                  </div>
                  <div className="text-xs text-ink-subtle">{member.email}</div>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {member.roles.map((role) => (
                      <Badge key={role} tone="brand">
                        {role.replace(/_/g, " ").toLowerCase()}
                      </Badge>
                    ))}
                  </div>
                </Td>
                <Td>
                  {member.mfaEnabled ? (
                    <Badge tone="positive">on</Badge>
                  ) : (
                    <Badge tone="caution">off</Badge>
                  )}
                </Td>
                <Td>
                  <StatusBadge status={member.status} />
                </Td>
                <Td className="text-ink-muted">
                  {member.lastLoginAt ? new Date(member.lastLoginAt).toLocaleString() : "Never"}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
