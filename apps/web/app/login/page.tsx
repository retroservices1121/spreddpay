"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Callout, Card, CardBody, Field, Input } from "@spreddpay/ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/v1/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(body?.error?.message ?? "Sign in failed.");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/*
          Deliberately unbranded. The trader sees the partner's product, and
          before sign-in we do not know which partner they belong to — so
          showing SpreddPay's mark here would break the white-label promise at
          the one screen every trader sees first. The partner's branding takes
          over immediately after authentication.
        */}
        <div className="mb-8 text-center">
          <h1 className="text-lg font-semibold tracking-tight text-ink">Sign in</h1>
          <p className="mt-1 text-sm text-ink-muted">Access your payout account.</p>
        </div>

        <Card>
          <CardBody>
            <form onSubmit={submit}>
              {error ? (
                <div className="mb-4">
                  <Callout tone="critical">{error}</Callout>
                </div>
              ) : null}

              <Field label="Email">
                <Input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>

              <Field label="Password">
                <Input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </Field>

              <Button type="submit" disabled={pending} className="w-full">
                {pending ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </CardBody>
        </Card>

        <p className="mt-4 text-center text-xs text-ink-subtle">
          Demo: alex.morgan@example.com / SpreddPayDemo123!
        </p>
      </div>
    </main>
  );
}
