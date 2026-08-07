import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { SessionUserDto, PartnerBrandingDto } from "@spreddpay/contracts";

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

/**
 * Server-side fetch against the SpreddPay API with the caller's session cookie
 * forwarded. Every page in this portal reads through here, so there is exactly
 * one place that decides what an unauthenticated response means.
 */
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
      // non-JSON error body; keep the status text
    }
    throw new ApiError(response.status, code, message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface Session {
  user: SessionUserDto;
  branding: PartnerBrandingDto | null;
}

/** Load the session or bounce to the login page. */
export async function requireSession(): Promise<Session & { partnerId: string }> {
  let session: Session;
  try {
    session = await apiFetch<Session>("/auth/session");
  } catch {
    redirect("/login");
  }

  if (session.user.kind === "TRADER") {
    redirect("/login?error=trader");
  }
  if (!session.user.partnerId) {
    // Platform operators reach partner data through the admin portal.
    redirect("/login?error=no-partner");
  }

  return { ...session, partnerId: session.user.partnerId };
}

export function can(session: Session, permission: string): boolean {
  return session.user.permissions.includes(permission);
}
