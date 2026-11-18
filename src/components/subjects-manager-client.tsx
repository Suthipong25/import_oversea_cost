'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Search, Trash2, X } from 'lucide-react';

export interface ManagedSubjectItem {
  id: string;
  code: string;
  nameEn: string;
  nameTh: string | null;
  category: string;
  defaultWhtPercent: string;
  isSectionHeader: boolean;
  aliases: string[];
}

const CATEGORIES = [
  { value: 'Ocean', label: 'Ocean (ค่าระวางเรือ)' },
  { value: 'Origin_Local', label: 'Origin_Local (ต้นทาง)' },
  { value: 'Dest_Port', label: 'Dest_Port (ปลายทาง / ท่าเรือ / LCL)' },
  { value: 'TH_Local_Transport', label: 'TH_Local_Transport (ในประเทศ / ขนส่ง)' },
  { value: 'Insurance_Misc', label: 'Insurance_Misc (ประกัน / อื่นๆ)' },
  { value: 'Other', label: 'Other' },
] as const;

function categoryBadge(cat: string): string {
  switch (cat) {
    case 'Ocean':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'Origin_Local':
      return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'Dest_Port':
      return 'bg-teal-50 text-teal-700 border-teal-200';
    case 'TH_Local_Transport':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'Insurance_Misc':
      return 'bg-slate-100 text-slate-700 border-slate-200';
    default:
      return 'bg-[var(--surface-muted)] text-[var(--text-secondary)] border-[var(--border-subtle)]';
  }
}

