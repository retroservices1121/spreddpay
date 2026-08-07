import { loadServerEnv, type ServerEnv } from "@spreddpay/config";
import { db, type Database } from "@spreddpay/db";
import { createRainService, type RainService } from "@spreddpay/rain";
import { createBlendService, type BlendYieldService } from "@spreddpay/blend";

/**
 * Everything a route handler needs, resolved once at boot. Passing this around
 * explicitly (rather than importing singletons in handlers) is what makes the
 * services testable against a stub Rain adapter.
 */
export interface AppContext {
  env: ServerEnv;
  db: Database;
  rain: RainService;
  blend: BlendYieldService;
}

export function createAppContext(overrides: Partial<AppContext> = {}): AppContext {
  const env = overrides.env ?? loadServerEnv();

  return {
    env,
    db: overrides.db ?? db,
    rain:
      overrides.rain ??
      createRainService({
        mode: env.RAIN_MODE,
        baseUrl: env.RAIN_API_BASE_URL,
        apiKey: env.RAIN_API_KEY,
        programId: env.RAIN_PROGRAM_ID,
        webhookSecret: env.RAIN_WEBHOOK_SECRET,
      }),
    blend: overrides.blend ?? createBlendService(env.BLEND_MODE),
  };
}
