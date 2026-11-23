'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, X } from 'lucide-react';

interface ContainerRow {
  containerType: string;
  quantity: number;
}

const CONTAINER_PRESETS = ['40DV', '20GP', '40HQ', '45HQ', '20RF', '40RF', 'LCL'];

export function NewShipmentDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [polPortCode, setPolPortCode] = useState('USLAX');
  const [podPortCode, setPodPortCode] = useState('THLCH');
  const [incoterm, setIncoterm] = useState('EXW');
  const [commodityDescription, setCommodityDescription] = useState('');
  const [targetEtd, setTargetEtd] = useState('');
  const [containers, setContainers] = useState<ContainerRow[]>([
    { containerType: '40DV', quantity: 1 },
    { containerType: '20GP', quantity: 1 },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  function addContainerRow() {
    setContainers((prev) => [...prev, { containerType: '40HQ', quantity: 1 }]);
  }

  function removeContainerRow(index: number) {
    setContainers((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  function updateContainer(index: number, patch: Partial<ContainerRow>) {
    setContainers((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName,
          polPortCode,
          podPortCode,
          incoterm,
          commodityDescription,
          targetEtd: targetEtd || null,
          containers,
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        data?: { id: string };
        error?: { message?: string };
      };

      if (!res.ok || !json.success || !json.data) {
        setError(json.error?.message ?? 'สร้างงานไม่สำเร็จ กรุณาตรวจสอบข้อมูล');
        return;
      }

      setOpen(false);
      router.push(`/shipments/${json.data.id}`);
      router.refresh();
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-[var(--brand-fg)] text-xs font-semibold shadow-sm ui-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
      >
        <Plus className="w-4 h-4" aria-hidden="true" />
        <span>สร้างงานเปรียบเทียบใหม่</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-shipment-title"
          className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px] flex items-center justify-center p-4"
        >
          {/* Concentric radii: outer 20px, padding 24px, inner inputs 8px */}
          <div
            className="w-full max-w-lg bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-[20px] p-6 space-y-6"
            style={{ boxShadow: 'var(--shadow-modal)' }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 id="new-shipment-title" className="text-base font-bold text-[var(--text-primary)]">
                  สร้างงานเปรียบเทียบราคาใหม่
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  รองรับทั้งงานเต็มตู้ (FCL เช่น 1×40 DV + 1×20 GP) และงานไม่เต็มตู้ (LCL)
                </p>
              </div>
              <button
                type="button"
                aria-label="ปิดหน้าต่าง"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)] ui-interactive"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 text-xs">
              <div className="space-y-1.5">
                <label htmlFor="ns-customer" className="block font-semibold text-[var(--text-primary)]">
                  ชื่อลูกค้า / ชื่องาน *
                </label>
                <input
                  id="ns-customer"
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="เช่น Import USA — Delta / MSL / Air"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] text-sm ui-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="ns-pol" className="block font-semibold">
                    ต้นทาง (POL) *
                  </label>
                  <input
                    id="ns-pol"
                    type="text"
                    required
                    value={polPortCode}
                    onChange={(e) => setPolPortCode(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] uppercase font-mono ui-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="ns-pod" className="block font-semibold">
                    ปลายทาง (POD) *
                  </label>
                  <input
                    id="ns-pod"
                    type="text"
                    required
                    value={podPortCode}
                    onChange={(e) => setPodPortCode(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] uppercase font-mono ui-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="ns-incoterm" className="block font-semibold">
                    Incoterm
                  </label>
                  <input
                    id="ns-incoterm"
                    type="text"
                    value={incoterm}
                    onChange={(e) => setIncoterm(e.target.value)}
                    placeholder="EXW / FOB"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] uppercase ui-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  />
                </div>
              </div>

              {/* Containers Surface Group */}
              <div className="p-3.5 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-subtle)] space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-[var(--text-primary)]">
                    ประเภทงาน / ขนาดตู้ (FCL หรือ LCL) *
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setContainers([{ containerType: 'LCL', quantity: 1 }])}
                      className="text-[var(--text-secondary)] font-semibold hover:text-[var(--accent)] hover:underline"
                    >
                      สลับเป็น LCL
                    </button>
                    <button
                      type="button"
                      onClick={addContainerRow}
                      className="text-[var(--accent)] font-semibold hover:underline"
                    >
                      + เพิ่มขนาดตู้
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {containers.map((row, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select
                        aria-label={`Container type ${idx + 1}`}
                        value={row.containerType}
                        onChange={(e) => updateContainer(idx, { containerType: e.target.value })}
                        className="flex-1 px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                      >
                        {CONTAINER_PRESETS.map((preset) => (
                          <option key={preset} value={preset}>
                            {preset}
                          </option>
                        ))}
                      </select>
                      <div className="relative flex items-center">
                        <input
                          aria-label={`Container quantity ${idx + 1}`}
                          type="number"
                          min={1}
                          max={999}
                          value={row.quantity}
                          onChange={(e) =>
                            updateContainer(idx, { quantity: Math.max(1, Number(e.target.value) || 1) })
                          }
                          className="w-28 px-3 py-2 pr-12 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] text-right tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                        />
                        <span className="absolute right-2.5 text-[11px] text-[var(--text-muted)] pointer-events-none font-medium">
                          {row.containerType === 'LCL' ? 'CBM' : 'ตู้'}
                        </span>
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove container row ${idx + 1}`}
                        disabled={containers.length <= 1}
                        onClick={() => removeContainerRow(idx)}
                        className="p-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] hover:bg-[var(--status-danger-bg)] hover:text-[var(--status-danger-fg)] disabled:opacity-40 ui-interactive"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
                {containers.some((c) => c.containerType === 'LCL') && (
                  <p className="text-[11px] text-[var(--accent)] font-medium pt-1">
                    💡 งาน LCL: รายการที่คิดราคา per CBM / W/M / R/T จะนำปริมาตร (CBM) ไปคูณเพื่อได้ Cost สุทธิให้อัตโนมัติ (เช่น 2 CBM × 2, 4 CBM × 4)
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="ns-commodity" className="block font-semibold">
                    สินค้า (Commodity)
                  </label>
                  <input
                    id="ns-commodity"
                    type="text"
                    value={commodityDescription}
                    onChange={(e) => setCommodityDescription(e.target.value)}
                    placeholder="FAK / Machinery"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="ns-etd" className="block font-semibold">
                    Target ETD
                  </label>
                  <input
                    id="ns-etd"
                    type="date"
                    value={targetEtd}
                    onChange={(e) => setTargetEtd(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  />
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="p-3 rounded-lg bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] text-[var(--status-danger-fg)] font-medium"
                >
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] hover:bg-[var(--surface-muted)] font-semibold ui-interactive"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-[var(--brand-fg)] font-semibold disabled:opacity-50 ui-interactive"
                >
                  {submitting ? 'กำลังสร้าง...' : 'สร้างงาน & เปิดหน้า Compare'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