export function SubjectsManagerClient({ subjects }: { subjects: ManagedSubjectItem[] }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameEn, setNameEn] = useState('');
  const [nameTh, setNameTh] = useState('');
  const [category, setCategory] = useState<string>('Dest_Port');
  const [defaultWhtPercent, setDefaultWhtPercent] = useState('0');
  const [isSectionHeader, setIsSectionHeader] = useState(false);
  const [aliasesText, setAliasesText] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!modalOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setModalOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modalOpen]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return subjects;
    return subjects.filter((s) =>
      `${s.nameEn} ${s.nameTh ?? ''} ${s.category} ${s.aliases.join(' ')}`.toLowerCase().includes(q)
    );
  }, [subjects, search]);

  function openAddModal() {
    setEditingId(null);
    setNameEn('');
    setNameTh('');
    setCategory('Dest_Port');
    setDefaultWhtPercent('0');
    setIsSectionHeader(false);
    setAliasesText('');
    setError(null);
    setModalOpen(true);
  }

  function openEditModal(sub: ManagedSubjectItem) {
    setEditingId(sub.id);
    setNameEn(sub.nameEn);
    setNameTh(sub.nameTh ?? '');
    setCategory(sub.category);
    setDefaultWhtPercent(Number(sub.defaultWhtPercent || '0').toString());
    setIsSectionHeader(sub.isSectionHeader);
    setAliasesText(sub.aliases.join(', '));
    setError(null);
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const aliases = aliasesText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const endpoint = editingId ? `/api/catalog/${editingId}` : '/api/catalog';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nameEn,
          nameTh: nameTh || null,
          category,
          defaultWhtPercent: Number(defaultWhtPercent) || 0,
          isSectionHeader,
          aliases,
        }),
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'บันทึกไม่สำเร็จ');
        return;
      }
      setModalOpen(false);
      router.refresh();
    } catch {
      setError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(sub: ManagedSubjectItem) {
    const confirmed = window.confirm(
      `ต้องการลบหัวข้อ "${sub.nameEn}" ออกจากรายการมาตรฐานใช่หรือไม่?`
    );
    if (!confirmed) return;

    setDeletingId(sub.id);
    try {
      const res = await fetch(`/api/catalog/${sub.id}`, { method: 'DELETE' });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) {
        alert(json.error?.message ?? 'ลบหัวข้อไม่สำเร็จ');
        return;
      }
      router.refresh();
    } catch {
      alert('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
            Master Catalog
          </div>
          <h1 className="text-2xl font-bold tracking-tight">หัวข้อค่าใช้จ่ายมาตรฐาน</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            เพิ่ม แก้ไข หรือลบหัวข้อค่าใช้จ่ายพร้อมคำย่อ (AI Aliases) และอัตรา WHT ตั้งต้นได้ทันที
          </p>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-[var(--brand-fg)] text-xs font-semibold shadow-sm ui-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>เพิ่มหัวข้อใหม่</span>
        </button>
      </header>

      {/* Search Bar */}
      <div className="card-elevated rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="relative w-full sm:w-80">
          <Search
            className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="text"
            aria-label="ค้นหาหัวข้อค่าใช้จ่ายหรือคำย่อ"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อหัวข้อ, ภาษาไทย, หรือคำย่อ (THC, CFS, VGM)..."
            className="w-full pl-8 pr-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          />
        </div>
        <span className="text-[var(--text-muted)] tabular-nums">
          แสดง {filtered.length} จาก {subjects.length} รายการ
        </span>
      </div>

      {/* Master Catalog Table */}
      <section className="card-elevated rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[var(--surface-subtle)] border-b border-[var(--border-subtle)] text-[var(--text-muted)] uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4 font-semibold w-12">#</th>
                <th className="py-3 px-4 font-semibold">Subject (EN)</th>
                <th className="py-3 px-4 font-semibold">ชื่อภาษาไทย</th>
                <th className="py-3 px-4 font-semibold">หมวด</th>
                <th className="py-3 px-4 font-semibold text-right">WHT %</th>
                <th className="py-3 px-4 font-semibold">คำย่อที่ AI รู้จัก (Aliases)</th>
                <th className="py-3 px-4 font-semibold text-right w-24">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {filtered.map((sub, idx) => (
                <tr
                  key={sub.id}
                  className={
                    sub.isSectionHeader
                      ? 'bg-[var(--surface-muted)] font-bold'
                      : 'hover:bg-[var(--surface-subtle)] ui-interactive'
                  }
                >
                  <td className="py-3 px-4 tabular-nums text-[var(--text-muted)]">{idx + 1}</td>
                  <td className="py-3 px-4 font-semibold text-[var(--text-primary)]">
                    {sub.nameEn}
                  </td>
                  <td className="py-3 px-4 text-[var(--text-secondary)]">
                    {sub.nameTh ?? '—'}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-md border text-[11px] font-medium ${categoryBadge(sub.category)}`}
                    >
                      {sub.category}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums font-medium">
                    {Number(sub.defaultWhtPercent) > 0 ? `${sub.defaultWhtPercent}%` : '—'}
                  </td>
                  <td className="py-3 px-4">
                    {sub.aliases.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {sub.aliases.map((a) => (
                          <span
                            key={a}
                            className="px-1.5 py-0.5 rounded bg-[var(--surface-muted)] text-[11px] font-mono text-[var(--text-secondary)]"
                          >
                            {a}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[var(--text-muted)]">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditModal(sub)}
                        aria-label={`แก้ไขหัวข้อ ${sub.nameEn}`}
                        title={`แก้ไขหัวข้อ ${sub.nameEn}`}
                        className="inline-flex items-center justify-center p-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:border-[var(--accent)]/30 hover:text-[var(--accent)] ui-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === sub.id}
                        onClick={() => handleDelete(sub)}
                        aria-label={`ลบหัวข้อ ${sub.nameEn}`}
                        title={`ลบหัวข้อ ${sub.nameEn}`}
                        className="inline-flex items-center justify-center p-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-muted)] hover:bg-[var(--status-danger-bg)] hover:border-[var(--status-danger-border)] hover:text-[var(--status-danger-fg)] disabled:opacity-40 ui-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[var(--text-muted)]">
                    ไม่พบหัวข้อค่าใช้จ่ายที่ค้นหา
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Shared Add / Edit Subject Modal */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="subject-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
          className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px] flex items-center justify-center p-4"
        >
          <div
            className="w-full max-w-lg bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-[20px] p-6 space-y-5"
            style={{ boxShadow: 'var(--shadow-modal)' }}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id="subject-modal-title" className="text-base font-bold">
                {editingId ? 'แก้ไขหัวข้อค่าใช้จ่าย' : 'เพิ่มหัวข้อค่าใช้จ่ายใหม่'}
              </h2>
              <button
                type="button"
                aria-label="ปิดหน้าต่าง"
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label htmlFor="sub-en" className="block font-semibold">
                  ชื่อหัวข้อภาษาอังกฤษ (Subject EN) *
                </label>
                <input
                  id="sub-en"
                  type="text"
                  required
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  placeholder="เช่น Seal Fee, VGM (Verified Gross Mass), CFS Charge"
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)]"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="sub-th" className="block font-semibold">
                  ชื่อภาษาไทย
                </label>
                <input
                  id="sub-th"
                  type="text"
                  value={nameTh}
                  onChange={(e) => setNameTh(e.target.value)}
                  placeholder="เช่น ค่าซีลตู้, ค่าแจ้งน้ำหนักตู้ (VGM)"
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="sub-cat" className="block font-semibold">
                    หมวดหมู่ (Category)
                  </label>
                  <select
                    id="sub-cat"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)]"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="sub-wht" className="block font-semibold">
                    อัตรา WHT ตั้งต้น (%)
                  </label>
                  <input
                    id="sub-wht"
                    type="number"
                    step="0.5"
                    min="0"
                    max="30"
                    value={defaultWhtPercent}
                    onChange={(e) => setDefaultWhtPercent(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] text-right tabular-nums"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="sub-aliases" className="block font-semibold">
                  คำย่อที่ให้ AI จับคู่เข้าหัวข้อนี้ (คั่นด้วยเครื่องหมายจุลภาค ,)
                </label>
                <input
                  id="sub-aliases"
                  type="text"
                  value={aliasesText}
                  onChange={(e) => setAliasesText(e.target.value)}
                  placeholder="เช่น SEAL FEE, SEAL, CONTAINER SEAL"
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] font-mono"
                />
              </div>

              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSectionHeader}
                  onChange={(e) => setIsSectionHeader(e.target.checked)}
                  className="accent-[var(--brand)]"
                />
                <span className="font-medium text-[var(--text-secondary)]">
                  เป็นแถวหัวข้อหมวดคั่นตาราง (เช่น Local Charge — ไม่กรอกตัวเลข)
                </span>
              </label>

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
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[var(--border-default)] font-semibold"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-[var(--brand)] text-[var(--brand-fg)] font-semibold disabled:opacity-50"
                >
                  {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
