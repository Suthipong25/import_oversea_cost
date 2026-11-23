'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Decimal from 'decimal.js';
import {
  Plus,
  Search,
  Trash2,
  Eye,
  CheckCircle2,
  ArrowRight,
  Upload,
  FileText,
  X,
  ArrowRightLeft,
  Layers,
  History,
  ExternalLink,
  Save,
} from 'lucide-react';
import type { StandaloneAgentCostItem } from '@/modules/agent-costs/service';
import type { ShipmentListItem } from '@/modules/shipments/repo';
import type { LiveFxSnapshot } from '@/lib/fx/live-rate';
import {
  isDestinationCharge,
  parseVolumeMultiplierFromSummary,
} from '@/domain/comparison/scope';
import { DeleteShipmentButton } from '@/components/delete-shipment-button';
import { NewShipmentDialog } from '@/components/new-shipment-dialog';
import { LiveFxBadge } from '@/components/live-fx-badge';

interface CatalogOption {
  id: string;
  code: string;
  nameEn: string;
  nameTh: string | null;
  category: string;
  isSectionHeader: boolean;
}

interface SupplierOption {
  id: string;
  name: string;
  companyName: string;
}

interface AgentCostLibraryProps {
  initialTab?: 'library' | 'history';
  initialItems: StandaloneAgentCostItem[];
  catalog: CatalogOption[];
  suppliers: SupplierOption[];
  fxRateUsdToThb: number;
  fxSnapshot?: Pick<LiveFxSnapshot, 'source' | 'isLive' | 'updatedAt'>;
  shipments: Array<Omit<ShipmentListItem, 'createdAt'> & { createdAt: string }>;
  canCreate: boolean;
}

function fmtShortDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('th-TH', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtMoney(val: string | number | null | undefined): string {
  if (val === null || val === undefined || val === '') return '—';
  try {
    const d = new Decimal(val);
    if (d.isZero()) return '—';
    return d.toNumber().toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return '—';
  }
}

function fmtInput(val: string | null | undefined): string {
  if (!val) return '';
  try {
    const d = new Decimal(val);
    return d.isZero() ? '' : d.toFixed(2);
  } catch {
    return '';
  }
}

function scaleValueByRatio(val: string | null | undefined, ratio: Decimal): string | null {
  if (val === null || val === undefined || val === '') return null;
  if (ratio.eq(1)) return val;
  try {
    const d = new Decimal(val);
    if (d.isZero()) return val;
    return d.times(ratio).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4);
  } catch {
    return val;
  }
}

function shipmentStatusLabel(status: string): string {
  switch (status) {
    case 'Completed (3/3)':
      return 'เสร็จครบทั้ง 3 ขั้นตอน';
    case 'Quotation Draft':
      return 'ร่างใบเสนอราคา (ขั้น ③)';
    case 'Price Approved':
      return 'อนุมัติราคาแล้ว (พร้อมขั้น ③)';
    case 'Pending Approval':
      return 'รออนุมัติราคาขาย (ขั้น ②)';
    case 'Pricing Returned':
      return 'ส่งกลับแก้ไขราคา (ขั้น ②)';
    case 'Pricing Draft':
      return 'กำลังทำราคาขาย (ขั้น ②)';
    case 'Supplier Selected':
      return 'เลือก Agent แล้ว (พร้อมขั้น ②)';
    case 'Comparison Open':
      return 'กำลังเปรียบเทียบ (ขั้น ①)';
    case 'Ready for Comparison':
      return 'พร้อมเปรียบเทียบ';
    case 'Rates Pending Verification':
      return 'รอตรวจใบราคา';
    case 'Needs Attention':
      return 'ต้องตรวจสอบ';
    default:
      return 'สร้างงานใหม่';
  }
}

function shipmentStatusStyle(status: string): string {
  if (status === 'Completed (3/3)' || status === 'Price Approved' || status === 'Supplier Selected') {
    return 'bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-border)]';
  }
  if (status === 'Needs Attention' || status === 'Pricing Returned') {
    return 'bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)] border-[var(--status-danger-border)]';
  }
  if (
    status === 'Quotation Draft' ||
    status === 'Pricing Draft' ||
    status === 'Ready for Comparison' ||
    status === 'Comparison Open'
  ) {
    return 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/30';
  }
  if (status === 'Pending Approval' || status === 'Rates Pending Verification') {
    return 'bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)] border-[var(--status-warn-border)]';
  }
  return 'bg-[var(--surface-muted)] text-[var(--text-secondary)] border-[var(--border-subtle)]';
}

