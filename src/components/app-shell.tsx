'use client';

import { Suspense, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Package, ListChecks, Building2, Menu, X } from 'lucide-react';
import type { AuthUser } from '@/lib/auth/session';
import { NavigationProgress } from './navigation-progress';

const NAV_ITEMS = [
  { href: '/shipments', label: 'รายการ Cost Agent', sub: 'Cost Agent & Compare', icon: Package },
  { href: '/suppliers', label: 'รายชื่อ Agent', sub: 'Agents / Carriers', icon: Building2 },
  { href: '/settings/subjects', label: 'หัวข้อค่าใช้จ่าย', sub: 'FCL & LCL Subjects', icon: ListChecks },
];

export function AppShell({ user, children }: { user: AuthUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarContent = (
    <div className="h-full flex flex-col justify-between p-4">
      <div className="space-y-8">
        {/* Official Perkin Brand Mark */}
        <Link
          href="/shipments"
          onClick={() => setMobileOpen(false)}
          className="flex flex-col gap-2 px-2 py-1 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <div className="inline-flex items-center justify-center bg-white rounded-xl px-3 py-2 w-fit shadow-xs">
            <Image
              src="/perkin-logo.jpg"
              alt="Perkin Logistics"
              width={116}
              height={44}
              unoptimized
              className="h-7 w-auto object-contain"
            />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-white tracking-tight leading-tight truncate">
              Perkin FreightRate
            </div>
            <div className="text-[11px] text-[var(--text-sidebar-muted)] truncate mt-0.5">
              Perkin Logistics (Thailand)
            </div>
          </div>
        </Link>

        {/* Navigation Links */}
        <nav aria-label="Primary navigation" className="space-y-1.5">
          <div className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-sidebar-muted)]">
            Workspace
          </div>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs ui-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
                  isActive
                    ? 'bg-[var(--surface-sidebar-active)] text-white font-semibold'
                    : 'text-[var(--text-sidebar)] hover:bg-[var(--surface-sidebar-hover)]'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-white' : 'text-[var(--text-sidebar-muted)] group-hover:text-white'
                  }`}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <div className="truncate leading-snug">{item.label}</div>
                  <div className="text-[11px] text-[var(--text-sidebar-muted)] truncate">
                    {item.sub}
                  </div>
                </div>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Staff Identity Pill */}
      <div className="p-3 rounded-xl bg-white/6 border border-white/10 space-y-1">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-500/25 border border-blue-400/30 text-blue-100 flex items-center justify-center text-xs font-bold shrink-0">
            PK
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-white truncate">{user.fullName}</div>
            <div className="text-[11px] text-[var(--text-sidebar-muted)] truncate">
              Perkin PostgreSQL Live
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[var(--surface-canvas)] text-[var(--text-primary)]">
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      {/* Mobile Header Bar */}
      <div className="lg:hidden print:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-[var(--surface-sidebar)] text-white">
        <Link href="/shipments" className="flex items-center gap-2.5 font-bold text-sm">
          <span className="inline-flex bg-white rounded-md px-2 py-1">
            <Image
              src="/perkin-logo.jpg"
              alt="Perkin Logistics"
              width={72}
              height={28}
              unoptimized
              className="h-4 w-auto object-contain"
            />
          </span>
          <span>FreightRate</span>
        </Link>
        <button
          type="button"
          aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
          onClick={() => setMobileOpen((v) => !v)}
          className="p-2 rounded-lg hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="w-64 bg-[var(--surface-sidebar)] shadow-xl">{sidebarContent}</div>
          <button
            type="button"
            aria-label="Dismiss navigation overlay"
            onClick={() => setMobileOpen(false)}
            className="flex-1 bg-slate-950/40"
          />
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside
        aria-label="Sidebar"
        className="hidden lg:block print:hidden w-64 shrink-0 bg-[var(--surface-sidebar)] sticky top-0 h-screen"
      >
        {sidebarContent}
      </aside>

      {/* Main Content Canvas */}
      <main className="flex-1 min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8 print:p-0">
        <div key={pathname} className="page-enter">
          {children}
        </div>
      </main>
    </div>
  );
}
