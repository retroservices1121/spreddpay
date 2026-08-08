import { Badge, Callout, Card, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@spreddpay/ui";
import { apiFetch, requireSession } from "@/lib/api";
import { InviteMemberForm, MemberActions } from "./manage";

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
            description="Managing team members requires the team:manage permission, held by owners and admins."
          />
        </Card>
      </>
    );
  }

  const team = await apiFetch<{ data: TeamMember[] }>(`/partners/${session.partnerId}/team`);

  const creators = team.data.filter(
    (m) => m.status === "ACTIVE" && m.roles.some((r) => r === "PAYOUT_CREATOR" || r === "PARTNER_OWNER"),
  ).length;
  const approvers = team.data.filter(
    (m) => m.status === "ACTIVE" && m.roles.some((r) => r === "PAYOUT_APPROVER" || r === "PARTNER_OWNER"),
  ).length;

  return (
    <>
      <PageHeader
        title="Team"
        description="Who can create payouts, approve them and manage your program."
        actions={<InviteMemberForm partnerId={session.partnerId} />}
      />

      {/*
        Dual approval needs two different people. A firm with an approver but no
        second person to create — or vice versa — cannot release a high-value
        payout at all, and it is better to say so here than to discover it at
        the moment a payout is stuck.
      */}
      {approvers === 0 ? (
        <div className="mb-6">
          <Callout tone="caution" title="No active approver">
            Payouts above your dual-approval threshold cannot be released until someone holds the
            payout approver role.
          </Callout>
        </div>
      ) : creators > 0 && approvers === 1 && creators === 1 ? (
        <div className="mb-6">
          <Callout tone="caution" title="Only one approver">
            If that person is unavailable, high-value payouts cannot be approved. Consider a second.
          </Callout>
        </div>
      ) : null}

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Member</Th>
              <Th>Roles</Th>
              <Th>MFA</Th>
              <Th>Status</Th>
              <Th>Last sign-in</Th>
              <Th />
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
                    <Badge tone="neutral">off</Badge>
                  )}
                </Td>
                <Td>
                  <StatusBadge status={member.status} />
                </Td>
                <Td className="text-ink-muted">
                  {member.lastLoginAt ? new Date(member.lastLoginAt).toLocaleString() : "Never"}
                </Td>
                <Td>
                  <MemberActions
                    partnerId={session.partnerId}
                    member={member}
                    isSelf={member.id === session.user.id}
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <p className="mt-4 max-w-2xl text-xs text-ink-subtle">
        One person cannot hold both payout creator and payout approver. Dual approval compares
        users, so that combination would let a single account approve its own work.
      </p>
    </>
  );
}
