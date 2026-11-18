import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { fail, ok } from '@/lib/http/response';
import { updateStandaloneAgentCostMeta } from '@/modules/agent-costs/service';

const UuidParamSchema = z.string().uuid('Invalid rate ID');

const UpdateAgentCostMetaSchema = z.object({
  agentName: z.string().trim().min(1, 'กรุณาระบุชื่อ Agent').max(150),
  modeType: z.enum(['FCL', 'LCL']),
  polPortCode: z.string().trim().min(2, 'กรุณาระบุต้นทาง (POL)').max(40),
  podPortCode: z.string().trim().min(2, 'กรุณาระบุปลายทาง (POD)').max(40),
  containerSummary: z.string().trim().min(1, 'กรุณาระบุขนาดตู้ / Volume').max(120),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return fail('UNAUTHORIZED', 'Authentication required', 401);

  const { id } = await context.params;
  const parsedId = UuidParamSchema.safeParse(id);
  if (!parsedId.success) {
    return fail('VALIDATION_FAILED', 'Invalid ID format', 422);
  }

  try {
    const body = await request.json().catch(() => null);
    const parsed = UpdateAgentCostMetaSchema.safeParse(body);
    if (!parsed.success) {
      return fail('VALIDATION_FAILED', parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง', 422);
    }

    const res = await updateStandaloneAgentCostMeta(user, parsedId.data, parsed.data);
    return ok(res);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'FORBIDDEN') return fail('FORBIDDEN', 'ไม่มีสิทธิ์แก้ไขข้อมูลนี้', 403);
      if (err.message === 'NOT_FOUND') return fail('NOT_FOUND', 'ไม่พบรายการที่ต้องการแก้ไข', 404);
    }
    console.error('Update agent cost meta error:', err);
    return fail('INTERNAL_SERVER_ERROR', 'แก้ไขข้อมูลไม่สำเร็จ', 500);
  }
}
