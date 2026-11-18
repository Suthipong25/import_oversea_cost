import { renderToBuffer } from '@react-pdf/renderer';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { fail } from '@/lib/http/response';
import { getShipmentWorkspaceData } from '@/modules/rates/service';
import { CompareCostPdfDocument } from '@/lib/pdf/compare-cost-pdf';

const UuidSchema = z.string().uuid('Invalid shipment ID');

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return fail('UNAUTHORIZED', 'Authentication required', 401);

  const { id } = await context.params;
  const parsed = UuidSchema.safeParse(id);
  if (!parsed.success) {
    return fail('VALIDATION_FAILED', 'Invalid shipment ID', 422);
  }

  try {
    const data = await getShipmentWorkspaceData(user, parsed.data);
    if (!data) {
      return fail('NOT_FOUND', 'Shipment not found', 404);
    }

    const url = new URL(request.url);
    const isDownload = url.searchParams.get('download') === '1';

    const containerSummary =
      data.containers.map((c) => `${c.quantity}×${c.containerType}`).join(' + ') || '1×40DV';

    const generatedDate = new Date().toLocaleDateString('en-GB');

    const pdfBuffer = await renderToBuffer(
      CompareCostPdfDocument({
        data: {
          shipmentRef: data.shipment.shipmentRef,
          customerName: data.shipment.customerName,
          polPortCode: data.shipment.polPortCode,
          podPortCode: data.shipment.podPortCode,
          containerSummary,
          fxRateUsdToThb: Number(data.fxRateUsdToThb) || 33,
          generatedDate,
          selectedRateRecordId: data.activeComparison?.selectedRateRecordId ?? null,
          selectionReason: data.activeComparison?.selectionReason ?? null,
          lowestComparableRateId: data.lowestComparableRateId,
          catalog: data.catalog.map((c) => ({
            id: c.id,
            nameEn: c.nameEn,
            isSectionHeader: c.isSectionHeader,
          })),
          rates: data.rates.map((r) => ({
            id: r.id,
            agentName: r.agentName,
            verificationStatus: r.verificationStatus,
            totals: r.totals,
            charges: r.charges.map((ch) => ({
              chargeCatalogId: ch.chargeCatalogId,
              rawChargeName: ch.rawChargeName,
              cellStatus: ch.cellStatus,
              whtAmount: ch.whtAmount,
              vatAmount: ch.vatAmount,
              amountThb: ch.amountThb,
              amountUsd: ch.amountUsd,
            })),
          })),
        },
      })
    );

    const fileName = `CompareCost-${data.shipment.shipmentRef}.pdf`;

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${isDownload ? 'attachment' : 'inline'}; filename="${fileName}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN') {
      return fail('FORBIDDEN', 'Access denied', 403);
    }
    console.error('Render compare cost PDF error:', err);
    return fail('INTERNAL_SERVER_ERROR', 'สร้างไฟล์ PDF ไม่สำเร็จ', 500);
  }
}
