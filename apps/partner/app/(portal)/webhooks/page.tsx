import { PARTNER_WEBHOOK_EVENTS } from "@spreddpay/contracts";
import {
  Badge,
  Callout,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  PageHeader,
} from "@spreddpay/ui";
import { requireSession } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function WebhooksPage() {
  await requireSession();

  return (
    <>
      <PageHeader
        title="Webhooks"
        description="Events SpreddPay sends to your systems, signed with HMAC-SHA256."
      />

      <div className="max-w-3xl">
        <Callout tone="neutral" title="Endpoint management arrives in Milestone 6">
          Delivery, retry with exponential backoff, delivery logs and replay are already implemented
          in the worker. The self-service screen for registering an endpoint is the remaining piece.
        </Callout>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Events</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="flex flex-wrap gap-1.5">
              {PARTNER_WEBHOOK_EVENTS.map((event) => (
                <Badge key={event} tone="brand" className="tabular">
                  {event}
                </Badge>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Verifying a signature</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="mb-3 text-sm text-ink-muted">
              Each request carries <code className="tabular text-xs">x-spreddpay-timestamp</code>{" "}
              and <code className="tabular text-xs">x-spreddpay-signature</code>. The signature is
              HMAC-SHA256 over <code className="tabular text-xs">{"`${timestamp}.${body}`"}</code>{" "}
              using your endpoint secret. Reject anything more than five minutes old.
            </p>
            <pre className="overflow-x-auto rounded-lg bg-surface-muted p-3 text-xs">
              <code>{`const expected = crypto
  .createHmac("sha256", endpointSecret)
  .update(\`\${timestamp}.\${rawBody}\`)
  .digest("hex");

crypto.timingSafeEqual(
  Buffer.from(expected),
  Buffer.from(signature),
);`}</code>
            </pre>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
