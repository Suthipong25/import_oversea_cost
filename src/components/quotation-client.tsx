'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Decimal from 'decimal.js';
import {
  ArrowRight,
  Download,
  Send,
  GitBranch,
  Save,
  Plus,
  Trash2,
  ShieldCheck,
  Layers,
  X,
} from 'lucide-react';
import { computeQuotationTotals } from '@/domain/quotations/payload';
import type { QuotationDocumentMeta } from '@/modules/quotations/schema';

export interface QuotationEditableItem {
  descriptionEn: string;
  descriptionTh: string;
  quantity: string;
  chargeUnitText: string;
  unitPrice: string;
  isTaxable: boolean;
}

export interface QuotationWorkspaceProps {
  shipment: {
    id: string;
    shipmentRef: string;
    customerName: string;
    polPortCode: string;
    podPortCode: string;
  };
  sellingRateApproved: boolean;
  sellingRateStatus: string | null;
  quotation: {
    id: string;
    quotationNumber: string;
    currentVersion: number;
    status: string;
    customerName: string;
    customerContact: string | null;
    customerEmail: string | null;
    customerPhone: string | null;
    customerAddress: string | null;
    polPortCode: string;
    podPortCode: string;
    containerSummary: string;
    commodityDescription: string | null;
    transitTimeText: string | null;
    freeTimeText: string | null;
    serviceType: string;
    paymentTerms: string;
    validUntil: string;
    termsAndConditions: string | null;
    remarks: string | null;
    sentAt: string | Date | null;
    sentChannel: string | null;
    sentRecipient: string | null;
  } | null;
  initialDocMeta: QuotationDocumentMeta;
  versions: Array<{
    id: string;
    versionNumber: number;
    status: string;
    grandTotal: string;
    changeSummary: string | null;
    createdAt: string | Date;
  }>;
  activeVersion: {
    versionNumber: number;
    discountAmount: string;
    vatPercent: string;
  } | null;
  initialItems: QuotationEditableItem[];
}

function fmt(val: string | number): string {
  try {
    return new Decimal(val).toNumber().toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return '0.00';
  }
}

