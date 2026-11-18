import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { sourceDocuments } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/session';
import { readPrivateFile, verifyDocumentSignature } from '@/lib/storage/local';
import { fail } from '@/lib/http/response';

const UuidSchema = z.string().uuid();

export async function GET(
  request: Request,
  context: { params: Promise<{ docId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return fail('UNAUTHORIZED', 'Authentication required', 401);

  const { docId } = await context.params;
  if (!UuidSchema.safeParse(docId).success) {
    return fail('VALIDATION_FAILED', 'Invalid document ID', 422);
  }

  const url = new URL(request.url);
  const exp = url.searchParams.get('exp');
  const token = url.searchParams.get('token');

  if (!verifyDocumentSignature(docId, exp, token)) {
    return fail('FORBIDDEN', 'Signed document URL is invalid or expired', 403);
  }

  const [doc] = await db
    .select()
    .from(sourceDocuments)
    .where(eq(sourceDocuments.id, docId))
    .limit(1);

  if (!doc || !doc.storagePath) {
    return fail('NOT_FOUND', 'Document file not found', 404);
  }

  try {
    const buffer = await readPrivateFile(doc.storagePath);
    const safeName = doc.fileName.replace(/[^\w.-]/g, '_');

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': doc.mimeType,
        'Content-Disposition': `inline; filename="${safeName}"`,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; img-src 'self'; object-src 'self'",
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch {
    return fail('NOT_FOUND', 'File missing from private storage', 404);
  }
}
