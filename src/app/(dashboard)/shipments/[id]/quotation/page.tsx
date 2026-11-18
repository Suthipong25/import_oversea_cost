import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { getOrInitQuotationWorkspace } from '@/modules/quotations/service';
import type { QuotationDocumentMeta } from '@/modules/quotations/schema';
import { QuotationClient } from '@/components/quotation-client';

export default async function QuotationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const { id } = await params;
  let data = null;
  try {
    data = await getOrInitQuotationWorkspace(user, id);
  } catch {
    notFound();
  }

  if (!data) {
    notFound();
  }

  const rawMeta = (data.quotation?.documentMeta ?? {}) as Partial<QuotationDocumentMeta>;
  const initialDocMeta: QuotationDocumentMeta = {
    volumeText: rawMeta.volumeText || data.quotation?.containerSummary || '',
    modeText: rawMeta.modeText || 'Sea (FCL)',
    termText: rawMeta.termText || 'FOB',
    cutOffEtdText: rawMeta.cutOffEtdText || '',
    approvedDateText: rawMeta.approvedDateText || '',
  };

  return (
    <QuotationClient
      shipment={data.shipment}
      sellingRateApproved={data.sellingRateApproved}
      sellingRateStatus={data.sellingRateStatus}
      quotation={data.quotation}
      initialDocMeta={initialDocMeta}
      versions={data.versions}
      activeVersion={
        data.activeVersion
          ? {
              versionNumber: data.activeVersion.versionNumber,
              discountAmount: data.activeVersion.discountAmount,
              vatPercent: data.activeVersion.vatPercent,
            }
          : null
      }
      initialItems={data.items.map((it) => ({
        descriptionEn: it.descriptionEn,
        descriptionTh: it.descriptionTh ?? '',
        quantity: Number(it.quantity).toString(),
        chargeUnitText: it.chargeUnitText,
        unitPrice: Number(it.unitPrice).toFixed(2),
        isTaxable: it.isTaxable,
      }))}
    />
  );
}
