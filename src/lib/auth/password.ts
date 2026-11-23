import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;

/**
 * แฮชรหัสผ่านข้อความเปล่าด้วยฟังก์ชัน scrypt ของ Node.js พร้อม Salt สุ่ม 16 ไบต์
 * รูปแบบผลลัพธ์ที่จัดเก็บในฐานข้อมูล: `<salt_hex>:<derived_key_hex>`
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${salt}:${derived}`;
}

/**
 * ตรวจสอบความถูกต้องของรหัสผ่านข้อความเปล่าเทียบกับ Hash ในฐานข้อมูล
 * ใช้ `timingSafeEqual` เพื่อป้องกันการโจมตีแบบ Timing Attack (วิเคราะห์เวลาตอบสนองเพื่อเดารหัสผ่าน)
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;

  const expected = Buffer.from(keyHex, 'hex');
  const actual = scryptSync(password, salt, KEY_LENGTH);
  if (expected.length !== actual.length) return false;

  return timingSafeEqual(expected, actual);
}
