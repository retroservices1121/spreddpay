import type { TraderStatus } from "@spreddpay/contracts";
import { Card, CardBody, CardHeader, CardTitle, PageHeader } from "@spreddpay/ui";
import { apiFetch, requireTraderSession } from "@/lib/api";
import { OnboardingStep } from "./step";

export const dynamic = "force-dynamic";

interface OnboardingResponse {
  status: TraderStatus;
  steps: { status: TraderStatus; state: "done" | "current" | "pending" }[];
  acceptedTermsVersion: string | null;
  acceptedTermsAt: string | null;
}

const STEP_COPY: Partial<Record<TraderStatus, { title: string; body: string }>> = {
  INVITED: { title: "Get started", body: "Set up your account to receive payouts." },
  ACCOUNT_CREATED: { title: "Account created", body: "Next, review and accept the terms." },
  TERMS_PENDING: {
    title: "Accept the terms",
    body: "Read and accept the terms of service to continue to identity verification.",
  },
  KYC_PENDING: {
    title: "Identity verification in progress",
    body: "Our card provider is reviewing your details. This is usually quick.",
  },
  KYC_REVIEW: {
    title: "Under review",
    body: "Your verification needs a closer look. No action is needed from you right now.",
  },
  KYC_APPROVED: { title: "Verified", body: "Setting up your payout account." },
  RAIN_ACCOUNT_PENDING: { title: "Creating your account", body: "Almost there." },
  RAIN_ACCOUNT_ACTIVE: { title: "Account ready", body: "You can now be issued a card." },
  CARD_ELIGIBLE: { title: "Ready for your card", body: "Issue your virtual card to start spending." },
  VIRTUAL_CARD_PENDING: { title: "Issuing your card", body: "This takes a moment." },
  VIRTUAL_CARD_ACTIVE: { title: "You are all set", body: "Your card is active." },
};

const FAILURE_COPY: Partial<Record<TraderStatus, string>> = {
  KYC_REJECTED: "Identity verification was not successful. Contact your firm for next steps.",
  COUNTRY_UNSUPPORTED: "Your country is not supported on this program.",
  ACCOUNT_RESTRICTED: "Your account is restricted. Contact your firm.",
  CARD_INELIGIBLE: "You are not currently eligible for a card.",
  PROVIDER_ERROR: "Something went wrong with our provider. We are looking into it.",
  MANUAL_REVIEW: "Your account is being reviewed by our team.",
};

export default async function OnboardingPage() {
  const session = await requireTraderSession();
  const onboarding = await apiFetch<OnboardingResponse>("/me/onboarding");

  const copy = STEP_COPY[onboarding.status];
  const failure = FAILURE_COPY[onboarding.status];
  const productName = session.branding?.productName ?? "your account";

  return (
    <>
      <PageHeader title={`Set up ${productName}`} description={copy?.body ?? ""} />

      <div className="grid max-w-2xl gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{copy?.title ?? onboarding.status.replace(/_/g, " ")}</CardTitle>
          </CardHeader>
          <CardBody>
            <OnboardingStep status={onboarding.status} failureMessage={failure ?? null} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Progress</CardTitle>
          </CardHeader>
          <CardBody>
            <ol className="flex flex-col gap-2">
              {onboarding.steps.map((step, index) => (
                <li key={step.status} className="flex items-center gap-3 text-sm">
                  <span
                    className={
                      step.state === "done"
                        ? "grid h-5 w-5 place-items-center rounded-full bg-positive text-[10px] text-white"
                        : step.state === "current"
                          ? "grid h-5 w-5 place-items-center rounded-full bg-brand-secondary text-[10px] text-white"
                          : "grid h-5 w-5 place-items-center rounded-full border border-edge text-[10px] text-ink-subtle"
                    }
                  >
                    {step.state === "done" ? "✓" : index + 1}
                  </span>
                  <span className={step.state === "pending" ? "text-ink-subtle" : "text-ink"}>
                    {step.status.replace(/_/g, " ").toLowerCase()}
                  </span>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
