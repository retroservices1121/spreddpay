import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { AppContext } from "./context";
import { registerAuth } from "./plugins/auth";
import { registerErrorHandler } from "./plugins/errors";
import { registerAuthRoutes } from "./routes/auth";
import { registerMfaRoutes } from "./routes/mfa";
import { registerPartnerRoutes } from "./routes/partners";
import { registerTeamRoutes } from "./routes/team";
import { registerTraderRoutes } from "./routes/me";
import { registerAdminRoutes } from "./routes/admin";
import { registerWebhookRoutes } from "./routes/webhooks";

export async function buildServer(context: AppContext): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: context.env.NODE_ENV === "production" ? "info" : "debug",
      // Never let a secret or a card number reach the log stream.
      redact: {
        paths: [
          "req.headers.cookie",
          "req.headers.authorization",
          'req.headers["x-rain-signature"]',
          "res.headers['set-cookie']",
          "*.password",
          "*.passwordHash",
          "*.pan",
          "*.cvv",
          "*.secret",
          "*.apiKey",
        ],
        censor: "[redacted]",
      },
    },
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  });

  /**
   * bigint is not JSON-serialisable, and the correct rendering for money is a
   * decimal string. Mappers already do this; the replacer is the backstop so a
   * missed conversion is a wrong-looking string, not a 500.
   */
  app.setReplySerializer((payload) =>
    JSON.stringify(payload, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  );

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  await app.register(cors, {
    origin: [context.env.APP_URL, context.env.PARTNER_APP_URL, context.env.ADMIN_APP_URL],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  await app.register(cookie, { secret: context.env.AUTH_SECRET });

  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    // Webhooks are machine traffic with their own signature check; a burst of
    // legitimate provider retries should not be throttled into failure.
    allowList: (request) => request.url.startsWith("/api/v1/webhooks/"),
  });

  registerErrorHandler(app);

  await app.register(
    async (scoped) => {
      await registerAuth(scoped, context);

      scoped.get("/health", async () => ({
        status: "ok",
        rainMode: context.env.RAIN_MODE,
        blendMode: context.env.BLEND_MODE,
        time: new Date().toISOString(),
      }));

      await registerAuthRoutes(scoped, context);
      await registerMfaRoutes(scoped, context);
      await registerPartnerRoutes(scoped, context);
      await registerTeamRoutes(scoped, context);
      await registerTraderRoutes(scoped, context);
      await registerAdminRoutes(scoped, context);
      await registerWebhookRoutes(scoped, context);
    },
    { prefix: "/api/v1" },
  );

  return app;
}
