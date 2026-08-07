/** Error envelope shared by the API and every client. */

export const ERROR_CODES = [
  "BAD_REQUEST",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "DUPLICATE_REFERENCE",
  "IDEMPOTENCY_MISMATCH",
  "INVALID_TRANSITION",
  "LIMIT_EXCEEDED",
  "SELF_APPROVAL_FORBIDDEN",
  "TRADER_NOT_ELIGIBLE",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_CAPABILITY_UNAVAILABLE",
  "FEATURE_DISABLED",
  "RATE_LIMITED",
  "INTERNAL",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

const STATUS_BY_CODE: Readonly<Record<ErrorCode, number>> = Object.freeze({
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  DUPLICATE_REFERENCE: 409,
  IDEMPOTENCY_MISMATCH: 409,
  INVALID_TRANSITION: 409,
  LIMIT_EXCEEDED: 422,
  SELF_APPROVAL_FORBIDDEN: 403,
  TRADER_NOT_ELIGIBLE: 422,
  PROVIDER_UNAVAILABLE: 502,
  PROVIDER_CAPABILITY_UNAVAILABLE: 501,
  FEATURE_DISABLED: 403,
  RATE_LIMITED: 429,
  INTERNAL: 500,
});

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = STATUS_BY_CODE[code];
    this.details = details;
  }

  toBody(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details === undefined ? {} : { details: this.details }),
      },
    };
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError("BAD_REQUEST", message, details);
  }
  static unauthenticated(message = "Authentication required.") {
    return new AppError("UNAUTHENTICATED", message);
  }
  static forbidden(message = "You do not have access to this resource.") {
    return new AppError("FORBIDDEN", message);
  }
  static notFound(message = "Not found.") {
    return new AppError("NOT_FOUND", message);
  }
  static conflict(message: string, details?: unknown) {
    return new AppError("CONFLICT", message, details);
  }
}

export function statusForErrorCode(code: ErrorCode): number {
  return STATUS_BY_CODE[code];
}
