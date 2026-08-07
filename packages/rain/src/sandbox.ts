/**
 * Rain sandbox client — intentionally unimplemented.
 *
 * TECHNICAL_README section 2: "Exact endpoint names must come from Rain's
 * private dashboard documentation. Claude Code must never invent provider
 * endpoints." Nothing in this file guesses a path, a field or an auth scheme.
 *
 * Milestone 4 fills this in. The procedure, from section 10:
 *   1. inspect Rain's private docs;
 *   2. update docs/rain-api-map.md;
 *   3. create typed requests/responses;
 *   4. implement the adapter;
 *   5. add sandbox tests;
 *   6. record unavailable capabilities in docs/rain-program-limitations.md.
 *
 * Until then every method throws, so a misconfigured RAIN_MODE=sandbox deploy
 * fails loudly instead of silently returning mock data as though it were real.
 */

import type {
  CreateRainAccountInput,
  CreateRainCardInput,
  CreateRainCustomerInput,
  NormalizedBalance,
  NormalizedCard,
  ProviderPayout,
  ProviderPayoutInput,
  RainAccount,
  RainCustomer,
  RainKycSession,
  RainKycStatus,
  RainService,
  TransactionPage,
  TransactionQuery,
  ValidationResult,
  VerifiedWebhook,
} from "./types";
import { RainCapabilityUnavailableError } from "./types";

export interface RainSandboxConfig {
  baseUrl: string;
  apiKey: string;
  programId: string | null;
  webhookSecret: string;
}

function notYetMapped(capability: string): never {
  throw new RainCapabilityUnavailableError(
    capability,
    "The sandbox adapter is not implemented — Milestone 4 maps it from Rain's private documentation into docs/rain-api-map.md first.",
  );
}

export class RainSandboxService implements RainService {
  readonly mode = "sandbox" as const;

  // Retained so the eventual implementation has its configuration to hand.
  private readonly config: RainSandboxConfig;

  constructor(config: RainSandboxConfig) {
    this.config = config;
  }

  /** Exposed for the health endpoint: shows what is configured, never the key. */
  describe(): { baseUrl: string; programId: string | null; hasApiKey: boolean } {
    return {
      baseUrl: this.config.baseUrl,
      programId: this.config.programId,
      hasApiKey: this.config.apiKey.length > 0,
    };
  }

  async createCustomer(_input: CreateRainCustomerInput): Promise<RainCustomer> {
    notYetMapped("createCustomer");
  }
  async getCustomer(_id: string): Promise<RainCustomer> {
    notYetMapped("getCustomer");
  }
  async startKyc(_customerId: string): Promise<RainKycSession> {
    notYetMapped("startKyc");
  }
  async getKycStatus(_customerId: string): Promise<RainKycStatus> {
    notYetMapped("getKycStatus");
  }
  async createAccount(_input: CreateRainAccountInput): Promise<RainAccount> {
    notYetMapped("createAccount");
  }
  async getAccount(_id: string): Promise<RainAccount> {
    notYetMapped("getAccount");
  }
  async getBalances(_accountId: string): Promise<NormalizedBalance[]> {
    notYetMapped("getBalances");
  }
  async createVirtualCard(_input: CreateRainCardInput): Promise<NormalizedCard> {
    notYetMapped("createVirtualCard");
  }
  async getCard(_id: string): Promise<NormalizedCard> {
    notYetMapped("getCard");
  }
  async freezeCard(_id: string): Promise<void> {
    notYetMapped("freezeCard");
  }
  async unfreezeCard(_id: string): Promise<void> {
    notYetMapped("unfreezeCard");
  }
  async listCardTransactions(_input: TransactionQuery): Promise<TransactionPage> {
    notYetMapped("listCardTransactions");
  }
  async validatePayoutDestination(_traderId: string): Promise<ValidationResult> {
    notYetMapped("validatePayoutDestination");
  }
  async createPayout(_input: ProviderPayoutInput): Promise<ProviderPayout> {
    notYetMapped("createPayout");
  }
  async getPayout(_id: string): Promise<ProviderPayout> {
    notYetMapped("getPayout");
  }
  async verifyWebhook(
    _headers: Record<string, string>,
    _rawBody: string,
  ): Promise<VerifiedWebhook> {
    notYetMapped("verifyWebhook");
  }
}
