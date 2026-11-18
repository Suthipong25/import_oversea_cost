import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { fail, ok } from '@/lib/http/response';
import { ingestRateForShipment } from '@/modules/rates/service';

const UuidSchema = z.string().uuid();

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return fail('UNAUTHORIZED', 'Authentication required', 401);

  const { id } = await context.params;
  if (!UuidSchema.safeParse(id).success) {
    return fail('VALIDATION_FAILED', 'Invalid shipment ID', 422);
  }

  try {
    const formData = await request.formData();
    const agentName = String(formData.get('agentName') ?? '').trim();
    const pastedText = String(formData.get('pastedText') ?? '').trim();
    const fileEntry = formData.get('file');

    if (!agentName) {
      return fail('VALIDATION_FAILED', 'กรุณาระบุชื่อ Agent ที่ส่งค่า Cost', 422);
    }

    let filePayload: { name: string; buffer: Buffer } | null = null;
    if (fileEntry instanceof File && fileEntry.size > 0) {
      const arrayBuf = await fileEntry.arrayBuffer();
      filePayload = { name: fileEntry.name, buffer: Buffer.from(arrayBuf) };
    }

    if (!filePayload && !pastedText) {
      return fail(
        'VALIDATION_FAILED',
        'กรุณาแนบไฟล์รูปภาพ/PDF หรือวางข้อความราคาอย่างน้อย 1 อย่าง',
        422
      );
    }

    const result = await ingestRateForShipment(user, {
      shipmentId: id,
      agentName,
      file: filePayload,
      pastedText: pastedText || null,
    });

    return ok(result, 201);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'FORBIDDEN') return fail('FORBIDDEN', 'Access denied', 403);
      if (err.message === 'NOT_FOUND') return fail('NOT_FOUND', 'Shipment not found', 404);
      if (err.message === 'MAX_AGENTS_REACHED') {
        return fail('VALIDATION_FAILED', 'เปรียบเทียบได้สูงสุด 5 Agent ต่องาน', 422);
      }
      if (err.message.includes('Unsupported') || err.message.includes('maximum allowed size')) {
        return fail('VALIDATION_FAILED', err.message, 422);
      }
    }
    console.error('Ingest rate error:', err);
    return fail('INTERNAL_SERVER_ERROR', 'ไม่สามารถแกะข้อมูลเรตราคาได้', 500);
  }
}
