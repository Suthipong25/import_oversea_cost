import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { getOrInitSellingRateWorkspace } from '@/modules/pricing/service';
import type { SellingDocumentMeta } from '@/modules/pricing/schema';
import { SellingRateClient } from '@/components/selling-rate-client';

export default async function SellingRatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const { id } = await params;
  let data = null;
  try {
    data = await getOrInitSellingRateWorkspace(user, id);
  } catch {
    notFound();
  }

  if (!data) {
    notFound();
  }

  const rawMeta = (data.sellingRate?.documentMeta ?? {}) as Partial<SellingDocumentMeta>;
  const defaultVolume =
    data.containers.map((c) => `${c.quantity}×${c.containerType}`).join(' + ') || '';
  const isAutoCompareTitle = data.shipment.customerName.startsWith('เปรียบเทียบ ');

  const initialDocMeta: SellingDocumentMeta = {
    jobNo: rawMeta.jobNo ?? '',
    customerName:
      rawMeta.customerName !== undefined
        ? rawMeta.customerName
        : isAutoCompareTitle
          ? ''
          : data.shipment.customerName,
    consigneeName:
      rawMeta.consigneeName !== undefined
        ? rawMeta.consigneeName
        : isAutoCompareTitle
          ? ''
          : data.shipment.customerName,
    agentName: rawMeta.agentName || data.selectedAgentName || '',
    commodity: rawMeta.commodity || data.shipment.commodityDescription || '',
    volume: rawMeta.volume || defaultVolume,
    weightKgs: rawMeta.weightKgs || '',
    measureCbm: rawMeta.measureCbm || '',
    mode: rawMeta.mode || 'Sea (FCL)',
    term: rawMeta.term || data.shipment.incoterm || 'FOB',
    pol: rawMeta.pol || data.shipment.polPortCode,
    pod: rawMeta.pod || data.shipment.podPortCode,
    freeDays: rawMeta.freeDays || '',
    diffAdvance: rawMeta.diffAdvance || '',
  };

  return (
    <SellingRateClient
      shipment={data.shipment}
      containers={data.containers}
      selectedAgentName={data.selectedAgentName}
      comparisonStatus={data.activeComparison?.status ?? null}
      sellingRate={data.sellingRate}
      initialDocMeta={initialDocMeta}
      initialLines={data.lines.map((l) => ({
        id: l.id,
        chargeCatalogId: l.chargeCatalogId,
        description: l.description,
        category: l.category,
        costAmountThb: Number(l.costAmountThb).toFixed(2),
        costWhtThb: Number(l.costWhtThb ?? '0') > 0 ? Number(l.costWhtThb).toFixed(2) : '',
        costVatThb: Number(l.costVatThb ?? '0') > 0 ? Number(l.costVatThb).toFixed(2) : '',
        costAmountUsd: l.costAmountUsd !== null ? Number(l.costAmountUsd).toFixed(2) : '',
        costForeignCurrUsd:
          l.costForeignCurrUsd !== null ? Number(l.costForeignCurrUsd).toFixed(2) : '',
        sellingAmountThb:
          l.sellingAmountThb !== null ? Number(l.sellingAmountThb).toFixed(2) : '',
        revenueWhtPercent: l.revenueWhtPercent ?? (l.isVatApplicable ? '3.00' : '0.00'),
        revenueAmountUsd:
          l.revenueAmountUsd !== null ? Number(l.revenueAmountUsd).toFixed(2) : '',
        chargeUnit: l.chargeUnit,
        quantity: l.quantity,
        isVatApplicable: l.isVatApplicable,
      }))}
      requireAuthMode={data.requireAuthMode}
    />
  );
}
