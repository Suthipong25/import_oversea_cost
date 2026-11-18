import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { AppShell } from '@/components/app-shell';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    if (process.env.REQUIRE_AUTH === 'true') {
      redirect('/login');
    }
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-[var(--color-bg)]">
        <div className="max-w-md w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 space-y-3 text-sm">
          <h1 className="font-bold text-base">ยังไม่ได้รัน Seed ฐานข้อมูล</h1>
          <p className="text-xs text-[var(--color-text-secondary)]">
            กรุณารันคำสั่งด้านล่างเพื่อสร้างตารางและข้อมูลตั้งต้นใน PostgreSQL ก่อนใช้งาน:
          </p>
          <pre className="p-3 rounded-lg bg-[var(--color-surface-muted)] text-xs font-mono overflow-x-auto">
            npm run db:migrate{'\n'}npm run db:seed
          </pre>
        </div>
      </main>
    );
  }

  return <AppShell user={user}>{children}</AppShell>;
}
