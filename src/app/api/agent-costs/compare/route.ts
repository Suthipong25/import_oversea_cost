import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { fail, ok } from '@/lib/http/response';
import { createComparisonFromAgentCosts } from '@/modules/agent-costs/service';

const CompareRequestSchema = z.object({
  rateRecordIds: z
    .array(z.string().uuid())
    .min(2, 'กรุณาเลือก Cost Agent อย่างน้อย 2 รายการ')
    .max(5, 'เปรียบเทียบได้สูงสุด 5 รายการต่อครั้ง'),
  customerName: z.string().trim().max(200).optional().nullable(),
  incoterm: z.string().trim().max(16).optional().nullable(),
  commodityDescription: z.string().trim().max(300).optional().nullable(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return fail('UNAUTHORIZED', 'Authentication required', 401);

  try {
    const body = await request.json().catch(() => null);
    const parsed = CompareRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        'VALIDATION_FAILED',
        parsed.error.issues[0]?.message ?? 'กรุณาเลือก Agent 2–5 รายการ',
        422
      );
    }

    const result = await createComparisonFromAgentCosts(user, parsed.data);
    return ok(result, 201);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'FORBIDDEN') return fail('FORBIDDEN', 'ไม่มีสิทธิ์สร้างงานเปรียบเทียบ', 403);
      if (err.message === 'MIN_TWO_AGENTS') {
        return fail('VALIDATION_FAILED', 'กรุณาเลือก Cost Agent อย่างน้อย 2 รายการ', 422);
      }
      if (err.message === 'MAX_FIVE_AGENTS') {
        return fail('VALIDATION_FAILED', 'เปรียบเทียบได้สูงสุด 5 รายการต่อครั้ง', 422);
      }
      if (err.message === 'NOT_FOUND') {
        return fail('NOT_FOUND', 'ไม่พบรายการ Cost Agent ที่เลือก', 404);
      }
    }
    console.error('Create comparison from agent costs error:', err);
    return fail('INTERNAL_SERVER_ERROR', 'เปิดหน้าเปรียบเทียบไม่สำเร็จ', 500);
  }
}
