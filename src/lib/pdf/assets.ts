import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Font } from '@react-pdf/renderer';

const FONTS_DIR = path.resolve(process.cwd(), 'src/lib/pdf/fonts');
const LOGO_PATH = path.resolve(process.cwd(), 'public/perkin-logo.jpg');

let fontsRegistered = false;
let cachedLogo: { data: Buffer; format: 'jpg' } | null | undefined;

/**
 * ลงทะเบียนฟอนต์ภาษาไทย Sarabun (Regular + Bold) สำหรับ @react-pdf/renderer เพียงครั้งเดียว
 * ใช้ร่วมกันทั้ง 3 เอกสาร PDF: Compare Cost, Sale Price Approve Request และ Quotation
 */
export function ensurePdfFontsRegistered(): void {
  if (fontsRegistered) return;
  Font.register({
    family: 'Sarabun',
    fonts: [
      { src: path.join(FONTS_DIR, 'Sarabun-Regular.ttf'), fontWeight: 'normal' },
      { src: path.join(FONTS_DIR, 'Sarabun-Bold.ttf'), fontWeight: 'bold' },
    ],
  });
  fontsRegistered = true;
}

/**
 * โหลดโลโก้บริษัท Perkin จาก public/perkin-logo.jpg เป็น Buffer แล้วแคชไว้ในหน่วยความจำ
 * หมายเหตุสำคัญ: ห้ามส่งสตริงพาธไฟล์ Windows (เช่น C:\...) ให้ <Image src> ของ @react-pdf/renderer โดยตรง
 * เพราะไลบรารีจะเข้าใจผิดว่า "C:" คือ URL scheme แล้วเกิด fetch failed — ต้องส่งเป็น `{ data: Buffer, format: 'jpg' }`
 */
export function getPerkinLogoSrc(): { data: Buffer; format: 'jpg' } | null {
  if (cachedLogo !== undefined) return cachedLogo;
  try {
    if (!existsSync(LOGO_PATH)) {
      cachedLogo = null;
      return null;
    }
    cachedLogo = {
      data: readFileSync(LOGO_PATH),
      format: 'jpg',
    };
    return cachedLogo;
  } catch {
    cachedLogo = null;
    return null;
  }
}
