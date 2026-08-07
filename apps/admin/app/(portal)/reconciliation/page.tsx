import { Badge, Callout, Card, PageHeader, Table, Td, Th } from "@spreddpay/ui";
import { apiFetch, requireOperator } from "@/lib/api";

export const dynamic = "force-dynamic";

interface ReconciliationRow {
  partnerId: string;
  partnerName: string;
  balanced: boolean;
  debitsMinor: string | null;
  creditsMinor: string | null;
  error: string | null;
}

/**
 * Ledger integrity. Every partner's postings must sum to zero; the provider
 * balance is separately the source of truth and is reconciled against, never
 * overwritten by, these figures.
 */
export default async function ReconciliationPage() {
  await requireOperator();
  const result = await apiFetch<{ data: ReconciliationRow[] }>("/admin/reconciliation");

  const failing = result.data.filter((row) => !row.balanced);

  return (
    <>
      <PageHeader
        title="Reconciliation"
        description="Double-entry integrity check across every partner's books."
      />

      <div className="mb-6">
        {failing.length === 0 ? (
          <Callout tone="positive" title="All books balance">
            Debits equal credits for every partner.
          </Callout>
        ) : (
          <Callout tone="critical" title={`${failing.length} partner(s) out of balance`}>
            An imbalance is never corrected automatically. Investigate and post a reversing entry.
          </Callout>
        )}
      </div>

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Partner</Th>
              <Th>Result</Th>
              <Th className="text-right">Debits (minor)</Th>
              <Th className="text-right">Credits (minor)</Th>
            </tr>
          </thead>
          <tbody>
            {result.data.map((row) => (
              <tr key={row.partnerId}>
                <Td>{row.partnerName}</Td>
                <Td>
                  {row.balanced ? (
                    <Badge tone="positive">balanced</Badge>
                  ) : (
                    <div>
                      <Badge tone="critical">out of balance</Badge>
                      {row.error ? (
                        <div className="mt-1 max-w-md text-xs text-critical">{row.error}</div>
                      ) : null}
                    </div>
                  )}
                </Td>
                <Td className="tabular text-right">{row.debitsMinor ?? "—"}</Td>
                <Td className="tabular text-right">{row.creditsMinor ?? "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
