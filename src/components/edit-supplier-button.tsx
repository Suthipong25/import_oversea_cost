'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, X } from 'lucide-react';

export function EditSupplierButton({
  supplier,
}: {
  supplier: {
    id: string;
    name: string;
    companyName: string;
    contactPerson: string | null;
    phone: string | null;
    email: string | null;
    countryCode: string;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(supplier.name);
  const [companyName, setCompanyName] = useState(supplier.companyName);
  const [contactPerson, setContactPerson] = useState(supplier.contactPerson ?? '');
  const [phone, setPhone] = useState(supplier.phone ?? '');
  const [email, setEmail] = useState(supplier.email ?? '');
  const [countryCode, setCountryCode] = useState(supplier.countryCode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setSaving(true);
    try {
      const res = await fetch(`/api/suppliers/${supplier.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          companyName,
          contactPerson: contactPerson || null,
          phone: phone || null,
          email: email || null,
          countryCode,
        }),
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'บันทึกการแก้ไขไม่สำเร็จ');
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`แก้ไข Agent ${supplier.name}`}
        title={`แก้ไข Agent ${supplier.name}`}
        className="inline-flex items-center justify-center p-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:border-blue-200 hover:text-[var(--accent)] ui-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`edit-sup-${supplier.id}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px] flex items-center justify-center p-4 text-left"
        >
          <div
            className="w-full max-w-md bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-[20px] p-6 space-y-5"
            style={{ boxShadow: 'var(--shadow-modal)' }}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id={`edit-sup-${supplier.id}`} className="text-base font-bold">
                แก้ไขรายชื่อ Agent
              </h2>
              <button
                type="button"
                aria-label="ปิดหน้าต่าง"
                onClick={() => setOpen(false)}
                className="p-1 rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label htmlFor={`es-name-${supplier.id}`} className="block font-semibold">
                  ชื่อ Agent ในตาราง *
                </label>
                <input
                  id={`es-name-${supplier.id}`}
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)]"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor={`es-company-${supplier.id}`} className="block font-semibold">
                  ชื่อบริษัท *
                </label>
                <input
                  id={`es-company-${supplier.id}`}
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor={`es-contact-${supplier.id}`} className="block font-semibold">
                    ผู้ติดต่อ
                  </label>
                  <input
                    id={`es-contact-${supplier.id}`}
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)]"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor={`es-phone-${supplier.id}`} className="block font-semibold">
                    โทร / LINE
                  </label>
                  <input
                    id={`es-phone-${supplier.id}`}
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor={`es-email-${supplier.id}`} className="block font-semibold">
                    อีเมล
                  </label>
                  <input
                    id={`es-email-${supplier.id}`}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)]"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor={`es-country-${supplier.id}`} className="block font-semibold">
                    ประเทศ
                  </label>
                  <input
                    id={`es-country-${supplier.id}`}
                    type="text"
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] font-mono uppercase"
                  />
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="p-2.5 rounded-lg bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)] font-medium"
                >
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[var(--border-default)] font-semibold"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-[var(--brand)] text-[var(--brand-fg)] font-semibold disabled:opacity-50"
                >
                  {saving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
