import { Badge, Card, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@spreddpay/ui";
import { apiFetch, requireOperator } from "@/lib/api";

export const dynamic = "force-dynamic";

interface ProviderEvent {
  id: string;
  provider: string;
  providerEventId: string;
  eventType: string;
  status: string;
  signatureValid: boolean;
  attempts: number;
  lastError: string | null;
  receivedAt: string;
  processedAt: string | null;
}

export default async function ProviderEventsPage() {
  await requireOperator();
  const events = await apiFetch<{ data: ProviderEvent[] }>("/admin/provider-events?limit=100");

  return (
    <>
      <PageHeader
        title="Provider events"
        description="Raw provider webhooks. Stored before processing, deduplicated by provider event id, never deleted."
      />

      <Card>
        {events.data.length === 0 ? (
          <EmptyState
            title="No provider events yet"
            description="Inbound webhooks appear here as soon as they are received."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Event</Th>
                <Th>Provider</Th>
                <Th>Signature</Th>
                <Th>Status</Th>
                <Th className="text-right">Attempts</Th>
                <Th>Received</Th>
              </tr>
            </thead>
            <tbody>
              {events.data.map((event) => (
                <tr key={event.id}>
                  <Td>
                    <div className="font-medium">{event.eventType}</div>
                    <div className="tabular text-xs text-ink-subtle">{event.providerEventId}</div>
                    {event.lastError ? (
                      <div className="mt-1 max-w-md text-xs text-critical">{event.lastError}</div>
                    ) : null}
                  </Td>
                  <Td>{event.provider}</Td>
                  <Td>
                    {event.signatureValid ? (
                      <Badge tone="positive">valid</Badge>
                    ) : (
                      <Badge tone="critical">invalid</Badge>
                    )}
                  </Td>
                  <Td>
                    <StatusBadge status={event.status} />
                  </Td>
                  <Td className="tabular text-right">{event.attempts}</Td>
                  <Td className="whitespace-nowrap text-ink-muted">
                    {new Date(event.receivedAt).toLocaleString()}
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
