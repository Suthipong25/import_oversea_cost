import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { getShipmentWorkspaceData } from '@/modules/rates/service';
import { ShipmentWorkspaceClient } from '@/components/shipment-workspace-client';

export default async function ShipmentWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const { id } = await params;
  let data = null;
  try {
    data = await getShipmentWorkspaceData(user, id);
  } catch {
    notFound();
  }

  if (!data) {
    notFound();
  }

  return (
    <ShipmentWorkspaceClient
      shipment={data.shipment}
      containers={data.containers}
      catalog={data.catalog}
      agents={data.agents}
      fxRateUsdToThb={data.fxRateUsdToThb}
      fxSnapshot={data.fxSnapshot}
      rates={data.rates}
      lowestComparableRateId={data.lowestComparableRateId}
      activeComparison={data.activeComparison}
      timeline={data.timeline}
    />
  );
}
