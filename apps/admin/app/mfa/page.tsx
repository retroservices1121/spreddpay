"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Callout, Card, CardBody, Field, Input } from "@spreddpay/ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface MfaState {
  kind: "PARTNER_USER" | "PLATFORM_USER" | "TRADER";
  email: string;
  required: boolean;
  enrolled: boolean;
  verified: boolean;
}

/**
 * Enrolment and verification for operator two-factor authentication.
 *
 * Deliberately outside the (portal) route group: that layout requires a fully
 * authorised session, and this page has to be reachable by a session that is
 * authenticated but not yet verified — otherwise there is no way to enrol.
 */
export default function MfaPage() {
  const router = useRouter();
  const [state, setState] = useState<MfaState | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void (async () => {
      const response = await fetch(`${API_URL}/api/v1/auth/mfa`, { credentials: "include" });
      if (!response.ok) {
        router.push("/login");
        return;
      }
      const data = (await response.json()) as MfaState;
      setState(data);
      if (data.kind === "PLATFORM_USER" && data.verified) router.push("/partners");
    })();
  }, [router]);

  async function call<T>(path: string, body?: unknown): Promise<T | null> {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/v1${path}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const payload = (await response.json().catch(() => null)) as
        | (T & { error?: { message?: string } })
        | null;
      if (!response.ok) {
        setError(payload?.error?.message ?? "Something went wrong.");
        return null;
      }
      return payload as T;
    } finally {
      setPending(false);
    }
  }

  async function signOut() {
    await fetch(`${API_URL}/api/v1/auth/logout`, { method: "POST", credentials: "include" });
    router.push("/login");
    router.refresh();
  }

  async function beginEnrolment() {
    const result = await call<{ secret: string; otpauthUri: string }>("/auth/mfa/enroll");
    if (result) {
      setSecret(result.secret);
      setUri(result.otpauthUri);
    }
  }

  async function submitCode() {
    const path = state?.enrolled ? "/auth/mfa/verify" : "/auth/mfa/activate";
    const result = await call<{ ok: boolean }>(path, { code });
    if (result?.ok) {
      router.push("/partners");
      router.refresh();
    }
  }

  if (!state) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-ink-subtle">Loading…</p>
      </main>
    );
  }

  // One session is shared across all three portals, so the account signed in
  // here may not be an operator at all. Say so, rather than letting the user
  // press a button that can only 403.
  if (state.kind !== "PLATFORM_USER") {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md">
          <Card>
            <CardBody>
              <Callout tone="caution" title="This is not an operator account">
                You are signed in as <span className="font-medium">{state.email}</span>, which is a{" "}
                {state.kind === "TRADER" ? "trader" : "partner"} account. The operations portal
                needs a SpreddPay operator account.
              </Callout>
              <div className="mt-4 flex gap-2">
                <Button onClick={signOut}>Sign out and use an operator account</Button>
              </div>
              <p className="mt-3 text-xs text-ink-subtle">
                Signing in on any spreddpay.com portal replaces this session, because all three
                share one sign-in.
              </p>
            </CardBody>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold text-ink">
            {state.enrolled ? "Two-factor authentication" : "Set up two-factor authentication"}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {state.enrolled
              ? "Enter the six-digit code from your authenticator app."
              : "The operations portal reaches every partner's data, so it requires a second factor."}
          </p>
        </div>

        <Card>
          <CardBody>
            {error ? (
              <div className="mb-4">
                <Callout tone="critical">{error}</Callout>
              </div>
            ) : null}

            {!state.enrolled && !secret ? (
              <Button onClick={beginEnrolment} disabled={pending} className="w-full">
                {pending ? "Starting…" : "Begin setup"}
              </Button>
            ) : null}

            {secret ? (
              <div className="mb-4">
                <p className="mb-2 text-sm text-ink-muted">
                  Add this to your authenticator app, then enter the code it shows.
                </p>
                <div className="mb-3 rounded-lg border border-edge bg-surface-muted p-3">
                  <p className="text-xs text-ink-subtle">Setup key</p>
                  <p className="tabular mt-1 break-all text-sm font-medium text-ink">{secret}</p>
                </div>
                {uri ? (
                  <a href={uri} className="text-xs text-brand-secondary">
                    Open in your authenticator app
                  </a>
                ) : null}
                <Callout tone="caution">
                  This key is shown once. If you lose it, another operator has to reset your second
                  factor.
                </Callout>
              </div>
            ) : null}

            {state.enrolled || secret ? (
              <>
                <Field label="Six-digit code">
                  <Input
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    maxLength={7}
                    className="tabular text-center text-lg tracking-widest"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void submitCode();
                    }}
                  />
                </Field>
                <Button onClick={submitCode} disabled={pending || code.length < 6} className="w-full">
                  {pending ? "Checking…" : state.enrolled ? "Verify" : "Activate"}
                </Button>
              </>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </main>
  );
}
