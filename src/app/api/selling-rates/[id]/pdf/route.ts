import { asc, eq } from 'drizzle-orm';
import { renderToBuffer } from '@react-pdf/renderer';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  rateRecords,
  sellingRateCharges,
  sellingRates,
  shipmentContainers,
  shipments,
  suppliers,
  users,
} from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/session';
import { canViewAllShipments, hasPermission } from '@/lib/auth/rbac';
import { fail } from '@/lib/http/response';
import type { SellingDocumentMeta } from '@/modules/pricing/schema';
import { ApproveRequestPdfDocument } from '@/lib/pdf/approve-request-pdf';

const UuidSchema = z.string().uuid('Invalid selling rate ID');

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return fail('UNAUTHORIZED', 'Authentication required', 401);
  if (!hasPermission(user.role, 'shipments:read')) {
    return fail('FORBIDDEN', 'Access denied', 403);
  }

  const { id } = await context.params;
  const parsed = UuidSchema.safeParse(id);
  if (!parsed.success) {
    return fail('VALIDATION_FAILED', 'Invalid selling rate ID', 422);
  }

  try {
    const [selling] = await db
      .select()
      .from(sellingRates)
      .where(eq(sellingRates.id, parsed.data))
      .limit(1);

    if (!selling) return fail('NOT_FOUND', 'Selling rate not found', 404);

    const [shipment] = await db
      .select()
      .from(shipments)
      .where(eq(shipments.id, selling.shipmentId))
      .limit(1);

    if (!shipment) return fail('NOT_FOUND', 'Shipment not found', 404);
    if (!canViewAllShipments(user.role) && shipment.assignedUserId !== user.id) {
      return fail('FORBIDDEN', 'Access denied', 403);
    }

    const [containers, lines, agentRow, approverRow] = await Promise.all([
      db
        .select()
        .from(shipmentContainers)
        .where(eq(shipmentContainers.shipmentId, shipment.id)),
      db
        .select()
        .from(sellingRateCharges)
        .where(eq(sellingRateCharges.sellingRateId, selling.id))
        .orderBy(asc(sellingRateCharges.displayOrder)),
      db
        .select({ agentName: suppliers.name })
        .from(rateRecords)
        .innerJoin(suppliers, eq(rateRecords.supplierId, suppliers.id))
        .where(eq(rateRecords.id, selling.selectedRateRecordId))
        .limit(1),
      selling.approvedBy
        ? db
            .select({ fullName: users.fullName })
            .from(users)
            .where(eq(users.id, selling.approvedBy))
            .limit(1)
        : Promise.resolve([]),
    ]);

    const rawMeta = (selling.documentMeta ?? {}) as Partial<SellingDocumentMeta>;
    const defaultVolume =
      containers.map((c) => `${c.quantity}×${c.containerType}`).join(' + ') || '';
    const isAutoTitle = shipment.customerName.startsWith('เปรียบเทียบ ');

    const docMeta: SellingDocumentMeta = {
      jobNo: rawMeta.jobNo ?? '',
      customerName:
        rawMeta.customerName !== undefined
          ? rawMeta.customerName
          : isAutoTitle
            ? ''
            : shipment.customerName,
      consigneeName:
        rawMeta.consigneeName !== undefined
          ? rawMeta.consigneeName
          : isAutoTitle
            ? ''
            : shipment.customerName,
      agentName: rawMeta.agentName || agentRow[0]?.agentName || '',
      commodity: rawMeta.commodity || shipment.commodityDescription || '',
      volume: rawMeta.volume || defaultVolume,
      weightKgs: rawMeta.weightKgs || '',
      measureCbm: rawMeta.measureCbm || '',
      mode: rawMeta.mode || 'Sea (FCL)',
      term: rawMeta.term || shipment.incoterm || 'FOB',
      pol: rawMeta.pol || shipment.polPortCode,
      pod: rawMeta.pod || shipment.podPortCode,
      freeDays: rawMeta.freeDays || '',
      diffAdvance: rawMeta.diffAdvance || '',
    };

    const approvedDateStr = selling.approvedAt
      ? new Date(selling.approvedAt).toLocaleDateString('en-GB')
      : '';

    const pdfBuffer = await renderToBuffer(
      ApproveRequestPdfDocument({
        data: {
          shipmentRef: shipment.shipmentRef,
          docMeta,
          vatPercent: selling.vatPercent,
          totalRevenueThb: selling.netSellingExclVat,
          totalCostThb: selling.totalCostThb,
          grossProfitThb: selling.grossProfit,
          grossMarginPercent: selling.grossMarginPercent,
          status: selling.status,
          approverName: approverRow[0]?.fullName ?? null,
          approvedDateStr,
          lines: lines.map((l) => ({
            description: l.description,
            isVatApplicable: l.isVatApplicable,
            costWhtThb: l.costWhtThb,
            costVatThb: l.costVatThb,
            costAmountThb: l.costAmountThb,
            costAmountUsd: l.costAmountUsd,
            costForeignCurrUsd: l.costForeignCurrUsd,
            revenueWhtPercent: l.revenueWhtPercent,
            sellingAmountThb: l.sellingAmountThb,
            revenueAmountUsd: l.revenueAmountUsd,
          })),
        },
      })
    );

    const url = new URL(request.url);
    const isDownload = url.searchParams.get('download') === '1';
    const fileName = `SalePriceApprove-${shipment.shipmentRef}.pdf`;

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
    console.error('Render Approve Request PDF error:', err);
    return fail('INTERNAL_SERVER_ERROR', 'สร้างไฟล์ PDF ไม่สำเร็จ', 500);
  }
}
