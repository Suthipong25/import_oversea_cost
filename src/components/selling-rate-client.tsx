'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Decimal from 'decimal.js';
import {
  CheckCircle2,
  Send,
  RotateCcw,
  Plus,
  Trash2,
  AlertTriangle,
  Save,
  Printer,
  ArrowRight,
  X,
} from 'lucide-react';
import { calculateSellingRate } from '@/domain/pricing/calculator';
import type { SellingDocumentMeta } from '@/modules/pricing/schema';

export interface SellingLineRow {
  id?: string | null;
  chargeCatalogId?: string | null;
  description: string;
  category: string;
  costAmountThb: string;
  costWhtThb: string;
  costVatThb: string;
  costAmountUsd: string;
  costForeignCurrUsd: string;
  sellingAmountThb: string;
  revenueWhtPercent: string;
  revenueAmountUsd: string;
  chargeUnit: string;
  quantity: string;
  isVatApplicable: boolean;
}

export interface SellingRateWorkspaceProps {
  shipment: {
    id: string;
    shipmentRef: string;
    customerName: string;
    polPortCode: string;
    podPortCode: string;
    incoterm: string | null;
  };
  containers: Array<{ id: string; containerType: string; quantity: number }>;
  selectedAgentName: string | null;
  comparisonStatus: string | null;
  sellingRate: {
    id: string;
    status: string;
    discountAmount: string;
    vatPercent: string;
    requestNotes: string | null;
    rejectionReason: string | null;
    approverName: string | null;
    approvedAt: string | Date | null;
  } | null;
  initialDocMeta: SellingDocumentMeta;
  initialLines: SellingLineRow[];
  requireAuthMode: boolean;
}

function parseDec(val: string | number | null | undefined): Decimal {
  if (val === null || val === undefined) return new Decimal(0);
  const cleaned = String(val).trim().replace(/,/g, '');
  if (!cleaned || cleaned === '-') return new Decimal(0);
  try {
    return new Decimal(cleaned);
  } catch {
    return new Decimal(0);
  }
}

function fmt(val: string | number | Decimal): string {
  try {
    const d = val instanceof Decimal ? val : new Decimal(val);
    return d.toNumber().toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return '0.00';
  }
}

function fmtOptional(val: Decimal): string {
  return val.gt(0) ? fmt(val) : '';
}

function statusBadge(status: string): { label: string; cls: string } {
  switch (status) {
    case 'Approved':
      return {
        label: '✓ อนุมัติแล้ว (Approved)',
        cls: 'bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-border)]',
      };
    case 'Pending_Approval':
      return {
        label: '⏳ รออนุมัติ (Pending Approval)',
        cls: 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/30',
      };
    case 'Returned':
      return {
        label: '↩ ส่งกลับแก้ไข (Returned)',
        cls: 'bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)] border-[var(--status-warn-border)]',
      };
    case 'Needs_Review':
      return {
        label: '⚠ ต้นทุนเปลี่ยน (Needs Review)',
        cls: 'bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)] border-[var(--status-danger-border)]',
      };
    default:
      return {
        label: 'ร่าง (Draft)',
        cls: 'bg-[var(--surface-muted)] text-[var(--text-secondary)] border-[var(--border-subtle)]',
      };
  }
}

