import { NextResponse } from 'next/server';

/**
 * ส่งคืน JSON Response สถานะสำเร็จ (Standard HTTP 200/201/etc.):
 * รูปแบบ: `{ success: true, data: T, meta?: Record<string, unknown> }`
 */
export function ok<T>(data: T, status = 200, meta?: Record<string, unknown>) {
  return NextResponse.json(
    meta ? { success: true, data, meta } : { success: true, data },
    { status }
  );
}

/**
 * ส่งคืน JSON Response สถานะล้มเหลว (Standard Error Envelope):
 * รูปแบบ: `{ success: false, error: { code, message, details?, timestamp } }`
 */
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