export function QuotationClient(props: QuotationWorkspaceProps) {
  const router = useRouter();
  const q = props.quotation;

  const [pdfLang, setPdfLang] = useState<'th' | 'en'>('en');
  const [previewVersion, setPreviewVersion] = useState<number>(q?.currentVersion ?? 1);
  const [pdfNonce, setPdfNonce] = useState(0);

  // Editable draft form state
  const [customerName, setCustomerName] = useState(q?.customerName ?? '');
  const [customerContact, setCustomerContact] = useState(q?.customerContact ?? '');
  const [customerEmail, setCustomerEmail] = useState(q?.customerEmail ?? '');
  const [customerPhone, setCustomerPhone] = useState(q?.customerPhone ?? '');
  const [customerAddress, setCustomerAddress] = useState(q?.customerAddress ?? '');
  const [commodityDescription, setCommodityDescription] = useState(q?.commodityDescription ?? '');
  const [transitTimeText, setTransitTimeText] = useState(q?.transitTimeText ?? '');
  const [freeTimeText, setFreeTimeText] = useState(q?.freeTimeText ?? '');
  const [volumeText, setVolumeText] = useState(props.initialDocMeta.volumeText);
  const [modeText, setModeText] = useState(props.initialDocMeta.modeText);
  const [termText, setTermText] = useState(props.initialDocMeta.termText);
  const [cutOffEtdText, setCutOffEtdText] = useState(props.initialDocMeta.cutOffEtdText);
  const [approvedDateText, setApprovedDateText] = useState(props.initialDocMeta.approvedDateText);
  const [serviceType] = useState(q?.serviceType ?? 'CY/CY');
  const [paymentTerms, setPaymentTerms] = useState(q?.paymentTerms ?? 'Credit 30 Days');
  const [validUntil, setValidUntil] = useState(q?.validUntil ?? '');
  const [termsAndConditions, setTermsAndConditions] = useState(q?.termsAndConditions ?? '');
  const [remarks, setRemarks] = useState(q?.remarks ?? '');
  const [discountAmount, setDiscountAmount] = useState(
    Number(props.activeVersion?.discountAmount ?? '0') > 0
      ? Number(props.activeVersion?.discountAmount ?? '0').toString()
      : '0'
  );
  const [vatPercent, setVatPercent] = useState(props.activeVersion?.vatPercent ?? '7.00');
  const [items, setItems] = useState<QuotationEditableItem[]>(props.initialItems);

  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Modals
  const [sendOpen, setSendOpen] = useState(false);
  const [sentChannel, setSentChannel] = useState<'EMAIL' | 'LINE' | 'HAND_DELIVERY' | 'OTHER'>('EMAIL');
  const [sentRecipient, setSentRecipient] = useState(q?.customerEmail ?? q?.customerContact ?? '');
  const [sentNotes, setSentNotes] = useState('');

  const [revOpen, setRevOpen] = useState(false);
  const [revSummary, setRevSummary] = useState('');

  useEffect(() => {
    if (!sendOpen && !revOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (sendOpen) setSendOpen(false);
        if (revOpen) setRevOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sendOpen, revOpen]);

  const liveTotals = useMemo(
    () =>
      computeQuotationTotals({
        items: items.map((it) => ({
          quantity: Number(it.quantity) || 1,
          unitPrice: Number(String(it.unitPrice).replace(/,/g, '')) || 0,
          isTaxable: it.isTaxable,
        })),
        discountAmount: Number(discountAmount.replace(/,/g, '')) || 0,
        vatPercent: Number(vatPercent) || 0,
      }),
    [items, discountAmount, vatPercent]
  );

  if (!props.sellingRateApproved || !q) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Link
          href={`/shipments/${props.shipment.id}/selling-rate`}
          className="text-xs font-medium text-[var(--accent)] hover:underline"
        >
          ← กลับหน้า ② Sale Price Approve Request
        </Link>
        <div className="card-elevated rounded-2xl p-12 text-center space-y-3">
          <h1 className="text-base font-bold">ต้องอนุมัติราคาขาย (ขั้น ②) ก่อนออกใบ ③ Quotation</h1>
          <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
            สถานะปัจจุบัน: <strong>{props.sellingRateStatus ?? 'ยังไม่ได้กรอกราคาขาย'}</strong> — กรุณากดส่งขออนุมัติและอนุมัติราคาขายในหน้า ② ก่อนครับ
          </p>
          <Link
            href={`/shipments/${props.shipment.id}/selling-rate`}
            className="inline-flex px-4 py-2.5 rounded-xl bg-[var(--brand)] text-[var(--brand-fg)] text-xs font-semibold"
          >
            ไปหน้า ② Sale Price Approve Request
          </Link>
        </div>
      </div>
    );
  }

  const isDraft = q.status === 'Draft';
  const pdfUrl = `/api/quotations/${q.id}/pdf?lang=${pdfLang}&version=${previewVersion}&v=${pdfNonce}`;

  function updateItem(idx: number, patch: Partial<QuotationEditableItem>) {
    setItems((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      {
        descriptionEn: '',
        descriptionTh: '',
        quantity: '1',
        chargeUnitText: 'Per Shipment',
        unitPrice: '0',
        isTaxable: true,
      },
    ]);
  }

  function removeItem(idx: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  }

  function consolidateToPerkinGroups() {
    let freightLocal = new Decimal(0);
    let clearance = new Decimal(0);
    let handling = new Decimal(0);
    let truck = new Decimal(0);

    for (const it of items) {
      const name = it.descriptionEn.toUpperCase();
      const qty = new Decimal(Number(it.quantity) || 1);
      const price = new Decimal(Number(String(it.unitPrice).replace(/,/g, '')) || 0);
      const amt = qty.times(price);

      if (name.includes('CLEARANCE') || name.includes('CUSTOMS') || name.includes('EDI')) {
        clearance = clearance.plus(amt);
      } else if (name.includes('TRANSPORT') || name.includes('TRUCK') || name.includes('DELIVERY')) {
        truck = truck.plus(amt);
      } else if (name.includes('HANDLING') || name.includes('SERVICE CHARGE')) {
        handling = handling.plus(amt);
      } else {
        freightLocal = freightLocal.plus(amt);
      }
    }

    const grouped: QuotationEditableItem[] = [];
    if (freightLocal.gt(0)) {
      grouped.push({
        descriptionEn: 'Freight Charge & Local Charge',
        descriptionTh: 'ค่าระวางเรือและค่าใช้จ่ายหน้าท่า',
        quantity: '1',
        chargeUnitText: '1',
        unitPrice: freightLocal.toFixed(2),
        isTaxable: true,
      });
    }
    if (clearance.gt(0)) {
      grouped.push({
        descriptionEn: 'Import Clearance',
        descriptionTh: 'ค่าพิธีการศุลกากรนำเข้า',
        quantity: '1',
        chargeUnitText: '1',
        unitPrice: clearance.toFixed(2),
        isTaxable: true,
      });
    }
    if (handling.gt(0)) {
      grouped.push({
        descriptionEn: 'Handling Charge',
        descriptionTh: 'ค่าบริการดำเนินการ',
        quantity: '1',
        chargeUnitText: '1',
        unitPrice: handling.toFixed(2),
        isTaxable: true,
      });
    }
    if (truck.gt(0)) {
      grouped.push({
        descriptionEn: 'Truck cost',
        descriptionTh: 'ค่าขนส่งในประเทศ',
        quantity: '1',
        chargeUnitText: '1',
        unitPrice: truck.toFixed(2),
        isTaxable: true,
      });
    }

    if (grouped.length > 0) {
      setItems(grouped);
      setNotice('รวมหมวดเป็นรายการตามฟอร์ม Perkin แล้ว — กด "บันทึก & อัปเดต PDF" เพื่อดูหน้าใบเสนอราคาใหม่');
    }
  }

  async function handleSaveDraft(e: React.FormEvent) {
    e.preventDefault();
    if (!q || !isDraft) return;
    setError(null);
    setNotice(null);
    setSaving(true);

    try {
      const res = await fetch(`/api/quotations/${q.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName,
          customerContact,
          customerEmail,
          customerPhone,
          customerAddress,
          commodityDescription,
          transitTimeText,
          freeTimeText,
          serviceType,
          paymentTerms,
          validUntil,
          termsAndConditions,
          remarks,
          documentMeta: {
            volumeText,
            modeText,
            termText,
            cutOffEtdText,
            approvedDateText,
          },
          discountAmount: Number(discountAmount.replace(/,/g, '')) || 0,
          vatPercent: Number(vatPercent) || 0,
          items: items
            .filter((it) => it.descriptionEn.trim().length > 0)
            .map((it) => ({
              descriptionEn: it.descriptionEn.trim(),
              descriptionTh: it.descriptionTh.trim() || null,
              quantity: Number(it.quantity) || 1,
              chargeUnitText: it.chargeUnitText.trim() || 'Per Shipment',
              unitPrice: Number(String(it.unitPrice).replace(/,/g, '')) || 0,
              isTaxable: it.isTaxable,
            })),
        }),
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'บันทึกใบเสนอราคาไม่สำเร็จ');
        return;
      }

      setNotice('บันทึก Draft และอัปเดต PDF พรีวิวเรียบร้อยแล้ว');
      setPdfNonce((n) => n + 1);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkSent(e: React.FormEvent) {
    e.preventDefault();
    if (!q) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/quotations/${q.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sentChannel, sentRecipient, notes: sentNotes }),
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'บันทึกการส่งไม่สำเร็จ');
        return;
      }
      setSendOpen(false);
      setNotice(`บันทึกการส่ง ${q.quotationNumber} (v${q.currentVersion}) เรียบร้อยแล้ว — เวอร์ชันนี้ถูกล็อกห้ามแก้ทับ`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateRevision(e: React.FormEvent) {
    e.preventDefault();
    if (!q) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/quotations/${q.id}/revisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changeSummary: revSummary }),
      });
      const json = (await res.json()) as {
        success: boolean;
        data?: { versionNumber: number };
        error?: { message?: string };
      };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'สร้าง Revision ไม่สำเร็จ');
        return;
      }
      setRevOpen(false);
      setRevSummary('');
      if (json.data?.versionNumber) setPreviewVersion(json.data.versionNumber);
      setPdfNonce((n) => n + 1);
      setNotice(`สร้าง Revision v${json.data?.versionNumber ?? ''} เรียบร้อยแล้ว (v เก่าถูกเก็บเป็นประวัติ Superseded)`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-[1680px] mx-auto space-y-6">
      {/* Header Card */}
      <header className="card-elevated rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <Link
                href={`/shipments/${props.shipment.id}/selling-rate`}
                className="text-[var(--accent)] font-medium hover:underline"
              >
                ← กลับหน้า ② Sale Price Approve Request
              </Link>
              <span>/</span>
              <span className="font-mono font-semibold text-[var(--text-primary)]">
                {q.quotationNumber} (v{q.currentVersion})
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight">
                ③ Customer Quotation — {q.customerName}
              </h1>
              <span
                className={`px-2.5 py-0.5 rounded-full border text-xs font-semibold ${
                  q.status === 'Sent'
                    ? 'bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-border)]'
                    : 'bg-[var(--accent-soft)] text-[var(--accent)] border-blue-200'
                }`}
              >
                {q.status === 'Sent' ? '✓ ส่งลูกค้าแล้ว (Immutable)' : 'Draft — แก้ไขได้'}
              </span>
            </div>
            <div className="inline-flex items-center gap-1.5 text-xs text-[var(--status-success-fg)] font-medium">
              <ShieldCheck className="w-4 h-4" aria-hidden="true" />
              <span>
                Confidentiality Protected: ตารางและ PDF นี้แยกขาดจากต้นทุน Agent / กำไร / Margin 100%
              </span>
            </div>
          </div>

          {/* Right Action Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Language Switcher */}
            <div className="inline-flex rounded-xl bg-[var(--surface-muted)] p-1 text-xs">
              <button
                type="button"
                onClick={() => setPdfLang('th')}
                className={`px-3 py-1.5 rounded-lg font-semibold ui-interactive ${
                  pdfLang === 'th'
                    ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                PDF ไทย
              </button>
              <button
                type="button"
                onClick={() => setPdfLang('en')}
                className={`px-3 py-1.5 rounded-lg font-semibold ui-interactive ${
                  pdfLang === 'en'
                    ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                PDF English
              </button>
            </div>

            <a
              href={`${pdfUrl}&download=1`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] hover:bg-[var(--surface-muted)] text-xs font-semibold ui-interactive"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Download PDF</span>
            </a>

            {isDraft ? (
              <button
                type="button"
                onClick={() => setSendOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-[var(--brand-fg)] text-xs font-semibold ui-interactive"
              >
                <Send className="w-3.5 h-3.5" aria-hidden="true" />
                <span>บันทึกว่าส่งลูกค้าแล้ว</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setRevOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-[var(--brand-fg)] text-xs font-semibold ui-interactive"
              >
                <GitBranch className="w-3.5 h-3.5" aria-hidden="true" />
                <span>สร้าง Revision ใหม่ (v{q.currentVersion + 1})</span>
              </button>
            )}
          </div>
        </div>

        {/* 3-Step Pipeline */}
        <nav
          aria-label="Workflow steps"
          className="pt-4 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3 text-xs"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/shipments/${props.shipment.id}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border border-[var(--status-success-border)] font-semibold"
            >
              <span>✓ ① Compare Cost</span>
            </Link>
            <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)]" aria-hidden="true" />
            <Link
              href={`/shipments/${props.shipment.id}/selling-rate`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border border-[var(--status-success-border)] font-semibold"
            >
              <span>✓ ② Sale Price Approved</span>
            </Link>
            <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)]" aria-hidden="true" />
            {q.status === 'Sent' ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border border-[var(--status-success-border)] font-semibold">
                <span>✓ ③ Quotation Sent</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--brand)] text-[var(--brand-fg)] font-semibold">
                <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[11px] font-bold">
                  3
                </span>
                <span>Quotation PDF</span>
              </span>
            )}
          </div>

          {q.status === 'Sent' && (
            <Link
              href="/shipments?tab=history"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border border-[var(--status-success-border)] font-semibold hover:brightness-95 ui-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <span>✓ บันทึกเสร็จครบทั้ง 3 ขั้นตอนแล้ว · ดูประวัติงาน</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          )}
        </nav>
      </header>

      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] text-xs font-medium text-[var(--status-danger-fg)]"
        >
          {error}
        </div>
      )}
      {notice && (
        <div className="p-3.5 rounded-xl bg-[var(--status-success-bg)] border border-[var(--status-success-border)] text-xs font-medium text-[var(--status-success-fg)]">
          {notice}
        </div>
      )}

      {/* Main Split View: Left Editor | Right Live PDF Preview */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_0.95fr] gap-6 items-start">
        {/* Left: Customer Quotation Form */}
        <form onSubmit={handleSaveDraft} className="card-elevated rounded-2xl p-5 space-y-5 text-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <div>
              <h2 className="text-sm font-bold">ข้อมูลหน้าใบเสนอราคา (Customer-Facing)</h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                {isDraft
                  ? 'แก้ไขรายละเอียดลูกค้า รายการเสนอขาย และเงื่อนไข แล้วกด "บันทึก & อัปเดต PDF"'
                  : `ส่งแล้วผ่าน ${q.sentChannel ?? '-'} ถึง ${q.sentRecipient ?? '-'} (กด "สร้าง Revision ใหม่" หากต้องการแก้ไข)`}
              </p>
            </div>
            {isDraft && (
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-[var(--brand-fg)] font-semibold disabled:opacity-50 ui-interactive"
              >
                <Save className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{saving ? 'กำลังบันทึก...' : 'บันทึก & อัปเดต PDF'}</span>
              </button>
            )}
          </div>

          <fieldset disabled={!isDraft} className="space-y-4 disabled:opacity-75">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="q-cust" className="block font-semibold">ชื่อบริษัทลูกค้า *</label>
                <input
                  id="q-cust"
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)]"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="q-contact" className="block font-semibold">ผู้ติดต่อ (Attn)</label>
                <input
                  id="q-contact"
                  type="text"
                  value={customerContact}
                  onChange={(e) => setCustomerContact(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)]"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="q-email" className="block font-semibold">อีเมลลูกค้า</label>
                <input
                  id="q-email"
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)]"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="q-phone" className="block font-semibold">เบอร์โทร</label>
                <input
                  id="q-phone"
                  type="text"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)]"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label htmlFor="q-addr" className="block font-semibold">ที่อยู่ลูกค้า</label>
                <input
                  id="q-addr"
                  type="text"
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-[var(--border-subtle)]">
              <div className="space-y-1 sm:col-span-2">
                <label htmlFor="q-commodity" className="block font-semibold">Commodity (รายละเอียดสินค้า)</label>
                <input
                  id="q-commodity"
                  type="text"
                  value={commodityDescription}
                  onChange={(e) => setCommodityDescription(e.target.value)}
                  placeholder="เช่น Shower Filter"
                  className="w-full px-2.5 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)]"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="q-volume" className="block font-semibold">Volume</label>
                <input
                  id="q-volume"
                  type="text"
                  value={volumeText}
                  onChange={(e) => setVolumeText(e.target.value)}
                  placeholder="เช่น 75 cartons / 1×40DV"
                  className="w-full px-2.5 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)]"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="q-mode" className="block font-semibold">Mode</label>
                <input
                  id="q-mode"
                  type="text"
                  value={modeText}
                  onChange={(e) => setModeText(e.target.value)}
                  placeholder="Sea (LCL) / Sea (FCL)"
                  className="w-full px-2.5 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)]"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="q-term" className="block font-semibold">Term</label>
                <input
                  id="q-term"
                  type="text"
                  value={termText}
                  onChange={(e) => setTermText(e.target.value)}
                  placeholder="FOB / CIF / EXW"
                  className="w-full px-2.5 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)]"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="q-free" className="block font-semibold">Free Days</label>
                <input
                  id="q-free"
                  type="text"
                  value={freeTimeText}
                  onChange={(e) => setFreeTimeText(e.target.value)}
                  placeholder="เช่น 3 Days"
                  className="w-full px-2.5 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)]"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="q-cutoff" className="block font-semibold">CUT OFF ETD</label>
                <input
                  id="q-cutoff"
                  type="text"
                  value={cutOffEtdText}
                  onChange={(e) => setCutOffEtdText(e.target.value)}
                  placeholder="เช่น TUE/THU; THU/MON"
                  className="w-full px-2.5 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)]"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="q-transit" className="block font-semibold">Transit Time (TT)</label>
                <input
                  id="q-transit"
                  type="text"
                  value={transitTimeText}
                  onChange={(e) => setTransitTimeText(e.target.value)}
                  placeholder="เช่น 7 DAYS"
                  className="w-full px-2.5 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)]"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="q-valid" className="block font-semibold">ยืนราคาถึง *</label>
                <input
                  id="q-valid"
                  type="date"
                  required
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)]"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="q-pay" className="block font-semibold">เงื่อนไขชำระเงิน</label>
                <input
                  id="q-pay"
                  type="text"
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)]"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label htmlFor="q-approved-date" className="block font-semibold">
                  วันที่เซ็นอนุมัติ (ช่อง DATE ท้ายใบ)
                </label>
                <input
                  id="q-approved-date"
                  type="text"
                  value={approvedDateText}
                  onChange={(e) => setApprovedDateText(e.target.value)}
                  placeholder="DD/MM/YYYY (เว้นว่างใช้วันที่ออกเอกสาร)"
                  className="w-full px-2.5 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)]"
                />
              </div>
            </div>

            {/* Customer Items Table */}
            <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-[var(--text-primary)]">
                  รายการค่าบริการที่แสดงให้ลูกค้าเห็น ({items.length} รายการ)
                </span>
                {isDraft && (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={consolidateToPerkinGroups}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border-default)] bg-[var(--surface-subtle)] hover:bg-[var(--surface-muted)] text-[11px] font-semibold text-[var(--text-primary)] ui-interactive"
                    >
                      <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>รวมหมวดตามฟอร์ม Perkin</span>
                    </button>
                    <button
                      type="button"
                      onClick={addItem}
                      className="inline-flex items-center gap-1 text-[var(--accent)] font-semibold hover:underline"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>เพิ่มรายการ</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto border border-[var(--border-subtle)] rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[var(--surface-subtle)] border-b border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]">
                      <th className="py-2 px-2.5">รายการ (EN / TH)</th>
                      <th className="py-2 px-1.5 text-right w-14">Qty</th>
                      <th className="py-2 px-1.5 w-24">หน่วย</th>
                      <th className="py-2 px-2 text-right w-28">ราคา/หน่วย (฿)</th>
                      <th className="py-2 px-1.5 text-center w-12">VAT</th>
                      {isDraft && <th className="py-2 px-1 w-8" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {items.map((it, idx) => (
                      <tr key={idx}>
                        <td className="p-1.5 space-y-1">
                          <input
                            type="text"
                            aria-label={`Item English description ${idx + 1}`}
                            value={it.descriptionEn}
                            onChange={(e) => updateItem(idx, { descriptionEn: e.target.value })}
                            placeholder="English description..."
                            className="w-full px-2 py-1 rounded border border-[var(--border-subtle)] font-medium"
                          />
                          <input
                            type="text"
                            aria-label={`Item Thai description ${idx + 1}`}
                            value={it.descriptionTh}
                            onChange={(e) => updateItem(idx, { descriptionTh: e.target.value })}
                            placeholder="คำอธิบายภาษาไทย (ถ้ามี)..."
                            className="w-full px-2 py-1 rounded border border-[var(--border-subtle)] text-[var(--text-secondary)]"
                          />
                        </td>
                        <td className="p-1.5 align-top">
                          <input
                            type="number"
                            step="1"
                            min="1"
                            aria-label={`Item quantity ${idx + 1}`}
                            value={it.quantity}
                            onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                            className="w-full px-1.5 py-1 rounded border border-[var(--border-subtle)] text-right tabular-nums"
                          />
                        </td>
                        <td className="p-1.5 align-top">
                          <input
                            type="text"
                            aria-label={`Item unit ${idx + 1}`}
                            value={it.chargeUnitText}
                            onChange={(e) => updateItem(idx, { chargeUnitText: e.target.value })}
                            className="w-full px-1.5 py-1 rounded border border-[var(--border-subtle)]"
                          />
                        </td>
                        <td className="p-1.5 align-top">
                          <input
                            type="text"
                            aria-label={`Item unit price ${idx + 1}`}
                            value={it.unitPrice}
                            onChange={(e) => updateItem(idx, { unitPrice: e.target.value })}
                            className="w-full px-2 py-1 rounded border border-[var(--border-default)] text-right tabular-nums font-semibold"
                          />
                        </td>
                        <td className="p-1.5 pt-2.5 text-center align-top">
                          <input
                            type="checkbox"
                            aria-label={`Item taxable ${idx + 1}`}
                            checked={it.isTaxable}
                            onChange={(e) => updateItem(idx, { isTaxable: e.target.checked })}
                          />
                        </td>
                        {isDraft && (
                          <td className="p-1.5 pt-2 text-center align-top">
                            <button
                              type="button"
                              aria-label={`Remove item ${idx + 1}`}
                              disabled={items.length <= 1}
                              onClick={() => removeItem(idx)}
                              className="p-1 rounded hover:bg-[var(--status-danger-bg)] text-[var(--text-muted)] hover:text-[var(--status-danger-fg)] disabled:opacity-30"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals Summary */}
              <div className="p-3.5 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-subtle)] space-y-1.5 tabular-nums">
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">Subtotal</span>
                  <span className="font-semibold">{fmt(liveTotals.subtotal)} THB</span>
                </div>
                <div className="flex items-center justify-between">
                  <label htmlFor="q-disc" className="text-[var(--text-secondary)]">Discount (THB)</label>
                  <input
                    id="q-disc"
                    type="text"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(e.target.value)}
                    className="w-28 px-2 py-1 rounded border border-[var(--border-default)] bg-white text-right"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label htmlFor="q-vat" className="text-[var(--text-secondary)]">VAT ({vatPercent}%)</label>
                  <div className="flex items-center gap-2">
                    <input
                      id="q-vat"
                      type="number"
                      step="0.5"
                      value={vatPercent}
                      onChange={(e) => setVatPercent(e.target.value)}
                      className="w-16 px-1.5 py-0.5 rounded border border-[var(--border-default)] bg-white text-right"
                    />
                    <span className="font-semibold w-24 text-right">{fmt(liveTotals.vatAmount)} THB</span>
                  </div>
                </div>
                <div className="flex justify-between pt-2 border-t border-[var(--border-default)] text-sm font-bold text-[var(--brand)]">
                  <span>Grand Total</span>
                  <span>{fmt(liveTotals.grandTotal)} THB</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 pt-2 border-t border-[var(--border-subtle)]">
              <div className="space-y-1">
                <label htmlFor="q-remarks" className="block font-semibold">หมายเหตุถึงลูกค้า (Remarks)</label>
                <input
                  id="q-remarks"
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)]"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="q-terms" className="block font-semibold">เงื่อนไข (Terms & Conditions — อ้างอิงภายใน)</label>
                <textarea
                  id="q-terms"
                  rows={2}
                  value={termsAndConditions}
                  onChange={(e) => setTermsAndConditions(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)]"
                />
              </div>
            </div>
          </fieldset>
        </form>

        {/* Right: Live PDF Previewer */}
        <section className="card-elevated rounded-2xl overflow-hidden flex flex-col sticky top-6">
          <div className="px-4 py-3 bg-[var(--surface-subtle)] border-b border-[var(--border-subtle)] flex items-center justify-between text-xs">
            <span className="font-bold">
              PDF Preview — {q.quotationNumber} (v{previewVersion} · {pdfLang.toUpperCase()})
            </span>
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--accent)] font-semibold hover:underline"
            >
              เปิดเต็มจอ ↗
            </a>
          </div>
          <iframe
            key={pdfUrl}
            src={pdfUrl}
            title="Customer Quotation PDF Preview"
            className="w-full h-[78vh] min-h-[640px] bg-slate-100"
          />
        </section>
      </div>

      {/* MODAL: MARK AS SENT */}
      {sendOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="send-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSendOpen(false);
          }}
          className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px] flex items-center justify-center p-4"
        >
          <div
            className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-[20px] p-6 w-full max-w-md space-y-5"
            style={{ boxShadow: 'var(--shadow-modal)' }}
          >
            <div className="flex items-start justify-between">
              <h2 id="send-modal-title" className="text-base font-bold">
                บันทึกการส่งใบเสนอราคา ({q.quotationNumber} v{q.currentVersion})
              </h2>
              <button
                type="button"
                aria-label="ปิดหน้าต่าง"
                onClick={() => setSendOpen(false)}
                className="p-1 rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleMarkSent} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label htmlFor="send-ch" className="block font-semibold">ช่องทางที่ส่ง *</label>
                <select
                  id="send-ch"
                  value={sentChannel}
                  onChange={(e) =>
                    setSentChannel(e.target.value as 'EMAIL' | 'LINE' | 'HAND_DELIVERY' | 'OTHER')
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-white"
                >
                  <option value="EMAIL">Email</option>
                  <option value="LINE">LINE</option>
                  <option value="HAND_DELIVERY">ส่งเอกสารด้วยตนเอง</option>
                  <option value="OTHER">อื่นๆ</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="send-rec" className="block font-semibold">ผู้รับ (อีเมล / ชื่อ LINE) *</label>
                <input
                  id="send-rec"
                  type="text"
                  required
                  value={sentRecipient}
                  onChange={(e) => setSentRecipient(e.target.value)}
                  placeholder="เช่น anan@customer.com หรือ คุณอนันต์ (LINE)"
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)]"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="send-notes" className="block font-semibold">หมายเหตุ</label>
                <input
                  id="send-notes"
                  type="text"
                  value={sentNotes}
                  onChange={(e) => setSentNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)]"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSendOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[var(--border-default)] font-semibold"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 rounded-xl bg-[var(--brand)] text-[var(--brand-fg)] font-semibold disabled:opacity-50"
                >
                  {busy ? 'กำลังบันทึก...' : 'ยืนยันบันทึกการส่ง'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE REVISION vN+1 */}
      {revOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="rev-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setRevOpen(false);
          }}
          className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px] flex items-center justify-center p-4"
        >
          <div
            className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-[20px] p-6 w-full max-w-md space-y-5"
            style={{ boxShadow: 'var(--shadow-modal)' }}
          >
            <div className="flex items-start justify-between">
              <h2 id="rev-modal-title" className="text-base font-bold">
                สร้าง Revision ใหม่ (v{q.currentVersion + 1})
              </h2>
              <button
                type="button"
                aria-label="ปิดหน้าต่าง"
                onClick={() => setRevOpen(false)}
                className="p-1 rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleCreateRevision} className="space-y-4 text-xs">
              <p className="text-[var(--text-secondary)]">
                เวอร์ชันเดิม (v{q.currentVersion}) จะถูกเก็บไว้เป็นประวัติ (Superseded) และเปิด v{q.currentVersion + 1} เป็น Draft ให้แก้ไขใหม่
              </p>
              <div className="space-y-1.5">
                <label htmlFor="rev-sum" className="block font-semibold">เหตุผลที่ปรับปรุงใบเสนอราคา *</label>
                <textarea
                  id="rev-sum"
                  rows={3}
                  required
                  value={revSummary}
                  onChange={(e) => setRevSummary(e.target.value)}
                  placeholder="เช่น ลูกค้าขอปรับส่วนลด 1,000 บาท และขยายวันยืนราคา"
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)]"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRevOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[var(--border-default)] font-semibold"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 rounded-xl bg-[var(--brand)] text-[var(--brand-fg)] font-semibold disabled:opacity-50"
                >
                  {busy ? 'กำลังสร้าง...' : `สร้าง v${q.currentVersion + 1}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