export function AgentCostLibraryClient(props: AgentCostLibraryProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'library' | 'history'>(props.initialTab ?? 'library');
  const [liveFxRate, setLiveFxRate] = useState<number>(props.fxRateUsdToThb);
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'COMPLETED' | 'IN_PROGRESS'>('ALL');
  const [modeFilter, setModeFilter] = useState<'ALL' | 'FCL' | 'LCL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [compareCustomerName, setCompareCustomerName] = useState('');
  const [comparing, setComparing] = useState(false);

  // Add Cost Agent Modal State
  const [addOpen, setAddOpen] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [modeType, setModeType] = useState<'FCL' | 'LCL'>('FCL');
  const [polPortCode, setPolPortCode] = useState('USLAX');
  const [podPortCode, setPodPortCode] = useState('THLCH');
  const [containerSummary, setContainerSummary] = useState('1×40DV');
  const [pastedText, setPastedText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Slide-over Detail Drawer State
  const [activeDetailId, setActiveDetailId] = useState<string | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [editAgentName, setEditAgentName] = useState('');
  const [editModeType, setEditModeType] = useState<'FCL' | 'LCL'>('FCL');
  const [editPol, setEditPol] = useState('');
  const [editPod, setEditPod] = useState('');
  const [editContainerSummary, setEditContainerSummary] = useState('');
  const [newLineName, setNewLineName] = useState('');
  const [newLineThb, setNewLineThb] = useState('');
  const [newLineUsd, setNewLineUsd] = useState('');

  const activeDetailItem = useMemo(
    () => props.initialItems.find((it) => it.id === activeDetailId) ?? null,
    [props.initialItems, activeDetailId]
  );

  // Sync editable metadata inputs whenever user opens a different Cost Agent detail drawer
  useEffect(() => {
    if (!activeDetailItem) return;
    setEditAgentName(activeDetailItem.agentName);
    setEditModeType(activeDetailItem.modeType === 'LCL' ? 'LCL' : 'FCL');
    setEditPol(activeDetailItem.polPortCode);
    setEditPod(activeDetailItem.podPortCode);
    setEditContainerSummary(activeDetailItem.containerSummary);
  }, [activeDetailItem]);

  // Allow Ctrl+V image paste directly when the Add Cost Agent modal is open
  useEffect(() => {
    if (!addOpen) return;
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            const ext = item.type.split('/')[1] || 'png';
            const pastedFile = new File([blob], `pasted-rate-${Date.now()}.${ext}`, {
              type: item.type,
            });
            setSelectedFile(pastedFile);
            setNotice('วางภาพจากคลิปบอร์ดแล้ว — กด "บันทึก & ดึงรายการด้วย AI" ได้เลย');
          }
          break;
        }
      }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addOpen]);

  // Keyboard parity: Escape closes active modal or detail drawer
  useEffect(() => {
    if (!addOpen && !activeDetailId) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (addOpen) setAddOpen(false);
        else if (activeDetailId) setActiveDetailId(null);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [addOpen, activeDetailId]);

  const fclCount = useMemo(
    () => props.initialItems.filter((it) => it.modeType === 'FCL').length,
    [props.initialItems]
  );
  const lclCount = useMemo(
    () => props.initialItems.filter((it) => it.modeType === 'LCL').length,
    [props.initialItems]
  );

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return props.initialItems.filter((it) => {
      if (modeFilter !== 'ALL' && it.modeType !== modeFilter) return false;
      if (!q) return true;
      const chargeNames = it.charges.map((c) => c.rawChargeName).join(' ');
      return `${it.agentName} ${it.polPortCode} ${it.podPortCode} ${it.containerSummary} ${it.modeType} ${chargeNames}`
        .toLowerCase()
        .includes(q);
    });
  }, [props.initialItems, modeFilter, searchQuery]);

  const selectedItems = useMemo(
    () => props.initialItems.filter((it) => selectedIds.includes(it.id)),
    [props.initialItems, selectedIds]
  );

  const completedShipmentsCount = useMemo(
    () => props.shipments.filter((s) => s.workflow.isAllCompleted).length,
    [props.shipments]
  );

  const filteredShipments = useMemo(() => {
    if (historyFilter === 'COMPLETED') {
      return props.shipments.filter((s) => s.workflow.isAllCompleted);
    }
    if (historyFilter === 'IN_PROGRESS') {
      return props.shipments.filter((s) => !s.workflow.isAllCompleted);
    }
    return props.shipments;
  }, [props.shipments, historyFilter]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 5) {
        setError('เลือกเปรียบเทียบได้สูงสุด 5 Agent ต่อครั้งครับ');
        return prev;
      }
      return [...prev, id];
    });
  }

  function handleModeChange(nextMode: 'FCL' | 'LCL') {
    setModeType(nextMode);
    if (nextMode === 'LCL' && (containerSummary === '1×40DV' || containerSummary === '')) {
      setContainerSummary('LCL · 1 CBM');
    } else if (nextMode === 'FCL' && containerSummary.toUpperCase().startsWith('LCL')) {
      setContainerSummary('1×40DV');
    }
  }

  async function handleCreateAgentCost(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('agentName', agentName);
      formData.append('modeType', modeType);
      formData.append('polPortCode', polPortCode);
      formData.append('podPortCode', podPortCode);
      formData.append('containerSummary', containerSummary);
      if (pastedText.trim()) formData.append('pastedText', pastedText);
      if (selectedFile) formData.append('file', selectedFile);

      const res = await fetch('/api/agent-costs', {
        method: 'POST',
        body: formData,
      });
      const json = (await res.json()) as {
        success: boolean;
        data?: { rateRecordId: string; agentName: string; extractedCount: number };
        error?: { message?: string };
      };

      if (!res.ok || !json.success || !json.data) {
        setError(json.error?.message ?? 'เพิ่มข้อมูล Cost Agent ไม่สำเร็จ');
        return;
      }

      setAddOpen(false);
      setAgentName('');
      setPastedText('');
      setSelectedFile(null);
      setNotice(
        `เพิ่ม "${json.data.agentName}" เรียบร้อยแล้ว (ดึงข้อมูลได้ ${json.data.extractedCount} รายการ)`
      );
      setActiveDetailId(json.data.rateRecordId);
      router.refresh();
    } catch {
      setError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteAgentCost(item: StandaloneAgentCostItem) {
    const confirmed = window.confirm(
      `ต้องการลบรายการ Cost Agent "${item.agentName}" (${item.polPortCode} → ${item.podPortCode}) ใช่หรือไม่?`
    );
    if (!confirmed) return;

    setError(null);
    try {
      const res = await fetch(`/api/rates/${item.id}`, { method: 'DELETE' });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'ลบรายการไม่สำเร็จ');
        return;
      }
      setSelectedIds((prev) => prev.filter((x) => x !== item.id));
      if (activeDetailId === item.id) setActiveDetailId(null);
      router.refresh();
    } catch {
      setError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    }
  }

  async function handleLaunchCompare() {
    if (selectedIds.length < 2) return;
    setError(null);
    setComparing(true);
    try {
      const res = await fetch('/api/agent-costs/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rateRecordIds: selectedIds,
          customerName: compareCustomerName.trim() || null,
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        data?: { shipmentId: string };
        error?: { message?: string };
      };
      if (!res.ok || !json.success || !json.data) {
        setError(json.error?.message ?? 'ไม่สามารถเปิดหน้าเปรียบเทียบได้');
        return;
      }
      router.push(`/shipments/${json.data.shipmentId}`);
      router.refresh();
    } catch {
      setError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    } finally {
      setComparing(false);
    }
  }

  async function handleSaveChargeCell(
    rateId: string,
    charge: StandaloneAgentCostItem['charges'][number],
    patch: {
      whtAmount?: string;
      vatAmount?: string;
      amountThb?: string;
      amountUsd?: string;
      cellStatus?: 'QUOTED' | 'NOT_APPLICABLE';
    }
  ) {
    setDetailBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rates/${rateId}/charges`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chargeId: charge.id,
          chargeCatalogId: charge.chargeCatalogId,
          rawChargeName: charge.rawChargeName,
          category: charge.category,
          cellStatus: patch.cellStatus ?? (charge.cellStatus === 'NOT_APPLICABLE' ? 'NOT_APPLICABLE' : 'QUOTED'),
          whtAmount: patch.whtAmount ?? charge.whtAmount,
          vatAmount: patch.vatAmount ?? charge.vatAmount,
          amountThb: patch.amountThb !== undefined ? patch.amountThb : (charge.amountThb ?? ''),
          amountUsd: patch.amountUsd !== undefined ? patch.amountUsd : (charge.amountUsd ?? ''),
        }),
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'บันทึกตัวเลขไม่สำเร็จ');
        return;
      }
      router.refresh();
    } finally {
      setDetailBusy(false);
    }
  }

  async function handleRemoveChargeRow(
    rateId: string,
    charge: StandaloneAgentCostItem['charges'][number]
  ) {
    await handleSaveChargeCell(rateId, charge, {
      cellStatus: 'QUOTED',
      whtAmount: '0',
      vatAmount: '0',
      amountThb: '',
      amountUsd: '',
    });
  }

  async function handleAddChargeLine(e: React.FormEvent) {
    e.preventDefault();
    if (!activeDetailItem || !newLineName.trim()) return;
    if (!newLineThb.trim() && !newLineUsd.trim()) {
      setError('กรุณากรอกยอดเงิน THB หรือ USD อย่างน้อย 1 ช่อง');
      return;
    }

    setDetailBusy(true);
    setError(null);
    try {
      const matchedCatalog = props.catalog.find(
        (c) =>
          !c.isSectionHeader &&
          c.nameEn.toLowerCase() === newLineName.trim().toLowerCase()
      );
      const res = await fetch(`/api/rates/${activeDetailItem.id}/charges`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chargeCatalogId: matchedCatalog?.id ?? null,
          rawChargeName: newLineName.trim(),
          category: matchedCatalog?.category ?? 'Other',
          cellStatus: 'QUOTED',
          whtAmount: '0',
          vatAmount: '0',
          amountThb: newLineThb.trim(),
          amountUsd: newLineUsd.trim(),
        }),
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'เพิ่มบรรทัดไม่สำเร็จ');
        return;
      }
      setNewLineName('');
      setNewLineThb('');
      setNewLineUsd('');
      router.refresh();
    } finally {
      setDetailBusy(false);
    }
  }

  async function handleVerifyDetail(rateId: string) {
    setDetailBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rates/${rateId}/verify`, { method: 'POST' });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'ยืนยันไม่สำเร็จ');
        return;
      }
      setNotice('ยืนยันตัวเลข (Verified) เรียบร้อยแล้ว');
      router.refresh();
    } finally {
      setDetailBusy(false);
    }
  }

  const createModalMultiplier = useMemo(
    () => parseVolumeMultiplierFromSummary(containerSummary),
    [containerSummary]
  );

  const savedDetailMultiplier = useMemo(
    () => (activeDetailItem ? parseVolumeMultiplierFromSummary(activeDetailItem.containerSummary) : 1),
    [activeDetailItem]
  );

  const liveDetailMultiplier = useMemo(
    () => parseVolumeMultiplierFromSummary(editContainerSummary),
    [editContainerSummary]
  );

  const liveDetailRatio = useMemo(() => {
    if (savedDetailMultiplier > 0 && liveDetailMultiplier > 0) {
      return new Decimal(liveDetailMultiplier).dividedBy(savedDetailMultiplier);
    }
    return new Decimal(1);
  }, [savedDetailMultiplier, liveDetailMultiplier]);

  const liveDetailTotals = useMemo(() => {
    if (!activeDetailItem) {
      return { whtThb: '0.0000', vatThb: '0.0000', amountThb: '0.0000', amountUsd: '0.0000' };
    }
    if (liveDetailRatio.eq(1)) return activeDetailItem.totals;

    let wht = new Decimal(0);
    let vat = new Decimal(0);
    let thb = new Decimal(0);
    let usd = new Decimal(0);

    for (const ch of activeDetailItem.charges) {
      if (ch.cellStatus !== 'QUOTED') continue;
      const isDest = isDestinationCharge(ch.rawChargeName, ch.category);
      const rowRatio = isDest ? new Decimal(1) : liveDetailRatio;

      if (ch.whtAmount) wht = wht.plus(new Decimal(ch.whtAmount).times(rowRatio));
      if (ch.vatAmount) vat = vat.plus(new Decimal(ch.vatAmount).times(rowRatio));
      if (ch.amountThb) thb = thb.plus(new Decimal(ch.amountThb).times(rowRatio));
      if (ch.amountUsd) usd = usd.plus(new Decimal(ch.amountUsd).times(rowRatio));
    }

    return {
      whtThb: wht.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4),
      vatThb: vat.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4),
      amountThb: thb.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4),
      amountUsd: usd.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4),
    };
  }, [activeDetailItem, liveDetailRatio]);

  async function saveDetailMetaValues(nextSummaryOverride?: string) {
    if (!activeDetailItem || detailBusy) return;
    const summaryToSave = (nextSummaryOverride ?? editContainerSummary).trim();
    if (!summaryToSave) return;
    setDetailBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/agent-costs/${activeDetailItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentName: editAgentName,
          modeType: editModeType,
          polPortCode: editPol,
          podPortCode: editPod,
          containerSummary: summaryToSave,
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        data?: { prevMultiplier?: number; nextMultiplier?: number };
        error?: { message?: string };
      };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'บันทึกข้อมูลหัวรายการไม่สำเร็จ');
        return;
      }
      const prevMult = json.data?.prevMultiplier ?? savedDetailMultiplier;
      const nextMult = json.data?.nextMultiplier ?? liveDetailMultiplier;
      if (prevMult !== nextMult) {
        setNotice(
          `อัปเดตขนาดตู้/Volume เป็น "${summaryToSave}" และคูณราคาทุกรายการ (×${nextMult}) เรียบร้อยแล้ว`
        );
      } else {
        setNotice('อัปเดตชื่อ Agent เส้นทาง และขนาดตู้เรียบร้อยแล้ว');
      }
      router.refresh();
    } finally {
      setDetailBusy(false);
    }
  }

  async function handleSaveDetailMeta(e: React.FormEvent) {
    e.preventDefault();
    await saveDetailMetaValues();
  }

  async function handleApplyFxDetail(rateId: string) {
    setDetailBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rates/${rateId}/apply-fx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fxRate: liveFxRate,
          roundingMode: 'CEIL_100',
          overwriteExisting: true,
        }),
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'แปลงสกุลเงินไม่สำเร็จ');
        return;
      }
      setNotice(`แปลง USD → THB ด้วยอัตรา ${liveFxRate.toFixed(2)} (ปัดขึ้นหลักร้อย) เรียบร้อยแล้ว`);
      router.refresh();
    } finally {
      setDetailBusy(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-28">
      {/* Page Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
            Cost Agent Library · FCL &amp; LCL
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            รายการ Cost Agent
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            เพิ่มใบราคาจาก Agent ได้ทันที (ทั้งงานตู้ FCL และ LCL) ดูรายละเอียด แก้ไข และติ๊กเลือก 2 เจ้าขึ้นไปเพื่อเปรียบเทียบ
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <LiveFxBadge
            initialRate={liveFxRate}
            initialMeta={props.fxSnapshot}
            onRateChange={setLiveFxRate}
          />
          {props.canCreate && activeTab === 'library' && (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-[var(--brand-fg)] text-xs font-semibold shadow-sm ui-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>เพิ่มข้อมูล Cost Agent</span>
            </button>
          )}
          {props.canCreate && activeTab === 'history' && <NewShipmentDialog />}
        </div>
      </header>

      {/* Main Navigation Tabs */}
      <div className="inline-flex rounded-xl bg-[var(--surface-muted)] p-1 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab('library')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold ui-interactive ${
            activeTab === 'library'
              ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-xs'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Layers className="w-3.5 h-3.5" aria-hidden="true" />
          <span>รายการ Cost Agent ({props.initialItems.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold ui-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
            activeTab === 'history'
              ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-xs'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <History className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="tabular-nums">ประวัติงาน ({props.shipments.length})</span>
          {completedShipmentsCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border border-[var(--status-success-border)]">
              ✓ เสร็จครบ 3/3: {completedShipmentsCount}
            </span>
          )}
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] text-xs font-medium text-[var(--status-danger-fg)] flex items-center justify-between gap-2"
        >
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="ปิดข้อความแจ้งเตือน">
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {notice && (
        <div className="p-3.5 rounded-xl bg-[var(--status-success-bg)] border border-[var(--status-success-border)] text-xs font-medium text-[var(--status-success-fg)] flex items-center justify-between gap-2">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="ปิดข้อความแจ้งผล">
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* ==================== TAB 1: รายการ COST AGENT ==================== */}
      {activeTab === 'library' && (
        <div className="space-y-4">
          {/* Filter & Search Card */}
          <div className="card-elevated rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="กรองตามประเภทงาน">
              {(
                [
                  { id: 'ALL', label: `ทั้งหมด (${props.initialItems.length})` },
                  { id: 'FCL', label: `งานตู้ FCL (${fclCount})` },
                  { id: 'LCL', label: `ไม่เต็มตู้ LCL (${lclCount})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setModeFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg font-semibold ui-interactive ${
                    modeFilter === tab.id
                      ? 'bg-[var(--brand)] text-[var(--brand-fg)]'
                      : 'border border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-80">
              <Search
                className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="text"
                aria-label="ค้นหาชื่อ Agent เส้นทาง หรือรายการค่าใช้จ่าย"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหาชื่อ Agent, เส้นทาง (USLAX, NINGBO)..."
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              />
            </div>
          </div>

          {/* Agent Cost Table */}
          <section className="card-elevated rounded-2xl overflow-hidden">
            {filteredItems.length === 0 ? (
              <div className="py-16 px-6 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-[var(--surface-muted)] flex items-center justify-center text-[var(--text-muted)]">
                  <Upload className="w-6 h-6" aria-hidden="true" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-base font-bold">
                    {props.initialItems.length === 0
                      ? 'ยังไม่มีรายการ Cost Agent'
                      : 'ไม่พบรายการที่ตรงกับคำค้นหา'}
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
                    กดปุ่ม &ldquo;เพิ่มข้อมูล Cost Agent&rdquo; แล้ววางรูปใบราคา (Ctrl+V), อัปโหลด PDF หรือวางข้อความแชท LINE ของแต่ละ Agent เก็บไว้ได้เลย
                  </p>
                </div>
                {props.canCreate && props.initialItems.length === 0 && (
                  <button
                    type="button"
                    onClick={() => setAddOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--brand)] text-[var(--brand-fg)] text-xs font-semibold"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    <span>เพิ่มข้อมูล Cost Agent แรกเลย</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[var(--surface-subtle)] border-b border-[var(--border-subtle)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      <th className="py-3.5 px-4 w-12 text-center">เลือก</th>
                      <th className="py-3.5 px-3">ชื่อ Agent</th>
                      <th className="py-3.5 px-3">ประเภท / ขนาด</th>
                      <th className="py-3.5 px-3">เส้นทาง</th>
                      <th className="py-3.5 px-3">รายการค่าใช้จ่ายที่แจ้ง</th>
                      <th className="py-3.5 px-3 text-right">รวมต้นทุน (THB)</th>
                      <th className="py-3.5 px-3 text-center">ที่มา / สถานะ</th>
                      <th className="py-3.5 px-4 text-right w-40">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {filteredItems.map((item) => {
                      const isChecked = selectedIds.includes(item.id);
                      const quotedCharges = item.charges.filter(
                        (c) => c.cellStatus === 'QUOTED'
                      );
                      const isVerified = item.verificationStatus === 'Verified';

                      return (
                        <tr
                          key={item.id}
                          className={`ui-interactive ${
                            isChecked
                              ? 'bg-[var(--accent-soft)]/50'
                              : 'hover:bg-[var(--surface-subtle)]'
                          }`}
                        >
                          <td className="py-3.5 px-4 text-center">
                            <input
                              type="checkbox"
                              aria-label={`เลือก ${item.agentName} เพื่อเปรียบเทียบ`}
                              checked={isChecked}
                              onChange={() => toggleSelect(item.id)}
                              className="w-4 h-4 accent-[var(--brand)] cursor-pointer"
                            />
                          </td>

                          <td className="py-3.5 px-3">
                            <button
                              type="button"
                              onClick={() => setActiveDetailId(item.id)}
                              className="text-left font-bold text-sm text-[var(--text-primary)] hover:text-[var(--accent)] hover:underline"
                            >
                              {item.agentName}
                            </button>
                            <div className="text-[11px] text-[var(--text-muted)] mt-0.5 tabular-nums">
                              {quotedCharges.length} รายการ ·{' '}
                              {new Date(item.createdAt).toLocaleDateString('th-TH')}
                            </div>
                          </td>

                          <td className="py-3.5 px-3">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-md font-mono font-bold text-[11px] border ${
                                item.modeType === 'LCL'
                                  ? 'bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)] border-[var(--status-warn-border)]'
                                  : 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/30'
                              }`}
                            >
                              {item.modeType}
                            </span>
                            <div className="font-mono text-[11px] text-[var(--text-secondary)] mt-1">
                              {item.containerSummary}
                            </div>
                          </td>

                          <td className="py-3.5 px-3">
                            <span className="inline-flex px-2.5 py-1 rounded-lg bg-[var(--surface-muted)] font-mono font-semibold text-[var(--text-primary)]">
                              {item.polPortCode} → {item.podPortCode}
                            </span>
                          </td>

                          <td className="py-3.5 px-3 max-w-xs">
                            <div className="flex flex-wrap items-center gap-1">
                              {quotedCharges.slice(0, 4).map((c) => (
                                <span
                                  key={c.id}
                                  className="px-1.5 py-0.5 rounded bg-[var(--surface-subtle)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] truncate max-w-[140px]"
                                >
                                  {c.rawChargeName}
                                </span>
                              ))}
                              {quotedCharges.length > 4 && (
                                <span className="text-[11px] font-semibold text-[var(--text-muted)]">
                                  +{quotedCharges.length - 4}
                                </span>
                              )}
                              {quotedCharges.length === 0 && (
                                <span className="text-[11px] text-[var(--text-muted)]">
                                  กดดูรายละเอียดเพื่อกรอกรายการ
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-3.5 px-3 text-right">
                            <div className="font-bold text-sm tabular-nums text-[var(--text-primary)]">
                              {fmtMoney(item.totals.amountThb)}
                            </div>
                            {Number(item.totals.amountUsd) > 0 && (
                              <div className="text-[11px] tabular-nums text-[var(--text-muted)]">
                                USD {fmtMoney(item.totals.amountUsd)}
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-3 text-center">
                            <div className="text-[11px] text-[var(--text-muted)]">
                              {item.sourceFileType === 'IMAGE'
                                ? 'รูปภาพ'
                                : item.sourceFileType === 'PDF'
                                  ? 'PDF'
                                  : 'ข้อความ / กรอกเอง'}
                            </div>
                            <span
                              className={`inline-flex mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                isVerified
                                  ? 'bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-border)]'
                                  : 'bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)] border-[var(--status-warn-border)]'
                              }`}
                            >
                              {isVerified ? '✓ Verified' : 'รอตรวจ'}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setActiveDetailId(item.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] hover:bg-[var(--brand)] hover:text-[var(--brand-fg)] hover:border-[var(--brand)] font-semibold ui-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                              >
                                <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>ดูรายละเอียด</span>
                              </button>
                              <button
                                type="button"
                                aria-label={`ลบ ${item.agentName}`}
                                title={`ลบ ${item.agentName}`}
                                onClick={() => handleDeleteAgentCost(item)}
                                className="inline-flex items-center justify-center p-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-muted)] hover:bg-[var(--status-danger-bg)] hover:border-[var(--status-danger-border)] hover:text-[var(--status-danger-fg)] ui-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ==================== TAB 2: ประวัติงาน (ติดตามครบ 3 ขั้นตอน) ==================== */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          {props.shipments.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex flex-wrap items-center gap-1.5 text-xs">
                {(
                  [
                    {
                      key: 'ALL' as const,
                      label: `ทั้งหมด (${props.shipments.length})`,
                    },
                    {
                      key: 'COMPLETED' as const,
                      label: `✓ เสร็จครบ 3 ขั้นตอน (${completedShipmentsCount})`,
                    },
                    {
                      key: 'IN_PROGRESS' as const,
                      label: `กำลังดำเนินการ (${props.shipments.length - completedShipmentsCount})`,
                    },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setHistoryFilter(opt.key)}
                    className={`px-3 py-1.5 rounded-xl font-semibold border tabular-nums ui-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                      historyFilter === opt.key
                        ? opt.key === 'COMPLETED'
                          ? 'bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-border)]'
                          : 'bg-[var(--brand)] text-[var(--brand-fg)] border-[var(--brand)]'
                        : 'bg-[var(--surface-card)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:bg-[var(--surface-muted)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                คลิกที่ป้าย ① / ② / ③ เพื่อเปิดดูเอกสารแต่ละขั้นตอนได้ทันที
              </div>
            </div>
          )}

          <section className="card-elevated rounded-2xl overflow-hidden">
            {props.shipments.length === 0 ? (
              <div className="py-16 px-6 text-center space-y-2 text-xs text-[var(--text-secondary)]">
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  ยังไม่มีประวัติงานเปรียบเทียบ
                </p>
                <p>
                  ติ๊กเลือก Cost Agent อย่างน้อย 2 รายการในแท็บ &ldquo;รายการ Cost Agent&rdquo; แล้วกดเปรียบเทียบเพื่อสร้างงานใหม่ได้เลย
                </p>
              </div>
            ) : filteredShipments.length === 0 ? (
              <div className="py-12 px-6 text-center space-y-1.5 text-xs text-[var(--text-secondary)]">
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  {historyFilter === 'COMPLETED'
                    ? 'ยังไม่มีงานที่เสร็จครบทั้ง 3 ขั้นตอน'
                    : 'ไม่มีงานที่กำลังดำเนินการ'}
                </p>
                <p>
                  {historyFilter === 'COMPLETED'
                    ? 'เมื่องานผ่าน ① Compare Cost → ② Sale Price Approved → ③ บันทึกส่งใบเสนอราคาแล้ว จะแสดงที่นี่อัตโนมัติ'
                    : 'งานทั้งหมดดำเนินการเสร็จครบ 3 ขั้นตอนแล้ว'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[var(--surface-subtle)] border-b border-[var(--border-subtle)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      <th className="py-3.5 px-5">เลขที่งาน / QT</th>
                      <th className="py-3.5 px-4">ลูกค้า / ชื่องาน</th>
                      <th className="py-3.5 px-4">เส้นทาง / ขนาด</th>
                      <th className="py-3.5 px-4">ความคืบหน้า 3 ขั้นตอน</th>
                      <th className="py-3.5 px-4">สถานะบันทึก</th>
                      <th className="py-3.5 px-5 text-right">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {filteredShipments.map((s) => {
                      const wf = s.workflow;
                      const step1Time = fmtShortDateTime(wf.step1At);
                      const step2Time = fmtShortDateTime(wf.step2At);
                      const step3Time = fmtShortDateTime(wf.step3At);

                      const nextHref = wf.isAllCompleted
                        ? `/shipments/${s.id}/quotation`
                        : wf.step2Done
                          ? `/shipments/${s.id}/quotation`
                          : wf.step1Done
                            ? `/shipments/${s.id}/selling-rate`
                            : `/shipments/${s.id}`;
                      const nextLabel = wf.isAllCompleted
                        ? 'ดูใบเสนอราคา'
                        : wf.step2Done
                          ? 'ไปขั้น ③'
                          : wf.step1Done
                            ? 'ไปขั้น ②'
                            : 'เปิดดู';

                      return (
                        <tr
                          key={s.id}
                          className={`ui-interactive ${
                            wf.isAllCompleted
                              ? 'bg-[var(--status-success-bg)]/25 hover:bg-[var(--status-success-bg)]/45'
                              : 'hover:bg-[var(--surface-subtle)]'
                          }`}
                        >
                          <td className="py-3.5 px-5 align-top whitespace-nowrap">
                            <div className="font-mono font-semibold text-[var(--text-primary)]">
                              {s.shipmentRef}
                            </div>
                            {wf.quotationNumber && (
                              <div className="font-mono text-[11px] text-[var(--accent)] mt-0.5">
                                QT {wf.quotationNumber}
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-4 align-top">
                            <div className="font-semibold text-sm text-[var(--text-primary)]">
                              {s.customerName}
                            </div>
                            <div className="text-[11px] text-[var(--text-muted)] mt-0.5 tabular-nums">
                              ผู้ดูแล: {s.assignedUserName} · {s.rateCount} Agent
                            </div>
                          </td>

                          <td className="py-3.5 px-4 align-top whitespace-nowrap">
                            <div className="font-mono font-semibold text-[var(--text-primary)]">
                              {s.polPortCode} → {s.podPortCode}
                            </div>
                            <div className="font-mono text-[11px] text-[var(--text-secondary)] mt-0.5">
                              {s.containers
                                .map((c) => `${c.quantity}×${c.containerType}`)
                                .join(' + ')}
                            </div>
                          </td>

                          {/* 3-Step Pipeline Tracker */}
                          <td className="py-3.5 px-4 align-top whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              {/* Step 1 */}
                              <Link
                                href={`/shipments/${s.id}`}
                                title={
                                  step1Time
                                    ? `① Compare Cost — เลือก Agent แล้ว (${step1Time})`
                                    : 'เปิด ① Compare Cost'
                                }
                                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold ui-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                                  wf.step1Done
                                    ? 'bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-border)]'
                                    : 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/30'
                                }`}
                              >
                                <span>{wf.step1Done ? '✓ ① Compare' : '① Compare'}</span>
                              </Link>

                              <span className="text-[var(--text-muted)]" aria-hidden="true">
                                →
                              </span>

                              {/* Step 2 */}
                              {wf.step1Done ? (
                                <Link
                                  href={`/shipments/${s.id}/selling-rate`}
                                  title={
                                    step2Time
                                      ? `② Sale Price Approved (${step2Time})`
                                      : 'เปิด ② Sale Price Approve Request'
                                  }
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold ui-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                                    wf.step2Done
                                      ? 'bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-border)]'
                                      : wf.step2Status === 'Pending_Approval'
                                        ? 'bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)] border-[var(--status-warn-border)]'
                                        : wf.step2Status === 'Returned' ||
                                            wf.step2Status === 'Needs_Review'
                                          ? 'bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)] border-[var(--status-danger-border)]'
                                          : 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/30'
                                  }`}
                                >
                                  <span>
                                    {wf.step2Done
                                      ? '✓ ② Approve'
                                      : wf.step2Status === 'Pending_Approval'
                                        ? '② รออนุมัติ'
                                        : wf.step2Status === 'Returned'
                                          ? '② แก้ไข'
                                          : '② Approve'}
                                  </span>
                                </Link>
                              ) : (
                                <span className="inline-flex items-center px-2 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--text-muted)] text-[11px] font-medium">
                                  ② Approve
                                </span>
                              )}

                              <span className="text-[var(--text-muted)]" aria-hidden="true">
                                →
                              </span>

                              {/* Step 3 */}
                              {wf.step2Done ? (
                                <Link
                                  href={`/shipments/${s.id}/quotation`}
                                  title={
                                    step3Time
                                      ? `③ Quotation Sent (${step3Time})`
                                      : 'เปิด ③ Quotation PDF'
                                  }
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold ui-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                                    wf.step3Done
                                      ? 'bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-border)]'
                                      : 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/30'
                                  }`}
                                >
                                  <span>
                                    {wf.step3Done
                                      ? '✓ ③ Quotation'
                                      : wf.step3Status === 'Draft'
                                        ? '③ Draft QT'
                                        : '③ Quotation'}
                                  </span>
                                </Link>
                              ) : (
                                <span className="inline-flex items-center px-2 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--text-muted)] text-[11px] font-medium">
                                  ③ Quotation
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Completion / Status Record */}
                          <td className="py-3.5 px-4 align-top whitespace-nowrap">
                            {wf.isAllCompleted ? (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-bold bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-border)]">
                                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                  <span>เสร็จครบทั้ง 3 ขั้นตอน</span>
                                </span>
                                {step3Time && (
                                  <div className="text-[11px] text-[var(--text-muted)] tabular-nums">
                                    บันทึกส่ง: {step3Time}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <span
                                  className={`inline-flex px-2.5 py-1 rounded-full border text-[11px] font-semibold ${shipmentStatusStyle(s.derivedStatus)}`}
                                >
                                  {shipmentStatusLabel(s.derivedStatus)}
                                </span>
                                <div className="text-[11px] text-[var(--text-muted)] tabular-nums">
                                  เสร็จแล้ว {wf.completedSteps}/3 ขั้นตอน
                                </div>
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-5 text-right align-top whitespace-nowrap">
                            <div className="inline-flex items-center gap-2">
                              <Link
                                href={nextHref}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] hover:bg-[var(--brand)] hover:text-[var(--brand-fg)] hover:border-[var(--brand)] font-semibold ui-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                              >
                                <span>{nextLabel}</span>
                                <ArrowRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                              </Link>
                              <DeleteShipmentButton
                                id={s.id}
                                shipmentRef={s.shipmentRef}
                                customerName={s.customerName}
                                hasSentQuotation={wf.step3Done}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ==================== STICKY BOTTOM COMPARE BAR ==================== */}
      {activeTab === 'library' && selectedItems.length > 0 && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-5xl rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)] px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs z-30"
          style={{ boxShadow: 'var(--shadow-modal)' }}
        >
          <div className="flex flex-wrap items-center gap-2 min-w-0 max-h-16 overflow-y-auto">
            <span className="font-bold text-[var(--text-primary)]">
              เลือกแล้ว <span className="tabular-nums text-[var(--accent)]">{selectedItems.length}</span> รายการ:
            </span>
            {selectedItems.map((it) => (
              <span
                key={it.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--surface-muted)] border border-[var(--border-subtle)] font-semibold"
              >
                <span>{it.agentName}</span>
                <button
                  type="button"
                  aria-label={`เอา ${it.agentName} ออก`}
                  onClick={() => toggleSelect(it.id)}
                  className="text-[var(--text-muted)] hover:text-[var(--status-danger-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded"
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto shrink-0">
            <input
              type="text"
              aria-label="ชื่อลูกค้าสำหรับงานเปรียบเทียบ (ไม่บังคับ)"
              value={compareCustomerName}
              onChange={(e) => setCompareCustomerName(e.target.value)}
              placeholder="ชื่อลูกค้า (ไม่บังคับ)..."
              className="w-full sm:w-44 px-3 py-2 rounded-xl border border-[var(--border-default)] bg-[var(--surface-subtle)] text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            />
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="px-3 py-2 rounded-xl border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] font-semibold ui-interactive"
            >
              ล้าง
            </button>
            <button
              type="button"
              disabled={selectedItems.length < 2 || comparing}
              onClick={handleLaunchCompare}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-[var(--brand-fg)] font-semibold disabled:opacity-40 ui-interactive"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                {comparing
                  ? 'กำลังสร้างตารางเทียบ...'
                  : `เปรียบเทียบที่เลือก (${selectedItems.length}) → ① Compare Cost`}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ==================== MODAL: เพิ่มข้อมูล COST AGENT ==================== */}
      {addOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-agent-cost-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAddOpen(false);
          }}
          className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px] flex items-center justify-center p-4"
        >
          <div
            className="w-full max-w-xl bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-[20px] p-6 space-y-5 max-h-[92vh] overflow-y-auto"
            style={{ boxShadow: 'var(--shadow-modal)' }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 id="add-agent-cost-title" className="text-base font-bold">
                  เพิ่มข้อมูล Cost Agent ใหม่
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  วางรูปภาพ (Ctrl+V), เลือกไฟล์ PDF/รูป, หรือวางแชท LINE — AI Gemini Flash จะดึงรายการค่าใช้จ่ายให้ทันที
                </p>
              </div>
              <button
                type="button"
                aria-label="ปิดหน้าต่าง"
                onClick={() => setAddOpen(false)}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleCreateAgentCost} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="ac-agent" className="block font-semibold">
                    ชื่อ Agent ที่ส่งราคา *
                  </label>
                  <input
                    id="ac-agent"
                    type="text"
                    required
                    list="existing-agents-list"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    placeholder="เช่น COST Delta, ECU Worldwide"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  />
                  <datalist id="existing-agents-list">
                    {props.suppliers.map((s) => (
                      <option key={s.id} value={s.name} />
                    ))}
                  </datalist>
                </div>

                <div className="space-y-1">
                  <label htmlFor="ac-mode" className="block font-semibold">
                    ประเภทงาน (FCL / LCL) *
                  </label>
                  <select
                    id="ac-mode"
                    value={modeType}
                    onChange={(e) => handleModeChange(e.target.value as 'FCL' | 'LCL')}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  >
                    <option value="FCL">งานเต็มตู้ (FCL)</option>
                    <option value="LCL">งานไม่เต็มตู้ (LCL)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label htmlFor="ac-pol" className="block font-semibold">
                    ต้นทาง (POL) *
                  </label>
                  <input
                    id="ac-pol"
                    type="text"
                    required
                    value={polPortCode}
                    onChange={(e) => setPolPortCode(e.target.value)}
                    placeholder="USLAX / NINGBO"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] font-mono uppercase"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="ac-pod" className="block font-semibold">
                    ปลายทาง (POD) *
                  </label>
                  <input
                    id="ac-pod"
                    type="text"
                    required
                    value={podPortCode}
                    onChange={(e) => setPodPortCode(e.target.value)}
                    placeholder="THLCH / BKK"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] font-mono uppercase"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <label htmlFor="ac-size" className="block font-semibold">
                      ขนาดตู้ / Volume *
                    </label>
                    {createModalMultiplier > 1 && (
                      <span className="px-1.5 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)] font-mono font-bold text-[10px]">
                        คูณราคา ×{createModalMultiplier}
                      </span>
                    )}
                  </div>
                  <input
                    id="ac-size"
                    type="text"
                    required
                    value={containerSummary}
                    onChange={(e) => setContainerSummary(e.target.value)}
                    placeholder={modeType === 'LCL' ? 'LCL · 2.5 CBM' : '1×40DV + 1×20GP'}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] font-mono"
                  />
                </div>
              </div>

              {/* File Upload / Ctrl+V Zone */}
              <div className="p-3.5 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-subtle)] space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-[var(--text-primary)]">
                    แนบไฟล์ใบราคา Agent (รูปภาพ PNG/JPG หรือ PDF — กด Ctrl+V วางภาพได้ทันที)
                  </span>
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] hover:bg-[var(--surface-muted)] font-semibold">
                    <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>เลือกไฟล์</span>
                    <input
                      type="file"
                      accept=".pdf,image/png,image/jpeg,image/webp"
                      className="sr-only"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
                {selectedFile && (
                  <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--surface-card)] border border-[var(--border-subtle)]">
                    <span className="inline-flex items-center gap-1.5 font-medium truncate">
                      <FileText className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" aria-hidden="true" />
                      <span className="truncate">{selectedFile.name}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedFile(null)}
                      className="text-[var(--status-danger-fg)] font-semibold hover:underline shrink-0 ml-2"
                    >
                      ลบไฟล์
                    </button>
                  </div>
                )}
              </div>

              {/* Pasted LINE Chat / Text */}
              <div className="space-y-1">
                <label htmlFor="ac-text" className="block font-semibold">
                  หรือวางข้อความจากแชท LINE / อีเมลของ Agent (เว้นว่างได้หากต้องการกรอกเองทีหลัง)
                </label>
                <textarea
                  id="ac-text"
                  rows={5}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder={`เช่น\nOcean Freight: USD 2,295\nBooking Fee: 1,500 THB\nTHC: 7,400 THB\nDocument Fee: 1,500 THB\nSeal Fee: 350 THB\nVGM: 500 THB\nCustoms Clearance: 2,500 THB\nTrucking Fee: 6,500 THB`}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] font-mono text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[var(--border-default)] font-semibold"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-[var(--brand-fg)] font-semibold disabled:opacity-50 ui-interactive"
                >
                  {submitting ? 'AI กำลังอ่านและบันทึก...' : 'บันทึก & ดึงรายการเข้าตาราง'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== SLIDE-OVER DRAWER: ดูรายละเอียด / แก้ไข ==================== */}
      {activeDetailItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-drawer-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setActiveDetailId(null);
          }}
          className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px] flex justify-end"
        >
          <div className="w-full max-w-2xl h-full bg-[var(--surface-card)] border-l border-[var(--border-subtle)] shadow-2xl flex flex-col text-xs">
            {/* Drawer Header */}
            <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] border ${
                      activeDetailItem.modeType === 'LCL'
                        ? 'bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)] border-[var(--status-warn-border)]'
                        : 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/30'
                    }`}
                  >
                    {activeDetailItem.modeType}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                      activeDetailItem.verificationStatus === 'Verified'
                        ? 'bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-border)]'
                        : 'bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)] border-[var(--status-warn-border)]'
                    }`}
                  >
                    {activeDetailItem.verificationStatus === 'Verified'
                      ? '✓ Verified พร้อมเทียบ'
                      : 'รอตรวจสอบตัวเลข'}
                  </span>
                </div>
                <h2 id="detail-drawer-title" className="text-lg font-bold text-[var(--text-primary)]">
                  {activeDetailItem.agentName}
                </h2>
                <p className="text-[var(--text-muted)]">
                  {activeDetailItem.polPortCode} → {activeDetailItem.podPortCode} ·{' '}
                  {activeDetailItem.containerSummary}
                </p>
              </div>
              <button
                type="button"
                aria-label="ปิดแถบรายละเอียด"
                onClick={() => setActiveDetailId(null)}
                className="p-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Editable Header Metadata (ชื่อ Agent / ประเภท / เส้นทาง / ขนาดตู้) */}
              <form
                onSubmit={handleSaveDetailMeta}
                className="p-4 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-subtle)] space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-[var(--text-primary)]">
                    ข้อมูลหัวรายการ (แก้ไขชื่อ Agent / เส้นทาง / ขนาดตู้)
                  </span>
                  <button
                    type="submit"
                    disabled={detailBusy}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-[var(--brand-fg)] font-semibold disabled:opacity-50 ui-interactive"
                  >
                    <Save className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>บันทึกการแก้ไข</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label htmlFor="ed-agent" className="block font-semibold text-[var(--text-secondary)]">
                      ชื่อ Agent
                    </label>
                    <input
                      id="ed-agent"
                      type="text"
                      required
                      list="existing-agents-list"
                      value={editAgentName}
                      onChange={(e) => setEditAgentName(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] font-semibold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="ed-mode" className="block font-semibold text-[var(--text-secondary)]">
                      ประเภทงาน (FCL / LCL)
                    </label>
                    <select
                      id="ed-mode"
                      value={editModeType}
                      onChange={(e) => setEditModeType(e.target.value as 'FCL' | 'LCL')}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] font-semibold"
                    >
                      <option value="FCL">งานเต็มตู้ (FCL)</option>
                      <option value="LCL">งานไม่เต็มตู้ (LCL)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div className="space-y-1">
                    <label htmlFor="ed-pol" className="block font-semibold text-[var(--text-secondary)]">
                      ต้นทาง (POL)
                    </label>
                    <input
                      id="ed-pol"
                      type="text"
                      required
                      value={editPol}
                      onChange={(e) => setEditPol(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] font-mono uppercase"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="ed-pod" className="block font-semibold text-[var(--text-secondary)]">
                      ปลายทาง (POD)
                    </label>
                    <input
                      id="ed-pod"
                      type="text"
                      required
                      value={editPod}
                      onChange={(e) => setEditPod(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] font-mono uppercase"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <label htmlFor="ed-size" className="block font-semibold text-[var(--text-secondary)]">
                        ขนาดตู้ / Volume
                      </label>
                      {liveDetailMultiplier > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)] font-mono font-bold text-[10px]">
                          ×{liveDetailMultiplier}
                        </span>
                      )}
                    </div>
                    <input
                      id="ed-size"
                      type="text"
                      required
                      value={editContainerSummary}
                      onChange={(e) => setEditContainerSummary(e.target.value)}
                      onBlur={() => {
                        if (
                          activeDetailItem &&
                          editContainerSummary.trim() !== '' &&
                          editContainerSummary.trim() !== activeDetailItem.containerSummary.trim()
                        ) {
                          void saveDetailMetaValues(editContainerSummary);
                        }
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] font-mono"
                    />
                  </div>
                </div>
              </form>

              {/* Metadata & Source Actions */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3.5 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-subtle)]">
                <div className="space-y-0.5">
                  <div className="text-[11px] text-[var(--text-muted)]">ที่มาเอกสาร</div>
                  <div className="font-semibold text-[var(--text-primary)]">
                    {activeDetailItem.sourceFileName ?? 'กรอกเอง / ข้อความ'}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {activeDetailItem.sourceFileUrl && (
                    <a
                      href={activeDetailItem.sourceFileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] hover:bg-[var(--surface-muted)] font-semibold text-[var(--accent)]"
                    >
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>เปิดไฟล์ต้นฉบับ</span>
                    </a>
                  )}
                  <button
                    type="button"
                    disabled={detailBusy}
                    onClick={() => handleApplyFxDetail(activeDetailItem.id)}
                    className="px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] hover:bg-[var(--surface-muted)] font-semibold disabled:opacity-50 ui-interactive"
                  >
                    แปลง USD → THB (×{liveFxRate.toFixed(2)} ปัด 100)
                  </button>
                </div>
              </div>

              {/* Editable Itemized Charges Table */}
              <div className="space-y-2.5">
                <h3 className="font-bold text-sm text-[var(--text-primary)]">
                  รายละเอียดค่าใช้จ่าย ({activeDetailItem.charges.length} บรรทัด — แก้ตัวเลขแล้วกดออกช่องเพื่อบันทึก)
                </h3>

                <div className="rounded-xl border border-[var(--border-default)] overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[var(--surface-subtle)] border-b border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]">
                        <th className="py-2.5 px-3 font-semibold">หัวข้อค่าใช้จ่าย (Item)</th>
                        <th className="py-2.5 px-2 font-semibold text-right w-20">WHT</th>
                        <th className="py-2.5 px-2 font-semibold text-right w-20">VAT</th>
                        <th className="py-2.5 px-2 font-semibold text-right w-28">THB</th>
                        <th className="py-2.5 px-2 font-semibold text-right w-24">USD</th>
                        <th className="py-2.5 px-1.5 w-8" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {activeDetailItem.charges.map((ch) => {
                        const isDest = isDestinationCharge(ch.rawChargeName, ch.category);
                        const rowRatio = isDest ? new Decimal(1) : liveDetailRatio;
                        const displayWht = scaleValueByRatio(ch.whtAmount, rowRatio) ?? ch.whtAmount;
                        const displayVat = scaleValueByRatio(ch.vatAmount, rowRatio) ?? ch.vatAmount;
                        const displayThb = scaleValueByRatio(ch.amountThb, rowRatio);
                        const displayUsd = scaleValueByRatio(ch.amountUsd, rowRatio);

                        return (
                          <tr
                            key={`${ch.id}-${displayWht}-${displayVat}-${displayThb ?? ''}-${displayUsd ?? ''}`}
                            className="hover:bg-[var(--surface-subtle)]/60"
                          >
                            <td className="py-2 px-3 font-medium text-[var(--text-primary)]">
                              <div className="flex items-center justify-between gap-1.5">
                                <span>{ch.rawChargeName}</span>
                                {isDest && (
                                  <span
                                    title="Destination Charge คงค่าเดิมตามที่ใส่ไว้ ไม่คูณเพิ่มตามจำนวนของ"
                                    className="px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200 text-[9px] font-semibold shrink-0"
                                  >
                                    Dest (คงที่)
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-1.5 px-1.5">
                              <input
                                type="text"
                                aria-label={`WHT for ${ch.rawChargeName}`}
                                defaultValue={fmtInput(displayWht)}
                                onBlur={(e) => {
                                  if (e.target.value !== fmtInput(displayWht)) {
                                    handleSaveChargeCell(activeDetailItem.id, ch, {
                                      whtAmount: e.target.value || '0',
                                    });
                                  }
                                }}
                                className="w-full px-1.5 py-1 rounded border border-[var(--border-subtle)] text-right tabular-nums"
                              />
                            </td>
                            <td className="py-1.5 px-1.5">
                              <input
                                type="text"
                                aria-label={`VAT for ${ch.rawChargeName}`}
                                defaultValue={fmtInput(displayVat)}
                                onBlur={(e) => {
                                  if (e.target.value !== fmtInput(displayVat)) {
                                    handleSaveChargeCell(activeDetailItem.id, ch, {
                                      vatAmount: e.target.value || '0',
                                    });
                                  }
                                }}
                                className="w-full px-1.5 py-1 rounded border border-[var(--border-subtle)] text-right tabular-nums"
                              />
                            </td>
                            <td className="py-1.5 px-1.5">
                              <input
                                type="text"
                                aria-label={`THB for ${ch.rawChargeName}`}
                                defaultValue={fmtInput(displayThb)}
                                onBlur={(e) => {
                                  if (e.target.value !== fmtInput(displayThb)) {
                                    handleSaveChargeCell(activeDetailItem.id, ch, {
                                      amountThb: e.target.value,
                                    });
                                  }
                                }}
                                className="w-full px-2 py-1 rounded border border-[var(--border-default)] text-right tabular-nums font-semibold"
                              />
                            </td>
                            <td className="py-1.5 px-1.5">
                              <input
                                type="text"
                                aria-label={`USD for ${ch.rawChargeName}`}
                                defaultValue={fmtInput(displayUsd)}
                                onBlur={(e) => {
                                  if (e.target.value !== fmtInput(displayUsd)) {
                                    handleSaveChargeCell(activeDetailItem.id, ch, {
                                      amountUsd: e.target.value,
                                    });
                                  }
                                }}
                                className="w-full px-1.5 py-1 rounded border border-[var(--border-subtle)] text-right tabular-nums"
                              />
                            </td>
                            <td className="py-1.5 px-1 text-center">
                              <button
                                type="button"
                                aria-label={`ลบบรรทัด ${ch.rawChargeName}`}
                                disabled={detailBusy}
                                onClick={() => handleRemoveChargeRow(activeDetailItem.id, ch)}
                                className="p-1 text-[var(--text-muted)] hover:text-[var(--status-danger-fg)]"
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {activeDetailItem.charges.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-[var(--text-muted)]">
                            ยังไม่มีรายการค่าใช้จ่าย — เพิ่มบรรทัดด้านล่างได้เลย
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-[var(--surface-subtle)] border-t-2 border-[var(--text-primary)] font-bold tabular-nums">
                        <td className="py-2.5 px-3">
                          TOTAL {liveDetailMultiplier > 1 ? `(×${liveDetailMultiplier})` : ''}
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          {fmtMoney(liveDetailTotals.whtThb)}
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          {fmtMoney(liveDetailTotals.vatThb)}
                        </td>
                        <td className="py-2.5 px-2 text-right text-sm">
                          {fmtMoney(liveDetailTotals.amountThb)}
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          {fmtMoney(liveDetailTotals.amountUsd)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Add New Charge Line Form */}
                <form
                  onSubmit={handleAddChargeLine}
                  className="p-3 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-subtle)] flex flex-wrap items-center gap-2"
                >
                  <input
                    type="text"
                    list="catalog-subjects-list"
                    aria-label="ชื่อหัวข้อค่าใช้จ่ายใหม่"
                    value={newLineName}
                    onChange={(e) => setNewLineName(e.target.value)}
                    placeholder="+ ชื่อหัวข้อ (เช่น Booking Fee, THC, Seal Fee, VGM, CFS)..."
                    className="flex-1 min-w-[180px] px-2.5 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] text-xs"
                  />
                  <datalist id="catalog-subjects-list">
                    {props.catalog
                      .filter((c) => !c.isSectionHeader)
                      .map((c) => (
                        <option key={c.id} value={c.nameEn} />
                      ))}
                  </datalist>
                  <input
                    type="text"
                    aria-label="ยอดเงิน THB"
                    value={newLineThb}
                    onChange={(e) => setNewLineThb(e.target.value)}
                    placeholder="THB"
                    className="w-24 px-2.5 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] text-right tabular-nums"
                  />
                  <input
                    type="text"
                    aria-label="ยอดเงิน USD"
                    value={newLineUsd}
                    onChange={(e) => setNewLineUsd(e.target.value)}
                    placeholder="USD"
                    className="w-24 px-2.5 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] text-right tabular-nums"
                  />
                  <button
                    type="submit"
                    disabled={detailBusy}
                    className="px-3 py-1.5 rounded-lg bg-[var(--brand)] text-[var(--brand-fg)] font-semibold disabled:opacity-50"
                  >
                    เพิ่ม
                  </button>
                </form>
              </div>

              {/* Raw Source Text (if pasted or extracted from PDF) */}
              {activeDetailItem.sourceRawText && (
                <div className="p-3.5 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-subtle)] space-y-1.5">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                    ข้อความต้นฉบับจาก Agent / PDF
                  </div>
                  <pre className="font-mono text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap max-h-40 overflow-y-auto">
                    {activeDetailItem.sourceRawText}
                  </pre>
                </div>
              )}
            </div>

            {/* Drawer Footer */}
            <div className="px-6 py-4 border-t border-[var(--border-subtle)] bg-[var(--surface-subtle)] flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                disabled={detailBusy || activeDetailItem.verificationStatus === 'Verified'}
                onClick={() => handleVerifyDetail(activeDetailItem.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold ui-interactive ${
                  activeDetailItem.verificationStatus === 'Verified'
                    ? 'bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border border-[var(--status-success-border)]'
                    : 'bg-[var(--status-success-fg)] text-white hover:opacity-90'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {activeDetailItem.verificationStatus === 'Verified'
                    ? '✓ ยืนยันตัวเลขแล้ว (Verified)'
                    : 'ยืนยันตัวเลข (Verify)'}
                </span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleSelect(activeDetailItem.id)}
                  className="px-3.5 py-2 rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] hover:bg-[var(--surface-muted)] font-semibold ui-interactive"
                >
                  {selectedIds.includes(activeDetailItem.id)
                    ? '☑ เลือกไว้เปรียบเทียบแล้ว'
                    : '☐ เลือกเพื่อเปรียบเทียบ'}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDetailId(null)}
                  className="px-4 py-2 rounded-xl bg-[var(--brand)] text-[var(--brand-fg)] font-semibold"
                >
                  ปิด
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
