import type { AuditEventDto } from "@spreddpay/contracts";
import { Card, EmptyState, PageHeader, Table, Td, Th } from "@spreddpay/ui";
import { apiFetch, requireOperator } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  await requireOperator();
  const audit = await apiFetch<{ data: AuditEventDto[] }>("/admin/audit?limit=100");

  return (
    <>
      <PageHeader
        title="Audit"
        description="Immutable record of every financial and administrative mutation."
      />

      <Card>
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
                <Th>IP</Th>
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
                  <Td className="tabular text-xs text-ink-subtle">{event.ipAddress ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
