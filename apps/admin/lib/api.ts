import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { SessionUserDto } from "@spreddpay/contracts";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");

  const response = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let code = "INTERNAL";
    let message = response.statusText;
    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(response.status, code, message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface AdminSession {
  user: SessionUserDto;
}

/** SpreddPay operators only. */
export async function requireOperator(): Promise<AdminSession> {
  let session: AdminSession;
  try {
    session = await apiFetch<AdminSession>("/auth/session");
  } catch {
    redirect("/login");
  }

  if (session.user.kind !== "PLATFORM_USER") {
    redirect("/login?error=not-an-operator");
  }

  // A session that has not presented the second factor cannot use the portal.
  // Send it to enrol or verify rather than rendering a page whose every API
  // call would 403.
  if (!session.user.mfaEnabled || !session.user.mfaVerified) {
    redirect("/mfa");
  }

  return session;
}

export function can(session: AdminSession, permission: string): boolean {
  return session.user.permissions.includes(permission);
}
