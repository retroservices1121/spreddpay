import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context";

/**
 * Inbound provider webhooks, per TECHNICAL_README section 14.
 *
 * The order here is the whole point:
 *   1. read the raw body (not the parsed one — signatures cover bytes);
 *   2. verify the Rain signature;
 *   3. store the event before processing;
 *   4. deduplicate by provider event id;
 *   5. respond quickly;
 *   6. let the worker process it asynchronously.
 *
 * An invalid signature is still stored, marked `signatureValid: false` and
 * SKIPPED, because a burst of them is a security signal worth keeping.
 */
export async function registerWebhookRoutes(
  app: FastifyInstance,
  context: AppContext,
): Promise<void> {
  app.post(
    "/webhooks/rain",
    {
      config: { rawBody: true },
      // Keep the raw bytes; the parsed body is not what the signature covers.
      preParsing: async (_request, _reply, payload) => payload,
    },
    async (request, reply) => {
      const rawBody =
        typeof request.body === "string" ? request.body : JSON.stringify(request.body ?? {});

      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(request.headers)) {
        headers[key.toLowerCase()] = Array.isArray(value) ? (value[0] ?? "") : String(value ?? "");
      }

      const verified = await context.rain.verifyWebhook(headers, rawBody);

      // Store before processing, and let the unique constraint on
      // (provider, providerEventId) be the deduplication mechanism.
      const existing = await context.db.webhookEvent.findFirst({
        where: { provider: "RAIN", providerEventId: verified.eventId },
        select: { id: true },
      });

      if (existing) {
        reply.status(200);
        return { received: true, duplicate: true };
      }

      await context.db.webhookEvent.create({
        data: {
          provider: "RAIN",
          providerEventId: verified.eventId,
          eventType: verified.eventType,
          status: verified.valid ? "RECEIVED" : "SKIPPED",
          signatureValid: verified.valid,
          // Redacted at the adapter boundary; card data never lands here.
          payload: verified.payload as object,
          headers: {
            "x-rain-signature": headers["x-rain-signature"] ? "[present]" : "[missing]",
            "content-type": headers["content-type"] ?? null,
          },
          lastError: verified.valid ? null : "signature verification failed",
        },
      });

      if (!verified.valid) {
        request.log.warn({ eventId: verified.eventId }, "rain webhook signature invalid");
        reply.status(401);
        return { received: false, reason: "invalid_signature" };
      }

      // Respond fast. The worker picks the event up from the table.
      reply.status(202);
      return { received: true };
    },
  );
}
