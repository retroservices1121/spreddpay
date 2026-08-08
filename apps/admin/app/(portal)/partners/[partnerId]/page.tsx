import type { MoneyDto, PartnerDto } from "@spreddpay/contracts";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Callout,
  PageHeader,
  StatusBadge,
  Table,
  Td,
  Th,
} from "@spreddpay/ui";
import { apiFetch, requireOperator } from "@/lib/api";

export const dynamic = "force-dynamic";

interface PartnerDetail {
  partner: PartnerDto;
  programs: {
    id: string;
    provider: string;
    providerProgramId: string | null;
    asset: string;
    network: string;
    active: boolean;
    supportedCountries: string[];
    dualApprovalThreshold: MoneyDto;
    partnerDailyLimit: MoneyDto;
    singlePayoutMax: MoneyDto;
    minPayout: MoneyDto;
  }[];
  users: { id: string; email: string; name: string; status: string; roles: string[] }[];
}

export default async function PartnerDetailPage({
  params,
}: {
  params: Promise<{ partnerId: string }>;
}) {
  const { partnerId } = await params;
  await requireOperator();

  const detail = await apiFetch<PartnerDetail>(`/admin/partners/${partnerId}`);

  return (
    <>
      <PageHeader
        title={detail.partner.displayName}
        description={`${detail.partner.legalName} · ${detail.partner.slug}`}
      />

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Partner</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="grid grid-cols-[auto,1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-ink-subtle">Status</dt>
              <dd>
                <StatusBadge status={detail.partner.status} />
              </dd>
              <dt className="text-ink-subtle">Provider program</dt>
              <dd className="tabular">{detail.partner.rainProgramId ?? "Not yet issued"}</dd>
              <dt className="text-ink-subtle">Default asset</dt>
              <dd className="tabular">
                {detail.partner.defaultAsset} on {detail.partner.defaultNetwork}
              </dd>
              <dt className="text-ink-subtle">Support email</dt>
              <dd>{detail.partner.supportEmail}</dd>
            </dl>
          </CardBody>
        </Card>

        {detail.programs.map((program) => (
          <Card key={program.id}>
            <CardHeader>
              <CardTitle>{program.provider} program</CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="grid grid-cols-[auto,1fr] gap-x-6 gap-y-2 text-sm">
                <dt className="text-ink-subtle">Provider program id</dt>
                <dd className="tabular">{program.providerProgramId ?? "—"}</dd>
                <dt className="text-ink-subtle">Dual-approval threshold</dt>
                <dd className="tabular">{program.dualApprovalThreshold.display}</dd>
                <dt className="text-ink-subtle">24-hour partner limit</dt>
                <dd className="tabular">{program.partnerDailyLimit.display}</dd>
                <dt className="text-ink-subtle">Single payout max</dt>
                <dd className="tabular">{program.singlePayoutMax.display}</dd>
                <dt className="text-ink-subtle">Minimum payout</dt>
                <dd className="tabular">{program.minPayout.display}</dd>
                <dt className="text-ink-subtle">Supported countries</dt>
                <dd>
                  {program.supportedCountries.length === 0 ? (
                    <span className="text-critical">
                      None configured — trader invitations are refused
                    </span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {program.supportedCountries.map((country) => (
                        <Badge key={country}>{country}</Badge>
                      ))}
                    </div>
                  )}
                </dd>
              </dl>

              {program.providerProgramId === null ? (
                <div className="mt-4">
                  <Callout tone="caution" title="No provider program id">
                    The provider has not issued a program id for this partner yet. Payouts run against the
                    configured integration mode until it is set.
                  </Callout>
                </div>
              ) : null}
            </CardBody>
          </Card>
        ))}

        <Card>
          <CardHeader>
            <CardTitle>Partner users</CardTitle>
          </CardHeader>
          <Table>
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Roles</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {detail.users.map((user) => (
                <tr key={user.id}>
                  <Td>
                    <div className="font-medium">{user.name}</div>
                    <div className="text-xs text-ink-subtle">{user.email}</div>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {user.roles.map((role) => (
                        <Badge key={role} tone="brand">
                          {role.replace(/_/g, " ").toLowerCase()}
                        </Badge>
                      ))}
                    </div>
                  </Td>
                  <Td>
                    <StatusBadge status={user.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
