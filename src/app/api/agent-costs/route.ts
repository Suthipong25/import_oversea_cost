import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { fail, ok } from '@/lib/http/response';
import {
  createStandaloneAgentCost,
  listStandaloneAgentCosts,
} from '@/modules/agent-costs/service';

const CreateAgentCostFieldsSchema = z.object({
  agentName: z.string().trim().min(1, 'กรุณาระบุชื่อ Agent').max(150),
  modeType: z.enum(['FCL', 'LCL']).default('FCL'),
  polPortCode: z.string().trim().min(2, 'กรุณาระบุต้นทาง (POL)').max(40),
  podPortCode: z.string().trim().min(2, 'กรุณาระบุปลายทาง (POD)').max(40),
  containerSummary: z.string().trim().max(120).default('1×40DV'),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return fail('UNAUTHORIZED', 'Authentication required', 401);

  try {
    const data = await listStandaloneAgentCosts(user);
    return ok(data);
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN') {
      return fail('FORBIDDEN', 'Access denied', 403);
    }
    console.error('List standalone agent costs error:', err);
    return fail('INTERNAL_SERVER_ERROR', 'ไม่สามารถโหลดรายการ Cost Agent ได้', 500);
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return fail('UNAUTHORIZED', 'Authentication required', 401);

  try {
    const formData = await request.formData();
    const fields = CreateAgentCostFieldsSchema.safeParse({
      agentName: String(formData.get('agentName') ?? ''),
      modeType: String(formData.get('modeType') ?? 'FCL'),
      polPortCode: String(formData.get('polPortCode') ?? ''),
      podPortCode: String(formData.get('podPortCode') ?? ''),
      containerSummary: String(formData.get('containerSummary') ?? ''),
    });

    if (!fields.success) {
      return fail('VALIDATION_FAILED', fields.error.issues[0]?.message ?? 'ข้อมูลไม่ครบถ้วน', 422);
    }

    const pastedTextRaw = formData.get('pastedText');
    const pastedText = typeof pastedTextRaw === 'string' ? pastedTextRaw : null;

    const fileEntry = formData.get('file');
    let filePayload: { name: string; buffer: Buffer } | null = null;
    if (fileEntry instanceof File && fileEntry.size > 0) {
      const arrayBuf = await fileEntry.arrayBuffer();
      filePayload = {
        name: fileEntry.name,
        buffer: Buffer.from(arrayBuf),
      };
    }

    const result = await createStandaloneAgentCost(user, {
      ...fields.data,
      file: filePayload,
      pastedText,
    });

    return ok(result, 201);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'FORBIDDEN') return fail('FORBIDDEN', 'ไม่มีสิทธิ์เพิ่มข้อมูล', 403);
      if (err.message === 'UNSUPPORTED_FILE_TYPE' || err.message === 'FILE_TOO_LARGE') {
        return fail('VALIDATION_FAILED', 'รองรับเฉพาะไฟล์ PDF, PNG, JPG, WEBP ขนาดไม่เกิน 20MB', 422);
      }
    }
    console.error('Create standalone agent cost error:', err);
    return fail('INTERNAL_SERVER_ERROR', 'เพิ่มข้อมูล Cost Agent ไม่สำเร็จ', 500);
  }
}
