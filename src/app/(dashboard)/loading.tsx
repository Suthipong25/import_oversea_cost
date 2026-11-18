export default function DashboardLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="กำลังโหลดข้อมูล..."
      className="max-w-6xl mx-auto space-y-6 page-enter"
    >
      {/* Header Skeleton */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2.5">
          <div className="h-3 w-36 rounded-md bg-[var(--surface-muted)] animate-pulse" />
          <div className="h-7 w-64 rounded-lg bg-[var(--surface-muted)] animate-pulse" />
          <div className="h-3.5 w-96 max-w-full rounded-md bg-[var(--surface-muted)] animate-pulse" />
        </div>
        <div className="h-10 w-40 rounded-xl bg-[var(--surface-muted)] animate-pulse" />
      </div>

      {/* Filter Bar Skeleton */}
      <div className="card-elevated rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-24 rounded-lg bg-[var(--surface-muted)] animate-pulse" />
          <div className="h-8 w-24 rounded-lg bg-[var(--surface-muted)] animate-pulse" />
          <div className="h-8 w-24 rounded-lg bg-[var(--surface-muted)] animate-pulse" />
        </div>
        <div className="h-8 w-64 max-w-full rounded-lg bg-[var(--surface-muted)] animate-pulse" />
      </div>

      {/* Main Card Table Skeleton */}
      <div className="card-elevated rounded-2xl overflow-hidden">
        <div className="px-5 py-4 bg-[var(--surface-subtle)] border-b border-[var(--border-subtle)] flex items-center gap-4">
          <div className="h-3.5 w-24 rounded bg-[var(--surface-muted)] animate-pulse" />
          <div className="h-3.5 w-32 rounded bg-[var(--surface-muted)] animate-pulse" />
          <div className="h-3.5 w-28 rounded bg-[var(--surface-muted)] animate-pulse" />
          <div className="h-3.5 w-20 rounded bg-[var(--surface-muted)] animate-pulse ml-auto" />
        </div>
        <div className="divide-y divide-[var(--border-subtle)]">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="px-5 py-4 flex items-center gap-4">
              <div className="h-4 w-4 rounded bg-[var(--surface-muted)] animate-pulse shrink-0" />
              <div className="space-y-1.5 flex-1">
                <div className="h-4 w-44 rounded bg-[var(--surface-muted)] animate-pulse" />
                <div className="h-3 w-28 rounded bg-[var(--surface-muted)] animate-pulse" />
              </div>
              <div className="h-6 w-24 rounded-lg bg-[var(--surface-muted)] animate-pulse hidden sm:block" />
              <div className="h-5 w-28 rounded bg-[var(--surface-muted)] animate-pulse" />
              <div className="h-8 w-24 rounded-lg bg-[var(--surface-muted)] animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      <span className="sr-only">กำลังโหลดหน้าถัดไป...</span>
    </div>
  );
}
