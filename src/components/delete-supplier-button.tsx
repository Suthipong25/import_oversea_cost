'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';

export function DeleteSupplierButton({
  id,
  name,
  companyName,
}: {
  id: string;
  name: string;
  companyName: string;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    const confirmed = window.confirm(
      `ต้องการลบ Agent "${name}" (${companyName}) ออกจากรายชื่อใช่หรือไม่?`
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/suppliers/${id}`, { method: 'DELETE' });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) {
        alert(json.error?.message ?? 'ลบรายชื่อ Agent ไม่สำเร็จ');
        return;
      }
      router.refresh();
    } catch {
      alert('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      type="button"
      disabled={deleting}
      onClick={handleDelete}
      aria-label={`ลบ Agent ${name}`}
      title={`ลบ Agent ${name}`}
      className="inline-flex items-center justify-center p-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-muted)] hover:bg-[var(--status-danger-bg)] hover:border-[var(--status-danger-border)] hover:text-[var(--status-danger-fg)] disabled:opacity-40 ui-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
    </button>
  );
}
