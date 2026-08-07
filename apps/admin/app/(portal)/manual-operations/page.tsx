import { Card, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@spreddpay/ui";
import { apiFetch, requireOperator } from "@/lib/api";
import { OperationActions } from "./actions";

export const dynamic = "force-dynamic";

interface ManualOperation {
  id: string;
  kind: string;
  status: string;
  summary: string;
  detail: string | null;
  partnerName: string | null;
  owner: string | null;
  providerReference: string | null;
  createdAt: string;
  completedAt: string | null;
}

/**
 * The operations queue. Anything the platform could not complete automatically
 * lands here with an owner, evidence and a completion record — per
 * TECHNICAL_README section 12, manual provider work is tracked, not improvised.
 */
export default async function ManualOperationsPage() {
  await requireOperator();
  const operations = await apiFetch<{ data: ManualOperation[] }>("/admin/manual-operations");

  const open = operations.data.filter((operation) =>
    ["OPEN", "IN_PROGRESS", "BLOCKED"].includes(operation.status),
  );

  return (
    <>
      <PageHeader
        title="Manual operations"
        description={`${open.length} open. Work that needs a human before it can complete.`}
      />

      <Card>
        {operations.data.length === 0 ? (
          <EmptyState
            title="Nothing in the queue"
            description="Manual operations appear when an automated step cannot complete."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Operation</Th>
                <Th>Partner</Th>
                <Th>Owner</Th>
                <Th>Status</Th>
                <Th>Created</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {operations.data.map((operation) => (
                <tr key={operation.id}>
                  <Td>
                    <div className="font-medium">{operation.summary}</div>
                    <div className="text-xs text-ink-subtle">{operation.kind}</div>
                    {operation.detail ? (
                      <div className="mt-1 max-w-md text-xs text-ink-muted">{operation.detail}</div>
                    ) : null}
                  </Td>
                  <Td>{operation.partnerName ?? "—"}</Td>
                  <Td className="text-ink-muted">{operation.owner ?? "Unassigned"}</Td>
                  <Td>
                    <StatusBadge status={operation.status} />
                  </Td>
                  <Td className="whitespace-nowrap text-ink-muted">
                    {new Date(operation.createdAt).toLocaleDateString()}
                  </Td>
                  <Td>
                    <OperationActions id={operation.id} status={operation.status} />
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
