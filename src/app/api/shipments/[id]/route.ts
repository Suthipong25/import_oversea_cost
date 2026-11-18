import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { fail, ok } from '@/lib/http/response';
import { deleteShipmentForUser, getShipmentDetailForUser } from '@/modules/shipments/service';

const UuidParamSchema = z.string().uuid('Invalid shipment ID');

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return fail('UNAUTHORIZED', 'Authentication required', 401);

  const { id } = await context.params;
  const parsed = UuidParamSchema.safeParse(id);
  if (!parsed.success) {
    return fail('VALIDATION_FAILED', 'Invalid shipment ID format', 422);
  }

  try {
    const detail = await getShipmentDetailForUser(user, parsed.data);
    if (!detail) {
      return fail('NOT_FOUND', 'Shipment not found', 404);
    }
    return ok(detail);
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN') {
      return fail('FORBIDDEN', 'Access denied to this shipment', 403);
    }
    console.error('Get shipment detail error:', err);
    return fail('INTERNAL_SERVER_ERROR', 'Failed to fetch shipment', 500);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return fail('UNAUTHORIZED', 'Authentication required', 401);

  const { id } = await context.params;
  const parsed = UuidParamSchema.safeParse(id);
  if (!parsed.success) {
    return fail('VALIDATION_FAILED', 'Invalid shipment ID format', 422);
  }

  try {
    const res = await deleteShipmentForUser(user, parsed.data);
    return ok(res);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'FORBIDDEN') return fail('FORBIDDEN', 'ไม่มีสิทธิ์ลบงานนี้', 403);
      if (err.message === 'NOT_FOUND') return fail('NOT_FOUND', 'ไม่พบงานที่ต้องการลบ', 404);
      if (err.message === 'HAS_SENT_QUOTATION') {
        return fail(
          'INVALID_STATE_TRANSITION',
          'ไม่สามารถลบงานที่มีใบเสนอราคาส่งให้ลูกค้าแล้วได้',
          409
        );
      }
    }
    console.error('Delete shipment error:', err);
    return fail('INTERNAL_SERVER_ERROR', 'ลบงานไม่สำเร็จ', 500);
  }
}
