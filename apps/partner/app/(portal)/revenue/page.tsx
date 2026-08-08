import type { MoneyDto } from "@spreddpay/contracts";
import {
  Callout,
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  Stat,
  Table,
  Td,
  Th,
} from "@spreddpay/ui";
import { apiFetch, requireSession } from "@/lib/api";

export const dynamic = "force-dynamic";

interface RevenueResponse {
  rules: {
    id: string;
    source: string;
    calculationType: string;
    spreddPayShareBps: number | null;
    partnerShareBps: number | null;
    effectiveFrom: string;
    effectiveTo: string | null;
  }[];
  totals: { gross: MoneyDto; spreddPay: MoneyDto; partner: MoneyDto };
  events: {
    id: string;
    source: string;
    occurredAt: string;
    gross: MoneyDto;
    spreddPay: MoneyDto;
    partner: MoneyDto;
    realized: boolean;
  }[];
}

export default async function RevenuePage() {
  const session = await requireSession();
  const revenue = await apiFetch<RevenueResponse>(`/partners/${session.partnerId}/revenue`);

  return (
    <>
      <PageHeader
        title="Revenue"
        description="Realized revenue split between Spredd Pay and your firm."
      />

      <div className="mb-6">
        <Callout tone="neutral" title="Configurable, not assumed">
          Revenue rules are configuration, not hard-coded economics. Provider commercial terms
          are applied once confirmed; only realized revenue is recognised here.
        </Callout>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Gross" value={revenue.totals.gross.display} />
        <Stat label="Spredd Pay share" value={revenue.totals.spreddPay.display} />
        <Stat label="Your share" value={revenue.totals.partner.display} tone="positive" />
      </div>

      <div className="mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Revenue rules</CardTitle>
          </CardHeader>
          {revenue.rules.length === 0 ? (
            <EmptyState
              title="No revenue rules configured"
              description="Rules are set by Spredd Pay operations once commercial terms are agreed."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Source</Th>
                  <Th>Calculation</Th>
                  <Th className="text-right">Spredd Pay</Th>
                  <Th className="text-right">Partner</Th>
                  <Th>Effective</Th>
                </tr>
              </thead>
              <tbody>
                {revenue.rules.map((rule) => (
                  <tr key={rule.id}>
                    <Td>{rule.source}</Td>
                    <Td className="text-ink-muted">
                      {rule.calculationType.replace(/_/g, " ").toLowerCase()}
                    </Td>
                    <Td className="tabular text-right">
                      {rule.spreddPayShareBps === null ? "—" : `${rule.spreddPayShareBps / 100}%`}
                    </Td>
                    <Td className="tabular text-right">
                      {rule.partnerShareBps === null ? "—" : `${rule.partnerShareBps / 100}%`}
                    </Td>
                    <Td className="text-ink-muted">
                      {new Date(rule.effectiveFrom).toLocaleDateString()}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revenue events</CardTitle>
        </CardHeader>
        {revenue.events.length === 0 ? (
          <EmptyState
            title="No revenue recognised yet"
            description="Events appear once a provider statement has been imported and matched."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Source</Th>
                <Th className="text-right">Gross</Th>
                <Th className="text-right">Spredd Pay</Th>
                <Th className="text-right">Partner</Th>
                <Th>Occurred</Th>
              </tr>
            </thead>
            <tbody>
              {revenue.events.map((event) => (
                <tr key={event.id}>
                  <Td>{event.source}</Td>
                  <Td className="tabular text-right">{event.gross.display}</Td>
                  <Td className="tabular text-right">{event.spreddPay.display}</Td>
                  <Td className="tabular text-right">{event.partner.display}</Td>
                  <Td className="text-ink-muted">
                    {new Date(event.occurredAt).toLocaleDateString()}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
