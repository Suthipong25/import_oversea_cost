'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Lightweight zero-dependency top progress bar for smooth Next.js App Router transitions.
 * Starts immediately on internal link clicks and completes cleanly when the target route mounts.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearTimers() {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (trickleRef.current) clearInterval(trickleRef.current);
  }

  // Complete progress bar whenever route/query updates
  useEffect(() => {
    clearTimers();
    if (!visible) return;
    setProgress(100);
    timerRef.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 220);
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  // Listen to same-origin internal anchor clicks to start immediately
  useEffect(() => {
    function start() {
      clearTimers();
      setVisible(true);
      setProgress(22);
      trickleRef.current = setInterval(() => {
        setProgress((prev) => (prev < 86 ? prev + Math.max(2, (88 - prev) * 0.14) : prev));
      }, 160);
      // Failsafe cleanup if navigation is aborted
      timerRef.current = setTimeout(() => {
        clearTimers();
        setVisible(false);
        setProgress(0);
      }, 8000);
    }

    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target === '_blank' || anchor.hasAttribute('download')) return;

      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        return;
      }

      try {
        const nextUrl = new URL(anchor.href, window.location.href);
        if (nextUrl.origin !== window.location.origin) return;
        if (nextUrl.pathname.startsWith('/api/')) return;
        if (
          nextUrl.pathname === window.location.pathname &&
          nextUrl.search === window.location.search
        ) {
          return;
        }
        start();
      } catch {
        // Ignore malformed URLs
      }
    }

    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      clearTimers();
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      role="progressbar"
      aria-label="กำลังโหลดหน้าถัดไป"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress)}
      className="fixed top-0 left-0 right-0 z-[100] h-[3px] pointer-events-none print:hidden bg-[var(--accent-soft)] overflow-hidden"
    >
      <div
        className="h-full bg-[var(--accent)] relative overflow-hidden"
        style={{
          width: `${progress}%`,
          transition: 'width 180ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease',
        }}
      >
        <div className="absolute inset-y-0 w-1/3 bg-white/40 nav-progress-glow" />
      </div>
    </div>
  );
}
