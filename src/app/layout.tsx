import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Noto_Sans_Thai } from 'next/font/google';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-latin',
  display: 'swap',
});

const notoSansThai = Noto_Sans_Thai({
  subsets: ['thai'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-thai',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Perkin FreightRate — Cost Comparison & Rate Workflow',
  description:
    'Internal freight-forwarding rate intake, AI verification, cost comparison, and sale price approval platform for Perkin Logistics (Thailand) Co., Ltd.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${plusJakarta.variable} ${notoSansThai.variable}`}>
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  );
}
