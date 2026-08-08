import { Badge, Callout, Card, CardBody, CardHeader, CardTitle, PageHeader, Table, Td, Th } from "@spreddpay/ui";
import { apiFetch, requireOperator } from "@/lib/api";

export const dynamic = "force-dynamic";

interface SystemResponse {
  integrationModes: { rain: string; blend: string };
  nodeEnv: string;
  featureFlags: {
    id: string;
    key: string;
    partnerId: string | null;
    enabled: boolean;
    description: string | null;
  }[];
}

export default async function SystemPage() {
  await requireOperator();
  const system = await apiFetch<SystemResponse>("/admin/system");

  const modeTone = (mode: string) =>
    mode === "production" ? "critical" : mode === "sandbox" ? "caution" : "neutral";

  return (
    <>
      <PageHeader title="System" description="Integration modes and feature flags." />

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Integration modes</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="grid grid-cols-[auto,1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-ink-subtle">Environment</dt>
              <dd className="tabular">{system.nodeEnv}</dd>
              <dt className="text-ink-subtle">Payments provider</dt>
              <dd>
                <Badge tone={modeTone(system.integrationModes.rain)}>
                  {system.integrationModes.rain}
                </Badge>
              </dd>
              <dt className="text-ink-subtle">Yield provider</dt>
              <dd>
                <Badge tone={modeTone(system.integrationModes.blend)}>
                  {system.integrationModes.blend}
                </Badge>
              </dd>
            </dl>

            <div className="mt-4">
              <Callout tone="neutral" title="Production is gated">
                Production mode is refused by both the environment schema and the provider factory
                until program, compliance, credentials, domains, webhooks and funds flow are
                approved.
              </Callout>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Feature flags</CardTitle>
          </CardHeader>
          <Table>
            <thead>
              <tr>
                <Th>Key</Th>
                <Th>Scope</Th>
                <Th>State</Th>
                <Th>Description</Th>
              </tr>
            </thead>
            <tbody>
              {system.featureFlags.map((flag) => (
                <tr key={flag.id}>
                  <Td className="tabular">{flag.key}</Td>
                  <Td className="text-ink-muted">{flag.partnerId ? "partner" : "global"}</Td>
                  <Td>
                    <Badge tone={flag.enabled ? "positive" : "neutral"}>
                      {flag.enabled ? "on" : "off"}
                    </Badge>
                  </Td>
                  <Td className="text-ink-muted">{flag.description ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
