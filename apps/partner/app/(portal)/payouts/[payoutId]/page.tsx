import Link from "next/link";
import type { PayoutDto } from "@spreddpay/contracts";
import {
  Badge,
  Callout,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  PageHeader,
  Stat,
  StatusBadge,
} from "@spreddpay/ui";
import { apiFetch, requireSession } from "@/lib/api";
import { PayoutActions } from "./actions";

export const dynamic = "force-dynamic";

interface PayoutDetail {
  payout: PayoutDto;
  approvals: { id: string; decision: string; note: string | null; by: string; createdAt: string }[];
}

export default async function PayoutDetailPage({
  params,
}: {
  params: Promise<{ payoutId: string }>;
}) {
  const { payoutId } = await params;
  const session = await requireSession();

  const { payout, approvals } = await apiFetch<PayoutDetail>(
    `/partners/${session.partnerId}/payouts/${payoutId}`,
  );

  const isSelfCreated = payout.initiatedByUserId === session.user.id;
  const blockedBySelfApproval = payout.requiresDualApproval && isSelfCreated;

  return (
    <>
      <PageHeader
        title={payout.externalReference}
        description={`${payout.amount.display} to ${payout.traderName}`}
        actions={
          <PayoutActions
            partnerId={session.partnerId}
            payoutId={payout.id}
            status={payout.status}
            canApprove={session.user.permissions.includes("payout:approve")}
            canCancel={session.user.permissions.includes("payout:cancel")}
            blockedBySelfApproval={blockedBySelfApproval}
          />
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Stat label="Amount" value={payout.amount.display} />
        <Stat label="Status" value={payout.status.replace(/_/g, " ").toLowerCase()} />
        <Stat label="Network" value={payout.network} />
        <Stat
          label="Approval"
          value={payout.requiresDualApproval ? "Dual required" : "Single"}
          tone={payout.requiresDualApproval ? "caution" : "neutral"}
        />
      </div>

      {blockedBySelfApproval && payout.status === "PENDING_APPROVAL" ? (
        <div className="mb-6">
          <Callout tone="caution" title="You created this payout">
            It is above the dual-approval threshold, so someone else on your team has to approve it.
          </Callout>
        </div>
      ) : null}

      {payout.failureMessage ? (
        <div className="mb-6">
          <Callout tone="critical" title={payout.failureCode ?? "Failed"}>
            {payout.failureMessage}
          </Callout>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="grid grid-cols-[auto,1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-ink-subtle">Trader</dt>
              <dd>
                <Link href={`/traders/${payout.traderId}`} className="text-brand-secondary">
                  {payout.traderName}
                </Link>
              </dd>

              <dt className="text-ink-subtle">Status</dt>
              <dd>
                <StatusBadge status={payout.status} />
              </dd>

              <dt className="text-ink-subtle">Operation mode</dt>
              <dd>
                {payout.operationMode === "AUTOMATED" ? (
                  <Badge tone="neutral">automated</Badge>
                ) : (
                  <Badge tone="caution">{payout.operationMode.replace(/_/g, " ").toLowerCase()}</Badge>
                )}
              </dd>

              <dt className="text-ink-subtle">Created by</dt>
              <dd>{payout.initiatedByName ?? payout.initiatedByUserId}</dd>

              <dt className="text-ink-subtle">Approved by</dt>
              <dd>{payout.approvedByName ?? "—"}</dd>

              <dt className="text-ink-subtle">Rain transfer</dt>
              <dd className="tabular break-all">{payout.rainTransferId ?? "—"}</dd>

              <dt className="text-ink-subtle">Transaction hash</dt>
              <dd className="tabular break-all text-xs">{payout.blockchainTxHash ?? "—"}</dd>

              <dt className="text-ink-subtle">Created</dt>
              <dd>{new Date(payout.createdAt).toLocaleString()}</dd>

              <dt className="text-ink-subtle">Completed</dt>
              <dd>{payout.completedAt ? new Date(payout.completedAt).toLocaleString() : "—"}</dd>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Approval trail</CardTitle>
          </CardHeader>
          <CardBody>
            {approvals.length === 0 ? (
              <p className="text-sm text-ink-subtle">No approval decisions recorded yet.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {approvals.map((approval) => (
                  <li key={approval.id} className="border-l-2 border-edge pl-3">
                    <p className="text-sm">
                      <span className="font-medium">{approval.by}</span>{" "}
                      <StatusBadge status={approval.decision} />
                    </p>
                    {approval.note ? (
                      <p className="mt-0.5 text-xs text-ink-muted">{approval.note}</p>
                    ) : null}
                    <p className="mt-0.5 text-xs text-ink-subtle">
                      {new Date(approval.createdAt).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
