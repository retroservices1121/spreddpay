import Link from "next/link";
import type { PartnerDto } from "@spreddpay/contracts";
import { Badge, Card, PageHeader, StatusBadge, Table, Td, Th } from "@spreddpay/ui";
import { apiFetch, requireOperator } from "@/lib/api";

export const dynamic = "force-dynamic";

type PartnerRow = PartnerDto & { productName: string };

interface PartnerDetail {
  partner: PartnerDto;
  users: { id: string; email: string; name: string; status: string; roles: string[] }[];
}

/** Every partner user across the platform, for support and access review. */
export default async function UsersPage() {
  const session = await requireOperator();
  const partners = await apiFetch<{ data: PartnerRow[] }>("/admin/partners");

  const details = await Promise.all(
    partners.data.map((partner) =>
      apiFetch<PartnerDetail>(`/admin/partners/${partner.id}`).catch(() => null),
    ),
  );

  const rows = details
    .filter((detail): detail is PartnerDetail => detail !== null)
    .flatMap((detail) =>
      detail.users.map((user) => ({ ...user, partner: detail.partner })),
    );

  return (
    <>
      <PageHeader
        title="Users"
        description={`Partner users across the platform. You are signed in as ${session.user.email}.`}
      />

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>User</Th>
              <Th>Partner</Th>
              <Th>Roles</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <Td>
                  <div className="font-medium">{row.name}</div>
                  <div className="text-xs text-ink-subtle">{row.email}</div>
                </Td>
                <Td>
                  <Link href={`/partners/${row.partner.id}`} className="text-brand-secondary">
                    {row.partner.displayName}
                  </Link>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {row.roles.map((role) => (
                      <Badge key={role} tone="brand">
                        {role.replace(/_/g, " ").toLowerCase()}
                      </Badge>
                    ))}
                  </div>
                </Td>
                <Td>
                  <StatusBadge status={row.status} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
