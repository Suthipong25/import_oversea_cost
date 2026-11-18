'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { LiveFxSnapshot } from '@/lib/fx/live-rate';

interface LiveFxBadgeProps {
  initialRate: number;
  initialMeta?: Pick<LiveFxSnapshot, 'source' | 'isLive' | 'updatedAt'>;
  onRateChange?: (rate: number) => void;
}

export function LiveFxBadge({ initialRate, initialMeta, onRateChange }: LiveFxBadgeProps) {
  const [rate, setRate] = useState<number>(initialRate);
  const [source, setSource] = useState<string>(initialMeta?.source ?? 'Live');
  const [isLive, setIsLive] = useState<boolean>(initialMeta?.isLive ?? true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(initialMeta?.updatedAt ?? null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRate = useCallback(
    async (force: boolean) => {
      if (force) setRefreshing(true);
      try {
        const res = await fetch(`/api/fx/usd-thb${force ? '?refresh=1' : ''}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const json = (await res.json()) as { success?: boolean; data?: LiveFxSnapshot };
        if (json.success && json.data && Number.isFinite(json.data.rate)) {
          setRate(json.data.rate);
          setSource(json.data.source);
          setIsLive(json.data.isLive);
          setUpdatedAt(json.data.updatedAt);
          onRateChange?.(json.data.rate);
        }
      } catch {
        // Keep current rate if offline
      } finally {
        if (force) setRefreshing(false);
      }
    },
    [onRateChange]
  );

  // Auto-refresh every 60s while tab is visible
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void fetchRate(false);
      }
    }, 60_000);
    return () => window.clearInterval(id);
  }, [fetchRate]);

  const timeLabel = updatedAt
    ? new Date(updatedAt).toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const tooltip = `${isLive ? 'อัตราแลกเปลี่ยน Real-time' : 'อัตราสำรอง'} (${source}${
    timeLabel ? ` · อัปเดต ${timeLabel}` : ''
  }) — คลิกเพื่อรีเฟรช`;

  return (
    <button
      type="button"
      onClick={() => void fetchRate(true)}
      disabled={refreshing}
      title={tooltip}
      aria-label={`อัตราแลกเปลี่ยน USD ต่อ THB ปัจจุบัน ${rate.toFixed(2)} บาทต่อดอลลาร์ คลิกเพื่อรีเฟรช`}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] hover:bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] tabular-nums text-xs ui-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          isLive
            ? 'bg-[var(--status-success-fg)] motion-safe:animate-pulse'
            : 'bg-[var(--status-warn-fg)]'
        }`}
        aria-hidden="true"
      />
      <span className="font-medium">
        {isLive ? 'FX Live' : 'FX Ref'} {rate.toFixed(2)} ฿/$
      </span>
      <RefreshCw
        className={`w-3 h-3 text-[var(--text-muted)] ${refreshing ? 'motion-safe:animate-spin' : ''}`}
        aria-hidden="true"
      />
    </button>
  );
}
