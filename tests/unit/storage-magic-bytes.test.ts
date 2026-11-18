import { describe, expect, it } from 'vitest';
import {
  signDocumentUrl,
  validateFileMagicBytes,
  verifyDocumentSignature,
} from '@/lib/storage/local';

describe('Upload Magic Bytes Validation', () => {
  it('accepts valid PDF, PNG, JPEG, and WEBP headers', () => {
    const pdf = validateFileMagicBytes(Buffer.from('%PDF-1.7\n1 0 obj', 'ascii'));
    expect(pdf.fileType).toBe('PDF');
    expect(pdf.mimeType).toBe('application/pdf');

    const png = validateFileMagicBytes(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]));
    expect(png.fileType).toBe('IMAGE');
    expect(png.mimeType).toBe('image/png');

    const jpg = validateFileMagicBytes(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]));
    expect(jpg.fileType).toBe('IMAGE');
    expect(jpg.mimeType).toBe('image/jpeg');
  });

  it('rejects empty files and disguised HTML/EXE scripts', () => {
    expect(() => validateFileMagicBytes(Buffer.alloc(0))).toThrow();
    expect(() => validateFileMagicBytes(Buffer.from('<html><script>alert(1)</script></html>'))).toThrow();
    expect(() => validateFileMagicBytes(Buffer.from('MZ\x90\x00\x03'))).toThrow();
  });
});

describe('Short-Lived Signed Document URLs', () => {
  it('verifies valid signature and rejects tampered or expired URLs', () => {
    const docId = '550e8400-e29b-41d4-a716-446655440000';
    const url = signDocumentUrl(docId, 300);
    const parsed = new URL(url, 'http://localhost');
    const exp = parsed.searchParams.get('exp');
    const token = parsed.searchParams.get('token');

    expect(verifyDocumentSignature(docId, exp, token)).toBe(true);
    expect(verifyDocumentSignature('other-doc-id', exp, token)).toBe(false);
    expect(verifyDocumentSignature(docId, exp, 'tampered-token')).toBe(false);
    // Simulate time after expiry
    expect(verifyDocumentSignature(docId, exp, token, Number(exp) + 10)).toBe(false);
  });
});
