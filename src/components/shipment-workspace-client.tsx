"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Decimal from "decimal.js";
import type { LiveFxSnapshot } from "@/lib/fx/live-rate";
import { LiveFxBadge } from "@/components/live-fx-badge";
import {
  Eye,
  CheckCircle2,
  Trash2,
  Upload,
  Printer,
  Download,
  Plus,
  Award,
  ArrowRightLeft,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  X,
} from "lucide-react";

export interface WorkspaceCatalogItem {
  id: string;
  code: string;
  nameEn: string;
  nameTh: string | null;
  category: string;
  isSectionHeader: boolean;
  defaultWhtPercent: string;
  defaultVatPercent: string;
  displayOrder: number;
}

export interface WorkspaceCharge {
  id: string;
  chargeCatalogId: string | null;
  rawChargeName: string;
  category: string;
  cellStatus: string;
  whtAmount: string;
  vatAmount: string;
  amountThb: string | null;
  amountUsd: string | null;
  sourceTextSnippet: string | null;
  chargeUnit?: string | null;
}

export interface WorkspaceRate {
  id: string;
  supplierId: string;
  agentName: string;
  verificationStatus: string;
  validTo: string | null;
  rateRef: string | null;
  warnings: string[];
  extractionProvider: string | null;
  sourceDocument: {
    id: string;
    fileName: string;
    fileType: string;
    mimeType: string;
    rawTextContent: string | null;
    signedUrl: string | null;
  } | null;
  charges: WorkspaceCharge[];
  totals: {
    whtThb: string;
    vatThb: string;
    amountThb: string;
    amountUsd: string;
  };
  scope: {
    isFullyComparable: boolean;
    missingScopes: string[];
  };
}

export interface ActiveComparisonInfo {
  id: string;
  status: string;
  selectedRateRecordId: string | null;
  selectionReason: string | null;
  selectedAt: string | Date | null;
}

export interface WorkspaceProps {
  shipment: {
    id: string;
    shipmentRef: string;
    customerName: string;
    polPortCode: string;
    podPortCode: string;
    incoterm: string | null;
    assignedUserName: string;
  };
  containers: Array<{ id: string; containerType: string; quantity: number }>;
  catalog: WorkspaceCatalogItem[];
  agents: Array<{ id: string; name: string }>;
  fxRateUsdToThb: string;
  fxSnapshot?: Pick<LiveFxSnapshot, "source" | "isLive" | "updatedAt">;
  rates: WorkspaceRate[];
  lowestComparableRateId: string | null;
  activeComparison: ActiveComparisonInfo | null;
  timeline: Array<{
    id: string;
    action: string;
    entityType: string;
    actorName: string;
    createdAt: string | Date;
  }>;
}

function fmtMoney(val: string | null | undefined): string {
  if (!val) return "";
  try {
    const d = new Decimal(val);
    if (d.isZero()) return "";
    return d.toNumber().toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return val;
  }
}

function fmtTotal(val: string | null | undefined): string {
  if (!val) return "-";
  try {
    const d = new Decimal(val);
    if (d.isZero()) return "-";
    return d.toNumber().toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return "-";
  }
}