export function SellingRateClient(props: SellingRateWorkspaceProps) {
  const router = useRouter();
  const [docMeta, setDocMeta] = useState<SellingDocumentMeta>(props.initialDocMeta);
  const [lines, setLines] = useState<SellingLineRow[]>(props.initialLines);
  const [discountAmount, setDiscountAmount] = useState(
    Number(props.sellingRate?.discountAmount ?? '0') > 0
      ? Number(props.sellingRate?.discountAmount ?? '0').toString()
      : ''
  );
  const [vatPercent, setVatPercent] = useState(props.sellingRate?.vatPercent ?? '7.00');
  const [requestNotes, setRequestNotes] = useState(props.sellingRate?.requestNotes ?? '');
  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnReason, setReturnReason] = useState('');

  useEffect(() => {
    if (!returnOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setReturnOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [returnOpen]);

  const liveCalc = useMemo(
    () =>
      calculateSellingRate({
        lines: lines.map((l) => ({
          costAmountThb: l.costAmountThb || '0',
          sellingAmountThb: l.sellingAmountThb.trim() === '' ? null : l.sellingAmountThb,
          isVatApplicable: l.isVatApplicable,
        })),
        discountAmount: discountAmount || '0',
        vatPercent: vatPercent || '0',
      }),
    [lines, discountAmount, vatPercent]
  );

  // Per-column sums matching Perkin's real Approve Request sheet
  const columnTotals = useMemo(() => {
    const vatRate = parseDec(vatPercent);
    let costWht = new Decimal(0);
    let costVat = new Decimal(0);
    let costThb = new Decimal(0);
    let costUsd = new Decimal(0);
    let costForeign = new Decimal(0);
    let revWht = new Decimal(0);
    let revVat = new Decimal(0);
    let revThb = new Decimal(0);
    let revUsd = new Decimal(0);

    for (const l of lines) {
      costWht = costWht.plus(parseDec(l.costWhtThb));
      costVat = costVat.plus(parseDec(l.costVatThb));
      costThb = costThb.plus(parseDec(l.costAmountThb));
      costUsd = costUsd.plus(parseDec(l.costAmountUsd));
      costForeign = costForeign.plus(parseDec(l.costForeignCurrUsd));

      const sell = parseDec(l.sellingAmountThb);
      revThb = revThb.plus(sell);
      revUsd = revUsd.plus(parseDec(l.revenueAmountUsd));

      if (l.isVatApplicable && sell.gt(0)) {
        const whtPct = parseDec(l.revenueWhtPercent || '3');
        revWht = revWht.plus(
          sell.times(whtPct).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        );
        revVat = revVat.plus(
          sell.times(vatRate).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        );
      }
    }

    return { costWht, costVat, costThb, costUsd, costForeign, revWht, revVat, revThb, revUsd };
  }, [lines, vatPercent]);

  const gpThbNum = Number(liveCalc.grossProfit);
  const gpPctNum = Number(liveCalc.grossMarginPercent);
  const meetsMinGpThb = liveCalc.hasAnySellingPrice && gpThbNum >= 5000;
  const meetsMinGpPct = liveCalc.hasAnySellingPrice && gpPctNum >= 25;

  if (!props.sellingRate || !props.selectedAgentName) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Link
          href={`/shipments/${props.shipment.id}`}
          className="text-xs font-medium text-[var(--accent)] hover:underline"
        >
          ← กลับหน้า ① Compare Cost
        </Link>
        <div className="card-elevated rounded-2xl p-12 text-center space-y-3">
          <h1 className="text-base font-bold">ยังไม่ได้เลือก Agent ในขั้นตอน ① Compare Cost</h1>
          <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
            กรุณากลับไปหน้า ① Compare Cost ยืนยันอย่างน้อย 2 Agent แล้วกดปุ่ม &ldquo;เลือก Agent นี้&rdquo; ก่อนเริ่มขั้น ② Sale Price Approve Request
          </p>
          <Link
            href={`/shipments/${props.shipment.id}`}
            className="inline-flex px-4 py-2.5 rounded-xl bg-[var(--brand)] text-[var(--brand-fg)] text-xs font-semibold"
          >
            กลับไปเลือก Agent ใน ① Compare Cost
          </Link>
        </div>
      </div>
    );
  }

  const sellingRateId = props.sellingRate.id;
  const currentStatus = props.sellingRate.status;
  const badge = statusBadge(currentStatus);

  function updateMeta(patch: Partial<SellingDocumentMeta>) {
    setDocMeta((prev) => ({ ...prev, ...patch }));
  }

  function updateLine(index: number, patch: Partial<SellingLineRow>) {
    setLines((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function toggleWhtVat(index: number) {
    setLines((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const next = !row.isVatApplicable;
        return {
          ...row,
          isVatApplicable: next,
          revenueWhtPercent: next ? '3.00' : '0.00',
        };
      })
    );
  }

  function addExtraLine() {
    setLines((prev) => [
      ...prev,
      {
        description: '',
        category: 'Other',
        costAmountThb: '0.00',
        costWhtThb: '',
        costVatThb: '',
        costAmountUsd: '',
        costForeignCurrUsd: '',
        sellingAmountThb: '',
        revenueWhtPercent: '3.00',
        revenueAmountUsd: '',
        chargeUnit: 'PER_SHIPMENT',
        quantity: '1',
        isVatApplicable: true,
      },
    ]);
  }

  function removeLine(index: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  function toOptionalNum(val: string): number | null {
    const cleaned = val.trim().replace(/,/g, '');
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  async function saveLines(): Promise<boolean> {
    setError(null);
    setNotice(null);

    const cleanLines = lines
      .filter((l) => l.description.trim().length > 0)
      .map((l) => ({
        id: l.id ?? null,
        chargeCatalogId: l.chargeCatalogId ?? null,
        description: l.description.trim(),
        category: l.category,
        costAmountThb: Number(String(l.costAmountThb).replace(/,/g, '')) || 0,
        costWhtThb: Number(String(l.costWhtThb).replace(/,/g, '')) || 0,
        costVatThb: Number(String(l.costVatThb).replace(/,/g, '')) || 0,
        costAmountUsd: toOptionalNum(l.costAmountUsd),
        costForeignCurrUsd: toOptionalNum(l.costForeignCurrUsd),
        sellingAmountThb: toOptionalNum(l.sellingAmountThb),
        revenueWhtPercent: l.isVatApplicable ? Number(l.revenueWhtPercent) || 3 : 0,
        revenueAmountUsd: toOptionalNum(l.revenueAmountUsd),
        chargeUnit: l.chargeUnit,
        quantity: Number(l.quantity) || 1,
        isVatApplicable: l.isVatApplicable,
      }));

    if (cleanLines.length === 0) {
      setError('ต้องมีอย่างน้อย 1 รายการ');
      return false;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/selling-rates/${sellingRateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discountAmount: Number(discountAmount.replace(/,/g, '')) || 0,
          vatPercent: Number(vatPercent) || 0,
          requestNotes,
          documentMeta: docMeta,
          lines: cleanLines,
        }),
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'บันทึกไม่สำเร็จ');
        return false;
      }
      setNotice('บันทึกแบบฟอร์ม Sale Price Approve Request เรียบร้อยแล้ว');
      router.refresh();
      return true;
    } catch {
      setError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleRequestApproval() {
    const saved = await saveLines();
    if (!saved) return;

    setActionBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/selling-rates/${sellingRateId}/request-approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestNotes }),
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'ส่งขออนุมัติไม่สำเร็จ');
        return;
      }
      setNotice('ส่งคำขออนุมัติ (Pending Approval) เรียบร้อยแล้ว');
      router.refresh();
    } finally {
      setActionBusy(false);
    }
  }

  async function handleApprove() {
    setActionBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/selling-rates/${sellingRateId}/approve`, { method: 'POST' });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'อนุมัติไม่สำเร็จ');
        return;
      }
      setNotice('อนุมัติราคาขายและล็อก Snapshot เรียบร้อยแล้ว — พร้อมออกใบ ③ Quotation');
      router.refresh();
    } finally {
      setActionBusy(false);
    }
  }

  async function handleReturn(e: React.FormEvent) {
    e.preventDefault();
    setActionBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/selling-rates/${sellingRateId}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: returnReason }),
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'ส่งกลับไม่สำเร็จ');
        return;
      }
      setReturnOpen(false);
      setReturnReason('');
      setNotice('ส่งกลับให้ทีม Sale แก้ไขเรียบร้อยแล้ว');
      router.refresh();
    } finally {
      setActionBusy(false);
    }
  }

  const approvedDateStr = props.sellingRate.approvedAt
    ? new Date(props.sellingRate.approvedAt).toLocaleDateString('en-GB')
    : '';

  async function handleOpenPdf() {
    if (
      currentStatus === 'Draft' ||
      currentStatus === 'Returned' ||
      currentStatus === 'Needs_Review'
    ) {
      const saved = await saveLines();
      if (!saved) return;
    }
    window.open(`/api/selling-rates/${sellingRateId}/pdf?t=${Date.now()}`, '_blank', 'noopener');
  }

  return (
    <div className="max-w-[1260px] mx-auto space-y-5">
      {/* Screen-Only Navigation & Pipeline Header */}
      <header className="card-elevated rounded-2xl p-5 space-y-4 print:hidden">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <Link
                href={`/shipments/${props.shipment.id}`}
                className="text-[var(--accent)] font-medium hover:underline"
              >
                ← กลับหน้า ① Compare Cost
              </Link>
              <span>/</span>
              <span className="font-mono font-semibold text-[var(--text-primary)]">
                {props.shipment.shipmentRef}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight">
                ② Sale Price Approve Request — {props.shipment.customerName}
              </h1>
              <span className={`px-2.5 py-0.5 rounded-full border text-xs font-semibold ${badge.cls}`}>
                {badge.label}
              </span>
            </div>
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={handleOpenPdf}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] hover:bg-[var(--brand)] hover:text-[var(--brand-fg)] hover:border-[var(--brand)] text-xs font-semibold disabled:opacity-50 ui-interactive"
          >
            <Printer className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{saving ? 'กำลังสร้าง PDF...' : 'Export PDF (A4)'}</span>
          </button>
        </div>

        {/* 3-Step Pipeline */}
        <nav
          aria-label="Workflow steps"
          className="pt-4 border-t border-[var(--border-subtle)] flex flex-wrap items-center gap-2 text-xs"
        >
          <Link
            href={`/shipments/${props.shipment.id}`}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border border-[var(--status-success-border)] font-semibold hover:opacity-90 ui-interactive"
          >
            <span className="w-5 h-5 rounded-full bg-[var(--status-success-fg)] text-white flex items-center justify-center text-[11px] font-bold">
              ✓
            </span>
            <span>Compare Cost ({props.selectedAgentName})</span>
          </Link>
          <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)]" aria-hidden="true" />
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--brand)] text-[var(--brand-fg)] font-semibold">
            <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[11px] font-bold">
              2
            </span>
            <span>Sale Price Approve Request</span>
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)]" aria-hidden="true" />
          {currentStatus === 'Approved' ? (
            <Link
              href={`/shipments/${props.shipment.id}/quotation`}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border border-[var(--status-success-border)] font-semibold hover:opacity-90 ui-interactive"
            >
              <span className="w-5 h-5 rounded-full bg-[var(--status-success-fg)] text-white flex items-center justify-center text-[11px] font-bold">
                3
              </span>
              <span>Quotation PDF →</span>
            </Link>
          ) : (
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-medium">
              <span className="w-5 h-5 rounded-full bg-[var(--surface-muted)] flex items-center justify-center text-[11px] font-bold">
                3
              </span>
              <span>Quotation PDF (รออนุมัติ)</span>
            </span>
          )}
        </nav>
      </header>

      {/* Screen-Only Alert Banners */}
      <div className="space-y-2.5 print:hidden">
        {currentStatus === 'Returned' && props.sellingRate.rejectionReason && (
          <div className="p-4 rounded-2xl bg-[var(--status-warn-bg)] border border-[var(--status-warn-border)] text-xs text-[var(--status-warn-fg)]">
            <strong>ถูกส่งกลับให้แก้ไข:</strong> {props.sellingRate.rejectionReason}
          </div>
        )}

        {currentStatus === 'Needs_Review' && (
          <div className="p-4 rounded-2xl bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] text-xs text-[var(--status-danger-fg)]">
            <strong>ต้นทุนฝั่ง Agent ถูกแก้ไขหลังจากขออนุมัติ:</strong> กรุณาตรวจตัวเลขใหม่แล้วกดบันทึกและส่งขออนุมัติอีกครั้ง
          </div>
        )}

        {liveCalc.isBelowCost && (
          <div
            role="alert"
            className="p-4 rounded-2xl bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] text-xs text-[var(--status-danger-fg)] flex items-center gap-2.5 font-semibold"
          >
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>
              คำเตือน: ยอดขายก่อน VAT ({fmt(liveCalc.netSellingExclVat)} THB) ต่ำกว่าต้นทุนรวม ({fmt(liveCalc.totalCostThb)} THB) — ขาดทุน {fmt(liveCalc.grossProfit)} THB
            </span>
          </div>
        )}

        {currentStatus === 'Approved' && (
          <div className="p-4 rounded-2xl bg-[var(--status-success-bg)] border border-[var(--status-success-border)] text-xs text-[var(--status-success-fg)] flex flex-wrap items-center justify-between gap-3">
            <div>
              <strong>✓ อนุมัติราคาขายแล้ว</strong> โดย{' '}
              <strong>{props.sellingRate.approverName ?? 'Approver'}</strong>{' '}
              {props.sellingRate.approvedAt &&
                `เมื่อ ${new Date(props.sellingRate.approvedAt).toLocaleString('th-TH')}`}
            </div>
            <Link
              href={`/shipments/${props.shipment.id}/quotation`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-[var(--brand-fg)] font-semibold ui-interactive"
            >
              <span>ไปออกใบ ③ Quotation PDF</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* PERKIN REAL FORM SHEET: SEA FREIGHT IMPORT — SALE PRICE APPROVE SHEET */}
      {/* ===================================================================== */}
      <article className="bg-white border border-slate-300 rounded-2xl print:rounded-none print:border-0 shadow-sm print:shadow-none p-6 sm:p-8 print:p-2 space-y-5 text-slate-900">
        {/* Top Letterhead: Official PerkiN Logo | SEA FREIGHT IMPORT */}
        <div className="flex items-center gap-6 pb-1">
          <Image
            src="/perkin-logo.jpg"
            alt="Perkin Logistics"
            width={116}
            height={44}
            unoptimized
            className="h-10 w-auto object-contain shrink-0"
          />
          <h2 className="text-lg font-extrabold tracking-wide uppercase text-slate-900">
            SEA FREIGHT IMPORT
          </h2>
        </div>

        {/* 3-Column Header Metadata Grid (exact Perkin paper structure) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-1.5 text-xs">
          {/* Column 1 */}
          <div className="space-y-1.5">
            <MetaRow label="JOB NO.">
              <input
                type="text"
                aria-label="Job No."
                value={docMeta.jobNo}
                onChange={(e) => updateMeta({ jobNo: e.target.value })}
                placeholder="กรอกเลขที่ JOB (เว้นว่างได้)"
                className="w-full bg-transparent font-mono font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:bg-[var(--accent-soft)] px-1 rounded placeholder:font-sans placeholder:font-normal placeholder:text-[var(--text-muted)] print:placeholder:text-transparent"
              />
            </MetaRow>
            <MetaRow label="CUSTOMER">
              <input
                type="text"
                aria-label="Customer"
                value={docMeta.customerName}
                onChange={(e) => updateMeta({ customerName: e.target.value })}
                placeholder="กรอกชื่อบริษัทลูกค้า..."
                className="w-full bg-transparent font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:bg-[var(--accent-soft)] px-1 rounded placeholder:font-normal placeholder:text-[var(--text-muted)] print:placeholder:text-transparent"
              />
            </MetaRow>
            <MetaRow label="CONSIGNEE">
              <input
                type="text"
                aria-label="Consignee"
                value={docMeta.consigneeName}
                onChange={(e) => updateMeta({ consigneeName: e.target.value })}
                placeholder="กรอกชื่อ Consignee..."
                className="w-full bg-transparent font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:bg-[var(--accent-soft)] px-1 rounded placeholder:font-normal placeholder:text-[var(--text-muted)] print:placeholder:text-transparent"
              />
            </MetaRow>
            <MetaRow label="AGENT">
              <input
                type="text"
                aria-label="Agent"
                value={docMeta.agentName}
                onChange={(e) => updateMeta({ agentName: e.target.value })}
                placeholder="ชื่อ Agent..."
                className="w-full bg-transparent font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:bg-[var(--accent-soft)] px-1 rounded placeholder:font-normal placeholder:text-[var(--text-muted)] print:placeholder:text-transparent"
              />
            </MetaRow>
          </div>

          {/* Column 2 */}
          <div className="space-y-1.5">
            <MetaRow label="Commodity">
              <input
                type="text"
                aria-label="Commodity"
                value={docMeta.commodity}
                onChange={(e) => updateMeta({ commodity: e.target.value })}
                placeholder="เช่น Shower Filter"
                className="w-full bg-transparent font-medium text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:bg-[var(--accent-soft)] px-1 rounded"
              />
            </MetaRow>
            <MetaRow label="Volume">
              <input
                type="text"
                aria-label="Volume"
                value={docMeta.volume}
                onChange={(e) => updateMeta({ volume: e.target.value })}
                placeholder="เช่น 75 cartons / 1×40DV"
                className="w-full bg-transparent font-medium text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:bg-[var(--accent-soft)] px-1 rounded"
              />
            </MetaRow>
            <MetaRow label="Weight" suffix="KGS">
              <input
                type="text"
                aria-label="Weight KGS"
                value={docMeta.weightKgs}
                onChange={(e) => updateMeta({ weightKgs: e.target.value })}
                placeholder="0"
                className="w-full bg-transparent font-medium tabular-nums text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:bg-[var(--accent-soft)] px-1 rounded"
              />
            </MetaRow>
            <MetaRow label="Measure" suffix="CBM">
              <input
                type="text"
                aria-label="Measure CBM"
                value={docMeta.measureCbm}
                onChange={(e) => updateMeta({ measureCbm: e.target.value })}
                placeholder="0.000"
                className="w-full bg-transparent font-medium tabular-nums text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:bg-[var(--accent-soft)] px-1 rounded"
              />
            </MetaRow>
          </div>

          {/* Column 3 */}
          <div className="space-y-1.5">
            <MetaRow label="Mode">
              <input
                type="text"
                aria-label="Mode"
                value={docMeta.mode}
                onChange={(e) => updateMeta({ mode: e.target.value })}
                placeholder="Sea (FCL) / Sea (LCL)"
                className="w-full bg-transparent font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:bg-[var(--accent-soft)] px-1 rounded"
              />
            </MetaRow>
            <MetaRow label="Term">
              <input
                type="text"
                aria-label="Term"
                value={docMeta.term}
                onChange={(e) => updateMeta({ term: e.target.value })}
                placeholder="FOB / CIF / EXW"
                className="w-full bg-transparent font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:bg-[var(--accent-soft)] px-1 rounded"
              />
            </MetaRow>
            <MetaRow label="POL">
              <input
                type="text"
                aria-label="POL"
                value={docMeta.pol}
                onChange={(e) => updateMeta({ pol: e.target.value })}
                placeholder="เช่น NINGBO, China"
                className="w-full bg-transparent font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:bg-[var(--accent-soft)] px-1 rounded placeholder:font-normal placeholder:text-[var(--text-muted)] print:placeholder:text-transparent"
              />
            </MetaRow>
            <MetaRow label="POD">
              <input
                type="text"
                aria-label="POD"
                value={docMeta.pod}
                onChange={(e) => updateMeta({ pod: e.target.value })}
                placeholder="เช่น Bangkok"
                className="w-full bg-transparent font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:bg-[var(--accent-soft)] px-1 rounded placeholder:font-normal placeholder:text-[var(--text-muted)] print:placeholder:text-transparent"
              />
            </MetaRow>
            <MetaRow label="Free Days">
              <input
                type="text"
                aria-label="Free Days"
                value={docMeta.freeDays}
                onChange={(e) => updateMeta({ freeDays: e.target.value })}
                placeholder="เช่น 3 Days"
                className="w-full bg-transparent font-medium text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:bg-[var(--accent-soft)] px-1 rounded"
              />
            </MetaRow>
          </div>
        </div>

        {/* Main Bordered Table: DETAIL | COST (5 cols) | REVENUE (4 cols) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between print:hidden">
            <p className="text-[11px] text-[var(--text-muted)]">
              คลิกป้าย <strong>WHT&amp;VAT</strong> ในแต่ละบรรทัดเพื่อเปิด/ปิดภาษีฝั่ง Revenue (WHT 3% / VAT {vatPercent}%) · พิมพ์ราคาขายในคอลัมน์ REVENUE AMOUNT ได้ทันที
            </p>
            <button
              type="button"
              onClick={addExtraLine}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border-default)] bg-[var(--surface-subtle)] hover:bg-[var(--surface-muted)] text-xs font-semibold ui-interactive"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>เพิ่มรายการ</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse border-2 border-slate-900 text-[11px]">
              <thead>
                <tr className="bg-slate-200/80 text-slate-900 font-bold">
                  <th
                    rowSpan={2}
                    className="border border-slate-900 px-2.5 py-2 text-center min-w-[240px]"
                  >
                    DETAIL
                  </th>
                  <th
                    colSpan={5}
                    className="border border-slate-900 px-2 py-1 text-center tracking-wide border-l-2"
                  >
                    COST
                  </th>
                  <th
                    colSpan={4}
                    className="border border-slate-900 px-2 py-1 text-center tracking-wide border-l-2"
                  >
                    REVENUE
                  </th>
                  <th
                    rowSpan={2}
                    className="border border-slate-900 w-8 print:hidden"
                    aria-label="Actions"
                  />
                </tr>
                <tr className="bg-slate-100 text-slate-900 font-semibold text-[10px]">
                  <th className="border border-slate-900 border-l-2 px-1.5 py-1 text-center w-[64px]">
                    WHT
                  </th>
                  <th className="border border-slate-900 px-1.5 py-1 text-center w-[64px]">VAT</th>
                  <th className="border border-slate-900 px-1.5 py-1 text-center w-[92px]">
                    AMOUNT
                    <div className="font-normal text-[9px]">(THB)</div>
                  </th>
                  <th className="border border-slate-900 px-1.5 py-1 text-center w-[76px]">
                    AMOUNT
                    <div className="font-normal text-[9px]">(USD)</div>
                  </th>
                  <th className="border border-slate-900 px-1.5 py-1 text-center w-[78px]">
                    FOREIGN CURR
                    <div className="font-normal text-[9px]">(USD)</div>
                  </th>
                  <th className="border border-slate-900 border-l-2 px-1.5 py-1 text-center w-[64px]">
                    WHT
                  </th>
                  <th className="border border-slate-900 px-1.5 py-1 text-center w-[64px]">VAT</th>
                  <th className="border border-slate-900 px-1.5 py-1 text-center w-[96px]">
                    AMOUNT
                    <div className="font-normal text-[9px]">(THB)</div>
                  </th>
                  <th className="border border-slate-900 px-1.5 py-1 text-center w-[76px]">
                    AMOUNT
                    <div className="font-normal text-[9px]">(USD)</div>
                  </th>
                </tr>
              </thead>

              <tbody>
                {lines.map((line, idx) => {
                  const sellDec = parseDec(line.sellingAmountThb);
                  const vatRate = parseDec(vatPercent);
                  const revWhtVal =
                    line.isVatApplicable && sellDec.gt(0)
                      ? sellDec
                          .times(parseDec(line.revenueWhtPercent || '3'))
                          .dividedBy(100)
                          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
                      : new Decimal(0);
                  const revVatVal =
                    line.isVatApplicable && sellDec.gt(0)
                      ? sellDec.times(vatRate).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
                      : new Decimal(0);

                  return (
                    <tr key={idx} className="hover:bg-blue-50/30">
                      {/* DETAIL + inline WHT&VAT tag */}
                      <td className="border-x border-slate-900 border-b border-b-slate-200 px-2 py-1">
                        <div className="flex items-center justify-between gap-2">
                          <input
                            type="text"
                            aria-label={`Detail ${idx + 1}`}
                            value={line.description}
                            onChange={(e) => updateLine(idx, { description: e.target.value })}
                            placeholder="ชื่อรายการ..."
                            className="w-full bg-transparent text-[11px] font-medium text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:bg-[var(--accent-soft)] px-1 rounded"
                          />
                          <button
                            type="button"
                            onClick={() => toggleWhtVat(idx)}
                            title="คลิกเพื่อเปิด/ปิด WHT 3% & VAT 7%"
                            className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded ui-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                              line.isVatApplicable
                                ? 'text-[var(--text-primary)] bg-[var(--surface-muted)] border border-[var(--border-strong)] print:border-0 print:bg-transparent'
                                : 'text-[var(--text-muted)] border border-dashed border-[var(--border-default)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] print:hidden'
                            }`}
                          >
                            WHT&amp;VAT
                          </button>
                        </div>
                      </td>

                      {/* COST: WHT */}
                      <td className="border-x border-slate-900 border-l-2 border-b border-b-slate-200 px-1 py-0.5">
                        <input
                          type="text"
                          aria-label={`Cost WHT ${idx + 1}`}
                          value={line.costWhtThb}
                          onChange={(e) => updateLine(idx, { costWhtThb: e.target.value })}
                          className="w-full bg-transparent text-right tabular-nums text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:bg-[var(--accent-soft)] px-1 rounded"
                        />
                      </td>

                      {/* COST: VAT */}
                      <td className="border-x border-slate-900 border-b border-b-slate-200 px-1 py-0.5">
                        <input
                          type="text"
                          aria-label={`Cost VAT ${idx + 1}`}
                          value={line.costVatThb}
                          onChange={(e) => updateLine(idx, { costVatThb: e.target.value })}
                          className="w-full bg-transparent text-right tabular-nums text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:bg-[var(--accent-soft)] px-1 rounded"
                        />
                      </td>

                      {/* COST: AMOUNT (THB) */}
                      <td className="border-x border-slate-900 border-b border-b-slate-200 px-1 py-0.5 bg-slate-50/70">
                        <input
                          type="text"
                          aria-label={`Cost THB ${idx + 1}`}
                          value={line.costAmountThb}
                          onChange={(e) => updateLine(idx, { costAmountThb: e.target.value })}
                          className="w-full bg-transparent text-right tabular-nums text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:bg-[var(--accent-soft)] px-1 rounded"
                        />
                      </td>

                      {/* COST: AMOUNT (USD) */}
                      <td className="border-x border-slate-900 border-b border-b-slate-200 px-1 py-0.5">
                        <input
                          type="text"
                          aria-label={`Cost USD ${idx + 1}`}
                          value={line.costAmountUsd}
                          onChange={(e) => updateLine(idx, { costAmountUsd: e.target.value })}
                          className="w-full bg-transparent text-right tabular-nums text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:bg-[var(--accent-soft)] px-1 rounded"
                        />
                      </td>

                      {/* COST: FOREIGN CURR (USD) */}
                      <td className="border-x border-slate-900 border-b border-b-slate-200 px-1 py-0.5">
                        <input
                          type="text"
                          aria-label={`Cost Foreign Curr USD ${idx + 1}`}
                          value={line.costForeignCurrUsd}
                          onChange={(e) => updateLine(idx, { costForeignCurrUsd: e.target.value })}
                          className="w-full bg-transparent text-right tabular-nums text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:bg-[var(--accent-soft)] px-1 rounded"
                        />
                      </td>

                      {/* REVENUE: WHT (3% auto when WHT&VAT enabled) */}
                      <td className="border-x border-slate-900 border-l-2 border-b border-b-slate-200 px-1.5 py-1 text-right tabular-nums text-slate-700">
                        {fmtOptional(revWhtVal)}
                      </td>

                      {/* REVENUE: VAT (7% auto when WHT&VAT enabled) */}
                      <td className="border-x border-slate-900 border-b border-b-slate-200 px-1.5 py-1 text-right tabular-nums text-slate-700">
                        {fmtOptional(revVatVal)}
                      </td>

                      {/* REVENUE: AMOUNT (THB) — Sales enters manually */}
                      <td className="border-x border-slate-900 border-b border-b-slate-200 px-1 py-0.5 bg-[var(--accent-soft)]/50 print:bg-transparent">
                        <input
                          type="text"
                          aria-label={`Revenue THB ${idx + 1}`}
                          value={line.sellingAmountThb}
                          onChange={(e) => updateLine(idx, { sellingAmountThb: e.target.value })}
                          placeholder="0.00"
                          className="w-full bg-transparent text-right tabular-nums text-[11px] font-bold text-slate-900 focus-visible:outline-none focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-[var(--accent)] px-1 rounded"
                        />
                      </td>

                      {/* REVENUE: AMOUNT (USD) */}
                      <td className="border-x border-slate-900 border-b border-b-slate-200 px-1 py-0.5">
                        <input
                          type="text"
                          aria-label={`Revenue USD ${idx + 1}`}
                          value={line.revenueAmountUsd}
                          onChange={(e) => updateLine(idx, { revenueAmountUsd: e.target.value })}
                          className="w-full bg-transparent text-right tabular-nums text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:bg-[var(--accent-soft)] px-1 rounded"
                        />
                      </td>

                      {/* Screen-only Delete Row */}
                      <td className="border-x border-slate-900 border-b border-b-slate-200 text-center print:hidden">
                        <button
                          type="button"
                          aria-label={`Remove line ${idx + 1}`}
                          onClick={() => removeLine(idx)}
                          disabled={lines.length <= 1}
                          className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--status-danger-fg)] disabled:opacity-30 ui-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                        >
                          <Trash2 className="w-3 h-3" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* TOTAL Row */}
              <tfoot>
                <tr className="bg-slate-200/80 font-bold text-slate-900 border-t-2 border-slate-900 tabular-nums">
                  <td className="border border-slate-900 px-2.5 py-1.5 text-center tracking-wide">
                    TOTAL
                  </td>
                  <td className="border border-slate-900 border-l-2 px-1.5 py-1.5 text-right">
                    {columnTotals.costWht.gt(0) ? fmt(columnTotals.costWht) : '-'}
                  </td>
                  <td className="border border-slate-900 px-1.5 py-1.5 text-right">
                    {columnTotals.costVat.gt(0) ? fmt(columnTotals.costVat) : '-'}
                  </td>
                  <td className="border border-slate-900 px-1.5 py-1.5 text-right">
                    {fmt(columnTotals.costThb)}
                  </td>
                  <td className="border border-slate-900 px-1.5 py-1.5 text-right">
                    {columnTotals.costUsd.gt(0) ? fmt(columnTotals.costUsd) : '-'}
                  </td>
                  <td className="border border-slate-900 px-1.5 py-1.5 text-right">
                    {columnTotals.costForeign.gt(0) ? fmt(columnTotals.costForeign) : '-'}
                  </td>
                  <td className="border border-slate-900 border-l-2 px-1.5 py-1.5 text-right">
                    {columnTotals.revWht.gt(0) ? fmt(columnTotals.revWht) : '-'}
                  </td>
                  <td className="border border-slate-900 px-1.5 py-1.5 text-right">
                    {columnTotals.revVat.gt(0) ? fmt(columnTotals.revVat) : '-'}
                  </td>
                  <td className="border border-slate-900 px-1.5 py-1.5 text-right">
                    {fmt(columnTotals.revThb)}
                  </td>
                  <td className="border border-slate-900 px-1.5 py-1.5 text-right">
                    {columnTotals.revUsd.gt(0) ? fmt(columnTotals.revUsd) : '-'}
                  </td>
                  <td className="border border-slate-900 print:hidden" />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Bottom 2-Column Section: CONDITION (Left) | TOTAL REVENUE / COST / GROSS PROFIT (Right) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 text-xs items-start">
          {/* CONDITION Box */}
          <div className="space-y-1.5">
            <div className="font-bold underline uppercase tracking-wide text-slate-900">
              CONDITION
            </div>
            <div className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
              <span>MINIMUM GROSS PROFIT (THB) : NOT LESS THAN 5000 THB/JOB</span>
              {liveCalc.hasAnySellingPrice && (
                <span
                  className={`print:hidden px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    meetsMinGpThb
                      ? 'bg-[var(--status-success-bg)] text-[var(--status-success-fg)]'
                      : 'bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]'
                  }`}
                >
                  {meetsMinGpThb ? '✓ ผ่านเกณฑ์' : '⚠ ต่ำกว่า 5,000'}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
              <span>MINIMUM GROSS PROFIT (%) : NOT LESS THAN 25%</span>
              {liveCalc.hasAnySellingPrice && (
                <span
                  className={`print:hidden px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    meetsMinGpPct
                      ? 'bg-[var(--status-success-bg)] text-[var(--status-success-fg)]'
                      : 'bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]'
                  }`}
                >
                  {meetsMinGpPct ? '✓ ผ่านเกณฑ์' : '⚠ ต่ำกว่า 25%'}
                </span>
              )}
            </div>
          </div>

          {/* Right Summary Block matching Perkin paper */}
          <div className="md:ml-auto w-full max-w-sm space-y-1.5 tabular-nums text-xs">
            <div className="grid grid-cols-[140px_1fr_110px] items-center">
              <span className="font-semibold">TOTAL REVENUE :</span>
              <span />
              <span className="text-right font-bold">{fmt(liveCalc.netSellingExclVat)}</span>
            </div>
            <div className="grid grid-cols-[140px_1fr_110px] items-center">
              <span className="font-semibold">TOTAL COST :</span>
              <span />
              <span className="text-right font-semibold">{fmt(liveCalc.totalCostThb)}</span>
            </div>
            <div className="grid grid-cols-[140px_1fr_110px] items-center">
              <label htmlFor="diff-advance-input" className="font-semibold">
                DIFF ADVANCE :
              </label>
              <span />
              <input
                id="diff-advance-input"
                type="text"
                value={docMeta.diffAdvance}
                onChange={(e) => updateMeta({ diffAdvance: e.target.value })}
                placeholder="-"
                className="w-full text-right bg-transparent border-b border-[var(--border-default)] print:border-0 px-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:bg-[var(--accent-soft)]"
              />
            </div>
            <div className="grid grid-cols-[140px_1fr_110px] items-center pt-1 font-extrabold text-sm">
              <span>GROSS PROFIT :</span>
              <span
                className={`text-right pr-3 ${
                  gpPctNum < 0 ? 'text-[var(--status-danger-fg)]' : 'text-slate-900'
                }`}
              >
                {gpPctNum.toFixed(2)}%
              </span>
              <span
                className={`text-right border-t border-b-4 border-double border-slate-900 py-0.5 ${
                  gpThbNum < 0 ? 'text-[var(--status-danger-fg)]' : 'text-slate-900'
                }`}
              >
                {fmt(liveCalc.grossProfit)}
              </span>
            </div>
          </div>
        </div>

        {/* 4-Box Signature Footer (exact Perkin paper layout) */}
        <div className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 border-2 border-slate-900 text-[10px]">
            {[
              { title: 'SALES / PREPARED BY', name: '', date: '' },
              { title: 'SALES CO / CHECKED BY', name: '', date: '' },
              { title: 'ACCOUNTING / AUDIT BY', name: '', date: '' },
              {
                title: 'MANAGER / APPROVED BY',
                name: currentStatus === 'Approved' ? (props.sellingRate.approverName ?? '') : '',
                date: currentStatus === 'Approved' ? approvedDateStr : '',
              },
            ].map((box, i) => (
              <div
                key={box.title}
                className={`flex flex-col ${i > 0 ? 'md:border-l border-slate-900' : ''} ${
                  i >= 2 ? 'border-t md:border-t-0 border-slate-900' : ''
                }`}
              >
                <div className="bg-slate-200/80 border-b border-slate-900 px-2 py-1 text-center font-bold tracking-wide">
                  {box.title}
                </div>
                <div className="h-14 flex items-center justify-center px-2 text-xs font-semibold text-slate-700">
                  {box.name}
                </div>
                <div className="border-t border-slate-900 px-2 py-1 flex items-center gap-2 font-semibold">
                  <span>DATE :</span>
                  <span className="tabular-nums font-normal">{box.date}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </article>

      {/* Screen-Only Extra Controls: Discount, VAT %, Request Notes */}
      <section className="card-elevated rounded-2xl p-5 grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs print:hidden">
        <div className="space-y-1.5">
          <label htmlFor="req-notes" className="block font-semibold text-[var(--text-primary)]">
            หมายเหตุประกอบคำขออนุมัติ (Internal Request Notes)
          </label>
          <textarea
            id="req-notes"
            rows={3}
            value={requestNotes}
            onChange={(e) => setRequestNotes(e.target.value)}
            placeholder="เช่น ลูกค้าประจำ ขอราคาพิเศษเพื่อปิดงานรอบนี้..."
            className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          />
        </div>

        <div className="p-4 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-subtle)] space-y-2.5">
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="discount-input" className="font-medium text-[var(--text-secondary)]">
              ส่วนลดเพิ่มเติม (Discount THB)
            </label>
            <input
              id="discount-input"
              type="text"
              value={discountAmount}
              onChange={(e) => setDiscountAmount(e.target.value)}
              placeholder="0.00"
              className="w-36 px-2.5 py-1.5 rounded-lg border border-[var(--border-default)] bg-white text-right tabular-nums"
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="vat-pct-input" className="font-medium text-[var(--text-secondary)]">
              อัตรา VAT % (รายการที่มีป้าย WHT&amp;VAT)
            </label>
            <input
              id="vat-pct-input"
              type="number"
              step="0.5"
              value={vatPercent}
              onChange={(e) => setVatPercent(e.target.value)}
              className="w-36 px-2.5 py-1.5 rounded-lg border border-[var(--border-default)] bg-white text-right tabular-nums"
            />
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
            <span className="text-[var(--text-secondary)]">ยอดรวมเสนอขายรวม VAT (Grand Total)</span>
            <span className="font-bold text-sm tabular-nums">{fmt(liveCalc.grandTotalSelling)} THB</span>
          </div>
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] text-xs font-medium text-[var(--status-danger-fg)] print:hidden"
        >
          {error}
        </div>
      )}
      {notice && (
        <div className="p-3.5 rounded-xl bg-[var(--status-success-bg)] border border-[var(--status-success-border)] text-xs font-medium text-[var(--status-success-fg)] print:hidden">
          {notice}
        </div>
      )}

      {/* Action Bar */}
      <footer className="card-elevated rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="text-xs text-[var(--text-muted)]">
          {!props.requireAuthMode &&
            'Internal Mode: กดบันทึก → ส่งขออนุมัติ → อนุมัติ แล้วไปออกใบ ③ Quotation PDF ได้ทันที'}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={saving || actionBusy}
            onClick={saveLines}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] hover:bg-[var(--surface-muted)] text-xs font-semibold disabled:opacity-50 ui-interactive"
          >
            <Save className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{saving ? 'กำลังบันทึก...' : 'บันทึกร่าง'}</span>
          </button>

          {(currentStatus === 'Draft' ||
            currentStatus === 'Returned' ||
            currentStatus === 'Needs_Review') && (
            <button
              type="button"
              disabled={saving || actionBusy || !liveCalc.hasAnySellingPrice}
              onClick={handleRequestApproval}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-[var(--brand-fg)] text-xs font-semibold disabled:opacity-40 ui-interactive"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
              <span>ส่งขออนุมัติ (Submit Approve Request)</span>
            </button>
          )}

          {currentStatus === 'Pending_Approval' && (
            <>
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => setReturnOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] hover:opacity-90 text-[var(--status-warn-fg)] text-xs font-semibold ui-interactive"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>ส่งกลับแก้ไข</span>
              </button>
              <button
                type="button"
                disabled={actionBusy}
                onClick={handleApprove}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[var(--status-success-fg)] hover:opacity-90 text-white text-xs font-semibold ui-interactive"
              >
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>อนุมัติราคาขาย (Approve)</span>
              </button>
            </>
          )}
        </div>
      </footer>

      {/* Return Reason Modal */}
      {returnOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="return-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setReturnOpen(false);
          }}
          className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px] flex items-center justify-center p-4 print:hidden"
        >
          <div
            className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-[20px] p-6 w-full max-w-md space-y-5"
            style={{ boxShadow: 'var(--shadow-modal)' }}
          >
            <div className="flex items-start justify-between">
              <h2 id="return-modal-title" className="text-base font-bold">
                ส่งกลับแก้ไข (Return Request)
              </h2>
              <button
                type="button"
                aria-label="ปิดหน้าต่าง"
                onClick={() => setReturnOpen(false)}
                className="p-1 rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleReturn} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label htmlFor="return-reason" className="block font-semibold">
                  เหตุผลที่ส่งกลับ *
                </label>
                <textarea
                  id="return-reason"
                  rows={3}
                  required
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="เช่น ขอปรับราคาขายค่าระวางเพิ่มอีก 2,000 บาท"
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)]"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReturnOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[var(--border-default)] font-semibold"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={actionBusy}
                  className="px-4 py-2 rounded-xl bg-[var(--status-warn-fg)] text-white font-semibold hover:opacity-90 ui-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  ยืนยันส่งกลับ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function MetaRow({
  label,
  suffix,
  children,
}: {
  label: string;
  suffix?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[78px_1fr] items-end gap-2">
      <span className="text-[11px] font-medium text-slate-700 leading-tight">{label}</span>
      <div className="flex items-end gap-1.5 border-b border-slate-900 pb-0.5 min-h-[20px]">
        <div className="flex-1 min-w-0">{children}</div>
        {suffix && <span className="text-[10px] font-semibold text-slate-700 shrink-0">{suffix}</span>}
      </div>
    </div>
  );
}
