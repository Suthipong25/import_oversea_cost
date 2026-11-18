import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Font } from '@react-pdf/renderer';

const FONTS_DIR = path.resolve(process.cwd(), 'src/lib/pdf/fonts');
const LOGO_PATH = path.resolve(process.cwd(), 'public/perkin-logo.jpg');

let fontsRegistered = false;
let cachedLogo: { data: Buffer; format: 'jpg' } | null | undefined;

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
