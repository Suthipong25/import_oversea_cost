'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';

export function NewSupplierDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('TH');
  const [notes, setNotes] = useState('');
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          companyName: companyName || name,
          contactPerson,
          phone,
          countryCode,
          notes,
        }),
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'ไม่สามารถเพิ่ม Agent ได้');
        return;
      }
      setOpen(false);
      setName('');
      setCompanyName('');
      setContactPerson('');
      setPhone('');
      setNotes('');
      router.refresh();
    } catch {
      setError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-primary-foreground)] text-xs font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
      >
        <Plus className="w-4 h-4" aria-hidden="true" />
        <span>เพิ่ม Agent ใหม่</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-agent-title"
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-xl space-y-4">
            <h2 id="new-agent-title" className="text-base font-bold">
              เพิ่ม Agent / Supplier ใหม่
            </h2>
            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label htmlFor="ag-name" className="block font-semibold">
                  ชื่อ Agent ที่ใช้แสดงในตาราง *
                </label>
                <input
                  id="ag-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="เช่น COST COSCO"
                  className="w-full px-3 py-2 rounded-lg border border-[var(--color-border-strong)]"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="ag-company" className="block font-semibold">
                  ชื่อบริษัท
                </label>
                <input
                  id="ag-company"
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="เช่น COSCO Shipping Lines (Thailand)"
                  className="w-full px-3 py-2 rounded-lg border border-[var(--color-border-strong)]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="ag-contact" className="block font-semibold">
                    ผู้ติดต่อ
                  </label>
                  <input
                    id="ag-contact"
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--color-border-strong)]"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="ag-phone" className="block font-semibold">
                    เบอร์โทร / LINE
                  </label>
                  <input
                    id="ag-phone"
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--color-border-strong)]"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label htmlFor="ag-country" className="block font-semibold">
                  รหัสประเทศ
                </label>
                <input
                  id="ag-country"
                  type="text"
                  maxLength={4}
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="w-24 px-3 py-2 rounded-lg border border-[var(--color-border-strong)] uppercase font-mono"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="ag-notes" className="block font-semibold">
                  หมายเหตุ
                </label>
                <textarea
                  id="ag-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--color-border-strong)]"
                />
              </div>
              {error && (
                <div role="alert" className="p-2 rounded bg-red-50 text-[var(--color-destructive)]">
                  {error}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-[var(--color-border-strong)]"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-foreground)] font-semibold disabled:opacity-50"
                >
                  {submitting ? 'กำลังบันทึก...' : 'บันทึก Agent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