export function ShipmentWorkspaceClient(props: WorkspaceProps) {
  const router = useRouter();
  const [onlyQuoted, setOnlyQuoted] = useState(true);
  const [showIngestForm, setShowIngestForm] = useState(props.rates.length < 2);

  // Direct Input Form state
  const [agentName, setAgentName] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Modals
  const [previewRate, setPreviewRate] = useState<WorkspaceRate | null>(null);
  const [addRowOpen, setAddRowOpen] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [newSubjectHeader, setNewSubjectHeader] = useState(false);

  // Select Winning Agent modal
  const [selectTargetRate, setSelectTargetRate] =
    useState<WorkspaceRate | null>(null);
  const [selectionReason, setSelectionReason] = useState("");
  const [selectError, setSelectError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);

  // Explicit FX Convert modal
  const [liveFxRate, setLiveFxRate] = useState<number>(
    Number(props.fxRateUsdToThb) || 33,
  );
  const [fxTargetRate, setFxTargetRate] = useState<WorkspaceRate | null>(null);
  const [fxRateInput, setFxRateInput] = useState(
    Number(props.fxRateUsdToThb).toFixed(2),
  );
  const [fxRounding, setFxRounding] = useState<"CEIL_100" | "EXACT">(
    "CEIL_100",
  );
  const [fxOverwrite, setFxOverwrite] = useState(false);
  const [applyingFx, setApplyingFx] = useState(false);

  const handleLiveFxChange = useCallback(
    (nextRate: number) => {
      setLiveFxRate(nextRate);
      if (!fxTargetRate) {
        setFxRateInput(nextRate.toFixed(2));
      }
    },
    [fxTargetRate],
  );

  useEffect(() => {
    if (!previewRate && !addRowOpen && !selectTargetRate && !fxTargetRate)
      return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (previewRate) setPreviewRate(null);
        else if (selectTargetRate) setSelectTargetRate(null);
        else if (fxTargetRate) setFxTargetRate(null);
        else if (addRowOpen) setAddRowOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewRate, addRowOpen, selectTargetRate, fxTargetRate]);

  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            const namedFile = new File([file], `clipboard_${Date.now()}.png`, {
              type: file.type,
            });
            setShowIngestForm(true);
            setSelectedFile(namedFile);
            setStatusMessage(`วางภาพจาก Clipboard แล้ว: ${namedFile.name}`);
            break;
          }
        }
      }
    }
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  async function handleIngest(e: React.FormEvent) {
    e.preventDefault();
    setIngestError(null);
    setStatusMessage(null);

    if (!agentName.trim()) {
      setIngestError("กรุณาใส่ชื่อ Agent ที่ส่งค่า Cost");
      return;
    }
    if (!selectedFile && !pastedText.trim()) {
      setIngestError("กรุณาแนบไฟล์รูปภาพ/PDF หรือวางข้อความราคา");
      return;
    }

    setIngesting(true);
    try {
      const fd = new FormData();
      fd.append("agentName", agentName.trim());
      if (pastedText.trim()) fd.append("pastedText", pastedText.trim());
      if (selectedFile) fd.append("file", selectedFile);

      const res = await fetch(`/api/shipments/${props.shipment.id}/rates`, {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as {
        success: boolean;
        data?: {
          agentName: string;
          extractedCharges: number;
          warnings: string[];
        };
        error?: { message?: string };
      };

      if (!res.ok || !json.success) {
        setIngestError(json.error?.message ?? "แกะข้อมูลไม่สำเร็จ");
        return;
      }

      setAgentName("");
      setPastedText("");
      setSelectedFile(null);
      setStatusMessage(
        `สร้างตาราง ${json.data?.agentName ?? ""} เรียบร้อยแล้ว (แกะได้ ${json.data?.extractedCharges ?? 0} รายการ)`,
      );
      router.refresh();
    } catch {
      setIngestError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
    } finally {
      setIngesting(false);
    }
  }

  async function saveCell(
    rateId: string,
    subject: WorkspaceCatalogItem,
    existingCharge: WorkspaceCharge | undefined,
    field: "whtAmount" | "vatAmount" | "amountThb" | "amountUsd",
    rawVal: string,
  ) {
    const trimmed = rawVal.trim();
    const isNA = trimmed === "-";

    const payload = {
      chargeId: existingCharge?.id ?? null,
      chargeCatalogId: subject.id,
      rawChargeName: existingCharge?.rawChargeName ?? subject.nameEn,
      category: subject.category,
      cellStatus: isNA ? "NOT_APPLICABLE" : "QUOTED",
      whtAmount:
        field === "whtAmount" ? trimmed : (existingCharge?.whtAmount ?? null),
      vatAmount:
        field === "vatAmount" ? trimmed : (existingCharge?.vatAmount ?? null),
      amountThb:
        field === "amountThb" ? trimmed : (existingCharge?.amountThb ?? null),
      amountUsd:
        field === "amountUsd" ? trimmed : (existingCharge?.amountUsd ?? null),
    };

    const res = await fetch(`/api/rates/${rateId}/charges`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) router.refresh();
  }

  async function handleVerify(rateId: string) {
    const res = await fetch(`/api/rates/${rateId}/verify`, { method: "POST" });
    if (res.ok) {
      setStatusMessage("ยืนยันข้อมูลถูกต้อง (Verified) เรียบร้อยแล้ว");
      router.refresh();
    }
  }

  async function handleDeleteRate(rateId: string, name: string) {
    if (!window.confirm(`ต้องการลบตาราง "${name}" ออกจากงานนี้ใช่ไหม?`)) return;
    const res = await fetch(`/api/rates/${rateId}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  async function handleConfirmSelectAgent(e: React.FormEvent) {
    e.preventDefault();
    if (!selectTargetRate) return;
    setSelectError(null);
    setSelecting(true);

    try {
      const res = await fetch(
        `/api/shipments/${props.shipment.id}/comparison/select`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selectedRateRecordId: selectTargetRate.id,
            selectionReason: selectionReason.trim(),
          }),
        },
      );
      const json = (await res.json()) as {
        success: boolean;
        error?: { message?: string };
      };
      if (!res.ok || !json.success) {
        setSelectError(json.error?.message ?? "ไม่สามารถบันทึกการเลือก Agent ได้");
        return;
      }

      setSelectTargetRate(null);
      setSelectionReason("");
      setStatusMessage(
        `บันทึกเลือก ${selectTargetRate.agentName} แล้ว — กำลังเปิดหน้า ② Sale Price Approve Request...`,
      );
      router.push(`/shipments/${props.shipment.id}/selling-rate`);
      router.refresh();
    } catch {
      setSelectError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
    } finally {
      setSelecting(false);
    }
  }

  async function handleMapUnmapped(
    rateId: string,
    chargeId: string,
    targetCatalogId: string,
    learnAlias: boolean,
  ) {
    if (!targetCatalogId) return;
    const res = await fetch(`/api/rates/${rateId}/map-charge`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chargeId,
        chargeCatalogId: targetCatalogId,
        learnAlias,
      }),
    });
    if (res.ok) {
      setStatusMessage(
        learnAlias
          ? "Map เข้าหัวข้อมาตรฐานและจำ Alias แล้ว"
          : "Map เข้าหัวข้อมาตรฐานเรียบร้อย",
      );
      router.refresh();
    }
  }

  async function handleApplyFx(e: React.FormEvent) {
    e.preventDefault();
    if (!fxTargetRate) return;
    setApplyingFx(true);
    try {
      const res = await fetch(`/api/rates/${fxTargetRate.id}/apply-fx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fxRate: Number(fxRateInput),
          roundingMode: fxRounding,
          overwriteExisting: fxOverwrite,
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        data?: { convertedCount: number };
      };
      if (res.ok && json.success) {
        setFxTargetRate(null);
        setStatusMessage(
          `แปลง USD → THB (เรต ${fxRateInput}) สำเร็จ ${json.data?.convertedCount ?? 0} รายการ`,
        );
        router.refresh();
      }
    } finally {
      setApplyingFx(false);
    }
  }

  async function handleAddCustomSubject(e: React.FormEvent) {
    e.preventDefault();
    if (!newSubjectName.trim()) return;
    const res = await fetch("/api/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nameEn: newSubjectName.trim(),
        isSectionHeader: newSubjectHeader,
      }),
    });
    if (res.ok) {
      setNewSubjectName("");
      setNewSubjectHeader(false);
      setAddRowOpen(false);
      router.refresh();
    }
  }

  function handleExportCsv() {
    const lines = ["Agent,Item,WHT,VAT,Amount_THB,Amount_USD"];
    for (const rate of props.rates) {
      for (const sub of props.catalog) {
        const ch = rate.charges.find((c) => c.chargeCatalogId === sub.id);
        const thb =
          ch?.cellStatus === "NOT_APPLICABLE" ? "-" : (ch?.amountThb ?? "");
        const usd = ch?.amountUsd ?? "";
        const wht = ch && Number(ch.whtAmount) > 0 ? ch.whtAmount : "";
        const vat = ch && Number(ch.vatAmount) > 0 ? ch.vatAmount : "";
        lines.push(
          `"${rate.agentName}","${sub.nameEn}",${wht},${vat},${thb},${usd}`,
        );
      }
      lines.push(
        `"${rate.agentName}","TOTAL",${rate.totals.whtThb},${rate.totals.vatThb},${rate.totals.amountThb},${rate.totals.amountUsd}`,
      );
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compare-cost-${props.shipment.shipmentRef}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function fillSampleLine() {
    setAgentName("Delta");
    setPastedText(
      `40 DV: USD 2,295.00 (75,800 THB)\n20 GP: USD 1,835.00 (60,600 THB)\nHANDING FEE (THB 200 / HBL): 200 THB\nCUSTOMER CLEARANCE: 400 THB\nSERVICE CHARGE: 200 THB\n1x40 TRANSPORTATION CHARGE: 5,500 THB WHT 55\n1x20 TRANSPORTATION CHARGE: 5,500 THB\nInsurance: 1,443.43 THB\nDest TRML HANDLG: 7,400 THB\nDEST DOC FEE: 1,500 THB\nEQPT CLEANING: 1,200 THB\nEquipment Maintenance Premium: 1,200 THB\nCIS / CIC: USD 210 (5,500 THB)`,
    );
  }

  const selectedAgentRecord = props.activeComparison?.selectedRateRecordId
    ? props.rates.find(
        (r) => r.id === props.activeComparison?.selectedRateRecordId,
      )
    : null;
  const verifiedCount = props.rates.filter(
    (r) => r.verificationStatus === "Verified",
  ).length;

  return (
    <div className="max-w-[1680px] mx-auto space-y-6">
      {/* 1. Workspace Header Card */}
      <header className="card-elevated rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <Link
                href="/shipments"
                className="text-[var(--accent)] font-medium hover:underline"
              >
                ← รายการงานทั้งหมด
              </Link>
              <span>/</span>
              <span className="font-mono font-semibold text-[var(--text-primary)]">
                {props.shipment.shipmentRef}
              </span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
              {props.shipment.customerName}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--surface-muted)] font-mono font-semibold text-[var(--text-primary)]">
                {props.shipment.polPortCode}
                <span className="text-[var(--text-muted)]">→</span>
                {props.shipment.podPortCode}
              </span>
              {props.containers.map((c) => (
                <span
                  key={c.id}
                  className="px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] font-medium tabular-nums"
                >
                  {c.containerType === 'LCL' ? `${c.quantity} CBM (LCL)` : `${c.quantity}×${c.containerType}`}
                </span>
              ))}
              {props.containers.some((c) => c.containerType === 'LCL') && (
                <span className="px-2.5 py-1 rounded-lg bg-[var(--accent-subtle)] text-[var(--accent)] text-xs font-semibold">
                  📦 คำนวณตามปริมาตร (per CBM/RT × {props.containers.find((c) => c.containerType === 'LCL')?.quantity ?? 1})
                </span>
              )}
              <LiveFxBadge
                initialRate={liveFxRate}
                initialMeta={props.fxSnapshot}
                onRateChange={handleLiveFxChange}
              />
            </div>
          </div>

          {/* Right Controls: Export / Print */}
          <div className="flex flex-wrap items-center gap-2.5 print:hidden">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={props.rates.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] hover:bg-[var(--surface-muted)] text-xs font-semibold disabled:opacity-40 ui-interactive"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>CSV</span>
            </button>
            <a
              href={`/api/shipments/${props.shipment.id}/compare-pdf`}
              target="_blank"
              rel="noreferrer"
              aria-disabled={props.rates.length === 0}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] hover:bg-[var(--brand)] hover:text-[var(--brand-fg)] hover:border-[var(--brand)] text-xs font-semibold ui-interactive ${
                props.rates.length === 0 ? "pointer-events-none opacity-40" : ""
              }`}
            >
              <Printer className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export PDF (A4)</span>
            </a>
          </div>
        </div>

        {/* Clean 3-Step Visual Stepper */}
        <nav
          aria-label="Workflow steps"
          className="pt-4 border-t border-[var(--border-subtle)] flex flex-wrap items-center gap-2 text-xs print:hidden"
        >
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--brand)] text-[var(--brand-fg)] font-semibold">
            <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[11px] font-bold">
              1
            </span>
            <span>Compare Cost</span>
          </span>

          <ArrowRight
            className="w-3.5 h-3.5 text-[var(--text-muted)]"
            aria-hidden="true"
          />

          {props.activeComparison?.status === "Supplier_Selected" ? (
            <Link
              href={`/shipments/${props.shipment.id}/selling-rate`}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border border-[var(--status-success-border)] font-semibold hover:opacity-90 ui-interactive"
            >
              <span className="w-5 h-5 rounded-full bg-[var(--status-success-fg)] text-white flex items-center justify-center text-[11px] font-bold">
                2
              </span>
              <span>Sale Price Approve Request →</span>
            </Link>
          ) : (
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-medium">
              <span className="w-5 h-5 rounded-full bg-[var(--surface-muted)] flex items-center justify-center text-[11px] font-bold">
                2
              </span>
              <span>Sale Price Approve Request</span>
            </span>
          )}

          <ArrowRight
            className="w-3.5 h-3.5 text-[var(--text-muted)]"
            aria-hidden="true"
          />

          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-medium">
            <span className="w-5 h-5 rounded-full bg-[var(--surface-muted)] flex items-center justify-center text-[11px] font-bold">
              3
            </span>
            <span>Quotation PDF</span>
          </span>
        </nav>
      </header>

      {/* 2. Active Comparison Decision Banner */}
      {props.activeComparison && selectedAgentRecord && (
        <div
          className={`rounded-2xl border px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs ${
            props.activeComparison.status === "Needs_Review"
              ? "bg-[var(--status-warn-bg)] border-[var(--status-warn-border)] text-[var(--status-warn-fg)]"
              : "bg-[var(--status-success-bg)] border-[var(--status-success-border)] text-[var(--status-success-fg)]"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {props.activeComparison.status === "Needs_Review" ? (
              <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
            ) : (
              <Award className="w-4 h-4 shrink-0" aria-hidden="true" />
            )}
            <div>
              {props.activeComparison.status === "Needs_Review" ? (
                <>
                  <strong>ต้องตรวจสอบใหม่ (Needs Review):</strong> ต้นทุนของ{" "}
                  <strong>{selectedAgentRecord.agentName}</strong>{" "}
                  ถูกแก้ไขหลังจากเลือกไว้แล้ว กรุณากดยืนยันและเลือก Agent ใหม่อีกครั้ง
                </>
              ) : (
                <>
                  <strong>
                    เลือก Agent แล้ว: {selectedAgentRecord.agentName}
                  </strong>{" "}
                  (รวม{" "}
                  <span className="tabular-nums font-bold">
                    {fmtTotal(selectedAgentRecord.totals.amountThb)} THB
                  </span>
                  ) — เหตุผล: {props.activeComparison.selectionReason}
                </>
              )}
            </div>
          </div>
          {props.activeComparison.status === "Supplier_Selected" && (
            <Link
              href={`/shipments/${props.shipment.id}/selling-rate`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-[var(--brand-fg)] font-semibold ui-interactive"
            >
              <span>ไปขั้น ② Sale Price Approve Request</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          )}
        </div>
      )}

      {/* 3. Smart Collapsible Agent Ingestion Card */}
      <section className="card-elevated rounded-2xl overflow-hidden print:hidden">
        <button
          type="button"
          onClick={() => setShowIngestForm((v) => !v)}
          className="w-full px-5 py-3.5 flex items-center justify-between gap-3 bg-[var(--surface-card)] hover:bg-[var(--surface-subtle)] ui-interactive text-left"
        >
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center">
              <Plus className="w-4 h-4" aria-hidden="true" />
            </span>
            <div>
              <div className="text-xs font-bold text-[var(--text-primary)]">
                เพิ่มตาราง COST ของ Agent (โยนไฟล์ รูป / PDF หรือวางแชท LINE)
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                นำเข้าแล้ว {props.rates.length}/5 Agent · ยืนยันแล้ว {verifiedCount}{" "}
                เจ้า · รองรับ Ctrl+V วางภาพแคปจอ
              </div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)]">
            {showIngestForm ? (
              <>
                <span>ซ่อนช่องนำเข้า</span>
                <ChevronUp className="w-4 h-4" aria-hidden="true" />
              </>
            ) : (
              <>
                <span>+ เพิ่ม Agent</span>
                <ChevronDown className="w-4 h-4" aria-hidden="true" />
              </>
            )}
          </span>
        </button>

        {showIngestForm && (
          <form
            onSubmit={handleIngest}
            className="px-5 pb-5 pt-3 border-t border-[var(--border-subtle)] space-y-3 bg-[var(--surface-subtle)]/50"
          >
            <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_1fr_auto] gap-3.5 items-stretch">
              <div className="flex flex-col justify-between space-y-1.5">
                <label
                  htmlFor="agent-name-input"
                  className="text-xs font-semibold"
                >
                  1. ชื่อ Agent ที่ส่งค่า Cost *
                </label>
                <input
                  id="agent-name-input"
                  list="known-agents-list"
                  type="text"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="เช่น Delta / MSL / Air"
                  className="w-full px-3 py-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] text-xs ui-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                />
                <datalist id="known-agents-list">
                  {props.agents.map((a) => (
                    <option key={a.id} value={a.name} />
                  ))}
                </datalist>
                <span className="text-[11px] text-[var(--text-muted)]">
                  เลือกจากรายการหรือพิมพ์ชื่อใหม่ได้เลย
                </span>
              </div>

              <div className="flex flex-col space-y-1.5">
                <span className="text-xs font-semibold">
                  2. โยนไฟล์ รูปภาพ / PDF (หรือ Ctrl+V)
                </span>
                <label
                  htmlFor="rate-file-input"
                  className="flex-1 border-2 border-dashed border-[var(--border-default)] hover:border-[var(--accent)] rounded-xl p-3 flex flex-col items-center justify-center text-center cursor-pointer bg-[var(--surface-card)] ui-interactive"
                >
                  <input
                    id="rate-file-input"
                    type="file"
                    accept=".pdf,image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) =>
                      setSelectedFile(e.target.files?.[0] ?? null)
                    }
                  />
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                    <Upload
                      className="w-3.5 h-3.5 text-[var(--accent)]"
                      aria-hidden="true"
                    />
                    {selectedFile
                      ? `เลือกแล้ว: ${selectedFile.name}`
                      : "คลิกเลือกไฟล์ หรือ Ctrl+V วางภาพ"}
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    PDF, PNG, JPG, WEBP (สูงสุด 20 MB)
                  </span>
                </label>
              </div>

              <div className="flex flex-col space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="pasted-text-input"
                    className="text-xs font-semibold"
                  >
                    หรือ พิมพ์ / วางข้อความแชท LINE
                  </label>
                  <button
                    type="button"
                    onClick={fillSampleLine}
                    className="text-xs text-[var(--accent)] hover:underline font-semibold"
                  >
                    ใส่ตัวอย่าง (Delta)
                  </button>
                </div>
                <textarea
                  id="pasted-text-input"
                  rows={3}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="วางข้อความราคา เช่น 40 DV: USD 2,295 (75,800 THB)..."
                  className="flex-1 w-full px-3 py-2 rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] text-xs font-mono ui-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                />
              </div>

              <div className="flex flex-col justify-end">
                <button
                  type="submit"
                  disabled={ingesting || props.rates.length >= 5}
                  className="h-full min-h-[46px] px-5 py-2.5 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-[var(--brand-fg)] text-xs font-bold ui-interactive disabled:opacity-50"
                >
                  {ingesting ? "กำลังแกะข้อมูล..." : "+ แกะเป็นตาราง COST"}
                </button>
              </div>
            </div>

            {ingestError && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] text-xs font-medium text-[var(--status-danger-fg)]"
              >
                {ingestError}
              </div>
            )}
          </form>
        )}
      </section>

      {statusMessage && (
        <div className="px-4 py-2.5 rounded-xl bg-[var(--status-success-bg)] border border-[var(--status-success-border)] text-xs font-medium text-[var(--status-success-fg)] flex items-center justify-between gap-2 print:hidden">
          <span>{statusMessage}</span>
          <button
            type="button"
            aria-label="ปิดข้อความแจ้งเตือน"
            onClick={() => setStatusMessage(null)}
            className="p-0.5 rounded hover:bg-emerald-200/50"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* 4. Sub-toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs print:hidden">
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-bold text-[var(--text-primary)] tabular-nums">
            แสดง {props.rates.length} Agent
          </span>
          <label className="inline-flex items-center gap-2 cursor-pointer text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={onlyQuoted}
              onChange={(e) => setOnlyQuoted(e.target.checked)}
              className="accent-[var(--brand)] rounded"
            />
            <span>ซ่อนแถวที่ว่างในแต่ละตาราง</span>
          </label>
        </div>

        <button
          type="button"
          onClick={() => setAddRowOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] hover:bg-[var(--surface-muted)] font-semibold ui-interactive"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>เพิ่มหัวข้อแถวใหม่</span>
        </button>
      </div>

      {/* 5. MAIN STAGE */}
      {props.rates.length === 0 ? (
        <div className="card-elevated rounded-2xl py-16 px-6 text-center space-y-2">
          <p className="text-base font-bold text-[var(--text-primary)]">
            ยังไม่มีตาราง COST ของ Agent ในงานนี้
          </p>
          <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
            ใส่ชื่อ Agent ด้านบนแล้วโยนรูป/PDF หรือกด &ldquo;ใส่ตัวอย่าง (Delta)&rdquo;
            เพื่อสร้างตารางแรกได้ทันที
          </p>
        </div>
      ) : (
        /* 1 ELEVATED TABLE PER 1 AGENT */
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-stretch">
          {props.rates.map((rate) => {
            const chargeByCatalog = new Map(
              rate.charges
                .filter((c) => c.chargeCatalogId)
                .map((c) => [c.chargeCatalogId!, c]),
            );
            const unmappedCharges = rate.charges.filter(
              (c) => !c.chargeCatalogId,
            );
            const visibleSubjects = props.catalog.filter((sub) => {
              if (sub.isSectionHeader) return !onlyQuoted;
              if (!onlyQuoted) return true;
              return chargeByCatalog.has(sub.id);
            });
            const isVerified = rate.verificationStatus === "Verified";
            const isSelected =
              props.activeComparison?.selectedRateRecordId === rate.id;
            const isLowest = props.lowestComparableRateId === rate.id;
            const hasUsdLines = rate.charges.some((c) => c.amountUsd !== null);

            return (
              <section
                key={rate.id}
                aria-label={rate.agentName}
                className={`card-elevated rounded-2xl overflow-hidden flex flex-col h-full ui-interactive ${
                  isSelected
                    ? "ring-2 ring-[var(--brand)] border-[var(--brand)]"
                    : ""
                }`}
              >
                {/* Card Header */}
                <div className="px-4 py-3.5 min-h-[68px] bg-[var(--surface-subtle)] border-b border-[var(--border-subtle)] flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h2 className="text-sm font-bold text-[var(--text-primary)] truncate">
                        {rate.agentName}
                      </h2>
                      <span
                        className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold ${
                          isVerified
                            ? "bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-border)]"
                            : "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)] border-[var(--status-warn-border)]"
                        }`}
                      >
                        {isVerified ? "✓ Verified" : "Draft"}
                      </span>
                      {isLowest && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[11px] font-semibold">
                          ต่ำสุด
                        </span>
                      )}
                      {isSelected && (
                        <span className="px-2 py-0.5 rounded-full bg-[var(--brand)] text-[var(--brand-fg)] text-[11px] font-semibold">
                          ✓ เลือกแล้ว
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] truncate">
                      📎 {rate.sourceDocument?.fileName ?? "Manual Entry"}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 print:hidden">
                    {hasUsdLines && (
                      <button
                        type="button"
                        title="แปลง USD → THB"
                        onClick={() => setFxTargetRate(rate)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] hover:bg-[var(--surface-muted)] text-[11px] font-semibold ui-interactive"
                      >
                        <ArrowRightLeft
                          className="w-3 h-3"
                          aria-hidden="true"
                        />
                        <span>FX</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setPreviewRate(rate)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] hover:bg-[var(--surface-muted)] text-[11px] font-semibold ui-interactive"
                    >
                      <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>ต้นฉบับ</span>
                    </button>
                    {!isVerified && (
                      <button
                        type="button"
                        onClick={() => handleVerify(rate.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-[var(--brand-fg)] text-[11px] font-semibold ui-interactive"
                      >
                        <CheckCircle2
                          className="w-3.5 h-3.5"
                          aria-hidden="true"
                        />
                        <span>ยืนยัน</span>
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`ลบตาราง ${rate.agentName}`}
                      onClick={() => handleDeleteRate(rate.id, rate.agentName)}
                      className="p-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] hover:bg-[var(--status-danger-bg)] text-[var(--text-muted)] hover:text-[var(--status-danger-fg)] ui-interactive"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {rate.warnings.length > 0 && (
                  <div className="px-4 py-2 bg-[var(--status-warn-bg)] border-b border-[var(--status-warn-border)] text-[11px] text-[var(--status-warn-fg)] print:hidden">
                    ⚠ {rate.warnings[0]}
                  </div>
                )}

                <div className="flex-1 overflow-x-auto flex flex-col">
                  <table className="w-full min-w-[420px] table-fixed text-left border-collapse text-xs">
                    <colgroup>
                      <col />
                      <col className="w-[56px]" />
                      <col className="w-[50px]" />
                      <col className="w-[94px]" />
                      <col className="w-[86px]" />
                    </colgroup>
                    <thead>
                      <tr className="bg-[var(--surface-card)] border-b border-[var(--border-default)] text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                        <th className="py-2.5 px-3.5">รายการ (Item)</th>
                        <th className="py-2.5 px-1.5 text-right">WHT</th>
                        <th className="py-2.5 px-1.5 text-right">VAT</th>
                        <th className="py-2.5 px-2 text-right">THB</th>
                        <th className="py-2.5 px-2 text-right">USD</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {visibleSubjects.map((sub) => {
                        if (sub.isSectionHeader) {
                          return (
                            <tr
                              key={sub.id}
                              className="bg-[var(--surface-muted)]/70 font-bold"
                            >
                              <td
                                colSpan={5}
                                className="py-1.5 px-3.5 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]"
                              >
                                {sub.nameEn}
                              </td>
                            </tr>
                          );
                        }
                        const ch = chargeByCatalog.get(sub.id);
                        return (
                          <tr
                            key={sub.id}
                            className="hover:bg-[var(--surface-subtle)] ui-interactive"
                          >
                            <td
                              className="py-1.5 px-3.5 font-medium truncate text-[var(--text-primary)]"
                              title={`${sub.nameEn}${ch?.sourceTextSnippet ? ` (${ch.sourceTextSnippet})` : ''}`}
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="truncate">{sub.nameEn}</span>
                                {ch?.chargeUnit && ['PER_CBM', 'PER_WM', 'PER_RT'].includes(ch.chargeUnit) && (
                                  <span
                                    title={ch.sourceTextSnippet ?? 'เรทคิดตามปริมาตร'}
                                    className="px-1 py-0.5 text-[9px] rounded bg-[var(--accent-subtle)] text-[var(--accent)] font-mono font-semibold shrink-0"
                                  >
                                    {ch.chargeUnit === 'PER_CBM' ? '/CBM' : ch.chargeUnit === 'PER_WM' ? '/WM' : '/RT'}
                                  </span>
                                )}
                              </div>
                            </td>
                            {(
                              [
                                "whtAmount",
                                "vatAmount",
                                "amountThb",
                                "amountUsd",
                              ] as const
                            ).map((field) => {
                              const displayVal =
                                ch?.cellStatus === "NOT_APPLICABLE" &&
                                field === "amountThb"
                                  ? "-"
                                  : fmtMoney(ch?.[field]);
                              return (
                                <td key={field} className="py-0.5 px-0.5">
                                  <EditableMoneyCell
                                    label={`${rate.agentName} ${sub.nameEn} ${field}`}
                                    initialValue={displayVal}
                                    bold={field === "amountThb"}
                                    onCommit={(val) =>
                                      saveCell(rate.id, sub, ch, field, val)
                                    }
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                      {unmappedCharges.map((u) => (
                        <UnmappedChargeRow
                          key={u.id}
                          charge={u}
                          catalog={props.catalog}
                          onMap={(targetId, learn) =>
                            handleMapUnmapped(rate.id, u.id, targetId, learn)
                          }
                        />
                      ))}
                    </tbody>
                  </table>
                  {/* Push TOTAL & Footer to the exact same baseline across all Agent cards */}
                  <div className="flex-1" />
                  <table className="w-full min-w-[420px] table-fixed text-left border-collapse text-xs">
                    <colgroup>
                      <col />
                      <col className="w-[56px]" />
                      <col className="w-[50px]" />
                      <col className="w-[94px]" />
                      <col className="w-[86px]" />
                    </colgroup>
                    <tbody>
                      <tr className="bg-[var(--surface-subtle)] font-bold tabular-nums accounting-total text-[var(--text-primary)]">
                        <td className="py-3 px-3.5 uppercase tracking-wide">
                          TOTAL
                        </td>
                        <td className="py-3 px-1.5 text-right">
                          {fmtTotal(rate.totals.whtThb)}
                        </td>
                        <td className="py-3 px-1.5 text-right text-[var(--text-muted)]">
                          {fmtTotal(rate.totals.vatThb)}
                        </td>
                        <td className="py-3 px-2 text-right">
                          {fmtTotal(rate.totals.amountThb)}
                        </td>
                        <td className="py-3 px-2 text-right">
                          {fmtTotal(rate.totals.amountUsd)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Scope & Select Footer */}
                <div className="px-4 py-3 bg-[var(--surface-subtle)]/70 flex items-center justify-between gap-2 text-xs print:hidden">
                  {rate.scope.isFullyComparable ? (
                    <span className="font-semibold text-[var(--status-success-fg)]">
                      ✓ ครบทุกหมวด
                    </span>
                  ) : (
                    <span
                      className="font-medium text-[var(--status-warn-fg)] truncate"
                      title={`ขาด: ${rate.scope.missingScopes.join(", ")}`}
                    >
                      ⚠ ขาด: {rate.scope.missingScopes.join(", ")}
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={!isVerified}
                    title={
                      isVerified
                        ? "เลือก Agent นี้"
                        : "ต้องกด ยืนยัน (Verify) ก่อนจึงจะเลือกได้"
                    }
                    onClick={() => {
                      setSelectError(null);
                      setSelectionReason("");
                      setSelectTargetRate(rate);
                    }}
                    className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold ui-interactive disabled:opacity-40 ${
                      isSelected
                        ? "bg-[var(--brand)] text-[var(--brand-fg)]"
                        : "border border-[var(--border-default)] bg-[var(--surface-card)] hover:bg-[var(--brand)] hover:text-white hover:border-[var(--brand)]"
                    }`}
                  >
                    {isSelected ? "✓ เลือก Agent นี้แล้ว" : "เลือก Agent นี้"}
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* 6. Collapsible Audit Timeline */}
      <details className="card-elevated rounded-2xl p-4 print:hidden">
        <summary className="text-xs font-bold cursor-pointer select-none text-[var(--text-secondary)]">
          ประวัติการทำงาน (Audit Log — {props.timeline.length} รายการ)
        </summary>
        <ul className="mt-3 divide-y divide-[var(--border-subtle)] text-xs">
          {props.timeline.map((log) => (
            <li
              key={log.id}
              className="py-2.5 flex items-center justify-between gap-4"
            >
              <div>
                <span className="px-1.5 py-0.5 rounded bg-[var(--surface-muted)] font-mono font-semibold text-[11px]">
                  {log.action}
                </span>{" "}
                โดย <strong>{log.actorName}</strong>
              </div>
              <time className="text-[var(--text-muted)] tabular-nums">
                {new Date(log.createdAt).toLocaleString("th-TH")}
              </time>
            </li>
          ))}
        </ul>
      </details>

      {/* MODAL: SELECT WINNING AGENT */}
      {selectTargetRate && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sel-agent-title"
          className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px] flex items-center justify-center p-4 print:hidden"
        >
          <div
            className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-[20px] p-6 w-full max-w-md space-y-5"
            style={{ boxShadow: "var(--shadow-modal)" }}
          >
            <div className="flex items-start justify-between">
              <h2 id="sel-agent-title" className="text-base font-bold">
                ยืนยันเลือก {selectTargetRate.agentName}
              </h2>
              <button
                type="button"
                aria-label="ปิดหน้าต่าง"
                onClick={() => setSelectTargetRate(null)}
                className="p-1 rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <div className="p-3.5 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-subtle)] text-xs space-y-1.5 tabular-nums">
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">ยอดรวม THB</span>
                <strong className="text-sm">
                  {fmtTotal(selectTargetRate.totals.amountThb)} THB
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">
                  ยอดรวม USD / WHT
                </span>
                <span>
                  {fmtTotal(selectTargetRate.totals.amountUsd)} USD · WHT{" "}
                  {fmtTotal(selectTargetRate.totals.whtThb)} THB
                </span>
              </div>
              {!selectTargetRate.scope.isFullyComparable && (
                <div className="text-[var(--status-warn-fg)] font-medium pt-1.5 border-t border-[var(--border-subtle)]">
                  ⚠ หมายเหตุ: Agent นี้ยังขาดหมวด{" "}
                  {selectTargetRate.scope.missingScopes.join(", ")}
                </div>
              )}
            </div>
            <form
              onSubmit={handleConfirmSelectAgent}
              className="space-y-4 text-xs"
            >
              <div className="space-y-1.5">
                <label htmlFor="sel-reason" className="block font-semibold">
                  เหตุผลที่เลือก Agent นี้ *
                </label>
                <textarea
                  id="sel-reason"
                  rows={3}
                  required
                  value={selectionReason}
                  onChange={(e) => setSelectionReason(e.target.value)}
                  placeholder="เช่น ราคาคุ้มค่าที่สุด / Free time 14 วัน / Transit เร็วสุด"
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                />
              </div>
              {selectError && (
                <div
                  role="alert"
                  className="p-2.5 rounded-lg bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)]"
                >
                  {selectError}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectTargetRate(null)}
                  className="px-4 py-2 rounded-xl border border-[var(--border-default)] font-semibold hover:bg-[var(--surface-muted)] ui-interactive"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={selecting}
                  className="px-4 py-2 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-[var(--brand-fg)] font-semibold disabled:opacity-50 ui-interactive"
                >
                  {selecting ? "กำลังบันทึก..." : "ยืนยันเลือก Agent นี้"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EXPLICIT FX CONVERSION */}
      {fxTargetRate && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="fx-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px] flex items-center justify-center p-4 print:hidden"
        >
          <div
            className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-[20px] p-6 w-full max-w-md space-y-5"
            style={{ boxShadow: "var(--shadow-modal)" }}
          >
            <h2 id="fx-modal-title" className="text-base font-bold">
              แปลงสกุลเงิน USD → THB ({fxTargetRate.agentName})
            </h2>
            <form onSubmit={handleApplyFx} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label htmlFor="fx-rate-num" className="block font-semibold">
                  อัตราแลกเปลี่ยน (THB ต่อ 1 USD) *
                </label>
                <input
                  id="fx-rate-num"
                  type="number"
                  step="0.01"
                  required
                  value={fxRateInput}
                  onChange={(e) => setFxRateInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] tabular-nums"
                />
              </div>
              <div className="p-3 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-subtle)] space-y-2">
                <span className="block font-semibold">การปัดเศษบาท</span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="fxRounding"
                    checked={fxRounding === "CEIL_100"}
                    onChange={() => setFxRounding("CEIL_100")}
                  />
                  <span>ปัดขึ้นหลักร้อยบาท (เช่น $2,295 × 33 = 75,800 THB)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="fxRounding"
                    checked={fxRounding === "EXACT"}
                    onChange={() => setFxRounding("EXACT")}
                  />
                  <span>คำนวณตรงตัว 2 ตำแหน่ง (เช่น 75,735.00 THB)</span>
                </label>
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={fxOverwrite}
                  onChange={(e) => setFxOverwrite(e.target.checked)}
                />
                <span>คำนวณทับช่อง THB ที่มีตัวเลขอยู่แล้วด้วย</span>
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setFxTargetRate(null)}
                  className="px-4 py-2 rounded-xl border border-[var(--border-default)] font-semibold"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={applyingFx}
                  className="px-4 py-2 rounded-xl bg-[var(--brand)] text-[var(--brand-fg)] font-semibold disabled:opacity-50"
                >
                  {applyingFx ? "กำลังแปลง..." : "แปลงเป็น THB"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SOURCE DOCUMENT PREVIEW */}
      {previewRate && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="src-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[2px] flex items-center justify-center p-4 print:hidden"
        >
          <div
            className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-[20px] w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
            style={{ boxShadow: "var(--shadow-modal)" }}
          >
            <div className="px-5 py-4 bg-[var(--surface-subtle)] border-b border-[var(--border-subtle)] flex items-center justify-between">
              <div>
                <h2 id="src-modal-title" className="text-sm font-bold">
                  ไฟล์ต้นฉบับ — {previewRate.agentName}
                </h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {previewRate.sourceDocument?.fileName ?? "No file"}{" "}
                  (Extractor: {previewRate.extractionProvider ?? "manual"})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewRate(null)}
                className="px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] text-xs font-semibold hover:bg-[var(--surface-muted)] ui-interactive"
              >
                ปิด
              </button>
            </div>
            <div className="flex-1 overflow-auto p-5 bg-[var(--surface-canvas)] space-y-4">
              {previewRate.sourceDocument?.signedUrl &&
                previewRate.sourceDocument.fileType === "IMAGE" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewRate.sourceDocument.signedUrl}
                    alt={previewRate.sourceDocument.fileName}
                    className="max-w-full rounded-xl border border-[var(--border-subtle)] mx-auto shadow-sm"
                  />
                )}
              {previewRate.sourceDocument?.signedUrl &&
                previewRate.sourceDocument.fileType === "PDF" && (
                  <iframe
                    src={previewRate.sourceDocument.signedUrl}
                    title={previewRate.sourceDocument.fileName}
                    className="w-full h-[60vh] rounded-xl border border-[var(--border-subtle)] bg-white"
                  />
                )}
              {previewRate.sourceDocument?.rawTextContent && (
                <pre className="p-4 rounded-xl bg-[var(--surface-card)] border border-[var(--border-subtle)] font-mono text-xs leading-6 whitespace-pre-wrap">
                  {previewRate.sourceDocument.rawTextContent}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD CUSTOM SUBJECT */}
      {addRowOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-sub-title"
          className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px] flex items-center justify-center p-4 print:hidden"
        >
          <div
            className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-[20px] p-6 w-full max-w-md space-y-5"
            style={{ boxShadow: "var(--shadow-modal)" }}
          >
            <h2 id="add-sub-title" className="text-base font-bold">
              เพิ่มหัวข้อค่าใช้จ่ายใหม่
            </h2>
            <form
              onSubmit={handleAddCustomSubject}
              className="space-y-4 text-xs"
            >
              <div className="space-y-1.5">
                <label htmlFor="new-sub-name" className="block font-semibold">
                  ชื่อหัวข้อค่าใช้จ่าย *
                </label>
                <input
                  id="new-sub-name"
                  type="text"
                  required
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                  placeholder="เช่น PORT CONGESTION SURCHARGE (PCS)"
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)]"
                />
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={newSubjectHeader}
                  onChange={(e) => setNewSubjectHeader(e.target.checked)}
                />
                <span>สร้างเป็นแถวหัวข้อย่อย (เหมือน Local Charge)</span>
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAddRowOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[var(--border-default)] font-semibold"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[var(--brand)] text-[var(--brand-fg)] font-semibold"
                >
                  เพิ่มหัวข้อ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function UnmappedChargeRow({
  charge,
  catalog,
  onMap,
}: {
  charge: WorkspaceCharge;
  catalog: WorkspaceCatalogItem[];
  onMap: (targetCatalogId: string, learnAlias: boolean) => void;
}) {
  const [targetId, setTargetId] = useState("");
  const [learnAlias, setLearnAlias] = useState(true);

  return (
    <tr className="bg-[var(--status-warn-bg)]/60">
      <td className="py-2 px-3.5 space-y-1.5">
        <div
          className="font-medium truncate max-w-[180px]"
          title={charge.rawChargeName}
        >
          {charge.rawChargeName}{" "}
          <span className="text-[11px] font-semibold text-[var(--status-warn-fg)]">
            (Other)
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 print:hidden">
          <select
            aria-label={`Map ${charge.rawChargeName} to standard subject`}
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="max-w-[135px] px-1.5 py-0.5 rounded-md border border-[var(--status-warn-border)] bg-white text-[11px]"
          >
            <option value="">Map เข้าหัวข้อ...</option>
            {catalog
              .filter((c) => !c.isSectionHeader)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameEn}
                </option>
              ))}
          </select>
          <label className="inline-flex items-center gap-1 text-[11px] text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={learnAlias}
              onChange={(e) => setLearnAlias(e.target.checked)}
            />
            <span>จำชื่อ</span>
          </label>
          <button
            type="button"
            disabled={!targetId}
            onClick={() => onMap(targetId, learnAlias)}
            className="px-2 py-0.5 rounded-md bg-[var(--brand)] text-[var(--brand-fg)] text-[11px] font-semibold disabled:opacity-40"
          >
            Map
          </button>
        </div>
      </td>
      <td className="py-1.5 px-1.5 text-right tabular-nums">
        {fmtMoney(charge.whtAmount)}
      </td>
      <td className="py-1.5 px-1.5 text-right tabular-nums">
        {fmtMoney(charge.vatAmount)}
      </td>
      <td className="py-1.5 px-2 text-right tabular-nums font-semibold">
        {charge.cellStatus === "NOT_APPLICABLE"
          ? "-"
          : fmtMoney(charge.amountThb)}
      </td>
      <td className="py-1.5 px-2 text-right tabular-nums">
        {fmtMoney(charge.amountUsd)}
      </td>
    </tr>
  );
}

function EditableMoneyCell({
  label,
  initialValue,
  bold,
  onCommit,
}: {
  label: string;
  initialValue: string;
  bold?: boolean;
  onCommit: (val: string) => void;
}) {
  const [val, setVal] = useState(initialValue);

  useEffect(() => {
    setVal(initialValue);
  }, [initialValue]);

  return (
    <input
      type="text"
      aria-label={label}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => {
        if (val !== initialValue) onCommit(val);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className={`w-full bg-transparent px-1.5 py-1 rounded-md text-right tabular-nums text-xs outline-none hover:bg-[var(--surface-muted)] focus-visible:bg-[var(--surface-card)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] ui-interactive ${
        bold
          ? "font-semibold text-[var(--text-primary)]"
          : "text-[var(--text-secondary)]"
      } ${val === "-" ? "text-center text-[var(--text-muted)]" : ""}`}
    />
  );
}
