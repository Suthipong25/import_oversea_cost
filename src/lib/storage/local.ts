import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB

export type DetectedFileType = 'PDF' | 'IMAGE';

export interface ValidatedFile {
  fileType: DetectedFileType;
  mimeType: string;
  extension: string;
  sha256: string;
  size: number;
}

/**
 * ตรวจสอบชนิดไฟล์จาก Magic Bytes ที่หัวไฟล์จริง (ไม่เชื่อถือ MIME หรือนามสกุลไฟล์ที่ Client ส่งมา)
 * รองรับเฉพาะเอกสาร PDF และรูปภาพ PNG, JPEG, WEBP ขนาดไม่เกิน 20 MB
 */
export function validateFileMagicBytes(buffer: Buffer): ValidatedFile {
  if (buffer.length === 0) {
    throw new Error('Uploaded file is empty.');
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error('File exceeds maximum allowed size of 20 MB.');
  }

  const sha256 = createHash('sha256').update(buffer).digest('hex');

  // PDF: "%PDF-" (25 50 44 46 2D)
  if (
    buffer.length >= 5 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  ) {
    return {
      fileType: 'PDF',
      mimeType: 'application/pdf',
      extension: 'pdf',
      sha256,
      size: buffer.length,
    };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return {
      fileType: 'IMAGE',
      mimeType: 'image/png',
      extension: 'png',
      sha256,
      size: buffer.length,
    };
  }

  // JPEG: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return {
      fileType: 'IMAGE',
      mimeType: 'image/jpeg',
      extension: 'jpg',
      sha256,
      size: buffer.length,
    };
  }

  // WEBP: "RIFF" .... "WEBP"
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return {
      fileType: 'IMAGE',
      mimeType: 'image/webp',
      extension: 'webp',
      sha256,
      size: buffer.length,
    };
  }

  throw new Error('Unsupported or invalid file format. Only PDF, PNG, JPG, and WEBP are allowed.');
}

function getStorageRoot(): string {
  return path.resolve(process.cwd(), process.env.STORAGE_ROOT ?? './storage');
}

function getSigningSecret(): string {
  return process.env.APP_SECRET ?? 'perkin-freightrate-dev-fallback-secret';
}

/**
 * บันทึกไฟล์แนบต้นฉบับลงโฟลเดอร์ส่วนตัวของระบบ (อยู่นอกโฟลเดอร์ Public เสมอ)
 * กรองชื่อโฟลเดอร์ shipmentId ป้องกัน Directory Traversal Attack
 */
export async function savePrivateFile(
  shipmentId: string,
  buffer: Buffer,
  validated: ValidatedFile
): Promise<string> {
  const root = getStorageRoot();
  const safeShipmentDir = shipmentId.replace(/[^a-zA-Z0-9-]/g, '');
  const relDir = path.join('rates', safeShipmentDir);
  const absDir = path.join(root, relDir);
  await mkdir(absDir, { recursive: true });

  const fileName = `${validated.sha256.slice(0, 24)}_${Date.now()}.${validated.extension}`;
  const relPath = path.join(relDir, fileName).replace(/\\/g, '/');
  const absPath = path.join(root, relPath);

  await writeFile(absPath, buffer);
  return relPath;
}

/**
 * อ่านไฟล์ส่วนตัวจากดิสก์ พร้อมตรวจสอบ Path Traversal ข้ามขอบเขต Storage Root
 */
export async function readPrivateFile(relPath: string): Promise<Buffer> {
  const root = getStorageRoot();
  const absPath = path.resolve(root, relPath);
  if (!absPath.startsWith(root)) {
    throw new Error('Invalid storage path traversal attempt.');
  }
  return readFile(absPath);
}

/**
 * สร้าง URL พร้อมลายเซ็นดิจิทัล HMAC-SHA256 ที่มีวันหมดอายุ (ค่าเริ่มต้น 15 นาที)
 * สำหรับให้ผู้ใช้เปิดพรีวิวดูเอกสารต้นฉบับได้อย่างปลอดภัย โดยไม่ต้องเปิดไฟล์เป็น Public
 */
export function signDocumentUrl(documentId: string, ttlSeconds = 900): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${documentId}:${exp}`;
  const token = createHmac('sha256', getSigningSecret()).update(payload).digest('hex');
  return `/api/documents/${documentId}/file?exp=${exp}&token=${token}`;
}

/**
 * ตรวจสอบความถูกต้องและวันหมดอายุของ Token ลายเซ็นแนบไฟล์
 * ป้องกันการแก้ไข Document ID หรือเวลาหมดอายุใน Query String
 */
export function verifyDocumentSignature(
  documentId: string,
  expStr: string | null,
  token: string | null,
  nowUnixSec = Math.floor(Date.now() / 1000)
): boolean {
  if (!expStr || !token) return false;
  const exp = Number(expStr);
  if (!Number.isInteger(exp) || exp < nowUnixSec) return false;

  const expected = createHmac('sha256', getSigningSecret())
    .update(`${documentId}:${exp}`)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(token, 'utf8');
  if (expectedBuf.length !== actualBuf.length) return false;

  return timingSafeEqual(expectedBuf, actualBuf);
}
