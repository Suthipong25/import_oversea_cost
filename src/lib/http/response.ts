import { NextResponse } from 'next/server';

export function ok<T>(data: T, status = 200, meta?: Record<string, unknown>) {
  return NextResponse.json(
    meta ? { success: true, data, meta } : { success: true, data },
    { status }
  );
}

export function fail(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        ...(details !== undefined ? { details } : {}),
        timestamp: new Date().toISOString(),
      },
    },
    { status }
  );
}
