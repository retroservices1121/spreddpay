import type { IntegrationMode } from "@spreddpay/config";
import { MockRainService, createMockRainState, type MockRainOptions } from "./mock";
import { RainSandboxService } from "./sandbox";
import type { RainService } from "./types";

export * from "./types";
export { MockRainService, createMockRainState } from "./mock";
export { RainSandboxService, type RainSandboxConfig } from "./sandbox";

export interface RainFactoryConfig {
  mode: IntegrationMode;
  baseUrl?: string | undefined;
  apiKey?: string | undefined;
  programId?: string | undefined;
  webhookSecret?: string | undefined;
  mock?: MockRainOptions;
}

/**
 * Pick the adapter for the configured mode. `production` is refused here as
 * well as in the env schema — two independent gates, because the cost of
 * accidentally pointing at a live card program is not symmetric.
 */
export function createRainService(config: RainFactoryConfig): RainService {
  switch (config.mode) {
    case "mock":
      return new MockRainService(
        { webhookSecret: config.webhookSecret, ...config.mock },
        createMockRainState(),
      );

    case "sandbox":
      if (!config.baseUrl || !config.apiKey) {
        throw new Error("RAIN_MODE=sandbox requires RAIN_API_BASE_URL and RAIN_API_KEY.");
      }
      return new RainSandboxService({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        programId: config.programId ?? null,
        webhookSecret: config.webhookSecret ?? "",
      });

    case "production":
      throw new Error(
        "RAIN_MODE=production is disabled. Program, compliance, credentials, domains, webhooks and funds flow must be approved first.",
      );
  }
}
