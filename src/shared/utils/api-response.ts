import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { ApiError, ErrorCode } from "@/shared/contracts";

export function createRequestId(): string {
  return randomUUID();
}

export function jsonSuccess<T>(
  data: T,
  requestId: string,
  meta?: { nextCursor?: string | null },
  status = 200,
) {
  return NextResponse.json(
    {
      data,
      meta: {
        requestId,
        ...meta,
      },
    },
    { status },
  );
}

export function jsonError(
  code: ErrorCode,
  message: string,
  requestId: string,
  status: number,
  details?: Record<string, unknown>,
) {
  const error: ApiError = {
    code,
    message,
    requestId,
    ...(details ? { details } : {}),
  };

  return NextResponse.json({ error }, { status });
}
