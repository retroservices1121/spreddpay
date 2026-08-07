import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { PartnerBrandingDto, SessionUserDto } from "@spreddpay/contracts";

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

export interface TraderSession {
  user: SessionUserDto;
  branding: PartnerBrandingDto | null;
}

/** Traders only. Partner and platform staff belong in their own portals. */
export async function requireTraderSession(): Promise<TraderSession> {
  let session: TraderSession;
  try {
    session = await apiFetch<TraderSession>("/auth/session");
  } catch {
    redirect("/login");
  }

  if (session.user.kind !== "TRADER") {
    redirect("/login?error=not-a-trader");
  }
  return session;
}
