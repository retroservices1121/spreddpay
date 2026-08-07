import { z } from "zod";

/**
 * Integration modes, per TECHNICAL_README section 4.
 *
 *  mock       — complete deterministic product demo, no provider credentials.
 *  sandbox    — calls provider test APIs.
 *  production — stays disabled until program, compliance, credentials, domains,
 *               webhooks and funds flow are approved.
 */
export const integrationModeSchema = z.enum(["mock", "sandbox", "production"]);
export type IntegrationMode = z.infer<typeof integrationModeSchema>;

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === "" ? undefined : value));

const booleanish = z
  .union([z.boolean(), z.string()])
  .default(false)
  .transform((value) =>
    typeof value === "boolean" ? value : ["1", "true", "yes", "on"].includes(value.toLowerCase()),
  );

export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    REDIS_URL: optionalString,

    APP_URL: z.string().url().default("http://localhost:3001"),
    PARTNER_APP_URL: z.string().url().default("http://localhost:3002"),
    ADMIN_APP_URL: z.string().url().default("http://localhost:3003"),
    API_URL: z.string().url().default("http://localhost:4000"),
    PORT: z.coerce.number().int().positive().default(4000),

    AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
    /**
     * Session cookie SameSite policy.
     *
     * `lax` is correct — and the default — when the portals and the API share a
     * registrable domain (app.spreddpay.com ↔ api.spreddpay.com). Railway's
     * generated *.up.railway.app hostnames do not: `up.railway.app` is on the
     * Public Suffix List, so those are cross-*site* and a Lax cookie is never
     * sent, which silently breaks login. Such a deployment needs `none`.
     *
     * `none` requires Secure, so it is only permitted over HTTPS. Cross-site
     * request forgery is then held off by the CORS allow-list plus the JSON
     * content type, which forces a preflight.
     */
    SESSION_COOKIE_SAMESITE: z.enum(["lax", "none", "strict"]).default("lax"),
    /**
     * Cookie Domain attribute, e.g. ".spreddpay.com".
     *
     * Without it the session cookie is host-only to the API's hostname. That is
     * fine for a browser talking to the API directly — but the portals are
     * server-rendered and forward the caller's cookie from their *own* server,
     * and the browser never sends an api.spreddpay.com cookie to
     * partner.spreddpay.com. The result is a login that succeeds and then
     * bounces straight back to the login page.
     *
     * Local development does not need it: cookies ignore ports, so
     * localhost:4000 and localhost:3002 already share one cookie jar. That is
     * also why this only shows up once real hostnames are involved.
     */
    SESSION_COOKIE_DOMAIN: optionalString,
    ENCRYPTION_KEY: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/, "ENCRYPTION_KEY must be 64 hex characters (32 bytes)"),

    RAIN_MODE: integrationModeSchema.default("mock"),
    RAIN_API_BASE_URL: optionalString,
    RAIN_API_KEY: optionalString,
    RAIN_PROGRAM_ID: optionalString,
    RAIN_WEBHOOK_SECRET: optionalString,

    // Dakota — stablecoin infrastructure. Replaces Rain for accounts, KYC,
    // wallets and transfers. Dakota has no card product; card issuance is
    // deferred until their card programme opens.
    DAKOTA_MODE: integrationModeSchema.default("mock"),
    DAKOTA_API_BASE_URL: optionalString,
    DAKOTA_API_KEY: optionalString,
    DAKOTA_WEBHOOK_SECRET: optionalString,

    BLEND_MODE: integrationModeSchema.default("mock"),
    BLEND_API_BASE_URL: optionalString,
    BLEND_API_KEY: optionalString,
    BLEND_ORGANIZATION_ID: optionalString,
    BLEND_WEBHOOK_SECRET: optionalString,

    SENTRY_DSN: optionalString,
    POSTHOG_KEY: optionalString,
    DEMO_SEED: booleanish,
  })
  .superRefine((env, ctx) => {
    // Phase 1 is not cleared for production. Fail closed rather than silently
    // pointing a live program at unverified code.
    if (env.RAIN_MODE === "production") {
      ctx.addIssue({
        code: "custom",
        path: ["RAIN_MODE"],
        message:
          "RAIN_MODE=production is disabled until program, compliance, credentials, domains, webhooks and funds flow are approved.",
      });
    }
    if (env.BLEND_MODE === "production") {
      ctx.addIssue({
        code: "custom",
        path: ["BLEND_MODE"],
        message: "BLEND_MODE=production is disabled until Phase 2 commercial terms are approved.",
      });
    }
    // SameSite=None is meaningless without Secure, and browsers drop such a
    // cookie outright. Fail at boot rather than at every login.
    if (env.SESSION_COOKIE_SAMESITE === "none" && env.NODE_ENV !== "production") {
      ctx.addIssue({
        code: "custom",
        path: ["SESSION_COOKIE_SAMESITE"],
        message:
          "SESSION_COOKIE_SAMESITE=none requires a Secure cookie, which is only set when NODE_ENV=production. Use lax for local development.",
      });
    }
    if (env.DAKOTA_MODE === "production") {
      ctx.addIssue({
        code: "custom",
        path: ["DAKOTA_MODE"],
        message:
          "DAKOTA_MODE=production is disabled until compliance, credentials, signing-key custody and docs/dakota-flow-of-funds.md are settled.",
      });
    }
    if (env.DAKOTA_MODE === "sandbox" && !env.DAKOTA_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["DAKOTA_API_KEY"],
        message: "DAKOTA_API_KEY is required when DAKOTA_MODE=sandbox",
      });
    }
    if (env.RAIN_MODE === "sandbox") {
      for (const key of ["RAIN_API_BASE_URL", "RAIN_API_KEY", "RAIN_WEBHOOK_SECRET"] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: `${key} is required when RAIN_MODE=sandbox`,
          });
        }
      }
    }
    if (env.BLEND_MODE === "sandbox") {
      for (const key of ["BLEND_API_BASE_URL", "BLEND_API_KEY"] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: `${key} is required when BLEND_MODE=sandbox`,
          });
        }
      }
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

/**
 * Parse and cache process.env. Throws a readable aggregate error on the first
 * bad value so a misconfigured deploy fails at boot, not mid-payout.
 */
export function loadServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  cached = parsed.data;
  return cached;
}

/** Test-only: drop the memoised env so a new process.env can be parsed. */
export function resetServerEnvCache(): void {
  cached = null;
}
