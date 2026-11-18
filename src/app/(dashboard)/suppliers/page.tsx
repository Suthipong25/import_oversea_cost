import { asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { suppliers } from '@/lib/db/schema';
import { NewSupplierDialog } from '@/components/new-supplier-dialog';
import { EditSupplierButton } from '@/components/edit-supplier-button';
import { DeleteSupplierButton } from '@/components/delete-supplier-button';

export default async function SuppliersPage() {
  const rows = await db.select().from(suppliers).orderBy(asc(suppliers.name));

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
            Agent Directory
          </div>
          <h1 className="text-2xl font-bold tracking-tight">รายชื่อ Agent ที่ส่งค่า Cost</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            จัดเก็บในตาราง <code className="font-mono text-xs">suppliers</code> บน Perkin PostgreSQL ({rows.length} รายชื่อ)
          </p>
        </div>
        <NewSupplierDialog />
      </header>

      <section className="card-elevated rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[var(--surface-subtle)] border-b border-[var(--border-subtle)] text-[var(--text-muted)] uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-5 font-semibold">ชื่อ Agent ในตาราง</th>
                <th className="py-3.5 px-4 font-semibold">ชื่อบริษัท</th>
                <th className="py-3.5 px-4 font-semibold">ผู้ติดต่อ</th>
                <th className="py-3.5 px-4 font-semibold">โทร / LINE</th>
                <th className="py-3.5 px-4 font-semibold">ประเทศ</th>
                <th className="py-3.5 px-4 font-semibold text-right">สถานะ</th>
                <th className="py-3.5 px-5 font-semibold text-right w-24">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 px-5 text-center text-[var(--text-muted)]">
                    ยังไม่มีรายชื่อ Agent — กดปุ่ม &ldquo;เพิ่ม Agent ใหม่&rdquo; มุมขวาบนได้เลย
                  </td>
                </tr>
              ) : (
                rows.map((s) => (
                  <tr key={s.id} className="hover:bg-[var(--surface-subtle)] ui-interactive">
                    <td className="py-3.5 px-5 font-bold text-sm text-[var(--text-primary)]">
                      {s.name}
                    </td>
                    <td className="py-3.5 px-4 text-[var(--text-primary)]">{s.companyName}</td>
                    <td className="py-3.5 px-4 text-[var(--text-secondary)]">
                      {s.contactPerson ?? '—'}
                    </td>
                    <td className="py-3.5 px-4 text-[var(--text-secondary)] tabular-nums">
                      {s.phone ?? '—'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded-md bg-[var(--surface-muted)] font-mono font-medium">
                        {s.countryCode}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <span className="inline-flex px-2.5 py-0.5 rounded-full border border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)] font-semibold text-[11px]">
                        {s.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <EditSupplierButton supplier={s} />
                        <DeleteSupplierButton id={s.id} name={s.name} companyName={s.companyName} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
