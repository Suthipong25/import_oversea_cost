import { renderToBuffer } from '@react-pdf/renderer';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { fail } from '@/lib/http/response';
import { getCustomerQuotationPdfPayload } from '@/modules/quotations/service';
import { QuotationPdfDocument } from '@/lib/pdf/quotation-pdf';

const UuidSchema = z.string().uuid();

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return fail('UNAUTHORIZED', 'Authentication required', 401);

  const { id } = await context.params;
  if (!UuidSchema.safeParse(id).success) {
    return fail('VALIDATION_FAILED', 'Invalid quotation ID', 422);
  }

  const url = new URL(request.url);
  const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'th';
  const verParam = url.searchParams.get('version');
  const versionNumber = verParam ? Number(verParam) : undefined;
  const download = url.searchParams.get('download') === '1';

  try {
    const payload = await getCustomerQuotationPdfPayload(
      user,
      id,
      Number.isInteger(versionNumber) ? versionNumber : undefined
    );
    if (!payload) {
      return fail('NOT_FOUND', 'Quotation not found', 404);
    }

    const pdfBuffer = await renderToBuffer(QuotationPdfDocument({ data: payload, lang }));

    const filename = `${payload.quotationNumber}-v${payload.versionNumber}-${lang.toUpperCase()}.pdf`;

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('CONFIDENTIALITY_VIOLATION')) {
      console.error('CRITICAL CONFIDENTIALITY BLOCK:', err.message);
      return fail('CONFIDENTIALITY_VIOLATION', 'Internal data blocked from customer PDF', 500);
    }
    console.error('Render quotation PDF error:', err);
    return fail('INTERNAL_SERVER_ERROR', 'Failed to render quotation PDF', 500);
  }
}
