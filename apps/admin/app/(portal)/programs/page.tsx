import Link from "next/link";
import type { PartnerDto } from "@spreddpay/contracts";
import { Card, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@spreddpay/ui";
import { apiFetch, requireOperator } from "@/lib/api";

export const dynamic = "force-dynamic";

type PartnerRow = PartnerDto & { productName: string };

/**
 * Program configuration lives on the partner record. This is the index; limits
 * and eligibility are edited per partner.
 */
export default async function ProgramsPage() {
  await requireOperator();
  const partners = await apiFetch<{ data: PartnerRow[] }>("/admin/partners");

  return (
    <>
      <PageHeader
        title="Programs"
        description="Provider program linkage and operational limits, per partner."
      />

      <Card>
        {partners.data.length === 0 ? (
          <EmptyState title="No programs yet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Partner</Th>
                <Th>Product</Th>
                <Th>Asset</Th>
                <Th>Provider program id</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {partners.data.map((partner) => (
                <tr key={partner.id}>
                  <Td>
                    <Link
                      href={`/partners/${partner.id}`}
                      className="font-medium text-brand-secondary"
                    >
                      {partner.displayName}
                    </Link>
                  </Td>
                  <Td>{partner.productName}</Td>
                  <Td className="tabular">
                    {partner.defaultAsset} / {partner.defaultNetwork}
                  </Td>
                  <Td className="tabular text-ink-muted">
                    {partner.rainProgramId ?? "Not yet issued"}
                  </Td>
                  <Td>
                    <StatusBadge status={partner.status} />
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
