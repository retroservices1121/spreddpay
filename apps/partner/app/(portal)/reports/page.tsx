import type { AuditEventDto } from "@spreddpay/contracts";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
} from "@spreddpay/ui";
import { API_URL, apiFetch, requireSession } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const session = await requireSession();
  const audit = await apiFetch<{ data: AuditEventDto[] }>(
    `/partners/${session.partnerId}/audit?limit=50`,
  );

  return (
    <>
      <PageHeader
        title="Reports"
        description="Exports and the audit trail for your program."
        actions={
          session.user.permissions.includes("transaction:export") ? (
            <a
              href={`${API_URL}/api/v1/partners/${session.partnerId}/transactions.csv`}
              target="_blank"
              rel="noreferrer"
            >
              <Button variant="secondary">Transactions CSV</Button>
            </a>
          ) : null
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Audit trail</CardTitle>
        </CardHeader>
        {audit.data.length === 0 ? (
          <EmptyState title="No audit events yet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Actor</Th>
                <Th>Action</Th>
                <Th>Summary</Th>
              </tr>
            </thead>
            <tbody>
              {audit.data.map((event) => (
                <tr key={event.id}>
                  <Td className="whitespace-nowrap text-ink-muted">
                    {new Date(event.createdAt).toLocaleString()}
                  </Td>
                  <Td>
                    <div>{event.actorLabel ?? "System"}</div>
                    <div className="text-xs text-ink-subtle">
                      {event.actorType.replace(/_/g, " ").toLowerCase()}
                    </div>
                  </Td>
                  <Td className="tabular text-xs">{event.action}</Td>
                  <Td>{event.summary}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
