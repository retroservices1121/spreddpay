import type { IntegrationMode } from "@spreddpay/config";
import { DakotaClient, type DakotaClientConfig } from "./client";
import { MockDakotaService, type MockDakotaOptions } from "./mock";
import type { DakotaService } from "./types";

export * from "./types";
export { DakotaClient, toMinorUnits, type DakotaClientConfig } from "./client";
export { MockDakotaService, type MockDakotaOptions } from "./mock";

export interface DakotaFactoryConfig {
  mode: IntegrationMode;
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  webhookSecret?: string | undefined;
  mock?: MockDakotaOptions;
}

/**
 * Pick the adapter for the configured mode.
 *
 * `production` is refused here as well as in the env schema. Dakota's own
 * documentation caps sandbox transfers at $2 and rejects mainnet network ids,
 * so the difference between the two environments is real money — two
 * independent gates is proportionate.
 */
export function createDakotaService(config: DakotaFactoryConfig): DakotaService {
  switch (config.mode) {
    case "mock":
      return new MockDakotaService(config.mock);

    case "sandbox":
      if (!config.apiKey) {
        throw new Error("DAKOTA_MODE=sandbox requires DAKOTA_API_KEY.");
      }
      return new DakotaClient({
        environment: "sandbox",
        apiKey: config.apiKey,
        ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
        ...(config.webhookSecret ? { webhookSecret: config.webhookSecret } : {}),
      } satisfies DakotaClientConfig);

    case "production":
      throw new Error(
        "DAKOTA_MODE=production is disabled. Compliance, credentials, signing-key custody and the funds flow in docs/dakota-flow-of-funds.md must be settled first.",
      );
  }
}
