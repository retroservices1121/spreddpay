import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { AppError, InvalidTransitionError } from "@spreddpay/contracts";
import { CrossTenantAccessError, AppendOnlyViolationError } from "@spreddpay/db";
import {
  RainCapabilityUnavailableError,
  RainProviderError,
} from "@spreddpay/rain";
import { BlendNotImplementedError } from "@spreddpay/blend";
import { UnbalancedEntryError, InvalidPostingError } from "@spreddpay/ledger";

/**
 * One place that turns a thrown domain error into an HTTP response.
 *
 * A cross-tenant access attempt returns 404, not 403: telling a caller that a
 * record exists but belongs to someone else is itself a leak.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    // Read these before the instanceof chain narrows `error` away from
    // FastifyError; the plugin-level fields are still needed at the end.
    const fastifyCode = (error as { code?: unknown }).code;
    const fastifyStatus = (error as { statusCode?: number }).statusCode;

    if (error instanceof AppError) {
      if (error.statusCode >= 500) request.log.error({ err: error }, error.message);
      return reply.status(error.statusCode).send(error.toBody());
    }

    if (error instanceof ZodError) {
      return reply.status(400).send(
        new AppError(
          "BAD_REQUEST",
          "Request validation failed.",
          error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        ).toBody(),
      );
    }

    if (error instanceof CrossTenantAccessError) {
      request.log.warn({ err: error }, "cross-tenant access blocked");
      return reply.status(404).send(new AppError("NOT_FOUND", "Not found.").toBody());
    }

    if (error instanceof InvalidTransitionError) {
      return reply
        .status(409)
        .send(new AppError("INVALID_TRANSITION", error.message).toBody());
    }

    if (error instanceof RainCapabilityUnavailableError) {
      return reply
        .status(501)
        .send(new AppError("PROVIDER_CAPABILITY_UNAVAILABLE", error.message).toBody());
    }

    if (error instanceof BlendNotImplementedError) {
      return reply.status(403).send(new AppError("FEATURE_DISABLED", error.message).toBody());
    }

    if (error instanceof RainProviderError) {
      request.log.error({ err: error, code: error.code }, "rain provider error");
      return reply
        .status(502)
        .send(new AppError("PROVIDER_UNAVAILABLE", `Rain: ${error.message}`).toBody());
    }

    if (error instanceof UnbalancedEntryError || error instanceof InvalidPostingError) {
      request.log.error({ err: error }, "ledger integrity error");
      return reply
        .status(500)
        .send(new AppError("INTERNAL", "A ledger entry failed validation.").toBody());
    }

    if (error instanceof AppendOnlyViolationError) {
      request.log.error({ err: error }, "append-only violation");
      return reply.status(500).send(new AppError("INTERNAL", error.message).toBody());
    }

    // Prisma unique constraint.
    if (fastifyCode === "P2002") {
      return reply
        .status(409)
        .send(new AppError("CONFLICT", "That record already exists.").toBody());
    }

    if (fastifyStatus === 429) {
      return reply
        .status(429)
        .send(new AppError("RATE_LIMITED", "Too many requests.").toBody());
    }

    request.log.error({ err: error }, "unhandled error");
    return reply
      .status(500)
      .send(new AppError("INTERNAL", "Something went wrong.").toBody());
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send(new AppError("NOT_FOUND", "Route not found.").toBody()),
  );
}
